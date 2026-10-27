// Scoring rules. Integers only, no randomness.

import { COMBO_WINDOW_MS, MAX_COMBO } from './config.js';

/**
 * Points for clearing a group, before the combo multiplier.
 *   2 → 50, 3 → 100, 4 → 175, 5 → 250, then +75 for every extra tile.
 */
export function basePoints(size) {
  if (size < 2) {
    return 0;
  }

  const table = { 2: 50, 3: 100, 4: 175 };

  return table[size] ?? 250 + (size - 5) * 75;
}

/**
 * The combo after a successful match at time `at` (ms since the round began).
 * Quick follow-ups (within COMBO_WINDOW_MS of the last match) raise it by one,
 * up to MAX_COMBO; otherwise it starts again at 1.
 */
export function comboAfterMatch(combo, lastMatchAt, at) {
  if (lastMatchAt !== null && combo > 0 && at - lastMatchAt <= COMBO_WINDOW_MS) {
    return Math.min(combo + 1, MAX_COMBO);
  }

  return 1;
}

/** Points for a match: base points × combo. */
export function matchPoints(size, combo) {
  return basePoints(size) * Math.max(combo, 1);
}
