// The painted backdrop: a per-level sky and four parallax depths of silhouette
// (far ridge, landmark skyline, town, near town), each baked once into an offscreen
// canvas with a moon-side rim light, brush texture and a haze that thickens with
// depth, so far things melt into the sky and nothing behind the play layer is as
// bright or as hard-edged as a platform. Sky colour follows the journey: dusk at the
// start, deep night mid-game, a cold pre-dawn in the Cold Quarter, the finale warm.
import { CFG, clamp } from '../config.js';

const W = CFG.VIEW_W, H = CFG.VIEW_H;
export const STRIP_W = 2400;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const rgbOf = (c) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export function mix(a, b, t) {
  const x = rgbOf(a), y = rgbOf(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * clamp(t, 0, 1)).toString(16).padStart(2, '0')).join('');
}
const rgba = (c, a) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
const lum = (c) => { const [r, g, b] = rgbOf(c); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };

// ------------------------------------------------------------ the night's progress
// p is the level's place in the journey, 0 (first) .. 1 (finale).
export function nightOf(p) {
  // how deep into the night: 0 dusk .. 1 darkest
  const night = clamp(p / 0.55, 0, 1) ** 0.8;
  // the Cold Quarter (second to last) is the hour before dawn; the finale is warm
  const dawn = clamp(1 - Math.abs(p - 0.94) / 0.06, 0, 1);
  const finale = clamp((p - 0.97) / 0.03, 0, 1);
  return { night: night * (1 - finale), dawn, finale };
}

