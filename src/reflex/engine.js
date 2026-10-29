// Neon Reflex: a state value and two pure functions that move it forward.
//
//   createReflexGame(seed)        → a fresh game of ROUNDS targets
//   tick(state, now)              → the state after time passes
//   press(state, { at, onTarget }) → the state after the player taps/clicks
//
// Each round: a random pause ('waiting'), then a target at a random spot
// ('target') until it is hit or times out. After the last round: 'over'.
//
// Time is always passed in (ms since GO!), never read from a clock here, so
// a game can be replayed and tested exactly.

import { MAX_DELAY_MS, MIN_DELAY_MS, MIN_SPREAD, ROUNDS, TARGET_TIMEOUT_MS } from './config.js';
import { comboAfterHit, gradeFor, hitPoints } from './scoring.js';
import { nextRandom, randomInt, toSeed } from '../game/rng.js';

/**
 * @param {number} seed
 * @returns {ReflexState}
 */
export function createReflexGame(seed) {
  const [delay, rng] = randomDelay(toSeed(seed));

  return Object.freeze({
    status: 'waiting',
    seed: toSeed(seed),
    rng,
    round: 1,
    nextTargetAt: delay,
    target: null,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    misses: 0,
    falseClicks: 0,
    reactions: [],
    lastEvent: null,
  });
}

/**
 * Let time pass: show the next target once its pause is over, or count the
 * current target as missed once it has been up for TARGET_TIMEOUT_MS.
 * One change per call; the game loop calls it every frame.
 */
export function tick(state, now) {
  if (state.status === 'waiting' && now >= state.nextTargetAt) {
    let position;
    let rng = state.rng;
    [position, rng] = pickPosition(rng, state.target);

    return Object.freeze({
      ...state,
      status: 'target',
      rng,
      target: { ...position, round: state.round, shownAt: now },
      lastEvent: { type: 'spawn', ...position },
    });
  }

  if (state.status === 'target' && now - state.target.shownAt >= TARGET_TIMEOUT_MS) {
    return nextRound(state, now, {
      combo: 0,
      misses: state.misses + 1,
      lastEvent: { type: 'timeout', x: state.target.x, y: state.target.y },
    });
  }

  return state;
}

/**
 * The player presses at time `at`. `onTarget` is true when the press landed
 * on the target (a keyboard press always aims at it).
 *
 * - On a visible target: a hit. Points from the reaction time, combo updated,
 *   the next round begins.
 * - Anywhere else, or before the target appears: a false click. Nothing is
 *   scored or lost; it is only counted.
 * - After the game is over: blocked, nothing changes.
 */
export function press(state, { at, onTarget }) {
  if (state.status === 'over') {
    return Object.freeze({ ...state, lastEvent: { type: 'blocked' } });
  }

  const timed = state.status === 'target' ? tick(state, at) : state; // too late = the timeout already happened
  if (timed !== state) {
    return timed;
  }

  if (!onTarget || state.status !== 'target') {
    return Object.freeze({
      ...state,
      falseClicks: state.falseClicks + 1,
      lastEvent: { type: 'false', early: state.status === 'waiting' },
    });
  }

  const reaction = reactionTime(state.target.shownAt, at);
  const grade = gradeFor(reaction);
  const combo = comboAfterHit(state.combo, grade.key);
  const points = hitPoints(reaction, combo);

  return nextRound(state, at, {
    score: state.score + points,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    hits: state.hits + 1,
    reactions: [...state.reactions, reaction],
    lastEvent: { type: 'hit', reaction, points, grade: grade.key, label: grade.label, combo, x: state.target.x, y: state.target.y },
  });
}

/** Whole ms from the target appearing to the press (never negative). */
export function reactionTime(shownAt, at) {
  return Math.max(0, Math.round(at - shownAt));
}

/** Mean reaction of all hits, in whole ms, or null with no hits. */
export function averageReaction(state) {
  if (state.reactions.length === 0) {
    return null;
  }

  return Math.round(state.reactions.reduce((sum, ms) => sum + ms, 0) / state.reactions.length);
}

/** Fastest reaction of the game, or null with no hits. */
export function bestReaction(state) {
  return state.reactions.length > 0 ? Math.min(...state.reactions) : null;
}

/** Finish the current round (hit or miss) and set up the next one, or end the game. */
function nextRound(state, at, changes) {
  if (state.round >= ROUNDS) {
    return Object.freeze({ ...state, ...changes, status: 'over' });
  }

  const [delay, rng] = randomDelay(state.rng);

  return Object.freeze({
    ...state,
    ...changes,
    status: 'waiting',
    rng,
    round: state.round + 1,
    nextTargetAt: at + delay,
  });
}

function randomDelay(rng) {
  const [extra, next] = randomInt(rng, MAX_DELAY_MS - MIN_DELAY_MS + 1);

  return [MIN_DELAY_MS + extra, next];
}

/**
 * A spot for the next target: x and y in [0, 1) across the field (the view
 * keeps the whole target inside it). Tries a few random spots and takes the
 * first one far enough from the previous target, or else the farthest.
 */
function pickPosition(rng, previous) {
  let best = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    let x;
    let y;
    [x, rng] = nextRandom(rng);
    [y, rng] = nextRandom(rng);
    const spread = previous ? Math.hypot(x - previous.x, y - previous.y) : 1;
    if (!best || spread > best.spread) {
      best = { x, y, spread };
    }
    if (spread >= MIN_SPREAD) {
      break;
    }
  }

  return [{ x: best.x, y: best.y }, rng];
}

/**
 * @typedef {object} ReflexState
 * @property {'waiting'|'target'|'over'} status
 * @property {number} seed
 * @property {number} rng
 * @property {number} round          1 … ROUNDS, the round being played
 * @property {number} nextTargetAt   when the next target appears (while waiting)
 * @property {?{ x: number, y: number, round: number, shownAt: number }} target
 *                                   the current target, or the last one while waiting
 * @property {number} score
 * @property {number} combo          0 = no combo yet / lost
 * @property {number} bestCombo
 * @property {number} hits
 * @property {number} misses         targets that timed out
 * @property {number} falseClicks    presses that missed the target
 * @property {number[]} reactions    reaction time of every hit, in ms
 * @property {?object} lastEvent     what the last change was (for the UI)
 */
