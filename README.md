# Mini Game Hub

Futuristic neon mini games for the browser: Color Chaos, Neon Reflex, Memory
Matrix and Space Tap (Laser Dodge is coming soon). No accounts, no backend,
no dependencies.

**Settings (⚙ in the top bar):** Sound and Motion, ON/OFF, for every game.
Saved on the device. Motion ON still follows the device's reduce-motion
setting; Motion OFF always calms animations (gameplay feedback stays).

## Color Chaos: 60 second challenge

Tap a group of **2 or more touching tiles of the same colour** to clear it.
Bigger groups score more, and quick matches build a combo multiplier.
You have 60 seconds.

| Group size | Points |
|---|---|
| 2 | 50 |
| 3 | 100 |
| 4 | 175 |
| 5 | 250 (+75 for each extra tile) |

Points × combo. The combo goes up by one for every match made within 2.5 s
of the previous one (up to x10). It resets after a pause or a tap on a lone
tile.

## Neon Reflex: how fast are you?

Hit the neon target the instant it appears. 10 rounds; each target shows up
after a random pause (0.5–1.3 s) at a new spot, and is a miss if left for 1.5 s.

| Reaction | Grade | Points |
|---|---|---|
| under 200 ms | PERFECT | 1000 − ms (142 ms → 858) |
| 200–349 ms | GREAT | |
| 350–499 ms | GOOD | |
| 500 ms + | SLOW | at least 50 |

Plus 100 for every combo step above x1. Each PERFECT/GREAT/GOOD hit adds one
to the combo; a SLOW hit or a missed target resets it. Tapping empty space
is a light "false click": no points lost, combo kept. Space or Enter works
as a tap on the target.

## Memory Matrix: remember the light

Tiles on a 4×4 grid light up one by one, stay lit, then hide. Tap them in
the same order. Level 1 has 3 tiles; each level adds one (up to 10), and the
reveal gets a little faster (650 ms per tile, −25 ms per level, never below
380 ms).

| Cleared | Points |
|---|---|
| level 1, 2, 3 … | 100, 150, 200 … (+50 per level) |
| streak | +50 for each level in a row above x1 |
| quick | +50 if repeated within 0.7 s per tile |

3 lives. A wrong tile costs a life, resets the streak and shows the same
pattern again; nothing is taken off the score. Tapping a tile already picked
is ignored. Arrow keys plus Enter/Space work on the grid.

## Space Tap: tap, combo, survive

30 seconds. Stars, planets and comets pop up around the arena and fade
after a moment; tap them first. Mines (💣) are decoys: never tap them.

| Target | Points |
|---|---|
| ⭐ star, 🪐 planet | 100 |
| ☄️ comet (bonus) | 250 |
| 💣 mine | MISS: no points, combo lost |

Points × combo multiplier: x1 1.0, x2 1.2, x3 1.4, x4 1.6, x5 and up 2.0.
A mine or a target left to fade ("TOO SLOW") resets the combo. A tap on
empty space only lowers accuracy. Accuracy = hits / taps (100% with no taps).

Every 10 seconds it gets harder (easy → medium → hard): targets spawn faster
and live shorter, every 7th / 5th / 4th target is a mine, and every 6th / 8th
/ 10th is a comet. Decoys and comets follow that fixed rhythm, not luck.
Keyboard: the number shown on a target (1–4) taps it.

## Run it

```sh
npm start          # http://127.0.0.1:5173
```

The page uses ES modules, so open it through the server (not as a `file://`).

## Check it

```sh
npm test           # unit tests for the game logic and saved data (node --test)
npm run check      # syntax check of every file + HTML ids used by the code
npm run e2e        # plays all four games in headless Edge/Chrome (~5 min)
                   # E2E_ONLY=color-chaos, neon-reflex, memory-matrix or space-tap for one game
```

`npm run e2e` writes screenshots to `e2e-output/`. Set `BROWSER=/path/to/chrome`
if Edge or Chrome is not found automatically.

## How it is built

```
index.html
src/
  game/        pure game logic, no DOM: testable on its own
    config.js    rules (board size, time, combo window, colours)
    rng.js       seeded random numbers (same seed → same game)
    board.js     board creation, finding groups, gravity + refill
    scoring.js   points and combo
    engine.js    createGame / applyMove(state, move) / tick(state, ms)
  reflex/      Neon Reflex game logic, no DOM
    config.js    rounds, delays, timeout, grades
    scoring.js   reaction grades, points, combo
    engine.js    createReflexGame / tick(state, now) / press(state, { at, onTarget })
  matrix/      Memory Matrix game logic, no DOM
    config.js    grid, lives, pattern sizes, reveal timing, points
    pattern.js   pattern generation, reveal timing, checking a pick
    scoring.js   level points, streak and quick bonus, accuracy
    engine.js    createMemoryGame / tick(state, now) / select(state, { tile, at })
  space/       Space Tap game logic, no DOM
    config.js    run length, difficulty phases, target kinds, multipliers
    targets.js   phase at a moment, next target kind, free spot, keyboard slot
    scoring.js   points × multiplier, accuracy
    engine.js    createSpaceGame / tick(state, now) / tap(state, { at, targetId })
  app/         browser side, shared by the games where it can be
    settings.js    global Sound + Motion settings (one shared instance)
    settingsView.js  the ⚙ Settings dialog
    effects.js     comboTier, the 3-2-1-GO! countdown, new-best confetti
    safeStorage.js safe localStorage helpers (never throw, validate numbers)
    boardView.js   draws the Color Chaos board, pointer + keyboard input, effects
    arenaView.js   draws the Neon Reflex arena, target and effects
    matrixView.js  draws the Memory Matrix grid, pointer + keyboard input, effects
    spaceView.js   draws the Space Tap arena, targets and effects
    storage.js     localStorage (Color Chaos best, sound and motion settings), validated
    reflexStorage.js  localStorage (Neon Reflex bests), validated
    matrixStorage.js  localStorage (Memory Matrix bests), validated
    spaceStorage.js   localStorage (Space Tap bests), validated
    audio.js       sound effects made with Web Audio (no audio files)
  games.js     the hub's game registry (status: playable / soon)
  hub.js       the hub's game cards
  colorChaos.js  Color Chaos screens, the round's clock, wiring
  neonReflex.js  Neon Reflex screens, the clock, wiring
  memoryMatrix.js  Memory Matrix screens, the clock, wiring
  spaceTap.js  Space Tap screens, the run's clock, wiring
  main.js      routes #color-chaos / #neon-reflex / #memory-matrix / #space-tap / the hub
  styles.css
tests/         node --test unit tests
scripts/       dev server, checks, browser end-to-end test
```

- **State:** the game is an immutable value. `applyMove` and `tick` return
  a new state, and time is passed in rather than read from a clock, so a
  round can be replayed exactly.
- **Saved data:** `localStorage` keys `mgh.colorChaos.best.v1`,
  `mgh.neonReflex.best.v1` (score, fastest reaction, combo),
  `mgh.memoryMatrix.best.v1` (score, highest level, streak),
  `mgh.spaceTap.best.v1` (score, combo, accuracy), `mgh.sound`
  and `mgh.motion`. Bad or tampered values fall back to defaults.
- **Sound:** nothing is created until the player presses Play, and sound
  can be turned off in Settings (or on the Color Chaos screen).
- **Accessibility:** every colour also has its own shape (● ▲ ■ ◆ ★). Tiles
  are labelled buttons. Arrow keys plus Enter/Space work on the board.
  `prefers-reduced-motion` is respected, and Motion OFF in Settings calms
  animations everywhere.
