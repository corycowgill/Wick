// A dripped wax blob: solid for BLOB_LIFE seconds, sags, then melts away.
import { CFG } from '../config.js';
import { Events } from '../events.js';

export class WaxBlob {
  constructor(tx, ty, fromY) {
    this.type = 'blob';
    this.tx = tx; this.ty = ty;
    this.x = tx * CFG.TILE; this.y = ty * CFG.TILE;
    this.fromY = fromY ?? this.y;     // visual fall start
    this.drawY = this.fromY;
    this.vy = 0;
    this.age = 0;
    this.seed = Math.abs((tx * 73856093) ^ (ty * 19349663)) % 1000;
  }
  get life() { return CFG.BLOB_LIFE - this.age; }
  get sag() { return Math.max(0, 1 - this.life / CFG.BLOB_SAG); } // 0..1 in the final seconds
  update(dt, world) {
    this.age += dt;
    if (this.drawY < this.y) {
      this.vy += CFG.GRAVITY * dt;
      this.drawY = Math.min(this.y, this.drawY + this.vy * dt);
      this.falling = true;
      if (this.drawY >= this.y) Events.emit('blobLand', { x: this.x + CFG.TILE / 2, y: this.y + CFG.TILE, blob: this });
    }
    if (this.age >= CFG.BLOB_LIFE) world.removeBlob(this, true);
  }
}
