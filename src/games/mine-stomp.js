// Mine Stomp: every kid digs their own mine shaft. Each JUMP stomps the brick under your feet (soft bricks crack
// in one stomp, hard ones take two or three); when it breaks you drop down to the next layer. Gems, coins and
// dinosaur bones hide in some bricks: step sideways onto them to dig them out. Shiny metal blocks can't be
// broken, so step to the side. Half-way down the mine you reach the Dino layer: more bones and giant fossils.
import { rand, pick, clamp, sky } from './kit.js';

const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const ROUNDED = '"Arial Rounded MT Bold","Trebuchet MS",sans-serif';
const K = 3; // sub-columns in each kid's shaft
const ROW = 124; // px height of a layer of bricks
const LAND_WAIT = 0.8; // s after a take-off that a stomp counts even if we never saw the landing
const RESCUE = 8; // s stuck on the same metal block before a friendly beaver digs it away
const LOOT = [
  { e: '🪙', name: 'Coin!', pts: 2, w: 4 },
  { e: '💎', name: 'Gem!', pts: 3, w: 3 },
  { e: '🦴', name: 'Dino bone!', pts: 3, w: 3 },
  { e: '💰', name: 'Treasure!', pts: 5, w: 1 },
];
const DINO = [
  { e: '🦴', name: 'Dino bone!', pts: 3, w: 5 },
  { e: '💎', name: 'Gem!', pts: 3, w: 3 },
  { e: '🦖', name: 'DINO SKULL!', pts: 8, w: 2, hp: 3 },
  { e: '👑', name: 'Crown!', pts: 5, w: 1 },
];
// the rock gets different the deeper you go: soil, clay, stone, crystal, warm deep rock
const BANDS = [
  { from: 0, wall: ['#8f5a33', '#7f4f2c'], brick: '#c98a52' },
  { from: 8, wall: ['#bd6f3a', '#a9602f'], brick: '#e8a062' },
  { from: 22, wall: ['#85889a', '#75788a'], brick: '#b9bccb' },
  { from: 40, wall: ['#6a58a6', '#5c4b94'], brick: '#a38ee6' },
  { from: 65, wall: ['#a5463b', '#933c32'], brick: '#de7a6a' },
];

const band = (r) => {
  let b = BANDS[0];
  for (const x of BANDS) if (r >= x.from) b = x;
  return b;
};

/** A steady pseudo-random 0..1 for a spot in the rock, so the walls don't flicker. */
const hash = (a, b) => ((Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663)) >>> 0) / 4294967296;

function weighted(rng, list) {
  let total = 0;
  for (const l of list) total += l.w;
  let r = rng() * total;
  for (const l of list) if ((r -= l.w) <= 0) return l;
  return list[0];
}

/** A chunky arrow; angle 0 points up, PI/2 points right. */
function arrow(g, x, y, size, angle, color) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(size / 100, size / 100);
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

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

