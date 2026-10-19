// Wick: a chubby candle-cat. The face stays the same size while the body
// melts down, so a tiny Wick looks extra cute and desperate.
import { CFG, clamp } from '../config.js';
import { noteWick } from './draw-dynamic.js';
import { Audio } from '../audio.js';

const OUTLINE = '#2a1630';
const WAX = '#f6e6c4';
const WAX_SHADE = '#dcb98a';
const WAX_RIM = '#fff6dc';
const WET = '#b9c2cc';
const WET_SHADE = '#8d97a6';
const IRIS = '#f2b84a';

// Moods are render-only: they never touch the simulation, so replays stay exact.
// joy (torch, pumpkin, goal), ouch (moth), surprise (a door opening nearby).
const lowRim = { rim: 0, path: null, m: null };
const face = { mood: null, until: 0, now: 0 };
let nudged = false;      // the player just acted (jump, drip, soak): snap out of any idle routine
let kneadUntil = 0;      // happy kneading paws at the goal
export function wickMood(kind, dur = 1) {
  if (face.mood === 'joy' && kind === 'surprise' && face.until > face.now) return;
  face.mood = kind; face.until = face.now + dur;
}
export function wickNudge() { nudged = true; }
export function wickKnead(dur = 3) { kneadUntil = face.now + dur; }
// how loudly the play Wick is purring (0..1), for Audio.purr
let purring = 0;
export function wickPurr() { return purring; }

// ---------------------------------------------------------------- the cat brain
// Everything that makes Wick act like a cat lives here, per drawn Wick (the play Wick,
// the title Wick), timed from the render clock and only ever read from the player.
const TAIL_N = 6, TAIL_L = 4.2;
const SIDES = [-1, 1];
// the tail tucked round the front paws, for sitting and sleeping (local, facing +x)
const WRAP = [[-11, -6], [-15.5, -5], [-13, -2.6], [-5, -2.8], [3, -3], [10.5, -4.4], [13, -10]];
const cats = new WeakMap();
function catOf(p) {
  let c = cats.get(p);
  if (!c) {
    c = {
      lastT: -1, still: 0, ground: true, air: { vy: 0, top: 0, from: 0 }, vx: 0, vy: 0, facing: 1,
      rel: new Float32Array(TAIL_N), relV: new Float32Array(TAIL_N),
      px: new Float32Array(TAIL_N + 1), py: new Float32Array(TAIL_N + 1),
      puff: 0, wrap: 0, sit: 0, crouch: 0, lean: 0, stretch: 0,
      ear: 0, earV: 0, whisk: 0, whiskV: 0,
      startle: 0, shake: 0, huff: 0, wetPeak: 0, oof: 0, smug: 0, lastSmug: -99,
      chatter: 0, nextChatter: 0, flick: 0, flickSide: 1, nextFlick: 3,
      slit: 0, wide: 0, lookX: 0, lookY: 0, mothD: 1e9, mothDx: 0, torchDx: 0, torchNear: false, purr: 0,
      yawned: false,
    };
    c.rel[0] = -2.95;
    for (let i = 1; i < TAIL_N; i++) c.rel[i] = 0.3;
    cats.set(p, c);
  }
  return c;
}

