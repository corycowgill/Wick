// Procedural world art: sky, parallax town, tiles, props, entities, signs.
// "Painted by torchlight": bold dark outlines, flat painterly shading.
import { CFG, clamp, lerp } from '../config.js';
import { STONE, ONEWAY, BLOB, COBWEB, GATE, EMITTER } from '../physics.js';
import { drawFlame } from './draw-wick.js';

const T = CFG.TILE;
const OUT = '#1c0d2a';
let sprites = null;
let parallax = null;

// ------------------------------------------------------------ helpers
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ------------------------------------------------------------ tile sprites (2x)
function buildSprites() {
  const S = 2, P = T * S;
  const make = (fn) => { const c = canvas(P, P); const g = c.getContext('2d'); g.scale(S, S); fn(g); return c; };
  const cobbles = (g, r) => {
    g.fillStyle = '#3c2140'; g.fillRect(0, 0, T, T);
    const cols = ['#83566a', '#76495f', '#8f6176', '#6d4459'];
    const rows = 3;
    for (let row = 0; row < rows; row++) {
      let x = row % 2 ? -8 : -2;
      const y = row * (T / rows) + 1;
      while (x < T) {
        const w = 9 + r() * 9;
        g.fillStyle = cols[(r() * cols.length) | 0];
        roundRect(g, x + 1, y + 0.5, w - 2, T / rows - 2, 3);
        g.fill();
        g.fillStyle = 'rgba(255,220,200,0.12)';
        g.fillRect(x + 3, y + 1.5, w - 7, 1.5);
        x += w;
      }
    }
  };
  const stone = [], top = [];
  for (let v = 0; v < 4; v++) {
    stone.push(make((g) => cobbles(g, rng(11 + v * 7))));
    top.push(make((g) => {
      const r = rng(91 + v * 13);
      cobbles(g, r);
      // leaf litter and moss on top
      g.fillStyle = '#b9542a'; g.fillRect(0, 0, T, 6);
      g.fillStyle = '#8f3a24'; g.fillRect(0, 5, T, 2);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = ['#e89a32', '#d4462c', '#f0c040', '#c9632a', '#3a8a84'][(r() * 5) | 0];
        g.beginPath(); g.ellipse(r() * T, 1 + r() * 4, 2.2 + r() * 1.6, 1.3, r() * 3, 0, 6.283); g.fill();
      }
      g.strokeStyle = '#c9a03a'; g.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const x = 3 + r() * (T - 6);
        g.beginPath(); g.moveTo(x, 1); g.lineTo(x - 1.5, -3); g.moveTo(x + 1, 1); g.lineTo(x + 2.5, -2.5); g.stroke();
      }
    }));
  }
  const plank = make((g) => {
    g.fillStyle = '#a8643a'; g.fillRect(0, 0, T, 9);
    g.fillStyle = '#c47e48'; g.fillRect(0, 0, T, 2.5);
    g.fillStyle = '#6c3a24'; g.fillRect(15, 0, 1.5, 9); g.fillRect(0, 8, T, 1.5);
    g.fillStyle = '#3a2430'; g.fillRect(4, 3.5, 1.6, 1.6); g.fillRect(26, 3.5, 1.6, 1.6);
    g.strokeStyle = '#6c3a24'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(6, 9); g.lineTo(12, 17); g.moveTo(26, 9); g.lineTo(20, 17); g.stroke();
  });
  const emitter = make((g) => {
    cobbles(g, rng(5));
    g.fillStyle = '#2a1830'; g.fillRect(6, T - 6, T - 12, 6);
    g.fillStyle = '#3a9a94'; g.fillRect(4, T - 8, T - 8, 2.5);
    g.fillStyle = '#2f7f7c';
    for (const x of [7, 14, 21]) { g.beginPath(); g.ellipse(x + 2, T - 4, 1.6, 3, 0, 0, 6.283); g.fill(); }
  });
  const gate = make((g) => {
    g.fillStyle = '#5a2e1c'; g.fillRect(0, 0, T, T);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#8e4a2a' : '#9c5632';
      g.fillRect(i * 8 + 0.5, 0, 7, T);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(i * 8 + 5.5, 0, 1.5, T);
    }
    g.fillStyle = '#4a3a4e'; g.fillRect(0, 5, T, 4); g.fillRect(0, T - 9, T, 4);
    g.fillStyle = '#8a7a90'; g.fillRect(4, 6, 2, 2); g.fillRect(26, 6, 2, 2); g.fillRect(4, T - 8, 2, 2); g.fillRect(26, T - 8, 2, 2);
  });
  return { stone, top, plank, emitter, gate };
}

