// WICK: game loop, scene switching, and the glue between systems.
import { CFG } from './config.js';
import { Events } from './events.js';
import { Input, input, setBindings } from './input.js';
import { Settings, keyName, TOUCH_SIZES, TOUCH_OPACITIES } from './settings.js';
import { Player } from './player.js';
import { createWorld } from './level.js';
import { Camera } from './render/camera.js';
import { Lighting } from './render/lighting.js';
import {
  drawBackground, drawTiles, drawProps, drawEntities, drawSignPosts, drawSignText,
  drawTileGlows, drawMist, drawForeground, themeOf, drawDripGuide, drawDecor, drawDecorGlows,
  drawJumpShadow, drawLightDetail, drawWindStreaks, THEMES,
} from './render/draw-world.js';
import { drawWick, drawWickFx, drawWickRim, wickMood } from './render/draw-wick.js';
import { Particles } from './render/particles.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Post } from './render/post.js';
import { drawThemeWorld, updateThemeFx, drawThemeOverlay } from './render/theme-fx.js';
import { drawMovers, drawMoths, drawMothGlows, drawDoors, drawPlates, drawPlateGlows } from './render/draw-dynamic.js';
import LEVEL_LIST from './levels/index.js';

export { Events };
export const LEVELS = LEVEL_LIST;

const W = CFG.VIEW_W, H = CFG.VIEW_H;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const rotateEl = document.getElementById('rotate');
let scale = 1;
let dprCap = CFG.MAX_DPR;   // drops to 1 if a phone can't keep up (see frame())

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
  iris: 1,                 // 0 closed .. 1 open
  trail: [],
  fireworks: 0,
  fireworkTimer: 0,
  time: 0,
  stats: { time: 0, deaths: 0, drips: 0 },
  tap: null,
  rotateBlock: false,
  standalone: window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches,
  frameMs: 0,
  intro: false,            // the studio intro is playing over the title
  slowFrames: 0,
  quality: 2,              // 2 full, 1 lighter light layer, 0 also 1x canvas and no grain/shafts
  perf: { ms: 0, gap: 0, n: 0 },
};

// ---------------------------------------------------------------- persistence
// Progress is stored by level name, so reordering or adding levels never breaks a save.
function loadProgress() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem('wick.progress') || 'null'); } catch { /* storage blocked */ }
  if (!d || !Array.isArray(d.reached)) {
    // migrate the old numeric save
    let i = 0;
    try { i = parseInt(localStorage.getItem('wick.level') || '0', 10) || 0; } catch { /* storage blocked */ }
    i = Math.max(0, Math.min(LEVELS.length - 1, i));
    d = { current: LEVELS[i].name, reached: LEVELS.slice(0, i + 1).map((l) => l.name) };
  }
  return d;
}
function storeProgress(d) {
  try { localStorage.setItem('wick.progress', JSON.stringify(d)); } catch { /* storage blocked */ }
}
function progressIndex() {
  const i = LEVELS.findIndex((l) => l.name === loadProgress().current);
  return i < 0 ? 0 : i;
}
function reachedSet() { return new Set(loadProgress().reached); }
function saveProgress(i) {
  const d = loadProgress();
  d.current = LEVELS[i].name;
  if (!d.reached.includes(d.current)) d.reached.push(d.current);
  storeProgress(d);
}
function finishedGame() {
  const d = loadProgress();
  d.current = LEVELS[0].name;
  storeProgress(d);
}

// Personal bests, also by level name: { v, story, levels: { [name]: { time, wax, deaths,
// keepsake, swift, bright } } }. Kept in memory and written through on change.
let records = null;
function loadRecords() {
  if (records) return records;
  try { records = JSON.parse(localStorage.getItem('wick.records') || 'null'); } catch { /* storage blocked */ }
  if (!records || typeof records !== 'object' || typeof records.levels !== 'object' || !records.levels) records = { v: 1, story: false, levels: {} };
  return records;
}
function storeRecords() {
  try { localStorage.setItem('wick.records', JSON.stringify(loadRecords())); } catch { /* storage blocked */ }
}

// whether each level has a keepsake and a par, probed once from a throwaway world
const levelInfoCache = [];
function levelInfo(i) {
  if (!levelInfoCache[i]) {
    let keepsake = false, par = LEVELS[i].par || null;
    try { const w = createWorld(LEVELS[i]); keepsake = !!w.keepsake; par = (w.data && w.data.par) || par; } catch { /* bad level: no marks */ }
    levelInfoCache[i] = { keepsake, par };
  }
  return levelInfoCache[i];
}

// the three marks per level for the select screen, plus the overall tally
function selectMarks() {
  const recs = loadRecords().levels;
  let kGot = 0, kAll = 0, mGot = 0, mAll = 0;
  const marks = LEVELS.map((L, i) => {
    const info = levelInfo(i), r = recs[L.name] || {};
    const m = {
      keepsake: info.keepsake ? !!r.keepsake : null,
      swift: info.par && info.par.time != null ? !!r.swift || (r.time != null && r.time <= info.par.time) : null,
      bright: info.par && info.par.wax != null ? !!r.bright || (r.wax != null && r.wax >= info.par.wax) : null,
      // for the selected card's detail line: bests and the par to beat
      time: r.time ?? null, wax: r.wax ?? null, deaths: r.deaths ?? null, par: info.par,
    };
    if (m.keepsake !== null) { kAll++; if (m.keepsake) kGot++; }
    for (const k of ['swift', 'bright']) if (m[k] !== null) { mAll++; if (m[k]) mGot++; }
    return m;
  });
  return { marks, kGot, kAll, mGot, mAll };
}

