// WICK: game loop, scene switching, and the glue between systems.
import { CFG } from './config.js';
import { Events } from './events.js';
import { Input, input } from './input.js';
import { Player } from './player.js';
import { createWorld } from './level.js';
import { Camera } from './render/camera.js';
import { Lighting } from './render/lighting.js';
import { drawBackground, drawTiles, drawProps, drawEntities, drawSignPosts, drawSignText } from './render/draw-world.js';
import { drawWick } from './render/draw-wick.js';
import { Particles } from './render/particles.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import level1 from './levels/level1.js';
import level2 from './levels/level2.js';
import level3 from './levels/level3.js';
import level4 from './levels/level4.js';
import level5 from './levels/level5.js';
import level6 from './levels/level6.js';
import level7 from './levels/level7.js';
import level8 from './levels/level8.js';

export { Events };
export const LEVELS = [level1, level2, level3, level4, level5, level6, level7, level8];

const W = CFG.VIEW_W, H = CFG.VIEW_H;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const rotateEl = document.getElementById('rotate');
let scale = 1;

const state = {
  scene: 'title',          // title | play | end
  titleMenu: false,
  sel: 0,
  paused: false,
  levelIndex: 0,
  world: null,
  player: new Player(),
  camera: new Camera(),
  particles: new Particles(),
  levelCard: 0,
  completeTimer: 0,
  hitStop: 0,
  flash: 0,
  fadeIn: 0,
  time: 0,
  stats: { time: 0, deaths: 0, drips: 0 },
  tap: null,
  rotateBlock: false,
  standalone: window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches,
  frameMs: 0,
  slowFrames: 0,
};

// ---------------------------------------------------------------- persistence
function loadProgress() {
  try { return Math.min(LEVELS.length - 1, parseInt(localStorage.getItem('wick.level') || '0', 10) || 0); } catch { return 0; }
}
function saveProgress(i) {
  try { localStorage.setItem('wick.level', String(i)); } catch { /* storage blocked */ }
}

// ---------------------------------------------------------------- canvas sizing
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.min(vw / W, vh / H);
  const cssW = Math.floor(W * s), cssH = Math.floor(H * s);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, CFG.MAX_DPR);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = canvas.width / W;
  const coarse = matchMedia('(pointer: coarse)').matches;
  state.rotateBlock = coarse && vh > vw;
  rotateEl.classList.toggle('on', state.rotateBlock);
  if (state.rotateBlock && state.scene === 'play') state.paused = true;
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- input wiring
Input.init(window);
Input.onGesture = () => Audio.init();
Input.gamepad.onConnect = () => UI.toast('Controller connected');
Input.gamepad.onDisconnect = () => {
  UI.toast('Controller disconnected', 3.5);
  if (state.scene === 'play') state.paused = true;
};

canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  state.tap = { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  if (e.pointerType !== 'touch') Input.setDevice('keyboard');
});
for (const ev of ['contextmenu', 'selectstart', 'gesturestart', 'dblclick']) {
  document.addEventListener(ev, (e) => e.preventDefault());
}
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

function pauseForBackground() {
  if (state.scene === 'play') state.paused = true;
  Audio.suspend();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pauseForBackground();
  else Audio.resume();
});
window.addEventListener('pagehide', pauseForBackground);
window.addEventListener('blur', () => { if (state.scene === 'play' && !DEBUG) state.paused = true; });

