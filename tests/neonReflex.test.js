import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMBO_BONUS, MAX_DELAY_MS, MIN_DELAY_MS, MIN_SPREAD, ROUNDS, TARGET_TIMEOUT_MS } from '../src/reflex/config.js';
import { averageReaction, bestReaction, createReflexGame, press, reactionTime, tick } from '../src/reflex/engine.js';
import { comboAfterHit, gradeFor, hitPoints, speedPoints } from '../src/reflex/scoring.js';
import { createReflexStorage, REFLEX_STORAGE_KEY } from '../src/app/reflexStorage.js';

/** Wait for the next target to appear; returns the state with it showing. */
const showTarget = (state) => {
  const shown = tick(state, state.nextTargetAt);
  assert.equal(shown.status, 'target');
  return shown;
};

/** Show the next target and hit it after `ms`. */
const hitAfter = (state, ms) => {
  const shown = showTarget(state);
  return press(shown, { at: shown.target.shownAt + ms, onTarget: true });
};

/** Play a whole game, hitting every target after the given reaction times. */
const playAll = (seed, times) => times.reduce((state, ms) => hitAfter(state, ms), createReflexGame(seed));

/** An in-memory stand-in for localStorage. */
const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    dump: () => Object.fromEntries(data),
  };
};

test('1. a new game starts at round 1 with nothing scored and no target', () => {
  const game = createReflexGame(42);

  assert.equal(game.status, 'waiting');
  assert.equal(game.round, 1);
  assert.equal(game.target, null);
  assert.deepEqual([game.score, game.combo, game.bestCombo, game.hits, game.misses, game.falseClicks], [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(game.reactions, []);
  assert.equal(averageReaction(game), null);
  assert.equal(bestReaction(game), null);
  assert.ok(Object.isFrozen(game));
});

test('2. after GO! the first target appears once its random pause is over', () => {
  const game = createReflexGame(42);
  assert.ok(game.nextTargetAt >= MIN_DELAY_MS && game.nextTargetAt <= MAX_DELAY_MS, String(game.nextTargetAt));

  assert.equal(tick(game, 0), game); // nothing yet
  assert.equal(tick(game, game.nextTargetAt - 1), game);

  const shown = tick(game, game.nextTargetAt + 7); // the frame came a little late
  assert.equal(shown.status, 'target');
  assert.equal(shown.target.shownAt, game.nextTargetAt + 7); // timed from when it was actually drawn
  assert.equal(shown.lastEvent.type, 'spawn');
  assert.ok(shown.target.x >= 0 && shown.target.x < 1 && shown.target.y >= 0 && shown.target.y < 1);

  // The same seed gives the same game.
  assert.deepEqual(tick(createReflexGame(42), 5000), tick(createReflexGame(42), 5000));
});

test('3. hitting the target scores, ends the round and hides the target', () => {
  const shown = showTarget(createReflexGame(1));
  const hit = press(shown, { at: shown.target.shownAt + 142, onTarget: true });

  assert.equal(hit.lastEvent.type, 'hit');
  assert.equal(hit.hits, 1);
  assert.equal(hit.score, 858);
  assert.equal(hit.status, 'waiting');
  assert.equal(hit.round, 2);
  assert.equal(shown.score, 0); // the old state is unchanged
});

test('4. reaction time is measured from when the target appeared', () => {
  assert.equal(reactionTime(1000, 1142), 142);
  assert.equal(reactionTime(1000, 1287.6), 288); // whole ms
  assert.equal(reactionTime(1000, 990), 0); // never negative

  const shown = showTarget(createReflexGame(3));
  const hit = press(shown, { at: shown.target.shownAt + 287, onTarget: true });
  assert.equal(hit.lastEvent.reaction, 287);
  assert.deepEqual(hit.reactions, [287]);
});

test('5. faster reactions score more, deterministically', () => {
  assert.deepEqual(['perfect', 'great', 'good', 'slow'], [150, 250, 400, 600].map((ms) => gradeFor(ms).key));
  assert.equal(gradeFor(199).key, 'perfect');
  assert.equal(gradeFor(200).key, 'great');
  assert.equal(gradeFor(349).key, 'great');
  assert.equal(gradeFor(350).key, 'good');
  assert.equal(gradeFor(499).key, 'good');
  assert.equal(gradeFor(500).key, 'slow');

  assert.equal(speedPoints(142), 858);
  assert.equal(speedPoints(287), 713);
  assert.equal(speedPoints(500), 500);
  assert.equal(speedPoints(0), 1000);
  assert.equal(speedPoints(5000), 50); // even a very slow hit is worth something
  for (let ms = 0; ms < 1500; ms++) {
    assert.ok(Number.isInteger(speedPoints(ms)));
    assert.ok(speedPoints(ms) >= speedPoints(ms + 1));
  }

  assert.equal(hitPoints(142, 1), 858);
  assert.equal(hitPoints(142, 4), 858 + 3 * COMBO_BONUS);
  assert.equal(hitPoints(700, 0), 300); // a slow hit gets no combo bonus

  // Same inputs, same score.
  assert.equal(playAll(9, [180, 260, 410, 199]).score, playAll(9, [180, 260, 410, 199]).score);
});

test('6. the combo grows with every hit under 500 ms', () => {
  let game = createReflexGame(5);
  const combos = [];
  for (const ms of [150, 250, 320, 480]) {
    game = hitAfter(game, ms);
    combos.push(game.combo);
  }

  assert.deepEqual(combos, [1, 2, 3, 4]);
  assert.equal(game.bestCombo, 4);
  assert.equal(game.lastEvent.points, speedPoints(480) + 3 * COMBO_BONUS);
});

test('7. a slow hit or a missed target resets the combo', () => {
  assert.equal(comboAfterHit(3, 'great'), 4);
  assert.equal(comboAfterHit(3, 'slow'), 0);

  let game = playAll(5, [150, 150, 150]);
  assert.equal(game.combo, 3);

  game = hitAfter(game, 650); // slow
  assert.equal(game.lastEvent.grade, 'slow');
  assert.equal(game.combo, 0);
  assert.equal(game.bestCombo, 3); // the best combo is kept
  assert.equal(game.hits, 4);

  game = hitAfter(game, 150);
  assert.equal(game.combo, 1);

  // Let a target time out.
  const shown = showTarget(game);
  assert.equal(tick(shown, shown.target.shownAt + TARGET_TIMEOUT_MS - 1), shown);
  const missed = tick(shown, shown.target.shownAt + TARGET_TIMEOUT_MS);
  assert.equal(missed.lastEvent.type, 'timeout');
  assert.equal(missed.combo, 0);
  assert.equal(missed.misses, 1);
  assert.equal(missed.score, shown.score);
  assert.equal(missed.round, shown.round + 1);

  // A press that arrives after the timeout is the same miss, not a hit.
  const late = press(shown, { at: shown.target.shownAt + TARGET_TIMEOUT_MS + 40, onTarget: true });
  assert.equal(late.lastEvent.type, 'timeout');
  assert.equal(late.hits, shown.hits);
});

test('8. rounds go 1 → 10 and every target lands somewhere new', () => {
  let game = createReflexGame(77);
  const rounds = [];
  const spots = [];
  for (let i = 0; i < ROUNDS; i++) {
    rounds.push(game.round);
    game = showTarget(game);
    spots.push(game.target);
    assert.equal(game.target.round, i + 1);
    game = press(game, { at: game.target.shownAt + 250, onTarget: true });
  }

  assert.deepEqual(rounds, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (let i = 1; i < spots.length; i++) {
    const spread = Math.hypot(spots[i].x - spots[i - 1].x, spots[i].y - spots[i - 1].y);
    assert.ok(spread >= MIN_SPREAD, `target ${i + 1} is only ${spread.toFixed(2)} from the previous one`);
  }

  // The next pause starts after the hit, within the allowed range.
  const one = hitAfter(createReflexGame(12), 300);
  const gap = one.nextTargetAt - (one.reactions[0] + createReflexGame(12).nextTargetAt);
  assert.ok(gap >= MIN_DELAY_MS && gap <= MAX_DELAY_MS, String(gap));
});

test('9. the game ends after the last round, with stats, and stays over', () => {
  const times = [180, 220, 260, 300, 340, 380, 420, 460, 160, 200];
  const game = playAll(21, times);

  assert.equal(game.status, 'over');
  assert.equal(game.round, ROUNDS);
  assert.equal(game.hits, ROUNDS);
  assert.equal(game.score, times.reduce((sum, ms, i) => sum + hitPoints(ms, i + 1), 0));
  assert.equal(averageReaction(game), 292);
  assert.equal(bestReaction(game), 160);
  assert.equal(game.bestCombo, 10);

  // Nothing more can happen.
  assert.equal(tick(game, 999_999), game);
  const blocked = press(game, { at: 999_999, onTarget: true });
  assert.equal(blocked.lastEvent.type, 'blocked');
  assert.equal(blocked.score, game.score);

  // Misses count as rounds too.
  let missing = createReflexGame(4);
  for (let i = 0; i < ROUNDS; i++) {
    missing = showTarget(missing);
    missing = tick(missing, missing.target.shownAt + TARGET_TIMEOUT_MS);
  }
  assert.equal(missing.status, 'over');
  assert.equal(missing.misses, ROUNDS);
  assert.equal(missing.score, 0);
  assert.equal(averageReaction(missing), null);
});

test('10. best score, reaction and combo persist and only improve', () => {
  const backend = memory();

  assert.deepEqual(createReflexStorage(backend).getBest(), { score: 0, reaction: 0, combo: 0 });
  const first = createReflexStorage(backend).saveResult({ score: 8420, bestReaction: 168, bestCombo: 8 });
  assert.equal(first.isNewBest, true);
  assert.equal(first.isNewReaction, true);

  // A new storage object over the same data = the page was reloaded.
  assert.deepEqual(createReflexStorage(backend).getBest(), { score: 8420, reaction: 168, combo: 8 });

  const worse = createReflexStorage(backend).saveResult({ score: 5000, bestReaction: 150, bestCombo: 3 });
  assert.equal(worse.isNewBest, false);
  assert.equal(worse.isNewReaction, true); // a faster reaction is its own record
  assert.deepEqual(worse.best, { score: 8420, reaction: 150, combo: 8 });

  const noHits = createReflexStorage(backend).saveResult({ score: 0, bestReaction: null, bestCombo: 0 });
  assert.equal(noHits.isNewReaction, false);
  assert.deepEqual(noHits.best, { score: 8420, reaction: 150, combo: 8 });

  // Corrupted or tampered data falls back safely.
  for (const raw of ['not json', '{"score":"9999"}', '{"score":-5,"reaction":-1}', '{"reaction":1.5}', 'null', '42']) {
    const best = createReflexStorage(memory({ [REFLEX_STORAGE_KEY]: raw })).getBest();
    assert.ok(Object.values(best).every((v) => Number.isSafeInteger(v) && v >= 0), raw);
  }

  // No localStorage, or one that throws: still works, remembers nothing.
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
  for (const bad of [null, broken]) {
    const storage = createReflexStorage(bad);
    assert.deepEqual(storage.getBest(), { score: 0, reaction: 0, combo: 0 });
    assert.equal(storage.saveResult({ score: 10, bestReaction: 200, bestCombo: 1 }).isNewBest, true);
  }
});

test('11. false clicks are counted but never score or break the combo', () => {
  let game = playAll(8, [150, 150]);
  assert.equal(game.combo, 2);

  // Too early: before the target appears.
  const early = press(game, { at: game.nextTargetAt - 100, onTarget: true });
  assert.equal(early.lastEvent.type, 'false');
  assert.equal(early.lastEvent.early, true);
  assert.equal(early.status, 'waiting');
  assert.deepEqual([early.score, early.combo, early.hits, early.round], [game.score, game.combo, game.hits, game.round]);
  assert.equal(early.falseClicks, 1);

  // Off target: the target is up but the press missed it.
  const shown = showTarget(early);
  const off = press(shown, { at: shown.target.shownAt + 100, onTarget: false });
  assert.equal(off.lastEvent.type, 'false');
  assert.equal(off.lastEvent.early, false);
  assert.equal(off.status, 'target'); // the target stays up
  assert.equal(off.falseClicks, 2);
  assert.deepEqual([off.score, off.combo, off.hits], [game.score, game.combo, game.hits]);

  // And it can still be hit; the reaction counts from when it appeared.
  const hit = press(off, { at: shown.target.shownAt + 240, onTarget: true });
  assert.equal(hit.lastEvent.reaction, 240);
  assert.equal(hit.combo, 3);
});

test('12. play again starts a fresh game with nothing carried over', () => {
  const finished = playAll(30, [200, 200, 200, 200, 200, 200, 200, 200, 200, 200]);
  assert.equal(finished.status, 'over');

  const again = createReflexGame(31);
  assert.equal(again.status, 'waiting');
  assert.equal(again.round, 1);
  assert.deepEqual([again.score, again.combo, again.bestCombo, again.hits, again.misses, again.falseClicks], [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(again.reactions, []);
  assert.equal(again.target, null);
});
