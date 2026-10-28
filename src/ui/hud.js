// The heads-up display around a game: title, the big round clock, each player's score, shared hearts, the
// pause button, and the "come back" banner for a player who left the picture.
import { PLAYER, UI, panel, text, emoji, rr, mmss, W, H } from './theme.js';

export const PAUSE_BTN = { x: W - 130, y: 24, w: 106, h: 106 };
const CLOCK_X = 690;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../engine/host.js').GameHost} host
 * @param {import('../vision/roster.js').Slot[]} slots
 * @param {number} now real seconds (for blinking)
 */
export function drawHud(ctx, host, slots, now) {
  const def = host.def;
  // title, top left
  panel(ctx, 24, 24, 470, 106, { r: 30 });
  emoji(ctx, def.icon, 82, 77, 62);
  text(ctx, def.title, 132, 77, { size: 44, align: 'left', maxW: 350 });

  // the clock, between the title and the players: big, and pulsing red in the last 10 seconds
  const left = host.timeLeft;
  const hurry = left <= host.rushSec && left > 0;
  const pulse = hurry ? 1 + 0.08 * Math.max(0, Math.sin(now * Math.PI * 2)) : 1;
  ctx.save();
  ctx.translate(CLOCK_X, 77);
  ctx.scale(pulse, pulse);
  panel(ctx, -150, -53, 300, 106, { r: 53, fill: hurry ? 'rgba(160, 20, 50, 0.92)' : UI.panel });
  emoji(ctx, '⏱️', -95, 2, 52);
  text(ctx, mmss(left), 30, 4, { size: 66, color: hurry ? '#fff' : UI.accent });
  ctx.restore();
  // a thin bar of the round so far
  const k = Math.min(1, host.t / host.roundSec);
  rr(ctx, CLOCK_X - 150, 142, 300, 12, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fill();
  rr(ctx, CLOCK_X - 150, 142, 300 * (1 - k), 12, 6);
  ctx.fillStyle = hurry ? UI.bad : UI.good;
  ctx.fill();

  // shared hearts under the clock
  if (def.hearts) {
    for (let i = 0; i < def.hearts; i++) emoji(ctx, i < host.hearts ? '❤️' : '🤍', CLOCK_X - ((def.hearts - 1) * 50) / 2 + i * 50, 190, 42);
  }

  // pause button, top right
  panel(ctx, PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h, { r: 30 });
  ctx.fillStyle = '#fff';
  rr(ctx, PAUSE_BTN.x + 32, PAUSE_BTN.y + 28, 14, 50, 5);
  ctx.fill();
  rr(ctx, PAUSE_BTN.x + 60, PAUSE_BTN.y + 28, 14, 50, 5);
  ctx.fill();

  // player chips, along the top right
  const players = slots.filter((s) => s.state !== 'empty');
  players.forEach((s, i) => {
    const look = PLAYER[s.n - 1];
    const x = W - 146 - (players.length - i) * 196;
    const y = 24;
    const flash = host.flash.get(s.n);
    const red = flash && host.t < flash.until;
    panel(ctx, x, y, 186, 106, { r: 30, fill: red ? 'rgba(200,40,60,0.95)' : look.color, edge: '#fff' });
    text(ctx, look.name, x + 93, y + 30, { size: 26, color: look.light, stroke: look.dark });
    text(ctx, String(host.scores.get(s.n) ?? 0), x + 93, y + 72, { size: 52 });
    if (s.state === 'lost' || s.state === 'held') {
      ctx.save();
      ctx.globalAlpha = 0.55;
      rr(ctx, x, y, 186, 106, 30);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
      emoji(ctx, s.state === 'lost' ? '👀' : '⏸️', x + 93, y + 55, 50);
    }
  });

  // the final rush: glowing edges the whole time, and a big banner when it starts
  if (hurry) drawRush(ctx, host, now);

  // floating points and sparkles
  for (const p of host.fx.parts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const p of host.fx.pops) {
    const s = p.age < 0.15 ? 0.6 + (p.age / 0.15) * 0.6 : 1.2 - Math.min(0.2, (p.age - 0.15) * 0.4);
    text(ctx, p.label, p.x, p.y, { size: 56 * s, color: p.color, alpha: Math.min(1, (1.1 - p.age) * 3) });
  }
}

/** Banner for players the camera can't find: where to stand and what to do to come back. */
export function drawLost(ctx, slots, now) {
  const lost = slots.filter((s) => s.state === 'lost');
  lost.forEach((s, i) => {
    const look = PLAYER[s.n - 1];
    // their spot on the floor glows
    const z = s.zone;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now * 5);
    const g = ctx.createLinearGradient(0, H - 160, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, look.color);
    ctx.fillStyle = g;
    ctx.fillRect(z.x0, H - 160, z.x1 - z.x0, 160);
    ctx.restore();
    const y = H - 150 - i * 120;
    panel(ctx, W / 2 - 520, y - 50, 1040, 100, { fill: 'rgba(255,255,255,0.95)', edge: look.color });
    emoji(ctx, '👋', W / 2 - 460, y, 56);
    text(ctx, `${look.name} player, come back! Stand in your spot, arms out.`, W / 2 + 30, y + 2, { size: 38, color: look.dark, stroke: null, maxW: 900 });
  });
}

