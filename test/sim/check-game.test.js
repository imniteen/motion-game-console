// Checks one game file while writing it:  GAME=src/games/volcano-escape.js node --test test/sim/check-game.test.js
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gameChecks } from './checks.js';

const file = process.env.GAME;
if (file) {
  const def = (await import(pathToFileURL(path.resolve(file)).href)).default;
  gameChecks(def);
}
