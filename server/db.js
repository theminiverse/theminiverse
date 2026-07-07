import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'shanghai.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    code TEXT PRIMARY KEY,
    current_round INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    round1_order TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_code TEXT NOT NULL REFERENCES games(code),
    name TEXT NOT NULL,
    joined_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_code);

  CREATE TABLE IF NOT EXISTS scores (
    game_code TEXT NOT NULL REFERENCES games(code),
    player_id INTEGER NOT NULL REFERENCES players(id),
    round INTEGER NOT NULL,
    value INTEGER NOT NULL,
    UNIQUE(game_code, player_id, round)
  );
  CREATE INDEX IF NOT EXISTS idx_scores_game ON scores(game_code);

  -- Append-only audit log powering the version history feed and the shared
  -- undo/redo stack. Every mutation is recorded with the acting player's name.
  -- Only score events are undoable; 'undone' marks one currently reverted (and
  -- thus redoable), 'abandoned' marks a redoable event discarded by a newer edit.
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_code TEXT NOT NULL REFERENCES games(code),
    actor TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    player_id INTEGER,
    round INTEGER,
    prev_value INTEGER,
    new_value INTEGER,
    undoable INTEGER NOT NULL DEFAULT 0,
    undone INTEGER NOT NULL DEFAULT 0,
    abandoned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_game ON events(game_code, id);
`);

export default db;