// ---------------------------------------------------------------- events -> juice
const P = state.particles;
Events.on('jump', (e) => { Audio.sfx('jump', e); P.dust(e.x, e.y, 4, 0.6); });
Events.on('land', (e) => {
  Audio.sfx('land', e);
  P.dust(e.x, e.y, 6 + (e.hard * 6 | 0), 0.6 + e.hard);
  if (e.frac > 0.6) state.camera.shake(1.5 + e.hard * 4 * e.frac);
  if (e.frac > 0.85 && e.hard > 0.2) Input.gamepad.rumble('land');
});
Events.on('drip', (e) => { Audio.sfx('drip'); P.splat(e.x, e.y); state.stats.drips++; });
Events.on('dripFail', () => Audio.sfx('dripFail'));
Events.on('reabsorb', (e) => { Audio.sfx('reabsorb'); P.absorb(e.x, e.y, e.tx, e.ty); });
Events.on('melt', (e) => { Audio.sfx('melt'); P.splat(e.x, e.y - 4, 4); });
Events.on('relight', (e) => {
  Audio.sfx('relight');
  P.sparks(e.x, e.y, 26, 220);
  P.ring(e.x, e.y, 170);
  state.flash = 1;
  state.hitStop = 2;
  Input.gamepad.rumble('relight');
});
Events.on('pickup', (e) => { Audio.sfx('pickup'); P.sparks(e.x, e.y, 14, 140, '255,200,90'); P.ring(e.x, e.y, 80); });
Events.on('ignite', (e) => { Audio.sfx('ignite'); P.sparks(e.x, e.y, 6, 90); });
Events.on('steam', (e) => { Audio.sfx('steam'); P.steam(e.x, e.y); });
Events.on('death', (e) => {
  Audio.sfx(e.reason === 'water' ? 'extinguish' : 'burnout');
  if (e.reason === 'water') for (let i = 0; i < 10; i++) P.steam(e.x, e.y - 30);
  P.smoke(e.x, e.y - 10, 12);
  state.camera.shake(3);
  Input.gamepad.rumble('death');
});
Events.on('levelComplete', (e) => {
  Audio.sfx('complete');
  P.sparks(e.x, e.y, 60, 320);
  P.ring(e.x, e.y, 320);
  state.flash = 1.6;
  state.hitStop = 4;
  state.completeTimer = CFG.GOAL_DELAY + (state.world.data.finale ? 1.5 : 0);
  Input.gamepad.rumble('relight');
});

// ---------------------------------------------------------------- scenes
function startLevel(i) {
  state.levelIndex = i;
  state.world = createWorld(LEVELS[i]);
  state.world.onSplash = (x, y) => { if (Math.random() < 0.35) P.splash(x, y); };
  const sp = state.world.spawn;
  state.player.spawn(sp.x, sp.y, CFG.WAX_MAX);
  state.camera.snap(state.player, state.world);
  P.clear();
  state.levelCard = CFG.LEVEL_CARD_TIME;
  state.completeTimer = 0;
  state.paused = false;
  state.fadeIn = 1;
  state.scene = 'play';
  saveProgress(i);
  Audio.music('play');
}

function newGame(i = 0) {
  state.stats = { time: 0, deaths: 0, drips: 0 };
  startLevel(i);
}

function toTitle() {
  state.scene = 'title';
  state.titleMenu = false;
  state.sel = 0;
  state.paused = false;
  Audio.music('title');
  Audio.setFlame(0, false);
}

function titleItems() {
  const saved = loadProgress();
  return saved > 0 ? [`Continue: ${LEVELS[saved].name}`, 'New game'] : ['Start'];
}

function pauseItems() {
  return ['Resume', 'Restart from torch', 'Restart level', `Sound: ${Audio.muted ? 'Off' : 'On'}`, 'Quit to title'];
}

// Generic menu navigation. Returns the chosen index or -1.
function navMenu(count) {
  if (input.upPressed) { state.sel = (state.sel + count - 1) % count; Audio.sfx('menu'); }
  if (input.downPressed) { state.sel = (state.sel + 1) % count; Audio.sfx('menu'); }
  if (state.tap) {
    const i = UI.hitTest(state.tap.x, state.tap.y);
    state.tap = null;
    if (i >= 0) { state.sel = i; Audio.sfx('select'); return i; }
  }
  if (input.confirmPressed) { Audio.sfx('select'); return state.sel; }
  return -1;
}

function respawn() {
  state.world.reset(state.player);
  state.camera.snap(state.player, state.world);
}

