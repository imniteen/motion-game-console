// THE LOCKED ROSTER: who is Player 1..4, and nobody else.
//
// The naive way to follow players (give a kid's place to whatever body is nearest whenever the pose model
// misses the kid for a moment) lets a grown-up sitting on the sofa take over a player. Here a body only drives a
// slot when it passes every identity check: close to where that kid was heading, the same size, the same
// clothes, still standing. Anyone else is a "bystander": tracked lightly so their body always has an owner,
// never drawn, never scored. A slot that loses its kid waits for that kid (it is never handed to someone else).
//
// Slot life: empty -> (claim: stand in your zone, arms out) -> active <-> held (missed < 0.75 s) -> lost
// A lost slot comes back when its kid is seen again with the same clothes (5 frames in a row), or when a kid
// stands in that slot's zone with arms out for 1 s (always works, even in a dim room with dark clothes).
import { describe, Body } from './body.js';
import { SkeletonFilter } from './smooth.js';
import { sigDistance, blendSig } from './signature.js';

export const TUNING = {
  heldFor: 0.75, // s a missed slot keeps its last pose before it counts as lost
  claimHold: 1.5, // s of arms out in your zone to claim a slot
  reclaimHold: 1.0, // s of arms out in your zone to take your lost slot back
  holdGap: 0.25, // s a claim hold survives without arms out (tracking glitches)
  minQuality: 0.35,
  sigGate: 0.45, // clothes further apart than this are never the same kid (when colours are trustworthy)
  sigTrust: 0.4, // signature confidence needed to use clothes at all
  reacqSig: 0.25, // clothes this close bring a lost kid back by themselves...
  reacqMargin: 0.15, // ...if clearly closer than anyone else's
  reacqFrames: 5,
  missCost: 2.5, // cost of leaving a slot (or a bystander) without a body this frame
  trackForget: 30, // s a bystander is remembered after they were last seen
};

/**
 * @typedef {import('./signature.js').Signature} Signature
 * @typedef {{ px: {x:number,y:number,v:number}[], sig: Signature | null }} Detection
 * @typedef {Detection & { d: import('./body.js').Desc, i: number }} Det
 */

export class Slot {
  /** @param {number} n player number 1..4 @param {{x0:number,x1:number}} zone */
  constructor(n, zone) {
    this.n = n;
    this.zone = zone;
    this.state = /** @type {'empty'|'active'|'held'|'lost'} */ ('empty');
    this.anchor = /** @type {Float32Array | null} */ (null); // clothes when claimed: never changes
    this.running = /** @type {Float32Array | null} */ (null); // clothes now: follows slowly
    this.sigConf = 0;
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.s = 50;
    this.lastSeen = -Infinity;
    this.filter = new SkeletonFilter();
    this.body = new Body();
    this.px = /** @type {{x:number,y:number,v:number}[] | null} */ (null); // what to draw (smoothed)
    this.reacq = 0;
    this.reacqAt = null;
    this.posture = 'stand'; // how the kid was last seen (squatting kids look like sitting ones)
    this.hold = null; // reclaim progress
  }

  get present() {
    return this.state === 'active' || this.state === 'held';
  }

  sigDist(sig) {
    if (!this.anchor || !sig) return 0;
    return Math.min(sigDistance(this.anchor, sig.bins), this.running ? sigDistance(this.running, sig.bins) : 1);
  }
}

export class Roster {
  constructor({ W = 1920, H = 1080 } = {}) {
    this.W = W;
    this.H = H;
    /** @type {Slot[]} */
    this.slots = [];
    /** bystanders: { id, x, y, s, sig, posture, lastSeen, born } */
    this.tracks = [];
    this.nextTrack = 1;
    this.claimOpen = false;
    this.claimHolds = new Map(); // slot n -> { t0, last, sum: Float32Array|null, n, conf }
    this.others = /** @type {Det[]} */ ([]); // bodies that are not players this frame (claim screen ghosts)
    this.events = [];
    this.t = 0;
  }

  /** Make `count` empty slots, each with a zone of the floor to claim it from. Forgets everyone. */
  setup(count) {
    const n = Math.max(1, Math.min(4, count));
    const span = this.W * 0.9;
    this.slots = Array.from({ length: n }, (_, i) => {
      const c = this.W * 0.05 + (span * (i + 0.5)) / n;
      const half = (0.45 * span) / n;
      return new Slot(i + 1, { x0: c - half, x1: c + half });
    });
    this.tracks = [];
    this.claimHolds.clear();
  }

