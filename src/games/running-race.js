// Running Race: every player has a running track in their own lane, seen from the side. Run on the spot,
// lifting your knees: every knee lift is a stride and the track rushes past (stop and you slow down). Hurdles
// come along the track with a 3-2-1 count above your head: JUMP over them (a missed one is a funny wobble and
// a short slow-down, nothing more). Points for distance, hurdles and every lap (a FINISH banner and
// confetti). Alone, a cartoon monkey races alongside at a gentle pace. Half-way: a SPRINT! the track goes
// golden, you run faster and distance points count double.
// Your avatar stays where you stand; running is shown by the track, the hurdles and the stands scrolling past.
import { rand, clamp, sky } from './kit.js';
import { drawMonkey } from './monkey.js';

const IMPULSE = 1.6; // m/s each knee lift adds
const TAU = 0.9; // s for the speed to fade when you stop
const VMAX = 7; // m/s
const POINT_M = 10; // metres per distance point
const LAP_M = 100; // metres per lap
const LAP_BONUS = 5;
const HURDLE_PTS = 2;
const STUMBLE = 1.1; // s of slow wobbling after hitting a hurdle
const MONKEY_V = 2.6; // m/s the monkey jogs at level 1
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';
const FONT = '"Arial Rounded MT Bold","Trebuchet MS",sans-serif';
const CONFETTI = ['#ff5d73', '#ffc93c', '#5ee08a', '#3fb6ff', '#b37bff', '#ff9f43'];
const OOPS = ['OOPS! Wobble!', 'BONK! Whoopsie!', 'Wibble wobble!', 'Hop next time!'];

