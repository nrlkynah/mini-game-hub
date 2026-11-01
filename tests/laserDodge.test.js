import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BEAM_HALF_WIDTH, CHARGE_MS, FIRST_WAVE_MS, INVULNERABLE_MS, LIVES, MAX_STREAK, MIN_GAP, NEAR_MISS_POINTS, PHASES, PLAYER_RADIUS, PLAYER_SPEED, STREAK_BONUS } from '../src/laser/config.js';
import { createLaserGame, isInvulnerable, nudge, tick } from '../src/laser/engine.js';
import { clampToArena, moveBy, moveByKeys } from '../src/laser/movement.js';
import { createWave, laserAngle, laserPhase, lineGap } from '../src/laser/lasers.js';
import { distanceToBeam, isNearMiss, touches } from '../src/laser/collision.js';
import { phaseAt, streakFor, survivalPoints, waveEveryMs } from '../src/laser/scoring.js';
import { createLaserStorage, LASER_STORAGE_KEY } from '../src/app/laserStorage.js';

const ARENA = { width: 100, height: 100 };

/** Run the clock in 16 ms frames (like the browser) up to `until`, keys held: dir. */
const runTo = (state, until, dir) => {
  let game = state;
  for (let t = game.elapsedMs + 16; t < until; t += 16) game = tick(game, { now: t, dir });
  return tick(game, { now: until, dir });
};

/** A hand-made laser, for collision tests. */
const beam = (over = {}) => ({
  id: 999, kind: 'h', x: 50, y: 50, angle: 0, halfWidth: BEAM_HALF_WIDTH,
  warnAt: 0, chargeAt: 1000, activeAt: 1300, endAt: 2000, touched: false, minDistance: Infinity, ...over,
});

/** A game with only the given lasers and no new waves for a while. */
const withLasers = (lasers, over = {}) => Object.freeze({ ...createLaserGame(1), lasers, nextWaveAt: 99_999, ...over });

/** An in-memory stand-in for localStorage. */
const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)) };
};

test('1. a new run: 3 lives, player in the middle, no lasers, nothing scored', () => {
  const game = createLaserGame(7);

  assert.equal(game.status, 'playing');
  assert.equal(game.lives, LIVES);
  assert.deepEqual(game.player, { x: 50, y: 50 });
  assert.deepEqual(game.lasers, []);
  assert.deepEqual([game.score, game.elapsedMs, game.hits, game.streak, game.bestStreak], [0, 0, 0, 1, 1]);
  assert.ok(Object.isFrozen(game));

  // The arena follows the screen shape, within limits.
  assert.deepEqual(createLaserGame(1, { aspect: 1.6 }).arena, { width: 160, height: 100 });
  assert.deepEqual(createLaserGame(1, { aspect: 9 }).arena, { width: 200, height: 100 });
  assert.deepEqual(createLaserGame(1, { aspect: NaN }).arena, { width: 100, height: 100 });
});

test('2. the keys move the player smoothly; diagonals are not faster', () => {
  const start = { x: 50, y: 50 };
  assert.deepEqual(moveByKeys(start, { x: 1, y: 0 }, 500, ARENA), { x: 50 + PLAYER_SPEED / 2, y: 50 });
  assert.deepEqual(moveByKeys(start, { x: 0, y: -1 }, 200, ARENA), { x: 50, y: 50 - PLAYER_SPEED * 0.2 });
  const diag = moveByKeys(start, { x: 1, y: 1 }, 200, ARENA);
  assert.ok(Math.abs(Math.hypot(diag.x - 50, diag.y - 50) - PLAYER_SPEED * 0.2) < 1e-9);
  assert.equal(moveByKeys(start, { x: 0, y: 0 }, 500, ARENA), start);

  // Through the engine: hold → for 400 ms.
  const moved = runTo(createLaserGame(3), 400, { x: 1, y: 0 });
  assert.ok(Math.abs(moved.player.x - (50 + PLAYER_SPEED * 0.4)) < 1e-9);

  // Touch/mouse drag moves by the same distance.
  assert.deepEqual(moveBy(start, -12, 7, ARENA), { x: 38, y: 57 });
  assert.deepEqual(nudge(createLaserGame(3), 10, -5).player, { x: 60, y: 45 });
});

