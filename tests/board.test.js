import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COLORS, COLS, ROWS } from '../src/game/config.js';
import { createBoard, findGroup, hasValidMove, removeAndRefill } from '../src/game/board.js';
import { nextRandom, randomInt, toSeed } from '../src/game/rng.js';

/** Build a board from rows of colour indexes, e.g. [[0, 0, 1], [2, 1, 1]]. */
const make = (rows) => {
  let id = 1;
  return rows.map((row) => row.map((color) => ({ id: id++, color })));
};
const colors = (board) => board.map((row) => row.map((t) => t.color));

test('the random generator is deterministic for a seed', () => {
  const sequence = (seed) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      let value;
      [value, seed] = nextRandom(seed);
      out.push(value);
    }
    return out;
  };

  assert.deepEqual(sequence(42), sequence(42));
  assert.notDeepEqual(sequence(42), sequence(43));
  for (const value of sequence(7)) {
    assert.ok(value >= 0 && value < 1);
  }
  const [n] = randomInt(99, 5);
  assert.ok(Number.isInteger(n) && n >= 0 && n < 5);
  assert.equal(toSeed(NaN), 1);
  assert.equal(toSeed(-12.7), 12);
});

test('a new board has the right size, valid colours, unique ids and a move', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { board, nextId } = createBoard(seed, 1);
    assert.equal(board.length, ROWS);
    board.forEach((row) => assert.equal(row.length, COLS));

    const tiles = board.flat();
    assert.ok(tiles.every((t) => Number.isInteger(t.color) && t.color >= 0 && t.color < COLORS.length));
    assert.equal(new Set(tiles.map((t) => t.id)).size, ROWS * COLS);
    assert.ok(nextId > Math.max(...tiles.map((t) => t.id)));
    assert.ok(hasValidMove(board), `seed ${seed} has no valid move`);
  }
});

test('the same seed always deals the same board', () => {
  assert.deepEqual(createBoard(1234, 1), createBoard(1234, 1));
  assert.notDeepEqual(colors(createBoard(1234, 1).board), colors(createBoard(4321, 1).board));
});

test('findGroup returns all touching tiles of the same colour', () => {
  const board = make([
    [0, 0, 1, 2],
    [3, 0, 1, 2],
    [0, 0, 4, 1],
  ]);

  assert.deepEqual(findGroup(board, 0, 0), [[0, 0], [0, 1], [1, 1], [2, 0], [2, 1]]);
  assert.deepEqual(findGroup(board, 0, 2), [[0, 2], [1, 2]]);
  assert.deepEqual(findGroup(board, 2, 3), [[2, 3]]); // diagonal does not count
  assert.deepEqual(findGroup(board, 1, 0), [[1, 0]]);
  assert.deepEqual(findGroup(board, 9, 9), []);
  assert.deepEqual(findGroup(board, -1, 0), []);
  assert.deepEqual(findGroup(board, 0.5, 0), []);
});

test('removing tiles lets the ones above fall and refills from the top', () => {
  const board = make([
    [1, 2],
    [3, 4],
    [0, 0],
  ]);

  const { board: next, spawned, nextId } = removeAndRefill(board, [[2, 0], [2, 1]], 5, 7);

  // Survivors moved down one row, same tiles (same ids).
  assert.deepEqual(next[2].map((t) => t.id), [3, 4]);
  assert.deepEqual(next[1].map((t) => t.id), [1, 2]);
  // Two new tiles at the top, with fresh ids.
  assert.deepEqual(next[0].map((t) => t.id).sort(), [7, 8]);
  assert.deepEqual(spawned.sort(), [7, 8]);
  assert.equal(nextId, 9);
  assert.ok(next.flat().every((t) => t && Number.isInteger(t.color)));
  // The original board is untouched.
  assert.deepEqual(colors(board), [[1, 2], [3, 4], [0, 0]]);
});

test('refill handles a vertical group and keeps the board full', () => {
  const board = make([
    [1, 2, 3],
    [0, 4, 3],
    [0, 1, 2],
  ]);

  const { board: next } = removeAndRefill(board, [[1, 0], [2, 0]], 1, 100);

  assert.equal(next.flat().length, 9);
  assert.equal(next[2][0].id, 1); // the top tile fell two rows
  assert.ok(next[0][0].id >= 100 && next[1][0].id >= 100);
  assert.deepEqual(next.map((row) => row.slice(1).map((t) => t.id)), board.map((row) => row.slice(1).map((t) => t.id)));
});

test('hasValidMove detects horizontal, vertical and no pairs', () => {
  assert.equal(hasValidMove(make([[0, 0], [1, 2]])), true);
  assert.equal(hasValidMove(make([[0, 1], [0, 2]])), true);
  assert.equal(hasValidMove(make([[0, 1], [1, 0]])), false);
});
