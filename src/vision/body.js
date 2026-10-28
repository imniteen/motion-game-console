// What a body is doing, measured in body-size units ("s", about one shoulder width) so a 4-year-old and a
// grown-up behave the same. Two parts:
//   describe(px)  a quick, memory-free summary of one detected skeleton (size, posture, partial, static pose)
//   Body          per-player state over time: baselines, jumps, ducks, flaps, throws, poses, energy
import { LM, mid, dist } from './landmarks.js';

/** @typedef {{ x: number, y: number, v: number }} Pt */

/**
 * @typedef {object} Desc
 * @property {number} quality   mean visibility of the core joints
 * @property {boolean} partial  a core joint is missing or outside the picture
 * @property {'stand'|'sit'|'lie'} posture
 * @property {number} s         body-size unit in px: max(shoulder width, 0.6 * torso)
 * @property {number} x         shoulder centre (tracking point)
 * @property {number} y
 * @property {number} stature   nose-to-ankle height / s (0 when the ankles are not seen)
 * @property {{ airplane: boolean, armsUp: boolean, handsHead: boolean }} pose
 */

/**
 * @param {Pt[]} px
 * @param {number} W @param {number} H  the picture size the points live in
 * @returns {Desc}
 */
export function describe(px, W = 1920, H = 1080) {
  const core = [LM.nose, LM.shL, LM.shR, LM.hipL, LM.hipR];
  const quality = core.reduce((a, i) => a + (px[i]?.v ?? 0), 0) / core.length;
  const m = 4;
  const partial = core.some((i) => !px[i] || px[i].v < 0.4 || px[i].x < m || px[i].x > W - m || px[i].y < m || px[i].y > H - m);
  const sh = mid(px[LM.shL], px[LM.shR]);
  const hip = mid(px[LM.hipL], px[LM.hipR]);
  const torso = dist(sh, hip);
  const s = Math.max(dist(px[LM.shL], px[LM.shR]), 0.6 * torso, 1);
  // Lying: the body axis is far from upright. Sitting: every knee we can see is about level with the hips (one
  // leg stuck out to the side, as in a star jump or a wide stance, is still standing).
  const tilt = Math.atan2(Math.abs(sh.x - hip.x), Math.abs(hip.y - sh.y) + 1e-6);
  let posture = /** @type {'stand'|'sit'|'lie'} */ ('stand');
  const knees = [px[LM.knL], px[LM.knR]].filter((k) => k && k.v > 0.5);
  if (tilt > (50 * Math.PI) / 180) posture = 'lie';
  else if (knees.length && knees.every((k) => k.y - hip.y < 0.45 * torso)) posture = 'sit';
  const ankles = [px[LM.anL], px[LM.anR]].filter((a) => a && a.v > 0.5);
  const stature = ankles.length ? (ankles.reduce((a, k) => a + k.y, 0) / ankles.length - px[LM.nose].y) / s : 0;
  return { quality, partial, posture, s, x: sh.x, y: sh.y, stature, pose: staticPose(px, s) };
}

/**
 * The three arm poses, judged from one frame (no memory). Forgiving on purpose: kids' arms are rarely straight,
 * so a pose counts with bent elbows as long as the arm clearly points the right way.
 */
export function staticPose(px, s) {
  const shL = px[LM.shL];
  const shR = px[LM.shR];
  const wL = px[LM.wrL];
  const wR = px[LM.wrR];
  const eL = px[LM.elL];
  const eR = px[LM.elR];
  const nose = px[LM.nose];
  const hipY = (px[LM.hipL].y + px[LM.hipR].y) / 2;
  const cx = (shL.x + shR.x) / 2;
  const seen = wL.v > 0.4 && wR.v > 0.4;
  const side = (p, sh) => Math.sign(p.x - sh.x) === Math.sign(sh.x - cx);
  // out to its own side: the hand well out at about shoulder height, or (arm bent) the elbow out and level
  const out = (w, e, sh) =>
    (side(w, sh) && Math.abs(w.x - sh.x) > 0.8 * s && w.y > sh.y - 0.6 * s && w.y < sh.y + 0.9 * s) ||
    (e.v > 0.4 && side(e, sh) && Math.abs(e.x - sh.x) > 0.45 * s && Math.abs(e.y - sh.y) < 0.6 * s && w.y < hipY && w.y > sh.y - 0.4 * s);
  // up: the hand above the head, or (arm bent) the elbow up with the hand up too, or the forearm pointing up
  // from a level elbow ("goalpost" arms)
  const up = (w, e, sh) =>
    w.y < nose.y || (e.v > 0.4 && ((e.y < sh.y - 0.25 * s && w.y < sh.y - 0.3 * s) || (w.y < sh.y - 0.5 * s && w.y < e.y - 0.3 * s)));
  // hands on head: close to the head and near its middle (arms up, even bent, hold the hands further out)
  const onHead = (w, sh) => dist(w, nose) < 0.9 * s && Math.abs(w.x - nose.x) < 0.5 * s && w.y < sh.y;
  const handsHead = seen && onHead(wL, shL) && onHead(wR, shR);
  return {
    airplane: seen && out(wL, eL, shL) && out(wR, eR, shR),
    armsUp: seen && !handsHead && up(wL, eL, shL) && up(wR, eR, shR),
    handsHead,
  };
}