// render-only water droplets shaken off the fur, in world space
const drops = Array.from({ length: 16 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
function shakeDrops(p) {
  let n = 0;
  for (const d of drops) {
    if (d.life > 0 || n >= 12) continue;
    const side = n % 2 ? 1 : -1;
    d.x = p.x + p.w / 2 + side * (p.w / 2 - 2);
    d.y = p.y + 4 + Math.random() * p.h * 0.8;
    d.vx = side * (70 + Math.random() * 110);
    d.vy = -60 - Math.random() * 150;
    d.life = 0.45 + Math.random() * 0.3;
    n++;
  }
}
function drawDrops(ctx, dt) {
  ctx.fillStyle = 'rgba(190,225,255,0.9)';
  ctx.strokeStyle = 'rgba(42,22,48,0.55)'; ctx.lineWidth = 0.8;
  for (const d of drops) {
    if (d.life <= 0) continue;
    d.life -= dt; d.vy += 650 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
    ctx.beginPath(); ctx.arc(d.x, d.y, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}


function ease(c, dt, key, target, rate) { c[key] += (target - c[key]) * Math.min(1, dt * rate); }

// the springy bits: ears and whiskers bob, the tail is a little chain that lags behind
function spring(c, key, vkey, target, k, damp, dt) {
  c[vkey] += (target - c[key]) * k * dt;
  c[vkey] *= Math.exp(-damp * dt);
  c[key] += c[vkey] * dt;
}

function think(c, p, time, dt, opts) {
  const world = opts.world, voiced = !!world;
  const frac = p.waxFrac();
  const cx = p.x + p.w / 2, feet = p.y + p.h;
  const mood = face.until > time ? face.mood : null;
  const wet = p.alive ? clamp(p.wetTime / (p.assist ? p.assist.waterTime : CFG.WATER_KILL_TIME), 0, 1) : (p.deathReason === 'water' ? 1 : 0);
  c.wet = wet;

  // what's around: the nearest moth to stare at, the nearest lit torch to lean on
  let tx = (p.facing || 1) * 0.6, ty = clamp((p.vy || 0) / 900, -0.6, 0.8);
  c.mothD = 1e9;
  if (world && world.moths) {
    let best = 230 * 230;
    for (const m of world.moths) {
      const dx = m.x - cx, dy = m.y - (p.y + 10), d = dx * dx + dy * dy;
      if (d < best) { best = d; tx = clamp(dx / 60, -1, 1); ty = clamp(dy / 60, -1, 1); c.mothD = Math.sqrt(d); c.mothDx = dx; }
    }
  }
  c.lookX += (tx - c.lookX) * Math.min(1, dt * 10);
  c.lookY += (ty - c.lookY) * Math.min(1, dt * 10);
  c.torchNear = false;
  let bright = false;
  if (world && world.torches) {
    let best = 1e9;
    const check = (t) => {
      if (!t || !t.lit) return;
      const dx = t.x - cx;
      if (Math.abs(t.y - feet) < 40 && Math.abs(dx) < 70 && Math.abs(dx) < best) { best = Math.abs(dx); c.torchDx = dx; c.torchNear = true; }
      if (Math.abs(dx) < 120 && Math.abs(t.y - 60 - feet) < 130) bright = true;
    };
    for (const t of world.torches) check(t);
    check(world.goal);
  }

  // idle: escalates from a tail swish to sit, groom, stretch and a curled-up nap.
  // Anything the player does snaps out of it at once (with a startled jolt).
  const inp = opts.input;
  const acting = (world && nudged) || (inp && (Math.abs(inp.moveX || 0) > 0.01 || inp.jumpHeld));
  if (world) nudged = false;
  const curious = p.alive && c.mothD > 58 && c.mothD < 170 && !(p.hurt > 0) && frac > 0.15 && wet < 0.1;
  const alarm = p.alive && c.mothD <= 58;
  const idle = p.alive && p.onGround && Math.abs(p.vx) < 5 && Math.abs(p.windVx || 0) < 30 && !p.riding && !acting;
  const was = c.still;
  c.still = idle ? c.still + dt : 0;
  if (curious || alarm || wet > 0.05 || c.shake > 0 || (mood && mood !== 'joy')) c.still = Math.min(c.still, 1.9);
  if (was > 2 && c.still === 0 && p.alive) {
    c.startle = 0.4;
    if (voiced && was > 8.6) Audio.sfx('mrrp');
  }
  const s = c.still, torch = c.torchNear;
  const sitting = torch ? s > 6.5 : s > 2;
  const grooming = !torch && s > 3.5 && s < 5.3;
  const stretching = !torch && s > 6 && s < 7.4;
  const rubbing = torch && s > 0.6 && s < 6.5;
  c.sleepy = clamp((s - (torch ? 7.2 : 7.7)) / 1.2, 0, 1);
  c.groom = grooming ? (s - 3.5) / 1.8 : -1;
  c.rubbing = rubbing;
  c.kneading = world && time < kneadUntil && p.alive;
  if (stretching && !c.yawned) { c.yawned = true; if (voiced) Audio.sfx('yawn'); }
  if (!stretching) c.yawned = false;
  c.stretchK = stretching ? Math.sin(clamp((s - 6) / 1.4, 0, 1) * Math.PI) : 0;

  // landings: ears and whiskers bounce, a big drop knocks the wind out, a big jump earns a smug blink
  if (p.onGround && !c.ground && p.alive) {
    const v = c.air.vy;
    c.earV += v * 0.05; c.whiskV += v * 0.06;
    if (v > 950) c.oof = 0.35;
    else if (c.air.from - c.air.top > 70 && time - c.lastSmug > 9 && !mood) { c.smug = 1.2; c.lastSmug = time; }
  }
  if (!p.onGround) {
    if (c.ground) { c.air.from = feet; c.air.top = feet; }
    c.air.top = Math.min(c.air.top, feet);
    c.air.vy = p.vy;
  }
  c.ground = p.onGround;

  // wet: after leaving the drip, a full-body shake-off and an indignant huff
  if (!p.alive) c.wetPeak = 0;
  else if (wet > c.wetPeak) c.wetPeak = wet;
  if (c.wetPeak > 0.25 && wet < 0.04 && p.onGround && p.alive) {
    c.wetPeak = 0; c.shake = 0.75;
    if (world && (opts.quality ?? 2) > 0) shakeDrops(p);
    if (voiced) Audio.sfx('mew');
  }
  if (c.shake > 0) { c.shake -= dt; if (c.shake <= 0) c.huff = 1.4; }
  c.huff = Math.max(0, c.huff - dt);
  c.startle = Math.max(0, c.startle - dt);
  c.oof = Math.max(0, c.oof - dt);
  c.smug = Math.max(0, c.smug - dt);

  // hunting: crouch, chatter at the moth, wiggle before the pounce
  if (curious) {
    if (time > c.nextChatter) { c.chatter = 0.55; c.nextChatter = time + 2.6 + Math.random() * 1.5; if (voiced) Audio.sfx('chatter'); }
  } else c.nextChatter = Math.max(c.nextChatter, time + 0.6);
  c.chatter = curious ? Math.max(0, c.chatter - dt) : 0;
  c.curious = curious; c.alarm = alarm;

  // a random ear flick while standing about
  c.flick = Math.max(0, c.flick - dt);
  if (s > 0.5 && time > c.nextFlick && c.sleepy < 1) { c.flick = 0.22; c.flickSide = Math.random() < 0.5 ? -1 : 1; c.nextFlick = time + 2.5 + Math.random() * 3.5; }

  // poses, eased
  ease(c, dt, 'sit', sitting || c.kneading ? (c.sleepy > 0.3 ? 1.6 : 1) : 0, 9);
  ease(c, dt, 'wrap', (sitting && !stretching) ? 1 : 0, 7);
  ease(c, dt, 'crouch', curious && p.onGround ? 1 : 0, 8);
  ease(c, dt, 'stretch', c.stretchK, 12);
  const leanTo = rubbing ? Math.sign(c.torchDx) * (p.facing || 1) * 0.16 * Math.max(0, Math.sin((s - 0.6) * 3.4)) : 0;
  ease(c, dt, 'lean', leanTo, 10);
  let puff = 0;
  if (alarm || c.startle > 0 || mood === 'ouch') puff = 1;
  else if (c.shake > 0) puff = 0.9;
  else if (wet > 0.3) puff = 0.8;
  else if (p.alive && frac < 0.2) puff = 0.5;
  ease(c, dt, 'puff', puff, puff > c.puff ? 18 : 4);
  spring(c, 'ear', 'earV', 0, 170, 9, dt);
  spring(c, 'whisk', 'whiskV', 0, 150, 8, dt);
  ease(c, dt, 'slit', bright && !curious && !alarm ? 1 : 0, 3);
  ease(c, dt, 'wide', curious || alarm || c.startle > 0 ? 1 : (frac < 0.25 ? 0.5 : 0), 8);

  // purring: by a lit torch, kneading at the goal, or dozing in the warm
  const purr = p.alive && (c.kneading || (torch && s > 1.2)) ? (c.sleepy > 0 ? 0.6 : 1) : 0;
  ease(c, dt, 'purr', purr, 3);
  if (world) purring = c.purr;

  tail(c, p, time, dt, mood);
}

// The tail: a chain of segments, each springing to its pose angle, kicked by the body's
// changes in speed so it lags, swishes and flicks on its own.
function tail(c, p, time, dt, mood) {
  const facing = p.facing || 1;
  const vx = (p.vx || 0) + (p.windVx || 0), vy = p.vy || 0;
  let dvx = (vx - c.vx) * facing, dvy = vy - c.vy;
  if (Math.abs(dvx) > 1500 || Math.abs(dvy) > 1500 || facing !== c.facing) { dvx = 0; dvy = 0; }
  if (facing !== c.facing) c.relV[0] += 5;
  c.vx = vx; c.vy = vy; c.facing = facing;
  const run = p.onGround && Math.abs(p.vx) > 20;
  const happy = (mood === 'joy' || c.kneading || c.smug > 0 || c.rubbing) && p.alive;
  let base = -2.95, curl = 0.3, hook = 0, wave = 0, waveHz = 2.6, stiff = 70;
  if (!p.alive) { base = -2.9; curl = 0.05; stiff = 40; }
  else if (c.puff > 0.6) { base = -2.15; curl = 0.05; stiff = 120; }
  else if (happy || c.stretch > 0.3) { base = -2.25; curl = 0.07; hook = 0.6; }
  else if (c.crouch > 0.5) { base = -2.85; curl = 0.16; }
  else if (!p.onGround) { base = vy < 0 ? -2.9 : -2.35; curl = vy < 0 ? 0.1 : 0.26; }
  else if (run) { base = -3.05; curl = 0.13; wave = 0.08; waveHz = 8; }
  else {
    // waiting: the swish grows more impatient the longer Wick stands about
    wave = clamp((c.still - 0.3) / 1.2, 0, 1) * 0.22 * (1 - Math.min(1, c.sit));
    waveHz = 2.2 + wave * 6;
  }
  const rel = c.rel, vel = c.relV;
  let abs = 0;
  for (let i = 0; i < TAIL_N; i++) {
    let target = i === 0 ? base : curl + (i >= TAIL_N - 2 ? hook : 0);
    target += Math.sin(time * waveHz - i * 0.75) * wave * (i === 0 ? 1.2 : 1);
    if (i === TAIL_N - 1 && c.crouch > 0.5) target += Math.sin(time * 19) * 0.45 * (Math.sin(time * 2.3) > 0 ? 1 : 0.2);   // tip twitch
    if (i === TAIL_N - 1 && happy) target += Math.sin(time * 26) * 0.08;   // a happy quiver
    abs += rel[i];
    // the chain's own inertia: the body speeding up or stopping drags it the other way
    vel[i] += (Math.cos(abs) * -dvy - Math.sin(abs) * -dvx) * 0.0022 * (0.6 + i * 0.25);
    vel[i] += (target - rel[i]) * stiff * (1 - i * 0.09) * dt;
    vel[i] = clamp(vel[i] * Math.exp(-8 * dt), -40, 40);
    rel[i] += vel[i] * dt;
  }
  // chain -> points, blended toward the wrapped-round-the-paws pose
  const px = c.px, py = c.py, wrap = c.wrap;
  let x = -p.w / 2 + 3, y = -5, a = 0;
  for (let i = 0; i <= TAIL_N; i++) {
    if (i > 0) { a += rel[i - 1]; x += Math.cos(a) * TAIL_L; y += Math.sin(a) * TAIL_L; }
    let qx = x + (WRAP[i][0] - x) * wrap, qy = y + (WRAP[i][1] - y) * wrap;
    if (p.onGround && qy > -1.5) qy = -1.5;
    px[i] = qx; py[i] = qy;
  }
}

function tailPath(ctx, c) {
  const px = c.px, py = c.py;
  ctx.beginPath();
  ctx.moveTo(px[0], py[0]);
  for (let i = 1; i < TAIL_N; i++) ctx.quadraticCurveTo(px[i], py[i], (px[i] + px[i + 1]) / 2, (py[i] + py[i + 1]) / 2);
  ctx.lineTo(px[TAIL_N], py[TAIL_N]);
}

function drawTail(ctx, c, body) {
  const fat = c.puff * 4.5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7 + fat; tailPath(ctx, c); ctx.stroke();
  if (c.puff > 0.2) {
    // bottle-brush: tufts bristling out of the outline
    const r = (7 + fat) / 2;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 1; i <= TAIL_N; i++) {
      const dx = c.px[i] - c.px[i - 1], dy = c.py[i] - c.py[i - 1], l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l, mx = (c.px[i] + c.px[i - 1]) / 2, my = (c.py[i] + c.py[i - 1]) / 2;
      for (const sd of SIDES) {
        const o = sd * (i % 2 ? 1 : 0.6);
        ctx.moveTo(mx + nx * r * 0.7 * sd, my + ny * r * 0.7 * sd);
        ctx.lineTo(mx + nx * (r + 2.2 * c.puff) * sd + dx / l * o, my + ny * (r + 2.2 * c.puff) * sd + dy / l * o);
      }
    }
    ctx.stroke();
  }
  ctx.strokeStyle = body; ctx.lineWidth = 4 + fat; tailPath(ctx, c); ctx.stroke();
}

// eyelids drawn over an open eye: 0 open .. 1 shut
function lid(ctx, ex, ey, k, body) {
  ctx.fillStyle = body;
  ctx.fillRect(ex - 4, ey - 5, 8, 1 + k * 5);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(ex - 3.4, ey - 4.4 + k * 5, 6.8, 1.3);
}

export function drawWick(ctx, p, time, opts = {}) {
  const frac = p.waxFrac();
  const w = p.w, h = p.h;
  const cx = p.x + w / 2, fy = p.y + h;
  const facing = p.facing || 1;
  if (opts.world) noteWick(p);
  const c = catOf(p);
  const dt = c.lastT < 0 ? 0 : clamp(time - c.lastT, 0, 0.1);
  c.lastT = time; face.now = time;
  if (opts.world && (opts.quality ?? 2) > 0) drawDrops(ctx, dt);
  ctx.save();
  ctx.translate(cx, fy);
  if (opts.scale) ctx.scale(opts.scale, opts.scale);
  if (p.hurt > 0 && Math.floor(time * 18) % 2) ctx.globalAlpha = 0.45;   // moth-hit blink

  if (!p.alive && p.deathReason === 'burnout') {
    drawPuddle(ctx, w, time);
    ctx.restore();
    return;
  }

  // what Wick is feeling and doing this frame
  think(c, p, time, dt, opts);
  const mood = face.until > time ? face.mood : null;
  const gusty = Math.abs(p.windVx || 0) > 70;
  const sleepy = c.sleepy, wet = c.wet;
  const shaking = c.shake > 0;

  if (wet > 0.15) ctx.translate(Math.sin(time * 70) * wet * 1.2, 0);   // shivering in the drip
  const body = mix(WAX, WET, wet * 0.8), shade = mix(WAX_SHADE, WET_SHADE, wet * 0.8);
  const moving = p.onGround && Math.abs(p.vx) > 20;
  const bob = moving ? Math.abs(Math.sin(time * 16)) * 1.5 : Math.sin(time * (sleepy > 0.5 ? 1.2 : 2.2)) * (sleepy > 0.5 ? 0.9 : 0.5);

  // squash & stretch around the feet (sitting and crouching settle lower)
  const sq = (p.squash || 0) + c.sit * 0.05 + c.crouch * 0.1 + c.stretch * 0.08 + c.startle * -0.25;
  ctx.scale(1 + sq * 0.9, 1 - sq);
  ctx.scale(facing, 1);

  // wax pool at the base
  ctx.fillStyle = shade;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-1, -1, w / 2 + 5, 3.6, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // whole-body moves over the pool: headbutt-lean on a torch, the stretch, the butt-wiggle, the shake-off
  ctx.save();
  if (c.lean) ctx.rotate(c.lean);
  if (c.stretch > 0.01) ctx.transform(1, 0, c.stretch * 0.22, 1, 0, 0);   // reach forward, rump back
  if (c.crouch > 0.5 && p.onGround && Math.abs(p.vx) < 5 && c.mothDx * facing > 0 && Math.sin(time * 1.4) > 0.2) {
    ctx.translate(6, 0); ctx.rotate(Math.sin(time * 15) * 0.05); ctx.translate(-6, 0);
  }
  if (shaking) {
    const k = c.shake / 0.75;
    ctx.translate(0, -h * 0.45); ctx.rotate(Math.sin(time * 48) * 0.16 * k); ctx.translate(0, h * 0.45);
  }
  if (c.startle > 0) ctx.translate(0, -Math.sin(c.startle / 0.4 * Math.PI) * 3);

  if (c.wrap < 0.5) drawTail(ctx, c, body);

  const top = -h - bob * 0.3;

  // ears (behind the body)
  let earUp = mood === 'surprise' || c.startle > 0 ? -3 : gusty ? 4 : c.curious ? -2.2 : sleepy * 2;
  let earBack = gusty ? 3 : 0;
  if (c.huff > 0 || wet > 0.3 || c.alarm) { earUp = 3.5; earBack = 3; }   // airplane ears
  if (shaking) earUp = Math.sin(time * 48) * 4;
  earUp += c.ear;
  for (const s of SIDES) {
    const fl = c.flick > 0 && s === c.flickSide ? Math.sin(c.flick / 0.22 * Math.PI) : 0;
    const up = earUp + fl * 4, back = earBack + fl * 2.5;
    ctx.beginPath();
    ctx.moveTo(s * (w / 2 - 1), top + 7);
    ctx.lineTo(s * (w / 2 - 2) - back, top - 7 + up);
    ctx.lineTo(s * (w / 2 - 11), top + 1);
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * (w / 2 - 3), top + 4);
    ctx.lineTo(s * (w / 2 - 3.5) - back, top - 3 + up * 0.7);
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
  // low wax (under 35%): a warm rim outside the outline, so the danger state is the most readable one
  const rim = p.alive ? clamp((0.35 - frac) / 0.3, 0, 1) : 0;
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

  if (c.wrap >= 0.5) drawTail(ctx, c, body);

  // paws: trot, land soft, tuck together to sit, tuck away to sleep, knead, reach out in a stretch
  const step = moving ? Math.sin(time * 16) * 2 : 0;
  ctx.fillStyle = WAX_RIM;
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6;
  if (sleepy < 0.6) {
    const sitK = Math.min(1, c.sit);
    for (let i = 0; i < 2; i++) {
      let px = (i ? 6 : -5) + (i ? -step : step) * 0.5, py = -2, rx = 4;
      px += sitK * (i ? -1 : 6);                         // sitting: paws side by side in front
      if (c.kneading) { py -= Math.max(0, Math.sin(time * 9 + i * Math.PI)) * 2.2; px += 1; }
      if (c.stretch > 0.01 && i) { px += c.stretch * 9; rx += c.stretch * 2.5; }   // the front paw reaches out
      if (c.groom >= 0 && i) continue;                  // that paw is up at the face
      ctx.beginPath(); ctx.ellipse(px, py, rx, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  // face: fixed size, pinned near the top
  const ey = top + Math.min(13, Math.max(8, h * 0.45));
  const blink = !p.alive || (time % 3.7) < 0.12 || sleepy >= 1;
  const lx = c.lookX * 1.4, ly = c.lookY * 1.2;
  const big = mood === 'surprise' || c.startle > 0 ? 1.25 : 1 + c.wide * 0.14;
  const squeeze = (mood === 'ouch' || shaking || c.oof > 0 || c.stretch > 0.4) && p.alive;
  const content = (c.groom >= 0 || c.rubbing && Math.abs(c.lean) > 0.04 || c.kneading) && p.alive;
  // the slow blink: a cat's "I trust you" (and "I meant to do that")
  const smugLid = c.smug > 0 ? Math.sin(clamp((1.2 - c.smug) / 1.0, 0, 1) * Math.PI) * 0.85 : 0;
  ctx.fillStyle = OUTLINE;
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let side = 0; side < 2; side++) {
    const ex = side ? 7 : -2.5;
    if ((mood === 'joy' || c.kneading) && p.alive) {
      // happy ^ ^ eyes
      ctx.beginPath(); ctx.arc(ex, ey + 1.5, 3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else if (squeeze) {
      // squeezed > < eyes
      const d = side ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(ex - 2.6 * d, ey - 2.6); ctx.lineTo(ex + 2.4 * d, ey); ctx.lineTo(ex - 2.6 * d, ey + 2.6); ctx.stroke();
    } else if (blink) {
      ctx.fillRect(ex - 3, ey, 6, 1.6);
    } else if (gusty || content) {
      // squinting into the wind, or eyes shut in bliss
      ctx.beginPath(); ctx.moveTo(ex - 3, ey - 0.5); ctx.quadraticCurveTo(ex, ey + 1.6, ex + 3, ey - 0.5); ctx.stroke();
    } else {
      const ox = ex + lx * 0.5, oy = ey + ly * 0.5;
      const pw = 3.2 * big * (1 - c.slit * 0.68);
      if (c.slit > 0.05) {
        // in bright light the pupil narrows to a slit and the amber shows
        ctx.fillStyle = IRIS;
        ctx.beginPath(); ctx.ellipse(ox, oy, 3.2 * big, 4.2 * big, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1.1; ctx.stroke();
        ctx.fillStyle = OUTLINE;
      }
      ctx.beginPath(); ctx.ellipse(ox + lx * 0.25, oy, pw, 4.2 * big, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + 1 + lx, ey - 1.6 + ly, 1.3 + c.wide * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex - 1.2 + lx, ey + 1.5 + ly, 0.6, 0, Math.PI * 2); ctx.fill();
      const lidK = Math.max(sleepy, smugLid, c.huff > 0 ? 0.45 : 0);
      if (lidK > 0) lid(ctx, ex, ey, lidK, body);
      ctx.fillStyle = OUTLINE;
      ctx.lineWidth = 1.6;
    }
  }
  // worried brows when the wax runs low; cross ones in a huff
  if (p.alive && (frac < 0.3 || c.huff > 0) && mood !== 'joy') {
    const cross = c.huff > 0 ? -1 : 1;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-5.5, ey - 7.15 + 0.65 * cross); ctx.lineTo(-0.5, ey - 7.15 - 0.65 * cross);
    ctx.moveTo(4.5, ey - 7.15 - 0.65 * cross); ctx.lineTo(9.5, ey - 7.15 + 0.65 * cross);
    ctx.stroke();
  }
  // blush
  ctx.fillStyle = 'rgba(240,120,130,0.55)';
  ctx.beginPath(); ctx.ellipse(-7, ey + 5, 2.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(11, ey + 5, 2.2, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  // whiskers: forward when curious, swept back in wind and at a run, drooping when the wax runs low
  {
    let ang = 0.06, spread = 0.2, len = 8;
    if (c.curious) { ang = -0.22; spread = 0.28; len = 9; }
    else if (gusty || moving || !p.onGround) { ang = 0.3; spread = 0.1; len = 6.5; }
    else if (frac < 0.3 || !p.alive || sleepy > 0.5) { ang = 0.5; spread = 0.16; }
    ang += clamp(c.whisk * 0.02, -0.5, 0.5);
    if (c.chatter > 0) ang += Math.sin(time * 40) * 0.08;
    const wy = ey + 5.6;
    ctx.strokeStyle = 'rgba(42,22,48,0.8)'; ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const k of SIDES) {
      const a = ang + k * spread;
      ctx.moveTo(6.3, wy); ctx.lineTo(6.3 + Math.cos(a) * len, wy + Math.sin(a) * len);
      ctx.moveTo(-1.7, wy); ctx.lineTo(-1.7 - Math.cos(a) * len * 0.8, wy + Math.sin(a) * len * 0.8);
    }
    ctx.stroke();
  }
  // mouth
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.3;
  ctx.beginPath();
  const scared = frac < 0.2 || wet > 0.3 || mood === 'ouch' || mood === 'surprise' || c.alarm || c.oof > 0;
  if (mood === 'joy' && p.alive) {
    // a big open grin
    ctx.moveTo(-0.6, ey + 4.8); ctx.quadraticCurveTo(2.3, ey + 10, 5.2, ey + 4.8); ctx.closePath();
    ctx.fillStyle = '#c0485a'; ctx.fill();
  } else if (c.stretch > 0.3 && p.alive) {
    // the big stretch yawn, all teeth and tongue
    ctx.ellipse(2.3, ey + 7, 2.4, 1 + c.stretch * 2.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#c0485a'; ctx.fill();
  } else if (c.groom >= 0 && c.groom < 0.6) {
    // licking a paw: a little pink tongue
    ctx.arc(2.3, ey + 5.6, 1.5, 0.1 * Math.PI, 0.9 * Math.PI);
    if (Math.sin(time * 14) > 0) {
      ctx.stroke(); ctx.beginPath();
      ctx.fillStyle = '#e86a7c'; ctx.ellipse(3.6, ey + 7.6, 1.6, 1.2, 0.4, 0, Math.PI * 2); ctx.fill();
    }
  } else if (sleepy >= 1) {
    ctx.arc(2.3, ey + 6.5, 1.2 + Math.max(0, Math.sin(time * 0.9)) * 1.4, 0, Math.PI * 2);   // a slow yawn
  } else if (c.chatter > 0) {
    // jaw chatter at the moth
    ctx.ellipse(2.3, ey + 6.6, 1.6, Math.floor(time * 18) % 2 ? 1.9 : 0.6, 0, 0, Math.PI * 2);
  } else if (scared) {
    ctx.arc(2.3, ey + 7, 1.6, 0, Math.PI * 2);
  } else if (c.huff > 0) {
    // an indignant pout
    ctx.moveTo(0, ey + 7.2); ctx.quadraticCurveTo(2.3, ey + 5, 4.6, ey + 7.2);
  } else {
    ctx.arc(0.8, ey + 5.2, 1.6, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.moveTo(5.4, ey + 5.6);
    ctx.arc(3.8, ey + 5.2, 1.6, 0.1 * Math.PI, 0.9 * Math.PI);
  }
  ctx.stroke();

  // grooming: a paw up to lick, then a wipe over the face and ear
  if (c.groom >= 0) {
    const g = c.groom;
    let gx, gy;
    if (g < 0.6) { gx = 6.5; gy = ey + 8 - Math.abs(Math.sin(time * 7)) * 1.6; }
    else { const u = Math.sin(((g - 0.6) / 0.4) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5; gx = 7.5 - u * 1.5; gy = ey + 7 - u * 11; }
    // the foreleg, up from the chest
    const ax = w / 2 - 5, ay = Math.min(-4, ey + 17);
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6.4;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(gx + 4, (ay + gy) / 2 + 2, gx, gy); ctx.stroke();
    ctx.strokeStyle = body; ctx.lineWidth = 3.4; ctx.stroke();
    ctx.fillStyle = WAX_RIM; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(gx, gy, 3.4, 2.8, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0a0a8';
    ctx.beginPath(); ctx.arc(gx + 0.4, gy + 0.3, 0.9, 0, Math.PI * 2); ctx.fill();
  }

  // wick string
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(1, top + 1); ctx.lineTo(1.5, top - 5); ctx.stroke();

  // flame
  if (p.alive) {
    const lean = clamp(-(p.vx + (p.windVx || 0)) / CFG.RUN_SPEED, -1.2, 1.2) * facing;
    const flick = 1 + Math.sin(time * 31) * 0.06 + Math.sin(time * 17.3) * 0.05 + (p.flicker || 0) * Math.sin(time * 53);
    const size = (6 + 7 * frac) * flick * (1 - wet * 0.75);
    drawFlame(ctx, 1.5, top - 5, size, lean * 0.6 - c.lean * 2, time);
  }
  ctx.restore();
  if (sleepy >= 1) {
    ctx.scale(facing, 1);
    ctx.fillStyle = 'rgba(255,240,210,0.85)';
    for (let k = 0; k < 3; k++) {
      const ph = (time * 0.5 + k / 3) % 1;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
      ctx.font = `700 ${8 + ph * 6 | 0}px sans-serif`;
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
  // a warm pool of light round Wick, a soft halo, a bright rim, then the crisp outline
  ctx.globalCompositeOperation = 'lighter';
  const r = 46 + 10 * rim;
  const pool = ctx.createRadialGradient(0, -14, 0, 0, -14, r);
  pool.addColorStop(0, `rgba(255,180,100,${(0.16 + 0.12 * rim) * beat})`); pool.addColorStop(1, 'rgba(255,150,70,0)');
  ctx.fillStyle = pool; ctx.fillRect(-r, -14 - r, r * 2, r * 2);
  ctx.strokeStyle = `rgba(255,170,80,${(0.22 + 0.2 * rim) * beat})`;
  ctx.lineWidth = 8 + 6 * rim; ctx.stroke(lowRim.path);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgba(255,${200 + 30 * Math.sin(time * 6) | 0},130,${(0.75 + 0.25 * rim) * beat})`;
  ctx.lineWidth = 3 + 2.8 * rim; ctx.stroke(lowRim.path);
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
