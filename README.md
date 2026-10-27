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

## Run it

```sh
npm start          # http://127.0.0.1:5173
```

The page uses ES modules, so open it through the server (not as a `file://`).

## Check it

```sh
npm test           # unit tests for the game logic and saved data (node --test)
npm run check      # syntax check of every file + HTML ids used by the code
npm run e2e        # plays a full round in headless Edge/Chrome (~1.5 min)
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
  app/         browser side
    boardView.js draws the board, pointer + keyboard input, effects
    storage.js   localStorage (best score, sound, motion), validated
    audio.js     sound effects made with Web Audio (no audio files)
  main.js      screens, the round's clock, wiring
  styles.css
tests/         node --test unit tests
scripts/       dev server, checks, browser end-to-end test
```

- **State:** the game is an immutable value. `applyMove` and `tick` return
  a new state, and time is passed in rather than read from a clock, so a
  round can be replayed exactly.
- **Saved data:** `localStorage` keys `mgh.colorChaos.best.v1`,
  `mgh.sound` and `mgh.motion`. Bad or tampered values fall back to defaults.
- **Sound:** nothing is created until the player presses Play, and sound
  can be turned off.
- **Accessibility:** every colour also has its own shape (● ▲ ■ ◆ ★). Tiles
  are labelled buttons. Arrow keys plus Enter/Space work on the board.
  `prefers-reduced-motion` is respected, and the Motion toggle can override it.
