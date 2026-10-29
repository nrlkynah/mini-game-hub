// Memory Matrix: a state value and two pure functions that move it forward.
//
//   createMemoryGame(seed)          → a fresh game at level 1 with 3 lives
//   tick(state, now)                → the state after time passes
//   select(state, { tile, at })     → the state after the player picks a tile
//
// Each attempt: 'reveal' (the pattern lights up tile by tile, stays lit,
// then hides) → 'input' (the player repeats it in order). Right: next level,
// a longer pattern. Wrong: one life lost and the same pattern is shown again.
// No lives left: 'over'.
//
// Time is always passed in (ms since GO!), never read from a clock here, so
// a game can be replayed and tested exactly.

import { FEEDBACK_MS, LIVES, START_DELAY_MS } from './config.js';
import { checkPick, createPattern, patternSize, revealTiming } from './pattern.js';
import { accuracyPercent, clearPoints, isQuick } from './scoring.js';
import { toSeed } from '../game/rng.js';

/**
 * @param {number} seed
 * @returns {MemoryState}
 */
export function createMemoryGame(seed) {
  const [pattern, rng] = createPattern(toSeed(seed), patternSize(1));

  return Object.freeze({
    status: 'reveal',
    seed: toSeed(seed),
    rng,
    level: 1,
    pattern,
    picks: [],
    lives: LIVES,
    score: 0,
    streak: 0,
    bestStreak: 0,
    cleared: 0,
    taps: 0,
    correctTaps: 0,
    revealStartsAt: START_DELAY_MS,
    inputStartedAt: null,
    lastEvent: null,
  });
}

/** When the current reveal is over and the pattern hides. */
export function revealEndsAt(state) {
  const { stepMs, holdMs } = revealTiming(state.level);

  return state.revealStartsAt + state.pattern.length * stepMs + holdMs;
}

/**
 * How many tiles of the pattern are lit at `now` during the reveal: 0 before
 * it starts, then one more every step, then all of them until it hides.
 */
export function litCount(state, now) {
  if (state.status !== 'reveal' || now < state.revealStartsAt) {
    return 0;
  }
  const { stepMs } = revealTiming(state.level);

  return Math.min(state.pattern.length, Math.floor((now - state.revealStartsAt) / stepMs) + 1);
}

/** Correct taps as a percentage of all taps. */
export function accuracy(state) {
  return accuracyPercent(state.correctTaps, state.taps);
}

/** Let time pass: once the reveal is over, the pattern hides and it's the player's turn. */
export function tick(state, now) {
  if (state.status !== 'reveal' || now < revealEndsAt(state)) {
    return state;
  }

  return Object.freeze({ ...state, status: 'input', inputStartedAt: now, lastEvent: { type: 'hide' } });
}

/**
 * The player picks a tile at time `at`.
 *
 * - The next tile of the pattern: kept; the last one clears the level.
 * - Any other tile: a mistake. One life lost, the streak resets, and the
 *   same pattern is shown again (or the game is over with no lives left).
 * - A tile already picked, or a pick while the pattern is showing or after
 *   the game: ignored / blocked, nothing changes.
 */
export function select(state, { tile, at }) {
  if (state.status !== 'input') {
    return Object.freeze({ ...state, lastEvent: { type: 'blocked' } });
  }

  const result = checkPick(state.pattern, state.picks, tile);
  if (result === 'invalid' || result === 'repeat') {
    return Object.freeze({ ...state, lastEvent: { type: 'ignored', tile } });
  }

  const taps = state.taps + 1;

  if (result === 'wrong') {
    const lives = state.lives - 1;
    const failed = { ...state, taps, lives, streak: 0, picks: [] };
    const lastEvent = { type: 'fail', tile, expected: state.pattern[state.picks.length], lives, over: lives === 0 };

    return lives === 0
      ? Object.freeze({ ...failed, status: 'over', lastEvent })
      : Object.freeze({ ...failed, status: 'reveal', revealStartsAt: at + FEEDBACK_MS, lastEvent });
  }

  const picks = [...state.picks, tile];
  const correctTaps = state.correctTaps + 1;

  if (result === 'correct') {
    return Object.freeze({ ...state, taps, correctTaps, picks, lastEvent: { type: 'pick', tile, step: picks.length } });
  }

  // The whole pattern is right: score it and move on to a longer one.
  const streak = state.streak + 1;
  const quick = isQuick(at - state.inputStartedAt, state.pattern.length);
  const points = clearPoints(state.level, streak, quick);
  const level = state.level + 1;
  const [pattern, rng] = createPattern(state.rng, patternSize(level));

  return Object.freeze({
    ...state,
    status: 'reveal',
    rng,
    level,
    pattern,
    picks: [],
    taps,
    correctTaps,
    score: state.score + points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    cleared: state.level,
    revealStartsAt: at + FEEDBACK_MS,
    inputStartedAt: null,
    lastEvent: { type: 'clear', tile, step: picks.length, cells: picks, level: state.level, points, streak, quick },
  });
}

/**
 * @typedef {object} MemoryState
 * @property {'reveal'|'input'|'over'} status
 * @property {number} seed
 * @property {number} rng
 * @property {number} level           the level being played
 * @property {number[]} pattern       tiles to repeat, in order
 * @property {number[]} picks         correct picks so far in this attempt
 * @property {number} lives
 * @property {number} score
 * @property {number} streak          levels cleared in a row without a mistake
 * @property {number} bestStreak
 * @property {number} cleared         highest level cleared (0 = none yet)
 * @property {number} taps            all counted picks
 * @property {number} correctTaps
 * @property {number} revealStartsAt  when the first tile of the reveal lights up
 * @property {?number} inputStartedAt when the pattern hid and input began
 * @property {?object} lastEvent      what the last change was (for the UI)
 */
