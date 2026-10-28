// Hot Potato: in a sunny park, everyone on their own picnic blanket. A fizzing cartoon bomb drops
// onto someone's head ("!" first); put your hand down low and throw it up high to lob it to the next blanket.
// Every throw scores (a quick one scores 2). The fuse burns down where everyone can see it, the bomb flashes red
// near the end, and whoever holds it when it goes BOOM gets a funny sooty face (a miss, nothing worse). Then a
// new bomb drops. Alone, a monkey plays catch (and panics). Half-way: golden bombs worth an extra point, and a
// second bomb when three or more play. The fuse gets shorter as the round goes on.
import { rand, clamp, sky, warning } from './kit.js';
import { drawMonkey } from './monkey.js';

const FLIGHT = 0.75; // s a bomb is in the air
const DROP = 1.1; // s a new bomb takes to fall onto a head
const QUICK = 1.2; // a throw within this many s of catching is a quick one (2 points)
const MIN_FUSE = 1.4; // a bomb always lands with at least this much fuse, so nobody is blown up unfairly
const BOOM_SECS = 1.6;
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';
const FONT = '"Arial Rounded MT Bold","Trebuchet MS",sans-serif';

export default {
  id: 'hot-potato',
  title: 'Hot Potato',
  icon: '💣',
  color: '#ff8c42',
  moves: ['pump'],
  howto: ['A silly bomb lands on your head!', 'Put your hand down low, then throw it up high...', 'to pass it on before it goes BOOM!'],
  layout: 'columns',
  hearts: 0,
  stars: [30, 52, 75],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const slots = Math.max(1, Math.round(W / ctx.lane(1).w));
    /** @type {any[]} */
    const bombs = [];
    const soot = new Map(); // n | 'M' -> game time the soot washes off
    const monkey = { x: W - 300, s: 85, show: 0, hold: 1.5 };
    let dropAt = 1.5;
    let dropTo = null; // who the next bomb falls on
    let twist = false;
    const clouds = Array.from({ length: 5 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 70, 280), s: rand(rng, 0.7, 1.3), sp: rand(rng, 8, 20) }));
    const trees = Array.from({ length: 7 }, (_, i) => ({ x: (i + 0.5) * (W / 7) + rand(rng, -70, 70), r: rand(rng, 80, 120), c: i % 2 ? '#3fa34d' : '#4cb85c' }));
    const flowers = Array.from({ length: 26 }, () => ({ x: rand(rng, 0, W), y: rand(rng, H * 0.72, H - 20), e: rng() < 0.5 ? '🌼' : '🌷' }));

    const hipY = () => floor - 0.95 * monkey.s - 50; // it stands on a tree stump
    const monkeyHead = () => ({ x: monkey.x, y: hipY() - 1.75 * monkey.s, r: 0.62 * monkey.s });
    const R = (p) => (p ? 0.55 * p.s : 0.55 * monkey.s); // bomb radius

    /** Where a bomb sits on its holder's head. */
    function seat(holder, players) {
      if (holder === 'M') {
        const h = monkeyHead();
        return { x: h.x, y: h.y - h.r - 0.5 * monkey.s, r: R(null) };
      }
      const p = players.find((q) => q.n === holder);
      if (!p) return { x: ctx.lane(holder).cx, y: floor - 520, r: 50 };
      return { x: p.head.x, y: p.head.y - p.head.r - 0.75 * R(p), r: R(p) };
    }

    /** Who a bomb goes to next: the next active player along (skipping anyone already holding one), else the monkey. */
    function nextAfter(from, players) {
      const act = players.filter((p) => p.state === 'active' && p.n !== from).sort((a, b) => a.n - b.n);
      if (!act.length) return from === 'M' ? null : 'M';
      const free = act.filter((p) => !bombs.some((b) => b.holder === p.n));
      const pool = free.length ? free : act;
      if (from === 'M') return pool[0].n;
      return (pool.find((p) => p.n > from) ?? pool[0]).n;
    }

    function newBomb(holder, players) {
      const at = seat(holder, players);
      const golden = twist && rng() < 0.5;
      const fuse = rand(rng, 7, 10) / Math.min(ctx.rush?.() ? 2.3 : 1.8, ctx.level()); // shorter fuses in the final rush
      bombs.push({ holder, phase: 'drop', t0: ctx.t(), from: { x: at.x, y: -150 }, x: at.x, y: -150, fuse, fuseMax: fuse, landedAt: 0, golden, last: null, away: 0, tick: 0 });
      ctx.sfx.whoosh();
    }

    function pass(b, to, players, thrower) {
      b.phase = 'fly';
      b.from = { x: b.x, y: b.y };
      b.t0 = ctx.t();
      b.holder = to;
      b.last = thrower;
      ctx.sfx.throw();
      void players;
    }

    function land(b) {
      b.phase = 'held';
      b.landedAt = ctx.t();
      b.fuse = Math.max(b.fuse, MIN_FUSE);
      if (b.holder === 'M') monkey.hold = rand(rng, 0.8, 2.2);
      ctx.sfx.boing();
    }

    function boom(b, players) {
      b.phase = 'boom';
      b.t0 = ctx.t();
      const t = ctx.t();
      ctx.sfx.boom();
      ctx.fx.shake(16);
      ctx.fx.burst(b.x, b.y, '#ff8c42', 26);
      ctx.fx.burst(b.x, b.y, '#4a4a4a', 18);
      soot.set(b.holder, t + 3.5);
      if (b.holder === 'M') {
        // the monkey got sooty: a little bonus for whoever threw it there
        const p = players.find((q) => q.n === b.last);
        if (p && p.state === 'active') ctx.report.score(p.n, 2, b.x, b.y - 80, 'Sooty monkey! +2');
      } else {
        const p = players.find((q) => q.n === b.holder);
        if (p && p.state === 'active') ctx.report.miss(p.n, 'pump', p.head.x, p.head.y - p.s * 2.2, 'BOOM! Sooty!');
      }
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        const alone = players.length === 1;
        const actives = players.filter((p) => p.state === 'active');
        if (!twist && ctx.progress() >= 0.5) {
          twist = true;
          ctx.sfx.cheer();
          ctx.fx.pop(actives.length >= 3 ? 'Two bombs! Golden ones too!' : 'Golden bombs! +1 more!', W / 2, H * 0.3, '#ffd23f');
          if (actives.length >= 3) dropAt = Math.min(dropAt, t + 1);
        }
        // the monkey joins a kid who plays alone
        monkey.show += ((alone || bombs.some((b) => b.holder === 'M') ? 1 : 0) - monkey.show) * (1 - Math.exp(-dt / 0.25));
        if (players.length) {
          const kid = players[0];
          const x = slots === 1 ? W - 300 : ctx.lane((kid.n % slots) + 1).cx;
          monkey.x += (x - monkey.x) * (1 - Math.exp(-dt / 0.3));
          monkey.s = Math.min(85, ctx.lane(1).w * 0.15);
        }

        // new bombs drop in
        const want = twist && actives.length >= 3 ? 2 : 1;
        const live = bombs.filter((b) => b.phase !== 'boom').length;
        if (live < want && t >= dropAt && actives.length) {
          let to = dropTo;
          if (to === null || to === 'M' || !actives.some((p) => p.n === to) || bombs.some((b) => b.holder === to)) to = nextAfter(to === 'M' ? -1 : to ?? -1, players);
          if (to === null || to === 'M') to = actives[0].n;
          newBomb(to, players);
          dropAt = t + 2;
        }

        for (const b of bombs) {
          const at = b.holder === null ? { x: b.x, y: b.y, r: 50 } : seat(b.holder, players);
          if (b.phase === 'drop' || b.phase === 'fly') {
            const len = b.phase === 'drop' ? DROP : FLIGHT;
            const u = clamp((t - b.t0) / len, 0, 1);
            const h = b.phase === 'fly' ? 200 + 0.15 * Math.abs(at.x - b.from.x) : 0;
            const ease = b.phase === 'drop' ? u * u : u;
            b.x = b.from.x + (at.x - b.from.x) * u;
            b.y = b.from.y + (at.y - b.from.y) * ease - h * 4 * u * (1 - u);
            if (b.phase === 'fly') b.fuse -= dt;
            if (u >= 1) land(b);
            continue;
          }
          if (b.phase === 'boom') {
            if (t - b.t0 > BOOM_SECS) b.gone = true;
            continue;
          }
          // held
          b.x = at.x;
          b.y = at.y;
          if (b.holder === 'M') {
            b.fuse -= dt;
            if (t - b.landedAt > monkey.hold && b.fuse > 0) {
              const to = nextAfter('M', players);
              if (to !== null) pass(b, to, players, 'M');
            }
          } else {
            const p = players.find((q) => q.n === b.holder);
            if (!p) {
              // they stepped away: after a moment the bomb hops on to someone else (nobody scores)
              b.away += dt;
              if (b.away > 1) {
                const to = nextAfter(b.holder, players);
                if (to !== null) pass(b, to, players, null);
                b.away = 0;
              }
              continue;
            }
            b.away = 0;
            if (p.state !== 'active') continue; // held by the camera: the fuse waits for them
            b.fuse -= dt;
            if (p.pumped.length && t - b.landedAt > 0.15 && b.fuse > 0) {
              const quick = t - b.landedAt < QUICK;
              const pts = (quick ? 2 : 1) + (b.golden ? 1 : 0);
              ctx.report.score(p.n, pts, p.head.x, p.head.y - p.s * 2.4, quick ? `Hot potato! +${pts}` : `+${pts}`);
              const to = nextAfter(p.n, players);
              if (to !== null) pass(b, to, players, p.n);
              continue;
            }
          }
          // fizz... tick tock when it's nearly time
          if (b.fuse < 2.2 && Math.floor(b.fuse * 3) !== b.tick) {
            b.tick = Math.floor(b.fuse * 3);
            ctx.sfx.tick();
          }
          if (b.fuse <= 0) {
            boom(b, players);
            dropTo = b.holder === 'M' ? nextAfter('M', players) : nextAfter(b.holder, players);
            if (alone && players[0]) dropTo = players[0].n;
            dropAt = t + BOOM_SECS + 0.4;
          }
        }
        for (let i = bombs.length - 1; i >= 0; i--) if (bombs[i].gone) bombs.splice(i, 1);
        for (const [k, until] of soot) if (t > until) soot.delete(k);
        for (const c of clouds) c.x = (c.x + c.sp * dt + W + 300) % (W + 300);
      },

      drawBack(g, players) {
        const t = ctx.t();
        sky(g, W, H, '#5ec8ff', '#d4f3ff');
        // the sun, with turning rays
        g.save();
        g.translate(W - 230, 160);
        g.rotate(t * 0.2);
        g.fillStyle = 'rgba(255, 224, 102, 0.55)';
        for (let i = 0; i < 12; i++) {
          g.rotate(Math.PI / 6);
          g.beginPath();
          g.moveTo(-14, 100);
          g.lineTo(14, 100);
          g.lineTo(0, 150);
          g.fill();
        }
        g.restore();
        g.fillStyle = '#ffe066';
        g.beginPath();
        g.arc(W - 230, 160, 85, 0, Math.PI * 2);
        g.fill();
        for (const c of clouds) {
          g.fillStyle = 'rgba(255,255,255,0.92)';
          const x = c.x - 150;
          const r = 60 * c.s;
          g.beginPath();
          g.arc(x - r, c.y + r * 0.2, r * 0.7, 0, Math.PI * 2);
          g.arc(x, c.y, r, 0, Math.PI * 2);
          g.arc(x + r, c.y + r * 0.25, r * 0.65, 0, Math.PI * 2);
          g.fill();
        }
        // rolling hills and round trees
        g.fillStyle = '#9be37a';
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.6 - 40 * Math.sin(x * 0.003 + 1));
        g.lineTo(W, H);
        g.fill();
        for (const tr of trees) {
          const y = H * 0.62;
          g.fillStyle = '#8a5a33';
          g.fillRect(tr.x - 14, y - 40, 28, 80);
          g.fillStyle = tr.c;
          g.beginPath();
          g.arc(tr.x, y - 70 - tr.r * 0.5, tr.r, 0, Math.PI * 2);
          g.arc(tr.x - tr.r * 0.6, y - 50, tr.r * 0.6, 0, Math.PI * 2);
          g.arc(tr.x + tr.r * 0.6, y - 50, tr.r * 0.6, 0, Math.PI * 2);
          g.fill();
        }
        const grass = g.createLinearGradient(0, H * 0.66, 0, H);
        grass.addColorStop(0, '#6fd36b');
        grass.addColorStop(1, '#45b04f');
        g.fillStyle = grass;
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.69 + 12 * Math.sin(x * 0.008));
        g.lineTo(W, H);
        g.fill();
        g.save();
        g.font = `34px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const f of flowers) g.fillText(f.e, f.x, f.y);
        g.restore();
        // lamp posts between the lanes, and everyone's picnic blanket
        const posts = [];
        for (let k = 1; k < slots; k++) posts.push(ctx.lane(k).x1);
        if (slots === 1 && monkey.show > 0.05) posts.push((ctx.lane(1).cx + monkey.x) / 2);
        for (const x of posts) lamp(g, x, floor, t);
        for (let k = 1; k <= slots; k++) {
          const lane = ctx.lane(k);
          const p = players.find((q) => q.n === k);
          if (!p && monkey.show > 0.5 && Math.abs(lane.cx - monkey.x) < 10) continue;
          blanket(g, lane.cx, floor, Math.min(lane.w * 0.7, 440), p ? p.color : '#d9d9d9');
        }
        // the monkey's tree stump
        if (monkey.show > 0.02) {
          g.save();
          g.globalAlpha *= monkey.show;
          stump(g, monkey.x, floor, monkey.s);
          g.restore();
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        // the monkey (panicking while it holds the bomb)
        if (monkey.show > 0.02) {
          g.save();
          g.globalAlpha *= monkey.show;
          const has = bombs.some((b) => b.holder === 'M' && b.phase === 'held');
          const sooty = soot.has('M');
          const wave = Math.sin(t * 8);
          const m = drawMonkey(g, monkey.x, hipY(), monkey.s, {
            t,
            mood: has ? 'panic' : sooty ? 'dizzy' : 'happy',
            armL: has ? 2.75 : 0.5 + 0.2 * wave,
            armR: has ? 2.75 : 2.4 + 0.3 * wave,
          });
          if (sooty) sootFace(g, m.head, t);
          g.restore();
        }
        // sooty faces from the last BOOM
        for (const p of players) if (soot.has(p.n)) sootFace(g, { x: p.head.x, y: p.head.y, r: Math.max(30, p.head.r) }, t);
        // incoming warnings
        for (const b of bombs) {
          if (b.phase !== 'drop' && b.phase !== 'fly') continue;
          const at = b.holder === null ? null : seat(b.holder, players);
          if (at && b.phase === 'drop') warning(g, at.x, at.y - 40, t, 80);
        }
        // the bombs
        for (const b of bombs) {
          if (b.phase === 'boom') {
            kaboom(g, b.x, b.y, (t - b.t0) / BOOM_SECS, t);
            continue;
          }
          const p = typeof b.holder === 'number' ? players.find((q) => q.n === b.holder) : null;
          const r = b.holder === 'M' ? R(null) : R(p);
          bomb(g, b.x, b.y, r, clamp(b.fuse / b.fuseMax, 0, 1), b.fuse, t, b.golden, b.phase === 'fly' ? (t - b.t0) * 12 : Math.sin(t * 20) * 0.08);
        }
        // the cue: THROW IT! over whoever holds a bomb
        for (const b of bombs) {
          if (b.phase !== 'held' || typeof b.holder !== 'number') continue;
          const p = players.find((q) => q.n === b.holder);
          if (!p || p.state !== 'active') continue;
          const k = p.s / 95;
          const x = p.head.x;
          const y = b.y - R(p) - 110 * k;
          const hot = b.fuse < 2;
          const pulse = (hot ? 1.15 : 1.05) + 0.08 * Math.sin(t * (hot ? 26 : 12));
          g.save();
          g.translate(x, y);
          g.scale(pulse * k, pulse * k);
          g.beginPath();
          g.arc(0, 0, 76, 0, Math.PI * 2);
          g.fillStyle = hot ? '#ff5d73' : '#ffffff';
          g.fill();
          g.lineWidth = 9;
          g.strokeStyle = p.color;
          g.stroke();
          g.font = `42px ${EMOJI}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('☝️', 0, -24);
          g.font = `900 36px ${FONT}`;
          g.fillStyle = hot ? '#ffffff' : '#1b1b3a';
          g.fillText('THROW!', 0, 28);
          g.restore();
        }
      },

      needs(n) {
        return bombs.some((b) => b.holder === n && b.phase !== 'boom') ? 'pump' : null;
      },

      /** Test bot: throw the bomb on as soon as it lands. */
      bot(p) {
        return bombs.some((b) => b.holder === p.n && b.phase === 'held') ? { pump: true } : {};
      },
    };
  },
};

