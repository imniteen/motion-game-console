// The locked roster: a kid's slot is never given to someone else. These scenarios are the classic failure of
// naive player tracking (a grown-up sitting nearby takes over a player whenever the model misses the kid for a
// moment).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Roster, TUNING, solve } from '../../src/vision/roster.js';
import { synthSkeleton, synthSig, POSES } from '../../src/vision/synth.js';

const FPS = 30;
const kid = (x, o = {}) => ({ px: synthSkeleton({ x, hipY: 640, sw: 90, ...POSES.stand, ...o }), sig: o.sig === undefined ? synthSig(0) : o.sig, who: 'kid' });
const sofaAdult = (x, o = {}) => ({ px: synthSkeleton({ x, hipY: 720, sw: 120, seated: true }), sig: o.sig === undefined ? synthSig(8) : o.sig, who: 'adult' });

/** Claim slot 1 with the given body by holding arms out in its zone. Returns the time after the claim. */
function claim(roster, body, t = 0, n = 1) {
  roster.openClaim();
  let events = [];
  for (let i = 0; i <= FPS * (TUNING.claimHold + 0.2); i++, t += 1 / FPS) {
    events = events.concat(roster.update([{ ...body, px: synthSkeleton({ x: body.x, hipY: 640, sw: 90, ...POSES.airplane }) }, ...(body.extra ?? [])], t));
  }
  roster.closeClaim();
  assert.ok(events.some((e) => e.type === 'claim' && e.n === n), 'claimed');
  return t;
}

test('claiming: arms out in your zone for 1.5 s makes you the player; standing there is not enough', () => {
  const r = new Roster();
  r.setup(2);
  r.openClaim();
  let t = 0;
  for (let i = 0; i < FPS * 3; i++, t += 1 / FPS) r.update([kid(r.slots[0].zone.x0 + 100)], t);
  assert.equal(r.slots[0].state, 'empty', 'just standing does not claim');
  for (let i = 0; i < FPS * 1.4; i++, t += 1 / FPS) r.update([kid(r.slots[0].zone.x0 + 100, POSES.airplane)], t);
  assert.equal(r.slots[0].state, 'empty', 'not yet');
  assert.ok(r.holdProgress(1).progress > 0.8);
  for (let i = 0; i < 6; i++, t += 1 / FPS) r.update([kid(r.slots[0].zone.x0 + 100, POSES.airplane)], t);
  assert.equal(r.slots[0].state, 'active');
  assert.equal(r.slots[1].state, 'empty');
});

test('a seated grown-up can never claim a slot, even with arms out', () => {
  const r = new Roster();
  r.setup(1);
  r.openClaim();
  let t = 0;
  for (let i = 0; i < FPS * 3; i++, t += 1 / FPS) r.update([{ px: synthSkeleton({ x: 960, hipY: 720, sw: 120, seated: true, ...POSES.airplane }), sig: synthSig(8) }], t);
  assert.equal(r.slots[0].state, 'empty');
});

for (const dark of [false, true]) {
  const sig = dark ? (n) => synthSig(n, n, 0.15) : (n) => synthSig(n);
  const label = dark ? ' (dim room, dark clothes: colours useless)' : '';

  test(`the kid drops out for 10 frames next to a seated grown-up: the grown-up never gets the slot${label}`, () => {
    const r = new Roster();
    r.setup(1);
    const adult = (t) => ({ ...sofaAdult(1010), sig: sig(8) });
    let t = claim(r, { x: 900, sig: sig(0), extra: [adult(0)] });
    const s = r.slots[0];
    for (let f = 0; f < 60; f++, t += 1 / FPS) {
      const missing = f >= 30 && f < 40;
      const bodies = missing ? [adult(t)] : [{ ...kid(900), sig: sig(0) }, adult(t)];
      r.update(bodies, t);
      if (missing) assert.notEqual(s.state, 'active', 'no body drove the slot while the kid was missing');
      assert.ok(Math.abs(s.pos.x - 900) < 30, `slot stayed with the kid (x ${s.pos.x.toFixed(0)})`);
    }
    assert.equal(s.state, 'active', 'the kid is back in their own slot');
  });

  test(`the kid is gone for 2 s: the slot waits (lost), the grown-up is not taken; the kid comes back${label}`, () => {
    const r = new Roster();
    r.setup(1);
    let t = claim(r, { x: 900, sig: sig(0), extra: [{ ...sofaAdult(1010), sig: sig(8) }] });
    const s = r.slots[0];
    for (let f = 0; f < 60; f++, t += 1 / FPS) r.update([{ ...sofaAdult(1010), sig: sig(8) }], t);
    assert.equal(s.state, 'lost');
    assert.ok(Math.abs(s.pos.x - 900) < 30);
    // the kid walks back in (a bit to the side)
    for (let f = 0; f < 15; f++, t += 1 / FPS) r.update([{ ...kid(860), sig: sig(0) }, { ...sofaAdult(1010), sig: sig(8) }], t);
    // with useful colours: recognised by clothes; without: the only person who just walked in, at the kid's size
    assert.equal(s.state, 'active', 'the kid is back');
  });
}