// ---------------------------------------------------------------- update
function update(dt) {
  state.time += dt;
  UI.update(dt);
  if (input.mutePressed) Audio.toggleMute();

  if (state.scene === 'title') {
    if (!state.titleMenu) {
      if (input.anyPressed || state.tap) {
        state.tap = null;
        state.titleMenu = true;
        state.sel = 0;
        Audio.init();
        Audio.music('title');
      }
      return;
    }
    const items = titleItems();
    const c = navMenu(items.length);
    if (c >= 0) {
      if (items.length === 2 && c === 0) newGame(loadProgress());
      else newGame(0);
    }
    return;
  }

  if (state.scene === 'end') {
    state.particles.update(dt);
    if (state.time > state.endAt + 1.2 && (input.anyPressed || state.tap)) { state.tap = null; toTitle(); }
    return;
  }

  // --- play ---
  const { world, player, camera } = state;
  if (state.paused) {
    if (state.rotateBlock) return;
    if (input.pausePressed || input.backPressed) { state.paused = false; return; }
    const c = navMenu(5);
    if (c === 0) state.paused = false;
    else if (c === 1) { respawn(); state.paused = false; }
    else if (c === 2) { startLevel(state.levelIndex); }
    else if (c === 3) Audio.toggleMute();
    else if (c === 4) toTitle();
    return;
  }
  state.tap = null;
  if (input.pausePressed) { state.paused = true; state.sel = 0; Audio.setFlame(0, false); return; }
  if (state.hitStop > 0) { state.hitStop--; return; }

  if (input.restartPressed && !state.completeTimer) respawn();

  if (state.completeTimer > 0) {
    state.completeTimer -= dt;
    world.update(dt, null);
    if (state.completeTimer <= 0) {
      if (state.levelIndex + 1 < LEVELS.length) startLevel(state.levelIndex + 1);
      else {
        saveProgress(0);
        state.scene = 'end';
        state.endAt = state.time;
        Audio.music('end');
        Audio.setFlame(0, false);
      }
      return;
    }
  } else {
    player.update(dt, input, world);
    world.update(dt, player);
    state.stats.time += dt;
    if (!player.alive && player.deathTimer <= 0) {
      state.stats.deaths++;
      respawn();
    }
  }

  camera.update(dt, player, world);
  P.ambient(dt, camera, world);
  if (player.alive) {
    const f = player.flamePos();
    const rate = 10 + 18 * player.waxFrac();
    if (Math.random() < rate * dt) P.ember(f.x, f.y - 6, player.waxFrac(), player.vx);
  }
  for (const t of world.torches) {
    if (t.lit && Math.random() < 6 * dt && Math.abs(t.x - player.cx) < W) P.ember(t.x, t.y - 66, 0.6);
  }
  if (world.goal.lit && Math.random() < 30 * dt) P.ember(world.goal.x + (Math.random() - 0.5) * 30, world.goal.y - 100, 1);
  P.update(dt);
  state.levelCard = Math.max(0, state.levelCard - dt);
  state.flash = Math.max(0, state.flash - dt * 2.2);
  state.fadeIn = Math.max(0, state.fadeIn - dt * 2.5);
  Audio.setFlame(player.waxFrac(), player.alive);
  Audio.setTempo(player.waxFrac());
}

// ---------------------------------------------------------------- render
function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const t = state.time;
  if (state.scene === 'title') {
    UI.drawTitle(ctx, t, Input.lastDevice, {
      menu: state.titleMenu ? titleItems() : null, selected: state.sel, standalone: state.standalone,
    });
  } else if (state.scene === 'end') {
    UI.drawEnd(ctx, t, state.stats, Input.lastDevice);
  } else {
    renderPlay(t);
  }
  UI.drawToasts(ctx);
}