// ------------------------------------------------------------------------------------------------ drawing

/**
 * A round cartoon bomb with worried eyes and a burning fuse. frac: how much fuse is left (0..1), fuse: seconds
 * left (it flashes red under 2 s, faster and faster).
 */
function bomb(g, x, y, r, frac, fuse, t, golden, spin) {
  g.save();
  g.translate(x, y);
  g.rotate(spin);
  // fuse: a curly rope that gets shorter
  const len = 0.25 + 1.4 * frac;
  const cap = { x: r * 0.55, y: -r * 0.75 };
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const u = (i / 12) * len;
    pts.push({ x: cap.x + u * r * 0.7, y: cap.y - u * r * 0.55 + Math.sin(u * 5) * r * 0.12 });
  }
  g.strokeStyle = '#c9a26b';
  g.lineWidth = Math.max(5, r * 0.12);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) g.lineTo(p.x, p.y);
  g.stroke();
  // the spark
  const tip = pts[pts.length - 1];
  const fl = 0.8 + 0.4 * Math.sin(t * 40);
  g.fillStyle = '#ffb000';
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 + t * 10;
    const rr = (i % 2 ? 0.12 : 0.32) * r * fl;
    g.lineTo(tip.x + Math.cos(a) * rr, tip.y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.fillStyle = '#fff6b0';
  g.beginPath();
  g.arc(tip.x, tip.y, 0.08 * r, 0, Math.PI * 2);
  g.fill();
  // cap
  g.fillStyle = '#7d7d8a';
  g.save();
  g.translate(cap.x * 0.8, cap.y * 0.8);
  g.rotate(0.6);
  g.fillRect(-r * 0.22, -r * 0.16, r * 0.44, r * 0.32);
  g.restore();
  // body
  const grad = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  grad.addColorStop(0, golden ? '#fff3b0' : '#6b6b80');
  grad.addColorStop(0.3, golden ? '#ffc21a' : '#2b2b3a');
  grad.addColorStop(1, golden ? '#c98a00' : '#14141f');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  // red flashes, faster as the fuse runs out
  if (fuse < 2 && Math.sin(t * (10 + (2 - fuse) * 14)) > 0) {
    g.fillStyle = 'rgba(255, 60, 60, 0.6)';
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
  }
  // worried eyes
  const wide = fuse < 2 ? 1.3 : 1;
  for (const s of [-1, 1]) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(s * r * 0.3, -r * 0.05, r * 0.17 * wide, r * 0.22 * wide, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b1b2f';
    g.beginPath();
    g.arc(s * r * 0.3 + Math.sin(t * 6) * r * 0.04, -r * 0.02, r * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.max(3, r * 0.06);
  g.beginPath();
  g.moveTo(-r * 0.2, r * 0.4);
  for (let i = 1; i <= 4; i++) g.lineTo(-r * 0.2 + i * r * 0.1, r * 0.4 + (i % 2 ? -1 : 1) * r * 0.05);
  g.stroke();
  g.restore();
}

/** The BOOM: a big comic-book star, then puffs of smoke. u: 0..1 through it. */
function kaboom(g, x, y, u, t) {
  g.save();
  g.translate(x, y);
  if (u < 0.5) {
    const k = 0.5 + u * 1.6;
    g.scale(k, k);
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      const rr = i % 2 ? 110 : 190 + 20 * Math.sin(t * 30 + i);
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = '#ffd23f';
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#ff6b1a';
    g.stroke();
    g.font = `900 72px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#7a2b00';
    g.strokeText('BOOM!', 0, 4);
    g.fillStyle = '#ffffff';
    g.fillText('BOOM!', 0, 4);
  } else {
    const k = (u - 0.5) * 2;
    g.globalAlpha = 1 - k;
    g.fillStyle = '#8a8a99';
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      g.beginPath();
      g.arc(Math.cos(a) * 80 * (1 + k), Math.sin(a) * 50 * (1 + k) - 100 * k, 50 + 20 * k, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** Sooty smudges, frazzled hair and a wisp of smoke on a head. */
function sootFace(g, head, t) {
  const { x, y, r } = head;
  g.save();
  g.fillStyle = 'rgba(40, 40, 50, 0.55)';
  for (const [dx, dy, rr] of [
    [-0.4, 0.15, 0.32],
    [0.45, 0.05, 0.28],
    [0.05, 0.5, 0.3],
    [-0.1, -0.45, 0.35],
  ]) {
    g.beginPath();
    g.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2);
    g.fill();
  }
  // frazzled hair
  g.strokeStyle = '#2b2b3a';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (1.15 + (0.7 * i) / 8);
    const rr = r * (i % 2 ? 1.05 : 1.35);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
  // smoke wisps
  g.fillStyle = 'rgba(140, 140, 155, 0.6)';
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.8 + i / 3) % 1;
    g.beginPath();
    g.arc(x + Math.sin(t * 3 + i) * r * 0.4, y - r * (1.4 + k * 1.4), r * (0.18 + 0.2 * k), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function blanket(g, cx, floor, w, color) {
  const h = 90;
  const y0 = floor - 30;
  g.save();
  g.beginPath();
  g.moveTo(cx - w / 2 + 40, y0);
  g.lineTo(cx + w / 2 + 40, y0);
  g.lineTo(cx + w / 2 - 20, y0 + h);
  g.lineTo(cx - w / 2 - 20, y0 + h);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.clip();
  g.fillStyle = color;
  const n = 8;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2) continue;
      const u = i / n;
      const top = y0 + (j * h) / 3;
      const shift = 40 - (60 * j) / 3;
      g.fillRect(cx - w / 2 + shift + u * w - 10, top, w / n + 10, h / 3 + 1);
    }
  g.restore();
}

function lamp(g, x, floor, t) {
  g.save();
  g.fillStyle = '#3b4a5a';
  g.fillRect(x - 9, floor - 560, 18, 600);
  g.fillRect(x - 30, floor + 20, 60, 20);
  g.fillStyle = '#ffe9a8';
  g.globalAlpha = 0.85 + 0.15 * Math.sin(t * 3 + x);
  g.beginPath();
  g.arc(x, floor - 585, 34, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#3b4a5a';
  g.beginPath();
  g.moveTo(x - 44, floor - 600);
  g.lineTo(x + 44, floor - 600);
  g.lineTo(x, floor - 640);
  g.closePath();
  g.fill();
  g.restore();
}

function stump(g, x, floor, s) {
  const w = 1.6 * s;
  const top = floor - 50;
  g.save();
  g.fillStyle = '#8a5a33';
  g.fillRect(x - w / 2, top, w, 80);
  g.fillStyle = '#d9a86c';
  g.beginPath();
  g.ellipse(x, top, w / 2, 18, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#a8783f';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(x, top, w / 4, 8, 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}
