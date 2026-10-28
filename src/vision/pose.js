// The camera + pose model, delivering the bodies in each camera frame as detections in screen px.
// Tracking runs in a worker so drawing stays smooth; if the worker can't use the graphics card (some Macs and
// browsers), the model runs on the main thread with the graphics card instead, which is faster than the
// worker on the processor. Heals itself: a lost camera is reopened, a tracker that stops answering restarts.
import { openCamera, coverMap } from './camera.js';

const here = new URL('./', import.meta.url).href;

export class PoseSource {
  /**
   * @param {{ video: HTMLVideoElement, onPeople: (dets: import('./roster.js').Detection[], t: number) => void, onCameraChanged?: () => void }} o
   */
  constructor({ video, onPeople, onCameraChanged }) {
    this.video = video;
    this.onPeople = onPeople;
    this.onCameraChanged = onCameraChanged ?? (() => {});
    this.status = 'idle';
    this.message = '';
    this.engine = '';
    this.model = 'full';
    this.numPoses = 3;
    this.busy = false;
    this.sentAt = 0;
    this.answeredAt = 0;
    this.ms = [];
    this.fps = 0;
    this.frames = 0;
    this.cameraId = null;
    this.worker = null;
    this.main = null;
    this.stream = null;
  }

  async start(cameraId = null) {
    this.status = 'camera';
    this.cameraId = cameraId;
    this.stream = await openCamera(this.video, cameraId);
    this.watchTrack();
    this.status = 'model';
    await this.startEngine();
    this.status = 'running';
    this.pump();
    clearInterval(this.watchdog);
    this.watchdog = setInterval(() => this.heal(), 1000);
    setInterval(() => {
      this.fps = this.frames;
      this.frames = 0;
    }, 1000);
  }

  async startEngine() {
    this.stopEngine();
    try {
      const delegate = await this.startWorker();
      if (delegate === 'GPU') return;
      // the worker only got the processor: the main thread with the graphics card is usually faster
      try {
        await this.startMain('GPU');
        this.stopWorker();
        return;
      } catch {
        this.engine = 'worker CPU';
      }
    } catch {
      this.stopWorker();
      await this.startMain('GPU').catch(() => this.startMain('CPU'));
    }
  }

  startWorker() {
    return new Promise((resolve, reject) => {
      const w = new Worker(new URL('./pose-worker.js', import.meta.url));
      this.worker = w;
      const timer = setTimeout(() => reject(new Error('pose worker did not start')), 30000);
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') {
          clearTimeout(timer);
          this.engine = `worker ${m.delegate}`;
          resolve(m.delegate);
        } else if (m.type === 'people') this.answer(m);
        else if (m.type === 'error') {
          if (this.status !== 'running') {
            clearTimeout(timer);
            reject(new Error(m.message));
          }
          this.busy = false;
        }
      };
      w.onerror = (e) => {
        clearTimeout(timer);
        reject(e);
      };
      w.postMessage({ type: 'init', base: here, model: this.model, numPoses: this.numPoses });
    });
  }

  async startMain(delegate) {
    const core = await import('./pose-core.js');
    const vision = await import('../../vendor/vision_bundle.mjs');
    const landmarker = await core.createLandmarker(vision, here, this.model, delegate, this.numPoses);
    const canvas = document.createElement('canvas');
    this.main = { core, landmarker, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
    this.engine = `main ${delegate}`;
  }

  stopWorker() {
    this.worker?.terminate();
    this.worker = null;
  }

  stopEngine() {
    this.stopWorker();
    this.main?.landmarker?.close?.();
    this.main = null;
  }

  /** How many bodies the model looks for: the players plus room for a couple of others. */
  setNumPoses(n) {
    const want = Math.max(2, Math.min(6, n));
    if (want === this.numPoses) return;
    this.numPoses = want;
    this.worker?.postMessage({ type: 'poses', n: want });
    this.main?.landmarker?.setOptions({ numPoses: want });
  }

  /** Send the newest camera frame whenever the tracker is free. */
  pump() {
    const next = () => (this.video.requestVideoFrameCallback ? this.video.requestVideoFrameCallback(tick) : setTimeout(tick, 16));
    const tick = async () => {
      next();
      if (this.busy || this.video.readyState < 2 || !this.video.videoWidth) return;
      const ts = performance.now();
      this.busy = true;
      this.sentAt = ts;
      try {
        if (this.worker) {
          const bitmap = await createImageBitmap(this.video);
          this.worker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
        } else if (this.main) {
          const t0 = performance.now();
          const out = this.main.core.analyse(this.main.landmarker, this.video, ts, this.main.ctx);
          this.answer({ ...out, ms: performance.now() - t0 });
        } else this.busy = false;
      } catch {
        this.busy = false;
      }
    };
    next();
  }

  answer(m) {
    this.busy = false;
    this.answeredAt = performance.now();
    this.frames++;
    this.ms.push(this.answeredAt - this.sentAt);
    if (this.ms.length > 90) this.ms.shift();
    const map = coverMap(m.w, m.h);
    const dets = m.people.map((p) => {
      const px = [];
      for (let i = 0; i < 33; i++) {
        const s = map.toScreen(p.lm[i * 3], p.lm[i * 3 + 1]);
        px.push({ x: s.x, y: s.y, v: p.lm[i * 3 + 2] });
      }
      return { px, sig: p.sig ? { bins: p.sig, conf: p.conf } : null };
    });
    this.onPeople(dets, this.answeredAt / 1000);
    this.adapt();
  }

  /** Too slow on this computer with the accurate model: use the light one. */
  adapt() {
    if (this.model !== 'full' || this.ms.length < 90) return;
    const sorted = [...this.ms].sort((a, b) => a - b);
    if (sorted[45] > 55) {
      this.model = 'lite';
      this.ms = [];
      this.startEngine().catch(() => {});
    }
  }

  get roundTrip() {
    if (!this.ms.length) return 0;
    return this.ms.reduce((a, b) => a + b, 0) / this.ms.length;
  }

  watchTrack() {
    for (const tr of this.stream?.getVideoTracks() ?? []) tr.onended = () => this.reopen();
  }

  async reopen(cameraId = this.cameraId) {
    this.status = 'camera';
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.cameraId = cameraId;
      this.stream = await openCamera(this.video, cameraId);
      this.watchTrack();
      this.status = 'running';
      this.onCameraChanged();
    } catch (err) {
      this.status = 'camera-lost';
      this.message = String(err?.message ?? err);
      setTimeout(() => this.reopen(cameraId), 2000);
    }
  }

  /** Every second: is the tracker still answering? */
  heal() {
    if (this.status !== 'running') return;
    const now = performance.now();
    if (this.busy && now - this.sentAt > 4000) {
      this.busy = false;
      this.startEngine().catch(() => {});
    }
  }
}
