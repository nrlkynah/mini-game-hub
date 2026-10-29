import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FEEDBACK_MS, HOLD_MS, LIVES, MAX_PATTERN, MIN_STEP_MS, QUICK_BONUS, START_DELAY_MS, STREAK_BONUS, TILES } from '../src/matrix/config.js';
import { accuracy, createMemoryGame, litCount, revealEndsAt, select, tick } from '../src/matrix/engine.js';
import { checkPick, createPattern, patternSize, revealTiming } from '../src/matrix/pattern.js';
import { accuracyPercent, clearPoints, isQuick, levelPoints } from '../src/matrix/scoring.js';
import { createMatrixStorage, MATRIX_STORAGE_KEY } from '../src/app/matrixStorage.js';

/** Let the reveal finish; returns the state waiting for input. */
const toInput = (state) => {
  const ready = tick(state, revealEndsAt(state));
  assert.equal(ready.status, 'input');
  return ready;
};

/** Repeat the whole pattern, one tile every `gap` ms. */
const solve = (state, gap = 300) => {
  let game = toInput(state);
  const start = game.inputStartedAt;
  game.pattern.forEach((tile, i) => {
    game = select(game, { tile, at: start + (i + 1) * gap });
  });
  return game;
};

/** Pick a tile that is not the next one in the pattern (and not already picked). */
const wrongTile = (state) => [...Array(TILES).keys()].find((t) => !state.pattern.includes(t));

/** Make a mistake straight away. */
const fail = (state) => {
  const game = toInput(state);
  return select(game, { tile: wrongTile(game), at: game.inputStartedAt + 400 });
};

/** An in-memory stand-in for localStorage. */
const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)) };
};

test('1. a new game starts at level 1 with 3 lives, nothing scored, showing a pattern', () => {
  const game = createMemoryGame(7);

  assert.equal(game.status, 'reveal');
  assert.equal(game.level, 1);
  assert.equal(game.lives, LIVES);
  assert.equal(game.pattern.length, 3);
  assert.deepEqual(game.picks, []);
  assert.deepEqual([game.score, game.streak, game.bestStreak, game.cleared, game.taps], [0, 0, 0, 0, 0]);
  assert.equal(game.revealStartsAt, START_DELAY_MS);
  assert.equal(accuracy(game), 0);
  assert.ok(Object.isFrozen(game));
});

test('2. patterns grow one tile per level up to a cap, and reveals speed up gently', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(patternSize), [3, 4, 5, 6, 7]);
  assert.equal(patternSize(8), MAX_PATTERN);
  assert.equal(patternSize(50), MAX_PATTERN);

  assert.equal(revealTiming(1).stepMs, 650);
  assert.equal(revealTiming(2).stepMs, 625);
  assert.equal(revealTiming(100).stepMs, MIN_STEP_MS);
  assert.equal(revealTiming(5).holdMs, HOLD_MS);
  for (let level = 1; level < 40; level++) {
    assert.ok(revealTiming(level + 1).stepMs <= revealTiming(level).stepMs);
    assert.ok(revealTiming(level).stepMs - revealTiming(level + 1).stepMs <= 25); // never a big jump
  }

  // Same seed, same patterns.
  assert.deepEqual(createMemoryGame(99).pattern, createMemoryGame(99).pattern);
  assert.deepEqual(solve(createMemoryGame(99)).pattern, solve(createMemoryGame(99)).pattern);
});

test('3. a pattern holds only valid, unique tiles', () => {
  let rng = 12345;
  for (let size = 1; size <= TILES; size++) {
    let pattern;
    [pattern, rng] = createPattern(rng, size);
    assert.equal(pattern.length, size);
    assert.equal(new Set(pattern).size, size, `duplicates in ${pattern}`);
    assert.ok(pattern.every((t) => Number.isInteger(t) && t >= 0 && t < TILES));
  }
  // Different patterns come out of different seeds.
  const seen = new Set(Array.from({ length: 20 }, (_, s) => createPattern(s + 1, 5)[0].join()));
  assert.ok(seen.size > 15);
});

