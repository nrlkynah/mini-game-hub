// The global player profile: games played and completed, scores, per-game
// bests and achievements, for the whole hub. One shared instance; every game
// reports its result here through recordGameResult().
//
// Saved in localStorage under its own key (mgh.profile.v1) through the
// shared safe helpers. The games' own best-score keys are only read, never
// written: a new profile starts from the bests a player already has. If
// localStorage is missing or broken, the profile still works for the visit.

import { GAMES } from '../games.js';
import { STORAGE_KEYS } from './storage.js';
import { LASER_STORAGE_KEY } from './laserStorage.js';
import { MATRIX_STORAGE_KEY } from './matrixStorage.js';
import { REFLEX_STORAGE_KEY } from './reflexStorage.js';
import { SPACE_STORAGE_KEY } from './spaceStorage.js';
import { readJson, safeCount, safeLocalStorage, writeJson } from './safeStorage.js';

const KEY = 'mgh.profile.v1';
const GAME_IDS = GAMES.map((game) => game.id);

/** Each game's existing best-score key (read once, to start a new profile). */
const BEST_KEYS = {
  'color-chaos': STORAGE_KEYS.best,
  'neon-reflex': REFLEX_STORAGE_KEY,
  'memory-matrix': MATRIX_STORAGE_KEY,
  'space-tap': SPACE_STORAGE_KEY,
  'laser-dodge': LASER_STORAGE_KEY,
};

/**
 * Every achievement. `unlocks(profile, result)` is checked after each result
 * is recorded: `profile` is the updated profile, `result` the game just
 * reported (with `previousBest`, that game's best before it).
 *
 * Game milestones were picked from each game's real rules:
 * - Color Chaos: the combo caps at x10 and needs a match every 2.5 s, so x8 is a strong run.
 * - Neon Reflex: GREAT is under 350 ms, and the pointer has to travel to the target too.
 * - Memory Matrix: level n shows n + 2 tiles; clearing level 6 means repeating 8.
 * - Space Tap: a run has about 35 real targets, so 25 hits at 90% accuracy is sharp play.
 * - Laser Dodge: 30 s is where EXTREME begins.
 */
export const ACHIEVEMENTS = [
  { id: 'first-play', icon: '🎮', title: 'First Play', description: 'Play your first game', unlocks: (p) => p.played >= 1 },
  { id: 'arcade-regular', icon: '🕹️', title: 'Arcade Regular', description: 'Play 10 game sessions', unlocks: (p) => p.played >= 10 },
  { id: 'five-of-five', icon: '🖐️', title: 'Five of Five', description: 'Play all 5 games', unlocks: (p) => GAME_IDS.every((id) => p.games[id].played > 0) },
  { id: 'high-score', icon: '📈', title: 'High Score', description: 'Beat your own best score in any game', unlocks: (p, r) => r.completed && r.previousBest > 0 && r.score > r.previousBest },
  { id: 'all-star', icon: '⭐', title: 'All-Star', description: 'Set a best score in all 5 games', unlocks: (p) => GAME_IDS.every((id) => p.games[id].best > 0) },
  { id: 'chain-reaction', game: 'color-chaos', icon: '🌈', title: 'Chain Reaction', description: 'Reach a x8 combo in Color Chaos', unlocks: (p, r) => is(r, 'color-chaos') && r.metadata.bestCombo >= 8 },
  { id: 'lightning', game: 'neon-reflex', icon: '⚡', title: 'Lightning Reflexes', description: 'Average 350 ms or faster in Neon Reflex (8+ hits)', unlocks: (p, r) => is(r, 'neon-reflex') && r.metadata.hits >= 8 && r.metadata.averageReaction > 0 && r.metadata.averageReaction <= 350 },
  { id: 'total-recall', game: 'memory-matrix', icon: '🧠', title: 'Total Recall', description: 'Clear level 6 in Memory Matrix (8 tiles)', unlocks: (p, r) => is(r, 'memory-matrix') && r.metadata.cleared >= 6 },
  { id: 'sharpshooter', game: 'space-tap', icon: '🎯', title: 'Sharpshooter', description: 'Space Tap: 25+ hits at 90%+ accuracy', unlocks: (p, r) => is(r, 'space-tap') && r.metadata.hits >= 25 && r.metadata.accuracy >= 90 },
  { id: 'survivor', game: 'laser-dodge', icon: '💥', title: 'Survivor', description: 'Survive 30 seconds in Laser Dodge', unlocks: (p, r) => is(r, 'laser-dodge') && r.metadata.timeMs >= 30_000 },
];

const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

function is(result, gameId) {
  return result.gameId === gameId && result.completed;
}

