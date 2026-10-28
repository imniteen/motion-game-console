// Plays a game headlessly with pretend players, through the real pieces: synthetic skeletons -> the body
// tracker -> the game host -> the game. Used by test/unit/games.test.js for every game.
import { GameHost } from '../../src/engine/host.js';
import { Body } from '../../src/vision/body.js';
import { synthSkeleton, ARM } from '../../src/vision/synth.js';
import { MOVES } from '../../src/moves.js';
import { makeRng } from '../../src/games/kit.js';

export const stubSfx = new Proxy({}, { get: () => () => {} });

/** A 2D context that accepts every call and fails loudly on NaN/Infinity coordinates. */
export function fakeCanvas() {
  const calls = { n: 0 };
  const grad = { addColorStop() {} };
  const target = {
    canvas: { width: 1920, height: 1080 },
    measureText: (s) => ({ width: String(s).length * 20 }),
    createLinearGradient: (...a) => (check('createLinearGradient', a), grad),
    createRadialGradient: (...a) => (check('createRadialGradient', a), grad),
    createPattern: () => grad,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setLineDash() {},
  };
  function check(name, args) {
    calls.n++;
    for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${name} got ${a}`);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'calls') return calls;
      return (...a) => check(String(k), a);
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

/**
 * @param {any} def
 * @param {{ players?: number, policy?: 'bot'|'idle'|'random', roundSec?: number, seed?: number, drawEvery?: number, comeAndGo?: boolean, difficulty?: string, maxSecs?: number }} o
 */
export function runRound(def, o = {}) {
  const n = o.players ?? 1;
  const roundSec = o.roundSec ?? 120;
  const settings = { roundSec, difficulty: o.difficulty ?? 'normal' };
  const host = new GameHost(def, { settings, sfx: stubSfx, seed: o.seed ?? 7, slotCount: n });
  const rng = makeRng((o.seed ?? 7) + 99);
  const W = 1920;
  const bots = Array.from({ length: n }, (_, i) => {
    const x0 = (W * (i + 0.5)) / n;
    return {
      n: i + 1,
      x: x0,
      home: x0,
      jumpAt: -9,
      pumpAt: -9,
      move: null,
      moveUntil: 0,
      slot: { n: i + 1, state: 'active', present: true, px: null, body: new Body(), zone: { x0: x0 - 200, x1: x0 + 200 } },
    };
  });
  host.start(bots.map((b) => b.n));
  const fake = fakeCanvas();
  const steps = Math.ceil((o.maxSecs ?? roundSec + 1) * 60);
  for (let i = 0; i < steps; i++) {
    const t = i / 60;
    if (i % 2 === 0) {
      for (const b of bots) {
        if (o.comeAndGo) {
          // each pretend kid steps out for 3 s now and then
          const away = Math.sin(t * 0.21 + b.n * 1.7) > 0.93;
          b.slot.state = away ? 'lost' : 'active';
          b.slot.present = !away;
          if (away) continue;
        }
        const view = host.views.find((v) => v.n === b.n);
        const want = intent(o.policy ?? 'bot', host, b, view, t, rng);
        const px = synthSkeleton(poseFor(b, want, view, t));
        b.slot.px = px;
        b.slot.body.update(px, t);
      }
    }
    host.step(1 / 60, bots.map((b) => b.slot));
    if (o.drawEvery && i % o.drawEvery === 0) {
      host.round.drawBack?.(fake, host.views);
      host.round.drawFront?.(fake, host.views);
    }
    if (host.ended) break;
  }
  return { host, bots, fake };
}

function intent(policy, host, b, view, t, rng) {
  if (policy === 'idle') return {};
  if (policy === 'random') {
    if (t >= b.moveUntil) {
      const ids = Object.keys(MOVES);
      b.move = rng() < 0.3 ? null : ids[Math.floor(rng() * ids.length)];
      b.moveUntil = t + 0.5 + rng() * 2;
      b.target = 200 + rng() * 1520;
    }
    return { move: b.move ?? undefined, x: b.target };
  }
  return view && host.round.bot ? host.round.bot(view, t) ?? {} : {};
}

/** Turns what the bot wants into a synthetic pose (camera space). */
function poseFor(b, want, view, t) {
  // game space -> camera space for this player (inverse of the host's layout transform)
  const k = view ? view.s / Math.max(1, b.slot.body.s ?? view.s) : 1;
  const toCam = (gx, gy) => (view ? { x: b.slot.body.hip.x + (gx - view.hip.x) / k, y: b.slot.body.hip.y + (gy - view.hip.y) / k } : { x: gx, y: gy });
  if (want.x !== undefined) {
    const target = view ? toCam(want.x, 0).x : want.x;
    const sp = 400 / 30;
    b.x += Math.max(-sp, Math.min(sp, target - b.x));
  }
  b.x = Math.max(150, Math.min(1770, b.x));
  /** @type {any} */
  let p = { x: b.x, hipY: 640, sw: 90, armL: ARM.down, armR: ARM.down };
  if (want.move && MOVES[want.move]) {
    const m = MOVES[want.move].pose(t);
    p = { ...p, ...m, x: b.x + (m.dx ?? 0) * 90 };
  }
  if (want.pose === 'armsUp') p = { ...p, armL: ARM.up, armR: ARM.up };
  if (want.pose === 'airplane') p = { ...p, armL: ARM.out, armR: ARM.out };
  if (want.pose === 'handsHead') p = { ...p, armL: 'head', armR: 'head' };
  if (want.pose === 'freeze') p = { ...p, armL: ARM.up, armR: ARM.out };
  if (want.duck) p.duck = 1;
  if (want.jump && t - b.jumpAt > 0.7) b.jumpAt = t;
  const tj = t - b.jumpAt;
  if (tj >= 0 && tj < 0.55) p.lift = Math.sin((tj / 0.55) * Math.PI) * 1.2;
  if (want.pump && t - b.pumpAt > 0.9) b.pumpAt = t;
  const tp = t - b.pumpAt;
  if (tp >= 0 && tp < 0.3) p.armR = ARM.down;
  else if (tp >= 0.3 && tp < 0.7) p.armR = ARM.up;
  if (want.reach) {
    const c = toCam(want.reach.x, want.reach.y);
    if (c.x >= b.x) p.armR = c;
    else p.armL = c;
  }
  return p;
}
