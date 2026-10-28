// Windmill Power: every player has a big colourful pinwheel windmill in their own lane. Swing your arms round
// and round in big circles to spin it up; stop and it slowly spins down. The spinning lights up the little
// house next to it and fills a power battery; when the battery is full it sets off fireworks (a bonus).
// Half-way a BIG WIND blows in (leaves flying, wind streaks): every arm circle counts double.
// Your avatar stays where you stand; the windmill turns above and behind you, and little curly arrows round
// your shoulders show what to do when you stop.
import { rand, clamp, sky } from './kit.js';

const KICK = 2.4; // rad/s of spin each arm circle adds
const WMAX = 16; // fastest spin, rad/s
const SPIN_DOWN = 2.2; // s for the spin to fade (at level 1)
const PER_CHARGE = 12; // arm circles to fill the battery at level 1
const BONUS = 5; // points for a full battery (fireworks!)
const IDLE_CUE = 1.8; // s without a circle before the curly-arrow cue shows
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';
const FONT = '"Arial Rounded MT Bold","Trebuchet MS",sans-serif';
const BLADES = ['#ff5d73', '#ffc93c', '#5ee08a', '#3fb6ff', '#b37bff', '#ff9f43'];
const BULBS = ['#ff5d73', '#ffc93c', '#5ee08a', '#3fb6ff', '#b37bff', '#ff9f43', '#ff7ad9'];

