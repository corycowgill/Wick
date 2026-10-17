// Pumpkin / lantern: small one-time refill, glows once collected.
import { CFG } from '../config.js';
import { overlaps } from '../physics.js';
import { Events } from '../events.js';

export class Pumpkin {
  constructor(x, y, kind = 'pumpkin') {
    this.type = 'pumpkin';
    this.kind = kind;
    this.x = x; this.y = y;          // center x, floor y
    this.taken = false;
    this.t = 0;
    this.rect = { x: x - 15, y: y - 26, w: 30, h: 26 };
  }
  get light() {
    return this.taken
      ? { x: this.x, y: this.y - 12, r: CFG.PUMPKIN_LIGHT, flicker: 0.12 }
      : { x: this.x, y: this.y - 12, r: CFG.PUMPKIN_IDLE_LIGHT, flicker: 0.2, dim: true };
  }
  update(dt, world, player) {
    this.t += dt;
    if (this.taken) return;
    if (player && player.alive && overlaps(this.rect, player)) {
      this.taken = true;
      this.t = 0;
      player.refill(CFG.PUMPKIN_REFILL);
      Events.emit('pickup', { x: this.x, y: this.y - 14, entity: this });
    }
  }
}
