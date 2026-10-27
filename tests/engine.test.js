import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMBO_WINDOW_MS, DURATION_MS, MAX_COMBO } from '../src/game/config.js';
import { applyMove, createGame, secondsLeft, tick } from '../src/game/engine.js';
import { findGroup } from '../src/game/board.js';
import { basePoints, comboAfterMatch, matchPoints } from '../src/game/scoring.js';

/** A game whose board we control. */
const withBoard = (rows, overrides = {}) => {
  let id = 1;
  const board = rows.map((row) => row.map((color) => ({ id: id++, color })));
  return Object.freeze({ ...createGame(1), board, nextId: id, ...overrides });
};

/** First cell that is part of a valid group on this board. */
const findMatch = (state) => {
  for (let r = 0; r < state.board.length; r++) {
    for (let c = 0; c < state.board[r].length; c++) {
      if (findGroup(state.board, r, c).length >= 2) return { row: r, col: c };
    }
  }
  return null;
};
const findSingle = (state) => {
  for (let r = 0; r < state.board.length; r++) {
    for (let c = 0; c < state.board[r].length; c++) {
      if (findGroup(state.board, r, c).length === 1) return { row: r, col: c };
    }
  }
  return null;
};

test('base points follow the table and stay integers', () => {
  assert.equal(basePoints(0), 0);
  assert.equal(basePoints(1), 0);
  assert.equal(basePoints(2), 50);
  assert.equal(basePoints(3), 100);
  assert.equal(basePoints(4), 175);
  assert.equal(basePoints(5), 250);
  assert.equal(basePoints(6), 325);
  assert.equal(basePoints(10), 625);
  assert.equal(matchPoints(3, 4), 400);
  for (let size = 2; size < 30; size++) {
    assert.ok(Number.isInteger(basePoints(size)));
    assert.ok(basePoints(size + 1) > basePoints(size));
  }
});

test('combo grows with quick matches, resets after a pause, and is capped', () => {
  assert.equal(comboAfterMatch(0, null, 1000), 1);
  assert.equal(comboAfterMatch(1, 1000, 1000 + COMBO_WINDOW_MS), 2);
  assert.equal(comboAfterMatch(2, 1000, 1000 + COMBO_WINDOW_MS + 1), 1);
  assert.equal(comboAfterMatch(MAX_COMBO, 0, 10), MAX_COMBO);
  assert.equal(comboAfterMatch(0, 1000, 1100), 1); // after a lost combo
});

test('a new game starts at 60 seconds with nothing scored', () => {
  const game = createGame(99);

  assert.equal(game.status, 'playing');
  assert.equal(secondsLeft(game), 60);
  assert.deepEqual([game.score, game.combo, game.bestCombo, game.matches], [0, 0, 0, 0]);
  assert.ok(Object.isFrozen(game));
});

test('the timer reaches exactly 0 and the round ends', () => {
  let game = createGame(5);

  game = tick(game, 59_000.4);
  assert.equal(secondsLeft(game), 1);
  assert.equal(game.status, 'playing');

  game = tick(game, 59_999);
  assert.equal(secondsLeft(game), 1);

  game = tick(game, DURATION_MS + 5_000); // the browser was late
  assert.equal(game.elapsedMs, DURATION_MS);
  assert.equal(secondsLeft(game), 0);
  assert.equal(game.status, 'over');

  // Time cannot run backwards or restart.
  assert.equal(tick(game, 10), game);
});

test('the timer counts down 60, 59, 58 ... 0', () => {
  let game = createGame(5);
  const shown = [];
  for (let ms = 0; ms <= DURATION_MS; ms += 1000) {
    game = tick(game, ms);
    shown.push(secondsLeft(game));
  }
  assert.deepEqual(shown, Array.from({ length: 61 }, (_, i) => 60 - i));
});

test('a valid match removes the group, scores and refills the board', () => {
  const game = withBoard([
    [0, 0, 0, 1, 2, 3],
    [1, 2, 3, 4, 1, 2],
    [2, 3, 4, 1, 2, 3],
    [3, 4, 1, 2, 3, 4],
    [4, 1, 2, 3, 4, 1],
    [1, 2, 3, 4, 1, 2],
    [2, 3, 4, 1, 4, 4], // another pair, so no reshuffle is needed
  ]);

  const next = applyMove(game, { row: 0, col: 1, at: 1000 });
  assert.equal(next.lastMove.reshuffled, false);

  assert.equal(next.lastMove.type, 'match');
  assert.equal(next.lastMove.size, 3);
  assert.equal(next.lastMove.points, 100);
  assert.equal(next.score, 100);
  assert.equal(next.combo, 1);
  assert.equal(next.matches, 1);
  assert.equal(next.lastMove.spawned.length, 3);
  assert.equal(next.board.flat().length, 42);
  assert.ok(next.board[0].slice(0, 3).every((t) => t.id >= game.nextId)); // new tiles at the top
  assert.equal(game.score, 0); // the old state is unchanged
});