// ------------------------------------------------------------ silhouette kits
// Each kit element draws one silhouette at (x, base) into g (a single fill colour),
// pushes window rects [x, y, w, h] onto win and smoke spouts [x, y, big] onto smoke,
// and returns the width it used.
function gable(g, x, b, r, s, win, smoke) {
  const w = (54 + r() * 64) * s, h = (46 + r() * 70) * s, y = b - h, pk = (18 + r() * 26) * s;
  g.fillRect(x, y, w, h);
  g.beginPath(); g.moveTo(x - 4 * s, y + 2); g.lineTo(x + w / 2, y - pk); g.lineTo(x + w + 4 * s, y + 2); g.fill();
  if (r() < 0.6) { const cx = x + w * (0.2 + r() * 0.5); g.fillRect(cx, y - pk * 0.9, 8 * s, pk * 0.9); smoke.push(cx + 4 * s, y - pk * 0.9, 0); }
  grid(x, y, w, h, s, r, win, 0.45);
  return w + r() * 10 * s;
}
function flat(g, x, b, r, s, win) {
  const w = (60 + r() * 70) * s, h = (50 + r() * 60) * s, y = b - h;
  g.fillRect(x, y, w, h); g.fillRect(x - 3 * s, y - 5 * s, w + 6 * s, 6 * s);
  grid(x, y, w, h, s, r, win, 0.5);
  return w + r() * 8 * s;
}
function cottage(g, x, b, r, s, win, smoke) {
  const w = (40 + r() * 30) * s, h = (24 + r() * 14) * s, y = b - h, pk = (16 + r() * 10) * s;
  g.fillRect(x, y, w, h);
  g.beginPath(); g.moveTo(x - 5 * s, y + 2); g.lineTo(x + w / 2, y - pk); g.lineTo(x + w + 5 * s, y + 2); g.fill();
  g.fillRect(x + w * 0.7, y - pk * 0.8, 6 * s, pk * 0.6); smoke.push(x + w * 0.7 + 3 * s, y - pk * 0.8, 0);
  if (r() < 0.8) win.push(x + w * 0.3, y + h * 0.35, 6 * s, 7 * s);
  return w + (16 + r() * 30) * s;
}
function tenement(g, x, b, r, s, win, smoke) {
  const w = (56 + r() * 34) * s, h = (100 + r() * 80) * s, y = b - h;
  g.fillRect(x, y, w, h); g.fillRect(x - 3 * s, y - 4 * s, w + 6 * s, 5 * s);
  for (let k = 0; k < 3; k++) { const cx = x + 6 * s + k * 9 * s; g.fillRect(cx, y - 14 * s, 6 * s, 12 * s); }
  smoke.push(x + 9 * s, y - 14 * s, 0);
  if (r() < 0.4) { g.fillRect(x + w - 26 * s, y - 30 * s, 20 * s, 18 * s); g.fillRect(x + w - 24 * s, y - 12 * s, 2 * s, 10 * s); g.fillRect(x + w - 10 * s, y - 12 * s, 2 * s, 10 * s); }
  grid(x, y, w, h, s, r, win, 0.55);
  return w + r() * 6 * s;
}
function spire(g, x, b, r, s, win) {
  const w = (20 + r() * 8) * s, h = (90 + r() * 60) * s, y = b - h, sp = (50 + r() * 30) * s;
  g.fillRect(x, y, w, h);
  g.fillRect(x - 3 * s, y - 2 * s, w + 6 * s, 4 * s);
  g.beginPath(); g.moveTo(x - 2 * s, y); g.lineTo(x + w / 2, y - sp); g.lineTo(x + w + 2 * s, y); g.fill();
  g.fillRect(x + w / 2 - 0.8 * s, y - sp - 8 * s, 1.6 * s, 8 * s);
  win.push(x + w / 2 - 3 * s, y + 14 * s, 6 * s, 10 * s);
  return w + (14 + r() * 20) * s;
}
function cupola(g, x, b, r, s, win) {
  const w = (110 + r() * 40) * s, h = (50 + r() * 16) * s, y = b - h;
  g.fillRect(x, y, w, h);
  g.beginPath(); g.moveTo(x - 6 * s, y + 2); g.lineTo(x + w / 2, y - 22 * s); g.lineTo(x + w + 6 * s, y + 2); g.fill();
  const cx = x + w / 2;
  g.fillRect(cx - 9 * s, y - 40 * s, 18 * s, 22 * s);
  g.beginPath(); g.ellipse(cx, y - 40 * s, 11 * s, 12 * s, 0, Math.PI, 0); g.fill();
  g.fillRect(cx - 1 * s, y - 60 * s, 2 * s, 10 * s);
  win.push(cx - 4 * s, y - 34 * s, 8 * s, 10 * s);
  for (let k = 0; k < 4; k++) win.push(x + 14 * s + k * (w - 28 * s) / 3 - 5 * s, y + h * 0.35, 10 * s, 16 * s);
  return w + r() * 12 * s;
}
function dome(g, x, b, r, s, win) {
  const w = (70 + r() * 30) * s, h = (40 + r() * 20) * s, y = b - h, cx = x + w / 2, dr = w * 0.32;
  g.fillRect(x, y, w, h);
  g.fillRect(cx - dr * 1.05, y - dr * 0.5, dr * 2.1, dr * 0.5);
  g.beginPath(); g.ellipse(cx, y - dr * 0.5, dr, dr * 0.95, 0, Math.PI, 0); g.fill();
  g.fillRect(cx - 3 * s, y - dr * 1.6, 6 * s, dr * 0.2 + 4 * s);
  for (let k = 0; k < 3; k++) win.push(cx - dr * 0.7 + k * dr * 0.6, y - dr * 0.35, 4 * s, 6 * s);
  return w + r() * 10 * s;
}
function campanile(g, x, b, r, s, win) {
  const w = (22 + r() * 6) * s, h = (140 + r() * 40) * s, y = b - h;
  g.fillRect(x, y, w, h);
  g.fillRect(x - 3 * s, y - 3 * s, w + 6 * s, 5 * s);
  g.beginPath(); g.moveTo(x - 2 * s, y - 3 * s); g.lineTo(x + w / 2, y - 28 * s); g.lineTo(x + w + 2 * s, y - 3 * s); g.fill();
  win.push(x + 5 * s, y + 8 * s, w - 10 * s, 14 * s);
  return w + (16 + r() * 18) * s;
}
function arches(g, x, b, r, s) {
  const n = 3 + ((r() * 2) | 0), aw = (46 + r() * 12) * s, w = n * aw, h = (58 + r() * 16) * s, ar = aw * 0.36;
  g.beginPath();
  g.rect(x, b - h, w, h);
  for (let k = 0; k < n; k++) {
    const cx = x + aw * (k + 0.5);
    g.moveTo(cx - ar, b); g.lineTo(cx - ar, b - h * 0.45); g.arc(cx, b - h * 0.45, ar, Math.PI, 0); g.lineTo(cx + ar, b); g.closePath();
  }
  g.fill('evenodd');
  g.fillRect(x - 4 * s, b - h - 5 * s, w + 8 * s, 6 * s);
  return w + r() * 10 * s;
}
function mill(g, x, b, r, s, win) {
  const h = (80 + r() * 30) * s, bw = 30 * s, tw = 18 * s, cx = x + bw / 2 + 30 * s, y = b - h;
  g.beginPath(); g.moveTo(cx - bw / 2, b); g.lineTo(cx - tw / 2, y); g.lineTo(cx + tw / 2, y); g.lineTo(cx + bw / 2, b); g.fill();
  g.beginPath(); g.moveTo(cx - tw / 2 - 3 * s, y + 2); g.lineTo(cx, y - 14 * s); g.lineTo(cx + tw / 2 + 3 * s, y + 2); g.fill();
  const a0 = r() * 1.5, L = 52 * s;
  for (let k = 0; k < 4; k++) {
    const a = a0 + k * Math.PI / 2;
    g.save(); g.translate(cx, y - 2 * s); g.rotate(a);
    g.fillRect(-1.2 * s, 0, 2.4 * s, L); g.fillRect(1.2 * s, L * 0.25, 9 * s, L * 0.72);
    g.restore();
  }
  win.push(cx - 3 * s, y + h * 0.45, 6 * s, 8 * s);
  return 60 * s + bw + r() * 30 * s;
}
function poplar(g, x, b, r, s) {
  const h = (70 + r() * 50) * s, w = (12 + r() * 6) * s;
  g.fillRect(x + w / 2 - 1.5 * s, b - h * 0.3, 3 * s, h * 0.3);
  g.beginPath(); g.ellipse(x + w / 2, b - h * 0.58, w / 2, h * 0.45, 0, 0, 6.283); g.fill();
  return w + (4 + r() * 16) * s;
}
function tree(g, x, b, r, s) {
  const R = (16 + r() * 16) * s;
  g.fillRect(x + R - 2 * s, b - R * 1.6, 4 * s, R * 1.6);
  g.beginPath();
  for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283; g.moveTo(x + R + Math.cos(a) * R * 0.5 + R * 0.62, b - R * 2 + Math.sin(a) * R * 0.4); g.arc(x + R + Math.cos(a) * R * 0.5, b - R * 2 + Math.sin(a) * R * 0.4, R * 0.62, 0, 6.283); }
  g.fill();
  return R * 2 + r() * 10 * s;
}
function pine(g, x, b, r, s) {
  const h = (60 + r() * 60) * s, w = h * 0.42;
  g.fillRect(x + w / 2 - 2 * s, b - 10 * s, 4 * s, 10 * s);
  g.beginPath();
  for (let k = 0; k < 4; k++) {
    const t = k / 4, yy = b - 8 * s - h * t, ww = w * (1 - t * 0.7) / 2;
    g.moveTo(x + w / 2 - ww, yy); g.lineTo(x + w / 2, yy - h * 0.38); g.lineTo(x + w / 2 + ww, yy);
  }
  g.fill();
  return w * (0.55 + r() * 0.4);
}
function hedge(g, x, b, r, s) {
  const w = (60 + r() * 80) * s;
  g.beginPath();
  for (let k = 0; k < w; k += 10 * s) g.ellipse(x + k, b - 5 * s, 9 * s, 6 * s + r() * 5 * s, 0, 0, 6.283);
  g.fill();
  return w;
}
function deadtree(g, x, b, r, s) {
  const h = (60 + r() * 50) * s;
  g.save(); g.strokeStyle = g.fillStyle; g.lineCap = 'round';
  const br = (bx, by, a, len, wd, d) => {
    const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
    g.lineWidth = wd; g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
    if (d > 0) { br(ex, ey, a - 0.5 - r() * 0.3, len * 0.66, wd * 0.6, d - 1); br(ex, ey, a + 0.4 + r() * 0.3, len * 0.6, wd * 0.6, d - 1); }
  };
  br(x + 10 * s, b, -Math.PI / 2 + (r() - 0.5) * 0.3, h * 0.42, 5 * s, 3);
  g.restore();
  return (30 + r() * 40) * s;
}
function barn(g, x, b, r, s, win) {
  const w = (80 + r() * 40) * s, h = (40 + r() * 16) * s, y = b - h, cx = x + w / 2;
  g.fillRect(x, y, w, h);
  g.beginPath(); g.moveTo(x - 5 * s, y + 2); g.lineTo(x + w * 0.16, y - h * 0.42); g.lineTo(cx, y - h * 0.62); g.lineTo(x + w * 0.84, y - h * 0.42); g.lineTo(x + w + 5 * s, y + 2); g.fill();
  win.push(cx - 5 * s, y - h * 0.3, 10 * s, 10 * s);
  return w + (6 + r() * 20) * s;
}
function silo(g, x, b, r, s) {
  const w = (24 + r() * 10) * s, h = (90 + r() * 50) * s;
  g.fillRect(x, b - h, w, h);
  g.beginPath(); g.ellipse(x + w / 2, b - h, w / 2, w * 0.45, 0, Math.PI, 0); g.fill();
  return w + (4 + r() * 10) * s;
}
function haystack(g, x, b, r, s) {
  const w = (26 + r() * 16) * s;
  g.beginPath(); g.ellipse(x + w / 2, b, w / 2, w * 0.62, 0, Math.PI, 0); g.fill();
  return w + (8 + r() * 26) * s;
}
function stack(g, x, b, r, s, win, smoke) {
  const h = (130 + r() * 70) * s, w0 = 18 * s, w1 = 12 * s;
  g.beginPath(); g.moveTo(x, b); g.lineTo(x + (w0 - w1) / 2, b - h); g.lineTo(x + (w0 + w1) / 2, b - h); g.lineTo(x + w0, b); g.fill();
  g.fillRect(x + (w0 - w1) / 2 - 2 * s, b - h, w1 + 4 * s, 5 * s);
  smoke.push(x + w0 / 2, b - h, 1);
  return w0 + (10 + r() * 20) * s;
}
function sawtooth(g, x, b, r, s, win) {
  const n = 3 + ((r() * 3) | 0), tw = 28 * s, w = n * tw, h = (40 + r() * 20) * s, y = b - h;
  g.fillRect(x, y, w, h);
  g.beginPath();
  for (let k = 0; k < n; k++) { g.moveTo(x + k * tw, y + 1); g.lineTo(x + k * tw, y - 18 * s); g.lineTo(x + (k + 1) * tw, y + 1); }
  g.fill();
  for (let k = 0; k < n; k++) win.push(x + k * tw + 3 * s, y - 14 * s, 4 * s, 10 * s);
  for (let k = 0; k < n; k++) if (r() < 0.6) win.push(x + k * tw + 8 * s, y + h * 0.4, 12 * s, 8 * s);
  return w + r() * 10 * s;
}
function tank(g, x, b, r, s) {
  const w = (34 + r() * 10) * s, h = (60 + r() * 30) * s;
  g.fillRect(x + 4 * s, b - h, 3 * s, h); g.fillRect(x + w - 7 * s, b - h, 3 * s, h);
  g.fillRect(x, b - h - 30 * s, w, 30 * s);
  g.beginPath(); g.moveTo(x - 2 * s, b - h - 30 * s); g.lineTo(x + w / 2, b - h - 44 * s); g.lineTo(x + w + 2 * s, b - h - 30 * s); g.fill();
  return w + (8 + r() * 16) * s;
}
function clocktower(g, x, b, r, s, win) {
  const w = 36 * s, h = (150 + r() * 30) * s, y = b - h;
  g.fillRect(x, y, w, h);
  g.fillRect(x - 4 * s, y - 4 * s, w + 8 * s, 6 * s);
  g.beginPath(); g.moveTo(x - 4 * s, y - 4 * s); g.lineTo(x + w / 2, y - 46 * s); g.lineTo(x + w + 4 * s, y - 4 * s); g.fill();
  win.push(x + 6 * s, y + 10 * s, w - 12 * s, w - 12 * s);      // the clock face (square, so drawn round)
  return w + (16 + r() * 20) * s;
}
function bigtop(g, x, b, r, s, win) {
  const w = (130 + r() * 40) * s, h = (50 + r() * 14) * s, y = b - h;
  g.beginPath(); g.moveTo(x, b); g.lineTo(x + 6 * s, y);
  g.quadraticCurveTo(x + w * 0.3, y - 10 * s, x + w / 2, y - 46 * s);
  g.quadraticCurveTo(x + w * 0.7, y - 10 * s, x + w - 6 * s, y);
  g.lineTo(x + w, b); g.fill();
  g.fillRect(x + w / 2 - 1 * s, y - 70 * s, 2 * s, 26 * s);
  g.beginPath(); g.moveTo(x + w / 2, y - 70 * s); g.lineTo(x + w / 2 + 16 * s, y - 65 * s); g.lineTo(x + w / 2, y - 60 * s); g.fill();
  win.push(x + w / 2 - 8 * s, b - 24 * s, 16 * s, 24 * s);
  return w + r() * 10 * s;
}
function tent(g, x, b, r, s, win) {
  const w = (44 + r() * 20) * s, h = (34 + r() * 16) * s;
  g.beginPath(); g.moveTo(x, b); g.lineTo(x + w / 2, b - h); g.lineTo(x + w, b); g.fill();
  g.fillRect(x + w / 2 - 1 * s, b - h - 10 * s, 2 * s, 10 * s);
  win.push(x + w / 2 - 4 * s, b - 12 * s, 8 * s, 12 * s);
  return w + (6 + r() * 16) * s;
}
function ctower(g, x, b, r, s, win) {
  const w = (34 + r() * 18) * s, h = (110 + r() * 70) * s, y = b - h;
  g.fillRect(x, y, w, h);
  for (let k = 0; k < w; k += 10 * s) g.fillRect(x + k - 2 * s, y - 8 * s, 6 * s, 9 * s);
  if (r() < 0.5) { g.beginPath(); g.moveTo(x - 4 * s, y - 2 * s); g.lineTo(x + w / 2, y - w * 1.1); g.lineTo(x + w + 4 * s, y - 2 * s); g.fill(); }
  win.push(x + w / 2 - 3 * s, y + 20 * s, 6 * s, 10 * s);
  if (h > 140 * s) win.push(x + w / 2 - 3 * s, y + 60 * s, 6 * s, 10 * s);
  return w + r() * 6 * s;
}
function wall(g, x, b, r, s) {
  const w = (70 + r() * 60) * s, h = (50 + r() * 20) * s, y = b - h;
  g.fillRect(x, y, w, h);
  for (let k = 0; k < w; k += 12 * s) g.fillRect(x + k, y - 7 * s, 7 * s, 8 * s);
  return w;
}
function mast(g, x, b, r, s, win) {
  const w = (70 + r() * 30) * s, mh = (90 + r() * 50) * s;
  g.beginPath(); g.moveTo(x, b - 16 * s); g.lineTo(x + w, b - 16 * s); g.lineTo(x + w - 10 * s, b); g.lineTo(x + 8 * s, b); g.fill();
  g.fillRect(x + w * 0.45, b - 16 * s - mh, 2.5 * s, mh);
  g.fillRect(x + w * 0.45 - 20 * s, b - 16 * s - mh * 0.75, 42 * s, 2 * s);
  g.save(); g.strokeStyle = g.fillStyle; g.lineWidth = 1 * s;
  g.beginPath(); g.moveTo(x + w * 0.45, b - 16 * s - mh); g.lineTo(x + 4 * s, b - 16 * s); g.moveTo(x + w * 0.45, b - 16 * s - mh); g.lineTo(x + w - 2 * s, b - 16 * s); g.stroke();
  g.restore();
  win.push(x + w * 0.45 - 2 * s, b - 16 * s - mh - 4 * s, 5 * s, 5 * s);
  return w + (10 + r() * 30) * s;
}
function warehouse(g, x, b, r, s, win) {
  const w = (90 + r() * 40) * s, h = (60 + r() * 30) * s, y = b - h;
  g.fillRect(x, y, w, h);
  g.beginPath(); g.moveTo(x - 4 * s, y + 2); g.lineTo(x + w / 2, y - 26 * s); g.lineTo(x + w + 4 * s, y + 2); g.fill();
  g.fillRect(x + w / 2 - 2 * s, y - 34 * s, 4 * s, 12 * s); g.fillRect(x + w / 2, y - 34 * s, 22 * s, 3 * s);
  win.push(x + w / 2 - 7 * s, y + 6 * s, 14 * s, 18 * s);
  grid(x, y + 28 * s, w, h - 28 * s, s, r, win, 0.3);
  return w + r() * 10 * s;
}
function gantry(g, x, b, r, s) {
  const h = (120 + r() * 40) * s, w = 18 * s, arm = (90 + r() * 40) * s;
  g.save(); g.strokeStyle = g.fillStyle; g.lineWidth = 2.2 * s;
  g.beginPath();
  g.moveTo(x, b); g.lineTo(x, b - h); g.moveTo(x + w, b); g.lineTo(x + w, b - h);
  for (let y = b; y > b - h; y -= 18 * s) { g.moveTo(x, y); g.lineTo(x + w, y - 18 * s); }
  g.moveTo(x - 20 * s, b - h); g.lineTo(x + arm, b - h); g.moveTo(x + w, b - h - 14 * s); g.lineTo(x + arm, b - h);
  g.moveTo(x + w, b - h - 14 * s); g.lineTo(x - 20 * s, b - h);
  g.moveTo(x + arm - 10 * s, b - h); g.lineTo(x + arm - 10 * s, b - h + 40 * s);
  g.stroke(); g.restore();
  g.fillRect(x + w / 2 - 4 * s, b - h - 18 * s, 8 * s, 18 * s);
  g.fillRect(x + arm - 16 * s, b - h + 40 * s, 12 * s, 8 * s);
  return arm + (20 + r() * 30) * s;
}
function ruin(g, x, b, r, s) {
  const w = (40 + r() * 40) * s, h = (30 + r() * 40) * s;
  g.beginPath(); g.moveTo(x, b); g.lineTo(x, b - h); g.lineTo(x + w * 0.3, b - h * 0.7); g.lineTo(x + w * 0.5, b - h * 0.9); g.lineTo(x + w * 0.8, b - h * 0.4); g.lineTo(x + w, b - h * 0.5); g.lineTo(x + w, b); g.fill();
  return w + (10 + r() * 30) * s;
}
function grid(x, y, w, h, s, r, win, chance) {
  for (let wy = y + 12 * s; wy < y + h - 14 * s; wy += 24 * s) {
    for (let wx = x + 9 * s; wx < x + w - 14 * s; wx += 20 * s) if (r() < chance) win.push(wx, wy, 7 * s, 10 * s);
  }
}
const EL = {
  gable, flat, cottage, tenement, spire, cupola, dome, campanile, arches, mill, poplar, tree, pine, hedge,
  deadtree, barn, silo, haystack, stack, sawtooth, tank, clocktower, bigtop, tent, ctower, wall, mast, warehouse, gantry, ruin,
};

