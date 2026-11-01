// Laser Dodge personal bests, in localStorage, through the shared safe
// helpers: everything read back is validated, and a missing or blocked
// localStorage just means nothing is remembered.

import { readJson, safeCount, safeLocalStorage, writeJson } from './safeStorage.js';

const KEY = 'mgh.laserDodge.best.v1';

/**
 * @param {Storage|null} backend window.localStorage, or a stand-in in tests
 */
export function createLaserStorage(backend = safeLocalStorage()) {
  return {
    /** @returns {{ score: number, timeMs: number, streak: number }} */
    getBest() {
      const data = readJson(backend, KEY);

      return { score: safeCount(data?.score), timeMs: safeCount(data?.timeMs), streak: safeCount(data?.streak) };
    },

    /**
     * Record a finished run. Only ever raises the stored bests.
     *
     * @param {{ score: number, elapsedMs: number, bestStreak: number }} result
     * @returns {{ isNewBest: boolean, isNewTime: boolean, best: { score: number, timeMs: number, streak: number } }}
     */
    saveResult({ score, elapsedMs, bestStreak }) {
      const previous = this.getBest();
      const finalScore = safeCount(score);
      const timeMs = safeCount(Math.round(elapsedMs));
      const best = {
        score: Math.max(previous.score, finalScore),
        timeMs: Math.max(previous.timeMs, timeMs),
        streak: Math.max(previous.streak, safeCount(bestStreak)),
      };
      writeJson(backend, KEY, best);

      return { isNewBest: finalScore > previous.score, isNewTime: timeMs > previous.timeMs, best };
    },
  };
}

export { KEY as LASER_STORAGE_KEY };
