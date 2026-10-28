// Every game, played headlessly with pretend players through the real tracking and game host (see
// test/sim/checks.js for what each game must do).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/games/index.js';
import { gameChecks } from '../sim/checks.js';

test('game ids are unique', () => {
  const ids = GAMES.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const def of GAMES) gameChecks(def);
