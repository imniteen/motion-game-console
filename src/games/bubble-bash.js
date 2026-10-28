// Bubble Bash: bubbles float up from the bottom of the sea; wave your hands to pop them. Gold bubbles are worth
// 3, rainbow bubbles burst into a shower of little ones, and every 30 seconds there's a bubble storm.
import { rand, handTouch, shinyBall, sky } from './kit.js';

const LIFE_SPEED = 120; // px/s a bubble rises at level 1
const STORM_EVERY = 30;
const STORM_LEN = 6;

export default {
  id: 'bubble-bash',
  title: 'Bubble Bash',
  icon: '🫧',
  color: '#3fb6ff',
  moves: ['wave', 'reach'],
  howto: ['Bubbles float up from the sea.', 'Wave your hands to pop them!', 'Gold bubbles are worth 3 points!'],
  layout: 'shared',
  hearts: 0,
  stars: [45, 120, 200],

  create(ctx) {
    const { W, H, rng } = ctx;
    const bubbles = [];
    const fish = [];
    let spawnIn = 0.5;
    let fishIn = 3;
    let lastStorm = 0;
    const combos = new Map(); // n -> { k, last }
    const prevHands = new Map(); // 'n:side' -> {x, y}: a hand has to be moving to pop (resting hands don't)
    const weeds = Array.from({ length: 14 }, (_, i) => ({ x: (i + 0.5) * (W / 14) + rand(rng, -40, 40), h: rand(rng, 120, 260), c: i % 2 ? '#1e9e6a' : '#27c27f' }));
    const rays = Array.from({ length: 6 }, (_, i) => ({ x: rand(rng, 0, W), w: rand(rng, 80, 200), sp: rand(rng, 0.1, 0.3) + i * 0.02 }));
    const storm = () => {
      const into = ctx.t() % STORM_EVERY;
      return ctx.t() > 10 && into < STORM_LEN;
    };

    /** Where bubbles should come up: around the players, so everyone can reach some. */
    function spawnX(players) {
      if (!players.length) return rand(rng, 160, W - 160);
      const p = players[Math.floor(rng() * players.length)];
      return Math.max(90, Math.min(W - 90, p.sh.x + rand(rng, -2.6, 2.6) * p.s));
    }

    function spawn(players, kind = null, x = null, y = H + 80, r = null) {
      const roll = rng();
      const k = kind ?? (ctx.progress() > 0.35 && roll < 0.06 ? 'rainbow' : roll < 0.16 ? 'gold' : 'plain');
      const size = r ?? (k === 'plain' ? rand(rng, 55, 80) : 70);
      bubbles.push({ x: x ?? spawnX(players), y, r: size, kind: k, vy: -LIFE_SPEED * rand(rng, 0.8, 1.2) * Math.min(1.8, ctx.level()), wob: rand(rng, 0, 6), age: 0 });
    }

    return {
      update(dt, players) {
        const level = ctx.level();
        if (storm() && ctx.t() - lastStorm > STORM_EVERY - 1) {
          lastStorm = ctx.t();
          ctx.sfx.whoosh();
          ctx.fx.pop('Bubble storm!', W / 2, H * 0.35, '#bfe6ff');
        }
        spawnIn -= dt;
        if (spawnIn <= 0) {
          spawn(players);
          const perSec = (1.1 + 0.35 * Math.max(0, players.length - 1)) * level * (storm() ? 2.5 : 1);
          spawnIn = 1 / perSec;
        }
        for (const b of bubbles) {
          b.age += dt;
          b.y += b.vy * dt;
          b.x += Math.sin(b.age * 2 + b.wob) * 30 * dt;
        }
        // popping: with a moving hand
        const moving = new Set();
        for (const p of players) {
          for (const h of p.hands) {
            const key = `${p.n}:${h.side}`;
            const prev = prevHands.get(key);
            if (prev && Math.hypot(h.x - prev.x, h.y - prev.y) / dt > 1.2 * p.s) moving.add(h);
            prevHands.set(key, { x: h.x, y: h.y });
          }
        }
        for (const b of bubbles) {
          if (b.popped) continue;
          for (const p of players) {
            const h = p.state === 'active' ? handTouch(p, b.x, b.y, b.r) : null;
            if (!h || !moving.has(h)) continue;
            b.popped = true;
            const c = combos.get(p.n) ?? { k: 0, last: -9 };
            c.k = ctx.t() - c.last < 1.5 ? c.k + 1 : 1;
            c.last = ctx.t();
            combos.set(p.n, c);
            const pts = (b.kind === 'gold' ? 3 : b.kind === 'rainbow' ? 2 : 1) + (c.k > 0 && c.k % 5 === 0 ? 2 : 0);
            ctx.report.score(p.n, pts, b.x, b.y - b.r, c.k % 5 === 0 ? `Combo! +${pts}` : `+${pts}`);
            ctx.fx.burst(b.x, b.y, b.kind === 'gold' ? '#ffd23f' : '#bfe6ff', b.kind === 'plain' ? 10 : 22);
            if (b.kind === 'gold') ctx.sfx.gold();
            else ctx.sfx.pop();
            if (b.kind === 'rainbow') for (let i = 0; i < 5; i++) spawn(players, 'plain', b.x + rand(rng, -80, 80), b.y + rand(rng, -40, 40), 45);
            break;
          }
        }
        // a bubble that gets away near a player counts as a near miss for them (the coach notices)
        for (const b of bubbles) {
          if (b.popped || b.y > -b.r) continue;
          b.gone = true;
          let near = null;
          let best = Infinity;
          for (const p of players) {
            const d = Math.abs(p.sh.x - b.x) / p.s;
            if (d < best) {
              best = d;
              near = p;
            }
          }
          if (near && best < 2.2 && near.state === 'active') ctx.report.miss(near.n, 'wave');
        }
        for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].popped || bubbles[i].gone) bubbles.splice(i, 1);
        // a fish now and then, just for fun
        fishIn -= dt;
        if (fishIn <= 0) {
          fishIn = rand(rng, 4, 9);
          const dir = rng() < 0.5 ? 1 : -1;
          fish.push({ x: dir > 0 ? -100 : W + 100, y: rand(rng, H * 0.25, H * 0.7), dir, sp: rand(rng, 120, 220), e: rng() < 0.5 ? '🐠' : '🐟' });
        }
        for (const f of fish) f.x += f.dir * f.sp * dt;
        for (let i = fish.length - 1; i >= 0; i--) if (fish[i].x < -200 || fish[i].x > W + 200) fish.splice(i, 1);
      },

      drawBack(g) {
        const t = ctx.t();
        sky(g, W, H, '#0aa5c9', '#06306b');
        // light rays from the surface
        g.save();
        for (const r of rays) {
          g.globalAlpha = 0.07 + 0.04 * Math.sin(t * r.sp * 5);
          g.fillStyle = '#e8fbff';
          g.beginPath();
          const x = (r.x + Math.sin(t * r.sp) * 120) % W;
          g.moveTo(x - r.w / 2, 0);
          g.lineTo(x + r.w / 2, 0);
          g.lineTo(x + r.w * 1.6, H);
          g.lineTo(x - r.w * 0.4, H);
          g.fill();
        }
        g.restore();
        // sandy floor and seaweed
        g.fillStyle = '#e9c98b';
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 60) g.lineTo(x, H - 70 - 18 * Math.sin(x * 0.01));
        g.lineTo(W, H);
        g.fill();
        for (const w of weeds) {
          g.strokeStyle = w.c;
          g.lineWidth = 22;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(w.x, H - 40);
          for (let k = 1; k <= 5; k++) g.lineTo(w.x + Math.sin(t * 1.5 + k + w.x) * 18 * k * 0.4, H - 40 - (w.h * k) / 5);
          g.stroke();
        }
        g.save();
        g.font = '64px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const f of fish) {
          g.save();
          g.translate(f.x, f.y + Math.sin(t * 3 + f.x * 0.01) * 10);
          g.scale(-f.dir, 1);
          g.fillText(f.e, 0, 0);
          g.restore();
        }
        g.restore();
      },

      drawFront(g) {
        const t = ctx.t();
        for (const b of bubbles) {
          if (b.kind === 'gold') {
            shinyBall(g, b.x, b.y, b.r, 'rgba(255, 200, 40, 0.85)');
            g.save();
            g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8);
            g.strokeStyle = '#fff6b0';
            g.lineWidth = 5;
            g.beginPath();
            g.arc(b.x, b.y, b.r + 6, 0, Math.PI * 2);
            g.stroke();
            g.restore();
          } else if (b.kind === 'rainbow') {
            const grad = g.createLinearGradient(b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r);
            ['#ff5d73', '#ffc93c', '#5ee08a', '#3fb6ff', '#b37bff'].forEach((c, i) => grad.addColorStop(i / 4, c));
            g.save();
            g.globalAlpha = 0.75;
            g.fillStyle = grad;
            g.beginPath();
            g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            g.fill();
            g.restore();
            shinyBall(g, b.x, b.y, b.r, 'rgba(255,255,255,0.15)');
          } else {
            g.save();
            g.globalAlpha = 0.85;
            g.lineWidth = 5;
            g.strokeStyle = 'rgba(220, 245, 255, 0.95)';
            g.fillStyle = 'rgba(160, 225, 255, 0.25)';
            g.beginPath();
            g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            g.fill();
            g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.85)';
            g.beginPath();
            g.ellipse(b.x - b.r * 0.38, b.y - b.r * 0.4, b.r * 0.22, b.r * 0.13, -0.7, 0, Math.PI * 2);
            g.fill();
            g.restore();
          }
        }
      },

      needs() {
        return 'wave';
      },

      /** Test bot: reach for the nearest bubble. */
      bot(p) {
        let best = null;
        let bd = Infinity;
        for (const b of bubbles) {
          if (b.y > ctx.H || b.y < 0) continue;
          const d = Math.hypot(b.x - p.sh.x, b.y - p.sh.y);
          if (d < bd && d < 3 * p.s) {
            bd = d;
            best = b;
          }
        }
        return best ? { reach: { x: best.x, y: best.y } } : {};
      },
    };
  },
};
