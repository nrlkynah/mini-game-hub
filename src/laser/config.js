// Laser Dodge rules in one place. Everything here is plain data, no DOM.
//
// Distances are in arena units: the arena is always ARENA_HEIGHT units tall
// and ARENA_HEIGHT × aspect wide (the aspect is fixed when a run starts), so
// collisions work the same on every screen.

export const ARENA_HEIGHT = 100;
export const MIN_ASPECT = 0.5;
export const MAX_ASPECT = 2;

export const LIVES = 3;

/** The player: a small orb. */
export const PLAYER_RADIUS = 3;
/** Keyboard speed, in units per second (crosses the arena in under two seconds). */
export const PLAYER_SPEED = 55;
/** After a hit, no more damage for this long. */
export const INVULNERABLE_MS = 1000;

/** Half the thickness of a laser beam. */
export const BEAM_HALF_WIDTH = 2.5;
/** Every laser shows a warning, then charges (CHARGE_MS), then fires. */
export const CHARGE_MS = 300;
/** The first wave comes this long after GO!. */
export const FIRST_WAVE_MS = 1200;
/** Lasers of the same direction in one wave stay at least this far apart, so there is always a gap. */
export const MIN_GAP = 28;

/** A sweeping laser turns this far (degrees) from a corner, over SWEEP_ACTIVE_MS. */
export const SWEEP_SPAN_DEG = 60;
export const SWEEP_ACTIVE_MS = 1400;

/** Passing a beam this close (beyond touching it) without being hit is a near miss. */
export const NEAR_MISS_MARGIN = 4;
export const NEAR_MISS_POINTS = 50;

/** Points come every POINTS_EVERY_MS survived: the phase's points, + STREAK_BONUS per survival step above x1. */
export const POINTS_EVERY_MS = 100;
export const STREAK_BONUS = 5;
/** Survival streak: one step up for every STREAK_EVERY_MS without a hit, up to MAX_STREAK. */
export const STREAK_EVERY_MS = 5000;
export const MAX_STREAK = 8;

/**
 * Difficulty phases by survival time. Each phase sends waves of lasers in a
 * fixed order (`waves`, repeating): h horizontal, v vertical, d diagonal,
 * sweep sweeping. Later phases: shorter warnings, waves sooner, more lasers.
 */
export const PHASES = [
  { key: 'easy', label: 'EASY', until: 10_000, everyMs: 1500, warnMs: 1100, activeMs: 650, points: 10, waves: [['h'], ['v']] },
  { key: 'medium', label: 'MEDIUM', until: 20_000, everyMs: 1300, warnMs: 1000, activeMs: 700, points: 15, waves: [['h'], ['v'], ['d'], ['h', 'v']] },
  { key: 'hard', label: 'HARD', until: 30_000, everyMs: 1150, warnMs: 900, activeMs: 700, points: 20, waves: [['sweep'], ['d'], ['h', 'v'], ['v', 'v'], ['h', 'd']] },
  { key: 'extreme', label: 'EXTREME', until: Infinity, everyMs: 1000, warnMs: 850, activeMs: 750, points: 30, waves: [['h', 'v'], ['sweep', 'h'], ['d', 'd'], ['v', 'v', 'h'], ['sweep', 'v']] },
];

/** In EXTREME, waves keep coming a little sooner: −EXTREME_DROP_MS every EXTREME_STEP_MS, down to EXTREME_MIN_EVERY_MS. */
export const EXTREME_STEP_MS = 5000;
export const EXTREME_DROP_MS = 25;
export const EXTREME_MIN_EVERY_MS = 750;