test('dim room: two people walk in while a kid is lost: no guessing, arms out in the zone takes the slot back', () => {
  const sig = (n) => synthSig(n, n, 0.15);
  const r = new Roster();
  r.setup(1);
  let t = claim(r, { x: 900, sig: sig(0) });
  const s = r.slots[0];
  for (let f = 0; f < 40; f++, t += 1 / FPS) r.update([], t);
  assert.equal(s.state, 'lost');
  for (let f = 0; f < 30; f++, t += 1 / FPS) r.update([{ ...kid(700), sig: sig(0) }, { ...kid(1300), sig: sig(3) }], t);
  assert.equal(s.state, 'lost', 'two could be the kid: wait');
  for (let f = 0; f < FPS * 1.2; f++, t += 1 / FPS) r.update([{ ...kid(700, POSES.airplane), sig: sig(0) }, { ...kid(1300), sig: sig(3) }], t);
  assert.equal(s.state, 'active', 'arms out in the zone takes it back');
  assert.ok(Math.abs(s.pos.x - 700) < 30);
});

test('a standing stranger in different clothes walking into a lost kid\'s place is not taken for the kid', () => {
  const r = new Roster();
  r.setup(1);
  let t = claim(r, { x: 900, sig: synthSig(0) });
  const s = r.slots[0];
  for (let f = 0; f < 40; f++, t += 1 / FPS) r.update([], t);
  assert.equal(s.state, 'lost');
  for (let f = 0; f < 60; f++, t += 1 / FPS) r.update([{ ...kid(900 + f), sig: synthSig(6) }], t);
  assert.equal(s.state, 'lost');
});

test('two kids crossing (one missed for 3 frames at the crossing) never swap slots', () => {
  const r = new Roster();
  r.setup(2);
  let t = 0;
  r.openClaim();
  const za = r.slots[0].zone;
  const zb = r.slots[1].zone;
  const A = (x, o = {}) => ({ ...kid(x, o), sig: synthSig(0) });
  const B = (x, o = {}) => ({ ...kid(x, o), sig: synthSig(6) });
  for (let i = 0; i < FPS * 1.8; i++, t += 1 / FPS) r.update([A((za.x0 + za.x1) / 2, POSES.airplane), B((zb.x0 + zb.x1) / 2, POSES.airplane)], t);
  r.closeClaim();
  assert.ok(r.slots.every((s) => s.state === 'active'));
  const x0 = (za.x0 + za.x1) / 2;
  const x1 = (zb.x0 + zb.x1) / 2;
  const steps = FPS * 2;
  for (let f = 0; f <= steps; f++, t += 1 / FPS) {
    const k = f / steps;
    const ax = x0 + (x1 - x0) * k;
    const bx = x1 + (x0 - x1) * k;
    const crossing = Math.abs(ax - bx) < 60 && f % 2 === 0;
    r.update(crossing ? [A(ax)] : [A(ax), B(bx)], t);
  }
  for (let f = 0; f < 10; f++, t += 1 / FPS) r.update([A(x1), B(x0)], t);
  assert.ok(Math.abs(r.slots[0].pos.x - x1) < 40, 'player 1 followed kid A across');
  assert.ok(Math.abs(r.slots[1].pos.x - x0) < 40, 'player 2 followed kid B across');
});

test('a body cut off by the edge of the picture far from the kid is never matched', () => {
  const r = new Roster();
  r.setup(1);
  let t = claim(r, { x: 600, sig: synthSig(0) });
  const s = r.slots[0];
  const edge = { px: synthSkeleton({ x: 20, hipY: 640, sw: 90 }), sig: synthSig(0) };
  for (let f = 0; f < 30; f++, t += 1 / FPS) {
    r.update([edge], t);
    assert.ok(Math.abs(s.pos.x - 600) < 30);
  }
});

