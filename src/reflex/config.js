// Neon Reflex rules in one place. Everything here is plain data, no DOM.

export const ROUNDS = 10;

/**
 * The pause before each target appears is picked at random from this range,
 * so the moment can't be predicted.
 */
export const MIN_DELAY_MS = 500;
export const MAX_DELAY_MS = 1300;

/** A target left alone this long is a miss. */
export const TARGET_TIMEOUT_MS = 1500;

/**
 * Reaction grades, fastest first: a reaction faster than `under` ms earns
 * the grade. Anything but a slow hit keeps the combo going.
 */
export const GRADES = [
  { key: 'perfect', label: 'PERFECT', under: 200 },
  { key: 'great', label: 'GREAT', under: 350 },
  { key: 'good', label: 'GOOD', under: 500 },
  { key: 'slow', label: 'SLOW', under: Infinity },
];

/** Extra points per combo step above x1. */
export const COMBO_BONUS = 100;

/**
 * Each target's centre lands at least this far (as a fraction of the field)
 * from the previous one, so it never shows up in the same spot twice.
 */
export const MIN_SPREAD = 0.3;
