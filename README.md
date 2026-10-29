# Mini Game Hub

Small browser games. No accounts, no backend, no dependencies.

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

## Run it

```sh
npm start          # http://127.0.0.1:5173
```

The page uses ES modules, so open it through the server (not as a `file://`).

## Check it

```sh
npm test           # unit tests for the game logic and saved data (node --test)
npm run check      # syntax check of every file + HTML ids used by the code
npm run e2e        # plays both games in headless Edge/Chrome (~2.5 min)
                   # E2E_ONLY=color-chaos or E2E_ONLY=neon-reflex for one game
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
  app/         browser side
    boardView.js   draws the Color Chaos board, pointer + keyboard input, effects
    arenaView.js   draws the Neon Reflex arena, target and effects
    storage.js     localStorage (Color Chaos best, sound, motion), validated
    reflexStorage.js  localStorage (Neon Reflex bests), validated
    audio.js       sound effects made with Web Audio (no audio files)
  games.js     the hub's game registry (status: playable / soon)
  hub.js       the hub's game cards
  colorChaos.js  Color Chaos screens, the round's clock, wiring
  neonReflex.js  Neon Reflex screens, the clock, wiring
  main.js      routes #color-chaos / #neon-reflex / the hub
  styles.css
tests/         node --test unit tests
scripts/       dev server, checks, browser end-to-end test
```

- **State:** the game is an immutable value. `applyMove` and `tick` return
  a new state, and time is passed in rather than read from a clock, so a
  round can be replayed exactly.
- **Saved data:** `localStorage` keys `mgh.colorChaos.best.v1`,
  `mgh.neonReflex.best.v1` (score, fastest reaction, combo), `mgh.sound`
  and `mgh.motion`. Bad or tampered values fall back to defaults.
- **Sound:** nothing is created until the player presses Play, and sound
  can be turned off.
- **Accessibility:** every colour also has its own shape (● ▲ ■ ◆ ★). Tiles
  are labelled buttons. Arrow keys plus Enter/Space work on the board.
  `prefers-reduced-motion` is respected, and the Motion toggle can override it.
