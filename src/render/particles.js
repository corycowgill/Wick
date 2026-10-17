// Particles: embers, sparks, leaves, steam, smoke, wax splats, dust, rings.
// layer 'world' draws under the darkness, 'glow' draws additively over it,
// 'fg' draws over it normally (foreground leaves).
const MAX = 700;
const LEAF_COLORS = ['#e2582c', '#f0a030', '#c8322e', '#e8c040', '#b8482a'];

export class Particles {
  constructor() {
    this.list = [];
    this.ambientTimer = 0;
  }
  clear() { this.list.length = 0; }

  add(p) {
    if (this.list.length >= MAX) this.list.shift();
    p.life = p.max = p.life ?? 1;
    for (const k of ['vx', 'vy', 'g', 'drag', 'rot', 'vr', 'grow']) if (p[k] === undefined) p[k] = 0;
    this.list.push(p);
    return p;
  }

  ember(x, y, frac, vx = 0) {
    this.add({
      kind: 'ember', layer: 'glow', x: x + (Math.random() - 0.5) * 6, y,
      vx: vx * 0.2 + (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 50 * (0.5 + frac),
      g: -10, drag: 0.6, life: 0.5 + Math.random() * 0.7, size: 1 + Math.random() * 1.6 * (0.5 + frac),
      color: Math.random() < 0.5 ? '255,170,60' : '255,110,40',
    });
  }
  // flattened ring along the ground on a hard landing
  shock(x, y, power = 1) {
    this.add({ kind: 'shock', layer: 'world', x, y, life: 0.35, size: 22 + 30 * power });
  }
  // a column of light bursting up from a torch
  pillar(x, y, h = 260) {
    this.add({ kind: 'pillar', layer: 'glow', x, y, life: 0.9, size: h });
  }
  // embers spiralling up and out
  spiral(x, y, n = 24) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.add({
        kind: 'ember', layer: 'glow', x: x + Math.cos(a) * 8, y, vx: Math.cos(a) * 70, vy: -120 - Math.random() * 90,
        g: -40, drag: 1.2, life: 0.9 + Math.random() * 0.6, size: 1.6 + Math.random() * 1.8,
        color: i % 3 ? '255,190,80' : '255,120,50', swirlA: a, swirlR: 1,
      });
    }
  }
  // sparks that fly to a target (e.g. wax flowing into Wick)
  homing(x, y, target, n = 14, color = '255,200,100') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 120;
      this.add({
        kind: 'homing', layer: 'glow', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: 0.9 + Math.random() * 0.3, size: 1.6 + Math.random() * 1.6, color, target, delay: 0.12 + Math.random() * 0.15,
      });
    }
  }
  ash(x, y) {
    const gray = Math.random() < 0.5;
    this.add({
      kind: gray ? 'ashflake' : 'ember', layer: gray ? 'world' : 'glow', x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 24,
      vx: (Math.random() - 0.5) * 30, vy: gray ? -20 - Math.random() * 20 : -50 - Math.random() * 40, g: gray ? 25 : -10, drag: 0.8,
      life: 0.8 + Math.random() * 0.8, size: gray ? 1.6 + Math.random() * 1.6 : 1.2 + Math.random(), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8,
      color: '255,150,60',
    });
  }
  firework(x, y) {
    const cols = ['255,200,90', '255,120,70', '255,230,160', '150,230,220'];
    const c = cols[(Math.random() * cols.length) | 0];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, s = 140 + Math.random() * 60;
      this.add({ kind: 'spark', layer: 'glow', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 120, drag: 1.6, life: 0.9 + Math.random() * 0.5, size: 1.6 + Math.random(), color: c });
    }
    this.ring(x, y, 90, c);
  }
  // a glowing drop trailing behind a falling wax blob
  waxTrail(x, y) {
    this.add({ kind: 'ember', layer: 'glow', x: x + (Math.random() - 0.5) * 10, y, vx: 0, vy: -10, drag: 2, life: 0.35, size: 1.8, color: '255,235,190' });
  }

  // dust motes floating in the light
  mote(x, y) {
    this.add({
      kind: 'mote', layer: 'glow', x, y, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 6,
      drag: 0.2, life: 3 + Math.random() * 3, size: 0.7 + Math.random() * 1.1, phase: Math.random() * 6.28,
      color: Math.random() < 0.5 ? '255,220,170' : '255,190,120',
    });
  }
  sparks(x, y, n = 12, speed = 160, color = '255,190,80') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.add({
        kind: 'spark', layer: 'glow', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        g: 300, drag: 1.5, life: 0.35 + Math.random() * 0.4, size: 1.2 + Math.random() * 1.5, color,
      });
    }
  }
  ring(x, y, r = 120, color = '255,180,90') {
    this.add({ kind: 'ring', layer: 'glow', x, y, life: 0.7, size: r, color });
  }
  splat(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * Math.random(), s = 60 + Math.random() * 110;
      this.add({
        kind: 'wax', layer: 'world', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        g: 900, life: 0.4 + Math.random() * 0.3, size: 2 + Math.random() * 2.5,
      });
    }
  }
  dust(x, y, n = 6, power = 1) {
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.add({
        kind: 'dust', layer: 'world', x: x + dir * 6, y: y - 2,
        vx: dir * (30 + Math.random() * 70) * power, vy: -10 - Math.random() * 30,
        drag: 3, life: 0.35 + Math.random() * 0.3, size: 2 + Math.random() * 3, grow: 8,
      });
    }
  }
  steam(x, y) {
    this.add({
      kind: 'steam', layer: 'world', x: x + (Math.random() - 0.5) * 10, y,
      vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 30, drag: 1,
      life: 0.6 + Math.random() * 0.4, size: 3 + Math.random() * 3, grow: 14,
    });
  }
  smoke(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'smoke', layer: 'world', x: x + (Math.random() - 0.5) * 12, y: y - Math.random() * 10,
        vx: (Math.random() - 0.5) * 20, vy: -25 - Math.random() * 35, drag: 0.5,
        life: 1 + Math.random() * 0.8, size: 4 + Math.random() * 4, grow: 10,
      });
    }
  }
  splash(x, y) {
    for (let i = 0; i < 2; i++) {
      this.add({
        kind: 'water', layer: 'world', x, y: y - 1, vx: (Math.random() - 0.5) * 90, vy: -50 - Math.random() * 60,
        g: 900, life: 0.25, size: 1.5,
      });
    }
  }
  absorb(x, y, tx, ty) {
    for (let i = 0; i < 10; i++) {
      this.add({
        kind: 'wax', layer: 'world', x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 24,
        vx: (tx - x) * 3 + (Math.random() - 0.5) * 40, vy: (ty - y) * 3 - 30, drag: 2, life: 0.35, size: 2.5,
      });
    }
  }
  leaf(x, y, vx, vy, fg = false) {
    return this.add({
      kind: 'leaf', layer: fg ? 'fg' : 'world', x, y, vx, vy, g: 18, drag: 0.4,
      life: 3 + Math.random() * 3, size: (fg ? 6 : 3.5) + Math.random() * 3,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 6,
      color: LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0], phase: Math.random() * 6.28,
    });
  }

  // ambient falling maple leaves and wind swirls
  ambient(dt, cam, world, leaves = true) {
    this.ambientTimer -= dt;
    if (leaves && this.ambientTimer <= 0) {
      this.ambientTimer = 0.35 + Math.random() * 0.5;
      const fg = Math.random() < 0.25;
      this.leaf(cam.x + Math.random() * cam.w * 1.2, cam.y - 20, 15 + Math.random() * 25, 20 + Math.random() * 20, fg);
    }
    for (const z of world.windZones()) {
      if (z.state === 'idle') continue;
      const r = z.rect;
      if (r.x > cam.x + cam.w || r.x + r.w < cam.x || r.y > cam.y + cam.h || r.y + r.h < cam.y) continue;
      const rate = z.state === 'gust' ? 40 : 18;
      if (Math.random() < rate * dt) {
        const x0 = Math.max(r.x, cam.x), x1 = Math.min(r.x + r.w, cam.x + cam.w);
        const x = x0 + Math.random() * (x1 - x0);
        const y = r.y + Math.random() * r.h;
        const sp = z.state === 'gust' ? 260 : 60;
        const p = this.leaf(x, y, z.dir * sp * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 60, Math.random() < 0.2);
        p.swirl = z.state === 'warn' ? 3 : 0.5;
        p.life = p.max = 1.2 + Math.random();
      }
    }
  }

  update(dt) {
    const list = this.list;
    let k = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.g * dt;
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
      if (p.kind === 'homing') {
        p.delay -= dt;
        if (p.delay <= 0 && p.target) {
          const tx = p.target.cx, ty = p.target.y + p.target.h * 0.3;
          p.vx += (tx - p.x) * 14 * dt; p.vy += (ty - p.y) * 14 * dt;
          p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt);
          if (Math.abs(tx - p.x) < 8 && Math.abs(ty - p.y) < 10) p.life = Math.min(p.life, 0.05);
        }
      }
      if (p.swirlA !== undefined) { p.swirlA += dt * 4; p.vx += Math.cos(p.swirlA) * 160 * dt; }
      if (p.kind === 'leaf') {
        p.phase += dt * 2.5;
        p.x += Math.sin(p.phase) * 25 * dt;
        if (p.swirl) { p.vy += Math.cos(p.phase * 2) * 120 * p.swirl * dt; }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
      list[k++] = p;
    }
    list.length = k;
  }

  draw(ctx, layer) {
    for (const p of this.list) {
      if (p.layer !== layer) continue;
      const t = p.life / p.max;
      switch (p.kind) {
        case 'ember': case 'spark': {
          ctx.fillStyle = `rgba(${p.color},${t})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, 6.283); ctx.fill();
          ctx.fillStyle = `rgba(${p.color},${t * 0.25})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, 6.283); ctx.fill();
          break;
        }
        case 'mote': {
          const tw = Math.sin(t * Math.PI) * (0.5 + 0.5 * Math.sin(p.life * 3 + p.phase));
          ctx.fillStyle = `rgba(${p.color},${0.55 * tw})`;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        }
        case 'shock': {
          const k = 1 - t;
          ctx.strokeStyle = `rgba(240,210,180,${t * 0.55})`;
          ctx.lineWidth = 3 * t + 0.5;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * (0.3 + k), p.size * (0.3 + k) * 0.18, 0, 0, 6.283); ctx.stroke();
          break;
        }
        case 'pillar': {
          const w = 26 * (0.4 + t);
          const g = ctx.createLinearGradient(0, p.y - p.size, 0, p.y);
          g.addColorStop(0, 'rgba(255,190,90,0)');
          g.addColorStop(0.7, `rgba(255,170,80,${0.35 * t})`);
          g.addColorStop(1, `rgba(255,220,150,${0.6 * t})`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(p.x - w, p.y); ctx.lineTo(p.x - w * 0.3, p.y - p.size); ctx.lineTo(p.x + w * 0.3, p.y - p.size); ctx.lineTo(p.x + w, p.y); ctx.fill();
          break;
        }
        case 'homing': {
          ctx.fillStyle = `rgba(${p.color},${Math.min(1, t * 2)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
          ctx.strokeStyle = `rgba(${p.color},${t * 0.5})`;
          ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
          break;
        }
        case 'ashflake': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = `rgba(90,80,100,${t * 0.8})`;
          ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
          ctx.restore();
          break;
        }
        case 'ring': {
          ctx.strokeStyle = `rgba(${p.color},${t * 0.6})`;
          ctx.lineWidth = 6 * t + 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.85), 0, 6.283); ctx.stroke();
          break;
        }
        case 'wax':
          ctx.fillStyle = '#f2dfb8';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, 6.283); ctx.fill();
          break;
        case 'dust':
          ctx.fillStyle = `rgba(150,120,140,${t * 0.45})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
          break;
        case 'steam':
          ctx.fillStyle = `rgba(220,230,240,${t * 0.5})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
          break;
        case 'smoke':
          ctx.fillStyle = `rgba(70,60,90,${t * 0.5})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
          break;
        case 'water':
          ctx.fillStyle = `rgba(160,220,240,${t})`;
          ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
          break;
        case 'leaf': {
          const a = Math.min(1, t * 3);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = a * (p.layer === 'fg' ? 0.85 : 1);
          ctx.fillStyle = p.layer === 'fg' ? '#2a1838' : p.color;
          drawLeaf(ctx, p.size);
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

// a pointed leaf with a centre vein (reads as a leaf even when tiny)
function drawLeaf(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.75, s, 0);
  ctx.quadraticCurveTo(-s * 0.2, s * 0.75, -s, 0);
  ctx.fill();
  if (s > 3) {
    ctx.strokeStyle = 'rgba(60,20,20,0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-s * 1.25, 0); ctx.lineTo(s * 0.8, 0); ctx.stroke();
  }
}
