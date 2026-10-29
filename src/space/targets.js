// Targets: which kind comes next, where it appears, and the difficulty
// phase for a moment in the run. Pure functions only.

import { MIN_SPREAD, PHASES } from './config.js';
import { nextRandom } from '../game/rng.js';

/** The difficulty phase at `elapsedMs` into the run. */
export function phaseAt(elapsedMs) {
  return PHASES.find((phase) => elapsedMs < phase.until);
}

/**
 * The kind of the `n`-th target (1-based) in a phase. Every `decoyEvery`-th
 * is a mine, every `bonusEvery`-th a comet, the rest stars or planets.
 *
 * @returns {[string, number]} [kind, next rng state]
 */
export function kindFor(n, phase, rng) {
  if (n % phase.decoyEvery === 0) {
    return ['mine', rng];
  }
  if (n % phase.bonusEvery === 0) {
    return ['comet', rng];
  }
  const [value, next] = nextRandom(rng);

  return [value < 0.5 ? 'star' : 'planet', next];
}

/**
 * A spot for a new target: x, y in [0, 1) across the arena (the view keeps
 * the whole target inside it), at least MIN_SPREAD from every live target.
 * Returns null when no free spot is found; the spawn then waits a moment.
 *
 * @returns {[{ x: number, y: number } | null, number]}
 */
export function pickSpot(rng, taken) {
  for (let attempt = 0; attempt < 16; attempt++) {
    let x;
    let y;
    [x, rng] = nextRandom(rng);
    [y, rng] = nextRandom(rng);
    if (taken.every((t) => Math.hypot(x - t.x, y - t.y) >= MIN_SPREAD)) {
      return [{ x, y }, rng];
    }
  }

  return [null, rng];
}

/** The lowest free keyboard slot (1–4) among live targets. */
export function freeSlot(targets) {
  for (let slot = 1; ; slot++) {
    if (!targets.some((t) => t.slot === slot)) {
      return slot;
    }
  }
}