// What each place looks like from afar: [far landmark kit, town kit, ridge roughness]
const KITS = {
  dusk: [['gable', 'cupola', 'gable', 'spire', 'gable', 'tree', 'gable'], ['gable', 'gable', 'flat', 'gable'], 0.5],
  canal: [['dome', 'arches', 'campanile', 'flat', 'arches', 'gable', 'dome'], ['gable', 'flat', 'gable', 'tenement'], 0.35],
  wind: [['mill', 'poplar', 'cottage', 'hedge', 'poplar', 'mill', 'tree'], ['cottage', 'gable', 'tree', 'cottage'], 1.2],
  harvest: [['barn', 'silo', 'haystack', 'tree', 'haystack', 'hedge'], ['barn', 'cottage', 'silo', 'tree'], 0.9],
  scorch: [['deadtree', 'ruin', 'silo', 'deadtree', 'barn', 'ruin'], ['ruin', 'deadtree', 'barn'], 0.8],
  rain: [['tenement', 'tank', 'tenement', 'spire', 'flat', 'tenement'], ['tenement', 'gable', 'flat'], 0.4],
  works: [['stack', 'sawtooth', 'stack', 'tank', 'sawtooth', 'stack'], ['sawtooth', 'flat', 'stack', 'tenement'], 0.4],
  tower: [['spire', 'clocktower', 'gable', 'spire', 'gable', 'campanile'], ['gable', 'spire', 'flat', 'gable'], 0.6],
  violet: [['pine', 'pine', 'tree', 'pine', 'spire', 'pine', 'tree'], ['cottage', 'pine', 'tree', 'gable'], 1.0],
  barn: [['barn', 'silo', 'tree', 'barn', 'haystack'], ['barn', 'cottage', 'tree'], 0.9],
  fair: [['bigtop', 'tent', 'gable', 'tent', 'cupola'], ['tent', 'gable', 'bigtop', 'gable'], 0.5],
  cold: [['pine', 'gable', 'pine', 'spire', 'pine', 'gable'], ['gable', 'gable', 'pine', 'cottage'], 0.9],
  castle: [['ctower', 'wall', 'ctower', 'wall', 'ctower'], ['ctower', 'wall', 'gable'], 0.7],
  locks: [['mill', 'poplar', 'cottage', 'arches', 'poplar'], ['cottage', 'gable', 'poplar'], 0.6],
  harbour: [['mast', 'warehouse', 'campanile', 'mast', 'warehouse', 'mast'], ['warehouse', 'gable', 'flat'], 0.3],
  gears: [['gantry', 'clocktower', 'sawtooth', 'gantry', 'stack'], ['sawtooth', 'gable', 'flat'], 0.5],
  waterwheel: [['mill', 'tenement', 'stack', 'poplar', 'tenement'], ['tenement', 'gable', 'cottage'], 0.7],
  mothmoon: [['mill', 'pine', 'pine', 'tree', 'pine'], ['cottage', 'pine', 'tree'], 1.0],
  hoist: [['silo', 'barn', 'silo', 'haystack', 'tree'], ['barn', 'silo', 'cottage'], 0.9],
};

