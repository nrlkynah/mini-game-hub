import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DURATION_MS, FIRST_SPAWN_MS, MIN_SPREAD, PHASES } from '../src/space/config.js';
import { accuracy, createSpaceGame, secondsLeft, tap, tick } from '../src/space/engine.js';
import { accuracyPercent, hitPoints, multiplierLabel, multiplierTenths } from '../src/space/scoring.js';
import { freeSlot, kindFor, phaseAt, pickSpot } from '../src/space/targets.js';
import { createSpaceStorage, SPACE_STORAGE_KEY } from '../src/app/spaceStorage.js';

/** Run the clock forward in 16 ms frames (like the browser does) up to `until`. */
const runTo = (state, until, from = state.elapsedMs) => {
  let game = state;
  for (let t = from; t <= until; t += 16) game = tick(game, t);
  return tick(game, until);
};

/** Advance until a target of one of `kinds` is live; returns [state, target]. */
const waitFor = (state, kinds = ['star', 'planet', 'comet']) => {
  let game = state;
  for (let t = game.elapsedMs; t < DURATION_MS; t += 16) {
    game = tick(game, t);
    const found = game.targets.find((x) => kinds.includes(x.kind));
    if (found) return [game, found];
  }
  throw new Error(`no ${kinds} target appeared`);
};

/** Hit the next real target 200 ms after it appears. */
const hitNext = (state) => {
  const [game, target] = waitFor(state);
  return tap(game, { at: Math.max(game.elapsedMs, target.bornAt + 200), targetId: target.id });
};

/** An in-memory stand-in for localStorage. */
const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)) };
};

test('1. a new run starts at 30 s with nothing scored, no targets and 100% accuracy', () => {
  const game = createSpaceGame(7);

  assert.equal(game.status, 'playing');
  assert.equal(secondsLeft(game), 30);
  assert.deepEqual(game.targets, []);
  assert.deepEqual([game.score, game.combo, game.bestCombo, game.hits, game.taps, game.missed], [0, 0, 0, 0, 0, 0]);
  assert.equal(accuracy(game), 100);
  assert.ok(Object.isFrozen(game));
});

test('2. targets spawn on schedule, up to the phase limit, with the right kinds', () => {
  let game = tick(createSpaceGame(3), FIRST_SPAWN_MS - 1);
  assert.equal(game.targets.length, 0);

  game = tick(game, FIRST_SPAWN_MS);
  assert.equal(game.targets.length, 1);
  assert.equal(game.events[0].type, 'spawn');
  assert.ok(['star', 'planet'].includes(game.targets[0].kind)); // the first target is never a decoy
  assert.equal(game.targets[0].expiresAt - game.targets[0].bornAt, PHASES[0].lifeMs);

  // Kinds follow a fixed rhythm, not luck: every 7th target in the easy phase is a mine, every 6th a comet.
  const easy = PHASES[0];
  assert.equal(kindFor(7, easy, 1)[0], 'mine');
  assert.equal(kindFor(14, easy, 1)[0], 'mine');
  assert.equal(kindFor(6, easy, 1)[0], 'comet');
  assert.ok(['star', 'planet'].includes(kindFor(1, easy, 1)[0]));

  // Even a player who taps everything at once still meets the mines.
  let fast = createSpaceGame(3);
  const kinds = [];
  for (let t = 0; t < 10_000; t += 16) {
    fast = tick(fast, t);
    for (const e of fast.events) if (e.type === 'spawn') kinds.push(e.target.kind);
    for (const target of fast.targets.filter((x) => x.kind !== 'mine')) fast = tap(fast, { at: t, targetId: target.id });
  }
  assert.equal(kinds[6], 'mine');
  assert.equal(kinds[5], 'comet');

  // Never more targets than the phase allows; every spawn gets a free keyboard slot 1–4.
  for (let t = 0; t < DURATION_MS; t += 16) {
    game = tick(game, t);
    assert.ok(game.targets.length <= phaseAt(t).maxTargets);
    assert.equal(new Set(game.targets.map((x) => x.slot)).size, game.targets.length);
    assert.ok(game.targets.every((x) => x.slot >= 1 && x.slot <= 4));
  }
  assert.equal(freeSlot([{ slot: 1 }, { slot: 3 }]), 2);

  // Same seed, same run.
  assert.deepEqual(runTo(createSpaceGame(11), 9000), runTo(createSpaceGame(11), 9000));
});