test('4. the reveal lights tiles one by one, holds, then hides for input', () => {
  const game = createMemoryGame(3);
  const { stepMs } = revealTiming(1);
  const start = game.revealStartsAt;

  assert.equal(litCount(game, 0), 0); // dark before the reveal starts
  assert.equal(litCount(game, start), 1);
  assert.equal(litCount(game, start + stepMs - 1), 1);
  assert.equal(litCount(game, start + stepMs), 2);
  assert.equal(litCount(game, start + 2 * stepMs), 3);
  assert.equal(litCount(game, start + 10 * stepMs), 3); // all lit until it hides

  // Picks are blocked while the pattern shows.
  const early = select(game, { tile: game.pattern[0], at: start + 100 });
  assert.equal(early.lastEvent.type, 'blocked');
  assert.deepEqual(early.picks, []);

  assert.equal(revealEndsAt(game), start + 3 * stepMs + HOLD_MS);
  assert.equal(tick(game, revealEndsAt(game) - 1), game);
  const hidden = tick(game, revealEndsAt(game));
  assert.equal(hidden.status, 'input');
  assert.equal(hidden.lastEvent.type, 'hide');
  assert.equal(litCount(hidden, revealEndsAt(game) + 50), 0);
});

test('5. repeating the pattern in order is correct', () => {
  const pattern = [5, 0, 10];
  assert.equal(checkPick(pattern, [], 5), 'correct');
  assert.equal(checkPick(pattern, [5], 0), 'correct');
  assert.equal(checkPick(pattern, [5, 0], 10), 'complete');

  let game = toInput(createMemoryGame(4));
  game = select(game, { tile: game.pattern[0], at: game.inputStartedAt + 200 });
  assert.equal(game.lastEvent.type, 'pick');
  assert.deepEqual(game.picks, [game.pattern[0]]);
  assert.equal(game.status, 'input');

  // The same tile twice is ignored, not a mistake.
  const again = select(game, { tile: game.pattern[0], at: game.inputStartedAt + 300 });
  assert.equal(again.lastEvent.type, 'ignored');
  assert.deepEqual([again.lives, again.taps, again.picks.length], [game.lives, game.taps, 1]);
});

test('6. a wrong tile, or the right tiles in the wrong order, is a mistake', () => {
  const pattern = [5, 0, 10];
  assert.equal(checkPick(pattern, [], 0), 'wrong'); // right tile, wrong order
  assert.equal(checkPick(pattern, [], 7), 'wrong');
  assert.equal(checkPick(pattern, [5], 5), 'repeat');
  assert.equal(checkPick(pattern, [], 16), 'invalid');
  assert.equal(checkPick(pattern, [], -1), 'invalid');

  const game = toInput(createMemoryGame(4));
  const wrong = select(game, { tile: game.pattern[1], at: game.inputStartedAt + 200 });
  assert.equal(wrong.lastEvent.type, 'fail');
  assert.equal(wrong.lastEvent.expected, game.pattern[0]);
});

test('7. clearing a level moves on to a longer pattern', () => {
  const first = createMemoryGame(11);
  const cleared = solve(first);

  assert.equal(cleared.lastEvent.type, 'clear');
  assert.equal(cleared.level, 2);
  assert.equal(cleared.cleared, 1);
  assert.equal(cleared.pattern.length, 4);
  assert.equal(cleared.status, 'reveal');
  assert.deepEqual(cleared.picks, []);
  assert.equal(cleared.revealStartsAt, first.revealStartsAt + 3 * 650 + HOLD_MS + 3 * 300 + FEEDBACK_MS);

  let game = cleared;
  for (let i = 0; i < 5; i++) game = solve(game);
  assert.equal(game.level, 7);
  assert.equal(game.cleared, 6);
  assert.equal(game.pattern.length, 9);
});

test('8. score depends on level, streak and speed, deterministically', () => {
  assert.deepEqual([1, 2, 3, 4].map(levelPoints), [100, 150, 200, 250]);
  assert.equal(clearPoints(1, 1, false), 100);
  assert.equal(clearPoints(3, 2, false), 250);
  assert.equal(clearPoints(3, 2, true), 250 + QUICK_BONUS);
  assert.equal(clearPoints(5, 4, false), 300 + 3 * STREAK_BONUS);
  assert.equal(isQuick(2100, 3), true);
  assert.equal(isQuick(2101, 3), false);
  assert.equal(accuracyPercent(6, 7), 86);
  assert.equal(accuracyPercent(0, 0), 0);

  const quick = solve(createMemoryGame(2), 300); // 900 ms for 3 tiles
  assert.equal(quick.lastEvent.quick, true);
  assert.equal(quick.score, 100 + QUICK_BONUS);
  const slow = solve(createMemoryGame(2), 1000); // 3000 ms for 3 tiles
  assert.equal(slow.lastEvent.quick, false);
  assert.equal(slow.score, 100);

  // Same play, same score.
  const play = (seed) => solve(solve(solve(createMemoryGame(seed), 500), 900), 400).score;
  assert.equal(play(8), play(8));
});