// ------------------------------------------------------------ baking
let grainTile = null;
function brushTile() {
  // short soft strokes of light and dark, lightly vertical, like dry-brushed gouache
  if (grainTile) return grainTile;
  const c = canvas(192, 192), g = c.getContext('2d'), r = rng(9917);
  for (let i = 0; i < 520; i++) {
    const x = r() * 192, y = r() * 192, len = 6 + r() * 18, a = -Math.PI / 2 + (r() - 0.5) * 0.9;
    g.strokeStyle = r() < 0.5 ? `rgba(255,240,230,${0.035 + r() * 0.05})` : `rgba(0,0,10,${0.05 + r() * 0.07})`;
    g.lineWidth = 1.5 + r() * 3; g.lineCap = 'round';
    for (const ox of [-192, 0, 192]) for (const oy of [-192, 0, 192]) {
      g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len); g.stroke();
    }
  }
  grainTile = c;
  return c;
}

// Turn a white silhouette mask into a painted layer: body colour with a rim of light
// on the moon side, brush texture, and haze rising from the base.
let scratch = null;
const FOOT = 140;
function paint(S, body, rim, haze, hazeTop, hazeA, rimPx, res) {
  const w = S.width, h = S.height;
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = rim; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(S, 0, 0);
  if (!scratch || scratch.width < w || scratch.height < h) scratch = canvas(w, h);
  const sg = scratch.getContext('2d');
  sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, scratch.width, scratch.height);
  sg.fillStyle = body; sg.fillRect(0, 0, w, h);
  sg.globalCompositeOperation = 'destination-in'; sg.drawImage(S, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.drawImage(scratch, rimPx * 0.8 * res, rimPx * res);
  const pat = g.createPattern(brushTile(), 'repeat');
  g.save(); g.scale(res, res); g.fillStyle = pat; g.fillRect(0, 0, w / res, h / res); g.restore();
  const hz = g.createLinearGradient(0, hazeTop * res, 0, h);
  hz.addColorStop(0, rgba(haze, 0)); hz.addColorStop(1, rgba(haze, hazeA));
  g.fillStyle = hz; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  return c;
}