test('3. the player can never leave the arena', () => {
  assert.deepEqual(clampToArena({ x: -50, y: 500 }, ARENA), { x: PLAYER_RADIUS, y: 100 - PLAYER_RADIUS });
  assert.deepEqual(moveBy({ x: 5, y: 5 }, -100, -100, ARENA), { x: PLAYER_RADIUS, y: PLAYER_RADIUS });

  const far = runTo(createLaserGame(4), 5000, { x: -1, y: 1 });
  assert.deepEqual(far.player, { x: PLAYER_RADIUS, y: 100 - PLAYER_RADIUS });
  assert.deepEqual(nudge(createLaserGame(4, { aspect: 1.5 }), 999, 0).player.x, 150 - PLAYER_RADIUS);
});

test('4. waves arrive on schedule, each laser starting with a warning', () => {
  const game = createLaserGame(5);
  assert.equal(tick(game, { now: FIRST_WAVE_MS - 1 }).lasers.length, 0);

  const first = tick(game, { now: FIRST_WAVE_MS });
  assert.equal(first.lasers.length, 1);
  assert.equal(first.events[0].type, 'warning');
  assert.equal(laserPhase(first.lasers[0], FIRST_WAVE_MS), 'warning');
  assert.equal(first.nextWaveAt, FIRST_WAVE_MS + PHASES[0].everyMs);

  // Same seed, same run.
  assert.deepEqual(runTo(createLaserGame(11), 9000), runTo(createLaserGame(11), 9000));
});

test('5. warnings and charging never hurt, and give time to react', () => {
  const laser = beam();
  assert.equal(laserPhase(laser, 0), 'warning');
  assert.equal(laserPhase(laser, 999), 'warning');
  assert.equal(laserPhase(laser, 1000), 'charge');
  assert.equal(laserPhase(laser, 1299), 'charge');
  assert.equal(touches({ x: 50, y: 50 }, laser, 500), false);
  assert.equal(touches({ x: 50, y: 50 }, laser, 1200), false);

  // Every phase leaves at least ~1 s between the warning and the beam firing.
  for (const phase of PHASES) assert.ok(phase.warnMs + CHARGE_MS >= 1000, phase.key);
  const wave = runTo(createLaserGame(6), FIRST_WAVE_MS).lasers[0];
  assert.equal(wave.activeAt - wave.warnAt, PHASES[0].warnMs + CHARGE_MS);
});

test('6. a laser fires (active), then disappears', () => {
  const laser = beam();
  assert.equal(laserPhase(laser, 1300), 'active');
  assert.equal(laserPhase(laser, 1999), 'active');
  assert.equal(laserPhase(laser, 2000), 'done');

  let game = withLasers([beam({ y: 10 })]);
  game = runTo(game, 1300);
  assert.ok(game.events.some((e) => e.type === 'fire'));
  game = runTo(game, 2000);
  assert.ok(game.events.some((e) => e.type === 'gone'));
  assert.equal(game.lasers.length, 0);
});

test('7. four patterns: horizontal, vertical, diagonal and sweeping, with a gap between parallel beams', () => {
  const phase = PHASES[3];
  const ctx = { rng: 42, arena: ARENA, player: { x: 50, y: 50 }, now: 0, phase, firstId: 1 };

  const [[h]] = createWave(['h'], ctx);
  const [[v]] = createWave(['v'], ctx);
  const [[d]] = createWave(['d'], ctx);
  const [[s]] = createWave(['sweep'], ctx);
  assert.equal(h.angle, 0);
  assert.equal(v.angle, Math.PI / 2);
  assert.ok([Math.PI / 4, (3 * Math.PI) / 4].includes(d.angle));
  assert.ok(Math.abs(Math.abs(s.angleTo - s.angle) - Math.PI / 3) < 1e-9); // turns 60°
  assert.ok([0, 100].includes(s.x) && [0, 100].includes(s.y)); // from a corner
  assert.equal(laserAngle(s, s.activeAt - 1), s.angle);
  assert.ok(Math.abs(laserAngle(s, s.endAt) - s.angleTo) < 1e-9);

  // The first beam is aimed near the player, so standing still is never safe.
  assert.ok(Math.abs(h.y - 50) <= 18 && Math.abs(v.x - 50) <= 18);

  // Two beams the same way in one wave leave room between them.
  for (let seed = 1; seed < 60; seed++) {
    const [[a, b]] = createWave(['v', 'v'], { ...ctx, rng: seed });
    assert.ok(lineGap(a, b) >= MIN_GAP, `seed ${seed}: gap ${lineGap(a, b).toFixed(1)}`);
  }

  // Patterns unlock with difficulty: no diagonal or sweep in EASY.
  assert.deepEqual([...new Set(PHASES[0].waves.flat())].sort(), ['h', 'v']);
  assert.ok(PHASES[2].waves.flat().includes('sweep'));
});

