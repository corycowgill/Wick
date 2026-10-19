// Signature atmosphere for each level theme: a backdrop set piece, ambient
// particles, world details and screen effects. Silhouettes are drawn before the
// darkness layer; their lights are queued and drawn additively after it, so
// bulbs, flames and windows glow through the dark the way real lights would.
import { CFG, clamp } from '../config.js';
import { EMITTER } from '../physics.js';
import { Settings } from '../settings.js';
import { skyline } from './lighting.js';
import { Post } from './post.js';

const W = CFG.VIEW_W, H = CFG.VIEW_H, T = CFG.TILE;
let glows = [];            // [x, y, r, 'r,g,b', a] in screen space, drawn after the darkness
let beams = [];            // [x, y, turn] lighthouse beams, drawn after the darkness too
let skyCam = null, skyLift = 0;   // remembered for effects drawn later in the frame
const fx = new WeakMap();  // per-world timers (lightning, fireworks, chimes)

function state(world) {
  let s = fx.get(world);
  if (!s) { s = { bolt: 0, nextBolt: 3, boltX: 0.5, thunder: 0, fw: [], nextFw: 1, chime: 4, breath: 0 }; fx.set(world, s); }
  return s;
}
const wrap = (x, span) => ((x % span) + span) % span;
const glow = (x, y, r, rgb, a) => glows.push(x, y, r, rgb, a);

// ------------------------------------------------------------ sky extras (behind the castle)
export function drawThemeSky(ctx, cam, world, time, th, lift) {
  glows = []; beams = [];
  skyCam = cam; skyLift = lift;
  if (th.name === 'rain') drawLightningSky(ctx, cam, world, time);
  if (th.name === 'fair') drawFireworksSky(ctx, world, time);
}

function drawAurora(ctx, cam, time, lift) {
  // each band is one smooth ribbon: a wavy top edge with a curtain hanging below it
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const bands = [['80,255,170', 70, 0], ['140,120,255', 110, 1.7], ['60,200,230', 150, 3.1]];
  for (const [rgb, y0, ph] of bands) {
    const yb = y0 + lift * 0.02;
    const top = (x) => {
      const wx = x + cam.x * 0.03;
      return yb + Math.sin(wx * 0.006 + time * 0.25 + ph) * 26 + Math.sin(wx * 0.013 - time * 0.4) * 10;
    };
    const len = (x) => 70 + Math.sin((x + cam.x * 0.03) * 0.01 + time * 0.6 + ph) * 30;
    ctx.beginPath();
    ctx.moveTo(-40, top(-40));
    for (let x = -40; x <= W + 40; x += 12) ctx.lineTo(x, top(x));
    for (let x = W + 40; x >= -40; x -= 12) ctx.lineTo(x, top(x) + len(x));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, yb - 40, 0, yb + 110);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(0.35, `rgba(${rgb},0.16)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.restore();
}

function drawLightningSky(ctx, cam, world, time) {
  const s = state(world);
  if (s.bolt <= 0) return;
  const k = s.bolt;
  const soft = Settings.get().reduceFlash ? 0.2 : 1;   // photosensitivity option
  ctx.save();
  ctx.fillStyle = `rgba(200,215,255,${0.35 * k * soft})`;
  ctx.fillRect(0, 0, W, H);
  // a forked bolt, re-seeded per strike
  ctx.strokeStyle = `rgba(235,240,255,${Math.min(1, k * 1.6) * (soft < 1 ? 0.5 : 1)})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let x = W * s.boltX, y = 0;
  ctx.moveTo(x, y);
  let seed = s.seed;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (y < H * 0.6) {
    x += (rnd() - 0.5) * 50; y += 18 + rnd() * 26;
    ctx.lineTo(x, y);
    if (rnd() < 0.18) { ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 70, y + 40); ctx.moveTo(x, y); }
  }
  ctx.stroke();
  ctx.restore();
}

function drawFireworksSky(ctx, world, time) {
  const s = state(world);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of s.fw) {
    const k = f.t / 1.6;
    if (k > 1) continue;
    const r = 18 + 70 * Math.sqrt(k);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const px = f.x + Math.cos(a) * r, py = f.y + Math.sin(a) * r + k * k * 30;
      ctx.fillStyle = `rgba(${f.c},${(1 - k) * 0.8})`;
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------ backdrop set pieces (after the rooftops)
export function drawThemeBackdrop(ctx, cam, world, time, th, lift) {
  const scene = SCENES[world.data && world.data.scene];
  if (scene) return scene(ctx, cam, world, time, lift);
  switch (th.name) {
    case 'dusk': return drawStalls(ctx, cam, time, lift);
    case 'harvest': return drawCornfield(ctx, cam, time, lift);
    case 'violet': return drawGiantCandles(ctx, cam, time, lift);
    case 'canal': return drawCanalBridges(ctx, cam, time, lift);
    case 'wind': return drawWindmills(ctx, cam, time, lift);
    case 'fair': return drawFerrisWheel(ctx, cam, time, lift);
    case 'works': return drawWaxVats(ctx, cam, time, lift);
  }
}

// the candle works: great copper vats of molten wax, pipes and a rack of new candles
function drawWaxVats(ctx, cam, time, lift) {
  const f = 0.35, span = 420, base = H + 10 + lift * f;
  const off = cam.x * f;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 4; i++) {
    const x = i * span - off + 80, w = 120, h = 150 + (Math.abs(i * 53) % 60);
    const top = base - h;
    // pipe overhead feeding the vat
    ctx.fillStyle = '#3a2216';
    ctx.fillRect(x + w / 2 - 6, 0, 12, top - 30);
    ctx.fillRect(x + w / 2 - 6, top - 40, span * 0.55, 12);
    ctx.fillStyle = '#5a3420';
    for (let k = 0; k < 4; k++) ctx.fillRect(x + w / 2 - 9, 40 + k * 70, 18, 6);
    // the vat
    ctx.fillStyle = '#4a2a1a';
    ctx.beginPath();
    ctx.moveTo(x, top); ctx.lineTo(x + w, top); ctx.lineTo(x + w - 10, base); ctx.lineTo(x + 10, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a3e22';
    ctx.fillRect(x - 6, top - 6, w + 12, 10);
    for (let k = 1; k < 4; k++) ctx.fillRect(x + 2 + k * 2, top + k * 40, w - 4 - k * 4, 4);
    // molten wax glowing at the brim, with a slow drip down the side
    const heat = 0.7 + 0.3 * Math.sin(time * 1.7 + i);
    glow(x + w / 2, top - 4, 90, '255,150,60', 0.16 * heat);
    glow(x + w / 2, top - 2, 46, '255,210,120', 0.3 * heat);
    const dy = ((time * 30 + i * 47) % (h - 20));
    ctx.fillStyle = '#e8c890';
    ctx.beginPath(); ctx.arc(x + w - 14, top + 6 + dy, 3, 0, 6.283); ctx.fill();
    // a rack of candles cooling beside it
    const rx = x + w + 60, ry = base - 70;
    ctx.fillStyle = '#2e1a12'; ctx.fillRect(rx, ry, 110, 6); ctx.fillRect(rx, ry + 40, 110, 6);
    ctx.fillRect(rx, ry - 50, 5, 120); ctx.fillRect(rx + 105, ry - 50, 5, 120);
    ctx.fillStyle = '#d8c4a0';
    for (let k = 0; k < 8; k++) {
      const ch = 18 + (Math.abs(i * 7 + k * 13) % 14);
      ctx.fillRect(rx + 8 + k * 12, ry - ch, 6, ch);
      ctx.fillRect(rx + 8 + k * 12, ry + 40 - ch * 0.8, 6, ch * 0.8);
    }
  }
}

function drawStalls(ctx, cam, time, lift) {
  const f = 0.45, span = 300, base = H - 40 + lift * f;
  const off = cam.x * f;
  const stripes = [['#a8302c', '#e8d8c0'], ['#2f7a76', '#e8d8c0'], ['#c88a2a', '#3a1a40']];
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 5; i++) {
    const x = i * span - off + 40, w = 120 + (Math.abs(i * 37) % 50);
    const [c1, c2] = stripes[Math.abs(i) % 3];
    ctx.fillStyle = '#3a1e50';
    ctx.fillRect(x, base - 70, w, 70);
    ctx.fillRect(x + 6, base - 104, 4, 40); ctx.fillRect(x + w - 10, base - 104, 4, 40);
    // striped awning with a scalloped edge
    for (let k = 0; k < w; k += 16) {
      ctx.fillStyle = (k / 16) % 2 ? c1 : c2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x + k, base - 108); ctx.lineTo(x + k + 16, base - 108); ctx.lineTo(x + k + 16, base - 88);
      ctx.arc(x + k + 8, base - 88, 8, 0, Math.PI); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // string lights between stalls
    for (let k = 0; k < 7; k++) {
      const lx = x + w + k * ((span - w) / 7), ly = base - 104 + Math.sin(k / 6 * Math.PI) * 14;
      const on = 0.6 + 0.4 * Math.sin(time * 2 + i * 3 + k);
      glow(lx, ly, 9, k % 2 ? '255,200,110' : '255,140,90', 0.45 * on);
      ctx.fillStyle = '#ffd890'; ctx.fillRect(lx - 1, ly - 1, 2, 2);
    }
    glow(x + w / 2, base - 40, 46, '255,170,80', 0.12);
  }
}

