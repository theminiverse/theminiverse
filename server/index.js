import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import db from './db.js';
import { createRateLimiter } from './lib/rateLimit.js';
import {
  TOTAL_ROUNDS,
  allScored,
  leaderboard,
  seatingForRound,
  shuffle
} from './lib/game.js';
import { describeScoreChange, nextRedoable, nextUndoable } from './lib/history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MAX_SCORE = 10000;
// A game seats at most a handful of tables of ~5, so a real roster never gets
// near this. The cap exists so an abuser can't inflate one game's roster (and
// thus every broadcast's payload) without bound.
const MAX_PLAYERS = 200;

const app = express();
// Trust the platform's reverse proxy (Railway) so req.ip reflects the real
// client for rate limiting rather than the proxy's address.
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));

// Conservative security headers. There's no inline-script/HTML-injection sink
// today (React escapes all output), so this is defense-in-depth.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Codes avoid look-alike characters (0/O, 1/I). Drawn from a CSPRNG so active
// game codes can't be predicted from prior ones.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// Per-IP cap on game creation and per-socket cap on mutations, so no single
// client can exhaust disk (games/players) or CPU (recompute + broadcast).
const createGameLimiter = createRateLimiter({ windowMs: 60_000, limit: 20 });
const socketEventLimiter = createRateLimiter({ windowMs: 10_000, limit: 60 });

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

function getPlayerName(code, playerId) {
  const row = db
    .prepare('SELECT name FROM players WHERE id = ? AND game_code = ?')
    .get(playerId, code);
  return row ? row.name : `Player ${playerId}`;
}

// Current stored score for a cell, or null when the cell is empty.
function getScoreValue(code, playerId, round) {
  const row = db
    .prepare('SELECT value FROM scores WHERE game_code = ? AND player_id = ? AND round = ?')
    .get(code, playerId, round);
  return row ? row.value : null;
}

// Write a single cell. A null value clears it. This is the one place that
// mutates the scores table, so undo/redo and edits all go through it.
function writeScore(code, playerId, round, value) {
  if (value === null || value === undefined) {
    db.prepare('DELETE FROM scores WHERE game_code = ? AND player_id = ? AND round = ?').run(
      code,
      playerId,
      round
    );
  } else {
    db.prepare(
      `INSERT INTO scores (game_code, player_id, round, value) VALUES (?, ?, ?, ?)
       ON CONFLICT(game_code, player_id, round) DO UPDATE SET value = excluded.value`
    ).run(code, playerId, round, value);
  }
}

function recordEvent(code, event) {
  db.prepare(
    `INSERT INTO events
       (game_code, actor, type, description, player_id, round, prev_value, new_value, undoable)
     VALUES (@game_code, @actor, @type, @description, @player_id, @round, @prev_value, @new_value, @undoable)`
  ).run({
    game_code: code,
    actor: event.actor,
    type: event.type,
    description: event.description,
    player_id: event.playerId ?? null,
    round: event.round ?? null,
    prev_value: event.prevValue ?? null,
    new_value: event.newValue ?? null,
    undoable: event.undoable ? 1 : 0
  });
}

// The score events relevant to the undo/redo stack (flags only), plus the
// full row for a given id when we need to apply a reversal.
function undoRedoEvents(code) {
  return db
    .prepare(
      'SELECT id, undoable, undone, abandoned FROM events WHERE game_code = ? AND undoable = 1'
    )
    .all(code);
}

function buildHistory(code) {
  return db
    .prepare(
      `SELECT id, actor, type, description, undone, created_at AS createdAt
       FROM events WHERE game_code = ? ORDER BY id DESC LIMIT 50`
    )
    .all(code);
}

function buildState(code) {
  const game = getGame(code);
  if (!game) return null;
  const players = getPlayers(game.code);
  const scores = getScores(game.code);
  const board = leaderboard(players, scores);
  const events = undoRedoEvents(game.code);
  const state = {
    code: game.code,
    status: game.status,
    currentRound: game.current_round,
    totalRounds: TOTAL_ROUNDS,
    players,
    scores,
    leaderboard: board,
    seating: seatingForRound(players, scores, game.current_round, JSON.parse(game.round1_order)),
    history: buildHistory(game.code),
    canUndo: nextUndoable(events) !== null,
    canRedo: nextRedoable(events) !== null
  };
  if (game.status === 'finished' && board.length > 0) {
    state.winners = board.filter((e) => e.total === board[0].total).map((e) => e.playerId);
  }
  return state;
}