  /** Change how many slots there are, keeping the players already in (Add player). */
  resize(count) {
    const keep = this.slots.filter((s) => s.state !== 'empty');
    const old = this.slots;
    this.setup(Math.max(count, keep.length ? Math.max(...keep.map((s) => s.n)) : 1));
    for (const s of old) if (s.state !== 'empty' && this.slots[s.n - 1]) Object.assign(this.slots[s.n - 1], { ...s, zone: this.slots[s.n - 1].zone });
  }

  openClaim() {
    this.claimOpen = true;
    this.claimHolds.clear();
  }

  closeClaim() {
    this.claimOpen = false;
    this.claimHolds.clear();
  }

  release(n) {
    const s = this.slots[n - 1];
    if (s) Object.assign(s, new Slot(s.n, s.zone));
  }

  /** The camera restarted or changed: positions mean nothing any more. Everyone reclaims (or is recognised). */
  cameraChanged() {
    for (const s of this.slots) if (s.state !== 'empty') s.state = 'lost';
    this.tracks = [];
  }

  get players() {
    return this.slots.filter((s) => s.state !== 'empty');
  }

  get active() {
    return this.slots.filter((s) => s.present);
  }

  get emptySlots() {
    return this.slots.filter((s) => s.state === 'empty');
  }

  /**
   * One tracked frame.
   * @param {Detection[]} detections  every body the pose model found (screen px, mirrored)
   * @param {number} t  seconds
   * @returns {{ type: 'claim'|'lost'|'back', n: number }[]}
   */
  update(detections, t) {
    this.t = t;
    const events = (this.events = []);
    /** @type {Det[]} */
    const dets = [];
    detections.forEach((det, i) => {
      const d = describe(det.px, this.W, this.H);
      if (d.quality >= TUNING.minQuality) dets.push({ ...det, d, i });
    });

    // 1. Who is who: present slots and bystanders against this frame's bodies, best total fit.
    const rows = [
      ...this.slots.filter((s) => s.present).map((s) => ({ kind: 'slot', s })),
      ...this.tracks.map((tr) => ({ kind: 'track', tr })),
    ];
    const cost = rows.map((r) => dets.map((det) => (r.kind === 'slot' ? this.slotCost(r.s, det, t) : this.trackCost(r.tr, det, t))));
    const match = solve(cost, TUNING.missCost);
    const takenBySlot = new Set();
    const trackOf = new Map(); // det -> track
    rows.forEach((r, ri) => {
      const j = match[ri];
      if (j < 0) return;
      if (r.kind === 'slot') {
        // Ambiguous (another body fits nearly as well and looks alike)? Follow it, but learn nothing from it.
        const c = cost[ri][j];
        const alike = (a, b) => !a.sig || !b.sig || sigDistance(a.sig.bins, b.sig.bins) < 0.1;
        const rival = cost[ri].some((c2, k) => k !== j && c2 < c * 1.15 + 0.05 && alike(dets[k], dets[j]));
        this.see(r.s, dets[j], t, !rival);
        takenBySlot.add(j);
      } else trackOf.set(j, r.tr);
    });

    // 2. Claiming and reclaiming: arms out in your zone.
    const free = dets.filter((_, j) => !takenBySlot.has(j));
    this.claims(free, t, takenBySlot, dets, trackOf);

    // 3. A lost kid recognised by their clothes.
    for (const s of this.slots) if (s.state === 'lost') this.reacquire(s, dets, takenBySlot, trackOf, t);

    // 4. Missed slots: held, then lost.
    for (const s of this.slots) {
      if (s.state === 'active' && s.lastSeen < t) s.state = 'held';
      if (s.state === 'held' && t - s.lastSeen > TUNING.heldFor) {
        s.state = 'lost';
        s.reacq = 0;
        events.push({ type: 'lost', n: s.n });
      }
    }

    // 5. Bystanders: update the matched ones, start new ones, forget old ones.
    dets.forEach((det, j) => {
      if (takenBySlot.has(j)) return;
      const tr = trackOf.get(j);
      if (tr) {
        tr.x = det.d.x;
        tr.y = det.d.y;
        tr.s = det.d.s;
        tr.posture = det.d.posture;
        tr.lastSeen = t;
        if (det.sig) tr.sig = tr.sig ? blendSig(tr.sig, det.sig.bins, 0.1) : Float32Array.from(det.sig.bins);
      } else {
        this.tracks.push({ id: this.nextTrack++, x: det.d.x, y: det.d.y, s: det.d.s, sig: det.sig ? Float32Array.from(det.sig.bins) : null, posture: det.d.posture, lastSeen: t, born: t });
      }
    });
    this.tracks = this.tracks.filter((tr) => t - tr.lastSeen < TUNING.trackForget);
    this.others = dets.filter((_, j) => !takenBySlot.has(j));
    return events;
  }