// compares this clear against the saved bests, saves, and returns what the card should show
function recordClear(world, stats) {
  const recs = loadRecords();
  const prev = recs.levels[world.name] || {};
  const time = stats.time, wax = Math.round(stats.wax), deaths = stats.deaths;
  const par = (world.data && world.data.par) || null;
  const hasKeepsake = !!world.keepsake, gotKeepsake = !!(world.keepsake && world.keepsake.got);
  // gentle-wax runs keep keepsakes and deaths, but earn no medals and set no time/wax bests
  const gentle = !!stats.gentle;
  const res = {
    best: {
      time: !gentle && prev.time != null && time < prev.time,
      wax: !gentle && prev.wax != null && wax > prev.wax,
      deaths: prev.deaths != null && deaths < prev.deaths,
    },
    keepsake: hasKeepsake ? gotKeepsake : null,
    swift: par && par.time != null ? !gentle && time <= par.time : null,
    bright: par && par.wax != null ? !gentle && wax >= par.wax : null,
    par,
    gentle,
  };
  // marks earned for the first time on this clear: the card stamps them with a NEW
  res.fresh = { keepsake: !!res.keepsake && !prev.keepsake, swift: !!res.swift && !prev.swift, bright: !!res.bright && !prev.bright };
  if (state.replay) return res;   // bot replays don't touch the player's bests
  recs.levels[world.name] = {
    time: gentle ? prev.time : prev.time != null ? Math.min(prev.time, time) : time,
    wax: gentle ? prev.wax : prev.wax != null ? Math.max(prev.wax, wax) : wax,
    deaths: prev.deaths != null ? Math.min(prev.deaths, deaths) : deaths,
    keepsake: !!prev.keepsake || gotKeepsake,
    swift: !!prev.swift || !!res.swift,
    bright: !!prev.bright || !!res.bright,
  };
  storeRecords();
  return res;
}

// ---------------------------------------------------------------- canvas sizing
function resize() {
  // fit the visible viewport (Safari's toolbars can cover part of innerHeight), minus the safe-area insets
  const vv = window.visualViewport;
  const vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
  if (vv) {
    // pin the page to the visible area so the canvas centres in what the player can actually see
    document.body.style.top = vv.offsetTop + 'px';
    document.body.style.bottom = 'auto';
    document.body.style.height = vh + 'px';
  }
  const bs = getComputedStyle(document.body);
  const padX = (parseFloat(bs.paddingLeft) || 0) + (parseFloat(bs.paddingRight) || 0);
  const padY = (parseFloat(bs.paddingTop) || 0) + (parseFloat(bs.paddingBottom) || 0);
  const s = Math.min((vw - padX) / W, (vh - padY) / H);
  const cssW = Math.floor(W * s), cssH = Math.floor(H * s);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = canvas.width / W;
  const coarse = matchMedia('(pointer: coarse)').matches;
  state.rotateBlock = coarse && vh > vw;
  rotateEl.classList.toggle('on', state.rotateBlock);
  if (state.rotateBlock && state.scene === 'play') state.paused = true;
}
window.addEventListener('resize', resize);
// iOS reports the new size a moment after rotating
window.addEventListener('orientationchange', () => setTimeout(resize, 350));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- input wiring
Input.init(window);
Settings.onKeysChange = (keys) => { setBindings(keys); UI.setKeys(keys); };
Settings.onKeysChange(Settings.get().keys);
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
const shake = (amount) => { if (Settings.get().shake) state.camera.shake(amount); };
Events.on('jump', (e) => { Audio.sfx('jump', e); P.dust(e.x, e.y, 4, 0.6); if (state.help) { const j = state.help.jumps; j.push({ t: state.levelStats.time, x: e.x }); if (j.length > 20) j.shift(); } });
Events.on('land', (e) => {
  Audio.sfx('land', e);
  P.dust(e.x, e.y, 6 + (e.hard * 6 | 0), 0.6 + e.hard);
  if (e.frac > 0.6) shake(1.5 + e.hard * 4 * e.frac);
  if (e.hard > 0.15) P.shock(e.x, e.y, e.hard);
  if (e.frac > 0.85 && e.hard > 0.2) Input.gamepad.rumble('land');
});
Events.on('drip', (e) => { Audio.sfx('drip'); P.splat(e.x, e.y); state.stats.drips++; });
Events.on('dripFail', (e) => {
  Audio.sfx('dripFail');
  state.hudFail = 1;
  P.smoke(e.x, e.y + 4, 3);
  if (e.reason === 'wax') UI.toast('Not enough wax to drip', 1.4);
});
Events.on('reabsorb', (e) => { Audio.sfx('reabsorb'); P.absorb(e.x, e.y, e.tx, e.ty); });
Events.on('melt', (e) => { Audio.sfx('melt'); P.splat(e.x, e.y - 4, 4); });
Events.on('relight', (e) => {
  wickMood('joy', 1.4);
  Audio.sfx('relight');
  P.sparks(e.x, e.y, 26, 220);
  P.ring(e.x, e.y, 170);
  P.pillar(e.x, e.y + 8);
  P.spiral(e.x, e.y);
  state.flash = 1;
  state.hitStop = 2;
  Input.gamepad.rumble('relight');
});
Events.on('pickup', (e) => {
  wickMood('joy', 1);
  Audio.sfx('pickup');
  P.sparks(e.x, e.y, 10, 140, '255,200,90');
  P.ring(e.x, e.y, 80);
  P.homing(e.x, e.y, state.player, 16);
});
Events.on('keepsake', (e) => {
  wickMood('joy', 1);
  Audio.sfx('pickup');
  Audio.sfx('bell');
  P.sparks(e.x, e.y, 18, 170, '255,225,130');
  P.ring(e.x, e.y, 110, '255,215,140');
  P.homing(e.x, e.y, state.player, 10, '255,225,150');
  state.keepsakePop = 1;
  UI.toast('Keepsake found!', 2.2);
});
Events.on('blobLand', (e) => { P.splat(e.x, e.y - 4, 6); P.dust(e.x, e.y, 4, 0.5); });
Events.on('ignite', (e) => { Audio.sfx('ignite'); P.sparks(e.x, e.y, 6, 90); });
Events.on('plate', (e) => { Audio.sfx('plate', { down: e.down }); if (e.down) P.dust(e.x, e.y, 4, 0.4); });
Events.on('door', (e) => { if (e.open) wickMood('surprise', 0.6); Audio.sfx('door', { open: e.open }); P.dust(e.x, e.y, 8, 0.7); shake(1.5); });
Events.on('moth', (e) => {
  wickMood('ouch', 0.7);
  Audio.sfx('moth');
  state.hudFail = 1;
  P.sparks(e.x, e.y, 10, 120, '255,230,190');
  P.smoke(e.x, e.y, 4);
  shake(3);
  state.hitStop = 2;
  if (state.help) state.help.lastMoth = state.levelStats.time;
  Input.gamepad.rumble('land');
});
Events.on('steam', (e) => { Audio.sfx('steam'); P.steam(e.x, e.y); });
Events.on('death', (e) => {
  Audio.sfx(e.reason === 'water' ? 'extinguish' : 'burnout');
  if (e.reason === 'water') { for (let i = 0; i < 18; i++) P.steam(e.x, e.y - 30); P.ring(e.x, e.y - 30, 70, '200,220,255'); }
  else { P.splat(e.x, e.y - 20, 14); P.sparks(e.x, e.y - 30, 8, 80, '255,120,50'); }
  P.smoke(e.x, e.y - 10, 12);
  shake(3);
  Input.gamepad.rumble('death');
  noteDeath(e);
});

