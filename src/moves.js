// The moves the games ask for, each with:
//   - what to tell a kid (short, friendly, said out loud by the coach)
//   - an animation: a function of time giving a synthetic pose (synth.js), so the demo character on the
//     How-to card and the coach banner moves exactly the way the game expects
// The same animations drive the test bots and mouse mode, and test/unit/moves.test.js checks that every
// animation is recognised by the body tracker (body.js): what we show is what we detect.
import { ARM } from './vision/synth.js';

const TAU = Math.PI * 2;
const smooth = (x) => x * x * (3 - 2 * x);
const pulse = (p, a, b) => (p < a || p > b ? 0 : Math.sin(((p - a) / (b - a)) * Math.PI));

/**
 * @typedef {object} Move
 * @property {string} id
 * @property {string} name     a word or two for cards and chips ("Jump")
 * @property {string} tell     what the coach says ("Jump up high!")
 * @property {string} icon
 * @property {number} period   seconds the animation takes before it repeats
 * @property {(t: number) => Partial<import('./vision/synth.js').SynthPose> & { dx?: number }} pose
 *   dx: sideways offset in shoulder widths
 */

/** @type {Record<string, Move>} */
export const MOVES = {
  jump: {
    id: 'jump',
    name: 'Jump',
    tell: 'Bend your knees and jump up high!',
    icon: '⬆️',
    period: 1.2,
    pose(t) {
      const p = (t % 1.2) / 1.2;
      const crouch = pulse(p, 0.0, 0.25) * 0.35;
      const air = pulse(p, 0.25, 0.65);
      return { duck: crouch, lift: air * 1.1, armL: ARM.down + air * 1.6, armR: ARM.down + air * 1.6 };
    },
  },
  duck: {
    id: 'duck',
    name: 'Duck',
    tell: 'Squat down low, like a little frog!',
    icon: '⬇️',
    period: 2,
    pose(t) {
      const p = (t % 2) / 2;
      const d = p < 0.25 ? smooth(p / 0.25) : p < 0.7 ? 1 : p < 0.9 ? 1 - smooth((p - 0.7) / 0.2) : 0;
      return { duck: d, armL: ARM.down + d * 0.6, armR: ARM.down + d * 0.6 };
    },
  },
  wave: {
    id: 'wave',
    name: 'Wave',
    tell: 'Wave your hands all around to pop them!',
    icon: '👋',
    period: 1,
    pose(t) {
      const a = Math.sin(t * TAU * 2);
      return { armL: ARM.out + 0.9 + 0.5 * a, armR: ARM.out + 0.9 - 0.5 * a };
    },
  },
  reach: {
    id: 'reach',
    name: 'Reach',
    tell: 'Reach out with your hands and touch them!',
    icon: '🙌',
    period: 2,
    pose(t) {
      const p = (t % 2) / 2;
      const r = pulse(p, 0, 0.5);
      const l = pulse(p, 0.5, 1);
      return { armL: ARM.down + l * 2.6, armR: ARM.down + r * 2.6 };
    },
  },
  flap: {
    id: 'flap',
    name: 'Flap',
    tell: 'Flap your arms up and down like a bird!',
    icon: '🐦',
    period: 0.7,
    pose(t) {
      const a = Math.sin((t / 0.7) * TAU);
      return { armL: ARM.out + 0.85 * a, armR: ARM.out + 0.85 * a };
    },
  },
  glide: {
    id: 'glide',
    name: 'Glide',
    tell: 'Hold your arms out wide like an airplane!',
    icon: '✈️',
    period: 2,
    pose(t) {
      return { armL: ARM.out, armR: ARM.out, lean: 0.25 * Math.sin((t / 2) * TAU) };
    },
  },
  sidestep: {
    id: 'sidestep',
    name: 'Step',
    tell: 'Step to the side to get out of the way!',
    icon: '↔️',
    period: 2.4,
    pose(t) {
      const p = (t % 2.4) / 2.4;
      const x = p < 0.15 ? smooth(p / 0.15) : p < 0.5 ? 1 : p < 0.65 ? 1 - 2 * smooth((p - 0.5) / 0.15) : p < 1 ? -1 + smooth(Math.max(0, (p - 0.85) / 0.15)) : 0;
      return { dx: 1.6 * x };
    },
  },
  pump: {
    id: 'pump',
    name: 'Throw',
    tell: 'Put your hand down low, then throw it up high!',
    icon: '☝️',
    period: 1.3,
    pose(t) {
      const p = (t % 1.3) / 1.3;
      const up = p < 0.45 ? 0 : p < 0.65 ? smooth((p - 0.45) / 0.2) : p < 0.9 ? 1 : 1 - smooth((p - 0.9) / 0.1);
      return { armR: ARM.down + up * (ARM.up - ARM.down), armL: ARM.down + 0.2 };
    },
  },
  freeze: {
    id: 'freeze',
    name: 'Freeze',
    tell: 'When the music stops, freeze like a statue!',
    icon: '🧊',
    period: 3,
    pose(t) {
      const p = t % 3;
      if (p < 1.5) {
        const a = Math.sin(p * TAU * 2.5);
        return { armL: ARM.out + 0.8 * a, armR: ARM.out - 0.8 * a, lean: 0.35 * a, duck: 0.15 + 0.15 * a };
      }
      return { armL: ARM.up, armR: ARM.out };
    },
  },
  dance: {
    id: 'dance',
    name: 'Dance',
    tell: 'Dance and wiggle while the music plays!',
    icon: '💃',
    period: 1,
    pose(t) {
      const a = Math.sin(t * TAU * 2);
      return { armL: ARM.out + 0.8 * a, armR: ARM.out - 0.8 * a, lean: 0.3 * a, duck: 0.12 + 0.12 * Math.abs(a) };
    },
  },
  hitUp: {
    id: 'hitUp',
    name: 'Bop',
    tell: 'Bop it up with your hands!',
    icon: '🎈',
    period: 0.9,
    pose(t) {
      const p = (t % 0.9) / 0.9;
      const up = pulse(p, 0, 0.6);
      return { armL: ARM.out + up * 1.2, armR: ARM.out + up * 1.2 };
    },
  },
  circle: {
    id: 'circle',
    name: 'Arm circles',
    tell: 'Swing your arms round and round in big circles!',
    icon: '🔄',
    period: 1.2,
    pose(t) {
      const a = ((t % 1.2) / 1.2) * TAU;
      return { armL: a, armR: a };
    },
  },
  run: {
    id: 'run',
    name: 'High knees',
    tell: 'Run on the spot and lift your knees up high!',
    icon: '🏃',
    period: 0.8,
    pose(t) {
      const p = (t % 0.8) / 0.8;
      const l = pulse(p, 0, 0.5);
      const r = pulse(p, 0.5, 1);
      return { kneeL: l, kneeR: r, armL: ARM.down + 0.6 * r, armR: ARM.down + 0.6 * l, bend: 0.5, lift: 0.1 * Math.max(l, r) };
    },
  },
  jacks: {
    id: 'jacks',
    name: 'Star jumps',
    tell: 'Jump your feet apart and throw your arms up, like a star!',
    icon: '⭐',
    period: 1,
    pose(t) {
      const p = (t % 1) / 1;
      const open = pulse(p, 0.05, 0.95);
      return { armL: ARM.down + open * (ARM.up - ARM.down - 0.2), armR: ARM.down + open * (ARM.up - ARM.down - 0.2), stance: open * 0.9, lift: 0.25 * pulse(p, 0, 0.25) + 0.25 * pulse(p, 0.5, 0.75) };
    },
  },
  squat: {
    id: 'squat',
    name: 'Squat',
    tell: 'Bend your knees and sit down low, then stand up tall!',
    icon: '🐸',
    period: 2,
    pose(t) {
      const p = (t % 2) / 2;
      const d = pulse(p, 0.05, 0.85);
      return { duck: d, armL: ARM.down + d * 1.3, armR: ARM.down + d * 1.3 };
    },
  },
  armsUp: {
    id: 'armsUp',
    name: 'Arms up',
    tell: 'Put both arms up high, like this!',
    icon: '🙆',
    period: 1.5,
    pose(t) {
      return { armL: ARM.up - 0.1 * Math.sin(t * 4), armR: ARM.up - 0.1 * Math.sin(t * 4) };
    },
  },
  airplane: {
    id: 'airplane',
    name: 'Airplane',
    tell: 'Arms out wide, like an airplane!',
    icon: '✈️',
    period: 1.5,
    pose(t) {
      return { armL: ARM.out + 0.08 * Math.sin(t * 4), armR: ARM.out - 0.08 * Math.sin(t * 4) };
    },
  },
  handsHead: {
    id: 'handsHead',
    name: 'Hands on head',
    tell: 'Put both hands on your head!',
    icon: '🙇',
    period: 1.5,
    pose() {
      return { armL: 'head', armR: 'head' };
    },
  },
};

/** The kid-friendly colour names of the four player slots, for the coach ("Red player, jump!"). */
export const SLOT_NAMES = ['Red', 'Blue', 'Yellow', 'Green'];
