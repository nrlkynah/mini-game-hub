// A tiny seeded random number generator (mulberry32).
//
// The generator's state is a plain 32-bit integer that is passed in and
// returned, never hidden in a closure, so the game logic stays pure: the same
// seed and the same moves always give the same boards.

/**
 * @param {number} seed 32-bit state
 * @returns {[number, number]} [value in [0, 1), next state]
 */
export function nextRandom(seed) {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(next ^ (next >>> 15), next | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);

  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
}

/**
 * @param {number} seed
 * @param {number} max exclusive upper bound
 * @returns {[number, number]} [integer in [0, max), next state]
 */
export function randomInt(seed, max) {
  const [value, next] = nextRandom(seed);

  return [Math.floor(value * max), next];
}

/** Turn any number into a valid 32-bit seed. */
export function toSeed(value) {
  return Number.isFinite(value) ? Math.abs(Math.trunc(value)) >>> 0 : 1;
}