// ---------------------------------------------------------------- adaptive help
// Three deaths near the same spot earn one gentle tip per level visit, picked from how Wick
// died. Presentation only: it reads the sim, never feeds back into it, and stays out of replays.
const HELP_RADIUS = 5 * CFG.TILE;
const TIPS = {
  burnout: 'Low wax means lower jumps. A torch refills you.',
  water: 'Wait for the drip to stop — watch the drops thin out.',
  moth: 'Moths follow a fixed loop. Watch the dotted path.',
  gap: 'Drip wax ({drip}) to make a step.',
  wind: 'Gusts are announced by swirling leaves.',
};
function newHelp() { return { deaths: [], jumps: [], lastMoth: -99, lastWind: -99, shown: false, pending: null, tip: null }; }

function noteDeath(e) {
  const h = state.help;
  if (!h || state.replay || Settings.forced || h.shown) return;
  const t = state.levelStats.time;
  h.deaths.push({ x: e.x, y: e.y });
  const near = h.deaths.filter((d) => Math.hypot(d.x - e.x, d.y - e.y) < HELP_RADIUS).length;
  if (near < 3) return;
  let kind = e.reason === 'water' ? 'water' : 'burnout';
  if (kind === 'burnout') {
    // stuck jumping at the same ledge or gap: several jumps in the last few seconds, all close together
    const recent = h.jumps.filter((j) => t - j.t < 6);
    const spread = recent.length ? Math.max(...recent.map((j) => j.x)) - Math.min(...recent.map((j) => j.x)) : Infinity;
    if (t - h.lastMoth < 4) kind = 'moth';
    else if (t - h.lastWind < 3) kind = 'wind';
    else if (recent.length >= 3 && spread < HELP_RADIUS) kind = 'gap';
  }
  h.shown = true;
  h.pending = TIPS[kind];
}
Events.on('levelComplete', (e) => {
  wickMood('joy', 3);
  Audio.sfx('complete');
  P.sparks(e.x, e.y, 60, 320);
  P.ring(e.x, e.y, 320);
  P.pillar(e.x, e.y + 20, 420);
  P.spiral(e.x, e.y, 40);
  state.fireworks = state.world.data.finale ? 7 : 2;
  state.fireworkTimer = 0.3;
  state.flash = 1.6;
  state.hitStop = 4;
  state.completeTimer = CFG.GOAL_DELAY + 0.9 + (state.world.data.finale ? 1.5 : 0);
  state.completeMax = state.completeTimer;
  state.cardGo = false;
  state.cardHeld = 0;
  state.cardRang = 0;
  state.levelStats.wax = state.player.wax;
  try { state.levelResult = recordClear(state.world, state.levelStats); } catch { state.levelResult = null; }
  Input.gamepad.rumble('relight');
});

// ---------------------------------------------------------------- scenes
// the level-complete card holds here (seconds left on its timer) until the player carries on
const CARD_HOLD = 0.5;

function startLevel(i) {
  state.levelIndex = i;
  state.world = createWorld(LEVELS[i]);
  state.world.onSplash = (x, y) => { if (Math.random() < 0.35) P.splash(x, y); };
  const sp = state.world.spawn;
  state.player.assist = Settings.assist();
  state.player.spawn(sp.x, sp.y, CFG.WAX_MAX);
  state.camera.snap(state.player, state.world);
  P.clear();
  state.levelCard = CFG.LEVEL_CARD_TIME;
  state.completeTimer = 0;
  state.cardGo = false;
  state.cardHeld = 0;
  state.cardRang = 0;
  state.paused = false;
  state.iris = 0;
  state.trail = [];
  state.fireworks = 0;
  state.scene = 'play';
  saveProgress(i);
  Audio.music('play', i < 5 ? 'town' : 'night');
  Audio.ambience(themeOf(state.world).rain ? 'rain' : null);
  state.gusts = new Map();
  state.rainOn = new Map();
  state.levelStats = { time: 0, deaths: 0, wax: 0, gentle: Settings.get().gentle };
  state.levelResult = null;
  state.keepsakePop = 0;
  state.help = newHelp();
}

function newGame(i = 0) {
  state.stats = { time: 0, deaths: 0, drips: 0 };
  startLevel(i);
}

// the Lantern Festival intro, once per save, before Market Row (never in test runs)
function startFromTitle(i) {
  if (i === 0 && !DEBUG && !loadRecords().story && reachedSet().size <= 1) {
    state.scene = 'story';
    state.storyAt = state.time;
    state.tap = null;
    return;
  }
  newGame(i);
}
function endStory() {
  loadRecords().story = true;
  storeRecords();
  newGame(0);
}

function toCredits() {
  state.scene = 'credits';
  state.creditsAt = state.time;
  state.creditScroll = 0;
  state.tap = null;
}

function toTitle() {
  state.scene = 'title';
  state.titleMenu = false;
  state.sel = 0;
  state.paused = false;
  Audio.music('title');
  Audio.ambience(null);
  Audio.setFlame(0, false);
  Audio.heartbeat(1, false);
}

function titleItems() {
  const i = progressIndex();
  const items = [];
  if (i > 0) items.push({ label: `Continue: ${LEVELS[i].name}`, act: () => newGame(i) });
  items.push({ label: i > 0 ? 'New game' : 'Start', act: () => (i > 0 ? newGame(0) : startFromTitle(0)) });
  if (reachedSet().size > 1) items.push({ label: 'Choose level', act: () => { state.scene = 'select'; state.sel = i; } });
  items.push({ label: 'Options', act: () => openOptions('title') });
  items.push({ label: 'Credits', act: () => toCredits() });
  return items;
}

function pauseItems() {
  return ['Resume', 'Restart from torch', 'Restart level', `Sound: ${Audio.muted ? 'Off' : 'On'}`, 'Options', 'Quit to title'];
}

