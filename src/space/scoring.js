// Space Tap scoring, combo and accuracy. Integers only, no randomness.

import { KINDS, MULTIPLIER_TENTHS } from './config.js';

/** The combo multiplier, in tenths: 10 = ×1.0 … 20 = ×2.0 from x5 up. */
export function multiplierTenths(combo) {
  return MULTIPLIER_TENTHS[Math.min(Math.max(combo, 0), MULTIPLIER_TENTHS.length - 1)];
}

/** "1.4" for display. */
export function multiplierLabel(combo) {
  return (multiplierTenths(combo) / 10).toFixed(1);
}

/** Points for hitting a target of `kind` with the combo after the hit: 100 or 250 × multiplier, rounded. */
export function hitPoints(kind, combo) {
  return Math.round((KINDS[kind].points * multiplierTenths(combo)) / 10);
}

/** Successful taps as a whole percentage of all taps; 100 with no taps yet. */
export function accuracyPercent(hits, taps) {
  if (!Number.isFinite(taps) || taps <= 0) {
    return 100;
  }
  const good = Number.isFinite(hits) ? Math.min(Math.max(hits, 0), taps) : 0;

  return Math.round((good / taps) * 100);
}