export default {
  id: 'mine-stomp',
  title: 'Mine Stomp',
  icon: '⛏️',
  color: '#b5651d',
  moves: ['jump', 'sidestep'],
  howto: ['JUMP to stomp the brick under your feet and dig down!', 'Shiny metal is too hard: step to the side!', 'Step onto gems and bones to dig them out.'],
  layout: 'columns',
  hearts: 0,
  stars: [40, 95, 170],

  create(ctx) {
    const { W, H, rng } = ctx;
    const floor = ctx.floorY;
    const mines = new Map(); // n -> one kid's shaft
    const debris = [];
    const tries = new Map(); // test bot: n -> where it is trying to step
    let dino = false;
    const clouds = Array.from({ length: 5 }, () => ({ x: rand(rng, 0, W), y: rand(rng, 60, 300), s: rand(rng, 0.7, 1.3) }));

    function genRow(m) {
      const lvl = ctx.level();
      const table = dino ? DINO : LOOT;
      const row = [];
      for (let i = 0; i < K; i++) {
        const hp = clamp(1 + (rng() < 0.3 * lvl ? 1 : 0) + (rng() < 0.1 * lvl ? 1 : 0), 1, 3);
        const loot = rng() < (dino ? 0.24 : 0.15) ? weighted(rng, table) : null;
        const h = loot?.hp ?? hp;
        row.push({ metal: false, hp: h, max: h, loot, hitAt: -9 });
      }
      // metal: never in the first layers, at most K-1 in a row, often right where the kid is standing
      if (m.made >= 3 && rng() < 0.14 + 0.1 * lvl) {
        const at = rng() < 0.55 ? m.c : Math.floor(rng() * K);
        row[at] = { metal: true, hp: 1, max: 1, loot: null, hitAt: -9 };
        if (dino && rng() < 0.3) {
          const other = (at + 1 + Math.floor(rng() * (K - 1))) % K;
          row[other] = { metal: true, hp: 1, max: 1, loot: null, hitAt: -9 };
        }
      }
      m.made++;
      return row;
    }

    function mine(p) {
      if (!mines.has(p.n)) {
        const lane = ctx.lane(p.n);
        const m = { n: p.n, c: 1, depth: 0, made: 0, rows: [], gx: p.hip.x, scroll: 0, colW: 1.75 * Math.min(lane.w * 0.16, 95), pendingAt: null, lastStomp: -9, lastStep: -9, result: null, metalSince: null, helpAt: -9 };
        m.rows.push(genRow(m), genRow(m));
        mines.set(p.n, m);
      }
      return mines.get(p.n);
    }

    /** One stomp on the brick under player p. */
    function stomp(p, m, t) {
      const cell = m.rows[0][m.c];
      const x = p.head.x;
      const y = p.head.y - p.s * 1.4;
      m.lastStomp = t;
      cell.hitAt = t;
      if (cell.metal) {
        ctx.report.miss(p.n, 'sidestep', x, y, pick(rng, ['CLANG!', 'BOINNG! Metal!', 'Ouch, toes!']));
        ctx.sfx.bonk();
        ctx.fx.burst(p.hip.x, floor, '#ffe066', 10);
        m.result = { text: '🦶', until: t + 0.7 };
        return;
      }
      cell.hp--;
      const color = band(m.depth).brick;
      if (cell.hp > 0) {
        ctx.report.good(p.n, x, y, 'Crack!');
        ctx.sfx.hit();
        ctx.fx.burst(p.hip.x, floor + 10, color, 8);
        return;
      }
      // it breaks: score it, and the whole layer crumbles so the kid drops down to the next one
      const pts = 1 + (cell.loot?.pts ?? 0);
      ctx.report.score(p.n, pts, x, y, cell.loot ? `${cell.loot.name} +${pts}` : '+1');
      if (cell.loot) {
        ctx.sfx.gold();
        ctx.fx.burst(p.hip.x, floor + 20, '#ffd23f', 24);
        m.result = { text: cell.loot.e, until: t + 1 };
      } else ctx.sfx.pop();
      const gl = m.gx - 1.5 * m.colW;
      for (let i = 0; i < K; i++) {
        const c = m.rows[0][i];
        for (let k = 0; k < 4; k++) {
          debris.push({
            x: gl + (i + rand(rng, 0.2, 0.8)) * m.colW,
            y: floor + m.scroll + rand(rng, 10, ROW - 10),
            vx: rand(rng, -260, 260),
            vy: rand(rng, -520, -200),
            rot: rand(rng, 0, 6),
            vr: rand(rng, -8, 8),
            size: rand(rng, 18, 34),
            color: c.metal ? '#aab4c3' : color,
            life: 1.1,
          });
        }
      }
      m.rows.shift();
      m.rows.push(genRow(m));
      m.depth++;
      m.scroll += ROW;
    }

    return {
      update(dt, players) {
        const t = ctx.t();
        if (!dino && ctx.progress() >= 0.5) {
          dino = true;
          ctx.sfx.cheer();
          ctx.fx.pop('The Dino layer! Dig up bones!', W / 2, H * 0.3, '#ffd23f');
        }
        for (const p of players) {
          const m = mine(p);
          // the bricks slide so the kid's column is always right under their feet
          const target = p.hip.x - (m.c - 1) * m.colW;
          m.gx += (target - m.gx) * Math.min(1, dt * 12);
          if (p.state !== 'active') {
            m.pendingAt = null;
            continue;
          }
          if (p.step) {
            const nc = m.c + p.step;
            if (nc >= 0 && nc < K) {
              const wasMetal = m.rows[0][m.c].metal;
              m.c = nc;
              m.lastStep = t;
              ctx.sfx.whoosh();
              if (wasMetal && !m.rows[0][nc].metal) ctx.report.good(p.n, p.head.x, p.head.y - p.s * 1.4, 'Good step!');
            }
          }
          // stuck on metal for a long time (can't step, doesn't get it yet): a beaver comes to help
          const under = m.rows[0][m.c];
          if (!under.metal) m.metalSince = null;
          else if (m.metalSince === null) m.metalSince = t;
          else if (t - m.metalSince > RESCUE) {
            m.rows[0][m.c] = { metal: false, hp: 1, max: 1, loot: null, hitAt: t };
            m.metalSince = null;
            m.helpAt = t;
            ctx.sfx.boing();
            ctx.fx.pop('A beaver helps! Now JUMP!', p.head.x, p.head.y - p.s * 2.4, '#ffd23f');
          }
          if (p.jumped) m.pendingAt = t;
          // the stomp lands when the feet come down
          if (m.pendingAt !== null && (p.landed || t - m.pendingAt > LAND_WAIT)) {
            m.pendingAt = null;
            stomp(p, m, t);
          }
        }
        for (const m of mines.values()) m.scroll *= Math.exp(-dt * 7);
        for (const d of debris) {
          d.life -= dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.vy += 1400 * dt;
          d.rot += d.vr * dt;
        }
        for (let i = debris.length - 1; i >= 0; i--) if (debris[i].life <= 0) debris.splice(i, 1);
        for (const c of clouds) c.x = (c.x + 14 * dt * c.s + W + 300) % (W + 300);
      },

      drawBack(g) {
        const t = ctx.t();
        // the surface: sky, sun, clouds, hills, and plain ground for lanes nobody is digging
        sky(g, W, H, '#8ad8ff', '#e3f7ff');
        g.fillStyle = '#ffe066';
        g.beginPath();
        g.arc(W - 240, 150, 80, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.font = `110px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const c of clouds) g.fillText('☁️', c.x - 150, c.y);
        g.restore();
        g.fillStyle = '#5cc46a';
        g.beginPath();
        g.moveTo(0, floor);
        for (let x = 0; x <= W; x += 40) g.lineTo(x, floor - 150 - 60 * Math.sin(x * 0.004) - 25 * Math.sin(x * 0.013));
        g.lineTo(W, floor);
        g.fill();
        g.fillStyle = BANDS[0].wall[0];
        g.fillRect(0, floor, W, H - floor);
        g.fillStyle = '#3fa34d';
        g.fillRect(0, floor - 10, W, 22);

        for (const m of mines.values()) {
          const lane = ctx.lane(m.n);
          const cw = m.colW;
          const gl = m.gx - 1.5 * cw;
          const gr = m.gx + 1.5 * cw;
          const surf = floor - m.depth * ROW + m.scroll;
          g.save();
          g.beginPath();
          g.rect(lane.x0, 0, lane.w, H);
          g.clip();
          // the rock walls, in layers, with pebbles and little fossils pressed into them
          for (let r = Math.max(0, Math.floor(-surf / ROW)); surf + r * ROW < H; r++) {
            const y = surf + r * ROW;
            const b = band(r);
            g.fillStyle = b.wall[r % 2];
            g.fillRect(lane.x0, y, lane.w, ROW + 1);
            for (let k = 0; k < 4; k++) {
              const px = m.gx + (hash(r, k) - 0.5) * lane.w * 1.6;
              const py = y + 20 + hash(k, r) * (ROW - 40);
              g.fillStyle = 'rgba(0,0,0,0.18)';
              g.beginPath();
              g.ellipse(px, py, 16 + 10 * hash(r + 3, k), 10, 0, 0, Math.PI * 2);
              g.fill();
            }
            if (hash(r, 99) < 0.25) {
              g.save();
              g.globalAlpha = 0.45;
              g.font = `46px ${EMOJI}`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText(r >= 40 ? '🔮' : hash(r, 5) < 0.5 ? '🐚' : '🦴', m.gx + (hash(r, 98) < 0.5 ? -1 : 1) * (2.2 * cw + 60 * hash(r, 97)), y + ROW / 2);
              g.restore();
            }
          }
          // the shaft the kid has dug: dark, with wooden posts and lanterns
          if (surf < floor) {
            const top = Math.max(-10, surf);
            const shaft = g.createLinearGradient(0, top, 0, floor);
            shaft.addColorStop(0, '#4a3020');
            shaft.addColorStop(1, '#22150c');
            g.fillStyle = shaft;
            g.fillRect(gl, top, gr - gl, floor - top);
            g.fillStyle = '#9c6b3c';
            g.fillRect(gl - 8, top, 16, floor - top);
            g.fillRect(gr - 8, top, 16, floor - top);
            for (let r = 1; r <= m.depth; r++) {
              const y = floor + m.scroll - r * ROW;
              if (y < -ROW || y > floor) continue;
              g.fillStyle = '#7a4f2a';
              g.fillRect(gl - 14, y - 8, 28, 16);
              g.fillRect(gr - 14, y - 8, 28, 16);
              if (r % 3 === 0) {
                const lx = r % 2 ? gl + 30 : gr - 30;
                g.save();
                g.globalAlpha = 0.35 + 0.1 * Math.sin(t * 6 + r);
                const glow = g.createRadialGradient(lx, y + 40, 5, lx, y + 40, 90);
                glow.addColorStop(0, '#ffd27a');
                glow.addColorStop(1, 'rgba(255,210,122,0)');
                g.fillStyle = glow;
                g.fillRect(lx - 90, y - 50, 180, 180);
                g.restore();
                g.font = `48px ${EMOJI}`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillText('🏮', lx, y + 40);
              }
            }
          }
          // grass on the surface (over the whole shaft before the first brick breaks)
          if (surf < H && surf > -30) {
            g.fillStyle = '#3fa34d';
            if (m.depth === 0) g.fillRect(lane.x0, surf - 10, lane.w, 22);
            else {
              g.fillRect(lane.x0, surf - 10, gl - lane.x0, 22);
              g.fillRect(gr, surf - 10, lane.x1 - gr, 22);
            }
          }
          // the two layers of bricks under the kid's feet
          for (let i = 0; i < 2; i++) {
            const y = floor + i * ROW + m.scroll;
            const r = m.depth + i;
            for (let c = 0; c < K; c++) {
              const cell = m.rows[i][c];
              const shake = t - cell.hitAt < 0.18 ? Math.sin((t - cell.hitAt) * 90) * 7 : 0;
              const x = gl + c * cw + shake;
              if (cell.metal) {
                const steel = g.createLinearGradient(x, y, x + cw, y + ROW);
                steel.addColorStop(0, '#eef3f8');
                steel.addColorStop(0.5, '#a9b4c2');
                steel.addColorStop(1, '#6f7c8c');
                g.fillStyle = steel;
                roundRect(g, x + 4, y + 4, cw - 8, ROW - 8, 12);
                g.fill();
                g.lineWidth = 6;
                g.strokeStyle = '#4b5563';
                g.stroke();
                g.fillStyle = '#5b6574';
                for (const [rx, ry] of [[0.16, 0.2], [0.84, 0.2], [0.16, 0.8], [0.84, 0.8]]) {
                  g.beginPath();
                  g.arc(x + rx * cw, y + ry * ROW, 7, 0, Math.PI * 2);
                  g.fill();
                }
                g.strokeStyle = 'rgba(255,255,255,0.7)';
                g.lineWidth = 8;
                g.beginPath();
                g.moveTo(x + cw * 0.3, y + ROW * 0.75);
                g.lineTo(x + cw * 0.55, y + ROW * 0.25);
                g.stroke();
                continue;
              }
              const base = band(r).brick;
              g.fillStyle = base;
              roundRect(g, x + 4, y + 4, cw - 8, ROW - 8, 16);
              g.fill();
              g.fillStyle = 'rgba(255,255,255,0.25)';
              g.fillRect(x + 14, y + 10, cw - 28, 10);
              g.lineWidth = 6;
              g.strokeStyle = 'rgba(60,30,10,0.55)';
              roundRect(g, x + 4, y + 4, cw - 8, ROW - 8, 16);
              g.stroke();
              // hard bricks show little dots: one per stomp still needed
              if (cell.hp > 1) {
                g.fillStyle = 'rgba(60,30,10,0.45)';
                for (let k = 0; k < cell.hp; k++) {
                  g.beginPath();
                  g.arc(x + cw / 2 + (k - (cell.hp - 1) / 2) * 22, y + ROW - 22, 7, 0, Math.PI * 2);
                  g.fill();
                }
              }
              // cracks from the stomps so far
              const dmg = cell.max - cell.hp;
              if (dmg > 0) {
                g.strokeStyle = '#3a1f0c';
                g.lineWidth = 5;
                g.lineCap = 'round';
                for (let k = 0; k < dmg * 2; k++) {
                  const a = hash(r * 7 + c, k) * Math.PI * 2;
                  let cx = x + cw / 2;
                  let cy = y + ROW / 2;
                  g.beginPath();
                  g.moveTo(cx, cy);
                  for (let s = 0; s < 3; s++) {
                    cx += Math.cos(a + (s % 2 ? 0.5 : -0.5)) * cw * 0.14;
                    cy += Math.sin(a + (s % 2 ? 0.5 : -0.5)) * ROW * 0.14;
                    g.lineTo(cx, cy);
                  }
                  g.stroke();
                }
              }
              if (cell.loot) {
                g.save();
                const glow = 0.5 + 0.5 * Math.sin(t * 5 + c);
                g.globalAlpha = 0.25 + 0.25 * glow;
                g.fillStyle = '#fff6b0';
                g.beginPath();
                g.arc(x + cw / 2, y + ROW / 2, ROW * 0.36, 0, Math.PI * 2);
                g.fill();
                g.globalAlpha = 1;
                g.font = `${Math.round(ROW * 0.5)}px ${EMOJI}`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillText(cell.loot.e, x + cw / 2, y + ROW / 2);
                g.restore();
              }
            }
          }
          // the brick you are standing on glows in your colour
          g.lineWidth = 8;
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          roundRect(g, gl + m.c * cw + 2, floor + m.scroll + 2, cw - 4, ROW - 4, 16);
          g.stroke();
          // how deep: a little wooden sign on the wall
          const sx = gr + 70 < lane.x1 - 60 ? gr + 70 : gl - 70;
          g.fillStyle = '#a8743f';
          roundRect(g, sx - 58, floor - 120, 116, 56, 10);
          g.fill();
          g.lineWidth = 4;
          g.strokeStyle = '#5a3a1a';
          g.stroke();
          g.fillStyle = '#5a3a1a';
          g.fillRect(sx - 5, floor - 64, 10, 64);
          g.fillStyle = '#fff';
          g.font = `900 30px ${ROUNDED}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(`${m.depth} m`, sx, floor - 92);
          g.restore();
        }
        // rocky walls between the lanes
        for (const m of mines.values()) {
          const lane = ctx.lane(m.n);
          for (const x of [lane.x0, lane.x1]) {
            if (x <= 0 || x >= W) continue;
            g.fillStyle = '#4a3426';
            g.fillRect(x - 9, 0, 18, H);
            g.fillStyle = 'rgba(255,255,255,0.25)';
            g.fillRect(x - 9, 0, 4, H);
          }
        }
      },

      drawFront(g, players) {
        const t = ctx.t();
        for (const d of debris) {
          g.save();
          g.globalAlpha = Math.min(1, d.life * 2);
          g.translate(d.x, d.y);
          g.rotate(d.rot);
          g.fillStyle = d.color;
          g.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.8);
          g.strokeStyle = 'rgba(60,30,10,0.6)';
          g.lineWidth = 3;
          g.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.8);
          g.restore();
        }
        // the helpful beaver, popping up beside the brick it just cleared
        for (const m of mines.values()) {
          const k = (t - m.helpAt) / 1.6;
          if (k < 0 || k > 1) continue;
          const bx = m.gx + (m.c - 1) * m.colW + m.colW * 0.75;
          g.save();
          g.font = `${Math.round(m.colW * 0.6)}px ${EMOJI}`;
          g.textAlign = 'center';
          g.textBaseline = 'bottom';
          g.fillText('🦫', bx, floor - Math.sin(k * Math.PI) * 50);
          g.restore();
        }
        // each kid's cue: JUMP! with an up arrow, or STEP! with arrows towards the bricks they can break
        for (const p of players) {
          if (p.state !== 'active' || !mines.has(p.n)) continue;
          const m = mines.get(p.n);
          const x = p.head.x;
          const y = p.head.y - p.s * 1.7;
          if (m.result && t < m.result.until) {
            g.save();
            g.font = `90px ${EMOJI}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(m.result.text, x, y);
            g.restore();
            continue;
          }
          const metal = m.rows[0][m.c].metal;
          if (metal) {
            g.save();
            g.translate(x, y);
            const k = 1.08 + 0.08 * Math.sin(t * 14);
            g.scale(k, k);
            g.beginPath();
            g.arc(0, 0, 80, 0, Math.PI * 2);
            g.fillStyle = '#8e5cff';
            g.fill();
            g.lineWidth = 8;
            g.strokeStyle = p.color;
            g.stroke();
            g.fillStyle = '#fff';
            g.font = `900 44px ${ROUNDED}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('STEP!', 0, 4);
            const bob = Math.abs(Math.sin(t * 8)) * 14;
            for (const dir of [-1, 1]) {
              const nc = m.c + dir;
              if (nc < 0 || nc >= K || m.rows[0][nc].metal) continue;
              arrow(g, dir * (125 + bob), 0, 80, (dir * Math.PI) / 2, '#ffb000');
            }
            g.restore();
            continue;
          }
          // jumping keeps it small; a kid who has stopped gets the big JUMP! bubble
          const idle = t - Math.max(m.lastStomp, m.lastStep) > 1.6;
          g.save();
          g.translate(x, y);
          if (idle) {
            const k = 1 + 0.08 * Math.sin(t * 12);
            g.scale(k, k);
            g.beginPath();
            g.arc(0, 0, 75, 0, Math.PI * 2);
            g.fillStyle = '#ff8a00';
            g.fill();
            g.lineWidth = 8;
            g.strokeStyle = p.color;
            g.stroke();
            g.fillStyle = '#fff';
            g.font = `900 42px ${ROUNDED}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('JUMP!', 0, 4);
            arrow(g, 125, -Math.abs(Math.sin(t * 8)) * 16, 90, 0, '#ff8a00');
          } else arrow(g, 0, -Math.abs(Math.sin(t * 8)) * 12, 60, 0, '#ff8a00');
          g.restore();
        }
      },

      needs(n) {
        const m = mines.get(n);
        return m && m.rows[0][m.c].metal ? 'sidestep' : 'jump';
      },

      /** Test bot: stomp away; step off metal, step onto treasure next door, then back to the middle. */
      bot(p, t) {
        const m = mines.get(p.n);
        if (!m) return { jump: true };
        const row = m.rows[0];
        const tr = tries.get(p.n) ?? { c: m.c, dir: 0, since: t, banDir: 0, banUntil: -9 };
        tries.set(p.n, tr);
        if (tr.c !== m.c) Object.assign(tr, { c: m.c, dir: 0, since: t });
        const free = (c) => c >= 0 && c < K && !row[c].metal;
        const banned = (c) => t < tr.banUntil && Math.sign(c - m.c) === tr.banDir;
        let goal = m.c;
        if (!free(m.c)) {
          let best = Infinity;
          for (let c = 0; c < K; c++) {
            const d = Math.abs(c - m.c) + (banned(c) ? 5 : 0) + Math.abs(c - 1) * 0.1;
            if (free(c) && d < best) {
              best = d;
              goal = c;
            }
          }
        } else if (!row[m.c].loot) {
          for (const c of [m.c - 1, m.c + 1]) if (free(c) && row[c].loot && !banned(c)) goal = c;
          const cur = row[m.c];
          if (goal === m.c && m.c !== 1 && free(1) && cur.hp === cur.max && !banned(1)) goal = 1;
        }
        if (goal === m.c) return { jump: true };
        const dir = Math.sign(goal - m.c);
        if (tr.dir !== dir) Object.assign(tr, { dir, since: t });
        // can't get there (the edge of the camera picture): give up on that side for a while
        if (t - tr.since > 1.2) {
          Object.assign(tr, { banDir: dir, banUntil: t + 4, dir: 0, since: t });
          return { jump: true };
        }
        return { x: p.hip.x + dir * 1.5 * p.s };
      },
    };
  },
};