test('add player: a second kid claims slot 2 while player 1 keeps playing', () => {
  const r = new Roster();
  r.setup(1);
  let t = claim(r, { x: 960, sig: synthSig(0) });
  r.resize(2);
  assert.equal(r.slots[0].state, 'active', 'player 1 kept');
  r.openClaim();
  const z2 = r.slots[1].zone;
  const x2 = (z2.x0 + z2.x1) / 2;
  const x1 = (r.slots[0].zone.x0 + r.slots[0].zone.x1) / 2;
  // player 1 walks into their new zone while player 2 claims
  for (let f = 0; f < FPS * 2; f++, t += 1 / FPS) {
    const p1x = 960 + (x1 - 960) * Math.min(1, f / FPS);
    r.update([{ ...kid(p1x), sig: synthSig(0) }, { ...kid(x2, POSES.airplane), sig: synthSig(6) }], t);
  }
  assert.equal(r.slots[1].state, 'active');
  assert.ok(Math.abs(r.slots[0].pos.x - x1) < 40, 'player 1 is still player 1');
});

test('matching is an exact best total, not greedy', () => {
  // greedy would give row 0 column 0 (cost 1) and leave row 1 with nothing; the best total swaps them
  assert.deepEqual(solve([[1, 1.2], [1.1, 9]], 2.5), [1, 0]);
  assert.deepEqual(solve([[Infinity], [0.5]], 2.5), [-1, 0]);
});

test('a grown-up lying on the sofa in the middle of the picture never takes the player\'s slot (dim room, dark clothes, often only one body found)', () => {
  // the grown-up lies across the sofa: a standing skeleton turned on its side
  const lying = () => synthSkeleton({ x: 960, hipY: 640, sw: 110 }).map((p) => ({ x: 960 + (p.y - 640), y: 760 - (p.x - 960) * 0.3, v: p.v }));
  const r = new Roster();
  r.setup(1);
  let t = 0;
  r.forceClaim(1, { px: synthSkeleton({ x: 960, hipY: 640, sw: 90 }), sig: null }, t);
  const s = r.slots[0];
  const hist = [];
  let followed = 0;
  const frames = FPS * 20;
  for (let f = 0; f < frames; f++) {
    t += 1 / FPS;
    // the kid walks back and forth right past the sofa, dodging
    const x = 960 + 520 * Math.sin((f / FPS) * 0.9);
    const kidBody = { px: synthSkeleton({ x, hipY: 640, sw: 90 }), sig: null };
    const sofa = { px: lying(), sig: null };
    // the model often finds only one of the two
    const k = f % 7;
    const bodies = k < 3 ? [kidBody, sofa] : k < 5 ? [sofa] : [kidBody];
    r.update(bodies, t);
    if (s.state === 'active') {
      followed++;
      hist.push({ t, y: s.pos.y, x: s.pos.x, sz: s.s, posture: s.body.desc.posture, kidX: x, seen: bodies.includes(kidBody) });
    }
  }
  assert.ok(followed > frames * 0.5, `the player was followed most of the time (${followed}/${frames})`);
  for (let i = 1; i < hist.length; i++) {
    const a = hist[i - 1];
    const b = hist[i];
    if (b.t - a.t > 0.25) continue;
    assert.ok(Math.abs(b.y - a.y) < 1.5 * a.sz, `the slot jumped ${(Math.abs(b.y - a.y) / a.sz).toFixed(2)} body sizes at t=${b.t.toFixed(2)}`);
  }
  assert.ok(hist.every((h) => h.posture !== 'lie'), 'never drove the slot with the lying body');
  assert.ok(hist.filter((h) => h.seen).every((h) => Math.abs(h.x - h.kidX) < 60), 'whenever the kid was seen, the slot was on the kid');
});

test('a kid squatting down (looks like sitting) and missed for a moment while down keeps their slot', () => {
  const r = new Roster();
  r.setup(1);
  let t = claim(r, { x: 900, sig: synthSig(0), extra: [{ ...sofaAdult(1300), sig: synthSig(8) }] });
  const s = r.slots[0];
  // down into a deep squat over half a second
  for (let f = 0; f <= 15; f++, t += 1 / FPS) r.update([{ ...kid(900, { duck: f / 15 }), sig: synthSig(0) }, { ...sofaAdult(1300), sig: synthSig(8) }], t);
  assert.equal(s.body.desc.posture, 'sit', 'a deep squat looks like sitting');
  // missed for 8 frames while down
  for (let f = 0; f < 8; f++, t += 1 / FPS) r.update([{ ...sofaAdult(1300), sig: synthSig(8) }], t);
  for (let f = 0; f < 5; f++, t += 1 / FPS) r.update([{ ...kid(900, { duck: 1 }), sig: synthSig(0) }, { ...sofaAdult(1300), sig: synthSig(8) }], t);
  assert.equal(s.state, 'active', 'found again, still squatting');
  assert.ok(Math.abs(s.pos.x - 900) < 30, 'and it is the kid, not the grown-up');
});
