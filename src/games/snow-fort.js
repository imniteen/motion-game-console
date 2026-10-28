// Snow Fort: everyone has a snow fort in their own lane. Your snowball packs itself; when it says THROW!,
// put your hand down low and throw it up high to lob it at the next fort. A hit gives the other player a funny
// carrot nose, a snow hat, a snowy beard or snowy ear-muffs (being hit never costs anything) and points to the
// thrower. Playing alone, a cheeky monkey in the fort next door pops up to be hit (and throws back, just for
// giggles). Half-way: golden snowballs worth 3 and a snowman on a sled to hit for a bonus.
import { rand, clamp, sky, shinyBall } from './kit.js';
import { drawMonkey } from './monkey.js';

const FLIGHT = 0.8; // s a snowball is in the air
const PACK = 1.5; // s to pack a snowball at level 1
const WINDOW = 2.6; // s the THROW! window stays open at level 1
const DECOR = ['carrot', 'hat', 'beard', 'muffs'];
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';
const FONT = '"Arial Rounded MT Bold","Trebuchet MS",sans-serif';

export default {
  id: 'snow-fort',
  title: 'Snow Fort',
  icon: '☃️',
  color: '#7ec8ff',
  moves: ['pump'],
  howto: ['Everyone has a snow fort!', 'When it says THROW, put your hand down low...', 'then throw it up high!'],
  layout: 'columns',
  hearts: 0,
  stars: [40, 75, 105],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const slots = Math.max(1, Math.round(W / ctx.lane(1).w));
    const me = new Map(); // n -> { phase, pack, readyAt, win, count, golden, decor, target }
    const balls = [];
    const monkey = { x: W - 290, s: 85, up: 0, show: 0, decor: [], hitUntil: -9, throwAt: 7, windUp: -1, hide: false };
    let snowman = null;
    let nextSnowman = Infinity;
    let twist = false;
    const flakes = Array.from({ length: 80 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 0, H), sp: rand(rng, 40, 110), r: rand(rng, 3, 8), ph: rand(rng, 0, 6) }));
    const peaksBack = Array.from({ length: 7 }, (_, i) => ({ x: (i - 0.5) * (W / 5) + rand(rng, -80, 80), h: rand(rng, 330, 470) }));
    const peaksFront = Array.from({ length: 6 }, (_, i) => ({ x: i * (W / 4.5) + rand(rng, -60, 60), h: rand(rng, 220, 330) }));
    const pines = Array.from({ length: 9 }, (_, i) => ({ x: (i + 0.5) * (W / 9) + rand(rng, -60, 60), h: rand(rng, 120, 190) }));

    const state = (n) => {
      if (!me.has(n)) me.set(n, { phase: 'pack', pack: 0, readyAt: 0, win: WINDOW, count: 0, golden: false, decor: [], target: null });
      return me.get(n);
    };
    const solo = (players) => players.length === 1;
    const hipY = () => floor - 0.95 * monkey.s + (1 - monkey.up) * 1.45 * monkey.s;
    const monkeyHead = () => ({ x: monkey.x, y: hipY() - 1.75 * monkey.s, r: 0.62 * monkey.s });

    /** Where the monkey's fort is: the right side when one kid has the whole screen, else an empty lane. */
    function placeMonkey(p) {
      const x = slots === 1 ? W - 290 : ctx.lane((p.n % slots) + 1).cx;
      monkey.x += (x - monkey.x) * 0.1;
      monkey.s = Math.min(85, ctx.lane(1).w * 0.15);
    }

    /** Who player p throws at: the snowman when it's passing, else the next player along, else the monkey. */
    function targetFor(p, players) {
      if (snowman && snowman.x > 140 && snowman.x < W - 140) return { kind: 'snowman' };
      const others = players.filter((o) => o.n !== p.n).sort((a, b) => a.n - b.n);
      if (!others.length) return { kind: 'monkey' };
      const next = others.find((o) => o.n > p.n) ?? others[0];
      return { kind: 'player', n: next.n };
    }

    function aimAt(target, players) {
      if (target.kind === 'snowman' && snowman) return { x: snowman.x + snowman.dir * snowman.sp * 0.2, y: floor - 265 };
      if (target.kind === 'monkey') return monkeyHead();
      if (target.kind === 'kid' || target.kind === 'player') {
        const o = players.find((q) => q.n === target.n);
        if (o) return { x: o.head.x, y: o.head.y };
        return { x: ctx.lane(target.n).cx, y: floor - 140 };
      }
      return { x: W / 2, y: floor };
    }

    function addDecor(list, golden) {
      if (golden && !list.includes('gold')) {
        list.push('gold');
        return false;
      }
      const next = DECOR.find((d) => !list.includes(d));
      if (!next) {
        list.length = 0; // fully dressed: shake it all off and start again
        return true;
      }
      list.push(next);
      return false;
    }

    function splat(b, players) {
      const at = { x: b.x, y: b.y };
      ctx.sfx.splat();
      ctx.fx.burst(at.x, at.y, b.golden ? '#ffd23f' : '#ffffff', b.golden ? 24 : 16);
      if (b.target.kind === 'kid') {
        // the monkey's snowball: decorations only, never a cost
        const s = state(b.target.n);
        addDecor(s.decor, false);
        ctx.fx.pop('Cheeky monkey! 🐒', at.x, at.y - 80, '#ffd23f');
        return;
      }
      if (b.target.kind === 'player') {
        const shook = addDecor(state(b.target.n).decor, b.golden);
        if (shook) ctx.fx.burst(at.x, at.y, '#ffffff', 30);
      } else if (b.target.kind === 'monkey') {
        if (addDecor(monkey.decor, b.golden)) ctx.fx.burst(at.x, at.y, '#ffffff', 30);
        monkey.hitUntil = ctx.t() + 1;
      } else if (b.target.kind === 'snowman' && snowman) {
        snowman.hits++;
        snowman.wob = 1;
      }
      ctx.fx.pop(b.label, at.x, at.y - 70, b.color);
    }

    function throwBall(p, side, players) {
      const s = state(p.n);
      const hand = p.hands.find((h) => h.side === side && h.seen) ?? { x: p.head.x, y: p.head.y - p.s };
      const target = targetFor(p, players);
      const snow = target.kind === 'snowman';
      const pts = (s.golden ? 3 : 1) + (snow ? 2 : 0);
      ctx.report.score(p.n, pts);
      const label = snow ? `Snowman! +${pts}` : s.golden ? `Golden! +${pts}` : 'SPLAT! +1';
      const aim = aimAt(target, players);
      balls.push({ x0: hand.x, y0: hand.y, x: hand.x, y: hand.y, tx: aim.x, ty: aim.y, t0: ctx.t(), golden: s.golden, target, color: p.color, label });
      ctx.sfx.throw();
      s.phase = 'pack';
      s.pack = 0;
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        const level = ctx.level();
        const alone = solo(players);
        if (!twist && ctx.progress() >= 0.5) {
          twist = true;
          nextSnowman = t + 3;
          ctx.sfx.cheer();
          ctx.fx.pop('Golden snowballs! ⭐', W / 2, H * 0.3, '#ffd23f');
        }
        // each player: pack a snowball, then a THROW! window
        for (const p of players) {
          const s = state(p.n);
          if (p.state !== 'active') continue; // held: everything waits for them
          if (s.phase === 'pack') {
            s.pack += (dt / PACK) * Math.min(1.6, level);
            if (s.pack >= 1) {
              s.phase = 'ready';
              s.readyAt = t;
              s.win = clamp(WINDOW / Math.sqrt(level), 1.7, 3.2);
              s.count++;
              s.golden = twist && s.count % 3 === 0;
              ctx.sfx.pop();
            }
          } else if (p.pumped.length) {
            throwBall(p, p.pumped[0], players);
          } else if (t - s.readyAt > s.win) {
            ctx.report.miss(p.n, 'pump', p.head.x, p.head.y - p.s * 1.8, alone ? 'The monkey hid!' : 'Brrr, it melted!');
            ctx.fx.burst(p.head.x, p.head.y - p.s * 1.6, '#bfe6ff', 12);
            s.phase = 'pack';
            s.pack = 0;
          }
          if (s.phase === 'ready') s.target = targetFor(p, players);
        }

        // the monkey: only when someone plays alone
        const kid = alone ? players[0] : null;
        monkey.show += ((kid ? 1 : 0) - monkey.show) * (1 - Math.exp(-dt / 0.25));
        if (kid) {
          placeMonkey(kid);
          const ks = state(kid.n);
          const winding = monkey.windUp >= 0;
          // it pops up to taunt while the kid's snowball is ready (and to throw), else it hides
          const wantUp = (ks.phase === 'ready' && ks.target?.kind === 'monkey') || winding || t < monkey.hitUntil ? 1 : 0.12;
          monkey.up += (wantUp - monkey.up) * (1 - Math.exp(-dt / 0.12));
          if (!winding && t > monkey.throwAt && ks.phase === 'pack' && ks.pack < 0.4 && kid.state === 'active') monkey.windUp = t;
          if (winding && t - monkey.windUp > 0.6) {
            monkey.windUp = -1;
            monkey.throwAt = t + rand(rng, 6, 10);
            const h = monkeyHead();
            balls.push({ x0: monkey.x + 0.6 * monkey.s, y0: h.y - monkey.s, x: monkey.x, y: h.y, tx: kid.head.x, ty: kid.head.y, t0: t, golden: false, target: { kind: 'kid', n: kid.n }, color: '#ffd23f', label: '' });
            ctx.sfx.throw();
          }
        } else {
          monkey.up += (0 - monkey.up) * (1 - Math.exp(-dt / 0.2));
          monkey.windUp = -1;
        }

        // snowballs fly in an arc and home in on whoever they were thrown at
        for (const b of balls) {
          const aim = aimAt(b.target, players);
          b.tx += (aim.x - b.tx) * 0.3;
          b.ty += (aim.y - b.ty) * 0.3;
          const u = Math.min(1, (t - b.t0) / FLIGHT);
          const h = 220 + 0.18 * Math.abs(b.tx - b.x0);
          b.x = b.x0 + (b.tx - b.x0) * u;
          b.y = b.y0 + (b.ty - b.y0) * u - h * 4 * u * (1 - u);
          b.spin = u * 12;
          if (u >= 1) {
            b.done = true;
            splat(b, players);
          }
        }
        for (let i = balls.length - 1; i >= 0; i--) if (balls[i].done) balls.splice(i, 1);

        // the half-way bonus: a snowman on a sled zooms between the forts
        if (!snowman && t > nextSnowman) {
          const dir = rng() < 0.5 ? 1 : -1;
          snowman = { x: dir > 0 ? -180 : W + 180, dir, sp: 230 * Math.min(1.5, level), hits: 0, wob: 0 };
          ctx.sfx.whoosh();
          ctx.fx.pop('Snowman! Hit it! +3', W / 2, H * 0.3, '#ffffff');
        }
        if (snowman) {
          snowman.x += snowman.dir * snowman.sp * dt;
          snowman.wob = Math.max(0, snowman.wob - dt * 1.5);
          if (snowman.x < -260 || snowman.x > W + 260) {
            snowman = null;
            nextSnowman = t + rand(rng, 12, 18);
          }
        }
      },

      drawBack(g, players) {
        const t = ctx.t();
        sky(g, W, H, '#8fd3ff', '#e9f7ff');
        // a pale winter sun
        g.fillStyle = 'rgba(255, 244, 190, 0.9)';
        g.beginPath();
        g.arc(W * 0.16, 150, 80, 0, Math.PI * 2);
        g.fill();
        mountains(g, peaksBack, H * 0.72, '#a9b8e8', '#ffffff');
        mountains(g, peaksFront, H * 0.74, '#7f97d6', '#f4f9ff');
        // snowy ground
        const snow = g.createLinearGradient(0, H * 0.66, 0, H);
        snow.addColorStop(0, '#ffffff');
        snow.addColorStop(1, '#d6ebff');
        g.fillStyle = snow;
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.69 + 16 * Math.sin(x * 0.006) + 10 * Math.sin(x * 0.017));
        g.lineTo(W, H);
        g.fill();
        for (const p of pines) pine(g, p.x, H * 0.72, p.h);
        // lane posts: candy-striped poles between the forts
        const posts = [];
        for (let k = 1; k < slots; k++) posts.push(ctx.lane(k).x1);
        if (slots === 1 && monkey.show > 0.05) posts.push((ctx.lane(1).cx + monkey.x) / 2);
        for (const x of posts) pole(g, x, H * 0.5, H, t);
        // falling snow
        g.fillStyle = 'rgba(255,255,255,0.9)';
        for (const f of flakes) {
          const y = (f.y + t * f.sp) % (H + 20);
          const x = (f.x + Math.sin(t + f.ph) * 30 + W) % W;
          g.beginPath();
          g.arc(x, y, f.r, 0, Math.PI * 2);
          g.fill();
        }
        void players;
      },

      drawFront(g, players) {
        const t = ctx.t();
        // the snowman passes behind the fort walls (its head pokes up over them)
        if (snowman) drawSnowman(g, snowman, floor, t);
        // the monkey, ducking and popping up behind its wall
        if (monkey.show > 0.02) {
          g.save();
          g.globalAlpha *= monkey.show;
          const winding = monkey.windUp >= 0;
          const hit = t < monkey.hitUntil;
          const ready = players.length === 1 && state(players[0].n).phase === 'ready';
          const mood = hit ? 'ouch' : ready ? 'taunt' : winding ? 'happy' : 'happy';
          const wave = Math.sin(t * 9);
          const m = drawMonkey(g, monkey.x, hipY(), monkey.s, {
            t,
            mood,
            hat: 'beanie',
            armL: ready && !hit ? 2.6 + 0.3 * wave : 0.5,
            armR: winding ? 2.9 : ready && !hit ? 2.6 - 0.3 * wave : 0.5,
          });
          if (winding) shinyBall(g, m.hands[1].x, m.hands[1].y - 10, 24, 'rgba(235,245,255,1)');
          drawDecor(g, m.head, monkey.decor, t);
          if (ready && !hit && monkey.up > 0.6) speech(g, 'Nyah nyah!', monkey.x - 1.4 * monkey.s, m.head.y - 1.2 * monkey.s);
          fort(g, monkey.x, Math.min(420, monkey.s * 4.6), floor, '#8a5a33', t);
          g.restore();
        }
        // everybody's fort
        for (let k = 1; k <= slots; k++) {
          const lane = ctx.lane(k);
          const p = players.find((q) => q.n === k);
          if (!p && monkey.show > 0.5 && Math.abs(lane.cx - monkey.x) < 10) continue; // the monkey lives here
          fort(g, lane.cx, Math.min(lane.w * 0.62, 420), floor, p ? p.color : '#c9d6ea', t);
        }
        // funny decorations from the hits
        for (const p of players) drawDecor(g, p.head, state(p.n).decor, t, p.s / 95);
        // snowballs in the air
        for (const b of balls) {
          if (b.golden) {
            shinyBall(g, b.x, b.y, 30, 'rgba(255, 200, 40, 1)');
            g.save();
            g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 20);
            g.strokeStyle = '#fff6b0';
            g.lineWidth = 5;
            g.beginPath();
            g.arc(b.x, b.y, 38, 0, Math.PI * 2);
            g.stroke();
            g.restore();
          } else {
            g.save();
            g.lineWidth = 4;
            g.strokeStyle = '#9fc4e8';
            g.beginPath();
            g.arc(b.x, b.y, 27, 0, Math.PI * 2);
            g.stroke();
            g.restore();
            shinyBall(g, b.x, b.y, 26, 'rgba(240,248,255,1)');
          }
        }
        // cues: a snowball packing over each head, then THROW!
        for (const p of players) {
          if (p.state !== 'active') continue;
          const s = state(p.n);
          const k = p.s / 95;
          const x = p.head.x;
          const y = p.head.y - p.s * 1.75;
          if (s.phase === 'pack') {
            g.save();
            g.lineWidth = 10 * k;
            g.strokeStyle = 'rgba(255,255,255,0.75)';
            g.beginPath();
            g.arc(x, y, 46 * k, 0, Math.PI * 2);
            g.stroke();
            g.strokeStyle = p.color;
            g.beginPath();
            g.arc(x, y, 46 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(s.pack, 0, 1));
            g.stroke();
            g.restore();
            shinyBall(g, x, y, (8 + 26 * clamp(s.pack, 0, 1)) * k, 'rgba(235,245,255,1)');
            continue;
          }
          // the path the snowball will take, and a target on whoever is next
          const aim = s.target ? aimAt(s.target, players) : null;
          if (aim) {
            g.save();
            g.setLineDash([16, 18]);
            g.lineDashOffset = -t * 60;
            g.lineWidth = 7;
            g.strokeStyle = p.color;
            g.globalAlpha = 0.8;
            g.beginPath();
            const h = 220 + 0.18 * Math.abs(aim.x - x);
            for (let i = 0; i <= 20; i++) {
              const u = i / 20;
              const ax = x + (aim.x - x) * u;
              const ay = y + (aim.y - y) * u - h * 4 * u * (1 - u);
              if (i === 0) g.moveTo(ax, ay);
              else g.lineTo(ax, ay);
            }
            g.stroke();
            g.restore();
            bullseye(g, aim.x, aim.y, 50 * k, t);
          }
          const left = clamp(1 - (t - s.readyAt) / s.win, 0, 1);
          const pulse = 1.1 + 0.08 * Math.sin(t * 16);
          g.save();
          g.translate(x, y);
          g.scale(pulse * k, pulse * k);
          g.beginPath();
          g.arc(0, 0, 82, 0, Math.PI * 2);
          g.fillStyle = s.golden ? '#ffd23f' : '#ffffff';
          g.fill();
          g.lineWidth = 9;
          g.strokeStyle = p.color;
          g.stroke();
          g.lineWidth = 9;
          g.strokeStyle = '#1b1b3a';
          g.globalAlpha = 0.35;
          g.beginPath();
          g.arc(0, 0, 96, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
          g.stroke();
          g.globalAlpha = 1;
          g.font = `46px ${EMOJI}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('☝️', 0, -26);
          g.font = `900 38px ${FONT}`;
          g.fillStyle = '#1b1b3a';
          g.fillText('THROW!', 0, 30);
          g.restore();
        }
      },

      needs() {
        return 'pump';
      },

      /** Test bot: throw as soon as the snowball is ready. */
      bot(p) {
        return state(p.n).phase === 'ready' ? { pump: true } : {};
      },
    };
  },
};

// ------------------------------------------------------------------------------------------------ drawing

function mountains(g, peaks, baseY, rock, cap) {
  g.fillStyle = rock;
  g.beginPath();
  g.moveTo(-50, baseY);
  for (const p of peaks) {
    g.lineTo(p.x - p.h * 0.9, baseY);
    g.lineTo(p.x, baseY - p.h);
    g.lineTo(p.x + p.h * 0.9, baseY);
  }
  g.lineTo(1970, baseY);
  g.lineTo(1970, 1080);
  g.lineTo(-50, 1080);
  g.fill();
  g.fillStyle = cap;
  for (const p of peaks) {
    const d = p.h * 0.32;
    g.beginPath();
    g.moveTo(p.x, baseY - p.h);
    g.lineTo(p.x + d * 0.9, baseY - p.h + d);
    g.lineTo(p.x + d * 0.4, baseY - p.h + d * 0.8);
    g.lineTo(p.x, baseY - p.h + d * 1.05);
    g.lineTo(p.x - d * 0.4, baseY - p.h + d * 0.8);
    g.lineTo(p.x - d * 0.9, baseY - p.h + d);
    g.closePath();
    g.fill();
  }
}

function pine(g, x, y, h) {
  g.fillStyle = '#6b4a2b';
  g.fillRect(x - 10, y - 20, 20, 30);
  for (let i = 0; i < 3; i++) {
    const w = h * (0.55 - i * 0.13);
    const top = y - 20 - h * (0.45 + i * 0.25);
    const bot = y - 10 - h * i * 0.25;
    g.fillStyle = '#2f8f5b';
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x + w, bot);
    g.lineTo(x - w, bot);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x + w * 0.35, top + (bot - top) * 0.35);
    g.lineTo(x - w * 0.35, top + (bot - top) * 0.35);
    g.closePath();
    g.fill();
  }
}

function pole(g, x, y0, y1, t) {
  g.save();
  g.lineCap = 'round';
  g.lineWidth = 18;
  g.strokeStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x, y0);
  g.lineTo(x, y1);
  g.stroke();
  g.strokeStyle = '#ff5d73';
  g.lineWidth = 18;
  for (let y = y0; y < y1; y += 60) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, Math.min(y1, y + 26));
    g.stroke();
  }
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.arc(x, y0, 16 + 2 * Math.sin(t * 4), 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A snow-brick fort wall with a flag in the owner's colour. */
function fort(g, cx, w, floor, color, t) {
  const top = floor - 118;
  const x0 = cx - w / 2;
  const grad = g.createLinearGradient(0, top, 0, 1080);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#cfe3f7');
  g.save();
  // flag on its pole, behind the wall
  const px = cx + w / 2 - 34;
  g.strokeStyle = '#6b4a2b';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(px, top + 20);
  g.lineTo(px, top - 150);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(px, top - 150);
  g.quadraticCurveTo(px + 50, top - 140 + 10 * Math.sin(t * 5), px + 95, top - 128);
  g.quadraticCurveTo(px + 50, top - 110 + 10 * Math.sin(t * 5 + 1), px, top - 100);
  g.closePath();
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.stroke();
  // the wall
  g.fillStyle = grad;
  g.strokeStyle = '#9cc0e3';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(x0, 1090);
  g.lineTo(x0, top + 20);
  g.quadraticCurveTo(x0, top, x0 + 20, top);
  g.lineTo(x0 + w - 20, top);
  g.quadraticCurveTo(x0 + w, top, x0 + w, top + 20);
  g.lineTo(x0 + w, 1090);
  g.fill();
  g.stroke();
  // bricks
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(140, 180, 220, 0.6)';
  for (let r = 0; r < 4; r++) {
    const y = top + 38 + r * 44;
    g.beginPath();
    g.moveTo(x0 + 8, y);
    g.lineTo(x0 + w - 8, y);
    g.stroke();
    for (let x = x0 + (r % 2 ? 40 : 80); x < x0 + w - 20; x += 90) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - 44 + (r === 0 ? 12 : 0));
      g.stroke();
    }
  }
  // lumpy snow on top
  g.fillStyle = '#ffffff';
  for (let x = x0 + 16; x < x0 + w - 10; x += 34) {
    g.beginPath();
    g.arc(x, top + 4, 20, Math.PI, 0);
    g.fill();
  }
  g.restore();
}

function bullseye(g, x, y, r, t) {
  g.save();
  g.translate(x, y);
  g.rotate(t * 1.5);
  const k = 1 + 0.08 * Math.sin(t * 10);
  g.scale(k, k);
  g.lineWidth = 8;
  for (const [rr, c] of [
    [r * 1.25, '#ff5d73'],
    [r * 0.85, '#ffffff'],
    [r * 0.45, '#ff5d73'],
  ]) {
    g.strokeStyle = c;
    g.beginPath();
    g.arc(0, 0, rr, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

function speech(g, s, x, y) {
  g.save();
  g.font = `900 34px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = g.measureText(s).width + 40;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#5a3416';
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(x, y, w / 2, 34, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#5a3416';
  g.fillText(s, x, y + 2);
  g.restore();
}

function drawSnowman(g, sm, floor, t) {
  const x = sm.x;
  const tilt = Math.sin(t * 25) * 0.15 * sm.wob;
  g.save();
  g.translate(x, floor - 10);
  g.rotate(tilt);
  // the sled
  g.fillStyle = '#d64545';
  g.beginPath();
  g.moveTo(-110, -10);
  g.lineTo(110, -10);
  g.quadraticCurveTo(140 * sm.dir, -10, 140 * sm.dir, -45);
  g.lineTo(110 * sm.dir, -30);
  g.lineTo(-110, -30);
  g.closePath();
  g.fill();
  g.strokeStyle = '#7a2b00';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-110, 0);
  g.lineTo(120, 0);
  g.stroke();
  // three balls
  for (const [y, r] of [
    [-100, 72],
    [-210, 54],
    [-295, 42],
  ]) {
    shinyBall(g, 0, y, r, 'rgba(250,252,255,1)');
    g.lineWidth = 4;
    g.strokeStyle = '#a9c8e8';
    g.beginPath();
    g.arc(0, y, r, 0, Math.PI * 2);
    g.stroke();
  }
  // buttons, face, carrot, arms
  g.fillStyle = '#1b1b2f';
  for (const y of [-230, -200, -175]) {
    g.beginPath();
    g.arc(0, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(s * 14, -305, 6, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ff8c1a';
  g.beginPath();
  g.moveTo(0, -295);
  g.lineTo(sm.dir * 46, -288);
  g.lineTo(0, -282);
  g.closePath();
  g.fill();
  g.strokeStyle = '#6b4a2b';
  g.lineWidth = 7;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 45, -215);
    g.lineTo(s * 105, -260 + 15 * Math.sin(t * 8 + s));
    g.stroke();
  }
  // top hat (it flies off after the first hit)
  if (sm.hits === 0) {
    g.fillStyle = '#1b1b2f';
    g.fillRect(-42, -340, 84, 10);
    g.fillRect(-28, -395, 56, 56);
    g.fillStyle = '#ff5d73';
    g.fillRect(-28, -350, 56, 10);
  }
  g.restore();
  // a target ring so everyone knows it's for hitting
  bullseye(g, x, floor - 265, 46, t);
}

/** The funny decorations a snowball hit leaves on a head. k: size scale. */
function drawDecor(g, head, list, t, k = 1) {
  if (!list.length) return;
  const r = Math.max(30, head.r);
  g.save();
  for (const d of list) {
    if (d === 'hat') {
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#a9c8e8';
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(head.x, head.y - r * 0.95, r * 0.85, r * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(head.x - r * 0.25, head.y - r * 1.25, r * 0.35, 0, Math.PI * 2);
      g.arc(head.x + r * 0.25, head.y - r * 1.3, r * 0.3, 0, Math.PI * 2);
      g.fill();
      // little drips
      for (const s of [-0.6, 0.1, 0.55]) {
        g.beginPath();
        g.ellipse(head.x + s * r, head.y - r * 0.62, r * 0.08, r * 0.16, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else if (d === 'carrot') {
      g.fillStyle = '#ff8c1a';
      g.strokeStyle = '#b8560b';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(head.x - r * 0.05, head.y + r * 0.02);
      g.lineTo(head.x + r * 1.0, head.y + r * 0.18 + Math.sin(t * 3) * 3);
      g.lineTo(head.x - r * 0.05, head.y + r * 0.32);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = '#3fa34d';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(head.x - r * 0.05, head.y + r * 0.17);
      g.lineTo(head.x - r * 0.25, head.y + r * 0.02);
      g.stroke();
    } else if (d === 'beard') {
      g.fillStyle = '#ffffff';
      for (const [dx, dy, rr] of [
        [-0.35, 0.62, 0.25],
        [0, 0.72, 0.3],
        [0.35, 0.62, 0.25],
        [-0.18, 0.92, 0.22],
        [0.18, 0.92, 0.22],
      ]) {
        g.beginPath();
        g.arc(head.x + dx * r, head.y + dy * r, rr * r, 0, Math.PI * 2);
        g.fill();
      }
    } else if (d === 'muffs') {
      for (const s of [-1, 1]) {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(head.x + s * r * 0.98, head.y, r * 0.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#d6ebff';
        g.beginPath();
        g.arc(head.x + s * r * 0.98, head.y, r * 0.16, 0, Math.PI * 2);
        g.fill();
      }
    } else if (d === 'gold') {
      g.font = `${Math.round(56 * k)}px ${EMOJI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = 0.8 + 0.2 * Math.sin(t * 6);
      g.fillText('⭐', head.x - r * 0.9, head.y - r * 1.1);
      g.globalAlpha = 1;
    }
  }
  g.restore();
}
