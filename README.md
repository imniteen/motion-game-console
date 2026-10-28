# motion-console

An exercise game console for kids (about 4 to 9). Put a webcam on the TV, and up to four kids jump, squat,
run on the spot, do star jumps, arm circles, flap and dance through short games as cartoon characters that
copy their every move. It runs in the
browser on your own computer and works offline. **Nothing leaves the computer:** no camera picture, no
sound, no data. The page is only allowed to talk to itself.

## Start it

You need [Node.js](https://nodejs.org) 18 or newer and Chrome, Edge or Safari.

```
node server.mjs
```

Open **http://localhost:8140**, allow the camera, and press **F** for full screen on the TV.
No camera? Open **http://localhost:8140/?mouse** to play with the mouse.

**Best setup:** webcam on top of the TV, kids 2-3 metres back with their whole body in view, a light on in
the room (not a bright window behind them).

## How it works for the kids

1. **Start.** Tap, click or press Enter.
2. **How many players?** Pick 1-4: a kid points at a big card, or a grown-up uses the arrow keys and Enter.
3. **Find your spot.** Each kid stands on their colour on the floor and holds their arms out like an
   airplane for a moment. That locks them in as Player 1, 2, 3 or 4 (Red, Blue, Yellow, Green).
   **Only locked-in players control the game.** Someone sitting on the sofa, walking past or watching is
   ignored. They are never drawn and can't take a player's place.
4. **Workout** (the big orange tile) plays a circuit of five short games in a row: arms to warm up, jumping,
   legs, more arms, then a dance game to cool down, with a short breather between games. At the end, a
   summary shows everyone's points, stars and every move they did (jumps, squats, star jumps, arm circles,
   knee lifts, flaps...). **Free play** lets you pick any game.
5. **Pick a game.** A kid can point: raise a hand, the ✋ cursor follows it, and resting on a card for a
   second presses it (the ring fills).
6. **How to play.** A character shows the move while the instructions are read out loud. The game starts by
   itself, or press "Let's go!".
7. **Play.** Each game lasts 45 seconds by default (30, 60 or 90 in Settings): short bursts of exercise. The clock is at the top, each
   player's score is in their colour, and it gets harder as the round goes on.
   - **The coach:** if a player keeps missing, or does nothing for a while, a card drops in at the top. It
     shows a little character doing the move ("Red player: flap your arms like a bird!") and says it out
     loud. It disappears as soon as they get it right.
   - **If a player walks off**, their character waits and a banner says "come back! Stand in your spot, arms
     out". Their place is never given to anyone else.
8. **Results.** Scores, 1-3 stars each, how many of each move every player did, best scores remembered.

**Moves don't have to be perfect.** Bent arms, small flaps, half squats and loose "arms out" all count: the
point is to keep moving, not to hold an exact position.

**Pause:** P or Esc, the ⏸ button, or a player holding both hands on their head for 3 seconds (except in
games where that's a move). The pause menu has **Add a player**: a new kid claims the next spot, and
everyone already playing keeps their place and score.

## The games

| | Game | What you do |
|---|---|---|
| 🫧 | Bubble Bash | wave your hands to pop bubbles (gold ones are worth 3, bubble storms) |
| 🚀 | Rocket Star Jumps | star jumps to the beat fuel your rocket, 3-2-1 lift-off! |
| 🏃 | Running Race | run on the spot, knees up, and jump the hurdles |
| 🌬️ | Windmill Power | big arm circles spin your windmill and light up the house |
| 🐸 | Frog Squats | squat down and up to hop across the lily pads, catch flies |
| 🌊 | Surf Hop | jump the waves on 3-2-1 (perfect timing scores double) |
| 🌋 | Volcano Escape | watch for the "!" and step out of the way (team hearts, lava bursts) |
| 🎈 | Balloon Bop | bop the balloons back up before they touch the grass |
| 🪩 | Disco Statues | dance while the music plays, freeze like a statue when it stops |
| 🪽 | Sky Flap | flap your arms to fly up your own sky, arms out to glide under storms |
| 🕺 | Copycat Dance | copy the dancer's pose and hold it until your ring fills |
| 🦜 | Jungle Dash | jump the logs, duck the parrots (3-2-1 cue over your head) |
| ⭐ | Starfall | touch the falling stars, dodge the meteors |
| ☃️ | Snow Fort | hand down, then throw up high (a monkey plays if you're alone) |
| 🧱 | Shape Wall | strike the pose in the hole before the wall arrives |
| ⛏️ | Mine Stomp | jump to stomp the bricks, step aside around metal, find treasure |
| 💣 | Hot Potato | throw the fizzing bomb on before it goes BOOM (sooty faces!) |
| 🏔️ | Snowy Peaks | jump snowballs, dodge icicles, hide in the safe gap from the giant one |

## Keys (for the grown-up)

| Key | Does |
|---|---|
| Arrows, Enter | move around menus, press |
| Esc / Backspace | back (pause during a game) |
| P | pause |
| F | full screen |
| ` (backtick) | tracking info (frame rate, who is locked in) |

**Mouse mode** (`?mouse`): the mouse moves the player (above the shoulders, their hand reaches for the
pointer). Click or J: jump. Hold D: duck (let go: a squat), A: arms out, U: arms up, H: hands on head,
F: flap, W: dance, K: high knees, C: arm circles, S: star jumps. T: throw. `?mouse&bots=1` adds a pretend second kid who copies the moves.

## Settings

Game length (30 s, 45 s, 1 min, 1.5 min), difficulty (Easy, Normal, Hard, or Auto: it eases off when kids keep missing and
gets harder when they're doing well), voice on/off, music and sound volume, the small camera picture in
the corner (with only the players outlined), switch camera, full screen. Settings and best scores are kept
in this browser only.

## If something is off

- **The camera is blocked:** click the camera icon in the address bar and allow it, then "Try again".
- **A kid can't lock in:** they must be standing, whole body in view, alone on their colour, arms straight
  out to the sides. A grown-up can press "Play with N" to start with the players already locked in.
- **Slow:** close other tabs and apps. The console switches to a lighter body tracker by itself when the
  computer is slow.
- **Voice not speaking:** only voices installed on this computer are used (never online voices). On a Mac,
  System Settings, Accessibility, Spoken Content lists them.

## For developers

See [CLAUDE.md](CLAUDE.md) for the architecture and [src/games/README.md](src/games/README.md) for writing a
game.

```
npm install          # test tools only (puppeteer-core)
npm test             # unit tests: tracking, the locked roster, moves, coach, every game played by bots
npm run test:e2e     # real Chrome: the camera path with a fake webcam, and the whole console flow
```

The camera-path browser test needs MediaPipe's test photo, which isn't stored here (it is skipped without it):

```
curl -o test/fixtures/pose.jpg https://storage.googleapis.com/mediapipe-assets/pose.jpg
```

## Licence

motion-console is MIT licensed (`LICENSE`). Body tracking uses Google's
[MediaPipe](https://github.com/google-ai-edge/mediapipe) pose landmarker (version 0.10.14), included unchanged
in `vendor/` and `models/` under the Apache License 2.0 so the console works offline: see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
