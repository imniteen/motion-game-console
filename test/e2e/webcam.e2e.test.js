// The real camera path, with a photo of a person (arms out) as a fake webcam: the pose model loads under the
// page's strict "only talk to yourself" security policy, finds the person, and they can claim Player 1.
// Nothing is requested from anywhere but this computer.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findBrowser, startServer, makeFakeWebcam, launch, openConsole, waitFor, wait } from './helpers.js';

const exe = findBrowser();
const photo = new URL('../fixtures/pose.jpg', import.meta.url).pathname;
const skip = !exe
  ? 'no Chrome/Edge found (set BROWSER_PATH)'
  : !fs.existsSync(photo)
    ? 'test photo missing: see test/fixtures/README.md (curl -o test/fixtures/pose.jpg https://storage.googleapis.com/mediapipe-assets/pose.jpg)'
    : false;
let server;
let url;
let webcam;

before(async () => {
  if (skip) return;
  ({ server, url } = await startServer());
  const b = await launch(exe);
  webcam = await makeFakeWebcam(b, photo);
  await b.close();
});
after(() => {
  server?.close();
  if (webcam) fs.rmSync(webcam, { force: true });
});

test('a person on the camera is tracked and claims Player 1 with arms out; nothing leaves the computer', { skip }, async () => {
  const browser = await launch(exe, [`--use-file-for-fake-video-capture=${webcam}`]);
  try {
    const { page, problems, outside } = await openConsole(browser, url);
    await waitFor(page, () => window.__console.ready || window.__console.bootError, 90000);
    const boot = await page.evaluate(() => ({ err: window.__console.bootError, engine: window.__console.source.engine }));
    assert.equal(boot.err, '', 'the camera and tracker started');
    // the model sees the person
    await waitFor(page, () => window.__console.roster.others.length > 0, 60000);
    await page.evaluate(() => {
      const c = window.__console;
      c.go('players');
      c.screen.select(c, 'n1');
    });
    await waitFor(page, () => window.__console.roster.slots[0].state === 'active', 60000);
    const info = await page.evaluate(() => ({ engine: window.__console.source.engine, fps: window.__console.source.fps, sig: window.__console.roster.slots[0].sigConf }));
    console.log('tracking:', JSON.stringify(info));
    await wait(1000);
    assert.deepEqual(outside, [], 'no request left this computer');
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
  }
});
