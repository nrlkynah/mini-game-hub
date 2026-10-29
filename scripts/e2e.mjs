// End-to-end check in a real browser (headless Microsoft Edge or Chrome),
// driven over the DevTools protocol. No dependencies.
//
// It checks the hub (game cards, opening Color Chaos, back to the hub), then
// plays one full 60-second round of Color Chaos with real clicks and checks the
// countdown, scoring, combo, the timer, game over, results, saved best score,
// sound/motion preferences, reduced motion and the layout at several sizes.
// Then it plays Neon Reflex: countdown, hitting targets, misses and false
// clicks, results, play again, Home back to the hub, keyboard, reduced motion
// and the layout at several sizes.
//
// Usage: npm run e2e            (set BROWSER=path/to/chrome to override)
//        E2E_ONLY=color-chaos or E2E_ONLY=neon-reflex to run one game only
// Takes about 2.5 minutes. Screenshots go to ./e2e-output/.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findGroup } from '../src/game/board.js';

const BROWSER = process.env.BROWSER ?? [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
const PORT = 5199;
const DEBUG_PORT = 9333;
const URL_ROOT = `http://127.0.0.1:${PORT}/`;
const GAME_URL = `${URL_ROOT}#color-chaos`;
const REFLEX_URL = `${URL_ROOT}#neon-reflex`;
const ONLY = process.env.E2E_ONLY;
const OUT = 'e2e-output';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const errors = []; // JavaScript errors seen in the page
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!BROWSER) {
  console.error('No Edge/Chrome found. Set BROWSER=/path/to/browser.');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, ['scripts/serve.mjs', String(PORT)], { stdio: 'ignore' });
const browser = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cc-e2e-'))}`, 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  ws = await connect();
  await run();
} catch (error) {
  console.error(error);
  results.push({ name: 'run without crashing', ok: false });
} finally {
  ws?.close();
  browser.kill();
  server.kill();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed ? 1 : 0);

// ---------------------------------------------------------------------------

