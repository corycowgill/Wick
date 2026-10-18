// Moth: drawn to flame. Flies a fixed loop (orbit or back-and-forth line) on the clock;
// brushing one steals wax and knocks Wick back. Their dusty glow shows where they are.
import { CFG } from '../config.js';

export class Moth {
  // path 'orbit': circles (cx, cy) at radius r.  path 'line': ping-pongs a -> b.
  constructor({ path = 'orbit', cx, cy, r = 64, ax, ay, bx, by, period = 4, phase = 0 }) {
    this.type = 'moth';
    this.path = path;
    this.cx = cx; this.cy = cy; this.r = r;
    this.ax = ax; this.ay = ay; this.bx = bx; this.by = by;
    this.period = period;
    this.phase0 = phase;
    this.frames = 0;
    this.radius = 13;           // hit radius
    this.sync();
  }
  sync() {
    const t = ((this.phase0 + this.frames * CFG.STEP) % this.period) / this.period;
    const px = this.x;
    if (this.path === 'line') {
      const s = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
      this.x = this.ax + (this.bx - this.ax) * s;
      this.y = this.ay + (this.by - this.ay) * s + Math.sin(t * Math.PI * 8) * 6;
    } else {
      const a = t * Math.PI * 2;
      this.x = this.cx + Math.cos(a) * this.r;
      this.y = this.cy + Math.sin(a) * this.r * 0.6 + Math.sin(a * 3) * 5;
    }
    if (px !== undefined && this.x !== px) this.facing = this.x > px ? 1 : -1;
    if (!this.facing) this.facing = 1;
  }
  update(dt) {
    if (dt > 0) this.frames++;
    this.sync();
  }
  hits(body) {
    const nx = Math.max(body.x, Math.min(this.x, body.x + body.w));
    const ny = Math.max(body.y - 8, Math.min(this.y, body.y + body.h));   // the flame on top counts too
    const dx = this.x - nx, dy = this.y - ny;
    return dx * dx + dy * dy < this.radius * this.radius;
  }
  get light() {
    return { x: this.x, y: this.y, r: 44, flicker: 0.25, dim: true };
  }
}
