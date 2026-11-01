// Small helpers and effects shared by every game: the combo tier, the
// 3, 2, 1, GO! countdown and the new-best confetti.

export const COUNTDOWN_STEP_MS = 800;

/** How loud the combo effects are: 0 none, 1 x2–x4, 2 x5–x9, 3 x10 and up. */
export function comboTier(combo) {
  if (combo >= 10) {
    return 3;
  }
  if (combo >= 5) {
    return 2;
  }

  return combo >= 2 ? 1 : 0;
}

/**
 * The 3, 2, 1, GO! countdown over a game. Each step pops in with its own
 * colour and a beep; then the overlay hides and `onGo` starts play.
 * Steps are scheduled with the game's own `later`, so stopping the game
 * cancels the countdown too.
 *
 * @param {{ overlay: HTMLElement, number: HTMLElement, audio: { countdown(): void, go(): void }, later: (fn: () => void, ms: number) => void, onGo: () => void }} options
 */
export function runCountdown({ overlay, number, audio, later, onGo }) {
  ['3', '2', '1', 'GO!'].forEach((label, i) => {
    later(() => {
      overlay.hidden = false;
      number.textContent = label;
      number.dataset.label = label; // each step glows in its own colour
      number.classList.remove('pop');
      void number.offsetWidth; // restart the pop animation
      number.classList.add('pop');
      label === 'GO!' ? audio.go() : audio.countdown();
    }, i * COUNTDOWN_STEP_MS);
  });

  later(() => {
    overlay.hidden = true;
    onGo();
  }, 3 * COUNTDOWN_STEP_MS + 450);
}

/** Confetti falling from the top of `container`, in the game's colours. */
export function celebrate(container, colors) {
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('i');
    piece.style.left = `${(i * 37) % 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.boxShadow = `0 0 8px ${colors[i % colors.length]}`;
    container.append(piece);
    piece.animate(
      [{ transform: 'translateY(-20px) rotate(0deg)', opacity: 1 }, { transform: `translateY(${260 + (i % 5) * 40}px) rotate(${360 + i * 25}deg)`, opacity: 0 }],
      { duration: 1400 + (i % 7) * 120, delay: (i % 10) * 40, easing: 'cubic-bezier(.2,.6,.4,1)' },
    ).onfinish = () => piece.remove();
  }
}
