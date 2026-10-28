// Frog Squats: every player is a frog-buddy (frog eyes on their avatar) on a lily pad in their own strip of
// pond. Every squat (down low... and UP!) hops them to the next lily pad: the pond slides along under them and
// their little frog hops along the row of pads at the bottom towards the island (+3 when they get there). A
// friendly cue next to each kid says "DOWN..." then "and UP!" with a little rest after each hop, so squats stay
// slow and strong; a squat always counts, however slow. Now and then a fly buzzes in and hovers just above your
// head: come up from a squat while it's there and your frog tongue catches it (GULP!). Half-way the pads turn
// into a log bridge in the race to the island (hops count double) and golden dragonflies come out.
//
// Layout 'columns': each kid gets their own strip of pond, so their pads, their island race, their fly and
// their DOWN / UP cue are clearly theirs. Squatting happens on the spot, so nothing is gained from sharing
// space, and kids don't bump into each other going down and up.
import { rand, clamp } from './kit.js';

const TRACK = 8; // lily pads to the island
const HOP = 0.45; // s the little frog takes to hop to the next pad
const FLY_IN = 1.3; // s a fly takes to buzz in
const FLY_OUT = 1.0;
const ISLAND_PTS = 3;
const FLY_PTS = 3;
const GOLD_PTS = 6;
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';
const FONT = '"Arial Rounded MT Bold","Trebuchet MS",sans-serif';