/**
 * @param {Storage|null} backend  window.localStorage, or a stand-in in tests
 */
export function createProfile(backend = safeLocalStorage()) {
  const listeners = new Set();
  let state = load();

  function load() {
    const saved = readJson(backend, KEY);

    return saved ? clean(saved) : fresh();
  }

  /** A new profile, starting from the bests the player already has in each game. */
  function fresh() {
    const games = {};
    for (const id of GAME_IDS) {
      games[id] = { played: 0, completed: 0, best: safeCount(readJson(backend, BEST_KEYS[id])?.score) };
    }

    return { played: 0, completed: 0, totalScore: 0, games, achievements: {} };
  }

  return {
    /** The profile as shown on the hub, with every achievement and whether it is unlocked. */
    get() {
      const bests = GAME_IDS.map((id) => state.games[id].best);

      return {
        played: state.played,
        completed: state.completed,
        totalScore: state.totalScore,
        bestOverall: Math.max(0, ...bests),
        games: structuredClone(state.games),
        mastered: ACHIEVEMENTS.filter((a) => a.game && state.achievements[a.id]).length,
        gameCount: GAME_IDS.length,
        achievements: ACHIEVEMENTS.map(({ unlocks, ...a }) => ({ ...a, unlocked: Boolean(state.achievements[a.id]), unlockedAt: state.achievements[a.id] ?? null })),
      };
    },

    /**
     * A game ended. Completed games add their score and can set a best; a
     * game left early still counts as played. Returns the achievements this
     * result unlocked (also sent to onUnlock listeners).
     *
     * @param {{ gameId: string, score: number, completed: boolean, metadata?: object }} result
     * @param {{ now?: number }} [options]  the time to stamp on unlocks (tests pass a fixed one)
     * @returns {{ unlocked: object[], isNewBest: boolean }}
     */
    recordGameResult({ gameId, score, completed, metadata = {} }, { now = Date.now() } = {}) {
      if (!GAME_IDS.includes(gameId)) {
        return { unlocked: [], isNewBest: false };
      }

      const points = completed ? safeCount(Math.round(score)) : 0;
      const game = state.games[gameId];
      const previousBest = game.best;
      const isNewBest = points > previousBest;

      state = {
        ...state,
        played: state.played + 1,
        completed: state.completed + (completed ? 1 : 0),
        totalScore: state.totalScore + points,
        games: {
          ...state.games,
          [gameId]: { played: game.played + 1, completed: game.completed + (completed ? 1 : 0), best: Math.max(previousBest, points) },
        },
      };

      const result = { gameId, score: points, completed: Boolean(completed), metadata, previousBest };
      const unlocked = ACHIEVEMENTS.filter((a) => !state.achievements[a.id] && a.unlocks(state, result));
      if (unlocked.length > 0) {
        const stamp = safeCount(Math.round(now)) || 1;
        state = { ...state, achievements: { ...state.achievements, ...Object.fromEntries(unlocked.map((a) => [a.id, stamp])) } };
      }
      writeJson(backend, KEY, state);

      const shown = unlocked.map(({ unlocks, ...a }) => ({ ...a, unlocked: true, unlockedAt: state.achievements[a.id] }));
      if (shown.length > 0) {
        listeners.forEach((fn) => fn(shown));
      }

      return { unlocked: shown, isNewBest };
    },

    /**
     * Start the profile over: plays, scores and achievements. The games' own
     * best scores and the Sound / Motion settings are not touched.
     */
    reset() {
      try {
        backend?.removeItem(KEY);
      } catch {
        // Blocked: the fresh profile below still applies for this visit.
      }
      state = fresh();
    },

    /** Call `fn(achievements)` whenever achievements unlock. */
    onUnlock(fn) {
      listeners.add(fn);

      return () => listeners.delete(fn);
    },
  };
}

/** A saved profile, validated: unknown games and achievements dropped, every number a safe count. */
function clean(saved) {
  const games = {};
  for (const id of GAME_IDS) {
    const g = saved?.games?.[id];
    games[id] = { played: safeCount(g?.played), completed: safeCount(g?.completed), best: safeCount(g?.best) };
  }
  const achievements = {};
  for (const id of ACHIEVEMENT_IDS) {
    const at = safeCount(saved?.achievements?.[id]);
    if (at > 0) {
      achievements[id] = at;
    }
  }

  return { played: safeCount(saved?.played), completed: safeCount(saved?.completed), totalScore: safeCount(saved?.totalScore), games, achievements };
}

/** The one shared profile used by the whole hub. */
export const profile = createProfile();

export { KEY as PROFILE_STORAGE_KEY };
