// HUD candle meter, level card, menus, title and end screens, toasts.
import { CFG, clamp, lerp } from './config.js';
import { drawFlame, drawWick } from './render/draw-wick.js';
import { drawBackground } from './render/draw-world.js';

const W = CFG.VIEW_W, H = CFG.VIEW_H;
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Trebuchet MS", Verdana, sans-serif';

const GLYPHS = {
  keyboard: { move: '← →', jump: 'Space', drip: '↓', absorb: 'E', restart: 'R', pause: 'Esc' },
  gamepad: { move: 'Left stick', jump: 'Ⓐ', drip: 'Ⓧ', absorb: 'Ⓑ', restart: 'Ⓨ', pause: 'Menu' },
  touch: { move: '◀ ▶', jump: 'JUMP', drip: 'DRIP', absorb: 'SOAK', restart: 'Pause → Restart', pause: '❚❚' },
};

export const UI = {
  menuRects: [],
  toasts: [],

  glyphs(device) { return GLYPHS[device] || GLYPHS.keyboard; },

  toast(text, time = 2.5) {
    this.toasts = this.toasts.filter((t) => t.text !== text);
    this.toasts.push({ text, t: time, max: time });
  },

  update(dt) {
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
  },

  // index of the menu item under a point in view coordinates, or -1
  hitTest(x, y) {
    return this.menuRects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  },

  // ---------------------------------------------------------------- HUD
  drawHUD(ctx, player, time, opts = {}) {
    const frac = player.waxFrac();
    // on touch the move pad covers the bottom-left, so the candle moves to the top-left
    // a failed drip makes the candle shake
    const shake = opts.fail ? Math.sin(time * 60) * 3 * opts.fail : 0;
    const x = 40 + shake, base = opts.touch ? 92 : H - 30;
    const ch = lerp(5, 62, frac);
    // dish
    ctx.fillStyle = '#4a3a50';
    ctx.strokeStyle = '#1c0d2a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, base + 6, 24, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // candle body
    const low = frac < 0.2;
    ctx.fillStyle = '#f6e6c4';
    roundRect(ctx, x - 11, base - ch, 22, ch + 2, 4);
    ctx.fill();
    ctx.strokeStyle = low && Math.sin(time * 10) > 0 ? '#e0402c' : '#1c0d2a';
    ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#dcb98a'; ctx.fillRect(x - 10, base - ch + 2, 5, ch - 2);
    ctx.fillStyle = '#fff6dc'; ctx.fillRect(x - 9, base - ch + 1, 18, 3);
    // drip on the side
    ctx.fillStyle = '#f6e6c4';
    ctx.beginPath(); ctx.ellipse(x + 8, base - ch + 8 + Math.min(10, ch * 0.2), 2.4, 4 + ch * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    // wick + flame
    ctx.strokeStyle = '#1c0d2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, base - ch); ctx.lineTo(x, base - ch - 5); ctx.stroke();
    if (player.alive) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, base - ch - 12, 0, x, base - ch - 12, 30 + 20 * frac);
      g.addColorStop(0, 'rgba(255,160,60,0.45)'); g.addColorStop(1, 'rgba(255,100,40,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 60, base - ch - 70, 120, 120);
      ctx.restore();
      drawFlame(ctx, x, base - ch - 4, 5 + 5 * frac, Math.sin(time * 2) * 0.15, time);
    }
    if (opts.muted) {
      ctx.fillStyle = 'rgba(251,233,200,0.7)';
      ctx.font = `600 13px ${SANS}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('sound off (M)', W - 16, 14);
      ctx.textAlign = 'left';
    }
  },

  drawLevelCard(ctx, world, index, t) {
    const total = CFG.LEVEL_CARD_TIME;
    const a = clamp(Math.min(t / 0.4, (total - t) / 0.6), 0, 1);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(20,10,36,0.55)';
    ctx.fillRect(0, H * 0.24, W, 120);
    ctx.font = `600 16px ${SANS}`;
    ctx.fillStyle = '#e8b03a';
    ctx.fillText(`LEVEL ${index + 1}`, W / 2, H * 0.24 + 26);
    titleText(ctx, world.name, W / 2, H * 0.24 + 62, 44);
    ctx.font = `italic 17px ${SERIF}`;
    ctx.fillStyle = '#fbe9c8';
    ctx.fillText(world.hint, W / 2, H * 0.24 + 100);
    ctx.restore();
  },

  // ---------------------------------------------------------------- menus
  drawMenu(ctx, title, items, selected, opts = {}) {
    ctx.save();
    ctx.fillStyle = opts.backdrop ?? 'rgba(14,6,28,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const top = opts.top ?? H * 0.3;
    if (title) titleText(ctx, title, W / 2, top, 48);
    this.menuRects = [];
    items.forEach((label, i) => {
      const y = top + 74 + i * 50;
      const bw = 340, bh = 40;
      const r = { x: W / 2 - bw / 2, y: y - bh / 2, w: bw, h: bh };
      this.menuRects.push(r);
      const sel = i === selected;
      ctx.fillStyle = sel ? 'rgba(232,140,50,0.9)' : 'rgba(50,26,70,0.85)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
      ctx.strokeStyle = sel ? '#ffe2a0' : 'rgba(217,166,64,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `${sel ? 700 : 600} 19px ${SANS}`;
      ctx.fillStyle = sel ? '#2a1630' : '#fbe9c8';
      ctx.fillText(label, W / 2, y + 1);
    });
    if (opts.footer) {
      ctx.font = `14px ${SANS}`;
      ctx.fillStyle = 'rgba(251,233,200,0.75)';
      ctx.fillText(opts.footer, W / 2, top + 74 + items.length * 50 + 14);
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------- title
  drawTitle(ctx, time, device, opts) {
    const fake = TITLE_WORLD;
    drawBackground(ctx, { x: time * 20, y: 0, w: W, h: H }, fake, time);
    // dusk over the town
    const g = ctx.createLinearGradient(0, H * 0.4, 0, H);
    g.addColorStop(0, 'rgba(20,10,40,0)'); g.addColorStop(1, 'rgba(20,10,40,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Wick, big, on a little cobble ledge
    const bob = Math.sin(time * 2) * 2;
    const glow = ctx.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, 260);
    glow.addColorStop(0, 'rgba(255,170,80,0.35)'); glow.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3c2140';
    ctx.beginPath(); ctx.ellipse(W / 2, H * 0.72 + 6, 110, 14, 0, 0, Math.PI * 2); ctx.fill();
    TITLE_WICK.squash = Math.sin(time * 2) * 0.03;
    ctx.save();
    ctx.translate(W / 2, H * 0.72 + bob * 0.2);
    ctx.scale(3.4, 3.4);
    TITLE_WICK.x = -TITLE_WICK.w / 2;
    TITLE_WICK.y = -TITLE_WICK.h;
    drawWick(ctx, TITLE_WICK, time);
    ctx.restore();

    // WICK
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    titleText(ctx, 'WICK', W / 2, H * 0.17, 104, true);
    ctx.font = `italic 19px ${SERIF}`;
    ctx.fillStyle = '#fbe9c8';
    ctx.fillText('a candle-cat. reach the next torch before you burn down.', W / 2, H * 0.29);

    if (opts.menu) {
      this.drawMenu(ctx, null, opts.menu, opts.selected, { backdrop: 'rgba(0,0,0,0)', top: H * 0.7 });
    } else {
      this.menuRects = [];
      const a = 0.55 + 0.45 * Math.sin(time * 3);
      ctx.font = `700 22px ${SANS}`;
      ctx.fillStyle = `rgba(255,214,140,${a})`;
      const prompt = device === 'touch' ? 'Tap to begin' : device === 'gamepad' ? 'Press any button' : 'Press any key or button';
      ctx.fillText(prompt, W / 2, H * 0.86);
    }
    ctx.font = `13px ${SANS}`;
    ctx.fillStyle = 'rgba(251,233,200,0.6)';
    const help = device === 'touch'
      ? (opts.standalone ? 'Hold your phone sideways.' : 'Tip: Share → Add to Home Screen to play full screen.')
      : device === 'gamepad'
        ? 'Ⓐ jump   Ⓧ drip wax   Ⓑ soak blob   Ⓨ restart   Menu pause'
        : '←→ move   Space jump   ↓ drip wax   E soak blob   R restart   Esc pause   M mute';
    ctx.fillText(help, W / 2, H - 18);
  },

  // ---------------------------------------------------------------- end
  drawEnd(ctx, time, stats, device) {
    drawBackground(ctx, { x: time * 10, y: 0, w: W, h: H }, END_WORLD, time);
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.5);
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.45, W * 0.7);
    g.addColorStop(0, `rgba(255,180,90,${0.35 + pulse * 0.1})`); g.addColorStop(1, 'rgba(60,20,60,0.4)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    titleText(ctx, 'The castle is lit', W / 2, H * 0.24, 58, true);
    ctx.font = `italic 19px ${SERIF}`;
    ctx.fillStyle = '#fbe9c8';
    ctx.fillText('Wick made it, one drop of wax at a time.', W / 2, H * 0.35);
    ctx.font = `700 26px ${SANS}`;
    ctx.fillStyle = '#ffd690';
    ctx.fillText(`Time  ${fmtTime(stats.time)}`, W / 2, H * 0.5);
    ctx.fillText(`Deaths  ${stats.deaths}`, W / 2, H * 0.58);
    ctx.font = `16px ${SANS}`;
    ctx.fillStyle = 'rgba(251,233,200,0.8)';
    ctx.fillText(`Wax drips placed: ${stats.drips}`, W / 2, H * 0.66);
    const a = 0.55 + 0.45 * Math.sin(time * 3);
    ctx.font = `700 20px ${SANS}`;
    const msg = device === 'touch' ? 'Tap to return to the title' : 'Press to return to the title';
    ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(28,13,42,0.85)';
    ctx.strokeText(msg, W / 2, H * 0.82);
    ctx.fillStyle = `rgba(255,214,140,${0.6 + 0.4 * a})`;
    ctx.fillText(msg, W / 2, H * 0.82);
    this.menuRects = [{ x: 0, y: 0, w: W, h: H }];
  },

  drawToasts(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 17px ${SANS}`;
    this.toasts.forEach((t, i) => {
      const a = clamp(Math.min(t.t / 0.3, (t.max - t.t) / 0.2), 0, 1);
      const w = ctx.measureText(t.text).width + 40;
      const y = 64 + i * 46;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(32,16,46,0.92)';
      roundRect(ctx, W / 2 - w / 2, y - 18, w, 36, 18); ctx.fill();
      ctx.strokeStyle = '#d9a640'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fbe9c8';
      ctx.fillText(t.text, W / 2, y + 1);
    });
    ctx.restore();
  },
};

const TITLE_WORLD = { ambient: 0.78, pxH: H, data: {}, goal: null };
const END_WORLD = { ambient: 0.9, pxH: H, data: { finale: true }, goal: { lit: true } };
const TITLE_WICK = {
  w: CFG.BODY_W, h: 44, x: 0, y: 0, vx: 0, vy: 0, windVx: 0, facing: 1, onGround: true, alive: true,
  wetTime: 0, flicker: 0, squash: 0, waxFrac: () => 0.85,
};

export function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// bold poster serif with a warm gradient and dark outline
function titleText(ctx, text, x, y, size, glow = false) {
  ctx.save();
  ctx.font = `900 ${size}px ${SERIF}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = 'rgba(255,150,60,0.8)'; ctx.shadowBlur = 24; }
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size / 10);
  ctx.strokeStyle = '#1c0d2a';
  ctx.strokeText(text, x, y);
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  g.addColorStop(0, '#ffe7a0'); g.addColorStop(0.5, '#ffb040'); g.addColorStop(1, '#e0522a');
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  ctx.restore();
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
