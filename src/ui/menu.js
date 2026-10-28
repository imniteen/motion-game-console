// Menus that work four ways: a kid's hand (point and hold still over a button for a moment, like the big
// consoles), the keyboard (arrows + Enter, Esc), a tap on a touch screen, or the mouse.
import { panel, text, emoji, rr, UI } from './theme.js';
import { sfx } from '../engine/audio.js';

export const DWELL = 1.2; // seconds a hand rests on a button to press it

/**
 * @typedef {object} Button
 * @property {string} id
 * @property {number} x @property {number} y @property {number} w @property {number} h
 * @property {string} [label]
 * @property {string} [sub]      a second, smaller line
 * @property {string} [icon]     emoji
 * @property {string} [color]
 * @property {boolean} [disabled]
 * @property {boolean} [big]
 * @property {boolean} [primary]  keyboard focus starts here
 * @property {(ctx: CanvasRenderingContext2D, b: Button, focus: boolean, t: number) => void} [draw]  custom look
 */

export class Menu {
  constructor() {
    this.focus = 0;
    this.dwellId = null;
    this.dwellT = 0;
    this.awayT = 0;
    this.cool = 0;
    this.hoverId = null;
    this.usingKeys = false;
    this.pressAt = { id: null, t: -9 };
  }

  reset() {
    this.focus = 0;
    this.needFocus = true;
    this.dwellId = null;
    this.dwellT = 0;
    this.cool = 0.4;
  }

  /**
   * @param {number} dt
   * @param {Button[]} buttons
   * @param {{ cursor?: {x:number,y:number} | null, pointer?: {x:number,y:number,clicked:boolean} | null, keys?: string[], now: number }} input
   * @returns {string | null} the id of the button pressed this frame
   */
  update(dt, buttons, { cursor = null, pointer = null, keys = [], now }) {
    this.cool = Math.max(0, this.cool - dt);
    const live = buttons.filter((b) => !b.disabled);
    if (!live.length) return null;
    if (this.needFocus) {
      const main = buttons.findIndex((b) => b.primary && !b.disabled);
      this.focus = main >= 0 ? main : buttons.indexOf(live[0]);
      this.needFocus = false;
    }
    if (this.focus >= buttons.length || buttons[this.focus]?.disabled) this.focus = buttons.indexOf(live[0]);
    const hit = (p) => live.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    const press = (b) => {
      if (this.cool > 0) return null;
      this.cool = 0.5;
      this.dwellId = null;
      this.dwellT = 0;
      this.pressAt = { id: b.id, t: now };
      sfx.select();
      return b.id;
    };

    // keyboard
    for (const k of keys) {
      if (['left', 'right', 'up', 'down'].includes(k)) {
        this.usingKeys = true;
        const next = nearest(buttons[this.focus], live, k);
        if (next) {
          this.focus = buttons.indexOf(next);
          sfx.hover();
        }
      } else if (k === 'ok') {
        const b = buttons[this.focus];
        if (b && !b.disabled) return press(b);
      }
    }

    // mouse / touch
    if (pointer) {
      const b = hit(pointer);
      if (b && b.id !== this.hoverId) {
        this.hoverId = b.id;
        this.focus = buttons.indexOf(b);
        this.usingKeys = false;
      }
      if (pointer.clicked && b) return press(b);
    }

    // a kid's hand: rest on a button to press it
    if (cursor) {
      const b = hit(cursor);
      if (b) {
        this.awayT = 0;
        if (b.id !== this.dwellId) {
          this.dwellId = b.id;
          this.dwellT = 0;
          this.focus = buttons.indexOf(b);
          sfx.hover();
        }
        this.dwellT += dt;
        if (this.dwellT >= DWELL) return press(b);
      } else {
        this.awayT += dt;
        if (this.awayT > 0.25) {
          this.dwellId = null;
          this.dwellT = 0;
        }
      }
    } else {
      this.dwellId = null;
      this.dwellT = 0;
    }
    return null;
  }

