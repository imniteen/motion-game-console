// Starfall: on a starry night, little stars drift down from the sky and twinkle right next to you for a
// few seconds: reach out and touch them (gold stars are worth 3). Now and then a meteor comes: a "!" and a
// red ring on the ground show where it will land, so step out of the way. Half-way through there's a
// shooting-star shower (lots of stars, more gold) and after that the meteors sometimes come in pairs.
// Every 5th star in a row (none got away) is worth 2 more.
// The team shares 5 hearts, and only meteors can take them.
import { rand, clamp, handTouch, warning, sky } from './kit.js';

const FALL_SPEED = 430; // px/s a star drops in at, before it stops to twinkle
const SHOWER_AT = 0.5; // round progress of the shooting-star shower
const SHOWER_LEN = 9;
const FIRST_METEOR = 9; // s into the round
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';
const COLORS = ['#fff27a', '#ffb3d9', '#9fe7ff', '#b9ffb0'];

/** Half the width of the ground a meteor hits, for a player of size s. */
const hitHalf = (s) => 70 + 0.45 * s;

export default {
  id: 'starfall',
  title: 'Starfall',
  icon: '⭐',
  color: '#7b61ff',
  moves: ['reach', 'sidestep'],
  howto: ['Stars twinkle down from the sky.', 'Reach out and touch them!', 'If you see a ! sign, step away from the meteor!'],
  layout: 'shared',
  hearts: 5,
  stars: [50, 125, 175],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    /** @type {{ x: number, y: number, hoverY: number, r: number, gold: boolean, color: string, age: number, stay: number, hoverAge: number, spin: number, n: number, out?: number }[]} */
    const stars = [];
    /** @type {{ x: number, born: number, warn: number, from: number, threat: Set<number>, landed: boolean, landedAt?: number }[]} */
    const meteors = [];
    const dizzy = new Map(); // n -> game time their BONK! wears off
    const prevHands = new Map(); // 'n:side' -> {x, y}, to tell a moving hand from a resting one
    const streak = new Map(); // n -> stars caught in a row
    let spawnIn = 1;
    let meteorIn = FIRST_METEOR;
    let showerSaid = false;
    let shootIn = 3;
    const shooting = []; // background shooting stars, just for fun
    const sparkles = Array.from({ length: 90 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 0, H * 0.6), r: rand(rng, 1.5, 4.5), tw: rand(rng, 0, 6) }));
    const houses = Array.from({ length: 6 }, (_, i) => ({ x: 120 + i * 340 + rand(rng, -40, 40), w: rand(rng, 110, 150), h: rand(rng, 90, 130), lit: rng() < 0.7 }));

    const active = (players) => players.filter((p) => p.state === 'active');
    const shower = () => ctx.progress() >= SHOWER_AT && ctx.t() - ctx.roundSec * SHOWER_AT < SHOWER_LEN;

    /** A star that drops in next to player p and stops where their hands can reach it. */
    function spawnStar(p) {
      const side = rng() < 0.5 ? -1 : 1;
      const gold = rng() < (shower() ? 0.3 : 0.14);
      const x = clamp(p.sh.x + side * rand(rng, 0.3, 1.9) * p.s, 90, W - 90);
      const hoverY = p.sh.y + rand(rng, -1.5, 0.1) * p.s;
      // don't stack stars on top of each other
      if (stars.some((s) => Math.hypot(s.x - x, s.hoverY - hoverY) < 110)) return;
      const stay = clamp(4.2 / Math.min(1.7, ctx.level()), 2.4, 5);
      stars.push({ x, y: -80, hoverY, r: gold ? 66 : 54, gold, color: COLORS[Math.floor(rng() * COLORS.length)], age: 0, stay, hoverAge: 0, spin: rand(rng, -1, 1), n: p.n });
    }

    /** A meteor aimed at player p (and, later in the round, sometimes a second one next to it). */
    function spawnMeteor(p, live) {
      const warn = clamp(1.7 - 0.3 * (ctx.level() - 1), 1.2, 1.9);
      const x = clamp(p.hip.x + rand(rng, -0.3, 0.3) * p.s, 140, W - 140);
      const add = (mx, w) => meteors.push({ x: mx, born: ctx.t(), warn: w, from: mx < W / 2 ? 1 : -1, threat: new Set(), landed: false });
      add(x, warn);
      ctx.sfx.warn();
      if (ctx.progress() > SHOWER_AT && rng() < 0.4) {
        const other = live.length > 1 ? live.find((o) => o.n !== p.n && Math.abs(o.hip.x - x) > 2.5 * hitHalf(90)) : null;
        const side = x < 450 ? 1 : x > W - 450 ? -1 : rng() < 0.5 ? -1 : 1;
        add(other ? clamp(other.hip.x, 140, W - 140) : clamp(x + side * rand(rng, 270, 330), 140, W - 140), warn + 0.3);
      }
    }

    const under = (m, p) => Math.abs(p.hip.x - m.x) < hitHalf(p.s);

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        const live = active(players);
        if (shower() && !showerSaid) {
          showerSaid = true;
          ctx.sfx.whoosh();
          ctx.fx.pop('Star shower!', W / 2, H * 0.3, '#fff27a');
        }

        // stars: a steady sprinkle around every player, lots more during the shower
        spawnIn -= dt;
        if (spawnIn <= 0 && live.length) {
          spawnStar(live[Math.floor(rng() * live.length)]);
          const perSec = (0.75 + 0.55 * (live.length - 1)) * Math.min(1.6, level) * (shower() ? 2.2 : 1);
          spawnIn = 1 / perSec;
        }
        for (const s of stars) {
          s.age += dt;
          if (s.out !== undefined) s.out += dt;
          else if (s.y < s.hoverY) s.y = Math.min(s.hoverY, s.y + FALL_SPEED * dt);
          else {
            s.hoverAge += dt;
            s.y = s.hoverY + Math.sin(s.hoverAge * 2.2 + s.spin) * 10;
            if (s.hoverAge > s.stay) s.out = 0;
          }
        }

        // catching: a hand that is moving, or reaching up and out (resting hands down by your side don't count)
        const moving = new Set();
        for (const p of players) {
          for (const h of p.hands) {
            const key = `${p.n}:${h.side}`;
            const prev = prevHands.get(key);
            if (prev && Math.hypot(h.x - prev.x, h.y - prev.y) / dt > 1.0 * p.s) moving.add(h);
            prevHands.set(key, { x: h.x, y: h.y });
          }
        }
        for (const s of stars) {
          if (s.caught || s.out !== undefined || s.y < 0) continue;
          for (const p of live) {
            const h = handTouch(p, s.x, s.y, s.r);
            if (!h || (!moving.has(h) && h.y > p.sh.y + 0.3 * p.s)) continue;
            s.caught = true;
            // a streak: every 5th star in a row without letting one get away is worth 2 more
            const k = (streak.get(p.n) ?? 0) + 1;
            streak.set(p.n, k);
            const bonus = k % 5 === 0 ? 2 : 0;
            const pts = (s.gold ? 3 : 1) + bonus;
            ctx.report.score(p.n, pts, s.x, s.y - s.r, bonus ? `${k} in a row! +${pts}` : s.gold ? 'GOLD! +3' : '+1');
            ctx.fx.burst(s.x, s.y, s.gold ? '#ffd23f' : s.color, s.gold ? 24 : 12);
            if (s.gold) ctx.sfx.gold();
            else ctx.sfx.star();
            break;
          }
        }
        // a star that twinkles away untouched next to a player is a near miss for them (the coach notices)
        for (const s of stars) {
          if (s.caught || s.out === undefined || s.out < 0.45) continue;
          s.gone = true;
          let near = null;
          let best = Infinity;
          for (const p of players) {
            const d = Math.abs(p.sh.x - s.x) / p.s;
            if (d < best) {
              best = d;
              near = p;
            }
          }
          if (near && best < 2.4 && near.state === 'active') {
            ctx.report.miss(near.n, 'reach');
            streak.set(near.n, 0);
          }
        }
        for (let i = stars.length - 1; i >= 0; i--) if (stars[i].caught || stars[i].gone) stars.splice(i, 1);

        // meteors: aimed at someone, never on top of another meteor's ring
        meteorIn -= dt;
        if (meteorIn <= 0 && live.length) {
          const p = live[Math.floor(rng() * live.length)];
          if (meteors.some((m) => !m.landed && Math.abs(m.x - p.hip.x) < 2.5 * hitHalf(90))) meteorIn = 0.4;
          else {
            spawnMeteor(p, live);
            meteorIn = rand(rng, 6, 9) / (Math.min(1.8, level) * (1 + 0.3 * (live.length - 1)));
          }
        }
        for (const m of meteors) {
          if (m.landed) continue;
          for (const p of live) if (under(m, p)) m.threat.add(p.n);
          if (t - m.born < m.warn) continue;
          m.landed = true;
          m.landedAt = t;
          ctx.sfx.boom();
          ctx.fx.shake(8);
          ctx.fx.burst(m.x, floor - 30, '#ff9f43', 22);
          for (const p of live) {
            if (under(m, p)) {
              ctx.report.hit(p.n, p.head.x, p.head.y);
              ctx.report.miss(p.n, 'sidestep', p.head.x, p.head.y - p.s * 1.3, 'BONK!');
              ctx.sfx.bonk();
              dizzy.set(p.n, t + 1.2);
            } else if (m.threat.has(p.n)) {
              ctx.report.good(p.n, p.head.x, p.head.y - p.s * 1.3, 'WHOOSH!');
            }
          }
        }
        for (let i = meteors.length - 1; i >= 0; i--) if (meteors[i].landed && t - meteors[i].landedAt > 0.7) meteors.splice(i, 1);

        // shooting stars far away in the sky
        shootIn -= dt;
        if (shootIn <= 0) {
          shootIn = rand(rng, 2.5, 6) * (shower() ? 0.25 : 1);
          shooting.push({ x: rand(rng, 200, W), y: rand(rng, 30, H * 0.3), age: 0 });
        }
        for (const s of shooting) s.age += dt;
        for (let i = shooting.length - 1; i >= 0; i--) if (shooting[i].age > 1) shooting.splice(i, 1);
      },

      drawBack(g) {
        const t = ctx.t();
        sky(g, W, H, '#1d2c7a', '#7a5cc9');
        // twinkly sky
        g.fillStyle = '#fff';
        for (const s of sparkles) {
          g.globalAlpha = 0.45 + 0.45 * Math.sin(t * 2.5 + s.tw);
          g.beginPath();
          g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
        g.lineCap = 'round';
        for (const s of shooting) {
          const x = s.x - s.age * 600;
          const y = s.y + s.age * 260;
          const trail = g.createLinearGradient(x, y, x + 240, y - 104);
          trail.addColorStop(0, 'rgba(255,255,255,0.95)');
          trail.addColorStop(1, 'rgba(255,255,255,0)');
          g.strokeStyle = trail;
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 240, y - 104);
          g.stroke();
        }
        // a big sleepy-happy moon
        const mx = W - 280;
        const my = 190;
        const glow = g.createRadialGradient(mx, my, 60, mx, my, 230);
        glow.addColorStop(0, 'rgba(255, 245, 190, 0.5)');
        glow.addColorStop(1, 'rgba(255, 245, 190, 0)');
        g.fillStyle = glow;
        g.fillRect(mx - 240, my - 240, 480, 480);
        g.fillStyle = '#fff3b0';
        g.beginPath();
        g.arc(mx, my, 110, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(230, 210, 140, 0.6)';
        for (const [cx, cy, cr] of [[-45, -40, 18], [40, 30, 14], [55, -35, 10]]) {
          g.beginPath();
          g.arc(mx + cx, my + cy, cr, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = '#6b4f1d';
        g.lineWidth = 7;
        for (const ex of [-35, 30]) {
          g.beginPath();
          g.arc(mx + ex, my - 5, 14, 0.15 * Math.PI, 0.85 * Math.PI);
          g.stroke();
        }
        g.beginPath();
        g.arc(mx, my + 30, 30, 0.2 * Math.PI, 0.8 * Math.PI);
        g.stroke();
        // rolling hills, a little village with lit windows, and the meadow we stand on
        g.fillStyle = '#2e3f8f';
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.64 - 50 * Math.sin(x * 0.003 + 0.5) - 20 * Math.sin(x * 0.012));
        g.lineTo(W, H);
        g.fill();
        for (const h of houses) {
          const y = H * 0.7;
          g.fillStyle = '#4a3a8c';
          g.fillRect(h.x, y - h.h, h.w, h.h);
          g.fillStyle = '#c0506e';
          g.beginPath();
          g.moveTo(h.x - 15, y - h.h);
          g.lineTo(h.x + h.w / 2, y - h.h - 60);
          g.lineTo(h.x + h.w + 15, y - h.h);
          g.fill();
          g.fillStyle = h.lit ? '#ffd86b' : '#2b2160';
          g.fillRect(h.x + h.w * 0.2, y - h.h * 0.7, h.w * 0.22, h.w * 0.22);
          g.fillRect(h.x + h.w * 0.58, y - h.h * 0.7, h.w * 0.22, h.w * 0.22);
        }
        const meadow = g.createLinearGradient(0, H * 0.7, 0, H);
        meadow.addColorStop(0, '#3f9b6b');
        meadow.addColorStop(1, '#1f5f4a');
        g.fillStyle = meadow;
        g.beginPath();
        g.moveTo(0, H);
        g.lineTo(0, H * 0.72);
        for (let x = 0; x <= W; x += 60) g.lineTo(x, H * 0.71 + 12 * Math.sin(x * 0.015));
        g.lineTo(W, H);
        g.fill();
        // fireflies and a friendly owl
        g.fillStyle = '#eaff7a';
        for (let i = 0; i < 12; i++) {
          g.globalAlpha = 0.4 + 0.5 * Math.sin(t * 3 + i * 1.3);
          g.beginPath();
          g.arc((i * 167 + Math.sin(t * 0.7 + i) * 60 + W) % W, H * 0.78 + Math.sin(t + i * 2) * 40 + (i % 3) * 40, 6, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
        g.save();
        g.font = `110px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillText('🦉', 110, H * 0.74);
        g.fillText('🏕️', W - 140, H * 0.77);
        g.restore();
        // where the meteors will land: a red ring on the ground, behind the kids' feet
        for (const m of meteors) {
          if (m.landed) continue;
          const f = clamp((t - m.born) / m.warn, 0, 1);
          g.save();
          g.globalAlpha = 0.3 + 0.4 * f;
          g.fillStyle = '#ff5d3a';
          g.beginPath();
          g.ellipse(m.x, floor, hitHalf(90) * (0.5 + 0.5 * f), 36, 0, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 0.95;
          g.setLineDash([22, 16]);
          g.lineWidth = 7;
          g.strokeStyle = '#ffdd57';
          g.beginPath();
          g.ellipse(m.x, floor, hitHalf(90), 42, 0, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        for (const s of stars) {
          const k = s.out === undefined ? Math.min(1, s.age * 3) : Math.max(0, 1 - s.out / 0.45);
          drawStar(g, s.x, s.y, s.r * (0.6 + 0.4 * k), s.gold ? '#ffc21a' : s.color, t * 0.8 * s.spin, k, s.gold, t);
        }
        for (const m of meteors) {
          if (m.landed) {
            // a puff of dust where it hit
            const k = (t - m.landedAt) / 0.7;
            g.save();
            g.globalAlpha = 1 - k;
            g.fillStyle = '#d8c3ff';
            for (let i = -2; i <= 2; i++) {
              g.beginPath();
              g.arc(m.x + i * 50 * (1 + k), floor - 30 - Math.abs(i) * 6 - k * 40, 34 * (1 - k * 0.4), 0, Math.PI * 2);
              g.fill();
            }
            g.restore();
            continue;
          }
          const f = (t - m.born) / m.warn;
          warning(g, m.x, H * 0.16, t, f > 0.6 ? 96 : 80);
          // the meteor sweeps in from a top corner, getting bigger as it comes
          const u = f * f;
          const sx = m.x - m.from * 900;
          const x = sx + (m.x - sx) * u;
          const y = -150 + (floor - 50 + 150) * u;
          const r = 30 + 40 * u;
          const ang = Math.atan2(floor - 50 + 150, m.x - sx);
          g.save();
          g.translate(x, y);
          g.rotate(ang);
          const tail = g.createLinearGradient(-r * 5, 0, 0, 0);
          tail.addColorStop(0, 'rgba(255, 120, 40, 0)');
          tail.addColorStop(0.6, 'rgba(255, 170, 60, 0.7)');
          tail.addColorStop(1, '#ffe08a');
          g.fillStyle = tail;
          g.beginPath();
          g.moveTo(-r * 5, 0);
          g.lineTo(0, -r);
          g.lineTo(0, r);
          g.fill();
          g.restore();
          g.save();
          const ball = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
          ball.addColorStop(0, '#ffcf7a');
          ball.addColorStop(1, '#a3461a');
          g.fillStyle = ball;
          g.strokeStyle = '#5a2208';
          g.lineWidth = 5;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.restore();
        }
        // dizzy stars over anyone who got bopped
        g.save();
        g.font = `70px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const p of players) {
          if (t > (dizzy.get(p.n) ?? 0)) continue;
          for (let i = 0; i < 3; i++) {
            const a = t * 6 + (i * Math.PI * 2) / 3;
            g.fillText('💫', p.head.x + Math.cos(a) * p.s * 0.9, p.head.y - p.s * 0.9 + Math.sin(a) * p.s * 0.25);
          }
        }
        g.restore();
      },

      needs(n) {
        return meteors.some((m) => !m.landed && m.threat.has(n)) ? 'sidestep' : 'reach';
      },

      /** Test bot: step clear of meteors, reach for the nearest star (walk over to one if none is close). */
      bot(p) {
        const t = ctx.t();
        const zones = meteors.filter((m) => !m.landed).map((m) => ({ x0: m.x - hitHalf(p.s), x1: m.x + hitHalf(p.s), in: m.born + m.warn - t }));
        const want = {};
        const safe = safeSpot(p, zones, W);
        if (safe !== null) want.x = safe;
        let best = null;
        let bd = Infinity;
        for (const s of stars) {
          if (s.caught || s.out !== undefined || s.y < 0) continue;
          const d = Math.hypot(s.x - p.sh.x, s.y - p.sh.y);
          if (d < bd) {
            bd = d;
            best = s;
          }
        }
        if (best && bd < 2.3 * p.s) want.reach = { x: best.x, y: best.y };
        else if (want.x === undefined) {
          // none close: walk over to one of the stars that came down for you
          const mine = stars.find((s) => s.n === p.n && !s.caught && s.out === undefined && !zones.some((z) => s.x > z.x0 - 0.5 * p.s && s.x < z.x1 + 0.5 * p.s));
          if (mine) want.x = mine.x;
        }
        return want;
      },
    };
  },
};

