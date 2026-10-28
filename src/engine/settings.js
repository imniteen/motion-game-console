// Settings the grown-up can change, remembered in this browser (and nowhere else).
const KEY = 'mc.settings.v1';

export const DEFAULTS = {
  roundSec: 45, // 30, 45, 60 or 90: short bursts of exercise
  voice: true,
  music: 0.5,
  sfx: 0.8,
  difficulty: 'auto', // easy | normal | hard | auto
  preview: true, // small live camera picture in the corner
  players: 1,
};

const CHOICES = {
  roundSec: [30, 45, 60, 90],
  difficulty: ['easy', 'normal', 'hard', 'auto'],
};

/** @param {Storage | undefined} storage */
export function loadSettings(storage = globalThis.localStorage) {
  let saved = {};
  try {
    saved = JSON.parse(storage?.getItem(KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  const s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    const v = saved[k];
    if (v === undefined) continue;
    if (CHOICES[k] && !CHOICES[k].includes(v)) continue;
    if (typeof v !== typeof DEFAULTS[k]) continue;
    if (typeof v === 'number' && !CHOICES[k] && !(v >= 0 && v <= (k === 'players' ? 4 : 1))) continue;
    s[k] = v;
  }
  return s;
}

/** @param {typeof DEFAULTS} s @param {Storage | undefined} storage */
export function saveSettings(s, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked (private window): the settings just aren't remembered */
  }
}

/** The next value of a setting with fixed choices (wraps around). */
export function cycle(s, key, dir = 1) {
  const list = CHOICES[key];
  if (!list) return s[key];
  const i = list.indexOf(s[key]);
  return list[(i + dir + list.length) % list.length];
}

/** Best scores per game, remembered locally. */
const BEST = 'mc.best.v1';
export function loadBest(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(BEST) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
export function saveBest(best, storage = globalThis.localStorage) {
  try {
    storage?.setItem(BEST, JSON.stringify(best));
  } catch {
    /* not remembered */
  }
}
