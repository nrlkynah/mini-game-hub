// Global settings for the whole hub: sound and motion. One shared instance;
// every game reads it, and the Settings dialog (and the Color Chaos toggles)
// change it.
//
// Motion ON still follows the device's prefers-reduced-motion setting; OFF
// always reduces motion. The result goes on <html data-motion="reduced|full">
// for the CSS, and isReducedMotion() for animations started from JS.
//
// Saved through storage.js (localStorage keys mgh.sound and mgh.motion; motion
// is stored as 'system' for ON and 'reduced' for OFF, as before).

import { createStorage } from './storage.js';

/**
 * The settings logic, testable without a browser.
 *
 * @param {ReturnType<typeof createStorage>} storage
 * @param {() => boolean} prefersReduced  the device asks for reduced motion
 */
export function createSettings(storage, prefersReduced = () => false) {
  const listeners = new Set();
  let sound = storage.getSound();
  let motion = storage.getMotion() !== 'reduced'; // 'system' and the older 'full' both mean ON

  const settings = {
    get sound() { return sound; },
    get motion() { return motion; },

    setSound(on) {
      sound = Boolean(on);
      storage.setSound(sound);
      notify();
    },
    setMotion(on) {
      motion = Boolean(on);
      storage.setMotion(motion ? 'system' : 'reduced');
      notify();
    },

    /** True when animations should be calmed down: Motion OFF, or the device asks for it. */
    isReducedMotion() {
      return !motion || prefersReduced();
    },
    deviceReducesMotion() {
      return prefersReduced();
    },

    /** Call `fn(settings)` now and after every change. Returns an unsubscribe function. */
    subscribe(fn) {
      listeners.add(fn);
      fn(settings);

      return () => listeners.delete(fn);
    },
    /** Tell every listener to re-read (e.g. the device setting changed). */
    refresh: () => notify(),
  };

  function notify() {
    listeners.forEach((fn) => fn(settings));
  }

  return settings;
}

const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** The one shared instance used by the whole hub. */
export const settings = createSettings(createStorage(), () => Boolean(motionQuery?.matches));

motionQuery?.addEventListener?.('change', settings.refresh);
if (typeof document !== 'undefined') {
  settings.subscribe((s) => {
    document.documentElement.dataset.motion = s.isReducedMotion() ? 'reduced' : 'full';
  });
}
