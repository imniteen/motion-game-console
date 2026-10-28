// Synthetic skeletons: a believable kid's 33 landmarks from a few simple controls. Used by mouse mode (the
// mouse is a player), by the game bots in tests, and by the unit tests of the tracking. Everything is in
// shoulder widths (sw) around the hip centre, so the same pose works at any size.
import { LM, COUNT } from './landmarks.js';

/**
 * An arm is a straight-ish line from the shoulder. Its angle is measured from pointing straight down (0)
 * swinging outward: PI/2 is straight out to the side, PI is straight up.
 * @typedef {number | 'head' | { x: number, y: number }} ArmSpec  angle, hand on head, or reach to a point (px)
 *
 * @typedef {object} SynthPose
 * @property {number} x          hip centre x (px)
 * @property {number} hipY       hip centre y when standing (px)
 * @property {number} sw         shoulder width (px)
 * @property {ArmSpec} [armL]    the arm on the screen's left
 * @property {ArmSpec} [armR]    the arm on the screen's right
 * @property {number} [duck]     0..1 how far down the kid is crouching
 * @property {number} [lift]     how far the whole body is off the ground (a jump), in sw
 * @property {boolean} [seated]  sitting on a chair or sofa
 * @property {number} [vis]      visibility of every point (default 0.95)
 * @property {number} [lean]     sideways lean of the upper body, in sw
 * @property {number} [bend]     0..1 how bent the elbows are (forearms fold up towards the head)
 * @property {number} [kneeL]    0..1 how high the left knee is lifted (marching); [kneeR] the right
 * @property {number} [kneeR]
 * @property {number} [stance]   how far apart the feet are, extra on each side, in sw (star jumps)
 */

export const ARM = { down: 0.15, out: Math.PI / 2, up: Math.PI - 0.2 };

/** Ready-made arm pairs for the named poses. */
export const POSES = {
  stand: { armL: ARM.down, armR: ARM.down },
  armsUp: { armL: ARM.up, armR: ARM.up },
  airplane: { armL: ARM.out, armR: ARM.out },
  handsHead: { armL: /** @type {const} */ ('head'), armR: /** @type {const} */ ('head') },
};

/**
 * @param {SynthPose} p
 * @returns {{ x: number, y: number, v: number }[]}
 */
export function synthSkeleton(p) {
  const sw = p.sw;
  const v = p.vis ?? 0.95;
  const duck = Math.max(0, Math.min(1, p.duck ?? 0));
  const lift = (p.lift ?? 0) * sw;
  const lean = (p.lean ?? 0) * sw;
  const out = Array.from({ length: COUNT }, () => ({ x: p.x, y: p.hipY, v: 0.2 }));
  const put = (i, x, y, vis = v) => (out[i] = { x, y, v: vis });

  // Crouching lowers the hips and bends the knees; jumping lifts everything.
  const hipY = p.hipY - lift + duck * 1.3 * sw;
  const hx = p.x;
  const shY = hipY - 1.9 * sw;
  const shX = hx + lean;
  const noseY = shY - 0.95 * sw;

  put(LM.hipL, hx - 0.35 * sw, hipY);
  put(LM.hipR, hx + 0.35 * sw, hipY);
  if (p.seated) {
    // thighs forward and level with the hips, shins straight down
    put(LM.knL, hx - 0.35 * sw + 0.15 * sw, hipY + 0.15 * sw);
    put(LM.knR, hx + 0.35 * sw + 0.15 * sw, hipY + 0.15 * sw);
    put(LM.anL, hx - 0.3 * sw, hipY + 1.2 * sw);
    put(LM.anR, hx + 0.4 * sw, hipY + 1.2 * sw);
  } else {
    const floor = p.hipY + 2.2 * sw - lift; // feet stay on the floor when crouching, leave it when jumping
    const kneeOut = duck * 0.45 * sw;
    const kneeY = (hipY + floor) / 2;
    const st = (p.stance ?? 0) * sw;
    for (const [side, kn, an, k] of /** @type {const} */ ([
      [-1, LM.knL, LM.anL, p.kneeL ?? 0],
      [1, LM.knR, LM.anR, p.kneeR ?? 0],
    ])) {
      // a lifted knee comes up towards hip height (seen from the front), the foot hangs under it
      const footX = hx + side * (0.35 * sw + st);
      const kx = hx + side * (0.35 * sw + kneeOut + st / 2);
      const ky = kneeY + (hipY + 0.15 * sw - kneeY) * k;
      put(kn, kx, ky);
      put(an, footX, k > 0 ? ky + 1.0 * sw : floor);
    }
  }
  put(LM.ftL, out[LM.anL].x - 0.1 * sw, out[LM.anL].y + 0.12 * sw);
  put(LM.ftR, out[LM.anR].x + 0.1 * sw, out[LM.anR].y + 0.12 * sw);

  put(LM.shL, shX - 0.5 * sw, shY);
  put(LM.shR, shX + 0.5 * sw, shY);
  put(LM.nose, shX, noseY);
  put(LM.eyeL, shX - 0.15 * sw, noseY - 0.12 * sw);
  put(LM.eyeR, shX + 0.15 * sw, noseY - 0.12 * sw);
  put(LM.earL, shX - 0.33 * sw, noseY - 0.05 * sw);
  put(LM.earR, shX + 0.33 * sw, noseY - 0.05 * sw);

  arm(out, put, -1, p.armL ?? ARM.down, sw, { x: shX - 0.5 * sw, y: shY }, { x: shX, y: noseY }, v, p.bend ?? 0);
  arm(out, put, 1, p.armR ?? ARM.down, sw, { x: shX + 0.5 * sw, y: shY }, { x: shX, y: noseY }, v, p.bend ?? 0);
  return out;
}

