// Procedural world art: sky, parallax town, tiles, props, entities, signs.
// "Painted by torchlight": bold dark outlines, flat painterly shading.
import { CFG, clamp, lerp } from '../config.js';
import { STONE, ONEWAY, BLOB, COBWEB, GATE, EMITTER, DOOR } from '../physics.js';
import { drawFlame } from './draw-wick.js';
import { drawThemeSky, drawThemeBackdrop, drawWallMotif } from './theme-fx.js';
import { skyline } from './lighting.js';
import { Post } from './post.js';
import LEVEL_LIST from '../levels/index.js';

const T = CFG.TILE;
const OUT = '#1c0d2a';

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

// ------------------------------------------------------------ themes
// Each level picks a theme: sky, stone palette, back walls, weather.
export const THEMES = {
  canal: {
    leaves: true, trees: true,
    sky: ['#14183e', '#2c3a6a', '#5a6a90', '#d08a70'], glow: '255,190,140', haze: '#3a4a74',
    stone: 'wet', fg: 'grass', clouds: '#3e4c78', water: true, mist: 'rgba(160,200,230,',
  },
  tower: {
    sky: ['#0c0a26', '#22205a', '#4a3a7a', '#8a5070'], moon: true, stars: true, haze: '#2a2a5a',
    stone: 'castle', backwall: 'brick', clouds: '#2a2a5a',
  },
  fair: {
    leaves: true,
    sky: ['#2a0e30', '#6a1c40', '#c84a3a', '#f8a050'], glow: '255,170,90', haze: '#a8403a',
    stone: 'warm', bunting: true, fg: 'pumpkins', clouds: '#c05048',
  },
  dusk: {
    leaves: true,
    trees: true,
    sky: ['#2a1652', '#6e2c6c', '#d8606a', '#f39a5a'], glow: '255,200,140', haze: '#b4506e',
    stone: 'plum', bunting: true, fg: 'fence', clouds: '#c25a78',
  },
  harvest: {
    leaves: true,
    trees: true,
    sky: ['#28123e', '#7a2a52', '#e0683a', '#f8b45a'], glow: '255,190,110', haze: '#c8603e',
    stone: 'warm', bunting: true, fg: 'pumpkins', clouds: '#d87a48',
  },
  violet: {
    leaves: true,
    trees: true,
    sky: ['#1c1040', '#4a2470', '#a0487a', '#d8786a'], glow: '240,170,150', haze: '#7a3a72',
    stone: 'plum', stars: true, fg: 'fence', clouds: '#8a447a',
  },
  wind: {
    leaves: true,
    trees: true,
    sky: ['#24164e', '#6a3270', '#d8707a', '#f6a878'], glow: '255,190,150', haze: '#b85a7a',
    stone: 'plum', fg: 'grass', clouds: '#d88088', streaks: true, mist: 'rgba(240,190,210,',
  },
  rain: {
    sky: ['#0e1430', '#1e2a52', '#3c4270', '#5a5280'], moon: true, haze: '#2e3660',
    stone: 'wet', backwall: 'brick', rain: true, clouds: '#2e3862',
  },
  barn: {
    sky: ['#1a0e2c', '#3a1a44', '#7a3446', '#a4523e'], glow: '230,140,90', haze: '#5a2a40',
    stone: 'warm', backwall: 'barn', stars: true,
  },
  cold: {
    trees: true,
    sky: ['#081028', '#142246', '#2a3a68', '#4e5280'], moon: true, haze: '#26345c',
    stone: 'slate', backwall: 'slate', snow: true, stars: true, fg: 'grass', clouds: '#26325a',
    mist: 'rgba(170,190,240,',
  },
  works: {
    sky: ['#140a0e', '#3a1a16', '#7a3a1e', '#c8702a'], glow: '255,170,80', haze: '#5a2a18',
    stone: 'warm', backwall: 'brick', clouds: '#5a2a1a',
  },
  castle: {
    sky: ['#140826', '#3e1446', '#9a2c46', '#e0623a'], glow: '255,150,90', haze: '#6a2440',
    stone: 'castle', backwall: 'castle', stars: true, clouds: '#7a2a4a',
  },
};

for (const [k, v] of Object.entries(THEMES)) v.name = k;

export function themeOf(world) {
  const d = world.data || {};
  return THEMES[d.theme] || (d.finale ? THEMES.castle : THEMES.dusk);
}

const DECO = {
  canal: ['tuft', 'rocks', 'flowers', 'mushrooms'],
  tower: ['rubble', 'rubble', 'tuft', 'mushrooms'],
  fair: ['leaves', 'straw', 'flowers', 'leaves'],
  dusk: ['flowers', 'tuft', 'rocks', 'leaves'],
  harvest: ['leaves', 'tuft', 'flowers', 'leaves', 'rocks'],
  violet: ['flowers', 'tuft', 'mushrooms', 'rocks'],
  wind: ['tuft', 'tuft', 'flowers', 'rocks'],
  rain: ['puddle', 'mushrooms', 'rocks', 'puddle'],
  barn: ['straw', 'straw', 'mushrooms', 'rocks'],
  cold: ['snow', 'snow', 'icerock', 'rocks'],
  castle: ['rubble', 'tuft', 'rubble', 'mushrooms'],
  works: ['rubble', 'straw', 'rocks', 'rubble'],
};

const STONES = {
  plum: { mortar: '#3c2140', cols: ['#83566a', '#76495f', '#8f6176', '#6d4459'], top: 'leaves' },
  warm: { mortar: '#3e2232', cols: ['#8a5a5a', '#7c4e52', '#96645e', '#70484c'], top: 'leaves' },
  wet: { mortar: '#221e3a', cols: ['#5e4e70', '#524466', '#6a5a7e', '#483c5c'], top: 'moss' },
  slate: { mortar: '#1c2140', cols: ['#5a6484', '#4e5878', '#66708f', '#46506c'], top: 'snow' },
  castle: { mortar: '#2c1a2e', cols: ['#7c6272', '#6e5464', '#886c7c', '#604858'], top: 'moss' },
};

// ------------------------------------------------------------ tile sprites (2x)
const spriteCache = new Map();
function spritesFor(theme) {
  const key = theme.name + '|' + theme.stone + '|' + (theme.backwall || '');
  if (!spriteCache.has(key)) spriteCache.set(key, buildSprites(STONES[theme.stone] || STONES.plum, theme.backwall, theme.name));
  return spriteCache.get(key);
}

