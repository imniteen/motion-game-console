// The final rush: the last 15 seconds of a round (a third of a short one) are faster and harder, announced once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/games/index.js';
import { runRound } from '../sim/harness.js';
import { RUSH } from '../../src/engine/host.js';

test('the last 15 seconds of a 45-second round are harder, announced once', () => {
  const { host } = runRound(GAMES[0], { policy: 'idle', roundSec: 45, maxSecs: 0.1 });
  let rushes = 0;
  host.onRush = () => rushes++;
  const step = () => host.step(1 / 60, []);
  while (host.t < 29.5) step();
  const before = host.level();
  assert.equal(host.rushK(), 0, 'no rush before the last 15 s');
  while (host.t < 32) step();
  assert.ok(host.rushK() === 1 && host.rushAt >= 29.9 && host.rushAt < 30.1, `the rush starts 15 s before the end (at ${host.rushAt})`);
  assert.ok(host.level() >= before * (1 + RUSH.boost * 0.9), `level ${before.toFixed(2)} -> ${host.level().toFixed(2)}`);
  while (!host.ended) step();
  assert.equal(rushes, 1, 'announced once');
});

test('a short 30-second round rushes for its last 10 seconds', () => {
  const { host } = runRound(GAMES[0], { policy: 'idle', roundSec: 30, maxSecs: 0.1 });
  assert.equal(host.rushSec, 10);
});
