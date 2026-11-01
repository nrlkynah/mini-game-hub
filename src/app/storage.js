// Saved preferences and personal bests, in localStorage.
//
// Everything read back is validated: a missing, corrupted or tampered value
// falls back to a safe default instead of breaking the game. If localStorage
// is unavailable (private mode, blocked), the game still works; it just does
// not remember anything.

import { readJson, safeCount, safeLocalStorage, writeJson } from './safeStorage.js';

const KEYS = {
  best: 'mgh.colorChaos.best.v1',
  sound: 'mgh.sound',
  motion: 'mgh.motion',
};

const MOTION_VALUES = ['system', 'reduced', 'full'];

/**
 * @param {Storage|null} backend window.localStorage, or a stand-in in tests
 */
export function createStorage(backend = safeLocalStorage()) {
  const read = (key) => {
    try {
      return backend ? backend.getItem(key) : null;
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      backend?.setItem(key, value);
    } catch {
      // Full or blocked: keep playing without saving.
    }
  };

  return {
    /** @returns {{ score: number, combo: number }} */
    getBest() {
      const data = readJson(backend, KEYS.best);

      return { score: safeCount(data?.score), combo: safeCount(data?.combo) };
    },

    /**
     * Record a finished round. Only ever raises the stored bests.
     *
     * @returns {{ isNewBest: boolean, best: { score: number, combo: number } }}
     */
    saveResult({ score, bestCombo }) {
      const previous = this.getBest();
      const finalScore = safeCount(score);
      const isNewBest = finalScore > previous.score;
      const best = {
        score: Math.max(previous.score, finalScore),
        combo: Math.max(previous.combo, safeCount(bestCombo)),
      };
      writeJson(backend, KEYS.best, best);

      return { isNewBest, best };
    },

    /** Sound is on unless the player turned it off. */
    getSound() {
      return read(KEYS.sound) !== 'off';
    },
    setSound(on) {
      write(KEYS.sound, on ? 'on' : 'off');
    },

    /** 'system' (follow the device setting), 'reduced' or 'full'. */
    getMotion() {
      const value = read(KEYS.motion);

      return MOTION_VALUES.includes(value) ? value : 'system';
    },
    setMotion(value) {
      write(KEYS.motion, MOTION_VALUES.includes(value) ? value : 'system');
    },
  };
}

export { KEYS as STORAGE_KEYS };
