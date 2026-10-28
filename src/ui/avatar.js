// The players' cartoon characters, drawn from the tracked skeleton (33 landmarks in screen px). Each player is
// a chunky little creature in their colour (cat, bear, bunny, fox ears), with a face that looks the way the
// head turns, blinks, and pulls faces: a big smile when scoring, an "O" when jumping, a wince when bonked.
import { LM } from '../vision/landmarks.js';
import { PLAYER, text } from './theme.js';

/** @typedef {{x:number,y:number,v:number}} Pt */

const P = (px, i) => px[i];
const GHOST = { color: '#c8cbe8', dark: '#6b6f99', light: '#eef0ff', name: '', ears: 'bear' };
// slot 0: the teacher who shows the moves (How-to card, dancers), so they never look like one of the players
const TEACHER = { color: '#a37bff', dark: '#5b3aa8', light: '#e8dcff', name: 'Coach', ears: 'bunny' };
const avg = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });

function limb(ctx, pts, w, color, edge) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = edge;
  ctx.lineWidth = w + 8;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

function dot(ctx, p, r, color, edge) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Pt[]} px
 * @param {{ slot?: number, alpha?: number, face?: 'smile'|'o'|'ouch'|'sleep', t?: number, badge?: boolean, minS?: number, label?: string, ghost?: boolean }} [o]
 *   ghost: someone who isn't a player yet (claim screen): a faint grey shape
 */