test('3. target positions are inside the arena and never on top of each other', () => {
  let game = createSpaceGame(21);
  for (let t = 0; t < DURATION_MS; t += 16) {
    game = tick(game, t);
    for (const a of game.targets) {
      assert.ok(a.x >= 0 && a.x < 1 && a.y >= 0 && a.y < 1);
      for (const b of game.targets) {
        if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= MIN_SPREAD);
      }
    }
  }

  // A crowded arena gives no spot rather than an overlapping one.
  const crowded = [];
  for (let x = 0; x <= 1; x += 0.2) for (let y = 0; y <= 1; y += 0.2) crowded.push({ x, y });
  assert.equal(pickSpot(5, crowded)[0], null);
});

test('4. hitting a star or planet scores 100 × the combo multiplier', () => {
  const [game, target] = waitFor(createSpaceGame(4), ['star', 'planet']);
  const hit = tap(game, { at: game.elapsedMs + 100, targetId: target.id });

  assert.equal(hit.events.at(-1).type, 'hit');
  assert.equal(hit.events.at(-1).points, 100);
  assert.equal(hit.score, 100);
  assert.equal(hit.hits, 1);
  assert.equal(hit.taps, 1);
  assert.ok(!hit.targets.some((t) => t.id === target.id)); // the target is gone
  assert.equal(game.score, 0); // the old state is unchanged
});

test('5. a comet is the bonus: 250 points, rarer in later phases', () => {
  assert.equal(hitPoints('comet', 1), 250);
  assert.equal(hitPoints('comet', 3), 350);
  assert.equal(hitPoints('comet', 9), 500);

  const [game, comet] = waitFor(createSpaceGame(4), ['comet']);
  const hit = tap(game, { at: game.elapsedMs + 50, targetId: comet.id });
  assert.equal(hit.events.at(-1).bonus, true);
  assert.equal(hit.events.at(-1).points, hitPoints('comet', hit.combo));

  const [easy, medium, hard] = PHASES;
  assert.ok(easy.bonusEvery < medium.bonusEvery && medium.bonusEvery < hard.bonusEvery);
});

test('6. tapping a mine is a MISS: no points, combo reset, accuracy down', () => {
  let game = hitNext(hitNext(createSpaceGame(9)));
  assert.equal(game.combo, 2);

  const [ready, mine] = waitFor(game, ['mine']);
  const missed = tap(ready, { at: ready.elapsedMs + 50, targetId: mine.id });

  assert.equal(missed.events.at(-1).type, 'decoy');
  assert.equal(missed.score, ready.score);
  assert.equal(missed.combo, 0);
  assert.equal(missed.decoysHit, 1);
  assert.equal(missed.taps, ready.taps + 1);
  assert.equal(missed.hits, ready.hits);
  assert.ok(accuracy(missed) < 100);
  assert.ok(!missed.targets.some((t) => t.id === mine.id));

  // A mine left alone just disappears: no penalty.
  const [again, mine2] = waitFor(missed, ['mine']);
  const before = runTo(again, mine2.expiresAt - 1);
  const gone = tick(before, mine2.expiresAt);
  assert.ok(gone.events.some((e) => e.type === 'vanish' && e.target.id === mine2.id));
  assert.ok(!gone.events.some((e) => e.type === 'expire' && e.target.id === mine2.id));
  assert.equal(gone.decoysHit, before.decoysHit);
});

test('7. every hit in a row raises the combo', () => {
  let game = createSpaceGame(12);
  const combos = [];
  for (let i = 0; i < 6; i++) {
    game = hitNext(game);
    combos.push(game.combo);
  }

  assert.deepEqual(combos, [1, 2, 3, 4, 5, 6]);
  assert.equal(game.bestCombo, 6);
});