// ---------------------------------------------------------------- options
// state.opts = { from: 'title' | 'pause', page: 'main' | 'keys' | 'touch', back: sel to restore, remap: action | null }
const ACTIONS = [['jump', 'Jump'], ['drip', 'Drip wax'], ['soak', 'Soak blob']];

function openOptions(from) {
  state.opts = { from, page: 'main', back: state.sel, remap: null };
  state.sel = 0;
}
function closeOptions() {
  Input.captureKey(null);
  state.sel = state.opts.back;
  state.opts = null;
}
function setOption(key, value) {
  Settings.set(key, value);
  if (key === 'gentle') {
    // takes effect at once; a level touched by gentle wax counts as a gentle run
    state.player.assist = Settings.assist();
    if (value && state.scene === 'play' && state.levelStats) state.levelStats.gentle = true;
  }
}

function optionItems() {
  const s = Settings.get(), on = (v) => (v ? 'On' : 'Off');
  if (state.opts.page === 'keys') {
    const items = ACTIONS.map(([a, name]) => ({
      label: state.opts.remap === a ? `${name}: press a key…` : `${name}: ${s.keys[a].map(keyName).join(' / ')}`,
      act: () => startRemap(a),
      info: state.opts.remap === a ? `Press the new key for ${name.toLowerCase()}  ·  Esc cancels` : 'Choose a row, then press the new key. Arrows and A/D always move.',
    }));
    items.push({ label: 'Reset to defaults', act: () => { Settings.resetKeys(); UI.toast('Keys reset', 1.4); },
      info: 'Space / ↑ / W jump,  ↓ / S / X drip,  E soak.' });
    items.push({ label: 'Back', act: () => { state.opts.page = 'main'; state.sel = 4; } });
    return items;
  }
  if (state.opts.page === 'touch') {
    const cap = (v) => v[0].toUpperCase() + v.slice(1);
    const cycle = (list, key) => (dir = 1) => setOption(key, list[(list.indexOf(s[key]) + (dir < 0 ? list.length - 1 : 1)) % list.length]);
    return [
      { label: `Button size: ${cap(s.touchSize)}`, toggle: cycle(TOUCH_SIZES, 'touchSize'), info: 'Bigger buttons are easier to hit; smaller ones show more of the level.' },
      { label: `Button opacity: ${cap(s.touchOpacity)}`, toggle: cycle(TOUCH_OPACITIES, 'touchOpacity'), info: 'How strongly the buttons show over the game.' },
      { label: `Swap sides: ${on(s.touchSwap)}`, toggle: () => setOption('touchSwap', !s.touchSwap),
        info: 'Jump, drip and soak on the left, the thumb pad on the right.' },
      { label: 'Back', act: () => { state.opts.page = 'main'; state.sel = 4; } },
    ];
  }
  const touch = Input.lastDevice === 'touch';
  return [
    { label: `Gentle wax: ${on(s.gentle)}`, toggle: () => setOption('gentle', !s.gentle),
      info: 'Wax burns slower, moths steal less, rain takes longer. No swift or bright medals.' },
    { label: `Speedrun timer: ${on(s.timer)}`, toggle: () => setOption('timer', !s.timer), info: 'A level clock in the corner.' },
    { label: `Screen shake: ${on(s.shake)}`, toggle: () => setOption('shake', !s.shake), info: 'Camera shake on landings, moths and doors.' },
    { label: `Flashes: ${s.reduceFlash ? 'Reduced' : 'Full'}`, toggle: () => setOption('reduceFlash', !s.reduceFlash),
      info: 'Softens the torch flash and lightning, for light-sensitive eyes.' },
    touch
      ? { label: 'Touch controls', act: () => { state.opts.page = 'touch'; state.sel = 0; }, info: 'Button size, opacity, and a left-handed layout.' }
      : { label: 'Controls', act: () => { state.opts.page = 'keys'; state.sel = 0; }, info: 'Change the keyboard keys for jump, drip and soak.' },
    { label: 'Back', act: closeOptions },
  ];
}

function startRemap(action) {
  state.opts.remap = action;
  if (Input.lastDevice !== 'keyboard') UI.toast('Press a key on the keyboard', 1.8);
  const arm = () => Input.captureKey((code) => {
    if (!state.opts || state.opts.remap !== action) return;
    if (code === 'Escape') { state.opts.remap = null; Audio.sfx('menu'); return; }
    if (!Settings.bind(action, code)) { UI.toast(`${keyName(code)} is kept for moving and menus`, 1.8); Audio.sfx('dripFail'); arm(); return; }
    state.opts.remap = null;
    Audio.sfx('select');
  });
  arm();
}

function updateOptions() {
  const o = state.opts;
  if (o.remap) {
    // waiting for a key; a pad's back button or a tap cancels
    if (input.backPressed || state.tap) { state.tap = null; Input.captureKey(null); o.remap = null; Audio.sfx('menu'); }
    return;
  }
  const items = optionItems();
  if (state.sel >= items.length) state.sel = 0;
  if (input.backPressed || input.pausePressed) {
    Audio.sfx('menu');
    if (o.page !== 'main') { o.page = 'main'; state.sel = 4; } else closeOptions();
    return;
  }
  const it = items[state.sel];
  if (it && it.toggle && (input.leftPressed || input.rightPressed)) { it.toggle(input.leftPressed ? -1 : 1); Audio.sfx('menu'); return; }
  const c = navMenu(items.length);
  if (c < 0) return;
  if (items[c].toggle) items[c].toggle();
  else items[c].act();
}

