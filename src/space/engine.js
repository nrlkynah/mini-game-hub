// Space Tap: a state value and two pure functions that move it forward.
//
//   createSpaceGame(seed)               → a fresh 30-second run
//   tick(state, now)                    → the state after time passes
//   tap(state, { at, targetId })        → the state after the player taps
//
// Targets spawn on a schedule, live for a while, then expire. Tap stars,
// planets and comets; never mines. `events` lists what each change did, for
// the UI.
//
// Time is always passed in (ms since GO!), never read from a clock here, so
// a run can be replayed and tested exactly.

import { DURATION_MS, FIRST_SPAWN_MS, KINDS } from './config.js';
import { accuracyPercent, hitPoints } from './scoring.js';
import { freeSlot, kindFor, phaseAt, pickSpot } from './targets.js';
import { toSeed } from '../game/rng.js';

/**
 * @param {number} seed
 * @returns {SpaceState}
 */
export function createSpaceGame(seed) {
  return Object.freeze({
    status: 'playing',
    seed: toSeed(seed),
    rng: toSeed(seed),
    elapsedMs: 0,
    targets: [],
    nextId: 1,
    nextSpawnAt: FIRST_SPAWN_MS,
    spawned: {}, // targets spawned per phase, by phase key
    score: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    taps: 0,
    missed: 0,
    decoysHit: 0,
    events: [],
  });
}

/** Remaining time in ms (never below 0). */
export function remainingMs(state) {
  return Math.max(0, DURATION_MS - state.elapsedMs);
}

/** Whole seconds shown on the timer: 30 at the start, exactly 0 at the end. */
export function secondsLeft(state) {
  return Math.ceil(remainingMs(state) / 1000);
}

/** Successful taps as a percentage of all taps (100 with no taps). */
export function accuracy(state) {
  return accuracyPercent(state.hits, state.taps);
}

/**
 * Let time pass: targets past their life expire (a missed star, planet or
 * comet resets the combo; a mine left alone is fine), the next target spawns
 * when it is due, and at 30 s the run is over.
 */
export function tick(state, now) {
  if (state.status !== 'playing') {
    return state;
  }

  const elapsedMs = Math.min(Math.max(now, state.elapsedMs), DURATION_MS);
  const events = [];
  let { targets, combo, missed, rng, nextId, nextSpawnAt, spawned } = state;

  // Expire.
  const alive = [];
  for (const target of targets) {
    if (target.expiresAt > elapsedMs) {
      alive.push(target);
    } else if (KINDS[target.kind].decoy) {
      events.push({ type: 'vanish', target });
    } else {
      combo = 0;
      missed += 1;
      events.push({ type: 'expire', target });
    }
  }
  targets = alive;

  // Over.
  if (elapsedMs >= DURATION_MS) {
    events.push(...targets.map((target) => ({ type: 'vanish', target })));

    return Object.freeze({ ...state, status: 'over', elapsedMs, targets: [], combo, missed, events: [...events, { type: 'over' }] });
  }

  // Spawn one target when due (a long pause, like a hidden tab, does not pile up spawns).
  const phase = phaseAt(elapsedMs);
  if (elapsedMs >= nextSpawnAt) {
    if (targets.length < phase.maxTargets) {
      let spot;
      [spot, rng] = pickSpot(rng, targets);
      if (spot) {
        const n = (spawned[phase.key] ?? 0) + 1;
        let kind;
        [kind, rng] = kindFor(n, phase, rng);
        const target = { id: nextId, kind, ...spot, slot: freeSlot(targets), bornAt: elapsedMs, expiresAt: elapsedMs + phase.lifeMs };
        targets = [...targets, target];
        nextId += 1;
        spawned = { ...spawned, [phase.key]: n };
        events.push({ type: 'spawn', target });
        nextSpawnAt = Math.max(nextSpawnAt + phase.spawnEveryMs, elapsedMs + phase.spawnEveryMs / 2);
      } else {
        nextSpawnAt = elapsedMs + 100; // no free spot right now: try again shortly
      }
    } else {
      nextSpawnAt = elapsedMs + 100; // the arena is full: wait for a free place
    }
  }

  if (events.length === 0 && elapsedMs === state.elapsedMs) {
    return state;
  }

  return Object.freeze({ ...state, elapsedMs, targets, combo, missed, rng, nextId, nextSpawnAt, spawned, events });
}

/**
 * The player taps at time `at`, on the target with `targetId` (or on empty
 * space, with targetId null).
 *
 * - A star, planet or comet: a hit. Points × combo multiplier, combo +1.
 * - A mine: MISS. No points, combo reset, counts against accuracy.
 * - Empty space (or a target that just expired): counts against accuracy
 *   only; the combo is kept, so a slightly-off tap is not punished hard.
 * - After the run: blocked, nothing changes.
 */
export function tap(state, { at, targetId = null }) {
  const timed = tick(state, at);
  if (timed.status !== 'playing') {
    return Object.freeze({ ...timed, events: [...timed.events, { type: 'blocked' }] });
  }

  const before = timed.events;
  const taps = timed.taps + 1;
  const target = timed.targets.find((t) => t.id === targetId);

  if (!target) {
    return Object.freeze({ ...timed, taps, events: [...before, { type: 'empty' }] });
  }

  const targets = timed.targets.filter((t) => t !== target);

  if (KINDS[target.kind].decoy) {
    return Object.freeze({ ...timed, targets, taps, combo: 0, decoysHit: timed.decoysHit + 1, events: [...before, { type: 'decoy', target }] });
  }

  const combo = timed.combo + 1;
  const points = hitPoints(target.kind, combo);

  return Object.freeze({
    ...timed,
    targets,
    taps,
    hits: timed.hits + 1,
    combo,
    bestCombo: Math.max(timed.bestCombo, combo),
    score: timed.score + points,
    events: [...before, { type: 'hit', target, points, combo, bonus: Boolean(KINDS[target.kind].bonus) }],
  });
}

/**
 * @typedef {object} SpaceState
 * @property {'playing'|'over'} status
 * @property {number} seed
 * @property {number} rng
 * @property {number} elapsedMs
 * @property {Array<{ id: number, kind: string, x: number, y: number, slot: number, bornAt: number, expiresAt: number }>} targets
 * @property {number} nextId
 * @property {number} nextSpawnAt
 * @property {Record<string, number>} spawned  targets spawned so far in each phase
 * @property {number} score
 * @property {number} combo        0 = no combo yet / lost
 * @property {number} bestCombo
 * @property {number} hits         successful taps
 * @property {number} taps         all taps (hits, mines, empty space)
 * @property {number} missed       real targets that expired
 * @property {number} decoysHit
 * @property {object[]} events     what the last change did (for the UI)
 */
