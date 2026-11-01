// Collision between the player orb and a laser beam. Pure functions only.

import { NEAR_MISS_MARGIN, PLAYER_RADIUS } from './config.js';
import { laserAngle, laserPhase } from './lasers.js';

/** Distance from a point to the beam's centre line at time `now`. */
export function distanceToBeam(point, laser, now) {
  const angle = laserAngle(laser, now);

  return Math.abs((point.x - laser.x) * Math.sin(angle) - (point.y - laser.y) * Math.cos(angle));
}

/** True when the orb touches the beam and the beam is firing (warnings and charging never hurt). */
export function touches(point, laser, now) {
  return laserPhase(laser, now) === 'active' && distanceToBeam(point, laser, now) <= laser.halfWidth + PLAYER_RADIUS;
}

/** True when a beam that never touched the orb came within NEAR_MISS_MARGIN of it. */
export function isNearMiss(laser) {
  return !laser.touched && laser.minDistance <= laser.halfWidth + PLAYER_RADIUS + NEAR_MISS_MARGIN;
}