const ema = (prev, value, dt, tau) => prev + (value - prev) * (1 - Math.exp(-dt / tau));

/**
 * One player's body over time. Call update() with each new (smoothed) skeleton. Events (jumped, flapped,
 * pumped, stepped) are true only on the update where they happen; games read them once per tracked frame
 * through the engine, which latches them until the next fixed game step.
 */
export class Body {
  constructor() {
    this.t = -1;
    this.px = null;
    /** every move so far (kept when the kid leaves and comes back: the exercise summary) */
    this.counts = { jumps: 0, flaps: 0, throws: 0, steps: 0, circles: 0, knees: 0, jacks: 0, squats: 0 };
    this.reseed();
  }

  /** Forget baselines (after a kid comes back into view, or on a new round). */
  reseed() {
    this.hipBase = null;
    this.headBase = null;
    this.airborne = false;
    this.ducking = false;
    this.jumpAt = -Infinity;
    this.landAt = -Infinity;
    this.flapDir = 1; // following the arms up (1) or down (-1)
    this.flapPeak = -Infinity;
    this.flapPeakAt = 0;
    this.flapTrough = Infinity;
    this.flapUpAt = -Infinity;
    this.flaps = /** @type {number[]} */ ([]);
    this.circle = [{ last: null, sum: 0, at: 0 }, { last: null, sum: 0, at: 0 }];
    this.kneeBase = [null, null];
    this.kneeUp = [false, false];
    this.jackOpen = false;
    this.jackOpenAt = -Infinity;
    this.flapRate = 0;
    this.downAt = [-Infinity, -Infinity];
    this.energy = 0;
    this.poseEma = { airplane: 0, armsUp: 0, handsHead: 0 };
    this.pose = { airplane: false, armsUp: false, handsHead: false };
    this.stepFrom = null;
    this.events = Body.noEvents();
    this.prev = null;
  }

  /** What happened on one update: all false/empty when nothing did. */
  static noEvents() {
    return {
      jumped: false,
      landed: false,
      flapped: false,
      pumped: /** @type {('L'|'R')[]} */ ([]),
      step: 0,
      circled: 0, // arm circles finished (0, 1 or 2)
      kneeUp: /** @type {('L'|'R')[]} */ ([]), // a knee came up (marching, running on the spot)
      jacked: false, // a star jump: arms and legs out wide
      squatted: false, // came back up from a squat
    };
  }

