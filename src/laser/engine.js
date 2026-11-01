// Laser Dodge: a state value and pure functions that move it forward.
//
//   createLaserGame(seed, { aspect })     → a fresh run with 3 lives
//   tick(state, { now, dir })             → the state after time passes (keys held: dir)
//   nudge(state, dx, dy)                  → the state after a touch/mouse drag
//
// Waves of lasers arrive on a schedule; each laser warns, charges, fires and
// goes. Touching a firing beam costs one life, then a second of safety. The
// score grows with survival time. `events` lists what each change did, for
// the UI.
//
// Time is always passed in (ms since GO!), never read from a clock here, so
// a run can be replayed and tested exactly.

import { ARENA_HEIGHT, FIRST_WAVE_MS, INVULNERABLE_MS, LIVES, MAX_ASPECT, MIN_ASPECT, NEAR_MISS_POINTS } from './config.js';
import { distanceToBeam, isNearMiss, touches } from './collision.js';
import { createWave, laserPhase } from './lasers.js';
import { clampToArena, moveBy, moveByKeys } from './movement.js';
import { phaseAt, streakFor, survivalPoints, waveEveryMs } from './scoring.js';
import { toSeed } from '../game/rng.js';

/**
 * @param {number} seed
 * @param {{ aspect?: number }} [options]  arena width ÷ height, fixed for the run
 * @returns {LaserState}
 */
export function createLaserGame(seed, { aspect = 1 } = {}) {
  const fit = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, Number.isFinite(aspect) ? aspect : 1));
  const arena = { width: Math.round(ARENA_HEIGHT * fit * 100) / 100, height: ARENA_HEIGHT };

  return Object.freeze({
    status: 'playing',
    seed: toSeed(seed),
    rng: toSeed(seed),
    arena,
    player: { x: arena.width / 2, y: arena.height / 2 },
    lives: LIVES,
    elapsedMs: 0,
    score: 0,
    lasers: [],
    nextId: 1,
    nextWaveAt: FIRST_WAVE_MS,
    waves: {}, // waves sent so far in each phase, by phase key
    invulnerableUntil: 0,
    lastHitAt: 0,
    streak: 1,
    bestStreak: 1,
    hits: 0,
    nearMisses: 0,
    events: [],
  });
}

/** True while the player is safe after a hit. */
export function isInvulnerable(state) {
  return state.elapsedMs < state.invulnerableUntil;
}

/** Touch / mouse drag: move the orb by (dx, dy) arena units. */
export function nudge(state, dx, dy) {
  if (state.status !== 'playing' || (dx === 0 && dy === 0)) {
    return state;
  }

  return Object.freeze({ ...state, player: moveBy(state.player, dx, dy, state.arena), events: [] });
}

/**
 * Let time pass: move with the keys held, add survival points, fire, end and
 * score lasers, take damage, and send the next wave when it is due.
 */
export function tick(state, { now, dir = { x: 0, y: 0 } }) {
  if (state.status !== 'playing') {
    return state;
  }

  const from = state.elapsedMs;
  const elapsedMs = Math.max(now, from);
  const events = [];
  let { lives, score, lastHitAt, invulnerableUntil, hits, nearMisses, rng, nextId, nextWaveAt, waves, bestStreak } = state;

  // Move, then score the time survived.
  const player = clampToArena(moveByKeys(state.player, dir, elapsedMs - from, state.arena), state.arena);
  score += survivalPoints(from, elapsedMs, lastHitAt);

  // Lasers: fire, touch, end.
  const lasers = [];
  for (const old of state.lasers) {
    const phase = laserPhase(old, elapsedMs);
    const laser = { ...old };

    if (phase === 'active') {
      if (laserPhase(old, from) !== 'active') {
        events.push({ type: 'fire', laser });
      }
      laser.minDistance = Math.min(laser.minDistance, distanceToBeam(player, laser, elapsedMs));
      if (!laser.touched && touches(player, laser, elapsedMs)) {
        laser.touched = true; // one laser can only ever hurt once
        if (elapsedMs >= invulnerableUntil && lives > 0) {
          lives -= 1;
          hits += 1;
          lastHitAt = elapsedMs;
          invulnerableUntil = elapsedMs + INVULNERABLE_MS;
          events.push({ type: 'hit', laser, lives, player });
        }
      }
    } else if (phase === 'charge' && laserPhase(old, from) === 'warning') {
      events.push({ type: 'charge', laser });
    }

    if (phase === 'done') {
      if (isNearMiss(laser) && lives > 0) {
        score += NEAR_MISS_POINTS;
        nearMisses += 1;
        events.push({ type: 'near', laser, player, points: NEAR_MISS_POINTS });
      }
      events.push({ type: 'gone', laser });
    } else {
      lasers.push(laser);
    }
  }

  // Survival streak.
  const streak = streakFor(elapsedMs - lastHitAt);
  if (streak > state.streak && lives === state.lives) {
    events.push({ type: 'streak', streak });
  }
  bestStreak = Math.max(bestStreak, streak);

  if (lives === 0) {
    return Object.freeze({
      ...state, status: 'over', elapsedMs, player, lives, score, lasers, lastHitAt, invulnerableUntil, hits, nearMisses, streak, bestStreak,
      events: [...events, { type: 'over' }],
    });
  }

  // The next wave, when due.
  if (elapsedMs >= nextWaveAt) {
    const phase = phaseAt(elapsedMs);
    const n = waves[phase.key] ?? 0;
    let wave;
    [wave, rng] = createWave(phase.waves[n % phase.waves.length], { rng, arena: state.arena, player, now: elapsedMs, phase, firstId: nextId });
    lasers.push(...wave);
    nextId += wave.length;
    waves = { ...waves, [phase.key]: n + 1 };
    nextWaveAt = Math.max(nextWaveAt + waveEveryMs(elapsedMs), elapsedMs + waveEveryMs(elapsedMs) / 2); // a hidden tab does not pile up waves
    events.push(...wave.map((laser) => ({ type: 'warning', laser })));
  }

  return Object.freeze({
    ...state, elapsedMs, player, lives, score, lasers, lastHitAt, invulnerableUntil, hits, nearMisses, rng, nextId, nextWaveAt, waves, streak, bestStreak, events,
  });
}

/**
 * @typedef {object} LaserState
 * @property {'playing'|'over'} status
 * @property {number} seed
 * @property {number} rng
 * @property {{ width: number, height: number }} arena   in arena units
 * @property {{ x: number, y: number }} player
 * @property {number} lives
 * @property {number} elapsedMs        survival time
 * @property {number} score
 * @property {object[]} lasers         see lasers.js
 * @property {number} nextId
 * @property {number} nextWaveAt
 * @property {Record<string, number>} waves   waves sent so far in each phase
 * @property {number} invulnerableUntil
 * @property {number} lastHitAt        0 = never hit (the streak counts from GO!)
 * @property {number} streak           survival streak, x1 … x8
 * @property {number} bestStreak
 * @property {number} hits
 * @property {number} nearMisses
 * @property {object[]} events         what the last change did (for the UI)
 */