/** Small live camera picture in the corner, with only the players outlined (in their colours). */
export function drawPreview(ctx, video, slots, roster) {
  if (!video || video.readyState < 2) return;
  const w = 320;
  const h = 180;
  const x = 24;
  const y = H - h - 24;
  ctx.save();
  rr(ctx, x, y, w, h, 18);
  ctx.clip();
  ctx.translate(x + w, y);
  ctx.scale(-1, 1); // a mirror, like the game
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sc = Math.max(w / vw, h / vh);
  ctx.drawImage(video, (w - vw * sc) / 2, (h - vh * sc) / 2, vw * sc, vh * sc);
  ctx.restore();
  // outline the players (the game canvas maps 1:1 to this little window, scaled)
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / W, h / H);
  for (const s of slots) {
    if (!s.present || !s.px) continue;
    ctx.strokeStyle = PLAYER[s.n - 1].color;
    ctx.lineWidth = 14;
    const xs = s.px.filter((p) => p.v > 0.4).map((p) => p.x);
    const ys = s.px.filter((p) => p.v > 0.4).map((p) => p.y);
    if (!xs.length) continue;
    rr(ctx, Math.min(...xs) - 30, Math.min(...ys) - 60, Math.max(...xs) - Math.min(...xs) + 60, Math.max(...ys) - Math.min(...ys) + 90, 30);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  rr(ctx, x, y, w, h, 18);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.stroke();
  ctx.restore();
}

function drawRush(ctx, host, now) {
  const glow = 0.35 + 0.25 * Math.sin(now * Math.PI * 4);
  ctx.save();
  for (const [x0, y0, x1, y1, x, y, w, h] of [
    [0, 0, 0, 60, 0, 0, W, 60],
    [0, H, 0, H - 60, 0, H - 60, W, 60],
    [0, 0, 60, 0, 0, 0, 60, H],
    [W, 0, W - 60, 0, W - 60, 0, 60, H],
  ]) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(255, 90, 40, ${glow})`);
    g.addColorStop(1, 'rgba(255, 90, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  const age = host.rushAt === undefined ? 99 : host.t - host.rushAt;
  if (age < 2.6) {
    const k = Math.min(1, age / 0.2, (2.6 - age) / 0.3);
    const s = 0.8 + 0.2 * Math.min(1, age / 0.25) + 0.04 * Math.sin(now * 20);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(W / 2, H * 0.52); // below the coach's tip card
    ctx.scale(s, s);
    panel(ctx, -560, -95, 1120, 190, { r: 40, fill: 'rgba(220, 60, 20, 0.95)', edge: '#ffd23f' });
    text(ctx, `⚡ FINAL ${Math.round(host.rushSec)} SECONDS! ⚡`, 0, -25, { size: 78, color: '#fff' });
    text(ctx, 'Faster, faster!', 0, 52, { size: 46, color: '#ffe66d' });
    ctx.restore();
  }
}
