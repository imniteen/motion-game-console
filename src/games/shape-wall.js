// Shape Wall: a TV game show. A big foam wall slides out of the studio towards the players with a
// body-shaped hole for each of them: ARMS UP, AIRPLANE or HANDS ON HEAD. The pose is shown big with a 3-2-1;
// be in that shape when the wall arrives and it whooshes right through you (2 points), otherwise BONK! The
// walls come quicker over the round, and half-way through, low DUCK walls join in (squat down!).
import { pick, clamp } from './kit.js';
import { text, emoji, rr } from '../ui/theme.js';
import { drawDemo } from '../ui/coach.js';
import { MOVES } from '../moves.js';
import { synthSkeleton } from '../vision/synth.js';
import { LM } from '../vision/landmarks.js';

const POSES = ['armsUp', 'airplane', 'handsHead'];
const NAMES = { armsUp: 'ARMS UP!', airplane: 'AIRPLANE!', handsHead: 'HANDS ON HEAD!', duck: 'DUCK DOWN!' };
const EARLY = 0.5; // s before the wall arrives that the right shape already counts
const LATE = 0.25; // s after it arrives (the wall is judged then)
const GAP = 1.3; // s between one wall arriving and the next one setting off
const PASS = 0.6; // s the wall takes to fly past the camera
const PTS = 2;
const BULBS = ['#ffd23f', '#ff5d73', '#5ee08a', '#3fb6ff'];

/** The time of a move's animation where it shows the pose best (the duck demo squats, then stands up). */
const holdT = (pose, t) => (pose === 'duck' ? 0.6 + (t % 0.6) : t);

