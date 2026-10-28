// Helpers for writing games. A game is a plain object (see games/README.md for the full contract):
//
//   export default {
//     id, title, icon, color,            // card + HUD
//     moves: ['wave'],                   // move ids from src/moves.js; the first is shown on the How-to card
//     howto: ['line 1', 'line 2'],       // 2-3 short sentences a 5-year-old understands (also read out loud)
//     layout: 'shared' | 'columns',      // everyone in one world, or one lane per player
//     hearts: 0,                         // > 0: the team shares this many hearts; losing them all ends the round
//     stars: [10, 25, 45],               // points one player needs in a 2-minute round for 1, 2, 3 stars
//     create(ctx) {                      // a fresh round; returns the round's update/draw
//       return {
//         update(dt, players) {},        // dt game seconds; players = PlayerView[] currently in the game
//         drawBack(g, players) {},       // behind the avatars (the world)
//         drawFront(g, players) {},      // in front of the avatars (things flying at them)
//         needs(n) { return 'wave' },    // optional: what player n should be doing now (coach), or null
//       };
//     },
//   };
//
// ctx: { W, H, floorY, roundSec, t() game seconds, progress() 0..1, level() difficulty multiplier ~0.7..2,
//        rng(), lane(n) {x0,x1,cx,w}, sfx, report, fx }
// report: score(n, pts, x, y, label?) | miss(n, move, x?, y?, label?) | good(n, x?, y?, label?) | hit(n?, x?, y?)
//         | end(message)   -- every score/miss goes through report so the HUD, coach and results stay generic.

/** Seeded random numbers, so a round can be replayed exactly in tests. */
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export const rand = (rng, a, b) => a + rng() * (b - a);
export const pick = (rng, list) => list[Math.floor(rng() * list.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Is any of this player's hands touching the circle? Returns the hand or null. */
export function handTouch(p, x, y, r) {
  for (const h of p.hands) if (h.seen && Math.hypot(h.x - x, h.y - y) < r + h.r) return h;
  return null;
}

/** Does the circle touch the player's body (head or torso)? */
export function bodyTouch(p, x, y, r) {
  if (Math.hypot(p.head.x - x, p.head.y - y) < r + p.head.r) return true;
  const tx = (p.sh.x + p.hip.x) / 2;
  const ty = (p.sh.y + p.hip.y) / 2;
  return Math.abs(x - tx) < r + 0.7 * p.s && Math.abs(y - ty) < r + 1.1 * p.s;
}

/** The player's body as a vertical span on the floor (for things rolling along the ground). */
export function footSpan(p) {
  return { x0: p.hip.x - 0.7 * p.s, x1: p.hip.x + 0.7 * p.s };
}

/** Draws a soft round "thing" with a shine (bubbles, balls, stars' glow). */
export function shinyBall(g, x, y, r, color, alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, color);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A warning "!" sign that pulses above where something is about to come. */
export function warning(g, x, y, t, size = 70) {
  const k = 1 + 0.12 * Math.sin(t * 18);
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.beginPath();
  g.moveTo(0, -size * 0.6);
  g.lineTo(size * 0.55, size * 0.4);
  g.lineTo(-size * 0.55, size * 0.4);
  g.closePath();
  g.fillStyle = '#ffd23f';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#7a2b00';
  g.stroke();
  g.fillStyle = '#7a2b00';
  g.font = `900 ${size * 0.6}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 0, size * 0.08);
  g.restore();
}

/** Sky-to-ground gradient background helper. */
export function sky(g, W, H, top, bottom) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

/** Checks a game definition (used by the tests and at start-up). Returns a list of problems. */
export function checkGame(def, moves) {
  const errs = [];
  for (const k of ['id', 'title', 'icon', 'color']) if (typeof def[k] !== 'string' || !def[k]) errs.push(`${k} missing`);
  if (!Array.isArray(def.moves) || !def.moves.length) errs.push('moves missing');
  else for (const m of def.moves) if (!moves[m]) errs.push(`unknown move ${m}`);
  if (!Array.isArray(def.howto) || def.howto.length < 1 || def.howto.length > 3) errs.push('howto needs 1-3 lines');
  if (!['shared', 'columns'].includes(def.layout)) errs.push('layout must be shared or columns');
  if (!Array.isArray(def.stars) || def.stars.length !== 3 || !(def.stars[0] < def.stars[1] && def.stars[1] < def.stars[2])) errs.push('stars must be 3 rising numbers');
  if (typeof def.create !== 'function') errs.push('create missing');
  return errs;
}
