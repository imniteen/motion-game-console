// Balloon Bop: a party in the park. Balloons float down slowly; bop them back up with your hands (or a
// jump with your head!) before they touch the grass and POP. Every bop is a point, golden balloons are worth 3,
// and more balloons join the party as the round goes on. Half-way through the beach balls arrive: heavier,
// faster, worth 2.
import { rand, pick, clamp, sky } from './kit.js';

const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const COLORS = ['#ff5d73', '#3fb6ff', '#5ee08a', '#b37bff', '#ff9f43', '#ff7fd1'];
const KIND = {
  plain: { pts: 1, grav: 150, fall: 1, apex: [3.8, 5.2], r: [58, 70] },
  gold: { pts: 3, grav: 150, fall: 1, apex: [3.8, 5.2], r: [66, 66] },
  ball: { pts: 2, grav: 330, fall: 1.6, apex: [2.8, 3.8], r: [62, 62] },
};
const HAND_FAST = 0.9; // body sizes per second a hand has to move to bop (a resting hand doesn't)
const HAND_UP = 0.5; // ...and it has to be going up: a bop comes from below
const COOL = 0.45; // s before the same balloon can be bopped again

const ema = (prev, v, dt, tau) => prev + (v - prev) * (1 - Math.exp(-dt / tau));