function drawCornfield(ctx, cam, time, lift) {
  const f = 0.5, base = H - 30 + lift * f;
  const off = cam.x * f;
  ctx.strokeStyle = '#2a1430'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let x = -wrap(off, 22) - 22; x < W + 22; x += 22) {
    const i = Math.round((x + off) / 22);
    const h = 70 + (Math.abs(i * 53) % 40), sway = Math.sin(time * 1.2 + i * 0.7) * 4;
    ctx.moveTo(x, base); ctx.quadraticCurveTo(x + sway * 0.5, base - h * 0.6, x + sway, base - h);
    ctx.moveTo(x + sway * 0.6, base - h * 0.55); ctx.lineTo(x + sway * 0.6 + 14, base - h * 0.75);
    ctx.moveTo(x + sway * 0.4, base - h * 0.35); ctx.lineTo(x + sway * 0.4 - 13, base - h * 0.55);
  }
  ctx.stroke();
  // scarecrows
  const span = 700;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 3; i++) {
    const x = i * span - off + 260, y = base - 70;
    ctx.fillStyle = '#22102c';
    ctx.fillRect(x - 3, y - 60, 6, 130);
    ctx.fillRect(x - 34, y - 40, 68, 6);
    ctx.beginPath(); ctx.arc(x, y - 70, 13, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 20, y - 78); ctx.lineTo(x + 20, y - 78); ctx.lineTo(x + 6, y - 96); ctx.lineTo(x - 6, y - 96); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 16, y - 36); ctx.lineTo(x + 16, y - 36); ctx.lineTo(x + 22, y + 10); ctx.lineTo(x - 22, y + 10); ctx.fill();
    glow(x - 4, y - 72, 4, '255,170,70', 0.5); glow(x + 5, y - 72, 4, '255,170,70', 0.5);
  }
}

function drawGiantCandles(ctx, cam, time, lift) {
  const f = 0.3, span = 380, base = H + 20 + lift * f;
  const off = cam.x * f;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 4; i++) {
    const x = i * span - off + 120, w = 46 + (Math.abs(i * 29) % 30), h = 190 + (Math.abs(i * 71) % 120);
    const top = base - h;
    ctx.fillStyle = '#3a2058';
    ctx.beginPath();
    ctx.moveTo(x, base); ctx.lineTo(x, top + 8); ctx.quadraticCurveTo(x + w / 2, top - 6, x + w, top + 8); ctx.lineTo(x + w, base);
    ctx.fill();
    // frozen drips down the sides
    for (let k = 0; k < 3; k++) {
      const dx = x + 6 + k * (w / 3), dl = 20 + (Math.abs(i * 13 + k * 31) % 50);
      ctx.beginPath(); ctx.moveTo(dx - 4, top + 6); ctx.lineTo(dx - 4, top + dl); ctx.arc(dx, top + dl, 4, Math.PI, 0, true); ctx.lineTo(dx + 4, top + 6); ctx.fill();
    }
    ctx.fillStyle = '#20102e'; ctx.fillRect(x + w / 2 - 1.5, top - 10, 3, 10);
    const fl = 1 + Math.sin(time * 9 + i) * 0.08 + Math.sin(time * 23 + i * 3) * 0.05;
    glow(x + w / 2, top - 22, 60 * fl, '255,170,80', 0.22);
    glow(x + w / 2, top - 20, 13 * fl, '255,230,170', 0.75);
    // moths drawn to the great flames
    for (let k = 0; k < 3; k++) {
      const a = time * (1.4 + k * 0.35) + i * 2 + k * 2.1, rr = 26 + k * 10;
      drawMothShape(ctx, x + w / 2 + Math.cos(a) * rr, top - 22 + Math.sin(a * 1.4) * rr * 0.55, 3.2, time * 24 + k, '#2a1440');
    }
  }
}

function drawCanalBridges(ctx, cam, time, lift) {
  const f = 0.35, span = 520, base = H - 130 + lift * f;
  const off = cam.x * f;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 3; i++) {
    const x = i * span - off + 60, w = 300;
    // far arches stay darker and bluer than the near stone, so depth reads right
    ctx.fillStyle = '#1c2748';
    ctx.beginPath();
    ctx.moveTo(x, base - 90); ctx.lineTo(x + w, base - 90); ctx.lineTo(x + w, base);
    ctx.arc(x + w / 2, base, w * 0.36, 0, Math.PI, true);
    ctx.lineTo(x, base); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 6, base - 100, w + 12, 12);
    for (let k = 0; k < 6; k++) { ctx.fillRect(x + 10 + k * 56, base - 116, 6, 18); glow(x + 13 + k * 56, base - 120, 7, '255,190,110', 0.38); }
    ctx.fillStyle = 'rgba(120,150,200,0.07)'; ctx.fillRect(x - 6, base - 100, w + 12, 2);
    // reflection of the arch in the water
    ctx.strokeStyle = 'rgba(160,200,240,0.12)'; ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const ry = base + 8 + k * 7;
      ctx.beginPath(); ctx.moveTo(x + w * 0.2 + Math.sin(time * 2 + k) * 6, ry); ctx.lineTo(x + w * 0.8 + Math.sin(time * 2.4 + k) * 6, ry); ctx.stroke();
    }
  }
}

function drawWindmills(ctx, cam, time, lift) {
  const f = 0.25, span = 640, base = H - 70 + lift * f;
  const off = cam.x * f;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 3; i++) {
    const x = i * span - off + 330, top = base - 150;
    ctx.fillStyle = '#2e1848';
    ctx.beginPath(); ctx.moveTo(x - 30, base); ctx.lineTo(x - 16, top); ctx.lineTo(x + 16, top); ctx.lineTo(x + 30, base); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 22, top + 4); ctx.lineTo(x, top - 18); ctx.lineTo(x + 22, top + 4); ctx.fill();
    glow(x, top + 50, 6, '255,190,100', 0.55);
    // turning sails
    const a0 = time * (0.9 + (Math.abs(i) % 3) * 0.2) + i;
    ctx.save();
    ctx.translate(x, top - 4);
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.save(); ctx.rotate(a0);
      ctx.fillRect(-2, 0, 4, 78);
      ctx.globalAlpha = 0.85; ctx.fillRect(2, 18, 16, 58); ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.283); ctx.fill();
    ctx.restore();
  }
}

function drawFerrisWheel(ctx, cam, time, lift) {
  const f = 0.2, x = W * 0.25 - wrap(cam.x * f, 900) + 450, y = H - 200 + lift * f, r = 130;
  ctx.strokeStyle = '#2a1030'; ctx.fillStyle = '#2a1030'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x - 70, y + 190); ctx.lineTo(x, y); ctx.lineTo(x + 70, y + 190); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
  const a0 = time * 0.12;
  for (let k = 0; k < 12; k++) {
    const a = a0 + (k / 12) * Math.PI * 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(px, py); ctx.stroke();
    ctx.fillRect(px - 8, py + 2, 16, 12);
    const tw = 0.6 + 0.4 * Math.sin(time * 3 + k);
    glow(px, py, 7, k % 3 === 0 ? '255,90,90' : k % 3 === 1 ? '255,210,100' : '120,220,255', 0.7 * tw);
  }
  glow(x, y, 8, '255,220,150', 0.6);
}

