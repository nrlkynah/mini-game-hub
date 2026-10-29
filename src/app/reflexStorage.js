// Neon Reflex personal bests, in localStorage. Same rules as storage.js:
// everything read back is validated, and a missing or blocked localStorage
// just means nothing is remembered.
//
// Sound and motion preferences are shared with Color Chaos (see storage.js).

const KEY = 'mgh.neonReflex.best.v1';

/**
 * @param {Storage|null} backend window.localStorage, or a stand-in in tests
 */
export function createReflexStorage(backend = safeLocalStorage()) {
  return {
    /** @returns {{ score: number, reaction: number, combo: number }} reaction 0 = none yet */
    getBest() {
      try {
        const data = JSON.parse(backend?.getItem(KEY) ?? 'null');

        return { score: safeCount(data?.score), reaction: safeCount(data?.reaction), combo: safeCount(data?.combo) };
      } catch {
        return { score: 0, reaction: 0, combo: 0 };
      }
    },

    /**
     * Record a finished game. Only ever improves the stored bests: a higher
     * score, a faster reaction, a longer combo.
     *
     * @param {{ score: number, bestReaction: ?number, bestCombo: number }} result
     * @returns {{ isNewBest: boolean, isNewReaction: boolean, best: { score: number, reaction: number, combo: number } }}
     */
    saveResult({ score, bestReaction, bestCombo }) {
      const previous = this.getBest();
      const finalScore = safeCount(score);
      const reaction = safeCount(bestReaction);
      const isNewBest = finalScore > previous.score;
      const isNewReaction = reaction > 0 && (previous.reaction === 0 || reaction < previous.reaction);
      const best = {
        score: Math.max(previous.score, finalScore),
        reaction: isNewReaction ? reaction : previous.reaction,
        combo: Math.max(previous.combo, safeCount(bestCombo)),
      };
      try {
        backend?.setItem(KEY, JSON.stringify(best));
      } catch {
        // Full or blocked: keep playing without saving.
      }

      return { isNewBest, isNewReaction, best };
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

export { KEY as REFLEX_STORAGE_KEY };