test('8. a mine or a missed target resets the combo; an empty tap keeps it', () => {
  let game = hitNext(hitNext(hitNext(createSpaceGame(13))));
  assert.equal(game.combo, 3);

  const empty = tap(game, { at: game.elapsedMs + 10, targetId: null });
  assert.equal(empty.events.at(-1).type, 'empty');
  assert.equal(empty.combo, 3); // a tap just off target is not punished hard …
  assert.equal(empty.taps, game.taps + 1); // … but it does count against accuracy
  assert.equal(empty.score, game.score);

  const [ready, target] = waitFor(empty);
  const expired = runTo(ready, target.expiresAt);
  assert.ok(expired.events.some((e) => e.type === 'expire' && e.target.id === target.id));
  assert.equal(expired.combo, 0);
  assert.equal(expired.bestCombo, 3);
});

test('9. the multiplier is fixed: x1 1.0, x2 1.2, x3 1.4, x4 1.6, x5+ 2.0', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 12, 50].map(multiplierTenths), [10, 10, 12, 14, 16, 20, 20, 20, 20]);
  assert.deepEqual([1, 2, 3, 4, 5].map(multiplierLabel), ['1.0', '1.2', '1.4', '1.6', '2.0']);
  assert.deepEqual([1, 2, 3, 4, 5, 8].map((c) => hitPoints('star', c)), [100, 120, 140, 160, 200, 200]);
  for (let combo = 0; combo < 30; combo++) {
    assert.ok(Number.isInteger(hitPoints('planet', combo)));
    assert.ok(Number.isInteger(hitPoints('comet', combo)));
  }
});

test('10. accuracy is hits / taps, 100% with no taps, never NaN or Infinity', () => {
  assert.equal(accuracyPercent(0, 0), 100);
  assert.equal(accuracyPercent(47, 50), 94);
  assert.equal(accuracyPercent(1, 3), 33);
  assert.equal(accuracyPercent(5, 0), 100);
  for (const [hits, taps] of [[NaN, NaN], [0, undefined], [3, -1], [Infinity, Infinity]]) {
    assert.ok(Number.isFinite(accuracyPercent(hits, taps)), `${hits}/${taps}`);
  }

  let game = hitNext(hitNext(createSpaceGame(14)));
  game = tap(game, { at: game.elapsedMs + 5, targetId: null });
  assert.equal(accuracy(game), 67); // 2 of 3
});

test('11. a real target left too long expires as TOO SLOW', () => {
  const [game, target] = waitFor(createSpaceGame(15));
  const before = runTo(game, target.expiresAt - 1);
  assert.ok(before.targets.some((t) => t.id === target.id));

  const after = tick(before, target.expiresAt);
  assert.ok(!after.targets.some((t) => t.id === target.id));
  assert.equal(after.missed, before.missed + 1);
  assert.equal(after.taps, before.taps); // expiring is not a tap

  // Tapping it after it expired is an empty tap, not a hit.
  const late = tap(before, { at: target.expiresAt + 30, targetId: target.id });
  assert.equal(late.events.at(-1).type, 'empty');
  assert.equal(late.hits, 0);
});

test('12. difficulty rises every 10 seconds', () => {
  assert.deepEqual([0, 9_999, 10_000, 19_999, 20_000, 29_999].map((t) => phaseAt(t).key), ['easy', 'easy', 'medium', 'medium', 'hard', 'hard']);
  for (let i = 1; i < PHASES.length; i++) {
    assert.ok(PHASES[i].spawnEveryMs < PHASES[i - 1].spawnEveryMs, 'faster spawns');
    assert.ok(PHASES[i].lifeMs < PHASES[i - 1].lifeMs, 'shorter lives');
    assert.ok(PHASES[i].decoyEvery < PHASES[i - 1].decoyEvery, 'more mines');
    assert.ok(PHASES[i].bonusEvery > PHASES[i - 1].bonusEvery, 'fewer comets');
    assert.ok(PHASES[i].lifeMs >= 1000, 'still playable on a phone');
  }

  // Targets spawned in the hard phase really live shorter.
  const late = runTo(createSpaceGame(16), 21_000);
  const t = late.targets.find((x) => x.bornAt >= 20_000);
  assert.equal(t.expiresAt - t.bornAt, PHASES[2].lifeMs);
});

