// Moving platforms and moths.
import { CFG } from '../config.js';

const T = CFG.TILE;

// faint track between a mover's two end points, so its path is readable before it moves
function drawTrack(ctx, m) {
  const vertical = Math.abs(m.by - m.ay) > Math.abs(m.bx - m.ax);
  ctx.save();
  ctx.strokeStyle = 'rgba(40,24,18,0.75)';
  ctx.lineWidth = 2;
  if (vertical) {
    // chains from a pulley beam above the top stop
    const top = Math.min(m.ay, m.by) - T * 1.2;
    for (const ox of [6, m.w - 6]) {
      ctx.beginPath(); ctx.moveTo(m.x + ox, top); ctx.lineTo(m.x + ox, m.y); ctx.stroke();
    }
    ctx.fillStyle = '#3a2618';
    ctx.fillRect(m.ax - 4, top - 6, m.w + 8, 7);
    ctx.fillStyle = '#7a5a3a';
    for (const ox of [6, m.w - 6]) { ctx.beginPath(); ctx.arc(m.ax + ox, top - 2, 4, 0, 6.283); ctx.fill(); }
  } else {
    // a guide rope with posts at each end
    const y = m.ay - 2;
    const x0 = Math.min(m.ax, m.bx), x1 = Math.max(m.ax, m.bx) + m.w;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(120,90,60,0.35)';
    ctx.beginPath(); ctx.moveTo(x0, y + 8); ctx.lineTo(x1, y + 8); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawPlank(ctx, m, t) {
  const x = m.x, y = m.y, w = m.w;
  if (m.style === 'boat') {
    ctx.fillStyle = '#4a2c1a';
    ctx.beginPath();
    ctx.moveTo(x - 6, y); ctx.lineTo(x + w + 6, y);
    ctx.quadraticCurveTo(x + w, y + 18, x + w - 12, y + 20);
    ctx.lineTo(x + 12, y + 20);
    ctx.quadraticCurveTo(x, y + 18, x - 6, y);
    ctx.fill();
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(x - 6, y, w + 12, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 6, y + 8, w - 12, 2);
  } else {
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(x, y + 2, w, m.h);
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(x, y, w, m.h - 3);
    ctx.fillStyle = '#a8743f';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(30,16,10,0.5)';
    for (let px = x + 10; px < x + w - 4; px += 16) ctx.fillRect(px, y + 2, 1, m.h - 5);
    ctx.fillStyle = '#4a4a52';
    ctx.fillRect(x + 3, y + 1, 4, m.h - 4);
    ctx.fillRect(x + w - 7, y + 1, 4, m.h - 4);
  }
  // a little lantern hanging underneath
  const lx = x + w / 2, ly = y + m.h + 2;
  const sway = Math.sin(t * 2 + m.ax * 0.01) * 2;
  ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(lx, ly - 2); ctx.lineTo(lx + sway, ly + 6); ctx.stroke();
  ctx.fillStyle = '#2a1a10'; ctx.fillRect(lx + sway - 4, ly + 6, 8, 2);
  ctx.fillStyle = `rgba(255,${190 + 30 * Math.sin(t * 9 + m.ax) | 0},110,0.95)`;
  ctx.fillRect(lx + sway - 3, ly + 8, 6, 7);
}

export function drawMovers(ctx, cam, world, t) {
  for (const m of world.movers) {
    const x0 = Math.min(m.ax, m.bx) - 40, x1 = Math.max(m.ax, m.bx) + m.w + 40;
    if (x1 < cam.x || x0 > cam.x + cam.w) continue;
    drawTrack(ctx, m);
    drawPlank(ctx, m, t);
  }
}

function drawMothBody(ctx, m, t) {
  const flap = Math.abs(Math.sin(t * 26 + m.phase0 * 7));
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.scale(m.facing * 1.6, 1.6);
  // wings: upper pair and lower pair, flapping
  ctx.fillStyle = 'rgba(222,206,176,0.9)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-2, s * 5 * flap, 9, 5 * (0.35 + flap * 0.65), s * 0.5, 0, 6.283);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(176,156,126,0.9)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-6, s * 3 * flap, 5, 3.5 * (0.35 + flap * 0.65), s * 0.9, 0, 6.283);
    ctx.fill();
  }
  // eye spots
  ctx.fillStyle = 'rgba(90,60,50,0.8)';
  ctx.beginPath(); ctx.arc(0, -4 * flap, 1.5, 0, 6.283); ctx.arc(0, 4 * flap, 1.5, 0, 6.283); ctx.fill();
  // body + feelers
  ctx.fillStyle = '#5a4636';
  ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, 6.283); ctx.fill();
  ctx.strokeStyle = '#5a4636'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(5, -1); ctx.quadraticCurveTo(9, -5, 11, -6); ctx.moveTo(5, 1); ctx.quadraticCurveTo(9, 5, 11, 6); ctx.stroke();
  ctx.restore();
}

export function drawMoths(ctx, cam, world, t) {
  for (const m of world.moths) {
    if (m.x < cam.x - 60 || m.x > cam.x + cam.w + 60) continue;
    drawMothBody(ctx, m, t);
  }
}

