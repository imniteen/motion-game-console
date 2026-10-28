// The cartoon monkey: the computer player who keeps a kid company when they play alone in the lane games
// (Snow Fort, Sky Flap, Hot Potato).

/**
 * A cheeky cartoon monkey: the computer player when a kid plays alone (also used by other games). (x, y) is
 * its hip centre and s its body unit (about a kid's shoulder width). armL/armR are angles from pointing down
 * (0) to straight up (PI), like synth.js. Returns where its head and hands are, so a game can put a snowball
 * or a bomb in them.
 * @param {CanvasRenderingContext2D} g
 * @param {{ t?: number, mood?: 'happy'|'taunt'|'panic'|'ouch'|'dizzy', armL?: number, armR?: number,
 *   hat?: 'beanie'|'propeller'|null, wings?: number|null, soot?: boolean }} [o]  wings: flap phase (radians)
 */
export function drawMonkey(g, x, y, s, o = {}) {
  const t = o.t ?? 0;
  const mood = o.mood ?? 'happy';
  const fur = '#8a5a33';
  const dark = '#4f2c12';
  const skin = '#f2d2a9';
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const stroke = (pts, w, color) => {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    g.strokeStyle = dark;
    g.lineWidth = w + 7;
    g.stroke();
    g.strokeStyle = color;
    g.lineWidth = w;
    g.stroke();
  };
  // wings (a flying monkey)
  if (o.wings !== undefined && o.wings !== null) {
    const flap = Math.sin(o.wings);
    for (const side of [-1, 1]) {
      g.save();
      g.translate(x + side * 0.3 * s, y - 1.05 * s);
      g.rotate(side * (0.5 + 0.45 * flap));
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#9fb8d8';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(side * 1.0 * s, -1.0 * s, side * 1.5 * s, -0.4 * s);
      g.quadraticCurveTo(side * 1.2 * s, -0.1 * s, side * 1.25 * s, 0.1 * s);
      g.quadraticCurveTo(side * 0.9 * s, 0.05 * s, side * 0.85 * s, 0.3 * s);
      g.quadraticCurveTo(side * 0.5 * s, 0.15 * s, 0, 0.2 * s);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }
  // tail
  g.beginPath();
  g.moveTo(x + 0.35 * s, y - 0.2 * s);
  g.bezierCurveTo(x + 1.1 * s, y - 0.1 * s, x + 1.2 * s, y - 1.0 * s, x + 0.85 * s, y - 1.05 * s);
  g.bezierCurveTo(x + 0.6 * s, y - 1.1 * s, x + 0.6 * s, y - 0.8 * s, x + 0.8 * s, y - 0.8 * s);
  g.strokeStyle = dark;
  g.lineWidth = 0.16 * s + 7;
  g.stroke();
  g.strokeStyle = fur;
  g.lineWidth = 0.16 * s;
  g.stroke();
  // legs
  for (const side of [-1, 1]) {
    const knee = { x: x + side * 0.4 * s, y: y + 0.45 * s };
    const foot = { x: x + side * 0.38 * s, y: y + 0.85 * s };
    stroke([{ x: x + side * 0.25 * s, y }, knee, foot], 0.26 * s, fur);
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(foot.x + side * 0.08 * s, foot.y + 0.06 * s, 0.24 * s, 0.13 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  // body
  g.fillStyle = fur;
  g.strokeStyle = dark;
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(x, y - 0.6 * s, 0.55 * s, 0.72 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(x, y - 0.5 * s, 0.34 * s, 0.48 * s, 0, 0, Math.PI * 2);
  g.fill();
  // arms
  const hands = [];
  for (const [side, a] of [
    [-1, o.armL ?? 0.4],
    [1, o.armR ?? 0.4],
  ]) {
    const sh = { x: x + side * 0.42 * s, y: y - 1.05 * s };
    const el = { x: sh.x + Math.sin(a) * side * 0.5 * s + side * 0.08 * s, y: sh.y + Math.cos(a) * 0.5 * s };
    const hd = { x: sh.x + Math.sin(a) * side * 1.0 * s, y: sh.y + Math.cos(a) * 1.0 * s };
    stroke([sh, el, hd], 0.22 * s, fur);
    g.fillStyle = skin;
    g.strokeStyle = dark;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(hd.x, hd.y, 0.17 * s, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    hands.push(hd);
  }
  // head
  const shake = mood === 'panic' ? Math.sin(t * 40) * 0.05 * s : 0;
  const hx = x + shake;
  const hy = y - 1.75 * s;
  const r = 0.62 * s;
  for (const side of [-1, 1]) {
    g.fillStyle = fur;
    g.strokeStyle = dark;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(hx + side * 1.05 * r, hy - 0.05 * r, 0.38 * r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = skin;
    g.beginPath();
    g.arc(hx + side * 1.05 * r, hy - 0.05 * r, 0.2 * r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = fur;
  g.beginPath();
  g.arc(hx, hy, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // face: a heart-shaped patch and a big muzzle
  g.fillStyle = skin;
  g.beginPath();
  g.arc(hx - 0.3 * r, hy - 0.12 * r, 0.42 * r, 0, Math.PI * 2);
  g.arc(hx + 0.3 * r, hy - 0.12 * r, 0.42 * r, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(hx, hy + 0.35 * r, 0.62 * r, 0.42 * r, 0, 0, Math.PI * 2);
  g.fill();
  // eyes
  g.fillStyle = '#1b1b2f';
  g.strokeStyle = '#1b1b2f';
  g.lineWidth = 4;
  for (const side of [-1, 1]) {
    const ex = hx + side * 0.3 * r;
    const ey = hy - 0.12 * r;
    g.beginPath();
    if (mood === 'panic') {
      g.fillStyle = '#ffffff';
      g.arc(ex, ey, 0.22 * r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#1b1b2f';
      g.beginPath();
      g.arc(ex + Math.sin(t * 30) * 0.05 * r, ey, 0.07 * r, 0, Math.PI * 2);
      g.fill();
    } else if (mood === 'ouch') {
      g.moveTo(ex - 0.12 * r, ey - 0.1 * r);
      g.lineTo(ex + 0.12 * r, ey + 0.1 * r);
      g.moveTo(ex + 0.12 * r, ey - 0.1 * r);
      g.lineTo(ex - 0.12 * r, ey + 0.1 * r);
      g.stroke();
    } else if (mood === 'dizzy') {
      for (let a = 0; a < 10; a += 0.5) {
        const rr = 0.02 * r * a;
        const px = ex + Math.cos(a + t * 8) * rr;
        const py = ey + Math.sin(a + t * 8) * rr;
        if (a === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    } else if (mood === 'taunt' && side > 0) {
      g.moveTo(ex - 0.12 * r, ey);
      g.quadraticCurveTo(ex, ey - 0.12 * r, ex + 0.12 * r, ey);
      g.stroke();
    } else {
      g.ellipse(ex, ey, 0.1 * r, 0.14 * r, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(ex + 0.03 * r, ey - 0.05 * r, 0.04 * r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b1b2f';
    }
  }
  // nostrils and mouth
  g.fillStyle = dark;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.arc(hx + side * 0.08 * r, hy + 0.2 * r, 0.035 * r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = dark;
  g.lineWidth = 4;
  g.beginPath();
  if (mood === 'panic') {
    g.fillStyle = '#7a2440';
    g.ellipse(hx, hy + 0.45 * r, 0.16 * r, 0.2 * r, 0, 0, Math.PI * 2);
    g.fill();
  } else if (mood === 'taunt') {
    g.arc(hx, hy + 0.35 * r, 0.3 * r, 0.1 * Math.PI, 0.9 * Math.PI);
    g.stroke();
    g.fillStyle = '#ff7a9a';
    g.beginPath();
    g.ellipse(hx, hy + 0.66 * r + 0.03 * r * Math.sin(t * 12), 0.12 * r, 0.14 * r, 0, 0, Math.PI * 2);
    g.fill();
  } else if (mood === 'ouch' || mood === 'dizzy') {
    g.moveTo(hx - 0.25 * r, hy + 0.48 * r);
    for (let i = 1; i <= 4; i++) g.lineTo(hx - 0.25 * r + i * 0.125 * r, hy + 0.48 * r + (i % 2 ? -0.06 : 0.06) * r);
    g.stroke();
  } else {
    g.arc(hx, hy + 0.32 * r, 0.28 * r, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
  // hats
  if (o.hat === 'beanie') {
    g.fillStyle = '#ff5d73';
    g.beginPath();
    g.arc(hx, hy - 0.45 * r, 0.75 * r, Math.PI * 1.05, Math.PI * 1.95);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(hx - 0.78 * r, hy - 0.62 * r, 1.56 * r, 0.24 * r);
    g.beginPath();
    g.arc(hx, hy - 1.25 * r, 0.2 * r, 0, Math.PI * 2);
    g.fill();
  } else if (o.hat === 'propeller') {
    g.fillStyle = '#3fb6ff';
    g.beginPath();
    g.arc(hx, hy - 0.5 * r, 0.7 * r, Math.PI * 1.05, Math.PI * 1.95);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffd23f';
    g.fillRect(hx - 0.05 * r, hy - 1.35 * r, 0.1 * r, 0.25 * r);
    const spin = Math.cos(t * 30);
    g.fillStyle = '#ff5d73';
    g.beginPath();
    g.ellipse(hx, hy - 1.38 * r, 0.75 * r * Math.abs(spin) + 0.05 * r, 0.1 * r, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (mood === 'panic') {
    g.fillStyle = '#7fd3ff';
    for (const side of [-1, 1]) {
      const k = (t * 1.5 + (side > 0 ? 0.5 : 0)) % 1;
      g.beginPath();
      g.ellipse(hx + side * 1.15 * r, hy - 0.4 * r + k * 0.8 * r, 0.09 * r, 0.14 * r, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  return { head: { x: hx, y: hy, r }, hands };
}
