// Draws the Neon Reflex arena: the target and the hit / miss effects, and
// reports presses. No game rules in here.
//
// Mouse and touch go through one Pointer Events handler (pointerdown, the
// earliest moment of a press). With the keyboard, Space or Enter on the
// focused arena is a press on the target.
//
// Positions come in as x, y in [0, 1); the CSS maps them inside the field
// with room for the whole target, so it never pokes out of the arena.

import { comboTier } from './boardView.js';

/**
 * @param {HTMLElement} field   the arena (receives presses)
 * @param {HTMLElement} fx      overlay for effects, same box as the field
 * @param {HTMLElement} target  the target button inside the field
 * @param {{ onPress: (press: { onTarget: boolean, x: ?number, y: ?number }) => void, reducedMotion: () => boolean }} options
 */
export function createArenaView(field, fx, target, { onPress, reducedMotion }) {
  let locked = true;

  field.addEventListener('pointerdown', (event) => {
    if (locked || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.preventDefault(); // no text selection, no double-tap zoom, focus stays on the arena
    const box = field.getBoundingClientRect();
    onPress({ onTarget: !target.hidden && target.contains(event.target), x: event.clientX - box.left, y: event.clientY - box.top });
  });

  field.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    if (!locked && !event.repeat) {
      onPress({ onTarget: true, x: null, y: null });
    }
  });

  /** Show the target at its spot: it scales in, then pulses. */
  function showTarget({ x, y, round }) {
    target.style.setProperty('--x', String(x));
    target.style.setProperty('--y', String(y));
    target.setAttribute('aria-label', `Target ${round}. Press now!`);
    target.classList.remove('is-in');
    target.hidden = false;
    void target.offsetWidth; // restart the scale-in animation
    target.classList.add('is-in');
  }

  function hideTarget() {
    target.hidden = true;
  }

  /** Flash, a neon ring, sparks, and the reaction / points / grade floating up. */
  function showHit(hit) {
    hideTarget();
    const reduced = reducedMotion();

    if (!reduced) {
      const flash = add('nr-flash');
      flash.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }).onfinish = () => flash.remove();

      const burst = anchor(hit.x, hit.y, 'nr-burst', hit.grade);
      burst.animate(
        [{ transform: 'scale(0.5)', opacity: 1 }, { transform: 'scale(2.4)', opacity: 0 }],
        { duration: 460, easing: 'cubic-bezier(.2,.7,.3,1)' },
      ).onfinish = () => burst.remove();

      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const spark = anchor(hit.x, hit.y, 'nr-spark', hit.grade);
        spark.animate(
          [{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * 70}px, ${Math.sin(angle) * 70}px) scale(0.3)`, opacity: 0 }],
          { duration: 480, easing: 'cubic-bezier(.2,.7,.3,1)' },
        ).onfinish = () => spark.remove();
      }
    }

    const float = anchor(hit.x, hit.y, 'nr-float', hit.grade);
    float.innerHTML = `<b>${hit.reaction} ms</b><span>+${hit.points.toLocaleString('en-US')}</span><small>${hit.label}</small>`;
    floatAway(float, reduced, 900);
  }

  /** The target timed out: it fades and a MISS floats up. */
  function showTimeout(miss) {
    hideTarget();
    const reduced = reducedMotion();

    const ghost = anchor(miss.x, miss.y, 'nr-ghost');
    ghost.animate(
      reduced ? [{ opacity: 0.6 }, { opacity: 0 }] : [{ transform: 'scale(1)', opacity: 0.7 }, { transform: 'scale(0.4)', opacity: 0 }],
      { duration: 320, easing: 'ease-in' },
    ).onfinish = () => ghost.remove();

    const float = anchor(miss.x, miss.y, 'nr-float', 'miss');
    float.innerHTML = '<b>MISS</b><small>TOO SLOW</small>';
    floatAway(float, reduced, 800);
  }

  /**
   * A press that missed: a small fading ring where it landed. A keyboard
   * press before the target shows "TOO EARLY" in the middle instead.
   */
  function showFalse(x, y) {
    const reduced = reducedMotion();

    if (x === null) {
      const note = add('nr-early');
      note.textContent = 'TOO EARLY';
      note.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 600 }).onfinish = () => note.remove();
      return;
    }

    const ripple = add('nr-ripple');
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.animate(
      reduced ? [{ opacity: 0.8 }, { opacity: 0 }] : [{ transform: 'scale(0.3)', opacity: 0.9 }, { transform: 'scale(1.4)', opacity: 0 }],
      { duration: 380, easing: 'ease-out' },
    ).onfinish = () => ripple.remove();
  }

  /** A banner for combos of x3 and up; louder for bigger combos. */
  function showCombo(combo) {
    if (combo < 3) {
      return;
    }
    const tier = comboTier(combo);

    fx.querySelector('.combo-banner')?.remove();
    const banner = add('combo-banner');
    banner.dataset.tier = String(tier);
    banner.innerHTML = `<b>COMBO x${combo}</b>${tier === 3 ? '<small>PERFECT RUN!</small>' : ''}`;

    banner.animate(
      reducedMotion()
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
        : [
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
          { transform: `translate(-50%, -50%) scale(${[1.05, 1.1, 1.2, 1.3][tier]})`, opacity: 1, offset: 0.2 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.65 },
          { transform: 'translate(-50%, -80%) scale(1)', opacity: 0 },
        ],
      { duration: tier === 3 ? 1200 : 850, easing: 'ease-out' },
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

  /** Remove the target and every effect still on screen. */
  function clear() {
    hideTarget();
    fx.replaceChildren();
  }

  function add(className) {
    const node = document.createElement('div');
    node.className = className;
    fx.append(node);

    return node;
  }

  /** An effect placed at a target spot (x, y in [0, 1)). */
  function anchor(x, y, className, grade) {
    const node = add(`nr-at ${className}`);
    node.style.setProperty('--x', String(x));
    node.style.setProperty('--y', String(y));
    if (grade) {
      node.dataset.grade = grade;
    }

    return node;
  }

  function floatAway(node, reduced, duration) {
    node.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }]
        : [
          { transform: 'translateY(0) scale(0.7)', opacity: 0 },
          { transform: 'translateY(-12px) scale(1.1)', opacity: 1, offset: 0.2 },
          { transform: 'translateY(-22px) scale(1)', opacity: 1, offset: 0.65 },
          { transform: 'translateY(-40px) scale(1)', opacity: 0 },
        ],
      { duration, easing: 'ease-out' },
    ).onfinish = () => node.remove();
  }

  return { showTarget, hideTarget, showHit, showTimeout, showFalse, showCombo, setLocked, focus, clear };
}
