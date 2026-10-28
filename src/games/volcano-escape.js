// Volcano Escape: a friendly volcano puffs rocks into the sky. A "!" and a shadow on the ground show where each
// one will land about a second before it does: step out of the way! Every rock that lands where you were
// standing a moment ago is a dodge (1 point). Later the rocks fall faster and sometimes two at once, and
// half-way through (and again near the end) the volcano does a LAVA BURST: lots of warnings at once, find
// a safe spot between them. The team shares 5 hearts.
import { rand, clamp, warning, sky } from './kit.js';

const FIRST_ROCK = 2; // s into the round
const BURSTS = [0.5, 0.82]; // round progress of the lava bursts
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';

/** Seconds of warning before a rock lands: shorter as the level rises (never under 0.95 s). */
const warnFor = (level) => clamp(1.45 - 0.3 * (level - 1), 0.95, 1.6);

/** Half the width of the ground a rock hits, for a player of size s (a little smaller than it looks). */
const hitHalf = (rock, s) => rock.r * 0.8 + 0.45 * s;

export default {
  id: 'volcano-escape',
  title: 'Volcano Escape',
  icon: '🌋',
  color: '#e76f51',
  moves: ['sidestep'],
  howto: ['Rocks fly out of the volcano.', 'Watch for the ! sign on the ground...', 'then step out of the way!'],
  layout: 'shared',
  hearts: 5,
  stars: [18, 38, 58],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const crater = { x: W / 2, y: H * 0.27 };
    /** @type {{ x: number, r: number, born: number, warn: number, hot: boolean, pts: number, threat: Set<number>, landed: boolean, shape: number[], spin: number }[]} */
    const rocks = [];
    const dizzy = new Map(); // n -> game time their BONK! wears off
    const puffs = []; // smoke from the crater
    const dinos = []; // a little dinosaur strolling past now and then, just for fun
    let nextIn = FIRST_ROCK;
    let burstAt = -9; // when the current lava burst was announced
    let burstsDone = 0;
    let mouthOpen = 0; // the volcano says "O!" when it fires
    let lookX = W / 2;
    let dinoIn = 6;
    const clouds = Array.from({ length: 4 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 70, 230), s: rand(rng, 0.8, 1.3) }));
    const palms = [
      { x: 150, s: 1.25 },
      { x: 360, s: 0.9 },
      { x: W - 360, s: 0.95 },
      { x: W - 140, s: 1.3 },
    ];

    const active = (players) => players.filter((p) => p.state === 'active');

    /** Fires one rock that will land at x after `warn` seconds. */
    function fire(x, warn, hot = false) {
      const shape = Array.from({ length: 9 }, () => rand(rng, 0.78, 1.08));
      rocks.push({ x: clamp(x, 140, W - 140), r: hot ? 78 : rand(rng, 70, 90), born: ctx.t(), warn, hot, pts: hot ? 2 : 1, threat: new Set(), landed: false, shape, spin: rand(rng, -4, 4) });
      mouthOpen = 0.5;
      lookX = x;
      for (let i = 0; i < 3; i++) puffs.push({ x: crater.x + rand(rng, -50, 50), y: crater.y, r: rand(rng, 30, 55), age: 0, vx: rand(rng, -30, 30) });
    }

    /** A lava burst: one rock on every player, then more across the ground with safe gaps between them. */
    function lavaBurst(players) {
      ctx.sfx.boom();
      ctx.fx.shake(16);
      ctx.fx.pop('LAVA BURST!', W / 2, H * 0.4, '#ffb347');
      const warn = warnFor(ctx.level()) + 0.6;
      const xs = [];
      const gap = 2 * (90 * 0.8 + 0.45 * 90) + 2.4 * 90; // two hit zones plus room for a kid between them
      const ok = (x) => x > 150 && x < W - 150 && xs.every((o) => Math.abs(o - x) >= gap);
      for (const p of active(players)) if (ok(p.hip.x)) xs.push(p.hip.x);
      const want = clamp(3 + players.length, 4, 6);
      for (let tries = 0; xs.length < want && tries < 60; tries++) {
        const x = rand(rng, 160, W - 160);
        if (ok(x)) xs.push(x);
      }
      xs.sort((a, b) => a - b);
      xs.forEach((x, i) => fire(x, warn + i * 0.18, true));
    }

    /** Is player p inside the hit zone of this rock right now? */
    const under = (rock, p) => Math.abs(p.hip.x - rock.x) < hitHalf(rock, p.s);

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        const live = active(players);
        mouthOpen = Math.max(0, mouthOpen - dt);

        // the lava bursts: announce, hold the normal rocks back for a moment, then fire
        if (burstsDone < BURSTS.length && ctx.progress() >= BURSTS[burstsDone]) {
          burstsDone++;
          burstAt = t;
          lavaBurst(players);
          nextIn = Math.max(nextIn, warnFor(level) + 2.2);
        }

        // ordinary rocks: aimed at a player, so standing still never works
        nextIn -= dt;
        if (nextIn <= 0 && !live.length) nextIn = 0.5; // nobody to play with right now
        else if (nextIn <= 0) {
          const p = live[Math.floor(rng() * live.length)];
          const x = clamp(p.hip.x + rand(rng, -0.4, 0.4) * p.s, 140, W - 140);
          // never drop a rock on top of another one's shadow: there must always be a way out
          if (rocks.some((r) => !r.landed && Math.abs(r.x - x) < 2 * hitHalf(r, 90) + 20)) nextIn = 0.25;
          else {
            const warn = warnFor(level);
            fire(x, warn);
            // later in the round: two at once, the second right next to the first so there's one way out
            if (ctx.progress() > 0.5 && rng() < 0.35) {
              const side = x < 450 ? 1 : x > W - 450 ? -1 : rng() < 0.5 ? -1 : 1;
              fire(x + side * rand(rng, 260, 330), warn + 0.15);
            }
            const crowd = 1 + 0.45 * Math.max(0, live.length - 1);
            nextIn = rand(rng, 1.9, 2.6) / (Math.min(1.8, level) * crowd);
          }
        }

        // who is standing under each rock while it falls (they get the point if they get out in time)
        for (const rock of rocks) {
          if (rock.landed) continue;
          for (const p of live) if (under(rock, p)) rock.threat.add(p.n);
          if (t - rock.born < rock.warn) continue;
          rock.landed = true;
          rock.landedAt = t;
          ctx.sfx.whoosh();
          ctx.fx.burst(rock.x, floor - 20, rock.hot ? '#ff8c42' : '#a0703c', 12);
          ctx.fx.shake(4);
          for (const p of live) {
            if (under(rock, p)) {
              ctx.report.hit(p.n, p.head.x, p.head.y);
              ctx.report.miss(p.n, 'sidestep', p.head.x, p.head.y - p.s * 1.3, 'BONK!');
              ctx.sfx.bonk();
              dizzy.set(p.n, t + 1.2);
            } else if (rock.threat.has(p.n)) {
              ctx.report.score(p.n, rock.pts, p.head.x, p.head.y - p.s * 1.3, rock.pts > 1 ? 'SUPER DODGE!' : 'DODGED!');
              ctx.sfx.score();
            }
          }
        }
        for (let i = rocks.length - 1; i >= 0; i--) if (rocks[i].landed && t - rocks[i].landedAt > 0.6) rocks.splice(i, 1);

        // smoke, clouds and the odd dinosaur
        for (const s of puffs) {
          s.age += dt;
          s.y -= 70 * dt;
          s.x += s.vx * dt;
          s.r += 18 * dt;
        }
        for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].age > 3.5) puffs.splice(i, 1);
        if (rng() < dt * 0.8) puffs.push({ x: crater.x + rand(rng, -40, 40), y: crater.y, r: rand(rng, 25, 40), age: 0, vx: rand(rng, -20, 20) });
        for (const c of clouds) c.x = (c.x + 12 * dt * c.s) % (W + 300);
        dinoIn -= dt;
        if (dinoIn <= 0) {
          dinoIn = rand(rng, 9, 16);
          const dir = rng() < 0.5 ? 1 : -1;
          dinos.push({ x: dir > 0 ? -120 : W + 120, dir, sp: rand(rng, 70, 110), e: rng() < 0.5 ? '🦕' : '🦖' });
        }
        for (const d of dinos) d.x += d.dir * d.sp * dt;
        for (let i = dinos.length - 1; i >= 0; i--) if (dinos[i].x < -200 || dinos[i].x > W + 200) dinos.splice(i, 1);
      },

      drawBack(g) {
        const t = ctx.t();
        sky(g, W, H, '#6cc7ff', '#ffd9a8');
        // sun and clouds
        g.fillStyle = '#ffe066';
        g.beginPath();
        g.arc(260, 170, 85, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.font = `120px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.globalAlpha = 0.9;
        for (const c of clouds) g.fillText('☁️', c.x - 150, c.y);
        g.restore();
        // far green hills
        g.fillStyle = '#8fd17a';
        g.beginPath();
        g.moveTo(0, H * 0.7);
        for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.62 - 40 * Math.sin(x * 0.004 + 1) - 25 * Math.sin(x * 0.011));
        g.lineTo(W, H * 0.7);
        g.fill();
        // the volcano
        const base = H * 0.74;
        const cone = g.createLinearGradient(0, crater.y, 0, base);
        cone.addColorStop(0, '#8a4b2a');
        cone.addColorStop(1, '#c0703f');
        g.fillStyle = cone;
        g.beginPath();
        g.moveTo(crater.x - 760, base);
        g.quadraticCurveTo(crater.x - 300, base - 120, crater.x - 170, crater.y);
        g.lineTo(crater.x + 170, crater.y);
        g.quadraticCurveTo(crater.x + 300, base - 120, crater.x + 760, base);
        g.closePath();
        g.fill();
        g.lineWidth = 8;
        g.strokeStyle = '#5c2e17';
        g.stroke();
        // lava dribbling down, glowing a little brighter during a burst
        const hot = t - burstAt < 3;
        g.lineCap = 'round';
        for (const [dx, len, w] of [[-90, 260, 34], [20, 340, 40], [110, 210, 30]]) {
          g.strokeStyle = hot ? '#ffcf3f' : '#ff8c2a';
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(crater.x + dx * 0.6, crater.y + 5);
          for (let k = 1; k <= 6; k++) g.lineTo(crater.x + dx * (0.6 + k * 0.12) + Math.sin(k * 1.7 + dx) * 22, crater.y + (len * k) / 6);
          g.stroke();
        }
        // crater rim and glow
        g.fillStyle = hot ? '#ffe066' : '#ffb347';
        g.beginPath();
        g.ellipse(crater.x, crater.y, 170, 34, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ff6b2a';
        g.beginPath();
        g.ellipse(crater.x, crater.y + 4, 130, 20, 0, 0, Math.PI * 2);
        g.fill();
        // a friendly face that watches where the rocks go
        const fy = crater.y + 170;
        const look = clamp((lookX - crater.x) / W, -0.5, 0.5) * 24;
        for (const ex of [-70, 70]) {
          g.fillStyle = '#fff';
          g.beginPath();
          g.ellipse(crater.x + ex, fy, 30, 36, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#2b1a10';
          g.beginPath();
          g.arc(crater.x + ex + look, fy + 6, 14, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#ff9aa2';
        g.globalAlpha = 0.6;
        for (const ex of [-120, 120]) {
          g.beginPath();
          g.ellipse(crater.x + ex, fy + 55, 26, 14, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
        g.strokeStyle = '#3d1f0f';
        g.fillStyle = '#3d1f0f';
        g.lineWidth = 9;
        g.beginPath();
        if (mouthOpen > 0 || hot) {
          g.ellipse(crater.x, fy + 75, 26, 30, 0, 0, Math.PI * 2);
          g.fill();
        } else {
          g.arc(crater.x, fy + 45, 45, 0.2 * Math.PI, 0.8 * Math.PI);
          g.stroke();
        }
        // smoke
        g.save();
        for (const s of puffs) {
          g.globalAlpha = Math.max(0, 0.75 - s.age / 4.5);
          g.fillStyle = '#f2ece6';
          g.beginPath();
          g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
        // jungle floor
        const grass = g.createLinearGradient(0, H * 0.72, 0, H);
        grass.addColorStop(0, '#5cc25a');
        grass.addColorStop(1, '#2f8f46');
        g.fillStyle = grass;
        g.beginPath();
        g.moveTo(0, H);
        g.lineTo(0, H * 0.74);
        for (let x = 0; x <= W; x += 60) g.lineTo(x, H * 0.73 + 10 * Math.sin(x * 0.02));
        g.lineTo(W, H);
        g.fill();
        g.fillStyle = 'rgba(150, 95, 50, 0.35)';
        g.beginPath();
        g.ellipse(W / 2, floor + 30, W * 0.46, 70, 0, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        for (const p of palms) {
          g.font = `${Math.round(230 * p.s)}px ${EMOJI}`;
          g.fillText('🌴', p.x, H * 0.8);
        }
        g.font = `110px ${EMOJI}`;
        for (const d of dinos) {
          g.save();
          g.translate(d.x, H * 0.72 + Math.abs(Math.sin(t * 6 + d.x)) * -8);
          g.scale(-d.dir, 1);
          g.fillText(d.e, 0, 0);
          g.restore();
        }
        g.restore();
        // shadows of the rocks about to land: on the ground, behind the kids' feet
        for (const rock of rocks) {
          if (rock.landed) continue;
          const f = clamp((t - rock.born) / rock.warn, 0, 1);
          const half = hitHalf(rock, 90);
          g.save();
          g.globalAlpha = 0.35 + 0.45 * f;
          g.fillStyle = rock.hot ? '#ff6b2a' : '#5a2d0c';
          g.beginPath();
          g.ellipse(rock.x, floor, half * (0.6 + 0.4 * f), 34, 0, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 0.9;
          g.setLineDash([22, 16]);
          g.lineWidth = 7;
          g.strokeStyle = '#ff3b3b';
          g.beginPath();
          g.ellipse(rock.x, floor, half, 40, 0, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        for (const rock of rocks) {
          const age = t - rock.born;
          if (rock.landed) {
            // a crumbly little pile that fades away
            const k = (t - rock.landedAt) / 0.6;
            g.save();
            g.globalAlpha = 1 - k;
            for (let i = 0; i < 5; i++) drawRock(g, rock.x + (i - 2) * rock.r * 0.45 * (1 + k), floor - 18 - (i % 2) * 14, rock.r * 0.35, rock.shape, i, rock.hot);
            g.restore();
            continue;
          }
          const f = age / rock.warn;
          // the warning sign, high up where the rock will come down
          warning(g, rock.x, H * 0.16, t, f > 0.6 ? 96 : 80);
          // up out of the crater, then straight down onto the shadow
          let x;
          let y;
          let r;
          if (f < 0.35) {
            const u = f / 0.35;
            x = crater.x + (rock.x - crater.x) * u * 0.3;
            y = crater.y - (crater.y + 160) * Math.sqrt(u);
            r = rock.r * 0.5;
          } else {
            const u = (f - 0.35) / 0.65;
            x = rock.x;
            y = -140 + (floor - rock.r * 0.6 + 140) * u * u;
            r = rock.r * (0.6 + 0.4 * u);
            // a fiery streak behind it
            g.save();
            g.globalAlpha = 0.55;
            const trail = g.createLinearGradient(0, y - r * 3, 0, y);
            trail.addColorStop(0, 'rgba(255, 200, 80, 0)');
            trail.addColorStop(1, rock.hot ? '#ff7b2a' : '#ffcf7a');
            g.fillStyle = trail;
            g.beginPath();
            g.moveTo(x - r * 0.7, y);
            g.lineTo(x, y - r * 3.2);
            g.lineTo(x + r * 0.7, y);
            g.fill();
            g.restore();
          }
          drawRock(g, x, y, r, rock.shape, age * rock.spin, rock.hot);
        }
        // a little BONK! and dizzy stars over anyone who got bopped
        g.save();
        g.font = `70px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const p of players) {
          const until = dizzy.get(p.n) ?? 0;
          if (t > until) continue;
          for (let i = 0; i < 3; i++) {
            const a = t * 6 + (i * Math.PI * 2) / 3;
            g.fillText('💫', p.head.x + Math.cos(a) * p.s * 0.9, p.head.y - p.s * 0.9 + Math.sin(a) * p.s * 0.25);
          }
        }
        g.restore();
      },

      needs() {
        return 'sidestep';
      },

      /** Test bot: when a rock is coming down on you, walk to the nearest spot clear of every shadow. */
      bot(p) {
        const t = ctx.t();
        const zones = rocks.filter((r) => !r.landed).map((r) => ({ x0: r.x - hitHalf(r, p.s), x1: r.x + hitHalf(r, p.s), in: r.born + r.warn - t }));
        const x = safeSpot(p, zones, W);
        return x === null ? {} : { x };
      },
    };
  },
};

