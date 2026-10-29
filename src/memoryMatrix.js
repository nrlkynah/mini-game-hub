// Memory Matrix: screens, the clock, and wiring between the pure game logic
// (src/matrix), the grid view, saved bests and sound.
//
// Screens: home → countdown (3, 2, 1, GO!) → levels until the lives run out
// → memory failed → results. The hub (src/main.js) calls open() and close();
// best() feeds its game card.
//
// Sound and motion follow the preferences set on the Color Chaos screen
// (shared localStorage keys, and the data-motion attribute on <html>).

import { FEEDBACK_MS, LIVES } from './matrix/config.js';
import { accuracy, createMemoryGame, litCount, select, tick } from './matrix/engine.js';
import { createAudio } from './app/audio.js';
import { comboTier } from './app/boardView.js';
import { createMatrixStorage } from './app/matrixStorage.js';
import { createMatrixView, label } from './app/matrixView.js';
import { createStorage } from './app/storage.js';

const COUNTDOWN_STEP_MS = 800;
const OVER_PAUSE_MS = 1400;
/** After a cleared level, the picked tiles stay lit this long. */
const AFTERGLOW_MS = 600;

const $ = (id) => document.getElementById(id);
const preferences = createStorage();
const storage = createMatrixStorage();
const audio = createAudio();

const el = {
  screens: { home: $('screen-matrix-home'), game: $('screen-matrix-game'), results: $('screen-matrix-results') },
  play: $('mm-play'),
  homeBest: $('mm-home-best'),
  homeLevel: $('mm-home-level'),
  homeStreak: $('mm-home-streak'),
  score: $('mm-score'),
  level: $('mm-level'),
  streak: $('mm-streak'),
  streakWrap: $('mm-streak-wrap'),
  best: $('mm-best'),
  lives: $('mm-lives'),
  phase: $('mm-phase'),
  countdown: $('mm-countdown'),
  countdownNum: $('mm-countdown-num'),
  over: $('mm-over'),
  live: $('mm-live'),
  quit: $('mm-quit'),
  resScore: $('mm-res-score'),
  resLevel: $('mm-res-level'),
  resStreak: $('mm-res-streak'),
  resAccuracy: $('mm-res-accuracy'),
  resRecord: $('mm-res-record'),
  newBest: $('mm-new-best'),
  confetti: $('mm-confetti'),
  again: $('mm-again'),
  home: $('mm-home'),
};

let game = null;
let startedAt = 0;
let frame = 0;
let timers = [];
let bestLevel = 0;
let afterglow = null;
let shownLit = 0;
let shownView = '';
let shownPhase = '';

const view = createMatrixView($('mm-grid'), $('mm-fx'), { onPick, reducedMotion: isReducedMotion });

function isReducedMotion() {
  return document.documentElement.dataset.motion === 'reduced';
}

const streakText = (value) => (value > 0 ? `x${value}` : '—');

// ---------- screens ----------

function show(name) {
  for (const [key, screen] of Object.entries(el.screens)) {
    screen.hidden = key !== name;
  }
  document.body.classList.toggle('is-playing', name === 'game');
}

function showHome() {
  stopRound();
  const best = storage.getBest();
  el.homeBest.textContent = best.score.toLocaleString('en-US');
  el.homeLevel.textContent = best.level > 0 ? String(best.level) : '—';
  el.homeStreak.textContent = streakText(best.streak);
  show('home');
  el.play.focus({ preventScroll: true });
}

// ---------- a game ----------

