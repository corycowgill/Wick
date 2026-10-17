// Goal torch: lighting it ends the level.
import { CFG } from '../config.js';
import { overlaps } from '../physics.js';
import { Events } from '../events.js';

export class Goal {
  constructor(x, y) {
    this.type = 'goal';
    this.x = x; this.y = y;
    this.lit = false;
    this.litTime = 0;
    this.rect = { x: x - 22, y: y - 96, w: 44, h: 96 };
  }
  get light() {
    return this.lit
      ? { x: this.x, y: this.y - 84, r: CFG.GOAL_LIGHT * Math.min(1, 0.4 + this.litTime), flicker: 0.06 }
      : { x: this.x, y: this.y - 80, r: 70, flicker: 0.2, dim: true };
  }
  update(dt, world, player) {
    if (this.lit) { this.litTime += dt; return; }
    if (player && player.alive && overlaps(this.rect, player)) {
      this.lit = true;
      this.litTime = 0;
      world.complete = true;
      Events.emit('levelComplete', { x: this.x, y: this.y - 84, entity: this });
    }
  }
}
