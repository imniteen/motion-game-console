// Runs one round of a game: the clock, scores, shared hearts, difficulty, where each player's avatar stands
// (one shared world or one lane each), effects, the coach, and the results. Games only describe their world
// and report what happened; everything a console shows around a game lives here.
import { GameClock } from './clock.js';
import { Coach } from './coach.js';
import { makeRng } from '../games/kit.js';
import { PLAYER } from '../ui/theme.js';
import { Body } from '../vision/body.js';

const BASE_LEVEL = { easy: 0.75, normal: 1, hard: 1.3, auto: 1 };
// The final rush: the last 15 seconds (a third of a short round) get faster and harder, to finish on a high.
export const RUSH = { secs: 15, boost: 0.4, rampIn: 1.5 };

/**
 * @typedef {object} PlayerView  what a game sees of a player (positions in game space)
 * @property {number} n  player number 1..4
 * @property {string} color
 * @property {string} name   'Red', 'Blue'...
 * @property {'active'|'held'} state  held: the camera lost them for a moment (shown frozen, no new moves)
 * @property {{x:number,y:number,v:number}[]} px
 * @property {number} s  body size unit (about a shoulder width) in px
 * @property {{x:number,y:number,r:number}} head
 * @property {{x:number,y:number,r:number,side:'L'|'R',seen:boolean}[]} hands
 * @property {{x:number,y:number}} sh  shoulder centre
 * @property {{x:number,y:number}} hip hip centre
 * @property {{x0:number,x1:number,cx:number,w:number}} lane  the player's lane (the whole screen in shared games)
 * @property {boolean} airborne @property {boolean} ducking @property {boolean} jumped @property {boolean} landed
 * @property {boolean} flapped @property {('L'|'R')[]} pumped @property {number} step
 * @property {number} circled  arm circles finished this step (0-2)
 * @property {('L'|'R')[]} kneeUp  knees lifted this step (marching / running on the spot)
 * @property {boolean} jacked  a star jump this step @property {boolean} squatted  came up from a squat this step
 * @property {boolean} ducking  in a squat / crouch now
 * @property {{armsUp:boolean, airplane:boolean, handsHead:boolean}} pose
 * @property {number} flapRate @property {number} energy @property {boolean} still @property {boolean} moving
 * @property {boolean} reachUp
 * @property {number} score
 */

export class GameHost {
  /**
   * @param {any} def  game definition (games/*.js)
   * @param {{ settings: any, sfx: any, say?: (s: string) => void, seed?: number, W?: number, H?: number, slotCount: number }} o
   */
  constructor(def, o) {
    this.def = def;
    this.o = o;
    this.W = o.W ?? 1920;
    this.H = o.H ?? 1080;
    this.clock = new GameClock();
    this.coach = new Coach();
    this.rng = makeRng(o.seed ?? (Date.now() & 0xffff));
    this.scores = new Map();
    this.stats = new Map();
    this.hearts = def.hearts ?? 0;
    this.ended = null;
    this.ease = 1;
    this.easeLog = [];
    this.fx = { parts: [], pops: [], shake: 0 };
    this.lastFrame = new Map();
    this.homes = new Map();
    this.views = [];
    this.flash = new Map(); // n -> { until, color }
    this.faces = new Map(); // n -> { face, until }
    this.moves = new Map(); // n -> how many of each move this round (the exercise summary)
  }

  get roundSec() {
    return this.o.settings.roundSec;
  }

  get t() {
    return this.clock.t;
  }

  get timeLeft() {
    return Math.max(0, this.roundSec - this.clock.t);
  }

  /** How long the final rush lasts in this round. */
  get rushSec() {
    return Math.min(RUSH.secs, this.roundSec / 3);
  }

  /** 0 before the final rush, rising to 1 over its first moment. */
  rushK() {
    const into = this.rushSec - this.timeLeft;
    return into <= 0 || this.ended ? 0 : Math.min(1, into / RUSH.rampIn);
  }

  /** @param {number[]} ns player numbers in the game */
  start(ns) {
    this.clock.reset();
    this.clock.running = true;
    this.coach.reset(0);
    for (const n of ns) this.addPlayer(n);
    const host = this;
    const ctx = {
      W: this.W,
      H: this.H,
      floorY: this.H * 0.86,
      get roundSec() {
        return host.roundSec;
      },
      t: () => this.clock.t,
      progress: () => Math.min(1, this.clock.t / this.roundSec),
      level: () => this.level(),
      rush: () => this.rushK() > 0, // the final rush is on: games may add their own twist
      rng: this.rng,
      lane: (n) => this.lane(n),
      slots: () => this.o.slotCount, // how many lanes there are
      sfx: this.o.sfx,
      report: this.reporter(),
      fx: {
        burst: (x, y, color, k = 14) => this.burst(x, y, color, k),
        pop: (label, x, y, color = '#fff') => this.pop(label, x, y, color),
        shake: (k = 12) => (this.fx.shake = Math.max(this.fx.shake, k)),
      },
    };
    this.ctx = ctx;
    this.round = this.def.create(ctx);
  }