// ------------------------------------------------------------ parallax strips
const STRIP_W = 2400;
function buildParallax() {
  const layers = [];
  // far rooftops
  layers.push(houseStrip(260, '#4a2464', '#5a2c70', 0.18, 3, 0.06));
  // near rooftops
  layers.push(houseStrip(300, '#311748', '#3c1d56', 0.36, 7, 0.22));
  return layers;
}

function houseStrip(height, col, roofCol, factor, seed, windowChance) {
  const c = canvas(STRIP_W, height);
  const g = c.getContext('2d');
  const r = rng(seed * 977);
  let x = 0;
  while (x < STRIP_W) {
    const w = 70 + r() * 110;
    const h = 70 + r() * (height - 130);
    const y = height - h;
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
    // roof
    g.fillStyle = roofCol;
    if (r() < 0.6) {
      g.beginPath(); g.moveTo(x - 6, y + 2); g.lineTo(x + w / 2, y - 26 - r() * 30); g.lineTo(x + w + 6, y + 2); g.fill();
    } else {
      g.fillRect(x - 4, y - 6, w + 8, 8);
    }
    if (r() < 0.6) { g.fillStyle = col; g.fillRect(x + w * (0.2 + r() * 0.5), y - 40, 10, 34); }
    // windows: warm, a few lit
    for (let wy = y + 22; wy < height - 20; wy += 30) {
      for (let wx = x + 12; wx < x + w - 18; wx += 26) {
        if (r() < windowChance + 0.18) {
          const lit = r() < 0.55;
          g.fillStyle = lit ? (r() < 0.5 ? '#ffb24a' : '#f08a38') : 'rgba(20,8,30,0.5)';
          g.fillRect(wx, wy, 9, 12);
          if (lit) { g.fillStyle = 'rgba(255,190,90,0.18)'; g.fillRect(wx - 4, wy - 4, 17, 20); }
        }
      }
    }
    x += w + r() * 14;
  }
  return { canvas: c, factor, height };
}

// ------------------------------------------------------------ sky + background
export function drawBackground(ctx, cam, world, time) {
  if (!parallax) parallax = buildParallax();
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  const night = clamp((world.ambient - 0.74) / 0.2, 0, 1);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, lerpColor('#2a1652', '#140a30', night));
  sky.addColorStop(0.45, lerpColor('#6e2c6c', '#3a1a55', night));
  sky.addColorStop(0.8, lerpColor('#d8606a', '#7a3062', night));
  sky.addColorStop(1, lerpColor('#f39a5a', '#b04a5a', night));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const lift = Math.max(0, world.pxH - H - cam.y);   // how far the camera is above the bottom
  // stars
  if (night > 0.2) {
    const r = rng(42);
    for (let i = 0; i < 60; i++) {
      const sx = (r() * W * 2 - cam.x * 0.02) % W;
      const sy = r() * H * 0.5 + lift * 0.02;
      const a = night * (0.3 + 0.5 * Math.abs(Math.sin(time * (0.5 + r()) + i)));
      ctx.fillStyle = `rgba(255,235,220,${a})`;
      ctx.fillRect(sx < 0 ? sx + W : sx, sy, 1.6, 1.6);
    }
  }
  // low sun
  const sunY = H * 0.78 + lift * 0.05;
  const sun = ctx.createRadialGradient(W * 0.3, sunY, 10, W * 0.3, sunY, 260);
  sun.addColorStop(0, `rgba(255,200,140,${0.55 - night * 0.35})`);
  sun.addColorStop(1, 'rgba(255,140,120,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  // castle on the hill
  const baseY = H * 0.86 + lift * 0.08;
  drawCastle(ctx, W * 0.72 - (cam.x * 0.04) % 400, baseY, time, world);

  // rooftop strips
  for (const L of parallax) {
    const ox = -((cam.x * L.factor) % STRIP_W);
    const y = H - L.height + 40 + lift * L.factor * 0.9 + (L.factor > 0.3 ? 30 : 0);
    ctx.drawImage(L.canvas, ox, y);
    ctx.drawImage(L.canvas, ox + STRIP_W, y);
  }
  // bunting and lanterns
  if (!world.data.finale) drawBunting(ctx, cam, time, lift);
}

