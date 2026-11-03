import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACHIEVEMENTS, createProfile, PROFILE_STORAGE_KEY } from '../src/app/profile.js';
import { STORAGE_KEYS } from '../src/app/storage.js';
import { REFLEX_STORAGE_KEY } from '../src/app/reflexStorage.js';
import { GAMES } from '../src/games.js';

const IDS = GAMES.map((g) => g.id);

/** An in-memory stand-in for localStorage. */
const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    dump: () => Object.fromEntries(data),
  };
};

const unlockedIds = (profile) => profile.get().achievements.filter((a) => a.unlocked).map((a) => a.id);
const play = (profile, gameId, score, metadata = {}, now = 1000) => profile.recordGameResult({ gameId, score, completed: true, metadata }, { now });

test('profile: a new profile is empty, with every achievement locked', () => {
  const p = createProfile(memory()).get();

  assert.deepEqual([p.played, p.completed, p.totalScore, p.bestOverall, p.mastered, p.gameCount], [0, 0, 0, 0, 0, 5]);
  assert.deepEqual(Object.keys(p.games), IDS);
  assert.ok(IDS.every((id) => p.games[id].played === 0 && p.games[id].best === 0));
  assert.equal(p.achievements.length, ACHIEVEMENTS.length);
  assert.ok(p.achievements.every((a) => a.unlocked === false && a.unlockedAt === null));
  for (const a of p.achievements) {
    assert.ok(a.id && a.title && a.description && a.icon, a.id);
    assert.equal('unlocks' in a, false); // the rule stays inside the module
  }
});

test('profile: recording a result counts the game, the score and the per-game stats', () => {
  const profile = createProfile(memory());
  play(profile, 'space-tap', 4200);
  play(profile, 'space-tap', 3000);
  play(profile, 'color-chaos', 9100);

  const p = profile.get();
  assert.equal(p.played, 3);
  assert.equal(p.completed, 3);
  assert.equal(p.totalScore, 4200 + 3000 + 9100);
  assert.deepEqual(p.games['space-tap'], { played: 2, completed: 2, best: 4200 });
  assert.deepEqual(p.games['color-chaos'], { played: 1, completed: 1, best: 9100 });
  assert.equal(p.bestOverall, 9100);
});

test('profile: a game left early counts as played, not completed, and adds no score', () => {
  const profile = createProfile(memory());
  profile.recordGameResult({ gameId: 'laser-dodge', score: 800, completed: false });

  const p = profile.get();
  assert.deepEqual([p.played, p.completed, p.totalScore, p.games['laser-dodge'].best], [1, 0, 0, 0]);
  assert.deepEqual(p.games['laser-dodge'], { played: 1, completed: 0, best: 0 });
});

test('profile: per-game bests only rise, and best overall is the highest of them', () => {
  const profile = createProfile(memory());
  assert.equal(play(profile, 'neon-reflex', 5000).isNewBest, true);
  assert.equal(play(profile, 'neon-reflex', 4000).isNewBest, false);
  assert.equal(play(profile, 'neon-reflex', 5000).isNewBest, false); // a tie is not a new best
  play(profile, 'memory-matrix', 700);

  const p = profile.get();
  assert.equal(p.games['neon-reflex'].best, 5000);
  assert.equal(p.bestOverall, 5000);
});

test('profile: unknown games and odd scores are handled safely', () => {
  const profile = createProfile(memory());
  assert.deepEqual(profile.recordGameResult({ gameId: 'pong', score: 10, completed: true }), { unlocked: [], isNewBest: false });
  play(profile, 'space-tap', -50);
  play(profile, 'space-tap', NaN);
  play(profile, 'space-tap', 120.6);

  const p = profile.get();
  assert.equal(p.played, 3);
  assert.equal(p.totalScore, 121);
});