function drawOptions() {
  const items = optionItems();
  const o = state.opts;
  UI.drawMenu(ctx, o.page === 'keys' ? 'Controls' : o.page === 'touch' ? 'Touch controls' : 'Options', items.map((i) => i.label), state.sel, {
    top: H * 0.2, backdrop: o.from === 'title' ? 'rgba(14,6,28,0.8)' : undefined,
    footer: (items[state.sel] && items[state.sel].info) || '',
    toggles: items.map((i) => !!i.toggle),
  });
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

// back at the last torch. Presentation only past world.reset: the flame catches again with a
// puff of sparks and a soft whump, and a quick iris blink covers the jump in place.
function respawn() {
  state.world.reset(state.player);
  state.camera.snap(state.player, state.world);
  const f = state.player.flamePos();
  P.sparks(f.x, f.y, 12, 110);
  P.ring(f.x, f.y, 60);
  P.smoke(f.x, f.y - 4, 3);
  Audio.sfx('respawn');
  wickMood('surprise', 0.5);
  state.iris = Math.min(state.iris, 0.3);
}

// ---------------------------------------------------------------- update
function update(dt) {
  state.time += dt;
  UI.update(dt);
  if (input.mutePressed) Audio.toggleMute();
  Audio.setPaused(state.scene === 'play' && state.paused);
  if (state.opts) { updateOptions(); return; }

  if (state.scene === 'title') {
    if (state.intro) { state.tap = null; return; }   // presses belong to the intro (skip)
    if (!state.titleMenu) {
      if (input.anyPressed || state.tap) {
        state.tap = null;
        state.titleMenu = true;
        state.titleMenuAt = state.time;
        state.sel = 0;
        Audio.init();
        Audio.music('title');
      }
      return;
    }
    const items = titleItems();
    const c = navMenu(items.length);
    if (c >= 0) items[c].act();
    return;
  }

  if (state.scene === 'select') {
    const n = LEVELS.length, cols = UI.SELECT_COLS;
    const reached = reachedSet();
    const move = (d) => { state.sel = (state.sel + d + n) % n; Audio.sfx('menu'); };
    if (input.leftPressed) move(-1);
    if (input.rightPressed) move(1);
    if (input.upPressed && state.sel - cols >= 0) move(-cols);
    if (input.downPressed && state.sel + cols < n) move(cols);
    let pick = -1;
    if (state.tap) { pick = UI.hitTest(state.tap.x, state.tap.y); state.tap = null; if (pick >= 0) state.sel = pick; }
    if (input.confirmPressed) pick = state.sel;
    if (pick === UI.menuRects.length - 1 && pick >= n) pick = -2;     // the back button
    if (input.backPressed || pick === -2) { state.scene = 'title'; state.titleMenu = true; state.sel = 0; Audio.sfx('menu'); return; }
    if (pick >= 0) {
      if (reached.has(LEVELS[pick].name)) { Audio.sfx('select'); newGame(pick); } else Audio.sfx('dripFail');
    }
    return;
  }

  if (state.scene === 'story') {
    // any press skips straight into Market Row
    if (state.time > state.storyAt + 0.4 && (input.anyPressed || state.tap)) { state.tap = null; Audio.sfx('select'); endStory(); }
    return;
  }

  if (state.scene === 'end') {
    // fireworks over the lit castle (screen space, presentation only)
    if ((state.endFw = (state.endFw ?? 0.6) - dt) <= 0) {
      state.endFw = 0.45 + Math.random() * 0.7;
      P.firework(80 + Math.random() * (W - 160), 50 + Math.random() * 150);
    }
    state.particles.update(dt);
    if (state.time > state.endAt + 1.2 && (input.anyPressed || state.tap)) { state.tap = null; toCredits(); }
    return;
  }
  if (state.scene === 'credits') {
    // hold jump to fast-forward; any other press skips back to the title
    state.creditScroll += dt * (input.jumpHeld ? 160 : 42);
    if (state.time > state.creditsAt + 1 && (input.pausePressed || input.backPressed || input.confirmPressed && !input.jumpPressed || state.tap)) { state.tap = null; toTitle(); }
    if (state.creditsDone) { state.creditsDone = false; toTitle(); }
    return;
  }

  // --- play ---
  const { world, player, camera } = state;
  if (state.paused) {
    if (state.rotateBlock) return;
    Audio.heartbeat(1, false);
    if (input.pausePressed || input.backPressed) { state.paused = false; return; }
    const c = navMenu(6);
    if (c === 0) state.paused = false;
    else if (c === 1) { respawn(); state.paused = false; }
    else if (c === 2) { startLevel(state.levelIndex); }
    else if (c === 3) Audio.toggleMute();
    else if (c === 4) openOptions('pause');
    else if (c === 5) toTitle();
    return;
  }
  const tap = state.tap;
  state.tap = null;
  if (input.pausePressed) { state.paused = true; state.sel = 0; Audio.setFlame(0, false); Audio.heartbeat(1, false); return; }
  if (state.hitStop > 0) { state.hitStop--; return; }

  if (input.restartPressed && !state.completeTimer) respawn();

  if (state.completeTimer > 0) {
    state.completeTimer -= dt;
    // the card waits for the player (replays keep the old fixed timing): it holds just
    // before the fade to dark, so there is time to read the run and the medals
    const hold = !state.replay && !world.data.finale && !state.cardGo;
    if (hold && state.completeTimer < CARD_HOLD) { state.cardHeld += CARD_HOLD - state.completeTimer; state.completeTimer = CARD_HOLD; }
    // once the card is up: retry the level for a medal (R / Y / the card's Retry button),
    // or carry on with any other press
    if (state.completeMax - state.completeTimer > 1) {
      const retry = !world.data.finale && !state.replay &&
        (input.restartPressed || tap && UI.retryRect && UI.hitRect(UI.retryRect, tap.x, tap.y));
      if (retry) { Audio.sfx('select'); startLevel(state.levelIndex); return; }
      const any = !state.replay && (input.anyPressed && !input.mutePressed || tap);
      if (input.jumpPressed || input.confirmPressed || any) {
        if (hold) Audio.sfx('select');
        state.cardGo = true;
        // carrying on fades to dark from the hold point (replays cut straight to the next level)
        state.completeTimer = state.replay ? 0 : Math.min(state.completeTimer, CARD_HOLD);
      }
    }
    // the card stamps its marks in one at a time; each one earned rings as it lands
    const res = state.levelResult;
    if (res && !world.data.finale && !state.replay) {
      const shown = state.completeMax - state.completeTimer + state.cardHeld;
      UI.cardMarks(res).forEach((k, i) => {
        if (res[k] && !(state.cardRang & (1 << i)) && shown >= UI.markAt(i)) {
          state.cardRang |= 1 << i;
          Audio.sfx('medal', { i, fresh: res.fresh && res.fresh[k] });
        }
      });
    }
    world.update(dt, null);
    if (state.completeTimer <= 0) {
      if (state.levelIndex + 1 < LEVELS.length) startLevel(state.levelIndex + 1);
      else {
        finishedGame();
        state.scene = 'end';
        state.endAt = state.time;
        state.endFw = 0.6;
        P.clear();
        Audio.music('end');
        Audio.ambience(null);
        Audio.setFlame(0, false);
      }
      return;
    }
  } else {
    player.update(dt, input, world);
    world.update(dt, player);
    state.stats.time += dt;
    state.levelStats.time += dt;
    if (!player.alive) state.iris = Math.min(state.iris, Math.max(0, player.deathTimer / 0.35));
    if (!player.alive && player.deathTimer <= 0) {
      state.stats.deaths++;
      state.levelStats.deaths++;
      respawn();
      state.iris = 0;
      const h = state.help;
      if (h.pending) { h.tip = { text: h.pending, t: 0, life: 7 }; h.pending = null; }
    }
    // remember being caught in a gust, for the wind tip
    if (!state.replay) {
      for (const z of world.windZones()) {
        const r = z.rect;
        if (z.state === 'gust' && player.cx > r.x && player.cx < r.x + r.w && player.feet > r.y && player.y < r.y + r.h) state.help.lastWind = state.levelStats.time;
      }
    }
  }
  if (state.help.tip && (state.help.tip.t += dt) > state.help.tip.life) state.help.tip = null;

  camera.update(dt, player, world);
  for (const z of world.windZones()) {
    const was = state.gusts.get(z);
    const near = z.rect.x < camera.x + W + 200 && z.rect.x + z.rect.w > camera.x - 200;
    // a swell while the leaves swirl, so the gust can be heard coming, then the gust itself
    if (z.state === 'warn' && was === 'idle' && near && !state.completeTimer) Audio.sfx('windWarn', { vol: inZone(z.rect, player) ? 1 : 0.6 });
    if (z.state === 'gust' && was !== 'gust' && near) Audio.sfx('wind');
    state.gusts.set(z, z.state);
  }
  hazardCues(world, player);
  P.ambient(dt, camera, world, !!themeOf(world).leaves);
  updateThemeFx(dt, P, camera, world, player, themeOf(world), (n) => Audio.sfx(n));
  if (player.alive) {
    const f = player.flamePos();
    const rate = 10 + 18 * player.waxFrac();
    if (Math.random() < rate * dt) P.ember(f.x, f.y - 6, player.waxFrac(), player.vx);
  }
  if (player.alive && Math.random() < 5 * dt) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * player.lightRadius() * 0.6;
    P.mote(player.cx + Math.cos(a) * d, player.y + Math.sin(a) * d * 0.7);
  }
  for (const t of world.torches) {
    if (t.lit && Math.random() < 2 * dt && Math.abs(t.x - player.cx) < W) {
      P.mote(t.x + (Math.random() - 0.5) * 220, t.y - 60 + (Math.random() - 0.5) * 160);
    }
    if (t.lit && Math.random() < 6 * dt && Math.abs(t.x - player.cx) < W) P.ember(t.x, t.y - 66, 0.6);
  }
  // flame trail when moving fast
  const fp = player.flamePos();
  state.trail.push({ x: fp.x, y: fp.y - 6 });
  if (state.trail.length > 10) state.trail.shift();
  if (player.alive && player.waxFrac() < 0.2 && Math.random() < 6 * dt) {
    P.sparks(fp.x, fp.y - 8, 2, 60, '255,120,50');
    if (Math.random() < 0.4) P.smoke(fp.x, fp.y - 10, 1);
  }
  for (const mo of world.moths) if (Math.random() < 3 * dt && Math.abs(mo.x - player.cx) < W) P.mote(mo.x, mo.y);
  for (const f of world.flammables.values()) if (f.state === 'burning' && Math.random() < 20 * dt) P.ash(f.x + 16, f.y + 16);
  for (const b of world.blobs) if (b.drawY < b.y && Math.random() < 0.8) P.waxTrail(b.x + 16, b.drawY + 8);
  if (state.fireworks > 0) {
    state.fireworkTimer -= dt;
    if (state.fireworkTimer <= 0) {
      state.fireworks--;
      state.fireworkTimer = 0.25 + Math.random() * 0.3;
      P.firework(world.goal.x + (Math.random() - 0.5) * 260, world.goal.y - 160 - Math.random() * 140);
      Audio.sfx('ignite');
    }
  }
  if (world.goal.lit && Math.random() < 30 * dt) P.ember(world.goal.x + (Math.random() - 0.5) * 30, world.goal.y - 100, 1);
  P.update(dt);
  state.levelCard = Math.max(0, state.levelCard - dt);
  state.flash = Math.max(0, state.flash - dt * 2.2);
  state.hudFail = Math.max(0, (state.hudFail || 0) - dt * 2.5);
  state.keepsakePop = Math.max(0, (state.keepsakePop || 0) - dt * 1.5);
  Input.touch.setEnabled('drip', player.canAffordDrip());
  if (player.alive) state.iris = Math.min(1, state.iris + dt * 3);
  Audio.setFlame(player.waxFrac(), player.alive);
  Audio.setTempo(player.waxFrac());
  Audio.heartbeat(player.waxFrac(), player.alive && !state.completeTimer);
}

