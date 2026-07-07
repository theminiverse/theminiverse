import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeScoreChange, nextRedoable, nextUndoable } from './history.js';

// Minimal event shape: only the fields the stack helpers read.
const ev = (id, { undoable = 1, undone = 0, abandoned = 0 } = {}) => ({
  id,
  undoable,
  undone,
  abandoned
});

test('nextUndoable picks the most recent active score event', () => {
  const events = [ev(1), ev(2), ev(3)];
  assert.equal(nextUndoable(events).id, 3);
});

test('nextUndoable skips already-undone and non-undoable events', () => {
  const events = [
    ev(1),
    ev(2, { undone: 1 }),
    ev(3, { undoable: 0 }) // e.g. an undo/redo/join log entry
  ];
  assert.equal(nextUndoable(events).id, 1);
});

test('nextUndoable returns null when nothing is undoable', () => {
  assert.equal(nextUndoable([]), null);
  assert.equal(nextUndoable([ev(1, { undoable: 0 })]), null);
  assert.equal(nextUndoable([ev(1, { undone: 1 })]), null);
});

test('nextRedoable picks the oldest undone event so undos reverse in order', () => {
  // Undid e3 then e2 (LIFO); redo should replay e2 first, then e3.
  const events = [ev(1), ev(2, { undone: 1 }), ev(3, { undone: 1 })];
  assert.equal(nextRedoable(events).id, 2);
});

test('nextRedoable ignores abandoned events', () => {
  const events = [ev(1, { undone: 1, abandoned: 1 }), ev(2, { undone: 1 })];
  assert.equal(nextRedoable(events).id, 2);
});

test('nextRedoable returns null when the redo stack is empty', () => {
  assert.equal(nextRedoable([ev(1), ev(2)]), null);
  assert.equal(nextRedoable([ev(1, { undone: 1, abandoned: 1 })]), null);
});

test('undo/redo round trip walks the stack both ways', () => {
  // Three active edits.
  let events = [ev(1), ev(2), ev(3)];
  // Undo twice.
  const u1 = nextUndoable(events);
  assert.equal(u1.id, 3);
  events = events.map((e) => (e.id === 3 ? { ...e, undone: 1 } : e));
  const u2 = nextUndoable(events);
  assert.equal(u2.id, 2);
  events = events.map((e) => (e.id === 2 ? { ...e, undone: 1 } : e));
  // Redo once brings back e2.
  const r1 = nextRedoable(events);
  assert.equal(r1.id, 2);
});

test('describeScoreChange renders set and clear phrasings', () => {
  assert.equal(describeScoreChange('Bob', 3, 45), "set Bob's Round 3 to 45");
  assert.equal(describeScoreChange('Bob', 3, 0), "set Bob's Round 3 to 0");
  assert.equal(describeScoreChange('Bob', 3, null), "cleared Bob's Round 3");
});
