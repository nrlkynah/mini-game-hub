// Neon Reflex: screens, the clock, and wiring between the pure game logic
// (src/reflex), the arena view, saved bests and sound.
//
// Screens: home → countdown (3, 2, 1, GO!) → 10 rounds → complete → results.
// The hub (src/main.js) calls open() and close(); best() feeds its game card.
//
// Sound and motion follow the preferences set on the Color Chaos screen
// (shared localStorage keys, and the data-motion attribute on <html>).

import { ROUNDS } from './reflex/config.js';
import { averageReaction, bestReaction, createReflexGame, press, tick } from './reflex/engine.js';
import { createArenaView } from './app/arenaView.js';
import { createAudio } from './app/audio.js';
import { comboTier } from './app/boardView.js';
import { createReflexStorage } from './app/reflexStorage.js';
import { createStorage } from './app/storage.js';

const COUNTDOWN_STEP_MS = 800;
const DONE_PAUSE_MS = 1100;

const $ = (id) => document.getElementById(id);
const preferences = createStorage();
const storage = createReflexStorage();
const audio = createAudio();

const el = {
  screens: { home: $('screen-reflex-home'), game: $('screen-reflex-game'), results: $('screen-reflex-results') },
  play: $('nr-play'),
  homeBest: $('nr-home-best'),
  homeReaction: $('nr-home-reaction'),
  homeCombo: $('nr-home-combo'),
  round: $('nr-round'),
  score: $('nr-score'),
  combo: $('nr-combo'),
  comboWrap: $('nr-combo-wrap'),
  best: $('nr-best'),
  countdown: $('nr-countdown'),
  countdownNum: $('nr-countdown-num'),
  done: $('nr-done'),
  live: $('nr-live'),
  quit: $('nr-quit'),
  resScore: $('nr-res-score'),
  resAverage: $('nr-res-average'),
  resReaction: $('nr-res-reaction'),
  resCombo: $('nr-res-combo'),
  resHits: $('nr-res-hits'),
  resRecord: $('nr-res-record'),
  newBest: $('nr-new-best'),
  confetti: $('nr-confetti'),
  again: $('nr-again'),
  home: $('nr-home'),
};

let game = null;
let startedAt = 0;
let frame = 0;
let timers = [];

const arena = createArenaView($('nr-field'), $('nr-fx'), $('nr-target'), { onPress, reducedMotion: isReducedMotion });

function isReducedMotion() {
  return document.documentElement.dataset.motion === 'reduced';
}

const ms = (value) => (value ? `${value} ms` : '—');
const combo = (value) => (value > 0 ? `x${value}` : '—');

// ---------- screens ----------

function show(name) {
  for (const [key, screen] of Object.entries(el.screens)) {
    screen.hidden = key !== name;
  }
  document.body.classList.toggle('is-playing', name === 'game');
  document.body.classList.toggle('is-reflex-game', name === 'game');
}

function showHome() {
  stopRound();
  const best = storage.getBest();
  el.homeBest.textContent = best.score.toLocaleString('en-US');
  el.homeReaction.textContent = ms(best.reaction);
  el.homeCombo.textContent = combo(best.combo);
  show('home');
  el.play.focus({ preventScroll: true });
}

// ---------- a game ----------

