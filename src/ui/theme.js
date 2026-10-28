// Colours, fonts and small drawing helpers shared by every screen. The canvas is always 1920x1080; the page
// scales it to the TV.
export const W = 1920;
export const H = 1080;

export const PLAYER = [
  { color: '#ff5d73', dark: '#b8304a', light: '#ffc2cc', name: 'Red', ears: 'cat' },
  { color: '#3fb6ff', dark: '#1f6fae', light: '#bfe6ff', name: 'Blue', ears: 'bear' },
  { color: '#ffc93c', dark: '#b8860b', light: '#fff0bf', name: 'Yellow', ears: 'bunny' },
  { color: '#5ee08a', dark: '#24955a', light: '#c9f7d7', name: 'Green', ears: 'fox' },
];

export const UI = {
  bg0: '#0d1033',
  bg1: '#24135f',
  panel: 'rgba(20, 22, 60, 0.86)',
  panelEdge: 'rgba(255,255,255,0.18)',
  text: '#ffffff',
  dim: '#b9c0ff',
  accent: '#ffd23f',
  good: '#5ee08a',
  bad: '#ff5d73',
  font: '"Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif',
};

/** Rounded rectangle path. */
export function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/**
 * Big friendly text with an outline so it reads on any background.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} s
 * @param {{ size?: number, color?: string, align?: CanvasTextAlign, base?: CanvasTextBaseline, stroke?: string | null, weight?: number, alpha?: number, maxW?: number }} [o]
 */
export function text(ctx, s, x, y, o = {}) {
  const size = o.size ?? 48;
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.font = `${o.weight ?? 800} ${size}px ${UI.font}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.base ?? 'middle';
  if (o.maxW) {
    const w = ctx.measureText(s).width;
    if (w > o.maxW) ctx.font = `${o.weight ?? 800} ${Math.floor((size * o.maxW) / w)}px ${UI.font}`;
  }
  if (o.stroke !== null) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size * 0.16);
    ctx.strokeStyle = o.stroke ?? 'rgba(10, 12, 40, 0.85)';
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.color ?? UI.text;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Emoji drawn as a picture (no outline). */
export function emoji(ctx, s, x, y, size) {
  ctx.save();
  ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function panel(ctx, x, y, w, h, { r = 28, fill = UI.panel, edge = UI.panelEdge, shadow = true } = {}) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
  }
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 3;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.restore();
}

/** The console's moving background: a deep gradient with drifting soft bubbles. */
export function backdrop(ctx, t, hue = 0) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, UI.bg0);
  g.addColorStop(1, UI.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const x = ((i * 397 + t * (12 + (i % 5) * 6)) % (W + 400)) - 200;
    const y = H * 0.5 + Math.sin(t * 0.3 + i) * H * 0.42;
    const r = 60 + (i % 6) * 30;
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = `hsl(${(hue + i * 40) % 360}, 90%, 65%)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export const ease = {
  out: (x) => 1 - (1 - x) ** 3,
  back: (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2,
  pop: (age, d = 0.35) => (age >= d ? 1 : 0.6 + 0.4 * Math.sin((age / d) * Math.PI * 0.5) + 0.25 * Math.sin((age / d) * Math.PI)),
};

export const mmss = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
