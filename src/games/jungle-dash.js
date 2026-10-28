// Jungle Dash: a jungle path. Logs roll along the ground (JUMP over them) and parrots swoop in at head height
// (DUCK under them). Each player sees a 3-2-1 count above their head with a big arrow showing which way to go:
// right on time is PERFECT (2 points), in time is NICE (1), and a miss is a silly BONK. At sunset (half-way)
// the bats come out and obstacles start coming in mixed pairs: a log then a bird, or a bird then a log.
import { rand, pick, clamp, sky } from './kit.js';

const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const ROUNDED = '"Arial Rounded MT Bold","Trebuchet MS",sans-serif';
const JUMP_EARLY = 0.45; // s before a log reaches you that a jump still counts
const LATE = 0.2; // s after an obstacle reaches you that it gets judged
const DUCK_HALF = 0.15; // you must be down while the bird is within this many seconds of your head
const CUE_JUMP = 0.45; // the count turns into JUMP! / DUCK! this long before it arrives
const CUE_DUCK = 0.6;
const LOOK = {
  log: { move: 'jump', word: 'JUMP!', dir: -1, hot: '#ff8a00' },
  bird: { move: 'duck', word: 'DUCK!', dir: 1, hot: '#8e5cff' },
};

/** A chunky arrow pointing up (dir -1) or down (dir 1), with a white outline so it reads on anything. */
function arrow(g, x, y, size, dir, color) {
  g.save();
  g.translate(x, y);
  g.scale(size / 100, (dir * size) / 100);
  g.beginPath();
  g.moveTo(0, -50);
  g.lineTo(42, -2);
  g.lineTo(17, -2);
  g.lineTo(17, 48);
  g.lineTo(-17, 48);
  g.lineTo(-17, -2);
  g.lineTo(-42, -2);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = 16;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.stroke();
  g.restore();
}

