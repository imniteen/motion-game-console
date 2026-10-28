# Writing a game

Each game is one file in this folder that default-exports a plain object. Look at `bubble-bash.js` (a shared
world, hands) and `surf-hop.js` (timing, per-player countdown) first: they are the reference games.

## The definition

```js
export default {
  id: 'volcano-escape',          // kebab-case, unique
  title: 'Volcano Escape',        // card + HUD
  icon: '🪨',                 // one emoji
  color: '#e76f51',           // card colour
  moves: ['sidestep'],        // ids from src/moves.js; the first is the main one (How-to card, coach)
  howto: ['Rocks fall from the volcano.', 'Watch for the ! sign...', 'then step out of the way!'],
  layout: 'shared',           // 'shared': everyone where the camera sees them; 'columns': one lane per player
  hearts: 5,                  // > 0: the team shares these; losing all ends the round early. 0: no hearts
  stars: [15, 35, 60],        // points ONE player needs in a 2-minute round for 1, 2, 3 stars (scaled to the real length)
  create(ctx) { ... return { update, drawBack, drawFront, needs, bot } },
};
```

`howto` lines are read out loud and shown big: 1-3 short sentences a 5-year-old understands. Say what to DO
with the body ("Flap your arms to fly up!"), not rules jargon.

## ctx (what a round gets)

| | |
|---|---|
| `W, H` | 1920 x 1080, always |
| `floorY` | the floor line (0.86 H) |
| `roundSec` | 30, 45 (default), 60 or 90 (the host ends the round; never end it yourself for time) |
| `t()` | game seconds since the round started. Use this, never `performance.now()` (pause stops it) |
| `progress()` | 0..1 through the round |
| `level()` | difficulty multiplier, about 0.6 at the easiest to 2.0 at the hardest. Rises over the round, drops when the kids keep missing (auto-ease). Scale speeds and spawn rates with it |
| `rush()` | true in the final rush (the last 15 s, a third of short rounds): `level()` is already 40% higher then; a game may also lift its own caps or add a twist |
| `rng()` | seeded random 0..1: use it instead of Math.random (tests replay rounds) |
| `lane(n)` | `{x0, x1, cx, w}` of player n's lane (the whole screen in shared games) |
| `slots()` | how many player lanes there are (lane games) |
| `sfx` | sounds: `pop gold score star bonk hit boom splash whoosh boing flap throw splat freeze wobble tick warn cheer miss` |
| `report` | how a game tells the console what happened (below) |
| `fx` | `burst(x, y, color, count?)` sparkles, `pop(text, x, y, color?)` floating words, `shake(k?)` |

### report: always go through it

- `report.score(n, pts, x?, y?, label?)` player n scored (floating "+pts" or your label at x, y)
- `report.miss(n, moveId, x?, y?, label?)` player n missed something they should have done with `moveId`
  (a move id from src/moves.js: the coach shows that move after two misses)
- `report.good(n, x?, y?, label?)` player n did the right thing but there are no points for it
- `report.hit(n?, x?, y?)` lose one shared heart (and shake); when hearts reach 0 the round ends
- `report.end(message)` end the round early for a game reason (rare)

The console draws scores, the clock, hearts, results and the coach from these. Never draw your own score UI.

## The round object

```js
return {
  update(dt, players) {},     // every 1/60 s of game time while playing
  drawBack(g, players) {},    // the world, behind the avatars (fill the whole 1920x1080: no transparent gaps)
  drawFront(g, players) {},   // things in front of the avatars (falling rocks, balloons, cues)
  needs(n) { return 'sidestep'; }, // what player n should be doing now, or null (coach: idle 8 s -> tip)
  bot(p, t) { return {}; },   // test helper: what a good player would do now (below)
};
```

`players` are `PlayerView`s (src/engine/host.js), in game space (already placed in their lane for 'columns'):
`n, color, name, state ('active' | 'held'), px[33], s (body unit ~ shoulder width px), head {x,y,r},
hands [{x,y,r,side,seen}], sh {x,y}, hip {x,y}, lane, airborne, ducking (also: in a squat), jumped (this
step), landed, flapped (this step), pumped (['L'|'R'] this step), step (-1/0/1 this step), circled (arm
circles finished this step, 0-2), kneeUp (['L'|'R'] knees lifted this step: marching/running on the spot),
jacked (a star jump this step), squatted (came back up from a squat this step), pose {armsUp, airplane,
handsHead}, flapRate (flaps/s), energy (body speed, ~0 still, >1.5 moving), still, moving, reachUp, score`.

Detection is forgiving on purpose (bent elbows, small flaps, half squats all count): never demand a precise
position. This is an exercise console: games should keep kids moving in short 45-second bursts.

Rules:
- Only `state === 'active'` players can score, be hit or miss. A `held` player (the camera lost them for a
  moment) is drawn frozen: never punish them.
- Event flags (`jumped`, `flapped`, `pumped`, `step`) are true for one step only.
- Hit tests: `handTouch(p, x, y, r)` and `bodyTouch(p, x, y, r)` from kit.js. Be generous: kids are small
  and tracking is noisy.
- Report a miss with the move the player needed, so the coach can show it.
- Give warnings before danger (a "!" with `warning()` from kit.js, a 3-2-1 count), never instant hits.
- Make it kind: a miss is funny (SPLASH!, BONK!), never scary. Ages 4-9.
- Use `ctx.level()` to ramp up, and add a new twist half-way (a storm, double waves, a golden thing) so 2
  minutes stay interesting.

## bot(p, t): for the tests

Return what a good player would do right now (the test harness turns it into a body):
`{ x }` walk towards x (game space), `{ reach: {x, y} }` put a hand there, `{ jump: true }`, `{ duck: true }`,
`{ pose: 'armsUp' | 'airplane' | 'handsHead' | 'freeze' }`, `{ move: 'flap' | 'dance' | ... }` (any move id),
`{ pump: true }` (a throw). Combine them: `{ x: 800, jump: true }`.

## Drawing

Canvas 2D on a 1920x1080 canvas. No image files: draw with shapes, gradients and emoji (`g.font` with an
emoji font, see bubble-bash.js). Bright, friendly, readable from a sofa: big shapes, strong outlines, nothing
tiny. kit.js has `sky`, `shinyBall`, `warning`.

## Checking a game

```
GAME=src/games/volcano-escape.js node --test test/sim/check-game.test.js
```

It plays the game with pretend players: someone standing still must get help from the coach and earn no
stars; the bot must earn at least one star; three bots must all score; four random players coming and going
must never break anything (including drawing); the game must get harder over the round.