async function run() {
  ws.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text));
  ws.on('Runtime.consoleAPICalled', (p) => p.type === 'error' && errors.push(p.args.map((a) => a.value).join(' ')));
  await ws.send('Runtime.enable');
  await ws.send('Page.enable');
  // Runs before the game's own scripts on every load: records whether an AudioContext is ever created.
  await ws.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const AC = window.AudioContext; if (AC) { window.AudioContext = function (...a) { window.__audioCreated = true; return new AC(...a); }; } })();`,
  });

  await viewport(390, 844, true);
  await open();
  await js('localStorage.clear()');

  // ----- hub -----
  await open(URL_ROOT);
  check('the hub is shown first', await js(`!document.getElementById('screen-hub').hidden && document.getElementById('screen-home').hidden`));
  const cards = await js(`[...document.querySelectorAll('.game-card')].map((c) => ({ id: c.dataset.game, playable: c.classList.contains('is-playable'), status: c.querySelector('.game-status')?.textContent.trim() ?? '' }))`);
  check('the hub shows five game cards', cards.length === 5, cards.map((c) => c.id).join(', '));
  check('Color Chaos and Neon Reflex are playable', cards.filter((c) => c.playable).map((c) => c.id).join() === 'color-chaos,neon-reflex');
  check('the other three are coming soon', cards.filter((c) => !c.playable).map((c) => `${c.id}:${c.status}`).join() === 'memory-matrix:🔒 Coming Soon,laser-dodge:🔒 Coming Soon,space-tap:🔒 Coming Soon', cards.filter((c) => !c.playable).map((c) => c.status).join(' | '));
  check('only the two playable cards have a Play button', await js(`[...document.querySelectorAll('.game-card .btn-play')].map((b) => b.dataset.testid).join()`) === 'play-color-chaos,play-neon-reflex');
  check('the Color Chaos card shows best score 0', (await js(`document.querySelector('[data-game="color-chaos"] .game-best b').textContent`)) === '0');
  check('hub: no horizontal scrolling', await noHorizontalScroll());
  await shot('00-hub-390');

  await click('[data-testid="play-color-chaos"]');
  await sleep(200);
  check('the Color Chaos card opens the game', await js(`location.hash === '#color-chaos' && !document.getElementById('screen-home').hidden && document.getElementById('screen-hub').hidden`));
  await click('#back-to-hub');
  await sleep(200);
  check('Back to Hub returns to the hub', await js(`!document.getElementById('screen-hub').hidden && document.getElementById('screen-home').hidden`));

  if (ONLY !== 'neon-reflex') {
    await runColorChaos();
  }
  if (ONLY !== 'color-chaos') {
    await runNeonReflex();
  }

  check('no JavaScript errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
}

async function runColorChaos() {
  await open();

  // ----- home -----
  check('home screen is shown first', await js(`!document.getElementById('screen-home').hidden`));
  check('best score starts at 0', (await text('home-best')) === '0');
  check('sound starts ON', (await text('sound-toggle')).includes('ON'));
  check('no audio context before the first tap (no autoplay)', await js('!window.__audioCreated'));

  await click('#sound-toggle');
  await open();
  check('sound OFF is remembered after refresh', (await text('sound-toggle')).includes('OFF') && (await js(`localStorage.getItem('mgh.sound')`)) === 'off');
  await click('#sound-toggle');
  await open();
  check('sound ON is remembered after refresh', (await text('sound-toggle')).includes('ON'));
  await shot('01-home-390');

  // ----- countdown -----
  await click('#play');
  const countdown = [];
  for (let i = 0; i < 4; i++) {
    await sleep(i === 0 ? 150 : 800);
    countdown.push(await text('countdown-num'));
  }
  check('countdown shows 3, 2, 1, GO!', countdown.join(',') === '3,2,1,GO!', countdown.join(','));
  check('board is locked during the countdown', await js(`document.getElementById('board').classList.contains('is-locked')`));
  await tapFirstMatch();
  check('taps during the countdown do not score', (await text('score')) === '0');

  await sleep(800);
  check('board unlocks after GO!', !(await js(`document.getElementById('board').classList.contains('is-locked')`)));
  const startTimer = Number(await text('timer'));
  check('timer starts at 60', startTimer === 60 || startTimer === 59, String(startTimer));

  // ----- playing -----
  const scores = [];
  for (let i = 0; i < 6; i++) {
    await tapFirstMatch();
    await sleep(250);
    scores.push(Number((await text('score')).replace(/,/g, '')));
  }
  check('valid matches add points', scores.every((s, i) => i === 0 || s > scores[i - 1]) && scores[0] > 0, scores.join(' → '));
  const combo = await text('combo');
  check('quick matches build a combo', /^x[2-9]|x10$/.test(combo), combo);
  await shot('02-playing-390');

  const before = await text('score');
  await tapSingle();
  await sleep(150);
  check('an invalid tap resets the combo and scores nothing', (await text('combo')) === '—' && (await text('score')) === before);
  check('no horizontal scrolling while playing', await noHorizontalScroll());
  check('the page itself does not scroll while playing', await js(`getComputedStyle(document.body).overflow === 'hidden'`));

  // Keep playing until 10 seconds are left.
  while (Number(await text('timer')) > 9) {
    await tapFirstMatch();
    await sleep(400);
  }
  check('timer turns urgent in the last 10 seconds', await js(`document.getElementById('timer-wrap').classList.contains('is-urgent')`));
  await shot('03-urgent-390');

  while (Number(await text('timer')) > 0) {
    await tapFirstMatch();
    await sleep(300);
  }
  const finalHud = await text('score');
  check('timer reaches exactly 0', (await text('timer')) === '0');
  check("TIME'S UP! is shown", await js(`!document.getElementById('timesup').hidden`));
  await tapFirstMatch();
  await sleep(100);
  check('moves after game over are blocked', (await text('score')) === finalHud);

  // ----- results -----
  await sleep(1300);
  check('results screen is shown', await js(`!document.getElementById('screen-results').hidden`));
  check('results show the final score', (await text('res-score')) === finalHud, finalHud);
  check('first round is a NEW BEST', await js(`!document.getElementById('new-best').hidden`));
  check('best equals this score', (await text('res-best')) === finalHud);
  check('best combo and matches are shown', /^x\d+$/.test(await text('res-combo')) && Number(await text('res-matches')) > 5, `${await text('res-combo')}, ${await text('res-matches')} matches`);
  await shot('04-results-390');

  // ----- persistence -----
  await open();
  check('best score persists after refresh', (await text('home-best')) === finalHud);
  await open(URL_ROOT);
  check('the hub card shows the saved best score', (await js(`document.querySelector('[data-game="color-chaos"] .game-best b').textContent`)) === finalHud);
  await open();
  const saved = JSON.parse(await js(`localStorage.getItem('mgh.colorChaos.best.v1')`));
  check('localStorage holds integers only', Number.isSafeInteger(saved.score) && Number.isSafeInteger(saved.combo), JSON.stringify(saved));
  await js(`localStorage.setItem('mgh.colorChaos.best.v1', '{broken')`);
  await open();
  check('a corrupted saved best does not break the page', (await text('home-best')) === '0' && errors.length === 0);
  await js(`localStorage.setItem('mgh.colorChaos.best.v1', ${JSON.stringify(JSON.stringify(saved))})`);
  await open();

  // ----- play again resets -----
  await click('#play');
  await sleep(300);
  check('Play again starts from 0 and 60 s', (await text('score')) === '0' && (await text('timer')) === '60' && (await text('combo')) === '—');
  await click('#quit');
  check('Quit goes back home without changing the best', (await text('home-best')) === finalHud);

  // ----- reduced motion -----
  await ws.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await open();
  check('device reduced-motion setting is respected', (await js('document.documentElement.dataset.motion')) === 'reduced');
  await click('#play');
  await sleep(3400);
  await tapFirstMatch();
  await sleep(200);
  check('the game still plays with reduced motion', Number((await text('score')).replace(/,/g, '')) > 0);
  await click('#quit');
  await click('#motion-toggle'); // AUTO → LESS
  await click('#motion-toggle'); // LESS → FULL
  await open();
  check('the Motion toggle overrides the device setting and is remembered', (await js('document.documentElement.dataset.motion')) === 'full' && (await text('motion-toggle')).includes('FULL'));
  await js(`localStorage.removeItem('mgh.motion')`);
  await ws.send('Emulation.setEmulatedMedia', { features: [] });

  // ----- layout at several sizes -----
  for (const [w, h, mobile] of [[360, 640, true], [390, 844, true], [768, 1024, true], [1280, 800, false]]) {
    await viewport(w, h, mobile);
    await open(URL_ROOT);
    await sleep(500); // let the cards finish sliding in
    const hubOk = await noHorizontalScroll();
    await shot(`05-hub-${w}`);
    check(`${w}×${h}: hub has no horizontal scroll`, hubOk);
    await open();
    const homeOk = await noHorizontalScroll();
    const playFits = await js(`(() => { const b = document.getElementById('play').getBoundingClientRect(); return b.height >= 44 && b.right <= innerWidth; })()`);
    await shot(`05-home-${w}`);
    await click('#play');
    await sleep(3400);
    const layout = await js(`(() => {
      const tiles = [...document.querySelectorAll('.tile')].map((t) => t.getBoundingClientRect());
      const board = document.getElementById('board').getBoundingClientRect();
      return { minTile: Math.min(...tiles.map((t) => Math.min(t.width, t.height))), boardBottom: board.bottom, boardRight: board.right, vw: innerWidth, vh: innerHeight };
    })()`);
    await shot(`06-game-${w}`);
    check(`${w}×${h}: no horizontal scroll (home + game)`, homeOk && (await noHorizontalScroll()));
    check(`${w}×${h}: board fits the screen`, layout.boardBottom <= layout.vh && layout.boardRight <= layout.vw, `board bottom ${Math.round(layout.boardBottom)} / ${layout.vh}`);
    check(`${w}×${h}: tiles are at least 44px`, layout.minTile >= 44, `${layout.minTile.toFixed(1)}px`);
    check(`${w}×${h}: Play button is large and on screen`, playFits);
    await click('#quit');
  }

  // ----- keyboard -----
  await viewport(1280, 800, false);
  await open();
  await click('#play');
  await sleep(3400);
  const focused = await js(`document.activeElement?.classList.contains('tile')`);
  await key('ArrowRight');
  const moved = await js(`document.activeElement?.dataset.col === '1'`);
  check('keyboard: a tile is focused and arrow keys move', focused && moved);
  await click('#quit');
}

// ----- Neon Reflex -----

async function runNeonReflex() {
  await viewport(390, 844, true);
  await open(URL_ROOT);
  const chaosBest = await js(`localStorage.getItem('mgh.colorChaos.best.v1')`);
  check('reflex: the hub card shows best score 0', (await js(`document.querySelector('[data-game="neon-reflex"] .game-best b').textContent`)) === '0');
  await click('[data-testid="play-neon-reflex"]');
  await sleep(200);
  check('reflex: Play Now opens Neon Reflex', await js(`location.hash === '#neon-reflex' && !document.getElementById('screen-reflex-home').hidden && document.getElementById('screen-hub').hidden && document.getElementById('screen-home').hidden`));
  check('reflex: home shows best 0 and no best reaction yet', (await text('nr-home-best')) === '0' && (await text('nr-home-reaction')) === '—');
  await shot('10-reflex-home-390');

  // ----- countdown -----
  await click('#nr-play');
  const countdown = [];
  for (let i = 0; i < 4; i++) {
    await sleep(i === 0 ? 150 : 800);
    countdown.push(await text('nr-countdown-num'));
  }
  check('reflex: countdown shows 3, 2, 1, GO!', countdown.join(',') === '3,2,1,GO!', countdown.join(','));
  check('reflex: the arena is locked during the countdown', await js(`document.getElementById('nr-field').classList.contains('is-locked')`));
  await click('#nr-field');
  check('reflex: taps during the countdown do nothing', (await text('nr-score')) === '0' && (await reflexRound()) === '01');
  await waitFor(`!document.getElementById('nr-field').classList.contains('is-locked')`);
  check('reflex: the arena unlocks after GO! and has keyboard focus', await js(`document.activeElement?.id === 'nr-field'`));

  // ----- a false click before the first target -----
  check('reflex: no target before its random pause is over', await js(`document.getElementById('nr-target').hidden`));
  await clickArenaCorner();
  await sleep(60);
  check('reflex: a false click scores nothing and does not end the round', (await text('nr-score')) === '0' && (await reflexRound()) === '01' && (await text('nr-combo')) === '—');
  check('reflex: a false click shows a light ripple', await js(`document.querySelectorAll('#nr-fx .nr-ripple').length > 0`));

  // ----- rounds 1–4: hit every target as soon as it shows -----
  const spots = [];
  const scores = [];
  for (let round = 1; round <= 4; round++) {
    const target = await waitForTarget();
    await mouse(target.box.x, target.box.y);
    spots.push(target);
    await sleep(80);
    scores.push(Number((await text('nr-score')).replace(/,/g, '')));
    if (round === 1) {
      const feedback = await js(`document.querySelector('#nr-fx .nr-float')?.textContent ?? ''`);
      check('reflex: hitting the target shows reaction, points and grade', /^\d+ ms\+[\d,]+(PERFECT|GREAT|GOOD|SLOW)$/.test(feedback), feedback);
      check('reflex: the target disappears after the hit', await js(`document.getElementById('nr-target').hidden`));
      check('reflex: the HUD best reaction updates', /^\d+ ms$/.test(await text('nr-best')), await text('nr-best'));
    }
  }
  await shot('11-reflex-hit-390');
  check('reflex: a target appears inside the arena and below the HUD', spots.every((t) => t.inside && t.belowHud));
  check('reflex: the target is large enough to tap (≥ 44px)', spots[0].box.width >= 44, `${Math.round(spots[0].box.width)}px`);
  check('reflex: every hit adds points', scores.every((s, i) => s > (scores[i - 1] ?? 0)), scores.join(' → '));
  check('reflex: the round goes up after each hit', (await reflexRound()) === '05');
  check('reflex: quick hits build a combo', (await text('nr-combo')) === 'x4', await text('nr-combo'));
  check('reflex: targets appear in different places', spots.every((t, i) => i === 0 || Math.hypot(t.box.x - spots[i - 1].box.x, t.box.y - spots[i - 1].box.y) > 30));

  // ----- round 5: let the target time out -----
  const beforeMiss = await text('nr-score');
  await waitForTarget();
  await shot('12-reflex-target-390');
  await sleep(1700);
  check('reflex: a missed target resets the combo and scores nothing', (await text('nr-combo')) === '—' && (await text('nr-score')) === beforeMiss && (await reflexRound()) === '06');

  // ----- rounds 6–10 -----
  for (let round = 6; round <= 10; round++) {
    await clickTarget();
    await sleep(60);
  }
  const finalHud = await text('nr-score');
  check('reflex: the game finishes after round 10', await js(`!document.getElementById('nr-done').hidden && document.getElementById('nr-field').classList.contains('is-locked')`));
  await click('#nr-field');
  check('reflex: presses after the end are ignored', (await text('nr-score')) === finalHud);

  // ----- results -----
  await sleep(1300);
  check('reflex: results screen is shown', await js(`!document.getElementById('screen-reflex-results').hidden && document.getElementById('screen-reflex-game').hidden`));
  check('reflex: results show the final score', (await text('nr-res-score')) === finalHud, finalHud);
  const average = await text('nr-res-average');
  const fastest = await text('nr-res-reaction');
  check('reflex: average and best reaction are shown in ms', /^\d+ ms$/.test(average) && /^\d+ ms$/.test(fastest) && parseInt(fastest, 10) <= parseInt(average, 10), `${average}, best ${fastest}`);
  check('reflex: best combo and hits are shown', (await text('nr-res-combo')) === 'x5' && (await text('nr-res-hits')) === '9/10', `${await text('nr-res-combo')}, ${await text('nr-res-hits')}`);
  check('reflex: the first game is a NEW BEST', await js(`!document.getElementById('nr-new-best').hidden`));
  check('reflex: results screen has no horizontal scroll', await noHorizontalScroll());
  await shot('13-reflex-results-390');

  const saved = JSON.parse(await js(`localStorage.getItem('mgh.neonReflex.best.v1')`));
  check('reflex: best score, reaction and combo are saved as integers', saved.score === Number(finalHud.replace(/,/g, '')) && saved.reaction === parseInt(fastest, 10) && saved.combo === 5, JSON.stringify(saved));
  check('reflex: the Color Chaos best is untouched', (await js(`localStorage.getItem('mgh.colorChaos.best.v1')`)) === chaosBest);

  // ----- play again: a fresh game, then keyboard play -----
  await click('#nr-again');
  await sleep(200);
  check('reflex: Play Again starts fresh at round 01 with 0 points', (await reflexRound()) === '01' && (await text('nr-score')) === '0' && (await text('nr-combo')) === '—' && (await text('nr-best')) === '—' && !(await js(`document.getElementById('nr-countdown').hidden`)));
  await waitForTarget();
  await key(' ');
  await sleep(80);
  check('reflex: keyboard: Space hits the target', Number((await text('nr-score')).replace(/,/g, '')) > 0 && (await reflexRound()) === '02');
  for (let round = 2; round <= 10; round++) {
    await clickTarget();
    await sleep(60);
  }
  await sleep(1300);
  check('reflex: the second game also reaches the results', await js(`!document.getElementById('screen-reflex-results').hidden`));
  await click('#nr-home');
  await sleep(250);
  check('reflex: HOME returns to the Mini Game Hub', await js(`!document.getElementById('screen-hub').hidden && ['screen-reflex-results', 'screen-reflex-home', 'screen-home'].every((id) => document.getElementById(id).hidden) && location.hash === ''`));
  const best = JSON.parse(await js(`localStorage.getItem('mgh.neonReflex.best.v1')`));
  check('reflex: the hub card shows the saved best score', (await js(`document.querySelector('[data-game="neon-reflex"] .game-best b').textContent`)) === best.score.toLocaleString('en-US'));

  // ----- persistence -----
  await open(REFLEX_URL);
  check('reflex: bests persist after refresh', (await text('nr-home-best')) === best.score.toLocaleString('en-US') && (await text('nr-home-reaction')) === `${best.reaction} ms` && (await text('nr-home-combo')) === `x${best.combo}`);
  await js(`localStorage.setItem('mgh.neonReflex.best.v1', '{broken')`);
  await open(REFLEX_URL);
  check('reflex: a corrupted saved best does not break the page', (await text('nr-home-best')) === '0' && errors.length === 0);
  await js(`localStorage.setItem('mgh.neonReflex.best.v1', ${JSON.stringify(JSON.stringify(best))})`);

  // ----- quit and back to hub -----
  await open(REFLEX_URL);
  await click('#nr-play');
  await sleep(3400);
  await click('#nr-quit');
  check('reflex: Quit goes back to the Neon Reflex home', await js(`!document.getElementById('screen-reflex-home').hidden && !document.body.classList.contains('is-playing')`));
  await click('#screen-reflex-home .back-link');
  await sleep(200);
  check('reflex: Back to Hub returns to the hub', await js(`!document.getElementById('screen-hub').hidden && document.getElementById('screen-reflex-home').hidden`));

  // ----- reduced motion -----
  await ws.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await open(REFLEX_URL);
  check('reflex: device reduced-motion setting is respected', (await js('document.documentElement.dataset.motion')) === 'reduced');
  await click('#nr-play');
  const target = await waitForTarget();
  const pulse = await js(`getComputedStyle(document.getElementById('nr-target'), '::before').animationIterationCount`);
  await mouse(target.box.x, target.box.y);
  await sleep(80);
  check('reflex: the game still plays with reduced motion, without looping pulses', Number((await text('nr-score')).replace(/,/g, '')) > 0 && pulse === '1', `pulse iterations: ${pulse}`);
  await click('#nr-quit');
  await ws.send('Emulation.setEmulatedMedia', { features: [] });

  // ----- layout at several sizes -----
  for (const [w, h, mobile] of [[360, 640, true], [390, 844, true], [768, 1024, true], [1280, 800, false]]) {
    await viewport(w, h, mobile);
    await open(URL_ROOT);
    await sleep(500); // let the cards finish sliding in
    const hubOk = await noHorizontalScroll();
    const cardsOk = await js(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const a = r('[data-game="color-chaos"]'), b = r('[data-game="neon-reflex"]'); return a.width > 0 && b.width > 0 && (a.right <= b.left + 1 || a.bottom <= b.top + 1); })()`);
    await shot(`14-hub-${w}`);
    check(`reflex ${w}×${h}: hub has no horizontal scroll and the playable cards do not overlap`, hubOk && cardsOk);

    await open(REFLEX_URL);
    const homeOk = await noHorizontalScroll();
    const homeFits = await js(`(() => { const b = document.getElementById('nr-play').getBoundingClientRect(); const stats = [...document.querySelectorAll('.reflex-stats b')].every((n) => n.scrollWidth <= n.clientWidth + 1); return b.height >= 44 && b.right <= innerWidth && stats; })()`);
    await shot(`14-reflex-home-${w}`);
    await click('#nr-play');
    const shown = await waitForTarget();
    const layout = await js(`(() => {
      const hud = document.querySelector('.reflex-hud').getBoundingClientRect();
      const arena = document.getElementById('nr-field').getBoundingClientRect();
      const quit = document.getElementById('nr-quit').getBoundingClientRect();
      const boxes = [...document.querySelectorAll('.reflex-hud .hud-box')].map((b) => b.getBoundingClientRect());
      const values = [...document.querySelectorAll('.reflex-hud b')].every((n) => n.scrollWidth <= n.clientWidth + 1);
      const apart = boxes.every((b, i) => i === 0 || b.left >= boxes[i - 1].right - 0.5);
      return { arenaW: arena.width, arenaH: arena.height, arenaTop: arena.top, hudBottom: hud.bottom, quitBottom: quit.bottom, quitH: quit.height, vh: innerHeight, values, apart };
    })()`);
    await shot(`15-reflex-game-${w}`);
    check(`reflex ${w}×${h}: no horizontal scroll (home + game)`, homeOk && (await noHorizontalScroll()));
    check(`reflex ${w}×${h}: Play button is large and the bests fit`, homeFits);
    check(`reflex ${w}×${h}: HUD values fit and the boxes do not overlap`, layout.values && layout.apart);
    check(`reflex ${w}×${h}: arena below the HUD, big, and everything on screen`, layout.arenaTop >= layout.hudBottom && layout.arenaH >= 240 && layout.quitBottom <= layout.vh && layout.quitH >= 44, `arena ${Math.round(layout.arenaW)}×${Math.round(layout.arenaH)}, quit bottom ${Math.round(layout.quitBottom)} / ${layout.vh}`);
    check(`reflex ${w}×${h}: target inside the arena and at least 44px`, shown.inside && shown.belowHud && shown.box.width >= 44, `${Math.round(shown.box.width)}px`);
    await click('#nr-quit');
  }
}