function buildSprites(pal, wallKind, themeName) {
  const S = 2, P = T * S;
  const make = (fn, w = T, h = T) => { const c = canvas(w * S, h * S); const g = c.getContext('2d'); g.scale(S, S); fn(g); return c; };
  const cobbles = (g, r) => {
    g.fillStyle = pal.mortar; g.fillRect(0, 0, T, T);
    const rows = 3;
    for (let row = 0; row < rows; row++) {
      let x = row % 2 ? -8 : -2;
      const y = row * (T / rows) + 1;
      while (x < T) {
        const w = 9 + r() * 9;
        g.fillStyle = pal.cols[(r() * pal.cols.length) | 0];
        roundRect(g, x + 1, y + 0.5, w - 2, T / rows - 2, 3);
        g.fill();
        // painterly light from above, shade below
        g.fillStyle = 'rgba(255,225,205,0.16)';
        g.fillRect(x + 3, y + 1.5, w - 7, 1.6);
        g.fillStyle = 'rgba(20,6,30,0.22)';
        g.fillRect(x + 2, y + T / rows - 3.5, w - 4, 1.4);
        if (r() < 0.12) { g.fillStyle = 'rgba(20,6,30,0.35)'; g.fillRect(x + 3 + r() * (w - 8), y + 3, 3, 1); }
        x += w;
      }
    }
  };
  const topper = (g, r) => {
    if (pal.top === 'snow') {
      g.fillStyle = '#e6ecf8';
      g.beginPath(); g.moveTo(0, 7);
      for (let x = 0; x <= T; x += 4) g.lineTo(x, 5 + r() * 3.5);
      g.lineTo(T, 0); g.lineTo(0, 0); g.fill();
      g.fillStyle = '#a8b6d8'; g.fillRect(0, 6, T, 1.5);
      g.fillStyle = '#ffffff'; g.fillRect(2 + r() * 10, 1, 6, 1.2);
      return;
    }
    if (pal.top === 'moss') {
      g.fillStyle = '#2f6a5e'; g.fillRect(0, 0, T, 5);
      g.fillStyle = '#3f8a76';
      for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(r() * T, 2 + r() * 2, 3 + r() * 2, 1.8, 0, 0, 6.283); g.fill(); }
      g.fillStyle = '#245448'; g.fillRect(0, 4.5, T, 1.5);
      for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(180,230,250,0.35)'; g.fillRect(r() * T, 1, 4, 1); }
      return;
    }
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
  };
  const stone = [], top = [];
  for (let v = 0; v < 4; v++) {
    stone.push(make((g) => cobbles(g, rng(11 + v * 7))));
    top.push(make((g) => { const r = rng(91 + v * 13); cobbles(g, r); topper(g, r); }));
  }
  const plank = make((g) => {
    g.fillStyle = '#a8643a'; g.fillRect(0, 0, T, 9);
    g.fillStyle = '#c47e48'; g.fillRect(0, 0, T, 2.5);
    g.fillStyle = '#6c3a24'; g.fillRect(15, 0, 1.5, 9); g.fillRect(0, 8, T, 1.5);
    g.fillStyle = '#3a2430'; g.fillRect(4, 3.5, 1.6, 1.6); g.fillRect(26, 3.5, 1.6, 1.6);
    g.strokeStyle = '#6c3a24'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(6, 9); g.lineTo(12, 17); g.moveTo(26, 9); g.lineTo(20, 17); g.stroke();
    if (pal.top === 'snow') { g.fillStyle = '#e6ecf8'; g.fillRect(0, -1, T, 2.5); }
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

  // soft shadow under overhangs and beside walls
  const shade = (dir) => make((g) => {
    const gr = dir === 'down' ? g.createLinearGradient(0, 0, 0, 22)
      : dir === 'left' ? g.createLinearGradient(0, 0, 14, 0) : g.createLinearGradient(T, 0, T - 14, 0);
    gr.addColorStop(0, 'rgba(12,4,24,0.55)'); gr.addColorStop(1, 'rgba(12,4,24,0)');
    g.fillStyle = gr; g.fillRect(0, 0, T, T);
  });

  // things hanging from overhang undersides: moss, roots, icicles
  const hang = [];
  for (let v = 0; v < 3; v++) {
    hang.push(make((g) => {
      const r = rng(300 + v * 17);
      if (pal.top === 'snow') {
        for (let i = 0; i < 4; i++) {
          const x = 3 + r() * 26, len = 5 + r() * 12;
          g.fillStyle = 'rgba(210,228,255,0.9)';
          g.beginPath(); g.moveTo(x - 2, 0); g.lineTo(x + 2, 0); g.lineTo(x, len); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x - 0.6, 1, 1, len * 0.5);
        }
        return;
      }
      for (let i = 0; i < 4; i++) {
        const x = 2 + r() * 28, len = 6 + r() * 16;
        g.strokeStyle = r() < 0.5 ? '#2f6a5a' : '#5a6a2a'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (r() - 0.5) * 6, len * 0.6, x + (r() - 0.5) * 3, len); g.stroke();
        g.fillStyle = r() < 0.5 ? '#3f8a76' : '#c9a03a';
        g.beginPath(); g.ellipse(x + 1, len * 0.55, 2, 1.2, 0.6, 0, 6.283); g.fill();
        // a pointed leaf at the tip, hung off-axis (a round bead read as a music note)
        const lx = x + (r() - 0.5) * 3, s = r() < 0.5 ? -1 : 1;
        g.beginPath(); g.moveTo(lx, len - 1);
        g.quadraticCurveTo(lx + s * 3.2, len, lx + s * 2.4, len + 3.4);
        g.quadraticCurveTo(lx + s * 0.4, len + 2.2, lx, len - 1); g.fill();
      }
    }));
  }

  // back walls for interiors, plus a few details
  let walls = null, details = null;
  if (wallKind) {
    const W = {
      brick: { mortar: '#1a1028', cols: ['#2e1e3e', '#33223f', '#291a38'], bw: 16, bh: 8 },
      barn: { mortar: '#1c0e18', cols: ['#3a2026', '#43262a', '#34191f'], bw: 8, bh: 32 },
      slate: { mortar: '#121630', cols: ['#232a48', '#283050', '#1f2542'], bw: 16, bh: 8 },
      castle: { mortar: '#1a0e20', cols: ['#30202f', '#382637', '#2a1a2a'], bw: 32, bh: 16 },
    }[wallKind];
    walls = [];
    for (let v = 0; v < 3; v++) {
      walls.push(make((g) => {
        const r = rng(500 + v * 31);
        g.fillStyle = W.mortar; g.fillRect(0, 0, T, T);
        for (let y = 0, row = 0; y < T; y += W.bh, row++) {
          const off = row % 2 && W.bw < T ? -W.bw / 2 : 0;
          for (let x = off; x < T; x += W.bw) {
            g.fillStyle = W.cols[(r() * W.cols.length) | 0];
            g.fillRect(x + 0.8, y + 0.8, W.bw - 1.6, W.bh - 1.6);
            g.fillStyle = 'rgba(255,220,220,0.04)'; g.fillRect(x + 1, y + 1, W.bw - 2, 1);
          }
        }
      }));
    }
    // window glass per theme: warm lamplight, rain-streaked moonlit panes (rain),
    // a pale clock-face oculus (tower); each has a dark, unlit twin
    const pane = (g, glass, hi, frame) => {
      g.fillStyle = '#140a1c'; roundRectTop(g, 7, 6, 18, 22, 9); g.fill();
      g.fillStyle = glass; roundRectTop(g, 9, 8, 14, 18, 7); g.fill();
      if (hi) { g.fillStyle = hi; g.fillRect(11, 12, 4, 6); }
      g.fillStyle = frame; g.fillRect(15.2, 8, 1.6, 18); g.fillRect(9, 16, 14, 1.6);
      g.fillStyle = '#3a2a30'; g.fillRect(6, 27, 20, 3);
    };
    const rainPane = (g, lit) => {
      g.fillStyle = '#140a1c'; roundRectTop(g, 8, 2, 16, 27, 8); g.fill();
      const gr = g.createLinearGradient(0, 4, 0, 28);
      gr.addColorStop(0, lit ? '#d4e2ff' : '#2a3456'); gr.addColorStop(1, lit ? '#6e8cd0' : '#161c36');
      g.fillStyle = gr; roundRectTop(g, 10, 4, 12, 23, 6); g.fill();
      // rain running down the glass
      g.strokeStyle = lit ? 'rgba(40,60,120,0.55)' : 'rgba(120,150,210,0.25)'; g.lineWidth = 0.8;
      g.beginPath();
      for (const [x, y0, y1] of [[11.5, 9, 18], [13.5, 6, 24], [18, 11, 26], [20.5, 7, 15]]) {
        g.moveTo(x, y0); g.quadraticCurveTo(x + 0.8, (y0 + y1) / 2, x - 0.3, y1);
      }
      g.stroke();
      g.fillStyle = '#20182c'; g.fillRect(15.3, 4, 1.4, 23); g.fillRect(10, 14, 12, 1.4);
      g.fillStyle = '#2c2a3e'; g.fillRect(7, 28, 18, 3);
    };
    const oculus = (g, lit) => {
      g.fillStyle = '#140a1c'; g.beginPath(); g.arc(16, 15, 11, 0, 6.283); g.fill();
      g.fillStyle = lit ? '#c8b8f4' : '#221c40'; g.beginPath(); g.arc(16, 15, 9, 0, 6.283); g.fill();
      g.strokeStyle = '#1c1430'; g.lineWidth = 1.3;
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 6; g.moveTo(16 + Math.cos(a) * 9, 15 + Math.sin(a) * 9); g.lineTo(16 - Math.cos(a) * 9, 15 - Math.sin(a) * 9); }
      g.stroke();
      g.beginPath(); g.arc(16, 15, 4, 0, 6.283); g.stroke();
      g.fillStyle = lit ? '#f4ecff' : '#3a3260'; g.beginPath(); g.arc(16, 15, 2, 0, 6.283); g.fill();
      g.fillStyle = '#2c2440'; g.fillRect(9, 27, 14, 3);
    };
    const styled = (lit) => themeName === 'rain' ? (g) => rainPane(g, lit) : themeName === 'tower' ? (g) => oculus(g, lit)
      : (g) => pane(g, lit ? '#ffb24a' : '#2a1e34', lit ? '#ffd890' : 'rgba(120,100,150,0.35)', '#3a2030');
    details = {
      window: make(styled(true)),
      windowDark: make(styled(false)),
      // back-wall clutter: low-contrast and vertical, so it never reads as a ledge
      beam: make((g) => {
        g.lineCap = 'round';
        if (wallKind === 'barn') {           // a rake hung on a peg
          g.strokeStyle = 'rgba(16,6,14,0.7)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(16, 3); g.lineTo(16, 29); g.stroke();
          g.lineWidth = 1.4; g.beginPath(); g.moveTo(10, 27); g.lineTo(22, 27);
          for (let x = 10; x <= 22; x += 3) { g.moveTo(x, 27); g.lineTo(x, 31); }
          g.stroke();
          g.fillStyle = 'rgba(16,6,14,0.8)'; g.fillRect(14, 2, 4, 3);
        } else {                              // a coil of rope on an iron hook
          g.strokeStyle = 'rgba(14,6,20,0.55)'; g.lineWidth = 1.6;
          g.beginPath(); g.moveTo(16, 4); g.lineTo(16, 9); g.arc(14, 9, 2, 0, Math.PI); g.stroke();
          g.strokeStyle = 'rgba(70,52,58,0.75)'; g.lineWidth = 2;
          for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(16, 17 + k * 0.8, 5.5 - k * 0.6, 7 - k * 0.4, 0.1 * k, 0, 6.283); g.stroke(); }
          g.beginPath(); g.moveTo(14, 23); g.quadraticCurveTo(12, 27, 14, 30); g.stroke();
        }
      }),
      stained: make((g) => {
        g.fillStyle = '#140a1c'; roundRectTop(g, 7, 4, 18, 25, 9); g.fill();
        const panes = ['#c8303a', '#3a6ad8', '#e8b030', '#2aa890', '#a040c0', '#e86a30'];
        for (let i = 0; i < 6; i++) {
          g.fillStyle = panes[i];
          g.fillRect(9 + (i % 2) * 7, 8 + Math.floor(i / 2) * 6.5, 6.5, 6);
        }
        g.fillStyle = '#e8b030'; g.beginPath(); g.arc(16, 9, 4, Math.PI, 0); g.fill();
        g.strokeStyle = '#140a1c'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(16, 6); g.lineTo(16, 28); g.moveTo(9, 14.5); g.lineTo(23, 14.5); g.moveTo(9, 21); g.lineTo(23, 21); g.stroke();
        g.fillStyle = '#5a3424'; g.fillRect(6, 28, 20, 3);
      }),
      stainedDark: make((g) => {
        g.fillStyle = '#140a1c'; roundRectTop(g, 7, 4, 18, 25, 9); g.fill();
        const panes = ['#4a1a26', '#1c2a50', '#4a3a1c', '#163a36', '#36184a', '#4a2618'];
        for (let i = 0; i < 6; i++) { g.fillStyle = panes[i]; g.fillRect(9 + (i % 2) * 7, 8 + Math.floor(i / 2) * 6.5, 6.5, 6); }
        g.strokeStyle = '#140a1c'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(16, 6); g.lineTo(16, 28); g.moveTo(9, 14.5); g.lineTo(23, 14.5); g.moveTo(9, 21); g.lineTo(23, 21); g.stroke();
        g.fillStyle = '#5a3424'; g.fillRect(6, 28, 20, 3);
      }),
      banner: make((g) => {
        g.fillStyle = '#4a2c2a'; g.fillRect(4, 2, 24, 3);
        g.fillStyle = '#8a2430';
        g.beginPath(); g.moveTo(7, 5); g.lineTo(25, 5); g.lineTo(25, 28); g.lineTo(16, 23); g.lineTo(7, 28); g.closePath(); g.fill();
        g.fillStyle = '#d9a640'; g.fillRect(7, 5, 18, 2);
        g.beginPath(); g.arc(16, 14, 3.5, 0, 6.283); g.fill();
      }),
    };
  }
  // interior rock: bigger, darker, cracked stones; some with roots or a glinting crystal
  const rock = [];
  const darker = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`;
  };
  for (let v = 0; v < 6; v++) {
    rock.push(make((g) => {
      const r = rng(700 + v * 41);
      g.fillStyle = darker(pal.mortar.length === 7 ? pal.mortar : '#3c2140', 0.8); g.fillRect(0, 0, T, T);
      // two or three big slabs
      const slabs = [[0, 0, 18 + r() * 8, 15 + r() * 6], [0, 0, 0, 0]];
      slabs[1] = [slabs[0][2] + 1, 0, T, T];
      const shapes = [[1, 1, slabs[0][2] - 1, slabs[0][3] - 1], [slabs[0][2] + 1, 1, T - 1, T * 0.6], [1, slabs[0][3] + 1, T * 0.55, T - 1], [T * 0.55 + 1, T * 0.6 + 1, T - 1, T - 1]];
      for (const [x0, y0, x1, y1] of shapes) {
        g.fillStyle = darker(pal.cols[(r() * pal.cols.length) | 0], 0.72);
        g.beginPath();
        g.moveTo(x0 + 2, y0); g.lineTo(x1 - 1, y0 + r() * 2); g.lineTo(x1, y1 - 2); g.lineTo(x0 + r() * 2, y1); g.lineTo(x0, y0 + 2);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,220,210,0.07)'; g.fillRect(x0 + 2, y0 + 1, (x1 - x0) * 0.6, 1.2);
      }
      g.strokeStyle = 'rgba(10,4,20,0.45)'; g.lineWidth = 0.9;
      g.beginPath(); const cx = 6 + r() * 20; g.moveTo(cx, 4 + r() * 6); g.lineTo(cx + 3, 12 + r() * 6); g.lineTo(cx - 1, 20 + r() * 8); g.stroke();
      if (v === 4) {          // roots
        g.strokeStyle = '#4a2c22'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(0, 6); g.bezierCurveTo(10, 10, 14, 4, 22, 14); g.lineTo(T, 18); g.stroke();
        g.lineWidth = 1; g.beginPath(); g.moveTo(14, 8); g.lineTo(12, 18); g.stroke();
      }
      if (v === 5) {          // a little crystal glint
        g.fillStyle = pal.top === 'snow' ? '#a8d0ff' : '#e8b860';
        g.beginPath(); g.moveTo(16, 10); g.lineTo(20, 16); g.lineTo(16, 22); g.lineTo(12, 16); g.closePath(); g.fill();
        g.fillStyle = '#fff6dc'; g.fillRect(15, 13, 2, 3);
      }
    }));
  }
  return { stone, top, rock, plank, emitter, gate, shadeDown: shade('down'), shadeL: shade('left'), shadeR: shade('right'), hang, walls, details };
}

// ------------------------------------------------------------ per-world static analysis (cached)
const worldCache = new WeakMap();
function analyse(world, theme) {
  let c = worldCache.get(world);
  if (c) return c;
  const { w, h } = world;
  const solid = (tx, ty) => tx < 0 || ty < 0 || tx >= w || ty >= h || stoneLike(world.grid[ty * w + tx]);
  // depth: distance (in cells) from a stone cell to open space, for volume shading
  const depth = new Uint8Array(w * h);
  const q = [];
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const i = ty * w + tx;
    if (!solid(tx, ty)) continue;
    if (!solid(tx + 1, ty) || !solid(tx - 1, ty) || !solid(tx, ty + 1) || (ty > 0 && !solid(tx, ty - 1))) { depth[i] = 1; q.push(i); }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], tx = i % w, ty = (i / w) | 0;
    for (const [nx, ny] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (solid(nx, ny) && !depth[n]) { depth[n] = Math.min(6, depth[i] + 1); q.push(n); }
    }
  }
  // interior: open cells with a roof above them (and beside them), get a back wall
  const interior = new Uint8Array(w * h);
  if (theme.backwall) {
    const covered = new Uint8Array(w * h);
    for (let tx = 0; tx < w; tx++) {
      let cov = false;
      for (let ty = 0; ty < h; ty++) {
        if (solid(tx, ty)) cov = true;
        else if (cov) covered[ty * w + tx] = 1;
      }
    }
    for (let ty = 0; ty < h; ty++) for (let tx = 1; tx < w - 1; tx++) {
      const i = ty * w + tx;
      if (covered[i] && (covered[i - 1] || solid(tx - 1, ty)) && (covered[i + 1] || solid(tx + 1, ty))) interior[i] = 1;
    }
  }
  // small decorations on walkable surfaces, vines on cliff faces, lanterns under ceilings
  const busy = new Set();
  const mark = (x, y) => busy.add(Math.floor(y / T - 0.5) * w + Math.floor(x / T));
  for (const e of world.entities) if (e.type === 'torch' || e.type === 'pumpkin' || e.type === 'goal' || e.type === 'keepsake') {
    mark(e.x, e.y); mark(e.x - T, e.y); mark(e.x + T, e.y);
  }
  for (const s of world.signs) mark(s.px, s.py);
  for (const p of world.props) mark(p.x, p.y);
  const kinds = DECO[theme.name] || DECO.dusk;
  const deco = [], vines = [], lanterns = [];
  for (let ty = 1; ty < h - 1; ty++) for (let tx = 1; tx < w - 1; tx++) {
    if (!solid(tx, ty) || world.grid[ty * w + tx] !== STONE) continue;
    const hv = hash(tx, ty);
    const openAbove = !solid(tx, ty - 1) && world.grid[(ty - 1) * w + tx] === 0;
    if (openAbove && !busy.has((ty - 1) * w + tx) && hv % 100 < 26) {
      deco.push({ x: tx * T, y: ty * T, kind: kinds[hv % kinds.length], v: hv });
    }
    // vines hang down cliff faces from the lip of a ledge
    if (openAbove && theme.vines !== false && hv % 100 < 45) {
      if (!solid(tx - 1, ty)) vines.push({ x: tx * T + 1, y: ty * T, len: 18 + (hv % 40), v: hv });
      if (!solid(tx + 1, ty)) vines.push({ x: tx * T + T - 1, y: ty * T, len: 14 + ((hv >> 3) % 38), v: hv + 1 });
    }
    // hanging lanterns under interior ceilings
    if (theme.backwall && !solid(tx, ty + 1) && !solid(tx, ty + 2) && !solid(tx, ty + 3) && hv % 61 === 0) {
      lanterns.push({ x: tx * T + T / 2, y: (ty + 1) * T, len: 10 + (hv % 14), v: hv });
    }
  }
  c = { depth, interior, deco, vines, lanterns };
  worldCache.set(world, c);
  return c;
}

// ------------------------------------------------------------ parallax strips
const STRIP_W = 2400;
let parallax = null;
function buildParallax() {
  return [
    houseStrip(260, '#4a2464', '#5a2c70', 0.18, 3, 0.06),
    houseStrip(300, '#311748', '#3c1d56', 0.36, 7, 0.22),
  ];
}

function houseStrip(height, col, roofCol, factor, seed, windowChance) {
  const c = canvas(STRIP_W, height + 60);
  const g = c.getContext('2d');
  g.translate(0, 60);
  const r = rng(seed * 977);
  const chimneys = [];
  let x = 0;
  while (x < STRIP_W) {
    const w = 70 + r() * 110;
    const h = 70 + r() * (height - 130);
    const y = height - h;
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
    g.fillStyle = roofCol;
    if (r() < 0.6) {
      g.beginPath(); g.moveTo(x - 6, y + 2); g.lineTo(x + w / 2, y - 26 - r() * 30); g.lineTo(x + w + 6, y + 2); g.fill();
    } else {
      g.fillRect(x - 4, y - 6, w + 8, 8);
    }
    if (r() < 0.6) { const chx = x + w * (0.2 + r() * 0.5); g.fillStyle = col; g.fillRect(chx, y - 40, 10, 34); chimneys.push({ x: chx + 5, y: y - 40 + 60, s: r() }); }
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
  return { canvas: c, factor, height: height + 60, chimneys };
}

// ------------------------------------------------------------ sky + background
let frameTime = 0;           // this frame's clock, for passes that are not handed it
export function drawBackground(ctx, cam, world, time) {
  frameTime = time;
  if (!parallax) parallax = buildParallax();
  const th = themeOf(world);
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, th.sky[0]);
  sky.addColorStop(0.45, th.sky[1]);
  sky.addColorStop(0.8, th.sky[2]);
  sky.addColorStop(1, th.sky[3]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const lift = Math.max(0, (world.pxH || H) - H - cam.y);
  if (th.stars || th.moon) {
    const r = rng(42);
    for (let i = 0; i < 80; i++) {
      const sx = ((r() * W * 3 - cam.x * 0.02) % W + W) % W;
      const sy = r() * H * 0.55 + lift * 0.02;
      const a = 0.25 + 0.55 * Math.abs(Math.sin(time * (0.4 + r()) + i));
      ctx.fillStyle = `rgba(255,240,225,${a})`;
      ctx.fillRect(sx, sy, r() < 0.15 ? 2.2 : 1.4, r() < 0.15 ? 2.2 : 1.4);
    }
  }
  if (th.moon) {
    const mx = W * 0.22 - (cam.x * 0.015) % 60, my = 90 + lift * 0.03;
    const mg = ctx.createRadialGradient(mx, my, 20, mx, my, 160);
    mg.addColorStop(0, 'rgba(210,220,255,0.35)'); mg.addColorStop(1, 'rgba(160,170,230,0)');
    ctx.fillStyle = mg; ctx.fillRect(mx - 160, my - 160, 320, 320);
    ctx.fillStyle = '#e8ecff';
    ctx.beginPath(); ctx.arc(mx, my, 30, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(150,160,200,0.45)';
    ctx.beginPath(); ctx.arc(mx - 9, my - 6, 6, 0, 6.283); ctx.arc(mx + 10, my + 8, 4.5, 0, 6.283); ctx.arc(mx + 4, my - 12, 3, 0, 6.283); ctx.fill();
  } else {
    const sunY = H * 0.78 + lift * 0.05;
    const sun = ctx.createRadialGradient(W * 0.3, sunY, 10, W * 0.3, sunY, 280);
    sun.addColorStop(0, `rgba(${th.glow},0.6)`);
    sun.addColorStop(1, `rgba(${th.glow},0)`);
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
  }
  if (th.clouds) drawClouds(ctx, cam, th, time, lift);
  drawThemeSky(ctx, cam, world, time, th, lift);

  const baseY = H * 0.86 + lift * 0.08;
  drawCastle(ctx, W * 0.72 - (cam.x * 0.04) % 400, baseY, time, world);

  parallax.forEach((L, i) => {
    const ox = -((cam.x * L.factor) % STRIP_W);
    const y = H - L.height + 100 + lift * L.factor * 0.9 + (L.factor > 0.3 ? 30 : 0);
    ctx.drawImage(L.canvas, ox, y);
    ctx.drawImage(L.canvas, ox + STRIP_W, y);
    if (i === 1) {
      // lazy chimney smoke curling up from the town
      for (const ch of L.chimneys) {
        for (const base of [ox, ox + STRIP_W]) {
          const cx = base + ch.x, cy = y + ch.y;
          if (cx < -60 || cx > W + 60) continue;
          for (let k = 0; k < 4; k++) {
            const ph = (time * 0.18 + k / 4 + ch.s) % 1;
            ctx.fillStyle = `rgba(200,170,200,${0.14 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(cx + ph * 26 + Math.sin(time + k + ch.s * 9) * 4, cy - ph * 70, 4 + ph * 12, 0, 6.283);
            ctx.fill();
          }
        }
      }
    }
    // atmospheric perspective: far layers melt into the sky
    if (i === 0) {
      const hz = ctx.createLinearGradient(0, y + 40, 0, H);
      hz.addColorStop(0, hexA(th.haze, 0));
      hz.addColorStop(0.35, hexA(th.haze, 0.3));
      hz.addColorStop(1, hexA(th.haze, 0.3));
      ctx.fillStyle = hz;
      ctx.fillRect(0, y + 40, W, H - y);
    }
  });
  drawThemeBackdrop(ctx, cam, world, time, th, lift);
  drawTrees(ctx, cam, world);
  if (th.bunting && !world.data.finale && world.data.scene !== 'scorch') drawBunting(ctx, cam, time, lift);
  if (th.rain) drawRainStreaks(ctx, time, 0.18, 70, 1);
}

