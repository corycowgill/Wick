// Wick: a chubby candle-cat. The face stays the same size while the body
// melts down, so a tiny Wick looks extra cute and desperate.
import { CFG, clamp } from '../config.js';
import { noteWick } from './draw-dynamic.js';

const OUTLINE = '#2a1630';
const WAX = '#f6e6c4';
const WAX_SHADE = '#dcb98a';
const WAX_RIM = '#fff6dc';
const WET = '#b9c2cc';
const WET_SHADE = '#8d97a6';

// Moods are render-only: they never touch the simulation, so replays stay exact.
// joy (torch, pumpkin, goal), ouch (moth), surprise (a door opening nearby).
const lowRim = { rim: 0, path: null, m: null };
const face = { mood: null, until: 0, now: 0, still: 0, lastT: 0, lookX: 0, lookY: 0 };
export function wickMood(kind, dur = 1) {
  if (face.mood === 'joy' && kind === 'surprise' && face.until > face.now) return;
  face.mood = kind; face.until = face.now + dur;
}

export function drawWick(ctx, p, time, opts = {}) {
  const frac = p.waxFrac();
  const w = p.w, h = p.h;
  const cx = p.x + w / 2, fy = p.y + h;
  const facing = p.facing || 1;
  if (opts.world) noteWick(p);
  ctx.save();
  ctx.translate(cx, fy);
  if (opts.scale) ctx.scale(opts.scale, opts.scale);
  if (p.hurt > 0 && Math.floor(time * 18) % 2) ctx.globalAlpha = 0.45;   // moth-hit blink

  if (!p.alive && p.deathReason === 'burnout') {
    drawPuddle(ctx, w, time);
    ctx.restore();
    return;
  }

  // what Wick is feeling and looking at this frame
  const dt = clamp(time - face.lastT, 0, 0.1);
  face.lastT = time; face.now = time;
  const idle = p.alive && p.onGround && Math.abs(p.vx) < 5 && !p.riding;
  face.still = idle ? face.still + dt : 0;
  const mood = face.until > time ? face.mood : null;
  const gusty = Math.abs(p.windVx || 0) > 70;
  let tx = facing * 0.6, ty = clamp((p.vy || 0) / 900, -0.6, 0.8);
  if (opts.world && opts.world.moths) {
    // eyes follow the nearest moth
    let best = 230 * 230;
    for (const m of opts.world.moths) {
      const dx = m.x - cx, dy = m.y - (p.y + 10), d = dx * dx + dy * dy;
      if (d < best) { best = d; tx = clamp(dx / 60, -1, 1); ty = clamp(dy / 60, -1, 1); }
    }
  }
  face.lookX += (tx - face.lookX) * Math.min(1, dt * 10);
  face.lookY += (ty - face.lookY) * Math.min(1, dt * 10);
  const sleepy = clamp((face.still - 5) / 1.5, 0, 1);

  const wet = p.alive ? clamp(p.wetTime / (p.assist ? p.assist.waterTime : CFG.WATER_KILL_TIME), 0, 1) : (p.deathReason === 'water' ? 1 : 0);
  if (wet > 0.15) ctx.translate(Math.sin(time * 70) * wet * 1.2, 0);   // shivering in the drip
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
  const earUp = mood === 'surprise' ? -3 : gusty ? 4 : sleepy * 2;
  const earBack = gusty ? 3 : 0;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * (w / 2 - 1), top + 7);
    ctx.lineTo(s * (w / 2 - 2) - earBack, top - 7 + earUp);
    ctx.lineTo(s * (w / 2 - 11), top + 1);
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * (w / 2 - 3), top + 4);
    ctx.lineTo(s * (w / 2 - 3.5) - earBack, top - 3 + earUp * 0.7);
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
  // low wax: a warm rim outside the outline, so the danger state is the most readable one
  const rim = p.alive ? clamp((0.25 - frac) / 0.25, 0, 1) : 0;
  lowRim.rim = 0;
  if (rim > 0) {
    bodyPath();
    ctx.strokeStyle = `rgba(255,${180 + 30 * Math.sin(time * 6) | 0},110,${0.55 + 0.35 * rim})`;
    ctx.lineWidth = 2.4 + 3.2 * rim; ctx.lineJoin = 'round'; ctx.stroke();
    if (opts.world) {
      // kept for drawWickFx, which redraws the rim after the lighting has darkened the world
      const bp = new Path2D();
      bp.moveTo(-w / 2, -2);
      bp.quadraticCurveTo(-w / 2 - 2, top + (h * 0.5), -w / 2 + 1, top + 8);
      bp.quadraticCurveTo(-w / 2 + 2, top, -w / 2 + 9, top);
      bp.lineTo(w / 2 - 9, top);
      bp.quadraticCurveTo(w / 2 - 2, top, w / 2 - 1, top + 8);
      bp.quadraticCurveTo(w / 2 + 2, top + (h * 0.5), w / 2, -2);
      bp.closePath();
      lowRim.rim = rim; lowRim.path = bp; lowRim.m = ctx.getTransform();
    }
  }
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
  const blink = !p.alive || (time % 3.7) < 0.12 || sleepy >= 1;
  const lx = face.lookX * 1.4, ly = face.lookY * 1.2;
  const big = mood === 'surprise' ? 1.25 : 1;
  ctx.fillStyle = OUTLINE;
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  [-2.5, 7].forEach((ex, side) => {
    if (mood === 'joy' && p.alive) {
      // happy ^ ^ eyes
      ctx.beginPath(); ctx.arc(ex, ey + 1.5, 3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else if (mood === 'ouch' && p.alive) {
      // squeezed > < eyes
      const d = side ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(ex - 2.6 * d, ey - 2.6); ctx.lineTo(ex + 2.4 * d, ey); ctx.lineTo(ex - 2.6 * d, ey + 2.6); ctx.stroke();
    } else if (blink) {
      ctx.fillRect(ex - 3, ey, 6, 1.6);
    } else if (gusty) {
      // squinting into the wind
      ctx.beginPath(); ctx.moveTo(ex - 3, ey - 0.5); ctx.quadraticCurveTo(ex, ey + 1.6, ex + 3, ey - 0.5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(ex + lx * 0.5, ey + ly * 0.5, 3.2 * big, 4.2 * big, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + 1 + lx, ey - 1.6 + ly, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex - 1.2 + lx, ey + 1.5 + ly, 0.6, 0, Math.PI * 2); ctx.fill();
      if (sleepy > 0) {
        // heavy eyelids
        ctx.fillStyle = body;
        ctx.fillRect(ex - 4, ey - 5, 8, 1 + sleepy * 5);
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(ex - 3.4, ey - 4.4 + sleepy * 5, 6.8, 1.3);
      }
      ctx.fillStyle = OUTLINE;
    }
  });
  // worried brows when the wax runs low
  if (p.alive && frac < 0.3 && mood !== 'joy') {
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-5.5, ey - 6.5); ctx.lineTo(-0.5, ey - 7.8);
    ctx.moveTo(4.5, ey - 7.8); ctx.lineTo(9.5, ey - 6.5);
    ctx.stroke();
  }
  // blush and mouth
  ctx.fillStyle = 'rgba(240,120,130,0.55)';
  ctx.beginPath(); ctx.ellipse(-7, ey + 5, 2.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(11, ey + 5, 2.2, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.3;
  ctx.beginPath();
  const scared = frac < 0.2 || wet > 0.3 || mood === 'ouch' || mood === 'surprise';
  if (mood === 'joy' && p.alive) {
    // a big open grin
    ctx.moveTo(-0.6, ey + 4.8); ctx.quadraticCurveTo(2.3, ey + 10, 5.2, ey + 4.8); ctx.closePath();
    ctx.fillStyle = '#c0485a'; ctx.fill();
  } else if (sleepy >= 1) {
    ctx.arc(2.3, ey + 6.5, 1.2 + Math.max(0, Math.sin(time * 0.9)) * 1.4, 0, Math.PI * 2);   // a slow yawn
  } else if (scared) {
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
  if (sleepy >= 1) {
    ctx.scale(facing, 1);
    ctx.fillStyle = 'rgba(255,240,210,0.85)';
    ctx.font = `700 ${9}px sans-serif`;
    for (let k = 0; k < 3; k++) {
      const ph = (time * 0.5 + k / 3) % 1;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
      ctx.font = `700 ${8 + ph * 6}px sans-serif`;
      // drift out sideways, away from text above Wick's head
      ctx.fillText('z', 18 + ph * 26 + Math.sin(ph * 6 + k) * 2, top - 6 - ph * 14);
    }
    ctx.globalAlpha = 1;
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

// Drawn after the lighting, in world space: the parts of Wick that must read in the dark.
// Low-wax glow, and the death beats (a smoke curl over the burnt-out puddle, a splash column
// and steam for a drowned flame). Render-only, timed from the death timer.
export function drawWickFx(ctx, p, time) {
  const cx = p.x + p.w / 2, fy = p.y + p.h;
  const lit = (x, y, r, rgb, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  ctx.save();
  if (p.alive) {
    const rim = lowRim.rim;
    if (rim > 0 && lowRim.path) {
      const beat = 0.75 + 0.25 * Math.sin(time * 6);
      ctx.globalCompositeOperation = 'lighter';
      lit(cx, p.y + p.h * 0.55, 18 + p.h * 0.6, '255,170,90', (0.18 + 0.14 * rim) * beat);
    }
    ctx.restore();
    return;
  }
  const since = clamp(CFG.DEATH_DELAY - (p.deathTimer || 0), 0, 2);
  if (p.deathReason === 'burnout') {
    // a soft spotlight holds on the puddle while the last ember dies
    ctx.globalCompositeOperation = 'lighter';
    lit(cx, fy - 4, 72, '255,160,80', 0.5 * (1 - since * 0.4));
    lit(cx, fy - 4, 26, '255,200,130', 0.35);
    const ember = Math.max(0, 1 - since / 0.5);
    if (ember > 0) lit(cx, fy - 12, 7, '255,120,40', 0.9 * ember * (0.7 + 0.3 * Math.sin(time * 40)));
    ctx.globalCompositeOperation = 'source-over';
    // the smoke curl, rising and widening from the wick stub
    const hgt = 10 + since * 110, a = 0.7 * Math.min(1, since * 8) * (1 - since / 1.1);
    ctx.lineCap = 'round';
    for (const [lw, col] of [[5, `rgba(40,30,50,${a * 0.6})`], [2.8, `rgba(236,228,240,${a})`]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let y = 0; y <= hgt; y += 3) {
        const amp = 1.5 + y * 0.16;
        const x = cx + Math.sin(y * 0.11 - time * 5) * amp + y * 0.06;
        y ? ctx.lineTo(x, fy - 12 - y) : ctx.moveTo(x, fy - 12 - y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(210,200,220,${a * 0.5})`;
    ctx.beginPath(); ctx.arc(cx + hgt * 0.06 + Math.sin(hgt * 0.11 - time * 5) * (1.5 + hgt * 0.16), fy - 12 - hgt, 3 + since * 6, 0, Math.PI * 2); ctx.fill();
  } else if (p.deathReason === 'water') {
    // a splash column at the feet, then a hiss of steam where the flame was
    const k = clamp(since / 0.45, 0, 1), col = Math.sin(k * Math.PI);
    if (col > 0) {
      ctx.fillStyle = 'rgba(160,210,250,0.5)';
      ctx.beginPath(); ctx.ellipse(cx, fy - col * 26, 4 + col * 2, col * 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(235,248,255,0.85)';
      ctx.beginPath(); ctx.ellipse(cx, fy - col * 46, 4 + col * 2, 5 * col, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 14; i++) {
      const ang = -Math.PI / 2 + ((i * 0.618) % 1 - 0.5) * 1.9, sp = 120 + ((i * 0.37) % 1) * 140;
      const x = cx + Math.cos(ang) * sp * since, y = fy + Math.sin(ang) * sp * since + 420 * since * since;
      if (y > fy + 6) continue;
      ctx.fillStyle = `rgba(200,232,255,${0.9 * (1 - since / 1.2)})`;
      ctx.beginPath(); ctx.arc(x, y, 2.2 - i * 0.07, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 4; i++) {
      const s = since - i * 0.08;
      if (s <= 0) continue;
      const a = 0.55 * Math.min(1, s * 6) * (1 - s / 1.1);
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(230,236,245,${a})`;
      ctx.beginPath(); ctx.arc(cx + (i - 1.5) * 6 + Math.sin(time * 3 + i) * 3, p.y - 6 - s * 60, 5 + s * 16, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// Low wax: a warm rim round a crisp outline, drawn after the lighting and the cold vignette
// so the danger state stays the most readable one. Uses the body outline kept by drawWick.
export function drawWickRim(ctx, p, time) {
  const rim = lowRim.rim;
  if (!p.alive || rim <= 0 || !lowRim.path) return;
  const beat = 0.75 + 0.25 * Math.sin(time * 6);
  ctx.save();
  ctx.setTransform(lowRim.m);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(255,${180 + 30 * Math.sin(time * 6) | 0},110,${(0.6 + 0.35 * rim) * beat})`;
  ctx.lineWidth = 2.4 + 2.6 * rim; ctx.stroke(lowRim.path);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6; ctx.stroke(lowRim.path);
  ctx.restore();
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
