// Copycat Dance: a stage with spotlights and a star dancer on the big screen. The dancer strikes a pose (ARMS
// UP, AIRPLANE, HANDS ON HEAD); copy it and hold it until your ring fills up to score. Copy pose after pose
// for a combo streak. The poses change faster over the round, and half-way through, DUCK moves and golden
// spotlight moves (double points) join the party.
import { rand, pick, clamp } from './kit.js';
import { text, emoji, rr } from '../ui/theme.js';
import { drawDemo } from '../ui/coach.js';

const POSES = ['armsUp', 'airplane', 'handsHead'];
const NAMES = { armsUp: 'ARMS UP!', airplane: 'AIRPLANE!', handsHead: 'HANDS ON HEAD!', duck: 'DUCK DOWN!' };
const HOLD = 1; // s to hold the pose
const BETWEEN = 0.9; // s the dancer grooves before the next pose ("Ready?")
const SPOT = ['#ff5d73', '#ffc93c', '#5ee08a', '#3fb6ff', '#b37bff'];
const OOPS = ['Oopsie!', 'Wiggly!', 'Almost!', 'Whoops!'];

/** The time of a move's animation where it shows the pose best (the duck demo squats, then stands up). */
const holdT = (pose, t) => (pose === 'duck' ? 0.6 + (t % 0.6) : t);