export default {
  id: 'shape-wall',
  title: 'Shape Wall',
  icon: '🧱',
  color: '#ff8c42',
  moves: ['armsUp', 'airplane', 'handsHead', 'duck'],
  howto: ['A wall is coming with a funny hole in it!', 'Make the same shape as the hole...', 'and the wall whooshes right past you!'],
  layout: 'shared',
  hearts: 0,
  stars: [14, 24, 32],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const vp = { x: W / 2, y: H * 0.44 }; // where the walls come from
    /** @type {{ pose: string, at: number, dur: number, ok: Set<number>, ready: Set<number>, judged: boolean } | null} */
    let wall = null;
    let passing = null; // the last wall, flying past the camera
    let nextAt = 2;
    let lastPose = null;
    let duckShown = false;
    let lastCount = 0;
    const homes = new Map(); // n -> { x, hipY, s }: where a player's hole goes
    const dizzy = new Map(); // n -> time of a bonk
    const yay = new Map(); // n -> time of a whoosh

    const match = (p, pose) => (pose === 'duck' ? p.ducking : p.pose[pose]);
    const eta = () => (wall ? wall.at + wall.dur - ctx.t() : Infinity);

    function launch() {
      const half = ctx.progress() >= 0.5;
      let pose;
      if (half && !duckShown) {
        pose = 'duck';
        duckShown = true;
        ctx.sfx.whoosh();
        ctx.fx.pop('New: DUCK walls! 🐸', W / 2, H * 0.5, '#ffd23f');
      } else pose = pick(rng, [...POSES, ...(half ? ['duck'] : [])].filter((p) => p !== lastPose));
      lastPose = pose;
      const dur = clamp(6.2 / ctx.level(), ctx.rush?.() ? 2.9 : 3.6, 6.5); // the final rush lets walls come quicker
      wall = { pose, at: ctx.t(), dur, ok: new Set(), ready: new Set(), judged: false };
      lastCount = 0;
      ctx.sfx.whoosh();
    }

    /** Wall space (full size, at the players) -> screen, for a wall at scale k. */
    const P = (x, y, k) => ({ x: vp.x + (x - vp.x) * k, y: vp.y + (y - vp.y) * k });

    /** The body-shaped hole for one player, drawn as fat strokes (outline first, then the light behind). */
    function hole(g, pose, home, k, edge, fill) {
      const m = MOVES[pose].pose(holdT(pose, 0));
      const px = synthSkeleton({ x: home.x, hipY: home.hipY, sw: home.s, ...m, vis: 1 });
      const q = (i) => P(px[i].x, px[i].y, k);
      const s = home.s * k;
      const lines = [
        [[LM.shL, LM.elL, LM.wrL], 0.85],
        [[LM.shR, LM.elR, LM.wrR], 0.85],
        [[LM.hipL, LM.knL, LM.anL], 0.9],
        [[LM.hipR, LM.knR, LM.anR], 0.9],
        [[LM.shL, LM.shR, LM.hipR, LM.hipL, LM.shL], 0.9],
      ];
      for (const [color, extra] of [[edge, 0.28], [fill, 0]]) {
        g.strokeStyle = color;
        g.fillStyle = color;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        for (const [ids, w] of lines) {
          g.lineWidth = (w + extra) * s;
          g.beginPath();
          const a = q(ids[0]);
          g.moveTo(a.x, a.y);
          for (const i of ids.slice(1)) {
            const b = q(i);
            g.lineTo(b.x, b.y);
          }
          g.stroke();
        }
        const sh = { x: (q(LM.shL).x + q(LM.shR).x) / 2, y: (q(LM.shL).y + q(LM.shR).y) / 2 };
        const hp = { x: (q(LM.hipL).x + q(LM.hipR).x) / 2, y: (q(LM.hipL).y + q(LM.hipR).y) / 2 };
        g.beginPath();
        g.ellipse((sh.x + hp.x) / 2, (sh.y + hp.y) / 2, 0.75 * s + extra * s * 0.5, Math.abs(hp.y - sh.y) / 2 + 0.3 * s + extra * s * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        const nose = q(LM.nose);
        g.beginPath();
        g.arc(nose.x, nose.y - 0.1 * s, (0.72 + extra * 0.5) * s, 0, Math.PI * 2);
        g.fill();
      }
    }

    /** The foam wall at scale k, with a hole for every player. */
    function drawWall(g, w, k, players, alpha = 1) {
      const t = ctx.t();
      const a = P(-80, 150, k);
      const b = P(W + 80, floor + 60, k);
      g.save();
      g.globalAlpha *= alpha;
      const grad = g.createLinearGradient(0, a.y, 0, b.y);
      grad.addColorStop(0, w.pose === 'duck' ? '#7a5cff' : '#ff8c42');
      grad.addColorStop(1, w.pose === 'duck' ? '#4b2fc9' : '#e8590c');
      g.fillStyle = grad;
      rr(g, a.x, a.y, b.x - a.x, b.y - a.y, 40 * k);
      g.fill();
      g.lineWidth = 16 * k;
      g.strokeStyle = '#ffffff';
      g.stroke();
      // foam bricks
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = 6 * k;
      const rows = 8;
      for (let r = 1; r < rows; r++) {
        const y = a.y + ((b.y - a.y) * r) / rows;
        g.beginPath();
        g.moveTo(a.x, y);
        g.lineTo(b.x, y);
        g.stroke();
        for (let c = r % 2 ? 0.5 : 0; c < 12; c++) {
          const x = a.x + ((b.x - a.x) * c) / 12;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y - (b.y - a.y) / rows);
          g.stroke();
        }
      }
      // the holes, glowing with the studio lights behind
      const homesNow = players.length ? players.map((p) => ({ home: homes.get(p.n), color: p.color })).filter((h) => h.home) : [];
      if (!homesNow.length) homesNow.push({ home: { x: W / 2, hipY: floor - 2.2 * 95, s: 95 }, color: '#ffffff' });
      const glow = 0.85 + 0.15 * Math.sin(t * 6);
      for (const h of homesNow) hole(g, w.pose, h.home, k, h.color, `rgba(255, 246, 196, ${glow})`);
      g.restore();
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        for (const p of players) {
          // the hole is cut where the player stands (and how big they are), updated while they stand normally
          const h = homes.get(p.n);
          if (!h) homes.set(p.n, { x: p.hip.x, hipY: p.hip.y, s: p.s });
          else if (!p.ducking && !p.airborne) {
            const f = Math.min(1, dt * 4);
            h.x += (p.hip.x - h.x) * f;
            h.hipY += (p.hip.y - h.hipY) * f;
            h.s += (p.s - h.s) * f;
          } else h.x += (p.hip.x - h.x) * Math.min(1, dt * 4);
        }
        if (!wall && t >= nextAt) launch();
        if (!wall) return;
        const e = eta();
        // 3, 2, 1...
        const count = Math.ceil(e);
        if (count >= 1 && count <= 3 && count !== lastCount) {
          lastCount = count;
          ctx.sfx.tick();
        }
        // the right shape any time in the window counts (bodies and the camera need a moment)
        for (const p of players) {
          if (p.state !== 'active' || !match(p, wall.pose)) continue;
          if (e < 3 && !wall.ready.has(p.n)) {
            wall.ready.add(p.n);
            ctx.report.good(p.n); // in the right shape already: well done (the points come when the wall does)
          }
          if (e < EARLY) wall.ok.add(p.n);
        }
        if (e <= -LATE && !wall.judged) {
          wall.judged = true;
          let bonks = 0;
          for (const p of players) {
            if (p.state !== 'active') continue;
            const x = p.head.x;
            const y = p.head.y - p.s * 1.8;
            if (wall.ok.has(p.n)) {
              ctx.report.score(p.n, PTS, x, y, 'WHOOSH!');
              ctx.fx.burst(p.sh.x, p.sh.y, '#fff6c4', 18);
              yay.set(p.n, t);
            } else {
              ctx.report.miss(p.n, wall.pose, x, y, 'BONK!');
              ctx.fx.burst(p.head.x, p.head.y, '#ffd23f', 14);
              dizzy.set(p.n, t);
              bonks++;
            }
          }
          if (bonks) {
            ctx.sfx.bonk();
            ctx.fx.shake(10);
          } else ctx.sfx.cheer();
          passing = { w: wall, at: t };
          wall = null;
          nextAt = t + GAP;
        }
        if (passing && t - passing.at > PASS) passing = null;
      },

      drawBack(g, players) {
        const t = ctx.t();
        // the studio: warm back wall with a curtain of light stripes
        const bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#3a1c71');
        bg.addColorStop(0.55, '#d76d77');
        bg.addColorStop(1, '#ffaf7b');
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);
        g.save();
        for (let i = 0; i < 16; i++) {
          g.globalAlpha = 0.08 + 0.05 * Math.sin(t * 2 + i);
          g.fillStyle = i % 2 ? '#ffffff' : '#ffd23f';
          g.fillRect((i * W) / 16, 0, W / 32, H * 0.6);
        }
        g.restore();
        // the shiny floor, with lines running to where the walls come from
        const fl = g.createLinearGradient(0, vp.y, 0, H);
        fl.addColorStop(0, '#5a2a82');
        fl.addColorStop(1, '#2b0f4c');
        g.fillStyle = fl;
        g.fillRect(0, vp.y + 60, W, H - vp.y - 60);
        g.strokeStyle = 'rgba(255, 210, 63, 0.45)';
        g.lineWidth = 5;
        for (let i = -8; i <= 8; i++) {
          g.beginPath();
          g.moveTo(vp.x + i * 30, vp.y + 60);
          g.lineTo(vp.x + i * 260, H);
          g.stroke();
        }
        for (let i = 0; i < 6; i++) {
          const y = vp.y + 60 + (H - vp.y - 60) * ((i + ((t * 0.8) % 1)) / 6) ** 2;
          g.globalAlpha = 0.3;
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(W, y);
          g.stroke();
          g.globalAlpha = 1;
        }
        // the tunnel the walls come out of, framed with chasing light bulbs
        g.fillStyle = '#1b0b33';
        rr(g, vp.x - 260, vp.y - 170, 520, 230, 30);
        g.fill();
        const bulbs = 22;
        for (let i = 0; i < bulbs; i++) {
          const f = i / bulbs;
          const per = 2 * (520 + 230);
          let d = f * per;
          let x;
          let y;
          if (d < 520) [x, y] = [vp.x - 260 + d, vp.y - 170];
          else if ((d -= 520) < 230) [x, y] = [vp.x + 260, vp.y - 170 + d];
          else if ((d -= 230) < 520) [x, y] = [vp.x + 260 - d, vp.y + 60];
          else [x, y] = [vp.x - 260, vp.y + 60 - (d - 520)];
          const on = (i + Math.floor(t * 6)) % 3 === 0;
          g.fillStyle = on ? BULBS[i % 4] : 'rgba(255,255,255,0.35)';
          g.beginPath();
          g.arc(x, y, on ? 13 : 9, 0, Math.PI * 2);
          g.fill();
        }
        // studio spotlights at the sides
        g.save();
        for (const [x, dir] of [[90, 1], [W - 90, -1]]) {
          g.globalAlpha = 0.14;
          g.fillStyle = '#fff6c4';
          const a = Math.sin(t * 0.7 + x) * 0.25;
          g.beginPath();
          g.moveTo(x, 40);
          g.lineTo(x + dir * (700 + 300 * a) - 160, H);
          g.lineTo(x + dir * (700 + 300 * a) + 160, H);
          g.closePath();
          g.fill();
          g.globalAlpha = 1;
          emoji(g, '🔦', x, 70, 70);
        }
        g.restore();
        // the wall coming, behind the players until it reaches them
        if (wall) {
          const f = clamp((t - wall.at) / wall.dur, 0, 1);
          drawWall(g, wall, 0.08 + 0.92 * f ** 1.7, players);
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        // the wall flies on past the camera
        if (passing) {
          const age = t - passing.at;
          drawWall(g, passing.w, 1 + age * 1.6, players, Math.max(0, 1 - age / PASS) * 0.8);
        }
        // how each player did, and a check mark while they're in the right shape
        for (const p of players) {
          const d = dizzy.get(p.n);
          if (d !== undefined && t - d < 1.4) {
            for (let i = 0; i < 3; i++) {
              const a = t * 5 + (i * Math.PI * 2) / 3;
              emoji(g, '💫', p.head.x + Math.cos(a) * p.s * 0.9, p.head.y - p.head.r - 10 + Math.sin(a) * 18, 54);
            }
          }
          const y = yay.get(p.n);
          if (y !== undefined && t - y < 1) emoji(g, '🌟', p.head.x, p.head.y - p.s * 2.4, 80);
          if (wall && p.state === 'active' && eta() < 3.2) {
            const ok = match(p, wall.pose);
            emoji(g, ok ? '✅' : '🤔', p.head.x + p.s * 1.3, p.head.y - p.s * 1.1, 64);
          }
        }
        if (!wall) return;
        // the shape to make, big, on a game-show card
        const cx = 260;
        const top = 190;
        const pulse = eta() < 3 ? 1 + 0.03 * Math.sin(t * 12) : 1;
        g.save();
        g.translate(cx, top + 230);
        g.scale(pulse, pulse);
        g.translate(-cx, -(top + 230));
        g.fillStyle = 'rgba(255,255,255,0.96)';
        rr(g, cx - 200, top, 400, 470, 40);
        g.fill();
        g.lineWidth = 12;
        g.strokeStyle = wall.pose === 'duck' ? '#7a5cff' : '#ff8c42';
        g.stroke();
        text(g, 'Make this shape!', cx, top + 44, { size: 38, color: '#3a1c71', stroke: null });
        drawDemo(g, wall.pose, holdT(wall.pose, t), cx, top + 385, 66, 2);
        text(g, NAMES[wall.pose], cx, top + 432, { size: 44, color: '#e8590c', stroke: null, maxW: 370 });
        g.restore();
        // 3, 2, 1, NOW!
        const e = eta();
        if (e <= 3 && e > -LATE) {
          const label = e > 0.35 ? String(Math.ceil(e)) : 'NOW!';
          const hot = e <= 0.35;
          const f = e > 0 ? 1 - (e % 1) : 1;
          g.save();
          g.translate(W / 2, 300);
          const k = hot ? 1.2 + 0.08 * Math.sin(t * 25) : 1.25 - 0.25 * Math.min(1, f * 4);
          g.scale(k, k);
          g.beginPath();
          g.arc(0, 0, 100, 0, Math.PI * 2);
          g.fillStyle = hot ? '#ff5d73' : 'rgba(255,255,255,0.95)';
          g.fill();
          g.lineWidth = 12;
          g.strokeStyle = '#ffd23f';
          g.stroke();
          text(g, label, 0, 6, { size: hot ? 64 : 120, color: hot ? '#fff' : '#3a1c71', stroke: null });
          g.restore();
        }
      },

      needs() {
        return wall ? wall.pose : lastPose ?? 'armsUp';
      },

      /** Test bot: get into the shape a couple of seconds before the wall arrives, and hold it. */
      bot() {
        const pose = wall ? wall.pose : passing && ctx.t() - passing.at < 0.1 ? passing.w.pose : null;
        if (!pose || eta() > 2.2) return {};
        return pose === 'duck' ? { duck: true } : { pose };
      },
    };
  },
};