function startRound() {
  audio.setEnabled(preferences.getSound());
  audio.unlock(); // the Play button press is the user gesture that allows sound
  stopRound();

  game = createReflexGame((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  el.done.hidden = true;
  el.live.textContent = '';
  updateHud();
  show('game');

  // 3, 2, 1, GO!
  ['3', '2', '1', 'GO!'].forEach((label, i) => {
    later(() => {
      el.countdown.hidden = false;
      el.countdownNum.textContent = label;
      el.countdownNum.dataset.label = label;
      el.countdownNum.classList.remove('pop');
      void el.countdownNum.offsetWidth; // restart the pop animation
      el.countdownNum.classList.add('pop');
      label === 'GO!' ? audio.go() : audio.countdown();
    }, i * COUNTDOWN_STEP_MS);
  });

  later(() => {
    el.countdown.hidden = true;
    startedAt = performance.now();
    arena.setLocked(false);
    arena.focus();
    frame = requestAnimationFrame(loop);
  }, 3 * COUNTDOWN_STEP_MS + 450);
}

function loop(now) {
  const before = game;
  game = tick(game, now - startedAt);
  if (game !== before) {
    react(game.lastEvent);
  }

  if (game.status === 'over') {
    endRound();
  } else {
    frame = requestAnimationFrame(loop);
  }
}

function onPress({ onTarget, x, y }) {
  if (!game || game.status === 'over' || startedAt === 0) {
    return;
  }

  game = press(game, { at: performance.now() - startedAt, onTarget });
  react(game.lastEvent, x, y);
  if (game.status === 'over') {
    endRound();
  }
}

/** Show and sound whatever just happened. */
function react(event, x = null, y = null) {
  if (event.type === 'spawn') {
    arena.showTarget(game.target);
  } else if (event.type === 'hit') {
    arena.showHit(event);
    audio.match(Math.max(event.combo, 1), event.grade === 'perfect' ? 5 : 2);
    if (event.combo >= 2) {
      audio.combo(event.combo);
      pulse(el.comboWrap, [1.12, 1.12, 1.25, 1.4][comboTier(event.combo)]);
      arena.showCombo(event.combo);
    }
    pulse(el.score.parentElement);
    el.live.textContent = `${event.reaction} milliseconds, ${event.label}, plus ${event.points} points.`;
  } else if (event.type === 'timeout') {
    arena.showTimeout(event);
    audio.invalid();
    el.live.textContent = 'Missed.';
  } else if (event.type === 'false') {
    arena.showFalse(x, y);
    audio.invalid();
  }
  updateHud();
}

function updateHud() {
  el.round.textContent = String(game.round).padStart(2, '0');
  el.score.textContent = game.score.toLocaleString('en-US');
  el.combo.textContent = combo(game.combo);
  el.comboWrap.classList.toggle('is-hot', game.combo >= 3);
  el.comboWrap.dataset.tier = String(comboTier(game.combo));
  el.best.textContent = ms(bestReaction(game));
}

function endRound() {
  cancelAnimationFrame(frame);
  arena.setLocked(true); // nothing more can be played
  audio.gameOver();
  el.done.hidden = false;

  const final = game;
  const saved = storage.saveResult({ score: final.score, bestReaction: bestReaction(final), bestCombo: final.bestCombo });

  later(() => showResults(final, saved), DONE_PAUSE_MS);
}

function showResults(final, { best, isNewBest, isNewReaction }) {
  el.resScore.textContent = final.score.toLocaleString('en-US');
  el.resAverage.textContent = ms(averageReaction(final));
  el.resReaction.textContent = ms(bestReaction(final));
  el.resCombo.textContent = combo(final.bestCombo);
  el.resHits.textContent = `${final.hits}/${ROUNDS}`;
  el.resReaction.parentElement.classList.toggle('is-record', isNewReaction);
  el.resRecord.textContent = `All-time best: ${best.score.toLocaleString('en-US')} pts · ${ms(best.reaction)} · ${combo(best.combo)}`;
  el.newBest.hidden = !isNewBest;
  el.screens.results.classList.toggle('is-record', isNewBest);
  el.confetti.replaceChildren();
  show('results');
  el.again.focus({ preventScroll: true });

  if (isNewBest) {
    audio.newBest();
    celebrate();
  }
}

function stopRound() {
  cancelAnimationFrame(frame);
  timers.forEach(clearTimeout);
  timers = [];
  startedAt = 0;
  el.countdown.hidden = true;
  arena.setLocked(true);
  arena.clear();
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

/** Lightning-coloured confetti for a new best score. */
function celebrate() {
  if (isReducedMotion()) {
    return;
  }
  const colors = ['#ff2bd6', '#3b82ff', '#22f1ff', '#9d5cff', '#a6ff3c'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('i');
    piece.style.left = `${(i * 37) % 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.boxShadow = `0 0 8px ${colors[i % colors.length]}`;
    el.confetti.append(piece);
    piece.animate(
      [{ transform: 'translateY(-20px) rotate(0deg)', opacity: 1 }, { transform: `translateY(${260 + (i % 5) * 40}px) rotate(${360 + i * 25}deg)`, opacity: 0 }],
      { duration: 1400 + (i % 7) * 120, delay: (i % 10) * 40, easing: 'cubic-bezier(.2,.6,.4,1)' },
    ).onfinish = () => piece.remove();
  }
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
