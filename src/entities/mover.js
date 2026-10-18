// Moving platform: a one-way plank that glides between two points on a fixed clock.
// Lifts go up and down, ferries go side to side. Anything standing on top rides along.
import { CFG } from '../config.js';

export class Mover {
  // a, b: top-left corners in px; w: width in px; period: seconds for a round trip
  constructor({ ax, ay, bx, by, w, period = 4, phase = 0, style = 'plank' }) {
    this.type = 'mover';
    this.ax = ax; this.ay = ay; this.bx = bx; this.by = by;
    this.w = w; this.h = 12;
    this.period = period;
    this.style = style;
    // the clock counts whole frames so every run (game, bot, replay) agrees exactly
    this.phase0 = phase;
    this.frames = 0;
    this.sync();
  }
  // eased ping-pong: slows at each end so jumps on and off are readable
  posAt(frames) {
    const t = ((this.phase0 + frames * CFG.STEP) % this.period) / this.period;
    const s = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    return { x: this.ax + (this.bx - this.ax) * s, y: this.ay + (this.by - this.ay) * s };
  }
  sync() {
    const p = this.posAt(this.frames), q = this.posAt(this.frames - 1);
    this.x = p.x; this.y = p.y;
    this.dx = p.x - q.x; this.dy = p.y - q.y;   // movement over the last frame (riders copy it)
  }
  update(dt) {
    if (dt > 0) this.frames++;
    this.sync();
  }
  get light() {
    return { x: this.x + this.w / 2, y: this.y + 22, r: 64, flicker: 0.1, dim: true };
  }
}