test('profile: it survives a refresh, and a new profile starts from the bests already saved by the games', () => {
  const backend = memory({ [STORAGE_KEYS.best]: JSON.stringify({ score: 8000, combo: 7 }), [REFLEX_STORAGE_KEY]: '{broken' });
  const first = createProfile(backend);
  assert.equal(first.get().games['color-chaos'].best, 8000);
  assert.equal(first.get().games['neon-reflex'].best, 0);
  play(first, 'memory-matrix', 300);

  // A new instance over the same data = the page was reloaded.
  const again = createProfile(backend).get();
  assert.equal(again.played, 1);
  assert.equal(again.games['memory-matrix'].best, 300);
  assert.equal(again.games['color-chaos'].best, 8000);
  assert.deepEqual(unlockedIds(createProfile(backend)), ['first-play']);

  // The games' own keys are only read, never changed.
  assert.equal(backend.dump()[STORAGE_KEYS.best], JSON.stringify({ score: 8000, combo: 7 }));
});

test('achievements: First Play and Arcade Regular unlock with a timestamp, and stay unlocked', () => {
  const backend = memory();
  const profile = createProfile(backend);
  const first = play(profile, 'space-tap', 100, {}, 1_700_000_000_000);
  assert.deepEqual(first.unlocked.map((a) => a.id), ['first-play']);
  assert.equal(first.unlocked[0].unlockedAt, 1_700_000_000_000);

  for (let i = 0; i < 8; i++) play(profile, 'space-tap', 50);
  assert.equal(unlockedIds(profile).includes('arcade-regular'), false);
  assert.deepEqual(play(profile, 'space-tap', 50, {}, 1_800_000_000_000).unlocked.map((a) => a.id), ['arcade-regular']);

  // Unlocked once, never again; the first time is kept.
  assert.deepEqual(play(profile, 'space-tap', 50).unlocked, []);
  const reloaded = createProfile(backend).get().achievements;
  assert.equal(reloaded.find((a) => a.id === 'first-play').unlockedAt, 1_700_000_000_000);
  assert.equal(reloaded.find((a) => a.id === 'arcade-regular').unlocked, true);
});

test('achievements: Five of Five needs every game played; All-Star needs a best in every game', () => {
  const profile = createProfile(memory());
  for (const id of IDS.slice(0, 4)) play(profile, id, 100);
  assert.equal(unlockedIds(profile).includes('five-of-five'), false);

  profile.recordGameResult({ gameId: 'laser-dodge', score: 0, completed: false }); // played, but no best
  assert.equal(unlockedIds(profile).includes('five-of-five'), true);
  assert.equal(unlockedIds(profile).includes('all-star'), false);

  assert.deepEqual(play(profile, 'laser-dodge', 900).unlocked.map((a) => a.id), ['all-star']);
});

test('achievements: High Score needs beating an earlier best, not just a first score', () => {
  const profile = createProfile(memory());
  play(profile, 'color-chaos', 5000);
  assert.equal(unlockedIds(profile).includes('high-score'), false); // the first score is not "beating" anything
  play(profile, 'color-chaos', 4999);
  assert.equal(unlockedIds(profile).includes('high-score'), false);
  assert.ok(play(profile, 'color-chaos', 5001).unlocked.some((a) => a.id === 'high-score'));

  // A best carried over from before the profile counts too.
  const seeded = createProfile(memory({ [STORAGE_KEYS.best]: JSON.stringify({ score: 3000 }) }));
  assert.ok(play(seeded, 'color-chaos', 3500).unlocked.some((a) => a.id === 'high-score'));
});

