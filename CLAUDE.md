# CLAUDE.md

Notes for AI coding assistants working on motion-console. What it is and how to play: [README.md](README.md).
Writing a game: [src/games/README.md](src/games/README.md).

Plain JavaScript ES modules and one 1920x1080 canvas. **No build step, no runtime dependencies, nothing
leaves the computer.**

## Commands

```
node server.mjs                 # http://localhost:8140 (PORT overrides); ?mouse for no camera
npm test                        # unit tests (~2 s); run after every change
npm run test:e2e                # real Chrome: fake-webcam camera path + full console flow (~1 min)
GAME=src/games/x.js node --test test/sim/check-game.test.js   # one game while writing it
```

## Architecture

```
src/main.js            wires camera/mouse -> roster -> screens; the loop; keys, taps, the hand cursor
src/vision/            camera + tracking
  pose.js               camera + pose model (worker on the GPU; main thread with the GPU if the worker can't)
  pose-worker.js        CLASSIC worker (MediaPipe needs importScripts); pose-core.js shared with the main thread
  signature.js          clothing colours (torso + thighs histograms), read in the worker
  roster.js             THE LOCKED ROSTER: claim, identity gates, exact assignment, bystander tracks
  body.js               describe() one skeleton (size, posture, partial, static pose); Body: jumps, squats,
                        flaps, throws, steps, arm circles, knee lifts, star jumps, poses, energy, move counts.
                        Detection is forgiving on purpose (bent arms, small flaps): never demand exact positions
  synth.js  mouse.js    synthetic skeletons (tests, bots, demos); mouse mode
src/moves.js           every move: kid-friendly words + an animation (demos, coach, bots, mouse)
src/engine/            clock.js (game clock + fixed-step loop), host.js (a round: timer, scores, hearts, lanes,
                       difficulty, fx, results), coach.js, audio.js (synth sfx + music), speech.js, settings.js
src/ui/                screens.js (every console screen, Workout circuits + summary), menu.js (hand/keys/tap/mouse menus), hud.js,
                       coach.js (tip card + demo character), avatar.js (cartoon players), theme.js
src/games/             one file per game + index.js (the list) + kit.js (helpers) + README.md (the contract)
test/unit/             node:test; test/sim/ the headless game harness; test/e2e/ puppeteer
```

## Rules to keep

- **Nothing leaves the device.** No network APIs in `src/` (`test/unit/privacy.test.js` enforces it), the
  server's CSP allows only `'self'`, the camera is opened without audio, and speech uses only
  `voice.localService` voices (Chrome's "Google" voices are online and are never used).
- **Only claimed players drive the game.** A body drives a slot only if it passes every gate in
  `Roster.slotCost` (position from the prediction, size, clothes, posture). Unclaimed bodies are bystander
  tracks: they take part in the assignment so a seated adult always "owns" their own body. A missing kid's
  slot goes held -> lost and waits; it is never reassigned. Lost slots come back by clothes (5 frames,
  clearly closer than anyone else), by being the only newcomer of the right size when colours are useless,
  or by arms out in their zone. Regression tests: `test/unit/roster.test.js` (seated and lying grown-ups,
  dim rooms, crossings, squats). Any change to matching must keep them green.
- **Game time only moves while playing.** Games use `ctx.t()`, never wall time. Pause, the How-to card and
  nobody-in-view stop the clock.
- **What the demo shows is what we detect.** Every move in `moves.js` is played through `Body` in
  `test/unit/moves.test.js`. If you add or change a move, keep its animation detectable.
- Body measurements are in body-size units (`s`, about a shoulder width), never raw pixels, so small and big
  kids behave the same.
- Games report through `ctx.report` (score / miss with the needed move / good / hit / end) and never draw
  their own score UI; the host, HUD, coach and results stay generic.
- Kid-friendly: warnings before danger, funny misses, big readable text, instructions read out loud.
- Third-party files in `vendor/` and `models/` are Google's MediaPipe 0.10.14 (Apache 2.0, see
  THIRD_PARTY_NOTICES.md). Don't edit them. Our own code is MIT (`LICENSE`).
