import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStorage, STORAGE_KEYS } from '../src/app/storage.js';

/** An in-memory stand-in for localStorage. */
const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    dump: () => Object.fromEntries(data),
  };
};

test('best score starts at 0 and is kept after a "refresh"', () => {
  const backend = memory();

  assert.deepEqual(createStorage(backend).getBest(), { score: 0, combo: 0 });
  createStorage(backend).saveResult({ score: 8420, bestCombo: 7 });

  // A new storage object over the same data = the page was reloaded.
  assert.deepEqual(createStorage(backend).getBest(), { score: 8420, combo: 7 });
});

test('new best is detected only when the score is higher', () => {
  const storage = createStorage(memory());

  assert.equal(storage.saveResult({ score: 500, bestCombo: 2 }).isNewBest, true);
  assert.equal(storage.saveResult({ score: 500, bestCombo: 1 }).isNewBest, false); // a tie is not a new best
  const lower = storage.saveResult({ score: 300, bestCombo: 5 });
  assert.equal(lower.isNewBest, false);
  assert.deepEqual(lower.best, { score: 500, combo: 5 }); // best combo still improves on its own
  assert.equal(storage.saveResult({ score: 501, bestCombo: 0 }).isNewBest, true);
  assert.deepEqual(storage.getBest(), { score: 501, combo: 5 });
});

test('the first round with any score counts as a new best, a zero score does not', () => {
  assert.equal(createStorage(memory()).saveResult({ score: 0, bestCombo: 0 }).isNewBest, false);
  assert.equal(createStorage(memory()).saveResult({ score: 50, bestCombo: 1 }).isNewBest, true);
});

test('corrupted or tampered saved data falls back safely', () => {
  for (const raw of ['not json', '{"score":"9999"}', '{"score":-5,"combo":3}', '{"score":1.5}', '{"score":1e300}', 'null', '[]', '42']) {
    const storage = createStorage(memory({ [STORAGE_KEYS.best]: raw }));
    const best = storage.getBest();
    assert.ok(Number.isSafeInteger(best.score) && best.score >= 0, raw);
    assert.ok(Number.isSafeInteger(best.combo) && best.combo >= 0, raw);
  }

  // A corrupted best is replaced by the next real result, not left broken.
  const backend = memory({ [STORAGE_KEYS.best]: '{oops' });
  createStorage(backend).saveResult({ score: 120, bestCombo: 2 });
  assert.deepEqual(JSON.parse(backend.dump()[STORAGE_KEYS.best]), { score: 120, combo: 2 });
});

test('sound preference persists and defaults to on', () => {
  const backend = memory();

  assert.equal(createStorage(backend).getSound(), true);
  createStorage(backend).setSound(false);
  assert.equal(createStorage(backend).getSound(), false);
  createStorage(backend).setSound(true);
  assert.equal(createStorage(backend).getSound(), true);
});

test('motion preference persists and only accepts known values', () => {
  const backend = memory();

  assert.equal(createStorage(backend).getMotion(), 'system');
  createStorage(backend).setMotion('reduced');
  assert.equal(createStorage(backend).getMotion(), 'reduced');
  createStorage(memory({ [STORAGE_KEYS.motion]: 'party' })).getMotion() === 'system' || assert.fail();
});

test('the game still works when localStorage is unavailable or throws', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };

  for (const backend of [null, broken]) {
    const storage = createStorage(backend);
    assert.deepEqual(storage.getBest(), { score: 0, combo: 0 });
    assert.equal(storage.saveResult({ score: 10, bestCombo: 1 }).isNewBest, true);
    assert.equal(storage.getSound(), true);
    assert.doesNotThrow(() => storage.setSound(false));
    assert.equal(storage.getMotion(), 'system');
  }
});
