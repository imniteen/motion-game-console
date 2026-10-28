// What we show is what we detect: every demo animation (moves.js), played through the body tracker, must be
// recognised as that move. The same animations drive the coach, the How-to cards, the bots and mouse mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES } from '../../src/moves.js';
import { synthSkeleton } from '../../src/vision/synth.js';
import { Body } from '../../src/vision/body.js';

/** Plays a move for `secs` at 30 fps and returns everything the body tracker noticed. */
function play(id, secs = 4, warm = 0) {
  const b = new Body();
  const seen = { jumped: 0, flapped: 0, pumped: 0, step: 0, duck: false, armsUp: false, airplane: false, handsHead: false, maxEnergy: 0, minEnergyLate: Infinity };
  // stand still a moment first so the baselines settle
  for (let i = 0; i < 30; i++) b.update(synthSkeleton({ x: 960, hipY: 640, sw: 90 }), i / 30);
  for (let i = 0; i < secs * 30; i++) {
    const t = i / 30;
    const p = MOVES[id].pose(t);
    b.update(synthSkeleton({ x: 960 + (p.dx ?? 0) * 90, hipY: 640, sw: 90, ...p }), 1 + t);
    seen.jumped += +b.events.jumped;
    seen.flapped += +b.events.flapped;
    if (t >= warm) seen.pumped += b.events.pumped.length ? 1 : 0; // moments with a throw (both hands at once is one)
    seen.step += +(b.events.step !== 0);
    seen.duck ||= b.ducking;
    seen.armsUp ||= b.pose.armsUp;
    if (t >= warm) seen.airplane ||= b.pose.airplane;
    seen.handsHead ||= b.pose.handsHead;
    seen.maxEnergy = Math.max(seen.maxEnergy, b.energy);
  }
  return { seen, body: b };
}

test('jump: every hop is one jump', () => {
  const { seen } = play('jump', 4.8);
  assert.ok(seen.jumped >= 3 && seen.jumped <= 4, `jumps: ${seen.jumped}`);
  assert.equal(seen.duck, false, 'the crouch before a jump is not a duck');
});

test('duck is seen as ducking, and is not a jump', () => {
  const { seen } = play('duck');
  assert.equal(seen.duck, true);
  assert.equal(seen.jumped, 0);
});

test('flap: each downstroke is a flap', () => {
  const { seen } = play('flap', 3.5);
  assert.ok(seen.flapped >= 4, `flaps: ${seen.flapped}`);
});

test('throw (arm pump) is seen', () => {
  const { seen } = play('pump', 4);
  assert.ok(seen.pumped >= 2, `pumps: ${seen.pumped}`);
});

test('sidestep is seen as steps', () => {
  const { seen } = play('sidestep', 4.8);
  assert.ok(seen.step >= 2, `steps: ${seen.step}`);
});

test('the three poses and the airplane glide', () => {
  assert.equal(play('armsUp').seen.armsUp, true);
  assert.equal(play('airplane').seen.airplane, true);
  assert.equal(play('glide').seen.airplane, true);
  assert.equal(play('handsHead').seen.handsHead, true);
  assert.equal(play('armsUp').seen.airplane, false, 'arms up is not an airplane');
});

test('dance and wave are lively; freeze ends still', () => {
  assert.ok(play('dance').seen.maxEnergy > 1.5);
  assert.ok(play('wave').seen.maxEnergy > 1.5);
  const { body } = play('freeze', 2.9); // ends 1.4 s into the frozen part
  assert.ok(body.energy < 0.6, `still at the end (energy ${body.energy.toFixed(2)})`);
});

test('every move has words for the coach and an animation', () => {
  for (const m of Object.values(MOVES)) {
    assert.ok(m.tell.length > 5 && m.name && m.icon, m.id);
    assert.equal(typeof m.pose(0.3), 'object');
  }
});

test('posture: standing, a wide stance with one leg out, sitting, lying', async () => {
  const { describe } = await import('../../src/vision/body.js');
  assert.equal(describe(synthSkeleton({ x: 960, hipY: 640, sw: 90 })).posture, 'stand');
  const wide = synthSkeleton({ x: 960, hipY: 640, sw: 90 });
  wide[26] = { x: wide[24].x + 200, y: wide[24].y + 40, v: 0.99 }; // right knee out to the side, almost level
  assert.equal(describe(wide).posture, 'stand');
  assert.equal(describe(synthSkeleton({ x: 960, hipY: 700, sw: 110, seated: true })).posture, 'sit');
  const lying = synthSkeleton({ x: 960, hipY: 640, sw: 90 }).map((p) => ({ x: 960 + (p.y - 640), y: 640 - (p.x - 960) * 0.2, v: p.v }));
  assert.equal(describe(lying).posture, 'lie');
});

test('flapping or dancing is not a throw, and flapping is not an airplane (glide)', () => {
  // (the very first lift of the arms from resting by the sides may count once: that's how a throw starts too)
  const flap = play('flap', 4, 1).seen;
  assert.equal(flap.pumped, 0, 'flaps are not throws');
  assert.equal(flap.airplane, false, 'arms passing level while flapping is not a glide');
  assert.equal(play('dance', 4, 1).seen.pumped, 0, 'dancing is not throwing');
  assert.ok(play('pump', 4).seen.pumped >= 2, 'a real throw still counts');
});

test('loose flapping counts: bent arms, small flaps', () => {
  const b = new Body();
  let flaps = 0;
  for (let i = 0; i < 30; i++) b.update(synthSkeleton({ x: 960, hipY: 640, sw: 90 }), i / 30);
  for (let i = 0; i < 120; i++) {
    const t = i / 30;
    const a = Math.PI / 2 + 0.55 * Math.sin((t / 0.8) * Math.PI * 2); // small flaps around level
    b.update(synthSkeleton({ x: 960, hipY: 640, sw: 90, armL: a, armR: a, bend: 0.6 }), 1 + t);
    flaps += +b.events.flapped;
  }
  assert.ok(flaps >= 4, `bent, small flaps: ${flaps}`);
});

test('arms up and arms out still count with bent elbows', async () => {
  const { describe } = await import('../../src/vision/body.js');
  const goalpost = describe(synthSkeleton({ x: 960, hipY: 640, sw: 90, armL: Math.PI / 2, armR: Math.PI / 2, bend: 1 })).pose;
  assert.equal(goalpost.armsUp, true, 'elbows out, forearms up ("goalpost") is arms up');
  const loose = describe(synthSkeleton({ x: 960, hipY: 640, sw: 90, armL: 1.4, armR: 1.4, bend: 0.3 })).pose;
  assert.equal(loose.airplane, true, 'arms out, a bit low and bent, is still an airplane');
});

test('new exercise moves are recognised: arm circles, high knees, star jumps, squats', () => {
  const circle = play('circle', 4.8);
  assert.ok(circle.body.counts.circles >= 6, `circles (both arms): ${circle.body.counts.circles}`);
  const run = play('run', 4);
  assert.ok(run.body.counts.knees >= 8, `knee lifts: ${run.body.counts.knees}`);
  assert.equal(run.body.counts.jumps, 0, 'running on the spot is not jumping');
  const jacks = play('jacks', 4);
  assert.ok(jacks.body.counts.jacks >= 3, `star jumps: ${jacks.body.counts.jacks}`);
  const squat = play('squat', 4.2);
  assert.ok(squat.body.counts.squats >= 2, `squats: ${squat.body.counts.squats}`);
});
