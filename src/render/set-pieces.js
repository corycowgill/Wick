// Set dressing: each level's signature structures are plain stone in the grid. This
// paints them as what they are: the lock's gates and silted bed, the dry dock, the
// candle press and vat, the bell crate and the old bell, organ pipes, hay bales, the
// coal bunker, clockwork housings, stages and battlements. Render-only.
//
// A piece is a tile rect checked against the grid (every cell must be stone), so a
// level edit that moves it just drops the dressing. Pieces fill their whole rect, so
// the collision box still reads; the usual tile outline is stroked on top. Each is
// painted once into a cached canvas and drawn cell by cell, so dark zones still hide
// it a cell at a time. Backdrops (the press frame, a hull in the dry dock, organ
// ranks) sit behind the stone in open cells, dim, so they never read as ledges.
import { CFG } from '../config.js';
import { STONE } from '../physics.js';

const T = CFG.TILE, S = 2, OUT = '#1c0d2a';

// [kind, x0, y0, x1, y1] inclusive tile rects, by level name
const PIECES = {
  'Market Row': [['stage', 124, 6, 129, 7]],
  'Lantern Canal': [
    ['bollard', 118, 13, 118, 14], ['bollard', 123, 13, 123, 14],
    ['gate', 114, 13, 114, 16, 1], ['gate', 127, 13, 127, 16, -1],
    ['lockbed', 116, 17, 126, 19], ['locksteps', 115, 15, 115, 19],
    ['fender', 133, 13, 133, 17, 1], ['fender', 139, 13, 139, 17, -1], ['dockbed', 134, 18, 138, 19],
  ],
  'The Windy Bridge': [],
  'Harvest Lifts': [['sacks', 99, 6, 100, 9], ['granary', 122, 0, 123, 3]],
  'Rain Alley': [['bunker', 40, 12, 41, 15]],
  'Candle Works': [
    ['vat', 44, 9, 49, 13], ['crates', 41, 12, 43, 13], ['waxblocks', 80, 11, 81, 13], ['press', 95, 10, 98, 13],
  ],
  'Bell Tower': [['crate', 13, 27, 14, 28], ['bell', 9, 9, 10, 10]],
  'Moth Hollow': [['root', 59, 10, 59, 12], ['pipes', 105, 3, 106, 6], ['dais', 132, 5, 139, 6]],
  'Hay Maze': [
    ['bales', 31, 20, 32, 22], ['bales', 45, 18, 57, 22], ['bales', 72, 20, 73, 22], ['bales', 94, 14, 95, 16],
    ['bales', 44, 8, 45, 10], ['bales', 19, 9, 20, 10],
  ],
  'Firebreak': [['shed', 67, 12, 75, 14]],
  'Ember Fair': [['stage', 100, 15, 123, 16]],
  'Night Ferries': [['bollard', 57, 15, 58, 16]],
  'Clockwork Yard': [['housing', 76, 14, 78, 16], ['clockdais', 93, 8, 98, 10]],
  'Storm Mill': [['race', 80, 8, 83, 10], ['race', 87, 5, 105, 10]],
  'Moth Mill': [['pier', 84, 18, 85, 20]],
  'Castle Stair': [['battlement', 24, 8, 27, 10]],
};
// open-cell backdrops behind a piece: [kind, x0, y0, x1, y1]
const BACKS = {
  'Lantern Canal': [['hull', 134, 13, 138, 17]],
  'Candle Works': [['pressframe', 95, 4, 98, 9]],
  'Moth Hollow': [['organ', 99, 1, 109, 6]],
  'Bell Tower': [['headstock', 8, 6, 11, 8]],
};

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const bolt = (g, x, y, r = 1.3) => { g.fillStyle = '#2a2230'; g.beginPath(); g.arc(x, y, r + 0.5, 0, 6.283); g.fill(); g.fillStyle = '#8a8090'; g.beginPath(); g.arc(x - 0.3, y - 0.3, r * 0.6, 0, 6.283); g.fill(); };
// vertical planks with grain, between x0..x1
function planksV(g, x0, y0, x1, y1, cols, r, bw = 8) {
  for (let x = x0, i = 0; x < x1; x += bw, i++) {
    g.fillStyle = cols[i % cols.length]; g.fillRect(x, y0, Math.min(bw, x1 - x), y1 - y0);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x + bw - 1.2, y0, 1.2, y1 - y0);
    g.fillStyle = 'rgba(255,230,200,0.08)'; g.fillRect(x + 1, y0, 1, y1 - y0);
    g.strokeStyle = 'rgba(20,8,10,0.22)'; g.lineWidth = 0.7;
    g.beginPath();
    for (let k = 0; k < 2; k++) { const gx = x + 2.5 + r() * (bw - 4); g.moveTo(gx, y0); g.bezierCurveTo(gx + 1.5, y0 + (y1 - y0) * 0.3, gx - 1.5, y0 + (y1 - y0) * 0.6, gx + 0.5, y1); }
    g.stroke();
    if (r() < 0.35) { g.fillStyle = 'rgba(20,8,10,0.35)'; g.beginPath(); g.ellipse(x + bw / 2, y0 + r() * (y1 - y0), 1.4, 2.2, 0, 0, 6.283); g.fill(); }
  }
}
function planksH(g, x0, y0, x1, y1, cols, r, bh = 7) {
  for (let y = y0, i = 0; y < y1; y += bh, i++) {
    g.fillStyle = cols[i % cols.length]; g.fillRect(x0, y, x1 - x0, Math.min(bh, y1 - y));
    g.fillStyle = 'rgba(255,230,200,0.1)'; g.fillRect(x0, y + 0.6, x1 - x0, 1);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0, y + bh - 1.2, x1 - x0, 1.2);
    let x = x0 - r() * 30;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    while (x < x1) { x += 22 + r() * 30; if (x < x1) g.fillRect(x, y, 1.2, bh); }
  }
}
// a stone block face with a bevel, for plinths and housings
function block(g, x, y, w, h, col, lit = 0.16, dark = 0.3) {
  g.fillStyle = col; g.fillRect(x, y, w, h);
  g.fillStyle = `rgba(255,230,215,${lit})`; g.fillRect(x + 1, y + 1, w - 2, 1.4);
  g.fillStyle = `rgba(14,4,24,${dark})`; g.fillRect(x + 1, y + h - 2, w - 2, 1.6);
}

