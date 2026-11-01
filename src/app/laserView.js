// Draws the Laser Dodge arena: the player orb, the lasers going through
// warning → charge → active, and the hit / near-miss effects. Reports drags;
// no game rules in here.
//
// The play field keeps the run's shape (arena units) and is scaled to fit the
// space on screen, so the same run works on a phone and on a desktop.
// Touch and mouse: drag anywhere in the arena and the orb moves the same
// distance (no on-screen joystick, and the finger never hides the orb).

import { PLAYER_RADIUS } from '../laser/config.js';
import { laserAngle, laserPhase } from '../laser/lasers.js';
import { comboTier } from './effects.js';

/**
 * @param {HTMLElement} arena   the space for the game (receives drags)
 * @param {HTMLElement} field   the scaled play field inside it
 * @param {HTMLElement} player  the orb, inside the field
 * @param {HTMLElement} fx      overlay for effects, inside the field
 * @param {{ onDrag: (dx: number, dy: number) => void, reducedMotion: () => boolean }} options
 */
export function createLaserView(arena, field, player, fx, { onDrag, reducedMotion }) {
  const shown = new Map(); // laser id → { beam, sector }
  let units = { width: 100, height: 100 };
  let scale = 1;
  let locked = true;
  let drag = null;
  let last = null;

  new ResizeObserver(() => {
    layout();
    if (last) {
      render(last);
    }
  }).observe(arena);

  arena.addEventListener('pointerdown', (event) => {
    if (locked || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.preventDefault(); // no scrolling, selection or zoom while dragging
    arena.setPointerCapture?.(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    arena.classList.add('is-dragging');
  });
  arena.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) {
      return;
    }
    onDrag((event.clientX - drag.x) / scale, (event.clientY - drag.y) / scale);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  const stop = () => {
    drag = null;
    arena.classList.remove('is-dragging');
  };
  arena.addEventListener('pointerup', stop);
  arena.addEventListener('pointercancel', stop);

  /** The shape of the space on screen (width ÷ height), to start a run with. */
  function aspect() {
    const box = arena.getBoundingClientRect();

    return box.height > 0 ? box.width / box.height : 1;
  }

  /** Use this run's arena size (in units) and fit it on screen. */
  function setArena(size) {
    units = size;
    layout();
  }

  function layout() {
    const box = arena.getBoundingClientRect();
    scale = Math.max(0.1, Math.min(box.width / units.width, box.height / units.height));
    field.style.width = `${units.width * scale}px`;
    field.style.height = `${units.height * scale}px`;
    field.style.setProperty('--orb', `${PLAYER_RADIUS * 2 * scale}px`);
  }

  /** Place the orb and every laser for this moment of the run. */
  function render(state) {
    last = state;
    const now = state.elapsedMs;
    player.style.transform = `translate(${state.player.x * scale}px, ${state.player.y * scale}px)`;
    player.classList.toggle('is-safe', now < state.invulnerableUntil);
    player.nextElementSibling.style.transform = player.style.transform; // the trail follows a moment behind

    const length = Math.hypot(units.width, units.height) * 2 * scale;
    const live = new Set();
    for (const laser of state.lasers) {
      live.add(laser.id);
      let parts = shown.get(laser.id);
      if (!parts) {
        parts = addLaser(laser);
        shown.set(laser.id, parts);
      }
      const phase = laserPhase(laser, now);
      const x = laser.x * scale;
      const y = laser.y * scale;
      const thickness = laser.halfWidth * 2 * scale;
      parts.beam.dataset.phase = phase;
      parts.beam.dataset.x = x.toFixed(1);
      parts.beam.dataset.y = y.toFixed(1);
      parts.beam.style.width = `${length}px`;
      parts.beam.style.height = `${thickness}px`;
      parts.beam.style.margin = `${-thickness / 2}px 0 0 ${-length / 2}px`;
      parts.beam.style.transform = `translate(${x}px, ${y}px) rotate(${laserAngle(laser, now)}rad)`;
      if (parts.sector) {
        parts.sector.hidden = phase === 'active';
        parts.sector.style.width = parts.sector.style.height = `${length}px`;
        parts.sector.style.margin = `${-length / 2}px 0 0 ${-length / 2}px`;
        parts.sector.style.transform = `translate(${x}px, ${y}px)`;
      }
    }

    for (const [id, parts] of shown) {
      if (!live.has(id)) {
        shown.delete(id);
        fade(parts.beam);
        parts.sector?.remove();
      }
    }
  }

  function addLaser(laser) {
    const beam = document.createElement('div');
    beam.className = 'ld-laser';
    beam.dataset.id = String(laser.id);
    beam.dataset.kind = laser.kind;
    beam.innerHTML = '<span class="ld-core"></span>';
    field.insertBefore(beam, player);

    let sector = null;
    if (laser.kind === 'sweep') {
      // The area the sweep will cover, shown while it warns and charges.
      const from = Math.min(laser.angle, laser.angleTo) * (180 / Math.PI) + 90; // CSS conic angles start at the top
      const span = Math.abs(laser.angleTo - laser.angle) * (180 / Math.PI);
      sector = document.createElement('div');
      sector.className = 'ld-sector';
      sector.style.background = `conic-gradient(from ${from}deg, rgba(255, 61, 113, 0.18) 0deg ${span}deg, transparent ${span}deg)`;
      field.insertBefore(sector, beam);
    }

    return { beam, sector };
  }

  function fade(node) {
    node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion() ? 1 : 180 }).onfinish = () => node.remove();
  }

  /** HIT!: a flash, a small shake, sparks from the orb. */
  function showHit(at) {
    const reduced = reducedMotion();
    const flash = add('ld-flash');
    flash.animate([{ opacity: reduced ? 0.4 : 0.75 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' }).onfinish = () => flash.remove();

    if (!reduced) {
      field.animate(
        [{ transform: 'translate(0, 0)' }, { transform: 'translate(-6px, 3px)' }, { transform: 'translate(5px, -4px)' }, { transform: 'translate(-3px, 2px)' }, { transform: 'translate(0, 0)' }],
        { duration: 280, easing: 'ease-out' },
      );
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const spark = point(at, 'ld-spark');
        spark.animate(
          [{ transform: `rotate(${angle}rad) translateX(0)`, opacity: 1 }, { transform: `rotate(${angle}rad) translateX(${46 + (i % 3) * 10}px)`, opacity: 0 }],
          { duration: 480, easing: 'cubic-bezier(.2,.7,.3,1)' },
        ).onfinish = () => spark.remove();
      }
    }

    floatText(at, 'hit', 'HIT!', '−1 ❤');
  }

  function showNearMiss(at, points) {
    floatText(at, 'near', `+${points}`, 'NEAR MISS');
  }

  /** "SURVIVAL x3" banner. */
  function showStreak(streak) {
    const tier = comboTier(streak);
    fx.querySelector('.combo-banner')?.remove();
    const banner = add('combo-banner');
    banner.dataset.tier = String(tier);
    banner.innerHTML = `<b>SURVIVAL x${streak}</b><small>+${(streak - 1) * 5} PER 0.1 s</small>`;
    banner.animate(
      reducedMotion()
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
        : [
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1, offset: 0.2 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.7 },
          { transform: 'translate(-50%, -80%) scale(1)', opacity: 0 },
        ],
      { duration: 1000, easing: 'ease-out' },
    ).onfinish = () => banner.remove();
  }

  function setLocked(value) {
    locked = value;
    if (value) {
      stop();
    }
    arena.classList.toggle('is-locked', value);
    arena.setAttribute('aria-disabled', String(value));
  }

  function focus() {
    arena.focus({ preventScroll: true });
  }

  /** Remove every laser and effect. */
  function clear() {
    shown.forEach((parts) => {
      parts.beam.remove();
      parts.sector?.remove();
    });
    shown.clear();
    fx.replaceChildren();
    last = null;
  }

  function add(className) {
    const node = document.createElement('div');
    node.className = className;
    fx.append(node);

    return node;
  }

  function point(at, className) {
    const node = add(className);
    node.style.left = `${at.x * scale}px`;
    node.style.top = `${at.y * scale}px`;

    return node;
  }

  function floatText(at, tone, big, small) {
    const float = point(at, 'ld-float');
    float.dataset.tone = tone;
    float.innerHTML = `<b>${big}</b><small>${small}</small>`;
    float.animate(
      reducedMotion()
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }]
        : [{ transform: 'translateY(0) scale(0.7)', opacity: 0 }, { transform: 'translateY(-14px) scale(1.1)', opacity: 1, offset: 0.2 }, { transform: 'translateY(-40px) scale(1)', opacity: 0 }],
      { duration: 800, easing: 'ease-out' },
    ).onfinish = () => float.remove();
  }

  return { aspect, setArena, render, showHit, showNearMiss, showStreak, setLocked, focus, clear };
}
