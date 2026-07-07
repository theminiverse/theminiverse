Welcome, from the miniverse

contact: https://twitter.com/theminiverse_io

<!---
theminiverse/theminiverse is a ✨ special ✨ repository because its `README.md` (this file) appears on your GitHub profile.
You can click the Preview link to take a look at your changes.
--->

---

# Shanghai — Multiplayer Score Tracker

A real-time, shared scoreboard for the card game **Shanghai**: 9 rounds, lowest
cumulative score wins. Start a game, share the link, and everyone scores off the
same board.

## How it works

- **One link, one game.** Hit "Start a new game" and share the `/g/CODE` link
  (or the code itself). Players join by typing their name — no accounts.
- **Anyone can do anything.** Any player can add other players and enter or fix
  anyone's score, for any round. Every change syncs to all devices instantly.
- **Version history + undo/redo.** A live feed records every change — who set
  or cleared which score, who joined, who added whom — with timestamps. Made a
  mistake? The shared **Undo** / **Redo** buttons step the whole table back and
  forth through score edits, newest first. Undone entries stay in the history,
  struck through, so you can always see what happened.
- **Rounds auto-advance.** Once every player has a score for the current round,
  it closes and the next round opens.
- **Cumulative leaderboard.** Running total per player across all rounds,
  lowest first — that's the standings.
- **Table assignments.** Between rounds, players are seated for the next round
  based on the previous round's results: best (lowest) scorers at Table 1, the
  top table. Tables hold at most 5, with 4 preferred — top tables get 4,
  bottom tables absorb the 5s (e.g. 13 players → 4/4/5).
  - **Round 1** is a random draw.
  - **Round 9 (final)** is seeded by cumulative totals instead of the last
    round, so the overall leaders battle it out at the top table.

## Running locally

```bash
npm install
npm run build   # build the client
npm start       # serve on http://localhost:3000
```

For development with hot reload, run the API and the Vite dev server side by side:

```bash
npm run dev          # API + websockets on :3000
npm run dev:client   # Vite dev server on :5173 (proxies /api and /socket.io)
```

Tests: `npm test`

## Deploying on Railway

1. Create a new Railway project → **Deploy from GitHub repo** → pick this repo.
   Nixpacks detects Node, runs `npm run build`, then `npm start`.
2. Attach a **volume** to the service (e.g. mounted at `/data`) so games survive
   redeploys.
3. Set the environment variable `DATABASE_PATH=/data/shanghai.db`.
4. Generate a public domain under Settings → Networking.

Share `https://your-domain.up.railway.app` with the group — creating a game
there gives you the invite link.

## Stack

Node + Express + Socket.IO + SQLite (`better-sqlite3`) on the server;
React + Vite on the client. All game state lives server-side; every mutation
broadcasts fresh state to everyone in the game's room.