  addPlayer(n) {
    if (!this.scores.has(n)) this.scores.set(n, 0);
    if (!this.stats.has(n)) this.stats.set(n, { goods: 0, misses: 0 });
    if (!this.moves.has(n)) this.moves.set(n, { jumps: 0, flaps: 0, throws: 0, steps: 0, circles: 0, knees: 0, jacks: 0, squats: 0 });
    this.coach.join(n, this.clock.t);
  }

  /**
   * Difficulty right now: the setting, a ramp over the round, auto-ease when the kids keep missing, and the
   * final rush on top.
   */
  level() {
    const base = BASE_LEVEL[this.o.settings.difficulty] ?? 1;
    const ramp = 1 + 0.5 * Math.min(1, this.clock.t / this.roundSec);
    return base * ramp * this.ease * (1 + RUSH.boost * this.rushK());
  }

  lane(n) {
    if (this.def.layout !== 'columns') return { x0: 0, x1: this.W, cx: this.W / 2, w: this.W };
    const k = Math.max(1, this.o.slotCount);
    const w = this.W / k;
    const x0 = (n - 1) * w;
    return { x0, x1: x0 + w, cx: x0 + w / 2, w };
  }

  reporter() {
    const t = () => this.clock.t;
    return {
      score: (n, pts, x, y, label) => {
        if (!this.scores.has(n)) return;
        this.scores.set(n, this.scores.get(n) + pts);
        this.stats.get(n).goods++;
        this.coach.good(n, t());
        this.easeLog.push({ t: t(), good: true });
        this.face(n, 'smile', 0.6);
        if (x !== undefined) this.pop(label ?? `+${pts}`, x, y, PLAYER[n - 1]?.color ?? '#fff');
      },
      good: (n, x, y, label) => {
        this.coach.good(n, t());
        if (this.stats.has(n)) this.stats.get(n).goods++;
        if (label && x !== undefined) this.pop(label, x, y, '#5ee08a');
      },
      miss: (n, move, x, y, label) => {
        if (!this.stats.has(n)) return;
        this.stats.get(n).misses++;
        this.coach.miss(n, move, t());
        this.easeLog.push({ t: t(), good: false });
        this.face(n, 'ouch', 0.8);
        this.flash.set(n, { until: t() + 0.4, color: '#ff5d73' });
        if (label && x !== undefined) this.pop(label, x, y, '#ff8a8a');
      },
      hit: (n, x, y) => {
        if (n) this.face(n, 'ouch', 0.8);
        this.fx.shake = Math.max(this.fx.shake, 14);
        if (this.hearts > 0) {
          this.hearts--;
          if (this.hearts === 0) this.ended = { reason: 'hearts', message: 'Out of hearts!' };
        }
        if (x !== undefined) this.burst(x, y, '#ff5d73', 18);
      },
      end: (message) => (this.ended = { reason: 'game', message }),
    };
  }

  face(n, face, secs) {
    this.faces.set(n, { face, until: this.clock.t + secs });
  }

  /** Builds what games see of the players from the locked roster's slots. */
  viewsFrom(slots) {
    const views = [];
    for (const slot of slots) {
      if (!slot.present || !slot.px || !this.scores.has(slot.n)) continue;
      const b = slot.body;
      const fresh = this.lastFrame.get(slot.n) !== b.t && slot.state === 'active';
      this.lastFrame.set(slot.n, b.t);
      const ev = fresh ? b.events : Body.noEvents();
      if (fresh && this.clock.running) {
        const m = this.moves.get(slot.n);
        m.jumps += +ev.jumped;
        m.flaps += +ev.flapped;
        m.throws += ev.pumped.length ? 1 : 0;
        m.steps += ev.step ? 1 : 0;
        m.circles += ev.circled;
        m.knees += ev.kneeUp.length;
        m.jacks += +ev.jacked;
        m.squats += +ev.squatted;
      }
      const tf = this.transform(slot);
      const px = slot.px.map((p) => ({ ...tf(p), v: p.v }));
      const k = tf.k;
      const look = PLAYER[slot.n - 1];
      views.push({
        n: slot.n,
        color: look.color,
        name: look.name,
        state: /** @type {'active'|'held'} */ (slot.state),
        px,
        s: b.s * k,
        head: { ...tf(b.head), r: b.head.r * k },
        hands: b.hands.map((h) => ({ ...tf(h), r: h.r * k, side: h.side, seen: h.seen && slot.state === 'active' })),
        sh: tf(b.sh),
        hip: tf(b.hip),
        lane: this.lane(slot.n),
        airborne: b.airborne,
        ducking: b.ducking,
        jumped: ev.jumped,
        landed: ev.landed,
        flapped: ev.flapped,
        pumped: ev.pumped,
        step: ev.step,
        circled: ev.circled,
        kneeUp: ev.kneeUp,
        jacked: ev.jacked,
        squatted: ev.squatted,
        pose: { ...b.pose },
        flapRate: b.flapRate,
        energy: b.energy,
        still: b.still,
        moving: b.moving,
        reachUp: b.reachUp,
        score: this.scores.get(slot.n),
      });
    }
    return views;
  }

