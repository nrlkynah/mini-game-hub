// Draws the board and reports taps. No game rules in here.
//
// The tile buttons are created once; after a move only the cells whose tile
// changed are updated. Mouse and touch go through the same Pointer Events
// handler; the keyboard can move around with the arrow keys and press
// Enter/Space.

import { COLORS, COLS, ROWS } from '../game/config.js';
import { comboTier } from './effects.js';

/**
 * @param {HTMLElement} root  the board element
 * @param {HTMLElement} fx    overlay for effects (removed tiles, floating points)
 * @param {{ onTap: (row: number, col: number) => void, reducedMotion: () => boolean }} options
 */
export function createBoardView(root, fx, { onTap, reducedMotion }) {
  const buttons = [];
  let focus = { row: 0, col: 0 };
  let locked = true;

  for (let r = 0; r < ROWS; r++) {
    buttons.push([]);
    for (let c = 0; c < COLS; c++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tile';
      button.dataset.row = String(r);
      button.dataset.col = String(c);
      button.tabIndex = r === 0 && c === 0 ? 0 : -1;
      button.innerHTML = '<span class="sym" aria-hidden="true"></span>';
      root.append(button);
      buttons[r].push(button);
    }
  }

  root.addEventListener('pointerdown', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile || locked || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.preventDefault(); // no text selection, no double-tap zoom
    moveFocus(Number(tile.dataset.row), Number(tile.dataset.col), false);
    onTap(Number(tile.dataset.row), Number(tile.dataset.col));
  });

  root.addEventListener('keydown', (event) => {
    const steps = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (steps[event.key]) {
      event.preventDefault();
      const [dr, dc] = steps[event.key];
      moveFocus(clamp(focus.row + dr, ROWS), clamp(focus.col + dc, COLS), true);
    } else if ((event.key === 'Enter' || event.key === ' ') && !locked) {
      event.preventDefault();
      onTap(focus.row, focus.col);
    }
  });

  function moveFocus(row, col, focusElement) {
    buttons[focus.row][focus.col].tabIndex = -1;
    focus = { row, col };
    buttons[row][col].tabIndex = 0;
    if (focusElement) {
      buttons[row][col].focus();
    }
  }

  /** Update the tiles; animate the ones that are new or moved. */
  function render(board, { animate = false } = {}) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = board[r][c];
        const button = buttons[r][c];
        if (button.dataset.id === String(tile.id)) {
          continue;
        }

        const color = COLORS[tile.color];
        button.dataset.id = String(tile.id);
        button.dataset.color = color.key;
        button.firstChild.textContent = color.symbol;
        button.setAttribute('aria-label', `${color.name} ${color.shape}, row ${r + 1}, column ${c + 1}`);

        if (animate && !reducedMotion()) {
          button.animate(
            [{ transform: 'translateY(-70%) scale(0.6)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }],
            { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.3)', delay: (ROWS - r) * 12 },
          );
        }
      }
    }
  }

  /** Burst the removed tiles and float the points up from the tapped tile. */
  function showMatch(move) {
    const reduced = reducedMotion();
    const color = COLORS[move.color].key;

    for (const [r, c] of move.cells) {
      const ghost = cellElement('ghost', r, c);
      ghost.dataset.color = color;
      ghost.innerHTML = `<span class="sym">${COLORS[move.color].symbol}</span>`;
      fx.append(ghost);
      ghost.animate(
        reduced
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.35) rotate(12deg)', opacity: 0 }],
        { duration: reduced ? 120 : 260, easing: 'ease-out' },
      ).onfinish = () => ghost.remove();
    }

    if (!reduced) {
      // A neon ring and a few sparks from the tapped tile.
      const burst = cellElement('burst', move.row, move.col);
      burst.dataset.color = color;
      fx.append(burst);
      burst.animate(
        [{ transform: 'scale(0.4)', opacity: 1 }, { transform: 'scale(2.1)', opacity: 0 }],
        { duration: 420, easing: 'cubic-bezier(.2,.7,.3,1)' },
      ).onfinish = () => burst.remove();

      const sparks = Math.min(4 + move.cells.length, 10);
      for (let i = 0; i < sparks; i++) {
        const angle = (i / sparks) * Math.PI * 2;
        const spark = cellElement('spark', move.row, move.col);
        spark.dataset.color = color;
        fx.append(spark);
        spark.animate(
          [{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * 110}%, ${Math.sin(angle) * 110}%) scale(0.3)`, opacity: 0 }],
          { duration: 460, easing: 'cubic-bezier(.2,.7,.3,1)' },
        ).onfinish = () => spark.remove();
      }
    }

    const float = cellElement('float', move.row, move.col);
    float.innerHTML = `+${move.points.toLocaleString('en-US')}${move.combo > 1 ? `<small>x${move.combo}</small>` : ''}`;
    fx.append(float);
    float.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ transform: 'translate(-25%, 0) scale(0.8)', opacity: 0 }, { transform: 'translate(-25%, -60%) scale(1.15)', opacity: 1, offset: 0.25 }, { transform: 'translate(-25%, -160%) scale(1)', opacity: 0 }],
      { duration: reduced ? 500 : 800, easing: 'ease-out' },
    ).onfinish = () => float.remove();
  }

  /** A banner over the board for combos of x3 and up; louder for bigger combos. */
  function showCombo(combo) {
    const tier = comboTier(combo);
    if (combo < 3) {
      return;
    }

    fx.querySelector('.combo-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'combo-banner';
    banner.dataset.tier = String(tier);
    banner.innerHTML = `<b>COMBO x${combo}</b>${tier === 3 ? '<small>MAX COMBO!</small>' : ''}`;
    fx.append(banner);

    const reduced = reducedMotion();
    const peak = [1.05, 1.1, 1.2, 1.3][tier];
    banner.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
        : [
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
          { transform: `translate(-50%, -50%) scale(${peak})`, opacity: 1, offset: 0.2 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.65 },
          { transform: 'translate(-50%, -80%) scale(1)', opacity: 0 },
        ],
      { duration: tier === 3 ? 1200 : 850, easing: 'ease-out' },
    ).onfinish = () => banner.remove();

    if (tier === 3 && !reduced) {
      const flash = document.createElement('div');
      flash.className = 'combo-flash';
      fx.append(flash);
      flash.animate([{ opacity: 0.9, transform: 'scale(0.9)' }, { opacity: 0, transform: 'scale(1.15)' }], { duration: 600, easing: 'ease-out' })
        .onfinish = () => flash.remove();
    }
  }

  /** A lone tile was tapped: a little shake (a quick flash with reduced motion). */
  function showInvalid(row, col) {
    const button = buttons[row]?.[col];
    if (!button) {
      return;
    }
    button.animate(
      reducedMotion()
        ? [{ filter: 'brightness(1)' }, { filter: 'brightness(0.55)' }, { filter: 'brightness(1)' }]
        : [{ transform: 'translateX(0)' }, { transform: 'translateX(-14%)' }, { transform: 'translateX(12%)' }, { transform: 'translateX(-6%)' }, { transform: 'translateX(0)' }],
      { duration: 240, easing: 'ease-out' },
    );
  }

  function setLocked(value) {
    locked = value;
    root.classList.toggle('is-locked', value);
    root.setAttribute('aria-disabled', String(value));
  }

  function focusBoard() {
    buttons[focus.row][focus.col].focus({ preventScroll: true });
  }

  function cellElement(className, row, col) {
    const el = document.createElement('div');
    el.className = className;
    el.style.setProperty('--r', String(row));
    el.style.setProperty('--c', String(col));

    return el;
  }

  return { render, showMatch, showCombo, showInvalid, setLocked, focusBoard };
}

function clamp(value, size) {
  return Math.max(0, Math.min(size - 1, value));
}
