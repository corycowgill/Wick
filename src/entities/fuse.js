// Fuse rope: burns along its path. Gates are thick wood: only fire spreading
// from a fuse can light them, and they burn away to open the way.
import { Flammable } from './cobweb.js';

export class Fuse extends Flammable {
  constructor(tx, ty) {
    super('fuse', tx, ty, { spread: 0.11, burn: 0.5, solid: false });
  }
}

export class Gate extends Flammable {
  constructor(tx, ty) {
    super('gate', tx, ty, { spread: 0.12, burn: 0.7, solid: true });
  }
}
