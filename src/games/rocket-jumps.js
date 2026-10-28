// Rocket Star Jumps: every player has a rocket on a launch pad in their lane. Every star jump pumps fuel into it
// (the gauge on the launch tower fills up and sparkles). A big star at the top of the lane flashes about once a
// second: a star jump right on the flash is worth a bonus. When the gauge is full: 3, 2, 1, LIFT-OFF! The rocket
// blasts off into space in a puff of smoke (bonus points) and a new, slightly thirstier rocket rolls in. Half-way
// the sky turns to space (planets, twinkly stars) and comets whizz past: while one is crossing your lane every
// star jump is DOUBLE fuel. Alone, a monkey in the ground crew does star jumps to the beat with you.
import { rand, clamp } from './kit.js';
import { drawMonkey } from './monkey.js';

const COUNT_STEP = 0.8; // s per number of the 3-2-1
const LAUNCH = 1.7; // s the blast-off takes
const ROLL = 0.9; // s a new rocket takes to roll in
const IDLE_CUE = 3; // s without a star jump before the little cue shows
const LIFTOFF_PTS = 5;
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';
const FONT = '"Arial Rounded MT Bold","Trebuchet MS",sans-serif';
const STRIPES = ['#ff5d73', '#3fb6ff', '#ffc93c', '#5ee08a', '#b37bff'];