// ------------------------------------------------------------ painters: (g, w, h, r, arg)
const PAINT = {
  // a timber mooring post: squared pile, iron cap, a coil of rope
  bollard(g, w, h, r) {
    g.fillStyle = '#2e1e22'; g.fillRect(0, 0, w, h);
    planksV(g, 2, 0, w - 2, h, ['#5a4440', '#665048', '#4e3a3a', '#5e4842'], r, Math.max(7, (w - 4) / 3));
    g.fillStyle = '#3a3440'; g.fillRect(0, 0, w, 6); g.fillStyle = '#6a6474'; g.fillRect(1, 1, w - 2, 1.5);
    for (let y = 12; y < h - 4; y += 22) { g.fillStyle = '#34303c'; g.fillRect(0, y, w, 3.5); bolt(g, 5, y + 1.8, 1); bolt(g, w - 5, y + 1.8, 1); }
    // rope wrapped twice and hanging off
    g.strokeStyle = '#b08850'; g.lineWidth = 2.2;
    for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(1, 16 + k * 4); g.quadraticCurveTo(w / 2, 19 + k * 4, w - 1, 15 + k * 4); g.stroke(); }
    g.strokeStyle = 'rgba(60,40,20,0.6)'; g.lineWidth = 0.8; g.setLineDash([1.5, 1.5]);
    for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(1, 16 + k * 4); g.quadraticCurveTo(w / 2, 19 + k * 4, w - 1, 15 + k * 4); g.stroke(); }
    g.setLineDash([]);
    // green slime where the water used to stand
    g.fillStyle = 'rgba(60,120,90,0.45)'; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = 'rgba(90,160,120,0.35)'; for (let x = 1; x < w; x += 3) g.fillRect(x, h - 10 - r() * 4, 1.4, 4);
  },
  // a lock gate leaf on the chamber's end wall: heavy planks, iron straps, a paddle rack
  gate(g, w, h, r, side) {
    g.fillStyle = '#1e1416'; g.fillRect(0, 0, w, h);
    planksV(g, 0, 4, w, h, ['#4a3a30', '#54423a', '#433428'], r, 8);
    g.fillStyle = '#5e4a38'; g.fillRect(0, 0, w, 5); g.fillStyle = 'rgba(255,230,200,0.15)'; g.fillRect(0, 0.6, w, 1);
    // diagonal brace and straps
    g.strokeStyle = '#2e2420'; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(side > 0 ? 2 : w - 2, h - 4); g.lineTo(side > 0 ? w - 2 : 2, 8); g.stroke();
    for (let y = 14; y < h - 6; y += 30) {
      g.fillStyle = '#2c2a34'; g.fillRect(0, y, w, 4);
      for (let x = 4; x < w; x += 9) bolt(g, x, y + 2, 0.9);
    }
    // the waterline: weed and a dark wet foot
    g.fillStyle = 'rgba(30,70,60,0.55)'; g.fillRect(0, h - 26, w, 26);
    g.fillStyle = 'rgba(80,150,110,0.4)'; for (let x = 0; x < w; x += 2.5) g.fillRect(x, h - 27 - r() * 6, 1.2, 6 + r() * 4);
    g.fillStyle = 'rgba(200,240,240,0.18)'; g.fillRect(0, h - 27, w, 1);
  },
  // the lock bed: silt and setts, puddles left by the drained water, weed
  lockbed(g, w, h, r) {
    g.fillStyle = '#1c2230'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 9) {
      for (let x = (y / 9) % 2 ? -6 : 0; x < w; x += 12) { g.fillStyle = ['#3a4252', '#343c4c', '#404858'][(r() * 3) | 0]; rr(g, x + 0.8, y + 0.6, 10.4, 7.6, 2); g.fill(); }
    }
    g.fillStyle = '#4a4a44'; g.fillRect(0, 0, w, 7);                       // silt
    g.fillStyle = '#5c5a50'; for (let x = 0; x < w; x += 5) g.fillRect(x + r() * 3, 0, 2.5 + r() * 3, 1.6);
    for (let x = 10 + r() * 20; x < w - 20; x += 40 + r() * 50) {
      const pw = 14 + r() * 18;
      g.fillStyle = '#1c3a48'; g.beginPath(); g.ellipse(x, 2.5, pw / 2, 2.2, 0, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(170,230,240,0.55)'; g.fillRect(x - pw / 4, 1.6, pw / 3, 0.9);
    }
    g.strokeStyle = '#3e7a5a'; g.lineWidth = 1.1; g.lineCap = 'round';
    g.beginPath();
    for (let x = 4 + r() * 8; x < w; x += 9 + r() * 16) { g.moveTo(x, 1); g.quadraticCurveTo(x + 2, -2, x + 1 + r() * 2, -4); }
    g.stroke();
  },
  // stone steps up out of the lock, worn in the middle, with an iron rail post
  locksteps(g, w, h, r) {
    g.fillStyle = '#20263a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) block(g, 0, y, w, 15, ['#4c5468', '#465064'][(y / 16) & 1]);
    g.fillStyle = 'rgba(30,70,60,0.45)'; g.fillRect(0, h - 40, w, 40);
    g.fillStyle = 'rgba(255,240,220,0.12)'; g.fillRect(6, 1, w - 12, 2);
  },
  // the dry dock's floor: blocks with timber keel blocks laid across, damp
  dockbed(g, w, h, r) {
    g.fillStyle = '#1a1e2c'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 20) block(g, x + 0.5, 4, 19, 16, ['#363c50', '#30364a'][(x / 20) & 1], 0.1, 0.3);
    g.fillStyle = '#3c3a40'; g.fillRect(0, 0, w, 4);
    for (let x = 14; x < w - 10; x += 34) {
      g.fillStyle = '#4e3a2e'; g.fillRect(x, 0.5, 18, 5); g.fillStyle = '#6a5040'; g.fillRect(x, 0.5, 18, 1.4);
      g.fillStyle = '#2a1e1a'; g.fillRect(x + 8.5, 0.5, 1, 5);
    }
    g.fillStyle = 'rgba(160,210,230,0.3)'; g.fillRect(4, 3, 10, 0.8); g.fillRect(w - 26, 3, 14, 0.8);
  },
  // timber fender piles faced onto the dock wall (no rungs: the dock has no way out)
  fender(g, w, h, r, side) {
    g.fillStyle = '#262a3c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) block(g, 0, y, w, 15, ['#4c5468', '#465064', '#505870'][(y / 16) % 3]);
    const fx = side > 0 ? w - 12 : 0;
    planksV(g, fx, 0, fx + 12, h, ['#4a3a30', '#3e3028'], r, 6);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(side > 0 ? fx - 2 : 12, 0, 2, h);
    for (let y = 10; y < h; y += 40) { g.fillStyle = '#2c2a34'; g.fillRect(fx, y, 12, 3); bolt(g, fx + 6, y + 1.5, 1); }
    g.fillStyle = 'rgba(30,70,60,0.45)'; g.fillRect(0, h - 30, w, 30);
    g.fillStyle = 'rgba(80,150,110,0.35)'; for (let x = 0; x < w; x += 3) g.fillRect(x, h - 31 - r() * 6, 1.3, 7);
  },
  // the candle press bed: oak cheeks, iron bands, an iron platen on top and fresh
  // wax squeezed out of the joints, with a big crank wheel on the side
  press(g, w, h, r) {
    g.fillStyle = '#2a1812'; g.fillRect(0, 0, w, h);
    planksH(g, 4, 9, w - 4, h - 6, ['#6a4028', '#764a2e', '#5e3a24'], r, 9);
    // cheeks
    for (const x of [0, w - 10]) {
      g.fillStyle = '#4a2c1c'; g.fillRect(x, 0, 10, h);
      g.fillStyle = 'rgba(255,220,180,0.12)'; g.fillRect(x + 1.5, 0, 1.2, h);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 8, 0, 1.6, h);
      for (let y = 18; y < h; y += 30) bolt(g, x + 5, y, 1.6);
    }
    // the platen
    g.fillStyle = '#3e3a46'; g.fillRect(0, 0, w, 9);
    g.fillStyle = '#6e6a7a'; g.fillRect(1, 1, w - 2, 1.6);
    g.fillStyle = '#2a2632'; g.fillRect(0, 7.5, w, 1.5);
    for (let x = 8; x < w - 4; x += 18) bolt(g, x, 4.5, 1.4);
    // iron bands
    for (const y of [h * 0.42, h * 0.78]) { g.fillStyle = '#34303a'; g.fillRect(0, y, w, 5); for (let x = 5; x < w; x += 12) bolt(g, x, y + 2.5, 1); }
    // wax oozing out under the platen
    g.fillStyle = '#f0d49a';
    for (let x = 12; x < w - 12; x += 9 + r() * 10) {
      const l = 4 + r() * 10;
      g.beginPath(); g.moveTo(x - 2.5, 9); g.lineTo(x - 2, 9 + l); g.arc(x, 9 + l, 2, Math.PI, 0, true); g.lineTo(x + 2.5, 9); g.fill();
    }
    g.fillStyle = '#fff2d0'; g.fillRect(10, 9, w - 20, 1.3);
    // crank wheel on the front cheek
    const cx = 18, cy = h * 0.62;
    g.strokeStyle = '#2a2430'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, 11, 0, 6.283); g.stroke();
    g.lineWidth = 1.8; g.beginPath();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11); }
    g.stroke();
    g.fillStyle = '#7a7486'; g.beginPath(); g.arc(cx, cy, 2.6, 0, 6.283); g.fill();
    // a puddle of spilt wax at the foot
    g.fillStyle = '#e6c48a'; g.beginPath(); g.ellipse(w * 0.62, h - 2, 18, 2.6, 0, 0, 6.283); g.fill();
  },
  // a riveted copper vat of wax with a timber lid you can stand on
  vat(g, w, h, r) {
    g.fillStyle = '#2a1410'; g.fillRect(0, 0, w, h);
    const body = g.createLinearGradient(0, 0, w, 0);
    body.addColorStop(0, '#5a2c18'); body.addColorStop(0.35, '#a8603a'); body.addColorStop(0.55, '#c07448'); body.addColorStop(1, '#4e2414');
    g.fillStyle = body; g.fillRect(2, 8, w - 4, h - 8);
    // seams and rivets
    for (let y = 24; y < h - 4; y += 26) {
      g.fillStyle = 'rgba(40,14,8,0.5)'; g.fillRect(2, y, w - 4, 1.6);
      g.fillStyle = '#e0a070'; for (let x = 8; x < w - 4; x += 10) { g.beginPath(); g.arc(x, y + 4, 1.2, 0, 6.283); g.fill(); }
    }
    for (let x = 46; x < w - 6; x += 48) { g.fillStyle = 'rgba(40,14,8,0.45)'; g.fillRect(x, 8, 1.6, h - 8); }
    // verdigris streaks and a long highlight
    g.fillStyle = 'rgba(80,170,140,0.35)';
    for (let x = 10; x < w - 8; x += 17 + r() * 20) g.fillRect(x, 10, 2, 10 + r() * 30);
    g.fillStyle = 'rgba(255,220,180,0.25)'; g.fillRect(w * 0.42, 10, 3, h - 18);
    // tap and spout with a wax drip
    g.fillStyle = '#3a2a2a'; g.fillRect(w - 26, h - 30, 14, 6); g.fillRect(w - 16, h - 30, 4, 12);
    g.fillStyle = '#f0d49a'; g.fillRect(w - 15, h - 18, 2, 6); g.beginPath(); g.arc(w - 14, h - 11, 2, 0, 6.283); g.fill();
    // lid
    planksH(g, 0, 0, w, 8, ['#6a4028', '#5e3a24'], r, 4);
    g.fillStyle = '#3a2a2a'; g.fillRect(0, 7, w, 2);
    g.fillStyle = 'rgba(255,200,120,0.4)'; g.fillRect(4, 8.6, w - 8, 1);
  },
  // wooden packing crates, stencilled
  crates(g, w, h, r) {
    g.fillStyle = '#2a1812'; g.fillRect(0, 0, w, h);
    const cw = w / Math.max(1, Math.round(w / 32)), ch = h / Math.max(1, Math.round(h / 32));
    for (let y = 0; y < h - 1; y += ch) for (let x = 0; x < w - 1; x += cw) {
      g.fillStyle = ['#8a5a32', '#7a4e2c', '#946238'][(r() * 3) | 0]; g.fillRect(x + 1, y + 1, cw - 2, ch - 2);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 1; k < 4; k++) g.fillRect(x + 1, y + k * ch / 4, cw - 2, 1);
      g.strokeStyle = '#5a3820'; g.lineWidth = 3; g.strokeRect(x + 2.5, y + 2.5, cw - 5, ch - 5);
      g.lineWidth = 2.4; g.beginPath(); g.moveTo(x + 3, y + ch - 3); g.lineTo(x + cw - 3, y + 3); g.stroke();
      g.fillStyle = 'rgba(30,14,10,0.5)'; g.font = '700 7px sans-serif'; g.fillText('WAX', x + cw / 2 - 7, y + ch / 2 + 6);
    }
  },
  // stacked slabs of raw wax, pale and creamy, tied with twine
  waxblocks(g, w, h, r) {
    g.fillStyle = '#6a4a3a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) {
      const x0 = (y / 12) % 2 ? -8 : 0;
      for (let x = x0; x < w; x += 22) {
        const gr = g.createLinearGradient(0, y, 0, y + 12);
        gr.addColorStop(0, '#fbe6b8'); gr.addColorStop(1, '#d8b47c');
        g.fillStyle = gr; rr(g, x + 1, y + 1, 20, 10, 3); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 4, y + 2.4, 10, 1.2);
      }
    }
    g.fillStyle = '#9a6a3a'; g.fillRect(w * 0.5 - 1, 0, 2, h);
  },
  // the bell crate: slatted timber, straw poking out, a stencilled bell
  crate(g, w, h, r) {
    g.fillStyle = '#2a1814'; g.fillRect(0, 0, w, h);
    planksH(g, 2, 2, w - 2, h - 2, ['#7a5034', '#6c4630', '#845a3a'], r, 10);
    g.strokeStyle = '#4a2e1e'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, w - 5, h - 5);
    g.lineWidth = 3.6; g.beginPath(); g.moveTo(4, h - 4); g.lineTo(w - 4, 4); g.stroke();
    for (const [x, y] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) bolt(g, x, y, 1.4);
    // straw out of the slats
    g.strokeStyle = '#e0b850'; g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < 14; k++) { const x = 6 + r() * (w - 12), y = 12 + ((k % 3) * 10) + r() * 4; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 8, y - 3 - r() * 3); }
    g.stroke();
    // a stencilled bell
    g.fillStyle = 'rgba(30,14,10,0.45)';
    const cx = w * 0.62, cy = h * 0.42;
    g.beginPath(); g.moveTo(cx - 3, cy - 7); g.quadraticCurveTo(cx - 4, cy + 1, cx - 8, cy + 6); g.lineTo(cx + 8, cy + 6); g.quadraticCurveTo(cx + 4, cy + 1, cx + 3, cy - 7); g.closePath(); g.fill();
  },
  // the old bell, set down on its cradle in the loft: the timber cradle fills the
  // block, the bronze bell sits in it with a flat crown you can stand on
  bell(g, w, h, r) {
    g.fillStyle = '#22141a'; g.fillRect(0, 0, w, h);
    planksV(g, 0, 0, w, h, ['#3a2620', '#432c24'], r, 8);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#5a3c1e'); gr.addColorStop(0.35, '#c8964a'); gr.addColorStop(0.5, '#e6b866'); gr.addColorStop(1, '#4a3018');
    g.fillStyle = gr; g.strokeStyle = OUT; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.24, 5); g.lineTo(w * 0.76, 5);
    g.quadraticCurveTo(w * 0.8, h * 0.55, w - 1, h - 6); g.lineTo(1, h - 6);
    g.quadraticCurveTo(w * 0.2, h * 0.55, w * 0.24, 5); g.closePath(); g.fill(); g.stroke();
    // lip, inscription band, crack
    g.fillStyle = '#8a6030'; g.fillRect(0, h - 9, w, 5); g.strokeRect(0.5, h - 9, w - 1, 5);
    g.fillStyle = 'rgba(60,30,10,0.6)'; g.fillRect(w * 0.26, h * 0.32, w * 0.48, 2.2);
    g.fillStyle = 'rgba(255,230,160,0.55)'; for (let x = w * 0.3; x < w * 0.7; x += 4) g.fillRect(x, h * 0.32 + 0.6, 1.6, 1);
    g.strokeStyle = 'rgba(30,14,6,0.8)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(w * 0.62, h - 9); g.lineTo(w * 0.58, h * 0.7); g.lineTo(w * 0.63, h * 0.55); g.stroke();
    // flat crown: the headstock stub, full width so the top reads
    g.fillStyle = '#4a3020'; g.fillRect(0, 0, w, 6); g.fillStyle = 'rgba(255,220,170,0.18)'; g.fillRect(0, 0.8, w, 1.2);
    bolt(g, 6, 3, 1.3); bolt(g, w - 6, 3, 1.3);
    // verdigris
    g.fillStyle = 'rgba(70,170,140,0.35)'; g.fillRect(w * 0.3, h * 0.45, 3, 12); g.fillRect(w * 0.55, h * 0.5, 2, 9);
  },
  // organ pipes: a cluster of tin pipes with mouths, on a carved case
  pipes(g, w, h, r) {
    g.fillStyle = '#1e1028'; g.fillRect(0, 0, w, h);
    const n = 4, pw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * pw, top = (i % 2) * 6;
      const gr = g.createLinearGradient(x, 0, x + pw, 0);
      gr.addColorStop(0, '#5a5470'); gr.addColorStop(0.4, '#b4aac8'); gr.addColorStop(0.55, '#d4cce4'); gr.addColorStop(1, '#4a4460');
      g.fillStyle = gr; g.fillRect(x + 1, top, pw - 2, h - top);
      g.fillStyle = '#e6e0f2'; g.fillRect(x + 1, top, pw - 2, 2);
      // the mouth
      const my = top + 30 + (i % 3) * 6;
      g.fillStyle = '#1e1028';
      g.beginPath(); g.moveTo(x + 3, my); g.lineTo(x + pw - 3, my); g.lineTo(x + pw - 5, my + 6); g.lineTo(x + 5, my + 6); g.closePath(); g.fill();
      g.fillStyle = 'rgba(30,20,50,0.5)'; g.beginPath(); g.moveTo(x + 3, my + 6); g.lineTo(x + pw / 2, my + 14); g.lineTo(x + pw - 3, my + 6); g.fill();
    }
    // the case
    g.fillStyle = '#3a1e3a'; g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#d9a640'; g.fillRect(0, h - 26, w, 2.5);
    g.fillStyle = 'rgba(255,220,170,0.12)';
    for (let x = 6; x < w - 4; x += 16) { rr(g, x, h - 20, 10, 14, 3); g.fill(); }
    // the flat top still reads: a gilded rail
    g.fillStyle = '#d9a640'; g.fillRect(0, 0, w, 3); g.fillStyle = '#7a5a20'; g.fillRect(0, 3, w, 1.2);
  },
  // a gnarled root across the shelf: bark, knots and a few rootlets
  root(g, w, h, r) {
    g.fillStyle = '#2a1820'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#3a2228'); gr.addColorStop(0.45, '#6a4438'); gr.addColorStop(1, '#2e1a22');
    g.fillStyle = gr; g.fillRect(2, 0, w - 4, h);
    g.strokeStyle = 'rgba(20,8,14,0.55)'; g.lineWidth = 1.2;
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const x = 5 + k * (w - 10) / 4;
      g.moveTo(x, 0); g.bezierCurveTo(x + 4, h * 0.3, x - 4, h * 0.6, x + 2, h);
    }
    g.stroke();
    g.fillStyle = 'rgba(20,8,14,0.6)';
    g.beginPath(); g.ellipse(w * 0.4, h * 0.35, 4, 6, 0.3, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(255,220,190,0.14)'; g.beginPath(); g.ellipse(w * 0.4 - 1, h * 0.35 - 1, 2, 3, 0.3, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(70,140,110,0.5)'; for (let x = 3; x < w - 3; x += 3) g.fillRect(x, 0, 2, 3 + r() * 4);
  },
  // the hollow's dais: carved violet stone steps with gilt edging and candle stubs
  dais(g, w, h, r) {
    g.fillStyle = '#2a1636'; g.fillRect(0, 0, w, h);
    block(g, 0, 0, w, 14, '#6a4a7a', 0.2, 0.32);
    block(g, 0, 14, w, h - 14, '#5a3c6a', 0.14, 0.32);
    g.fillStyle = '#d9a640'; g.fillRect(0, 13, w, 1.6); g.fillRect(0, 0, w, 1.4);
    for (let x = 18; x < w - 10; x += 26) {
      g.fillStyle = 'rgba(255,220,240,0.1)'; rr(g, x - 7, 20, 14, h - 26, 4); g.fill();
      g.fillStyle = 'rgba(20,8,30,0.4)'; g.beginPath(); g.arc(x, 30, 3, 0, 6.283); g.fill();
    }
    g.fillStyle = '#efe0c8';
    for (let x = 10; x < w; x += 40 + r() * 20) { g.fillRect(x, 3, 3, 5 + r() * 4); }
  },
  // packed hay bales, a tile high and two long, laid in bond: straw strands, two
  // twine ties, a shaded underside; muted, so the stack sits in the barn's light
  bales(g, w, h, r) {
    g.fillStyle = '#2e1c10'; g.fillRect(0, 0, w, h);
    const rowH = T, bw = 2 * T;
    for (let y = 0; y < h; y += rowH) {
      const off = (y / rowH) % 2 ? -T : 0;
      for (let x = off; x < w; x += bw) {
        const gr = g.createLinearGradient(0, y, 0, y + rowH);
        gr.addColorStop(0, '#b8964c'); gr.addColorStop(0.5, '#9a7a38'); gr.addColorStop(1, '#5e4420');
        g.fillStyle = gr; rr(g, x + 1.5, y + 1.5, bw - 3, rowH - 3, 9); g.fill();
        // packed straw: long horizontal fibres, a few catching the light
        g.lineWidth = 0.8;
        for (let k = 0; k < 34; k++) {
          const sy = y + 4 + r() * (rowH - 8), sx = x + 4 + r() * (bw - 20), l = 6 + r() * 12;
          g.strokeStyle = sy < y + rowH * 0.45 && r() < 0.5 ? 'rgba(236,206,120,0.55)' : 'rgba(70,46,16,0.5)';
          g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + l / 2, sy + (r() - 0.5) * 2, sx + l, sy + (r() - 0.5) * 1.5); g.stroke();
        }
        // ragged cut ends
        g.strokeStyle = 'rgba(200,170,90,0.5)'; g.lineWidth = 0.9;
        g.beginPath();
        for (const ex of [x + 2, x + bw - 2]) for (let k = 0; k < 5; k++) { const ey = y + 5 + k * 5; g.moveTo(ex, ey); g.lineTo(ex + (ex > x + 4 ? 2 : -2) * r(), ey + 1); }
        g.stroke();
        // twine
        g.strokeStyle = 'rgba(110,40,28,0.85)'; g.lineWidth = 1.6;
        for (const tx of [x + bw * 0.3, x + bw * 0.7]) { g.beginPath(); g.moveTo(tx, y + 2); g.quadraticCurveTo(tx + 1, y + rowH / 2, tx, y + rowH - 2); g.stroke(); }
      }
    }
    g.strokeStyle = 'rgba(214,180,96,0.8)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = 2; x < w; x += 4 + r() * 5) { g.moveTo(x, 2); g.lineTo(x + (r() - 0.5) * 5, -1 - r() * 2); }
    g.stroke();
  },
  // grain sacks piled in a stack: one lumpy burlap sack per tile, tied at the neck
  sacks(g, w, h, r) {
    g.fillStyle = '#2a1a12'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += T) for (let x = 0; x < w; x += T) {
      const sx = x + (r() - 0.5) * 2, col = ['#9a7c52', '#8a6e48', '#a6875a'][(r() * 3) | 0];
      const gr = g.createLinearGradient(0, y, 0, y + T);
      gr.addColorStop(0, col); gr.addColorStop(1, '#5a4228');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(sx + 4, y + T - 1);
      g.bezierCurveTo(sx - 1, y + T - 8, sx + 1, y + 8, sx + 9, y + 5);
      g.quadraticCurveTo(sx + 16, y + 1, sx + 23, y + 5);
      g.bezierCurveTo(sx + T + 1, y + 8, sx + T + 1, y + T - 8, sx + T - 4, y + T - 1);
      g.closePath(); g.fill();
      // burlap weave
      g.strokeStyle = 'rgba(50,30,14,0.28)'; g.lineWidth = 0.6;
      g.beginPath();
      for (let k = 8; k < T - 2; k += 3) { g.moveTo(sx + 4, y + k); g.lineTo(sx + T - 4, y + k + 0.5); }
      g.stroke();
      // tied neck and its ears
      g.fillStyle = col; g.beginPath(); g.ellipse(sx + 16, y + 4, 4.5, 3, 0, 0, 6.283); g.fill();
      g.strokeStyle = '#5a3020'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(sx + 12, y + 6); g.lineTo(sx + 20, y + 6); g.stroke();
      g.fillStyle = 'rgba(255,240,200,0.22)'; g.beginPath(); g.ellipse(sx + 11, y + 11, 4, 2, -0.4, 0, 6.283); g.fill();
      // a stencilled sheaf
      g.strokeStyle = 'rgba(90,30,20,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx + 16, y + 24); g.lineTo(sx + 16, y + 15); g.moveTo(sx + 16, y + 18); g.lineTo(sx + 12, y + 14); g.moveTo(sx + 16, y + 18); g.lineTo(sx + 20, y + 14); g.stroke();
    }
  },
  // the granary's plank wall
  granary(g, w, h, r) {
    g.fillStyle = '#2a1812'; g.fillRect(0, 0, w, h);
    planksV(g, 0, 0, w, h, ['#7a4a2c', '#6e4428', '#84522e'], r, 8);
    for (let y = 18; y < h; y += 40) { g.fillStyle = '#4a2e1e'; g.fillRect(0, y, w, 5); bolt(g, 6, y + 2.5, 1.2); bolt(g, w - 6, y + 2.5, 1.2); }
  },
  // a coal bunker: timber bin boards heaped with coal, a shovel leaning on it
  bunker(g, w, h, r) {
    g.fillStyle = '#1a1018'; g.fillRect(0, 0, w, h);
    planksH(g, 0, 10, w, h, ['#4a3a3e', '#544246', '#3e3236'], r, 10);
    for (const x of [0, w - 6]) { g.fillStyle = '#2e2228'; g.fillRect(x, 8, 6, h - 8); }
    g.fillStyle = '#2c2a34'; g.fillRect(0, h * 0.55, w, 3.5);
    // the coal heap
    g.fillStyle = '#121018';
    g.beginPath(); g.moveTo(0, 12);
    for (let x = 0; x <= w; x += 3) g.lineTo(x, 2 + Math.sin(x * 0.4) * 1.5 + r() * 2.5);
    g.lineTo(w, 12); g.closePath(); g.fill();
    g.fillStyle = 'rgba(160,170,210,0.45)';
    for (let k = 0; k < 18; k++) g.fillRect(r() * w, 2 + r() * 9, 1.4, 1);
    // stencil and wet streaks from the rain
    g.fillStyle = 'rgba(220,210,190,0.35)'; g.font = '700 8px sans-serif'; g.fillText('COAL', w / 2 - 11, h * 0.42);
    g.fillStyle = 'rgba(150,180,230,0.18)'; for (let x = 4; x < w; x += 7) g.fillRect(x, 12, 1, h - 14);
  },
  // a charred timber shed roof (Firebreak's closet)
  shed(g, w, h, r) {
    g.fillStyle = '#140a0c'; g.fillRect(0, 0, w, h);
    planksV(g, 0, 8, w, h, ['#3a2420', '#30201c', '#422a24'], r, 9);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 8, w, h - 8);
    // shingles on top, scorched
    for (let x = -4; x < w; x += 9) { g.fillStyle = ['#4a3028', '#3e2620', '#563830'][(r() * 3) | 0]; rr(g, x, 0, 10, 10, 2.5); g.fill(); }
    g.fillStyle = 'rgba(255,120,50,0.5)';
    for (let k = 0; k < 7; k++) g.fillRect(r() * w, 10 + r() * (h - 14), 3 + r() * 5, 0.9);
    g.fillStyle = '#5a4a46'; g.fillRect(0, 0, w, 1.5);
  },
  // a stage: painted boards with a striped skirt and a gilt edge
  stage(g, w, h, r) {
    g.fillStyle = '#2a1420'; g.fillRect(0, 0, w, h);
    planksH(g, 0, 0, w, 9, ['#a06a3a', '#946036'], r, 4.5);
    g.fillStyle = '#e8b03a'; g.fillRect(0, 9, w, 2.5);
    const cols = ['#b8302c', '#e8d8c0'];
    for (let x = 0, i = 0; x < w; x += 12, i++) {
      g.fillStyle = cols[i & 1]; g.fillRect(x, 11.5, 12, h - 11.5);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 10, 11.5, 2, h - 11.5);
    }
    // scalloped valance
    g.fillStyle = '#7a2030';
    for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 11); g.lineTo(x + 16, 11); g.lineTo(x + 16, 17); g.arc(x + 8, 17, 8, 0, Math.PI); g.closePath(); g.fill(); }
    g.fillStyle = '#e8b03a'; for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, 24, 1.8, 0, 6.283); g.fill(); }
    g.fillStyle = 'rgba(14,4,24,0.45)'; g.fillRect(0, h - 10, w, 10);
  },
  // the clockwork pillar under the ride: an iron housing with a gear window
  housing(g, w, h, r) {
    g.fillStyle = '#1c1830'; g.fillRect(0, 0, w, h);
    block(g, 0, 0, w, h, '#3c3858', 0.16, 0.35);
    g.fillStyle = '#2a2640'; rr(g, 8, 10, w - 16, h - 18, 6); g.fill();
    // a gear behind the glass
    const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) * 0.28;
    g.fillStyle = '#8a7040';
    g.beginPath();
    for (let j = 0; j < 12; j++) {
      const a = j / 12 * 6.283;
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.lineTo(cx + Math.cos(a + 0.12) * (R + 4), cy + Math.sin(a + 0.12) * (R + 4));
      g.lineTo(cx + Math.cos(a + 0.4) * (R + 4), cy + Math.sin(a + 0.4) * (R + 4));
      g.lineTo(cx + Math.cos(a + 0.52) * R, cy + Math.sin(a + 0.52) * R);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#2a2640'; g.beginPath(); g.arc(cx, cy, R * 0.45, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(200,220,255,0.12)'; g.fillRect(10, 12, 6, h - 24);
    for (const [x, y] of [[4, 4], [w - 4, 4], [4, h - 4], [w - 4, h - 4]]) bolt(g, x, y, 1.6);
    g.fillStyle = '#d9a640'; g.fillRect(0, 0, w, 2);
  },
  // the clock dais: a stepped plinth with a little clock face set in its front
  clockdais(g, w, h, r) {
    g.fillStyle = '#1a1630'; g.fillRect(0, 0, w, h);
    block(g, 0, 0, w, 12, '#4a4270', 0.2, 0.3);
    block(g, 0, 12, w, h - 12, '#3a3460', 0.12, 0.3);
    g.fillStyle = '#d9a640'; g.fillRect(0, 0, w, 1.6); g.fillRect(0, 11, w, 1.4);
    const cx = w / 2, cy = 12 + (h - 12) / 2;
    g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(cx, cy, 26, 0, 6.283); g.fill();
    g.strokeStyle = '#d9a640'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#3a2a40';
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; g.fillRect(cx + Math.cos(a) * 21 - 1, cy + Math.sin(a) * 21 - 1, 2, 2); }
    g.strokeStyle = '#3a2a40'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - 15); g.moveTo(cx, cy); g.lineTo(cx + 10, cy + 4); g.stroke();
    for (const x of [14, w - 14]) { g.fillStyle = 'rgba(255,230,200,0.1)'; rr(g, x - 6, 18, 12, h - 26, 3); g.fill(); }
  },
  // the mill race ledges: dressed stone with water sheeting down and slick moss
  race(g, w, h, r) {
    g.fillStyle = '#141a30'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < w; x += 24) block(g, x + 0.6, y + 0.6, 22.8, 14.8, ['#363c58', '#30364f', '#3a4060'][(r() * 3) | 0], 0.1, 0.32);
    // water sheeting down the faces in glistening runs, slick moss under the lip
    g.fillStyle = 'rgba(150,190,240,0.2)';
    for (let x = 6 + r() * 10; x < w; x += 14 + r() * 20) { const l = 20 + r() * (h - 20); g.fillRect(x, 4, 1.6 + r() * 1.6, l); g.fillStyle = 'rgba(210,235,255,0.35)'; g.fillRect(x, 4 + l - 3, 1.6, 2); g.fillStyle = 'rgba(150,190,240,0.2)'; }
    g.fillStyle = 'rgba(40,90,80,0.45)'; for (let x = 0; x < w; x += 3) g.fillRect(x, 4, 2.2, 3 + r() * 10);
    g.fillStyle = '#2a6a5a'; g.fillRect(0, 0, w, 4); g.fillStyle = '#3f8a76'; for (let x = 0; x < w; x += 6) g.fillRect(x + r() * 3, 0, 3, 2);
    g.fillStyle = 'rgba(180,230,250,0.4)'; for (let x = 0; x < w; x += 9 + r() * 12) g.fillRect(x, 3.5, 4, 0.8);
    // the race sinks into shadow below its lip, like any deep stone
    const sh = g.createLinearGradient(0, 18, 0, h);
    sh.addColorStop(0, 'rgba(10,8,24,0)'); sh.addColorStop(1, 'rgba(10,8,24,0.6)');
    g.fillStyle = sh; g.fillRect(0, 18, w, h - 18);
  },
  // the change-over post: a timber pier with iron bands and a lantern hook
  pier(g, w, h, r) {
    g.fillStyle = '#1e1220'; g.fillRect(0, 0, w, h);
    planksV(g, 0, 0, w, h, ['#4a3044', '#54384c', '#432a3e'], r, w / 4);
    g.fillStyle = '#3a3044'; g.fillRect(0, 0, w, 6); g.fillStyle = '#7a6a86'; g.fillRect(0, 0.8, w, 1.4);
    for (let y = 16; y < h; y += 26) { g.fillStyle = '#2c2634'; g.fillRect(0, y, w, 4); for (let x = 5; x < w; x += 10) bolt(g, x, y + 2, 1); }
    g.fillStyle = 'rgba(160,120,200,0.18)'; g.fillRect(3, 6, 2, h - 6);
  },
  // a crenellated merlon on the battlement, its arrow slit lit from inside
  battlement(g, w, h, r) {
    g.fillStyle = '#1e1020'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) block(g, x + 0.6, y + 0.6, 30.8, 14.8, ['#7c6272', '#6e5464', '#886c7c'][(r() * 3) | 0], 0.18, 0.3);
    g.fillStyle = '#4a3444'; g.fillRect(0, 0, w, 5); g.fillStyle = 'rgba(255,230,220,0.2)'; g.fillRect(0, 0.6, w, 1.2);
    for (const x of [w * 0.3, w * 0.7]) {
      g.fillStyle = '#140a14'; rr(g, x - 3, 18, 6, h - 34, 3); g.fill();
      g.fillStyle = 'rgba(255,170,90,0.65)'; rr(g, x - 1.5, 22, 3, h - 42, 1.5); g.fill();
    }
    g.fillStyle = '#d9a640'; g.fillRect(0, h - 12, w, 2);
    g.fillStyle = 'rgba(60,120,90,0.4)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 5, 2, 2 + r() * 5);
  },
};