export default {
  id: 'copycat-dance',
  title: 'Copycat Dance',
  icon: '🕺',
  color: '#ff5da2',
  moves: ['armsUp', 'airplane', 'handsHead'],
  howto: ['Watch the star dancer on the big screen.', 'Copy the pose and hold it still...', 'until your ring fills up!'],
  layout: 'shared',
  hearts: 0,
  stars: [20, 38, 58],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const stageY = H * 0.6; // where the stage floor starts
    /** @type {'groove'|'pose'} */
    let phase = 'groove';
    let phaseAt = 0;
    let phaseLen = 2;
    let pose = null;
    let lastPose = null;
    let gold = false;
    let twistShown = false;
    const ring = new Map(); // n -> 0..1 how long they've held this pose
    const done = new Set(); // players who copied this pose
    const streak = new Map(); // n -> successes in a row
    const oops = new Map(); // n -> { at, e }
    const sparkles = Array.from({ length: 30 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 0, stageY - 80), tw: rand(rng, 0, 6) }));
    let screenX = 290; // the big screen moves to where the players aren't
    let screenK = 1; // and shrinks when they fill the stage

    const into = () => ctx.t() - phaseAt;
    const match = (p, id) => (id === 'duck' ? p.ducking : p.pose[id]);

    function newPose() {
      const half = ctx.progress() >= 0.5;
      if (half && !twistShown) {
        twistShown = true;
        ctx.sfx.whoosh();
        ctx.fx.pop('Golden moves! ⭐', W / 2, H * 0.45, '#ffd23f');
      }
      const pool = [...POSES, ...(half ? ['duck'] : [])].filter((p) => p !== lastPose);
      pose = pick(rng, pool);
      lastPose = pose;
      gold = half && rng() < 0.3;
      phase = 'pose';
      phaseAt = ctx.t();
      phaseLen = clamp(4.6 / ctx.level(), 2.6, 5);
      ring.clear();
      done.clear();
      ctx.sfx.whoosh();
    }

    function endPose(players) {
      for (const p of players) {
        if (p.state !== 'active' || done.has(p.n)) continue;
        // a kind, funny miss: the coach shows the pose after two of them
        ctx.report.miss(p.n, pose, p.head.x, p.head.y - p.s * 1.8, pick(rng, OOPS));
        oops.set(p.n, { at: ctx.t(), e: pick(rng, ['🙃', '😜', '🤪']) });
        streak.set(p.n, 0);
      }
      if (players.some((p) => p.state === 'active' && !done.has(p.n))) ctx.sfx.miss();
      phase = 'groove';
      phaseAt = ctx.t();
      phaseLen = BETWEEN;
      pose = null;
    }

    return {
      update(dt, players) {
        if (into() >= phaseLen) {
          if (phase === 'groove') newPose();
          else endPose(players);
        }
        // the big screen goes in the widest gap between the players, and shrinks when they fill the stage
        if (players.length) {
          let want = screenX;
          let gap = -1;
          for (let x = 240; x <= W - 240; x += 40) {
            const d = Math.min(...players.map((p) => Math.abs(p.sh.x - x) - 1.6 * p.s));
            if (d > gap + 20) {
              gap = d;
              want = x;
            }
          }
          screenX += (want - screenX) * Math.min(1, dt * 2);
          screenK += (clamp(gap / 230, 0.55, 1) - screenK) * Math.min(1, dt * 2);
        }
        if (phase !== 'pose') return;
        for (const p of players) {
          if (p.state !== 'active' || done.has(p.n)) continue;
          // the ring fills while they hold the pose, and drains slowly when they wobble out of it
          const r = clamp((ring.get(p.n) ?? 0) + (match(p, pose) ? dt / HOLD : -dt / (2 * HOLD)), 0, 1);
          ring.set(p.n, r);
          if (r < 1) continue;
          done.add(p.n);
          const k = (streak.get(p.n) ?? 0) + 1;
          streak.set(p.n, k);
          const pts = (1 + (k >= 3 ? 1 : 0) + (k >= 6 ? 1 : 0)) * (gold ? 2 : 1);
          const label = gold ? `GOLDEN! +${pts}` : k >= 3 ? `COMBO x${k}!` : 'COPIED!';
          ctx.report.score(p.n, pts, p.head.x, p.head.y - p.s * 1.8, label);
          ctx.fx.burst(p.head.x, p.head.y - p.s, gold ? '#ffd23f' : p.color, 22);
          if (gold) ctx.sfx.gold();
          else ctx.sfx.score();
          if (k > 0 && k % 5 === 0) ctx.sfx.cheer();
        }
      },

      drawBack(g) {
        const t = ctx.t();
        // the back of the stage: a starry night with a glowing marquee
        const bg = g.createLinearGradient(0, 0, 0, stageY);
        bg.addColorStop(0, '#120a3a');
        bg.addColorStop(1, '#3d1a78');
        g.fillStyle = bg;
        g.fillRect(0, 0, W, stageY);
        g.save();
        for (const s of sparkles) {
          g.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.7 + s.tw));
          g.fillStyle = '#fff6c4';
          g.beginPath();
          g.arc(s.x, s.y, 4, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
        // sweeping coloured spotlights
        g.save();
        for (let i = 0; i < 5; i++) {
          const x = ((i + 0.5) * W) / 5;
          const a = Math.sin(t * (0.5 + i * 0.11) + i * 2) * 0.5;
          g.globalAlpha = gold && phase === 'pose' ? 0.22 : 0.14;
          g.fillStyle = gold && phase === 'pose' ? '#ffd23f' : SPOT[i];
          g.beginPath();
          g.moveTo(x, -20);
          g.lineTo(x + Math.sin(a) * 900 - 170, H);
          g.lineTo(x + Math.sin(a) * 900 + 170, H);
          g.closePath();
          g.fill();
        }
        g.restore();
        // the wooden stage
        const wood = g.createLinearGradient(0, stageY, 0, H);
        wood.addColorStop(0, '#b5652b');
        wood.addColorStop(1, '#7a3d14');
        g.fillStyle = wood;
        g.fillRect(0, stageY, W, H - stageY);
        g.strokeStyle = 'rgba(60, 25, 5, 0.45)';
        g.lineWidth = 4;
        for (let i = 1; i < 7; i++) {
          const y = stageY + (H - stageY) * (i / 7) ** 1.4;
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(W, y);
          g.stroke();
        }
        // footlights along the front edge of the stage
        for (let i = 0; i < 24; i++) {
          const x = ((i + 0.5) * W) / 24;
          const on = (i + Math.floor(t * 4)) % 2 === 0;
          g.fillStyle = on ? '#fff6a0' : '#c98f2c';
          g.beginPath();
          g.arc(x, H - 18, on ? 14 : 10, 0, Math.PI * 2);
          g.fill();
        }
        // velvet curtains at both sides, with soft folds
        for (const side of [0, 1]) {
          const x0 = side ? W - 170 : 0;
          const cur = g.createLinearGradient(x0, 0, x0 + 170, 0);
          for (let k = 0; k <= 6; k++) cur.addColorStop(k / 6, k % 2 ? '#c9184a' : '#800f2f');
          g.fillStyle = cur;
          g.beginPath();
          g.moveTo(x0, 0);
          g.lineTo(x0 + 170, 0);
          if (side) {
            g.quadraticCurveTo(W - 230, H * 0.5, W - 120, H);
            g.lineTo(W, H);
          } else {
            g.lineTo(170, 0);
            g.quadraticCurveTo(230, H * 0.5, 120, H);
            g.lineTo(0, H);
          }
          g.closePath();
          g.fill();
        }
        // a curtain swag along the top
        g.fillStyle = '#a4133c';
        g.beginPath();
        g.moveTo(0, 0);
        for (let i = 0; i <= 8; i++) g.quadraticCurveTo(((i - 0.5) * W) / 8, 70, (i * W) / 8, 0);
        g.closePath();
        g.fill();
        // a soft floor glow under each player's spot
        g.save();
        g.globalAlpha = 0.25;
        g.fillStyle = '#fff6c4';
        g.beginPath();
        g.ellipse(W / 2, floor, W * 0.35, 50, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      },

      drawFront(g, players) {
        const t = ctx.t();
        // each player's ring: it fills while they hold the pose
        for (const p of players) {
          const top = Math.min(p.head.y - p.head.r, ...p.hands.filter((h) => h.seen).map((h) => h.y - h.r));
          const x = p.head.x;
          const y = Math.max(200, top - 80);
          const o = oops.get(p.n);
          if (o && t - o.at < 1.2) {
            g.save();
            g.translate(x, y);
            g.rotate(Math.sin((t - o.at) * 18) * 0.25);
            emoji(g, o.e, 0, 0, 90);
            g.restore();
            continue;
          }
          if (phase !== 'pose' || p.state !== 'active') continue;
          const r = done.has(p.n) ? 1 : ring.get(p.n) ?? 0;
          const ok = done.has(p.n) || match(p, pose);
          g.save();
          g.beginPath();
          g.arc(x, y, 52, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.fill();
          g.lineWidth = 16;
          g.strokeStyle = 'rgba(40, 20, 80, 0.25)';
          g.stroke();
          if (r > 0) {
            g.beginPath();
            g.arc(x, y, 52, -Math.PI / 2, -Math.PI / 2 + r * Math.PI * 2);
            g.strokeStyle = done.has(p.n) ? '#ffd23f' : p.color;
            g.lineCap = 'round';
            g.stroke();
          }
          g.restore();
          if (done.has(p.n)) emoji(g, '⭐', x, y, 62 + 6 * Math.sin(t * 10));
          else emoji(g, ok ? '😃' : '🤔', x, y, 56);
          const k = streak.get(p.n) ?? 0;
          if (k >= 2) text(g, `🔥${k}`, x + 85, y - 30, { size: 40, color: '#ffd23f' });
        }

        // the big screen with the star dancer
        const cx = screenX;
        g.save();
        g.translate(cx, 180);
        g.scale(screenK, screenK);
        g.translate(-cx, -180);
        const top = 180;
        const w = 420;
        const h = 520;
        g.save();
        g.fillStyle = '#1b0b33';
        rr(g, cx - w / 2, top, w, h, 36);
        g.fill();
        g.lineWidth = 12;
        g.strokeStyle = gold && phase === 'pose' ? '#ffd23f' : '#ff5da2';
        g.stroke();
        // marquee bulbs around the screen
        for (let i = 0; i < 12; i++) {
          const on = (i + Math.floor(t * 5)) % 2 === 0;
          g.fillStyle = on ? '#fff6a0' : 'rgba(255,255,255,0.3)';
          for (const yy of [top, top + h]) {
            g.beginPath();
            g.arc(cx - w / 2 + 30 + (i * (w - 60)) / 11, yy, 9, 0, Math.PI * 2);
            g.fill();
          }
        }
        // a spotlight on the dancer
        const spot = g.createRadialGradient(cx, top + h - 80, 10, cx, top + h - 80, 260);
        spot.addColorStop(0, gold && phase === 'pose' ? 'rgba(255, 220, 90, 0.75)' : 'rgba(255, 246, 196, 0.6)');
        spot.addColorStop(1, 'rgba(255, 246, 196, 0)');
        g.fillStyle = spot;
        g.beginPath();
        g.moveTo(cx - 40, top + 10);
        g.lineTo(cx + 40, top + 10);
        g.lineTo(cx + 170, top + h - 50);
        g.lineTo(cx - 170, top + h - 50);
        g.closePath();
        g.fill();
        g.restore();
        const slot = 0; // the teacher look: never mistaken for a player
        if (phase === 'pose') drawDemo(g, pose, holdT(pose, t), cx, top + h - 70, 62, slot);
        else drawDemo(g, 'dance', t, cx, top + h - 70, 62, slot);
        if (gold && phase === 'pose') emoji(g, '👑', cx, top + 80 + Math.sin(t * 6) * 6, 70);
        text(g, phase === 'pose' ? 'COPY ME!' : 'Ready?', cx, top + 44, { size: 46, color: '#ffd23f' });
        if (phase === 'pose') {
          text(g, NAMES[pose], cx, top + h + 52, { size: 54, color: gold ? '#ffd23f' : '#ffffff', maxW: 520 });
          // time left for this pose
          const left = Math.max(0, 1 - into() / phaseLen);
          g.fillStyle = 'rgba(255,255,255,0.35)';
          rr(g, cx - w / 2 + 30, top + h - 34, w - 60, 18, 9);
          g.fill();
          g.fillStyle = left < 0.3 ? '#ff5d73' : '#5ee08a';
          rr(g, cx - w / 2 + 30, top + h - 34, (w - 60) * left, 18, 9);
          g.fill();
        }
        g.restore();
      },

      needs() {
        return pose ?? lastPose ?? 'armsUp';
      },

      /** Test bot: copy the dancer's pose straight away and hold it. */
      bot() {
        if (phase !== 'pose') return { move: 'dance' };
        return pose === 'duck' ? { duck: true } : { pose };
      },
    };
  },
};
