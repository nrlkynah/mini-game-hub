// Space Tap: screens, the run's clock, and wiring between the pure game logic
// (src/space), the arena view, saved bests and sound.
//
// Screens: home → countdown (3, 2, 1, GO!) → playing (30 s) → complete → results.
// The hub (src/main.js) calls open() and close(); best() feeds its game card.
//
// Sound and motion follow the global settings (src/app/settings.js).

import { DURATION_MS, WARNING_MS } from './space/config.js';
import { accuracy, createSpaceGame, remainingMs, secondsLeft, tap, tick } from './space/engine.js';
import { multiplierLabel } from './space/scoring.js';
import { phaseAt } from './space/targets.js';
import { createAudio } from './app/audio.js';
import { celebrate, comboTier, runCountdown } from './app/effects.js';
import { createSpaceStorage } from './app/spaceStorage.js';
import { createSpaceView } from './app/spaceView.js';
import { settings } from './app/settings.js';

const DONE_PAUSE_MS = 1200;

const $ = (id) => document.getElementById(id);
const storage = createSpaceStorage();
const audio = createAudio();

const el = {
  screens: { home: $('screen-space-home'), game: $('screen-space-game'), results: $('screen-space-results') },
  play: $('st-play'),
  homeBest: $('st-home-best'),
  homeCombo: $('st-home-combo'),
  homeAccuracy: $('st-home-accuracy'),
  score: $('st-score'),
  timer: $('st-timer'),
  timerWrap: $('st-timer-wrap'),
  timebar: $('st-timebar'),
  combo: $('st-combo'),
  comboWrap: $('st-combo-wrap'),
  multiplier: $('st-multiplier'),
  accuracy: $('st-accuracy'),
  phase: $('st-phase'),
  countdown: $('st-countdown'),
  countdownNum: $('st-countdown-num'),
  done: $('st-done'),
  live: $('st-live'),
  quit: $('st-quit'),
  resScore: $('st-res-score'),
  resHits: $('st-res-hits'),
  resAccuracy: $('st-res-accuracy'),
  resCombo: $('st-res-combo'),
  resBest: $('st-res-best'),
  newBest: $('st-new-best'),
  confetti: $('st-confetti'),
  again: $('st-again'),
  home: $('st-home'),
};

let game = null;
let startedAt = 0;
let frame = 0;
let timers = [];
let shownSecond = null;
let shownPhase = null;

const view = createSpaceView($('st-field'), $('st-fx'), { onTap, onKey, reducedMotion: isReducedMotion });

function isReducedMotion() {
  return settings.isReducedMotion();
}

const comboText = (value) => (value > 0 ? `x${value}` : '—');

// ---------- screens ----------

function show(name) {
  for (const [key, screen] of Object.entries(el.screens)) {
    screen.hidden = key !== name;
  }
  document.body.classList.toggle('is-playing', name === 'game');
  document.body.classList.toggle('is-space-game', name === 'game');
}

function showHome() {
  stopRound();
  const best = storage.getBest();
  el.homeBest.textContent = best.score.toLocaleString('en-US');
  el.homeCombo.textContent = comboText(best.combo);
  el.homeAccuracy.textContent = best.accuracy > 0 ? `${best.accuracy}%` : '—';
  show('home');
  el.play.focus({ preventScroll: true });
}

// ---------- a run ----------

