// Cobweb: a solid tangle that burns away the moment the flame touches it.
// Fire spreads to neighbouring flammables (cobwebs, fuses, gates).
import { CFG } from '../config.js';

export class Flammable {
  constructor(type, tx, ty, opts) {
    this.type = type;
    this.tx = tx; this.ty = ty;
    this.x = tx * CFG.TILE; this.y = ty * CFG.TILE;
    this.state = 'intact';   // intact | burning | gone
    this.t = 0;
    this.spread = opts.spread;
    this.burn = opts.burn;
    this.solid = opts.solid;
    this.spreadDone = false;
  }
  get light() {
    return this.state === 'burning'
      ? { x: this.x + CFG.TILE / 2, y: this.y + CFG.TILE / 2, r: CFG.FIRE_LIGHT, flicker: 0.3 }
      : null;
  }
  ignite(world) {
    if (this.state !== 'intact') return false;
    this.state = 'burning';
    this.t = 0;
    this.spreadDone = false;
    if (world && world.onIgnite) world.onIgnite(this);
    return true;
  }
  update(dt, world) {
    if (this.state !== 'burning') return;
    this.t += dt;
    if (!this.spreadDone && this.t >= this.spread) {
      this.spreadDone = true;
      world.ignite(this.tx + 1, this.ty, true);
      world.ignite(this.tx - 1, this.ty, true);
      world.ignite(this.tx, this.ty + 1, true);
      world.ignite(this.tx, this.ty - 1, true);
    }
    if (this.t >= this.burn) {
      this.state = 'gone';
      if (this.solid) world.clearCell(this.tx, this.ty);
    }
  }
}

export class Cobweb extends Flammable {
  constructor(tx, ty) {
    super('cobweb', tx, ty, { spread: 0.07, burn: 0.3, solid: true });
  }
}