// A strip of silhouettes from a kit; returns the painted canvas plus window,
// smoke and lamp positions (in strip px at 1x).
function buildStrip(kit, height, s, seed, pal, res, opt) {
  const S = canvas(STRIP_W * res, (height + FOOT) * res), g = S.getContext('2d');
  g.scale(res, res); g.fillStyle = '#fff';
  const r = rng(seed), win = [], smoke = [];
  let x = r() * 20;
  const base = height;
  for (let i = 0; x < STRIP_W; i++) {
    const name = kit[(r() * kit.length) | 0];
    const es = (seed * 131 + i * 7919) >>> 0, x0 = x;
    x += EL[name](g, x, base, rng(es), s, win, smoke);
    // wrap the strip seamlessly: anything hanging past the end is drawn again at the start
    if (x > STRIP_W - 60 * s) { g.save(); g.translate(-STRIP_W, 0); EL[name](g, x0, base, rng(es), s, [], []); g.restore(); }
    if (opt.gap) x += r() * opt.gap * s;
  }
  // the ground the silhouettes stand on, running on below the base so a low camera
  // never sees the town floating; painted after the rim so its edge stays soft
  g.fillRect(0, base - 4 * s, STRIP_W, FOOT + 4 * s);
  const c = paint(S, pal.body, pal.rim, pal.haze, height - (opt.hazeH || height), pal.hazeA, pal.rimPx, res);
  const cg = c.getContext('2d');
  cg.save(); cg.scale(res, res);
  const fg = cg.createLinearGradient(0, base - 4 * s, 0, base + FOOT);
  fg.addColorStop(0, mix(pal.body, pal.haze, pal.hazeA * 0.9)); fg.addColorStop(1, mix(pal.body, '#000000', 0.3));
  cg.fillStyle = fg; cg.fillRect(0, base - 4 * s, STRIP_W, FOOT + 4 * s);
  // unlit windows: dark panes in the wall
  cg.fillStyle = rgba(pal.pane, 0.6);
  const lit = [];
  const wr = rng(seed * 3 + 1);
  for (let i = 0; i < win.length; i += 4) {
    if (win[i] + win[i + 2] > STRIP_W) continue;
    if (wr() < pal.litChance) lit.push(win[i], win[i + 1], win[i + 2], win[i + 3], wr());
    else cg.fillRect(win[i], win[i + 1], win[i + 2], win[i + 3]);
  }
  cg.restore();
  // lit windows go on their own layer: the town wakes up as Wick lights the torches
  let lights = null;
  if (lit.length) {
    lights = canvas(STRIP_W, height + 2);
    const lg = lights.getContext('2d');
    for (let i = 0; i < lit.length; i += 5) {
      const [wx, wy, ww, wh, k] = [lit[i], lit[i + 1], lit[i + 2], lit[i + 3], lit[i + 4]];
      const col = k < 0.5 ? pal.win[0] : pal.win[1];
      lg.fillStyle = rgba(col, 0.16);
      lg.fillRect(wx - ww * 0.5, wy - wh * 0.3, ww * 2, wh * 1.6);
      lg.fillStyle = col;
      if (ww > wh * 1.3 || (ww === wh)) { lg.beginPath(); lg.arc(wx + ww / 2, wy + wh / 2, ww / 2, 0, 6.283); lg.fill(); }
      else lg.fillRect(wx, wy, ww, wh);
      // a little light spills down the wall below the sill
      const sp = lg.createLinearGradient(0, wy + wh, 0, wy + wh * 2.4);
      sp.addColorStop(0, rgba(col, 0.18)); sp.addColorStop(1, rgba(col, 0));
      lg.fillStyle = sp; lg.fillRect(wx - ww * 0.3, wy + wh, ww * 1.6, wh * 1.4);
    }
  }
  return { canvas: c, lights, lit, smoke, height: height + FOOT, res };
}

