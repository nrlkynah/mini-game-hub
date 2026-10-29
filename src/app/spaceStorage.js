// Space Tap personal bests, in localStorage. Same rules as storage.js:
// everything read back is validated, and a missing or blocked localStorage
// just means nothing is remembered.

const KEY = 'mgh.spaceTap.best.v1';

/**
 * @param {Storage|null} backend window.localStorage, or a stand-in in tests
 */
export function createSpaceStorage(backend = safeLocalStorage()) {
  return {
    /** @returns {{ score: number, combo: number, accuracy: number }} accuracy in %, 0 = none yet */
    getBest() {
      try {
        const data = JSON.parse(backend?.getItem(KEY) ?? 'null');

        return { score: safeCount(data?.score), combo: safeCount(data?.combo), accuracy: Math.min(safeCount(data?.accuracy), 100) };
      } catch {
        return { score: 0, combo: 0, accuracy: 0 };
      }
    },

    /**
     * Record a finished run. Only ever raises the stored bests. Accuracy only
     * counts from a run with at least one hit, so an idle run can't claim 100%.
     *
     * @param {{ score: number, bestCombo: number, accuracy: number, hits: number }} result
     * @returns {{ isNewBest: boolean, best: { score: number, combo: number, accuracy: number } }}
     */
    saveResult({ score, bestCombo, accuracy, hits }) {
      const previous = this.getBest();
      const finalScore = safeCount(score);
      const isNewBest = finalScore > previous.score;
      const best = {
        score: Math.max(previous.score, finalScore),
        combo: Math.max(previous.combo, safeCount(bestCombo)),
        accuracy: safeCount(hits) > 0 ? Math.max(previous.accuracy, Math.min(safeCount(accuracy), 100)) : previous.accuracy,
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

export { KEY as SPACE_STORAGE_KEY };