function drawCastle(ctx, x, baseY, time, world) {
  ctx.fillStyle = '#3a1c58';
  ctx.beginPath();
  ctx.ellipse(x, baseY + 60, 420, 120, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#2e1648';
  const towers = [[-110, 120, 34], [-60, 90, 60], [0, 170, 44], [55, 110, 70], [110, 140, 32]];
  for (const [dx, h, w] of towers) {
    const tx = x + dx - w / 2, ty = baseY - 10 - h;
    ctx.fillRect(tx, ty, w, h + 20);
    for (let i = 0; i < w; i += 10) ctx.fillRect(tx + i, ty - 7, 6, 8);
    if (h > 120) {
      ctx.beginPath(); ctx.moveTo(tx - 4, ty - 6); ctx.lineTo(tx + w / 2, ty - 50); ctx.lineTo(tx + w + 4, ty - 6); ctx.fill();
    }
    ctx.fillStyle = '#ffb04a';
    ctx.fillRect(tx + w / 2 - 3, ty + 24, 6, 9);
    ctx.fillStyle = '#2e1648';
  }
  // the great torch atop the keep
  const fx = x, fy = baseY - 10 - 170 - 52;
  const lit = world.goal && world.goal.lit && world.data.finale;
  const glow = ctx.createRadialGradient(fx, fy, 2, fx, fy, lit ? 160 : 40);
  glow.addColorStop(0, lit ? 'rgba(255,200,110,0.9)' : 'rgba(255,150,80,0.5)');
  glow.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(fx - 170, fy - 170, 340, 340);
}

function drawBunting(ctx, cam, time, lift) {
  const f = 0.6, span = 340;
  const off = cam.x * f;
  const first = Math.floor(off / span) - 1;
  const y0 = 70 + lift * 0.5;
  const flagCols = ['#c8322e', '#e8b03a', '#2f8a86', '#e2652c'];
  for (let i = first; i < first + 5; i++) {
    const x0 = i * span - off;
    const x1 = x0 + span;
    const sag = 34 + Math.sin(time * 0.8 + i) * 3;
    ctx.strokeStyle = '#1c0d2a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 + sag * 2, x1, y0); ctx.stroke();
    for (let k = 1; k < 10; k++) {
      const t = k / 10;
      const px = lerp(x0, x1, t);
      const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 + sag * 2) + t * t * y0;
      ctx.fillStyle = flagCols[(k + i * 3) & 3];
      const sw = Math.sin(time * 2 + k + i) * 2;
      ctx.beginPath(); ctx.moveTo(px - 7, py); ctx.lineTo(px + 7, py); ctx.lineTo(px + sw, py + 16); ctx.fill();
    }
    // a paper lantern at the middle
    const lx = (x0 + x1) / 2, ly = y0 + sag;
    ctx.fillStyle = 'rgba(255,170,80,0.25)';
    ctx.beginPath(); ctx.arc(lx, ly + 14, 22, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#f08a38'; roundRect(ctx, lx - 8, ly + 4, 16, 20, 6); ctx.fill();
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(lx - 3, ly + 8, 6, 12);
  }
}

// ------------------------------------------------------------ tiles
const stoneLike = (k) => k === STONE || k === EMITTER;

export function drawTiles(ctx, cam, world, lights) {
  if (!sprites) sprites = buildSprites();
  const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(world.w - 1, Math.floor((cam.x + cam.w) / T));
  const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(world.h - 1, Math.floor((cam.y + cam.h) / T));
  const visLights = lights.filter((l) => !l.dim);
  const lit = (tx, ty) => {
    const cx = (tx + 0.5) * T, cy = (ty + 0.5) * T;
    for (const l of visLights) {
      const dx = cx - l.x, dy = cy - l.y, r = l.r * 0.95 + 16;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  };
  const edges = new Path2D();
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const k = world.cell(tx, ty);
      if (k === 0 || k === BLOB || k === COBWEB) continue;
      if (world.isDark(tx, ty) && !lit(tx, ty)) continue;
      const px = tx * T, py = ty * T;
      const v = ((tx * 7 + ty * 13) & 3);
      if (k === STONE) {
        const open = !stoneLike(world.cell(tx, ty - 1)) && world.cell(tx, ty - 1) !== GATE;
        ctx.drawImage(open ? sprites.top[v] : sprites.stone[v], px, py, T, T);
      } else if (k === EMITTER) {
        ctx.drawImage(sprites.emitter, px, py, T, T);
      } else if (k === ONEWAY) {
        ctx.drawImage(sprites.plank, px, py, T, T);
        continue;
      } else if (k === GATE) {
        ctx.drawImage(sprites.gate, px, py, T, T);
      }
      // outline edges facing open space
      if (!stoneLike(world.cell(tx, ty - 1)) && k !== GATE) { edges.moveTo(px, py); edges.lineTo(px + T, py); }
      if (!stoneLike(world.cell(tx, ty + 1)) && k !== GATE) { edges.moveTo(px, py + T); edges.lineTo(px + T, py + T); }
      if (!stoneLike(world.cell(tx - 1, ty))) { edges.moveTo(px, py); edges.lineTo(px, py + T); }
      if (!stoneLike(world.cell(tx + 1, ty))) { edges.moveTo(px + T, py); edges.lineTo(px + T, py + T); }
    }
  }
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke(edges);
}

