// The console's screens. Each screen can have:
//   enter(app, arg)          when it opens
//   update(app, dt)          every game step
//   buttons(app) -> Button[] what can be pressed (hand, keys, tap or mouse)
//   select(app, id)          a button was pressed
//   back(app)                Esc / Back
//   draw(app, g, now)
import { W, H, UI, PLAYER, text, emoji, panel, backdrop, rr, mmss, ease } from './theme.js';
import { drawAvatar } from './avatar.js';
import { drawDemo, drawTip, wrap } from './coach.js';
import { drawHud, drawLost, drawPreview, PAUSE_BTN } from './hud.js';
import { drawCursor } from './menu.js';
import { GAMES } from '../games/index.js';
import { MOVES } from '../moves.js';
import { GameHost } from '../engine/host.js';
import { synthSkeleton, ARM } from '../vision/synth.js';
import { sfx } from '../engine/audio.js';
import { say, hush } from '../engine/speech.js';
import { cycle, saveSettings, saveBest } from '../engine/settings.js';

const PER_PAGE = 8;

// A workout is a circuit of short games that together move the whole body: a warm-up for the arms, jumping,
// legs, more arms, then a dance or pose game to cool down. Missing games are simply skipped.
const CIRCUIT = [
  ['bubble-bash', 'windmill', 'balloon-bop'],
  ['surf-hop', 'rocket-jumps', 'jungle-dash', 'snowy-peaks'],
  ['running-race', 'frog-squats', 'volcano-escape', 'mine-stomp'],
  ['sky-flap', 'snow-fort', 'starfall', 'hot-potato'],
  ['disco-statues', 'copycat-dance', 'shape-wall'],
];

export function workoutPlan(rand = Math.random) {
  return CIRCUIT.map((group) => {
    const have = group.map((id) => GAMES.find((g) => g.id === id)).filter(Boolean);
    return have[Math.floor(rand() * have.length)];
  }).filter(Boolean);
}

/** The moves we count, with how to say them. */
export const MOVE_COUNTS = [
  ['jumps', '🦘', 'jumps'],
  ['jacks', '⭐', 'star jumps'],
  ['squats', '🐸', 'squats'],
  ['knees', '🏃', 'knee lifts'],
  ['flaps', '🐦', 'flaps'],
  ['circles', '🔄', 'arm circles'],
  ['throws', '☝️', 'throws'],
  ['steps', '↔️', 'steps'],
];

/** "12 jumps · 30 flaps" for the biggest few. */
function movesLine(moves, max = 3) {
  return MOVE_COUNTS.filter(([k]) => moves?.[k] > 0)
    .sort((a, b) => moves[b[0]] - moves[a[0]])
    .slice(0, max)
    .map(([k, icon, word]) => `${icon} ${moves[k]} ${word}`)
    .join('   ');
}

function startWorkout(app) {
  app.workout = { list: workoutPlan(), i: 0, totals: new Map(), startedAt: app.now };
  app.game = app.workout.list[0];
  app.go('howto');
}

/** A little character in a player's colour, standing and waving (menus, results). */
function mascot(g, slot, x, floorY, sw, t, pose = 'wave') {
  const a = Math.sin(t * 6 + slot);
  const arms = pose === 'cheer' ? { armL: ARM.up - 0.2 * a, armR: ARM.up + 0.2 * a } : { armL: ARM.down + 0.1, armR: ARM.up - 0.4 + 0.35 * a };
  const lift = pose === 'cheer' ? Math.max(0, Math.sin(t * 5 + slot)) * 0.5 : 0;
  drawAvatar(g, synthSkeleton({ x, hipY: floorY - 2.2 * sw, sw, ...arms, lift, vis: 1 }), { slot, t, face: pose === 'cheer' ? 'o' : 'smile', badge: true });
}

function title(g, s, y = 110, size = 84) {
  text(g, s, W / 2, y, { size, color: UI.accent });
}

function hint(g, s, y = H - 52) {
  text(g, s, W / 2, y, { size: 34, color: UI.dim, weight: 700 });
}

function backBtn(x = 40, y = H - 150) {
  return { id: 'back', x, y, w: 260, h: 110, label: 'Back', icon: '⬅️', color: '#4a4f7a' };
}