/**
 * Where a good player would step to get clear of the danger zones ({x0, x1, in: seconds until it lands}):
 * the nearest spot outside all of them that they can walk to without crossing one that lands on the way.
 * null: they're fine where they are (or should wait for one to land before walking through its spot).
 */
function safeSpot(p, zones, W) {
  const inside = (x, m) => zones.some((z) => x > z.x0 - m && x < z.x1 + m);
  if (!inside(p.hip.x, 0.3 * p.s)) return null;
  const speed = 4 * p.s;
  const m = 0.6 * p.s;
  let best = null;
  for (const z of zones) {
    for (const x of [z.x0 - m, z.x1 + m]) {
      if (x < 180 || x > W - 180 || inside(x, 0.4 * p.s)) continue;
      const lo = Math.min(x, p.hip.x);
      const hi = Math.max(x, p.hip.x);
      const arrive = (hi - lo) / speed;
      const blocked = zones.some((o) => o.x1 > lo && o.x0 < hi && !(p.hip.x > o.x0 && p.hip.x < o.x1) && o.in < arrive + 0.15);
      if (blocked) continue;
      if (best === null || Math.abs(x - p.hip.x) < Math.abs(best - p.hip.x)) best = x;
    }
  }
  return best;
}

/** A chubby five-pointed star with a little smiley face. */
function drawStar(g, x, y, r, color, rot, alpha, gold, t) {
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y);
  if (gold) {
    const glow = g.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.7);
    glow.addColorStop(0, 'rgba(255, 220, 90, 0.7)');
    glow.addColorStop(1, 'rgba(255, 220, 90, 0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, r * 1.7, 0, Math.PI * 2);
    g.fill();
  }
  g.rotate(Math.sin(rot) * 0.25);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? 0.5 : 1;
    g.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
  }
  g.closePath();
  g.fillStyle = color;
  g.lineJoin = 'round';
  g.fill();
  g.lineWidth = gold ? 7 : 5;
  g.strokeStyle = gold ? '#fff6c2' : '#ffffff';
  g.stroke();
  g.fillStyle = '#3b2a1a';
  for (const ex of [-0.2, 0.2]) {
    g.beginPath();
    g.arc(ex * r, -0.05 * r, r * 0.07, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#3b2a1a';
  g.lineWidth = Math.max(2, r * 0.06);
  g.beginPath();
  g.arc(0, 0.08 * r, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  if (gold) {
    g.globalAlpha *= 0.6 + 0.4 * Math.sin(t * 8);
    g.fillStyle = '#ffffff';
    g.font = `${Math.round(r * 0.5)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('✨', r * 0.75, -r * 0.75);
  }
  g.restore();
}
