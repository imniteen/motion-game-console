// Sound effects and music, all synthesized (no sound files). The browser only allows sound after the first
// key press or tap, so unlock() is called from the first input.
let ac = null;
let sfxBus = null;
let musicBus = null;
let musicLevel = 0.5;
let sfxLevel = 0.8;

function ctx() {
  if (!ac) {
    try {
      ac = new (globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext)();
      sfxBus = ac.createGain();
      sfxBus.gain.value = sfxLevel;
      sfxBus.connect(ac.destination);
      musicBus = ac.createGain();
      musicBus.gain.value = musicLevel * 0.5;
      musicBus.connect(ac.destination);
    } catch {
      return null;
    }
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

export function unlock() {
  ctx();
}

export function setVolumes({ music, sfx }) {
  musicLevel = music;
  sfxLevel = sfx;
  if (sfxBus) sfxBus.gain.value = sfx;
  if (musicBus) musicBus.gain.value = music * 0.5;
}

/** A note: frequency (optionally gliding to `to`), shaped so it never clicks. */
function tone(freq, dur, { type = 'sine', vol = 0.2, to = 0, delay = 0, dest = null, at = 0 } = {}) {
  const a = ctx();
  if (!a) return;
  const t0 = (at || a.currentTime) + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest ?? sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

let noiseBuf = null;
function noise(dur, { freq = 1000, to = 0, q = 1, type = 'bandpass', vol = 0.2, delay = 0, dest = null, at = 0 } = {}) {
  const a = ctx();
  if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = (at || a.currentTime) + delay;
  const s = a.createBufferSource();
  s.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = /** @type {BiquadFilterType} */ (type);
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(dest ?? sfxBus);
  s.start(t0);
  s.stop(t0 + dur + 0.05);
}

const arp = (notes, step, o = {}) => notes.forEach((n, i) => tone(n, step * 1.6, { ...o, delay: i * step }));

export const sfx = {
  hover: () => tone(880, 0.05, { vol: 0.05, type: 'triangle' }),
  select: () => arp([660, 990], 0.06, { type: 'triangle', vol: 0.15 }),
  back: () => arp([660, 440], 0.06, { type: 'triangle', vol: 0.12 }),
  lock: () => arp([523, 659, 784, 1047], 0.07, { type: 'square', vol: 0.07 }),
  count: () => tone(660, 0.18, { type: 'square', vol: 0.08 }),
  go: () => arp([784, 1047, 1319], 0.08, { type: 'square', vol: 0.09 }),
  pop: () => {
    tone(900 + Math.random() * 300, 0.1, { to: 1800, vol: 0.18 });
    noise(0.05, { freq: 3000, vol: 0.08 });
  },
  gold: () => arp([1047, 1319, 1568, 2093], 0.05, { type: 'triangle', vol: 0.14 }),
  score: () => tone(1175, 0.12, { type: 'triangle', vol: 0.14, to: 1568 }),
  star: () => arp([1319, 1760], 0.07, { type: 'sine', vol: 0.16 }),
  bonk: () => {
    tone(220, 0.25, { type: 'square', to: 90, vol: 0.12 });
    noise(0.12, { freq: 300, vol: 0.12 });
  },
  hit: () => {
    noise(0.3, { freq: 600, to: 120, vol: 0.3, type: 'lowpass' });
    tone(110, 0.3, { to: 50, vol: 0.2 });
  },
  boom: () => {
    noise(0.8, { freq: 900, to: 60, vol: 0.45, type: 'lowpass' });
    tone(80, 0.6, { to: 30, vol: 0.3 });
  },
  splash: () => noise(0.6, { freq: 2500, to: 400, q: 0.5, vol: 0.3 }),
  whoosh: () => noise(0.35, { freq: 400, to: 2400, q: 2, vol: 0.12 }),
  boing: () => tone(260, 0.3, { to: 620, vol: 0.14, type: 'triangle' }),
  flap: () => noise(0.12, { freq: 900, to: 400, q: 1, vol: 0.1 }),
  throw: () => noise(0.22, { freq: 600, to: 2000, q: 3, vol: 0.12 }),
  splat: () => {
    noise(0.24, { freq: 650, to: 230, type: 'lowpass', q: 1.6, vol: 0.3 });
    tone(290, 0.15, { type: 'triangle', to: 160, vol: 0.1 });
  },
  freeze: () => arp([1568, 1319, 1047], 0.05, { type: 'sine', vol: 0.12 }),
  wobble: () => [0, 1, 2, 3, 4, 5].forEach((i) => tone(i % 2 ? 196 : 233, 0.07, { type: 'sawtooth', delay: i * 0.06, vol: 0.06 })),
  tick: () => tone(1400, 0.04, { type: 'square', vol: 0.05 }),
  warn: () => arp([880, 880], 0.12, { type: 'square', vol: 0.06 }),
  cheer: () => {
    arp([523, 659, 784, 1047, 1319], 0.09, { type: 'triangle', vol: 0.15 });
    noise(1.2, { freq: 2000, q: 0.3, vol: 0.05, delay: 0.1 });
  },
  fanfare: () => {
    arp([392, 523, 659, 784], 0.12, { type: 'square', vol: 0.08 });
    tone(1047, 0.8, { type: 'square', vol: 0.08, delay: 0.5 });
  },
  miss: () => tone(300, 0.25, { type: 'triangle', to: 180, vol: 0.12 }),
  coach: () => arp([784, 988], 0.09, { type: 'sine', vol: 0.12 }),
};

// ------------------------------------------------------------------ music
// A tiny generated band: chords, bass, a tune from a seeded walk over the pentatonic scale, and soft drums.
// Every mood (menu, a game's id, results) gets its own song, the same every time.
const SCALE = [0, 2, 4, 7, 9];
const PROGS = [
  [0, 5, 3, 4],
  [0, 3, 4, 4],
  [0, 4, 5, 3],
];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>>= 0) % 10000) / 10000;
  };
}

