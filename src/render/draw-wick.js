// Wick: a chubby candle-cat. The face stays the same size while the body
// melts down, so a tiny Wick looks extra cute and desperate.
import { CFG, clamp } from '../config.js';

const OUTLINE = '#2a1630';
const WAX = '#f6e6c4';
const WAX_SHADE = '#dcb98a';
const WAX_RIM = '#fff6dc';
const WET = '#b9c2cc';
const WET_SHADE = '#8d97a6';

export function drawWick(ctx, p, time, opts = {}) {
  const frac = p.waxFrac();
  const w = p.w, h = p.h;
  const cx = p.x + w / 2, fy = p.y + h;
  const facing = p.facing || 1;
  ctx.save();
  ctx.translate(cx, fy);
  if (opts.scale) ctx.scale(opts.scale, opts.scale);
  if (p.hurt > 0 && Math.floor(time * 18) % 2) ctx.globalAlpha = 0.45;   // moth-hit blink

  if (!p.alive && p.deathReason === 'burnout') {
    drawPuddle(ctx, w, time);
    ctx.restore();
    return;
  }

  const wet = p.alive ? clamp(p.wetTime / CFG.WATER_KILL_TIME, 0, 1) : (p.deathReason === 'water' ? 1 : 0);
  const body = mix(WAX, WET, wet * 0.8), shade = mix(WAX_SHADE, WET_SHADE, wet * 0.8);
  const moving = p.onGround && Math.abs(p.vx) > 20;
  const bob = moving ? Math.abs(Math.sin(time * 16)) * 1.5 : Math.sin(time * 2.2) * 0.5;

  // squash & stretch around the feet
  const sq = p.squash || 0;
  ctx.scale(1 + sq * 0.9, 1 - sq);
  ctx.scale(facing, 1);

  // wax pool at the base
  ctx.fillStyle = shade;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-1, -1, w / 2 + 5, 3.6, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // tail: curls up from the back
  const sway = Math.sin(time * 3) * 3 + (p.vx || 0) * -0.015 * facing;
  ctx.lineCap = 'round';
  const tail = () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, -5);
    ctx.bezierCurveTo(-w / 2 - 10, -4, -w / 2 - 12 + sway, -14, -w / 2 - 6 + sway, -Math.min(22, h * 0.6));
  };
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7; tail(); ctx.stroke();
  ctx.strokeStyle = body; ctx.lineWidth = 4; tail(); ctx.stroke();

  const top = -h - bob * 0.3;

  // ears (behind the body)
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * (w / 2 - 1), top + 7);
    ctx.lineTo(s * (w / 2 - 2), top - 7);
    ctx.lineTo(s * (w / 2 - 11), top + 1);
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * (w / 2 - 3), top + 4);
    ctx.lineTo(s * (w / 2 - 3.5), top - 3);
    ctx.lineTo(s * (w / 2 - 8), top + 1.5);
    ctx.closePath();
    ctx.fillStyle = '#f0a0a8'; ctx.fill();
  }

  // body: a soft candle with a slight belly
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -2);
    ctx.quadraticCurveTo(-w / 2 - 2, top + (h * 0.5), -w / 2 + 1, top + 8);
    ctx.quadraticCurveTo(-w / 2 + 2, top, -w / 2 + 9, top);
    ctx.lineTo(w / 2 - 9, top);
    ctx.quadraticCurveTo(w / 2 - 2, top, w / 2 - 1, top + 8);
    ctx.quadraticCurveTo(w / 2 + 2, top + (h * 0.5), w / 2, -2);
    ctx.closePath();
  };
  bodyPath();
  ctx.fillStyle = body; ctx.fill();
  // painterly flat shading on the back side and bottom
  ctx.save();
  bodyPath(); ctx.clip();
  ctx.fillStyle = shade;
  ctx.fillRect(-w / 2 - 4, top, 7, h + 4);
  ctx.globalAlpha = 0.5;
  ctx.fillRect(-w / 2 - 4, -7, w + 8, 8);
  ctx.globalAlpha = 1;
  // melted rim and drips
  ctx.fillStyle = WAX_RIM;
  ctx.beginPath();
  ctx.moveTo(-w / 2, top + 3);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-w / 2 + (w * i) / 6, top + 3 + (i % 2 ? 2.5 : 0));
  ctx.lineTo(w / 2, top - 2); ctx.lineTo(-w / 2, top - 2);
  ctx.fill();
  const drip = (x, len) => {
    ctx.beginPath();
    ctx.moveTo(x - 2, top + 3);
    ctx.lineTo(x - 2, top + 3 + len);
    ctx.arc(x, top + 3 + len, 2, Math.PI, 0, true);
    ctx.lineTo(x + 2, top + 3);
    ctx.fill();
  };
  drip(w / 2 - 4, Math.min(h - 10, 6 + h * 0.25));
  drip(-w / 2 + 6, Math.min(h - 12, 3 + h * 0.12));
  ctx.restore();
  bodyPath();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.stroke();

  // paws
  const step = moving ? Math.sin(time * 16) * 2 : 0;
  ctx.fillStyle = WAX_RIM;
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6;
  for (const [px, o] of [[-5, step], [6, -step]]) {
    ctx.beginPath(); ctx.ellipse(px + o * 0.5, -2, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // face: fixed size, pinned near the top
  const ey = top + Math.min(13, Math.max(8, h * 0.45));
  const blink = !p.alive || (time % 3.7) < 0.12;
  ctx.fillStyle = OUTLINE;
  for (const ex of [-2.5, 7]) {
    if (blink) {
      ctx.fillRect(ex - 3, ey, 6, 1.6);
    } else {
      ctx.beginPath(); ctx.ellipse(ex, ey, 3.2, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + 1, ey - 1.6, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex - 1.2, ey + 1.5, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = OUTLINE;
    }
  }
  // blush and mouth
  ctx.fillStyle = 'rgba(240,120,130,0.55)';
  ctx.beginPath(); ctx.ellipse(-7, ey + 5, 2.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(11, ey + 5, 2.2, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.3;
  ctx.beginPath();
  const scared = frac < 0.2 || wet > 0.3;
  if (scared) {
    ctx.arc(2.3, ey + 7, 1.6, 0, Math.PI * 2);
  } else {
    ctx.arc(0.8, ey + 5.2, 1.6, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.moveTo(5.4, ey + 5.6);
    ctx.arc(3.8, ey + 5.2, 1.6, 0.1 * Math.PI, 0.9 * Math.PI);
  }
  ctx.stroke();

  // wick string
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(1, top + 1); ctx.lineTo(1.5, top - 5); ctx.stroke();

  // flame
  if (p.alive) {
    const lean = clamp(-(p.vx + (p.windVx || 0)) / CFG.RUN_SPEED, -1.2, 1.2) * facing;
    const flick = 1 + Math.sin(time * 31) * 0.06 + Math.sin(time * 17.3) * 0.05 + (p.flicker || 0) * Math.sin(time * 53);
    const size = (6 + 7 * frac) * flick * (1 - wet * 0.75);
    drawFlame(ctx, 1.5, top - 5, size, lean * 0.6, time);
  }
  ctx.restore();
}

export function drawFlame(ctx, x, y, size, lean = 0, time = 0) {
  const tipX = x + lean * size * 0.9 + Math.sin(time * 23) * size * 0.08;
  const tipY = y - size * 2.1;
  const layer = (s, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.75 * s, y - size * 0.25);
    ctx.quadraticCurveTo(x - size * 0.8 * s, y - size * 1.1 * s, x + (tipX - x) * s, y - (y - tipY) * s);
    ctx.quadraticCurveTo(x + size * 0.8 * s, y - size * 1.1 * s, x + size * 0.75 * s, y - size * 0.25);
    ctx.arc(x, y - size * 0.25, size * 0.75 * s, 0, Math.PI);
    ctx.fill();
  };
  layer(1, '#ff6a1a');
  layer(0.72, '#ffae34');
  layer(0.42, '#fff1b8');
}

function drawPuddle(ctx, w, time) {
  ctx.fillStyle = WAX_SHADE;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, -2, w / 2 + 8, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = WAX;
  ctx.beginPath(); ctx.ellipse(-2, -3.5, w / 2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(2, -9, 0, -12); ctx.stroke();
  // two sad eyes in the puddle
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(-7, -5, 4, 1.4); ctx.fillRect(3, -5, 4, 1.4);
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t;
  const g = ((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t;
  const bl = (pa & 255) * (1 - t) + (pb & 255) * t;
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}