function drawClouds(ctx, cam, th, time, lift) {
  const W = CFG.VIEW_W;
  ctx.fillStyle = th.clouds;
  for (let i = 0; i < 6; i++) {
    const span = W + 400;
    const x = ((i * 397 - cam.x * 0.05 - time * (4 + i)) % span + span) % span - 200;
    const y = 60 + (i % 3) * 55 + lift * 0.04;
    ctx.globalAlpha = 0.22 + (i % 2) * 0.1;
    ctx.beginPath();
    ctx.ellipse(x, y, 120 + (i % 3) * 30, 14 + (i % 2) * 6, 0, 0, 6.283);
    ctx.ellipse(x + 60, y - 8, 70, 12, 0, 0, 6.283);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Rain streaks in screen space. With a world and camera, a streak only falls in
// open sky: it stops at the first roof or ledge in its column (the skyline).
function drawRainStreaks(ctx, time, alpha, n, speed, world, cam) {
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  const top = world && skyline(world);
  ctx.strokeStyle = `rgba(170,200,240,${alpha})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = ((i * 73.7 + time * 60 * speed) % (W + 40)) - 20;
    const y = ((i * 131.3 + time * 620 * speed) % (H + 60)) - 30;
    if (top) {
      const tx = Math.floor((x + cam.x) / T);
      if (tx >= 0 && tx < world.w && y + 16 + cam.y > top[tx] * T) continue;
    }
    ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 16);
  }
  ctx.stroke();
}

// Where this level sits in the journey, 0 (first) .. 1 (finale).
const progressCache = new WeakMap();
function journey(world) {
  let p = progressCache.get(world);
  if (p !== undefined) return p;
  let i = LEVEL_LIST.indexOf(world.data);
  if (i < 0) i = LEVEL_LIST.findIndex((l) => l.name === world.data.name);
  p = i < 0 ? 0.5 : i / Math.max(1, LEVEL_LIST.length - 1);
  progressCache.set(world, p);
  return p;
}

// The castle is the destination and a progression clock: small and hazy at the
// start, looming larger and darker as Wick nears it. Its beacon only burns once
// the finale torch is lit.
function drawCastle(ctx, x, baseY, time, world) {
  const p = journey(world);
  const k = 0.62 + 0.62 * p;                 // scale: far away .. looming
  const rise = 26 * (1 - p);                  // far castles sit lower behind the town
  ctx.save();
  ctx.translate(x, baseY + rise);
  ctx.scale(k, k);
  ctx.fillStyle = lerpColor('#5a2c70', '#3a1c58', p);
  ctx.beginPath();
  ctx.ellipse(0, 60, 420, 120, 0, Math.PI, 0);
  ctx.fill();
  const wall = lerpColor('#4c2664', '#2a1444', p);
  ctx.fillStyle = wall;
  const towers = [[-110, 120, 34], [-60, 90, 60], [0, 170, 44], [55, 110, 70], [110, 140, 32]];
  for (const [dx, h, w] of towers) {
    const tx = dx - w / 2, ty = -10 - h;
    ctx.fillRect(tx, ty, w, h + 20);
    for (let i = 0; i < w; i += 10) ctx.fillRect(tx + i, ty - 7, 6, 8);
    if (h > 120) {
      ctx.beginPath(); ctx.moveTo(tx - 4, ty - 6); ctx.lineTo(tx + w / 2, ty - 50); ctx.lineTo(tx + w + 4, ty - 6); ctx.fill();
    }
    // more windows lit the nearer the castle is
    ctx.fillStyle = p > 0.3 || dx === 0 ? '#ffb04a' : 'rgba(255,176,74,0.45)';
    ctx.fillRect(tx + w / 2 - 3, ty + 24, 6, 9);
    if (p > 0.55 && h > 100) ctx.fillRect(tx + w / 2 - 3, ty + 54, 6, 9);
    ctx.fillStyle = wall;
  }
  const fy = -10 - 170 - 52;
  const lit = world.goal && world.goal.lit && world.data.finale;
  if (lit) {
    const g = Math.min(1, (world.goal.litTime ?? 99) / 1.5);
    const glow = ctx.createRadialGradient(0, fy, 2, 0, fy, 170);
    glow.addColorStop(0, `rgba(255,210,120,${0.95 * g})`);
    glow.addColorStop(0.3, `rgba(255,150,70,${0.4 * g})`);
    glow.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-180, fy - 180, 360, 360);
    drawFlame(ctx, 0, fy + 6, 9 * g, Math.sin(time * 2) * 0.2, time);
  } else {
    // a cold, waiting beacon: an unlit brazier with one faint ember
    ctx.fillStyle = wall;
    ctx.fillRect(-9, fy + 2, 18, 6);
    ctx.fillStyle = `rgba(255,110,60,${0.35 + 0.2 * Math.sin(time * 2)})`;
    ctx.beginPath(); ctx.arc(0, fy + 1, 2.2, 0, 6.283); ctx.fill();
  }
  ctx.restore();
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
    const lx = (x0 + x1) / 2, ly = y0 + sag;
    ctx.fillStyle = 'rgba(255,170,80,0.25)';
    ctx.beginPath(); ctx.arc(lx, ly + 14, 22, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#f08a38'; roundRect(ctx, lx - 8, ly + 4, 16, 20, 6); ctx.fill();
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(lx - 3, ly + 8, 6, 12);
  }
}

// ------------------------------------------------------------ tiles
const stoneLike = (k) => k === STONE || k === EMITTER;
const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;
let windowGlows = [], windowTheme = '';

export function drawTiles(ctx, cam, world, lights) {
  const th = themeOf(world);
  const sp = spritesFor(th);
  const info = analyse(world, th);
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
  windowGlows = [];
  windowTheme = th.name;
  const W = world.w;
  const wallPath = sp.walls && th.name === 'rain' && world.data.scene ? new Path2D() : null;

  // pass 1: back walls, shadows and hanging things in open cells
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const k = world.cell(tx, ty);
      if (stoneLike(k) || k === GATE) continue;
      const dark = world.isDark(tx, ty) && !lit(tx, ty);
      if (dark) continue;
      const px = tx * T, py = ty * T, i = ty * W + tx, hv = hash(tx, ty);
      if (sp.walls && info.interior[i]) {
        ctx.drawImage(sp.walls[hv % 3], px, py, T, T);
        if (wallPath) wallPath.rect(px, py, T, T);
        if (hv % (th.backwall === 'castle' ? 89 : 43) === 0 && th.backwall !== 'barn' && !stoneLike(world.cell(tx, ty + 1))) {
          // about a third of the windows are dark, so a wall is not a polka-dot grid
          const on = (hv >> 2) % 10 >= 3;
          const d = sp.details;
          ctx.drawImage(th.backwall === 'castle' ? (on ? d.stained : d.stainedDark) : (on ? d.window : d.windowDark), px, py, T, T);
          if (on) windowGlows.push(px + T / 2, py + 17, hv);
        } else if (hv % 37 === 1) {
          ctx.drawImage(th.backwall === 'castle' ? sp.details.banner : sp.details.beam, px, py, T, T);
        }
        if (stoneLike(world.cell(tx - 1, ty))) ctx.drawImage(sp.shadeL, px, py, T, T);
        if (stoneLike(world.cell(tx + 1, ty))) ctx.drawImage(sp.shadeR, px, py, T, T);
      }
      if (stoneLike(world.cell(tx, ty - 1))) {
        ctx.drawImage(sp.shadeDown, px, py, T, T);
        if (hv % 5 < 2) ctx.drawImage(sp.hang[hv % 3], px, py, T, T);
      }
    }
  }

  // level motif painted on the back walls (behind the stone)
  if (wallPath) {
    ctx.save(); ctx.clip(wallPath);
    drawWallMotif(ctx, cam, world, th, frameTime);
    ctx.restore();
  }

  // pass 2: solid tiles, outlines, volume shading
  const edges = new Path2D();
  const deep = [new Path2D(), new Path2D(), new Path2D()];
  const fringe = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const k = world.cell(tx, ty);
      if (k === 0 || k === BLOB || k === COBWEB || k === DOOR) continue;
      if (world.isDark(tx, ty) && !lit(tx, ty)) continue;
      const px = tx * T, py = ty * T;
      const v = ((tx * 7 + ty * 13) & 3);
      if (k === STONE) {
        const open = !stoneLike(world.cell(tx, ty - 1)) && world.cell(tx, ty - 1) !== GATE;
        const d = info.depth[ty * W + tx];
        const hv2 = hash(tx, ty);
        ctx.drawImage(open ? sp.top[v] : d >= 2 ? sp.rock[hv2 % 13 === 0 ? 4 : hv2 % 31 === 0 ? 5 : hv2 & 3] : sp.stone[v], px, py, T, T);
        if (open) fringe.push(px, py, hv2);
        if (d >= 2) deep[Math.min(2, d - 2)].rect(px, py, T, T);
      } else if (k === EMITTER) {
        ctx.drawImage(sp.emitter, px, py, T, T);
      } else if (k === ONEWAY) {
        ctx.drawImage(sp.plank, px, py, T, T);
        continue;
      } else if (k === GATE) {
        ctx.drawImage(sp.gate, px, py, T, T);
      }
      if (!stoneLike(world.cell(tx, ty - 1)) && k !== GATE) { edges.moveTo(px, py); edges.lineTo(px + T, py); }
      if (!stoneLike(world.cell(tx, ty + 1)) && k !== GATE) { edges.moveTo(px, py + T); edges.lineTo(px + T, py + T); }
      if (!stoneLike(world.cell(tx - 1, ty))) { edges.moveTo(px, py); edges.lineTo(px, py + T); }
      if (!stoneLike(world.cell(tx + 1, ty))) { edges.moveTo(px + T, py); edges.lineTo(px + T, py + T); }
    }
  }
  // deeper stone sinks into shadow, so masses read as solid volume instead of wallpaper
  ['rgba(18,6,32,0.22)', 'rgba(18,6,32,0.4)', 'rgba(14,4,26,0.58)'].forEach((c, i) => {
    ctx.fillStyle = c; ctx.fill(deep[i]);
  });
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke(edges);

  // organic lip over ledge tops: leaves, moss or snow drooping past the edge
  const fr = FRINGE[(STONES[th.stone] || STONES.plum).top];
  ctx.fillStyle = fr[0];
  ctx.beginPath();
  for (let i = 0; i < fringe.length; i += 3) {
    const px = fringe[i], py = fringe[i + 1], hv = fringe[i + 2];
    ctx.moveTo(px - 1, py - 1.5);
    for (let k = 0; k <= 4; k++) {
      const x = px + k * 8;
      const drop = 3 + ((hv >> k) % 4) * 1.4;
      ctx.quadraticCurveTo(x + 4, py + drop + 2, x + 8, py + 2);
    }
    ctx.lineTo(px + T + 1, py - 1.5);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = fr[1];
  ctx.beginPath();
  for (let i = 0; i < fringe.length; i += 3) {
    const px = fringe[i], py = fringe[i + 1], hv = fringe[i + 2];
    for (let k = 0; k < 3; k++) {
      const x = px + 4 + ((hv >> (k * 3)) % 24);
      ctx.moveTo(x + 2.5, py - 1); ctx.ellipse(x, py - 1, 2.5, 1.4, 0, 0, 6.283);
    }
  }
  ctx.fill();
}

const FRINGE = {
  leaves: ['#a8482a', '#e89a32'],
  moss: ['#2a6a5a', '#4a9a80'],
  snow: ['#e8eefa', '#ffffff'],
};

// Window light per theme: [glow rgb, spill tint rgb or null for the same]. Rain and
// tower windows let in cool moonlight; castle stained glass throws coloured light.
const WINDOW_LIGHT = {
  rain: ['160,190,255'], tower: ['200,180,255'], castle: ['170,180,255', 'stained'],
};
const glowSprites = {};
// A soft halo round the window plus a trapezoid of light spilling down the wall.
function windowGlowSprite(key) {
  if (glowSprites[key]) return glowSprites[key];
  const [rgb, tint] = WINDOW_LIGHT[key] || ['255,170,70'];
  const c = canvas(96, 150), g = c.getContext('2d');
  const r = g.createRadialGradient(48, 30, 2, 48, 30, 34);
  r.addColorStop(0, `rgba(${rgb},0.55)`); r.addColorStop(0.5, `rgba(${rgb},0.16)`); r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r; g.fillRect(0, 0, 96, 70);
  // the spill: a soft, vertically stretched fan of light below the sill
  const cols = tint === 'stained' ? ['200,70,90', '90,130,255', '240,190,80', '60,190,160'] : [rgb];
  cols.forEach((col, i) => {
    const n = cols.length, ox = n > 1 ? (i - (n - 1) / 2) * 7 : 0;
    g.save();
    g.beginPath(); g.rect(0, 40, 96, 110); g.clip();
    g.translate(48 + ox, 40); g.scale(0.42, 1.45);
    const sg = g.createRadialGradient(0, 0, 0, 0, 0, 74);
    const a = n > 1 ? 0.16 : 0.2;
    sg.addColorStop(0, `rgba(${col},${a})`); sg.addColorStop(0.45, `rgba(${col},${a * 0.4})`); sg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = sg; g.fillRect(-114, 0, 228, 80);
    g.restore();
  });
  return (glowSprites[key] = c);
}

// Glows for lit back-wall windows, wax blobs and the canal surface (after the
// darkness layer). Windows vary in size and strength and use 'screen', so a wall
// full of them never sums to a milky haze.
export function drawTileGlows(ctx) {
  if (waterRuns.length) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawWaterGlints(ctx, waterTime); ctx.restore(); }
  if (blobGlows.length) drawBlobGlows(ctx);
  if (!windowGlows.length) return;
  const spr = windowGlowSprite(windowTheme);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < windowGlows.length; i += 3) {
    const x = windowGlows[i], y = windowGlows[i + 1], hv = windowGlows[i + 2];
    const k = 0.7 + 0.6 * (((hv >> 3) % 8) / 7);
    ctx.globalAlpha = 0.5 + 0.5 * (((hv >> 1) % 5) / 4);
    ctx.drawImage(spr, x - 48 * k, y - 30 * k, 96 * k, 150 * k);
  }
  ctx.restore();
}

// Low mist hugging the bottom of the world (world space, before darkness).
export function drawMist(ctx, cam, world, time) {
  const th = themeOf(world);
  waterRuns.length = 0;
  waterTime = time;
  drawMistBand(ctx, cam, world, time, th);
  // the canal sits above the mist, so the hazard always reads
  if (th.water) drawWater(ctx, cam, world, time);
}

function drawMistBand(ctx, cam, world, time, th) {
  if (!th.mist) return;
  const y = world.pxH - T * 3.2;
  if (y > cam.y + cam.h) return;
  const g = ctx.createLinearGradient(0, y, 0, world.pxH);
  g.addColorStop(0, th.mist + '0)');
  g.addColorStop(0.5, th.mist + '0.3)');
  g.addColorStop(1, th.mist + '0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(cam.x, y, cam.w, world.pxH - y);
  ctx.fillStyle = th.mist + '0.14)';
  for (let i = 0; i < 6; i++) {
    const x = cam.x + ((i * 233 + time * (10 + i * 3)) % (cam.w + 300)) - 150;
    ctx.beginPath(); ctx.ellipse(x, y + 50 + (i % 3) * 14, 150, 20, 0, 0, 6.283); ctx.fill();
  }
}

// Screen-space foreground: dark silhouettes and weather in front of everything.
export function drawForeground(ctx, cam, world, time) {
  const th = themeOf(world);
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  if (th.rain) drawRainStreaks(ctx, time + 7, 0.3, 40, 1.35, world, cam);
  if (th.snow) {
    // snow, like rain, only falls where there is open sky above
    const top = skyline(world);
    ctx.fillStyle = 'rgba(235,240,255,0.75)';
    ctx.beginPath();
    for (let i = 0; i < 70; i++) {
      const s = 1 + (i % 3);
      const x = ((i * 97.3 + time * (12 + s * 6) - cam.x * 0.3 * s / 2 + Math.sin(time + i) * 14) % (W + 20) + W + 20) % (W + 20) - 10;
      const y = ((i * 57.1 + time * (22 + s * 14)) % (H + 20)) - 10;
      const tx = Math.floor((x + cam.x) / T);
      if (tx >= 0 && tx < world.w && y + cam.y > top[tx] * T) continue;
      ctx.moveTo(x + s * 0.9, y); ctx.arc(x, y, s * 0.9, 0, 6.283);
    }
    ctx.fill();
  }
  if (!th.fg) return;
  // anchored to the world floor; sinks out of view as the camera climbs
  const base = H + 8 + Math.max(0, world.pxH - H - cam.y) * 1.25;
  if (base > H + 90) return;
  const f = 1.25, span = 260;
  const off = cam.x * f;
  const first = Math.floor(off / span) - 1;
  ctx.fillStyle = '#0c0516';
  for (let i = first; i < first + 6; i++) {
    const x = i * span - off;
    const hv = hash(i, 3);
    if (th.fg === 'fence') {
      for (let k = 0; k < 4; k++) ctx.fillRect(x + k * 22, base - 46 - (k % 2) * 6, 8, 60);
      ctx.fillRect(x - 4, base - 34, 80, 5);
    } else if (th.fg === 'pumpkins') {
      ctx.beginPath(); ctx.ellipse(x + 30, base - 6, 26, 20, 0, 0, 6.283); ctx.fill();
      ctx.fillRect(x + 28, base - 32, 5, 10);
      if (hv % 2) { ctx.beginPath(); ctx.ellipse(x + 70, base, 18, 14, 0, 0, 6.283); ctx.fill(); }
    }
    // soft curved grass blades swaying (rounded, so they never read as spikes)
    ctx.strokeStyle = '#0c0516';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const gx = x + 100 + k * 9 + (hv % 7);
      const gh = 14 + ((hv + k * 13) % 16);
      const bend = (k % 2 ? 1 : -1) * (5 + (k % 3) * 2) + Math.sin(time * 1.4 + k + i) * 3;
      ctx.moveTo(gx, base);
      ctx.quadraticCurveTo(gx + bend * 0.2, base - gh * 0.6, gx + bend, base - gh);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + 136, base + 4, 46, 12, 0, 0, 6.283); ctx.fill();
  }
}

function roundRectTop(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y + r);
  g.arc(x + w / 2, y + r, w / 2, Math.PI, 0);
  g.lineTo(x + w, y + h);
  g.closePath();
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
      case 'lamp': {
        const sw = Math.sin(time * 1.4 + x) * 1.5;
        ctx.fillStyle = '#2a1a2e'; ctx.fillRect(x - 2, y - 58, 4, 58); ctx.strokeRect(x - 2, y - 58, 4, 58);
        ctx.fillRect(x - 2, y - 58, 14, 3);
        ctx.strokeStyle = '#2a1a2e'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x + 10, y - 55); ctx.lineTo(x + 10 + sw, y - 48); ctx.stroke();
        ctx.fillStyle = '#f08a38'; roundRect(ctx, x + 4 + sw, y - 48, 12, 15, 4); ctx.fill();
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(x + 7.5 + sw, y - 45, 5, 9);
        ctx.strokeStyle = OUT; roundRect(ctx, x + 4 + sw, y - 48, 12, 15, 4); ctx.stroke();
        lanternGlows.push(x + 10 + sw, y - 40);
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
      case 'keepsake': if (inView(e.x, e.y)) drawKeepsake(ctx, e, time); break;
      case 'goal': if (inView(e.x, e.y, 200)) drawGoal(ctx, e, time); break;
      case 'drip': if (inView(e.x, e.y, 300)) drawDrips(ctx, e); break;
      case 'cobweb': if (inView(e.x, e.y)) drawCobweb(ctx, e, time); break;
      case 'fuse': if (inView(e.x, e.y)) drawFuse(ctx, e, world, time); break;
      case 'gate': if (inView(e.x, e.y) && e.state === 'burning') drawGateFire(ctx, e, time); break;
    }
  }
  blobGlows.length = 0;
  blobCells.clear();
  for (const b of world.blobs) if (b.drawY === b.y) blobCells.add(blobKey(b.x, b.y));
  for (let pass = 0; pass < 2; pass++) {
    for (const b of world.blobs) {
      if (!inView(b.x, b.drawY, 40)) continue;
      drawBlob(ctx, b, time, pass);
      if (pass && world.isDark(Math.floor(b.x / T), Math.floor(b.drawY / T))) blobGlows.length -= 2;
    }
  }
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

// Keepsake: a tiny festival paper lantern with ribbon tails, bobbing on its own
// little breeze. Rose paper and a twinkle so it reads as optional treasure, not
// wax (pumpkins) or a checkpoint (torches). On pickup it pops upward and fades.
const KEEP_POP = 0.7;
function keepsakePose(e, time) {
  const t = e.t || 0;
  if (e.got) {
    const k = clamp(t / KEEP_POP, 0, 1);
    return { k, x: e.x, y: e.y - 20 - 26 * (1 - (1 - k) ** 2), s: 1 + 0.5 * k, a: 1 - k * k };
  }
  return { k: 0, x: e.x, y: e.y - 20 + Math.sin(time * 2.2 + e.x * 0.05) * 2.5, s: 1, a: 1 };
}

function drawKeepsake(ctx, e, time) {
  const p = keepsakePose(e, time);
  if (p.a <= 0.01) return;
  const sway = e.got ? 0 : Math.sin(time * 1.7 + e.x) * 0.12;
  ctx.save();
  ctx.globalAlpha = p.a;
  ctx.translate(p.x, p.y);
  ctx.rotate(sway);
  ctx.scale(p.s, p.s);
  // string and ribbon tails
  ctx.strokeStyle = OUT; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, -9); ctx.stroke();
  const flut = Math.sin(time * 4 + e.x) * 2;
  ctx.lineCap = 'round'; ctx.lineWidth = 2;
  for (const [s, c] of [[-1, '#5ec8c0'], [1, '#e8b03a']]) {
    ctx.strokeStyle = c;
    ctx.beginPath(); ctx.moveTo(s * 1.5, 9);
    ctx.quadraticCurveTo(s * 4 + flut * s, 13, s * 2 + flut, 17); ctx.stroke();
  }
  // paper body
  ctx.fillStyle = '#e0587a'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 8.5, 0, 0, 6.283); ctx.fill(); ctx.stroke();
  ctx.fillStyle = `rgba(255,${200 + 30 * Math.sin(time * 6 + e.x) | 0},150,0.85)`;
  ctx.beginPath(); ctx.ellipse(0, 0.5, 4.2, 6, 0, 0, 6.283); ctx.fill();
  ctx.strokeStyle = 'rgba(120,20,50,0.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 8.3, 0, 0, 6.283); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
  // gold caps
  ctx.fillStyle = '#e8b03a'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
  ctx.fillRect(-4.5, -10.5, 9, 3); ctx.strokeRect(-4.5, -10.5, 9, 3);
  ctx.fillRect(-3.5, 7.5, 7, 2.5); ctx.strokeRect(-3.5, 7.5, 7, 2.5);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-5, -4, 1.5, 4);
  ctx.restore();
}

// additive: soft rose glow, an orbiting twinkle, and a sparkle burst on pickup
function drawKeepsakeGlows(ctx, cam, world, time) {
  for (const e of world.entities) {
    if (e.type !== 'keepsake') continue;
    if (e.x < cam.x - 80 || e.x > cam.x + cam.w + 80) continue;
    const p = keepsakePose(e, time);
    if (p.a <= 0.01) continue;
    const r = 30 + 10 * p.k;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(255,150,170,${(0.32 + 0.06 * Math.sin(time * 3 + e.x)) * p.a})`);
    g.addColorStop(1, 'rgba(255,120,160,0)');
    ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    const star = (x, y, s, a) => {
      ctx.fillStyle = `rgba(255,244,210,${a})`;
      ctx.beginPath();
      ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y - s * 0.25); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.25, y + s * 0.25);
      ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y + s * 0.25); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.25, y - s * 0.25);
      ctx.closePath(); ctx.fill();
    };
    if (!e.got) {
      // one twinkle drifting round the lantern, flaring now and then
      const a = time * 1.3 + e.x;
      const tw = Math.max(0, Math.sin(time * 2.6 + e.x * 0.3));
      star(p.x + Math.cos(a) * 13, p.y + Math.sin(a) * 9 - 2, 2 + 3 * tw * tw, 0.35 + 0.6 * tw);
    } else {
      for (let i = 0; i < 8; i++) {
        const ang = i / 8 * 6.283 + 0.3, d = 6 + 34 * p.k;
        star(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, 3.5 * (1 - p.k) + 1, 0.9 * (1 - p.k));
      }
    }
  }
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

