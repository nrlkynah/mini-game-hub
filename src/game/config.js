// Game rules in one place. Everything here is plain data, no DOM.

export const COLS = 6;
export const ROWS = 7;

/** Round length and the "hurry up" phase, in milliseconds. */
export const DURATION_MS = 60_000;
export const WARNING_MS = 10_000;

/** A match within this time of the previous match keeps the combo going. */
export const COMBO_WINDOW_MS = 2_500;
export const MAX_COMBO = 10;

/**
 * Tile colours. Each one also has its own shape, so the game never relies
 * on colour alone.
 */
export const COLORS = [
  { key: 'pink', name: 'Pink', shape: 'circle', symbol: '●' },
  { key: 'yellow', name: 'Yellow', shape: 'triangle', symbol: '▲' },
  { key: 'blue', name: 'Blue', shape: 'square', symbol: '■' },
  { key: 'green', name: 'Green', shape: 'diamond', symbol: '◆' },
  { key: 'purple', name: 'Purple', shape: 'star', symbol: '★' },
];