export default {
  id: 'jungle-dash',
  title: 'Jungle Dash',
  icon: '🦜',
  color: '#2bb673',
  moves: ['jump', 'duck'],
  howto: ['Logs roll along the jungle path: JUMP over them!', 'Birds swoop at your head: DUCK down low!', 'Watch the arrow and the 3, 2, 1 above you.'],
  layout: 'shared',
  hearts: 0,
  stars: [20, 45, 75],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    /** @type {{ kind: 'log'|'bird', x: number, y: number, r: number, speed: number, spin: number, em: string, judged: Set<number>, ducked: Set<number>, bonkAt: number }[]} */
    const obs = [];
    const who = new Map(); // n -> { hipX, headY (standing), jumpAt, duckAt, wasDucking, result }
    const script = ['log', 'bird']; // the first two teach one of each
    let pending = null; // the second half of a mixed pair
    let nextIn = 2.5;
    let lastKinds = [];
    let sunset = false;
    let scroll = 0;
    const trees = Array.from({ length: 9 }, (_, i) => ({ x: i * 260 + rand(rng, -60, 60), h: rand(rng, 260, 380), r: rand(rng, 90, 130), c: i % 2 ? '#1f8a4c' : '#27a35a' }));
    const palms = Array.from({ length: 6 }, (_, i) => ({ x: i * 380 + rand(rng, 0, 120), s: rand(rng, 150, 210) }));
    const vines = Array.from({ length: 9 }, (_, i) => ({ x: (i + 0.5) * (W / 9) + rand(rng, -50, 50), len: rand(rng, 120, 280), ph: rand(rng, 0, 6) }));
    const flowers = Array.from({ length: 14 }, (_, i) => ({ x: i * 150 + rand(rng, 0, 80), y: rand(rng, 0.7, 0.78) * H, e: pick(rng, ['🌺', '🌼', '🍄', '🌿']) }));
    const pebbles = Array.from({ length: 26 }, () => ({ x: rand(rng, 0, W), y: rand(rng, floor + 20, H - 20), r: rand(rng, 6, 14) }));
    const flies = Array.from({ length: 18 }, () => ({ x: rand(rng, 0, W), y: rand(rng, H * 0.15, H * 0.65), ph: rand(rng, 0, 6) }));

    const state = (n) => {
      if (!who.has(n)) who.set(n, { hipX: W / 2, headY: null, jumpAt: -9, duckAt: -9, wasDucking: false, result: null });
      return who.get(n);
    };

    /** The next obstacle still coming at x, and how many seconds until it gets there. */
    function next(x) {
      let best = null;
      let e = Infinity;
      for (const o of obs) {
        const t = (o.x - x) / o.speed;
        if (t > -LATE && t < e) {
          e = t;
          best = o;
        }
      }
      return { o: best, e };
    }

    function chooseKind() {
      if (script.length) return script.shift();
      // never three of the same in a row, so both moves keep coming
      if (lastKinds.length >= 2 && lastKinds[0] === lastKinds[1]) return lastKinds[0] === 'log' ? 'bird' : 'log';
      return rng() < 0.5 ? 'log' : 'bird';
    }

    function spawn(kind, speed) {
      lastKinds = [kind, ...lastKinds].slice(0, 2);
      obs.push({
        kind,
        x: W + 160,
        y: H * 0.15,
        r: kind === 'log' ? (rng() < 0.3 ? 82 : 66) : 0,
        speed,
        spin: 0,
        em: sunset ? '🦇' : pick(rng, ['🦜', '🐦', '🦜']),
        judged: new Set(),
        ducked: new Set(),
        bonkAt: -9,
      });
    }

    function judge(o, p, t) {
      const st = state(p.n);
      const x = p.head.x;
      const y = p.head.y - p.s * 1.4;
      let ok = false;
      let perfect = false;
      if (o.kind === 'log') {
        const when = t - LATE - st.jumpAt; // how long before the log reached them they took off
        ok = p.airborne || (when >= -0.05 && when <= JUMP_EARLY + LATE);
        perfect = ok && Math.abs(when - 0.15) < 0.18;
      } else {
        const when = t - LATE - st.duckAt; // how long before the bird reached them they got down
        ok = o.ducked.has(p.n);
        perfect = ok && when >= 0.1 && when <= 0.9;
      }
      if (ok) {
        ctx.report.score(p.n, perfect ? 2 : 1, x, y, perfect ? 'PERFECT!' : o.kind === 'log' ? 'NICE JUMP!' : 'NICE DUCK!');
        if (o.kind === 'log') ctx.sfx.boing();
        else ctx.sfx.whoosh();
        st.result = { text: perfect ? '⭐' : '👍', until: t + 0.8 };
      } else {
        const label = o.kind === 'log' ? pick(rng, ['BONK!', 'Bonk! Oopsie!', 'Tripped! BONK!']) : pick(rng, ['BONK! Tweet!', 'Feathers! BONK!', 'Bird hug! BONK!']);
        ctx.report.miss(p.n, LOOK[o.kind].move, x, y, label);
        ctx.sfx.bonk();
        o.bonkAt = t;
        if (o.kind === 'log') ctx.fx.burst(p.hip.x, floor - 30, '#c68642', 16);
        else ctx.fx.burst(p.head.x, p.head.y, '#7ee081', 18);
        st.result = { text: '💫', until: t + 0.9 };
      }
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        if (!sunset && ctx.progress() >= 0.5) {
          sunset = true;
          ctx.sfx.whoosh();
          ctx.fx.pop('Sunset! Here come the bats!', W / 2, H * 0.3, '#ffd23f');
        }
        for (const p of players) {
          const st = state(p.n);
          st.hipX = p.hip.x;
          if (p.state !== 'active') continue;
          if (p.jumped) st.jumpAt = t;
          if (p.ducking && !st.wasDucking) st.duckAt = t;
          st.wasDucking = p.ducking;
          if (!p.ducking && !p.airborne) st.headY = st.headY === null ? p.head.y : st.headY + (p.head.y - st.headY) * Math.min(1, dt * 3);
        }
        // spawning: one at a time, then mixed pairs after sunset
        nextIn -= dt;
        if (nextIn <= 0) {
          const speed = 520 * Math.min(1.9, level);
          if (pending) {
            spawn(pending, speed);
            pending = null;
            nextIn = Math.max(1.9, rand(rng, 2.8, 3.6) / Math.min(1.6, level));
          } else {
            const kind = chooseKind();
            spawn(kind, speed);
            if (sunset && rng() < 0.4) {
              pending = kind === 'log' ? 'bird' : 'log';
              nextIn = clamp(1.75 - 0.25 * level, 1.25, 1.5);
            } else nextIn = Math.max(1.7, rand(rng, 2.6, 3.6) / Math.min(1.6, level));
          }
        }
        for (const o of obs) {
          o.x -= o.speed * dt;
          if (o.kind === 'log') o.spin -= (o.speed * dt) / o.r;
          else {
            // swoop down to the standing head height of whoever it is about to reach
            let target = H * 0.4;
            let best = Infinity;
            for (const p of players) {
              const st = state(p.n);
              const d = p.hip.x - o.x;
              if (st.headY !== null && d < 200 && -d < best) {
                best = -d;
                target = st.headY;
              }
            }
            if (t - o.bonkAt < 1) target = H * 0.12;
            o.y += (target - o.y) * Math.min(1, dt * 3.5);
          }
        }
        // judge each obstacle as it passes each player
        for (const o of obs) {
          for (const p of players) {
            if (o.judged.has(p.n)) continue;
            const arrive = (o.x - p.hip.x) / o.speed;
            if (o.kind === 'bird' && p.state === 'active' && p.ducking && Math.abs(arrive) < DUCK_HALF) o.ducked.add(p.n);
            if (arrive > -LATE) continue;
            o.judged.add(p.n);
            if (p.state === 'active') judge(o, p, ctx.t());
          }
        }
        for (let i = obs.length - 1; i >= 0; i--) if (obs[i].x < -300) obs.splice(i, 1);
        scroll += 180 * Math.min(1.9, level) * dt;
      },

      drawBack(g) {
        const t = ctx.t();
        const dusk = clamp((ctx.progress() - 0.5) / 0.08, 0, 1);
        sky(g, W, H, '#7fd8ff', '#e6fff0');
        if (dusk > 0) {
          g.save();
          g.globalAlpha = dusk;
          sky(g, W, H, '#5b4bb7', '#ffb36b');
          g.restore();
        }
        // the sun: high at midday, big and orange at sunset
        const sunY = 170 + dusk * 300;
        g.fillStyle = dusk > 0.5 ? '#ff8c42' : '#ffe066';
        g.beginPath();
        g.arc(W - 300, sunY, 90 + dusk * 40, 0, Math.PI * 2);
        g.fill();
        // far hills
        g.fillStyle = dusk > 0.5 ? '#2f5d50' : '#4fb87a';
        g.beginPath();
        g.moveTo(0, H * 0.62);
        for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.5 - 50 * Math.sin((x + scroll * 0.1) * 0.004) - 30 * Math.sin((x + scroll * 0.1) * 0.011));
        g.lineTo(W, H * 0.62);
        g.fill();
        // jungle trees, drifting by
        const span = 9 * 260;
        for (const tr of trees) {
          const x = ((((tr.x - scroll * 0.3) % span) + span) % span) - 150;
          g.fillStyle = '#7a4a24';
          g.fillRect(x - 18, H * 0.66 - tr.h, 36, tr.h);
          g.fillStyle = tr.c;
          for (const [dx, dy, k] of [[0, 0, 1], [-0.7, 0.35, 0.75], [0.7, 0.35, 0.75]]) {
            g.beginPath();
            g.arc(x + dx * tr.r, H * 0.66 - tr.h + dy * tr.r, tr.r * k, 0, Math.PI * 2);
            g.fill();
          }
        }
        g.save();
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        const pspan = 6 * 380;
        for (const pl of palms) {
          const x = ((((pl.x - scroll * 0.5) % pspan) + pspan) % pspan) - 150;
          g.font = `${pl.s}px ${EMOJI}`;
          g.fillText('🌴', x, H * 0.7);
        }
        g.restore();
        // grass, then the dirt path the logs roll along
        g.fillStyle = dusk > 0.5 ? '#2c8a46' : '#46c35f';
        g.fillRect(0, H * 0.66, W, floor - H * 0.66 + 10);
        const path = g.createLinearGradient(0, floor - 40, 0, H);
        path.addColorStop(0, '#e2a96a');
        path.addColorStop(1, '#b97a3f');
        g.fillStyle = path;
        g.beginPath();
        g.moveTo(0, H);
        g.lineTo(0, floor - 30);
        for (let x = 0; x <= W; x += 60) g.lineTo(x, floor - 30 + 8 * Math.sin((x + scroll) * 0.02));
        g.lineTo(W, H);
        g.fill();
        g.fillStyle = 'rgba(110, 66, 30, 0.35)';
        for (const pb of pebbles) {
          const x = (((pb.x - scroll) % W) + W) % W;
          g.beginPath();
          g.ellipse(x, pb.y, pb.r * 1.4, pb.r, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.save();
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `58px ${EMOJI}`;
        const fspan = 14 * 150;
        for (const f of flowers) g.fillText(f.e, ((((f.x - scroll * 0.8) % fspan) + fspan) % fspan) - 80, f.y);
        g.restore();
        // vines hanging from the canopy
        g.lineCap = 'round';
        for (const v of vines) {
          const sway = Math.sin(t * 1.3 + v.ph) * 16;
          g.strokeStyle = '#2f7d32';
          g.lineWidth = 10;
          g.beginPath();
          g.moveTo(v.x, -10);
          g.quadraticCurveTo(v.x + sway, v.len * 0.5, v.x + sway * 1.5, v.len);
          g.stroke();
          g.fillStyle = '#4caf50';
          for (let k = 1; k <= 3; k++) {
            g.beginPath();
            g.ellipse(v.x + sway * (k / 3) * 1.4 + (k % 2 ? 16 : -16), (v.len * k) / 3.4, 22, 11, k % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
            g.fill();
          }
        }
        // fireflies at sunset
        if (dusk > 0) {
          g.save();
          for (const f of flies) {
            g.globalAlpha = dusk * (0.4 + 0.6 * Math.abs(Math.sin(t * 2 + f.ph)));
            g.fillStyle = '#fff59d';
            g.beginPath();
            g.arc(f.x + Math.sin(t + f.ph) * 30, f.y + Math.cos(t * 0.8 + f.ph) * 20, 7, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        for (const o of obs) {
          if (o.kind === 'log') {
            const hop = t - o.bonkAt < 0.4 ? Math.sin(((t - o.bonkAt) / 0.4) * Math.PI) * 60 : 0;
            const cy = floor - o.r - hop;
            g.fillStyle = 'rgba(60, 30, 10, 0.3)';
            g.beginPath();
            g.ellipse(o.x, floor + 4, o.r * 1.1, 16, 0, 0, Math.PI * 2);
            g.fill();
            g.save();
            g.translate(o.x, cy);
            g.fillStyle = '#8b5a2b';
            g.beginPath();
            g.arc(0, 0, o.r, 0, Math.PI * 2);
            g.fill();
            g.lineWidth = 8;
            g.strokeStyle = '#4a2c12';
            g.stroke();
            g.fillStyle = '#e8b878';
            g.beginPath();
            g.arc(0, 0, o.r * 0.78, 0, Math.PI * 2);
            g.fill();
            g.strokeStyle = '#b98345';
            g.lineWidth = 5;
            for (const k of [0.55, 0.32]) {
              g.beginPath();
              g.arc(0, 0, o.r * k, 0, Math.PI * 2);
              g.stroke();
            }
            g.rotate(o.spin);
            g.strokeStyle = '#9c6a35';
            g.lineWidth = 6;
            g.beginPath();
            for (let k = 0; k < 3; k++) {
              const a = (k * Math.PI * 2) / 3;
              g.moveTo(Math.cos(a) * o.r * 0.12, Math.sin(a) * o.r * 0.12);
              g.lineTo(Math.cos(a) * o.r * 0.7, Math.sin(a) * o.r * 0.7);
            }
            g.stroke();
            g.restore();
            // a little mushroom riding on top, for fun
            g.save();
            g.font = `44px ${EMOJI}`;
            g.textAlign = 'center';
            g.textBaseline = 'bottom';
            g.fillText('🍄', o.x, cy - o.r + 12);
            g.restore();
          } else {
            const bonked = t - o.bonkAt < 1;
            // speed lines behind it
            g.strokeStyle = 'rgba(255,255,255,0.8)';
            g.lineWidth = 6;
            g.lineCap = 'round';
            for (let k = -1; k <= 1; k++) {
              g.beginPath();
              g.moveTo(o.x + 70, o.y + k * 22);
              g.lineTo(o.x + 130 + Math.abs(k) * -20, o.y + k * 22);
              g.stroke();
            }
            g.save();
            g.translate(o.x, o.y);
            if (bonked) g.rotate((t - o.bonkAt) * 14);
            g.scale(1, 0.85 + 0.15 * Math.sin(t * 22));
            g.font = `120px ${EMOJI}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(o.em, 0, 0);
            g.restore();
            if (bonked) {
              g.save();
              g.font = `56px ${EMOJI}`;
              g.textAlign = 'center';
              g.fillText('🪶', o.x - 40, o.y + 70 + (t - o.bonkAt) * 120);
              g.restore();
            }
          }
        }
        // each player's countdown: 3, 2, 1 with an arrow, then JUMP! or DUCK!
        for (const p of players) {
          if (p.state !== 'active') continue;
          const st = state(p.n);
          const x = p.head.x;
          const y = p.head.y - p.s * 1.7;
          if (st.result && t < st.result.until) {
            g.save();
            g.font = `90px ${EMOJI}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(st.result.text, x, y);
            g.restore();
            continue;
          }
          const { o, e } = next(p.hip.x);
          if (!o || e > 3 || e < -0.1) continue;
          const look = LOOK[o.kind];
          const hot = e < (o.kind === 'log' ? CUE_JUMP : CUE_DUCK);
          const label = hot ? look.word : String(Math.ceil(e));
          g.save();
          g.translate(x, y);
          const k = hot ? 1.15 + 0.1 * Math.sin(t * 25) : 1;
          g.scale(k, k);
          g.beginPath();
          g.arc(0, 0, hot ? 95 : 60, 0, Math.PI * 2);
          g.fillStyle = hot ? look.hot : 'rgba(255,255,255,0.92)';
          g.fill();
          g.lineWidth = 8;
          g.strokeStyle = p.color;
          g.stroke();
          g.fillStyle = hot ? '#fff' : '#1b1b3a';
          g.font = `900 ${hot ? 50 : 70}px ${ROUNDED}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(label, 0, 4);
          // the arrow says which way: bouncing up for a log, down for a bird
          const bob = Math.sin(t * 10) * 8 * look.dir;
          arrow(g, hot ? 150 : 115, bob, hot ? 110 : 85, look.dir, look.hot);
          g.restore();
        }
      },

      needs(n) {
        const { o } = next(state(n).hipX);
        return o ? LOOK[o.kind].move : 'jump';
      },

      /** Test bot: take off just before a log arrives; get down before a bird and stay down until it's past. */
      bot(p) {
        const { o, e } = next(p.hip.x);
        if (!o) return {};
        if (o.kind === 'log') return e < 0.3 && e > 0.05 ? { jump: true } : {};
        return e < 0.55 ? { duck: true } : {};
      },
    };
  },
};