// A rolling ridge of hills: periodic noise so the strip wraps without a seam.
function buildRidge(height, rough, seed, pal, res, amp) {
  const S = canvas(STRIP_W * res, height * res), g = S.getContext('2d');
  g.scale(res, res); g.fillStyle = '#fff';
  const r = rng(seed);
  const waves = [[2, 1], [3, 0.6], [7, 0.32 * rough], [13, 0.16 * rough], [29, 0.07 * rough], [61, 0.03 * rough]].map(([n, a]) => [n, a, r() * 6.283]);
  g.beginPath(); g.moveTo(0, height);
  for (let x = 0; x <= STRIP_W; x += 6) {
    let y = 0;
    for (const [n, a, ph] of waves) y += Math.sin((x / STRIP_W) * n * 6.283 + ph) * a;
    g.lineTo(x, 121 - y * amp);
  }
  g.lineTo(STRIP_W, height); g.closePath(); g.fill();
  return { canvas: paint(S, pal.body, pal.rim, pal.haze, 55, pal.hazeA, pal.rimPx, res), height, res };
}

// Soft painted cloud sprites: overlapping lobes, a lit top edge and a shaded belly.
function buildClouds(col, lit, seed) {
  const r = rng(seed), out = [];
  for (let i = 0; i < 5; i++) {
    const w = 220 + r() * 200, h = 70 + r() * 30;
    const c = canvas(w, h), g = c.getContext('2d');
    const lobes = [];
    for (let k = 0; k < 7; k++) lobes.push([w * (0.15 + r() * 0.7), h * (0.5 + r() * 0.2), w * (0.1 + r() * 0.12), h * (0.16 + r() * 0.14)]);
    lobes.push([w * 0.5, h * 0.66, w * 0.42, h * 0.12]);
    const shape = (dy) => { g.beginPath(); for (const [x, y, rx, ry] of lobes) { g.moveTo(x + rx, y + dy); g.ellipse(x, y + dy, rx, ry, 0, 0, 6.283); } g.fill(); };
    g.filter = 'blur(3px)';
    g.fillStyle = lit; shape(0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = col; shape(3.5);
    g.fillStyle = rgba(mix(col, '#000010', 0.35), 0.8);
    g.fillRect(0, h * 0.66, w, h);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-over';
    out.push(c);
  }
  return out;
}

// The sky: the theme's gradient bent toward the hour of the journey, with a
// horizon glow, dithered so it never bands.
function buildSky(th, n) {
  const c = canvas(W, H), g = c.getContext('2d');
  const deep = '#04051a';
  const k = n.night * 0.42;
  let s = th.sky.map((col, i) => mix(col, deep, k * (1 - i * 0.18)));
  if (n.dawn > 0) s = [s[0], s[1], mix(s[2], '#4a5a8a', 0.35 * n.dawn), mix(s[3], '#9a90b0', 0.4 * n.dawn)];
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, s[0]); gr.addColorStop(0.45, s[1]); gr.addColorStop(0.8, s[2]); gr.addColorStop(1, s[3]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  if (n.dawn > 0) {
    // the first thin promise of dawn, low on the far side of the sky
    const dg = g.createRadialGradient(W * 0.86, H * 0.78, 20, W * 0.86, H * 0.78, W * 0.62);
    dg.addColorStop(0, `rgba(250,200,205,${0.34 * n.dawn})`); dg.addColorStop(0.4, `rgba(180,175,225,${0.16 * n.dawn})`); dg.addColorStop(1, 'rgba(120,130,200,0)');
    g.fillStyle = dg; g.fillRect(0, 0, W, H);
  }
  // ordered dither of the gradient, plus big soft value shifts like a wash
  const img = g.getImageData(0, 0, W, H), d = img.data, r = rng(77);
  const blots = [];
  for (let i = 0; i < 9; i++) blots.push([r() * W, r() * H * 0.8, 120 + r() * 220, (r() - 0.5) * 9]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const v = (((x * 7 + y * 13) % 16) / 16 - 0.5) * 3 + (r() - 0.5) * 2.5;
      d[o] += v; d[o + 1] += v; d[o + 2] += v;
    }
  }
  g.putImageData(img, 0, 0);
  for (const [bx, by, br, bv] of blots) {
    const bg = g.createRadialGradient(bx, by, 0, bx, by, br);
    const col = bv > 0 ? '255,230,240' : '0,0,20';
    bg.addColorStop(0, `rgba(${col},${Math.abs(bv) / 120})`); bg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = bg; g.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  return { canvas: c, cols: s };
}

function buildStars(seed, density) {
  const c = canvas(W, H * 0.62), g = c.getContext('2d'), r = rng(seed);
  const n = Math.round(150 * density), twinkle = [];
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H * 0.6, big = r();
    const a = 0.15 + r() * 0.45 * (1 - y / (H * 0.7));
    g.fillStyle = `rgba(255,244,236,${a})`;
    const sz = big < 0.08 ? 2 : big < 0.3 ? 1.4 : 1;
    g.fillRect(x, y, sz, sz);
    if (big < 0.06) twinkle.push(x, y, r() * 6.283);
  }
  return { canvas: c, twinkle };
}

export function buildMoon(tint, R = 30, S = 200) {
  const c = canvas(S * 2, S * 2), g = c.getContext('2d');
  const halo = g.createRadialGradient(S, S, R * 0.6, S, S, S);
  halo.addColorStop(0, rgba(tint, 0.34)); halo.addColorStop(0.25, rgba(tint, 0.12)); halo.addColorStop(1, rgba(tint, 0));
  g.fillStyle = halo; g.fillRect(0, 0, S * 2, S * 2);
  const disc = g.createRadialGradient(S - R * 0.35, S - R * 0.35, R * 0.1, S, S, R);
  disc.addColorStop(0, '#fbf8ff'); disc.addColorStop(0.75, '#e4e6fa'); disc.addColorStop(1, '#c8cce8');
  g.fillStyle = disc; g.beginPath(); g.arc(S, S, R, 0, 6.283); g.fill();
  g.save(); g.beginPath(); g.arc(S, S, R, 0, 6.283); g.clip();
  g.fillStyle = 'rgba(140,146,190,0.32)';
  const r = rng(5);
  for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(S + (r() - 0.5) * R * 1.4, S + (r() - 0.5) * R * 1.4, 2 + r() * 6, 0, 6.283); g.fill(); }
  g.restore();
  return c;
}

