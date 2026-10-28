// Helpers for the browser tests: a local server, a real Chrome/Edge, and a fake webcam made from a photo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from '../../server.mjs';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chrome or Edge on this machine (BROWSER_PATH overrides), or null. */
export function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

export async function startServer() {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://localhost:${server.address().port}/` };
}

/**
 * Chrome can play a .y4m video file as a fake webcam. This turns a photo into a short looping one: the browser
 * decodes and letterboxes the photo onto a grey frame, then each frame is written as Y (brightness) at full
 * size and U, V (colour) averaged over 2x2 pixel blocks (the 4:2:0 layout the format expects).
 */
export async function makeFakeWebcam(browser, photoPath, width = 640, height = 480) {
  const page = await browser.newPage();
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(photoPath).toString('base64')}`;
  const pixels = await page.evaluate(
    async ({ dataUrl, width, height }) => {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgb(128,128,128)';
      ctx.fillRect(0, 0, width, height);
      const k = Math.min(width / bitmap.width, height / bitmap.height);
      const w = bitmap.width * k;
      const h = bitmap.height * k;
      ctx.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
      return [...ctx.getImageData(0, 0, width, height).data];
    },
    { dataUrl, width, height },
  );
  await page.close();

  const byte = (v) => Math.round(Math.min(255, Math.max(0, v)));
  const rgbAt = (x, y) => {
    const o = (y * width + x) * 4;
    return [pixels[o], pixels[o + 1], pixels[o + 2]];
  };
  const luma = Buffer.alloc(width * height);
  const cb = Buffer.alloc((width * height) / 4);
  const cr = Buffer.alloc((width * height) / 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbAt(x, y);
      luma[y * width + x] = byte(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const p = rgbAt(x + dx, y + dy);
        r += p[0] / 4;
        g += p[1] / 4;
        b += p[2] / 4;
      }
      const i = (y / 2) * (width / 2) + x / 2;
      cb[i] = byte(128 + (-0.1687 * r - 0.3313 * g + 0.5 * b));
      cr[i] = byte(128 + (0.5 * r - 0.4187 * g - 0.0813 * b));
    }
  }
  const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, cb, cr]);
  const file = path.join(os.tmpdir(), `motion-console-webcam-${process.pid}.y4m`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`), ...Array(30).fill(frame)]));
  return file;
}

export function launch(executablePath, extraArgs = []) {
  return puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', ...extraArgs],
    defaultViewport: { width: 1280, height: 720 },
  });
}

/**
 * Opens the console, recording page errors, console errors and every request that leaves this server.
 * @returns {Promise<{ page: import('puppeteer-core').Page, problems: string[], outside: string[] }>}
 */
export async function openConsole(browser, url) {
  const page = await browser.newPage();
  const problems = [];
  const outside = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text()}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(new URL(url).origin) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u);
  });
  await page.goto(url, { waitUntil: 'load' });
  return { page, problems, outside };
}

export const state = (page) => page.evaluate(() => window.__console.state);
export const waitFor = (page, fn, timeout = 30000, arg) => page.waitForFunction(fn, { timeout, polling: 100 }, arg);
