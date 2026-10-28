// One Euro filter (Casiez et al. 2012): steady when a kid stands still, quick when they move. Used per landmark
// coordinate so the avatars don't jitter but still keep up with a fast jump.
const alpha = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  constructor(minCutoff = 1.6, beta = 0.012, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
    this.t = 0;
  }

  /** @param {number} value @param {number} t seconds */
  filter(value, t) {
    if (this.x === null) {
      this.x = value;
      this.t = t;
      return value;
    }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const dx = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.dx = 0;
  }
}

/** Smooths a whole 33-point skeleton. */
export class SkeletonFilter {
  constructor(count = 33) {
    this.fx = Array.from({ length: count }, () => new OneEuro());
    this.fy = Array.from({ length: count }, () => new OneEuro());
  }

  /** @param {{x:number,y:number,v:number}[]} px @param {number} t */
  apply(px, t) {
    return px.map((p, i) => ({ x: this.fx[i].filter(p.x, t), y: this.fy[i].filter(p.y, t), v: p.v }));
  }

  reset() {
    for (const f of this.fx) f.reset();
    for (const f of this.fy) f.reset();
  }
}
