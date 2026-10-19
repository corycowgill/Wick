// Lighting: an indigo darkness layer with light holes cut by radial gradients
// (destination-out), drawn over the world, then warm additive bloom.
import { CFG, clamp } from '../config.js';

const T = CFG.TILE;
let layer = null, lctx = null;

// First covered row in each column (any non-empty cell): the skyline. Used to keep
// sky-only effects (aurora, dark-zone fade, rain and snow) out of covered space.
const skyCache = new WeakMap();
export function skyline(world) {
  let top = skyCache.get(world);
  if (top) return top;
  const { w, h, grid } = world;
  top = new Int16Array(w);
  for (let tx = 0; tx < w; tx++) {
    let ty = 0;
    while (ty < h && grid[ty * w + tx] === 0) ty++;
    top[tx] = tx === 0 || tx === w - 1 ? h : ty;      // the border walls do not count
  }
  skyCache.set(world, top);
  return top;
}

// Per-cell dark-zone strength 0..1, cached per world. Inside a zone it is 1, fading
// out over four tiles from head height above the (smoothed) skyline; outside it falls off over three
// tiles, so a zone's edge is a soft dusk rather than a wall of black.
const darkCache = new WeakMap();
function darkStrength(world) {
  let s = darkCache.get(world);
  if (s) return s;
  const { w, h } = world;
  const top = skyline(world);
  const inner = new Float32Array(w * h);
  let any = false;
  for (let tx = 0; tx < w; tx++) {
    let ts = h;
    for (let k = -2; k <= 2; k++) { const c = clamp(tx + k, 1, w - 2); ts = Math.min(ts, top[c]); }
    for (let ty = 0; ty < h; ty++) {
      if (!world.isDark(tx, ty)) continue;
      // full strength down to two tiles above the skyline (head height), then fading
      inner[ty * w + tx] = ty >= ts - 2 ? 1 : clamp(1 - (ts - 2 - ty) / 4, 0, 1);
      any = true;
    }
  }
  s = new Float32Array(w * h);
  if (any) {
    const fall = [0, 0.7, 0.35, 0.1];
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const i = ty * w + tx;
      if (world.isDark(tx, ty)) { s[i] = inner[i]; continue; }
      let v = 0;
      for (let d = 1; d <= 3; d++) {
        const f = fall[d];
        if (tx - d >= 0) v = Math.max(v, inner[i - d] * f);
        if (tx + d < w) v = Math.max(v, inner[i + d] * f);
        if (ty - d >= 0) v = Math.max(v, inner[i - d * w] * f);
        if (ty + d < h) v = Math.max(v, inner[i + d * w] * f);
      }
      s[i] = v;
    }
  }
  s.any = any;
  darkCache.set(world, s);
  return s;
}

let mask = null, mctx = null, mimg = null;
function drawDarkMask(world, vx, vy, W, H) {
  const s = darkStrength(world);
  if (!s.any) return;
  const x0 = Math.floor(vx / T) - 1, y0 = Math.floor(vy / T) - 1;
  const cw = Math.ceil(W / T) + 3, ch = Math.ceil(H / T) + 3;
  if (!mask || mask.width !== cw || mask.height !== ch) {
    mask = document.createElement('canvas');
    mask.width = cw; mask.height = ch;
    mctx = mask.getContext('2d');
    mimg = mctx.createImageData(cw, ch);
  }
  const d = mimg.data, { w, h } = world;
  let seen = false;
  for (let j = 0; j < ch; j++) {
    const ty = clamp(y0 + j, 0, h - 1);
    for (let i = 0; i < cw; i++) {
      const tx = clamp(x0 + i, 0, w - 1);
      const a = s[ty * w + tx];
      const o = (j * cw + i) * 4;
      d[o] = 10; d[o + 1] = 5; d[o + 2] = 24; d[o + 3] = a * 235;
      if (a > 0) seen = true;
    }
  }
  if (!seen) return;
  mctx.putImageData(mimg, 0, 0);
  lctx.imageSmoothingEnabled = true;
  lctx.drawImage(mask, x0 * T - vx, y0 * T - vy, cw * T, ch * T);
}

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

    // dark zones go nearly opaque, feathered at their edges and faded out above
    // the skyline so they never slice the sky (a tile-res mask, smoothed on upscale)
    drawDarkMask(world, vx, vy, W, H);

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
      // many flames in one view share a bloom budget, so a torch-lined room keeps
      // its contrast instead of summing to a milky haze
      let n = 0;
      for (const l of lights) {
        if (l.dim || l.player) continue;
        const sx = l.x - vx, sy = l.y - vy, r = l.r * 0.55;
        if (sx > -r && sx < W + r && sy > -r && sy < H + r) n++;
      }
      const share = n > 4 ? Math.sqrt(4 / n) : 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        if (l.dim) continue;
        const r = l.r * 0.55 * (1 + l.flicker * 0.6 * noise(time * 7 + l.y));
        const sx = l.x - vx, sy = l.y - vy;
        if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        const k = l.player ? 0.22 : 0.16 * share;
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
