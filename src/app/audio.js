// Sound effects, made on the fly with the Web Audio API (no audio files).
//
// Nothing is created or played until unlock() is called from a user gesture
// (the Play button), so the page never autoplays sound. If Web Audio is not
// available, or sound is off, every function quietly does nothing.

export function createAudio() {
  let context = null;
  let enabled = true;

  const tone = (frequency, { at = 0, duration = 0.12, type = 'sine', volume = 0.18, slideTo = null } = {}) => {
    if (!enabled || !context) {
      return;
    }

    const start = context.currentTime + at;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(context.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  return {
    /** Call from a click/tap handler. Safe to call more than once. */
    unlock() {
      if (!enabled) {
        return;
      }
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!context && AudioContext) {
          context = new AudioContext();
        }
        if (context?.state === 'suspended') {
          context.resume();
        }
      } catch {
        context = null;
      }
    },

    /** Never creates the audio context itself; only unlock() (a user gesture) does. */
    setEnabled(on) {
      enabled = on;
      if (on && context?.state === 'suspended') {
        context.resume();
      }
    },

    countdown() {
      tone(520, { duration: 0.12, type: 'triangle' });
    },
    go() {
      tone(780, { duration: 0.22, type: 'triangle', volume: 0.22 });
    },
    /** Higher pitch for bigger combos. */
    match(combo, size) {
      const base = 440 * 2 ** (Math.min(combo, 10) / 12);
      tone(base, { duration: 0.1, type: 'triangle' });
      tone(base * 1.5, { at: 0.05, duration: 0.12, type: 'sine', volume: size >= 5 ? 0.2 : 0.12 });
    },
    combo(combo) {
      tone(660 + combo * 40, { duration: 0.16, type: 'square', volume: 0.07, slideTo: 990 + combo * 60 });
    },
    invalid() {
      tone(180, { duration: 0.12, type: 'sawtooth', volume: 0.06, slideTo: 120 });
    },
    warning() {
      tone(880, { duration: 0.06, type: 'square', volume: 0.06 });
    },
    gameOver() {
      [660, 520, 392].forEach((f, i) => tone(f, { at: i * 0.14, duration: 0.18, type: 'triangle' }));
    },
    newBest() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, { at: 0.5 + i * 0.1, duration: 0.16, type: 'triangle', volume: 0.16 }));
    },
  };
}