test('quick matches build a combo and multiply the points', () => {
  let game = createGame(2024);
  const points = [];

  for (let i = 0; i < 4; i++) {
    const cell = findMatch(game);
    game = applyMove(game, { ...cell, at: 1000 + i * 500 });
    assert.equal(game.lastMove.type, 'match');
    assert.equal(game.combo, i + 1);
    assert.equal(game.lastMove.points, basePoints(game.lastMove.size) * (i + 1));
    points.push(game.lastMove.points);
  }

  assert.equal(game.bestCombo, 4);
  assert.equal(game.score, points.reduce((a, b) => a + b, 0));

  // A slow match starts the combo again.
  game = applyMove(game, { ...findMatch(game), at: 1000 + 3 * 500 + COMBO_WINDOW_MS + 1 });
  assert.equal(game.combo, 1);
  assert.equal(game.bestCombo, 4);
});

test('an invalid move resets the combo and changes nothing else', () => {
  let game = createGame(77);
  game = applyMove(game, { ...findMatch(game), at: 1000 });
  game = applyMove(game, { ...findMatch(game), at: 1200 });
  assert.equal(game.combo, 2);

  const single = findSingle(game);
  const after = applyMove(game, { ...single, at: 1300 });

  assert.equal(after.lastMove.type, 'invalid');
  assert.equal(after.combo, 0);
  assert.equal(after.bestCombo, 2);
  assert.equal(after.score, game.score);
  assert.equal(after.matches, game.matches);
  assert.deepEqual(after.board, game.board);

  // The next match after an invalid one starts at x1.
  assert.equal(applyMove(after, { ...findMatch(after), at: 1400 }).combo, 1);
});

test('taps outside the board are ignored', () => {
  const game = createGame(3);
  for (const cell of [{ row: -1, col: 0 }, { row: 0, col: 99 }, { row: '1', col: 1 }, { row: NaN, col: 0 }]) {
    const next = applyMove(game, { ...cell, at: 100 });
    assert.equal(next.lastMove.type, 'ignored');
    assert.equal(next.score, 0);
  }
});

test('no move counts after the time is up', () => {
  let game = createGame(11);
  const cell = findMatch(game);

  // A tap that arrives at or after 60 s is blocked and ends the round.
  const late = applyMove(game, { ...cell, at: DURATION_MS });
  assert.equal(late.status, 'over');
  assert.equal(late.lastMove.type, 'blocked');
  assert.equal(late.score, 0);
  assert.deepEqual(late.board, game.board);

  game = tick(game, DURATION_MS);
  const after = applyMove(game, { ...cell, at: 10 }); // even with a forged early time
  assert.equal(after.lastMove.type, 'blocked');
  assert.equal(after.score, 0);
  assert.equal(after.matches, 0);
});

test('the same seed and moves always give the same game', () => {
  const play = () => {
    let game = createGame(31337);
    for (let i = 0; i < 25; i++) {
      game = applyMove(game, { ...(findMatch(game) ?? { row: 0, col: 0 }), at: 500 + i * 700 });
    }
    return game;
  };

  const a = play();
  const b = play();
  assert.equal(a.score, b.score);
  assert.deepEqual(a.board, b.board);
  assert.equal(a.matches, 25);
  assert.ok(Number.isInteger(a.score));
});

test('the board always has a move after a match (reshuffles when stuck)', () => {
  let game = createGame(8);
  for (let i = 0; i < 300; i++) {
    const cell = findMatch(game);
    assert.ok(cell, `no valid move after ${i} matches`);
    game = applyMove(game, { ...cell, at: i * 100 });
    assert.equal(new Set(game.board.flat().map((t) => t.id)).size, 42);
  }
});

test('a board left with no moves is reshuffled', () => {
  // Clearing the only pair leaves a chequerboard with no moves.
  const game = withBoard([
    [0, 0, 1, 0, 1, 0],
    [1, 2, 0, 1, 0, 1],
    [0, 1, 2, 0, 1, 0],
    [1, 0, 1, 2, 0, 1],
    [0, 1, 0, 1, 2, 0],
    [1, 0, 1, 0, 1, 2],
    [0, 1, 0, 1, 0, 1],
  ]);
  const next = applyMove(game, { row: 0, col: 0, at: 100 });

  assert.equal(next.lastMove.type, 'match');
  assert.ok(findMatch(next));
});
