// Post effects: per-theme colour grade, light shafts, vignette, film grain,
// and the iris transition. All screen space, drawn after the world and lighting.
import { CFG, clamp } from '../config.js';

const W = CFG.VIEW_W, H = CFG.VIEW_H;
let vignette = null, grain = null, grainAlpha = 0.07;

const GRADES = {
  dusk: ['#ff8a50', 0.12], harvest: ['#ff7a30', 0.15], violet: ['#9a60ff', 0.12], wind: ['#ff6a8a', 0.1],
  rain: ['#4a7aff', 0.16], canal: ['#3ab8c8', 0.06], tower: ['#6a70ff', 0.15], fair: ['#ff5a30', 0.14], barn: ['#ffa050', 0.13], cold: ['#6a9aff', 0.18], castle: ['#ff5040', 0.08], works: ['#ff8a30', 0.1],
  locks: ['#40a8b0', 0.12], scorch: ['#ff7030', 0.07],
};
// light shafts: [colour rgb, alpha, angle]
const SHAFTS = {
  rain: ['170,190,255', 0.05, 0.35], tower: ['180,190,255', 0.06, 0.3], cold: ['190,210,255', 0.06, 0.3],
  barn: ['255,190,120', 0.07, -0.45], works: ['255,170,90', 0.06, -0.35], castle: ['170,180,255', 0.06, 0.4],   // cool moonlight: the castle's one colour accent
};

function build() {
  vignette = document.createElement('canvas');
  vignette.width = W; vignette.height = H;
  const v = vignette.getContext('2d');
  const g = v.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.66);
  g.addColorStop(0, 'rgba(10,4,20,0)');
  g.addColorStop(0.7, 'rgba(10,4,20,0.22)');
  g.addColorStop(1, 'rgba(8,2,16,0.6)');
  v.fillStyle = g; v.fillRect(0, 0, W, H);

  // phones: dense high-DPR screens make the same grain read as noise, so go lighter
  const touch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  if (touch || (window.devicePixelRatio || 1) > 2) grainAlpha = 0.04;

  grain = document.createElement('canvas');
  grain.width = grain.height = 160;
  const gc = grain.getContext('2d');
  const img = gc.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  gc.putImageData(img, 0, 0);
}

export const Post = {
  quality: 1,     // 0 on slow devices: skips grain and shafts
  journey: 0, night: null,
  setJourney(p, n) { this.journey = p; this.night = n; },

  // world-level atmosphere: light shafts (under the HUD)
  shafts(ctx, cam, themeName, time) {
    const s = SHAFTS[themeName];
    if (!s || this.quality < 1) return;
    const [rgb, alpha, ang] = s;
    ctx.save();
    // screen, not add: shafts crossing torch bloom and window light never blow out
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const span = W + 600;
      const x = (((i * 337 - cam.x * 0.35) % span) + span) % span - 300;
      const breathe = 0.6 + 0.4 * Math.sin(time * 0.35 + i * 1.7);
      const w = 60 + (i % 2) * 50;
      ctx.save();
      ctx.translate(x, -20);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(0.5, `rgba(${rgb},${alpha * breathe})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-w, 0, w * 2, H * 1.3);
      ctx.restore();
    }
    ctx.restore();
  },

  // final grade: theme tint, vignette, grain
  finish(ctx, themeName, time) {
    if (!vignette) build();
    const gr = GRADES[themeName];
    if (gr) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = gr[1] * 2.2;
      ctx.fillStyle = gr[0];
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // the journey's grade over the theme's: early levels hold the warmth of dusk,
    // the deep middle of the night cools, and the hour before dawn goes pale and cold
    const n = this.night;
    if (n) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      const warm = 0.1 * (1 - n.night) * (1 - n.dawn), cool = 0.1 * n.night * (1 - n.dawn) + 0.06 * n.dawn;
      if (warm > 0.005) { ctx.globalAlpha = warm; ctx.fillStyle = '#ff9a58'; ctx.fillRect(0, 0, W, H); }
      if (cool > 0.005) { ctx.globalAlpha = cool; ctx.fillStyle = '#3a4a9a'; ctx.fillRect(0, 0, W, H); }
      ctx.restore();
    }
    ctx.drawImage(vignette, 0, 0, W, H);
    if (this.quality >= 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = grainAlpha;
      const ox = (Math.random() * 160) | 0, oy = (Math.random() * 160) | 0;
      for (let y = -oy; y < H; y += 160) for (let x = -ox; x < W; x += 160) ctx.drawImage(grain, x, y);
      ctx.restore();
    }
  },

  // iris wipe: k = 0 closed (black) .. 1 fully open, centred on (cx, cy)
  iris(ctx, k, cx, cy) {
    if (k >= 1) return;
    const r = clamp(k, 0, 1) ** 1.6 * Math.hypot(W, H);
    ctx.save();
    ctx.fillStyle = '#0c0518';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    if (r > 2) {
      ctx.strokeStyle = 'rgba(255,170,80,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  },
};
