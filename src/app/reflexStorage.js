// Neon Reflex personal bests, in localStorage. Same rules as storage.js:
// everything read back is validated, and a missing or blocked localStorage
// just means nothing is remembered.
//
// Sound and motion are global settings (see settings.js).

import { readJson, safeCount, safeLocalStorage, writeJson } from './safeStorage.js';

const KEY = 'mgh.neonReflex.best.v1';

/**
 * @param {Storage|null} backend window.localStorage, or a stand-in in tests
 */
export function createReflexStorage(backend = safeLocalStorage()) {
  return {
    /** @returns {{ score: number, reaction: number, combo: number }} reaction 0 = none yet */
    getBest() {
      const data = readJson(backend, KEY);

      return { score: safeCount(data?.score), reaction: safeCount(data?.reaction), combo: safeCount(data?.combo) };
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
      writeJson(backend, KEY, best);

      return { isNewBest, isNewReaction, best };
    },
  };
}

export { KEY as REFLEX_STORAGE_KEY };
