// Pure helpers for the game-wide shared undo/redo stack.
//
// The `events` table is an append-only log of every mutation. Only score
// events participate in undo/redo (`undoable === 1`). A score event's lifecycle:
//
//   active      undoable=1, undone=0, abandoned=0  -> can be undone
//   undone      undoable=1, undone=1, abandoned=0  -> can be redone
//   abandoned   undoable=1, undone=1, abandoned=1  -> a newer edit dropped it
//
// Undo always targets the most recent active event (highest id); redo targets
// the oldest undone-but-not-abandoned event (lowest id), so a run of undos is
// reversed in the opposite order. Making a fresh edit abandons the whole redo
// stack, which is the conventional behaviour.

export function nextUndoable(events) {
  let best = null;
  for (const e of events) {
    if (e.undoable && !e.undone && (!best || e.id > best.id)) best = e;
  }
  return best;
}

export function nextRedoable(events) {
  let best = null;
  for (const e of events) {
    if (e.undoable && e.undone && !e.abandoned && (!best || e.id < best.id)) {
      best = e;
    }
  }
  return best;
}

// Human-readable summary of a score change, e.g. "set Bob's Round 3 to 45" or
// "cleared Bob's Round 3". `newValue === null` means the cell was emptied.
export function describeScoreChange(playerName, round, newValue) {
  if (newValue === null || newValue === undefined) {
    return `cleared ${playerName}'s Round ${round}`;
  }
  return `set ${playerName}'s Round ${round} to ${newValue}`;
}
