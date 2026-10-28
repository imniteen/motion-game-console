// MediaPipe pose landmark indices we use. A person is an array of 33 points {x, y, v} in screen pixels
// (the 1920x1080 game canvas, already mirrored so the screen behaves like a mirror). v is visibility 0..1.
export const LM = {
  nose: 0,
  eyeL: 2,
  eyeR: 5,
  earL: 7,
  earR: 8,
  shL: 11,
  shR: 12,
  elL: 13,
  elR: 14,
  wrL: 15,
  wrR: 16,
  idxL: 19,
  idxR: 20,
  hipL: 23,
  hipR: 24,
  knL: 25,
  knR: 26,
  anL: 27,
  anR: 28,
  ftL: 31,
  ftR: 32,
};

export const COUNT = 33;

/** @typedef {{ x: number, y: number, v: number }} Pt */

export const mid = (/** @type {Pt} */ a, /** @type {Pt} */ b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });
export const dist = (/** @type {{x:number,y:number}} */ a, /** @type {{x:number,y:number}} */ b) => Math.hypot(a.x - b.x, a.y - b.y);
