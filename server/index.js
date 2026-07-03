import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import db from './db.js';
import {
  TOTAL_ROUNDS,
  allScored,
  leaderboard,
  seatingForRound,
  shuffle
} from './lib/game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MAX_SCORE = 10000;

const app = express();
app.use(express.json());

// Codes avoid look-alike characters (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

const normCode = (code) => String(code || '').trim().toUpperCase();

function getGame(code) {
  return db.prepare('SELECT * FROM games WHERE code = ?').get(normCode(code));
}

function getPlayers(code) {
  return db
    .prepare('SELECT id, name, joined_at AS joinedAt FROM players WHERE game_code = ? ORDER BY id')
    .all(code);
}

function getScores(code) {
  const rows = db
    .prepare('SELECT player_id AS playerId, round, value FROM scores WHERE game_code = ?')
    .all(code);
  const scores = {};
  for (const r of rows) {
    (scores[r.playerId] ??= {})[r.round] = r.value;
  }
  return scores;
}

function buildState(code) {
  const game = getGame(code);
  if (!game) return null;
  const players = getPlayers(game.code);
  const scores = getScores(game.code);
  const board = leaderboard(players, scores);
  const state = {
    code: game.code,
    status: game.status,
    currentRound: game.current_round,
    totalRounds: TOTAL_ROUNDS,
    players,
    scores,
    leaderboard: board,
    seating: seatingForRound(players, scores, game.current_round, JSON.parse(game.round1_order))
  };
  if (game.status === 'finished' && board.length > 0) {
    state.winners = board.filter((e) => e.total === board[0].total).map((e) => e.playerId);
  }
  return state;
}

app.post('/api/games', (req, res) => {
  let code;
  do {
    code = newCode();
  } while (getGame(code));
  db.prepare('INSERT INTO games (code) VALUES (?)').run(code);
  res.json({ code });
});

app.get('/api/games/:code', (req, res) => {
  const game = getGame(req.params.code);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json({ code: game.code, status: game.status, currentRound: game.current_round });
});

const server = http.createServer(app);
const io = new Server(server);

function broadcast(code) {
  const state = buildState(code);
  if (state) io.to(`game:${state.code}`).emit('game:state', state);
  return state;
}

// Round 1 seating is a random draw; redraw whenever the roster changes while
// round 1 is still open.
function reshuffleRound1(game) {
  const ids = getPlayers(game.code).map((p) => p.id);
  db.prepare('UPDATE games SET round1_order = ? WHERE code = ?').run(
    JSON.stringify(shuffle(ids)),
    game.code
  );
}

function addOrFindPlayer(game, rawName) {
  const name = String(rawName || '').trim().slice(0, 40);
  if (!name) return { error: 'Name is required' };
  const existing = db
    .prepare('SELECT id FROM players WHERE game_code = ? AND lower(name) = lower(?)')
    .get(game.code, name);
  if (existing) return { playerId: existing.id, created: false };
  const info = db
    .prepare('INSERT INTO players (game_code, name) VALUES (?, ?)')
    .run(game.code, name);
  if (game.current_round === 1 && game.status === 'active') {
    reshuffleRound1(game);
  }
  return { playerId: Number(info.lastInsertRowid), created: true };
}

// Close the current round once every player has a score for it. Advancing is
// monotonic: clearing an old score never reopens a closed round.
function advanceIfComplete(code) {
  const game = getGame(code);
  if (!game || game.status !== 'active') return;
  const players = getPlayers(game.code);
  const scores = getScores(game.code);
  let round = game.current_round;
  while (round <= TOTAL_ROUNDS && allScored(players, scores, round)) {
    round++;
  }
  if (round > TOTAL_ROUNDS) {
    db.prepare("UPDATE games SET current_round = ?, status = 'finished' WHERE code = ?").run(
      TOTAL_ROUNDS,
      game.code
    );
  } else if (round !== game.current_round) {
    db.prepare('UPDATE games SET current_round = ? WHERE code = ?').run(round, game.code);
  }
}

io.on('connection', (socket) => {
  socket.on('game:join', (payload = {}, cb = () => {}) => {
    const game = getGame(payload.code);
    if (!game) return cb({ error: 'Game not found' });
    const result = addOrFindPlayer(game, payload.name);
    if (result.error) return cb(result);
    socket.join(`game:${game.code}`);
    const state = broadcast(game.code);
    cb({ ok: true, playerId: result.playerId, state });
  });

  socket.on('player:add', (payload = {}, cb = () => {}) => {
    const game = getGame(payload.code);
    if (!game) return cb({ error: 'Game not found' });
    const result = addOrFindPlayer(game, payload.name);
    if (result.error) return cb(result);
    if (!result.created) return cb({ error: 'That player is already in the game' });
    broadcast(game.code);
    cb({ ok: true, playerId: result.playerId });
  });

  socket.on('score:set', (payload = {}, cb = () => {}) => {
    const game = getGame(payload.code);
    if (!game) return cb({ error: 'Game not found' });
    const player = db
      .prepare('SELECT id FROM players WHERE id = ? AND game_code = ?')
      .get(payload.playerId, game.code);
    if (!player) return cb({ error: 'Player not found' });
    const round = Number(payload.round);
    if (!Number.isInteger(round) || round < 1 || round > TOTAL_ROUNDS) {
      return cb({ error: 'Invalid round' });
    }
    if (game.status === 'active' && round > game.current_round) {
      return cb({ error: `Round ${round} has not started yet` });
    }
    if (payload.value === null || payload.value === '') {
      db.prepare('DELETE FROM scores WHERE game_code = ? AND player_id = ? AND round = ?').run(
        game.code,
        player.id,
        round
      );
    } else {
      const value = Number(payload.value);
      if (!Number.isInteger(value) || value < 0 || value > MAX_SCORE) {
        return cb({ error: `Score must be a whole number between 0 and ${MAX_SCORE}` });
      }
      db.prepare(
        `INSERT INTO scores (game_code, player_id, round, value) VALUES (?, ?, ?, ?)
         ON CONFLICT(game_code, player_id, round) DO UPDATE SET value = excluded.value`
      ).run(game.code, player.id, round, value);
    }
    advanceIfComplete(game.code);
    broadcast(game.code);
    cb({ ok: true });
  });
});

// Serve the built client; every non-API path falls through to the SPA.
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Shanghai score tracker listening on port ${PORT}`);
});
