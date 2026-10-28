// Sky Flap: every player flies up their own column of sky. Flap your arms to rise, hold them out like an
// airplane to glide (sink slowly), do nothing and you sink. Stars hang in the sky above you: fly through them.
// Now and then a grumpy storm cloud drifts across just above you ("!" first): glide under it until it has
// gone, or it zaps you into a funny dizzy spin. Half-way the sun sets and golden stars worth 3 come out.
// Your avatar stays where you stand; height is shown by the sky scrolling past (clouds, the hill dropping
// away, space stars far up) and by the wings on your arms. Alone, a flying monkey keeps you company.
import { rand, clamp, warning } from './kit.js';
import { LM } from '../vision/landmarks.js';
import { drawMonkey } from './monkey.js';

const LIFT = 280; // px/s of climb per unit of flap energy
const SINK = 150; // px/s falling with arms down
const GLIDE = 45; // px/s sinking with arms out
const CATCH = 75; // a star is caught within this many px of height
const STORM_WARN = 1.3;
const STORM_CROSS = 3.6; // s a storm cloud takes to cross a lane at level 1
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';
const FONT = '"Arial Rounded MT Bold","Trebuchet MS",sans-serif';

export default {
  id: 'sky-flap',
  title: 'Sky Flap',
  icon: '🪽',
  color: '#5ec8ff',
  moves: ['flap', 'glide'],
  howto: ['Flap your arms to fly up and catch the stars!', 'Storm cloud coming? Hold your arms out wide to glide.', 'Arms down and you sink!'],
  layout: 'columns',
  hearts: 0,
  stars: [16, 32, 48],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const slots = Math.max(1, Math.round(W / ctx.lane(1).w));
    const fly = new Map(); // n -> flyer state
    const P = H + 500; // cloud parallax period
    const clouds = Array.from({ length: 4 }, () => Array.from({ length: 6 }, () => ({ fx: rand(rng, 0.05, 0.95), y0: rand(rng, 0, P), s: rand(rng, 0.6, 1.2) })));
    const twinkles = Array.from({ length: 40 }, () => ({ fx: rng(), fy: rand(rng, 0, H * 0.8), ph: rand(rng, 0, 6) }));
    const pal = { side: 1, x: W / 2, y: H / 2, cheer: -9 };
    let twist = false;

    const state = (n) => {
      if (!fly.has(n)) fly.set(n, { alt: 0, vy: 0, energy: 0, spin: 0, items: [], top: 150, lastFlap: -9, storm: null, nextStorm: 7 + rand(rng, 0, 3), refY: H * 0.5, x: ctx.lane(n).cx });
      return fly.get(n);
    };

    /** Keep a few stars hanging above the flyer. */
    function stock(f) {
      while (f.top < f.alt + 1100) {
        f.top += rand(rng, 240, 380);
        const gold = twist && rng() < 0.25;
        f.items.push({ alt: f.top, dx: rand(rng, -0.25, 0.25), gold, got: false });
      }
      for (let i = f.items.length - 1; i >= 0; i--) if (f.items[i].got || f.items[i].alt < f.alt - 700) f.items.splice(i, 1);
    }

    /** Where the storm is: 'warn' before it comes in, then u 0..1 across the lane. */
    function stormNow(f) {
      const s = f.storm;
      if (!s) return null;
      const into = ctx.t() - s.t0;
      return { warn: into < STORM_WARN, u: (into - STORM_WARN) / s.dur };
    }

    function stormX(n, s, u) {
      const lane = ctx.lane(n);
      const k = s.dir > 0 ? u : 1 - u;
      return lane.x0 - 170 + (lane.w + 340) * k;
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        if (!twist && ctx.progress() >= 0.5) {
          twist = true;
          ctx.sfx.cheer();
          ctx.fx.pop('Sunset! Golden stars! ⭐', W / 2, H * 0.3, '#ffd23f');
          for (const f of fly.values()) for (const it of f.items) if (it.alt > f.alt + 300 && rng() < 0.3) it.gold = true;
        }
        for (const p of players) {
          const f = state(p.n);
          f.refY = p.sh.y;
          f.x = p.sh.x;
          if (p.state !== 'active') continue; // held: frozen in the air, nothing can happen to them
          // flying: flaps add energy that fades; arms out glides; otherwise sink
          if (p.flapped) {
            f.energy += 1;
            f.vy += 60;
            f.lastFlap = t;
            ctx.sfx.flap();
          }
          // arms pass through "out wide" on every flap, so it's only a glide when they stay there
          const glide = p.pose.airplane && t - (f.lastFlap ?? -9) > 0.6;
          f.energy *= Math.exp(-dt / (glide ? 0.15 : 0.8)); // arms out: stop climbing, start gliding
          let target = Math.min(360, f.energy * LIFT) - (glide ? GLIDE : SINK);
          if (f.spin > 0) {
            f.spin -= dt;
            target = -240;
            f.energy = 0;
          }
          f.vy += (target - f.vy) * (1 - Math.exp(-dt / 0.35));
          f.alt += f.vy * dt;
          if (f.alt < 0) {
            f.alt = 0;
            f.vy = Math.max(0, f.vy);
          }
          stock(f);
          // stars: fly through them
          if (f.spin <= 0) {
            for (const it of f.items) {
              if (it.got || Math.abs(it.alt - f.alt) > CATCH) continue;
              it.got = true;
              const x = p.lane.cx + it.dx * p.lane.w;
              ctx.report.score(p.n, it.gold ? 3 : 1, x, p.sh.y - 60, it.gold ? 'Golden! +3' : '+1');
              ctx.fx.burst(x, p.sh.y, it.gold ? '#ffd23f' : '#fff6b0', it.gold ? 24 : 14);
              if (it.gold) ctx.sfx.gold();
              else ctx.sfx.star();
              pal.cheer = t;
            }
          }
          // storms: a cloud drifts across just above; glide under it
          if (!f.storm && t > f.nextStorm && f.spin <= 0) {
            const dur = STORM_CROSS / Math.min(1.5, level);
            f.storm = { alt: f.alt + 300, t0: t, dur, dir: rng() < 0.5 ? 1 : -1, zapped: false, glide: 0, frames: 0 };
            ctx.sfx.warn();
          }
          const s = stormNow(f);
          if (s && !s.warn) {
            const st = f.storm;
            const danger = s.u > 0.3 && s.u < 0.7;
            if (danger) {
              st.frames++;
              if (glide) st.glide++;
              const d = st.alt - f.alt;
              if (!st.zapped && d < 150 && d > -130) {
                st.zapped = true;
                f.spin = 1.6;
                f.vy = -280;
                ctx.report.miss(p.n, 'glide', p.head.x, p.head.y - p.s * 1.6, 'BZZT! Dizzy!');
                ctx.sfx.bonk();
                ctx.fx.burst(p.head.x, p.head.y, '#ffe066', 22);
              }
            }
            if (s.u >= 1) {
              if (!st.zapped && st.frames > 0 && st.glide >= st.frames * 0.5) {
                ctx.report.score(p.n, 2, p.head.x, p.head.y - p.s * 1.6, 'Smooth glide! +2');
                ctx.sfx.whoosh();
              }
              f.storm = null;
              const every = rand(rng, 8, 12) / Math.min(1.5, level);
              f.nextStorm = t + (twist ? every * 0.8 : every);
            }
          }
        }
        // the flying monkey buddy (only for someone playing alone)
        if (players.length === 1) {
          const p = players[0];
          if (p.sh.x < p.lane.cx - p.lane.w * 0.12) pal.side = 1;
          else if (p.sh.x > p.lane.cx + p.lane.w * 0.12) pal.side = -1;
          const gap = Math.min(380, p.lane.w * 0.32);
          const tx = clamp(p.sh.x + pal.side * gap, p.lane.x0 + 80, p.lane.x1 - 80);
          pal.x += (tx - pal.x) * (1 - Math.exp(-dt / 0.6));
          pal.y += (p.sh.y + 40 + Math.sin(t * 2) * 30 - pal.y) * (1 - Math.exp(-dt / 0.6));
        }
      },

      drawBack(g, players) {
        const t = ctx.t();
        for (let k = 1; k <= slots; k++) {
          const lane = ctx.lane(k);
          const f = fly.get(k);
          const alt = f ? f.alt : 0;
          const ref = f ? f.refY : H * 0.5;
          g.save();
          g.beginPath();
          g.rect(lane.x0, 0, lane.w, H);
          g.clip();
          // the sky darkens towards space as you rise; warm after sunset
          const hi = clamp(alt / 5000, 0, 1);
          const grad = g.createLinearGradient(0, 0, 0, H);
          let top = mix('#3fb0ff', '#1d1f6b', hi);
          let bot = mix('#c9f0ff', '#7a6ad8', hi);
          if (twist) {
            top = mix(top, '#7b4bc9', 0.35);
            bot = mix(bot, '#ffb36b', 0.55);
          }
          grad.addColorStop(0, top);
          grad.addColorStop(1, bot);
          g.fillStyle = grad;
          g.fillRect(lane.x0, 0, lane.w, H);
          // space twinkles, high up
          const tw = clamp((alt - 1500) / 2500, 0, 1) + (twist ? 0.25 : 0);
          if (tw > 0) {
            g.fillStyle = '#ffffff';
            for (const s of twinkles) {
              g.globalAlpha = Math.min(1, tw) * (0.5 + 0.5 * Math.sin(t * 3 + s.ph));
              g.beginPath();
              g.arc(lane.x0 + s.fx * lane.w, (s.fy + alt * 0.1) % (H * 0.8), 4, 0, Math.PI * 2);
              g.fill();
            }
            g.globalAlpha = 1;
          }
          // clouds slide down past you as you climb
          for (const c of clouds[(k - 1) % 4]) {
            const y = (((c.y0 + alt * 0.6) % P) + P) % P - 250;
            puff(g, lane.x0 + c.fx * lane.w, y, 90 * c.s * Math.min(1, lane.w / 700 + 0.3), 'rgba(255,255,255,0.85)');
          }
          // the hill you took off from drops away
          const gy = floor - 6 + alt;
          if (gy < H + 60) {
            g.fillStyle = '#5ec46b';
            g.beginPath();
            g.moveTo(lane.x0, H + 10);
            g.lineTo(lane.x0, gy + 40);
            g.quadraticCurveTo(lane.cx, gy - 50, lane.x1, gy + 40);
            g.lineTo(lane.x1, H + 10);
            g.fill();
            g.fillStyle = '#3fa34d';
            g.fillRect(lane.x0, gy + 90, lane.w, Math.max(0, H - gy));
            g.font = `40px ${EMOJI}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            for (let i = 0; i < 4; i++) g.fillText(i % 2 ? '🌼' : '🌷', lane.x0 + (i + 0.5) * (lane.w / 4), gy + 60 + (i % 2) * 14);
          }
          g.restore();
          // a ribbon between lanes
          if (k > 1) {
            g.fillStyle = 'rgba(255,255,255,0.85)';
            g.fillRect(lane.x0 - 4, 0, 8, H);
          }
        }
        // wings on every flyer's arms
        for (const p of players) {
          const f = state(p.n);
          for (const [sh, wr, side] of [
            [LM.shL, LM.wrL, -1],
            [LM.shR, LM.wrR, 1],
          ])
            wing(g, p.px[sh], p.px[wr], p.s, p.color, side);
          // wind streaks under your feet while climbing
          if (f.vy > 60 && f.alt > 10) {
            g.save();
            g.strokeStyle = 'rgba(255,255,255,0.8)';
            g.lineWidth = 6;
            g.lineCap = 'round';
            for (let i = 0; i < 3; i++) {
              const x = p.hip.x + (i - 1) * 0.5 * p.s;
              const y0 = p.hip.y + 2.4 * p.s + ((t * 400 + i * 70) % 120);
              g.beginPath();
              g.moveTo(x, y0);
              g.lineTo(x, y0 + 50);
              g.stroke();
            }
            g.restore();
          }
        }
        // the monkey buddy flies alongside a kid who plays alone
        if (players.length === 1) {
          const p = players[0];
          const f = state(p.n);
          const ms = Math.min(70, p.lane.w * 0.11);
          const happy = t - pal.cheer < 0.8;
          drawMonkey(g, pal.x, pal.y, ms, {
            t,
            mood: f.spin > 0 ? 'dizzy' : happy ? 'taunt' : 'happy',
            hat: 'propeller',
            wings: t * 12,
            armL: happy ? 2.8 : 1.2 + 0.3 * Math.sin(t * 3),
            armR: happy ? 2.8 : 1.2 - 0.3 * Math.sin(t * 3),
          });
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        for (const p of players) {
          const f = state(p.n);
          const lane = p.lane;
          const k = p.s / 95;
          // stars, placed by height relative to yours
          for (const it of f.items) {
            const y = f.refY - (it.alt - f.alt);
            if (y < -80 || y > H + 80) continue;
            const x = lane.cx + it.dx * lane.w;
            star(g, x, y, (it.gold ? 52 : 42) * Math.max(0.8, k), it.gold ? '#ffc21a' : '#fff07a', t);
          }
          // the storm cloud
          const s = stormNow(f);
          if (s) {
            const y = f.refY - (f.storm.alt - f.alt);
            if (s.warn) warning(g, f.storm.dir > 0 ? lane.x0 + 70 : lane.x1 - 70, clamp(y, 90, H - 90), t, 80);
            else storm(g, stormX(p.n, f.storm, s.u), y, Math.min(1.1, lane.w / 600 + 0.35), t);
          }
          if (p.state !== 'active') continue;
          // dizzy spin
          if (f.spin > 0) {
            g.save();
            g.font = `${Math.round(48 * k)}px ${EMOJI}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            for (let i = 0; i < 3; i++) {
              const a = t * 7 + (i * Math.PI * 2) / 3;
              g.fillText('💫', p.head.x + Math.cos(a) * p.s * 0.9, p.head.y - p.s * 0.7 + Math.sin(a) * p.s * 0.3);
            }
            g.restore();
            continue;
          }
          // cues: GLIDE while a storm is about; FLAP when sinking
          const x = p.head.x;
          const y = p.head.y - p.s * 1.75;
          if (s && s.u < 0.75) bubble(g, x, y, k, p.color, '✈️', 'GLIDE!', '#ffe9a8', t);
          else if (f.energy < 0.35) bubble(g, x, y, k, p.color, '🐦', 'FLAP!', '#ffffff', t);
        }
      },

      needs(n) {
        const f = fly.get(n);
        const s = f ? stormNow(f) : null;
        return s && s.u < 0.75 ? 'glide' : 'flap';
      },

      /** Test bot: flap, but glide while a storm cloud is coming across. */
      bot(p) {
        const f = fly.get(p.n);
        const s = f ? stormNow(f) : null;
        return s && s.u < 0.72 ? { pose: 'airplane' } : { move: 'flap' };
      },
    };
  },
};

