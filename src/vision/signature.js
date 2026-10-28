// A person's "signature": what colours they are wearing, as two small histograms (torso, then thighs).
// Each region has 12 hue bins weighted by saturation plus 4 brightness bins for greys/black/white, so a red
// shirt and a blue shirt are far apart and two kids in different clothes can be told apart even when they
// stand in each other's place. Computed in the pose worker from a small copy of the camera picture.
import { LM } from './landmarks.js';

export const REGION_BINS = 16;
export const SIG_BINS = REGION_BINS * 2;

/**
 * @typedef {{ bins: Float32Array, conf: number }} Signature
 *   conf: how much of the colour is real colour (not grey). Low in a dim room with dark clothes, where the
 *   signature can't be trusted to tell people apart.
 */

/**
 * Hellinger distance between two signatures, 0 (same) .. 1 (nothing in common), averaged over both regions.
 * @param {Float32Array} a @param {Float32Array} b
 */
export function sigDistance(a, b) {
  let total = 0;
  for (let r = 0; r < 2; r++) {
    let bc = 0;
    let sa = 0;
    let sb = 0;
    for (let i = r * REGION_BINS; i < (r + 1) * REGION_BINS; i++) {
      sa += a[i];
      sb += b[i];
    }
    if (sa <= 0 || sb <= 0) {
      total += 1;
      continue;
    }
    for (let i = r * REGION_BINS; i < (r + 1) * REGION_BINS; i++) bc += Math.sqrt((a[i] / sa) * (b[i] / sb));
    total += Math.sqrt(Math.max(0, 1 - bc));
  }
  return total / 2;
}

/** Running average of signatures (in place). */
export function blendSig(into, from, k) {
  for (let i = 0; i < into.length; i++) into[i] += (from[i] - into[i]) * k;
  return into;
}

/** RGB 0..255 -> [hue 0..1, sat 0..1, val 0..1] */
function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max ? d / max : 0, max / 255];
}

/**
 * Signature of one person from a small RGBA copy of the picture.
 * @param {Uint8ClampedArray} rgba  pixels of the small copy
 * @param {number} w @param {number} h  its size
 * @param {{x:number,y:number,v:number}[]} lm  landmarks normalised 0..1 in the same (unmirrored) picture
 * @returns {Signature | null}
 */
export function signatureOf(rgba, w, h, lm) {
  const bins = new Float32Array(SIG_BINS);
  let chroma = 0;
  let all = 0;
  const regions = [
    [lm[LM.shL], lm[LM.shR], lm[LM.hipR], lm[LM.hipL]],
    [lm[LM.hipL], lm[LM.hipR], lm[LM.knR], lm[LM.knL]],
  ];
  for (let r = 0; r < 2; r++) {
    const q = regions[r];
    if (q.some((p) => !p || p.v < 0.3)) continue;
    // sample a grid inside the quad, shrunk 25% towards its centre to stay off the background
    for (let a = 0.125; a < 0.9; a += 0.125) {
      for (let b = 0.125; b < 0.9; b += 0.125) {
        const top = { x: q[0].x + (q[1].x - q[0].x) * a, y: q[0].y + (q[1].y - q[0].y) * a };
        const bot = { x: q[3].x + (q[2].x - q[3].x) * a, y: q[3].y + (q[2].y - q[3].y) * a };
        const x = Math.round((top.x + (bot.x - top.x) * b) * (w - 1));
        const y = Math.round((top.y + (bot.y - top.y) * b) * (h - 1));
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const o = (y * w + x) * 4;
        const [hu, sa, va] = hsv(rgba[o], rgba[o + 1], rgba[o + 2]);
        const base = r * REGION_BINS;
        if (sa > 0.25 && va > 0.15) {
          bins[base + Math.min(11, Math.floor(hu * 12))] += sa;
          chroma += sa;
          all += sa;
        } else {
          bins[base + 12 + Math.min(3, Math.floor(va * 4))] += 1;
          all += 1;
        }
      }
    }
  }
  if (all === 0) return null;
  return { bins, conf: chroma / all };
}
