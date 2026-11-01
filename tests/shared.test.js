import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSettings } from '../src/app/settings.js';
import { comboTier } from '../src/app/effects.js';
import { readJson, safeCount, writeJson } from '../src/app/safeStorage.js';
import { createStorage, STORAGE_KEYS } from '../src/app/storage.js';

/** An in-memory stand-in for localStorage. */
const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), dump: () => Object.fromEntries(data) };
};

test('settings: Sound and Motion default to ON', () => {
  const settings = createSettings(createStorage(memory()));

  assert.equal(settings.sound, true);
  assert.equal(settings.motion, true);
  assert.equal(settings.isReducedMotion(), false);
});

test('settings: changes are saved and survive a refresh', () => {
  const backend = memory();
  const first = createSettings(createStorage(backend));
  first.setSound(false);
  first.setMotion(false);

  assert.deepEqual(backend.dump(), { [STORAGE_KEYS.sound]: 'off', [STORAGE_KEYS.motion]: 'reduced' });

  // A new instance over the same data = the page was reloaded.
  const again = createSettings(createStorage(backend));
  assert.equal(again.sound, false);
  assert.equal(again.motion, false);
  assert.equal(again.isReducedMotion(), true);

  again.setMotion(true);
  assert.equal(backend.dump()[STORAGE_KEYS.motion], 'system');
});

test('settings: Motion ON still follows the device; Motion OFF always reduces', () => {
  let deviceWantsLess = true;
  const settings = createSettings(createStorage(memory()), () => deviceWantsLess);

  assert.equal(settings.motion, true);
  assert.equal(settings.isReducedMotion(), true); // the device asks for it
  assert.equal(settings.deviceReducesMotion(), true);

  deviceWantsLess = false;
  assert.equal(settings.isReducedMotion(), false);
  settings.setMotion(false);
  assert.equal(settings.isReducedMotion(), true);
});

test('settings: older saved motion values still load sensibly', () => {
  for (const [saved, on] of [['system', true], ['full', true], ['reduced', false], ['nonsense', true]]) {
    const settings = createSettings(createStorage(memory({ [STORAGE_KEYS.motion]: saved })));
    assert.equal(settings.motion, on, saved);
  }
});

test('settings: listeners hear every change, and can stop listening', () => {
  const settings = createSettings(createStorage(memory()));
  const heard = [];
  const stop = settings.subscribe((s) => heard.push([s.sound, s.motion]));

  settings.setSound(false);
  settings.setMotion(false);
  stop();
  settings.setSound(true);

  assert.deepEqual(heard, [[true, true], [false, true], [false, false]]);
});

test('settings: still work when localStorage is missing or throws', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
  for (const backend of [null, broken]) {
    const settings = createSettings(createStorage(backend));
    assert.equal(settings.sound, true);
    assert.doesNotThrow(() => settings.setSound(false));
    assert.equal(settings.sound, false); // still applies for this visit
  }
});

test('comboTier: 0 none, 1 for x2–x4, 2 for x5–x9, 3 from x10', () => {
  assert.deepEqual([0, 1, 2, 4, 5, 9, 10, 25].map(comboTier), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('safe storage helpers never throw and validate numbers', () => {
  assert.deepEqual([5, 0, -1, 1.5, NaN, '7', 1e300].map(safeCount), [5, 0, 0, 0, 0, 0, 0]);

  const backend = memory();
  writeJson(backend, 'k', { a: 1 });
  assert.deepEqual(readJson(backend, 'k'), { a: 1 });
  assert.equal(readJson(memory({ k: '{broken' }), 'k'), null);
  assert.equal(readJson(null, 'k'), null);

  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(readJson(broken, 'k'), null);
  assert.doesNotThrow(() => writeJson(broken, 'k', 1));
});