// ------------------------------------------------------------ the cached backdrop
let cur = null;
export function backdropFor(th, world, p, res) {
  const scene = (world.data && world.data.scene) || '';
  const key = th.name + '|' + scene + '|' + p.toFixed(3) + '|' + res;
  if (cur && cur.key === key) return cur;
  cur = null;           // let the old level's canvases go before baking the new ones
  const n = nightOf(p);
  const sky = buildSky(th, n);
  const [s0, s1, s2, s3] = sky.cols;
  const kit = KITS[scene] || KITS[th.name] || KITS.dusk;
  const light = th.moon ? '#c8d2ff' : (th.glow ? '#' + th.glow.split(',').map((v) => (+v).toString(16).padStart(2, '0')).join('') : '#e0c0d0');
  const snow = !!th.snow;
  const ink = '#0a0614';
  // value steps, far to near: each layer a little darker and nearer the ink, and
  // a little less hazy, so depth reads from value and saturation alone
  const far = mix(s2, s1, 0.5), mid = mix(s1, ink, 0.25), near = mix(s1, ink, 0.5), nearer = mix(s0, ink, 0.55);
  const pal = (body, rimK, haze, hazeA, extra) => ({
    body, rim: mix(body, snow ? '#e8eeff' : light, snow ? 0.62 : rimK * 1.6), haze, hazeA, rimPx: snow ? 3.2 : 1.8,
    pane: mix(body, ink, 0.5), win: ['#ffb24a', '#f08a38'], litChance: 0.5, ...extra,
  });
  const seed = [...(th.name + scene)].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const B = {
    key, n, sky: sky.canvas, cols: sky.cols, light,
    ridge: buildRidge(360, kit[2], seed + 1, pal(mix(mix(s1, s2, 0.55), ink, 0.14), 0.06, mix(s2, s3, 0.5), 0.45), 1, 46),
    far: buildStrip(kit[0], 260, 0.62, seed + 2, pal(mix(far, mid, 0.45), 0.16, mix(s2, s3, 0.5), 0.55, { litChance: 0.35 }), 1, { gap: 26, hazeH: 160 }),
    town: buildStrip(kit[1], 300, 0.9, seed + 3, pal(near, 0.14, s2, 0.38, { litChance: 0.4 }), 1, { gap: 8, hazeH: 200 }),
    near: buildStrip(snow ? kit[1] : kit[1].concat(['gable', 'flat']), 340, 1.15, seed + 4, pal(nearer, 0.1, mix(s1, s2, 0.5), 0.25, { litChance: 0.45 }), res, { gap: 4, hazeH: 220 }),
    clouds: th.clouds ? buildClouds(mix(th.clouds, s0, n.night * 0.4), mix(th.clouds, light, 0.35), seed + 5) : null,
    stars: (th.stars || th.moon || n.night > 0.45) ? buildStars(seed + 6, th.stars || th.moon ? 1 : n.night * 0.5) : null,
    moon: th.moon ? buildMoon(lum(s3) > 0.4 ? '#ffe2c8' : '#b8c4ff') : null,
  };
  scratch = null;
  cur = B;
  return B;
}

// The moon climbs across the sky over the journey: low left early, high mid-game,
// sinking right by the end of the night.
export function moonPos(p, cam, lift) {
  const x = W * (0.16 + 0.66 * p) - (cam.x * 0.015) % 60;
  const y = 120 - Math.sin(p * Math.PI) * 50 + lift * 0.03;
  return [x, y];
}

// ------------------------------------------------------------ per-frame drawing
const wrapX = (v, span) => ((v % span) + span) % span;