// ---------------------------------------------------------------- render
// The page behind the canvas (the pillarbox bars on wide phones) takes the current sky,
// dimmed toward the night so the bars frame the view without pulling the eye.
let pageSky = null;
function setPageSky(name) {
  if (name === pageSky) return;
  pageSky = name;
  const sky = (THEMES[name] || THEMES.dusk).sky;
  const dim = (hex, k) => {
    const n = parseInt(hex.slice(1), 16), m = [12, 6, 24];
    return `rgb(${[16, 8, 0].map((sh, i) => Math.round(((n >> sh) & 255) * (1 - k) + m[i] * k)).join(',')})`;
  };
  const st = document.body.style;
  st.setProperty('--sky-a', dim(sky[0], 0.35));
  st.setProperty('--sky-b', dim(sky[1], 0.55));
  st.setProperty('--sky-c', dim(sky[0], 0.75));
}

function render() {
  setPageSky(state.scene === 'play' && state.world ? themeOf(state.world).name
    : state.scene === 'end' || state.scene === 'credits' ? 'castle' : 'dusk');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const t = state.time;
  if (state.scene === 'title') {
    UI.drawTitle(ctx, t, Input.lastDevice, {
      menu: state.titleMenu && !state.opts ? titleItems().map((it) => it.label) : null, selected: state.sel, standalone: state.standalone,
      menuT: t - (state.titleMenuAt ?? -1),
      overlay: !!state.opts,
    });
    if (state.opts) drawOptions();
  } else if (state.scene === 'select') {
    UI.drawSelect(ctx, t, LEVELS, reachedSet(), state.sel, Input.lastDevice, selectMarks());
  } else if (state.scene === 'story') {
    UI.drawStory(ctx, t - state.storyAt, Input.lastDevice);
  } else if (state.scene === 'end') {
    const m = selectMarks();
    UI.drawEnd(ctx, t, state.stats, Input.lastDevice, {
      keepsakes: m.kGot, keepsakeTotal: m.kAll, since: t - state.endAt, fx: (c) => P.draw(c, 'glow'),
    });
  } else if (state.scene === 'credits') {
    if (!UI.drawCredits(ctx, t, state.creditScroll, Input.lastDevice)) state.creditsDone = true;
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
  drawDecor(ctx, cam, world, t);
  drawThemeWorld(ctx, cam, world, t, themeOf(world));
  drawProps(ctx, cam, world, t);
  drawSignPosts(ctx, cam, world);
  drawEntities(ctx, cam, world, t);
  drawMovers(ctx, cam, world, t);
  drawDoors(ctx, cam, world, t);
  drawPlates(ctx, cam, world, t);
  drawJumpShadow(ctx, world, player);
  P.draw(ctx, 'world');
  if (!state.completeTimer) {
    drawDripGuide(ctx, player, world, t, { absorbGlyph: UI.glyphs(Input.lastDevice).absorb });
  }
  drawWick(ctx, player, t, { world });
  drawMoths(ctx, cam, world, t);
  drawMist(ctx, cam, world, t);
  ctx.restore();

  Lighting.render(ctx, world, player, camera, lights, t);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawWickFx(ctx, player, t);
  drawTileGlows(ctx);
  drawLightDetail(ctx, cam, world, lights, t);
  drawDecorGlows(ctx, t);
  ctx.globalCompositeOperation = 'lighter';
  drawFlameTrail(ctx, player);
  drawMothGlows(ctx, cam, world, t);
  drawPlateGlows(ctx, cam, world, t);
  P.draw(ctx, 'glow');
  ctx.globalCompositeOperation = 'source-over';
  drawWindStreaks(ctx, cam, world, t);
  P.draw(ctx, 'fg');
  ctx.restore();
  drawThemeOverlay(ctx, world, t, themeOf(world));
  drawForeground(ctx, cam, world, t);
  Post.shafts(ctx, cam, themeOf(world).name, t);

  if (state.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const big = world.data.finale && world.goal.lit;
    const soft = Settings.get().reduceFlash ? 0.25 : 1;
    ctx.fillStyle = `rgba(255,150,70,${Math.min(0.5, state.flash * (big ? 0.35 : 0.18)) * soft})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (world.data.finale && world.goal.lit) {
    // the castle torch floods the whole screen with warmth
    const k = Math.min(1, world.goal.litTime / 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = Settings.get().reduceFlash ? 0.8 : 0.8 + 0.2 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(255,140,60,${0.25 * k * pulse})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  Lighting.coldVignette(ctx, player.waxFrac(), t);
  drawWickRim(ctx, player, t);
  Post.finish(ctx, themeOf(world).name, t);
  // sign bubbles are UI: drawn clean, after the grade and grain
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawSignText(ctx, cam, world, player, UI.glyphs(Input.lastDevice));
  ctx.restore();
  UI.drawHUD(ctx, player, t, {
    muted: Audio.muted, touch: Input.lastDevice === 'touch', fail: state.hudFail,
    keepsake: world.keepsake ? !!world.keepsake.got : null, keepsakePop: state.keepsakePop,
    timer: Settings.get().timer ? state.levelStats.time : null,
    runTimer: Settings.get().timer && state.stats.time > state.levelStats.time + 0.5 ? state.stats.time : null,
    timerGentle: state.levelStats.gentle,
  });
  if (state.help && state.help.tip && !state.completeTimer) UI.drawTip(ctx, state.help.tip, UI.glyphs(Input.lastDevice));
  if (state.levelCard > 0) UI.drawLevelCard(ctx, world, state.levelIndex, CFG.LEVEL_CARD_TIME - state.levelCard);
  if (state.completeTimer > 0) {
    const k = Math.max(0, 1 - state.completeTimer / 0.6);
    if (k > 0) { ctx.fillStyle = `rgba(14,6,28,${k})`; ctx.fillRect(0, 0, W, H); }
    const shown = state.completeMax - state.completeTimer + (state.cardHeld || 0);
    if (!world.data.finale) UI.drawCompleteCard(ctx, world, state.levelIndex, state.levelStats, shown, state.completeTimer, state.levelResult, Input.lastDevice, world.goal.x - cam.x);
  }
  if (state.iris < 1) Post.iris(ctx, state.iris, player.cx - cam.x, player.y + player.h / 2 - cam.y);
  if (state.paused && !state.rotateBlock) {
    const g = UI.glyphs(Input.lastDevice);
    if (state.opts) drawOptions();
    else {
      UI.drawMenu(ctx, 'Paused', pauseItems(), state.sel, {
        top: H * 0.24, footer: Input.lastDevice === 'touch' ? '' : `${g.restart} restart from torch  ·  M mute`,
      });
    }
  }
  if (DEBUG) {
    ctx.font = '12px monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`frame ${state.frameMs.toFixed(2)}ms  wax ${player.wax.toFixed(1)}  x ${(player.cx / 32).toFixed(1)} y ${(player.feet / 32).toFixed(1)}  dev ${Input.lastDevice}  q${state.quality}`, 90, 8);
  }
}

function inZone(r, p) { return p.cx > r.x && p.cx < r.x + r.w && p.feet > r.y && p.y < r.y + r.h; }

// Sound cues for hazards Wick is close to (presentation only, reads the sim): a patter as a
// nearby drip curtain opens, and wingbeats when a moth passes close by.
const mothHeard = new WeakMap();
function hazardCues(world, player) {
  if (!player.alive || state.completeTimer || state.replay) return;
  const T = CFG.TILE, fx = player.cx, fy = player.y + player.h / 2;
  let rain = 0;
  for (const e of world.emitters) {
    const was = state.rainOn.get(e);
    state.rainOn.set(e, e.on);
    if (!e.on || was !== false) continue;
    const dx = Math.abs(e.x + T / 2 - fx);
    if (dx < 7 * T && fy > e.y - 2 * T && fy < e.bottom + 2 * T) rain = Math.max(rain, 1 - dx / (7 * T));
  }
  if (rain > 0) Audio.sfx('rainStart', { vol: 0.4 + 0.6 * rain });
  for (const m of world.moths) {
    const d = Math.hypot(m.x - fx, m.y - fy);
    if (d > 3 * T || state.time - (mothHeard.get(m) ?? -9) < 0.6) continue;
    mothHeard.set(m, state.time);
    Audio.sfx('mothNear', { vol: 1 - d / (3 * T) });
  }
}

// tapered additive ribbon behind the flame, stronger the faster Wick moves
function drawFlameTrail(ctx, player) {
  const tr = state.trail;
  const speed = Math.hypot(player.vx + player.windVx, player.vy);
  if (!player.alive || tr.length < 3 || speed < 90) return;
  const k = Math.min(1, (speed - 90) / 300);
  for (let i = 1; i < tr.length; i++) {
    const a = i / tr.length;
    ctx.strokeStyle = `rgba(255,${150 + a * 80 | 0},70,${a * 0.45 * k})`;
    ctx.lineWidth = (2 + 9 * a) * (0.5 + 0.5 * player.waxFrac());
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
  }
}

// ---------------------------------------------------------------- playtest replay (debug)
// Feeds recorded bot inputs (pairs of moveX*100, flag bits) into the real game,
// `speed` fixed steps per frame. Used by tools/playthrough.mjs.
function playReplay() {
  const r = state.replay;
  for (let k = 0; k < r.speed; k++) {
    const i = r.i;
    const has = i * 2 + 1 < r.frames.length;
    const mx = has ? r.frames[i * 2] / 100 : 0, fl = has ? r.frames[i * 2 + 1] : 0;
    input.moveX = mx; input.left = mx < -0.3; input.right = mx > 0.3;
    input.jumpHeld = !!(fl & 1); input.jumpPressed = !!(fl & 2);
    input.dripPressed = !!(fl & 4); input.reabsorbPressed = !!(fl & 8);
    input.pausePressed = input.restartPressed = input.mutePressed = false;
    state.hitStop = 0;
    const lvl = state.levelIndex;
    update(CFG.STEP);
    r.i++;
    if (state.scene !== 'play' || state.levelIndex !== lvl) { r.finished = true; state.replay = null; endReplaySettings(); return; }
  }
}

// replays always run on default settings (gentle off, default keys), whatever is saved
function endReplaySettings() {
  Settings.force(false);
  state.player.assist = Settings.assist();
  if (state.levelStats) state.levelStats.gentle = Settings.get().gentle;
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += dt;
  if (state.replay) {
    playReplay();
    acc = 0;
  } else {
    Input.poll();
    let steps = 0;
    while (acc >= CFG.STEP) {
      update(CFG.STEP);
      acc -= CFG.STEP;
      steps++;
      if (steps === 1) Input.consume();
      if (steps >= 5) { acc = 0; break; }
    }
  }
  // the touch buttons hide under the level-complete card (its Retry button needs the taps),
  // and show, untouchable, as a live preview on the touch controls options page
  const preview = !!(state.opts && state.opts.page === 'touch');
  const showTouch = preview || Input.lastDevice === 'touch' && state.scene === 'play' && !state.paused && !state.rotateBlock && !state.completeTimer;
  const ts = Settings.get();
  Input.touch.setLayout(ts.touchSize, ts.touchOpacity, ts.touchSwap);
  Input.touch.setPreview(preview);
  Input.touch.show(showTouch);
  const t0 = performance.now();
  render();
  const ms = performance.now() - t0;
  state.frameMs = state.frameMs * 0.95 + ms * 0.05;
  // protect the framerate on phones: smaller light layer, skip the desaturation pass
  if (state.scene === 'play' && state.frameMs > 11 && Lighting.scale > 0.34) {
    if (++state.slowFrames > 90) { Lighting.setScale(0.33); Lighting.desaturate = false; state.slowFrames = 0; state.quality = 1; }
  } else state.slowFrames = 0;
  // still slow (or GPU-bound, which draw time misses), on a high-DPR screen: once, drop to a 1x canvas and skip film grain
  // and light shafts. Judged on 2 s of live play, by draw time or by the gap between frames.
  const pf = state.perf;
  if (state.quality > 0 && state.scene === 'play' && !state.paused && !state.replay && (window.devicePixelRatio || 1) > 1) {
    if (dt < 0.2) {   // ignore hitches and returning from the background
      pf.ms += ms; pf.gap += dt * 1000; pf.n++;
      if (pf.gap >= 2000) {
        if (pf.ms / pf.n > 14 || pf.gap / pf.n > 24) {
          state.quality = 0;
          Lighting.setScale(0.33); Lighting.desaturate = false;
          dprCap = 1;
          Post.quality = 0;
          resize();
        }
        pf.ms = pf.gap = pf.n = 0;
      }
    }
  } else pf.ms = pf.gap = pf.n = 0;
  requestAnimationFrame(frame);
}

// debug helpers: ?level=N jumps straight into a level
if (params.has('level')) {
  const n = Math.max(1, Math.min(LEVELS.length, parseInt(params.get('level'), 10) || 1));
  newGame(n - 1);
} else {
  Audio.music('title');
  // Hallucinated Games studio intro before the title (skipped for test URLs)
  const skipIntro = params.has('nointro') || DEBUG || !window.HallucinatedIntro;
  if (!skipIntro) {
    state.intro = true;
    window.HallucinatedIntro.play({ sound: false })
      .catch(() => {})
      .then(() => { state.intro = false; });
  }
}
window.WICK = {
  state, LEVELS, startLevel, Lighting, Audio, Settings, UI, records: loadRecords,
  // restart `level` and drive it with recorded inputs from the very first frame
  replay(level, frames, speed = 1) {
    if (state.opts) closeOptions();
    Settings.force(true);
    newGame(level);
    state.replay = { frames: Int8Array.from(frames), i: 0, speed, finished: false };
    return true;
  },
};
document.getElementById('boot').classList.add('hide');
requestAnimationFrame(frame);