export default {
  id: 'windmill',
  title: 'Windmill Power',
  icon: '🌬️',
  color: '#7ad7c4',
  moves: ['circle'],
  howto: ['Swing your arms round and round in big circles!', 'Your windmill spins and lights up the house.', 'Fill the battery for fireworks!'],
  layout: 'columns',
  hearts: 0,
  stars: [100, 220, 330],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const slots = Math.max(1, Math.round(W / ctx.lane(1).w));
    const mills = new Map(); // n -> windmill state
    const rockets = []; // fireworks: { x, y, vy, top, color, boom (time it burst) or -1 }
    const leaves = []; // big wind: leaves blowing across
    const clouds = Array.from({ length: 6 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 60, 240), s: rand(rng, 0.6, 1.2) }));
    const streaks = Array.from({ length: 14 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 120, floor - 80), len: rand(rng, 120, 260), sp: rand(rng, 700, 1100) }));
    const flowers = Array.from({ length: 22 }, (_, i) => ({ fx: (i + rand(rng, 0.1, 0.9)) / 22, dy: rand(rng, 20, 120), e: i % 3 === 0 ? '🌼' : i % 3 === 1 ? '🌷' : '🌸' }));
    let twist = false;
    let leafIn = 0;

    const state = (n) => {
      if (!mills.has(n)) mills.set(n, { ang: rng() * 6, w: 0, meter: 0, last: -9, charges: 0, flash: -9 });
      return mills.get(n);
    };

    /** Where player n's windmill turns, and how big it is. */
    function hub(n) {
      const lane = ctx.lane(n);
      const R = Math.min(200, lane.w * 0.3);
      return { x: lane.cx, y: Math.max(R + 40, H * 0.26), R };
    }
    const scaleOf = (lane) => Math.min(1, lane.w / 700 + 0.25);
    const houseAt = (lane) => ({ x: lane.x0 + Math.max(85, lane.w * 0.15), k: scaleOf(lane) });
    const batteryAt = (lane) => ({ x: lane.x1 - Math.max(55, lane.w * 0.1), k: scaleOf(lane) });

    function launch(n, st) {
      const lane = ctx.lane(n);
      const h = houseAt(lane);
      for (let i = 0; i < 3; i++) {
        rockets.push({
          x: h.x + rand(rng, -20, 20),
          y: floor - 150 * h.k,
          tx: clamp(lane.x0 + lane.w * rand(rng, 0.15, 0.85), lane.x0 + 60, lane.x1 - 60),
          top: rand(rng, H * 0.12, H * 0.38),
          vy: -rand(rng, 900, 1150),
          delay: i * 0.35,
          color: BULBS[Math.floor(rng() * BULBS.length)],
          boom: -1,
        });
      }
      st.flash = ctx.t();
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        if (!twist && ctx.progress() >= 0.5) {
          twist = true;
          ctx.sfx.whoosh();
          ctx.fx.pop('BIG WIND! Circles count double! 🌬️', W / 2, H * 0.32, '#ffffff');
        }
        const cap = Math.round(PER_CHARGE * Math.min(1.6, level));
        for (const p of players) {
          const st = state(p.n);
          if (p.state !== 'active') continue; // held: the windmill freezes with them
          const c = p.circled;
          if (c > 0) {
            const hb = hub(p.n);
            st.w = Math.min(WMAX, st.w + KICK * c);
            st.last = t;
            const pts = c * (twist ? 2 : 1);
            ctx.report.score(p.n, pts, hb.x + rand(rng, -0.5, 0.5) * hb.R, hb.y - hb.R * 0.4, twist ? `+${pts} WHOOSH!` : `+${pts}`);
            ctx.sfx.whoosh();
            st.meter += c / cap;
            if (st.meter >= 1) {
              st.meter = 0;
              st.charges++;
              const b = batteryAt(p.lane);
              ctx.report.score(p.n, BONUS, b.x, floor - 340 * b.k, `FIREWORKS! +${BONUS}`);
              ctx.sfx.boom();
              ctx.sfx.cheer();
              launch(p.n, st);
            }
          }
          // the windmill spins down (a bit quicker when it's harder); the battery leaks a little when it stops
          st.w *= Math.exp(-dt / (SPIN_DOWN / Math.min(1.4, Math.max(0.8, level))));
          if (t - st.last > 3) st.meter = Math.max(0, st.meter - 0.02 * dt);
        }
        // everyone's windmill turns (a big wind keeps them all ticking over gently)
        for (const [, st] of mills) st.ang += (st.w + (twist ? 0.6 : 0.15)) * dt;
        // fireworks
        for (const r of rockets) {
          if (r.delay > 0) {
            r.delay -= dt;
            continue;
          }
          if (r.boom < 0) {
            r.y += r.vy * dt;
            r.x += (r.tx - r.x) * (1 - Math.exp(-dt / 0.4));
            if (r.y <= r.top) {
              r.boom = t;
              ctx.fx.burst(r.x, r.y, r.color, 26);
              ctx.sfx.pop();
            }
          }
        }
        for (let i = rockets.length - 1; i >= 0; i--) if (rockets[i].boom >= 0 && t - rockets[i].boom > 1.2) rockets.splice(i, 1);
        // big wind: leaves fly across
        if (twist) {
          leafIn -= dt;
          if (leafIn <= 0) {
            leafIn = rand(rng, 0.12, 0.3);
            leaves.push({ x: -60, y: rand(rng, 80, floor - 40), vx: rand(rng, 500, 900), ph: rand(rng, 0, 6), e: rng() < 0.5 ? '🍃' : '🍂', s: rand(rng, 0.7, 1.2) });
          }
        }
        for (const l of leaves) {
          l.x += l.vx * dt;
          l.y += Math.sin(t * 3 + l.ph) * 90 * dt;
        }
        for (let i = leaves.length - 1; i >= 0; i--) if (leaves[i].x > W + 80) leaves.splice(i, 1);
        for (const c of clouds) c.x = (c.x + (twist ? 120 : 18) * c.s * dt + 300) % (W + 600) - 300;
        for (const s of streaks) s.x = (s.x + s.sp * dt) % (W + 400);
      },

      drawBack(g, players) {
        const t = ctx.t();
        sky(g, W, H, twist ? '#5aa9e6' : '#6fd0ff', twist ? '#d4ecff' : '#e3f7ff');
        // sun
        g.fillStyle = '#ffe066';
        g.beginPath();
        g.arc(W - 180, 150, 85, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(255,224,102,0.6)';
        g.lineWidth = 10;
        g.lineCap = 'round';
        for (let i = 0; i < 10; i++) {
          const a = t * 0.3 + (i * Math.PI) / 5;
          g.beginPath();
          g.moveTo(W - 180 + Math.cos(a) * 105, 150 + Math.sin(a) * 105);
          g.lineTo(W - 180 + Math.cos(a) * 135, 150 + Math.sin(a) * 135);
          g.stroke();
        }
        for (const c of clouds) puff(g, c.x, c.y, 80 * c.s, 'rgba(255,255,255,0.92)');
        // rolling hills and the meadow
        g.fillStyle = '#8fdc7a';
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.62 + 40 * Math.sin(x * 0.004 + 1) + 20 * Math.sin(x * 0.011));
        g.lineTo(W, H);
        g.fill();
        const grass = g.createLinearGradient(0, floor - 90, 0, H);
        grass.addColorStop(0, '#5ec46b');
        grass.addColorStop(1, '#3a9d4c');
        g.fillStyle = grass;
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 40) g.lineTo(x, floor - 70 + 14 * Math.sin(x * 0.009 + 2));
        g.lineTo(W, H);
        g.fill();
        // flowers sway (a lot in the big wind)
        g.save();
        g.font = `40px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const f of flowers) {
          g.save();
          g.translate(f.fx * W, floor - 40 + f.dy);
          g.rotate(Math.sin(t * (twist ? 6 : 1.5) + f.fx * 20) * (twist ? 0.4 : 0.12));
          g.fillText(f.e, 0, 0);
          g.restore();
        }
        g.restore();
        // wind streaks in the big wind
        if (twist) {
          g.save();
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          g.lineWidth = 6;
          g.lineCap = 'round';
          for (const s of streaks) {
            const x = s.x - 200;
            g.beginPath();
            g.moveTo(x, s.y);
            g.quadraticCurveTo(x + s.len * 0.5, s.y - 22, x + s.len, s.y);
            g.stroke();
          }
          g.restore();
        }
        // every lane: house, windmill, battery
        for (let k = 1; k <= slots; k++) {
          const lane = ctx.lane(k);
          const st = mills.get(k);
          const here = players.some((p) => p.n === k);
          const w = st ? st.w : 0;
          const glow = clamp(w / 8, 0, 1);
          const meter = st ? st.meter : 0;
          const hb = hub(k);
          const h = houseAt(lane);
          const b = batteryAt(lane);
          // a string of bulbs from the windmill pole to the house: they light up as the battery fills
          const n = 7;
          const ax = h.x + 40 * h.k;
          const ay = floor - 150 * h.k;
          const bx = hb.x - 14;
          const by = floor - 230;
          g.strokeStyle = '#4a3b2a';
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(ax, ay);
          g.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 50, bx, by);
          g.stroke();
          for (let i = 0; i < n; i++) {
            const u = (i + 0.5) / n;
            const x = (1 - u) * (1 - u) * ax + 2 * u * (1 - u) * ((ax + bx) / 2) + u * u * bx;
            const y = (1 - u) * (1 - u) * ay + 2 * u * (1 - u) * (Math.max(ay, by) + 50) + u * u * by;
            const lit = here && (meter * n > i || t - (st?.flash ?? -9) < 1.5);
            bulb(g, x, y + 12, 13 * h.k + 3, BULBS[i % BULBS.length], lit, t + i);
          }
          house(g, h.x, floor + 10, h.k, here ? glow : 0, st ? st.charges : 0, here ? lane : null, t);
          pinwheel(g, hb.x, hb.y, hb.R, st ? st.ang : 0, here ? players.find((p) => p.n === k).color : '#c9d6ea', w, floor, t);
          battery(g, b.x, floor - 20, b.k, here ? meter : 0, t, here && st && t - st.flash < 1.2);
          // a ribbon between lanes
          if (k > 1) {
            g.fillStyle = 'rgba(255,255,255,0.85)';
            g.fillRect(lane.x0 - 4, 0, 8, H);
          }
        }
        // fireworks bloom in the sky behind everyone
        for (const r of rockets) {
          if (r.delay > 0) continue;
          if (r.boom < 0) {
            g.fillStyle = '#fff6b0';
            g.beginPath();
            g.arc(r.x, r.y, 9, 0, Math.PI * 2);
            g.fill();
            g.strokeStyle = 'rgba(255,200,80,0.8)';
            g.lineWidth = 5;
            g.beginPath();
            g.moveTo(r.x, r.y + 10);
            g.lineTo(r.x, r.y + 60);
            g.stroke();
          } else {
            const u = (t - r.boom) / 1.2;
            g.save();
            g.globalAlpha = Math.max(0, 1 - u);
            g.fillStyle = r.color;
            for (let i = 0; i < 16; i++) {
              const a = (i * Math.PI) / 8;
              const d = 30 + u * 190;
              g.beginPath();
              g.arc(r.x + Math.cos(a) * d, r.y + Math.sin(a) * d + u * u * 60, 11 * (1 - u * 0.5), 0, Math.PI * 2);
              g.fill();
            }
            g.fillStyle = '#ffffff';
            for (let i = 0; i < 8; i++) {
              const a = (i * Math.PI) / 4 + 0.4;
              const d = 15 + u * 110;
              g.beginPath();
              g.arc(r.x + Math.cos(a) * d, r.y + Math.sin(a) * d + u * u * 40, 6, 0, Math.PI * 2);
              g.fill();
            }
            g.restore();
          }
        }
        // leaves behind the players
        drawLeaves(g, leaves, t, 0);
      },

      drawFront(g, players) {
        const t = ctx.t();
        drawLeaves(g, leaves, t, 1);
        for (const p of players) {
          if (p.state !== 'active') continue;
          const st = state(p.n);
          // stopped? curly arrows round the shoulders show the move
          if (t - st.last > IDLE_CUE) {
            const L = p.px[11];
            const R = p.px[12];
            for (const [sh, dir] of [
              [L, -1],
              [R, 1],
            ])
              if (sh) circleArrow(g, sh.x + dir * p.s * 0.25, sh.y, p.s * 1.05, t * 4 * dir, p.color);
            bubble(g, p.head.x, p.head.y - p.s * 1.9, p.s / 95, p.color, '🔄', 'CIRCLES!', t);
          }
        }
      },

      needs() {
        return 'circle';
      },

      /** Test bot: arm circles all the time. */
      bot() {
        return { move: 'circle' };
      },
    };
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

/** A big pinwheel on a striped pole. w (spin speed) adds a blur ring and a happy face. */
function pinwheel(g, x, y, R, ang, color, w, floor, t) {
  // the pole
  g.save();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#4a3b2a';
  g.lineWidth = 5;
  g.fillRect(x - 14, y, 28, floor - y + 10);
  g.strokeRect(x - 14, y, 28, floor - y + 10);
  g.fillStyle = color;
  for (let yy = y + 30; yy < floor; yy += 70) {
    g.beginPath();
    g.moveTo(x - 14, yy);
    g.lineTo(x + 14, yy - 22);
    g.lineTo(x + 14, yy + 6);
    g.lineTo(x - 14, yy + 28);
    g.closePath();
    g.fill();
  }
  // speed ring
  const fast = Math.min(1, w / 10);
  if (fast > 0.15) {
    g.globalAlpha = 0.25 + 0.35 * fast;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 12;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(x, y, R * (1.08 + i * 0.07), ang * 1.3 + i * 2, ang * 1.3 + i * 2 + 1.2 + fast);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  // blades: curled pinwheel petals
  g.translate(x, y);
  g.rotate(ang);
  for (let i = 0; i < 6; i++) {
    g.save();
    g.rotate((i * Math.PI) / 3);
    g.fillStyle = BLADES[i];
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(R * 0.15, -R * 0.98);
    g.quadraticCurveTo(R * 0.55, -R * 0.8, R * 0.5, -R * 0.38);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(R * 0.15, -R * 0.98);
    g.lineTo(R * 0.25, -R * 0.55);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.restore();
  // the smiling centre (it stays upright)
  g.save();
  g.translate(x, y);
  g.fillStyle = '#ffd23f';
  g.strokeStyle = '#b8860b';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, R * 0.2, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#4a2b00';
  const r = R * 0.2;
  const happy = w > 3;
  for (const s of [-1, 1]) {
    g.beginPath();
    if (happy) {
      g.strokeStyle = '#4a2b00';
      g.lineWidth = 4;
      g.arc(s * r * 0.35, -r * 0.1, r * 0.16, Math.PI, 0);
      g.stroke();
    } else {
      g.arc(s * r * 0.35, -r * 0.15, r * 0.11, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = '#4a2b00';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(0, r * 0.1, r * (happy ? 0.45 : 0.3), 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  if (Math.sin(t * 2) > 0.9 && !happy) {
    g.font = `${Math.round(r * 0.9)}px ${EMOJI}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('💤', r * 1.4, -r * 1.2);
  }
  g.restore();
}