/**
 * Where a good player would step to get clear of the danger zones ({x0, x1, in: seconds until it lands}):
 * the nearest spot outside all of them that they can walk to without crossing one that lands on the way.
 * null: they're fine where they are (or should wait for a rock to land before walking through its spot).
 */
function safeSpot(p, zones, W) {
  const inside = (x, m) => zones.some((z) => x > z.x0 - m && x < z.x1 + m);
  if (!inside(p.hip.x, 0.3 * p.s)) return null;
  const speed = 4 * p.s; // body widths per second a kid can shuffle sideways
  const m = 0.6 * p.s;
  let best = null;
  for (const z of zones) {
    for (const x of [z.x0 - m, z.x1 + m]) {
      if (x < 180 || x > W - 180 || inside(x, 0.4 * p.s)) continue;
      const lo = Math.min(x, p.hip.x);
      const hi = Math.max(x, p.hip.x);
      const arrive = (hi - lo) / speed;
      // a zone on the way that isn't the one we're standing in, landing before we're past it
      const blocked = zones.some((o) => o.x1 > lo && o.x0 < hi && !(p.hip.x > o.x0 && p.hip.x < o.x1) && o.in < arrive + 0.15);
      if (blocked) continue;
      if (best === null || Math.abs(x - p.hip.x) < Math.abs(best - p.hip.x)) best = x;
    }
  }
  return best;
}

/** A lumpy rock (or glowing lava rock) with a highlight and cracks. */
function drawRock(g, x, y, r, shape, rot, hot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  shape.forEach((k, i) => {
    const a = (i / shape.length) * Math.PI * 2;
    if (i === 0) g.moveTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
    else g.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
  });
  g.closePath();
  const fill = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  fill.addColorStop(0, hot ? '#ffb070' : '#b8875a');
  fill.addColorStop(1, hot ? '#a83a12' : '#6b4424');
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = Math.max(3, r * 0.08);
  g.strokeStyle = '#3d2412';
  g.stroke();
  g.strokeStyle = hot ? '#ffe066' : 'rgba(255, 150, 60, 0.8)';
  g.lineWidth = Math.max(2, r * 0.06);
  g.beginPath();
  g.moveTo(-r * 0.4, -r * 0.1);
  g.lineTo(-r * 0.05, r * 0.15);
  g.lineTo(r * 0.3, -r * 0.05);
  g.moveTo(-r * 0.05, r * 0.15);
  g.lineTo(0, r * 0.5);
  g.stroke();
  g.restore();
}