  /** How well a body fits a present slot; Infinity when it can't be that kid. */
  slotCost(s, det, t) {
    const d = det.d;
    const dt = Math.min(0.5, Math.max(0, t - s.lastSeen));
    const px = s.pos.x + s.vel.x * dt;
    const py = s.pos.y + s.vel.y * dt;
    const dx = Math.abs(d.x - px);
    const dy = Math.abs(d.y - py);
    if (d.partial) {
      // half out of the picture: only the kid who was right here a moment ago
      if (s.state !== 'active' || dt > 0.3 || dx > 0.8 * s.s || dy > 0.8 * s.s) return Infinity;
      return dx / (0.8 * s.s) + 0.3;
    }
    const gx = s.s * Math.min(2.0, 0.6 + 2.5 * dt);
    const gy = s.s * Math.min(1.2, 0.5 + 3 * dt);
    if (dx > gx || dy > gy) return Infinity;
    const ratio = d.s / s.s;
    const [lo, hi] = s.state === 'active' ? [0.75, 1.33] : [0.7, 1.4];
    if (ratio < lo || ratio > hi) return Infinity;
    // standing kids don't turn into sitting or lying bodies unless it happens right in front of us (a kid
    // who was already down in a squat may still be down when we find them again)
    if (d.posture !== 'stand' && dt >= 0.2 && s.posture !== d.posture) return Infinity;
    let sig = 0;
    if (s.anchor && det.sig && det.sig.conf >= TUNING.sigTrust && s.sigConf >= TUNING.sigTrust) {
      sig = s.sigDist(det.sig);
      if (sig > TUNING.sigGate) return Infinity;
    }
    return dx / gx + (0.5 * dy) / gy + (0.8 * Math.abs(Math.log(ratio))) / Math.log(1.33) + (1.2 * sig) / TUNING.sigGate;
  }

  trackCost(tr, det, t) {
    const d = det.d;
    const dt = Math.min(2, t - tr.lastSeen);
    const dx = Math.abs(d.x - tr.x);
    const dy = Math.abs(d.y - tr.y);
    const gx = tr.s * Math.min(2.5, 1 + 3 * dt);
    const gy = tr.s * Math.min(2.5, 1 + 3 * dt);
    if (dx > gx || dy > gy) return Infinity;
    const ratio = d.s / tr.s;
    if (ratio < 0.6 || ratio > 1.6) return Infinity;
    const sig = tr.sig && det.sig ? sigDistance(tr.sig, det.sig.bins) : 0;
    return dx / gx + (0.5 * dy) / gy + Math.abs(Math.log(ratio)) + sig;
  }

  /** The slot's kid was found in this body. */
  see(s, det, t, learn) {
    const d = det.d;
    const dt = Math.max(1e-3, Math.min(0.5, t - s.lastSeen));
    if (learn && !d.partial) {
      // alpha-beta: follow the body and learn how fast it moves
      const px = s.pos.x + s.vel.x * dt;
      const py = s.pos.y + s.vel.y * dt;
      const rx = d.x - px;
      const ry = d.y - py;
      s.pos = { x: px + 0.5 * rx, y: py + 0.5 * ry };
      const max = 6 * s.s;
      s.vel = { x: clamp(s.vel.x + (0.2 * rx) / dt, -max, max), y: clamp(s.vel.y + (0.2 * ry) / dt, -max, max) };
      s.s += (d.s - s.s) * 0.1;
      if (det.sig && s.running && det.sig.conf >= TUNING.sigTrust) blendSig(s.running, det.sig.bins, 0.02);
    } else {
      s.pos = { x: d.x, y: d.y };
    }
    if (s.state === 'lost') s.body.reseed();
    s.posture = d.posture;
    s.state = 'active';
    s.lastSeen = t;
    s.px = s.filter.apply(det.px, t);
    s.body.update(s.px, t);
  }

