// Laser Dodge: screens, the run's clock, controls, and wiring between the
// pure game logic (src/laser), the arena view, saved bests and sound.
//
// Screens: home → countdown (3, 2, 1, GO!) → playing (until the lives run out)
// → game over → results. The hub (src/main.js) calls open() and close();
// best() feeds its game card.
//
// Controls: arrow keys or WASD; touch or mouse: drag anywhere in the arena.
// Sound and motion follow the global settings (src/app/settings.js).

import { LIVES } from './laser/config.js';
import { createLaserGame, nudge, tick } from './laser/engine.js';
import { laserPhase } from './laser/lasers.js';
import { phaseAt } from './laser/scoring.js';
import { createAudio } from './app/audio.js';
import { celebrate, comboTier, runCountdown } from './app/effects.js';
import { createLaserStorage } from './app/laserStorage.js';
import { createLaserView } from './app/laserView.js';
import { settings } from './app/settings.js';

const OVER_PAUSE_MS = 1300;
const KEYS = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
};

const $ = (id) => document.getElementById(id);
const storage = createLaserStorage();
const audio = createAudio();

const el = {
  screens: { home: $('screen-laser-home'), game: $('screen-laser-game'), results: $('screen-laser-results') },
  play: $('ld-play'),
  homeBest: $('ld-home-best'),
  homeTime: $('ld-home-time'),
  homeStreak: $('ld-home-streak'),
  score: $('ld-score'),
  time: $('ld-time'),
  best: $('ld-best'),
  lives: $('ld-lives'),
  streak: $('ld-streak'),
  phase: $('ld-phase'),
  alert: $('ld-alert'),
  countdown: $('ld-countdown'),
  countdownNum: $('ld-countdown-num'),
  over: $('ld-over'),
  live: $('ld-live'),
  quit: $('ld-quit'),
  resScore: $('ld-res-score'),
  resTime: $('ld-res-time'),
  resBestTime: $('ld-res-best-time'),
  resBest: $('ld-res-best'),
  resStreak: $('ld-res-streak'),
  newBest: $('ld-new-best'),
  confetti: $('ld-confetti'),
  again: $('ld-again'),
  home: $('ld-home'),
};

let game = null;
let startedAt = 0;
let frame = 0;
let timers = [];
let bestTimeMs = 0;
let drag = { x: 0, y: 0 };
const held = new Set();

const view = createLaserView($('ld-arena'), $('ld-field'), $('ld-player'), $('ld-fx'), {
  onDrag: (dx, dy) => {
    drag.x += dx;
    drag.y += dy;
  },
  reducedMotion: isReducedMotion,
});

function isReducedMotion() {
  return settings.isReducedMotion();
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

// ---------- keyboard ----------

function playing() {
  return Boolean(game) && game.status === 'playing' && startedAt > 0;
}

window.addEventListener('keydown', (event) => {
  if (KEYS[event.key] && playing()) {
    event.preventDefault(); // arrows must not scroll the page
    held.add(KEYS[event.key]);
  }
});
window.addEventListener('keyup', (event) => {
  if (KEYS[event.key]) {
    held.delete(KEYS[event.key]);
  }
});
window.addEventListener('blur', () => held.clear());

function direction() {
  return { x: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0), y: (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0) };
}

// ---------- screens ----------

function show(name) {
  for (const [key, screen] of Object.entries(el.screens)) {
    screen.hidden = key !== name;
  }
  document.body.classList.toggle('is-playing', name === 'game');
  document.body.classList.toggle('is-laser-game', name === 'game');
}

function showHome() {
  stopRound();
  const best = storage.getBest();
  el.homeBest.textContent = best.score.toLocaleString('en-US');
  el.homeTime.textContent = best.timeMs > 0 ? seconds(best.timeMs) : '—';
  el.homeStreak.textContent = best.streak > 0 ? `x${best.streak}` : '—';
  show('home');
  el.play.focus({ preventScroll: true });
}

// ---------- a run ----------