export function drawSky(ctx, B, cam, time, lift, p, flash, quality) {
  ctx.drawImage(B.sky, 0, 0, W, H);
  if (B.stars) {
    const ox = -wrapX(cam.x * 0.02, W), y = lift * 0.02;
    const a = B.n.dawn > 0 ? 1 - 0.45 * B.n.dawn : 1;
    ctx.globalAlpha = a;
    ctx.drawImage(B.stars.canvas, ox, y); ctx.drawImage(B.stars.canvas, ox + W, y);
    // a few bright stars breathe, slowly, never flicker
    if (quality >= 1) {
      const tw = B.stars.twinkle;
      for (let i = 0; i < tw.length; i += 3) {
        const k = 0.5 + 0.5 * Math.sin(time * 0.9 + tw[i + 2] * 3);
        const sx = wrapX(tw[i] + ox, W), sy = tw[i + 1] + y;
        ctx.fillStyle = `rgba(255,246,236,${0.25 * k * a})`;
        ctx.fillRect(sx - 3, sy + 0.5, 7, 1); ctx.fillRect(sx + 0.5, sy - 3, 1, 7);
      }
    }
    ctx.globalAlpha = 1;
  }
  if (B.moon) {
    const [mx, my] = moonPos(p, cam, lift);
    ctx.drawImage(B.moon, mx - 200, my - 200);
  }
  if (B.clouds) {
    // two decks of cloud: a slow high one, and a lower nearer one that drifts faster
    const decks = quality >= 1 ? 2 : 1;
    for (let d = 0; d < decks; d++) {
      const span = W + 700;
      ctx.globalAlpha = (d ? 0.62 : 0.42) * (B.n.dawn ? 0.8 : 1);
      for (let i = 0; i < 4; i++) {
        const c = B.clouds[(i + d * 2) % B.clouds.length];
        const x = wrapX(i * 431 + d * 197 - cam.x * (d ? 0.07 : 0.035) - time * (d ? 6 : 3.2), span) - 350;
        const y = (d ? 150 : 46) + ((i * 37) % 3) * (d ? 30 : 26) + lift * (d ? 0.06 : 0.03);
        const sc = d ? 1 : 0.7;
        ctx.drawImage(c, x, y, c.width * sc, c.height * sc);
      }
    }
    // distant sheet lightning lights the cloud decks from inside
    if (flash > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.5, flash * 0.6);
      for (let i = 0; i < 4; i++) {
        const c = B.clouds[(i + 2) % B.clouds.length];
        const x = wrapX(i * 431 + 197 - cam.x * 0.07 - time * 6, W + 700) - 350;
        ctx.drawImage(c, x, 150 + ((i * 37) % 3) * 30 + lift * 0.06);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

// One parallax strip, tiled across the view (only the visible slice is copied).
// Returns its screen x offset.
function blit(ctx, c, res, ox, y, h) {
  const sx = Math.max(0, -ox), ex = Math.min(STRIP_W, W - ox);
  if (ex > sx) ctx.drawImage(c, sx * res, 0, (ex - sx) * res, h * res, ox + sx, y, ex - sx, h);
  if (ox + STRIP_W < W) {
    const e2 = Math.min(STRIP_W, W - ox - STRIP_W);
    ctx.drawImage(c, 0, 0, e2 * res, h * res, ox + STRIP_W, y, e2, h);
  }
}
export function drawStrip(ctx, L, cam, f, yTop, lit) {
  const ox = -wrapX(cam.x * f, STRIP_W);
  if (yTop >= H) return ox;
  blit(ctx, L.canvas, L.res || 1, ox, yTop, L.height);
  if (L.lights && lit > 0) {
    ctx.globalAlpha = lit;
    blit(ctx, L.lights, 1, ox, yTop, L.lights.height);
    ctx.globalAlpha = 1;
  }
  return ox;
}

// lazy smoke from the chimneys and stacks in a strip
export function drawSmoke(ctx, L, ox, yTop, time, col, quality) {
  if (quality < 1) return;
  const sm = L.smoke;
  for (let i = 0; i < sm.length; i += 3) {
    for (const base of [ox, ox + STRIP_W]) {
      const cx = base + sm[i], cy = yTop + sm[i + 1], big = sm[i + 2];
      if (cx < -80 || cx > W + 80) continue;
      const n = big ? 6 : 3, rise = big ? 120 : 60;
      for (let k = 0; k < n; k++) {
        const ph = (time * (big ? 0.1 : 0.16) + k / n + (sm[i] % 97) / 97) % 1;
        ctx.fillStyle = rgba(col, (big ? 0.2 : 0.12) * (1 - ph));
        ctx.beginPath();
        ctx.arc(cx + ph * (big ? 50 : 22) + Math.sin(time * 0.7 + k + sm[i]) * 3, cy - ph * rise, (big ? 6 : 3) + ph * (big ? 22 : 10), 0, 6.283);
        ctx.fill();
      }
    }
  }
}

// a band of haze between two depths: atmospheric perspective done once per frame
export function drawHaze(ctx, col, y0, y1, a) {
  if (y1 <= y0) return;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a));
  ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
}

// far rain: a fine, faint layer between the hills and the town
export function drawFarRain(ctx, time, n, alpha) {
  ctx.strokeStyle = `rgba(170,190,230,${alpha})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = ((i * 53.3 + time * 30) % (W + 20)) - 10;
    const y = ((i * 97.7 + time * 380) % (H + 30)) - 15;
    ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 9);
  }
  ctx.stroke();
}

// far snow: small slow flakes behind everything
export function drawFarSnow(ctx, cam, time, n) {
  ctx.fillStyle = 'rgba(220,230,255,0.4)';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = wrapX(i * 71.3 + time * 6 - cam.x * 0.08 + Math.sin(time * 0.6 + i) * 8, W + 10) - 5;
    const y = wrapX(i * 43.7 + time * 14, H + 10) - 5;
    ctx.rect(x, y, 1.3, 1.3);
  }
  ctx.fill();
}

// ------------------------------------------------------------ town lights through the dark
// The strips' lit windows are drawn again after the darkness layer, additively, so
// the far town glows the way the near lamps do. Only open sky shows them: a tile-res
// mask of the space above each column's skyline, smoothed on upscale.
const pendingLights = [];
export function queueLights(L, ox, y, a) {
  if (L.lights && a > 0) pendingLights.push(L.lights, ox, y, a);
}
export function clearLights() { pendingLights.length = 0; }

let sm = null, smctx = null, smimg = null, half = null, hctx = null;
export function skyMask(world, cam, top) {
  const T = CFG.TILE;
  const x0 = Math.floor(cam.x / T) - 1, y0 = Math.floor(cam.y / T) - 1;
  const cw = Math.ceil(W / T) + 3, ch = Math.ceil(H / T) + 3;
  if (!sm || sm.width !== cw || sm.height !== ch) {
    sm = canvas(cw, ch); smctx = sm.getContext('2d'); smimg = smctx.createImageData(cw, ch);
  }
  const d = smimg.data;
  let any = false;
  const sky = (i, j) => (y0 + j < top[clamp(x0 + i, 0, world.w - 1)] ? 255 : 0);
  for (let i = 0; i < cw; i++) {
    for (let j = 0; j < ch; j++) {
      const o = (j * cw + i) * 4;
      const a = (sky(i - 1, j) + 2 * sky(i, j) + sky(i + 1, j)) >> 2;
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = a;
      if (a) any = true;
    }
  }
  if (!any) return null;
  smctx.putImageData(smimg, 0, 0);
  return { canvas: sm, x: x0 * T - cam.x, y: y0 * T - cam.y, w: cw * T, h: ch * T };
}

// Cut the queued windows out of the darkness layer (lctx, screen-space transform):
// each window then shows at its painted brightness, and anything drawn in front of
// it (a set piece, a roof) stays in front, since only the dark is lifted.
export function cutTownLights(lctx, world, cam, top, strength) {
  if (!pendingLights.length) return;
  const m = skyMask(world, cam, top);
  if (!m) { pendingLights.length = 0; return; }
  if (!half) { half = canvas(W / 2, H / 2); hctx = half.getContext('2d'); }
  hctx.setTransform(1, 0, 0, 1, 0, 0);
  hctx.globalCompositeOperation = 'source-over';
  hctx.clearRect(0, 0, half.width, half.height);
  hctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
  for (let i = 0; i < pendingLights.length; i += 4) {
    const c = pendingLights[i], ox = pendingLights[i + 1], y = pendingLights[i + 2];
    hctx.globalAlpha = pendingLights[i + 3];
    blit(hctx, c, 1, ox, y, c.height);
  }
  hctx.globalAlpha = 1;
  hctx.globalCompositeOperation = 'destination-in';
  hctx.imageSmoothingEnabled = true;
  hctx.drawImage(m.canvas, m.x, m.y, m.w, m.h);
  pendingLights.length = 0;
  lctx.save();
  lctx.globalCompositeOperation = 'destination-out';
  lctx.globalAlpha = strength;
  lctx.drawImage(half, 0, 0, W, H);
  lctx.restore();
}