export function drawAvatar(ctx, px, o = {}) {
  const look = o.ghost ? GHOST : o.slot === 0 ? TEACHER : PLAYER[(o.slot ?? 1) - 1] ?? PLAYER[0];
  if (o.ghost) o = { ...o, alpha: 0.35, badge: false };
  const t = o.t ?? performance.now() / 1000;
  const shL = P(px, LM.shL);
  const shR = P(px, LM.shR);
  const hipL = P(px, LM.hipL);
  const hipR = P(px, LM.hipR);
  const sh = avg(shL, shR);
  const hip = avg(hipL, hipR);
  const s = Math.max(o.minS ?? 30, Math.hypot(shL.x - shR.x, shL.y - shR.y), 0.55 * Math.hypot(sh.x - hip.x, sh.y - hip.y));
  const limbW = 0.36 * s;
  const color = look.color;
  const edge = look.dark;

  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;

  // Limbs we can't see hang down calmly instead of flailing.
  const seen = (p, anchor, dx, dy) => (p && p.v > 0.45 ? p : { x: anchor.x + dx * s, y: anchor.y + dy * s, v: 1 });

  // legs
  for (const [h, k, a, f, side] of [
    [hipL, LM.knL, LM.anL, LM.ftL, -1],
    [hipR, LM.knR, LM.anR, LM.ftR, 1],
  ]) {
    const knee = seen(P(px, k), h, side * 0.05, 1.0);
    const ankle = seen(P(px, a), knee, 0, 1.0);
    limb(ctx, [h, knee, ankle], limbW * 1.15, color, edge);
    // shoe
    ctx.save();
    ctx.translate(ankle.x + side * 0.12 * s, ankle.y + 0.08 * s);
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.32 * s, 0.17 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = edge;
    ctx.fill();
    ctx.restore();
  }

  // body: a soft bean from the shoulders to the hips
  const bw = Math.max(0.62 * s, Math.abs(shR.x - shL.x) * 0.62);
  ctx.beginPath();
  ctx.ellipse((sh.x + hip.x) / 2, (sh.y + hip.y) / 2, bw, Math.max(0.6 * s, Math.hypot(sh.x - hip.x, sh.y - hip.y) * 0.62), Math.atan2(hip.x - sh.x, sh.y - hip.y), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = edge;
  ctx.stroke();
  // belly patch with the player number
  const belly = { x: sh.x + (hip.x - sh.x) * 0.55, y: sh.y + (hip.y - sh.y) * 0.55 };
  ctx.beginPath();
  ctx.ellipse(belly.x, belly.y, bw * 0.55, Math.max(0.35 * s, Math.hypot(sh.x - hip.x, sh.y - hip.y) * 0.32), 0, 0, Math.PI * 2);
  ctx.fillStyle = look.light;
  ctx.fill();
  if (o.badge !== false) text(ctx, String(o.slot ?? 1), belly.x, belly.y + 2, { size: 0.42 * s, color: edge, stroke: null });

  // arms
  for (const [shp, e, w, side] of [
    [shL, LM.elL, LM.wrL, -1],
    [shR, LM.elR, LM.wrR, 1],
  ]) {
    const elbow = seen(P(px, e), shp, side * 0.15, 0.75);
    const wrist = seen(P(px, w), elbow, side * 0.05, 0.7);
    limb(ctx, [shp, elbow, wrist], limbW, color, edge);
    dot(ctx, wrist, 0.24 * s, look.light, edge);
  }

  // head: centred between the ears (or just above the nose), big and round
  const nose = P(px, LM.nose);
  const eL = P(px, LM.earL);
  const eR = P(px, LM.earR);
  const ears = eL.v > 0.4 && eR.v > 0.4;
  const hc = ears ? { x: (eL.x + eR.x) / 2, y: (eL.y + eR.y) / 2 - 0.05 * s } : { x: nose.x, y: nose.y - 0.15 * s };
  // the head never floats off the shoulders
  const neckMax = 1.2 * s;
  const dn = Math.hypot(hc.x - sh.x, hc.y - sh.y);
  if (dn > neckMax) {
    hc.x = sh.x + ((hc.x - sh.x) * neckMax) / dn;
    hc.y = sh.y + ((hc.y - sh.y) * neckMax) / dn;
  }
  const hr = Math.max(0.6 * s, ears ? Math.hypot(eL.x - eR.x, eL.y - eR.y) * 0.85 : 0);
  const tilt = ears ? Math.atan2(eR.y - eL.y, eR.x - eL.x) : 0;
  ctx.save();
  ctx.translate(hc.x, hc.y);
  ctx.rotate(tilt);
  drawEars(ctx, look, hr);
  ctx.beginPath();
  ctx.arc(0, 0, hr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = edge;
  ctx.stroke();
  // face patch, shifted the way the nose points
  const turn = ears ? Math.max(-1, Math.min(1, (nose.x - hc.x) / (hr * 0.8))) : 0;
  ctx.beginPath();
  ctx.ellipse(turn * hr * 0.18, hr * 0.15, hr * 0.68, hr * 0.62, 0, 0, Math.PI * 2);
  ctx.fillStyle = look.light;
  ctx.fill();
  drawFace(ctx, hr, turn, o.face ?? 'smile', t, o.slot ?? 1);
  ctx.restore();

  if (o.label) text(ctx, o.label, hc.x, hc.y - hr * 1.9, { size: Math.max(28, 0.45 * s), color: look.color });
  ctx.restore();
  return { head: hc, hr, s };
}

function drawEars(ctx, look, r) {
  ctx.fillStyle = look.color;
  ctx.strokeStyle = look.dark;
  ctx.lineWidth = 5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    if (look.ears === 'cat') {
      ctx.moveTo(side * r * 0.25, -r * 0.85);
      ctx.lineTo(side * r * 0.85, -r * 1.25);
      ctx.lineTo(side * r * 0.9, -r * 0.4);
    } else if (look.ears === 'bear') {
      ctx.arc(side * r * 0.72, -r * 0.72, r * 0.36, 0, Math.PI * 2);
    } else if (look.ears === 'bunny') {
      ctx.ellipse(side * r * 0.42, -r * 1.25, r * 0.22, r * 0.6, side * 0.15, 0, Math.PI * 2);
    } else {
      ctx.moveTo(side * r * 0.2, -r * 0.9);
      ctx.quadraticCurveTo(side * r * 0.95, -r * 1.45, side * r * 0.95, -r * 0.35);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawFace(ctx, r, turn, face, t, seed) {
  const ex = turn * r * 0.25;
  const blink = (t * 0.37 + seed * 0.21) % 4 < 0.12;
  ctx.fillStyle = '#1b1b2f';
  for (const side of [-1, 1]) {
    const x = ex + side * r * 0.28;
    const y = -r * 0.05;
    if (face === 'ouch' || face === 'sleep' || blink) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1b1b2f';
      ctx.beginPath();
      if (face === 'ouch') {
        ctx.moveTo(x - r * 0.1, y - r * 0.08);
        ctx.lineTo(x + r * 0.1, y + r * 0.08);
        ctx.moveTo(x + r * 0.1, y - r * 0.08);
        ctx.lineTo(x - r * 0.1, y + r * 0.08);
      } else {
        ctx.moveTo(x - r * 0.1, y);
        ctx.lineTo(x + r * 0.1, y);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.11, r * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + r * 0.04, y - r * 0.05, r * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1b2f';
    }
  }
  // cheeks
  ctx.fillStyle = 'rgba(255, 120, 150, 0.45)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(ex + side * r * 0.45, r * 0.22, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#1b1b2f';
  ctx.fillStyle = '#7a2440';
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (face === 'o') {
    ctx.ellipse(ex, r * 0.33, r * 0.12, r * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (face === 'ouch') {
    ctx.moveTo(ex - r * 0.18, r * 0.38);
    ctx.quadraticCurveTo(ex, r * 0.25, ex + r * 0.18, r * 0.38);
    ctx.stroke();
  } else {
    ctx.arc(ex, r * 0.22, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}