// ---------------------------------------------------------------------------------------------- boot
export const boot = {
  enter(app) {
    app.started = false;
  },
  buttons(app) {
    if (app.bootError) {
      return [
        { id: 'retry', x: W / 2 - 440, y: 640, w: 420, h: 130, label: 'Try again', icon: '🔄', color: '#4b55c9' },
        { id: 'mouse', x: W / 2 + 20, y: 640, w: 420, h: 130, label: 'Play with mouse', icon: '🖱️', color: '#7a4bc9' },
      ];
    }
    return [{ id: 'start', x: W / 2 - 300, y: 640, w: 600, h: 150, label: app.ready ? 'Start!' : 'Getting ready...', icon: '▶️', color: app.ready ? '#2e9e5b' : '#4a4f7a', disabled: !app.ready, primary: true }];
  },
  select(app, id) {
    if (id === 'start') app.go('home');
    if (id === 'retry') app.startCamera();
    if (id === 'mouse') app.useMouse();
  },
  draw(app, g, now) {
    backdrop(g, now);
    for (let i = 0; i < 4; i++) mascot(g, i + 1, W / 2 - 450 + i * 300, 560, 46, now);
    text(g, 'motion-console', W / 2, 160, { size: 120, color: UI.accent });
    text(g, 'Move your body to play!', W / 2, 260, { size: 48, color: UI.dim });
    const status = app.bootError ? `😕 ${app.bootError}` : app.ready ? (app.mouseMode ? 'Mouse mode: no camera needed' : 'Camera ready!') : app.bootStatus;
    text(g, status, W / 2, 860, { size: 40, color: app.bootError ? '#ffb0b0' : UI.text, maxW: 1700 });
    app.menu.draw(g, boot.buttons(app), now);
    hint(g, 'Tap, click or press Enter to start. Nothing you do here leaves this computer.');
  },
};

// ---------------------------------------------------------------------------------------------- home
export const home = {
  enter(app) {
    say('Raise your hand and hold it still on a button to press it.', { interrupt: true });
  },
  buttons(app) {
    const w = 390;
    const h = 420;
    const y = 300;
    const gap = 40;
    const x0 = (W - (4 * w + 3 * gap)) / 2;
    const n = app.roster.players.length;
    const mins = Math.round((5 * (app.settings.roundSec + 15)) / 60);
    return [
      { id: 'workout', x: x0, y, w, h, big: true, icon: '🏋️', label: 'Workout', sub: `5 games, about ${mins} min`, color: '#e8590c', primary: true },
      { id: 'play', x: x0 + (w + gap), y, w, h, big: true, icon: '🎮', label: 'Free play', sub: n ? `${n} player${n > 1 ? 's' : ''} ready` : 'Pick any game', color: '#2e9e5b' },
      { id: 'players', x: x0 + 2 * (w + gap), y, w, h, big: true, icon: '👨‍👩‍👧', label: 'Players', sub: 'Who is playing?', color: '#c94b7d' },
      { id: 'settings', x: x0 + 3 * (w + gap), y, w, h, big: true, icon: '⚙️', label: 'Settings', sub: 'Time, voice, sound', color: '#4b55c9' },
    ];
  },
  select(app, id) {
    app.wantWorkout = id === 'workout';
    app.workout = null;
    if (id === 'workout') return app.roster.players.length ? startWorkout(app) : app.go('players');
    if (id === 'play') app.go(app.roster.players.length ? 'games' : 'players');
    if (id === 'players') app.go('players');
    if (id === 'settings') app.go('settings', 'home');
  },
  draw(app, g, now) {
    backdrop(g, now);
    title(g, 'motion-console', 130, 96);
    app.menu.draw(g, home.buttons(app), now);
    hint(g, app.mouseMode ? 'Mouse mode: click a button. Keys: arrows + Enter.' : '✋ Raise your hand to point, then hold still on a button.', H - 140);
    hint(g, 'Grown-ups: arrow keys + Enter, Esc to go back, P to pause, F for full screen.');
  },
};

// ---------------------------------------------------------------------------------------------- players
export const players = {
  enter(app) {
    say('How many players?', { interrupt: true });
  },
  buttons() {
    const w = 360;
    const h = 460;
    const gap = 50;
    const x0 = (W - (4 * w + 3 * gap)) / 2;
    return [
      ...[1, 2, 3, 4].map((k, i) => ({
        id: `n${k}`,
        x: x0 + i * (w + gap),
        y: 260,
        w,
        h,
        color: PLAYER[i].dark,
        draw: (g, b, focus, t) => {
          panel(g, b.x, b.y, b.w, b.h, { fill: focus ? PLAYER[i].color : 'rgba(30,32,80,0.9)', edge: focus ? '#fff' : PLAYER[i].color });
          text(g, String(k), b.x + b.w / 2, b.y + 90, { size: 120 });
          text(g, k === 1 ? 'player' : 'players', b.x + b.w / 2, b.y + 170, { size: 40, color: focus ? '#fff' : UI.dim });
          for (let j = 0; j < k; j++) mascot(g, j + 1, b.x + b.w / 2 + (j - (k - 1) / 2) * (k > 2 ? 78 : 110), b.y + b.h - 40, k > 2 ? 22 : 30, t);
        },
      })),
      backBtn(),
    ];
  },
  select(app, id) {
    if (id === 'back') return app.go('home');
    const n = Number(id.slice(1));
    app.settings.players = n;
    saveSettings(app.settings);
    app.roster.setup(n);
    app.source.setNumPoses?.(n + 2);
    app.go('claim', { mode: 'new' });
  },
  back(app) {
    app.go('home');
  },
  draw(app, g, now) {
    backdrop(g, now);
    title(g, 'How many players?');
    app.menu.draw(g, players.buttons(), now);
  },
};