  claims(free, t, takenBySlot, dets, trackOf) {
    for (const s of this.slots) {
      const claiming = this.claimOpen && s.state === 'empty';
      const reclaiming = s.state === 'lost';
      if (!claiming && !reclaiming) continue;
      // standing, whole, in this zone, arms out: exactly one such body may claim (two at once: "one at a time!")
      const inZone = free.filter((det) => det.d.posture === 'stand' && !det.d.partial && det.d.x >= s.zone.x0 && det.d.x <= s.zone.x1 && det.d.pose.airplane);
      let h = this.claimHolds.get(s.n);
      if (inZone.length !== 1) {
        if (h) h.crowded = inZone.length > 1;
        if (h && t - h.last > TUNING.holdGap) this.claimHolds.delete(s.n);
        continue;
      }
      const det = inZone[0];
      if (!h) {
        h = { t0: t, last: t, sum: det.sig ? new Float32Array(det.sig.bins.length) : null, k: 0, conf: 0, crowded: false };
        this.claimHolds.set(s.n, h);
      }
      h.last = t;
      h.crowded = false;
      if (det.sig && h.sum) {
        for (let i = 0; i < h.sum.length; i++) h.sum[i] += det.sig.bins[i];
        h.conf += det.sig.conf;
        h.k++;
      }
      if (t - h.t0 >= (claiming ? TUNING.claimHold : TUNING.reclaimHold)) {
        const wasLost = s.state === 'lost';
        if (claiming || !s.anchor) {
          s.anchor = h.sum && h.k ? h.sum.map((v) => v / h.k) : null;
          s.running = s.anchor ? Float32Array.from(s.anchor) : null;
          s.sigConf = h.k ? h.conf / h.k : 0;
        }
        s.pos = { x: det.d.x, y: det.d.y };
        s.vel = { x: 0, y: 0 };
        s.s = det.d.s;
        s.filter.reset();
        s.body.reseed();
        s.lastSeen = -Infinity;
        this.see(s, det, t, false);
        this.claimHolds.delete(s.n);
        takenBySlot.add(dets.indexOf(det));
        this.forgetTrack(trackOf.get(dets.indexOf(det)));
        this.events.push({ type: wasLost ? 'back' : 'claim', n: s.n });
        free.splice(free.indexOf(det), 1);
      }
    }
  }

  /** Give slot n to this body straight away (tests that start mid-game). */
  forceClaim(n, detection, t) {
    const s = this.slots[n - 1];
    const det = { ...detection, d: describe(detection.px, this.W, this.H), i: 0 };
    s.anchor = det.sig ? Float32Array.from(det.sig.bins) : null;
    s.running = s.anchor ? Float32Array.from(s.anchor) : null;
    s.sigConf = det.sig?.conf ?? 0;
    s.pos = { x: det.d.x, y: det.d.y };
    s.vel = { x: 0, y: 0 };
    s.s = det.d.s;
    this.see(s, det, t, false);
  }

  /** Claim / reclaim progress per slot (0..1) for the screens. */
  holdProgress(n) {
    const h = this.claimHolds.get(n);
    if (!h) return { progress: 0, crowded: false };
    const s = this.slots[n - 1];
    const need = s?.state === 'lost' ? TUNING.reclaimHold : TUNING.claimHold;
    return { progress: Math.min(1, (this.t - h.t0) / need), crowded: !!h.crowded };
  }

  reacquire(s, dets, takenBySlot, trackOf, t) {
    if (!s.anchor || s.sigConf < TUNING.sigTrust) return this.softReacquire(s, dets, takenBySlot, trackOf, t);
    let best = null;
    let bestD = Infinity;
    dets.forEach((det, j) => {
      if (takenBySlot.has(j)) return;
      const tr = trackOf.get(j);
      if (tr && t - tr.born > 3) return; // someone who has been here all along (the grown-up on the sofa)
      const d = det.d;
      if (d.partial || d.posture !== 'stand' || d.quality < 0.6 || !det.sig || det.sig.conf < TUNING.sigTrust) return;
      const ratio = d.s / s.s;
      if (ratio < 0.6 || ratio > 1.6) return;
      const sd = sigDistance(s.anchor, det.sig.bins);
      if (sd >= TUNING.reacqSig || sd >= bestD) return;
      // clearly closer to this kid than to any other player or long-standing bystander
      const others = [
        ...this.slots.filter((o) => o !== s && o.anchor).map((o) => sigDistance(o.anchor, det.sig.bins)),
        ...this.tracks.filter((o) => o !== tr && o.sig && t - o.born > 3).map((o) => sigDistance(o.sig, det.sig.bins)),
      ];
      if (others.some((o) => o < sd + TUNING.reacqMargin)) return;
      best = j;
      bestD = sd;
    });
    if (best === null) {
      s.reacq = 0;
      return;
    }
    const det = dets[best];
    // the same body several frames in a row
    if (s.reacqAt && Math.abs(det.d.x - s.reacqAt.x) < det.d.s) s.reacq++;
    else s.reacq = 1;
    s.reacqAt = { x: det.d.x };
    if (s.reacq >= TUNING.reacqFrames) {
      s.pos = { x: det.d.x, y: det.d.y };
      s.vel = { x: 0, y: 0 };
      s.filter.reset();
      s.lastSeen = -Infinity;
      s.state = 'lost';
      this.see(s, det, t, false);
      s.reacq = 0;
      takenBySlot.add(best);
      this.forgetTrack(trackOf.get(best));
      this.events.push({ type: 'back', n: s.n });
    }
  }