test('13. the timer counts 30 … 0 and never runs backwards', () => {
  let game = createSpaceGame(17);
  const shown = [];
  for (let ms = 0; ms <= DURATION_MS; ms += 1000) {
    game = runTo(game, ms);
    shown.push(secondsLeft(game));
  }
  assert.deepEqual(shown, Array.from({ length: 31 }, (_, i) => 30 - i));

  const mid = runTo(createSpaceGame(17), 5000);
  assert.equal(tick(mid, 100).elapsedMs, 5000);
});

test('14. at 30 s the run is over, the arena clears, and taps are blocked', () => {
  let game = createSpaceGame(18);
  game = hitNext(hitNext(game));
  const over = runTo(game, DURATION_MS + 3000);

  assert.equal(over.status, 'over');
  assert.equal(over.elapsedMs, DURATION_MS);
  assert.equal(secondsLeft(over), 0);
  assert.deepEqual(over.targets, []);
  assert.equal(over.score, game.score);
  assert.ok(over.events.some((e) => e.type === 'over'));

  const blocked = tap(over, { at: DURATION_MS + 10, targetId: 1 });
  assert.equal(blocked.events.at(-1).type, 'blocked');
  assert.equal(blocked.taps, over.taps);
  assert.equal(tick(over, 99_999), over);
});

test('15. play again starts a fresh run with nothing carried over', () => {
  const old = runTo(hitNext(createSpaceGame(19)), DURATION_MS);
  assert.equal(old.status, 'over');

  const fresh = createSpaceGame(20);
  assert.equal(fresh.status, 'playing');
  assert.equal(secondsLeft(fresh), 30);
  assert.deepEqual([fresh.score, fresh.combo, fresh.bestCombo, fresh.hits, fresh.taps, fresh.missed, fresh.decoysHit], [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(fresh.targets, []);
  assert.equal(accuracy(fresh), 100);
});

test('16. best score, combo and accuracy persist and only improve', () => {
  const backend = memory();

  assert.deepEqual(createSpaceStorage(backend).getBest(), { score: 0, combo: 0, accuracy: 0 });
  const first = createSpaceStorage(backend).saveResult({ score: 8420, bestCombo: 12, accuracy: 94, hits: 74 });
  assert.equal(first.isNewBest, true);

  // A new storage object over the same data = the page was reloaded.
  assert.deepEqual(createSpaceStorage(backend).getBest(), { score: 8420, combo: 12, accuracy: 94 });

  const lower = createSpaceStorage(backend).saveResult({ score: 5000, bestCombo: 4, accuracy: 98, hits: 40 });
  assert.equal(lower.isNewBest, false);
  assert.deepEqual(lower.best, { score: 8420, combo: 12, accuracy: 98 });

  // An idle run (no hits) can't claim a best accuracy.
  const idle = createSpaceStorage(memory()).saveResult({ score: 0, bestCombo: 0, accuracy: 100, hits: 0 });
  assert.deepEqual(idle, { isNewBest: false, best: { score: 0, combo: 0, accuracy: 0 } });

  for (const raw of ['not json', '{"score":"9"}', '{"score":-5,"accuracy":250}', 'null', '[]']) {
    const best = createSpaceStorage(memory({ [SPACE_STORAGE_KEY]: raw })).getBest();
    assert.ok(Object.values(best).every((v) => Number.isSafeInteger(v) && v >= 0), raw);
    assert.ok(best.accuracy <= 100, raw);
  }

  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
  for (const bad of [null, broken]) {
    const storage = createSpaceStorage(bad);
    assert.deepEqual(storage.getBest(), { score: 0, combo: 0, accuracy: 0 });
    assert.equal(storage.saveResult({ score: 10, bestCombo: 1, accuracy: 100, hits: 1 }).isNewBest, true);
  }
});