export default {
  id: 'frog-squats',
  title: 'Frog Squats',
  icon: '🐸',
  color: '#3fbf5f',
  moves: ['squat'],
  howto: ['You are a frog on a lily pad!', 'Squat down low... and stand UP to hop to the next pad.', 'Come up under a fly to catch it. GULP!'],
  layout: 'columns',
  hearts: 0,
  stars: [35, 80, 135],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const slots = Math.max(1, Math.round(W / ctx.lane(1).w));
    const ponds = new Map(); // n -> pond state
    let twistAt = null;
    const ripples = Array.from({ length: 18 }, () => ({ fx: rng(), y: rand(rng, 430, 1040), w: rand(rng, 40, 110) }));
    const trees = Array.from({ length: 7 }, (_, i) => ({ fx: (i + rand(rng, 0, 0.6)) / 7, s: rand(rng, 0.8, 1.2), e: rng() < 0.6 ? '🌳' : '🌲' }));
    const twist = () => twistAt !== null;

    const pond = (n) => {
      if (!ponds.has(n)) {
        ponds.set(n, { n, hops: 0, scroll: 0, track: 0, from: 0, hopT: -9, lastHop: -9, islands: 0, islandT: -9, wasDown: false, downT: -9, headY: null, x: ctx.lane(n).cx, s: 95, fly: null, nextFly: ctx.t() + rand(rng, 4, 6), flies: 0, tongue: null, splashT: -9, slowTip: -9, fast: 0 });
      }
      return ponds.get(n);
    };
    const spacing = (L) => Math.min(L.w * 0.5, 560);

    /** Where a fly is now: buzzing in from the side, hovering just above the kid's head, or leaving. */
    function flyPos(r, t) {
      const f = r.fly;
      const L = ctx.lane(r.n);
      const hy = (r.headY ?? floor - 450) - 1.0 * r.s;
      const tx = r.x;
      const u = t - f.t0;
      const buzz = { x: Math.sin(t * 9 + f.ph) * 22, y: Math.cos(t * 13 + f.ph) * 12 };
      if (u < FLY_IN) {
        const e = 1 - Math.pow(1 - u / FLY_IN, 2);
        const sx = f.dir > 0 ? L.x0 - 90 : L.x1 + 90;
        return { x: sx + (tx - sx) * e + buzz.x, y: hy - 160 * (1 - e) + buzz.y, phase: 'in', u };
      }
      if (u < FLY_IN + f.hover) return { x: tx + buzz.x * 1.3, y: hy + buzz.y, phase: 'hover', u };
      const v = (u - FLY_IN - f.hover) / FLY_OUT;
      const ex = f.dir > 0 ? L.x1 + 120 : L.x0 - 120;
      return { x: tx + (ex - tx) * v * v + buzz.x, y: hy - 300 * v + buzz.y, phase: v >= 1 ? 'gone' : 'out', u };
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        if (!twist() && ctx.progress() >= 0.5) {
          twistAt = t;
          ctx.sfx.cheer();
          ctx.fx.pop('Log bridge! Race to the island! Hops count DOUBLE! 🪵', W / 2, H * 0.3, '#ffe066');
        }
        for (const p of players) {
          const r = pond(p.n);
          r.x = p.head.x;
          r.s = p.s;
          if (r.headY === null || (!p.ducking && !p.airborne)) r.headY = r.headY === null ? p.head.y : r.headY + (p.head.y - r.headY) * (1 - Math.exp(-dt / 0.5));
          if (p.state !== 'active') continue; // held: frozen, nothing happens to them
          // going down: a little cheer (no points yet, the hop comes when they stand up)
          if (p.ducking && !r.wasDown) {
            r.downT = t;
            ctx.report.good(p.n);
          }
          r.wasDown = p.ducking;
          if (!p.squatted) continue;
          // HOP! to the next lily pad
          const fast = t - r.lastHop < 1.0;
          r.fast = fast ? r.fast + 1 : 0;
          r.lastHop = t;
          r.hops++;
          if (r.track >= TRACK) r.track = 0; // a new stretch of pond after the island
          r.from = r.track;
          r.track++;
          r.hopT = t;
          r.splashT = t;
          const pts = twist() ? 2 : 1;
          ctx.report.score(p.n, pts, p.head.x, p.head.y - p.s * 1.9, twist() ? 'Double hop! +2' : 'Hop! +1');
          ctx.sfx.boing();
          ctx.fx.burst(p.hip.x, floor + 10, '#bff3ff', 10);
          if (r.track >= TRACK) {
            r.islands++;
            r.islandT = t;
            ctx.report.score(p.n, ISLAND_PTS, ctx.lane(p.n).x1 - 90, H - 140, `Island! +${ISLAND_PTS}`);
            ctx.sfx.cheer();
          }
          // slow and strong: a gentle tip for someone squatting very fast (never a penalty)
          if (r.fast >= 3 && t - r.slowTip > 8) {
            r.slowTip = t;
            ctx.fx.pop('Slow and strong! 🐢', p.head.x, p.head.y - p.s * 2.6, '#bfffd0');
          }
          // the fly right above you? GULP!
          if (r.fly && !r.fly.caught) {
            const fp = flyPos(r, t);
            if (fp.phase === 'hover' || (fp.phase === 'in' && fp.u > FLY_IN - 0.5) || (fp.phase === 'out' && fp.u < FLY_IN + r.fly.hover + 0.25)) {
              r.fly.caught = t;
              r.flies++;
              r.tongue = { t0: t, x: fp.x, y: fp.y };
              const gold = r.fly.gold;
              ctx.report.score(p.n, gold ? GOLD_PTS : FLY_PTS, fp.x, fp.y - 50, gold ? `Golden dragonfly! +${GOLD_PTS}` : `GULP! +${FLY_PTS}`);
              ctx.fx.burst(fp.x, fp.y, gold ? '#ffd23f' : '#ff9ec7', gold ? 24 : 14);
              if (gold) ctx.sfx.gold();
              else ctx.sfx.pop();
            }
          }
        }
        // ponds: scrolling, flies coming and going
        for (const r of ponds.values()) {
          r.scroll += (r.hops - r.scroll) * (1 - Math.exp(-dt / 0.14));
          if (r.tongue && t - r.tongue.t0 > 0.35) r.tongue = null;
          if (r.fly) {
            const fp = flyPos(r, t);
            if (r.fly.caught ? t - r.fly.caught > 0.3 : fp.phase === 'gone') {
              r.fly = null;
              r.nextFly = t + rand(rng, 4, 7) / Math.min(1.5, level);
            }
          } else if (t >= r.nextFly) {
            const gold = twist() && rng() < 0.45;
            r.fly = { t0: t, dir: rng() < 0.5 ? 1 : -1, hover: clamp(4.2 / level, 2.4, 4.2), gold, ph: rand(rng, 0, 6), caught: 0 };
            ctx.sfx.warn();
          }
        }
      },

      drawBack(g) {
        const t = ctx.t();
        for (let n = 1; n <= slots; n++) {
          const L = ctx.lane(n);
          const r = pond(n);
          const D = spacing(L);
          const k = clamp(L.w / 900, 0.55, 1.1);
          g.save();
          g.beginPath();
          g.rect(L.x0, 0, L.w, H);
          g.clip();
          // sky, sun, the far bank with trees (they slide slowly as you hop along)
          const sky = g.createLinearGradient(0, 0, 0, 420);
          sky.addColorStop(0, twist() ? '#ffb36b' : '#7fd3ff');
          sky.addColorStop(1, twist() ? '#ffe3a8' : '#e3f7ff');
          g.fillStyle = sky;
          g.fillRect(L.x0, 0, L.w, 430);
          g.fillStyle = '#ffe066';
          g.beginPath();
          g.arc(L.x1 - L.w * 0.2, 250, 50 * k + 10, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#6cc46a';
          g.beginPath();
          g.moveTo(L.x0, 440);
          for (let i = 0; i <= 8; i++) g.lineTo(L.x0 + (i / 8) * L.w, 370 + 26 * Math.sin(i * 1.7 + n));
          g.lineTo(L.x1, 440);
          g.fill();
          g.font = `${Math.round(70 * k + 20)}px ${EMOJI}`;
          g.textAlign = 'center';
          g.textBaseline = 'bottom';
          for (const tr of trees) {
            const x = L.x0 + ((((tr.fx - r.scroll * 0.03) % 1) + 1) % 1) * L.w;
            g.fillText(tr.e, x, 400);
          }
          // the pond
          const water = g.createLinearGradient(0, 410, 0, H);
          water.addColorStop(0, '#5fd6d6');
          water.addColorStop(1, '#137f9e');
          g.fillStyle = water;
          g.fillRect(L.x0, 410, L.w, H - 410);
          g.strokeStyle = 'rgba(255,255,255,0.45)';
          g.lineWidth = 5;
          g.lineCap = 'round';
          for (const rp of ripples) {
            const depth = (rp.y - 410) / (H - 410);
            const x = L.x0 + ((((rp.fx - r.scroll * 0.12 * (0.3 + depth) + Math.sin(t * 0.5 + rp.y) * 0.01) % 1) + 1) % 1) * L.w;
            g.beginPath();
            g.moveTo(x - rp.w * k * 0.5, rp.y);
            g.quadraticCurveTo(x, rp.y - 8, x + rp.w * k * 0.5, rp.y);
            g.stroke();
          }
          // reeds and cattails at the sides
          for (const side of [0, 1]) {
            const x0 = side ? L.x1 - 30 * k - 10 : L.x0 + 30 * k + 10;
            for (let i = 0; i < 3; i++) {
              const x = x0 + (side ? -1 : 1) * i * 22 * k;
              const top = 600 + i * 40 + Math.sin(t * 1.3 + i + n) * 6;
              g.strokeStyle = '#2f8f46';
              g.lineWidth = 8 * k + 2;
              g.beginPath();
              g.moveTo(x, floor + 20);
              g.quadraticCurveTo(x + Math.sin(t + i) * 10, (top + floor) / 2, x, top);
              g.stroke();
              g.fillStyle = '#8a5a33';
              rrect(g, x - 9 * k - 2, top - 50 * k, 18 * k + 4, 55 * k, 9 * k + 2);
              g.fill();
            }
          }
          // the lily pads (a log bridge after half-time): yours slides away as you hop to the next
          const rx = Math.min(L.w * 0.2, 190);
          const base = Math.floor(r.scroll) - 1;
          for (let i = base; i <= base + 3; i++) {
            const x = L.cx + (i - r.scroll) * D;
            if (x < L.x0 - rx * 1.5 || x > L.x1 + rx * 1.5) continue;
            const bob = Math.sin(t * 2 + i) * 4;
            if (twist()) logPad(g, x, floor + 14 + bob, rx);
            else lilyPad(g, x, floor + 14 + bob, rx, i % 3 === 0);
          }
          // splash rings under you just after a hop
          const sa = t - r.splashT;
          if (sa < 0.6) {
            g.strokeStyle = `rgba(255,255,255,${0.8 * (1 - sa / 0.6)})`;
            g.lineWidth = 6;
            for (const q of [1, 0.6]) {
              g.beginPath();
              g.ellipse(r.x, floor + 18, rx * (0.6 + sa * 1.2) * q, rx * 0.2 * (0.6 + sa * 1.2) * q, 0, 0, Math.PI * 2);
              g.stroke();
            }
          }
          // the race to the island: a row of little pads at the bottom, your frog hopping along it
          track(g, L, r, t, twist());
          g.restore();
          if (n > 1) {
            g.fillStyle = 'rgba(255,255,255,0.85)';
            g.fillRect(L.x0 - 4, 0, 8, H);
          }
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        for (let n = 1; n <= slots; n++) {
          const r = pond(n);
          if (r.fly && !r.fly.caught) {
            const fp = flyPos(r, t);
            if (fp.phase === 'hover') {
              // a soft target ring: this is where it gets caught
              g.save();
              g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 8);
              g.strokeStyle = r.fly.gold ? '#ffd23f' : '#ffffff';
              g.lineWidth = 5;
              g.setLineDash([12, 10]);
              g.beginPath();
              g.arc(fp.x, fp.y, 60 * (r.s / 95) + 10, 0, Math.PI * 2);
              g.stroke();
              g.setLineDash([]);
              g.restore();
            }
            if (r.fly.gold) dragonfly(g, fp.x, fp.y, r.s / 95, t, r.fly.dir);
            else fly(g, fp.x, fp.y, r.s / 95, t);
          }
        }
        for (const p of players) {
          const r = pond(p.n);
          const k = p.s / 95;
          // frog eyes on top of the kid's head, and the tongue when they catch a fly
          frogEyes(g, p, t);
          if (r.tongue) {
            const a = clamp((t - r.tongue.t0) / 0.35, 0, 1);
            const reach = Math.sin(a * Math.PI);
            const mx = p.head.x;
            const my = p.head.y + p.head.r * 0.35;
            const tx = mx + (r.tongue.x - mx) * reach;
            const ty = my + (r.tongue.y - my) * reach;
            g.save();
            g.strokeStyle = '#ff6f9e';
            g.lineCap = 'round';
            g.lineWidth = 14 * k;
            g.beginPath();
            g.moveTo(mx, my);
            g.lineTo(tx, ty);
            g.stroke();
            g.fillStyle = '#ff6f9e';
            g.beginPath();
            g.arc(tx, ty, 14 * k, 0, Math.PI * 2);
            g.fill();
            g.restore();
          }
          if (p.state !== 'active') continue;
          // the rhythm cue: DOWN... and UP! (a little rest after each hop)
          const x = Math.max(p.lane.x0 + 80 * k, p.head.x - p.s * 2.0);
          const y = p.head.y + p.s * 0.2;
          const rest = clamp(0.9 / ctx.level(), 0.5, 1.0);
          const flyHere = r.fly && !r.fly.caught && flyPos(r, t).phase !== 'out';
          if (p.ducking) cueBubble(g, x, y, k, p.color, '⬆️', flyHere ? 'UP! Gulp!' : 'and UP!', '#ffe066', t, 14);
          else if (t - r.lastHop < rest) cueBubble(g, x, y, k, p.color, '😄', 'Ribbit!', '#c9f7c9', t, 0);
          else cueBubble(g, x, y + Math.sin(t * 3) * 10, k, p.color, '⬇️', 'DOWN...', '#ffffff', t, 4);
        }
      },

      needs() {
        return 'squat';
      },

      /** Test bot: steady squats, down and up. */
      bot() {
        return { move: 'squat' };
      },
    };
  },
};