// ---------------------------------------------------------------------------------------------- claim
// Each kid stands on their colour and holds their arms out to lock in. Only locked-in kids play.
export const claim = {
  enter(app, arg) {
    app.claimMode = arg?.mode ?? 'new';
    app.roster.openClaim();
    app.claimDoneAt = null;
    say('Everyone playing: stand on your color, and put your arms out like an airplane!', { interrupt: true });
  },
  update(app) {
    for (const e of app.rosterEvents) {
      if (e.type === 'claim' || e.type === 'back') {
        sfx.lock();
        say(`${PLAYER[e.n - 1].name} player is ready!`);
      }
    }
    const empty = app.roster.emptySlots.length;
    if (!empty && app.claimDoneAt === null) {
      app.claimDoneAt = app.now;
      say("Everyone's ready! Let's play!");
    }
    if (app.claimDoneAt !== null && app.now - app.claimDoneAt > 2) claim.finish(app);
  },
  finish(app) {
    app.roster.closeClaim();
    // slots nobody claimed are dropped, so the game only waits for real players
    const keep = app.roster.players.length;
    if (keep && keep < app.roster.slots.length) app.roster.slots = app.roster.slots.filter((s) => s.state !== 'empty');
    app.source.setNumPoses?.(app.roster.slots.length + 2);
    if (app.claimMode === 'add') app.go('countdown', { resume: true });
    else if (app.wantWorkout && !app.workout) startWorkout(app);
    else app.go('games');
  },
  buttons(app) {
    const n = app.roster.players.length;
    return [
      backBtn(),
      { id: 'go', x: W - 520, y: H - 150, w: 480, h: 110, label: n ? `Play with ${n}` : 'Waiting...', icon: '▶️', color: '#2e9e5b', disabled: !n, primary: true },
    ];
  },
  select(app, id) {
    if (id === 'go') claim.finish(app);
    if (id === 'back') claim.back(app);
  },
  back(app) {
    app.roster.closeClaim();
    if (app.claimMode === 'add') {
      // nobody new came: keep the players we had
      app.roster.slots = app.roster.slots.filter((s) => s.state !== 'empty');
      app.go('pause');
    } else app.go('players');
  },
  /** Mouse mode: click a spot to stand there. */
  click(app, p) {
    if (!app.mouseMode) return;
    const s = app.roster.slots.find((sl) => sl.state === 'empty' && p.x >= sl.zone.x0 && p.x <= sl.zone.x1 && p.y > H * 0.55);
    if (s) app.source.x = (s.zone.x0 + s.zone.x1) / 2;
  },
  draw(app, g, now) {
    backdrop(g, now, 200);
    title(g, app.claimMode === 'add' ? 'New player: find your spot!' : 'Find your spot!', 90);
    text(g, 'Stand on your colour, then put your arms out like an airplane ✈️', W / 2, 180, { size: 44, maxW: 1700 });
    // the floor spots
    for (const s of app.roster.slots) {
      const look = PLAYER[s.n - 1];
      const z = s.zone;
      const cx = (z.x0 + z.x1) / 2;
      const taken = s.state !== 'empty';
      const { progress, crowded } = app.roster.holdProgress(s.n);
      g.save();
      g.globalAlpha = taken ? 0.55 : 0.3 + 0.1 * Math.sin(now * 4 + s.n);
      g.fillStyle = look.color;
      g.beginPath();
      g.ellipse(cx, H * 0.83, (z.x1 - z.x0) * 0.42, 70, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.lineWidth = 8;
      g.strokeStyle = look.color;
      g.beginPath();
      g.ellipse(cx, H * 0.83, (z.x1 - z.x0) * 0.42, 70, 0, 0, Math.PI * 2);
      g.stroke();
      if (progress > 0 && !taken) {
        g.lineWidth = 18;
        g.strokeStyle = UI.accent;
        g.beginPath();
        g.ellipse(cx, H * 0.83, (z.x1 - z.x0) * 0.42 + 14, 84, 0, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        g.stroke();
      }
      const label = taken ? `${look.name} ✓` : crowded ? 'One at a time!' : `${look.name}`;
      text(g, label, cx, H * 0.83, { size: 46, color: '#fff', stroke: look.dark });
      if (!taken) {
        // a little demo of the airplane over each free spot
        drawDemo(g, 'airplane', now, cx, H * 0.7, 26, s.n);
      }
    }
    // everyone the camera sees who isn't a player: a faint ghost, so kids can find themselves
    for (const d of app.roster.others) {
      drawAvatar(g, d.px, { ghost: true, badge: false, t: now });
    }
    for (const s of app.roster.slots) if (s.present && s.px) drawAvatar(g, s.px, { slot: s.n, t: now, face: 'o' });
    if (app.claimDoneAt !== null) {
      panel(g, W / 2 - 480, H / 2 - 90, 960, 180, { fill: 'rgba(46,158,91,0.95)' });
      text(g, "Everyone's ready! 🎉", W / 2, H / 2, { size: 80 });
    }
    app.menu.draw(g, claim.buttons(app), now);
    if (app.mouseMode) hint(g, 'Mouse mode: move the mouse onto a spot and hold A (arms out).', 250);
  },
};

// ---------------------------------------------------------------------------------------------- games
export const games = {
  enter(app) {
    app.page = app.page ?? 0;
    say('Pick a game!', { interrupt: true });
  },
  buttons(app) {
    const pages = Math.ceil(GAMES.length / PER_PAGE);
    const list = GAMES.slice(app.page * PER_PAGE, (app.page + 1) * PER_PAGE);
    const cw = 400;
    const ch = 330;
    const gx = 36;
    const gy = 36;
    const x0 = (W - (4 * cw + 3 * gx)) / 2;
    const y0 = 200;
    const out = list.map((def, i) => ({
      id: `game:${def.id}`,
      x: x0 + (i % 4) * (cw + gx),
      y: y0 + Math.floor(i / 4) * (ch + gy),
      w: cw,
      h: ch,
      draw: (g, b, focus, t) => gameCard(g, b, def, focus, t, app.best[def.id]),
    }));
    out.push(backBtn(40, H - 140));
    out.push({ id: 'players', x: 330, y: H - 140, w: 330, h: 110, label: 'Players', icon: '👨‍👩‍👧', color: '#c94b7d' });
    if (pages > 1) {
      out.push({ id: 'prev', x: W - 640, y: H - 140, w: 280, h: 110, label: 'Prev', icon: '◀️', color: '#4a4f7a', disabled: app.page === 0 });
      out.push({ id: 'next', x: W - 330, y: H - 140, w: 290, h: 110, label: 'More', icon: '▶️', color: '#4b55c9', disabled: app.page >= pages - 1 });
    }
    return out;
  },
  select(app, id) {
    if (id === 'back') return app.go('home');
    if (id === 'players') return app.go('players');
    if (id === 'prev') app.page = Math.max(0, app.page - 1);
    else if (id === 'next') app.page = app.page + 1;
    else if (id.startsWith('game:')) {
      app.game = GAMES.find((d) => d.id === id.slice(5));
      app.go('howto');
    }
  },
  back(app) {
    app.go('home');
  },
  draw(app, g, now) {
    backdrop(g, now, 120);
    title(g, 'Pick a game!', 100);
    const pages = Math.ceil(GAMES.length / PER_PAGE);
    if (pages > 1) text(g, `Page ${app.page + 1} of ${pages}`, W - 200, 100, { size: 34, color: UI.dim });
    app.menu.draw(g, games.buttons(app), now);
  },
};

function gameCard(g, b, def, focus, t, best) {
  g.save();
  if (focus) {
    g.shadowColor = def.color;
    g.shadowBlur = 50;
  }
  const grad = g.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  grad.addColorStop(0, def.color);
  grad.addColorStop(1, 'rgba(20,22,60,0.95)');
  rr(g, b.x, b.y, b.w, b.h, 32);
  g.fillStyle = grad;
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = focus ? 8 : 3;
  g.strokeStyle = focus ? '#fff' : 'rgba(255,255,255,0.3)';
  g.stroke();
  g.restore();
  emoji(g, def.icon, b.x + b.w / 2, b.y + 105 + (focus ? Math.sin(t * 6) * 6 : 0), 110);
  text(g, def.title, b.x + b.w / 2, b.y + 210, { size: 44, maxW: b.w - 30 });
  const moves = def.moves.map((m) => `${MOVES[m].icon} ${MOVES[m].name}`).join('  ');
  text(g, moves, b.x + b.w / 2, b.y + 262, { size: 28, color: '#e6e8ff', maxW: b.w - 30, weight: 700 });
  if (best) text(g, `${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}  best ${best.score}`, b.x + b.w / 2, b.y + 302, { size: 26, color: UI.accent, weight: 700 });
}

// ---------------------------------------------------------------------------------------------- howto
export const howto = {
  enter(app, arg) {
    const def = app.game;
    app.howtoAt = app.now;
    app.howtoFrom = arg?.from ?? null;
    say(`${def.title}! ${def.howto.join(' ')}`, { interrupt: true });
  },
  update(app) {
    if (app.now - app.howtoAt > howtoSecs(app)) howto.select(app, 'go');
  },
  buttons() {
    return [backBtn(40, H - 150), { id: 'go', x: W - 560, y: H - 170, w: 520, h: 140, label: "Let's go!", icon: '▶️', color: '#2e9e5b', primary: true }];
  },
  select(app, id) {
    const fromPause = app.howtoFrom === 'pause';
    if (id === 'go') app.go('countdown', { resume: fromPause });
    if (id === 'back') {
      if (!fromPause) app.workout = null;
      app.go(fromPause ? 'pause' : app.wantWorkout ? 'home' : 'games');
    }
  },
  back(app) {
    howto.select(app, 'back');
  },
  draw(app, g, now) {
    const def = app.game;
    backdrop(g, now, 40);
    emoji(g, def.icon, W / 2 - 360, 110, 100);
    text(g, def.title, W / 2 + 40, 110, { size: 92, color: UI.accent });
    const wk = app.workout;
    text(g, wk ? `Workout: game ${wk.i + 1} of ${wk.list.length}${wk.i ? '  ·  catch your breath! 😮‍💨' : ''}` : 'How to play', W / 2, 205, { size: 40, color: wk ? UI.accent : UI.dim });
    // the move, shown by a character
    panel(g, 90, 260, 660, 620, { fill: 'rgba(255,255,255,0.95)' });
    const age = now - app.howtoAt;
    const moveIds = def.moves;
    const m = moveIds[Math.floor(age / 4) % moveIds.length];
    drawDemo(g, m, age, 420, 800, 70, 0);
    text(g, `${MOVES[m].icon} ${MOVES[m].name}`, 420, 320, { size: 52, color: '#1b1b3a', stroke: null });
    // the words, big and simple
    panel(g, 800, 260, 1030, 620);
    def.howto.forEach((line, i) => {
      emoji(g, ['1️⃣', '2️⃣', '3️⃣'][i], 880, 360 + i * 190, 70);
      wrap(g, line, 950, 345 + i * 190, 840, 54, '#fff');
    });
    const left = Math.max(0, howtoSecs(app) - age);
    hint(g, `Starting by itself in ${Math.ceil(left)}...`, H - 100);
    app.menu.draw(g, howto.buttons(), now);
  },
};

/** How long the How-to card stays before the game starts by itself (in a workout it's also the rest). */
const howtoSecs = (app) => (app.workout ? 12 : 14);

// ---------------------------------------------------------------------------------------------- countdown
export const countdown = {
  enter(app, arg) {
    app.countAt = app.now;
    app.lastCount = 4;
    if (!arg?.resume || !app.host) {
      app.host = new GameHost(app.game, { settings: app.settings, sfx, say, slotCount: app.roster.slots.length });
      app.host.onRush = () => {
        sfx.warn();
        say(`Final ${Math.round(app.host.rushSec)} seconds! Faster, faster!`, { interrupt: true });
      };
      app.host.onTip = (tip) => {
        sfx.coach();
        say(`${PLAYER[tip.n - 1].name} player! ${MOVES[tip.move].tell}`, { interrupt: true });
      };
      app.host.start(app.roster.players.map((s) => s.n));
    } else {
      for (const s of app.roster.players) app.host.addPlayer(s.n);
      app.host.o.slotCount = app.roster.slots.length;
    }
    app.host.clock.running = false;
    hush();
  },
  update(app) {
    const left = 3 - (app.now - app.countAt);
    const k = Math.ceil(left);
    if (k !== app.lastCount && k >= 1) {
      app.lastCount = k;
      sfx.count();
    }
    if (left <= 0) {
      sfx.go();
      app.host.clock.running = true;
      app.go('play');
    }
  },
  draw(app, g, now) {
    drawGame(app, g, now);
    const left = 3 - (now - app.countAt);
    const k = Math.ceil(left);
    const frac = left - Math.floor(left);
    g.save();
    g.fillStyle = 'rgba(10,12,40,0.35)';
    g.fillRect(0, 0, W, H);
    g.restore();
    text(g, k >= 1 ? String(k) : 'GO!', W / 2, H / 2, { size: 260 * (0.8 + 0.4 * frac), color: UI.accent });
    text(g, 'Get ready!', W / 2, H / 2 - 220, { size: 60 });
  },
};

// ---------------------------------------------------------------------------------------------- play
export const play = {
  enter(app) {
    app.headHold = 0;
  },
  update(app, dt) {
    const host = app.host;
    // nobody in view at all (everyone walked off, camera blocked): the game waits for them
    const anyone = app.roster.players.some((s) => s.present);
    host.clock.running = anyone;
    if (anyone) host.step(dt, app.roster.slots);
    // both hands on head for 3 s pauses (except in games that use that pose)
    if (!app.game.moves.includes('handsHead') && app.roster.active.some((s) => s.body.pose.handsHead)) {
      app.headHold += dt;
      if (app.headHold > 3) app.go('pause');
    } else app.headHold = 0;
    if (host.ended) {
      host.clock.running = false;
      app.go('results');
    }
  },
  buttons() {
    return [{ id: 'pause', ...PAUSE_BTN, draw: () => {} }];
  },
  select(app, id) {
    if (id === 'pause') app.go('pause');
  },
  back(app) {
    app.go('pause');
  },
  draw(app, g, now) {
    drawGame(app, g, now);
  },
};

/** The game world, the players' avatars, the HUD, the coach and the lost-player banner. */
export function drawGame(app, g, now) {
  const host = app.host;
  if (!host?.round) return;
  const views = host.views.length ? host.views : host.viewsFrom(app.roster.slots);
  g.save();
  if (host.fx.shake) g.translate((Math.random() - 0.5) * host.fx.shake, (Math.random() - 0.5) * host.fx.shake);
  host.round.drawBack?.(g, views);
  for (const v of views) {
    const f = host.faces.get(v.n);
    const face = f && host.t < f.until ? f.face : v.airborne ? 'o' : 'smile';
    drawAvatar(g, v.px, { slot: v.n, alpha: v.state === 'held' ? 0.55 : 1, face, t: now });
  }
  host.round.drawFront?.(g, views);
  g.restore();
  drawHud(g, host, app.roster.slots, now);
  if (host.coach.current) drawTip(g, host.coach.current, host.t);
  drawLost(g, app.roster.slots, now);
  if (app.settings.preview && !app.mouseMode) drawPreview(g, app.video, app.roster.slots, app.roster);
}

// ---------------------------------------------------------------------------------------------- pause
export const pause = {
  enter(app) {
    if (app.host) app.host.clock.running = false;
    say('Paused.', { interrupt: true });
  },
  buttons(app) {
    const w = 520;
    const h = 120;
    const x1 = W / 2 - w - 20;
    const x2 = W / 2 + 20;
    const canAdd = app.roster.slots.length < 4;
    return [
      { id: 'resume', x: x1, y: 300, w, h, label: 'Resume', icon: '▶️', color: '#2e9e5b' },
      { id: 'restart', x: x2, y: 300, w, h, label: 'Start over', icon: '🔄', color: '#4b55c9' },
      { id: 'add', x: x1, y: 450, w, h, label: 'Add a player', icon: '➕', color: '#c94b7d', disabled: !canAdd },
      { id: 'howto', x: x2, y: 450, w, h, label: 'How to play', icon: '❓', color: '#7a4bc9' },
      { id: 'settings', x: x1, y: 600, w, h, label: 'Settings', icon: '⚙️', color: '#4a4f7a' },
      { id: 'quit', x: x2, y: 600, w, h, label: 'Other games', icon: '🎮', color: '#a35a2e' },
    ];
  },
  select(app, id) {
    if (id === 'resume') app.go('countdown', { resume: true });
    if (id === 'restart') app.go('countdown');
    if (id === 'add') {
      app.roster.resize(app.roster.slots.length + 1);
      app.go('claim', { mode: 'add' });
    }
    if (id === 'howto') app.go('howto', { from: 'pause' });
    if (id === 'settings') app.go('settings', 'pause');
    if (id === 'quit') {
      app.workout = null;
      app.go('games');
    }
  },
  back(app) {
    app.go('countdown', { resume: true });
  },
  draw(app, g, now) {
    drawGame(app, g, now);
    g.save();
    g.fillStyle = 'rgba(10,12,40,0.75)';
    g.fillRect(0, 0, W, H);
    g.restore();
    title(g, '⏸️  Paused', 170, 100);
    if (app.host) text(g, `${mmss(app.host.timeLeft)} left in ${app.game.title}`, W / 2, 245, { size: 40, color: UI.dim });
    app.menu.draw(g, pause.buttons(app), now);
  },
};

// ---------------------------------------------------------------------------------------------- results
export const results = {
  enter(app) {
    const res = app.host.results();
    app.results = res;
    app.newBest = false;
    const top = res[0];
    const prev = app.best[app.game.id];
    if (top && (!prev || top.score > prev.score)) {
      app.best[app.game.id] = { score: top.score, stars: Math.max(top.stars, prev?.stars ?? 0) };
      app.newBest = !!prev || top.score > 0;
      saveBest(app.best);
    } else if (top && prev && top.stars > prev.stars) {
      prev.stars = top.stars;
      saveBest(app.best);
    }
    sfx.fanfare();
    // in a workout: add this game to everyone's totals
    const wk = app.workout;
    if (wk) {
      for (const r of res) {
        const t = wk.totals.get(r.n) ?? { score: 0, stars: 0, moves: {} };
        t.score += r.score;
        t.stars += r.stars;
        for (const [k, v] of Object.entries(r.moves ?? {})) t.moves[k] = (t.moves[k] ?? 0) + v;
        wk.totals.set(r.n, t);
      }
    }
    const msg = app.host.ended?.reason === 'hearts' ? 'Out of hearts!' : "Time's up!";
    if (res.length > 1) say(`${msg} ${PLAYER[top.n - 1].name} player wins with ${top.score} points! Well done, everyone!`, { interrupt: true });
    else if (top) say(`${msg} You got ${top.score} points and ${top.stars} star${top.stars === 1 ? '' : 's'}! Great job!`, { interrupt: true });
  },
  update(app) {
    // a workout moves on by itself
    if (app.workout && app.now - app.stateAt > 9) results.select(app, 'wnext');
  },
  buttons(app) {
    const w = 460;
    const wk = app.workout;
    if (wk) {
      const last = wk.i >= wk.list.length - 1;
      return [
        { id: 'wnext', x: W / 2 - w - 20, y: H - 170, w, h: 130, label: last ? 'Finish!' : 'Next exercise', icon: last ? '🏁' : '⏭️', color: '#e8590c', primary: true },
        { id: 'wend', x: W / 2 + 20, y: H - 170, w, h: 130, label: 'End workout', icon: '🛑', color: '#4a4f7a' },
      ];
    }
    return [
      { id: 'again', x: W / 2 - w * 1.5 - 40, y: H - 170, w, h: 130, label: 'Play again', icon: '🔄', color: '#2e9e5b' },
      { id: 'next', x: W / 2 - w / 2, y: H - 170, w, h: 130, label: 'Next game', icon: '⏭️', color: '#4b55c9' },
      { id: 'games', x: W / 2 + w / 2 + 40, y: H - 170, w, h: 130, label: 'All games', icon: '🎮', color: '#a35a2e' },
    ];
  },
  select(app, id) {
    if (id === 'wnext') {
      const wk = app.workout;
      wk.i++;
      if (wk.i >= wk.list.length) return app.go('summary');
      app.game = wk.list[wk.i];
      return app.go('howto');
    }
    if (id === 'wend') return app.go('summary');
    if (id === 'again') app.go('countdown');
    if (id === 'next') {
      const i = GAMES.indexOf(app.game);
      app.game = GAMES[(i + 1) % GAMES.length];
      app.go('howto');
    }
    if (id === 'games') app.go('games');
  },
  back(app) {
    app.go('games');
  },
  draw(app, g, now) {
    backdrop(g, now, 280);
    const age = now - app.stateAt;
    title(g, app.host.ended?.reason === 'hearts' ? 'Out of hearts!' : "Time's up!", 90, 90);
    text(g, `${app.game.icon} ${app.game.title}`, W / 2, 175, { size: 44, color: UI.dim });
    const res = app.results;
    const n = res.length;
    const colW = Math.min(420, (W - 200) / Math.max(1, n));
    res.forEach((r, i) => {
      const x = W / 2 + (i - (n - 1) / 2) * colW;
      const look = PLAYER[r.n - 1];
      const podium = [210, 170, 140, 120][i];
      const floor = 720;
      panel(g, x - colW * 0.4, floor - podium, colW * 0.8, podium, { fill: look.color, edge: '#fff' });
      text(g, i === 0 && n > 1 ? '🏆 1st' : n > 1 ? `${i + 1}${['st', 'nd', 'rd', 'th'][i]}` : '', x, floor - podium + 40, { size: 40 });
      text(g, String(Math.round(r.score * Math.min(1, age / 1.2))), x, floor - podium + (n > 1 ? 100 : 70), { size: 72 });
      mascot(g, r.n, x, floor - podium, Math.min(48, colW * 0.12), now, i === 0 ? 'cheer' : 'wave');
      // stars pop in one by one
      for (let k = 0; k < 3; k++) {
        const on = k < r.stars && age > 0.8 + k * 0.35;
        const s = on ? ease.pop(age - 0.8 - k * 0.35) : 1;
        emoji(g, on ? '⭐' : '☆', x + (k - 1) * 70, floor + 65, 60 * s);
      }
      text(g, `${look.name}`, x, floor + 135, { size: 34, color: look.color });
      const line = movesLine(r.moves, n > 2 ? 2 : 3);
      if (line) text(g, line, x, floor + 180, { size: 26, color: UI.text, weight: 700, maxW: colW - 20 });
    });
    if (app.workout) {
      const left = Math.max(0, 9 - (now - app.stateAt));
      text(g, `Workout ${app.workout.i + 1}/${app.workout.list.length}  ·  next in ${Math.ceil(left)}...`, W / 2, H - 205, { size: 30, color: UI.dim });
    }
    if (app.newBest) text(g, '🎉 New best score! 🎉', W / 2, 250, { size: 50, color: UI.accent, alpha: 0.6 + 0.4 * Math.sin(now * 5) });
    app.menu.draw(g, results.buttons(app), now);
  },
};

// ---------------------------------------------------------------------------------------------- summary
// The end of a workout: everyone's total score and stars, and every move they did.
export const summary = {
  enter(app) {
    sfx.cheer();
    const wk = app.workout;
    const mins = Math.max(1, Math.round((app.now - wk.startedAt) / 60));
    app.summaryMins = mins;
    const all = [...wk.totals.values()];
    const jumps = all.reduce((a, t) => a + (t.moves.jumps ?? 0) + (t.moves.jacks ?? 0), 0);
    say(`Workout complete! ${mins} minute${mins === 1 ? '' : 's'} of exercise${jumps ? ` and ${jumps} jumps` : ''}. Amazing job, everyone!`, { interrupt: true });
  },
  buttons() {
    return [
      { id: 'again', x: W / 2 - 500, y: H - 170, w: 480, h: 130, label: 'Another workout', icon: '🏋️', color: '#e8590c', primary: true },
      { id: 'home', x: W / 2 + 20, y: H - 170, w: 480, h: 130, label: 'Home', icon: '🏠', color: '#4a4f7a' },
    ];
  },
  select(app, id) {
    app.workout = null;
    if (id === 'again') startWorkout(app);
    else app.go('home');
  },
  back(app) {
    summary.select(app, 'home');
  },
  draw(app, g, now) {
    backdrop(g, now, 30);
    const wk = app.workout;
    title(g, 'Workout complete! 🎉', 100, 90);
    text(g, `${wk.i >= wk.list.length ? wk.list.length : wk.i + 1} games  ·  about ${app.summaryMins} minute${app.summaryMins === 1 ? '' : 's'} of exercise`, W / 2, 180, { size: 42, color: UI.dim });
    const rows = [...wk.totals.entries()].sort((a, b) => a[0] - b[0]);
    const n = Math.max(1, rows.length);
    const colW = Math.min(440, (W - 160) / n);
    rows.forEach(([slot, t], i) => {
      const look = PLAYER[slot - 1];
      const x = W / 2 + (i - (n - 1) / 2) * colW;
      panel(g, x - colW / 2 + 12, 230, colW - 24, 600, { edge: look.color });
      mascot(g, slot, x, 470, 34, now, 'cheer');
      text(g, look.name, x, 510, { size: 40, color: look.color });
      text(g, `${t.score} point${t.score === 1 ? '' : 's'}  ·  ⭐ ${t.stars}`, x, 565, { size: 34 });
      MOVE_COUNTS.filter(([k]) => t.moves[k] > 0)
        .slice(0, 5)
        .forEach(([k, icon, word], j) => text(g, `${icon} ${t.moves[k]} ${word}`, x, 625 + j * 44, { size: 32, weight: 700, maxW: colW - 50 }));
    });
    app.menu.draw(g, summary.buttons(), now);
  },
};

// ---------------------------------------------------------------------------------------------- settings
export const settings = {
  enter(app, from) {
    app.settingsFrom = from ?? app.settingsFrom ?? 'home';
  },
  buttons(app) {
    const s = app.settings;
    const pct = (v) => `${Math.round(v * 100)}%`;
    const rows = [
      ['roundSec', '⏱️', 'Game length', s.roundSec < 60 ? `${s.roundSec} seconds` : s.roundSec === 60 ? '1 minute' : `${s.roundSec / 60} minutes`],
      ['difficulty', '📈', 'Difficulty', { easy: 'Easy', normal: 'Normal', hard: 'Hard', auto: 'Auto (adjusts itself)' }[s.difficulty]],
      ['voice', '🗣️', 'Voice', s.voice ? 'On' : 'Off'],
      ['music', '🎵', 'Music', pct(s.music)],
      ['sfx', '🔊', 'Sounds', pct(s.sfx)],
      ['preview', '📷', 'Camera picture', s.preview ? 'On' : 'Off'],
      ['camera', '🔁', 'Switch camera', app.cameraName ?? ''],
      ['fullscreen', '⛶', 'Full screen', document.fullscreenElement ? 'On' : 'Off'],
    ];
    const w = 820;
    const h = 120;
    const out = rows.map(([id, icon, label, value], i) => ({
      id,
      x: i < 4 ? W / 2 - w - 20 : W / 2 + 20,
      y: 220 + (i % 4) * (h + 26),
      w,
      h,
      icon,
      label,
      sub: value,
      color: '#3a3f7a',
      disabled: id === 'camera' && app.mouseMode,
    }));
    out.push({ id: 'done', x: W / 2 - 240, y: H - 160, w: 480, h: 120, label: 'Done', icon: '✅', color: '#2e9e5b', primary: true });
    return out;
  },
  select(app, id) {
    const s = app.settings;
    if (id === 'done') return settings.back(app);
    if (id === 'roundSec' || id === 'difficulty') s[id] = cycle(s, id);
    if (id === 'voice' || id === 'preview') s[id] = !s[id];
    if (id === 'music' || id === 'sfx') s[id] = s[id] >= 1 ? 0 : Math.round((s[id] + 0.25) * 100) / 100;
    if (id === 'camera') app.nextCamera();
    if (id === 'fullscreen') app.fullscreen();
    saveSettings(s);
    app.applySettings();
  },
  back(app) {
    app.go(app.settingsFrom === 'pause' ? 'pause' : 'home');
  },
  draw(app, g, now) {
    backdrop(g, now, 60);
    title(g, 'Settings', 110);
    app.menu.draw(g, settings.buttons(app), now);
  },
};

export const SCREENS = { boot, home, players, claim, games, howto, countdown, play, pause, results, summary, settings };

/** Draws the kid's hand cursor over the menus. */
export function drawHandCursor(app, g) {
  if (!app.cursor) return;
  const k = app.menu.dwellId ? Math.min(1, app.menu.dwellT / 1.2) : 0;
  drawCursor(g, app.cursor, PLAYER[(app.cursor.n ?? 1) - 1].color, k);
}
