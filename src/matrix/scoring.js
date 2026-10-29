// Memory Matrix scoring. Integers only, no randomness.

import { LEVEL_BASE, LEVEL_STEP, QUICK_BONUS, QUICK_MS_PER_TILE, STREAK_BONUS } from './config.js';

/** Points for clearing a level: 100, 150, 200 … */
export function levelPoints(level) {
  return LEVEL_BASE + LEVEL_STEP * (Math.max(level, 1) - 1);
}

/** True when the pattern was repeated within QUICK_MS_PER_TILE per tile. */
export function isQuick(inputMs, size) {
  return inputMs <= size * QUICK_MS_PER_TILE;
}

/**
 * Points for a cleared level: level points + STREAK_BONUS for each streak
 * step above x1 + QUICK_BONUS for a quick answer.
 *   level 3, streak x2, not quick → 200 + 50 = 250
 */
export function clearPoints(level, streak, quick) {
  return levelPoints(level) + STREAK_BONUS * Math.max(streak - 1, 0) + (quick ? QUICK_BONUS : 0);
}

/** Correct taps as a whole percentage of all taps (0 with no taps). */
export function accuracyPercent(correct, total) {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}