test('8. collision: only touching a firing beam counts', () => {
  const laser = beam();
  const reach = BEAM_HALF_WIDTH + PLAYER_RADIUS;

  assert.equal(distanceToBeam({ x: 10, y: 54 }, laser, 1500), 4);
  assert.equal(touches({ x: 30, y: 50 + reach }, laser, 1500), true);
  assert.equal(touches({ x: 30, y: 50 + reach + 0.01 }, laser, 1500), false);
  assert.equal(touches({ x: 50, y: 50 }, beam({ kind: 'v', angle: Math.PI / 2 }), 1500), true);
  assert.equal(touches({ x: 50 + reach + 1, y: 50 }, beam({ kind: 'v', angle: Math.PI / 2 }), 1500), false);

  const diagonal = beam({ x: 0, y: 0, angle: Math.PI / 4 });
  assert.equal(touches({ x: 40, y: 40 }, diagonal, 1500), true);
  assert.equal(touches({ x: 40, y: 60 }, diagonal, 1500), false);
});

test('9. one collision costs exactly one life', () => {
  let game = withLasers([beam()]);
  game = runTo(game, 1300);

  assert.equal(game.lives, LIVES - 1);
  assert.equal(game.hits, 1);
  assert.equal(game.events.filter((e) => e.type === 'hit').length, 1);

  // Standing in the same beam until it ends: still only one life lost.
  game = runTo(game, 2100);
  assert.equal(game.lives, LIVES - 1);
});

test('10. after a hit, a second of safety blocks more damage', () => {
  const lasers = [beam({ id: 1 }), beam({ id: 2, activeAt: 1800, endAt: 2400 }), beam({ id: 3, activeAt: 2400, endAt: 3000 })];
  let game = withLasers(lasers);

  game = runTo(game, 1300);
  assert.equal(game.lives, 2);
  assert.ok(isInvulnerable(game));
  assert.equal(game.invulnerableUntil, 1300 + INVULNERABLE_MS);

  game = runTo(game, 1900); // laser 2 fires while safe: no damage, and it can't hurt later
  assert.equal(game.lives, 2);

  game = runTo(game, 2400); // laser 3 fires after the safety ended
  assert.equal(game.lives, 1);
});

test('11. score: points for every 100 ms survived, more in harder phases, plus near misses', () => {
  assert.equal(survivalPoints(0, 1000, 0), 100); // EASY: 10 per 100 ms
  assert.equal(survivalPoints(0, 99, 0), 0);
  assert.equal(survivalPoints(10_000, 11_000, 10_000), 150); // MEDIUM, streak x1
  assert.equal(survivalPoints(30_000, 31_000, 30_000), 300); // EXTREME
  assert.equal(survivalPoints(5000, 6000, 0), 100 + 10 * STREAK_BONUS); // streak x2 adds 5 each time
  // The same no matter how the time is cut into frames.
  assert.equal(survivalPoints(0, 777, 0) + survivalPoints(777, 4321, 0), survivalPoints(0, 4321, 0));

  // A near miss: a beam that passes close without touching.
  const close = withLasers([beam({ y: 50 + BEAM_HALF_WIDTH + PLAYER_RADIUS + 2 })]);
  const after = runTo(close, 2000);
  assert.ok(isNearMiss({ ...after.events.find((e) => e.type === 'near').laser }));
  assert.equal(after.nearMisses, 1);
  assert.equal(after.score, survivalPoints(0, 2000, 0) + NEAR_MISS_POINTS);

  // Far away is not a near miss.
  const far = runTo(withLasers([beam({ y: 10 })]), 2000);
  assert.equal(far.nearMisses, 0);
});

test('12. survival time counts up with the clock and stops at game over', () => {
  const game = runTo(withLasers([]), 18_400);
  assert.equal(game.elapsedMs, 18_400);
  assert.equal(tick(game, { now: 100 }).elapsedMs, 18_400); // never backwards

  let doomed = withLasers([beam({ id: 1 }), beam({ id: 2, activeAt: 2500, endAt: 3000 }), beam({ id: 3, activeAt: 3700, endAt: 4200 })]);
  doomed = runTo(doomed, 3700);
  assert.equal(doomed.status, 'over');
  assert.equal(doomed.elapsedMs, 3700);
  assert.equal(tick(doomed, { now: 9000 }), doomed);
});

