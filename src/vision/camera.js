// The webcam: open it, list the cameras, switch, and notice when it is lost. Only video, never the microphone.

const KEY = 'mc.camera';

export async function listCameras() {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch {
    return [];
  }
}

/**
 * @param {HTMLVideoElement} video
 * @param {string | null} deviceId
 * @returns {Promise<MediaStream>}
 */
export async function openCamera(video, deviceId = null) {
  const constraints = {
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (!deviceId) throw err;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true }); // the saved camera is gone
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function savedCamera() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveCamera(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private window: fine, just not remembered */
  }
}

/**
 * Where a camera picture lands on the 16:9 game screen: scaled to cover it (cropping the sides or the top and
 * bottom), mirrored so it behaves like a mirror. Returns a function from normalised camera coords to screen px.
 */
export function coverMap(vw, vh, W = 1920, H = 1080) {
  const scale = Math.max(W / vw, H / vh);
  const ox = (W - vw * scale) / 2;
  const oy = (H - vh * scale) / 2;
  return {
    scale,
    ox,
    oy,
    toScreen: (nx, ny) => ({ x: W - (ox + nx * vw * scale), y: oy + ny * vh * scale }),
  };
}