  /** @param {Pt[]} px smoothed skeleton in screen px @param {number} t seconds */
  update(px, t) {
    const dt = this.t < 0 ? 1 / 30 : Math.max(1e-3, Math.min(0.25, t - this.t));
    this.t = t;
    const ev = (this.events = Body.noEvents());
    const d = describe(px);
    const s = (this.s = this.s ? ema(this.s, d.s, dt, 0.5) : d.s);
    this.desc = d;
    this.px = px;

    const sh = mid(px[LM.shL], px[LM.shR]);
    const hip = mid(px[LM.hipL], px[LM.hipR]);
    const nose = px[LM.nose];
    this.sh = sh;
    this.hip = hip;
    this.head = { x: nose.x, y: nose.y - 0.15 * s, r: 0.6 * s };
    this.hands = [this.hand(px, LM.wrL, LM.idxL, 'L'), this.hand(px, LM.wrR, LM.idxR, 'R')];

    // Energy: how fast the body is moving, in body sizes per second.
    if (this.prev) {
      const joints = [LM.nose, LM.wrL, LM.wrR, LM.elL, LM.elR, LM.hipL, LM.hipR, LM.knL, LM.knR];
      let sp = 0;
      for (const i of joints) sp += dist(px[i], this.prev[i]) / dt / s;
      this.energy = ema(this.energy, sp / joints.length, dt, 0.3);
    }

    // Standing baselines settle only while the kid is calm and on the ground.
    if (this.hipBase === null) {
      this.hipBase = hip.y;
      this.headBase = nose.y;
    }
    const settled = this.energy < 0.8 && !this.airborne && !this.ducking;
    if (settled) {
      this.hipBase = ema(this.hipBase, hip.y, dt, 1.5);
      this.headBase = ema(this.headBase, nose.y, dt, 1.5);
    }

    // Jump: the hips rise well above where they stand (fast, or very clearly).
    const rise = (this.hipBase - hip.y) / s;
    const vy = this.prevHipY === undefined ? 0 : (hip.y - this.prevHipY) / dt / s;
    this.prevHipY = hip.y;
    if (!this.airborne && t - this.jumpAt > 0.35 && ((rise > 0.3 && vy < -1.2) || rise > 0.45)) {
      this.airborne = true;
      this.jumpAt = t;
      ev.jumped = true;
    } else if (this.airborne && rise < 0.15) {
      this.airborne = false;
      this.landAt = t;
      ev.landed = true;
    }

    // Duck (a squat): the head drops well below where it stands. Coming back up finishes a squat.
    const drop = (nose.y - this.headBase) / s;
    if (!this.ducking && drop > 0.75 && !this.airborne) this.ducking = true;
    else if (this.ducking && drop < 0.45) {
      this.ducking = false;
      ev.squatted = true;
    }

    // Flap: the arms go up and come down again, quickly. How high the arms are is read from the elbows and the
    // hands together, so flapping with bent arms ("chicken wings") counts as well as with straight ones; any
    // downstroke of about half a body unit within 0.8 s of the top is a flap.
    const lift = (shp, el, wr) => {
      const e = (shp.y - el.y) / s;
      const w = (shp.y - wr.y) / s;
      if (el.v > 0.4 && wr.v > 0.4) return (e + w) / 2;
      return wr.v > 0.4 ? w : el.v > 0.4 ? e : 0;
    };
    const arms = (lift(px[LM.shL], px[LM.elL], px[LM.wrL]) + lift(px[LM.shR], px[LM.elR], px[LM.wrR])) / 2;
    const AMP = 0.45;
    if (this.flapDir > 0) {
      if (arms > this.flapPeak) {
        this.flapPeak = arms;
        this.flapPeakAt = t;
      }
      if (this.flapPeak - arms > AMP) {
        this.flapDir = -1;
        this.flapTrough = arms;
        if (t - this.flapPeakAt < 0.8) {
          ev.flapped = true;
          this.flaps.push(t);
          this.flapUpAt = t;
        }
      }
    } else {
      this.flapTrough = Math.min(this.flapTrough, arms);
      if (arms - this.flapTrough > AMP) {
        this.flapDir = 1;
        this.flapPeak = arms;
        this.flapPeakAt = t;
        this.flapUpAt = t;
      }
    }
    while (this.flaps.length && t - this.flaps[0] > 2) this.flaps.shift();
    this.flapRate = this.flaps.length / 2;

    // Arm circles (windmills): the hand goes all the way round its shoulder in one direction. Big or small,
    // bent or straight: about 300 degrees of turning in under 2.5 s counts as a circle.
    [
      [LM.shL, LM.elL, LM.wrL],
      [LM.shR, LM.elR, LM.wrR],
    ].forEach(([si, ei, wi], k) => {
      const c = this.circle[k];
      const w = px[wi].v > 0.4 ? px[wi] : px[ei];
      const shp = px[si];
      if (w.v < 0.4 || dist(w, shp) < 0.45 * s) return;
      const a = Math.atan2(w.x - shp.x, w.y - shp.y);
      if (c.last !== null) {
        let da = a - c.last;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        // a change of direction or a long pause starts the count again
        if (Math.sign(da) !== Math.sign(c.sum) && Math.abs(da) > 0.15) c.sum = 0;
        if (c.sum === 0) c.at = t;
        c.sum += da;
        if (t - c.at > 2.5) {
          c.sum = da;
          c.at = t;
        }
        if (Math.abs(c.sum) > (300 * Math.PI) / 180) {
          ev.circled++;
          c.sum = 0;
        }
      }
      c.last = a;
    });

    // Knee lifts (marching, running on the spot): a knee comes well up towards the hips. Jumping lifts the
    // whole body, not one knee, so it doesn't count.
    [
      [LM.hipL, LM.knL],
      [LM.hipR, LM.knR],
    ].forEach(([hi, ki], k) => {
      const kn = px[ki];
      if (kn.v < 0.5) return;
      const below = (kn.y - px[hi].y) / s;
      if (this.kneeBase[k] === null) this.kneeBase[k] = below;
      if (settled && !this.kneeUp[k]) this.kneeBase[k] = ema(this.kneeBase[k], below, dt, 1.5);
      const raised = this.kneeBase[k] - below;
      if (!this.kneeUp[k] && raised > 0.4) {
        this.kneeUp[k] = true;
        ev.kneeUp.push(k ? 'R' : 'L');
      } else if (this.kneeUp[k] && raised < 0.2) this.kneeUp[k] = false;
    });

    // Star jumps: arms up and (if we can see them) feet apart, then back together. Counted as the arms go up.
    const wrists = [px[LM.wrL], px[LM.wrR]];
    const ankles = [px[LM.anL], px[LM.anR]];
    const feetSeen = ankles.every((a) => a.v > 0.5);
    const feetApart = feetSeen ? Math.abs(ankles[0].x - ankles[1].x) / s : null;
    const armsHigh = wrists.every((w, k) => w.v > 0.4 && w.y < px[k ? LM.shR : LM.shL].y - 0.2 * s);
    const armsLow = wrists.every((w, k) => w.v > 0.4 && w.y > px[k ? LM.shR : LM.shL].y + 0.3 * s);
    if (!this.jackOpen && armsHigh && (feetApart === null || feetApart > 1.2)) {
      this.jackOpen = true;
      ev.jacked = true;
    } else if (this.jackOpen && armsLow && (feetApart === null || feetApart < 1.0)) this.jackOpen = false;

    // Arm pump (a throw): a hand right down by the hip, then up above the head within 1.2 s. (Flapping and
    // dancing swing the arms up too, but never bring a hand down to the hip, so they don't count as throws.)
    [LM.wrL, LM.wrR].forEach((wi, k) => {
      const w = px[wi];
      const shp = px[k ? LM.shR : LM.shL];
      if (w.v < 0.4) return;
      if (w.y > hip.y - 0.6 * s) this.downAt[k] = t;
      else if (w.y < shp.y - 0.3 * s && t - this.downAt[k] < 1.2) {
        this.downAt[k] = -Infinity;
        ev.pumped.push(k ? 'R' : 'L');
      }
    });

    // Sidestep: the shoulders travel more than 0.8 s sideways within 0.6 s.
    if (!this.stepFrom || t - this.stepFrom.t > 0.6) this.stepFrom = { x: sh.x, t };
    const travel = (sh.x - this.stepFrom.x) / s;
    if (Math.abs(travel) > 0.8) {
      ev.step = Math.sign(travel);
      this.stepFrom = { x: sh.x, t };
    }

    // Poses with hysteresis, so one glitchy frame can't flip them. Arms swinging through level while flapping
    // are not an airplane.
    const flapping = t - this.flapUpAt < 0.6;
    // keep count of every move (the exercise summary on the results screen)
    const c = this.counts;
    c.jumps += +ev.jumped;
    c.flaps += +ev.flapped;
    c.throws += ev.pumped.length ? 1 : 0;
    c.steps += ev.step ? 1 : 0;
    c.circles += ev.circled;
    c.knees += ev.kneeUp.length;
    c.jacks += +ev.jacked;
    c.squats += +ev.squatted;
    for (const k of /** @type {const} */ (['airplane', 'armsUp', 'handsHead'])) {
      const on = d.pose[k] && !(k === 'airplane' && flapping);
      this.poseEma[k] = ema(this.poseEma[k], on ? 1 : 0, dt, k === 'airplane' ? 0.2 : 0.12);
      if (!this.pose[k] && this.poseEma[k] > 0.6) this.pose[k] = true;
      else if (this.pose[k] && this.poseEma[k] < 0.3) this.pose[k] = false;
    }

    this.prev = px;
    return this;
  }

  hand(px, wi, ii, side) {
    const w = px[wi];
    const i = px[ii];
    const x = i && i.v > 0.3 ? w.x + (i.x - w.x) * 0.5 : w.x;
    const y = i && i.v > 0.3 ? w.y + (i.y - w.y) * 0.5 : w.y;
    return { x, y, r: 0.35 * (this.s ?? 50), side, seen: w.v > 0.4 };
  }

  get still() {
    return this.energy < 0.6;
  }

  get moving() {
    return this.energy > 1.5;
  }

  get reachUp() {
    return this.hands.some((h) => h.seen && h.y < this.head.y - 0.4 * this.s);
  }
}