/** The round number shown in the HUD, e.g. "04". */
function reflexRound() { return text('nr-round'); }

/** Wait until a target is showing; returns where it is and whether it sits inside the arena, below the HUD. */
async function waitForTarget(timeout = 6000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const found = await js(`(() => {
      const t = document.getElementById('nr-target');
      if (t.hidden) return null;
      const box = t.getBoundingClientRect();
      const arena = document.getElementById('nr-field').getBoundingClientRect();
      const hud = document.querySelector('.reflex-hud').getBoundingClientRect();
      const size = t.offsetWidth; // its laid-out size; the box may still be scaling in
      const x = box.x + box.width / 2, y = box.y + box.height / 2, half = size / 2;
      const inside = x - half >= arena.left && x + half <= arena.right && y - half >= arena.top && y + half <= arena.bottom;
      return { box: { x, y, width: size }, inside, belowHud: y - half >= hud.bottom };
    })()`);
    if (found) return found;
    await sleep(15);
  }
  throw new Error('No target appeared.');
}

async function clickTarget() {
  const { box } = await waitForTarget();
  await mouse(box.x, box.y);
}

/** A press in a corner of the arena, where targets never appear. */
async function clickArenaCorner() {
  const p = await js(`(() => { const r = document.getElementById('nr-field').getBoundingClientRect(); return { x: r.left + 8, y: r.bottom - 8 }; })()`);
  await mouse(p.x, p.y);
}

