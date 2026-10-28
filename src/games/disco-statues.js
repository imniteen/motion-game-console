// Disco Statues: a disco with a spinning mirror ball. While the lights flash it says DANCE!: wiggle to earn
// music notes. Then a 3-2-1 and FREEZE!: stand still like an ice statue for a few seconds to earn the big
// points (only if you danced first, so standing still all round earns nothing). Moving in the freeze is a
// funny WOBBLE that cracks your ice cube. Half-way through come STATUE freezes: freeze in the pose shown.
import { rand, pick, clamp } from './kit.js';
import { text, emoji, rr } from '../ui/theme.js';
import { drawDemo } from '../ui/coach.js';

const DANCING = 1.1; // energy that counts as dancing
const WOBBLY = 1.3; // energy that breaks a freeze
const WOBBLE_FOR = 0.3; // s of wobbling before the ice cracks (one twitch is fine)
const GRACE = 0.9; // s after FREEZE! to stop (bodies don't stop instantly, and nor does the tracker)
const NOTE_EVERY = 1.5; // s of dancing per music note (+1)
const NOTES_MAX = 3; // notes one dance can earn: the freeze is where the big points are
const FREEZE_PTS = 4;
const STATUE_PTS = 6;
const RESULT_SHOW = 1.3; // s the freeze results stay up at the start of the next dance
const STATUES = ['armsUp', 'airplane', 'handsHead'];
const STATUE_NAMES = { armsUp: 'ARMS UP!', airplane: 'AIRPLANE!', handsHead: 'HANDS ON HEAD!' };
const DISCO = ['#ff5d73', '#ffc93c', '#5ee08a', '#3fb6ff', '#b37bff', '#ff8fd8'];

