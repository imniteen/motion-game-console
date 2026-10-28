// motion-console: wires the camera (or mouse), the locked roster, the screens and the game loop together.
import { Roster } from './vision/roster.js';
import { PoseSource } from './vision/pose.js';
import { MouseSource } from './vision/mouse.js';
import { listCameras, savedCamera, saveCamera } from './vision/camera.js';
import { OneEuro } from './vision/smooth.js';
import { LM } from './vision/landmarks.js';
import { startLoop } from './engine/clock.js';
import { loadSettings, loadBest } from './engine/settings.js';
import { unlock, setVolumes, music } from './engine/audio.js';
import { setVoiceEnabled, hush, speaking } from './engine/speech.js';
import { Menu } from './ui/menu.js';
import { SCREENS, drawHandCursor } from './ui/screens.js';
import { W, H, text } from './ui/theme.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('screen'));
const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const video = /** @type {HTMLVideoElement} */ (document.getElementById('camera'));
const params = new URLSearchParams(location.search);

const app = {
  canvas,
  g,
  video,
  settings: loadSettings(),
  best: loadBest(),
  roster: new Roster({ W, H }),
  /** @type {any} */ source: null,
  mouseMode: false,
  menu: new Menu(),
  state: 'boot',
  screen: SCREENS.boot,
  stateAt: 0,
  now: 0,
  ready: false,
  bootStatus: 'Starting the camera...',
  bootError: '',
  /** @type {any} */ game: null,
  /** @type {any} */ host: null,
  page: 0,
  rosterEvents: [],
  pendingEvents: [],
  cursor: null,
  keys: [],
  pointer: null,
  debug: params.has('debug'),
  cameraName: '',

  go(name, arg) {
    const next = SCREENS[name];
    if (!next) return;
    this.state = name;
    this.screen = next;
    this.stateAt = this.now;
    this.menu.reset();
    next.enter?.(this, arg);
  },

  applySettings() {
    setVolumes({ music: this.settings.music, sfx: this.settings.sfx });
    setVoiceEnabled(this.settings.voice);
  },

  async startCamera() {
    this.bootError = '';
    this.ready = false;
    this.bootStatus = 'Starting the camera... (allow it when the browser asks)';
    try {
      const src = new PoseSource({
        video,
        onPeople: (dets, t) => this.people(dets, t),
        onCameraChanged: () => this.roster.cameraChanged(),
      });
      this.source = src;
      const watch = setInterval(() => {
        if (src.status === 'model') this.bootStatus = 'Loading the body tracker...';
      }, 200);
      await src.start(savedCamera());
      clearInterval(watch);
      this.cameraName = (await listCameras()).find((c) => c.deviceId === src.stream?.getVideoTracks()[0]?.getSettings().deviceId)?.label ?? 'Camera';
      this.ready = true;
    } catch (err) {
      const name = /** @type {any} */ (err)?.name;
      this.bootError =
        name === 'NotAllowedError' ? 'The camera is blocked. Allow it in the address bar, or play with the mouse.' : name === 'NotFoundError' ? 'No camera found. Plug one in, or play with the mouse.' : `The camera didn't start (${/** @type {any} */ (err)?.message ?? err}).`;
    }
  },

  useMouse() {
    this.source?.stopEngine?.();
    this.mouseMode = true;
    this.source = new MouseSource(canvas, (dets, t) => this.people(dets, t), { bots: Number(params.get('bots') ?? 0) });
    this.source.start();
    this.bootError = '';
    this.ready = true;
  },

  async nextCamera() {
    if (this.mouseMode || !this.source) return;
    const cams = await listCameras();
    if (cams.length < 2) return;
    const cur = this.source.stream?.getVideoTracks()[0]?.getSettings().deviceId;
    const i = cams.findIndex((c) => c.deviceId === cur);
    const next = cams[(i + 1) % cams.length];
    saveCamera(next.deviceId);
    this.cameraName = next.label || 'Camera';
    await this.source.reopen(next.deviceId);
  },

  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  },

  /** A tracked frame arrived: who is who. */
  people(dets, t) {
    this.pendingEvents.push(...this.roster.update(dets, t));
  },
};

// ------------------------------------------------------------------ input
const KEYMAP = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down', enter: 'ok', ' ': 'ok', escape: 'back', backspace: 'back' };
window.addEventListener('keydown', (e) => {
  unlock();
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) {
    e.preventDefault();
    app.keys.push(KEYMAP[k]);
  } else if (k === 'p' && app.state === 'play') app.go('pause');
  else if (k === 'f' && !app.mouseMode) app.fullscreen();
  else if (k === '`') app.debug = !app.debug;
});
const toCanvas = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
};
canvas.addEventListener('pointermove', (e) => (app.pointer = { ...toCanvas(e), clicked: false }));
canvas.addEventListener('pointerdown', (e) => {
  unlock();
  app.pointer = { ...toCanvas(e), clicked: true };
  app.screen.click?.(app, app.pointer);
});

