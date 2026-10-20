// Follow camera, render-only: nothing in the simulation reads it. Look-ahead in the
// direction of travel, vertical framing that holds still on small hops (it re-frames on
// landing, or once Wick climbs or falls out of the hop band), a look-down on long falls,
// a gentle lean toward the next unlit torch, level clamping and shake. A safety band keeps
// Wick (and the ground under them) well inside the view, whatever the easing is doing.
import { CFG, clamp } from '../config.js';

const LOOK_RUN = 92;      // px ahead at full run
const LOOK_IDLE = 36;     // px ahead of the way Wick faces, standing still
const HOP_BAND = 104;     // px a jump can rise before the camera follows it up
const FALL_LOOK = 150;    // px of extra view below on a long, fast fall
const BIAS_RANGE = 12 * CFG.TILE, BIAS_MAX = 48;

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.w = CFG.VIEW_W; this.h = CFG.VIEW_H;
    this.look = 0; this.lookY = 0; this.bias = 0;
    this.anchor = 0;          // feet height the vertical framing holds to
    this.shakeAmt = 0;
    this.ox = 0; this.oy = 0;   // shake offset this frame
    this.px = 1;                // one device pixel in view units (set by the renderer)
  }
  // where the framing wants the view, before easing
  target(player, world) {
    const tx = player.cx - this.w / 2 + this.look + this.bias;
    const ty = this.anchor - player.h / 2 - this.h * 0.55 + this.lookY;
    return { x: this.clampX(tx, world), y: this.clampY(ty, world) };
  }
  clampX(x, world) { return world.pxW <= this.w ? (world.pxW - this.w) / 2 : clamp(x, 0, world.pxW - this.w); }
  clampY(y, world) { return world.pxH <= this.h ? (world.pxH - this.h) / 2 : clamp(y, 0, world.pxH - this.h); }
  snap(player, world) {
    this.look = (player.facing || 1) * LOOK_IDLE;
    this.lookY = 0;
    this.bias = 0;
    this.anchor = player.feet;
    const t = this.target(player, world);
    this.x = t.x; this.y = t.y;
  }
  update(dt, player, world) {
    // horizontal look-ahead: the way Wick is moving, or a little the way they face
    const vx = player.vx + (player.windVx || 0);
    const run = clamp(vx / CFG.RUN_SPEED, -1, 1);
    const lookTo = Math.abs(run) > 0.15 ? run * LOOK_RUN : (player.facing || 1) * LOOK_IDLE;
    this.look += (lookTo - this.look) * Math.min(1, dt * (Math.abs(lookTo) > Math.abs(this.look) ? 1.8 : 1.2));

    // vertical: hold the last footing through a hop; follow a climb or a drop past the band
    const feet = player.feet;
    if (!player.alive) { /* hold on the stub */ }
    else if (player.onGround) this.anchor = feet;
    else if (feet > this.anchor) this.anchor = feet;                        // dropping below the ledge
    else if (feet < this.anchor - HOP_BAND) this.anchor = feet + HOP_BAND;  // a climb that keeps going
    // a long fast fall (past the ledge Wick left) looks down to show the landing
    const fall = player.alive && !player.onGround && player.vy > 520 && feet > this.anchor - 4 ? clamp((player.vy - 520) / 500, 0, 1) : 0;
    this.lookY += (fall * FALL_LOOK - this.lookY) * Math.min(1, dt * (fall > 0 ? 3 : 2));

    // lean toward the next unlit torch (or the goal) ahead, standing or walking
    let bias = 0;
    if (player.alive && world.torches) {
      let best = BIAS_RANGE;
      const consider = (t) => {
        if (!t || t.lit) return;
        const dx = t.x - player.cx, dy = Math.abs(t.y - feet);
        if (Math.abs(dx) < best && dy < 4 * CFG.TILE && dx * (player.facing || 1) > 0) { best = Math.abs(dx); bias = Math.sign(dx) * BIAS_MAX * (1 - Math.abs(dx) / BIAS_RANGE); }
      };
      for (const t of world.torches) consider(t);
      consider(world.goal);
    }
    this.bias += (bias - this.bias) * Math.min(1, dt * 1.2);

    const t = this.target(player, world);
    const kx = 1 - Math.exp(-dt * 7.5);
    const ky = 1 - Math.exp(-dt * (this.y > t.y ? 5 : 4));   // climbing eases a touch quicker than dropping
    this.x += (t.x - this.x) * kx;
    this.y += (t.y - this.y) * ky;

    // safety band: Wick never strays toward the edges, and the ground under them stays in view
    const mx = this.w * 0.24, top = 90, bot = 120;
    this.x = clamp(this.x, player.cx - this.w + mx, player.cx - mx);
    this.y = clamp(this.y, feet - this.h + bot, player.y - top);
    this.x = this.clampX(this.x, world);
    this.y = this.clampY(this.y, world);

    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 30);
    const s = this.shakeAmt;
    this.ox = s ? (Math.random() * 2 - 1) * s : 0;
    this.oy = s ? (Math.random() * 2 - 1) * s : 0;
  }
  shake(amount) { this.shakeAmt = Math.max(this.shakeAmt, amount); }
  // view origin snapped to whole device pixels: tiles stay crisp, and sprites never jitter
  // against the world by a rounding step
  get vx() { return Math.round((this.x + this.ox) / this.px) * this.px; }
  get vy() { return Math.round((this.y + this.oy) / this.px) * this.px; }
}