// ------------------------------------------------------------ backdrops (open cells, behind stone)
const BACK = {
  // the dry dock: a half-built hull on its keel blocks, ribs and a few planks
  hull(g, w, h) {
    g.strokeStyle = 'rgba(70,58,74,0.95)'; g.lineCap = 'round';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(8, h - 4); g.quadraticCurveTo(w / 2, h + 6, w - 8, h - 4); g.stroke();   // keel
    g.lineWidth = 3.5;
    for (let k = 0; k < 6; k++) {
      const x = 14 + k * (w - 28) / 5, top = 20 + Math.abs(k - 2.5) * 10;
      g.beginPath(); g.moveTo(x, h - 2); g.quadraticCurveTo(x + (k < 3 ? -16 : 16), h * 0.55, x + (k < 3 ? -10 : 10), top); g.stroke();
    }
    g.strokeStyle = 'rgba(88,70,74,0.95)'; g.lineWidth = 5;
    for (const y of [h - 22, h - 40]) { g.beginPath(); g.moveTo(10, y); g.quadraticCurveTo(w / 2, y + 10, w - 10, y); g.stroke(); }
    // a lantern-lit sawhorse and shavings
    g.fillStyle = 'rgba(40,30,44,0.85)'; g.fillRect(w - 46, h - 14, 22, 3); g.fillRect(w - 44, h - 12, 2, 12); g.fillRect(w - 28, h - 12, 2, 12);
  },
  // the press frame behind the bed: two uprights, a head beam and the great screw
  pressframe(g, w, h) {
    g.fillStyle = 'rgba(40,22,18,0.9)';
    g.fillRect(4, 10, 10, h); g.fillRect(w - 14, 10, 10, h);
    g.fillRect(0, 4, w, 14);
    g.fillStyle = 'rgba(120,80,50,0.25)'; g.fillRect(0, 4, w, 2); g.fillRect(5.5, 18, 1.5, h - 18); g.fillRect(w - 12.5, 18, 1.5, h - 18);
    // the screw
    const cx = w / 2;
    g.fillStyle = 'rgba(54,50,64,0.95)'; g.fillRect(cx - 5, 18, 10, h - 26);
    g.strokeStyle = 'rgba(130,124,146,0.6)'; g.lineWidth = 1.4;
    g.beginPath(); for (let y = 20; y < h - 10; y += 6) { g.moveTo(cx - 5, y); g.lineTo(cx + 5, y + 3); } g.stroke();
    // the capstan bar through the screw head
    g.fillStyle = 'rgba(70,44,28,0.95)'; g.fillRect(cx - 34, h - 14, 68, 5);
    g.fillStyle = 'rgba(54,50,64,0.95)'; g.fillRect(cx - 9, h - 18, 18, 10);
  },
  // the organ's back ranks: tall dim pipes behind the gallery
  organ(g, w, h) {
    const n = Math.floor(w / 13);
    for (let i = 0; i < n; i++) {
      const x = 4 + i * 13, top = 8 + Math.abs(Math.sin(i * 0.9)) * 70 + (i % 3) * 10;
      const gr = g.createLinearGradient(x, 0, x + 10, 0);
      gr.addColorStop(0, 'rgba(60,50,90,0.75)'); gr.addColorStop(0.5, 'rgba(120,110,150,0.75)'); gr.addColorStop(1, 'rgba(50,40,80,0.75)');
      g.fillStyle = gr; g.fillRect(x, top, 10, h - top);
      g.fillStyle = 'rgba(20,10,30,0.8)'; g.beginPath(); g.moveTo(x + 2, top + 26); g.lineTo(x + 8, top + 26); g.lineTo(x + 5, top + 32); g.fill();
    }
    g.fillStyle = 'rgba(217,166,64,0.35)'; g.fillRect(0, h - 3, w, 3);
  },
  // the loft's bell headstock: the empty frame the old bell came down from
  headstock(g, w, h) {
    g.fillStyle = 'rgba(46,30,26,0.9)';
    g.fillRect(4, 0, 8, h); g.fillRect(w - 12, 0, 8, h);
    g.fillRect(0, 8, w, 10);
    g.strokeStyle = 'rgba(46,30,26,0.9)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(8, h); g.lineTo(w / 2, 18); g.lineTo(w - 8, h); g.stroke();
    g.strokeStyle = 'rgba(90,80,90,0.7)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(w / 2, 18); g.lineTo(w / 2, h - 10); g.arc(w / 2 - 4, h - 10, 4, 0, Math.PI); g.stroke();
  },
};