app.post('/api/games', (req, res) => {
  if (createGameLimiter(req.ip)) {
    return res.status(429).json({ error: 'Too many games created, slow down' });
  }
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
// Cap inbound frame size (default is 1 MB) — clients only ever send tiny
// join/score payloads, so anything larger is abuse.
const io = new Server(server, { maxHttpBufferSize: 16 * 1024 });

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
  const { count } = db
    .prepare('SELECT COUNT(*) AS count FROM players WHERE game_code = ?')
    .get(game.code);
  if (count >= MAX_PLAYERS) return { error: 'This game is full' };
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
  const rateLimited = (cb) => {
    if (socketEventLimiter(socket.id)) {
      cb({ error: 'Too many requests, slow down' });
      return true;
    }
    return false;
  };

  // The name this socket acts as, used to attribute changes in the history
  // feed. Set on join and reused for later mutations from the same connection.
  const actorName = () => socket.data.name || 'Someone';

  socket.on('game:join', (payload = {}, cb = () => {}) => {
    if (rateLimited(cb)) return;
    const game = getGame(payload.code);
    if (!game) return cb({ error: 'Game not found' });
    const result = addOrFindPlayer(game, payload.name);
    if (result.error) return cb(result);
    const name = getPlayerName(game.code, result.playerId);
    socket.data.name = name;
    if (result.created) {
      recordEvent(game.code, { actor: name, type: 'join', description: 'joined the game' });
    }
    socket.join(`game:${game.code}`);
    const state = broadcast(game.code);
    cb({ ok: true, playerId: result.playerId, state });
  });

  socket.on('player:add', (payload = {}, cb = () => {}) => {
    if (rateLimited(cb)) return;
    const game = getGame(payload.code);
    if (!game) return cb({ error: 'Game not found' });
    const result = addOrFindPlayer(game, payload.name);
    if (result.error) return cb(result);
    if (!result.created) return cb({ error: 'That player is already in the game' });
    recordEvent(game.code, {
      actor: actorName(),
      type: 'player_add',
      description: `added ${getPlayerName(game.code, result.playerId)}`
    });
    broadcast(game.code);
    cb({ ok: true, playerId: result.playerId });
  });

  socket.on('score:set', (payload = {}, cb = () => {}) => {
    if (rateLimited(cb)) return;
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
    let newValue;
    if (payload.value === null || payload.value === '') {
      newValue = null;
    } else {
      const value = Number(payload.value);
      if (!Number.isInteger(value) || value < 0 || value > MAX_SCORE) {
        return cb({ error: `Score must be a whole number between 0 and ${MAX_SCORE}` });
      }
      newValue = value;
    }

    const prevValue = getScoreValue(game.code, player.id, round);
    // No-op edits (re-entering the same value, clearing an empty cell) don't
    // belong in the history and shouldn't disturb the redo stack.
    if (prevValue === newValue) {
      broadcast(game.code);
      return cb({ ok: true });
    }

    writeScore(game.code, player.id, round, newValue);
    // A fresh edit discards anything left on the redo stack.
    db.prepare(
      'UPDATE events SET abandoned = 1 WHERE game_code = ? AND undoable = 1 AND undone = 1 AND abandoned = 0'
    ).run(game.code);
    recordEvent(game.code, {
      actor: actorName(),
      type: 'score',
      description: describeScoreChange(getPlayerName(game.code, player.id), round, newValue),
      playerId: player.id,
      round,
      prevValue,
      newValue,
      undoable: true
    });

    advanceIfComplete(game.code);
    broadcast(game.code);
    cb({ ok: true });
  });

  // Undo/redo operate on the shared, game-wide stack of score edits: undo
  // reverts the most recent edit, redo replays the most recently undone one.
  const applyStackMove = (payload, cb, direction) => {
    const game = getGame(payload.code);
    if (!game) return cb({ error: 'Game not found' });
    const events = undoRedoEvents(game.code);
    const target =
      direction === 'undo' ? nextUndoable(events) : nextRedoable(events);
    if (!target) {
      return cb({ error: direction === 'undo' ? 'Nothing to undo' : 'Nothing to redo' });
    }
    const full = db.prepare('SELECT * FROM events WHERE id = ?').get(target.id);
    const restore = direction === 'undo' ? full.prev_value : full.new_value;
    writeScore(game.code, full.player_id, full.round, restore ?? null);
    db.prepare('UPDATE events SET undone = ? WHERE id = ?').run(
      direction === 'undo' ? 1 : 0,
      full.id
    );
    recordEvent(game.code, {
      actor: actorName(),
      type: direction,
      description: `${direction === 'undo' ? 'undid' : 'redid'} ${full.actor}'s change (${full.description})`
    });
    advanceIfComplete(game.code);
    broadcast(game.code);
    cb({ ok: true });
  };

  socket.on('history:undo', (payload = {}, cb = () => {}) => {
    if (rateLimited(cb)) return;
    applyStackMove(payload, cb, 'undo');
  });

  socket.on('history:redo', (payload = {}, cb = () => {}) => {
    if (rateLimited(cb)) return;
    applyStackMove(payload, cb, 'redo');
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
