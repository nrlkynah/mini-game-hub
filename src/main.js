// Mini Game Hub: shows the hub or one game, based on the URL hash.
//   (no hash) → hub     #color-chaos → Color Chaos
//   #neon-reflex → Neon Reflex     #memory-matrix → Memory Matrix
//   #space-tap → Space Tap
// Links to "#" go back to the hub; unknown hashes do too.

import * as colorChaos from './colorChaos.js';
import * as memoryMatrix from './memoryMatrix.js';
import * as neonReflex from './neonReflex.js';
import * as spaceTap from './spaceTap.js';
import { createHub } from './hub.js';
import { createSettingsView } from './app/settingsView.js';

/** Playable games by registry id (see src/games.js). */
const players = { 'color-chaos': colorChaos, 'neon-reflex': neonReflex, 'memory-matrix': memoryMatrix, 'space-tap': spaceTap };

const $ = (id) => document.getElementById(id);

createSettingsView({ open: $('settings-open'), dialog: $('settings'), sound: $('setting-sound'), motion: $('setting-motion'), motionNote: $('setting-motion-note') });

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
    document.title = 'Mini Game Hub · Futuristic Neon Arcade';
    hub.refresh();
  }
}

window.addEventListener('hashchange', route);
route();