/** A little cottage; its windows glow as the windmill spins. Each full battery adds a flag on the roof. */
function house(g, x, y, k, glow, charges, lane, t) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  // walls
  g.fillStyle = '#fff3d6';
  g.strokeStyle = '#7a4a1e';
  g.lineWidth = 6;
  g.fillRect(-80, -150, 160, 150);
  g.strokeRect(-80, -150, 160, 150);
  // roof
  g.fillStyle = '#e8574d';
  g.beginPath();
  g.moveTo(-100, -145);
  g.lineTo(0, -240);
  g.lineTo(100, -145);
  g.closePath();
  g.fill();
  g.stroke();
  // chimney
  g.fillStyle = '#b5523e';
  g.fillRect(40, -235, 26, 50);
  g.strokeRect(40, -235, 26, 50);
  // flags for each full battery, along the roof
  const flags = Math.min(charges, 8);
  for (let i = 0; i < flags; i++) {
    const fx = -90 + i * 25;
    const fy = -150 - (95 * (fx + 100)) / 100;
    const yy = fx > 0 ? -150 - (95 * (100 - fx)) / 100 : fy;
    g.fillStyle = BULBS[i % BULBS.length];
    g.beginPath();
    g.moveTo(fx, yy - 4);
    g.lineTo(fx + 18, yy - 4);
    g.lineTo(fx + 9, yy + 16);
    g.closePath();
    g.fill();
  }
  // windows
  for (const wx of [-50, 22]) {
    const lit = glow > 0.05;
    g.fillStyle = lit ? `rgba(255, ${Math.round(210 + 30 * glow)}, ${Math.round(80 + 40 * glow)}, ${0.5 + 0.5 * glow})` : '#5a6c8c';
    g.fillRect(wx, -120, 30, 34);
    g.strokeRect(wx, -120, 30, 34);
    if (lit) {
      g.save();
      g.globalAlpha = 0.35 * glow;
      g.fillStyle = '#fff2a8';
      g.beginPath();
      g.arc(wx + 15, -103, 40, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  // door
  g.fillStyle = '#8a5a33';
  g.fillRect(-20, -70, 40, 70);
  g.strokeRect(-20, -70, 40, 70);
  // the lamp over the door
  g.fillStyle = glow > 0.3 ? '#fff2a8' : '#9aa3b5';
  g.beginPath();
  g.arc(0, -82, 9, 0, Math.PI * 2);
  g.fill();
  // smoke when it's all lit up
  if (lane && glow > 0.6) {
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.6 + i / 3) % 1;
      g.beginPath();
      g.arc(53 + Math.sin(u * 6) * 10, -245 - u * 90, 12 + u * 14, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

function bulb(g, x, y, r, color, lit, ph) {
  g.save();
  if (lit) {
    g.globalAlpha = 0.35 + 0.15 * Math.sin(ph * 4);
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r * 2, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  g.fillStyle = lit ? color : '#c8ccd6';
  g.strokeStyle = '#4a3b2a';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (lit) {
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** A big friendly battery that fills up with green power, with a lightning bolt on it. */
function battery(g, x, y, k, meter, t, full) {
  const w = 70 * k;
  const h = 300 * k;
  g.save();
  g.lineJoin = 'round';
  // cap
  g.fillStyle = '#9aa3b5';
  g.fillRect(x - w * 0.22, y - h - 18 * k, w * 0.44, 20 * k);
  // case
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#2b2f4a';
  g.lineWidth = 7;
  g.beginPath();
  g.rect(x - w / 2, y - h, w, h);
  g.fill();
  g.stroke();
  // power
  const m = full ? 1 : clamp(meter, 0, 1);
  if (m > 0) {
    const grad = g.createLinearGradient(0, y, 0, y - h);
    grad.addColorStop(0, '#2fbf5b');
    grad.addColorStop(1, full ? '#ffe066' : '#8af07a');
    g.fillStyle = grad;
    const fh = (h - 12) * m;
    g.fillRect(x - w / 2 + 6, y - 6 - fh, w - 12, fh);
    // bubbles of energy
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.8 + i / 3) % 1;
      const yy = y - 6 - u * fh;
      g.beginPath();
      g.arc(x + Math.sin(u * 9 + i) * w * 0.2, yy, 5 * k + 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  // the bolt
  g.font = `${Math.round(54 * k)}px ${EMOJI}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const pulse = full ? 1.2 + 0.15 * Math.sin(t * 20) : 1;
  g.save();
  g.translate(x, y - h / 2);
  g.scale(pulse, pulse);
  g.fillText('⚡', 0, 0);
  g.restore();
  g.restore();
}

/** Leaves in the big wind: layer 0 behind the players, layer 1 in front. */
function drawLeaves(g, leaves, t, layer) {
  if (!leaves.length) return;
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = layer; i < leaves.length; i += 2) {
    const l = leaves[i];
    g.save();
    g.translate(l.x, l.y);
    g.rotate(t * 5 + l.ph);
    g.font = `${Math.round(46 * l.s)}px ${EMOJI}`;
    g.fillText(l.e, 0, 0);
    g.restore();
  }
  g.restore();
}

/** A curly arrow going round a shoulder: "swing your arm round like this". */
function circleArrow(g, x, y, r, ang, color) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 14;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 1.5);
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = 8;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 1.5);
  g.stroke();
  // the arrow head at the end of the arc
  const ex = 0;
  const ey = -r;
  g.fillStyle = color;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(ex + r * 0.32, ey);
  g.lineTo(ex - r * 0.05, ey - r * 0.26);
  g.lineTo(ex - r * 0.05, ey + r * 0.26);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

function bubble(g, x, y, k, color, icon, word, t) {
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
  g.font = `44px ${EMOJI}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, 0, -24);
  g.font = `900 28px ${FONT}`;
  g.fillStyle = '#1b1b3a';
  g.fillText(word, 0, 30);
  g.restore();
}
