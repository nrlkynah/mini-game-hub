// The game itself: a state value and two pure functions that move it forward.
//
//   createGame(seed)           → a fresh 60-second round
//   applyMove(state, move)     → the state after the player taps a tile
//   tick(state, elapsedMs)     → the state after time passes
//
// Time is always passed in (ms since the round began), never read from a
// clock here, so the whole game can be replayed and tested exactly.

import { COLS, DURATION_MS, ROWS } from './config.js';
import { createBoard, findGroup, hasValidMove, removeAndRefill } from './board.js';
import { comboAfterMatch, matchPoints } from './scoring.js';
import { toSeed } from './rng.js';

/**
 * @param {number} seed
 * @returns {GameState}
 */
export function createGame(seed) {
  const { board, rng, nextId } = createBoard(toSeed(seed), 1);

  return Object.freeze({
    status: 'playing',
    seed: toSeed(seed),
    rng,
    nextId,
    board,
    elapsedMs: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    matches: 0,
    lastMatchAt: null,
    lastMove: null,
  });
}

/** Remaining time in ms (never below 0). */
export function remainingMs(state) {
  return Math.max(0, DURATION_MS - state.elapsedMs);
}

/** Whole seconds shown on the timer: 60 at the start, exactly 0 at the end. */
export function secondsLeft(state) {
  return Math.ceil(remainingMs(state) / 1000);
}

/**
 * Let time pass. Once DURATION_MS is reached the round is over and stays over.
 */
export function tick(state, elapsedMs) {
  if (state.status !== 'playing') {
    return state;
  }

  const elapsed = Math.min(Math.max(elapsedMs, state.elapsedMs), DURATION_MS);
  if (elapsed === state.elapsedMs && elapsed < DURATION_MS) {
    return state;
  }

  return Object.freeze({
    ...state,
    elapsedMs: elapsed,
    status: elapsed >= DURATION_MS ? 'over' : 'playing',
  });
}

/**
 * The player taps the tile at (row, col) at time `at`.
 *
 * - Group of 2+ same-coloured touching tiles: removed, points awarded, combo
 *   updated, the board refills from the top.
 * - A lone tile: an invalid move; the combo is lost.
 * - After the round is over (or at/after 60 s): blocked, nothing changes.
 *
 * @param {GameState} state
 * @param {{ row: number, col: number, at: number }} move
 * @returns {GameState}
 */
export function applyMove(state, move) {
  const timed = tick(state, move.at);
  if (timed.status !== 'playing') {
    return Object.freeze({ ...timed, lastMove: { type: 'blocked' } });
  }

  const group = findGroup(timed.board, move.row, move.col);
  if (group.length === 0) {
    return Object.freeze({ ...timed, lastMove: { type: 'ignored' } });
  }

  if (group.length < 2) {
    return Object.freeze({
      ...timed,
      combo: 0,
      lastMove: { type: 'invalid', row: move.row, col: move.col },
    });
  }

  const combo = comboAfterMatch(timed.combo, timed.lastMatchAt, timed.elapsedMs);
  const points = matchPoints(group.length, combo);
  const color = timed.board[move.row][move.col].color;

  let { board, rng, nextId, spawned } = removeAndRefill(timed.board, group, timed.rng, timed.nextId);

  // A board with no possible move would leave the player stuck: deal a new one.
  let reshuffled = false;
  if (!hasValidMove(board)) {
    ({ board, rng, nextId } = createBoard(rng, nextId, ROWS, COLS));
    spawned = board.flat().map((tile) => tile.id);
    reshuffled = true;
  }

  return Object.freeze({
    ...timed,
    board,
    rng,
    nextId,
    score: timed.score + points,
    combo,
    bestCombo: Math.max(timed.bestCombo, combo),
    matches: timed.matches + 1,
    lastMatchAt: timed.elapsedMs,
    lastMove: { type: 'match', row: move.row, col: move.col, cells: group, color, size: group.length, points, combo, spawned, reshuffled },
  });
}

/**
 * @typedef {object} GameState
 * @property {'playing'|'over'} status
 * @property {number} seed
 * @property {number} rng
 * @property {number} nextId
 * @property {import('./board.js').Tile[][]} board
 * @property {number} elapsedMs
 * @property {number} score
 * @property {number} combo        0 = no combo yet / lost
 * @property {number} bestCombo
 * @property {number} matches
 * @property {?number} lastMatchAt
 * @property {?object} lastMove    what the last action did (for the UI)
 */
