// Drawing the coach's tip: a card at the top of the screen in the player's colour, with a little character
// doing the move, the player's name and what to do. Also the big demo on the How-to card.
import { MOVES } from '../moves.js';
import { synthSkeleton } from '../vision/synth.js';
import { drawAvatar } from './avatar.js';
import { PLAYER, panel, text, emoji, W } from './theme.js';

/** A character doing a move, centred on (cx, floorY) with shoulder width `sw`. */
export function drawDemo(ctx, moveId, t, cx, floorY, sw, slot = 1) {
  const m = MOVES[moveId] ?? MOVES.jump;
  const p = m.pose(t);
  const hipY = floorY - 2.2 * sw;
  const px = synthSkeleton({ x: cx + (p.dx ?? 0) * sw, hipY, sw, ...p, vis: 1 });
  const face = p.lift && p.lift > 0.3 ? 'o' : 'smile';
  // a soft shadow on the floor
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx + (p.dx ?? 0) * sw, floorY + 0.15 * sw, 1.1 * sw * (1 - Math.min(0.5, (p.lift ?? 0) * 0.3)), 0.22 * sw, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawAvatar(ctx, px, { slot, t, face, badge: false });
}

/**
 * The tip card.
 * @param {{ n: number, move: string, at: number, until: number, praised?: number }} tip
 * @param {number} t game time
 */
export function drawTip(ctx, tip, t) {
  const look = PLAYER[tip.n - 1];
  const age = t - tip.at;
  const left = tip.until - t;
  const k = Math.min(1, age / 0.25, left / 0.25);
  if (k <= 0) return;
  const w = 980;
  const h = 250;
  const x = (W - w) / 2;
  const y = 18 - (1 - k) * 280;
  ctx.save();
  panel(ctx, x, y + 96, w, h, { fill: 'rgba(255,255,255,0.95)', edge: look.color });
  ctx.lineWidth = 10;
  // the character doing the move, on the left
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 20, y + 100, 240, h - 8);
  ctx.clip();
  drawDemo(ctx, tip.move, age, x + 140, y + 96 + h - 18, 33, tip.n);
  ctx.restore();
  const m = MOVES[tip.move];
  if (tip.praised) {
    emoji(ctx, '🌟', x + 340, y + 96 + h / 2, 90);
    text(ctx, `Great, ${look.name}!`, x + 400, y + 96 + h / 2, { size: 72, align: 'left', color: '#1f8a4c', stroke: null });
  } else {
    text(ctx, `${look.name} player:`, x + 300, y + 96 + 62, { size: 46, align: 'left', color: look.dark, stroke: null });
    wrap(ctx, m?.tell ?? 'Try this!', x + 300, y + 96 + 130, w - 330, 52, '#1b1b3a');
  }
  ctx.restore();
}

/** Simple word-wrapped dark text (two lines max). */
export function wrap(ctx, s, x, y, maxW, size, color, align = 'left') {
  ctx.save();
  ctx.font = `800 ${size}px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`;
  const words = s.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  lines.push(line);
  ctx.restore();
  lines.slice(0, 3).forEach((l, i) => text(ctx, l, x, y + i * size * 1.15, { size, align, color, stroke: null }));
  return lines.length;
}
