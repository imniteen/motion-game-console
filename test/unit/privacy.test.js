// Nothing leaves this computer: no game code may talk to the network. The page itself also forbids it (the
// server's Content-Security-Policy allows only this site), and the browser tests check that no request goes
// anywhere else. This test catches it earlier: in the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../../src/', import.meta.url).pathname;
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(root);

test('no game code talks to the network', () => {
  const banned = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /RTCPeerConnection/, /EventSource/, /https?:\/\//];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const re of banned) assert.ok(!re.test(src), `${path.relative(root, f)} matches ${re}`);
  }
});

test('the camera is opened for video only, never the microphone', () => {
  const src = fs.readFileSync(path.join(root, 'vision/camera.js'), 'utf8');
  assert.match(src, /audio:\s*false/);
  assert.ok(!files.some((f) => /audio:\s*true/.test(fs.readFileSync(f, 'utf8'))));
});

test('the server only lets the page talk to itself', () => {
  const src = fs.readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8');
  assert.match(src, /connect-src 'self'/);
  assert.match(src, /'127\.0\.0\.1'/, 'the server listens on this computer only');
});
