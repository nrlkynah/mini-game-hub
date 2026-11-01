// Lasers: the four patterns, their warning → charge → active life, and where
// a beam is at a given moment. Pure functions only.
//
// A beam is a straight line through (x, y) at `angle` (radians, clockwise
// from pointing right, as on screen). A sweeping beam turns around a corner
// from `angle` to `angleTo` while it is active.

import { BEAM_HALF_WIDTH, CHARGE_MS, MIN_GAP, SWEEP_ACTIVE_MS, SWEEP_SPAN_DEG } from './config.js';
import { nextRandom } from '../game/rng.js';

const DEG = Math.PI / 180;

/** 'warning', 'charge', 'active' or 'done' at time `now`. */
export function laserPhase(laser, now) {
  if (now < laser.chargeAt) {
    return 'warning';
  }
  if (now < laser.activeAt) {
    return 'charge';
  }

  return now < laser.endAt ? 'active' : 'done';
}

/** The beam's angle at `now` (only a sweeping beam turns, and only while active). */
export function laserAngle(laser, now) {
  if (laser.kind !== 'sweep' || now <= laser.activeAt) {
    return laser.angle;
  }
  const t = Math.min(1, (now - laser.activeAt) / (laser.endAt - laser.activeAt));

  return laser.angle + (laser.angleTo - laser.angle) * t;
}

/**
 * New lasers for one wave. The first beam is aimed near the player (so
 * standing still is not safe); beams of the same direction keep MIN_GAP apart
 * so there is always a way through.
 *
 * @param {string[]} kinds  e.g. ['h', 'v']
 * @returns {[object[], number]} [lasers, next rng state]
 */
export function createWave(kinds, { rng, arena, player, now, phase, firstId }) {
  const lasers = [];

  kinds.forEach((kind, i) => {
    let laser;
    [laser, rng] = createLaser(kind, { rng, arena, player, aimed: i === 0, others: lasers });
    const activeMs = kind === 'sweep' ? SWEEP_ACTIVE_MS : phase.activeMs;
    lasers.push({
      id: firstId + i,
      kind,
      ...laser,
      halfWidth: BEAM_HALF_WIDTH,
      warnAt: now,
      chargeAt: now + phase.warnMs,
      activeAt: now + phase.warnMs + CHARGE_MS,
      endAt: now + phase.warnMs + CHARGE_MS + activeMs,
      touched: false,
      minDistance: Infinity,
    });
  });

  return [lasers, rng];
}

/** Geometry for one laser of `kind`. */
function createLaser(kind, { rng, arena, player, aimed, others }) {
  const { width, height } = arena;
  let r;

  if (kind === 'sweep') {
    // From one corner, turning SWEEP_SPAN_DEG into the arena, starting along one edge.
    const corners = [[0, 0, 0], [width, 0, 90], [width, height, 180], [0, height, 270]]; // [x, y, first inward direction]
    [r, rng] = nextRandom(rng);
    const [x, y, base] = corners[Math.floor(r * 4)];
    [r, rng] = nextRandom(rng);
    const clockwise = r < 0.5;
    const from = clockwise ? base + 5 : base + 85;
    const to = clockwise ? from + SWEEP_SPAN_DEG : from - SWEEP_SPAN_DEG;

    return [{ x, y, angle: from * DEG, angleTo: to * DEG }, rng];
  }

  const angle = { h: 0, v: 90 * DEG, d: 0 }[kind];
  let best = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    let a;
    let b;
    [a, rng] = nextRandom(rng);
    [b, rng] = nextRandom(rng);
    let laser;
    if (kind === 'h') {
      laser = { x: width / 2, y: aimed ? clamp(player.y + (a - 0.5) * 36, 6, height - 6) : 6 + a * (height - 12), angle };
    } else if (kind === 'v') {
      laser = { x: aimed ? clamp(player.x + (a - 0.5) * 36, 6, width - 6) : 6 + a * (width - 12), y: height / 2, angle };
    } else {
      // Diagonal: 45° one way or the other, through a point near the player (or anywhere).
      const slope = b < 0.5 ? 45 * DEG : 135 * DEG;
      const point = aimed
        ? { x: clamp(player.x + (a - 0.5) * 30, 0, width), y: player.y }
        : { x: width * (0.2 + 0.6 * a), y: height * (0.2 + 0.6 * b) };
      laser = { ...point, angle: slope };
    }

    const gap = others
      .filter((o) => o.angle === laser.angle && o.kind !== 'sweep')
      .reduce((min, o) => Math.min(min, lineGap(o, laser)), Infinity);
    if (!best || gap > best.gap) {
      best = { laser, gap };
    }
    if (gap >= MIN_GAP) {
      break;
    }
  }

  return [best.laser, rng];
}

/** Distance between two parallel beams. */
export function lineGap(a, b) {
  return Math.abs((b.x - a.x) * Math.sin(a.angle) - (b.y - a.y) * Math.cos(a.angle));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
