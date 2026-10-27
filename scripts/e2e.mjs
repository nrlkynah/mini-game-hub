// End-to-end check in a real browser (headless Microsoft Edge or Chrome),
// driven over the DevTools protocol. No dependencies.
//
// It plays one full 60-second round with real clicks and checks the
// countdown, scoring, combo, the timer, game over, results, saved best score,
// sound/motion preferences, reduced motion and the layout at several sizes.
//
// Usage: npm run e2e            (set BROWSER=path/to/chrome to override)
// Takes about 1.5 minutes. Screenshots go to ./e2e-output/.

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
const OUT = 'e2e-output';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
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
  const errors = [];
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

  check('no JavaScript errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
}

// ----- page helpers -----

async function open() {
  const loaded = ws.once('Page.loadEventFired');
  await ws.send('Page.navigate', { url: URL_ROOT });
  await loaded;
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
  const box = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await mouse(box.x, box.y);
  await sleep(80);
}

async function mouse(x, y) {
  await ws.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await ws.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function key(name) {
  await ws.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: { ArrowRight: 39, Enter: 13 }[name] });
  await ws.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: { ArrowRight: 39, Enter: 13 }[name] });
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
