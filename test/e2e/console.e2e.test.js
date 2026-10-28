// The whole console in mouse mode (no camera): start, choose players, claim a spot, pick a game, play, pause
// (the clock stops), add a second player mid-game (the first keeps their score), and quit. No errors, and
// nothing requested from anywhere but this computer.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { findBrowser, startServer, launch, openConsole, wait, state } from './helpers.js';

const exe = findBrowser();
const skip = exe ? false : 'no Chrome/Edge found (set BROWSER_PATH)';
let server;
let url;
before(async () => {
  if (!skip) ({ server, url } = await startServer());
});
after(() => server?.close());

const key = (page, k, type = 'keydown') => page.evaluate((k, type) => window.dispatchEvent(new KeyboardEvent(type, { key: k })), k, type);
async function holdArmsOut(page, ms = 1900) {
  await key(page, 'a');
  await wait(ms);
  await key(page, 'a', 'keyup');
}

/** Waits for a condition in the page; on timeout, says which step and where the console was. */
async function until(page, what, fn, timeout = 15000) {
  try {
    await page.waitForFunction(fn, { timeout, polling: 100 });
  } catch (err) {
    const where = await page.evaluate(() => ({ state: window.__console.state, slots: window.__console.roster.slots.map((s) => s.state) }));
    throw new Error(`stuck waiting for ${what}: ${JSON.stringify(where)}`);
  }
}

test('the full console flow in mouse mode, with a second player joining mid-game', { skip }, async () => {
  const browser = await launch(exe);
  try {
    const { page, problems, outside } = await openConsole(browser, `${url}?mouse&bots=1`);
    await until(page, 'ready', () => window.__console.ready);
    await page.evaluate(() => (window.__console.source.botX[0] = -500)); // the second kid is out of the room for now
    await wait(700); // a screen ignores presses for its first moment (no double presses)
    await key(page, 'Enter');
    await until(page, 'home', () => window.__console.state === 'home');
    await wait(700);
    await key(page, 'ArrowRight'); // from Workout to Free play
    await key(page, 'Enter'); // Free play -> nobody yet -> players
    await until(page, 'players', () => window.__console.state === 'players');
    await wait(700);
    await key(page, 'Enter'); // 1 player
    await until(page, 'claim', () => window.__console.state === 'claim');
    await page.evaluate(() => (window.__console.source.x = 700));
    await holdArmsOut(page);
    await until(page, 'player 1 claimed', () => window.__console.roster.slots[0].state === 'active');
    await until(page, 'game picker', () => window.__console.state === 'games');
    await page.evaluate(() => window.__console.screen.select(window.__console, 'game:surf-hop'));
    assert.equal(await state(page), 'howto');
    await wait(700);
    await key(page, 'Enter'); // Let's go!
    await until(page, 'play', () => window.__console.state === 'play');
    await wait(1500);
    const t1 = await page.evaluate(() => window.__console.host.t);
    assert.ok(t1 > 1, 'the round clock runs');

    await key(page, 'p');
    await until(page, 'pause', () => window.__console.state === 'pause');
    const tp = await page.evaluate(() => window.__console.host.t);
    await wait(1500);
    assert.equal(await page.evaluate(() => window.__console.host.t), tp, 'the clock stops while paused');

    // Add a player: the second kid walks into the new spot and holds arms out; player 1 keeps their place
    await page.evaluate(() => window.__console.host.scores.set(1, 7));
    await page.evaluate(() => window.__console.screen.select(window.__console, 'add'));
    await until(page, 'claim for player 2', () => window.__console.state === 'claim' && window.__console.roster.slots.length === 2);
    await page.evaluate(() => {
      const c = window.__console;
      const z = c.roster.slots[1].zone;
      c.source.botX[0] = (z.x0 + z.x1) / 2;
      const z1 = c.roster.slots[0].zone;
      c.source.x = (z1.x0 + z1.x1) / 2;
    });
    await wait(800);
    await holdArmsOut(page);
    await until(page, 'player 2 claimed', () => window.__console.roster.slots[1].state === 'active');
    await until(page, 'back to play', () => window.__console.state === 'play');
    const later = await page.evaluate(() => ({ scores: [...window.__console.host.scores], t: window.__console.host.t }));
    assert.deepEqual(later.scores.map(([n]) => n), [1, 2], 'both players are in the round');
    assert.ok(later.scores[0][1] >= 7, 'player 1 kept their score');
    assert.ok(Math.abs(later.t - tp) < 2, 'the round carried on from where it was paused');

    await key(page, 'p');
    await until(page, 'pause again', () => window.__console.state === 'pause');
    await page.evaluate(() => window.__console.screen.select(window.__console, 'quit'));
    assert.equal(await state(page), 'games');

    // a whole (fast-forwarded) workout: five games in a row, then the summary
    await page.evaluate(() => {
      const c = window.__console;
      c.go('home');
    });
    await wait(700);
    await page.evaluate(() => window.__console.screen.select(window.__console, 'workout'));
    for (let i = 0; i < 5; i++) {
      await until(page, `workout game ${i + 1}`, () => window.__console.state === 'howto');
      await page.evaluate(() => window.__console.screen.select(window.__console, 'go'));
      await until(page, 'play', () => window.__console.state === 'play');
      await page.evaluate(() => (window.__console.host.clock.t = window.__console.settings.roundSec - 0.2));
      await until(page, 'results', () => window.__console.state === 'results');
      await page.evaluate(() => window.__console.screen.select(window.__console, 'wnext'));
    }
    await until(page, 'workout summary', () => window.__console.state === 'summary');
    assert.deepEqual(problems, []);
    assert.deepEqual(outside, [], 'nothing requested from outside this computer');
  } finally {
    await browser.close();
  }
});