test('achievements: game milestones follow each game\'s results', () => {
  const profile = createProfile(memory());
  const unlocks = (gameId, metadata, completed = true) => profile.recordGameResult({ gameId, score: 10, completed, metadata }).unlocked.map((a) => a.id);

  assert.deepEqual(unlocks('color-chaos', { bestCombo: 7 }).filter((id) => id === 'chain-reaction'), []);
  assert.ok(unlocks('color-chaos', { bestCombo: 8 }).includes('chain-reaction'));

  assert.ok(!unlocks('neon-reflex', { hits: 7, averageReaction: 200 }).includes('lightning')); // too few hits
  assert.ok(!unlocks('neon-reflex', { hits: 10, averageReaction: 351 }).includes('lightning'));
  assert.ok(unlocks('neon-reflex', { hits: 8, averageReaction: 350 }).includes('lightning'));

  assert.ok(!unlocks('memory-matrix', { cleared: 5 }).includes('total-recall'));
  assert.ok(unlocks('memory-matrix', { cleared: 6 }).includes('total-recall'));

  assert.ok(!unlocks('space-tap', { hits: 24, accuracy: 100 }).includes('sharpshooter'));
  assert.ok(!unlocks('space-tap', { hits: 30, accuracy: 89 }).includes('sharpshooter'));
  assert.ok(unlocks('space-tap', { hits: 25, accuracy: 90 }).includes('sharpshooter'));

  assert.ok(!unlocks('laser-dodge', { timeMs: 30_000 }, false).includes('survivor')); // only for a finished run
  assert.ok(unlocks('laser-dodge', { timeMs: 30_000 }).includes('survivor'));

  assert.equal(profile.get().mastered, 5);
});

test('achievements: listeners hear about new unlocks only', () => {
  const profile = createProfile(memory());
  const heard = [];
  const stop = profile.onUnlock((list) => heard.push(list.map((a) => a.id)));
  play(profile, 'space-tap', 100);
  play(profile, 'space-tap', 100);
  stop();
  play(profile, 'space-tap', 200);

  assert.deepEqual(heard, [['first-play']]);
});

test('profile: it still works when localStorage is missing, throws, or holds junk', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('denied'); } };
  for (const backend of [null, broken]) {
    const profile = createProfile(backend);
    assert.equal(profile.get().played, 0);
    assert.deepEqual(play(profile, 'space-tap', 100).unlocked.map((a) => a.id), ['first-play']);
    assert.equal(profile.get().played, 1); // kept for this visit
    assert.doesNotThrow(() => profile.reset());
  }

  for (const raw of ['not json', '[]', '42', JSON.stringify({ played: -4, totalScore: 'lots', games: { 'space-tap': { best: 1.5 }, pong: { best: 9 } }, achievements: { 'first-play': -1, cheat: 5 } })]) {
    const p = createProfile(memory({ [PROFILE_STORAGE_KEY]: raw })).get();
    assert.deepEqual([p.played, p.totalScore, p.games['space-tap'].best], [0, 0, 0], raw);
    assert.ok(!('pong' in p.games));
    assert.ok(p.achievements.every((a) => !a.unlocked), raw);
  }
});

test('profile: reset clears plays, scores and achievements only', () => {
  const backend = memory({ 'mgh.sound': 'off', 'mgh.motion': 'reduced', [STORAGE_KEYS.best]: JSON.stringify({ score: 777, combo: 3 }) });
  const profile = createProfile(backend);
  for (const id of IDS) play(profile, id, 1000);
  assert.ok(profile.get().achievements.some((a) => a.unlocked));

  profile.reset();
  const p = profile.get();
  assert.deepEqual([p.played, p.completed, p.totalScore], [0, 0, 0]);
  assert.ok(p.achievements.every((a) => !a.unlocked));
  assert.equal(p.games['color-chaos'].best, 777); // the game's own best is still there

  const saved = backend.dump();
  assert.equal(saved['mgh.sound'], 'off');
  assert.equal(saved['mgh.motion'], 'reduced');
  assert.equal(saved[STORAGE_KEYS.best], JSON.stringify({ score: 777, combo: 3 }));
  assert.equal(PROFILE_STORAGE_KEY in saved, false);
  assert.equal(createProfile(backend).get().played, 0); // still reset after a reload
});