// ------------------------------------------------------------------ hand cursor
// A kid points by raising a hand; the cursor follows the hand relative to their own shoulder (no walking
// needed to reach the corners of the screen). After players are chosen, only players can point.
const fx = new OneEuro(0.9, 0.004);
const fy = new OneEuro(0.9, 0.004);
let cursorOwner = null;
function handCursor(t) {
  if (app.mouseMode || ['play', 'countdown'].includes(app.state)) return null;
  const bodies = app.roster.players.length ? app.roster.active.map((s) => ({ px: s.px, n: s.n })) : app.roster.others.map((d) => ({ px: d.px, n: 1 }));
  let best = null;
  for (const b of bodies) {
    if (!b.px) continue;
    const px = b.px;
    const shL = px[LM.shL];
    const shR = px[LM.shR];
    const hip = (px[LM.hipL].y + px[LM.hipR].y) / 2;
    const s = Math.max(30, Math.hypot(shL.x - shR.x, shL.y - shR.y));
    for (const [wi, sh] of [
      [LM.wrL, shL],
      [LM.wrR, shR],
    ]) {
      const w = px[wi];
      if (w.v < 0.5 || w.y > hip - 0.3 * s) continue; // the hand has to be raised
      const reach = Math.hypot(w.x - sh.x, w.y - sh.y) / s;
      const score = reach + (b.n === cursorOwner ? 0.5 : 0);
      if (!best || score > best.score) best = { score, x: W / 2 + ((w.x - sh.x) / (1.5 * s)) * (W / 2), y: H / 2 + ((w.y - (sh.y - 0.2 * s)) / (1.2 * s)) * (H / 2), n: b.n };
    }
  }
  if (!best) {
    cursorOwner = null;
    fx.reset();
    fy.reset();
    return null;
  }
  cursorOwner = best.n;
  return { x: Math.max(30, Math.min(W - 30, fx.filter(best.x, t))), y: Math.max(30, Math.min(H - 30, fy.filter(best.y, t))), n: best.n };
}

// ------------------------------------------------------------------ loop
function update(dt) {
  app.now += dt;
  app.rosterEvents = app.pendingEvents;
  app.pendingEvents = [];
  app.cursor = handCursor(app.now);
  const sc = app.screen;
  sc.update?.(app, dt);
  if (app.screen !== sc) return; // the screen changed itself
  const keys = app.keys;
  app.keys = [];
  if (keys.includes('back') && sc.back) {
    sc.back(app);
    return;
  }
  if (sc.buttons) {
    const picked = app.menu.update(dt, sc.buttons(app), { cursor: app.cursor, pointer: app.pointer, keys, now: app.now });
    if (app.pointer) app.pointer.clicked = false;
    if (picked) sc.select(app, picked);
  } else if (keys.includes('ok') && sc.select) sc.select(app, 'ok');
  if (app.pointer) app.pointer.clicked = false;
}

function draw() {
  const now = app.now;
  app.screen.draw(app, g, now);
  if (app.state !== 'play' && app.state !== 'countdown') drawHandCursor(app, g);
  const inGame = ['play', 'countdown', 'pause'].includes(app.state);
  music(app.state === 'boot' ? null : inGame ? app.game.id : app.state === 'results' ? 'results' : 'menu', speaking() || app.state === 'pause');
  if (app.debug) {
    const s = app.source;
    const lines = [
      `${app.state}  tracker: ${s?.engine ?? '-'} ${s?.model ?? ''}  ${s?.fps ?? 0} fps  ${Math.round(s?.roundTrip ?? 0)} ms`,
      `slots: ${app.roster.slots.map((sl) => `${sl.n}:${sl.state}`).join(' ')}  others: ${app.roster.others.length}  bystanders: ${app.roster.tracks.length}`,
    ];
    lines.forEach((l, i) => text(g, l, 20, H - 60 + i * 30, { size: 22, align: 'left', weight: 600 }));
  }
}

app.applySettings();
startLoop(update, draw);
app.go('boot');
if (params.has('mouse')) app.useMouse();
else app.startCamera();
if (params.has('skip')) {
  // tests and development: straight to the game picker with one player
  const wait = setInterval(() => {
    if (!app.ready) return;
    clearInterval(wait);
    app.go('home');
  }, 50);
}
window.addEventListener('visibilitychange', () => {
  if (document.hidden && app.state === 'play') app.go('pause');
  if (document.hidden) hush();
});

/** For tests and debugging. */
window.__console = app;
