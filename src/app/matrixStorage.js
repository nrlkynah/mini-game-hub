// Memory Matrix personal bests, in localStorage. Same rules as storage.js:
// everything read back is validated, and a missing or blocked localStorage
// just means nothing is remembered.

const KEY = 'mgh.memoryMatrix.best.v1';

/**
 * @param {Storage|null} backend window.localStorage, or a stand-in in tests
 */
export function createMatrixStorage(backend = safeLocalStorage()) {
  return {
    /** @returns {{ score: number, level: number, streak: number }} level = highest level cleared */
    getBest() {
      try {
        const data = JSON.parse(backend?.getItem(KEY) ?? 'null');

        return { score: safeCount(data?.score), level: safeCount(data?.level), streak: safeCount(data?.streak) };
      } catch {
        return { score: 0, level: 0, streak: 0 };
      }
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
      try {
        backend?.setItem(KEY, JSON.stringify(best));
      } catch {
        // Full or blocked: keep playing without saving.
      }

      return { isNewBest, best };
    },
  };
}

/** A whole number ≥ 0, or 0 for anything else (NaN, negative, text, huge). */
function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeLocalStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export { KEY as MATRIX_STORAGE_KEY };