// ------------------------------------------------------------------------------------------------ drawing

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function lilyPad(g, x, y, rx, flower) {
  const ry = rx * 0.3;
  g.save();
  g.fillStyle = 'rgba(0, 60, 80, 0.25)';
  g.beginPath();
  g.ellipse(x + 8, y + 10, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4cc15a';
  g.strokeStyle = '#2b7a3a';
  g.lineWidth = 6;
  g.beginPath();
  // a pad with a little notch cut out of it
  g.ellipse(x, y, rx, ry, 0, 0.15 * Math.PI, 1.95 * Math.PI);
  g.lineTo(x, y);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(30, 110, 50, 0.6)';
  g.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const a = 0.5 + i * 1.1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * rx * 0.8, y + Math.sin(a) * ry * 0.8);
    g.stroke();
  }
  if (flower) {
    g.font = `${Math.round(rx * 0.32)}px ${EMOJI}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🌸', x - rx * 0.62, y - ry * 0.2);
  }
  g.restore();
}

function logPad(g, x, y, rx) {
  const h = rx * 0.34;
  g.save();
  g.fillStyle = 'rgba(0, 60, 80, 0.25)';
  rrect(g, x - rx + 8, y - h / 2 + 10, rx * 2, h, h / 2);
  g.fill();
  g.fillStyle = '#a0662f';
  g.strokeStyle = '#5a3412';
  g.lineWidth = 6;
  rrect(g, x - rx, y - h / 2, rx * 2, h, h / 2);
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(90, 52, 18, 0.6)';
  g.lineWidth = 4;
  for (const f of [-0.5, 0, 0.5]) {
    g.beginPath();
    g.moveTo(x + f * rx - 30, y - h * 0.15);
    g.lineTo(x + f * rx + 30, y - h * 0.15);
    g.stroke();
  }
  // the cut end with rings
  g.fillStyle = '#e0b07a';
  g.strokeStyle = '#5a3412';
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(x + rx - h * 0.25, y, h * 0.3, h * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(x + rx - h * 0.25, y, h * 0.14, h * 0.25, 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/** The race to the island: little pads (or logs) along the bottom, the frog hopping from one to the next. */
function track(g, L, r, t, logs) {
  const y = 1080 - 58;
  const x0 = L.x0 + 46;
  const sp = (L.w - 150) / 8;
  const k = clamp(L.w / 900, 0.5, 1);
  g.fillStyle = 'rgba(0, 50, 70, 0.35)';
  rrect(g, L.x0 + 14, y - 44, L.w - 28, 88, 30);
  g.fill();
  const pr = Math.min(sp * 0.42, 34);
  for (let i = 0; i < 8; i++) {
    const x = x0 + i * sp;
    g.fillStyle = logs ? '#a0662f' : i < r.track ? '#7be08a' : '#4cc15a';
    g.strokeStyle = logs ? '#5a3412' : '#2b7a3a';
    g.lineWidth = 4;
    g.beginPath();
    if (logs) rrect(g, x - pr, y + 2, pr * 2, pr * 0.6, pr * 0.3);
    else g.ellipse(x, y + 10, pr, pr * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  const ix = x0 + 8 * sp - 4;
  const party = t - r.islandT < 1.2;
  g.font = `${Math.round(66 * k + 14) * (party ? 1 + 0.15 * Math.sin(t * 20) : 1)}px ${EMOJI}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('🏝️', ix, y - 4);
  if (party) g.fillText('🎉', ix - 30 * k, y - 60 * k);
  // the frog: hops in an arc from pad to pad (pad -1 is the start, before the first pad)
  const a = clamp((t - r.hopT) / HOP, 0, 1);
  const at = (v) => (v <= 0 ? x0 - sp * 0.6 : v >= 8 ? ix : x0 + (v - 1) * sp);
  const fx = at(r.from) + (at(r.track) - at(r.from)) * a;
  const fy = y - 8 - Math.sin(a * Math.PI) * 50 * k - (r.track >= 8 ? 30 * k * a : 0);
  g.font = `${Math.round(44 * k + 12)}px ${EMOJI}`;
  g.fillText('🐸', Math.max(L.x0 + 30, fx), fy);
}

