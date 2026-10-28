// The pose model, off the main thread so drawing never waits for it. A CLASSIC worker (MediaPipe's loader
// uses importScripts, which module workers don't allow); our modules come in with dynamic import().
// Messages in: { type: 'init', base, model, numPoses } | { type: 'frame', bitmap, ts } | { type: 'poses', n }
// Messages out: { type: 'ready', delegate } | { type: 'people', people, w, h, ms } | { type: 'error', message }

let core = null;
let landmarker = null;
let ctx = null;
let delegate = 'GPU';

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      core = await import(new URL('./pose-core.js', m.base).href);
      const vision = await import(new URL('../../vendor/vision_bundle.mjs', m.base).href);
      ctx = new OffscreenCanvas(core.SIG_W, 90).getContext('2d', { willReadFrequently: true });
      try {
        landmarker = await core.createLandmarker(vision, m.base, m.model, 'GPU', m.numPoses);
        delegate = 'GPU';
      } catch (err) {
        landmarker = await core.createLandmarker(vision, m.base, m.model, 'CPU', m.numPoses);
        delegate = 'CPU';
      }
      self.postMessage({ type: 'ready', delegate });
    } else if (m.type === 'frame') {
      const t0 = performance.now();
      const out = core.analyse(landmarker, m.bitmap, m.ts, ctx);
      m.bitmap.close();
      self.postMessage({ type: 'people', ...out, ms: performance.now() - t0 });
    } else if (m.type === 'poses') {
      await landmarker?.setOptions({ numPoses: m.n });
    }
  } catch (err) {
    m.bitmap?.close?.();
    self.postMessage({ type: 'error', message: String(err?.message ?? err) });
  }
};
