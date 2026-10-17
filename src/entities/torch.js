// Torch: checkpoint + one-time refill, then a permanent light source.
import { CFG } from '../config.js';
import { overlaps } from '../physics.js';
import { Events } from '../events.js';

export class Torch {
  constructor(x, y) {
    this.type = 'torch';
    this.x = x; this.y = y;          // center x, floor y
    this.lit = false;
    this.litTime = 0;
    this.rect = { x: x - 16, y: y - 72, w: 32, h: 72 };
  }
  get light() {
    return this.lit
      ? { x: this.x, y: this.y - 58, r: CFG.TORCH_LIGHT, flicker: 0.07 }
      : { x: this.x, y: this.y - 52, r: CFG.TORCH_EMBER_LIGHT, flicker: 0.25, dim: true };
  }
  update(dt, world, player) {
    if (this.lit) { this.litTime += dt; return; }
    if (player && player.alive && overlaps(this.rect, player)) {
      this.lit = true;
      this.litTime = 0;
      player.refill(CFG.TORCH_REFILL);
      world.checkpoint = { x: this.x, y: this.y, wax: player.wax };
      Events.emit('relight', { x: this.x, y: this.y - 58, entity: this });
    }
  }
}