// ------------------------------------------------------------ per-level scenes
// Levels that share a theme each get their own set piece (level data `scene`),
// so a second harvest or canal level does not look like a rerun of the first.
const SCENES = {
  hoist: drawHoist, scorch: drawScorch, harbour: drawHarbour, gears: drawGears,
  waterwheel: drawWaterwheel, locks: drawLocks, mothmoon: drawMothMoon,
};

// Harvest Lifts: grain silos with a hoist wheel hauling a bale up and down
function drawHoist(ctx, cam, world, time, lift) {
  drawCornfield(ctx, cam, time, lift);
  const f = 0.3, span = 760, base = H - 20 + lift * f, off = cam.x * f;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 3; i++) {
    const x = i * span - off + 520;
    for (const [sx, sw, sh] of [[x, 70, 200], [x + 78, 56, 160]]) {
      ctx.fillStyle = '#2a1232';
      ctx.fillRect(sx, base - sh, sw, sh);
      ctx.beginPath(); ctx.ellipse(sx + sw / 2, base - sh, sw / 2, 18, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,190,120,0.07)';
      for (let k = 1; k < 5; k++) ctx.fillRect(sx, base - sh + (k * sh) / 5, sw, 2);
    }
    // the hoist: a gantry arm, a turning wheel and a bale on its rope
    const gx = x + 35, gy = base - 228, wx = gx + 62, wy = gy - 26;
    const haul = Math.sin(time * 0.7 + i) * 0.5 + 0.5;
    ctx.fillStyle = '#2a1232';
    ctx.fillRect(gx - 3, gy - 30, 6, 30); ctx.fillRect(gx - 3, gy - 30, 70, 5);
    ctx.save(); ctx.translate(wx, wy); ctx.rotate(-haul * 9);
    ctx.strokeStyle = '#2a1232'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.283); ctx.stroke();
    for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke(); }
    ctx.restore();
    const ry = wy + 50 + haul * 130;
    ctx.strokeStyle = '#2a1232'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(wx + 11, wy); ctx.lineTo(wx + 11, ry); ctx.stroke();
    ctx.fillStyle = '#3a1c30'; ctx.fillRect(wx + 1, ry, 22, 16);
    ctx.fillStyle = 'rgba(255,200,110,0.14)'; ctx.fillRect(wx + 1, ry + 5, 22, 2); ctx.fillRect(wx + 1, ry + 10, 22, 2);
    glow(x + 35, base - 150, 5, '255,190,100', 0.6);
    glow(x + 106, base - 110, 4, '255,190,100', 0.5);
  }
}

// clumped flame tongues for the Firebreak horizon: [x, half-width, height, speed, phase]
const SCORCH_SPAN = W + 120;
const SCORCH = (() => {
  let seed = 977;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let x = 0; x < SCORCH_SPAN;) {
    // a clump of 2-5 overlapping tongues, then a gap of embers
    const n = 2 + ((r() * 4) | 0);
    for (let i = 0; i < n; i++) {
      out.push({ x: x + r() * 10, w: 5 + r() * 9, h: 12 + r() * 26, sp: 3 + r() * 4, ph: r() * 6.283 });
      x += 6 + r() * 12;
    }
    x += 20 + r() * 70;
  }
  return out;
})();

