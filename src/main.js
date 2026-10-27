// Mini Game Hub: shows the hub or one game, based on the URL hash.
//   (no hash) → hub     #color-chaos → Color Chaos
// Links to "#" go back to the hub; unknown hashes do too.

import * as colorChaos from './colorChaos.js';
import { createHub } from './hub.js';

/** Playable games by registry id (see src/games.js). */
const players = { 'color-chaos': colorChaos };

const hubScreen = document.getElementById('screen-hub');
const hub = createHub(document.getElementById('hub-games'), players);
let current = null;

function route() {
  const id = location.hash.slice(1);
  const next = players[id] ? id : null;
  if (next === current && current !== null) {
    return;
  }

  players[current]?.close();
  current = next;
  document.body.classList.toggle('is-hub', !next);
  hubScreen.hidden = Boolean(next);
  window.scrollTo(0, 0);

  if (next) {
    document.title = `${document.querySelector(`[data-game="${next}"] .game-title`).textContent} · Mini Game Hub`;
    players[next].open();
  } else {
    document.title = 'Mini Game Hub · Your Neon Arcade';
    hub.refresh();
  }
}

window.addEventListener('hashchange', route);
route();
