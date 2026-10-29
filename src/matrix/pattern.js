// Patterns: which tiles light up, in which order. Pure functions only.

import { FIRST_PATTERN, FIRST_STEP_MS, HOLD_MS, MAX_PATTERN, MIN_STEP_MS, STEP_DROP_MS, TILES } from './config.js';
import { randomInt } from '../game/rng.js';

/** Number of tiles in the pattern for a level: 3, 4, 5 … up to MAX_PATTERN. */
export function patternSize(level) {
  return Math.min(FIRST_PATTERN + Math.max(level, 1) - 1, MAX_PATTERN);
}

/** Reveal timing for a level: ms per tile, then how long the full pattern stays lit. */
export function revealTiming(level) {
  return { stepMs: Math.max(MIN_STEP_MS, FIRST_STEP_MS - (Math.max(level, 1) - 1) * STEP_DROP_MS), holdMs: HOLD_MS };
}

/**
 * `size` different tiles in a random order (a partial Fisher–Yates shuffle).
 *
 * @returns {[number[], number]} [tile indexes, next rng state]
 */
export function createPattern(rng, size, tiles = TILES) {
  const pool = Array.from({ length: tiles }, (_, i) => i);
  const count = Math.min(size, tiles);

  for (let i = 0; i < count; i++) {
    let j;
    [j, rng] = randomInt(rng, tiles - i);
    [pool[i], pool[i + j]] = [pool[i + j], pool[i]];
  }

  return [pool.slice(0, count), rng];
}

/**
 * Check one more pick against the pattern, given the picks so far.
 *   'correct'  the next tile of the pattern
 *   'complete' the last tile: the whole pattern is right
 *   'wrong'    any other tile
 *   'repeat'   a tile already picked in this attempt (ignored)
 *   'invalid'  not a tile at all (ignored)
 */
export function checkPick(pattern, picks, tile, tiles = TILES) {
  if (!Number.isInteger(tile) || tile < 0 || tile >= tiles) {
    return 'invalid';
  }
  if (picks.includes(tile)) {
    return 'repeat';
  }
  if (tile !== pattern[picks.length]) {
    return 'wrong';
  }

  return picks.length + 1 === pattern.length ? 'complete' : 'correct';
}