test('13. difficulty rises EASY → MEDIUM → HARD → EXTREME, gradually', () => {
  assert.deepEqual([0, 9999, 10_000, 20_000, 30_000, 99_000].map((t) => phaseAt(t).key), ['easy', 'easy', 'medium', 'hard', 'extreme', 'extreme']);
  for (let i = 1; i < PHASES.length; i++) {
    const [a, b] = [PHASES[i - 1], PHASES[i]];
    assert.ok(b.everyMs < a.everyMs && a.everyMs - b.everyMs <= 200, 'waves a little sooner');
    assert.ok(b.warnMs < a.warnMs && a.warnMs - b.warnMs <= 100, 'warnings a little shorter');
    assert.ok(Math.max(...b.waves.map((w) => w.length)) >= Math.max(...a.waves.map((w) => w.length)), 'never fewer lasers per wave');
  }
  // EXTREME keeps tightening slowly, with a floor.
  assert.equal(waveEveryMs(30_000), 1000);
  assert.equal(waveEveryMs(35_000), 975);
  assert.equal(waveEveryMs(600_000), 750);
});

test('14. the survival streak grows every 5 s without a hit, up to x8', () => {
  assert.deepEqual([0, 4999, 5000, 10_000, 34_999, 999_999].map(streakFor), [1, 1, 2, 3, 7, MAX_STREAK]);

  const game = runTo(withLasers([]), 15_000);
  assert.equal(game.streak, 4);
  assert.equal(game.bestStreak, 4);
});

test('15. a hit resets the survival streak (the best is kept)', () => {
  let game = runTo(withLasers([]), 12_000);
  assert.equal(game.streak, 3);

  game = Object.freeze({ ...game, lasers: [beam({ warnAt: 12_000, chargeAt: 12_100, activeAt: 12_200, endAt: 12_800 })] });
  game = runTo(game, 12_200);
  assert.equal(game.streak, 1);
  assert.equal(game.bestStreak, 3);
  assert.equal(game.lastHitAt, 12_200);
  assert.equal(runTo(game, 17_200).streak, 2);
});

test('16. the run ends when the last life is lost, and stays over', () => {
  let game = withLasers([beam({ id: 1 }), beam({ id: 2, activeAt: 2500, endAt: 3000 }), beam({ id: 3, activeAt: 3700, endAt: 4200 })]);
  game = runTo(game, 2500);
  assert.equal(game.lives, 1);
  game = runTo(game, 3700);

  assert.equal(game.lives, 0);
  assert.equal(game.status, 'over');
  assert.ok(game.events.some((e) => e.type === 'over'));
  assert.equal(nudge(game, 10, 10), game);
  assert.equal(tick(game, { now: 99_999 }), game);
});

test('17. play again starts a fresh run with nothing carried over', () => {
  let old = withLasers([beam({ id: 1 }), beam({ id: 2, activeAt: 2500, endAt: 3000 }), beam({ id: 3, activeAt: 3700, endAt: 4200 })]);
  old = runTo(old, 3700);
  assert.equal(old.status, 'over');

  const fresh = createLaserGame(2);
  assert.equal(fresh.status, 'playing');
  assert.deepEqual([fresh.lives, fresh.score, fresh.elapsedMs, fresh.hits, fresh.streak, fresh.bestStreak, fresh.lasers.length], [LIVES, 0, 0, 0, 1, 1, 0]);
});

test('18. best score, time and streak persist and only improve', () => {
  const backend = memory();

  assert.deepEqual(createLaserStorage(backend).getBest(), { score: 0, timeMs: 0, streak: 0 });
  const first = createLaserStorage(backend).saveResult({ score: 8420, elapsedMs: 34_812.6, bestStreak: 7 });
  assert.equal(first.isNewBest, true);
  assert.equal(first.isNewTime, true);

  // A new storage object over the same data = the page was reloaded.
  assert.deepEqual(createLaserStorage(backend).getBest(), { score: 8420, timeMs: 34_813, streak: 7 });

  const lower = createLaserStorage(backend).saveResult({ score: 5000, elapsedMs: 40_000, bestStreak: 2 });
  assert.equal(lower.isNewBest, false);
  assert.equal(lower.isNewTime, true);
  assert.deepEqual(lower.best, { score: 8420, timeMs: 40_000, streak: 7 });

  for (const raw of ['not json', '{"score":"9"}', '{"score":-5,"timeMs":1.5}', 'null', '[]']) {
    const best = createLaserStorage(memory({ [LASER_STORAGE_KEY]: raw })).getBest();
    assert.ok(Object.values(best).every((v) => Number.isSafeInteger(v) && v >= 0), raw);
  }
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
  for (const bad of [null, broken]) {
    const storage = createLaserStorage(bad);
    assert.deepEqual(storage.getBest(), { score: 0, timeMs: 0, streak: 0 });
    assert.equal(storage.saveResult({ score: 10, elapsedMs: 1000, bestStreak: 1 }).isNewBest, true);
  }
});
