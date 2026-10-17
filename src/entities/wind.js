// Wind gust zone: idle -> warn (leaves swirl) -> gust (push) -> idle.
import { CFG } from '../config.js';
import { overlaps } from '../physics.js';

export class WindZone {
  constructor(rect, opts = {}) {
    this.type = 'wind';
    this.rect = rect;
    this.x = rect.x; this.y = rect.y;
    this.dir = opts.dir ?? -1;
    this.gust = opts.gust ?? 2.0;      // seconds of push
    this.calm = opts.calm ?? 2.6;      // seconds between gusts (includes the warning)
    this.t = opts.phase ?? 0;
    this.state = 'idle';
    this.strength = 0;                 // 0..1 visual intensity
  }
  get period() { return this.gust + this.calm; }
  update(dt) {
    this.t = (this.t + dt) % this.period;
    const warnStart = this.calm - CFG.WIND_WARN;
    if (this.t < warnStart) this.state = 'idle';
    else if (this.t < this.calm) this.state = 'warn';
    else this.state = 'gust';
    const target = this.state === 'gust' ? 1 : this.state === 'warn' ? 0.3 : 0;
    this.strength += (target - this.strength) * Math.min(1, dt * 4);
  }
  push(body) {
    return this.state === 'gust' && overlaps(this.rect, body) ? this.dir * CFG.WIND_PUSH : 0;
  }
}