export default {
  id: 'running-race',
  title: 'Running Race',
  icon: '🏃',
  color: '#ff8c42',
  moves: ['run', 'jump'],
  howto: ['Run on the spot and lift your knees up high!', 'Watch the 3, 2, 1 for a hurdle...', 'then JUMP over it!'],
  layout: 'columns',
  hearts: 0,
  stars: [50, 100, 160],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const slots = Math.max(1, Math.round(W / ctx.lane(1).w));
    const runners = new Map(); // n -> runner state
    const pal = { d: 0, v: 0, hop: -9, mood: 'happy', moodUntil: 0 };
    const crowd = Array.from({ length: 70 }, (_, i) => ({ u: i / 70 + rand(rng, 0, 0.01), row: i % 3, c: CONFETTI[Math.floor(rng() * CONFETTI.length)], ph: rand(rng, 0, 6) }));
    const clouds = Array.from({ length: 5 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 50, 200), s: rand(rng, 0.6, 1.1) }));
    let twist = false;

    const state = (n) => {
      if (!runners.has(n)) runners.set(n, { d: 0, v: 0, hurdles: [], nextH: 22, nextPt: POINT_M, laps: 0, stumble: -9, hopUntil: -9, refX: ctx.lane(n).cx, result: null, lapAt: -9 });
      return runners.get(n);
    };
    /** Pixels per metre of track in a lane. */
    const ppm = (lane) => lane.w / 11;

    /** Keep the track ahead stocked with hurdles (never right on a finish line). */
    function stock(r) {
      const level = ctx.level();
      while (r.nextH < r.d + 45) {
        let at = r.nextH;
        const lapPos = at % LAP_M;
        if (lapPos < 6) at += 6 - lapPos;
        if (lapPos > LAP_M - 6) at += LAP_M - lapPos + 6;
        r.hurdles.push({ d: at, cleared: false, judged: false, fallen: false });
        r.nextH = at + rand(rng, 17, 27) / Math.min(1.5, level) * (twist ? 0.85 : 1);
      }
      for (let i = r.hurdles.length - 1; i >= 0; i--) if (r.hurdles[i].d < r.d - 15) r.hurdles.splice(i, 1);
    }

    /** The next hurdle not yet passed, and how far ahead it is (m). */
    function nextHurdle(r) {
      for (const h of r.hurdles) if (!h.judged) return { h, gap: h.d - r.d };
      return null;
    }
    const zone = (r) => clamp(r.v * 1.1, 2.6, 6); // a jump this close before a hurdle clears it
    const eta = (r, gap) => gap / Math.max(r.v, 0.3);

    function clear(p, r, h, label) {
      h.cleared = true;
      r.hopUntil = ctx.t() + 0.7;
      ctx.report.score(p.n, HURDLE_PTS, p.head.x, p.head.y - p.s * 1.6, label);
      ctx.sfx.boing();
      r.result = { text: '⭐', until: ctx.t() + 0.7 };
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        if (!twist && ctx.progress() >= 0.5) {
          twist = true;
          ctx.sfx.cheer();
          ctx.fx.pop('SPRINT! Run fast for double points! ⚡', W / 2, H * 0.3, '#ffd23f');
        }
        for (const p of players) {
          const r = state(p.n);
          r.refX += (p.hip.x - r.refX) * (1 - Math.exp(-dt / 0.2));
          if (p.state !== 'active') continue; // held: the runner freezes on the spot
          // knee lifts are strides
          const wobbly = t < r.stumble;
          if (p.kneeUp.length) {
            const kick = IMPULSE * (twist ? 1.25 : 1) * (wobbly ? 0.4 : 1);
            r.v = Math.min(VMAX * (twist ? 1.3 : 1), r.v + kick * p.kneeUp.length);
          }
          // in the air your speed carries you; on the ground it fades when you stop
          if (!(p.airborne || t < r.hopUntil)) r.v *= Math.exp(-dt / TAU);
          if (wobbly) r.v = Math.min(r.v, 1.2);
          const before = r.d;
          r.d += r.v * dt;
          stock(r);
          // distance points
          while (r.d >= r.nextPt) {
            r.nextPt += POINT_M;
            const pts = twist ? 2 : 1;
            ctx.report.score(p.n, pts, p.head.x - p.s * 1.2, p.head.y - p.s * 0.6, `+${pts}`);
          }
          // laps: a finish line every 100 m
          if (Math.floor(r.d / LAP_M) > Math.floor(before / LAP_M)) {
            r.laps = Math.floor(r.d / LAP_M);
            r.lapAt = t;
            ctx.report.score(p.n, LAP_BONUS, p.head.x, p.head.y - p.s * 2.2, `LAP ${r.laps}! +${LAP_BONUS}`);
            ctx.sfx.cheer();
            for (let i = 0; i < 4; i++) ctx.fx.burst(p.lane.x0 + p.lane.w * (0.2 + i * 0.2), H * 0.25, CONFETTI[i], 16);
            if (players.length === 1) {
              pal.mood = 'taunt';
              pal.moodUntil = t + 1.5;
            }
          }
          // hurdles: a jump close before one clears it
          const nh = nextHurdle(r);
          if (p.jumped && nh && !nh.h.cleared && nh.gap > -0.6 && nh.gap < zone(r)) {
            const perfect = eta(r, nh.gap) < 0.6;
            clear(p, r, nh.h, perfect ? 'PERFECT HOP! +2' : 'HOP! +2');
          }
          // passing a hurdle: cleared (or still in the air) is great, otherwise a funny wobble
          for (const h of r.hurdles) {
            if (h.judged || r.d < h.d) continue;
            h.judged = true;
            if (h.cleared) continue;
            if (p.airborne) {
              clear(p, r, h, 'HIGH JUMP! +2');
              continue;
            }
            h.fallen = true;
            r.stumble = t + STUMBLE;
            r.v = Math.min(r.v, 1);
            r.result = { text: '💫', until: t + STUMBLE };
            ctx.report.miss(p.n, 'jump', p.head.x, p.head.y - p.s * 1.6, OOPS[Math.floor(rng() * OOPS.length)]);
            ctx.sfx.bonk();
            ctx.fx.burst(p.hip.x + p.s * 0.6, floor - 20, '#f0d9a8', 14);
          }
        }
        // the monkey jogs along at a gentle pace (only for someone playing alone)
        if (players.length === 1) {
          const r = state(players[0].n);
          const target = MONKEY_V * Math.min(1.3, level) * (twist ? 1.15 : 1);
          // it never wanders too far ahead or behind: it's a friend, not a rival
          const gap = pal.d - r.d;
          const want = target * (gap > 40 ? 0.6 : gap < -40 ? 1.4 : 1);
          pal.v += (want - pal.v) * (1 - Math.exp(-dt / 0.8));
          const before = pal.d;
          pal.d += pal.v * dt;
          for (const h of r.hurdles) if (h.d > before + 1.2 && h.d <= pal.d + 1.2) pal.hop = t;
          if (gap > 0 && pal.d - r.d <= 0 && t > pal.moodUntil) {
            pal.mood = 'panic'; // you just overtook the monkey!
            pal.moodUntil = t + 1.2;
          }
        }
        for (const c of clouds) c.x = (c.x + 12 * c.s * dt + 300) % (W + 600) - 300;
      },

      drawBack(g, players) {
        const t = ctx.t();
        sky(g, W, H, twist ? '#ffb36b' : '#68c8ff', twist ? '#ffe6a8' : '#dff4ff');
        for (let k = 1; k <= slots; k++) {
          const lane = ctx.lane(k);
          const r = runners.get(k);
          const here = players.some((p) => p.n === k);
          const d = r ? r.d : 0;
          const px = ppm(lane);
          const x0 = r ? r.refX : lane.cx;
          g.save();
          g.beginPath();
          g.rect(lane.x0, 0, lane.w, H);
          g.clip();
          // clouds, far away
          for (const c of clouds) puff(g, lane.x0 + ((((c.x - d * 2) % lane.w) + lane.w) % lane.w), c.y, 70 * c.s, 'rgba(255,255,255,0.9)');
          // the stands with a cheering crowd (slow parallax)
          const standTop = H * 0.36;
          const standBot = floor - 150;
          g.fillStyle = '#5b6bd6';
          g.fillRect(lane.x0, standTop, lane.w, standBot - standTop);
          g.fillStyle = '#4656c0';
          for (let row = 0; row < 3; row++) g.fillRect(lane.x0, standTop + 40 + row * ((standBot - standTop - 40) / 3), lane.w, 10);
          const span = lane.w + 40;
          for (const c of crowd) {
            const cx = lane.x0 - 20 + ((((c.u * span - d * px * 0.25) % span) + span) % span);
            const cy = standTop + 30 + c.row * ((standBot - standTop - 40) / 3) - (here && r && r.v > 3 ? Math.abs(Math.sin(t * 8 + c.ph)) * 10 : 0);
            g.fillStyle = c.c;
            g.beginPath();
            g.arc(cx, cy + 14, 13, Math.PI, 0);
            g.fill();
            g.fillStyle = '#f2d2a9';
            g.beginPath();
            g.arc(cx, cy, 9, 0, Math.PI * 2);
            g.fill();
          }
          // a flag row on top of the stands
          for (let i = 0; i < 12; i++) {
            const fx = lane.x0 + ((((i * 160 - d * px * 0.25) % (lane.w + 160)) + lane.w + 160) % (lane.w + 160)) - 80;
            g.fillStyle = CONFETTI[i % CONFETTI.length];
            g.beginPath();
            g.moveTo(fx, standTop);
            g.lineTo(fx + 40, standTop);
            g.lineTo(fx + 20, standTop - 34 - 4 * Math.sin(t * 5 + i));
            g.closePath();
            g.fill();
          }
          // grass, then the red running track
          g.fillStyle = '#5ec46b';
          g.fillRect(lane.x0, standBot, lane.w, 70);
          const trackTop = standBot + 60;
          const tg = g.createLinearGradient(0, trackTop, 0, H);
          tg.addColorStop(0, twist ? '#f0a33a' : '#d9573b');
          tg.addColorStop(1, twist ? '#d98318' : '#b8432c');
          g.fillStyle = tg;
          g.fillRect(lane.x0, trackTop, lane.w, H - trackTop);
          g.fillStyle = '#ffffff';
          g.fillRect(lane.x0, trackTop, lane.w, 6);
          g.fillRect(lane.x0, floor + 40, lane.w, 6);
          // dashes and metre marks scroll past at running speed
          g.fillStyle = 'rgba(255,255,255,0.7)';
          const dash = 2;
          for (let m = Math.floor(d - (x0 - lane.x0) / px) - 2; m < d + (lane.x1 - x0) / px + 2; m++) {
            const sx = x0 + (m - d) * px;
            if (m % dash === 0) g.fillRect(sx, (trackTop + floor) / 2 - 3, px * 0.9, 6);
            if (m % 10 === 0 && m % LAP_M !== 0) {
              g.fillStyle = '#ffffff';
              g.font = `900 ${Math.round(Math.min(40, px * 0.35))}px ${FONT}`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText(`${m % LAP_M}`, sx, floor + 85);
              g.fillStyle = 'rgba(255,255,255,0.7)';
            }
          }
          // finish lines: a chequered stripe and an arch with a banner
          const nextLap = Math.ceil((d - (x0 - lane.x0) / px) / LAP_M) * LAP_M;
          for (let L = Math.max(LAP_M, nextLap); L < d + (lane.x1 - x0) / px + 3; L += LAP_M) finish(g, x0 + (L - d) * px, trackTop, floor, Math.min(1, lane.w / 900 + 0.3), t);
          // sprint: speed lines
          if (twist && r && r.v > 2.5) {
            g.strokeStyle = 'rgba(255,255,255,0.65)';
            g.lineWidth = 6;
            g.lineCap = 'round';
            for (let i = 0; i < 8; i++) {
              const y = standTop + 40 + ((i * 97) % (floor - standTop - 60));
              const sx = lane.x1 - ((((t * 900 + i * 230) % (lane.w + 300)) + lane.w + 300) % (lane.w + 300));
              g.beginPath();
              g.moveTo(sx, y);
              g.lineTo(sx + 120, y);
              g.stroke();
            }
          }
          g.restore();
          // the race board at the top of the lane: lap progress, metres, and your place
          if (here && r) board(g, lane, r, players.length === 1 ? pal : null, placeOf(k, players), twist, t);
          if (k > 1) {
            g.fillStyle = 'rgba(255,255,255,0.9)';
            g.fillRect(lane.x0 - 4, 0, 8, H);
          }
        }
        // the monkey runs alongside on the track behind you
        if (players.length === 1) {
          const p = players[0];
          const r = state(p.n);
          const lane = p.lane;
          const px = ppm(lane);
          const ms = Math.min(62, lane.w * 0.1);
          const raw = r.refX + (pal.d - r.d) * px - 1.8 * p.s;
          const x = clamp(raw, lane.x0 + 90, lane.x1 - 90);
          const hopK = t - pal.hop;
          const hop = hopK >= 0 && hopK < 0.5 ? Math.sin((hopK / 0.5) * Math.PI) * 70 : 0;
          const run = Math.sin(t * 14) * Math.min(1, pal.v / 2);
          const y = floor - 95 - hop - Math.abs(run) * 8;
          const mood = t < pal.moodUntil ? pal.mood : hop > 0 ? 'happy' : 'happy';
          drawMonkey(g, x, y, ms, { t, mood, armL: 1.3 + run * 0.9, armR: 1.3 - run * 0.9 });
          // a little bib and, when it's off screen, which way it is
          if (raw !== x) {
            const ahead = raw > x;
            const dm = Math.round(Math.abs(pal.d - r.d));
            sign(g, x + (ahead ? -1 : 1) * ms * 0.2, y - ms * 3.1, `${ahead ? '' : '⬅ '}${dm} m${ahead ? ' ➡' : ''}`, '#8a5a33');
          }
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        for (const p of players) {
          const r = state(p.n);
          const lane = p.lane;
          const px = ppm(lane);
          const k = p.s / 95;
          // hurdles in front of the legs
          g.save();
          g.beginPath();
          g.rect(lane.x0, 0, lane.w, H);
          g.clip();
          for (const h of r.hurdles) {
            const x = r.refX + (h.d - r.d) * px;
            if (x < lane.x0 - 100 || x > lane.x1 + 100) continue;
            hurdle(g, x, floor + 10, Math.max(0.6, k), h.fallen, h.cleared && h.d < r.d);
          }
          // a "!" at the edge for a hurdle that's coming but not yet in view
          const nh = nextHurdle(r);
          if (nh && p.state === 'active') {
            const x = r.refX + nh.gap * px;
            if (x > lane.x1 - 40 && eta(r, nh.gap) < 3.5) warn(g, lane.x1 - 50, floor - 90 * k, t, 60 * Math.max(0.7, k));
          }
          g.restore();
          // a race bib on the tummy
          bib(g, (p.sh.x + p.hip.x) / 2, (p.sh.y * 0.45 + p.hip.y * 0.55), p.s, p.n, p.color);
          // dust puffs at your feet when running
          if (r.v > 1.5 && !p.airborne) {
            g.fillStyle = 'rgba(240,220,180,0.75)';
            for (let i = 0; i < 3; i++) {
              const u = (t * 2.5 + i / 3) % 1;
              g.beginPath();
              g.arc(p.hip.x - p.s * (0.6 + u * 2), floor + 5 - u * 25, p.s * (0.12 + u * 0.18), 0, Math.PI * 2);
              g.fill();
            }
          }
          if (p.state !== 'active') continue;
          // cue above the head: a result, the 3-2-1 for a hurdle, or RUN! when you've stopped
          const x = p.head.x;
          const y = p.head.y - p.s * 1.75;
          if (r.result && t < r.result.until) {
            g.save();
            g.font = `${Math.round(90 * k)}px ${EMOJI}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            if (r.result.text === '💫') {
              for (let i = 0; i < 3; i++) {
                const a = t * 7 + (i * Math.PI * 2) / 3;
                g.font = `${Math.round(48 * k)}px ${EMOJI}`;
                g.fillText('💫', p.head.x + Math.cos(a) * p.s * 0.9, p.head.y - p.s * 0.7 + Math.sin(a) * p.s * 0.3);
              }
            } else g.fillText(r.result.text, x, y);
            g.restore();
            continue;
          }
          if (nh) {
            const e = eta(r, nh.gap);
            const hot = nh.gap < zone(r) * 0.75 && (e < 0.7 || nh.gap < 1.6);
            if (hot || e < 3.2) {
              countdown(g, x, y, k, p.color, hot ? 'JUMP!' : String(Math.ceil(e)), hot, t);
              continue;
            }
          }
          if (r.v < 1.2) runCue(g, x, y, k, p.color, t);
        }
      },

      needs(n) {
        const r = runners.get(n);
        const nh = r ? nextHurdle(r) : null;
        return nh && (eta(r, nh.gap) < 2 || nh.gap < 4) ? 'jump' : 'run';
      },

      /** Test bot: high knees all the time, and jump just before each hurdle. */
      bot(p) {
        const r = runners.get(p.n);
        const nh = r ? nextHurdle(r) : null;
        if (nh && !nh.h.cleared && nh.gap > -0.3 && eta(r, nh.gap) < 0.45) return { move: 'run', jump: true };
        return { move: 'run' };
      },
    };

    /** 1 for whoever has run furthest, etc. (null when racing alone). */
    function placeOf(n, players) {
      if (players.length < 2) return null;
      const me = runners.get(n)?.d ?? 0;
      return 1 + players.filter((q) => q.n !== n && (runners.get(q.n)?.d ?? 0) > me + 0.01).length;
    }
  },
};

// ------------------------------------------------------------------------------------------------ drawing

function puff(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x - r * 0.7, y + r * 0.15, r * 0.55, 0, Math.PI * 2);
  g.arc(x, y - r * 0.15, r * 0.75, 0, Math.PI * 2);
  g.arc(x + r * 0.75, y + r * 0.15, r * 0.5, 0, Math.PI * 2);
  g.rect(x - r * 0.7, y, r * 1.45, r * 0.55);
  g.fill();
}

/** A striped hurdle standing on the track (or knocked flat after a wobble). */
function hurdle(g, x, y, k, fallen, passed) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.lineCap = 'round';
  if (fallen) {
    g.rotate(-1.35);
    g.translate(-10, 0);
  }
  g.globalAlpha = passed ? 0.75 : 1;
  // legs and feet
  g.strokeStyle = '#3b3f5c';
  g.lineWidth = 10;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 45, 0);
    g.lineTo(s * 45, -110);
    g.stroke();
    g.beginPath();
    g.moveTo(s * 45 - 22, 0);
    g.lineTo(s * 45 + 22, 0);
    g.stroke();
  }
  // the bar: red and white stripes
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#3b3f5c';
  g.lineWidth = 5;
  g.fillRect(-62, -135, 124, 32);
  g.strokeRect(-62, -135, 124, 32);
  g.fillStyle = '#ff5d73';
  for (let i = 0; i < 4; i++) g.fillRect(-62 + i * 31, -135, 16, 32);
  g.strokeRect(-62, -135, 124, 32);
  g.restore();
}

/** A finish line across the track with a big arch and a FINISH banner. */
function finish(g, x, top, floor, k, t) {
  g.save();
  // chequered stripe on the track
  const sq = 18;
  for (let row = 0; row * sq < floor + 60 - top; row++)
    for (let c = 0; c < 2; c++) {
      g.fillStyle = (row + c) % 2 ? '#1b1b2f' : '#ffffff';
      g.fillRect(x - sq + c * sq, top + row * sq, sq, sq);
    }
  // the arch
  const archH = 560 * k;
  const half = 170 * k;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 16 * k;
  g.beginPath();
  g.moveTo(x - half, top + 20);
  g.lineTo(x - half, top - archH);
  g.moveTo(x + half, top + 20);
  g.lineTo(x + half, top - archH);
  g.stroke();
  // the banner
  const bw = half * 2 + 40 * k;
  const bh = 80 * k;
  const by = top - archH - bh / 2 + 6 * Math.sin(t * 3);
  g.fillStyle = '#ffd23f';
  g.strokeStyle = '#b8860b';
  g.lineWidth = 6;
  g.fillRect(x - bw / 2, by, bw, bh);
  g.strokeRect(x - bw / 2, by, bw, bh);
  g.fillStyle = '#7a2b00';
  g.font = `900 ${Math.round(54 * k)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FINISH', x, by + bh / 2 + 2);
  // balloons on the posts
  g.font = `${Math.round(60 * k)}px ${EMOJI}`;
  g.fillText('🎈', x - half, top - archH - 30 * k + 8 * Math.sin(t * 2));
  g.fillText('🎈', x + half, top - archH - 30 * k + 8 * Math.sin(t * 2 + 1));
  g.restore();
}

/** Lap progress, metres run and (with friends) your place, at the top of the lane. */
function board(g, lane, r, pal, place, twist, t) {
  const k = Math.min(1, lane.w / 700 + 0.3);
  const w = Math.min(lane.w - 40, 620 * k);
  const x = lane.cx - w / 2;
  const y = 175; // below the console's clock and score chips
  const h = 96 * k;
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.strokeStyle = twist ? '#ff8c42' : '#3b3f5c';
  g.lineWidth = 6;
  roundRect(g, x, y, w, h, 22 * k);
  g.fill();
  g.stroke();
  g.fillStyle = '#1b1b3a';
  g.font = `900 ${Math.round(34 * k)}px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '';
  g.fillText(`🏁 Lap ${r.laps + 1}`, x + 18 * k, y + h * 0.32);
  g.textAlign = 'right';
  g.fillText(`${Math.floor(r.d)} m ${medal}`, x + w - 18 * k, y + h * 0.32);
  // the lap bar: you (a dot in your colour) and the monkey
  const bx = x + 20 * k;
  const bw = w - 40 * k;
  const byy = y + h * 0.74;
  g.fillStyle = '#e3e6f2';
  roundRect(g, bx, byy - 8 * k, bw, 16 * k, 8 * k);
  g.fill();
  const u = (r.d % 100) / 100;
  g.fillStyle = twist ? '#ffb36b' : '#5ee08a';
  roundRect(g, bx, byy - 8 * k, Math.max(16 * k, bw * u), 16 * k, 8 * k);
  g.fill();
  g.font = `${Math.round(30 * k)}px ${EMOJI}`;
  g.textAlign = 'center';
  if (pal) {
    const mu = clamp((pal.d - r.d) / 100 + u, 0, 1);
    g.fillText('🐵', bx + bw * mu, byy - 2);
  }
  g.fillText('🏃', bx + bw * u, byy - 2 - Math.abs(Math.sin(t * 10)) * 3);
  g.fillText('🏁', bx + bw, byy - 2);
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

/** The race number on a runner's tummy. */
function bib(g, x, y, s, n, color) {
  g.save();
  g.fillStyle = '#ffffff';
  g.strokeStyle = color;
  g.lineWidth = 5;
  roundRect(g, x - s * 0.38, y - s * 0.28, s * 0.76, s * 0.56, s * 0.08);
  g.fill();
  g.stroke();
  g.fillStyle = '#1b1b3a';
  g.font = `900 ${Math.round(s * 0.42)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), x, y + 2);
  g.restore();
}

function sign(g, x, y, text, color) {
  g.save();
  g.font = `900 30px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = Math.max(90, String(text).length * 18);
  g.fillStyle = '#ffffff';
  g.strokeStyle = color;
  g.lineWidth = 5;
  roundRect(g, x - w / 2, y - 24, w, 48, 14);
  g.fill();
  g.stroke();
  g.fillStyle = '#1b1b3a';
  g.fillText(text, x, y + 1);
  g.restore();
}

function warn(g, x, y, t, size) {
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
  g.font = `900 ${Math.round(size * 0.6)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 0, size * 0.08);
  g.restore();
}

function countdown(g, x, y, k, color, label, hot, t) {
  g.save();
  g.translate(x, y);
  const s = (hot ? 1.15 + 0.1 * Math.sin(t * 25) : 1) * Math.max(0.7, k);
  g.scale(s, s);
  g.beginPath();
  g.arc(0, 0, hot ? 95 : 60, 0, Math.PI * 2);
  g.fillStyle = hot ? '#ff5d73' : 'rgba(255,255,255,0.94)';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = hot ? '#ffffff' : '#1b1b3a';
  g.font = `900 ${hot ? 54 : 70}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 0, 4);
  g.restore();
}

/** "RUN!" with a little runner when you've slowed down. */
function runCue(g, x, y, k, color, t) {
  const pulse = 1.05 + 0.07 * Math.sin(t * 10);
  g.save();
  g.translate(x, y);
  g.scale(pulse * k, pulse * k);
  g.beginPath();
  g.arc(0, 0, 80, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = color;
  g.stroke();
  g.font = `48px ${EMOJI}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('🏃', 0, -22 - Math.abs(Math.sin(t * 9)) * 6);
  g.font = `900 34px ${FONT}`;
  g.fillStyle = '#1b1b3a';
  g.fillText('RUN!', 0, 32);
  g.restore();
}
