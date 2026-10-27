// The board: a grid of tiles, ROWS × COLS. Pure functions only.
//
// A tile is { id, color } where color is an index into COLORS and id is unique
// for the whole game (so the UI can tell a new tile from one that just moved).
// Boards are never changed in place; every function returns a new board.

import { COLORS, COLS, ROWS } from './config.js';
import { randomInt } from './rng.js';

const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * A new random board that always has at least one valid move.
 *
 * @returns {{ board: Tile[][], rng: number, nextId: number }}
 */
export function createBoard(rng, nextId, rows = ROWS, cols = COLS, colors = COLORS.length) {
  let board = [];

  for (let attempt = 0; attempt < 50; attempt++) {
    board = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        let color;
        [color, rng] = randomInt(rng, colors);
        row.push({ id: nextId++, color });
      }
      board.push(row);
    }

    if (hasValidMove(board)) {
      return { board, rng, nextId };
    }
  }

  // Practically unreachable with 5 colours on 6×7: force one matching pair.
  board[0][1] = { ...board[0][1], color: board[0][0].color };

  return { board, rng, nextId };
}

/**
 * All tiles connected (up/down/left/right) to (row, col) with the same colour,
 * including the tile itself, sorted top-left to bottom-right. Empty if out of range.
 *
 * @returns {Array<[number, number]>}
 */
export function findGroup(board, row, col) {
  if (!isInside(board, row, col)) {
    return [];
  }

  const color = board[row][col].color;
  const seen = new Set([`${row},${col}`]);
  const stack = [[row, col]];
  const group = [];

  while (stack.length > 0) {
    const [r, c] = stack.pop();
    group.push([r, c]);

    for (const [dr, dc] of NEIGHBOURS) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (isInside(board, nr, nc) && !seen.has(key) && board[nr][nc].color === color) {
        seen.add(key);
        stack.push([nr, nc]);
      }
    }
  }

  return group.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/**
 * Remove the given cells, let the tiles above fall down, and fill the gaps
 * at the top of each column with new tiles.
 *
 * @returns {{ board: Tile[][], rng: number, nextId: number, spawned: number[] }}
 */
export function removeAndRefill(board, cells, rng, nextId, colors = COLORS.length) {
  const rows = board.length;
  const cols = board[0].length;
  const removed = new Set(cells.map(([r, c]) => `${r},${c}`));
  const next = Array.from({ length: rows }, () => new Array(cols));
  const spawned = [];

  for (let c = 0; c < cols; c++) {
    // Survivors, bottom to top.
    const kept = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (!removed.has(`${r},${c}`)) {
        kept.push(board[r][c]);
      }
    }

    for (let r = rows - 1, i = 0; r >= 0; r--, i++) {
      if (i < kept.length) {
        next[r][c] = kept[i];
      } else {
        let color;
        [color, rng] = randomInt(rng, colors);
        next[r][c] = { id: nextId, color };
        spawned.push(nextId++);
      }
    }
  }

  return { board: next, rng, nextId, spawned };
}

/** True if any two touching tiles share a colour. */
export function hasValidMove(board) {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const color = board[r][c].color;
      if ((c + 1 < board[r].length && board[r][c + 1].color === color)
        || (r + 1 < board.length && board[r + 1][c].color === color)) {
        return true;
      }
    }
  }

  return false;
}

function isInside(board, row, col) {
  return Number.isInteger(row) && Number.isInteger(col)
    && row >= 0 && row < board.length && col >= 0 && col < board[0].length;
}

/** @typedef {{ id: number, color: number }} Tile */