// ----- page helpers -----

/** Load a page fresh (via about:blank, so a hash-only change still reloads). Defaults to Color Chaos. */
async function open(url = GAME_URL) {
  for (const target of ['about:blank', url]) {
    const loaded = ws.once('Page.loadEventFired');
    await ws.send('Page.navigate', { url: target });
    await loaded;
  }
  await sleep(150);
}

async function js(expression) {
  const { result, exceptionDetails } = await ws.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

function text(id) { return js(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`); }
function noHorizontalScroll() { return js('document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth'); }

async function click(selector) {
  const box = await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await mouse(box.x, box.y);
  await sleep(80);
}

async function mouse(x, y) {
  await ws.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await ws.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function key(name) {
  const [code, windowsVirtualKeyCode] = { ArrowRight: ['ArrowRight', 39], Enter: ['Enter', 13], ' ': ['Space', 32] }[name];
  await ws.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode });
  await ws.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode });
}

/** Wait until a page expression is true. */
async function waitFor(expression, timeout = 5000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await js(expression)) return true;
    await sleep(15);
  }
  return false;
}

/** Read the board from the page and tap a tile that is part of a group (or a lone tile). */
async function readBoard() {
  return js(`[...document.querySelectorAll('.tile')].reduce((rows, t) => { const r = +t.dataset.row; (rows[r] ??= [])[+t.dataset.col] = { color: t.dataset.color }; return rows; }, [])`);
}
async function tapWhere(wanted) {
  const board = await readBoard();
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const size = findGroup(board, r, c).length;
      if (wanted(size)) {
        await click(`.tile[data-row="${r}"][data-col="${c}"]`);
        return;
      }
    }
  }
}
function tapFirstMatch() { return tapWhere((size) => size >= 2); }
function tapSingle() { return tapWhere((size) => size === 1); }

async function viewport(width, height, mobile) {
  await ws.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}

async function shot(name) {
  const { data } = await ws.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}

// ----- DevTools protocol over WebSocket -----

async function connect() {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {
      // browser still starting
    }
  }
  if (!target) throw new Error('Could not connect to the browser.');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    } else if (message.method) {
      (listeners.get(message.method) ?? []).slice().forEach((fn) => fn(message.params));
    }
  };

  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]);

  return {
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    }),
    on,
    once: (method) => new Promise((resolve) => {
      const fn = (params) => {
        listeners.set(method, (listeners.get(method) ?? []).filter((f) => f !== fn));
        resolve(params);
      };
      on(method, fn);
    }),
    close: () => socket.close(),
  };
}
