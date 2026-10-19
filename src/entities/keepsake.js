// Keepsake: one optional collectible per level, tucked off the main route.
// No wax: it is only there for the finder. Like pumpkins, once got it stays got.
import { overlaps } from '../physics.js';
import { Events } from '../events.js';

export class Keepsake {
  constructor(x, y) {
    this.type = 'keepsake';
    this.x = x; this.y = y;          // center x, floor y
    this.got = false;
    this.t = 0;
    this.rect = { x: x - 15, y: y - 26, w: 30, h: 26 };
  }
  update(dt, world, player) {
    this.t += dt;
    if (this.got) return;
    if (player && player.alive && overlaps(this.rect, player)) {
      this.got = true;
      this.t = 0;
      Events.emit('keepsake', { x: this.x, y: this.y - 14, entity: this });
    }
  }
}