  /**
   * Clothes can't be told apart (dim room, dark clothes). A lost kid still comes back by themselves when exactly
   * one person has just walked in (not someone who has been in the room all along), standing, whole, about the
   * kid's size, and no other lost slot could be them. Anything less certain waits for arms out in the zone.
   */
  softReacquire(s, dets, takenBySlot, trackOf, t) {
    const lost = this.slots.filter((o) => o.state === 'lost');
    const fits = (o, det) => {
      const ratio = det.d.s / o.s;
      return ratio >= 0.6 && ratio <= 1.6;
    };
    const cands = [];
    dets.forEach((det, j) => {
      if (takenBySlot.has(j)) return;
      const tr = trackOf.get(j);
      const d = det.d;
      if (d.partial || d.posture !== 'stand' || d.quality < 0.6) return;
      if (tr && t - tr.born > 3) return;
      if (fits(s, det)) cands.push(j);
    });
    const j = cands.length === 1 && lost.filter((o) => fits(o, dets[cands[0]])).length === 1 ? cands[0] : null;
    if (j === null) {
      s.reacq = 0;
      return;
    }
    const det = dets[j];
    if (s.reacqAt && Math.abs(det.d.x - s.reacqAt.x) < det.d.s) s.reacq++;
    else s.reacq = 1;
    s.reacqAt = { x: det.d.x };
    if (s.reacq >= TUNING.reacqFrames * 2) {
      s.pos = { x: det.d.x, y: det.d.y };
      s.vel = { x: 0, y: 0 };
      s.s = det.d.s;
      s.filter.reset();
      s.lastSeen = -Infinity;
      this.see(s, det, t, false);
      s.reacq = 0;
      takenBySlot.add(j);
      this.forgetTrack(trackOf.get(j));
      this.events.push({ type: 'back', n: s.n });
    }
  }

  forgetTrack(tr) {
    if (tr) this.tracks = this.tracks.filter((o) => o !== tr);
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Minimum-cost matching of rows to columns where any row may stay unmatched (at `miss` cost). Exact
 * branch-and-bound: at most ~8 rows x 6 columns, a fraction of a millisecond.
 * @param {number[][]} cost  Infinity = not allowed
 * @param {number} miss
 * @returns {number[]} column for each row, or -1
 */
export function solve(cost, miss) {
  const R = cost.length;
  const best = { total: Infinity, pick: /** @type {number[]} */ (new Array(R).fill(-1)) };
  const pick = new Array(R).fill(-1);
  const used = new Set();
  // optimistic remaining cost per row: its cheapest option
  const floor = cost.map((row) => Math.min(miss, ...row));
  const rest = new Array(R + 1).fill(0);
  for (let i = R - 1; i >= 0; i--) rest[i] = rest[i + 1] + floor[i];
  (function go(r, total) {
    if (total + rest[r] >= best.total) return;
    if (r === R) {
      best.total = total;
      best.pick = pick.slice();
      return;
    }
    const order = cost[r].map((c, j) => [c, j]).filter(([c]) => c < miss).sort((a, b) => a[0] - b[0]);
    for (const [c, j] of order) {
      if (used.has(j)) continue;
      used.add(j);
      pick[r] = j;
      go(r + 1, total + c);
      used.delete(j);
    }
    pick[r] = -1;
    go(r + 1, total + miss);
  })(0, 0);
  return best.pick;
}
