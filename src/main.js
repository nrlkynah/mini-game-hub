// Color Chaos: screens, the round's clock, and wiring between the pure game
// logic (src/game), the board view, saved data and sound.
//
// Screens: home → countdown (3, 2, 1, GO!) → playing (60 s) → time's up → results.

import { DURATION_MS, WARNING_MS } from './game/config.js';
import { applyMove, createGame, remainingMs, secondsLeft, tick } from './game/engine.js';
import { createAudio } from './app/audio.js';
import { createBoardView } from './app/boardView.js';
import { createStorage } from './app/storage.js';

const COUNTDOWN_STEP_MS = 800;
const TIMES_UP_PAUSE_MS = 1100;

const $ = (id) => document.getElementById(id);
const storage = createStorage();
const audio = createAudio();
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

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

// ---------- preferences ----------

let soundOn = storage.getSound();
let motion = storage.getMotion();

function isReducedMotion() {
  return motion === 'reduced' || (motion === 'system' && motionQuery.matches);
}

function applyPreferences() {
  audio.setEnabled(soundOn);
  el.soundToggle.setAttribute('aria-pressed', String(soundOn));
  el.soundToggle.querySelector('.value').textContent = soundOn ? 'ON' : 'OFF';
  el.soundToggle.querySelector('.icon').textContent = soundOn ? '🔊' : '🔇';

  document.documentElement.dataset.motion = isReducedMotion() ? 'reduced' : 'full';
  el.motionToggle.querySelector('.value').textContent = { system: 'AUTO', reduced: 'LESS', full: 'FULL' }[motion];
}

el.soundToggle.addEventListener('click', () => {
  soundOn = !soundOn;
  storage.setSound(soundOn);
  applyPreferences();
});

el.motionToggle.addEventListener('click', () => {
  motion = { system: 'reduced', reduced: 'full', full: 'system' }[motion];
  storage.setMotion(motion);
  applyPreferences();
});

motionQuery.addEventListener?.('change', applyPreferences);

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

  // 3, 2, 1, GO!
  ['3', '2', '1', 'GO!'].forEach((label, i) => {
    later(() => {
      el.countdown.hidden = false;
      el.countdownNum.textContent = label;
      el.countdownNum.classList.remove('pop');
      void el.countdownNum.offsetWidth; // restart the pop animation
      el.countdownNum.classList.add('pop');
      label === 'GO!' ? audio.go() : audio.countdown();
    }, i * COUNTDOWN_STEP_MS);
  });

  later(() => {
    el.countdown.hidden = true;
    startedAt = performance.now();
    boardView.setLocked(false);
    boardView.focusBoard();
    frame = requestAnimationFrame(loop);
  }, 3 * COUNTDOWN_STEP_MS + 450);
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
      pulse(el.comboWrap);
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
  boardView.setLocked(true);
}

// ---------- small effects ----------

function later(fn, ms) {
  timers.push(setTimeout(fn, ms));
}

function pulse(node) {
  if (isReducedMotion()) {
    return;
  }
  node.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
}

function celebrate() {
  if (isReducedMotion()) {
    return;
  }
  const colors = ['#ff5fa2', '#ffd23f', '#3fa7ff', '#3ee08f', '#a57bff'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('i');
    piece.style.left = `${(i * 37) % 100}%`;
    piece.style.background = colors[i % colors.length];
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
el.home.addEventListener('click', showHome);
el.quit.addEventListener('click', showHome);

applyPreferences();
showHome();