  /** Camera space -> game space. Shared games: as the camera sees it. Lane games: the kid stands in their lane. */
  transform(slot) {
    if (this.def.layout !== 'columns') {
      const f = (p) => ({ x: p.x, y: p.y });
      f.k = 1;
      return f;
    }
    const b = slot.body;
    const lane = this.lane(slot.n);
    const target = Math.min(lane.w * 0.16, 95);
    const k = target / Math.max(10, b.s);
    // where the kid usually stands, so a small step moves them a little within the lane
    const home = this.homes.get(slot.n) ?? b.hip.x;
    this.homes.set(slot.n, home + (b.hip.x - home) * 0.002); // follows slowly: a step stays a step for a while
    const shift = Math.max(-lane.w * 0.25, Math.min(lane.w * 0.25, (b.hip.x - home) * k * 0.6));
    const floor = this.H * 0.86;
    const baseHip = b.hipBase ?? b.hip.y;
    const f = (p) => ({ x: lane.cx + shift + (p.x - b.hip.x) * k, y: floor - 2.25 * target + (p.y - baseHip) * k });
    f.k = k;
    return f;
  }

  /**
   * One fixed game step (only called while the round is being played).
   * @param {number} dt
   * @param {import('../vision/roster.js').Slot[]} slots
   */
  step(dt, slots) {
    if (this.ended) return;
    this.clock.step(dt);
    const views = this.viewsFrom(slots);
    this.views = views;
    for (const v of views) if (!this.coach.lastGood.has(v.n)) this.coach.join(v.n, this.clock.t);
    this.round.update(dt, views);
    const tip = this.coach.update(
      this.clock.t,
      views.filter((v) => v.state === 'active').map((v) => ({ n: v.n, needs: this.round.needs ? this.round.needs(v.n) : this.def.moves[0] })),
    );
    if (tip) this.onTip?.(tip);
    if (this.rushAt === undefined && this.rushK() > 0) {
      this.rushAt = this.clock.t;
      this.onRush?.();
    }
    this.autoEase();
    this.stepFx(dt);
    if (!this.ended && this.clock.t >= this.roundSec) this.ended = { reason: 'time', message: "Time's up!" };
  }

  autoEase() {
    if (this.o.settings.difficulty !== 'auto' || this.rushK() > 0) return; // the rush is meant to be hard
    const t = this.clock.t;
    while (this.easeLog.length && t - this.easeLog[0].t > 15) this.easeLog.shift();
    if (this.nextEase && t < this.nextEase) return;
    const misses = this.easeLog.filter((e) => !e.good).length;
    const goods = this.easeLog.length - misses;
    if (misses >= 3 && misses > goods) {
      this.ease = Math.max(0.6, this.ease * 0.85);
      this.nextEase = t + 6;
    } else if (goods >= 8 && misses === 0) {
      this.ease = Math.min(1.3, this.ease * 1.06);
      this.nextEase = t + 6;
    }
  }

  burst(x, y, color, k) {
    for (let i = 0; i < k; i++) {
      const a = this.rng() * Math.PI * 2;
      const sp = 200 + this.rng() * 500;
      this.fx.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 150, life: 0.6 + this.rng() * 0.4, r: 6 + this.rng() * 10, color });
    }
  }

  pop(label, x, y, color) {
    this.fx.pops.push({ label, x, y, color, age: 0 });
  }

  stepFx(dt) {
    for (const p of this.fx.parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 900 * dt;
    }
    this.fx.parts = this.fx.parts.filter((p) => p.life > 0);
    for (const p of this.fx.pops) {
      p.age += dt;
      p.y -= 90 * dt;
    }
    this.fx.pops = this.fx.pops.filter((p) => p.age < 1.1);
    this.fx.shake = Math.max(0, this.fx.shake - 60 * dt);
  }

  /** Stars (0-3) for a score, scaled to the round length (the game's numbers are for 2 minutes). */
  starsFor(score) {
    const k = this.roundSec / 120;
    return this.def.stars.filter((s) => score >= s * k).length;
  }

  results() {
    return [...this.scores.entries()]
      .map(([n, score]) => ({ n, score, stars: this.starsFor(score), ...this.stats.get(n), moves: { ...this.moves.get(n) } }))
      .sort((a, b) => b.score - a.score);
  }
}
