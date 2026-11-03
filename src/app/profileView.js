// The hub's Arcade Profile card and Achievements list, the Reset Progress
// confirmation, and the small "achievement unlocked" toasts.
//
// Toasts never block anything: they sit at the edge of the screen, ignore
// pointer input, and fade on their own. With Motion OFF they just appear.

import { profile } from './profile.js';
import { settings } from './settings.js';

const TOAST_MS = 3800;

/**
 * @param {{ stats: Record<string, HTMLElement>, count: HTMLElement, list: HTMLElement, resetOpen: HTMLElement, resetDialog: HTMLDialogElement, resetConfirm: HTMLElement, toasts: HTMLElement }} el
 */
export function createProfileView(el) {
  el.resetOpen.addEventListener('click', () => el.resetDialog.showModal());
  el.resetConfirm.addEventListener('click', () => {
    profile.reset();
    render();
  });
  el.resetDialog.addEventListener('click', (event) => {
    if (event.target === el.resetDialog) {
      el.resetDialog.close();
    }
  });

  profile.onUnlock((achievements) => achievements.forEach(toast));

  /** Show the latest profile and achievements. */
  function render() {
    const p = profile.get();
    const n = (value) => value.toLocaleString('en-US');
    el.stats.played.textContent = n(p.played);
    el.stats.completed.textContent = n(p.completed);
    el.stats.total.textContent = n(p.totalScore);
    el.stats.best.textContent = n(p.bestOverall);
    el.stats.mastered.textContent = `${p.mastered} / ${p.gameCount}`;

    const unlocked = p.achievements.filter((a) => a.unlocked).length;
    el.count.textContent = `${unlocked} / ${p.achievements.length}`;
    el.list.replaceChildren(...p.achievements.map(item));
  }

  return { render };

  function item(a) {
    const li = document.createElement('li');
    li.className = `achievement ${a.unlocked ? 'is-unlocked' : 'is-locked'}`;
    li.dataset.achievement = a.id;
    const when = a.unlocked ? new Date(a.unlockedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    li.innerHTML = `
      <span class="achievement-icon" aria-hidden="true">${a.unlocked ? a.icon : '🔒'}</span>
      <span class="achievement-text">
        <b>${a.title}</b>
        <small>${a.description}</small>
      </span>
      <span class="sr-only">${a.unlocked ? `Unlocked ${when}` : 'Locked'}</span>`;
    if (a.unlocked) {
      li.title = `Unlocked ${when}`;
    }

    return li;
  }

  function toast(a) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = `<span class="toast-icon" aria-hidden="true">🏆</span><span class="toast-text"><small>Achievement unlocked</small><b>${a.icon} ${a.title}</b><span>${a.description}</span></span>`;
    el.toasts.append(node);

    const reduced = settings.isReducedMotion();
    node.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.92 }, { opacity: 0 }]
        : [
          { transform: 'translateY(16px)', opacity: 0 },
          { transform: 'translateY(0)', opacity: 1, offset: 0.08 },
          { transform: 'translateY(0)', opacity: 1, offset: 0.9 },
          { transform: 'translateY(-8px)', opacity: 0 },
        ],
      { duration: TOAST_MS, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => node.remove();
  }
}
