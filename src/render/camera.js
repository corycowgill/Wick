// Follow camera with facing lookahead, level clamping and shake.
import { CFG, clamp } from '../config.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.w = CFG.VIEW_W; this.h = CFG.VIEW_H;
    this.look = 0;
    this.shakeAmt = 0;
    this.ox = 0; this.oy = 0;   // shake offset this frame
  }
  target(player, world) {
    const tx = player.cx - this.w / 2 + this.look;
    const ty = player.y + player.h / 2 - this.h * 0.55;
    return {
      x: world.pxW <= this.w ? (world.pxW - this.w) / 2 : clamp(tx, 0, world.pxW - this.w),
      y: world.pxH <= this.h ? (world.pxH - this.h) / 2 : clamp(ty, 0, world.pxH - this.h),
    };
  }
  snap(player, world) {
    this.look = player.facing * 80;
    const t = this.target(player, world);
    this.x = t.x; this.y = t.y;
  }
  update(dt, player, world) {
    this.look += (player.facing * 80 - this.look) * Math.min(1, dt * 3);
    const t = this.target(player, world);
    const kx = 1 - Math.exp(-dt * 8), ky = 1 - Math.exp(-dt * 5.5);
    this.x += (t.x - this.x) * kx;
    this.y += (t.y - this.y) * ky;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 30);
    const s = this.shakeAmt;
    this.ox = s ? (Math.random() * 2 - 1) * s : 0;
    this.oy = s ? (Math.random() * 2 - 1) * s : 0;
  }
  shake(amount) { this.shakeAmt = Math.max(this.shakeAmt, amount); }
  // integer-snapped view origin to keep tiles crisp
  get vx() { return Math.round(this.x + this.ox); }
  get vy() { return Math.round(this.y + this.oy); }
}
