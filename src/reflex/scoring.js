// Neon Reflex scoring. Integers only, no randomness: the same reaction time
// and combo always give the same points.

import { COMBO_BONUS, GRADES } from './config.js';

/** The grade for a reaction time in ms (see GRADES). */
export function gradeFor(ms) {
  return GRADES.find((grade) => ms < grade.under);
}

/**
 * Points for speed alone: 1000 − ms, kept between 50 and 1000.
 *   142 ms → 858, 287 ms → 713, 500 ms → 500, 950 ms or slower → 50.
 */
export function speedPoints(ms) {
  return Math.min(1000, Math.max(50, 1000 - Math.round(ms)));
}

/** The combo after a hit: one more, unless the hit was slow, which breaks it. */
export function comboAfterHit(combo, gradeKey) {
  return gradeKey === 'slow' ? 0 : combo + 1;
}

/** Points for a hit: speed points + COMBO_BONUS for each combo step above x1. */
export function hitPoints(ms, combo) {
  return speedPoints(ms) + COMBO_BONUS * Math.max(combo - 1, 0);
}