function startRound() {
  audio.setEnabled(preferences.getSound());
  audio.unlock(); // the Play button press is the user gesture that allows sound
  stopRound();

  game = createMemoryGame((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  bestLevel = storage.getBest().level;
  el.over.hidden = true;
  el.live.textContent = '';
  setPhase('GET READY');
  updateHud();
  show('game');

  // 3, 2, 1, GO!
  ['3', '2', '1', 'GO!'].forEach((text, i) => {
    later(() => {
      el.countdown.hidden = false;
      el.countdownNum.textContent = text;
      el.countdownNum.dataset.label = text;
      el.countdownNum.classList.remove('pop');
      void el.countdownNum.offsetWidth; // restart the pop animation
      el.countdownNum.classList.add('pop');
      text === 'GO!' ? audio.go() : audio.countdown();
    }, i * COUNTDOWN_STEP_MS);
  });

  later(() => {
    el.countdown.hidden = true;
    startedAt = performance.now();
    frame = requestAnimationFrame(loop);
  }, 3 * COUNTDOWN_STEP_MS + 450);
}

function loop(now) {
  const t = now - startedAt;
  const before = game;
  game = tick(game, t);
  if (game !== before) {
    react(game.lastEvent);
  }
  draw(t);
  frame = requestAnimationFrame(loop);
}

/** Light the pattern step by step while it is revealed; show the picks while the player answers. */
function draw(t) {
  let lit = [];
  let picked = [];

  if (game.status === 'reveal') {
    const count = litCount(game, t);
    if (count > shownLit) {
      view.flash(game.pattern[count - 1]);
      audio.match(count, 2);
      el.live.textContent = `Step ${count}: ${label(game.pattern[count - 1])}.`;
    }
    shownLit = count;
    lit = game.pattern.slice(0, count);
    if (count > 0) {
      setPhase('WATCH');
    }
    if (afterglow && t < afterglow.until) {
      picked = afterglow.cells;
    }
  } else if (game.status === 'input') {
    picked = game.picks;
    setPhase(`YOUR TURN · ${game.picks.length}/${game.pattern.length}`);
  }

  const key = `${lit}|${picked}`;
  if (key !== shownView) {
    shownView = key;
    view.render({ lit, picked });
  }
}

function onPick(tile) {
  if (!game || game.status !== 'input' || startedAt === 0) {
    return;
  }

  game = select(game, { tile, at: performance.now() - startedAt });
  react(game.lastEvent);
  if (game.status === 'over') {
    endRound();
  } else {
    draw(performance.now() - startedAt);
  }
}

/** Show and sound whatever just happened. */
function react(event) {
  if (event.type === 'hide') {
    shownLit = 0;
    afterglow = null;
    view.setLocked(false);
    view.focusGrid();
    el.live.textContent = `Your turn: repeat the ${game.pattern.length} tiles in order.`;
  } else if (event.type === 'pick') {
    view.showPick(event.tile);
    audio.match(event.step, 2);
  } else if (event.type === 'clear') {
    view.setLocked(true);
    afterglow = { cells: event.cells, until: performance.now() - startedAt + AFTERGLOW_MS };
    view.showClear(event.cells);
    view.showBanner('good', 'PERFECT MEMORY', [`+${event.points.toLocaleString('en-US')}${event.quick ? ' · QUICK' : ''}`, 'NEXT LEVEL']);
    audio.match(event.step, 5);
    if (event.streak >= 2) {
      audio.combo(event.streak);
      later(() => view.showBanner('streak', `STREAK x${event.streak}`), 250);
      pulse(el.streakWrap, [1.12, 1.12, 1.25, 1.4][comboTier(event.streak)]);
    }
    pulse(el.score.parentElement);
    setPhase('');
    el.live.textContent = `Perfect memory! Plus ${event.points} points. Next level.`;
  } else if (event.type === 'fail') {
    view.setLocked(true);
    afterglow = null;
    view.showWrong(event.tile, event.expected, FEEDBACK_MS);
    audio.invalid();
    breakHeart(event.lives);
    if (!event.over) {
      view.showBanner('bad', 'NOT QUITE', ['−1 LIFE', 'TRY AGAIN']);
      el.live.textContent = `Not quite. ${event.lives} ${event.lives === 1 ? 'life' : 'lives'} left. Watch again.`;
    }
    setPhase('');
  }
  updateHud();
}

function updateHud() {
  el.score.textContent = game.score.toLocaleString('en-US');
  el.level.textContent = String(game.level).padStart(2, '0');
  el.streak.textContent = streakText(game.streak);
  el.streakWrap.classList.toggle('is-hot', game.streak >= 3);
  el.streakWrap.dataset.tier = String(comboTier(game.streak));
  const best = Math.max(bestLevel, game.cleared);
  el.best.textContent = best > 0 ? String(best) : '—';

  const hearts = [...el.lives.children];
  hearts.forEach((heart, i) => {
    heart.textContent = i < game.lives ? '❤️' : '💔';
    heart.classList.toggle('is-lost', i >= game.lives);
  });
  el.lives.setAttribute('aria-label', `Lives: ${game.lives} of ${LIVES}`);
}

function setPhase(text) {
  if (text !== shownPhase) {
    shownPhase = text;
    el.phase.textContent = text;
  }
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
  audio.gameOver();
  el.over.hidden = false;
  setPhase('');

  const final = game;
  const saved = storage.saveResult(final);

  later(() => showResults(final, saved), OVER_PAUSE_MS);
}

function showResults(final, { best, isNewBest }) {
  el.resScore.textContent = final.score.toLocaleString('en-US');
  el.resLevel.textContent = String(final.cleared);
  el.resStreak.textContent = streakText(final.bestStreak);
  el.resAccuracy.textContent = `${accuracy(final)}%`;
  el.resRecord.textContent = `All-time best: ${best.score.toLocaleString('en-US')} pts · level ${best.level} · ${streakText(best.streak)}`;
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
  afterglow = null;
  shownLit = 0;
  shownView = '';
  el.countdown.hidden = true;
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

/** Holographic confetti for a new best score. */
function celebrate() {
  if (isReducedMotion()) {
    return;
  }
  const colors = ['#9d5cff', '#22f1ff', '#ff2bd6', '#3b82ff', '#a6ff3c'];
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
