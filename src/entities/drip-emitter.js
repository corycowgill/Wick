// Ceiling drip emitter: rains down a column on a cycle. Shelter under anything solid.
import { CFG } from '../config.js';
import { isShelter } from '../physics.js';

export class DripEmitter {
  constructor(tx, ty, phase = 0) {
    this.type = 'drip';
    this.tx = tx; this.ty = ty;
    this.x = tx * CFG.TILE; this.y = (ty + 1) * CFG.TILE;
    // the clock counts whole frames so every run (game, bot, replay) agrees exactly
    this.phase0 = phase;
    this.frames = 0;
    this.t = phase;
    this.on = false;
    this.bottom = this.y;
    this.drops = [];
    this.spawnTimer = 0;
    this.seed = tx * 9301 + ty * 49297 + 1;
  }
  get period() { return CFG.DRIP_ON + CFG.DRIP_OFF; }
  // a few slow drops shortly before the rain starts
  get warn() { return !this.on && this.t > this.period - 0.6; }
  update(dt, world) {
    if (dt > 0) this.frames++;
    this.t = (this.phase0 + this.frames * CFG.STEP) % this.period;
    this.on = this.t < CFG.DRIP_ON;
    // column bottom: first sheltering cell below the emitter
    let ty = this.ty + 1;
    while (ty < world.h && !isShelter(world.cell(this.tx, ty))) ty++;
    this.bottom = ty * CFG.TILE;
    if (this.on || this.warn) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.on ? 0.06 : 0.25;
        this.seed = (this.seed * 16807) % 2147483647;
        const fx = (this.seed % 1000) / 1000;
        this.drops.push({ x: this.x + 5 + fx * (CFG.TILE - 10), y: this.y, vy: 120 });
      }
    }
    const bottom = this.bottom;
    let kept = 0;
    for (const d of this.drops) {
      d.vy += 1400 * dt;
      d.y += d.vy * dt;
      if (d.y >= bottom) { if (world.onSplash) world.onSplash(d.x, bottom); }
      else this.drops[kept++] = d;
    }
    this.drops.length = kept;
  }
  wets(body) {
    if (!this.on) return false;
    const x0 = this.x + 4, x1 = this.x + CFG.TILE - 4;
    return body.x < x1 && body.x + body.w > x0 && body.y < this.bottom && body.y + body.h > this.y;
  }
}