// additive pass: a dusty halo so moths read in the dark
export function drawMothGlows(ctx, cam, world, t) {
  for (const m of world.moths) {
    if (m.x < cam.x - 60 || m.x > cam.x + cam.w + 60) continue;
    const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 40);
    const a = 0.3 + 0.08 * Math.sin(t * 7 + m.phase0);
    g.addColorStop(0, `rgba(255,236,200,${a})`);
    g.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(m.x - 40, m.y - 40, 80, 80);
  }
}

// ------------------------------------------------------------ plates and doors
// Each plate and its door share a gem colour so the pairing reads at a glance.
const LINK = ['255,186,90', '120,200,255', '210,140,255', '130,230,150', '255,120,120'];
const linkCol = (i) => LINK[((i % LINK.length) + LINK.length) % LINK.length];

export function drawDoors(ctx, cam, world, t) {
  for (const d of world.doors) {
    const x0 = d.tx * T;
    if (x0 > cam.x + cam.w + 40 || x0 < cam.x - 120) continue;
    const ys = d.cells.map((c) => c[1]), xs = d.cells.map((c) => c[0]);
    const top = Math.min(...ys) * T, bot = (Math.max(...ys) + 1) * T;
    const left = Math.min(...xs) * T, right = (Math.max(...xs) + 1) * T;
    const h = bot - top, lift = d.amt * (h - 6);
    ctx.save();
    ctx.beginPath(); ctx.rect(left - 2, top, right - left + 4, h); ctx.clip();
    const y = top - lift;
    // planks
    ctx.fillStyle = '#4a2c1c'; ctx.fillRect(left + 2, y, right - left - 4, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = left + 9; x < right - 4; x += 8) ctx.fillRect(x, y, 1.5, h);
    // iron bands with rivets
    ctx.fillStyle = '#3c3c46';
    for (let by = y + 8; by < y + h - 4; by += 26) {
      ctx.fillRect(left + 1, by, right - left - 2, 5);
      ctx.fillStyle = '#7a7a86';
      for (let x = left + 5; x < right - 3; x += 9) ctx.fillRect(x, by + 1.5, 2, 2);
      ctx.fillStyle = '#3c3c46';
    }
    // spiked foot
    ctx.fillStyle = '#2a2a32';
    for (let x = left + 3; x < right - 3; x += 7) { ctx.beginPath(); ctx.moveTo(x, y + h - 4); ctx.lineTo(x + 3.5, y + h); ctx.lineTo(x + 7, y + h - 4); ctx.fill(); }
    // the link gem
    const c = linkCol(d.index);
    ctx.fillStyle = `rgba(${c},${0.55 + 0.45 * d.amt})`;
    ctx.beginPath(); ctx.arc((left + right) / 2, y + h / 2, 4.5, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect((left + right) / 2 - 1.5, y + h / 2 - 2.5, 1.5, 1.5);
    ctx.restore();
    // frame
    ctx.fillStyle = '#2a1a12';
    ctx.fillRect(left - 3, top, 3, h); ctx.fillRect(right, top, 3, h);
  }
}

export function drawPlates(ctx, cam, world, t) {
  for (const pl of world.plates) {
    const x = pl.tx * T, y = (pl.ty + 1) * T;
    if (x > cam.x + cam.w + 40 || x < cam.x - 40) continue;
    const down = pl.pressed ? 2 : 0;
    ctx.fillStyle = '#2a1a12'; ctx.fillRect(x + 2, y - 4, T - 4, 4);
    ctx.fillStyle = pl.pressed ? '#a0783a' : '#c89a48';
    ctx.fillRect(x + 4, y - 7 + down, T - 8, 4);
    ctx.fillStyle = 'rgba(255,240,200,0.5)'; ctx.fillRect(x + 4, y - 7 + down, T - 8, 1);
    const c = linkCol(pl.door);
    ctx.fillStyle = `rgba(${c},${pl.pressed ? 1 : 0.6})`;
    ctx.beginPath(); ctx.arc(x + T / 2, y - 5 + down, 2.5, 0, 6.283); ctx.fill();
  }
}

// additive: plates and their doors glow in their link colour while held
export function drawPlateGlows(ctx, cam, world, t) {
  const pulse = 0.85 + 0.15 * Math.sin(t * 5);
  for (const pl of world.plates) {
    const x = (pl.tx + 0.5) * T, y = (pl.ty + 1) * T - 5;
    if (x > cam.x + cam.w + 60 || x < cam.x - 60) continue;
    const c = linkCol(pl.door), r = pl.pressed ? 34 : 16;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${c},${(pl.pressed ? 0.45 : 0.18) * pulse})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (const d of world.doors) {
    if (d.amt < 0.05) continue;
    const xs = d.cells.map((c) => c[0]), ys = d.cells.map((c) => c[1]);
    const x = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * T, y = (Math.max(...ys) + 1) * T - 8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 40);
    g.addColorStop(0, `rgba(${linkCol(d.index)},${0.25 * d.amt})`);
    g.addColorStop(1, `rgba(${linkCol(d.index)},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - 40, y - 40, 80, 80);
  }
}
