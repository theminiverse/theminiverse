export const TOTAL_ROUNDS = 9;

// scores shape: { [playerId]: { [round]: value } }

export function cumulativeTotals(players, scores, throughRound = TOTAL_ROUNDS) {
  const totals = {};
  for (const p of players) {
    const rounds = scores[p.id] || {};
    let total = 0;
    for (const [round, value] of Object.entries(rounds)) {
      if (Number(round) <= throughRound) total += value;
    }
    totals[p.id] = total;
  }
  return totals;
}

// Lowest total first; equal totals share a rank. Players are assumed to be
// in join order (id ascending), which is the final tiebreak for display order.
export function leaderboard(players, scores) {
  const totals = cumulativeTotals(players, scores);
  const sorted = [...players].sort(
    (a, b) => totals[a.id] - totals[b.id] || a.id - b.id
  );
  let prevTotal = null;
  let prevRank = 0;
  return sorted.map((p, i) => {
    const total = totals[p.id];
    const rank = total === prevTotal ? prevRank : i + 1;
    prevTotal = total;
    prevRank = rank;
    return { playerId: p.id, name: p.name, total, rank };
  });
}

// Rank players by one round's score (lowest = best). A player with no score
// for that round (added mid-game) sorts to the bottom. Ties break by
// cumulative total, then join order.
export function roundRanking(players, scores, round) {
  const totals = cumulativeTotals(players, scores);
  const roundScore = (p) => {
    const v = scores[p.id]?.[round];
    return v === undefined ? Infinity : v;
  };
  return [...players].sort((a, b) => {
    const va = roundScore(a);
    const vb = roundScore(b);
    if (va !== vb) return va < vb ? -1 : 1;
    return totals[a.id] - totals[b.id] || a.id - b.id;
  });
}

// Tables of 4 preferred, 5 max. When n splits into 4s and 5s, use the fewest
// 5s and seat them at the bottom (n=13 -> 4/4/5, n=20 -> 4/4/4/4/4). A few
// sizes (6, 7, 11) can't split into 4s and 5s; fall back to the most even
// split with at most 4 per table, smaller tables on top so the bottom tables
// stay the largest.
export function tableSizes(n) {
  if (n <= 0) return [];
  if (n <= 5) return [n];
  const fives = n % 4;
  const rest = n - fives * 5;
  if (rest >= 0) {
    return [...Array(rest / 4).fill(4), ...Array(fives).fill(5)];
  }
  const tables = Math.ceil(n / 4);
  const base = Math.floor(n / tables);
  const extra = n % tables;
  return Array.from({ length: tables }, (_, i) =>
    base + (i >= tables - extra ? 1 : 0)
  );
}

// Seating for a given round. Table 1 (top table) gets the best-ranked players.
//  - round 1: the persisted random order
//  - final round: cumulative totals through the second-to-last round
//  - otherwise: previous round's results
export function seatingForRound(players, scores, round, round1Order = []) {
  let ordered;
  let basis;
  if (round <= 1) {
    basis = 'random';
    const byId = new Map(players.map((p) => [p.id, p]));
    ordered = round1Order.map((id) => byId.get(id)).filter(Boolean);
    for (const p of players) {
      if (!ordered.includes(p)) ordered.push(p);
    }
  } else if (round >= TOTAL_ROUNDS) {
    basis = 'cumulative';
    const totals = cumulativeTotals(players, scores, TOTAL_ROUNDS - 1);
    // A late joiner with no recorded rounds has a total of 0; that shouldn't
    // put them at the top table, so players with no scores sort last.
    const played = (p) =>
      Object.keys(scores[p.id] || {}).some((r) => Number(r) < TOTAL_ROUNDS);
    ordered = [...players].sort(
      (a, b) =>
        played(b) - played(a) || totals[a.id] - totals[b.id] || a.id - b.id
    );
  } else {
    basis = 'round';
    ordered = roundRanking(players, scores, round - 1);
  }
  const tables = [];
  let idx = 0;
  for (const size of tableSizes(ordered.length)) {
    tables.push(ordered.slice(idx, idx + size).map((p) => p.id));
    idx += size;
  }
  return { round, basis, tables };
}

export function allScored(players, scores, round) {
  return (
    players.length > 0 &&
    players.every((p) => scores[p.id]?.[round] !== undefined)
  );
}

// Fisher-Yates; returns a new array.
export function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