export default {
  id: 'rocket-jumps',
  title: 'Rocket Star Jumps',
  icon: '🚀',
  color: '#7b5cff',
  moves: ['jacks'],
  howto: ['Do star jumps to fill your rocket with fuel!', 'Jump when the big star flashes for extra points.', 'Fill it up and... 3, 2, 1, LIFT-OFF!'],
  layout: 'columns',
  hearts: 0,
  stars: [45, 120, 190],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const slots = Math.max(1, Math.round(W / ctx.lane(1).w));
    const lanes = new Map(); // n -> rocket state
    let beatPhase = 0; // 0..1 towards the next beat
    let beatPeriod = 1.15;
    let lastBeat = -9;
    let twistAt = null; // game time space mode started
    const clouds = Array.from({ length: 5 }, () => ({ fx: rng(), y: rand(rng, 230, 480), s: rand(rng, 0.6, 1.1), sp: rand(rng, 8, 20) }));
    const twinkles = Array.from({ length: 60 }, () => ({ fx: rng(), y: rand(rng, 160, floor - 120), r: rand(rng, 2, 5), ph: rand(rng, 0, 6) }));

    const needFor = (k) => Math.round(Math.min(14, 6 + k) * clamp(Math.sqrt(ctx.level()), 0.85, 1.25));
    const lane = (n) => {
      if (!lanes.has(n)) {
        lanes.set(n, { n, fuel: 0, need: needFor(0), no: 0, phase: 'fuel', phaseT: 0, lastJack: ctx.t(), smoke: [], glow: -9, beatHit: -9, comet: null, nextComet: twistAt === null ? Infinity : ctx.t() + 2, color: STRIPES[(n - 1) % STRIPES.length], counted: 0, extra: 0 });
      }
      return lanes.get(n);
    };
    const padX = (n) => ctx.lane(n).x0 + ctx.lane(n).w * 0.8;
    const scaleOf = (n) => clamp(ctx.lane(n).w / 900, 0.55, 1.1);
    const space = () => (twistAt === null ? 0 : clamp((ctx.t() - twistAt) / 2, 0, 1));

    /** Was a star jump at time t on the beat? Generous: a quarter of the beat either side. */
    function onBeat(t) {
      const win = Math.max(0.2, 0.25 * beatPeriod);
      return t - lastBeat <= win || lastBeat + beatPeriod - t <= win;
    }

    /** Where the rocket is drawn now (its base centre) and how much flame it has. */
    function rocketPose(r) {
      const k = scaleOf(r.n);
      const t = ctx.t();
      const u = t - r.phaseT;
      let x = padX(r.n);
      let y = floor - 8;
      let flame = 0;
      if (r.phase === 'fuel') {
        const full = r.fuel / r.need;
        if (full > 0.7) x += Math.sin(t * 40) * 2 * k;
      } else if (r.phase === 'count') {
        x += Math.sin(t * 50) * (2 + u * 2) * k;
        flame = u > COUNT_STEP * 2 ? 0.45 + 0.15 * Math.sin(t * 30) : 0;
      } else if (r.phase === 'launch') {
        y -= 0.5 * 1100 * u * u + 80 * u;
        flame = 1 + 0.2 * Math.sin(t * 35);
      } else if (r.phase === 'roll') {
        const e = 1 - Math.pow(1 - clamp(u / ROLL, 0, 1), 3);
        x += (1 - e) * (ctx.lane(r.n).w * 0.25 + 160 * k);
      }
      return { x, y, k, flame };
    }

    function puff(r, x, y, big) {
      if (r.smoke.length > 70) r.smoke.shift();
      r.smoke.push({ x: x + rand(rng, -30, 30), y: y + rand(rng, -10, 10), vx: rand(rng, -140, 140) * (big ? 1.4 : 1), vy: rand(rng, -60, -10), r: rand(rng, 20, 40) * (big ? 1.3 : 1), life: 1, decay: rand(rng, 0.45, 0.8) });
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        // the beat: about once a second, a little quicker as the round warms up
        beatPeriod = 1.15 / Math.sqrt(clamp(level, 0.6, 2));
        beatPhase += dt / beatPeriod;
        if (beatPhase >= 1) {
          beatPhase -= 1;
          lastBeat = t;
        }
        // half-time: off into space, and comets start whizzing past
        if (twistAt === null && ctx.progress() >= 0.5) {
          twistAt = t;
          ctx.sfx.whoosh();
          ctx.sfx.cheer();
          ctx.fx.pop('SPACE MODE! 🌌 Catch the comets!', W / 2, H * 0.32, '#c9b8ff');
          for (const r of lanes.values()) r.nextComet = t + rand(rng, 1.5, 3);
        }
        const byN = new Map(players.map((p) => [p.n, p]));
        for (const p of players) {
          const r = lane(p.n);
          r.color = p.color;
          if (p.state !== 'active') continue; // held: frozen, nothing happens to them
          if (!p.jacked) continue;
          r.lastJack = t;
          const beat = onBeat(t);
          const comet = !!r.comet;
          const fuel = comet ? 2 : 1;
          const pts = beat ? 2 : 1;
          const label = comet ? (beat ? 'Double fuel! On the beat! +2' : 'Double fuel! +1') : beat ? 'On the beat! +2' : '+1';
          if (r.phase === 'fuel' || r.phase === 'roll') r.fuel = Math.min(r.need, r.fuel + fuel);
          else r.extra = Math.min(needFor(r.no + 1) - 1, r.extra + fuel); // pre-fuel the next rocket
          ctx.report.score(p.n, pts, p.head.x, p.head.y - p.s * 1.5, label);
          if (beat) {
            r.beatHit = t;
            ctx.sfx.gold();
          } else ctx.sfx.star();
          r.glow = t;
          const { x, k } = rocketPose(r);
          const gaugeTop = floor - 40 - 260 * k * (r.phase === 'fuel' || r.phase === 'roll' ? r.fuel / r.need : 1);
          ctx.fx.burst(x + 100 * k, gaugeTop, comet ? '#7ff0ff' : beat ? '#ffd23f' : '#fff6b0', beat || comet ? 16 : 9);
        }
        // every rocket's own story: fuel -> 3, 2, 1 -> lift-off -> a new rocket rolls in
        for (const r of lanes.values()) {
          const p = byN.get(r.n);
          const active = p && p.state === 'active';
          const u = t - r.phaseT;
          if (r.phase === 'fuel' && r.fuel >= r.need) {
            r.phase = 'count';
            r.phaseT = t;
            r.counted = 0;
            ctx.sfx.warn();
            ctx.fx.pop('FULL! Get ready...', padX(r.n), floor - 470 * scaleOf(r.n), '#ffe066');
          } else if (r.phase === 'count') {
            if (!active) r.phaseT += dt; // wait for a held / missing player
            const step = Math.floor((t - r.phaseT) / COUNT_STEP);
            if (step > r.counted && step < 3) {
              r.counted = step;
              ctx.sfx.tick();
            }
            if (u >= COUNT_STEP * 2) puff(r, padX(r.n), floor - 10, false);
            if (active && t - r.phaseT >= COUNT_STEP * 3) {
              r.phase = 'launch';
              r.phaseT = t;
              const k = scaleOf(r.n);
              ctx.report.score(r.n, LIFTOFF_PTS, padX(r.n), floor - 480 * k, `LIFT-OFF! +${LIFTOFF_PTS}`);
              ctx.sfx.boom();
              ctx.sfx.whoosh();
              ctx.fx.shake(8);
              ctx.fx.burst(padX(r.n), floor - 40, '#ffd23f', 26);
              for (let i = 0; i < 12; i++) puff(r, padX(r.n), floor - 10, true);
            }
          } else if (r.phase === 'launch') {
            if (u < 0.9) puff(r, padX(r.n), floor - 10, u < 0.4);
            if (u >= LAUNCH) {
              ctx.fx.burst(padX(r.n), 260, '#fff6b0', 20);
              ctx.sfx.cheer();
              r.phase = 'roll';
              r.phaseT = t;
              r.no++;
              r.need = needFor(r.no);
              r.fuel = Math.min(r.need - 1, r.extra);
              r.extra = 0;
              r.color = STRIPES[(r.n - 1 + r.no) % STRIPES.length];
            }
          } else if (r.phase === 'roll' && u >= ROLL) {
            r.phase = 'fuel';
            r.phaseT = t;
          }
          // smoke drifts and fades
          for (const s of r.smoke) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vx *= Math.exp(-dt * 1.5);
            s.r += 40 * dt;
            s.life -= s.decay * dt;
          }
          r.smoke = r.smoke.filter((s) => s.life > 0);
          // comets (space mode): DOUBLE fuel while one crosses your lane
          if (twistAt !== null) {
            if (r.comet && t - r.comet.t0 > r.comet.dur) {
              r.comet = null;
              r.nextComet = t + rand(rng, 5, 8) / Math.min(1.5, level);
            } else if (!r.comet && t >= r.nextComet) {
              r.comet = { t0: t, dur: 4.5, dir: rng() < 0.5 ? 1 : -1, y: rand(rng, 300, 420) };
              ctx.sfx.whoosh();
            }
          }
        }
        for (const c of clouds) c.fx = (c.fx + (c.sp * dt) / W + 1.2) % 1.2;
      },

      drawBack(g, players) {
        const t = ctx.t();
        const sk = space();
        for (let n = 1; n <= slots; n++) {
          const L = ctx.lane(n);
          const r = lane(n);
          const k = scaleOf(n);
          g.save();
          g.beginPath();
          g.rect(L.x0, 0, L.w, H);
          g.clip();
          // day sky, sun and clouds
          if (sk < 1) {
            const day = g.createLinearGradient(0, 0, 0, floor);
            day.addColorStop(0, '#4fbfff');
            day.addColorStop(1, '#d6f3ff');
            g.fillStyle = day;
            g.fillRect(L.x0, 0, L.w, H);
            g.fillStyle = '#ffe066';
            g.beginPath();
            g.arc(L.x0 + L.w * 0.18, 270, 60 * k + 10, 0, Math.PI * 2);
            g.fill();
            for (const c of clouds) cloud(g, L.x0 + (c.fx - 0.1) * L.w, c.y, 70 * c.s * k + 15, 'rgba(255,255,255,0.9)');
          }
          // space: deep blue-purple, twinkling stars, planets
          if (sk > 0) {
            g.save();
            g.globalAlpha = sk;
            const night = g.createLinearGradient(0, 0, 0, floor);
            night.addColorStop(0, '#0b0b3b');
            night.addColorStop(1, '#4b2f8f');
            g.fillStyle = night;
            g.fillRect(L.x0, 0, L.w, H);
            g.fillStyle = '#ffffff';
            for (const s of twinkles) {
              g.globalAlpha = sk * (0.45 + 0.55 * Math.abs(Math.sin(t * 2 + s.ph)));
              g.beginPath();
              g.arc(L.x0 + s.fx * L.w, s.y, s.r, 0, Math.PI * 2);
              g.fill();
            }
            g.globalAlpha = sk;
            planet(g, L.x0 + L.w * 0.2, 300, 55 * k + 12, '#ff9f5a', '#ffd9a8', true);
            planet(g, L.x0 + L.w * 0.55, 210, 26 * k + 6, '#7fd3ff', '#d9f4ff', false);
            g.restore();
            if (r.comet) comet(g, L, r.comet, t, k);
          }
          // the ground: grass by day, moon-blue at night
          const ground = g.createLinearGradient(0, floor - 30, 0, H);
          ground.addColorStop(0, sk > 0.5 ? '#5a7a9a' : '#6fd27a');
          ground.addColorStop(1, sk > 0.5 ? '#2f4a66' : '#3fa34d');
          g.fillStyle = ground;
          g.beginPath();
          g.moveTo(L.x0, H);
          g.lineTo(L.x0, floor - 10);
          g.quadraticCurveTo(L.cx, floor - 50, L.x1, floor - 10);
          g.lineTo(L.x1, H);
          g.fill();
          // launch pad, tower and fuel gauge
          const px = padX(n);
          g.fillStyle = '#9aa3b5';
          g.strokeStyle = '#4a5068';
          g.lineWidth = 5;
          rrect(g, px - 120 * k, floor - 14, 240 * k, 34, 10);
          g.fill();
          g.stroke();
          g.fillStyle = '#ffd23f';
          for (let i = 0; i < 5; i++) g.fillRect(px - 105 * k + i * 48 * k, floor - 4, 24 * k, 8);
          tower(g, px + 100 * k, floor, k, r, t);
          // smoke behind the rocket
          for (const s of r.smoke) {
            g.save();
            g.globalAlpha = clamp(s.life, 0, 1) * 0.85;
            g.fillStyle = '#f2f2f7';
            g.beginPath();
            g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            g.fill();
            g.restore();
          }
          const pose = rocketPose(r);
          if (pose.y > -400 * k) rocket(g, pose.x, pose.y, k, r.color, pose.flame, t);
          g.restore();
          if (n > 1) {
            g.fillStyle = 'rgba(255,255,255,0.85)';
            g.fillRect(L.x0 - 4, 0, 8, H);
          }
        }
        // a monkey in the ground crew does star jumps to the beat with a kid who plays alone
        if (players.length === 1) {
          const p = players[0];
          const L = p.lane;
          const ms = Math.min(70, L.w * 0.05);
          const up = beatPhase < 0.4 || t - lastBeat < 0.2;
          const r = lane(p.n);
          drawMonkey(g, L.x0 + L.w * 0.12, floor - 1.05 * ms - (up ? 14 : 0), ms, {
            t,
            mood: r.phase === 'launch' || t - r.beatHit < 0.5 ? 'taunt' : 'happy',
            armL: up ? 2.7 : 0.35,
            armR: up ? 2.7 : 0.35,
          });
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        for (let n = 1; n <= slots; n++) {
          const L = ctx.lane(n);
          const r = lane(n);
          const k = scaleOf(n);
          // the beat star: a ring closes in on it, and it flashes on the beat
          const age = t - lastBeat;
          const bx = L.cx;
          const by = 270;
          const R = 48 * clamp(L.w / 700, 0.75, 1.2);
          g.save();
          g.globalAlpha = 0.35 + 0.6 * beatPhase;
          g.strokeStyle = '#fff6b0';
          g.lineWidth = 7;
          g.beginPath();
          g.arc(bx, by, R * (1.15 + 1.5 * (1 - beatPhase)), 0, Math.PI * 2);
          g.stroke();
          g.restore();
          const pulse = 1 + 0.45 * Math.exp(-age * 7);
          const hit = t - r.beatHit < 0.4;
          if (age < 0.25) {
            g.save();
            g.globalAlpha = 1 - age / 0.25;
            g.fillStyle = hit ? '#ffd23f' : '#fff6b0';
            g.beginPath();
            g.arc(bx, by, R * 1.9, 0, Math.PI * 2);
            g.fill();
            g.restore();
          }
          starShape(g, bx, by, R * pulse, hit ? '#ffc21a' : '#ffe766', t);
          if (age < 0.3) label(g, 'JUMP!', bx, by + R * 1.75, 38 * clamp(L.w / 700, 0.8, 1.1), '#ffffff', '#7a4a00');
          // comet banner
          if (r.comet) label(g, '☄️ DOUBLE FUEL!', L.cx, by + R * 2.6, 40 * clamp(L.w / 700, 0.7, 1.1) * (1 + 0.06 * Math.sin(t * 10)), '#7ff0ff', '#0b0b3b');
          // 3, 2, 1, LIFT-OFF!
          const px = padX(n);
          const u = t - r.phaseT;
          if (r.phase === 'count') {
            const num = 3 - Math.min(2, Math.floor(u / COUNT_STEP));
            const f = (u % COUNT_STEP) / COUNT_STEP;
            badge(g, px, floor - 400 * k - 50, (60 + 30 * (1 - f)) * Math.max(0.8, k), String(num), r.color);
          } else if (r.phase === 'launch' && u < 1.1) {
            label(g, 'LIFT-OFF!', clamp(px, L.x0 + 170, L.x1 - 170), floor - 520 * k, 64 * Math.max(0.7, k) * (1 + 0.1 * Math.sin(t * 20)), '#ffd23f', '#7a2b00');
          }
        }
        // a little star-jump cue next to anyone who has stopped for a while
        for (const p of players) {
          if (p.state !== 'active') continue;
          const r = lane(p.n);
          if (t - r.lastJack < IDLE_CUE || r.phase === 'launch') continue;
          const k = p.s / 95;
          const x = Math.max(p.lane.x0 + 70 * k, p.head.x - p.s * 1.9);
          const y = p.head.y - p.s * 0.2 + Math.sin(t * 5) * 8;
          cue(g, x, y, k, p.color, t);
        }
      },

      needs() {
        return 'jacks';
      },

      /** Test bot: star jumps all the time. */
      bot() {
        return { move: 'jacks' };
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

function cloud(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x - r * 0.7, y + r * 0.15, r * 0.55, 0, Math.PI * 2);
  g.arc(x, y - r * 0.15, r * 0.75, 0, Math.PI * 2);
  g.arc(x + r * 0.75, y + r * 0.15, r * 0.5, 0, Math.PI * 2);
  g.rect(x - r * 0.7, y, r * 1.45, r * 0.55);
  g.fill();
}

function planet(g, x, y, r, color, light, ring) {
  const grad = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  grad.addColorStop(0, light);
  grad.addColorStop(1, color);
  if (ring) {
    g.strokeStyle = 'rgba(255, 230, 180, 0.8)';
    g.lineWidth = r * 0.16;
    g.beginPath();
    g.ellipse(x, y, r * 1.7, r * 0.45, -0.3, Math.PI, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  if (ring) {
    g.beginPath();
    g.ellipse(x, y, r * 1.7, r * 0.45, -0.3, 0, Math.PI);
    g.stroke();
  }
}

function comet(g, L, c, t, k) {
  const u = clamp((t - c.t0) / c.dur, 0, 1);
  const x = c.dir > 0 ? L.x0 - 150 + (L.w + 300) * u : L.x1 + 150 - (L.w + 300) * u;
  const y = c.y + Math.sin(u * Math.PI) * 40;
  const tail = 260 * k + 60;
  const grad = g.createLinearGradient(x, y, x - c.dir * tail, y);
  grad.addColorStop(0, 'rgba(160, 250, 255, 0.95)');
  grad.addColorStop(1, 'rgba(160, 250, 255, 0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x, y - 26 * k - 6);
  g.lineTo(x - c.dir * tail, y);
  g.lineTo(x, y + 26 * k + 6);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(x, y, 24 * k + 6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#7ff0ff';
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = '#7ff0ff';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(x - c.dir * (40 + i * 45) * k, y + Math.sin(t * 9 + i) * 18 * k, 5, 0, Math.PI * 2);
    g.fill();
  }
}

/** The launch tower with the fuel gauge: one segment per star jump needed. */
function tower(g, x, floor, k, r, t) {
  const h = 340 * k;
  const w = 46 * k + 8;
  const top = floor - h;
  g.strokeStyle = '#d64545';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(x - w / 2 - 8, floor);
  g.lineTo(x - w / 2 - 8, top);
  g.moveTo(x + w / 2 + 8, floor);
  g.lineTo(x + w / 2 + 8, top);
  for (let y = floor; y > top + 20; y -= 40 * k + 6) {
    g.moveTo(x - w / 2 - 8, y);
    g.lineTo(x + w / 2 + 8, y - 30 * k - 4);
  }
  g.stroke();
  // the gauge tube
  const gx = x - w / 2;
  const gy = floor - 40 - 260 * k;
  const gh = 260 * k;
  g.fillStyle = 'rgba(20, 24, 50, 0.85)';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  rrect(g, gx, gy, w, gh, w / 2);
  g.fill();
  g.stroke();
  const full = r.phase === 'fuel' || r.phase === 'roll' ? r.fuel / r.need : r.phase === 'count' ? 1 : 0;
  if (full > 0) {
    const fh = (gh - 8) * full;
    const grad = g.createLinearGradient(0, gy + gh, 0, gy);
    grad.addColorStop(0, '#5ee08a');
    grad.addColorStop(0.6, '#ffd23f');
    grad.addColorStop(1, '#ff7a3c');
    g.save();
    rrect(g, gx + 4, gy + 4, w - 8, gh - 8, (w - 8) / 2);
    g.clip();
    g.fillStyle = grad;
    g.fillRect(gx + 4, gy + gh - 4 - fh, w - 8, fh);
    // bubbles in the fuel
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 3; i++) {
      const by = gy + gh - 4 - ((t * 60 + i * 37) % Math.max(1, fh));
      g.beginPath();
      g.arc(gx + w * (0.3 + 0.2 * i), by, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  // one tick per star jump needed
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 3;
  for (let i = 1; i < r.need; i++) {
    const y = gy + gh - 4 - ((gh - 8) * i) / r.need;
    g.beginPath();
    g.moveTo(gx + 6, y);
    g.lineTo(gx + w * 0.45, y);
    g.stroke();
  }
  // full: it blinks
  if (full >= 1 && Math.sin(t * 16) > 0) {
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 8;
    rrect(g, gx - 4, gy - 4, w + 8, gh + 8, w / 2 + 4);
    g.stroke();
  }
  // a fuel sparkle just after each star jump
  if (t - r.glow < 0.35) {
    g.save();
    g.globalAlpha = 1 - (t - r.glow) / 0.35;
    g.font = `${Math.round(40 * k + 14)}px ${EMOJI}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('✨', x, gy + gh - (gh - 8) * Math.min(1, full) - 20);
    g.restore();
  }
  g.font = `${Math.round(30 * k + 10)}px ${EMOJI}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('⛽', x, gy - 26 * k - 8);
}

/** A friendly cartoon rocket standing on its base at (x, y). */
function rocket(g, x, y, k, stripe, flame, t) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.lineJoin = 'round';
  // flame
  if (flame > 0) {
    const len = (110 + 25 * Math.sin(t * 40)) * flame;
    for (const [c, w, l] of [
      ['#ff7a3c', 34, 1],
      ['#ffd23f', 22, 0.7],
      ['#fff6d0', 11, 0.45],
    ]) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(-w, -12);
      g.quadraticCurveTo(-w * 0.6, len * l * 0.6, 0, len * l + 10);
      g.quadraticCurveTo(w * 0.6, len * l * 0.6, w, -12);
      g.closePath();
      g.fill();
    }
  }
  g.strokeStyle = '#2b2d42';
  g.lineWidth = 6;
  // fins
  g.fillStyle = stripe;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 44, -150);
    g.quadraticCurveTo(s * 100, -90, s * 92, -10);
    g.lineTo(s * 44, -40);
    g.closePath();
    g.fill();
    g.stroke();
  }
  // nozzle
  g.fillStyle = '#6b7088';
  g.beginPath();
  g.moveTo(-26, -30);
  g.lineTo(26, -30);
  g.lineTo(34, -6);
  g.lineTo(-34, -6);
  g.closePath();
  g.fill();
  g.stroke();
  // body
  const body = g.createLinearGradient(-50, 0, 50, 0);
  body.addColorStop(0, '#d9dde8');
  body.addColorStop(0.35, '#ffffff');
  body.addColorStop(1, '#b9bfd0');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(-48, -30);
  g.lineTo(-48, -220);
  g.quadraticCurveTo(-46, -300, 0, -345);
  g.quadraticCurveTo(46, -300, 48, -220);
  g.lineTo(48, -30);
  g.closePath();
  g.fill();
  g.stroke();
  // nose cone
  g.fillStyle = stripe;
  g.beginPath();
  g.moveTo(-34, -285);
  g.quadraticCurveTo(-20, -320, 0, -345);
  g.quadraticCurveTo(20, -320, 34, -285);
  g.quadraticCurveTo(0, -275, -34, -285);
  g.closePath();
  g.fill();
  g.stroke();
  // stripe band
  g.fillStyle = stripe;
  g.fillRect(-46, -90, 92, 26);
  g.strokeRect(-46, -90, 92, 26);
  // porthole with a happy face
  g.fillStyle = '#8fdcff';
  g.beginPath();
  g.arc(0, -190, 30, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#6b7088';
  g.stroke();
  g.fillStyle = '#1b1b3a';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(s * 10, -196, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#1b1b3a';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(0, -188, 10, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath();
  g.ellipse(-12, -204, 8, 5, -0.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function starShape(g, x, y, r, color, t) {
  g.save();
  g.translate(x, y);
  g.rotate(Math.sin(t * 2) * 0.12);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.47 : r;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#d48a00';
  g.stroke();
  g.fillStyle = '#7a4a00';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(s * r * 0.17, -r * 0.05, r * 0.07, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#7a4a00';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(0, r * 0.1, r * 0.15, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  g.restore();
}

function label(g, text, x, y, size, fill, edge) {
  g.save();
  g.font = `900 ${Math.round(size)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(6, size * 0.18);
  g.strokeStyle = edge;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
  g.restore();
}

function badge(g, x, y, r, text, color) {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = '#1b1b3a';
  g.font = `900 ${Math.round(r * 1.2)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + r * 0.06);
  g.restore();
}

/** A small "do a star jump" cue: a bobbing star-person and the word JUMP! */
function cue(g, x, y, k, color, t) {
  const open = Math.sin(t * 6) > 0;
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.beginPath();
  g.arc(0, 0, 62, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.93)';
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = color;
  g.stroke();
  // a little stick figure doing a star jump
  g.strokeStyle = '#1b1b3a';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(0, -30, 9, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(0, -20);
  g.lineTo(0, 4);
  const a = open ? 1 : 0;
  g.moveTo(0, -14);
  g.lineTo(-14 - 8 * a, -14 - 18 * a + 18 * (1 - a));
  g.moveTo(0, -14);
  g.lineTo(14 + 8 * a, -14 - 18 * a + 18 * (1 - a));
  g.moveTo(0, 4);
  g.lineTo(-4 - 12 * a, 24);
  g.moveTo(0, 4);
  g.lineTo(4 + 12 * a, 24);
  g.stroke();
  g.font = `900 22px ${FONT}`;
  g.fillStyle = '#d48a00';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('JUMP!', 0, 44);
  g.restore();
}
