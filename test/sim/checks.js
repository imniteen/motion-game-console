// The checks every game must pass (used by test/unit/games.test.js for all games, and by
// `node --test test/sim/check-game.test.js` with GAME=src/games/<id>.js for one game while writing it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES } from '../../src/moves.js';
import { checkGame } from '../../src/games/kit.js';
import { runRound } from './harness.js';

export function gameChecks(def) {
  test(`${def.id}: the definition is complete`, () => {
    assert.deepEqual(checkGame(def, MOVES), []);
  });

  test(`${def.id}: a player who stands still gets help from the coach and scores little`, () => {
    const { host } = runRound(def, { policy: 'idle', roundSec: 60, drawEvery: 7 });
    assert.ok(host.coach.shown >= 1, 'the coach stepped in');
    const [r] = host.results();
    assert.ok(r.stars === 0, `standing still should not earn stars (score ${r.score})`);
  });

  test(`${def.id}: a player who plays well earns a star, and the round lasts exactly its length`, () => {
    const { host } = runRound(def, { policy: 'bot', roundSec: 120, drawEvery: 30 });
    const [r] = host.results();
    assert.ok(r.stars >= 1, `score ${r.score} (1 star at ${def.stars[0]})`);
    if (!host.ended || host.ended.reason === 'time') assert.ok(Math.abs(host.t - 120) < 0.05, `round lasted ${host.t}`);
  });

  test(`${def.id}: in a short 45-second round a good player still earns a star`, () => {
    const { host } = runRound(def, { policy: 'bot', roundSec: 45 });
    const [r] = host.results();
    assert.ok(r.stars >= 1, `score ${r.score} in 45 s (1 star at ${(def.stars[0] * 45) / 120})`);
  });

  test(`${def.id}: three players all get to score`, () => {
    const { host } = runRound(def, { policy: 'bot', players: 3, roundSec: 90 });
    for (const r of host.results()) assert.ok(r.score > 0, `player ${r.n} scored ${r.score}`);
  });

  test(`${def.id}: four players doing random things, coming and going, never break it`, () => {
    for (const difficulty of ['easy', 'hard', 'auto']) {
      const { host } = runRound(def, { policy: 'random', players: 4, roundSec: 60, comeAndGo: true, drawEvery: 5, difficulty, seed: difficulty.length });
      for (const r of host.results()) assert.ok(Number.isFinite(r.score));
    }
  });

  test(`${def.id}: gets harder over the round`, () => {
    const { host } = runRound(def, { policy: 'bot', roundSec: 60, maxSecs: 5 });
    const early = host.level();
    host.clock.t = 59;
    assert.ok(host.level() > early, 'level() rises with the round');
  });
}
