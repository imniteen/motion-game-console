// What the pose worker and the main-thread fallback share: making the MediaPipe landmarker and turning one
// camera frame into people (landmarks + clothing signatures). Loaded with dynamic import() from the classic
// worker, so it may only import modules that work in a worker too.
import { signatureOf } from './signature.js';

export const SIG_W = 160; // width of the small picture copy the clothing colours are read from

/**
 * @param {any} vision  the MediaPipe vision module (vendor/vision_bundle.mjs)
 * @param {string} base  URL of src/vision/ (for the vendor and model paths)
 * @param {'full'|'lite'} model
 * @param {'GPU'|'CPU'} delegate
 * @param {number} numPoses
 */
export async function createLandmarker(vision, base, model, delegate, numPoses) {
  const fileset = await vision.FilesetResolver.forVisionTasks(new URL('../../vendor/wasm', base).href);
  return vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: new URL(`../../models/pose_landmarker_${model}.task`, base).href, delegate },
    runningMode: 'VIDEO',
    numPoses,
    outputSegmentationMasks: false,
    // a little below the defaults: kids are less common in the model's training data
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
}

/**
 * @param {any} landmarker
 * @param {ImageBitmap | HTMLVideoElement} frame
 * @param {number} ts  ms, increasing
 * @param {OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D} sigCtx  scratch for the colour copy
 * @returns {{ people: { lm: number[], sig: Float32Array | null, conf: number }[], w: number, h: number }}
 */
export function analyse(landmarker, frame, ts, sigCtx) {
  const w = /** @type {any} */ (frame).videoWidth || frame.width;
  const h = /** @type {any} */ (frame).videoHeight || frame.height;
  const res = landmarker.detectForVideo(frame, ts);
  const poses = res.landmarks ?? [];
  let rgba = null;
  const sw = SIG_W;
  const sh = Math.max(1, Math.round((SIG_W * h) / w));
  if (poses.length) {
    const c = sigCtx.canvas;
    if (c.width !== sw || c.height !== sh) {
      c.width = sw;
      c.height = sh;
    }
    sigCtx.drawImage(frame, 0, 0, sw, sh);
    rgba = sigCtx.getImageData(0, 0, sw, sh).data;
  }
  const people = poses.map((pose) => {
    const lm = pose.map((p) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 }));
    const sig = rgba ? signatureOf(rgba, sw, sh, lm) : null;
    const flat = [];
    for (const p of lm) flat.push(p.x, p.y, p.v);
    return { lm: flat, sig: sig ? sig.bins : null, conf: sig ? sig.conf : 0 };
  });
  return { people, w, h };
}