// ------------------------------------------------------------ props
export function drawProps(ctx, cam, world, time) {
  for (const p of world.props) {
    if (p.x < cam.x - 80 || p.x > cam.x + cam.w + 80) continue;
    if (world.isDark(p.tx, p.ty)) continue;
    const x = p.x, y = p.y;
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    switch (p.kind) {
      case 'hay': {
        ctx.fillStyle = '#d9a640';
        ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.quadraticCurveTo(x - 18, y - 30, x, y - 30);
        ctx.quadraticCurveTo(x + 18, y - 30, x + 18, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#a8782a'; ctx.lineWidth = 1.2;
        for (let i = -12; i <= 12; i += 6) { ctx.beginPath(); ctx.moveTo(x + i, y - 2); ctx.lineTo(x + i * 0.7, y - 24); ctx.stroke(); }
        ctx.fillStyle = '#b5342e'; ctx.fillRect(x - 17, y - 14, 34, 3);
        break;
      }
      case 'barrel': {
        ctx.fillStyle = '#8a4c2c';
        roundRect(ctx, x - 11, y - 28, 22, 28, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#4a3040'; ctx.fillRect(x - 11, y - 22, 22, 3); ctx.fillRect(x - 11, y - 9, 22, 3);
        break;
      }
      case 'crate': {
        ctx.fillStyle = '#a06a3a'; ctx.fillRect(x - 13, y - 26, 26, 26); ctx.strokeRect(x - 13, y - 26, 26, 26);
        ctx.strokeStyle = '#6a3e22'; ctx.beginPath(); ctx.moveTo(x - 12, y - 25); ctx.lineTo(x + 12, y - 1);
        ctx.moveTo(x + 12, y - 25); ctx.lineTo(x - 12, y - 1); ctx.stroke();
        break;
      }
      case 'banner': {
        ctx.fillStyle = '#4a2c2a'; ctx.fillRect(x - 2, y - 70, 4, 70);
        const sw = Math.sin(time * 1.6 + x) * 2;
        ctx.fillStyle = '#b8302c';
        ctx.beginPath(); ctx.moveTo(x + 2, y - 66); ctx.lineTo(x + 24, y - 66); ctx.lineTo(x + 24 + sw, y - 34);
        ctx.lineTo(x + 13 + sw, y - 40); ctx.lineTo(x + 2 + sw * 0.5, y - 34); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8b03a'; ctx.fillRect(x + 2, y - 66, 22, 3);
        break;
      }
    }
  }
}

// ------------------------------------------------------------ entities
export function drawEntities(ctx, cam, world, time) {
  const inView = (x, y, m = 80) => x > cam.x - m && x < cam.x + cam.w + m && y > cam.y - m && y < cam.y + cam.h + m * 2;
  for (const e of world.entities) {
    switch (e.type) {
      case 'torch': if (inView(e.x, e.y)) drawTorch(ctx, e, time); break;
      case 'pumpkin': if (inView(e.x, e.y)) drawPumpkin(ctx, e, time); break;
      case 'goal': if (inView(e.x, e.y, 200)) drawGoal(ctx, e, time); break;
      case 'drip': if (inView(e.x, e.y, 300)) drawDrips(ctx, e); break;
      case 'cobweb': if (inView(e.x, e.y)) drawCobweb(ctx, e, time); break;
      case 'fuse': if (inView(e.x, e.y)) drawFuse(ctx, e, world, time); break;
      case 'gate': if (inView(e.x, e.y) && e.state === 'burning') drawGateFire(ctx, e, time); break;
    }
  }
  for (const b of world.blobs) drawBlob(ctx, b, time);
}

function drawTorch(ctx, e, time) {
  const x = e.x, y = e.y;
  ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.fillStyle = '#5a3424';
  ctx.fillRect(x - 3, y - 50, 6, 50); ctx.strokeRect(x - 3, y - 50, 6, 50);
  ctx.fillStyle = '#3a2a3e';
  ctx.beginPath(); ctx.moveTo(x - 11, y - 56); ctx.lineTo(x + 11, y - 56); ctx.lineTo(x + 6, y - 46); ctx.lineTo(x - 6, y - 46);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6a5a70'; ctx.fillRect(x - 11, y - 57, 22, 3);
  if (e.lit) {
    const grow = Math.min(1, e.litTime * 3);
    drawFlame(ctx, x, y - 55, (8 + Math.sin(time * 9 + x) * 0.8) * (0.4 + 0.6 * grow), Math.sin(time * 2 + x) * 0.2, time + x);
  } else {
    const a = 0.5 + 0.4 * Math.sin(time * 3 + x);
    ctx.fillStyle = `rgba(255,90,40,${a})`;
    ctx.beginPath(); ctx.arc(x, y - 57, 2.5, 0, 6.283); ctx.fill();
  }
}

function drawPumpkin(ctx, e, time) {
  const x = e.x, y = e.y;
  const bounce = e.taken ? 0 : Math.abs(Math.sin(time * 2.5 + x)) * 1.5;
  const cy = y - 12 - bounce;
  ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.fillStyle = '#5a6a2a';
  ctx.fillRect(x - 2, cy - 15, 4, 6);
  ctx.fillStyle = e.taken ? '#c8601c' : '#e0701e';
  ctx.beginPath(); ctx.ellipse(x, cy, 15, 12, 0, 0, 6.283); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#a84c14'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(x, cy, 6, 12, 0, 0, 6.283); ctx.stroke();
  // carved face: glowing once lit
  const glow = e.taken ? `rgba(255,${200 + Math.sin(time * 12) * 30 | 0},90,1)` : `rgba(255,170,70,${0.45 + 0.25 * Math.sin(time * 4)})`;
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.moveTo(x - 9, cy - 2); ctx.lineTo(x - 5, cy - 7); ctx.lineTo(x - 2, cy - 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 9, cy - 2); ctx.lineTo(x + 5, cy - 7); ctx.lineTo(x + 2, cy - 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 9, cy + 3); ctx.lineTo(x - 5, cy + 6); ctx.lineTo(x, cy + 4); ctx.lineTo(x + 5, cy + 6);
  ctx.lineTo(x + 9, cy + 3); ctx.lineTo(x, cy + 8); ctx.closePath(); ctx.fill();
}

function drawGoal(ctx, e, time) {
  const x = e.x, y = e.y;
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
  ctx.fillStyle = '#6a4a5c';
  ctx.fillRect(x - 16, y - 60, 32, 60); ctx.strokeRect(x - 16, y - 60, 32, 60);
  ctx.fillStyle = '#7e5a6e'; ctx.fillRect(x - 22, y - 66, 44, 8); ctx.strokeRect(x - 22, y - 66, 44, 8);
  ctx.fillStyle = '#3a2a3e';
  ctx.beginPath(); ctx.moveTo(x - 26, y - 82); ctx.lineTo(x + 26, y - 82); ctx.lineTo(x + 16, y - 66); ctx.lineTo(x - 16, y - 66);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8b03a'; ctx.fillRect(x - 26, y - 84, 52, 3);
  ctx.fillStyle = '#b8302c'; ctx.fillRect(x - 6, y - 48, 12, 30);
  ctx.fillStyle = '#e8b03a'; ctx.fillRect(x - 6, y - 48, 12, 3);
  if (e.lit) {
    const g = Math.min(1, e.litTime * 2);
    drawFlame(ctx, x - 7, y - 82, 13 * g, Math.sin(time * 2) * 0.2, time);
    drawFlame(ctx, x + 7, y - 82, 13 * g, Math.sin(time * 2.3) * 0.2, time + 1);
    drawFlame(ctx, x, y - 82, 20 * g, Math.sin(time * 1.7) * 0.15, time + 2);
  } else {
    ctx.fillStyle = `rgba(255,90,40,${0.5 + 0.4 * Math.sin(time * 3)})`;
    ctx.beginPath(); ctx.arc(x, y - 84, 4, 0, 6.283); ctx.fill();
  }
}

function drawBlob(ctx, b, time) {
  const sag = b.sag;
  const x = b.x, y = b.drawY;
  const h = T * (1 - sag * 0.55), wob = sag * 5;
  const top = y + (T - h);
  ctx.fillStyle = sag > 0 ? `rgb(${242 - sag * 20 | 0},${220 - sag * 30 | 0},${174 - sag * 30 | 0})` : '#f2dcae';
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x - wob, y + T);
  ctx.quadraticCurveTo(x - 1 - wob * 0.5, top + 4, x + 6, top + 1);
  ctx.quadraticCurveTo(x + T / 2, top - 3 + sag * 3, x + T - 6, top + 1);
  ctx.quadraticCurveTo(x + T + 1 + wob * 0.5, top + 4, x + T + wob, y + T);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff4d8';
  ctx.beginPath(); ctx.ellipse(x + 10, top + 6, 5, 2.2, -0.2, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#d8b884';
  ctx.fillRect(x + 4, y + T - 6, T - 8, 3);
  // drips on the sides
  ctx.fillStyle = '#f2dcae';
  const d = 4 + sag * 8 + (b.seed % 4);
  ctx.beginPath(); ctx.ellipse(x + 3, top + 10 + d * 0.5, 2.5, d * 0.5 + 2, 0, 0, 6.283); ctx.fill();
  if (b.life < 3) {
    // blink when about to melt
    if (Math.sin(time * 14) > 0.4) { ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.fill(); }
  }
}

function drawDrips(ctx, e) {
  ctx.strokeStyle = 'rgba(170,225,245,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const d of e.drops) { ctx.moveTo(d.x, d.y - 7); ctx.lineTo(d.x, d.y); }
  ctx.stroke();
  if (e.on) {
    ctx.fillStyle = 'rgba(150,210,240,0.12)';
    ctx.fillRect(e.x + 4, e.y, T - 8, e.bottom - e.y);
  }
}

function drawCobweb(ctx, e, time) {
  if (e.state === 'gone') return;
  const cx = e.x + T / 2, cy = e.y + T / 2;
  const burning = e.state === 'burning';
  const t = burning ? 1 - e.t / e.burn : 1;
  ctx.strokeStyle = burning ? `rgba(255,${140 + Math.random() * 80 | 0},60,${t})` : 'rgba(225,215,240,0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + (e.tx * 0.7);
    ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
  }
  for (const r of [6, 11, 16]) {
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (e.tx * 0.7);
      const rr = r * (0.9 + 0.1 * Math.sin(i * 3));
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  }
  ctx.stroke();
  ctx.fillStyle = burning ? `rgba(255,120,40,${0.3 * t})` : 'rgba(225,215,240,0.12)';
  ctx.fillRect(e.x, e.y, T, T);
}

function drawFuse(ctx, e, world, time) {
  const cx = e.x + T / 2, cy = e.y + T / 2;
  const links = [];
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const n = world.flammables.get((e.ty + dy) * world.w + e.tx + dx);
    if (n && (n.type === 'fuse' || n.type === 'gate')) links.push([cx + dx * T, cy + dy * T]);
  }
  if (!links.length) links.push([cx + 10, cy]);
  if (e.state === 'gone') {
    ctx.fillStyle = 'rgba(40,30,40,0.8)';
    ctx.fillRect(cx - 2, cy - 1, 4, 2);
    return;
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = e.state === 'burning' ? '#ffb040' : '#c8a060';
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  for (const [lx, ly] of links) { ctx.moveTo(cx, cy); ctx.lineTo(lx, ly); }
  ctx.stroke();
  ctx.setLineDash([]);
  if (e.state === 'burning') {
    ctx.fillStyle = '#fff0a0';
    ctx.beginPath(); ctx.arc(cx, cy, 3 + Math.random() * 2, 0, 6.283); ctx.fill();
  }
}

function drawGateFire(ctx, e, time) {
  const t = e.t / e.burn;
  ctx.fillStyle = `rgba(255,${120 + Math.random() * 60 | 0},40,${0.55 * (1 - t) + 0.2})`;
  ctx.fillRect(e.x, e.y, T, T);
}

// ------------------------------------------------------------ signs
export function drawSignPosts(ctx, cam, world) {
  for (const s of world.signs) {
    if (s.px < cam.x - 60 || s.px > cam.x + cam.w + 60) continue;
    const x = s.px, y = s.py;
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.fillStyle = '#5a3424'; ctx.fillRect(x - 2, y - 30, 4, 30);
    ctx.fillStyle = '#9a6038';
    roundRect(ctx, x - 13, y - 38, 26, 16, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8b03a'; ctx.fillRect(x - 8, y - 32, 16, 2); ctx.fillRect(x - 8, y - 28, 10, 2);
  }
}

// Sign text bubbles: drawn after the darkness so they are always readable.
export function drawSignText(ctx, cam, world, player, glyphs) {
  for (const s of world.signs) {
    const dx = player.cx - s.px, dy = player.feet - s.py;
    const near = Math.abs(dx) < 120 && Math.abs(dy) < 120;
    s.fade = clamp((s.fade || 0) + (near ? 0.08 : -0.06), 0, 1);
    if (s.fade <= 0) continue;
    const parts = splitTokens(s.text, glyphs);
    ctx.font = '600 15px "Trebuchet MS", Verdana, sans-serif';
    const lines = wrap(ctx, parts, 250);
    const lh = 20;
    const bw = Math.max(...lines.map((l) => l.width)) + 24, bh = lines.length * lh + 14;
    const bx = clamp(s.px - bw / 2, cam.x + 8, cam.x + cam.w - bw - 8), by = s.py - 52 - bh;
    ctx.globalAlpha = s.fade;
    ctx.fillStyle = 'rgba(32,16,46,0.9)';
    roundRect(ctx, bx, by, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = '#d9a640'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(32,16,46,0.9)';
    ctx.beginPath(); ctx.moveTo(s.px - 7, by + bh); ctx.lineTo(s.px + 7, by + bh); ctx.lineTo(s.px, by + bh + 9); ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      let x = bx + 12;
      for (const seg of line.segs) {
        ctx.fillStyle = seg.key ? '#ffc850' : '#fbe9c8';
        ctx.fillText(seg.text, x, by + 7 + lh * i + lh / 2);
        x += ctx.measureText(seg.text).width;
      }
    });
    ctx.globalAlpha = 1;
  }
}

function splitTokens(text, glyphs) {
  const out = [];
  const re = /\{(\w+)\}/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: glyphs[m[1]] || m[1], key: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

// word-wrap coloured segments
function wrap(ctx, parts, maxW) {
  const words = [];
  for (const p of parts) {
    if (p.key) { words.push({ text: p.text, key: true }); continue; }
    for (const w of p.text.split(/(\s+)/)) if (w) words.push({ text: w });
  }
  const lines = [];
  let cur = { segs: [], width: 0 };
  for (const w of words) {
    const ww = ctx.measureText(w.text).width;
    if (cur.width + ww > maxW && cur.segs.length && !/^\s+$/.test(w.text)) { lines.push(cur); cur = { segs: [], width: 0 }; }
    if (!cur.segs.length && /^\s+$/.test(w.text)) continue;
    cur.segs.push(w); cur.width += ww;
  }
  if (cur.segs.length) lines.push(cur);
  return lines;
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t;
  const g = ((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t;
  const bl = (pa & 255) + ((pb & 255) - (pa & 255)) * t;
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}
