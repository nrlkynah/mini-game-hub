// Laser Dodge difficulty, survival streak and scoring. Integers only, no randomness.

import { EXTREME_DROP_MS, EXTREME_MIN_EVERY_MS, EXTREME_STEP_MS, MAX_STREAK, PHASES, POINTS_EVERY_MS, STREAK_BONUS, STREAK_EVERY_MS } from './config.js';

/** The difficulty phase after surviving `ms`. */
export function phaseAt(ms) {
  return PHASES.find((phase) => ms < phase.until);
}

/** Time between waves at `ms`; in EXTREME it keeps shrinking a little every 5 s. */
export function waveEveryMs(ms) {
  const phase = phaseAt(ms);
  if (phase.key !== 'extreme') {
    return phase.everyMs;
  }
  const steps = Math.floor((ms - PHASES[2].until) / EXTREME_STEP_MS);

  return Math.max(EXTREME_MIN_EVERY_MS, phase.everyMs - steps * EXTREME_DROP_MS);
}

/** Survival streak after `msSinceHit` without a hit: x1, then +1 every 5 s, up to x8. */
export function streakFor(msSinceHit) {
  return Math.min(MAX_STREAK, 1 + Math.floor(Math.max(msSinceHit, 0) / STREAK_EVERY_MS));
}

/**
 * Points for surviving from `fromMs` to `toMs`: every 100 ms boundary crossed
 * is worth the phase's points plus the streak bonus at that moment. Counting
 * boundaries (not frames) gives the same score at any frame rate.
 */
export function survivalPoints(fromMs, toMs, lastHitAt) {
  let points = 0;
  for (let k = Math.floor(fromMs / POINTS_EVERY_MS) + 1; k * POINTS_EVERY_MS <= toMs; k++) {
    const at = k * POINTS_EVERY_MS;
    points += phaseAt(at).points + STREAK_BONUS * (streakFor(at - lastHitAt) - 1);
  }

  return points;
}