function startRound() {
  audio.setEnabled(settings.sound);
  audio.unlock(); // the Play button press is the user gesture that allows sound
  stopRound();
  show('game');

  game = createLaserGame((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0, { aspect: view.aspect() });
  bestTimeMs = storage.getBest().timeMs;
  view.setArena(game.arena);
  view.render(game);
  el.over.hidden = true;
  el.live.textContent = '';
  updateHud();

  runCountdown({
    overlay: el.countdown,
    number: el.countdownNum,
    audio,
    later,
    onGo: () => {
      startedAt = performance.now();
      view.setLocked(false);
      view.focus();
      frame = requestAnimationFrame(loop);
    },
  });
}

function loop(now) {
  if (drag.x !== 0 || drag.y !== 0) {
    game = nudge(game, drag.x, drag.y);
    drag = { x: 0, y: 0 };
  }
  game = tick(game, { now: now - startedAt, dir: direction() });
  react(game.events);
  view.render(game);
  updateHud();

  if (game.status === 'over') {
    endRound();
  } else {
    frame = requestAnimationFrame(loop);
  }
}

/** Show and sound whatever just happened. */
function react(events) {
  if (events.some((e) => e.type === 'warning')) {
    audio.warning(); // one beep per wave
  }
  for (const event of events) {
    if (event.type === 'hit') {
      view.showHit(event.player);
      audio.invalid();
      breakHeart(event.lives);
      el.live.textContent = event.lives > 0 ? `Hit! ${event.lives} ${event.lives === 1 ? 'life' : 'lives'} left.` : 'Hit! No lives left.';
    } else if (event.type === 'near') {
      view.showNearMiss(event.player, event.points);
      audio.match(3, 2);
    } else if (event.type === 'streak') {
      view.showStreak(event.streak);
      audio.combo(event.streak);
      el.live.textContent = `Survival x${event.streak}.`;
    }
  }
}

function updateHud() {
  el.score.textContent = game.score.toLocaleString('en-US');
  el.time.textContent = seconds(game.elapsedMs);
  const best = Math.max(bestTimeMs, startedAt > 0 ? game.elapsedMs : 0);
  el.best.textContent = best > 0 ? seconds(best) : '—';

  [...el.lives.children].forEach((heart, i) => {
    heart.textContent = i < game.lives ? '❤️' : '💔';
    heart.classList.toggle('is-lost', i >= game.lives);
  });
  el.lives.setAttribute('aria-label', `Lives: ${game.lives} of ${LIVES}`);

  el.streak.textContent = `SURVIVAL x${game.streak}`;
  el.streak.dataset.tier = String(comboTier(game.streak));
  const phase = phaseAt(game.elapsedMs);
  el.phase.textContent = startedAt > 0 ? phase.label : '';
  el.phase.dataset.phase = phase.key;

  // ⚠ WARNING while a laser is warning, ⚡ CHARGE while one is charging.
  const phases = game.lasers.map((laser) => laserPhase(laser, game.elapsedMs));
  const alert = phases.includes('charge') ? 'charge' : phases.includes('warning') ? 'warning' : '';
  el.alert.dataset.state = alert;
  el.alert.textContent = { warning: '⚠ WARNING', charge: '⚡ CHARGE', '': '' }[alert];
}

function breakHeart(lives) {
  const heart = el.lives.children[lives];
  if (heart && !isReducedMotion()) {
    heart.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
  }
}

function endRound() {
  cancelAnimationFrame(frame);
  view.setLocked(true);
  held.clear();
  audio.gameOver();
  el.over.hidden = false;

  const final = game;
  const saved = storage.saveResult(final);
  later(() => showResults(final, saved), OVER_PAUSE_MS);
}

function showResults(final, { best, isNewBest }) {
  el.resScore.textContent = final.score.toLocaleString('en-US');
  el.resTime.textContent = seconds(final.elapsedMs);
  el.resBestTime.textContent = seconds(best.timeMs);
  el.resBest.textContent = best.score.toLocaleString('en-US');
  el.resStreak.textContent = `x${final.bestStreak}`;
  el.newBest.hidden = !isNewBest;
  el.screens.results.classList.toggle('is-record', isNewBest);
  el.confetti.replaceChildren();
  show('results');
  el.again.focus({ preventScroll: true });

  if (isNewBest) {
    audio.newBest();
    if (!isReducedMotion()) {
      celebrate(el.confetti, ['#ff3d71', '#ff8a3d', '#22f1ff', '#9d5cff', '#ff2bd6']);
    }
  }
}

function stopRound() {
  cancelAnimationFrame(frame);
  timers.forEach(clearTimeout);
  timers = [];
  startedAt = 0;
  held.clear();
  drag = { x: 0, y: 0 };
  el.countdown.hidden = true;
  view.setLocked(true);
  view.clear();
}

function later(fn, delay) {
  timers.push(setTimeout(fn, delay));
}

// ---------- buttons ----------

el.play.addEventListener('click', startRound);
el.again.addEventListener('click', startRound);
el.quit.addEventListener('click', showHome);
el.home.addEventListener('click', () => {
  location.hash = ''; // back to the Mini Game Hub (src/main.js routes on the hash)
});

// ---------- hub interface ----------

export function open() {
  showHome();
}

export function close() {
  stopRound();
  show(null);
}

export function best() {
  return storage.getBest().score;
}