function songFor(mood) {
  const r = seeded(mood);
  const fast = mood !== 'menu' && mood !== 'results';
  return {
    root: 57 + Math.floor(r() * 7),
    bpm: fast ? 112 + Math.floor(r() * 24) : 92 + Math.floor(r() * 12),
    prog: PROGS[Math.floor(r() * PROGS.length)],
    tune: Array.from({ length: 16 }, () => (r() < 0.25 ? null : SCALE[Math.floor(r() * 5)] + (r() < 0.3 ? 12 : 0))),
    drums: fast,
  };
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
let song = null;
let mood = null;
let nextBar = 0;
let bar = 0;
let songGain = null;

/** Call every frame with what should be playing (null = silence). */
export function music(want, quiet = false) {
  const a = ac;
  if (!a || a.state !== 'running') return;
  if (want !== mood) {
    if (songGain) {
      const old = songGain;
      old.gain.setTargetAtTime(0.0001, a.currentTime, 0.2);
      setTimeout(() => old.disconnect(), 2500);
    }
    mood = want;
    song = want ? songFor(want) : null;
    songGain = null;
    if (song) {
      songGain = a.createGain();
      songGain.gain.value = 0.0001;
      songGain.gain.setTargetAtTime(1, a.currentTime, 0.3);
      songGain.connect(musicBus);
      bar = 0;
      nextBar = a.currentTime + 0.1;
    }
  }
  if (songGain) songGain.gain.setTargetAtTime(quiet ? 0.35 : 1, a.currentTime, 0.15);
  if (!song) return;
  if (nextBar < a.currentTime - 0.1) nextBar = a.currentTime + 0.05;
  while (nextBar < a.currentTime + 0.3) {
    playBar(song, bar++, nextBar);
    nextBar += (4 * 60) / song.bpm;
  }
}

function playBar(s, n, t0) {
  const beat = 60 / s.bpm;
  const deg = s.prog[n % 4];
  const chordRoot = s.root + MAJOR[deg % 7];
  const third = s.root + MAJOR[(deg + 2) % 7] + (deg + 2 >= 7 ? 12 : 0);
  const fifth = s.root + MAJOR[(deg + 4) % 7] + (deg + 4 >= 7 ? 12 : 0);
  const dest = songGain;
  tone(hz(chordRoot - 24), beat * 1.8, { type: 'triangle', vol: 0.12, at: t0, dest });
  tone(hz(chordRoot - 24), beat * 1.8, { type: 'triangle', vol: 0.1, at: t0 + beat * 2, dest });
  [chordRoot, third, fifth, third].forEach((m, i) => tone(hz(m), beat * 0.9, { vol: 0.035, at: t0 + i * beat, dest }));
  for (let i = 0; i < 4; i++) {
    const note = s.tune[(n % 4) * 4 + i];
    if (note !== null) tone(hz(s.root + 12 + note), beat * 0.8, { type: 'square', vol: 0.025, at: t0 + i * beat, dest });
  }
  if (s.drums) {
    for (let i = 0; i < 4; i++) {
      if (i % 2 === 0) tone(110, 0.15, { to: 45, vol: 0.14, at: t0 + i * beat, dest });
      else noise(0.1, { freq: 1800, q: 0.7, vol: 0.05, at: t0 + i * beat, dest });
      noise(0.04, { freq: 7000, type: 'highpass', vol: 0.025, at: t0 + (i + 0.5) * beat, dest });
    }
  }
}
