// Signature atmosphere for each level theme: a backdrop set piece, ambient
// particles, world details and screen effects. Silhouettes are drawn before the
// darkness layer; their lights are queued and drawn additively after it, so
// bulbs, flames and windows glow through the dark the way real lights would.
import { CFG, clamp } from '../config.js';

const W = CFG.VIEW_W, H = CFG.VIEW_H, T = CFG.TILE;
let glows = [];            // [x, y, r, 'r,g,b', a] in screen space, drawn after the darkness
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
  glows = [];
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
  ctx.save();
  ctx.fillStyle = `rgba(200,215,255,${0.35 * k})`;
  ctx.fillRect(0, 0, W, H);
  // a forked bolt, re-seeded per strike
  ctx.strokeStyle = `rgba(235,240,255,${Math.min(1, k * 1.6)})`;
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
  }
}

function drawCanalBridges(ctx, cam, time, lift) {
  const f = 0.35, span = 520, base = H - 130 + lift * f;
  const off = cam.x * f;
  for (let i = Math.floor(off / span) - 1; i < Math.floor(off / span) + 3; i++) {
    const x = i * span - off + 60, w = 300;
    ctx.fillStyle = '#34466e';
    ctx.beginPath();
    ctx.moveTo(x, base - 90); ctx.lineTo(x + w, base - 90); ctx.lineTo(x + w, base);
    ctx.arc(x + w / 2, base, w * 0.36, 0, Math.PI, true);
    ctx.lineTo(x, base); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 6, base - 100, w + 12, 12);
    for (let k = 0; k < 6; k++) { ctx.fillRect(x + 10 + k * 56, base - 116, 6, 18); glow(x + 13 + k * 56, base - 120, 8, '255,190,110', 0.5); }
    // reflection of the arch in the water
    ctx.strokeStyle = 'rgba(160,200,240,0.18)'; ctx.lineWidth = 2;
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

// ------------------------------------------------------------ world-space details (after decor)
export function drawThemeWorld(ctx, cam, world, time, th) {
  if (th.name === 'tower') drawBells(ctx, cam, world, time);
  if (th.name === 'canal') drawFloatingLanterns(ctx, cam, world, time);
  if (th.name === 'cold') drawSnowSparkle(ctx, cam, world, time);
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
      if (rnd() < 3 * dt) P.firefly(cam.x + rnd() * cam.w, cam.y + cam.h * (0.35 + rnd() * 0.5));
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

// ------------------------------------------------------------ after the darkness: queued glows + screen effects
export function drawThemeOverlay(ctx, world, time, th) {
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
      ctx.fillStyle = `rgba(210,220,255,${0.16 * s.bolt})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  if (th.name === 'cold' && skyCam) {
    // the aurora is light itself, so it rides over the darkness
    ctx.save(); ctx.globalAlpha = 0.6; drawAurora(ctx, skyCam, time, skyLift); ctx.restore();
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
