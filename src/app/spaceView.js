// Draws the Space Tap arena: targets appearing and leaving, and the hit /
// miss effects. Reports taps; no game rules in here.
//
// Mouse and touch go through one Pointer Events handler (pointerdown, the
// earliest moment of a tap). With the keyboard, the number keys 1–4 tap the
// target showing that number.
//
// Positions come in as x, y in [0, 1); the CSS maps them inside the arena
// with room for the whole target, so none pokes out of it.

import { KINDS } from '../space/config.js';
import { comboTier } from './effects.js';

/**
 * @param {HTMLElement} field  the arena (receives taps)
 * @param {HTMLElement} fx     overlay for effects, same box as the arena
 * @param {{ onTap: (tap: { targetId: ?number, x: ?number, y: ?number }) => void, onKey: (slot: number) => void, reducedMotion: () => boolean }} options
 */
export function createSpaceView(field, fx, { onTap, onKey, reducedMotion }) {
  const shown = new Map(); // target id → button
  let locked = true;

  field.addEventListener('pointerdown', (event) => {
    if (locked || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.preventDefault(); // no text selection, no double-tap zoom, focus stays on the arena
    const button = event.target.closest('.st-target');
    const box = field.getBoundingClientRect();
    onTap({ targetId: button && !button.classList.contains('is-gone') ? Number(button.dataset.id) : null, x: event.clientX - box.left, y: event.clientY - box.top });
  });

  field.addEventListener('keydown', (event) => {
    if (/^[1-4]$/.test(event.key)) {
      event.preventDefault();
      if (!locked && !event.repeat) {
        onKey(Number(event.key));
      }
    }
  });

  /** A new target pops in; a ring around it runs down over its life. */
  function addTarget(target) {
    const kind = KINDS[target.kind];
    const button = document.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.className = 'st-target';
    button.dataset.id = String(target.id);
    button.dataset.kind = target.kind;
    button.style.setProperty('--x', String(target.x));
    button.style.setProperty('--y', String(target.y));
    button.style.setProperty('--life', `${target.expiresAt - target.bornAt}ms`);
    button.setAttribute('aria-label', kind.decoy ? `${kind.name}: do not tap (key ${target.slot})` : `${kind.name}${kind.bonus ? ', bonus' : ''}: tap (key ${target.slot})`);
    button.innerHTML = `<span class="st-life"></span><span class="st-icon" aria-hidden="true">${kind.icon}</span><span class="st-key" aria-hidden="true">${target.slot}</span>${kind.bonus ? '<span class="st-tag" aria-hidden="true">BONUS</span>' : ''}`;
    field.append(button);
    shown.set(target.id, button);
  }

  /** Take a target away: popped by a hit, blown up (mine), faded (expired), or just gone. */
  function removeTarget(id, how) {
    const button = shown.get(id);
    if (!button) {
      return;
    }
    shown.delete(id);
    button.classList.add('is-gone');
    const keyframes = reducedMotion() || how === 'vanish'
      ? [{ opacity: 1 }, { opacity: 0 }]
      : {
        hit: [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }],
        decoy: [{ transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' }, { transform: 'scale(1.3)', opacity: 0, filter: 'brightness(2)' }],
        expire: [{ transform: 'scale(1)', opacity: 0.8 }, { transform: 'scale(0.3)', opacity: 0 }],
      }[how];
    button.animate(keyframes, { duration: how === 'hit' ? 180 : 260, easing: 'ease-out' }).onfinish = () => button.remove();
  }

  /** "+100 NICE!" or "+250 BONUS!", a burst and a few sparks with trails. */
  function showHit(target, points, bonus) {
    const reduced = reducedMotion();
    const tone = bonus ? 'bonus' : 'hit';

    if (!reduced) {
      const burst = anchor(target, 'st-burst', tone);
      burst.animate([{ transform: 'scale(0.5)', opacity: 1 }, { transform: 'scale(2.2)', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.2,.7,.3,1)' })
        .onfinish = () => burst.remove();

      const sparks = bonus ? 12 : 8;
      for (let i = 0; i < sparks; i++) {
        const angle = (i / sparks) * Math.PI * 2;
        const spark = anchor(target, 'st-spark', tone);
        spark.style.setProperty('--a', `${angle}rad`);
        spark.animate(
          [{ transform: `rotate(${angle}rad) translateX(0) scaleX(1)`, opacity: 1 }, { transform: `rotate(${angle}rad) translateX(${bonus ? 80 : 60}px) scaleX(0.3)`, opacity: 0 }],
          { duration: 460, easing: 'cubic-bezier(.2,.7,.3,1)' },
        ).onfinish = () => spark.remove();
      }
    }

    floatText(target, tone, `+${points.toLocaleString('en-US')}`, bonus ? 'BONUS!' : 'NICE!');
  }

  function showDecoy(target) {
    if (!reducedMotion()) {
      const burst = anchor(target, 'st-burst', 'miss');
      burst.animate([{ transform: 'scale(0.6)', opacity: 1 }, { transform: 'scale(2)', opacity: 0 }], { duration: 380, easing: 'ease-out' }).onfinish = () => burst.remove();
      field.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 220 });
    }
    floatText(target, 'miss', 'MISS', 'COMBO LOST');
  }

  function showTooSlow(target) {
    floatText(target, 'slow', 'TOO SLOW');
  }

  /** A tap on empty space: a small fading ring where it landed. */
  function showEmpty(x, y) {
    if (x === null) {
      return;
    }
    const ripple = document.createElement('div');
    ripple.className = 'st-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    fx.append(ripple);
    ripple.animate(
      reducedMotion() ? [{ opacity: 0.8 }, { opacity: 0 }] : [{ transform: 'scale(0.3)', opacity: 0.9 }, { transform: 'scale(1.3)', opacity: 0 }],
      { duration: 340, easing: 'ease-out' },
    ).onfinish = () => ripple.remove();
  }

  /** A "COMBO x8" banner at x3, x5, x8, x10 and every 5 after. */
  function showCombo(combo) {
    if (![3, 5, 8, 10].includes(combo) && !(combo > 10 && combo % 5 === 0)) {
      return;
    }
    const tier = comboTier(combo);

    fx.querySelector('.combo-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'combo-banner';
    banner.dataset.tier = String(tier);
    banner.innerHTML = `<b>COMBO x${combo}</b>${combo >= 5 ? '<small>2× POINTS</small>' : ''}`;
    fx.append(banner);

    banner.animate(
      reducedMotion()
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
        : [
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
          { transform: `translate(-50%, -50%) scale(${[1.05, 1.1, 1.2, 1.3][tier]})`, opacity: 1, offset: 0.2 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.65 },
          { transform: 'translate(-50%, -80%) scale(1)', opacity: 0 },
        ],
      { duration: 800, easing: 'ease-out' },
    ).onfinish = () => banner.remove();
  }

  function setLocked(value) {
    locked = value;
    field.classList.toggle('is-locked', value);
    field.setAttribute('aria-disabled', String(value));
  }

  function focus() {
    field.focus({ preventScroll: true });
  }

  /** Remove every target and effect. */
  function clear() {
    shown.forEach((button) => button.remove());
    shown.clear();
    fx.replaceChildren();
  }

  /** An effect placed at a target's spot. */
  function anchor(target, className, tone) {
    const node = document.createElement('div');
    node.className = `st-at ${className}`;
    node.dataset.tone = tone;
    node.style.setProperty('--x', String(target.x));
    node.style.setProperty('--y', String(target.y));
    fx.append(node);

    return node;
  }

  function floatText(target, tone, big, small = '') {
    const float = anchor(target, 'st-float', tone);
    float.innerHTML = `<b>${big}</b>${small ? `<small>${small}</small>` : ''}`;
    float.animate(
      reducedMotion()
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }]
        : [
          { transform: 'translateY(0) scale(0.7)', opacity: 0 },
          { transform: 'translateY(-10px) scale(1.1)', opacity: 1, offset: 0.2 },
          { transform: 'translateY(-34px) scale(1)', opacity: 0 },
        ],
      { duration: 700, easing: 'ease-out' },
    ).onfinish = () => float.remove();
  }

  return { addTarget, removeTarget, showHit, showDecoy, showTooSlow, showEmpty, showCombo, setLocked, focus, clear };
}
