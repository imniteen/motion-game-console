// Game time. It only moves while a round is being played: pausing, the How-to card and a lost camera stop it,
// so nothing in a game (spawns, timers, the round clock) jumps forward after a pause.
export class GameClock {
  constructor() {
    this.t = 0;
    this.running = false;
  }

  /** @param {number} dt real seconds since the last step */
  step(dt) {
    if (this.running) this.t += dt;
  }

  reset() {
    this.t = 0;
  }
}

/**
 * Fixed-step loop: game logic at a steady 60 steps a second whatever the screen's refresh rate, drawing every
 * screen refresh.
 * @param {(dt: number) => void} update
 * @param {(now: number) => void} draw
 */
export function startLoop(update, draw) {
  const STEP = 1 / 60;
  let last = performance.now() / 1000;
  let acc = 0;
  function frame(ms) {
    requestAnimationFrame(frame);
    const now = ms / 1000;
    acc += Math.min(0.1, Math.max(0, now - last)); // a sleeping tab doesn't fast-forward the game
    last = now;
    let n = 0;
    while (acc >= STEP && n < 5) {
      update(STEP);
      acc -= STEP;
      n++;
    }
    if (n === 5) acc = 0;
    draw(now);
  }
  requestAnimationFrame(frame);
}