/** Big frog eyes on top of the kid's head (they blink now and then). */
function frogEyes(g, p, t) {
  const r = p.head.r;
  const blink = (t + p.n * 0.7) % 4 < 0.12;
  g.save();
  for (const s of [-1, 1]) {
    const x = p.head.x + s * r * 0.48;
    const y = p.head.y - r * 0.82;
    g.fillStyle = '#5ec46b';
    g.strokeStyle = '#2b7a3a';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(x, y, r * 0.4, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (blink) {
      g.strokeStyle = '#1b3a1b';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x - r * 0.22, y);
      g.lineTo(x + r * 0.22, y);
      g.stroke();
      continue;
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, y, r * 0.27, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b1b2f';
    g.beginPath();
    g.arc(x + s * r * 0.04, y + r * 0.03, r * 0.13, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** A cartoon fly: round black body, buzzing wings, big red eyes. */
function fly(g, x, y, k, t) {
  const s = Math.max(0.75, k);
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  const flap = Math.sin(t * 60) * 0.5;
  g.fillStyle = 'rgba(220, 240, 255, 0.85)';
  g.strokeStyle = '#7a8aa0';
  g.lineWidth = 3;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(side * 18, -22, 24, 13, side * (0.6 + flap), 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.fillStyle = '#2a2a35';
  g.beginPath();
  g.ellipse(0, 0, 26, 20, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d62828';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.arc(side * 15, -8, 9, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ffffff';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.arc(side * 15 + 3, -11, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** A big golden dragonfly with four shimmering wings. */
function dragonfly(g, x, y, k, t, dir) {
  const s = Math.max(0.8, k) * 1.2;
  g.save();
  g.translate(x, y);
  g.scale(s * (dir > 0 ? 1 : -1), s);
  const flap = Math.sin(t * 45) * 0.25;
  g.fillStyle = 'rgba(255, 245, 190, 0.8)';
  g.strokeStyle = '#d4a000';
  g.lineWidth = 3;
  for (const [ox, a] of [
    [-6, -0.4],
    [8, -0.25],
  ]) {
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(ox, side * 22, 34, 10, side * (a + flap) + (side < 0 ? 0 : 0), 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
  // long golden body
  g.fillStyle = '#ffc21a';
  g.strokeStyle = '#a06a00';
  g.lineWidth = 4;
  rrect(g, -70, -7, 70, 14, 7);
  g.fill();
  g.stroke();
  g.beginPath();
  g.ellipse(4, 0, 16, 12, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(24, 0, 12, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#1b1b2f';
  g.beginPath();
  g.arc(28, -4, 4, 0, Math.PI * 2);
  g.fill();
  // sparkle
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 12);
  g.beginPath();
  g.arc(-40 + Math.sin(t * 5) * 20, -20, 5, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** The DOWN / UP cue: a round bubble with an icon and a word, gently bouncing. */
function cueBubble(g, x, y, k, color, icon, word, fill, t, bounce) {
  const pulse = 1 + (bounce ? 0.05 * Math.sin(t * bounce) : 0);
  g.save();
  g.translate(x, y);
  g.scale(pulse * k, pulse * k);
  g.beginPath();
  g.arc(0, 0, 76, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = color;
  g.stroke();
  g.font = `46px ${EMOJI}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, 0, -22);
  g.font = `900 ${word.length > 7 ? 26 : 32}px ${FONT}`;
  g.fillStyle = '#1b1b3a';
  g.fillText(word, 0, 30);
  g.restore();
}
