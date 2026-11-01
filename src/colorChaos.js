// Color Chaos: screens, the round's clock, and wiring between the pure game
// logic (src/game), the board view, saved data and sound.
//
// Screens: home → countdown (3, 2, 1, GO!) → playing (60 s) → time's up → results.
// The hub (src/main.js) calls open() and close(); best() feeds its game card.

import { DURATION_MS, WARNING_MS } from './game/config.js';
import { applyMove, createGame, remainingMs, secondsLeft, tick } from './game/engine.js';
import { createAudio } from './app/audio.js';
import { createBoardView } from './app/boardView.js';
import { celebrate, comboTier, runCountdown } from './app/effects.js';
import { settings } from './app/settings.js';
import { createStorage } from './app/storage.js';

const TIMES_UP_PAUSE_MS = 1100;

const $ = (id) => document.getElementById(id);
const storage = createStorage();
const audio = createAudio();

const el = {
  screens: { home: $('screen-home'), game: $('screen-game'), results: $('screen-results') },
  play: $('play'),
  homeBest: $('home-best'),
  homeCombo: $('home-combo'),
  soundToggle: $('sound-toggle'),
  motionToggle: $('motion-toggle'),
  score: $('score'),
  timer: $('timer'),
  timerWrap: $('timer-wrap'),
  timebar: $('timebar'),
  combo: $('combo'),
  comboWrap: $('combo-wrap'),
  countdown: $('countdown'),
  countdownNum: $('countdown-num'),
  timesUp: $('timesup'),
  quit: $('quit'),
  resScore: $('res-score'),
  resBest: $('res-best'),
  resCombo: $('res-combo'),
  resMatches: $('res-matches'),
  newBest: $('new-best'),
  confetti: $('confetti'),
  again: $('again'),
  home: $('home'),
};

let game = null;
let startedAt = 0;
let frame = 0;
let timers = [];
let shownSecond = null;
let shownScore = null;

const boardView = createBoardView($('board'), $('fx'), { onTap, reducedMotion: isReducedMotion });

// ---------- preferences (global settings, shared with every game) ----------

function isReducedMotion() {
  return settings.isReducedMotion();
}

/** The Sound and Motion toggles on this screen show and change the global settings. */
function applyPreferences() {
  audio.setEnabled(settings.sound);
  el.soundToggle.setAttribute('aria-pressed', String(settings.sound));
  el.soundToggle.querySelector('.value').textContent = settings.sound ? 'ON' : 'OFF';
  el.soundToggle.querySelector('.icon').textContent = settings.sound ? '🔊' : '🔇';

  el.motionToggle.setAttribute('aria-pressed', String(settings.motion));
  el.motionToggle.querySelector('.value').textContent = settings.motion ? 'ON' : 'OFF';
}

el.soundToggle.addEventListener('click', () => settings.setSound(!settings.sound));
el.motionToggle.addEventListener('click', () => settings.setMotion(!settings.motion));

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
  el.homeCombo.textContent = best.combo > 0 ? `x${best.combo}` : '—';
  show('home');
  el.play.focus({ preventScroll: true });
}

// ---------- a round ----------

function startRound() {
  audio.unlock(); // the Play button press is the user gesture that allows sound
  stopRound();

  game = createGame((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  shownSecond = null;
  shownScore = null;
  el.timesUp.hidden = true;
  el.timerWrap.classList.remove('is-urgent');
  boardView.render(game.board);
  boardView.setLocked(true);
  updateHud();
  show('game');

  runCountdown({
    overlay: el.countdown,
    number: el.countdownNum,
    audio,
    later,
    onGo: () => {
      startedAt = performance.now();
      boardView.setLocked(false);
      boardView.focusBoard();
      frame = requestAnimationFrame(loop);
    },
  });
}

function loop(now) {
  game = tick(game, now - startedAt);
  updateHud();

  if (game.status === 'over') {
    endRound();
  } else {
    frame = requestAnimationFrame(loop);
  }
}

function onTap(row, col) {
  if (!game || game.status !== 'playing') {
    return;
  }

  game = applyMove(game, { row, col, at: performance.now() - startedAt });
  const move = game.lastMove;

  if (move.type === 'match') {
    boardView.showMatch(move);
    boardView.render(game.board, { animate: true });
    audio.match(move.combo, move.size);
    if (move.combo >= 2) {
      audio.combo(move.combo);
      pulse(el.comboWrap, [1.12, 1.12, 1.25, 1.4][comboTier(move.combo)]);
      boardView.showCombo(move.combo);
    }
    pulse(el.score.parentElement);
  } else if (move.type === 'invalid') {
    boardView.showInvalid(row, col);
    audio.invalid();
  }

  updateHud();
  if (game.status === 'over') {
    endRound();
  }
}

function updateHud() {
  if (game.score !== shownScore) {
    shownScore = game.score;
    el.score.textContent = game.score.toLocaleString('en-US');
  }

  el.combo.textContent = game.combo > 0 ? `x${game.combo}` : '—';
  el.comboWrap.classList.toggle('is-hot', game.combo >= 3);
  el.comboWrap.dataset.tier = String(comboTier(game.combo));
  el.timebar.style.transform = `scaleX(${remainingMs(game) / DURATION_MS})`;

  const seconds = secondsLeft(game);
  if (seconds !== shownSecond) {
    shownSecond = seconds;
    el.timer.textContent = String(seconds);
    const running = startedAt > 0;
    el.timerWrap.classList.toggle('is-urgent', running && remainingMs(game) <= WARNING_MS);
    if (running && game.status === 'playing' && seconds >= 1 && seconds <= WARNING_MS / 1000) {
      audio.warning(); // one beep per second in the last 10 seconds
    }
  }
}

function endRound() {
  cancelAnimationFrame(frame);
  boardView.setLocked(true); // nothing more can be played
  audio.gameOver();
  el.timesUp.hidden = false;

  const final = game;
  const { isNewBest, best } = storage.saveResult(final);

  later(() => showResults(final, best, isNewBest), TIMES_UP_PAUSE_MS);
}

function showResults(final, best, isNewBest) {
  el.resScore.textContent = final.score.toLocaleString('en-US');
  el.resBest.textContent = best.score.toLocaleString('en-US');
  el.resCombo.textContent = final.bestCombo > 0 ? `x${final.bestCombo}` : '—';
  el.resMatches.textContent = final.matches.toLocaleString('en-US');
  el.newBest.hidden = !isNewBest;
  el.screens.results.classList.toggle('is-record', isNewBest);
  el.confetti.replaceChildren();
  show('results');
  el.again.focus({ preventScroll: true });

  if (isNewBest) {
    audio.newBest();
    if (!isReducedMotion()) {
      celebrate(el.confetti, ['#22f1ff', '#ff2bd6', '#9d5cff', '#a6ff3c', '#3b82ff']);
    }
  }
}

function stopRound() {
  cancelAnimationFrame(frame);
  timers.forEach(clearTimeout);
  timers = [];
  startedAt = 0;
  el.countdown.hidden = true;
  boardView.setLocked(true);
}

// ---------- small effects ----------

function later(fn, ms) {
  timers.push(setTimeout(fn, ms));
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
el.home.addEventListener('click', showHome);
el.quit.addEventListener('click', showHome);

settings.subscribe(applyPreferences);

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
