import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TOTAL_ROUNDS,
  allScored,
  cumulativeTotals,
  leaderboard,
  roundRanking,
  seatingForRound,
  shuffle,
  tableSizes
} from './game.js';

const makePlayers = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

test('tableSizes prefers tables of 4, fives at the bottom, max 5', () => {
  assert.deepEqual(tableSizes(0), []);
  assert.deepEqual(tableSizes(3), [3]);
  assert.deepEqual(tableSizes(4), [4]);
  assert.deepEqual(tableSizes(5), [5]);
  assert.deepEqual(tableSizes(6), [3, 3]);
  assert.deepEqual(tableSizes(7), [3, 4]);
  assert.deepEqual(tableSizes(8), [4, 4]);
  assert.deepEqual(tableSizes(9), [4, 5]);
  assert.deepEqual(tableSizes(10), [5, 5]);
  assert.deepEqual(tableSizes(11), [3, 4, 4]);
  assert.deepEqual(tableSizes(12), [4, 4, 4]);
  assert.deepEqual(tableSizes(13), [4, 4, 5]);
  assert.deepEqual(tableSizes(14), [4, 5, 5]);
  assert.deepEqual(tableSizes(15), [5, 5, 5]);
  assert.deepEqual(tableSizes(16), [4, 4, 4, 4]);
  assert.deepEqual(tableSizes(17), [4, 4, 4, 5]);
  assert.deepEqual(tableSizes(20), [4, 4, 4, 4, 4]);
  for (let n = 1; n <= 60; n++) {
    const sizes = tableSizes(n);
    assert.equal(sizes.reduce((a, b) => a + b, 0), n, `sum for n=${n}`);
    assert.ok(sizes.every((s) => s <= 5), `max 5 for n=${n}`);
    for (let i = 1; i < sizes.length; i++) {
      assert.ok(sizes[i] >= sizes[i - 1], `bottom tables largest for n=${n}`);
    }
  }
});

test('cumulativeTotals sums submitted scores, missing rounds count as 0', () => {
  const players = makePlayers(2);
  const scores = { 1: { 1: 10, 2: 5 }, 2: { 2: 7 } };
  assert.deepEqual(cumulativeTotals(players, scores), { 1: 15, 2: 7 });
  assert.deepEqual(cumulativeTotals(players, scores, 1), { 1: 10, 2: 0 });
});

test('leaderboard sorts ascending and shares rank on ties', () => {
  const players = makePlayers(3);
  const scores = { 1: { 1: 20 }, 2: { 1: 5 }, 3: { 1: 5 } };
  const board = leaderboard(players, scores);
  assert.deepEqual(
    board.map((e) => [e.playerId, e.total, e.rank]),
    [
      [2, 5, 1],
      [3, 5, 1],
      [1, 20, 3]
    ]
  );
});

test('roundRanking sorts by round score, ties broken by cumulative then join order', () => {
  const players = makePlayers(4);
  const scores = {
    1: { 1: 30, 2: 10 }, // cumulative 40
    2: { 1: 5, 2: 10 },  // cumulative 15
    3: { 1: 5, 2: 10 },  // cumulative 15 -> tie with 2, joins later
    4: { 1: 50 }         // no round 2 score -> bottom
  };
  const order = roundRanking(players, scores, 2).map((p) => p.id);
  assert.deepEqual(order, [2, 3, 1, 4]);
});

test('round 1 seating follows the stored random order, unknown ids ignored, new players appended', () => {
  const players = makePlayers(5);
  const seating = seatingForRound(players, {}, 1, [3, 1, 99, 4]);
  assert.equal(seating.basis, 'random');
  assert.deepEqual(seating.tables, [[3, 1, 4, 2, 5]]);
});

test('mid-game seating is seeded by the previous round, best players at table 1', () => {
  const players = makePlayers(9);
  const scores = {};
  players.forEach((p) => {
    scores[p.id] = { 3: p.id * 10 }; // player 1 best ... player 9 worst
  });
  const seating = seatingForRound(players, scores, 4);
  assert.equal(seating.basis, 'round');
  assert.deepEqual(seating.tables, [
    [1, 2, 3, 4],
    [5, 6, 7, 8, 9]
  ]);
});

test('final round seating uses cumulative totals through round 8, ignoring round 9 scores', () => {
  const players = makePlayers(4);
  const scores = {
    1: { 1: 1, 8: 1 },          // cumulative 2 -> best overall
    2: { 1: 9, 8: 0 },          // 9; round 8 winner
    3: { 1: 5, 8: 5 },          // 10
    4: { 1: 90, 8: 2, 9: 0 }    // 92; round 9 score must not matter
  };
  const seating = seatingForRound(players, scores, TOTAL_ROUNDS);
  assert.equal(seating.basis, 'cumulative');
  assert.deepEqual(seating.tables, [[1, 2, 3, 4]]);
});

test('final round seating puts players with no recorded rounds at the bottom', () => {
  const players = makePlayers(5);
  const scores = {
    1: { 1: 10 },
    2: { 1: 20 },
    3: { 1: 30 },
    4: { 1: 40 }
    // player 5 joined late, no scores yet -> total 0 but seated last
  };
  const seating = seatingForRound(players, scores, TOTAL_ROUNDS);
  assert.deepEqual(seating.tables, [[1, 2, 3, 4, 5]]);
  assert.deepEqual(seating.tables[0].at(-1), 5);
});

test('allScored detects a complete round', () => {
  const players = makePlayers(2);
  assert.equal(allScored(players, { 1: { 1: 3 } }, 1), false);
  assert.equal(allScored(players, { 1: { 1: 3 }, 2: { 1: 0 } }, 1), true);
  assert.equal(allScored([], {}, 1), false);
});

test('shuffle keeps the same members', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(input);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
});
