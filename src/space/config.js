// Space Tap rules in one place. Everything here is plain data, no DOM.

/** Length of a run, in milliseconds. */
export const DURATION_MS = 30_000;
export const WARNING_MS = 5_000;

/** The first target appears this long after GO!. */
export const FIRST_SPAWN_MS = 300;

/**
 * Three phases of ten seconds. Later phases spawn faster, targets live
 * shorter, decoys come more often and bonus comets less often.
 *
 * Decoys and comets are not random: every `decoyEvery`-th target is a decoy
 * and every `bonusEvery`-th a comet, so every run is equally fair.
 */
export const PHASES = [
  { key: 'easy', label: 'EASY', until: 10_000, spawnEveryMs: 850, lifeMs: 1900, maxTargets: 3, decoyEvery: 7, bonusEvery: 6 },
  { key: 'medium', label: 'MEDIUM', until: 20_000, spawnEveryMs: 680, lifeMs: 1600, maxTargets: 4, decoyEvery: 5, bonusEvery: 8 },
  { key: 'hard', label: 'HARD', until: Infinity, spawnEveryMs: 560, lifeMs: 1350, maxTargets: 4, decoyEvery: 4, bonusEvery: 10 },
];

/** Target kinds. Comets are the bonus; mines are decoys (never tap them). */
export const KINDS = {
  star: { name: 'Star', points: 100, icon: '⭐' },
  planet: { name: 'Planet', points: 100, icon: '🪐' },
  comet: { name: 'Comet', points: 250, icon: '☄️', bonus: true },
  mine: { name: 'Space mine', points: 0, icon: '💣', decoy: true },
};

/**
 * Combo multiplier in tenths (integers only): x1 = 1.0, x2 = 1.2, x3 = 1.4,
 * x4 = 1.6, x5 and up = 2.0.
 */
export const MULTIPLIER_TENTHS = [10, 10, 12, 14, 16, 20];

/** Target centres stay at least this far apart (as a fraction of the arena). */
export const MIN_SPREAD = 0.3;
