// Snowy Peaks: up on the snowy mountain three things come at you, each with its own warning.
//   - Snowballs roll along the ground: a 3, 2, 1 above your head says when to JUMP over them.
//   - Icicles drop from the sky: a "!" and a blue ring on the ground show where, so step aside.
//   - About every 25 s a GIANT snowball rolls down, as wide as nearly the whole mountain: a glowing green
//     gap shows the one safe spot, and everyone has to get into it before it arrives.
// Half-way a blizzard starts: snowballs come in pairs and from both sides, icicles two at a time.
// The team shares 5 hearts.
import { rand, clamp, warning, sky } from './kit.js';

const WINDOW_EARLY = 0.45; // s before a snowball reaches you that a jump still counts
const WINDOW_LATE = 0.2;
const GIANT_EVERY = 25;
const GIANT_FIRST = 22; // s into the round the first giant snowball arrives
const GIANT_WARN = 4.5; // s of warning before it does
const BLIZZARD_AT = 0.5;
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';

/** Half the width of the ground an icicle hits, for a player of size s. */
const hitHalf = (s) => 60 + 0.45 * s;

export default {
  id: 'snowy-peaks',
  title: 'Snowy Peaks',
  icon: '🏔️',
  color: '#4dabf7',
  moves: ['sidestep', 'jump'],
  howto: ['Jump over the rolling snowballs!', 'Step away when you see a ! sign.', 'When the giant snowball comes, run to the green spot!'],
  layout: 'shared',
  hearts: 5,
  stars: [20, 42, 66],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    /** @type {{ x: number, dir: number, speed: number, r: number, judged: Set<number>, spin: number }[]} */
    const balls = [];
    /** @type {{ x: number, born: number, warn: number, threat: Set<number>, landed: boolean, landedAt?: number, len: number }[]} */
    const icicles = [];
    /** @type {{ at: number, x: number, half: number, judged: boolean, inside: Set<number>, goneAt?: number } | null} */
    let giant = null;
    let nextGiant = GIANT_FIRST;
    let nextIn = 2.5;
    let blizzardSaid = false;
    const lastJump = new Map(); // n -> game time of their last take-off
    const result = new Map(); // n -> { text, until }: a little emoji over their head after each snowball
    const dizzy = new Map(); // n -> game time their BONK! wears off
    const views = new Map(); // n -> the latest PlayerView (for needs())
    const flakes = Array.from({ length: 140 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 0, H), r: rand(rng, 3, 8), sp: rand(rng, 40, 110), drift: rand(rng, 0, 6) }));
    const pines = Array.from({ length: 9 }, (_, i) => ({ x: i < 5 ? 40 + i * 110 + rand(rng, -20, 20) : W - 40 - (i - 5) * 120 + rand(rng, -20, 20), s: rand(rng, 0.8, 1.25) }));

    const active = (players) => players.filter((p) => p.state === 'active');
    const blizzard = () => ctx.progress() >= BLIZZARD_AT;

    /** Seconds until a snowball reaches x (negative: it has just passed). */
    const arrive = (b, x) => ((x - b.x) * b.dir) / b.speed;

    /** Seconds until the nearest coming snowball reaches x (Infinity if none). */
    function eta(x) {
      let best = Infinity;
      for (const b of balls) {
        const e = arrive(b, x);
        if (e > -WINDOW_LATE && e < best) best = e;
      }
      return best;
    }

    /** Is a danger already due for player p around `when` seconds from now? (never two things at once) */
    function busy(p, when) {
      for (const b of balls) if (Math.abs(arrive(b, p.hip.x) - when) < 1.0) return true;
      for (const c of icicles) if (!c.landed && Math.abs(c.x - p.hip.x) < 2 * hitHalf(p.s) && Math.abs(c.born + c.warn - ctx.t() - when) < 1.0) return true;
      return false;
    }

    function rollSnowball(live, dir) {
      const speed = 470 * Math.min(1.8, ctx.level());
      const b = { x: dir < 0 ? W + 150 : -150, dir, speed, r: rand(rng, 60, 80), judged: new Set(), spin: 0 };
      // it mustn't reach anyone too soon after another snowball (one from the other side can catch up), or
      // at the same moment an icicle lands on them
      for (const p of live) {
        const when = arrive(b, p.hip.x);
        if (balls.some((o) => Math.abs(arrive(o, p.hip.x) - when) < 1.05)) return false;
        if (icicles.some((c) => !c.landed && Math.abs(c.x - p.hip.x) < 2 * hitHalf(p.s) && Math.abs(c.born + c.warn - ctx.t() - when) < 1.0)) return false;
      }
      balls.push(b);
      ctx.sfx.whoosh();
      return true;
    }

    function dropIcicle(p, dx = 0) {
      const warn = clamp(1.5 - 0.3 * (ctx.level() - 1), 1.05, 1.7);
      const x = clamp(p.hip.x + dx + rand(rng, -0.3, 0.3) * p.s, 140, W - 140);
      if (busy(p, warn) && dx === 0) return false;
      if (icicles.some((c) => !c.landed && Math.abs(c.x - x) < 2 * hitHalf(90) + 20)) return false;
      icicles.push({ x, born: ctx.t(), warn, threat: new Set(), landed: false, len: rand(rng, 150, 200) });
      ctx.sfx.warn();
      return true;
    }

    /** The giant snowball: a safe gap away from where the kids stand now, wide enough for all of them. */
    function startGiant(live) {
      const n = Math.max(1, live.length);
      const half = (330 + 150 * (n - 1)) / 2;
      const mid = live.length ? live.reduce((a, p) => a + p.hip.x, 0) / live.length : W / 2;
      const side = mid < 600 ? 1 : mid > W - 600 ? -1 : rng() < 0.5 ? -1 : 1;
      const x = clamp(mid + side * rand(rng, 380, 700), 200 + half, W - 200 - half);
      giant = { at: ctx.t() + GIANT_WARN, x, half, judged: false, inside: new Set() };
      for (const p of live) if (Math.abs(p.hip.x - x) < half) giant.inside.add(p.n);
      ctx.sfx.boom();
      ctx.fx.shake(10);
      ctx.fx.pop('GIANT SNOWBALL!', W / 2, H * 0.3, '#ffffff');
    }

    const inGap = (p) => giant && Math.abs(p.hip.x - giant.x) < giant.half + 0.2 * p.s;

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        const live = active(players);
        views.clear();
        for (const p of players) views.set(p.n, p);
        for (const p of players) if (p.jumped) lastJump.set(p.n, t);
        if (blizzard() && !blizzardSaid) {
          blizzardSaid = true;
          ctx.sfx.whoosh();
          ctx.fx.pop('Blizzard!', W / 2, H * 0.35, '#e3f4ff');
        }

        // the giant snowball, every 25 s: everything else waits while it comes
        if (!giant && t >= nextGiant - GIANT_WARN && nextGiant < ctx.roundSec - 1) {
          nextGiant += GIANT_EVERY;
          startGiant(live);
        }
        const calm = giant || t > nextGiant - GIANT_WARN - 2.2;
        if (giant && !giant.judged && t >= giant.at) {
          giant.judged = true;
          giant.goneAt = t + 0.8;
          ctx.sfx.boom();
          ctx.fx.shake(18);
          let hit = false;
          for (const p of live) {
            if (inGap(p)) {
              if (giant.inside.has(p.n)) ctx.report.good(p.n, p.head.x, p.head.y - p.s * 1.3, 'SAFE!');
              else ctx.report.score(p.n, 3, p.head.x, p.head.y - p.s * 1.3, 'SAFE! +3');
              ctx.sfx.cheer();
            } else {
              // one heart for the whole team, however many got snowed on
              if (!hit) ctx.report.hit(p.n, p.head.x, p.head.y);
              hit = true;
              ctx.report.miss(p.n, 'sidestep', p.head.x, p.head.y - p.s * 1.3, 'SPLAT!');
              ctx.sfx.splat();
              ctx.fx.burst(p.head.x, p.head.y, '#ffffff', 26);
              dizzy.set(p.n, t + 1.2);
            }
          }
        }
        if (giant && giant.judged && t > giant.goneAt) giant = null;

        // snowballs and icicles, taking turns
        nextIn -= dt;
        if (nextIn <= 0 && !calm && live.length) {
          let ok;
          if (rng() < 0.55) {
            const dir = blizzard() && rng() < 0.5 ? 1 : -1;
            ok = rollSnowball(live, dir);
            if (ok && blizzard() && rng() < 0.35) nextIn = 1.1; // a quick second one
          } else {
            const p = live[Math.floor(rng() * live.length)];
            ok = dropIcicle(p);
            // two at once in the blizzard: the second next to the first, so there's one way out
            if (ok && blizzard() && rng() < 0.35) {
              const side = p.hip.x < 450 ? 1 : p.hip.x > W - 450 ? -1 : rng() < 0.5 ? -1 : 1;
              dropIcicle(p, side * rand(rng, 240, 290));
            }
          }
          if (!ok) nextIn = 0.3;
          else if (nextIn <= 0) nextIn = rand(rng, 2.1, 2.9) / (Math.min(1.7, level) * (1 + 0.2 * (live.length - 1)));
        }

        // rolling snowballs: were you in the air as it went under you?
        for (const b of balls) {
          b.x += b.dir * b.speed * dt;
          b.spin += (b.dir * b.speed * dt) / b.r;
          for (const p of live) {
            if (b.judged.has(p.n) || arrive(b, p.hip.x) > -WINDOW_LATE) continue;
            b.judged.add(p.n);
            const when = t - WINDOW_LATE - (lastJump.get(p.n) ?? -9);
            if (p.airborne || (when >= -0.05 && when <= WINDOW_EARLY + WINDOW_LATE)) {
              const perfect = Math.abs(when - 0.15) < 0.18;
              ctx.report.score(p.n, perfect ? 2 : 1, p.head.x, p.head.y - p.s * 1.4, perfect ? 'PERFECT!' : 'NICE JUMP!');
              ctx.sfx.boing();
              result.set(p.n, { text: perfect ? '⭐' : '👍', until: t + 0.8 });
            } else {
              ctx.report.hit(p.n, p.hip.x, floor - 60);
              ctx.report.miss(p.n, 'jump', p.head.x, p.head.y - p.s * 1.4, 'SPLAT!');
              ctx.sfx.splat();
              ctx.fx.burst(p.hip.x, floor - 60, '#ffffff', 22);
              result.set(p.n, { text: '☃️', until: t + 0.9 });
            }
          }
        }
        for (let i = balls.length - 1; i >= 0; i--) if (balls[i].x < -300 || balls[i].x > W + 300) balls.splice(i, 1);

        // icicles: who was under it while it fell, and who is still there when it lands
        for (const c of icicles) {
          if (c.landed) continue;
          for (const p of live) if (Math.abs(p.hip.x - c.x) < hitHalf(p.s)) c.threat.add(p.n);
          if (t - c.born < c.warn) continue;
          c.landed = true;
          c.landedAt = t;
          ctx.sfx.freeze();
          ctx.fx.burst(c.x, floor - 20, '#bfe6ff', 14);
          for (const p of live) {
            if (Math.abs(p.hip.x - c.x) < hitHalf(p.s)) {
              ctx.report.hit(p.n, p.head.x, p.head.y);
              ctx.report.miss(p.n, 'sidestep', p.head.x, p.head.y - p.s * 1.3, 'BONK!');
              ctx.sfx.bonk();
              dizzy.set(p.n, t + 1.2);
            } else if (c.threat.has(p.n)) {
              ctx.report.score(p.n, 1, p.head.x, p.head.y - p.s * 1.3, 'DODGED!');
              ctx.sfx.score();
            }
          }
        }
        for (let i = icicles.length - 1; i >= 0; i--) if (icicles[i].landed && t - icicles[i].landedAt > 0.6) icicles.splice(i, 1);

        // snow: heavier in the blizzard
        const wind = blizzard() ? -160 : -30;
        for (const f of flakes) {
          f.y += f.sp * (blizzard() ? 1.8 : 1) * dt;
          f.x += (wind + Math.sin(t + f.drift) * 30) * dt;
          if (f.y > H) f.y -= H + 20;
          if (f.x < -20) f.x += W + 40;
          if (f.x > W + 20) f.x -= W + 40;
        }
      },

      drawBack(g) {
        const t = ctx.t();
        sky(g, W, H, blizzard() ? '#8fbfe0' : '#7cc8ff', '#eaf7ff');
        g.fillStyle = '#fff4b8';
        g.beginPath();
        g.arc(W - 250, 150, 75, 0, Math.PI * 2);
        g.fill();
        // two rows of mountains with snowy tops
        mountain(g, [[-100, 700], [380, 210], [820, 650]], '#8aa6c8');
        mountain(g, [[1000, 680], [1500, 190], [2050, 700]], '#8aa6c8');
        mountain(g, [[300, 760], [960, 120], [1640, 760]], '#6f8fb8');
        // the giant snowball rolling down the big mountain, far away for now
        if (giant && !giant.judged) drawGiant(g, giant, t, false);
        // the snowy slope we stand on
        const snow = g.createLinearGradient(0, H * 0.68, 0, H);
        snow.addColorStop(0, '#ffffff');
        snow.addColorStop(1, '#d5e9fa');
        g.fillStyle = snow;
        g.beginPath();
        g.moveTo(0, H);
        g.lineTo(0, H * 0.7);
        for (let x = 0; x <= W; x += 60) g.lineTo(x, H * 0.69 + 14 * Math.sin(x * 0.008 + 1));
        g.lineTo(W, H);
        g.fill();
        g.fillStyle = 'rgba(120, 170, 220, 0.25)';
        for (let i = 0; i < 7; i++) {
          g.beginPath();
          g.ellipse(((i * 311) % W) + 80, H * 0.78 + ((i * 53) % 140), 140, 16, 0, 0, Math.PI * 2);
          g.fill();
        }
        // pine trees, a snowman and a penguin to cheer you on
        g.save();
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        for (const p of pines) {
          g.font = `${Math.round(170 * p.s)}px ${EMOJI}`;
          g.fillText('🌲', p.x, H * 0.76);
        }
        g.font = `130px ${EMOJI}`;
        g.fillText('⛄', 610, H * 0.77);
        g.save();
        g.translate(W - 620, H * 0.77);
        g.rotate(Math.sin(t * 4) * 0.12);
        g.font = `100px ${EMOJI}`;
        g.fillText('🐧', 0, 0);
        g.restore();
        g.restore();
        // icy ledge along the top that the icicles break off
        g.fillStyle = '#e3f4ff';
        g.strokeStyle = '#8cc8f0';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(0, 0);
        for (let x = 0; x <= W; x += 80) {
          g.lineTo(x, 26);
          g.lineTo(x + 40, 26 + 34 + ((x * 7) % 30));
        }
        g.lineTo(W, 0);
        g.closePath();
        g.fill();
        g.stroke();
        // the giant's safe gap glows on the ground; everywhere else turns red
        if (giant && !giant.judged) {
          const left = clamp(giant.at - t, 0, GIANT_WARN);
          const pulse = 0.5 + 0.5 * Math.sin(t * 8);
          g.save();
          g.fillStyle = 'rgba(255, 93, 115, 0.22)';
          g.fillRect(0, floor - 60, giant.x - giant.half, 130);
          g.fillRect(giant.x + giant.half, floor - 60, W - giant.x - giant.half, 130);
          const beam = g.createLinearGradient(0, 0, 0, floor);
          beam.addColorStop(0, 'rgba(94, 224, 138, 0)');
          beam.addColorStop(1, `rgba(94, 224, 138, ${0.35 + 0.2 * pulse})`);
          g.fillStyle = beam;
          g.fillRect(giant.x - giant.half, 0, giant.half * 2, floor + 60);
          g.fillStyle = `rgba(94, 224, 138, ${0.55 + 0.3 * pulse})`;
          g.beginPath();
          g.ellipse(giant.x, floor, giant.half, 48, 0, 0, Math.PI * 2);
          g.fill();
          g.lineWidth = 8;
          g.strokeStyle = '#ffffff';
          g.stroke();
          g.fillStyle = '#1b5e3a';
          g.font = '900 64px "Arial Rounded MT Bold","Trebuchet MS",sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('SAFE', giant.x, floor + 4);
          g.font = `80px ${EMOJI}`;
          g.fillText('⬇️', giant.x, H * 0.2 + Math.sin(t * 6) * 18);
          g.restore();
          // big countdown so everyone knows how long they have
          g.save();
          g.font = '900 120px "Arial Rounded MT Bold","Trebuchet MS",sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineWidth = 14;
          g.strokeStyle = '#1f4e79';
          g.fillStyle = '#ffffff';
          const label = String(Math.ceil(left));
          g.strokeText(label, giant.x, H * 0.33);
          g.fillText(label, giant.x, H * 0.33);
          g.restore();
        }
        // where icicles will land: a blue ring on the ground, behind the kids' feet
        for (const c of icicles) {
          if (c.landed) continue;
          const f = clamp((t - c.born) / c.warn, 0, 1);
          g.save();
          g.globalAlpha = 0.3 + 0.45 * f;
          g.fillStyle = '#4dabf7';
          g.beginPath();
          g.ellipse(c.x, floor, hitHalf(90) * (0.5 + 0.5 * f), 34, 0, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 0.95;
          g.setLineDash([22, 16]);
          g.lineWidth = 7;
          g.strokeStyle = '#ff5d73';
          g.beginPath();
          g.ellipse(c.x, floor, hitHalf(90), 40, 0, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        // icicles: hanging and wobbling under the ledge, then dropping onto their ring
        for (const c of icicles) {
          if (c.landed) {
            const k = (t - c.landedAt) / 0.6;
            g.save();
            g.globalAlpha = 1 - k;
            g.fillStyle = '#d6f0ff';
            for (let i = -2; i <= 2; i++) {
              g.beginPath();
              g.moveTo(c.x + i * 40 * (1 + k), floor - 10);
              g.lineTo(c.x + i * 40 * (1 + k) + 12, floor - 40 - k * 30);
              g.lineTo(c.x + i * 40 * (1 + k) + 24, floor - 10);
              g.fill();
            }
            g.restore();
            continue;
          }
          const f = (t - c.born) / c.warn;
          warning(g, c.x, H * 0.18, t, f > 0.6 ? 96 : 80);
          const shake = f < 0.45 ? Math.sin(t * 40) * 6 : 0;
          const drop = f < 0.45 ? 0 : ((f - 0.45) / 0.55) ** 2;
          const top = 20 + drop * (floor - c.len - 20);
          drawIcicle(g, c.x + shake, top, c.len);
        }
        // rolling snowballs
        for (const b of balls) drawSnowball(g, b.x, floor - b.r + 20, b.r, b.spin, false);
        // the giant: close up now, filling the screen everywhere but the gap
        if (giant) drawGiant(g, giant, t, true);
        // each player's 3, 2, 1, JUMP! for the next snowball, or how the last one went
        for (const p of players) {
          if (p.state !== 'active') continue;
          const x = p.head.x;
          const y = p.head.y - p.s * 1.7;
          const r = result.get(p.n);
          if (r && t < r.until) {
            g.save();
            g.font = `90px ${EMOJI}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(r.text, x, y);
            g.restore();
          } else {
            const e = eta(p.hip.x);
            if (e <= 3 && e >= -0.1) {
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
              g.fillText(hot ? 'JUMP!' : String(Math.ceil(e)), 0, 4);
              g.restore();
            }
          }
          if (t < (dizzy.get(p.n) ?? 0)) {
            g.save();
            g.font = `70px ${EMOJI}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            for (let i = 0; i < 3; i++) {
              const a = t * 6 + (i * Math.PI * 2) / 3;
              g.fillText('💫', p.head.x + Math.cos(a) * p.s * 0.9, p.head.y - p.s * 0.6 + Math.sin(a) * p.s * 0.25);
            }
            g.restore();
          }
        }
        // falling snow in front of everything
        g.fillStyle = '#ffffff';
        g.globalAlpha = 0.85;
        for (const f of flakes) {
          g.beginPath();
          g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      },

      needs(n) {
        const p = views.get(n);
        if (!p) return 'jump';
        const t = ctx.t();
        if (giant && !giant.judged && !inGap(p)) return 'sidestep';
        let move = 'jump';
        let soonest = Infinity;
        const e = eta(p.hip.x);
        if (e < soonest) {
          soonest = e;
          move = 'jump';
        }
        for (const c of icicles) {
          const when = c.born + c.warn - t;
          if (!c.landed && Math.abs(p.hip.x - c.x) < hitHalf(p.s) && when < soonest) {
            soonest = when;
            move = 'sidestep';
          }
        }
        return move;
      },

      /** Test bot: get into the giant's gap, step clear of icicles, jump just before a snowball arrives. */
      bot(p) {
        const t = ctx.t();
        const want = {};
        if (giant && !giant.judged) {
          const m = Math.min(0.7 * p.s, giant.half * 0.5);
          if (Math.abs(p.hip.x - giant.x) > giant.half - m) want.x = clamp(p.hip.x, giant.x - giant.half + m, giant.x + giant.half - m);
        } else {
          const zones = icicles.filter((c) => !c.landed).map((c) => ({ x0: c.x - hitHalf(p.s), x1: c.x + hitHalf(p.s), in: c.born + c.warn - t }));
          const x = safeSpot(p, zones, W);
          if (x !== null) want.x = x;
        }
        const e = eta(p.hip.x);
        if (e < 0.3 && e > 0.05) want.jump = true;
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

/** A mountain from three points (left foot, peak, right foot) with a snowy cap. */
function mountain(g, [[x0, y0], [px, py], [x1, y1]], color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(px, py);
  g.lineTo(x1, y1);
  g.closePath();
  g.fill();
  const k = 0.3;
  const lx = px + (x0 - px) * k;
  const ly = py + (y0 - py) * k;
  const rx = px + (x1 - px) * k;
  const ry = py + (y1 - py) * k;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(px, py);
  g.lineTo(rx, ry);
  for (let i = 1; i <= 4; i++) {
    const u = 1 - i / 5;
    g.lineTo(lx + (rx - lx) * u, (i % 2 ? ry + 30 : ry - 5) + (ly - ry) * (1 - u));
  }
  g.lineTo(lx, ly);
  g.closePath();
  g.fill();
}

/** A snowball with blue shading and a couple of lines that show it rolling. A giant one has a surprised face. */
function drawSnowball(g, x, y, r, spin, face) {
  g.save();
  g.translate(x, y);
  const fill = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  fill.addColorStop(0, '#ffffff');
  fill.addColorStop(0.7, '#eef7ff');
  fill.addColorStop(1, '#b7d7f2');
  g.fillStyle = fill;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = Math.max(4, r * 0.05);
  g.strokeStyle = '#7fb2dc';
  g.stroke();
  g.save();
  g.rotate(spin);
  g.strokeStyle = 'rgba(127, 178, 220, 0.7)';
  g.lineWidth = Math.max(3, r * 0.05);
  g.beginPath();
  g.arc(0, 0, r * 0.6, 0.2, 1.4);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.45, 3.3, 4.3);
  g.stroke();
  g.restore();
  if (face) {
    g.fillStyle = '#23324a';
    for (const ex of [-0.28, 0.28]) {
      g.beginPath();
      g.arc(ex * r, -0.15 * r, r * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(0, 0.25 * r, r * 0.12, r * 0.16, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** The giant snowball wall: far up the mountain (behind the kids) while it comes, right in front at the end. */
function drawGiant(g, giant, t, front) {
  const W = 1920;
  const f = clamp(1 - (giant.at - t) / GIANT_WARN, 0, 1.3);
  const close = f >= 0.8;
  if (close !== front) return;
  const floor = 1080 * 0.86;
  const u = Math.min(1, f) ** 2;
  const after = Math.max(0, t - giant.at) / 0.8; // after it arrives it rolls on down, off the bottom of the screen
  const R = 90 + 250 * u;
  const y = 330 + (floor - R * 0.7 - 330) * u + after * 900;
  const fill = (x0, x1) => {
    const n = Math.max(1, Math.round((x1 - x0) / (R * 1.5)));
    for (let i = 0; i < n; i++) {
      const cx = x0 + ((i + 0.5) * (x1 - x0)) / n;
      drawSnowball(g, cx, y + Math.sin(i * 2.1) * R * 0.08, R, t * 3 + i, true);
    }
  };
  // the wall closes in from the sides of the mountain towards its full width
  const spread = 0.35 + 0.65 * u;
  const mid = W / 2;
  const L0 = mid - mid * spread;
  const R1 = mid + mid * spread;
  const gapL = mid + (giant.x - giant.half - mid) * spread;
  const gapR = mid + (giant.x + giant.half - mid) * spread;
  g.save();
  if (gapL - L0 > 20) fill(L0, gapL - R * 0.2);
  if (R1 - gapR > 20) fill(gapR + R * 0.2, R1);
  g.restore();
}

/** A pointy blue icicle hanging from its top. */
function drawIcicle(g, x, top, len) {
  g.save();
  const w = len * 0.28;
  const fill = g.createLinearGradient(x - w, 0, x + w, 0);
  fill.addColorStop(0, '#bfe6ff');
  fill.addColorStop(0.5, '#ffffff');
  fill.addColorStop(1, '#7cc4f2');
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x - w, top);
  g.lineTo(x + w, top);
  g.lineTo(x, top + len);
  g.closePath();
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#4b9fd6';
  g.stroke();
  g.restore();
}