  /** @param {CanvasRenderingContext2D} ctx @param {Button[]} buttons @param {number} t */
  draw(ctx, buttons, t) {
    buttons.forEach((b, i) => {
      const focus = i === this.focus;
      const pressed = this.pressAt.id === b.id && t - this.pressAt.t < 0.25;
      ctx.save();
      const scale = pressed ? 0.94 : focus ? 1.05 : 1;
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
      if (b.disabled) ctx.globalAlpha = 0.4;
      if (b.draw) b.draw(ctx, b, focus, t);
      else drawButton(ctx, b, focus);
      ctx.restore();
      if (b.id === this.dwellId && this.dwellT > 0.05) drawDwell(ctx, b, this.dwellT / DWELL);
    });
  }
}

export function drawButton(ctx, b, focus) {
  const c = b.color ?? '#4b55c9';
  ctx.save();
  if (focus) {
    ctx.shadowColor = c;
    ctx.shadowBlur = 40;
  }
  const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  g.addColorStop(0, lighten(c, 0.18));
  g.addColorStop(1, c);
  rr(ctx, b.x, b.y, b.w, b.h, Math.min(36, b.h * 0.3));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = focus ? 7 : 3;
  ctx.strokeStyle = focus ? '#fff' : 'rgba(255,255,255,0.35)';
  ctx.stroke();
  ctx.restore();
  const hasIcon = !!b.icon;
  if (b.big) {
    if (hasIcon) emoji(ctx, b.icon, b.x + b.w / 2, b.y + b.h * 0.4, Math.min(b.w, b.h) * 0.36);
    text(ctx, b.label ?? '', b.x + b.w / 2, b.y + b.h * 0.78, { size: Math.min(64, b.h * 0.15), maxW: b.w - 30 });
    if (b.sub) text(ctx, b.sub, b.x + b.w / 2, b.y + b.h * 0.91, { size: Math.min(32, b.h * 0.08), color: UI.dim, maxW: b.w - 30 });
    return;
  }
  const size = Math.min(56, b.h * 0.38);
  if (hasIcon) emoji(ctx, b.icon, b.x + b.h * 0.55, b.y + b.h / 2, b.h * 0.5);
  const x = hasIcon ? b.x + b.h * 1.0 : b.x + b.w / 2;
  const align = hasIcon ? 'left' : 'center';
  if (b.sub) {
    text(ctx, b.label ?? '', x, b.y + b.h * 0.38, { size, align, maxW: b.w - (hasIcon ? b.h * 1.1 : 30) });
    text(ctx, b.sub, x, b.y + b.h * 0.72, { size: size * 0.55, align, color: UI.dim, maxW: b.w - (hasIcon ? b.h * 1.1 : 30) });
  } else text(ctx, b.label ?? '', x, b.y + b.h / 2 + 2, { size, align, maxW: b.w - (hasIcon ? b.h * 1.1 : 30) });
}

function drawDwell(ctx, b, k) {
  ctx.save();
  rr(ctx, b.x - 8, b.y - 8, b.w + 16, b.h + 16, Math.min(44, b.h * 0.33));
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.stroke();
  // a fill that grows around the button outline
  ctx.setLineDash([k * 2 * (b.w + b.h + 32), 1e5]);
  ctx.strokeStyle = UI.accent;
  ctx.stroke();
  ctx.restore();
}

/** The kid's pointing hand, with a ring that fills while it rests on a button. */
export function drawCursor(ctx, c, color, k = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, 40, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = color;
  ctx.stroke();
  if (k > 0) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 54, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
    ctx.lineWidth = 12;
    ctx.strokeStyle = UI.accent;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
  emoji(ctx, '✋', c.x, c.y + 2, 46);
}

function nearest(from, list, dir) {
  if (!from) return list[0];
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  let best = null;
  let bestD = Infinity;
  for (const b of list) {
    if (b === from) continue;
    const dx = b.x + b.w / 2 - cx;
    const dy = b.y + b.h / 2 - cy;
    const ok = dir === 'left' ? dx < -5 : dir === 'right' ? dx > 5 : dir === 'up' ? dy < -5 : dy > 5;
    if (!ok) continue;
    const along = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const d = along + across * 2.5;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 255 * k);
  const g = Math.min(255, ((n >> 8) & 255) + 255 * k);
  const b = Math.min(255, (n & 255) + 255 * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export { panel };