// Wax blob: poured wax on a melted puddle foot, with drips running over the lip
// and a glossy highlight. Neighbouring blobs fuse into one mass (no seams, no
// outline between them), so a row reads as poured wax rather than tombstones.
let blobGrad = null, blobGradCtx = null;
const blobGlows = [];        // [x, y] world px, a warm inner glow after the darkness
const blobCells = new Set();
const blobKey = (x, y) => Math.round(x / T) + Math.round(y / T) * 8192;
function drawBlob(ctx, b, time, pass) {
  const sag = b.sag;
  const x = b.x, y = b.drawY;
  const settled = y === b.y;
  const has = (dx, dy) => settled && blobCells.has(blobKey(x + dx, y + dy));
  const L = has(-T, 0), R = has(T, 0), U = has(0, -T), D = has(0, T);
  const h = U ? T : T * (1 - sag * 0.55), wob = sag * 5;
  const top = T - h;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = OUT;
  if (pass === 0) {
    // melted puddle foot (drawn for every blob first, so bodies sit on top)
    if (!D) {
      ctx.lineWidth = 2;
      ctx.fillStyle = '#d49a5c';
      ctx.beginPath(); ctx.ellipse(T / 2, T - 1.5, T / 2 + (L ? 0 : 4) + (R ? 0 : 4) + wob, 3.6, 0, 0, 6.283); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (blobGradCtx !== ctx) {
    blobGradCtx = ctx;
    blobGrad = ctx.createLinearGradient(0, 0, 0, T);
    blobGrad.addColorStop(0, '#fde9bc'); blobGrad.addColorStop(0.5, '#f0cb8c'); blobGrad.addColorStop(1, '#dba666');
  }
  const xl = L ? -1 : -1 - wob, xr = R ? T + 1 : T + 1 + wob, yt = U ? -1 : top + 1;
  const side = (s) => {           // s = 1 left, -1 right; from the bottom up to the lip
    const x0 = s > 0 ? xl : xr, xm = s > 0 ? 0 : T, xi = s > 0 ? 7 : T - 7;
    if (s > 0 ? L : R) { ctx.lineTo(s > 0 ? -1 : T + 1, yt); return; }
    ctx.bezierCurveTo(x0 + s * wob * 0.5, top + 12, xm, U ? -1 : top + 3, xi, yt);
  };
  const lid = () => {             // across the top, left to right
    if (U) { ctx.lineTo(R ? T + 1 : T - 7, -1); return; }
    ctx.quadraticCurveTo(T * 0.3, top - 2 + sag * 3, T / 2, top + 0.5);
    ctx.quadraticCurveTo(T * 0.72, top - 1.5 + sag * 3, R ? T + 1 : T - 7, yt);
  };
  ctx.fillStyle = sag > 0 ? `rgb(${248 - sag * 20 | 0},${214 - sag * 30 | 0},${150 - sag * 30 | 0})` : blobGrad;
  ctx.beginPath();
  ctx.moveTo(xl, T - 1); side(1); lid();
  if (R) ctx.lineTo(T + 1, T - 1); else ctx.bezierCurveTo(T, top + 3, T + 1 + wob * 0.5, top + 12, xr, T - 1);
  ctx.lineTo(xl, T - 1);
  ctx.closePath();
  ctx.fill();
  // outline only the outer edges
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (!L) { ctx.moveTo(xl, T - 1); side(1); }
  if (!U) { ctx.moveTo(L ? -1 : 7, yt); lid(); }
  if (!R) { ctx.moveTo(T - 7, yt); ctx.bezierCurveTo(T, top + 3, T + 1 + wob * 0.5, top + 12, xr, T - 1); }
  ctx.stroke();
  if (!U) {
    // drips running over the lip, outlined softly so they read on the pale wax
    const d1 = 6 + sag * 6 + (b.seed % 5), d2 = 4 + sag * 4 + ((b.seed >> 2) % 6);
    ctx.fillStyle = '#fff4dc'; ctx.strokeStyle = 'rgba(140,80,30,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3, top + 2); ctx.lineTo(3.5, top + 3 + d1); ctx.arc(6.5, top + 3 + d1, 3, Math.PI, 0, true); ctx.lineTo(10, top + 1);
    ctx.moveTo(T - 13, top + 0.5); ctx.lineTo(T - 13, top + 3 + d2); ctx.arc(T - 10.5, top + 3 + d2, 2.5, Math.PI, 0, true); ctx.lineTo(T - 8, top + 0.5);
    ctx.fill(); ctx.stroke();
    // glossy top highlight and a specular glint
    ctx.strokeStyle = 'rgba(255,255,250,0.95)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L ? 2 : 8, top + 4); ctx.quadraticCurveTo(T * 0.3, top + 1.5 + sag * 2, T / 2 - 1, top + 3); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(T - 8, top + 5.5, 1.4, 0, 6.283); ctx.fill();
  }
  // a run of wax pooling down the outer side, breaking the straight silhouette
  if (!L && !D) {
    ctx.fillStyle = '#f2cf92'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(-1.5 - wob, T - 8 - (b.seed % 4), 2.6, 5, 0.15, 0, 6.283); ctx.fill(); ctx.stroke();
  }
  if (b.life < 3 && Math.sin(time * 14) > 0.4) {
    // blink when about to melt
    ctx.fillStyle = 'rgba(255,240,200,0.35)';
    ctx.fillRect(-2, top, T + 4, h);
  }
  ctx.restore();
  blobGlows.push(x + T / 2, y + top + h * 0.45);
}

let blobGlowSprite = null;
function drawBlobGlows(ctx) {
  if (!blobGlowSprite) {
    blobGlowSprite = canvas(64, 64);
    const g = blobGlowSprite.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,200,120,0.3)'); r.addColorStop(0.5, 'rgba(255,170,90,0.1)'); r.addColorStop(1, 'rgba(255,150,70,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < blobGlows.length; i += 2) ctx.drawImage(blobGlowSprite, blobGlows[i] - 28, blobGlows[i + 1] - 28, 56, 56);
  ctx.restore();
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
    // ripples where the water lands
    ctx.strokeStyle = 'rgba(180,225,250,0.5)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 2; k++) {
      const ph = ((e.t * 2.2 + k * 0.5) % 1);
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath(); ctx.ellipse(e.x + T / 2, e.bottom - 1, 4 + ph * 12, 1 + ph * 2.5, 0, 0, 6.283); ctx.stroke();
    }
    ctx.globalAlpha = 1;
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

// Fuse: a braided cord sagging between nail pegs, so a fuse line reads as rope
// strung along the wall, not a selection rectangle.
function drawFuse(ctx, e, world, time) {
  const cx = e.x + T / 2, cy = e.y + T / 2;
  const at = (dx, dy) => {
    const n = world.flammables.get((e.ty + dy) * world.w + e.tx + dx);
    return n && (n.type === 'fuse' || n.type === 'gate') ? n : null;
  };
  const links = [];
  for (const [dx, dy] of [[1, 0], [0, 1]]) if (at(dx, dy)) links.push([dx, dy]);
  if (e.state === 'gone') {
    ctx.fillStyle = 'rgba(40,30,40,0.8)';
    ctx.fillRect(cx - 2, cy - 1, 4, 2);
    return;
  }
  const burning = e.state === 'burning';
  const path = () => {
    ctx.beginPath();
    if (!links.length && !at(-1, 0) && !at(0, -1)) { ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + 5, cy + 4, cx + 10, cy + 2); }
    for (const [dx, dy] of links) {
      // horizontal runs droop between pegs; vertical drops bow out a little
      ctx.moveTo(cx, cy);
      if (dx) ctx.quadraticCurveTo(cx + T / 2, cy + 5, cx + T, cy);
      else ctx.quadraticCurveTo(cx + 2, cy + T / 2, cx, cy + T);
    }
  };
  ctx.lineCap = 'round';
  path(); ctx.strokeStyle = OUT; ctx.lineWidth = 4.5; ctx.stroke();
  path(); ctx.strokeStyle = burning ? '#ffb040' : '#a8743c'; ctx.lineWidth = 2.6; ctx.stroke();
  // the braid: short light twists along the cord
  ctx.setLineDash([2, 3]);
  path(); ctx.strokeStyle = burning ? '#fff0a0' : '#e0b878'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.setLineDash([]);
  // a nail peg wherever the cord turns, ends, or every third cell along a run
  const h = !!(at(1, 0) || at(-1, 0)), v = !!(at(0, 1) || at(0, -1));
  const ends = !!at(1, 0) + !!at(-1, 0) + !!at(0, 1) + !!at(0, -1);
  if ((h && v) || ends < 2 || (e.tx + e.ty) % 3 === 0) {
    ctx.fillStyle = '#8a8098'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy - 1, 2.2, 0, 6.283); ctx.fill(); ctx.stroke();
  }
  if (burning) {
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
    const bx = clamp(s.px - bw / 2, cam.x + 8, cam.x + cam.w - bw - 8);
    // sit above both the post and Wick so the bubble never hides the flame
    const by = Math.min(s.py - 52, near ? player.y - 34 : s.py - 52) - bh;
    ctx.globalAlpha = s.fade;
    ctx.fillStyle = 'rgba(32,16,46,0.9)';
    roundRect(ctx, bx, by, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = '#d9a640'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(32,16,46,0.9)';
    // the tail points at the post, but slides aside rather than sit on Wick's flame
    let tx = s.px;
    if (near && Math.abs(player.cx - tx) < 18) tx = player.cx + (tx >= player.cx ? 18 : -18);
    tx = clamp(tx, bx + 12, bx + bw - 12);
    ctx.beginPath(); ctx.moveTo(tx - 7, by + bh); ctx.lineTo(tx + 7, by + bh); ctx.lineTo(tx, by + bh + 9); ctx.fill();
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

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Drip guide: a ghost of where the next wax blob will land, and a ring on the
// blob that "soak" would take. Makes the drip rules readable at a glance.
export function drawDripGuide(ctx, player, world, time, opts = {}) {
  if (!player.alive) return;
  const cell = player.findDripCell(world);
  const afford = player.canAffordDrip();
  if (cell) {
    // full strength when standing, faint mid-jump so it never clutters platforming
    ctx.save();
    ctx.globalAlpha = player.onGround ? 1 : 0.4;
    const x = cell.tx * T, y = cell.ty * T;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -time * 12;
    ctx.lineWidth = 2;
    if (afford) {
      ctx.fillStyle = `rgba(255,236,190,${0.1 + 0.08 * pulse})`;
      ctx.strokeStyle = `rgba(255,226,160,${0.45 + 0.3 * pulse})`;
    } else {
      ctx.fillStyle = 'rgba(200,80,70,0.08)';
      ctx.strokeStyle = 'rgba(230,110,90,0.45)';
    }
    roundRect(ctx, x + 2, y + 2, T - 4, T - 4, 7);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    // a falling drip shows its path from Wick down to where it lands
    if (cell.fromY < y - 1) {
      ctx.strokeStyle = afford ? 'rgba(255,226,160,0.35)' : 'rgba(230,110,90,0.3)';
      ctx.beginPath(); ctx.moveTo(x + T / 2, cell.fromY + 4); ctx.lineTo(x + T / 2, y - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + T / 2 - 4, y - 7); ctx.lineTo(x + T / 2, y - 2); ctx.lineTo(x + T / 2 + 4, y - 7); ctx.stroke();
    }
    // lifting drip: an up arrow inside the ghost
    if (cell.lift) {
      ctx.strokeStyle = afford ? 'rgba(255,226,160,0.8)' : 'rgba(230,110,90,0.6)';
      ctx.beginPath(); ctx.moveTo(x + T / 2, y + T - 8); ctx.lineTo(x + T / 2, y + 8);
      ctx.moveTo(x + T / 2 - 5, y + 13); ctx.lineTo(x + T / 2, y + 8); ctx.lineTo(x + T / 2 + 5, y + 13); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }
  const blob = world.nearestBlob(player.cx, player.y + player.h / 2, CFG.REABSORB_RANGE);
  if (blob) {
    ctx.save();
    ctx.strokeStyle = `rgba(150,230,220,${0.5 + 0.3 * Math.sin(time * 6)})`;
    ctx.lineWidth = 2.5;
    roundRect(ctx, blob.x - 2, blob.drawY - 2, T + 4, T + 4, 9);
    ctx.stroke();
    if (opts.absorbGlyph) {
      ctx.font = '700 12px "Trebuchet MS", Verdana, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(20,10,36,0.8)';
      const w = ctx.measureText(opts.absorbGlyph).width + 10;
      roundRect(ctx, blob.x + T / 2 - w / 2, blob.drawY - 22, w, 16, 6); ctx.fill();
      ctx.fillStyle = '#a8f0e4';
      ctx.fillText(opts.absorbGlyph, blob.x + T / 2, blob.drawY - 14);
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------ environment detail
// Small non-gameplay decorations on surfaces, vines down cliff faces, hanging lanterns.
let lanternGlows = [];
export function drawDecor(ctx, cam, world, time) {
  const th = themeOf(world);
  const info = analyse(world, th);
  const inView = (x, y) => x > cam.x - 40 && x < cam.x + cam.w + 40 && y > cam.y - 60 && y < cam.y + cam.h + 60;
  const darkAt = (x, y) => world.isDark(Math.floor(x / T), Math.floor(y / T));
  lanternGlows = [];

  // vines and roots hanging over cliff lips
  ctx.lineCap = 'round';
  for (const v of info.vines) {
    if (!inView(v.x, v.y) || darkAt(v.x, v.y + 4)) continue;
    const snow = th.stone === 'slate';
    const sway = Math.sin(time * 1.2 + v.v) * 1.5;
    ctx.strokeStyle = snow ? 'rgba(220,232,255,0.85)' : (v.v % 3 ? '#2f6a5a' : '#5a6a2a');
    ctx.lineWidth = snow ? 2.2 : 1.6;
    ctx.beginPath();
    ctx.moveTo(v.x, v.y + 2);
    const len = snow ? v.len * 0.4 : v.len;
    ctx.quadraticCurveTo(v.x + sway + (v.v % 2 ? 3 : -3), v.y + len * 0.5, v.x + sway, v.y + len);
    ctx.stroke();
    if (!snow) {
      ctx.fillStyle = v.v % 2 ? '#3f8a76' : '#c9732a';
      for (let k = 1; k <= 3; k++) {
        ctx.beginPath(); ctx.ellipse(v.x + sway * k / 3 + (k % 2 ? 2.5 : -2.5), v.y + len * k / 3.4, 2.4, 1.3, k, 0, 6.283); ctx.fill();
      }
    }
  }

  // surface decorations
  for (const d of info.deco) {
    const x = d.x, y = d.y;
    if (!inView(x, y) || darkAt(x + T / 2, y - 4)) continue;
    const r = d.v;
    const ox = 4 + (r % 18);
    switch (d.kind) {
      case 'flowers': {
        for (let k = 0; k < 3; k++) {
          const fx = x + ox + k * 4, fh = 5 + ((r >> k) % 5);
          const sw = Math.sin(time * 2 + k + r) * 0.8;
          ctx.strokeStyle = '#4a6a2a'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(fx + sw, y - fh); ctx.stroke();
          ctx.fillStyle = ['#f0c040', '#e8605a', '#f8e8d0', '#c870d0'][(r + k) & 3];
          ctx.beginPath(); ctx.arc(fx + sw, y - fh, 1.8, 0, 6.283); ctx.fill();
        }
        break;
      }
      case 'tuft': {
        ctx.strokeStyle = th.stone === 'castle' ? '#3f7a66' : '#a8963a'; ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let k = -2; k <= 2; k++) {
          ctx.moveTo(x + ox + k * 2, y);
          ctx.lineTo(x + ox + k * 3.2 + Math.sin(time * 1.8 + r), y - 5 - Math.abs(2 - Math.abs(k)) * 2);
        }
        ctx.stroke();
        break;
      }
      case 'rocks': {
        ctx.fillStyle = '#4a3448'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(x + ox, y - 2, 4, 2.6, 0, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x + ox + 6, y - 1.5, 2.6, 1.8, 0, 0, 6.283); ctx.fill(); ctx.stroke();
        break;
      }
      case 'leaves': {
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = ['#e89a32', '#d4462c', '#f0c040', '#b8482a'][(r + k) & 3];
          ctx.beginPath(); ctx.ellipse(x + ox + k * 3 - 4, y - 1.2 - (k % 2), 2.8, 1.3, (r + k) * 0.7, 0, 6.283); ctx.fill();
        }
        break;
      }
      case 'mushrooms': {
        for (let k = 0; k < 2; k++) {
          const mx = x + ox + k * 6, mh = 4 + k * 2;
          ctx.fillStyle = '#e8dcc8'; ctx.fillRect(mx - 0.8, y - mh, 1.8, mh);
          ctx.fillStyle = k ? '#3fb8a8' : '#d8583a';
          ctx.beginPath(); ctx.ellipse(mx, y - mh, 3.6 - k, 2.2, 0, Math.PI, 0); ctx.fill();
        }
        break;
      }
      case 'puddle': {
        ctx.fillStyle = 'rgba(30,40,80,0.7)';
        ctx.beginPath(); ctx.ellipse(x + T / 2, y + 1.5, 12, 2.4, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = `rgba(170,200,255,${0.25 + 0.15 * Math.sin(time * 3 + r)})`;
        ctx.fillRect(x + T / 2 - 6, y + 0.8, 7, 1);
        break;
      }
      case 'straw': {
        ctx.strokeStyle = '#d9a640'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const sx = x + ox + k * 2 - 4; ctx.moveTo(sx, y); ctx.lineTo(sx + ((r + k) % 5) - 2, y - 2 - (k % 3)); }
        ctx.stroke();
        break;
      }
      case 'snow': {
        ctx.fillStyle = '#e6ecf8';
        ctx.beginPath(); ctx.ellipse(x + ox + 2, y, 7, 3.2, 0, Math.PI, 0); ctx.fill();
        break;
      }
      case 'icerock': {
        ctx.fillStyle = 'rgba(170,200,240,0.85)';
        ctx.beginPath(); ctx.moveTo(x + ox - 3, y); ctx.lineTo(x + ox, y - 7); ctx.lineTo(x + ox + 3, y); ctx.fill();
        break;
      }
      case 'rubble': {
        ctx.fillStyle = '#6e5464'; ctx.strokeStyle = OUT; ctx.lineWidth = 1;
        ctx.fillRect(x + ox, y - 3, 5, 3); ctx.strokeRect(x + ox, y - 3, 5, 3);
        ctx.fillRect(x + ox + 6, y - 2, 3, 2);
        break;
      }
    }
  }

  // hanging lanterns (chain + paper lantern); their glow is added after the darkness
  for (const l of info.lanterns) {
    if (!inView(l.x, l.y) || darkAt(l.x, l.y + 8)) continue;
    const sw = Math.sin(time * 1.3 + l.v) * 2;
    const ly = l.y + l.len;
    ctx.strokeStyle = '#2a1a2a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x + sw, ly); ctx.stroke();
    ctx.fillStyle = '#3a2a3a'; ctx.fillRect(l.x + sw - 4, ly, 8, 2);
    ctx.fillStyle = '#f08a38';
    roundRect(ctx, l.x + sw - 6, ly + 2, 12, 14, 4); ctx.fill();
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(l.x + sw - 2.5, ly + 5, 5, 8);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; roundRect(ctx, l.x + sw - 6, ly + 2, 12, 14, 4); ctx.stroke();
    lanternGlows.push(l.x + sw, ly + 9);
  }
}

export function drawDecorGlows(ctx, time) {
  if (!lanternGlows.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < lanternGlows.length; i += 2) {
    const x = lanternGlows[i], y = lanternGlows[i + 1];
    const r = 44 + Math.sin(time * 7 + x) * 3;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(255,180,80,0.55)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

// mid-ground tree silhouettes (outdoor themes)
const treeStrips = {};
function buildTrees(frost) {
  const c = canvas(STRIP_W, 300);
  const g = c.getContext('2d');
  const r = rng(4242);
  let x = 40;
  g.strokeStyle = '#1a0c2a';
  g.lineCap = 'round';
  const branch = (bx, by, ang, len, wdt, depth) => {
    const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
    g.lineWidth = wdt; g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
    if (depth > 0) {
      branch(ex, ey, ang - 0.35 - r() * 0.35, len * 0.72, wdt * 0.65, depth - 1);
      branch(ex, ey, ang + 0.35 + r() * 0.35, len * 0.7, wdt * 0.65, depth - 1);
    } else if (r() < 0.8) {
      g.fillStyle = frost ? 'rgba(200,215,250,0.5)' : r() < 0.6 ? 'rgba(160,60,40,0.55)' : 'rgba(200,120,40,0.45)';
      g.beginPath(); g.arc(ex, ey, 4 + r() * 6, 0, 6.283); g.fill();
    }
  };
  while (x < STRIP_W) {
    const h = 120 + r() * 140;
    branch(x, 300, -Math.PI / 2 + (r() - 0.5) * 0.2, h * 0.4, 9, 4);
    x += 160 + r() * 260;
  }
  return c;
}
export function drawTrees(ctx, cam, world) {
  const th = themeOf(world);
  if (!th.trees) return;
  const frost = th.stone === 'slate';
  const treeStrip = treeStrips[frost] || (treeStrips[frost] = buildTrees(frost));
  const lift = Math.max(0, world.pxH - CFG.VIEW_H - cam.y);
  const f = 0.55;
  const ox = -((cam.x * f) % STRIP_W);
  const y = CFG.VIEW_H - 300 + 70 + lift * f;
  ctx.drawImage(treeStrip, ox, y);
  ctx.drawImage(treeStrip, ox + STRIP_W, y);
}

// ------------------------------------------------------------ light on the world
// Soft shadow under Wick while airborne: shows exactly where you will land.
export function drawJumpShadow(ctx, world, player) {
  drawJumpNotch(ctx, player);
  if (!player.alive || player.onGround) return;
  const tx = Math.floor(player.cx / T);
  let ty = Math.floor(player.feet / T);
  while (ty < world.h && world.cell(tx, ty) === 0) ty++;
  const gy = ty * T, dist = gy - player.feet;
  if (dist > T * 7 || dist < 2) return;
  const k = 1 - dist / (T * 7);
  ctx.fillStyle = `rgba(14,4,26,${0.45 * k})`;
  ctx.beginPath(); ctx.ellipse(player.cx, gy, 6 + 9 * k, 2 + 1.5 * k, 0, 0, 6.283); ctx.fill();
}

// How high a full held jump lifts Wick's feet right now. Steps the same integrator
// as Player.update (hang time, discrete frames) so the notch matches the real apex.
const apexCache = { wax: -1, px: 0 };
function jumpApexPx(player) {
  if (apexCache.wax === player.wax) return apexCache.px;
  const dt = CFG.STEP, g = CFG.GRAVITY;
  let vy = -player.jumpVelocity(), y = 0, top = 0;
  for (let i = 0; i < 120 && vy < 0; i++) {
    vy += (Math.abs(vy) < CFG.APEX_HANG_VEL ? g * CFG.APEX_HANG_MULT : g) * dt;
    y += vy * dt;
    if (y < top) top = y;
  }
  apexCache.wax = player.wax; apexCache.px = -top;
  return -top;
}

// Jump-height notch: two small brackets at the apex of a full jump, shown while
// Wick stands still (and briefly after landing). Wax is jump height, so the notch
// sinks as Wick melts; once a two-tile step is out of reach it turns amber.
// Render-only state: never touches the simulation.
const notch = { a: 0, land: 0, ground: true, last: 0 };
function drawJumpNotch(ctx, player) {
  const now = performance.now() / 1000;
  const dt = clamp(now - notch.last, 0, 0.1);
  notch.last = now;
  const grounded = player.alive && player.onGround;
  if (grounded && !notch.ground) notch.land = 0.9;
  notch.ground = grounded;
  notch.land = Math.max(0, notch.land - dt);
  const speed = Math.abs(player.vx) + Math.abs(player.windVx || 0);
  let target = 0;
  if (grounded) target = Math.max(clamp(1 - (speed - 30) / 140, 0, 1), notch.land > 0 ? 0.55 * Math.min(1, notch.land * 3) : 0);
  notch.a += (target - notch.a) * Math.min(1, dt * (target > notch.a ? 5 : 9));
  if (notch.a < 0.02) return;

  const apex = jumpApexPx(player);
  const short = apex + CFG.LEDGE_ASSIST < 2 * T;
  const y = Math.round(player.feet - apex) + 0.5, cx = player.cx;
  const pulse = short ? 0.75 + 0.25 * Math.sin(now * 5) : 1;
  const a = notch.a * pulse;
  const col = short ? '255,150,60' : '255,236,190';
  ctx.save();
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const x0 = cx + s * 15, x1 = cx + s * 27;
    // dark under-stroke so it reads on bright walls too
    ctx.strokeStyle = `rgba(20,8,30,${0.55 * a})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x1, y + 3); ctx.lineTo(x1, y); ctx.lineTo(x0, y); ctx.stroke();
    ctx.strokeStyle = `rgba(${col},${0.95 * a})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y + 3); ctx.lineTo(x1, y); ctx.lineTo(x0, y); ctx.stroke();
  }
  // a faint dotted guide between the brackets, above the flame
  ctx.fillStyle = `rgba(${col},${0.5 * a})`;
  for (let x = cx - 9; x <= cx + 9; x += 6) ctx.fillRect(x - 1, y - 0.5, 2, 1);
  ctx.restore();
}

// Torchlight catching the world: warm rim light on edges facing a flame, and
// pools of light on the floor beneath flames. Drawn additively after the darkness.
export function drawLightDetail(ctx, cam, world, lights, time) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawKeepsakeGlows(ctx, cam, world, time);
  ctx.restore();
  const lit = lights.filter((l) => !l.dim && l.x > cam.x - l.r && l.x < cam.x + cam.w + l.r && l.y > cam.y - l.r && l.y < cam.y + cam.h + l.r);
  if (!lit.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // pools of light on the ground
  for (const l of lit) {
    const tx = Math.floor(l.x / T);
    let ty = Math.floor((l.y + 4) / T);
    let n = 0;
    while (ty < world.h && !world.isSolid(tx, ty) && n++ < 8) ty++;
    if (n > 7) continue;
    const gy = ty * T, dist = gy - l.y;
    const w = l.r * 0.75 * (1 - Math.min(0.6, dist / (T * 10)));
    const flick = 1 + 0.06 * Math.sin(time * 13 + l.x);
    const g = ctx.createRadialGradient(l.x, gy, 0, l.x, gy, w * flick);
    g.addColorStop(0, `rgba(255,170,80,${l.player ? 0.22 : 0.28})`);
    g.addColorStop(1, 'rgba(255,120,50,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(l.x, gy); ctx.scale(1, 0.16); ctx.translate(-l.x, -gy);
    ctx.fillRect(l.x - w * 1.1, gy - w * 1.1, w * 2.2, w * 2.2);
    ctx.restore();
  }
  // rim light along edges that face a flame
  const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(world.w - 1, Math.floor((cam.x + cam.w) / T));
  const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(world.h - 1, Math.floor((cam.y + cam.h) / T));
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!world.isSolid(tx, ty)) continue;
    const px = tx * T, py = ty * T;
    const top = !world.isSolid(tx, ty - 1), left = !world.isSolid(tx - 1, ty), right = !world.isSolid(tx + 1, ty);
    if (!top && !left && !right) continue;
    for (const l of lit) {
      const dx = px + T / 2 - l.x, dy = py + T / 2 - l.y;
      const dd = dx * dx + dy * dy, r = l.r * 0.85;
      if (dd > r * r) continue;
      const a = (1 - Math.sqrt(dd) / r) ** 2 * 0.55;
      ctx.strokeStyle = `rgba(255,180,100,${a})`;
      ctx.beginPath();
      if (top && l.y < py + 4) { ctx.moveTo(px + 1, py + 1); ctx.lineTo(px + T - 1, py + 1); }
      if (left && l.x < px) { ctx.moveTo(px + 1, py + 2); ctx.lineTo(px + 1, py + T - 2); }
      if (right && l.x > px + T) { ctx.moveTo(px + T - 1, py + 2); ctx.lineTo(px + T - 1, py + T - 2); }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Wind you can see: curved streaks blowing through a zone during a gust.
export function drawWindStreaks(ctx, cam, world, time) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const z of world.windZones()) {
    if (z.strength < 0.05) continue;
    const r = z.rect;
    if (r.x > cam.x + cam.w || r.x + r.w < cam.x) continue;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const span = r.w + 200;
      const speed = 420 * z.strength;
      let x = ((i * 173.3 + time * speed) % span);
      x = z.dir > 0 ? r.x - 100 + x : r.x + r.w + 100 - x;
      const y = r.y + ((i * 61.7) % r.h);
      if (x < cam.x - 80 || x > cam.x + cam.w + 80) continue;
      const len = 40 + (i % 3) * 25;
      // tailwinds (blowing the way the level goes) are golden, headwinds pale
      ctx.strokeStyle = z.dir > 0 ? `rgba(255,214,120,${0.3 * z.strength})` : `rgba(255,240,250,${0.22 * z.strength})`;
      ctx.lineWidth = 1.5 + (i % 2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - z.dir * len * 0.5, y - 6 * Math.sin(time * 3 + i), x - z.dir * len, y + 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Canal water: a teal band with a bright rippling surface line in every pit that
// reaches the bottom of the world. Open runs are merged so the ripple is continuous.
const waterRuns = [];        // [x0, x1, y] world px, re-lit after the darkness
let waterTime = 0;
function drawWater(ctx, cam, world, time) {
  const y = world.pxH - T - 10;
  if (y > cam.y + cam.h) return;
  const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(world.w - 1, Math.floor((cam.x + cam.w) / T));
  const g = ctx.createLinearGradient(0, y, 0, world.pxH);
  g.addColorStop(0, 'rgba(40,168,178,0.92)');
  g.addColorStop(0.25, 'rgba(24,104,140,0.95)');
  g.addColorStop(1, 'rgba(10,30,66,0.98)');
  for (let tx = x0; tx <= x1; tx++) {
    if (world.cell(tx, world.h - 2) !== 0) continue;
    let e = tx;
    while (e + 1 <= x1 && world.cell(e + 1, world.h - 2) === 0) e++;
    const a = tx * T, b = (e + 1) * T;
    tx = e;
    ctx.fillStyle = g;
    ctx.fillRect(a, y, b - a, world.pxH - y);
    // slow swell on the surface: a pale crest line with a darker trough beneath
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(190,255,240,0.95)';
    ctx.beginPath();
    for (let wx = a; wx <= b; wx += 4) {
      const wy = y + Math.sin(time * 1.6 + wx * 0.07) * 1.6 + Math.sin(time * 0.9 - wx * 0.031) * 1.1;
      if (wx === a) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,220,220,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < (b - a) / 26; k++) {
      const rx = a + 6 + k * 26 + Math.sin(time * 0.7 + k * 2.1) * 6, ry = y + 7 + (k % 3) * 4;
      ctx.moveTo(rx, ry); ctx.lineTo(rx + 10 + (k % 2) * 6, ry);
    }
    ctx.stroke();
    // a lantern's warm reflection, broken by ripples
    for (let k = a; k < b; k += T) {
      const c = k / T;
      if ((c * 7) % 5 !== 0) continue;
      ctx.fillStyle = `rgba(255,180,90,${0.3 + 0.15 * Math.sin(time * 3 + c)})`;
      ctx.fillRect(k + 8 + Math.sin(time * 2 + c) * 3, y + 6, 10, 2);
    }
    waterRuns.push(a, b, y);
  }
}

// After the darkness: the canal's surface catches the sky, so it stays readable.
function drawWaterGlints(ctx, time) {
  if (!waterRuns.length) return;
  ctx.strokeStyle = 'rgba(80,210,200,0.32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < waterRuns.length; i += 3) {
    const a = waterRuns[i], b = waterRuns[i + 1], y = waterRuns[i + 2];
    for (let wx = a; wx <= b; wx += 6) {
      const wy = y + Math.sin(time * 1.6 + wx * 0.07) * 1.6 + Math.sin(time * 0.9 - wx * 0.031) * 1.1;
      if (wx === a) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
    }
  }
  ctx.stroke();
  if (Post.quality < 1) return;
  ctx.fillStyle = 'rgba(40,150,160,0.10)';
  for (let i = 0; i < waterRuns.length; i += 3) ctx.fillRect(waterRuns[i], waterRuns[i + 2] - 2, waterRuns[i + 1] - waterRuns[i], 12);
}