// ------------------------------------------------------------ per-world lookup (cached)
const cache = new WeakMap();
function build(world) {
  const name = world.data && world.data.name;
  const list = PIECES[name] || [];
  const at = new Map(), pieces = [], backs = [];
  for (const [kind, x0, y0, x1, y1, arg] of list) {
    if (!PAINT[kind]) continue;
    let ok = true;
    for (let ty = y0; ty <= y1 && ok; ty++) for (let tx = x0; tx <= x1 && ok; tx++) if (world.cell(tx, ty) !== STONE) ok = false;
    if (!ok) continue;
    const p = { kind, x0, y0, x1, y1, arg, c: null };
    pieces.push(p);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) at.set(ty * world.w + tx, p);
  }
  for (const [kind, x0, y0, x1, y1, arg] of BACKS[name] || []) if (BACK[kind]) backs.push({ kind, x0, y0, x1, y1, arg, c: null });
  return { at, pieces, backs };
}
function dress(world) {
  let d = cache.get(world);
  if (!d) { d = build(world); cache.set(world, d); }
  return d;
}

function paint(p, fns) {
  if (p.c) return p.c;
  const w = (p.x1 - p.x0 + 1) * T, h = (p.y1 - p.y0 + 1) * T;
  const c = canvas(w * S, h * S), g = c.getContext('2d');
  g.scale(S, S);
  fns[p.kind](g, w, h, rng(p.x0 * 977 + p.y0 * 131 + 7), p.arg);
  return (p.c = c);
}

