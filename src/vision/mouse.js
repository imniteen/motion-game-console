// Mouse mode: a pretend kid for when there is no camera (or for development). The mouse moves them, keys
// make the moves, and their body goes through exactly the same tracking as a real one.
//   move the mouse: walk left/right; above the shoulders the right hand reaches for the pointer
//   click or J: jump      D (hold): duck        A (hold): arms out (airplane)   U (hold): arms up
//   H (hold): hands on head   F (hold): flap    T: throw (arm pump)            W (hold): wave/dance
//   K (hold): high knees      C (hold): arm circles    S (hold): star jumps   (D down + let go = a squat)
// Extra pretend kids (?bots=N) stand in a row and copy the same moves, so several players can be tried.
import { synthSkeleton, synthSig, ARM } from './synth.js';
import { MOVES } from '../moves.js';

const MOUSE_SW = 72; // the pretend kid's size: about how big a kid 2-3 m from the camera looks
const MOUSE_HIP = 740; // so their feet are on the game's floor line

export class MouseSource {
  /** @param {HTMLCanvasElement} canvas @param {(dets: any[], t: number) => void} onPeople */
  constructor(canvas, onPeople, { bots = 0 } = {}) {
    this.canvas = canvas;
    this.onPeople = onPeople;
    this.x = 960;
    this.y = 600;
    this.keys = new Set();
    this.jumpAt = -9;
    this.duck = 0; // eased, like a real kid going down and up
    this.throwAt = -9;
    this.bots = bots;
    this.botX = Array.from({ length: bots }, (_, i) => ((i + 1) * 1920) / (bots + 2)); // where each extra kid stands
    this.engine = 'mouse';
    this.status = 'running';
    this.fps = 30;
    this.roundTrip = 0;
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.x = ((e.clientX - r.left) / r.width) * 1920;
      this.y = ((e.clientY - r.top) / r.height) * 1080;
    });
    canvas.addEventListener('pointerdown', () => (this.jumpAt = performance.now() / 1000));
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'j') this.jumpAt = performance.now() / 1000;
      if (k === 't') this.throwAt = performance.now() / 1000;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  start() {
    this.timer = setInterval(() => this.tick(), 1000 / 30);
    return Promise.resolve();
  }

  setNumPoses() {}

  /** The pose the keys ask for, at time t. */
  pose(t, x, reach) {
    const k = this.keys;
    const sw = MOUSE_SW;
    const hipY = MOUSE_HIP;
    /** @type {any} */
    let p = { x, hipY, sw, armL: ARM.down, armR: ARM.down };
    if (k.has('a')) p = { ...p, armL: ARM.out, armR: ARM.out };
    if (k.has('u')) p = { ...p, armL: ARM.up, armR: ARM.up };
    if (k.has('h')) p = { ...p, armL: 'head', armR: 'head' };
    if (k.has('f')) p = { ...p, ...MOVES.flap.pose(t) };
    if (k.has('w')) p = { ...p, ...MOVES.dance.pose(t) };
    if (k.has('k')) p = { ...p, ...MOVES.run.pose(t) };
    if (k.has('c')) p = { ...p, ...MOVES.circle.pose(t) };
    if (k.has('s')) p = { ...p, ...MOVES.jacks.pose(t) };
    this.duck += ((k.has('d') ? 1 : 0) - this.duck) * 0.25;
    if (this.duck > 0.02) p = { ...p, duck: this.duck };
    const tj = t - this.jumpAt;
    if (tj >= 0 && tj < 0.55) p = { ...p, lift: Math.sin((tj / 0.55) * Math.PI) * 1.2, armL: ARM.up - 0.5, armR: ARM.up - 0.5 };
    const tt = t - this.throwAt;
    if (tt >= 0 && tt < 0.25) p = { ...p, armR: ARM.down };
    else if (tt >= 0.25 && tt < 0.6) p = { ...p, armR: ARM.up };
    if (reach && p.armR === ARM.down && !k.size) p = { ...p, armR: { x: this.x, y: this.y } };
    return p;
  }

  tick() {
    const t = performance.now() / 1000;
    const x = Math.max(120, Math.min(1800, this.x));
    const reach = this.y < MOUSE_HIP - 1.9 * MOUSE_SW + 40; // pointer above the shoulders
    const dets = [{ px: synthSkeleton(this.pose(t, x, reach)), sig: synthSig(0) }];
    for (let i = 0; i < this.bots; i++) {
      const bx = this.botX[i];
      if (bx < 0) continue; // stepped out of the picture
      dets.push({ px: synthSkeleton(this.pose(t, bx, false)), sig: synthSig(3 + i * 3) });
    }
    this.onPeople(dets, t);
  }
}