export default {
  id: 'balloon-bop',
  title: 'Balloon Bop',
  icon: '🎈',
  color: '#ff5d73',
  moves: ['hitUp', 'reach'],
  howto: ['Balloons float down at the party.', 'Bop them back up with your hands!', "Don't let them touch the grass!"],
  layout: 'shared',
  hearts: 0,
  stars: [20, 45, 80],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const balloons = [];
    const hands = new Map(); // 'n:side' -> { x, y, sp, vy } smoothed hand speed (and upward speed) in body sizes per second
    const heads = new Map(); // n -> { y, vy } head speed (up is negative), body sizes per second
    let spawnIn = 1;
    let beach = false;
    let id = 0;
    let seen = []; // the players last update, for the test bot
    const clouds = Array.from({ length: 5 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 60, 260), s: rand(rng, 0.7, 1.3) }));
    const trees = Array.from({ length: 6 }, (_, i) => ({ x: i * 340 + rand(rng, 40, 200), r: rand(rng, 90, 130), h: rand(rng, 150, 230) }));
    const confetti = Array.from({ length: 40 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 0, H), c: pick(rng, COLORS), sp: rand(rng, 30, 70), ph: rand(rng, 0, 6) }));
    const flowers = Array.from({ length: 16 }, (_, i) => ({ x: i * 125 + rand(rng, 0, 80), y: rand(rng, floor + 30, H - 30), e: pick(rng, ['🌼', '🌷', '🌸']) }));

    const fallSpeed = () => 85 + 45 * Math.min(2, ctx.level());

    /** The player nearest to x (any state), or null. */
    function nearest(players, x) {
      let best = null;
      let bd = Infinity;
      for (const p of players) {
        const d = Math.abs(p.sh.x - x);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return best;
    }

    function spawn(players) {
      // drop it above whoever has the fewest balloons near them, so everyone gets some
      let who = players[0];
      let fewest = Infinity;
      for (const p of players) {
        const k = balloons.filter((b) => Math.abs(b.x - p.sh.x) < 3 * p.s).length + rng() * 0.5;
        if (k < fewest) {
          fewest = k;
          who = p;
        }
      }
      const roll = rng();
      const kind = beach && roll < 0.35 ? 'ball' : roll > 0.88 ? 'gold' : 'plain';
      const look = KIND[kind];
      const x = clamp(who.sh.x + rand(rng, -1.8, 1.8) * who.s, 90, W - 90);
      balloons.push({ id: id++, kind, x, y: -90, vx: 0, vy: 40, r: rand(rng, look.r[0], look.r[1]), color: pick(rng, COLORS), cool: 0, age: 0, wob: rand(rng, 0, 6), spin: 0, popped: false });
    }

    function bop(b, p, from, t) {
      const look = KIND[b.kind];
      const apex = Math.max(110 + b.r, from.y - rand(rng, look.apex[0], look.apex[1]) * p.s);
      b.vy = -Math.sqrt(2 * look.grav * Math.max(60, b.y - apex));
      b.vx = clamp(((b.x - from.x) / p.s) * 160, -260, 260) + rand(rng, -40, 40);
      b.cool = COOL;
      const label = b.kind === 'gold' ? 'GOLD! +3' : b.kind === 'ball' ? 'Boing! +2' : pick(rng, ['Bop! +1', 'Boop! +1', 'Up! +1']);
      ctx.report.score(p.n, look.pts, b.x, b.y - b.r - 30, label);
      ctx.fx.burst(b.x, b.y + b.r * 0.6, b.kind === 'gold' ? '#ffd23f' : b.color, b.kind === 'plain' ? 8 : 16);
      if (b.kind === 'gold') ctx.sfx.gold();
      else if (b.kind === 'ball') ctx.sfx.hit();
      else ctx.sfx.boing();
      b.bopAt = t;
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        seen = players;
        const level = ctx.level();
        if (!beach && ctx.progress() >= 0.5) {
          beach = true;
          ctx.sfx.whoosh();
          ctx.fx.pop('Beach balls! They fall faster!', W / 2, H * 0.3, '#ffd23f');
        }
        // how fast each hand and head is moving
        for (const p of players) {
          for (const h of p.hands) {
            const key = `${p.n}:${h.side}`;
            const prev = hands.get(key);
            const inst = prev ? Math.hypot(h.x - prev.x, h.y - prev.y) / dt / p.s : 0;
            const vy = prev ? (h.y - prev.y) / dt / p.s : 0;
            hands.set(key, { x: h.x, y: h.y, sp: prev ? ema(prev.sp, inst, dt, 0.08) : 0, vy: prev ? ema(prev.vy, vy, dt, 0.08) : 0 });
          }
          const hd = heads.get(p.n);
          const vy = hd ? (p.head.y - hd.y) / dt / p.s : 0;
          heads.set(p.n, { y: p.head.y, vy: hd ? ema(hd.vy, vy, dt, 0.08) : 0 });
        }
        // more balloons as the round goes on: one each at first, up to three each
        if (players.length) {
          const each = clamp(1 + Math.floor(ctx.progress() * 2.4 + (level - 1)), 1, 3);
          const want = Math.min(9, each * players.length);
          spawnIn -= dt;
          if (spawnIn <= 0 && balloons.filter((b) => !b.popped).length < want) {
            spawn(players);
            spawnIn = 2.2;
          }
        }
        const fall = fallSpeed();
        for (const b of balloons) {
          b.age += dt;
          b.cool -= dt;
          const look = KIND[b.kind];
          if (b.popped) {
            // a beach ball that hit the grass rolls away
            b.x += b.vx * dt;
            b.spin += (b.vx / b.r) * dt;
            continue;
          }
          b.vy = Math.min(b.vy + look.grav * dt, fall * look.fall);
          b.vx *= Math.exp(-dt * 0.9);
          // drift back towards the nearest kid so it stays in reach
          const p = nearest(players, b.x);
          if (p && Math.abs(p.sh.x - b.x) > 2.2 * p.s) b.vx += Math.sign(p.sh.x - b.x) * 120 * dt;
          b.x += (b.vx + Math.sin(b.age * 1.4 + b.wob) * 22) * dt;
          b.y += b.vy * dt;
          b.spin += (b.vx / b.r) * dt;
          if (b.x < b.r) {
            b.x = b.r;
            b.vx = Math.abs(b.vx) * 0.6;
          } else if (b.x > W - b.r) {
            b.x = W - b.r;
            b.vx = -Math.abs(b.vx) * 0.6;
          }
          if (b.y < 90 + b.r && b.vy < 0) b.vy *= -0.3;
        }
        // bopping: a hand swinging up into a balloon from below (or a head going up), unless it's already flying up
        for (const b of balloons) {
          if (b.popped || b.cool > 0 || b.vy < -80) continue;
          for (const p of players) {
            if (p.state !== 'active') continue;
            let from = null;
            for (const h of p.hands) {
              const m = hands.get(`${p.n}:${h.side}`);
              if (!h.seen || !m || m.sp < HAND_FAST || m.vy > -HAND_UP || h.y < b.y - b.r * 0.2) continue;
              if (Math.hypot(h.x - b.x, h.y - b.y) < b.r + h.r) from = h;
            }
            const hv = heads.get(p.n)?.vy ?? 0;
            if (!from && hv < -1.2 && Math.hypot(p.head.x - b.x, p.head.y - b.y) < b.r + p.head.r) from = p.head;
            if (!from) continue;
            bop(b, p, from, t);
            break;
          }
        }
        // touching the grass: POP (or the beach ball bounces off and rolls away)
        for (const b of balloons) {
          if (b.popped || b.y + b.r * 1.15 < floor + 20) continue;
          b.popped = true;
          const p = nearest(players, b.x);
          const label = b.kind === 'ball' ? pick(rng, ['Bouncy-bounce!', 'Rolling away!']) : pick(rng, ['POP!', 'Pop! Oopsie!', 'BANG! Hee hee!']);
          if (p && p.state === 'active') ctx.report.miss(p.n, 'hitUp', b.x, floor - 140, label);
          if (b.kind === 'ball') {
            b.vx = (b.x < W / 2 ? -1 : 1) * 700;
            ctx.sfx.boing();
          } else {
            b.gone = true;
            ctx.sfx.pop();
            ctx.fx.burst(b.x, b.y, b.color, 22);
          }
        }
        for (let i = balloons.length - 1; i >= 0; i--) {
          const b = balloons[i];
          if (b.gone || (b.popped && (b.x < -200 || b.x > W + 200))) balloons.splice(i, 1);
        }
        for (const c of clouds) c.x = (c.x + 14 * dt * c.s + W + 300) % (W + 300);
        for (const c of confetti) {
          c.y += c.sp * dt;
          if (c.y > floor) c.y -= floor + 20;
        }
      },

      drawBack(g) {
        const t = ctx.t();
        sky(g, W, H, '#7fd3ff', '#e9f9ff');
        g.fillStyle = '#ffe066';
        g.beginPath();
        g.arc(250, 160, 85, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.font = `110px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const c of clouds) g.fillText('☁️', c.x - 150, c.y);
        g.restore();
        // rolling hills and round park trees
        g.fillStyle = '#8fdc7a';
        g.beginPath();
        g.moveTo(0, H * 0.7);
        for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.56 - 45 * Math.sin(x * 0.003 + 1) - 20 * Math.sin(x * 0.009));
        g.lineTo(W, H * 0.7);
        g.fill();
        for (const tr of trees) {
          g.fillStyle = '#8a5a34';
          g.fillRect(tr.x - 16, H * 0.68 - tr.h, 32, tr.h);
          g.fillStyle = '#3fae5a';
          g.beginPath();
          g.arc(tr.x, H * 0.68 - tr.h, tr.r, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.18)';
          g.beginPath();
          g.arc(tr.x - tr.r * 0.3, H * 0.68 - tr.h - tr.r * 0.3, tr.r * 0.4, 0, Math.PI * 2);
          g.fill();
        }
        // bunting strung across the sky
        for (const [y0, sag] of [[70, 90], [150, 70]]) {
          g.strokeStyle = '#7a5230';
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(0, y0);
          g.quadraticCurveTo(W / 2, y0 + sag * 2, W, y0);
          g.stroke();
          for (let i = 0; i < 24; i++) {
            const u = (i + 0.5) / 24;
            const x = u * W;
            const y = y0 + sag * 4 * u * (1 - u);
            g.fillStyle = COLORS[i % COLORS.length];
            g.beginPath();
            g.moveTo(x - 24, y);
            g.lineTo(x + 24, y);
            g.lineTo(x, y + 52 + 4 * Math.sin(t * 3 + i));
            g.closePath();
            g.fill();
          }
        }
        // the grass, with flowers and the party things at the sides
        const grass = g.createLinearGradient(0, H * 0.66, 0, H);
        grass.addColorStop(0, '#6fd36a');
        grass.addColorStop(1, '#3fae4f');
        g.fillStyle = grass;
        g.fillRect(0, H * 0.66, W, H * 0.34);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        for (let x = 0; x < W; x += 120) g.fillRect(x, H * 0.66, 60, H * 0.34);
        g.save();
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.font = `52px ${EMOJI}`;
        for (const f of flowers) g.fillText(f.e, f.x, f.y);
        g.font = `120px ${EMOJI}`;
        g.fillText('🎂', 110, floor + 20);
        g.fillText('🎁', W - 110, floor + 20);
        g.font = `90px ${EMOJI}`;
        g.fillText('🧁', 230, floor + 30);
        g.fillText('🎁', W - 240, floor + 30);
        g.restore();
        // drifting confetti
        for (const c of confetti) {
          g.save();
          g.translate(c.x + Math.sin(t * 2 + c.ph) * 20, c.y);
          g.rotate(t * 2 + c.ph);
          g.fillStyle = c.c;
          g.globalAlpha = 0.7;
          g.fillRect(-7, -4, 14, 8);
          g.restore();
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        // shadows on the grass: a bigger, darker shadow means it's about to land
        for (const b of balloons) {
          if (b.popped) continue;
          const k = clamp(1 - (floor - b.y) / (floor + 100), 0, 1);
          g.fillStyle = `rgba(20, 70, 20, ${0.1 + 0.35 * k})`;
          g.beginPath();
          g.ellipse(b.x, floor + 14, b.r * (0.5 + 0.7 * k), 12 + 8 * k, 0, 0, Math.PI * 2);
          g.fill();
        }
        for (const b of balloons) {
          const nearP = nearest(players, b.x);
          const low = !b.popped && b.vy > 0 && nearP && b.y > nearP.hip.y - nearP.s;
          if (b.kind === 'ball') {
            g.save();
            g.translate(b.x, b.y);
            g.rotate(b.spin);
            const segs = ['#ff5d73', '#ffffff', '#3fb6ff', '#ffffff', '#ffd23f', '#ffffff'];
            segs.forEach((c, i) => {
              g.fillStyle = c;
              g.beginPath();
              g.moveTo(0, 0);
              g.arc(0, 0, b.r, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3);
              g.closePath();
              g.fill();
            });
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(0, 0, b.r * 0.2, 0, Math.PI * 2);
            g.fill();
            g.lineWidth = 5;
            g.strokeStyle = 'rgba(0,0,0,0.3)';
            g.beginPath();
            g.arc(0, 0, b.r, 0, Math.PI * 2);
            g.stroke();
            g.restore();
            g.fillStyle = 'rgba(255,255,255,0.5)';
            g.beginPath();
            g.ellipse(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.22, b.r * 0.12, -0.7, 0, Math.PI * 2);
            g.fill();
          } else {
            const gold = b.kind === 'gold';
            const sway = Math.sin(b.age * 2 + b.wob) * 0.08;
            g.save();
            g.translate(b.x, b.y);
            g.rotate(sway);
            // the string, curling below
            g.strokeStyle = '#555';
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(0, b.r * 1.2);
            for (let k = 1; k <= 6; k++) g.lineTo(Math.sin(t * 4 + k + b.wob) * 10, b.r * 1.2 + k * 18);
            g.stroke();
            // the knot
            g.fillStyle = gold ? '#e0a800' : b.color;
            g.beginPath();
            g.moveTo(-10, b.r * 1.22);
            g.lineTo(10, b.r * 1.22);
            g.lineTo(0, b.r * 1.08);
            g.closePath();
            g.fill();
            // the balloon: a shiny egg shape
            const grad = g.createRadialGradient(-b.r * 0.35, -b.r * 0.45, b.r * 0.1, 0, 0, b.r * 1.2);
            grad.addColorStop(0, 'rgba(255,255,255,0.95)');
            grad.addColorStop(0.3, gold ? '#ffd23f' : b.color);
            grad.addColorStop(1, gold ? '#c48a00' : b.color);
            g.fillStyle = grad;
            g.beginPath();
            g.ellipse(0, 0, b.r, b.r * 1.15, 0, 0, Math.PI * 2);
            g.fill();
            g.lineWidth = 4;
            g.strokeStyle = 'rgba(0,0,0,0.25)';
            g.stroke();
            if (gold) {
              g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8);
              g.strokeStyle = '#fff6b0';
              g.lineWidth = 6;
              g.beginPath();
              g.ellipse(0, 0, b.r + 8, b.r * 1.15 + 8, 0, 0, Math.PI * 2);
              g.stroke();
              g.globalAlpha = 1;
              g.font = `${Math.round(b.r * 0.7)}px ${EMOJI}`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText('⭐', 0, 4);
            }
            g.restore();
          }
          // getting low: a pulsing ring and an up arrow under it say "bop it now!"
          if (low) {
            const k = 1 + 0.1 * Math.sin(t * 16);
            g.save();
            g.strokeStyle = '#ffffff';
            g.lineWidth = 7;
            g.setLineDash([18, 12]);
            g.beginPath();
            g.arc(b.x, b.y, (b.r + 22) * k, 0, Math.PI * 2);
            g.stroke();
            g.setLineDash([]);
            g.translate(b.x, b.y + b.r * 1.3 + 40 - Math.abs(Math.sin(t * 9)) * 18);
            g.beginPath();
            g.moveTo(0, -34);
            g.lineTo(30, 0);
            g.lineTo(12, 0);
            g.lineTo(12, 30);
            g.lineTo(-12, 30);
            g.lineTo(-12, 0);
            g.lineTo(-30, 0);
            g.closePath();
            g.lineJoin = 'round';
            g.lineWidth = 10;
            g.strokeStyle = '#fff';
            g.stroke();
            g.fillStyle = '#ff5d73';
            g.fill();
            g.restore();
          }
        }
      },

      needs() {
        return 'hitUp';
      },

      /** Test bot: walk under the lowest falling balloon that is its own (nearest to it) and bop it in reach. */
      bot(p) {
        let best = null;
        let by = -Infinity;
        for (const b of balloons) {
          if (b.popped || b.vy < 0 || b.y < 0) continue;
          if (Math.abs(b.x - p.sh.x) > 4 * p.s || nearest(seen, b.x)?.n !== p.n) continue;
          if (b.y > by) {
            by = b.y;
            best = b;
          }
        }
        if (!best) return {};
        const out = { x: best.x };
        // in reach: the arm is about 1.5 body sizes long, from the shoulder
        const d = Math.hypot(best.x - p.sh.x, best.y - p.sh.y);
        if (d < 1.6 * p.s + best.r) out.reach = { x: best.x, y: best.y + best.r * 0.3 };
        return out;
      },
    };
  },
};
