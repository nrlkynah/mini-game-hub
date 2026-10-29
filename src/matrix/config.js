// Memory Matrix rules in one place. Everything here is plain data, no DOM.

/** The grid is GRID × GRID tiles, numbered 0 … TILES − 1 left to right, top to bottom. */
export const GRID = 4;
export const TILES = GRID * GRID;

export const LIVES = 3;

/** Level 1 shows 3 tiles, each level one more, up to MAX_PATTERN. */
export const FIRST_PATTERN = 3;
export const MAX_PATTERN = 10;

/**
 * How long each tile of the pattern takes to light up during the reveal.
 * It gets a little shorter every level, never below MIN_STEP_MS.
 */
export const FIRST_STEP_MS = 650;
export const STEP_DROP_MS = 25;
export const MIN_STEP_MS = 380;

/** The whole pattern stays lit this long after its last tile, then it hides. */
export const HOLD_MS = 900;

/** Dark pause before the first reveal, and after each cleared or failed attempt. */
export const START_DELAY_MS = 500;
export const FEEDBACK_MS = 1200;

/** Points: LEVEL_BASE for level 1, LEVEL_STEP more per level, STREAK_BONUS per streak step above x1. */
export const LEVEL_BASE = 100;
export const LEVEL_STEP = 50;
export const STREAK_BONUS = 50;

/** A pattern repeated within QUICK_MS_PER_TILE per tile earns QUICK_BONUS. */
export const QUICK_MS_PER_TILE = 700;
export const QUICK_BONUS = 50;