// ------------------------------------------------------------------------------------------------ drawing

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((sh) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function puff(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x - r * 0.7, y + r * 0.15, r * 0.55, 0, Math.PI * 2);
  g.arc(x, y - r * 0.15, r * 0.75, 0, Math.PI * 2);
  g.arc(x + r * 0.75, y + r * 0.15, r * 0.5, 0, Math.PI * 2);
  g.rect(x - r * 0.7, y, r * 1.45, r * 0.55);
  g.fill();
}

/** A feathery wing along the arm, from the shoulder past the hand. */
function wing(g, sh, wr, s, color, side) {
  if (!sh || !wr) return;
  const dx = wr.x - sh.x;
  const dy = wr.y - sh.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  // feathers hang on the underside of the arm (or point outward when the arm is straight up/down)
  let nx = -uy;
  let ny = ux;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  if (Math.abs(ny) < 0.3) {
    nx = side;
    ny = 0.3;
  }
  const len = L + 0.55 * s;
  g.save();
  g.lineJoin = 'round';
  for (let i = 4; i >= 0; i--) {
    const along = len * (0.22 + 0.19 * i);
    const out = s * (0.42 - 0.04 * i);
    const cx = sh.x + ux * along + nx * out;
    const cy = sh.y + uy * along + ny * out;
    g.fillStyle = i % 2 ? '#ffffff' : '#f1f6ff';
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(cx, cy, s * (0.55 - 0.04 * i), s * 0.2, Math.atan2(ny, nx) - 0.35 * Math.sign(ux * ny - uy * nx || 1), 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineWidth = s * 0.22;
  g.beginPath();
  g.moveTo(sh.x, sh.y);
  g.lineTo(sh.x + ux * len, sh.y + uy * len);
  g.stroke();
  g.restore();
}

function star(g, x, y, r, color, t) {
  g.save();
  g.translate(x, y);
  g.rotate(Math.sin(t * 2 + x) * 0.2);
  const k = 1 + 0.08 * Math.sin(t * 6 + y * 0.01);
  g.scale(k, k);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#d48a00';
  g.stroke();
  g.fillStyle = '#7a4a00';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(s * r * 0.17, -r * 0.05, r * 0.07, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#7a4a00';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, r * 0.1, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  g.restore();
}

/** A grumpy storm cloud with a flickering lightning bolt. */
function storm(g, x, y, k, t) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  if (Math.sin(t * 13) > 0.3) {
    g.fillStyle = '#ffe066';
    g.strokeStyle = '#b8860b';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-10, 40);
    g.lineTo(25, 40);
    g.lineTo(5, 85);
    g.lineTo(35, 85);
    g.lineTo(-20, 170);
    g.lineTo(-5, 105);
    g.lineTo(-30, 105);
    g.closePath();
    g.fill();
    g.stroke();
  }
  puff(g, 0, 0, 130, '#5c6378');
  puff(g, -10, -10, 110, '#737b92');
  // grumpy face
  g.strokeStyle = '#2a2e3d';
  g.lineWidth = 7;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 55, -30);
    g.lineTo(s * 20, -15);
    g.stroke();
    g.fillStyle = '#2a2e3d';
    g.beginPath();
    g.arc(s * 35, 0, 9, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 50, 28, 1.15 * Math.PI, 1.85 * Math.PI);
  g.stroke();
  g.restore();
}

function bubble(g, x, y, k, color, icon, word, fill, t) {
  const pulse = 1.05 + 0.07 * Math.sin(t * 12);
  g.save();
  g.translate(x, y);
  g.scale(pulse * k, pulse * k);
  g.beginPath();
  g.arc(0, 0, 78, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = color;
  g.stroke();
  g.font = `44px ${EMOJI}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, 0, -24);
  g.font = `900 36px ${FONT}`;
  g.fillStyle = '#1b1b3a';
  g.fillText(word, 0, 30);
  g.restore();
}
