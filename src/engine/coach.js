// The coach notices when a player is stuck and shows them the move (an animated character at the top of the
// screen plus a spoken tip). It only steps in when needed:
//   - a player misses the same kind of thing twice within 10 s, or
//   - a player has done nothing useful for 8 s while the game needs them to (the game's needs()).
// One tip at a time, at most every 8 s per player, never in the first 4 s of a round, and it goes away as soon
// as that player gets it right. Pure logic in game time; drawing is in ui/coach.js.
export const COACH = { missWindow: 10, missCount: 2, idleAfter: 8, cooldown: 8, show: 4.5, quietStart: 4, praise: 1.2 };

export class Coach {
  constructor(o = {}) {
    this.cfg = { ...COACH, ...o };
    this.reset(0);
  }

  reset(t) {
    this.start = t;
    this.misses = new Map(); // n -> [{t, move}]
    this.lastGood = new Map(); // n -> t
    this.coolUntil = new Map(); // n -> t
    /** @type {{ n: number, move: string, reason: 'miss'|'idle', at: number, until: number, praised?: number } | null} */
    this.current = null;
    this.shown = 0;
  }

  join(n, t) {
    this.lastGood.set(n, t);
  }

  miss(n, move, t) {
    if (!move) return;
    const list = this.misses.get(n) ?? [];
    list.push({ t, move });
    this.misses.set(n, list);
  }

  good(n, t) {
    this.lastGood.set(n, t);
    const c = this.current;
    if (c && c.n === n && !c.praised) {
      c.praised = t;
      c.until = Math.min(c.until, t + this.cfg.praise);
    }
  }

  /**
   * @param {number} t game seconds
   * @param {{ n: number, needs: string | null }[]} players  the players in the game now
   * @returns {{ n: number, move: string, reason: 'miss'|'idle' } | null} a tip that starts now
   */
  update(t, players) {
    const cfg = this.cfg;
    if (this.current && t >= this.current.until) {
      this.coolUntil.set(this.current.n, t + cfg.cooldown);
      this.current = null;
    }
    for (const [n, list] of this.misses) {
      while (list.length && t - list[0].t > cfg.missWindow) list.shift();
      if (!list.length) this.misses.delete(n);
    }
    if (this.current || t - this.start < cfg.quietStart) return null;
    for (const p of players) {
      if ((this.coolUntil.get(p.n) ?? -Infinity) > t) continue;
      const list = this.misses.get(p.n) ?? [];
      const byMove = new Map();
      for (const m of list) byMove.set(m.move, (byMove.get(m.move) ?? 0) + 1);
      let move = null;
      let reason = /** @type {'miss'|'idle'} */ ('miss');
      for (const [m, k] of byMove) if (k >= cfg.missCount) move = m;
      if (!move && p.needs) {
        const since = t - (this.lastGood.get(p.n) ?? this.start);
        if (since >= cfg.idleAfter) {
          move = p.needs;
          reason = 'idle';
        }
      }
      if (!move) continue;
      this.misses.delete(p.n);
      this.lastGood.set(p.n, t);
      this.current = { n: p.n, move, reason, at: t, until: t + cfg.show };
      this.shown++;
      return { n: p.n, move, reason };
    }
    return null;
  }
}