// The dressed piece covering cell i, or undefined.
export function pieceAt(world, i) { return dress(world).at.get(i); }

// Draw one cell of a dressed piece (in place of the stone sprite).
export function drawPieceCell(ctx, p, tx, ty) {
  const c = paint(p, PAINT), P = T * S;
  ctx.drawImage(c, (tx - p.x0) * P, (ty - p.y0) * P, P, P, tx * T, ty * T, T, T);
}

// Backdrops behind the stone. `hidden(tx, ty)` says a cell is unlit dark.
export function drawPieceBacks(ctx, cam, world, hidden) {
  for (const b of dress(world).backs) {
    const x = b.x0 * T, y = b.y0 * T, w = (b.x1 - b.x0 + 1) * T, h = (b.y1 - b.y0 + 1) * T;
    if (x > cam.x + cam.w || x + w < cam.x || y > cam.y + cam.h || y + h < cam.y) continue;
    if (hidden((b.x0 + b.x1) >> 1, (b.y0 + b.y1) >> 1)) continue;
    ctx.drawImage(paint(b, BACK), x, y, w, h);
  }
}

// Live touches on dressed pieces: water leaking through the upstream lock gate.
export function drawPieceFx(ctx, cam, world, time) {
  for (const p of dress(world).pieces) {
    if (p.kind !== 'gate' || p.arg < 0) continue;
    const x = (p.x1 + 1) * T, y0 = p.y0 * T + 40, y1 = (p.y1 + 1) * T;
    if (x < cam.x - 40 || x > cam.x + cam.w + 40 || y0 > cam.y + cam.h || y1 < cam.y) continue;
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const sy = y0 + k * 22, ph = (time * 1.6 + k * 0.37) % 1;
      ctx.strokeStyle = `rgba(170,220,240,${0.5 - k * 0.1})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, sy); ctx.quadraticCurveTo(x + 7, sy + 2, x + 9, Math.min(y1, sy + 30)); ctx.stroke();
      ctx.fillStyle = 'rgba(200,235,250,0.7)';
      ctx.beginPath(); ctx.arc(x + 4 + ph * 6, sy + ph * ph * 28, 1.1, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }
}
