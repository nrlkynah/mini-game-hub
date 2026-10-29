// The hub's game cards: built once from the registry, best scores refreshed
// each time the hub is shown.

import { GAMES, STATUS_LABELS } from './games.js';

/**
 * @param {HTMLElement} root  the card list element
 * @param {Record<string, { best?: () => number }>} players  playable game modules by id
 */
export function createHub(root, players) {
  const bests = new Map();

  for (const game of GAMES) {
    const playable = game.status === 'playable' && players[game.id];
    const card = document.createElement('article');
    card.className = `game-card ${playable ? 'is-playable' : 'is-locked'}`;
    card.dataset.game = game.id;
    card.dataset.status = game.status;
    card.dataset.accent = game.accent;

    card.innerHTML = `
      <span class="game-icon" aria-hidden="true">${game.icon}</span>
      <h2 class="game-title">${game.title}</h2>
      <p class="game-tagline">${game.tagline}</p>
      ${playable ? `
        <div class="game-best"><span>Best Score</span><b>0</b></div>
        <a class="btn btn-play" href="#${game.id}" data-testid="play-${game.id}"><span class="btn-icon" aria-hidden="true">▶</span> PLAY NOW</a>
      ` : `
        <p class="game-status"><span aria-hidden="true">🔒</span> ${STATUS_LABELS[game.status]}</p>
      `}`;

    if (playable) {
      card.prepend(Object.assign(document.createElement('span'), { className: 'game-badge', textContent: STATUS_LABELS.playable }));
      bests.set(game.id, card.querySelector('.game-best b'));
    } else {
      card.setAttribute('aria-disabled', 'true');
    }
    root.append(card);
  }

  // Locked cards sit two per row on small screens; a last odd one gets the full row.
  const locked = root.querySelectorAll('.is-locked');
  if (locked.length % 2 === 1) {
    locked[locked.length - 1].classList.add('is-wide');
  }
  // The wide-screen layout depends on how many games are playable (see styles.css).
  root.dataset.playable = String(bests.size);

  /** Show the latest best score on each playable card. */
  function refresh() {
    for (const [id, node] of bests) {
      node.textContent = (players[id].best?.() ?? 0).toLocaleString('en-US');
    }
  }

  return { refresh };
}