export default {
  id: 'disco-statues',
  title: 'Disco Statues',
  icon: '🪩',
  color: '#b37bff',
  moves: ['freeze', 'dance'],
  howto: ['Dance and wiggle while the lights flash!', 'When it says FREEZE, stop like a statue!', 'Stay frozen to win the big points!'],
  layout: 'shared',
  hearts: 0,
  stars: [34, 50, 62],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floorTop = H * 0.62;
    /** @type {'dance'|'count'|'freeze'} */
    let phase = 'dance';
    let phaseAt = 0;
    let phaseLen = 4;
    let beat = 1; // seconds per count in the 3-2-1
    let statue = null; // the pose of a statue freeze (second half), or null
    let lastStatue = null;
    let freezes = 0;
    let twistShown = false;
    let lastTick = 0;
    let cheerAt = -9;
    /** n -> per-player state for this dance / freeze */
    const pl = new Map();
    const notes = []; // floating music notes from dancers: { x, y, vy, e, age, c }
    const stars = Array.from({ length: 40 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 0, floorTop - 40), r: rand(rng, 2, 5), tw: rand(rng, 0, 6) }));

    const st = (n) => {
      let s = pl.get(n);
      if (!s) {
        s = { danced: 0, notes: 0, eligible: false, wobble: 0, cracked: -1, statueOk: false, idleFor: 0, result: null, noteIn: 0 };
        pl.set(n, s);
      }
      return s;
    };
    const into = () => ctx.t() - phaseAt;

    function startDance() {
      phase = 'dance';
      phaseAt = ctx.t();
      const lv = clamp(ctx.level(), 0.7, 1.6);
      phaseLen = RESULT_SHOW + rand(rng, 4.5, 7.5) / lv;
      for (const s of pl.values()) {
        s.danced = 0;
        s.notes = 0;
        s.noteIn = 0;
      }
    }

    function startCount() {
      phase = 'count';
      phaseAt = ctx.t();
      beat = ctx.level() > 1.35 ? 0.8 : 1;
      phaseLen = 3 * beat;
      lastTick = 0;
      // the twist: every other freeze in the second half is a statue freeze (never the same pose twice)
      statue = ctx.progress() >= 0.5 && freezes % 2 === 1 ? pick(rng, STATUES.filter((s) => s !== lastStatue)) : null;
      if (statue) lastStatue = statue;
    }

    function startFreeze(players) {
      phase = 'freeze';
      phaseAt = ctx.t();
      phaseLen = GRACE + 2 + 0.5 * clamp(ctx.level(), 0.7, 2);
      freezes++;
      ctx.sfx.freeze();
      ctx.fx.shake(6);
      for (const p of players) {
        const s = st(p.n);
        s.eligible = s.notes > 0; // you have to dance to freeze!
        s.wobble = 0;
        s.cracked = -1;
        s.statueOk = false;
        s.result = null;
      }
    }

    function endFreeze(players) {
      let happy = false;
      for (const p of players) {
        if (p.state !== 'active') continue;
        const s = st(p.n);
        if (s.cracked >= 0) continue; // already told
        const x = p.head.x;
        const y = p.head.y - p.s * 1.8;
        if (!s.eligible) {
          ctx.fx.pop('Dance first! 💃', x, y, '#ffd23f');
          continue;
        }
        const super_ = statue && s.statueOk;
        ctx.report.score(p.n, super_ ? STATUE_PTS : FREEZE_PTS, x, y, super_ ? 'SUPER STATUE!' : 'FROZEN! ❄️');
        ctx.fx.burst(p.sh.x, p.sh.y, '#c9f1ff', 24);
        s.result = { e: super_ ? '🗽' : '🧊', at: ctx.t() };
        happy = true;
      }
      if (happy) {
        ctx.sfx.cheer();
        cheerAt = ctx.t();
      }
      statue = null;
      startDance();
    }

    // the very first dance is a little shorter, so the first FREEZE comes quickly
    phaseLen = 4.5;

    return {
      update(dt, players) {
        const t = ctx.t();
        if (!twistShown && ctx.progress() >= 0.5) {
          twistShown = true;
          ctx.sfx.whoosh();
          ctx.fx.pop('Statue time! 🗽', W / 2, H * 0.45, '#ffd23f');
        }
        // the music clock
        if (into() >= phaseLen) {
          if (phase === 'dance') startCount();
          else if (phase === 'count') startFreeze(players);
          else endFreeze(players);
        }
        if (phase === 'count') {
          const k = Math.floor(into() / beat) + 1;
          if (k !== lastTick && k <= 3) {
            lastTick = k;
            ctx.sfx.tick();
          }
        }
        for (const p of players) {
          const s = st(p.n);
          if (p.state !== 'active') continue;
          if (phase === 'dance' || phase === 'count') {
            // dancing fills up music notes
            if (p.energy > DANCING) {
              s.danced += dt;
              s.idleFor = 0;
              s.noteIn += dt;
              if (s.noteIn >= NOTE_EVERY) {
                s.noteIn = 0;
                if (s.notes < NOTES_MAX) {
                  s.notes++;
                  ctx.report.score(p.n, 1, p.head.x, p.head.y - p.s * 1.6, '+1 🎵');
                  ctx.sfx.pop();
                } else ctx.report.good(p.n); // still dancing nicely: no more points, but no coach either
              }
              if (rng() < dt * 3) notes.push({ x: p.head.x + rand(rng, -60, 60), y: p.head.y - p.s, vy: -rand(rng, 90, 160), e: pick(rng, ['🎵', '🎶', '✨']), age: 0, c: p.color });
            } else s.idleFor += dt;
          } else {
            // the freeze: after the grace time, any big movement wobbles the ice
            s.idleFor = 0;
            if (into() < GRACE || s.cracked >= 0) continue;
            if (statue && p.pose[statue]) s.statueOk = true;
            if (p.energy > WOBBLY) s.wobble += dt;
            else s.wobble = Math.max(0, s.wobble - dt * 0.5);
            if (s.wobble > WOBBLE_FOR) {
              s.cracked = t;
              ctx.report.miss(p.n, 'freeze', p.head.x, p.head.y - p.s * 1.8, 'WOBBLE!');
              ctx.sfx.wobble();
              ctx.fx.burst(p.sh.x, p.sh.y, '#bfe6ff', 16);
            }
          }
        }
        for (const nt of notes) {
          nt.age += dt;
          nt.y += nt.vy * dt;
          nt.x += Math.sin(nt.age * 5) * 40 * dt;
        }
        for (let i = notes.length - 1; i >= 0; i--) if (notes[i].age > 1.6) notes.splice(i, 1);
      },

      drawBack(g) {
        const t = ctx.t();
        const frozen = phase === 'freeze';
        const pulse = frozen ? 0 : 0.5 + 0.5 * Math.sin(t * Math.PI * 4); // two beats a second
        // the club: deep purple walls with twinkling stars
        const wall = g.createLinearGradient(0, 0, 0, floorTop);
        wall.addColorStop(0, frozen ? '#163a6b' : '#2a0e5c');
        wall.addColorStop(1, frozen ? '#3c7fb8' : '#7b2a9e');
        g.fillStyle = wall;
        g.fillRect(0, 0, W, floorTop);
        g.save();
        for (const s of stars) {
          g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + s.tw));
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
        // light beams sweeping from the mirror ball
        const bx = W / 2;
        const by = 130;
        if (!frozen) {
          g.save();
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 2 + Math.sin(t * (0.6 + i * 0.13) + i * 1.7) * 0.9;
            const spread = 0.09;
            g.globalAlpha = 0.16 + 0.08 * pulse;
            g.fillStyle = DISCO[i];
            g.beginPath();
            g.moveTo(bx, by);
            g.lineTo(bx + Math.cos(a - spread) * 1600, by + Math.sin(a - spread) * 1600);
            g.lineTo(bx + Math.cos(a + spread) * 1600, by + Math.sin(a + spread) * 1600);
            g.closePath();
            g.fill();
          }
          g.restore();
        }
        // speakers on both sides, thumping with the beat
        for (const sx of [150, W - 150]) {
          g.fillStyle = '#1b1035';
          rr(g, sx - 110, floorTop - 380, 220, 380, 26);
          g.fill();
          g.lineWidth = 8;
          g.strokeStyle = '#4b2d85';
          g.stroke();
          for (const [cy, r] of [[floorTop - 290, 50], [floorTop - 120, 75]]) {
            const k = 1 + 0.08 * pulse;
            g.fillStyle = '#3a2470';
            g.beginPath();
            g.arc(sx, cy, r * k, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#0d0820';
            g.beginPath();
            g.arc(sx, cy, r * 0.45 * k, 0, Math.PI * 2);
            g.fill();
          }
        }
        // the dance floor: glowing tiles in perspective, lighting up in time
        g.fillStyle = frozen ? '#9fd8ff' : '#1a0b3a';
        g.fillRect(0, floorTop, W, H - floorTop);
        const rows = 5;
        const cols = 10;
        const step = Math.floor(t * 2);
        const proj = (u, v) => {
          const y = floorTop + (H - floorTop) * v * v;
          const half = W * (0.42 + 0.5 * v);
          return { x: W / 2 + u * half, y };
        };
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const v0 = r / rows;
            const v1 = (r + 1) / rows;
            const u0 = -1 + (2 * c) / cols;
            const u1 = -1 + (2 * (c + 1)) / cols;
            const a = proj(u0, v0);
            const b = proj(u1, v0);
            const cc = proj(u1, v1);
            const d = proj(u0, v1);
            const lit = (r + c + step) % 3 === 0;
            g.fillStyle = frozen ? ((r + c) % 2 ? '#d8f3ff' : '#b4e4ff') : lit ? DISCO[(r * 3 + c + step) % DISCO.length] : (r + c) % 2 ? '#2c1563' : '#3a1d7a';
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.lineTo(b.x, b.y);
            g.lineTo(cc.x, cc.y);
            g.lineTo(d.x, d.y);
            g.closePath();
            g.fill();
            g.strokeStyle = frozen ? '#ffffff' : '#120626';
            g.lineWidth = 4;
            g.stroke();
          }
        }
        // the mirror ball on its string
        g.strokeStyle = '#ddd';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(bx, 0);
        g.lineTo(bx, by - 90);
        g.stroke();
        g.save();
        g.beginPath();
        g.arc(bx, by, 90, 0, Math.PI * 2);
        g.fillStyle = '#9aa3c4';
        g.fill();
        g.clip();
        const spin = frozen ? 0 : t * 1.5;
        for (let i = -6; i <= 6; i++) {
          for (let j = -6; j <= 6; j++) {
            const l = 55 + 40 * Math.abs(Math.sin(spin + i * 1.3 + j * 0.7));
            g.fillStyle = frozen ? `hsl(200, 80%, ${l}%)` : `hsl(${(i * 30 + j * 20 + t * 60) % 360}, 30%, ${l}%)`;
            g.fillRect(bx + i * 15 - 6.5, by + j * 15 - 6.5, 13, 13);
          }
        }
        g.restore();
        g.lineWidth = 5;
        g.strokeStyle = '#ffffff';
        g.beginPath();
        g.arc(bx, by, 90, 0, Math.PI * 2);
        g.stroke();
        // an icy frost over the whole room while frozen
        if (frozen) {
          g.save();
          g.globalAlpha = 0.25;
          g.fillStyle = '#e6f8ff';
          g.fillRect(0, 0, W, H);
          g.restore();
          g.save();
          g.font = '70px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          for (let i = 0; i < 14; i++) {
            const x = (i * 151 + Math.sin(t + i) * 40 + W) % W;
            const y = ((i * 89 + t * 70) % (H + 100)) - 50;
            g.globalAlpha = 0.7;
            g.fillText('❄️', x, y);
          }
          g.restore();
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        // music notes floating up from the dancers
        g.save();
        g.font = '56px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const nt of notes) {
          g.globalAlpha = Math.max(0, 1 - nt.age / 1.6);
          g.fillText(nt.e, nt.x, nt.y);
        }
        g.restore();

        for (const p of players) {
          const s = pl.get(p.n);
          if (!s) continue;
          const top = Math.min(p.head.y - p.head.r * 1.5, ...p.hands.filter((h) => h.seen).map((h) => h.y - h.r)) - 20;
          const bottom = p.hip.y + 2.4 * p.s;
          const half = Math.max(1.6 * p.s, ...p.hands.filter((h) => h.seen).map((h) => Math.abs(h.x - p.sh.x) + h.r + 20));
          if (phase === 'freeze' && into() > GRACE * 0.5 && (s.eligible || s.cracked >= 0)) {
            // the ice cube around a frozen dancer; it jiggles like jelly and cracks if they wobble
            const cracked = s.cracked >= 0;
            const jig = cracked ? Math.sin((t - s.cracked) * 30) * 0.06 * Math.max(0, 1 - (t - s.cracked) / 1.2) : 0;
            g.save();
            g.translate(p.sh.x, bottom);
            g.rotate(jig);
            g.globalAlpha = cracked ? 0.45 : 0.55;
            const ice = g.createLinearGradient(-half, top - bottom, half, 0);
            ice.addColorStop(0, '#e8fbff');
            ice.addColorStop(1, '#7fd0ff');
            g.fillStyle = ice;
            rr(g, -half, top - bottom, half * 2, bottom - top, 30);
            g.fill();
            g.globalAlpha = 1;
            g.lineWidth = 8;
            g.strokeStyle = '#ffffff';
            g.stroke();
            // shine
            g.globalAlpha = 0.7;
            g.fillStyle = '#ffffff';
            rr(g, -half + 22, top - bottom + 24, 22, (bottom - top) * 0.45, 11);
            g.fill();
            if (cracked) {
              g.globalAlpha = 1;
              g.strokeStyle = '#2a6fa8';
              g.lineWidth = 6;
              g.beginPath();
              g.moveTo(-half * 0.1, top - bottom);
              g.lineTo(half * 0.15, (top - bottom) * 0.75);
              g.lineTo(-half * 0.2, (top - bottom) * 0.55);
              g.lineTo(half * 0.25, (top - bottom) * 0.3);
              g.moveTo(half * 0.15, (top - bottom) * 0.75);
              g.lineTo(half * 0.6, (top - bottom) * 0.65);
              g.stroke();
            }
            g.restore();
            if (cracked) {
              const w = 1 + 0.15 * Math.sin((t - s.cracked) * 20);
              g.save();
              g.translate(p.head.x, top - 60);
              g.rotate(Math.sin((t - s.cracked) * 14) * 0.2);
              g.scale(w, 2 - w);
              text(g, 'WOBBLE!', 0, 0, { size: 64, color: '#ffd23f' });
              g.restore();
              emoji(g, '🫨', p.head.x + half + 30, top + 20, 70);
            } else emoji(g, '❄️', p.head.x + half, top + 10, 60);
          } else if (phase === 'freeze' && into() <= GRACE * 0.5 && p.state === 'active') {
            emoji(g, '🧊', p.head.x, top - 50, 70);
          }
          // nudge a player who isn't dancing
          if (phase !== 'freeze' && p.state === 'active' && s.idleFor > 2) {
            const bob = Math.sin(t * 8) * 8;
            g.save();
            g.fillStyle = 'rgba(255,255,255,0.95)';
            rr(g, p.head.x - 120, top - 130 + bob, 240, 90, 45);
            g.fill();
            g.lineWidth = 6;
            g.strokeStyle = p.color;
            g.stroke();
            g.restore();
            text(g, '💃 Dance!', p.head.x, top - 85 + bob, { size: 44, color: '#7b2a9e', stroke: null });
          }
          // how the last freeze went
          if (phase === 'dance' && s.result && t - s.result.at < RESULT_SHOW) emoji(g, s.result.e, p.head.x, top - 60, 90);
        }

        // the big word: DANCE! / 3, 2, 1 / FREEZE!
        const cx = W / 2;
        const cy = 330;
        if (phase === 'dance') {
          const k = 1 + 0.08 * Math.sin(t * Math.PI * 4);
          g.save();
          g.translate(cx, cy);
          g.rotate(Math.sin(t * Math.PI * 2) * 0.06);
          g.scale(k, k);
          const word = 'DANCE!';
          const sz = 120;
          g.font = `900 ${sz}px "Arial Rounded MT Bold","Trebuchet MS",sans-serif`;
          const total = g.measureText(word).width;
          let x = -total / 2;
          for (let i = 0; i < word.length; i++) {
            const w = g.measureText(word[i]).width;
            text(g, word[i], x + w / 2, Math.sin(t * 8 + i) * 12, { size: sz, color: DISCO[(i + Math.floor(t * 4)) % DISCO.length] });
            x += w;
          }
          g.restore();
          if (t - cheerAt < RESULT_SHOW) emoji(g, '🎉', cx + 300, cy, 90);
        } else if (phase === 'count') {
          const k = Math.min(3, Math.floor(into() / beat) + 1);
          const f = (into() % beat) / beat;
          g.save();
          g.translate(cx, cy);
          const sc = 1.3 - 0.3 * Math.min(1, f * 4);
          g.scale(sc, sc);
          g.beginPath();
          g.arc(0, 0, 110, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,255,255,0.95)';
          g.fill();
          g.lineWidth = 12;
          g.strokeStyle = '#3fb6ff';
          g.stroke();
          text(g, String(4 - k), 0, 8, { size: 140, color: '#1f6fae', stroke: null });
          g.restore();
          text(g, statue ? 'Get ready to be a statue...' : 'Get ready to freeze...', cx, cy + 170, { size: 56, color: '#bfe6ff' });
        } else {
          const age = into();
          const k = age < 0.3 ? 0.6 + (age / 0.3) * 0.6 : 1.2 - Math.min(0.2, (age - 0.3) * 0.5);
          g.save();
          g.translate(cx, cy);
          g.scale(k, k);
          text(g, 'FREEZE!', 0, 0, { size: 150, color: '#e8fbff', stroke: '#1f6fae' });
          g.restore();
          emoji(g, '🧊', cx - 400, cy, 110);
          emoji(g, '🧊', cx + 400, cy, 110);
          // a bar running down while they hold
          if (age > GRACE) {
            const left = 1 - (age - GRACE) / (phaseLen - GRACE);
            g.fillStyle = 'rgba(255,255,255,0.6)';
            rr(g, cx - 300, cy + 110, 600, 30, 15);
            g.fill();
            g.fillStyle = '#3fb6ff';
            rr(g, cx - 300, cy + 110, 600 * Math.max(0, left), 30, 15);
            g.fill();
          }
        }
        // a statue freeze: show the pose to freeze in, from the countdown on
        if (statue && phase !== 'dance') {
          const x = 330;
          const y = 220;
          g.save();
          g.fillStyle = 'rgba(255,255,255,0.95)';
          rr(g, x - 170, y, 340, 420, 36);
          g.fill();
          g.lineWidth = 10;
          g.strokeStyle = '#ffd23f';
          g.stroke();
          g.restore();
          text(g, 'STATUE:', x, y + 46, { size: 46, color: '#7b2a9e', stroke: null });
          drawDemo(g, statue, t, x, y + 340, 62, 3);
          text(g, STATUE_NAMES[statue], x, y + 390, { size: 40, color: '#b8304a', stroke: null, maxW: 320 });
        }
      },

      needs(n) {
        // in a freeze, someone who didn't dance first needs to dance (standing still alone earns nothing)
        return phase === 'freeze' && pl.get(n)?.eligible ? 'freeze' : 'dance';
      },

      /** Test bot: dance until FREEZE!, then hold still (in the statue pose when there is one). */
      bot() {
        if (phase === 'freeze') return statue ? { pose: statue } : { pose: 'freeze' };
        return { move: 'dance' };
      },
    };
  },
};