function startRound() {
  audio.setEnabled(settings.sound);
  audio.unlock(); // the Play button press is the user gesture that allows sound
  stopRound();

  game = createSpaceGame((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  shownSecond = null;
  shownPhase = null;
  el.done.hidden = true;
  el.live.textContent = '';
  el.timerWrap.classList.remove('is-urgent');
  updateHud();
  show('game');

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
  const before = game;
  game = tick(game, now - startedAt);
  if (game !== before) {
    react(game.events);
  }

  if (game.status === 'over') {
    endRound();
  } else {
    frame = requestAnimationFrame(loop);
  }
}

function onTap({ targetId, x, y }) {
  if (!game || game.status !== 'playing' || startedAt === 0) {
    return;
  }

  game = tap(game, { at: performance.now() - startedAt, targetId });
  react(game.events, x, y);
  if (game.status === 'over') {
    endRound();
  }
}

/** Keyboard: the number on a target taps it; a number with no target is an empty tap. */
function onKey(slot) {
  const target = game?.targets.find((t) => t.slot === slot);
  onTap({ targetId: target?.id ?? null, x: null, y: null });
}

/** Show and sound whatever just happened. */
function react(events, x = null, y = null) {
  for (const event of events) {
    if (event.type === 'spawn') {
      view.addTarget(event.target);
    } else if (event.type === 'vanish') {
      view.removeTarget(event.target.id, 'vanish');
    } else if (event.type === 'expire') {
      view.removeTarget(event.target.id, 'expire');
      view.showTooSlow(event.target);
    } else if (event.type === 'hit') {
      view.removeTarget(event.target.id, 'hit');
      view.showHit(event.target, event.points, event.bonus);
      audio.match(event.combo, event.bonus ? 6 : 2);
      if (event.combo >= 2) {
        pulse(el.comboWrap, [1.12, 1.12, 1.25, 1.4][comboTier(event.combo)]);
        view.showCombo(event.combo);
      }
      pulse(el.score.parentElement);
    } else if (event.type === 'decoy') {
      view.removeTarget(event.target.id, 'decoy');
      view.showDecoy(event.target);
      audio.invalid();
      el.live.textContent = 'Miss! That was a mine. Combo lost.';
    } else if (event.type === 'empty') {
      view.showEmpty(x, y);
    }
  }
  updateHud();
}

function updateHud() {
  el.score.textContent = game.score.toLocaleString('en-US');
  el.combo.textContent = comboText(game.combo);
  el.multiplier.textContent = `×${multiplierLabel(game.combo)}`;
  el.comboWrap.classList.toggle('is-hot', game.combo >= 3);
  el.comboWrap.dataset.tier = String(comboTier(game.combo));
  el.accuracy.textContent = `${accuracy(game)}%`;
  el.timebar.style.transform = `scaleX(${remainingMs(game) / DURATION_MS})`;

  const running = startedAt > 0;
  const phase = phaseAt(game.elapsedMs);
  if (running && phase.key !== shownPhase) {
    shownPhase = phase.key;
    el.phase.textContent = phase.label;
    el.phase.dataset.phase = phase.key;
    if (phase.key !== 'easy') {
      el.live.textContent = `${phase.label}: faster targets, more mines.`;
    }
  }

  const seconds = secondsLeft(game);
  if (seconds !== shownSecond) {
    shownSecond = seconds;
    el.timer.textContent = String(seconds);
    el.timerWrap.classList.toggle('is-urgent', running && remainingMs(game) <= WARNING_MS);
    if (running && game.status === 'playing' && seconds >= 1 && seconds <= WARNING_MS / 1000) {
      audio.warning(); // one beep per second in the last 5 seconds
    }
  }
}

function endRound() {
  cancelAnimationFrame(frame);
  view.setLocked(true);
  audio.gameOver();
  el.done.hidden = false;

  const final = game;
  const saved = storage.saveResult({ score: final.score, bestCombo: final.bestCombo, accuracy: accuracy(final), hits: final.hits });

  later(() => showResults(final, saved), DONE_PAUSE_MS);
}

function showResults(final, { best, isNewBest }) {
  el.resScore.textContent = final.score.toLocaleString('en-US');
  el.resHits.textContent = final.hits.toLocaleString('en-US');
  el.resAccuracy.textContent = `${accuracy(final)}%`;
  el.resCombo.textContent = comboText(final.bestCombo);
  el.resBest.textContent = best.score.toLocaleString('en-US');
  el.newBest.hidden = !isNewBest;
  el.screens.results.classList.toggle('is-record', isNewBest);
  el.confetti.replaceChildren();
  show('results');
  el.again.focus({ preventScroll: true });
  el.live.textContent = '';

  if (isNewBest) {
    audio.newBest();
    if (!isReducedMotion()) {
      celebrate(el.confetti, ['#ffe03a', '#22f1ff', '#ff2bd6', '#9d5cff', '#a6ff3c']);
    }
  }
}

function stopRound() {
  cancelAnimationFrame(frame);
  timers.forEach(clearTimeout);
  timers = [];
  startedAt = 0;
  el.countdown.hidden = true;
  el.phase.textContent = '';
  view.setLocked(true);
  view.clear();
}

// ---------- small effects ----------

function later(fn, delay) {
  timers.push(setTimeout(fn, delay));
}

function pulse(node, scale = 1.18) {
  if (isReducedMotion()) {
    return;
  }
  node.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
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