test('9. the streak grows with every level cleared in a row', () => {
  let game = createMemoryGame(5);
  const streaks = [];
  for (let i = 0; i < 4; i++) {
    game = solve(game, 1000);
    streaks.push(game.streak);
  }

  assert.deepEqual(streaks, [1, 2, 3, 4]);
  assert.equal(game.bestStreak, 4);
  assert.equal(game.lastEvent.points, levelPoints(4) + 3 * STREAK_BONUS);
});

test('10. a mistake resets the streak but keeps the best streak', () => {
  let game = solve(solve(solve(createMemoryGame(6))));
  assert.equal(game.streak, 3);

  game = fail(game);
  assert.equal(game.streak, 0);
  assert.equal(game.bestStreak, 3);

  game = solve(game);
  assert.equal(game.streak, 1);
});

test('11. a mistake costs one life and replays the same level and pattern', () => {
  const before = toInput(solve(createMemoryGame(9)));
  const picked = select(before, { tile: before.pattern[0], at: before.inputStartedAt + 300 });
  const failed = select(picked, { tile: wrongTile(picked), at: before.inputStartedAt + 700 });

  assert.equal(failed.lastEvent.type, 'fail');
  assert.equal(failed.lives, LIVES - 1);
  assert.equal(failed.lastEvent.lives, LIVES - 1);
  assert.equal(failed.status, 'reveal');
  assert.equal(failed.level, before.level); // same level …
  assert.deepEqual(failed.pattern, before.pattern); // … and the same pattern, shown again
  assert.deepEqual(failed.picks, []);
  assert.equal(failed.score, before.score); // nothing taken away
  assert.equal(failed.revealStartsAt, before.inputStartedAt + 700 + FEEDBACK_MS);
  assert.equal(accuracy(failed), 80); // the whole game: 3 + 1 right, 1 wrong
});

test('12. the game is over after the last life, and stays over', () => {
  let game = solve(createMemoryGame(10));
  for (let i = 0; i < LIVES; i++) {
    assert.equal(game.status, 'reveal');
    game = fail(game);
  }

  assert.equal(game.status, 'over');
  assert.equal(game.lives, 0);
  assert.equal(game.lastEvent.over, true);
  assert.equal(game.cleared, 1);
  assert.equal(game.score, 150); // level 1, quick

  assert.equal(tick(game, 1e9), game);
  const blocked = select(game, { tile: 0, at: 1e9 });
  assert.equal(blocked.lastEvent.type, 'blocked');
  assert.equal(blocked.score, game.score);
});

test('13. play again starts a fresh game with nothing carried over', () => {
  let old = createMemoryGame(1);
  for (let i = 0; i < LIVES; i++) old = fail(old);
  assert.equal(old.status, 'over');

  const fresh = createMemoryGame(2);
  assert.equal(fresh.status, 'reveal');
  assert.deepEqual([fresh.level, fresh.lives, fresh.score, fresh.streak, fresh.bestStreak, fresh.cleared, fresh.taps], [1, LIVES, 0, 0, 0, 0, 0]);
  assert.deepEqual(fresh.picks, []);
});

test('14. best score, highest level and best streak persist and only improve', () => {
  const backend = memory();

  assert.deepEqual(createMatrixStorage(backend).getBest(), { score: 0, level: 0, streak: 0 });
  const first = createMatrixStorage(backend).saveResult({ score: 4820, cleared: 12, bestStreak: 7 });
  assert.equal(first.isNewBest, true);

  // A new storage object over the same data = the page was reloaded.
  assert.deepEqual(createMatrixStorage(backend).getBest(), { score: 4820, level: 12, streak: 7 });

  const lower = createMatrixStorage(backend).saveResult({ score: 1000, cleared: 13, bestStreak: 2 });
  assert.equal(lower.isNewBest, false);
  assert.deepEqual(lower.best, { score: 4820, level: 13, streak: 7 });
  assert.equal(createMatrixStorage(memory()).saveResult({ score: 0, cleared: 0, bestStreak: 0 }).isNewBest, false);

  for (const raw of ['not json', '{"score":"9"}', '{"score":-5,"level":2.5}', 'null', '[]']) {
    const best = createMatrixStorage(memory({ [MATRIX_STORAGE_KEY]: raw })).getBest();
    assert.ok(Object.values(best).every((v) => Number.isSafeInteger(v) && v >= 0), raw);
  }

  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
  for (const bad of [null, broken]) {
    const storage = createMatrixStorage(bad);
    assert.deepEqual(storage.getBest(), { score: 0, level: 0, streak: 0 });
    assert.equal(storage.saveResult({ score: 10, cleared: 1, bestStreak: 1 }).isNewBest, true);
  }
});