// Firebreak: a burnt field, a brush fire along the horizon and smoke columns
function drawScorch(ctx, cam, world, time, lift) {
  const hy = H - 250 + lift * 0.2;
  const fl = 0.8 + 0.2 * Math.sin(time * 3.1) * Math.sin(time * 1.3);
  const g = ctx.createLinearGradient(0, hy - 80, 0, hy + 30);
  g.addColorStop(0, 'rgba(255,110,40,0)');
  g.addColorStop(0.7, `rgba(240,100,40,${0.2 * fl})`);
  g.addColorStop(1, 'rgba(240,140,70,0.28)');
  ctx.fillStyle = g; ctx.fillRect(0, hy - 80, W, 110);
  // the fire line: clumps of overlapping tongues of uneven size and spacing, each a
  // soft red outer flame round an orange body and a yellow core (never a row of teeth)
  const layers = [['rgba(200,64,40,0.24)', 1.5, 1.12], ['rgba(240,130,50,0.4)', 1, 1], ['rgba(255,210,120,0.5)', 0.45, 0.6]];
  for (const [col, wk, hk] of layers) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (const f of SCORCH) {
      const x = wrap(f.x - cam.x * 0.1, SCORCH_SPAN) - 60;
      if (x < -60 || x > W + 60) continue;
      const lick = Math.sin(time * f.sp + f.ph) * 0.5 + 0.5;
      const h = f.h * (0.65 + 0.45 * lick) * hk, w = f.w * wk;
      const tip = x + Math.sin(time * f.sp * 1.4 + f.ph * 2) * w * 0.5;
      ctx.moveTo(x - w, hy + 6);
      ctx.bezierCurveTo(x - w * 1.1, hy - h * 0.35, tip - w * 0.4, hy - h * 0.7, tip, hy - h);
      ctx.bezierCurveTo(tip + w * 0.3, hy - h * 0.6, x + w * 1.1, hy - h * 0.3, x + w, hy + 6);
      ctx.closePath();
    }
    ctx.fill();
  }
  for (let k = 0; k < SCORCH.length; k += 4) {
    const x = wrap(SCORCH[k].x - cam.x * 0.1, SCORCH_SPAN) - 60;
    glow(x, hy - 8, 50, '255,130,50', 0.07 * fl);
  }
  // smoke columns leaning with the breeze
  const sf = 0.15, sspan = 520, soff = cam.x * sf;
  for (let i = Math.floor(soff / sspan) - 1; i < Math.floor(soff / sspan) + 3; i++) {
    const x = i * sspan - soff + 200;
    for (let k = 0; k < 8; k++) {
      const ph = (time * 0.04 + k / 8 + Math.abs(i) * 0.37) % 1;
      ctx.fillStyle = `rgba(22,12,18,${0.38 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(x + ph * 90 + Math.sin(time * 0.5 + k) * 10, hy - ph * 320, 18 + ph * 46, 0, 6.283); ctx.fill();
    }
  }
  // charred stubble and dead trees, with embers still glowing on the tips
  const f = 0.5, base = H - 120 + lift * f, off = cam.x * f;
  ctx.strokeStyle = '#1a0a16'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let x = -wrap(off, 18) - 18; x < W + 18; x += 18) {
    const i = Math.round((x + off) / 18), h = 18 + (Math.abs(i * 53) % 26);
    ctx.moveTo(x, base); ctx.lineTo(x + ((i % 3) - 1) * 3, base - h);
  }
  ctx.stroke();
  for (let x = -wrap(off, 18) - 18; x < W + 18; x += 18) {
    const i = Math.round((x + off) / 18);
    const tw = Math.sin(time * 1.7 + i * 2.3);
    if (tw > 0.8) glow(x + ((i % 3) - 1) * 3, base - 18 - (Math.abs(i * 53) % 26), 6, '255,120,40', (tw - 0.8) * 3);
  }
  const span = 560;
  ctx.fillStyle = '#1a0a16'; ctx.lineWidth = 4;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 3; i++) {
    const x = i * span - off + 140;
    ctx.fillRect(x - 4, base - 120, 8, 120);
    ctx.beginPath();
    ctx.moveTo(x, base - 80); ctx.lineTo(x - 34, base - 118); ctx.moveTo(x, base - 100); ctx.lineTo(x + 30, base - 140);
    ctx.moveTo(x - 20, base - 100); ctx.lineTo(x - 26, base - 132); ctx.moveTo(x + 16, base - 116); ctx.lineTo(x + 34, base - 118);
    ctx.stroke();
  }
}

// Night Ferries: a lighthouse sweeping its beam, moored boats with mast lanterns
function drawHarbour(ctx, cam, world, time, lift) {
  const lx = wrap(760 - cam.x * 0.12, W + 300) - 150, base = H - 150 + lift * 0.12, top = base - 190;
  ctx.fillStyle = '#1e2a50';
  ctx.beginPath(); ctx.moveTo(lx - 22, base); ctx.lineTo(lx - 13, top); ctx.lineTo(lx + 13, top); ctx.lineTo(lx + 22, base); ctx.fill();
  ctx.fillStyle = 'rgba(200,80,80,0.35)';
  for (let k = 0; k < 3; k++) {
    const y0 = top + 30 + k * 50, w0 = 13 + (9 * (y0 - top)) / 190, w1 = 13 + (9 * (y0 + 20 - top)) / 190;
    ctx.beginPath(); ctx.moveTo(lx - w0, y0); ctx.lineTo(lx + w0, y0); ctx.lineTo(lx + w1, y0 + 20); ctx.lineTo(lx - w1, y0 + 20); ctx.fill();
  }
  ctx.fillStyle = '#1e2a50';
  ctx.fillRect(lx - 18, top - 4, 36, 6); ctx.fillRect(lx - 10, top - 26, 20, 22);
  ctx.beginPath(); ctx.moveTo(lx - 14, top - 26); ctx.lineTo(lx, top - 42); ctx.lineTo(lx + 14, top - 26); ctx.fill();
  ctx.fillStyle = '#ffe6a8'; ctx.fillRect(lx - 6, top - 22, 12, 14);
  glow(lx, top - 15, 34, '255,230,170', 0.7);
  beams.push(lx, top - 15, time * 0.8);
  ctx.fillStyle = '#18213e';
  ctx.beginPath(); ctx.ellipse(lx, base + 4, 70, 14, 0, 0, 6.283); ctx.fill();
  // moored boats bobbing
  const f = 0.4, span = 360, bb = H - 110 + lift * f, off = cam.x * f;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 4; i++) {
    const x = i * span - off + 90, bob = Math.sin(time * 1.4 + i * 2) * 3, tilt = Math.sin(time * 1.1 + i) * 0.05;
    ctx.save(); ctx.translate(x, bb + bob); ctx.rotate(tilt);
    ctx.fillStyle = '#20284a';
    ctx.beginPath(); ctx.moveTo(-50, -14); ctx.lineTo(50, -14); ctx.quadraticCurveTo(44, 6, 30, 8); ctx.lineTo(-34, 8); ctx.quadraticCurveTo(-48, 4, -50, -14); ctx.fill();
    ctx.fillRect(-14, -30, 26, 16);
    ctx.fillRect(-2, -96, 3, 82);
    ctx.strokeStyle = '#20284a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -96); ctx.lineTo(-48, -14); ctx.moveTo(0, -96); ctx.lineTo(48, -14); ctx.stroke();
    ctx.fillStyle = '#ffd890'; ctx.fillRect(-8, -26, 5, 5); ctx.fillRect(3, -26, 5, 5);
    ctx.restore();
    const sw = Math.sin(time * 1.8 + i) * 4;
    glow(x + sw, bb + bob - 70, 14, '255,200,120', 0.55);
    glow(x, bb + bob - 23, 22, '255,190,110', 0.25);
    ctx.strokeStyle = 'rgba(255,200,120,0.18)'; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) { const ry = bb + 16 + k * 6; ctx.beginPath(); ctx.moveTo(x - 10 + Math.sin(time * 2 + k) * 4, ry); ctx.lineTo(x + 10 + Math.sin(time * 2.6 + k) * 4, ry); ctx.stroke(); }
  }
}

// a toothed gear; `a` is its turn
function gear(ctx, x, y, r, n, a, col, tooth = 9) {
  const s = 6.283 / n;
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let j = 0; j < n; j++) {
    const t0 = a + j * s;
    ctx.lineTo(x + Math.cos(t0) * r, y + Math.sin(t0) * r);
    ctx.lineTo(x + Math.cos(t0 + s * 0.15) * (r + tooth), y + Math.sin(t0 + s * 0.15) * (r + tooth));
    ctx.lineTo(x + Math.cos(t0 + s * 0.45) * (r + tooth), y + Math.sin(t0 + s * 0.45) * (r + tooth));
    ctx.lineTo(x + Math.cos(t0 + s * 0.6) * r, y + Math.sin(t0 + s * 0.6) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,190,0.09)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, 6.283); ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < 5; k++) { const sa = a + (k / 5) * 6.283; ctx.moveTo(x + Math.cos(sa) * r * 0.2, y + Math.sin(sa) * r * 0.2); ctx.lineTo(x + Math.cos(sa) * r * 0.7, y + Math.sin(sa) * r * 0.7); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,220,190,0.12)';
  ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, 6.283); ctx.fill();
}

// Clockwork Yard: a great clock face with a pendulum, and meshing gears
function drawGears(ctx, cam, world, time, lift) {
  const cx = wrap(W * 0.62 - cam.x * 0.08, W + 300) - 150, cy = 140 + lift * 0.04, r = 72;
  ctx.fillStyle = '#26204e';
  ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#3a3270';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * 6.283;
    glow(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10), 5, '255,220,160', 0.45);
  }
  glow(cx, cy, r, '255,220,160', 0.08);
  ctx.strokeStyle = '#1a1438'; ctx.lineCap = 'round';
  const hand = (a, len, wdt) => { ctx.lineWidth = wdt; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); ctx.stroke(); };
  hand(time * 0.02 + 1.3, r * 0.5, 5);
  hand(Math.floor(time) * 0.105, r * 0.78, 3);       // the minute hand ticks
  const sw = Math.sin(time * 2.2) * 0.32;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy + r + 10); ctx.lineTo(cx + Math.sin(sw) * 110, cy + r + 10 + Math.cos(sw) * 110); ctx.stroke();
  ctx.fillStyle = '#1a1438';
  ctx.beginPath(); ctx.arc(cx + Math.sin(sw) * 110, cy + r + 10 + Math.cos(sw) * 110, 13, 0, 6.283); ctx.fill();
  const f = 0.22, span = 620, base = H + 20 + lift * f, off = cam.x * f;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 3; i++) {
    const x = i * span - off + 300, y = base - 200, w = 0.22 * (i % 2 ? 1 : -1);
    gear(ctx, x, y, 90, 16, time * w, '#1e1a44');
    gear(ctx, x + 120, y + 88, 50, 9, -time * w * 16 / 9 + 0.2, '#221d4a');
    gear(ctx, x - 100, y + 96, 40, 7, -time * w * 16 / 7, '#221d4a');
  }
}

// Storm Mill: the mill's waterwheel turning under a spilling flume
function drawWaterwheel(ctx, cam, world, time, lift) {
  const f = 0.3, span = 720, base = H - 40 + lift * f, off = cam.x * f;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 3; i++) {
    const x = i * span - off + 380, wy = base - 84, r = 78;
    ctx.fillStyle = '#161c3a';
    ctx.fillRect(x + 20, base - 170, 160, 170);
    ctx.beginPath(); ctx.moveTo(x + 8, base - 168); ctx.lineTo(x + 100, base - 236); ctx.lineTo(x + 192, base - 168); ctx.fill();
    ctx.fillStyle = '#ffd890'; ctx.fillRect(x + 120, base - 130, 16, 20); ctx.fillRect(x + 60, base - 70, 14, 18);
    glow(x + 128, base - 120, 26, '255,200,120', 0.35); glow(x + 67, base - 61, 22, '255,200,120', 0.3);
    // the flume and the water spilling onto the wheel
    ctx.fillStyle = '#161c3a';
    ctx.fillRect(x - 230, wy - r - 14, 220, 10);
    ctx.fillRect(x - 200, wy - r - 4, 6, 120); ctx.fillRect(x - 120, wy - r - 4, 6, 110);
    ctx.strokeStyle = 'rgba(170,200,240,0.45)'; ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const ph = (time * 2.4 + k / 6) % 1;
      ctx.beginPath(); ctx.moveTo(x - 12 + k * 2, wy - r - 4 + ph * 30); ctx.lineTo(x - 10 + k * 2, wy - r + 6 + ph * 30); ctx.stroke();
    }
    ctx.save(); ctx.translate(x, wy); ctx.rotate(time * 0.6);
    ctx.strokeStyle = '#161c3a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, 6.283); ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.stroke();
    ctx.fillStyle = '#161c3a';
    for (let k = 0; k < 16; k++) { ctx.rotate(6.283 / 16); ctx.fillRect(r - 4, -4, 16, 8); }
    ctx.restore();
    // churned water at the bottom
    ctx.strokeStyle = 'rgba(190,215,250,0.35)'; ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      const ph = (time * 1.5 + k / 5) % 1;
      ctx.beginPath(); ctx.arc(x - 30 + k * 16, wy + r + 6, 4 + ph * 10, Math.PI, 0); ctx.stroke();
    }
  }
}

// Gale Locks: a flight of canal locks at dusk. Far lock gates stepping down the
// canal, a near lock chamber with mitre gates, balance beams, paddle gear and a
// keeper's lamp, then mooring posts on the towpath and pennants that stream out
// when a gust blows.
function drawLocks(ctx, cam, world, time, lift) {
  let gust = 0, dir = -1;
  for (const z of world.windZones ? world.windZones() : []) {
    if (z.rect.x > cam.x + cam.w || z.rect.x + z.rect.w < cam.x) continue;
    if (z.strength > gust) { gust = z.strength; dir = z.dir; }
  }
  // far: the canal running off as a flight of locks, each pound a step lower
  const ff = 0.12, fbase = H - 190 + lift * ff, foff = cam.x * ff, fspan = 260;
  ctx.fillStyle = '#1c323c';
  for (let i = Math.floor(foff / fspan) - 1; i < Math.floor(foff / fspan) + 5; i++) {
    const x = i * fspan - foff, step = (((i % 3) + 3) % 3) * 6;
    ctx.fillRect(x, fbase + step - 8, fspan, 8);
    ctx.fillRect(x + fspan - 10, fbase + step - 30, 8, 30);
    ctx.fillRect(x + fspan - 46, fbase + step - 30, 40, 4);
    ctx.fillStyle = 'rgba(150,200,205,0.16)'; ctx.fillRect(x, fbase + step, fspan, 2); ctx.fillStyle = '#1c323c';
  }
  // the near lock: water, chamber walls and gates
  const f = 0.32, span = 560, wy = H - 112 + lift * f, off = cam.x * f;
  const wg = ctx.createLinearGradient(0, wy - 4, 0, wy + 60);
  wg.addColorStop(0, '#2c5862'); wg.addColorStop(1, '#0e1e26');
  ctx.fillStyle = wg; ctx.fillRect(0, wy - 4, W, 64);
  ctx.fillStyle = 'rgba(170,220,220,0.28)'; ctx.fillRect(0, wy - 4, W, 1.5);
  ctx.strokeStyle = 'rgba(170,225,225,0.22)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 0; k < 14; k++) {
    const rx = wrap(k * 97 - off * 1.1 + Math.sin(time * 0.6 + k) * 8, W + 60) - 30, ry = wy + 4 + (k % 4) * 7;
    ctx.moveTo(rx, ry); ctx.lineTo(rx + 12 + (k % 3) * 6, ry);
  }
  ctx.stroke();
  const dark = '#132229', mid = '#1a2e36';
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 3; i++) {
    const x = i * span - off + 40;
    // chamber walls: coping stones along the water, a step down at each gate
    ctx.fillStyle = mid; ctx.fillRect(x, wy - 22, 300, 18);
    ctx.fillStyle = 'rgba(190,220,215,0.08)';
    for (let k = 0; k < 300; k += 25) ctx.fillRect(x + k, wy - 22, 23, 2);
    for (const [gx, sgn] of [[x + 12, -1], [x + 288, 1]]) {
      // a mitre gate leaf with bracing, and its long balance beam
      ctx.fillStyle = dark;
      ctx.fillRect(gx - 12, wy - 86, 24, 82);
      ctx.strokeStyle = 'rgba(150,190,190,0.14)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gx - 10, wy - 80); ctx.lineTo(gx + 10, wy - 12); ctx.moveTo(gx - 10, wy - 48); ctx.lineTo(gx + 10, wy - 48); ctx.stroke();
      ctx.save(); ctx.translate(gx, wy - 84); ctx.rotate(sgn * -0.07);
      ctx.fillStyle = dark; ctx.fillRect(sgn > 0 ? 0 : -118, -5, 118, 10);
      ctx.restore();
      // paddle gear on the gate's walkway
      ctx.strokeStyle = dark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(gx - sgn * 24, wy - 100, 7, 0, 6.283); ctx.moveTo(gx - sgn * 24, wy - 93); ctx.lineTo(gx - sgn * 24, wy - 86); ctx.stroke();
    }
    // water spilling through the bottom gate's paddles
    ctx.strokeStyle = 'rgba(200,235,235,0.4)'; ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      const ph = (time * 2 + k / 5) % 1;
      ctx.beginPath(); ctx.moveTo(x + 304 + k * 3, wy - 14 + ph * 10); ctx.lineTo(x + 305 + k * 3, wy - 8 + ph * 10); ctx.stroke();
    }
    // the lock-keeper's cottage and lamp
    const hx = x + 360;
    ctx.fillStyle = dark;
    ctx.fillRect(hx, wy - 96, 92, 76);
    ctx.beginPath(); ctx.moveTo(hx - 8, wy - 94); ctx.lineTo(hx + 46, wy - 132); ctx.lineTo(hx + 100, wy - 94); ctx.fill();
    ctx.fillRect(hx + 66, wy - 138, 10, 26);
    ctx.fillStyle = '#ffd890'; ctx.fillRect(hx + 18, wy - 76, 12, 14); ctx.fillRect(hx + 56, wy - 76, 12, 14);
    glow(hx + 24, wy - 69, 26, '255,200,130', 0.3); glow(hx + 62, wy - 69, 22, '255,200,130', 0.22);
    ctx.fillStyle = dark; ctx.fillRect(x + 150, wy - 84, 4, 62); ctx.fillRect(x + 146, wy - 88, 12, 6);
    const fl = 1 + Math.sin(time * 8 + i) * 0.06;
    glow(x + 152, wy - 80, 40 * fl, '255,200,120', 0.25); glow(x + 152, wy - 80, 8, '255,240,190', 0.8);
    ctx.strokeStyle = 'rgba(255,200,120,0.16)'; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) { const ry = wy + 8 + k * 6; ctx.beginPath(); ctx.moveTo(x + 142 + Math.sin(time * 2 + k) * 4, ry); ctx.lineTo(x + 162 + Math.sin(time * 2.6 + k) * 4, ry); ctx.stroke(); }
  }
  // near: mooring bollards along the towpath with slack ropes, and the pennants
  const nf = 0.45, nbase = H - 56 + lift * nf, noff = cam.x * nf, nspan = 150;
  ctx.fillStyle = '#0e1a20'; ctx.strokeStyle = '#0e1a20'; ctx.lineWidth = 2;
  for (let i = Math.floor(noff / nspan) - 1; i < Math.floor(noff / nspan) + 8; i++) {
    const x = i * nspan - noff + 30;
    ctx.fillRect(x - 6, nbase - 26, 12, 26);
    ctx.beginPath(); ctx.ellipse(x, nbase - 26, 9, 4, 0, 0, 6.283); ctx.fill();
    if (i % 2) {
      ctx.beginPath(); ctx.moveTo(x + 6, nbase - 18); ctx.quadraticCurveTo(x + nspan / 2, nbase + 2, x + nspan - 6, nbase - 18); ctx.stroke();
    }
  }
  const pspan = 440;
  for (let i = Math.floor(noff / pspan) - 1; i < Math.floor(noff / pspan) + 4; i++) {
    // the pennant: droops in the calm, streams out with the gust
    const px = i * pspan - noff + 340, py = nbase - 150;
    ctx.fillStyle = '#0e1a20'; ctx.fillRect(px - 2, py, 4, 150);
    const len = 30 + gust * 26, droop = 1.25 * (1 - gust), seg = 6;
    const pt = (u, edge) => {
      const wv = Math.sin(time * (4 + gust * 10) - u * 5 + i) * (2 + gust * 4) * u;
      const a = droop * u, w0 = (1 - u) * 14 + 2;
      return [px + Math.cos(a) * dir * len * u - Math.sin(a) * dir * w0 * edge, py + 2 + Math.sin(a) * len * u + Math.cos(a) * w0 * edge + wv];
    };
    ctx.fillStyle = i % 2 ? '#c8463a' : '#e8b040';
    ctx.beginPath();
    for (let k = 0; k <= seg; k++) ctx.lineTo(...pt(k / seg, 0));
    for (let k = seg; k >= 0; k--) ctx.lineTo(...pt(k / seg, 1));
    ctx.closePath(); ctx.fill();
  }
}

// Moth Mill: a low moon, and the mill's great lantern with moths circling it
function drawMothMoon(ctx, cam, world, time, lift) {
  const mx = wrap(W * 0.66 - cam.x * 0.05, W + 400) - 200, my = 150 + lift * 0.03;
  ctx.fillStyle = '#f2e2f2';
  ctx.beginPath(); ctx.arc(mx, my, 64, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(190,160,200,0.4)';
  ctx.beginPath(); ctx.arc(mx - 18, my - 10, 11, 0, 6.283); ctx.arc(mx + 20, my + 16, 8, 0, 6.283); ctx.arc(mx + 8, my - 24, 5, 0, 6.283); ctx.fill();
  glow(mx, my, 200, '230,200,255', 0.1);
  for (let k = 0; k < 3; k++) {
    const u = wrap(time * 0.05 + k * 0.33, 1);
    drawMothShape(ctx, mx - 150 + u * 300, my - 30 + Math.sin(u * 9 + k) * 30 + k * 18, 5, time * 18 + k, '#2a1440');
  }
  const f = 0.3, span = 680, base = H - 30 + lift * f, off = cam.x * f;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 3; i++) {
    const x = i * span - off + 300;
    ctx.fillStyle = '#24123a';
    ctx.fillRect(x, base - 120, 150, 120);
    ctx.beginPath(); ctx.moveTo(x - 10, base - 118); ctx.lineTo(x + 75, base - 176); ctx.lineTo(x + 160, base - 118); ctx.fill();
    ctx.fillRect(x + 110, base - 230, 26, 120);
    ctx.fillRect(x + 104, base - 238, 38, 8);
    const lx = x + 123, ly = base - 252;
    ctx.fillRect(lx - 10, ly - 12, 20, 4);
    ctx.fillStyle = '#ffd48a'; ctx.fillRect(lx - 7, ly - 8, 14, 16);
    const fl = 1 + Math.sin(time * 9 + i) * 0.06;
    glow(lx, ly, 70 * fl, '255,190,110', 0.25);
    glow(lx, ly, 14 * fl, '255,235,180', 0.8);
    glow(x + 40, base - 70, 18, '255,200,120', 0.35);
    for (let k = 0; k < 6; k++) {
      const a = time * (1.2 + (k % 3) * 0.3) + k * 1.05, rr = 22 + (k % 3) * 9;
      drawMothShape(ctx, lx + Math.cos(a) * rr, ly + Math.sin(a * 1.3) * rr * 0.6, 4.6, time * 22 + k, '#24123a');
    }
  }
}

// a moth silhouette: two pairs of flapping wings on a little body
function drawMothShape(ctx, x, y, s, flap, col) {
  const k = 0.35 + Math.abs(Math.sin(flap)) * 0.65;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x - s * 0.9, y - s * 0.2, s, s * 0.7 * k, -0.5, 0, 6.283);
  ctx.ellipse(x + s * 0.9, y - s * 0.2, s, s * 0.7 * k, 0.5, 0, 6.283);
  ctx.ellipse(x - s * 0.6, y + s * 0.5, s * 0.6, s * 0.45 * k, 0.4, 0, 6.283);
  ctx.ellipse(x + s * 0.6, y + s * 0.5, s * 0.6, s * 0.45 * k, -0.4, 0, 6.283);
  ctx.fill();
  ctx.fillRect(x - s * 0.15, y - s * 0.6, s * 0.3, s * 1.4);
}

// Storm Mill: drive shafts hang from the ceilings, turning the mill's cogs
function drawMillShafts(ctx, cam, world, time) {
  const x0 = Math.floor(cam.x / T) - 1, x1 = x0 + Math.ceil(cam.w / T) + 2;
  for (let tx = x0; tx <= x1; tx++) {
    if (((tx % 9) + 9) % 9 !== 4) continue;
    for (let ty = 1; ty < world.h - 4; ty++) {
      if (!world.isSolid(tx, ty) || world.cell(tx, ty) === EMITTER) continue;
      if (world.isSolid(tx, ty + 1) || world.isSolid(tx, ty + 2) || world.isSolid(tx + 1, ty + 1) || world.isSolid(tx + 1, ty + 2)) continue;
      const x = tx * T + T / 2, y = (ty + 1) * T;
      if (y < cam.y - 80 || y > cam.y + cam.h + 20) continue;
      const spin = time * 1.2 + tx;
      ctx.fillStyle = '#3a2e44'; ctx.fillRect(x - 3, y, 6, 34);
      ctx.fillRect(x - 7, y, 14, 4);
      ctx.save(); ctx.translate(x, y + 36); ctx.scale(1, 0.38);
      gear(ctx, 0, 0, 18, 10, spin, '#4c3c50', 6);
      ctx.restore();
      gear(ctx, x + 27, y + 24, 7, 7, -spin * 10 / 7, '#4c3c50', 4);
      ctx.fillStyle = '#3a2e44'; ctx.fillRect(x + 27, y + 22, 20, 4);
    }
  }
}

// Hay Maze: lanterns swinging on chains under the barn's floors
function drawBarnLanterns(ctx, cam, world, time) {
  const x0 = Math.floor(cam.x / T) - 1, x1 = x0 + Math.ceil(cam.w / T) + 2;
  for (let tx = x0; tx <= x1; tx++) {
    if (((tx % 11) + 11) % 11 !== 5) continue;
    for (let ty = 1; ty < world.h - 4; ty++) {
      if (!world.isSolid(tx, ty) || world.isSolid(tx, ty + 1) || world.isSolid(tx, ty + 2) || world.isSolid(tx, ty + 3)) continue;
      const x = tx * T + T / 2, y = (ty + 1) * T;
      if (y < cam.y - 60 || y > cam.y + cam.h + 20) continue;
      const sw = Math.sin(time * 1.3 + tx * 0.7 + ty) * 0.16;
      const lx = x + Math.sin(sw) * 22, ly = y + Math.cos(sw) * 22;
      ctx.strokeStyle = '#2a1a22'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = '#3a2420';
      ctx.fillRect(lx - 6, ly, 12, 3); ctx.fillRect(lx - 6, ly + 13, 12, 3);
      ctx.fillStyle = '#ffcf7a'; ctx.fillRect(lx - 4.5, ly + 3, 9, 10);
      ctx.fillStyle = '#3a2420'; ctx.fillRect(lx - 0.75, ly + 3, 1.5, 10);
      glow(lx - cam.x, ly + 8 - cam.y, 60, '255,180,90', 0.2);
      glow(lx - cam.x, ly + 8 - cam.y, 12, '255,230,170', 0.6);
    }
  }
}

// ------------------------------------------------------------ world-space details (after decor)
export function drawThemeWorld(ctx, cam, world, time, th) {
  if (th.name === 'tower') drawBells(ctx, cam, world, time);
  if (th.name === 'canal') drawFloatingLanterns(ctx, cam, world, time);
  if (th.name === 'cold') drawSnowSparkle(ctx, cam, world, time);
  if (th.name === 'barn') drawBarnLanterns(ctx, cam, world, time);
  if (world.data && world.data.scene === 'waterwheel') drawMillShafts(ctx, cam, world, time);
  if (th.name === 'works') drawTaperRacks(ctx, cam, world, time);
  if (th.name === 'tower') drawBellRopes(ctx, cam, world, time);
}

// open cells under a ceiling at column tx: yields the ceiling row ty for each
// ceiling with at least `clear` open cells beneath it
function* ceilings(world, tx, clear) {
  for (let ty = 1; ty < world.h - clear - 1; ty++) {
    if (!world.isSolid(tx, ty) || world.cell(tx, ty) === EMITTER) continue;
    let ok = true;
    for (let k = 1; k <= clear && ok; k++) if (world.cell(tx, ty + k) !== 0) ok = false;
    if (ok) yield ty;
  }
}

const TAPER_PAIR = [-2.5, 2.5];
// Candle Works: racks of freshly dipped tapers hanging by their wicks to cool
function drawTaperRacks(ctx, cam, world, time) {
  const x0 = Math.floor(cam.x / T) - 1, x1 = x0 + Math.ceil(cam.w / T) + 2;
  for (let tx = x0; tx <= x1; tx++) {
    if (((tx % 10) + 10) % 10 !== 6) continue;
    for (const ty of ceilings(world, tx, 4)) {
      const x = tx * T + T / 2, y = (ty + 1) * T;
      if (y < cam.y - 80 || y > cam.y + cam.h + 20) continue;
      const sw = Math.sin(time * 0.8 + tx) * 1.2;
      ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x - 18 + sw, y + 12); ctx.moveTo(x + 16, y); ctx.lineTo(x + 14 + sw, y + 12); ctx.stroke();
      ctx.fillStyle = '#3a2216'; ctx.fillRect(x - 24 + sw, y + 11, 48, 3);
      // pairs of tapers hung over the rod by one wick, shaded so they read as round
      for (let k = 0; k < 4; k++) {
        const cx = x - 15 + k * 10 + sw, len = 13 + ((tx * 7 + k * 5) % 3) * 4;
        ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx - 2.5, y + 18); ctx.lineTo(cx, y + 12); ctx.lineTo(cx + 2.5, y + 18); ctx.stroke();
        for (const dx of TAPER_PAIR) {
          const px = cx + dx, l = len - (dx > 0 ? 2 : 0);
          ctx.fillStyle = '#b89870';
          ctx.beginPath();
          ctx.moveTo(px - 1.8, y + 18); ctx.lineTo(px + 1.8, y + 18); ctx.lineTo(px + 1.3, y + 18 + l);
          ctx.quadraticCurveTo(px, y + 21 + l, px - 1.3, y + 18 + l); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#e2cca0'; ctx.fillRect(px - 1.3, y + 18, 1.3, l - 1);
        }
      }
    }
  }
}

// Bell Tower: bell ropes with striped sallies dropping from the floors above
function drawBellRopes(ctx, cam, world, time) {
  const x0 = Math.floor(cam.x / T) - 1, x1 = x0 + Math.ceil(cam.w / T) + 2;
  for (let tx = x0; tx <= x1; tx++) {
    if (((tx % 9) + 9) % 9 !== 2) continue;
    for (const ty of ceilings(world, tx, 4)) {
      const x = tx * T + 10, y = (ty + 1) * T;
      if (y < cam.y - 120 || y > cam.y + cam.h + 20) continue;
      let open = 4;
      while (open < 7 && world.cell(tx, ty + open + 1) === 0) open++;
      const len = open * T - 34, sw = Math.sin(time * 0.7 + tx * 1.3) * 3;
      ctx.strokeStyle = '#6a4a34'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw * 0.4, y + len * 0.5, x + sw, y + len); ctx.stroke();
      // the sally: a striped woollen grip
      const sy = y + len * 0.62, sx = x + sw * 0.62;
      ctx.fillStyle = '#a8302c';
      ctx.beginPath(); ctx.ellipse(sx, sy, 3.6, 10, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#e8d8c0'; ctx.fillRect(sx - 3.4, sy - 4, 6.8, 2); ctx.fillRect(sx - 3.4, sy + 2, 6.8, 2);
    }
  }
}

// Storm Mill: great gear wheels turning on the mill's back walls. Drawn between the
// back wall and the stone (clipped to the walls), so they read as machinery behind.
export function drawWallMotif(ctx, cam, world, th, time) {
  if (!(world.data && world.data.scene === 'waterwheel') || Post.quality < 1) return false;
  const sx = 15 * T, sy = 9 * T;
  const i0 = Math.floor((cam.x - 120) / sx), i1 = Math.floor((cam.x + cam.w + 120) / sx);
  const j0 = Math.floor((cam.y - 120) / sy), j1 = Math.floor((cam.y + cam.h + 120) / sy);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const x = i * sx + 7 * T + ((j & 1) ? 4 * T : 0), y = j * sy + 4 * T;
    const dir = (i + j) & 1 ? 1 : -1;
    gear(ctx, x, y, 62, 14, time * 0.18 * dir, 'rgba(10,8,26,0.5)', 10);
    gear(ctx, x + 98, y + 40, 30, 8, -time * 0.18 * dir * 14 / 8 + 0.2, 'rgba(10,8,26,0.45)', 8);
    ctx.strokeStyle = 'rgba(10,8,26,0.5)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 6 * T); ctx.stroke();
  }
  return true;
}

function drawBells(ctx, cam, world, time) {
  // a great bell hangs under the middle of every floor slab
  for (let ty = 2; ty < world.h - 3; ty++) {
    const tx = Math.floor(world.w / 2);
    if (!world.isSolid(tx, ty) || world.isSolid(tx, ty + 1) || world.isSolid(tx, ty + 3)) continue;
    const x = tx * T + T / 2, y = (ty + 1) * T;
    if (y < cam.y - 80 || y > cam.y + cam.h + 40) continue;
    const sw = Math.sin(time * 0.9 + ty) * 0.18;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sw);
    ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.stroke();
    const g = ctx.createLinearGradient(-26, 0, 26, 0);
    g.addColorStop(0, '#6a4a2a'); g.addColorStop(0.45, '#c8964a'); g.addColorStop(1, '#5a3a22');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#1c0d2a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, 16); ctx.quadraticCurveTo(-14, 30, -26, 52); ctx.lineTo(26, 52); ctx.quadraticCurveTo(14, 30, 10, 16); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a6030'; ctx.fillRect(-27, 49, 54, 5);
    ctx.fillStyle = '#4a3420'; ctx.beginPath(); ctx.arc(Math.sin(time * 1.3 + ty) * 6, 56, 5, 0, 6.283); ctx.fill();
    ctx.restore();
  }
}

function drawFloatingLanterns(ctx, cam, world, time) {
  const y = world.pxH - T - 12;
  if (y > cam.y + cam.h) return;
  for (let i = 0; i < 9; i++) {
    const x = cam.x + wrap(i * 173 + time * (8 + (i % 3) * 3), cam.w + 200) - 100;
    const tx = Math.floor(x / T);
    if (world.cell(tx, world.h - 2) !== 0) continue;     // only on open water
    const by = y + Math.sin(time * 1.5 + i) * 2;
    ctx.fillStyle = '#c8402a';
    ctx.beginPath(); ctx.moveTo(x - 7, by); ctx.lineTo(x + 7, by); ctx.lineTo(x + 5, by - 8); ctx.lineTo(x - 5, by - 8); ctx.fill();
    ctx.fillStyle = '#ffd890'; ctx.fillRect(x - 2, by - 7, 4, 5);
    glow(x - cam.x, by - 5 - cam.y, 18, '255,190,100', 0.45);
  }
}

function drawSnowSparkle(ctx, cam, world, time) {
  const x0 = Math.floor(cam.x / T), x1 = x0 + Math.ceil(cam.w / T);
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = 1; ty < world.h - 1; ty++) {
      if (!world.isSolid(tx, ty) || world.isSolid(tx, ty - 1)) continue;
      const k = (tx * 7919 + ty * 104729) % 97;
      const tw = Math.sin(time * 2.2 + k);
      if (tw > 0.93) glow(tx * T + (k % 28) + 2 - cam.x, ty * T + 1 - cam.y, 5, '220,235,255', (tw - 0.93) * 12);
      break;
    }
  }
}

// ------------------------------------------------------------ particles, timers, sounds
export function updateThemeFx(dt, P, cam, world, player, th, sfx) {
  const s = state(world);
  const rnd = Math.random;
  switch (th.name) {
    case 'harvest': case 'canal':
      if (rnd() < (th.name === 'canal' ? 1.8 : 3) * dt) P.firefly(cam.x + rnd() * cam.w, cam.y + cam.h * (0.35 + rnd() * 0.5));
      break;
    case 'barn':
      if (rnd() < 6 * dt) P.straw(cam.x + rnd() * cam.w, cam.y - 10);
      break;
    case 'castle': case 'fair':
      if (rnd() < 5 * dt) P.ember(cam.x + rnd() * cam.w, cam.y + cam.h + 10, 0.5, 0);
      break;
    case 'cold':
      s.breath -= dt;
      if (player.alive && s.breath <= 0) {
        s.breath = 1.1 + rnd() * 0.6;
        P.breath(player.cx + player.facing * 10, player.y + 12, player.facing);
      }
      break;
    case 'rain':
      s.bolt = Math.max(0, s.bolt - dt * 3.5);
      s.nextBolt -= dt;
      if (s.nextBolt <= 0) {
        s.nextBolt = 7 + rnd() * 9;
        s.bolt = 1; s.boltX = 0.15 + rnd() * 0.7; s.seed = (rnd() * 1e9) | 1;
        s.thunder = 0.5 + rnd() * 1.2;
      }
      if (s.thunder > 0 && (s.thunder -= dt) <= 0) sfx('thunder');
      break;
    case 'works':
      if (rnd() < 4 * dt) P.steam(cam.x + rnd() * cam.w, cam.y + rnd() * cam.h * 0.4);
      if (rnd() < 3 * dt) P.ember(cam.x + rnd() * cam.w, cam.y + cam.h + 10, 0.4, 0);
      break;
    case 'tower':
      s.chime -= dt;
      if (s.chime <= 0) { s.chime = 9 + rnd() * 8; sfx('bell'); }
      break;
  }
  switch (world.data && world.data.scene) {
    case 'scorch':
      if (rnd() < 6 * dt) P.ember(cam.x + rnd() * cam.w, cam.y + cam.h + 10, 0.5, 20);
      if (rnd() < 3 * dt) P.ash(cam.x + rnd() * cam.w, cam.y + rnd() * cam.h * 0.3);
      break;
    case 'mothmoon':
      if (rnd() < 4 * dt) P.mote(cam.x + rnd() * cam.w, cam.y + cam.h * (0.3 + rnd() * 0.6));
      break;
    case 'gears':
      if (rnd() < 1.5 * dt) P.steam(cam.x + rnd() * cam.w, cam.y + cam.h * 0.2 + rnd() * cam.h * 0.3);
      break;
  }
  if (th.name === 'fair') {
    for (const f of s.fw) f.t += dt;
    s.fw = s.fw.filter((f) => f.t < 1.6);
    s.nextFw -= dt;
    if (s.nextFw <= 0) {
      s.nextFw = 1.2 + rnd() * 2.2;
      s.fw.push({ x: 80 + rnd() * (W - 160), y: 50 + rnd() * 140, t: 0, c: ['255,120,90', '255,220,120', '140,230,255', '200,140,255'][(rnd() * 4) | 0] });
    }
  }
}

// Clip to open sky (screen space): one rect per run of columns sharing a skyline.
// Returns false when no sky is in view.
function clipToSky(ctx, cam, world) {
  const top = skyline(world);
  const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(world.w - 1, Math.floor((cam.x + cam.w) / T));
  ctx.beginPath();
  let any = false;
  for (let tx = x0; tx <= x1;) {
    const ty = top[tx];
    let e = tx;
    while (e + 1 <= x1 && top[e + 1] === ty) e++;
    const yb = ty * T - cam.y;
    if (yb > 0) { ctx.rect(tx * T - cam.x, 0, (e - tx + 1) * T, yb); any = true; }
    tx = e + 1;
  }
  if (any) ctx.clip();
  return any;
}

// The aurora at half resolution, cut to the open sky by a tile-res mask that is
// smoothed on upscale, so where a roof (even an unlit one) hides it, it melts away.
let aur = null, actx = null, smask = null, sctx = null, simg = null;
function drawAuroraMasked(ctx, cam, world, time, lift) {
  if (!aur) {
    aur = document.createElement('canvas'); aur.width = W / 2; aur.height = H / 2; actx = aur.getContext('2d');
  }
  const top = skyline(world);
  const x0 = Math.floor(cam.x / T) - 1, y0 = Math.floor(cam.y / T) - 1;
  const cw = Math.ceil(W / T) + 3, ch = Math.ceil(H / T) + 3;
  if (!smask || smask.width !== cw || smask.height !== ch) {
    smask = document.createElement('canvas'); smask.width = cw; smask.height = ch;
    sctx = smask.getContext('2d'); simg = sctx.createImageData(cw, ch);
  }
  const d = simg.data;
  let any = false;
  // open sky per cell, softened sideways by a 1-2-1 blur across columns
  const sky = (i, j) => (y0 + j < top[clamp(x0 + i, 0, world.w - 1)] ? 255 : 0);
  for (let i = 0; i < cw; i++) {
    for (let j = 0; j < ch; j++) {
      const o = (j * cw + i) * 4;
      const a = (sky(i - 1, j) + 2 * sky(i, j) + sky(i + 1, j)) >> 2;
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = a;
      if (a) any = true;
    }
  }
  if (!any) return;
  sctx.putImageData(simg, 0, 0);
  actx.setTransform(1, 0, 0, 1, 0, 0);
  actx.globalCompositeOperation = 'source-over';
  actx.clearRect(0, 0, aur.width, aur.height);
  actx.setTransform(0.5, 0, 0, 0.5, 0, 0);
  drawAurora(actx, cam, time, lift);
  actx.globalCompositeOperation = 'destination-in';
  actx.imageSmoothingEnabled = true;
  actx.drawImage(smask, x0 * T - cam.x, y0 * T - cam.y, cw * T, ch * T);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.6;
  ctx.drawImage(aur, 0, 0, W, H);
  ctx.restore();
}

// ------------------------------------------------------------ after the darkness: queued glows + screen effects
export function drawThemeOverlay(ctx, world, time, th) {
  for (let i = 0; i < beams.length; i += 3) {
    // the beam swings round: long when side-on, short when pointing at us
    const x = beams[i], y = beams[i + 1], c = Math.cos(beams[i + 2]);
    const len = 520 * Math.abs(c), dir = c > 0 ? 1 : -1;
    if (len < 20) continue;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(x, y, x + dir * len, y);
    g.addColorStop(0, 'rgba(255,235,180,0.22)');
    g.addColorStop(1, 'rgba(255,235,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + dir * len, y - 46); ctx.lineTo(x + dir * len, y + 30); ctx.lineTo(x, y + 4); ctx.fill();
    ctx.restore();
  }
  if (glows.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < glows.length; i += 5) {
      const x = glows[i], y = glows[i + 1], r = glows[i + 2], rgb = glows[i + 3], a = glows[i + 4];
      if (x < -r || x > W + r || y < -r || y > H + r || a <= 0.01) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${clamp(a, 0, 1)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  if (th.name === 'rain') {
    const s = state(world);
    if (s.bolt > 0) {
      ctx.fillStyle = `rgba(210,220,255,${0.16 * s.bolt * (Settings.get().reduceFlash ? 0.2 : 1)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  if (th.name === 'cold' && skyCam) {
    // the aurora is light itself, so it rides over the darkness, but only in open
    // sky: it is clipped to the space above the first roof or ledge in each column
    if (Post.quality >= 1) drawAuroraMasked(ctx, skyCam, world, time, skyLift);
    else {
      ctx.save();
      if (clipToSky(ctx, skyCam, world)) { ctx.globalAlpha = 0.6; drawAurora(ctx, skyCam, time, skyLift); }
      ctx.restore();
    }
    // frost creeping in at the screen corners
    ctx.save();
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 190);
      g.addColorStop(0, 'rgba(200,220,255,0.22)');
      g.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 190, cy - 190, 380, 380);
    }
    ctx.restore();
  }
}