function arm(out, put, side, spec, sw, sh, nose, v, bend) {
  const el = side < 0 ? LM.elL : LM.elR;
  const wr = side < 0 ? LM.wrL : LM.wrR;
  const idx = side < 0 ? LM.idxL : LM.idxR;
  let wx;
  let wy;
  if (spec === 'head') {
    wx = nose.x + side * 0.28 * sw;
    wy = nose.y - 0.15 * sw;
    put(el, sh.x + side * 0.75 * sw, sh.y - 0.35 * sw, v);
  } else if (typeof spec === 'object') {
    // reach for a point, but an arm is only so long
    const dx = spec.x - sh.x;
    const dy = spec.y - sh.y;
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.min(len, 1.45 * sw);
    wx = sh.x + (dx / len) * reach;
    wy = sh.y + (dy / len) * reach;
    put(el, (sh.x + wx) / 2 + side * 0.08 * sw, (sh.y + wy) / 2 + 0.05 * sw, v);
  } else {
    // angle from straight down, swinging outward on this side; a bent elbow folds the forearm up
    const ax = Math.sin(spec) * side;
    const ay = Math.cos(spec);
    const ex = sh.x + ax * 0.75 * sw;
    const ey = sh.y + ay * 0.75 * sw;
    put(el, ex, ey, v);
    const r = -side * bend * 1.7;
    const fx = ax * Math.cos(r) - ay * Math.sin(r);
    const fy = ax * Math.sin(r) + ay * Math.cos(r);
    wx = ex + fx * 0.7 * sw;
    wy = ey + fy * 0.7 * sw;
  }
  put(wr, wx, wy, v);
  put(idx, wx + (wx - out[el].x) * 0.25, wy + (wy - out[el].y) * 0.25, v);
}

/**
 * A clothing signature for a synthetic person (tests and mouse mode): a shirt colour and a trousers colour.
 * Different `shirt` numbers never look alike. conf < 0.4 imitates a dim room with dark clothes.
 * @param {number} shirt  0..11 hue bin of the top
 * @param {number} [trousers]  0..11 hue bin of the bottom
 * @param {number} [conf]
 * @returns {import('./signature.js').Signature}
 */
export function synthSig(shirt, trousers = (shirt + 5) % 12, conf = 0.8) {
  const bins = new Float32Array(32);
  bins[shirt % 12] = 0.8;
  bins[(shirt + 1) % 12] = 0.2;
  bins[16 + (trousers % 12)] = 0.8;
  bins[16 + 13] = 0.2;
  return { bins, conf };
}
