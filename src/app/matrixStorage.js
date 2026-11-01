// Memory Matrix personal bests, in localStorage. Same rules as storage.js:
// everything read back is validated, and a missing or blocked localStorage
// just means nothing is remembered.

import { readJson, safeCount, safeLocalStorage, writeJson } from './safeStorage.js';

const KEY = 'mgh.memoryMatrix.best.v1';

/**
 * @param {Storage|null} backend window.localStorage, or a stand-in in tests
 */
export function createMatrixStorage(backend = safeLocalStorage()) {
  return {
    /** @returns {{ score: number, level: number, streak: number }} level = highest level cleared */
    getBest() {
      const data = readJson(backend, KEY);

      return { score: safeCount(data?.score), level: safeCount(data?.level), streak: safeCount(data?.streak) };
    },

    /**
     * Record a finished game. Only ever raises the stored bests.
     *
     * @param {{ score: number, cleared: number, bestStreak: number }} result
     * @returns {{ isNewBest: boolean, best: { score: number, level: number, streak: number } }}
     */
    saveResult({ score, cleared, bestStreak }) {
      const previous = this.getBest();
      const finalScore = safeCount(score);
      const isNewBest = finalScore > previous.score;
      const best = {
        score: Math.max(previous.score, finalScore),
        level: Math.max(previous.level, safeCount(cleared)),
        streak: Math.max(previous.streak, safeCount(bestStreak)),
      };
      writeJson(backend, KEY, best);

      return { isNewBest, best };
    },
  };
}

export { KEY as MATRIX_STORAGE_KEY };
