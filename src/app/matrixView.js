// Draws the Memory Matrix grid and its effects, and reports picks. No game
// rules in here.
//
// The 16 tile buttons are created once. Mouse and touch go through the same
// Pointer Events handler; the keyboard moves around with the arrow keys and
// picks with Enter/Space.

import { GRID, TILES } from '../matrix/config.js';

/**
 * @param {HTMLElement} root  the grid element
 * @param {HTMLElement} fx    overlay for banners, same box as the grid
 * @param {{ onPick: (tile: number) => void, reducedMotion: () => boolean }} options
 */
export function createMatrixView(root, fx, { onPick, reducedMotion }) {
  const buttons = [];
  let focus = 0;
  let locked = true;
  let hintTimer = 0;

  for (let i = 0; i < TILES; i++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mm-tile';
    button.dataset.tile = String(i);
    button.tabIndex = i === 0 ? 0 : -1;
    button.setAttribute('aria-label', label(i));
    button.innerHTML = '<span class="mm-order" aria-hidden="true"></span>';
    root.append(button);
    buttons.push(button);
  }

  root.addEventListener('pointerdown', (event) => {
    const tile = event.target.closest('.mm-tile');
    if (!tile || locked || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.preventDefault(); // no text selection, no double-tap zoom
    moveFocus(Number(tile.dataset.tile), false);
    onPick(Number(tile.dataset.tile));
  });

  root.addEventListener('keydown', (event) => {
    const steps = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (steps[event.key]) {
      event.preventDefault();
      const [dr, dc] = steps[event.key];
      const row = clamp(Math.floor(focus / GRID) + dr);
      const col = clamp((focus % GRID) + dc);
      moveFocus(row * GRID + col, true);
    } else if ((event.key === 'Enter' || event.key === ' ') && !locked) {
      event.preventDefault();
      if (!event.repeat) {
        onPick(focus);
      }
    }
  });

  function moveFocus(tile, focusElement) {
    buttons[focus].tabIndex = -1;
    focus = tile;
    buttons[tile].tabIndex = 0;
    if (focusElement) {
      buttons[tile].focus();
    }
  }

  /**
   * Show which tiles are lit (the pattern being revealed) and which are
   * picked, each with its step number.
   */
  function render({ lit = [], picked = [] }) {
    buttons.forEach((button, i) => {
      const litAt = lit.indexOf(i);
      const pickedAt = picked.indexOf(i);
      const state = pickedAt >= 0 ? 'picked' : litAt >= 0 ? 'lit' : '';
      if (button.dataset.state !== state) {
        button.dataset.state = state;
      }
      const order = pickedAt >= 0 ? pickedAt + 1 : litAt >= 0 ? litAt + 1 : '';
      button.firstChild.textContent = String(order);
      button.setAttribute('aria-label', `${label(i)}${state === 'lit' ? `, lit, step ${order}` : state === 'picked' ? `, picked ${order}` : ''}`);
    });
  }

  /** A tile of the pattern lights up: glow → pulse → settle. */
  function flash(tile) {
    if (reducedMotion()) {
      return;
    }
    buttons[tile].animate(
      [{ transform: 'scale(0.86)', filter: 'brightness(1.8)' }, { transform: 'scale(1.08)', filter: 'brightness(1.4)', offset: 0.45 }, { transform: 'scale(1)', filter: 'brightness(1)' }],
      { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.2)' },
    );
  }

  /** The player picked a right tile: glow + a small scale. */
  function showPick(tile) {
    if (reducedMotion()) {
      return;
    }
    buttons[tile].animate([{ transform: 'scale(0.9)' }, { transform: 'scale(1.06)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 200, easing: 'ease-out' });
  }

  /** The whole pattern was right: a quick success pulse across it. */
  function showClear(cells) {
    if (reducedMotion()) {
      return;
    }
    cells.forEach((tile, i) => {
      buttons[tile].animate(
        [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.1)', filter: 'brightness(1.6)' }, { transform: 'scale(1)', filter: 'brightness(1)' }],
        { duration: 360, delay: i * 40, easing: 'ease-out' },
      );
    });
  }

  /**
   * A mistake: the wrong tile shakes with a red warning glow, and the tile
   * that was expected gets an outline for a moment.
   */
  function showWrong(tile, expected, hintMs) {
    const button = buttons[tile];
    button.animate(
      reducedMotion()
        ? [{ background: 'rgba(255, 61, 113, 0.6)' }, { background: 'rgba(255, 61, 113, 0.6)', offset: 0.7 }, { background: 'rgba(255, 61, 113, 0)' }]
        : [
          { transform: 'translateX(0)', boxShadow: '0 0 0 2px #ff3d71, 0 0 26px #ff3d71' },
          { transform: 'translateX(-9%)', offset: 0.2 },
          { transform: 'translateX(8%)', offset: 0.4 },
          { transform: 'translateX(-5%)', offset: 0.6 },
          { transform: 'translateX(0)', boxShadow: '0 0 0 2px #ff3d71, 0 0 26px #ff3d71', offset: 0.8 },
          { transform: 'translateX(0)' },
        ],
      { duration: 520, easing: 'ease-out' },
    );

    clearTimeout(hintTimer);
    buttons.forEach((b) => b.classList.remove('is-hint'));
    if (expected !== undefined && expected !== tile) {
      buttons[expected].classList.add('is-hint');
      hintTimer = setTimeout(() => buttons[expected].classList.remove('is-hint'), hintMs);
    }
  }

  /**
   * A short message over the grid.
   * @param {'good'|'bad'|'streak'} kind
   */
  function showBanner(kind, title, lines = []) {
    fx.querySelectorAll(`.mm-banner[data-kind="${kind === 'streak' ? 'streak' : 'main'}"]`).forEach((b) => b.remove());
    const banner = document.createElement('div');
    banner.className = 'mm-banner';
    banner.dataset.kind = kind === 'streak' ? 'streak' : 'main';
    banner.dataset.tone = kind;
    banner.innerHTML = `<b>${title}</b>${lines.map((line) => `<small>${line}</small>`).join('')}`;
    fx.append(banner);

    banner.animate(
      reducedMotion()
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
        : [
          { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1, offset: 0.18 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.75 },
          { transform: 'translate(-50%, -62%) scale(1)', opacity: 0 },
        ],
      { duration: 1150, easing: 'ease-out' },
    ).onfinish = () => banner.remove();
  }

  function setLocked(value) {
    locked = value;
    root.classList.toggle('is-locked', value);
    root.setAttribute('aria-disabled', String(value));
  }

  function focusGrid() {
    buttons[focus].focus({ preventScroll: true });
  }

  /** Back to an empty, dark grid with no effects. */
  function clear() {
    clearTimeout(hintTimer);
    buttons.forEach((b) => b.classList.remove('is-hint'));
    render({});
    fx.replaceChildren();
  }

  return { render, flash, showPick, showClear, showWrong, showBanner, setLocked, focusGrid, clear };
}

/** "Row 2, column 3" for a tile index. */
export function label(tile) {
  return `Row ${Math.floor(tile / GRID) + 1}, column ${(tile % GRID) + 1}`;
}

function clamp(value) {
  return Math.max(0, Math.min(GRID - 1, value));
}
