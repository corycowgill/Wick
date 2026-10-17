// Lighting: an indigo darkness layer with light holes cut by radial gradients
// (destination-out), drawn over the world, then warm additive bloom.
import { CFG, clamp } from '../config.js';

const T = CFG.TILE;
let layer = null, lctx = null;

export const Lighting = {
  scale: 0.5,          // darkness layer resolution relative to the view
  bloom: true,
  desaturate: true,

  setScale(s) {
    this.scale = s;
    layer = null;
  },

  ensure() {
    const w = Math.ceil(CFG.VIEW_W * this.scale), h = Math.ceil(CFG.VIEW_H * this.scale);
    if (!layer) {
      layer = document.createElement('canvas');
      layer.width = w; layer.height = h;
      lctx = layer.getContext('2d');
    }
  },

  // lights: [{x, y, r, flicker, dim?, player?}] in world coords
  render(ctx, world, player, camera, lights, time) {
    this.ensure();
    const W = CFG.VIEW_W, H = CFG.VIEW_H;
    const vx = camera.vx, vy = camera.vy;
    const s = this.scale;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.setTransform(s, 0, 0, s, 0, 0);

    // ambient darkness: a little lighter near the sky
    const amb = world.ambient;
    const g = lctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(22,12,46,${amb * 0.84})`);
    g.addColorStop(0.55, `rgba(20,10,40,${amb * 0.97})`);
    g.addColorStop(1, `rgba(16,8,34,${Math.min(0.97, amb * 1.03)})`);
    lctx.fillStyle = g;
    lctx.fillRect(0, 0, W, H);

    // dark zones go nearly opaque
    lctx.fillStyle = 'rgba(10,5,24,0.92)';
    const x0 = Math.max(0, Math.floor(vx / T)), x1 = Math.min(world.w - 1, Math.floor((vx + W) / T));
    const y0 = Math.max(0, Math.floor(vy / T)), y1 = Math.min(world.h - 1, Math.floor((vy + H) / T));
    for (let ty = y0; ty <= y1; ty++) {
      let run = -1;
      for (let tx = x0; tx <= x1 + 1; tx++) {
        const d = tx <= x1 && world.isDark(tx, ty);
        if (d && run < 0) run = tx;
        if (!d && run >= 0) {
          lctx.fillRect(run * T - vx, ty * T - vy, (tx - run) * T, T + 0.5);
          run = -1;
        }
      }
    }

    // cut the light holes
    lctx.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const r = l.r * (1 + l.flicker * noise(time * 9 + l.x * 0.13));
      const sx = l.x - vx, sy = l.y - vy;
      if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;
      const a = l.dim ? 0.55 : 1;
      const grad = lctx.createRadialGradient(sx, sy, r * 0.08, sx, sy, r);
      grad.addColorStop(0, `rgba(0,0,0,${a})`);
      grad.addColorStop(0.3, `rgba(0,0,0,${a * 0.92})`);
      grad.addColorStop(0.65, `rgba(0,0,0,${a * 0.45})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = grad;
      lctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }

    ctx.drawImage(layer, 0, 0, W, H);

    // warm additive bloom around flames
    if (this.bloom) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        if (l.dim) continue;
        const r = l.r * 0.55 * (1 + l.flicker * 0.6 * noise(time * 7 + l.y));
        const sx = l.x - vx, sy = l.y - vy;
        if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        const k = l.player ? 0.22 : 0.16;
        grad.addColorStop(0, `rgba(255,150,60,${k})`);
        grad.addColorStop(0.4, `rgba(220,80,40,${k * 0.4})`);
        grad.addColorStop(1, 'rgba(160,40,40,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
      ctx.restore();
    }
  },

  // Low wax: screen edges drain of colour toward a cold blue.
  coldVignette(ctx, frac, time) {
    const k = clamp((0.45 - frac) / 0.45, 0, 1);
    if (k <= 0) return;
    const W = CFG.VIEW_W, H = CFG.VIEW_H;
    const pulse = frac < 0.15 ? 0.1 * Math.sin(time * 6) : 0;
    ctx.save();
    if (this.desaturate) {
      ctx.globalCompositeOperation = 'saturation';
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.62);
      g.addColorStop(0, 'rgba(128,128,128,0)');
      g.addColorStop(1, `rgba(128,128,128,${k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    const g2 = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
    g2.addColorStop(0, 'rgba(40,70,140,0)');
    g2.addColorStop(1, `rgba(40,70,150,${(0.45 + pulse) * k})`);
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};

// cheap smooth noise in -1..1
function noise(t) {
  return Math.sin(t) * 0.5 + Math.sin(t * 2.31 + 1.3) * 0.3 + Math.sin(t * 5.17 + 0.7) * 0.2;
}
