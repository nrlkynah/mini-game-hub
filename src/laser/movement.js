// Moving the player orb. Pure functions only; the orb never leaves the arena.

import { PLAYER_RADIUS, PLAYER_SPEED } from './config.js';

/** Keep the whole orb inside the arena. */
export function clampToArena({ x, y }, { width, height }) {
  return {
    x: Math.min(width - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, x)),
    y: Math.min(height - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, y)),
  };
}

/**
 * Keyboard movement: `dir` is where the keys point (x, y in −1 … 1). Diagonals
 * are not faster than straight moves.
 */
export function moveByKeys(position, dir, dtMs, arena) {
  const length = Math.hypot(dir.x, dir.y);
  if (length === 0 || dtMs <= 0) {
    return position;
  }
  const step = (PLAYER_SPEED * dtMs) / 1000 / length;

  return clampToArena({ x: position.x + dir.x * step, y: position.y + dir.y * step }, arena);
}

/** Touch / mouse drag: move by the same distance the finger moved (in arena units). */
export function moveBy(position, dx, dy, arena) {
  return clampToArena({ x: position.x + dx, y: position.y + dy }, arena);
}