function renderPlay(t) {
  const { world, player, camera } = state;
  const cam = { x: camera.vx, y: camera.vy, w: W, h: H };
  drawBackground(ctx, cam, world, t);
  const lights = world.lights(player);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawTiles(ctx, cam, world, lights);
  drawProps(ctx, cam, world, t);
  drawSignPosts(ctx, cam, world);
  drawEntities(ctx, cam, world, t);
  P.draw(ctx, 'world');
  drawWick(ctx, player, t);
  ctx.restore();

  Lighting.render(ctx, world, player, camera, lights, t);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  ctx.globalCompositeOperation = 'lighter';
  P.draw(ctx, 'glow');
  ctx.globalCompositeOperation = 'source-over';
  drawSignText(ctx, cam, world, player, UI.glyphs(Input.lastDevice));
  P.draw(ctx, 'fg');
  ctx.restore();

  if (state.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const big = world.data.finale && world.goal.lit;
    ctx.fillStyle = `rgba(255,150,70,${Math.min(0.5, state.flash * (big ? 0.35 : 0.18))})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (world.data.finale && world.goal.lit) {
    // the castle torch floods the whole screen with warmth
    const k = Math.min(1, world.goal.litTime / 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,140,60,${0.25 * k * (0.8 + 0.2 * Math.sin(t * 4))})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  Lighting.coldVignette(ctx, player.waxFrac(), t);
  UI.drawHUD(ctx, player, t, { muted: Audio.muted, touch: Input.lastDevice === 'touch' });
  if (state.levelCard > 0) UI.drawLevelCard(ctx, world, state.levelIndex, CFG.LEVEL_CARD_TIME - state.levelCard);
  if (state.completeTimer > 0) {
    const k = Math.max(0, 1 - state.completeTimer / 0.6);
    if (k > 0) { ctx.fillStyle = `rgba(14,6,28,${k})`; ctx.fillRect(0, 0, W, H); }
  }
  if (state.fadeIn > 0) { ctx.fillStyle = `rgba(14,6,28,${state.fadeIn})`; ctx.fillRect(0, 0, W, H); }
  if (state.paused && !state.rotateBlock) {
    const g = UI.glyphs(Input.lastDevice);
    UI.drawMenu(ctx, 'Paused', pauseItems(), state.sel, {
      footer: Input.lastDevice === 'touch' ? '' : `${g.restart} restart from torch  ·  M mute`,
    });
  }
  if (DEBUG) {
    ctx.font = '12px monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`frame ${state.frameMs.toFixed(2)}ms  wax ${player.wax.toFixed(1)}  x ${(player.cx / 32).toFixed(1)} y ${(player.feet / 32).toFixed(1)}  dev ${Input.lastDevice}`, 90, 8);
  }
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += dt;
  Input.poll();
  let steps = 0;
  while (acc >= CFG.STEP) {
    update(CFG.STEP);
    acc -= CFG.STEP;
    steps++;
    if (steps === 1) Input.consume();
    if (steps >= 5) { acc = 0; break; }
  }
  const showTouch = Input.lastDevice === 'touch' && state.scene === 'play' && !state.paused && !state.rotateBlock;
  Input.touch.show(showTouch);
  const t0 = performance.now();
  render();
  const ms = performance.now() - t0;
  state.frameMs = state.frameMs * 0.95 + ms * 0.05;
  // protect the framerate on phones: smaller light layer, skip the desaturation pass
  if (state.scene === 'play' && state.frameMs > 11 && Lighting.scale > 0.34) {
    if (++state.slowFrames > 90) { Lighting.setScale(0.33); Lighting.desaturate = false; state.slowFrames = 0; }
  } else state.slowFrames = 0;
  requestAnimationFrame(frame);
}

// debug helpers: ?level=N jumps straight into a level
if (params.has('level')) {
  const n = Math.max(1, Math.min(LEVELS.length, parseInt(params.get('level'), 10) || 1));
  newGame(n - 1);
} else {
  Audio.music('title');
}
window.WICK = { state, LEVELS, startLevel, Lighting };
requestAnimationFrame(frame);
