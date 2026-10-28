// Surf Hop: waves roll along the beach. Each player sees a 3-2-1 count above their head; jump when it says
// JUMP! A jump right on time is PERFECT (2 points), a jump while the wave passes is NICE (1). Later in the
// round the waves come faster and sometimes in pairs.
import { rand, sky } from './kit.js';

const WINDOW_EARLY = 0.45; // s before the wave reaches you that a jump still counts
const WINDOW_LATE = 0.2;

export default {
  id: 'surf-hop',
  title: 'Surf Hop',
  icon: '🌊',
  color: '#00b4d8',
  moves: ['jump'],
  howto: ['Waves roll along the beach.', 'Watch the 3, 2, 1 above your head...', 'then JUMP over the wave!'],
  layout: 'shared',
  hearts: 0,
  stars: [12, 28, 45],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    /** @type {{ x: number, speed: number, judged: Set<number>, big: boolean }[]} */
    const waves = [];
    let nextIn = 2.5;
    const lastJump = new Map(); // n -> game time of their last take-off
    const result = new Map(); // n -> { text, color, until }
    const clouds = Array.from({ length: 5 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 60, 300), s: rand(rng, 0.7, 1.4) }));

    /** Seconds until the nearest coming wave reaches x (Infinity if none). */
    function eta(x) {
      let best = Infinity;
      for (const w of waves) {
        const t = (w.x - x) / w.speed;
        if (t > -WINDOW_LATE && t < best) best = t;
      }
      return best;
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        for (const p of players) if (p.jumped) lastJump.set(p.n, t);
        nextIn -= dt;
        if (nextIn <= 0) {
          const speed = 520 * Math.min(1.9, level);
          waves.push({ x: W + 160, speed, judged: new Set(), big: rng() < 0.25 });
          // pairs later in the round
          const pair = ctx.progress() > 0.5 && rng() < 0.3;
          nextIn = pair ? 0.95 : Math.max(1.7, rand(rng, 2.6, 3.6) / Math.min(1.6, level));
        }
        for (const w of waves) w.x -= w.speed * dt;
        // judge: as a wave passes a player, were they in the air (or just taking off)?
        for (const w of waves) {
          for (const p of players) {
            if (p.state !== 'active' || w.judged.has(p.n)) continue;
            const arrive = (w.x - p.hip.x) / w.speed;
            if (arrive > -WINDOW_LATE) continue;
            w.judged.add(p.n);
            const jumpedAt = lastJump.get(p.n) ?? -9;
            const when = t - WINDOW_LATE - jumpedAt; // how long before the wave reached them they took off
            if (p.airborne || (when >= -0.05 && when <= WINDOW_EARLY + WINDOW_LATE)) {
              const perfect = Math.abs(when - 0.15) < 0.18;
              ctx.report.score(p.n, perfect ? 2 : 1, p.head.x, p.head.y - p.s * 1.4, perfect ? 'PERFECT!' : 'NICE JUMP!');
              ctx.sfx.boing();
              result.set(p.n, { text: perfect ? '⭐' : '👍', until: t + 0.8 });
            } else {
              ctx.report.miss(p.n, 'jump', p.head.x, p.head.y - p.s * 1.4, 'SPLASH!');
              ctx.sfx.splash();
              ctx.fx.burst(p.hip.x, floor - 40, '#bfe6ff', 20);
              result.set(p.n, { text: '💦', until: t + 0.8 });
            }
          }
        }
        for (let i = waves.length - 1; i >= 0; i--) if (waves[i].x < -300) waves.splice(i, 1);
        for (const c of clouds) c.x = (c.x + 15 * dt * c.s + W + 300) % (W + 300);
      },

      drawBack(g) {
        const t = ctx.t();
        sky(g, W, H, '#7fd3ff', '#d9f4ff');
        // sun
        g.fillStyle = '#ffe066';
        g.beginPath();
        g.arc(W - 260, 170, 90, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.font = '120px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const c of clouds) {
          g.globalAlpha = 0.9;
          g.fillText('☁️', c.x - 150, c.y);
        }
        g.restore();
        // the sea far away, then the sand
        g.fillStyle = '#1e8fd6';
        g.fillRect(0, H * 0.48, W, H * 0.16);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        for (let x = 0; x < W; x += 90) g.fillRect((x + t * 30) % W, H * 0.5 + (x % 3) * 20, 50, 5);
        const sand = g.createLinearGradient(0, H * 0.62, 0, H);
        sand.addColorStop(0, '#f6dfa6');
        sand.addColorStop(1, '#e8c37a');
        g.fillStyle = sand;
        g.fillRect(0, H * 0.62, W, H * 0.38);
        g.fillStyle = 'rgba(160, 110, 40, 0.25)';
        for (let i = 0; i < 40; i++) g.fillRect((i * 173) % W, H * 0.66 + ((i * 97) % 300), 10, 6);
      },

      drawFront(g, players) {
        const t = ctx.t();
        // the waves: a curling blue crest rolling along the sand
        for (const w of waves) {
          const h = w.big ? 230 : 170;
          const len = 340;
          const grad = g.createLinearGradient(0, floor - h, 0, floor + 40);
          grad.addColorStop(0, '#5fd0ff');
          grad.addColorStop(1, '#0b6fb8');
          g.fillStyle = grad;
          g.beginPath();
          g.moveTo(w.x - len, floor + 40);
          g.quadraticCurveTo(w.x - len * 0.5, floor - h * 0.4, w.x, floor - h);
          g.quadraticCurveTo(w.x + 60, floor - h - 20, w.x + 80, floor - h + 50);
          g.quadraticCurveTo(w.x + 40, floor - h * 0.5, w.x + 110, floor + 40);
          g.closePath();
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.9)';
          for (let i = 0; i < 6; i++) {
            g.beginPath();
            g.arc(w.x + 20 + Math.sin(t * 10 + i) * 10 - i * 18, floor - h + 10 + i * 6, 14 - i, 0, Math.PI * 2);
            g.fill();
          }
        }
        // each player's countdown: 3, 2, 1, JUMP!
        for (const p of players) {
          if (p.state !== 'active') continue;
          const r = result.get(p.n);
          const x = p.head.x;
          const y = p.head.y - p.s * 1.7;
          if (r && t < r.until) {
            g.save();
            g.font = '90px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(r.text, x, y);
            g.restore();
            continue;
          }
          const e = eta(p.hip.x);
          if (e > 3 || e < -0.1) continue;
          const label = e < 0.45 ? 'JUMP!' : String(Math.ceil(e));
          const hot = e < 0.45;
          g.save();
          g.translate(x, y);
          const k = hot ? 1.15 + 0.1 * Math.sin(t * 25) : 1;
          g.scale(k, k);
          g.beginPath();
          g.arc(0, 0, hot ? 95 : 60, 0, Math.PI * 2);
          g.fillStyle = hot ? '#ff5d73' : 'rgba(255,255,255,0.92)';
          g.fill();
          g.lineWidth = 8;
          g.strokeStyle = p.color;
          g.stroke();
          g.fillStyle = hot ? '#fff' : '#1b1b3a';
          g.font = `900 ${hot ? 54 : 70}px "Arial Rounded MT Bold","Trebuchet MS",sans-serif`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(label, 0, 4);
          g.restore();
        }
      },

      needs() {
        return 'jump';
      },

      /** Test bot: take off just before the wave arrives. */
      bot(p) {
        const e = eta(p.hip.x);
        return e < 0.3 && e > 0.05 ? { jump: true } : {};
      },
    };
  },
};
