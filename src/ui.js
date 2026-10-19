// HUD candle meter, level card, menus, title and end screens, toasts.
import { CFG, clamp, lerp } from './config.js';
import { drawFlame, drawWick } from './render/draw-wick.js';
import { drawBackground } from './render/draw-world.js';
import { BUILD, BUILD_DATE } from './version.js';
import { CREDITS, CREDIT_STEP } from './credits.js';
import { keyName } from './settings.js';

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
  SELECT_COLS: 6,
  toasts: [],

  glyphs(device) { return GLYPHS[device] || GLYPHS.keyboard; },
  // keyboard glyphs follow the remapped keys (the first key of each action)
  setKeys(keys) {
    GLYPHS.keyboard = { ...GLYPHS.keyboard, jump: keyName(keys.jump[0]), drip: keyName(keys.drip[0]), absorb: keyName(keys.soak[0]) };
  },

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
    return this.menuRects.findIndex((r) => this.hitRect(r, x, y));
  },
  hitRect(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; },

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
    if (opts.keepsake != null) {
      // this level's keepsake: an empty outline until Wick finds it
      const pop = opts.keepsakePop || 0;
      const kx = 82, ky = base - 6, r = 10 * (1 + 0.6 * Math.sin(pop * Math.PI) * pop);
      if (opts.keepsake) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const kg = ctx.createRadialGradient(kx, ky, 0, kx, ky, r * 2.6);
        kg.addColorStop(0, 'rgba(255,200,90,0.4)'); kg.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = kg; ctx.fillRect(kx - r * 3, ky - r * 3, r * 6, r * 6);
        ctx.restore();
      }
      drawMark(ctx, 'keepsake', kx, ky, r, opts.keepsake);
    }
    let ty = 14;
    const rx = opts.touch ? W - 84 : W - 16;   // clear of the touch pause button
    if (opts.timer != null) {
      // speedrun timer: this level, then the whole run underneath
      ctx.save();
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.font = `700 20px ${SANS}`;
      ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(28,13,42,0.8)';
      const txt = fmtClock(opts.timer);
      ctx.strokeText(txt, rx, ty);
      ctx.fillStyle = opts.timerGentle ? '#bfe3a0' : '#ffd690';
      ctx.fillText(txt, rx, ty);
      if (opts.runTimer != null) {
        ctx.font = `600 12px ${SANS}`;
        const rt = `run ${fmtClock(opts.runTimer)}`;
        ctx.lineWidth = 3; ctx.strokeText(rt, rx, ty + 24);
        ctx.fillStyle = 'rgba(251,233,200,0.75)'; ctx.fillText(rt, rx, ty + 24);
      }
      ctx.restore();
      ty += 46;
    }
    if (opts.muted) {
      ctx.fillStyle = 'rgba(251,233,200,0.7)';
      ctx.font = `600 13px ${SANS}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('sound off (M)', W - 16, ty);
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
    const cx = opts.cx ?? W / 2;
    if (title) titleText(ctx, title, cx, top, 48);
    this.menuRects = [];
    items.forEach((label, i) => {
      const y = top + 74 + i * 50;
      const bw = 340, bh = 40;
      const r = { x: cx - bw / 2, y: y - bh / 2, w: bw, h: bh };
      this.menuRects.push(r);
      const sel = i === selected;
      ctx.fillStyle = sel ? 'rgba(232,140,50,0.9)' : 'rgba(50,26,70,0.85)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
      ctx.strokeStyle = sel ? '#ffe2a0' : 'rgba(217,166,64,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `${sel ? 700 : 600} 19px ${SANS}`;
      ctx.fillStyle = sel ? '#2a1630' : '#fbe9c8';
      ctx.fillText(label, cx, y + 1);
    });
    if (opts.footer) {
      ctx.font = `14px ${SANS}`;
      ctx.fillStyle = 'rgba(251,233,200,0.75)';
      ctx.fillText(opts.footer, cx, top + 74 + items.length * 50 + 14);
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

    // Wick, big, on a little cobble ledge; steps aside to make room for the menu
    const bob = Math.sin(time * 2) * 2;
    const mk = opts.menu ? smooth(clamp((opts.menuT ?? 1) / 0.4, 0, 1)) : 0;
    const wx = lerp(W / 2, W * 0.29, mk);
    const glow = ctx.createRadialGradient(wx, H * 0.55, 10, wx, H * 0.55, 260);
    glow.addColorStop(0, 'rgba(255,170,80,0.35)'); glow.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3c2140';
    ctx.beginPath(); ctx.ellipse(wx, H * 0.72 + 6, 110, 14, 0, 0, Math.PI * 2); ctx.fill();
    TITLE_WICK.squash = Math.sin(time * 2) * 0.03;
    ctx.save();
    ctx.translate(wx, H * 0.72 + bob * 0.2);
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
    ctx.fillText('A candle-cat. Reach the next torch before you burn out.', W / 2, H * 0.29);

    if (opts.menu) {
      // a column to the right of Wick, centred on the ledge
      ctx.save();
      ctx.globalAlpha = mk;
      this.drawMenu(ctx, null, opts.menu, opts.selected, { backdrop: 'rgba(0,0,0,0)', cx: W * 0.69, top: H * 0.6 - 74 - (opts.menu.length - 1) * 25 });
      ctx.restore();
    } else if (!opts.overlay) {
      this.menuRects = [];
      const a = 0.55 + 0.45 * Math.sin(time * 3);
      ctx.font = `700 22px ${SANS}`;
      ctx.fillStyle = `rgba(255,214,140,${a})`;
      const prompt = device === 'touch' ? 'Tap to begin' : device === 'gamepad' ? 'Press any button' : 'Press any key or button';
      ctx.fillText(prompt, W / 2, H * 0.86);
    }
    if (opts.overlay) return;   // the options pages draw their own footer
    ctx.font = `13px ${SANS}`;
    ctx.fillStyle = 'rgba(251,233,200,0.6)';
    const help = device === 'touch'
      ? (opts.standalone ? 'Hold your phone sideways.' : 'Tip: Share → Add to Home Screen to play full screen.')
      : device === 'gamepad'
        ? 'Ⓐ jump   Ⓧ drip wax   Ⓑ soak blob   Ⓨ restart   Menu pause'
        : `←→ move   ${GLYPHS.keyboard.jump} jump   ${GLYPHS.keyboard.drip} drip wax   ${GLYPHS.keyboard.absorb} soak blob   R restart   Esc pause   M mute`;
    ctx.fillText(help, W / 2, H - 18);
    ctx.font = `11px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(251,233,200,0.45)';
    ctx.fillText(`build ${BUILD} · ${BUILD_DATE}`, W - 12, H - 18);
    ctx.textAlign = 'center';
  },

  // ---------------------------------------------------------------- story intro
  // shown once, before Market Row on a fresh save; `t` is seconds since it opened
  drawStory(ctx, t, device) {
    drawBackground(ctx, { x: t * 14, y: 0, w: W, h: H }, TITLE_WORLD, t);
    ctx.fillStyle = 'rgba(14,6,28,0.5)'; ctx.fillRect(0, 0, W, H);
    // Wick, small, setting off
    const glow = ctx.createRadialGradient(150, H - 50, 4, 150, H - 50, 120);
    glow.addColorStop(0, 'rgba(255,170,80,0.35)'); glow.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, H - 200, 320, 200);
    ctx.fillStyle = '#3c2140';
    ctx.beginPath(); ctx.ellipse(150, H - 26, 70, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(150, H - 28);
    ctx.scale(1.8, 1.8);
    TITLE_WICK.x = -TITLE_WICK.w / 2; TITLE_WICK.y = -TITLE_WICK.h; TITLE_WICK.squash = Math.sin(t * 2) * 0.03;
    drawWick(ctx, TITLE_WICK, t);
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const top = H * 0.2;
    ctx.save();
    ctx.globalAlpha = clamp(t / 0.5, 0, 1);
    ctx.fillStyle = 'rgba(20,10,36,0.55)';
    ctx.fillRect(0, top, W, 176);
    ctx.font = `600 16px ${SANS}`;
    ctx.fillStyle = '#e8b03a';
    ctx.fillText('THE NIGHT OF THE LANTERN FESTIVAL', W / 2, top + 30);
    ctx.restore();
    STORY_LINES.forEach((line, i) => {
      const a = clamp((t - 0.6 - i * 1.3) / 0.7, 0, 1);
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.font = `italic 22px ${SERIF}`;
      ctx.fillStyle = '#fbe9c8';
      ctx.fillText(line, W / 2, top + 74 + i * 36 + (1 - a) * 6);
    });
    ctx.globalAlpha = 1;
    const pa = clamp((t - 4) / 0.6, 0, 1) * (0.55 + 0.45 * Math.sin(t * 3));
    if (pa > 0) {
      ctx.font = `700 20px ${SANS}`;
      ctx.fillStyle = `rgba(255,214,140,${pa})`;
      ctx.fillText(device === 'touch' ? 'Tap to begin' : 'Press any button to begin', W / 2, H * 0.62);
    }
    this.menuRects = [{ x: 0, y: 0, w: W, h: H }];
  },

  // ---------------------------------------------------------------- end
  drawEnd(ctx, time, stats, device, meta = {}) {
    drawBackground(ctx, { x: time * 10, y: 0, w: W, h: H }, END_WORLD, time);
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.5);
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.45, W * 0.7);
    g.addColorStop(0, `rgba(255,180,90,${0.35 + pulse * 0.1})`); g.addColorStop(1, 'rgba(60,20,60,0.4)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    titleText(ctx, 'The castle is lit', W / 2, H * 0.19, 58, true);
    // the payoff, a line at a time
    const lines = [
      'The festival lanterns glow again, all the way down to Market Row.',
      'Wick made it, one drop of wax at a time.',
    ];
    if (meta.keepsakes > 0) {
      lines.push(meta.keepsakes === 1 ? 'And brought one keepsake home from the road.'
        : `And brought ${meta.keepsakes} keepsakes home from the road.`);
    }
    lines.forEach((line, i) => {
      ctx.globalAlpha = clamp((time - 0.4 - i * 1.1) / 0.8, 0, 1);
      ctx.font = `italic 19px ${SERIF}`;
      ctx.fillStyle = i === 2 ? '#ffd690' : '#fbe9c8';
      ctx.fillText(line, W / 2, H * 0.3 + i * 30);
    });
    ctx.globalAlpha = 1;
    const sy = H * 0.3 + lines.length * 30 + 26;
    ctx.font = `700 24px ${SANS}`;
    ctx.fillStyle = '#ffd690';
    ctx.fillText(`Time  ${fmtTime(stats.time)}     Deaths  ${stats.deaths}`, W / 2, sy);
    ctx.font = `16px ${SANS}`;
    ctx.fillStyle = 'rgba(251,233,200,0.8)';
    ctx.fillText(`Wax drips placed: ${stats.drips}`, W / 2, sy + 34);
    const a = 0.55 + 0.45 * Math.sin(time * 3);
    ctx.font = `700 20px ${SANS}`;
    const msg = device === 'touch' ? 'Tap to roll the credits' : 'Press any button to roll the credits';
    ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(28,13,42,0.85)';
    ctx.strokeText(msg, W / 2, H * 0.82);
    ctx.fillStyle = `rgba(255,214,140,${0.6 + 0.4 * a})`;
    ctx.fillText(msg, W / 2, H * 0.82);
    this.menuRects = [{ x: 0, y: 0, w: W, h: H }];
  },

  // ---------------------------------------------------------------- credits
  // returns false once the last line has scrolled off the top
  drawCredits(ctx, time, scroll, device) {
    drawBackground(ctx, { x: time * 12, y: 0, w: W, h: H }, END_WORLD, time);
    ctx.fillStyle = 'rgba(14,6,28,0.62)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let y = H + 30 - scroll;
    for (const [kind, text] of CREDITS) {
      const step = CREDIT_STEP[kind];
      if (y > -60 && y < H + 60 && text) {
        // fade near the top and bottom edges
        const a = Math.max(0, Math.min(1, Math.min(y / 70, (H - y) / 70)));
        ctx.globalAlpha = a;
        if (kind === 'h') titleText(ctx, text, W / 2, y, 44, true);
        else if (kind === 'r') { ctx.font = `700 15px ${SANS}`; ctx.fillStyle = '#e8a860'; ctx.fillText(text.toUpperCase(), W / 2, y); }
        else if (kind === 'n') { ctx.font = `700 28px ${SERIF}`; ctx.fillStyle = '#ffe2b0'; ctx.fillText(text, W / 2, y); }
        else if (kind === 'q') { ctx.font = `italic 22px ${SERIF}`; ctx.fillStyle = '#fbe9c8'; ctx.fillText(text, W / 2, y); }
        else { ctx.font = `15px ${SANS}`; ctx.fillStyle = 'rgba(251,233,200,0.75)'; ctx.fillText(text, W / 2, y); }
        ctx.globalAlpha = 1;
      }
      y += step;
    }
    // a small Wick watching the credits from the corner
    ctx.save();
    ctx.translate(W - 70, H - 26);
    ctx.scale(1.4, 1.4);
    TITLE_WICK.x = -TITLE_WICK.w / 2; TITLE_WICK.y = -TITLE_WICK.h;
    drawWick(ctx, TITLE_WICK, time);
    ctx.restore();
    ctx.font = `13px ${SANS}`;
    ctx.fillStyle = 'rgba(251,233,200,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText(device === 'touch' ? 'Tap to skip' : 'Press any button to skip', 16, H - 18);
    ctx.textAlign = 'center';
    this.menuRects = [{ x: 0, y: 0, w: W, h: H }];
    return y > -20;
  },

  // ---------------------------------------------------------------- level select
  drawSelect(ctx, time, levels, reached, sel, device, meta = null) {
    drawBackground(ctx, { x: time * 20, y: 0, w: W, h: H }, TITLE_WORLD, time);
    ctx.fillStyle = 'rgba(14,6,28,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    titleText(ctx, 'Choose a level', W / 2, 62, 42);
    const cols = this.SELECT_COLS, cw = 146, ch = 84, gap = 10;
    const rows = Math.ceil(levels.length / cols);
    const x0 = W / 2 - (cols * cw + (cols - 1) * gap) / 2, y0 = 108;
    // shrink a line's font until it fits the card
    const fit = (text, weight, size, family, y, cx) => {
      let px = size;
      do { ctx.font = `${weight} ${px}px ${family}`; } while (ctx.measureText(text).width > cw - 14 && --px > 8);
      ctx.fillText(text, cx + cw / 2, y);
    };
    this.menuRects = [];
    levels.forEach((L, i) => {
      const cx = x0 + (i % cols) * (cw + gap), cy = y0 + Math.floor(i / cols) * (ch + gap);
      const r = { x: cx, y: cy, w: cw, h: ch };
      this.menuRects.push(r);
      const open = reached.has(L.name), on = i === sel;
      ctx.fillStyle = on ? 'rgba(232,140,50,0.92)' : open ? 'rgba(50,26,70,0.9)' : 'rgba(30,16,40,0.75)';
      roundRect(ctx, cx, cy, cw, ch, 12); ctx.fill();
      ctx.strokeStyle = on ? '#ffe2a0' : open ? 'rgba(217,166,64,0.65)' : 'rgba(120,90,130,0.4)';
      ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `700 13px ${SANS}`;
      ctx.fillStyle = on ? '#2a1630' : open ? '#e8b03a' : 'rgba(200,180,200,0.45)';
      // with marks in the corner, the level number moves left to make room
      const m = open && meta && meta.marks[i];
      const hasMarks = m && (m.keepsake !== null || m.swift !== null || m.bright !== null);
      if (hasMarks) { ctx.textAlign = 'left'; ctx.fillText(`LEVEL ${i + 1}`, cx + 12, cy + 20); ctx.textAlign = 'center'; }
      else ctx.fillText(`LEVEL ${i + 1}`, cx + cw / 2, cy + 20);
      ctx.fillStyle = on ? '#2a1630' : open ? '#fbe9c8' : 'rgba(200,180,200,0.45)';
      fit(open ? L.name : 'Locked', 700, 17, SERIF, cy + 44, cx);
      ctx.fillStyle = on ? 'rgba(42,22,48,0.85)' : 'rgba(251,233,200,0.6)';
      if (open) fit(L.hint, 'italic', 12, SERIF, cy + 66, cx);
      if (hasMarks) {
        // keepsake / swift / bright, tucked into the top-right corner
        let mx = cx + cw - 15;
        for (const k of ['bright', 'swift', 'keepsake']) {
          if (m[k] === null) continue;
          drawMark(ctx, k, mx, cy + 19, 6.5, m[k], on ? '#2a1630' : '#1c0d2a');
          mx -= 16;
        }
      }
      if (!open) {
        // a little padlock
        ctx.strokeStyle = 'rgba(200,180,200,0.45)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx + cw / 2, cy + 64, 5, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = 'rgba(200,180,200,0.45)'; ctx.fillRect(cx + cw / 2 - 7, cy + 64, 14, 10);
      }
    });
    // back button
    const by = y0 + rows * (ch + gap) + 6;
    const back = { x: W / 2 - 80, y: by, w: 160, h: 36 };
    this.menuRects.push(back);
    ctx.fillStyle = 'rgba(50,26,70,0.9)'; roundRect(ctx, back.x, back.y, back.w, back.h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(217,166,64,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `600 16px ${SANS}`; ctx.fillStyle = '#fbe9c8';
    ctx.fillText(device === 'gamepad' ? '\u24b7 Back' : device === 'touch' ? 'Back' : 'Esc  Back', W / 2, by + 19);
    if (meta && (meta.kAll || meta.mAll)) {
      const parts = [];
      if (meta.kAll) parts.push(`keepsakes ${meta.kGot}/${meta.kAll}`);
      if (meta.mAll) parts.push(`medals ${meta.mGot}/${meta.mAll}`);
      ctx.font = `600 14px ${SANS}`; ctx.fillStyle = 'rgba(251,233,200,0.75)';
      ctx.fillText(parts.join('  ·  '), W / 2, by + 60);
    }
  },

  // ---------------------------------------------------------------- level complete card
  // the card's Retry button (touch) in view coordinates, or null; set by drawCompleteCard
  retryRect: null,

  drawCompleteCard(ctx, world, index, stats, shown, left, res = null, device = 'keyboard') {
    this.retryRect = null;
    const a = clamp(Math.min((shown - 0.5) / 0.35, (left + 0.3) / 0.4), 0, 1);
    if (a <= 0) return;
    const rise = (1 - Math.min(1, (shown - 0.5) / 0.35)) * 24;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, rise);
    const marks = res ? ['keepsake', 'swift', 'bright'].filter((k) => res[k] !== null) : [];
    const foot = 34;   // the retry / continue hint along the bottom
    const w = marks.length ? 420 : 380, h = (marks.length ? 212 : 170) + foot, x = W / 2 - w / 2, y = H * (marks.length ? 0.25 : 0.28);
    ctx.fillStyle = 'rgba(28,12,40,0.9)'; roundRect(ctx, x, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = '#d9a640'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 14px ${SANS}`; ctx.fillStyle = '#e8b03a';
    ctx.fillText(`LEVEL ${index + 1} LIT`, W / 2, y + 26);
    if (res && res.gentle) drawGentleTag(ctx, x + w - 18, y + 16);
    titleText(ctx, world.name, W / 2, y + 60, 32);
    const best = (res && res.best) || {};
    const col = (cx, label, value, isBest) => {
      ctx.font = `600 12px ${SANS}`; ctx.fillStyle = 'rgba(251,233,200,0.65)';
      ctx.fillText(label, cx, y + 104);
      ctx.font = `700 22px ${SANS}`; ctx.fillStyle = '#ffd690';
      ctx.fillText(value, cx, y + 130);
      if (isBest) {
        ctx.font = `800 10px ${SANS}`;
        ctx.fillStyle = `rgba(255,236,170,${0.75 + 0.25 * Math.sin(shown * 6)})`;
        ctx.fillText('NEW BEST', cx, y + 151);
      }
    };
    col(W / 2 - 130, 'TIME', fmtTime(stats.time), best.time);
    col(W / 2, 'WAX LEFT', `${Math.round(stats.wax)}%`, best.wax);
    col(W / 2 + 130, 'DEATHS', String(stats.deaths), best.deaths);
    if (marks.length) {
      // keepsake found/missed, and the par medals for this run
      ctx.strokeStyle = 'rgba(217,166,64,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 24, y + 166); ctx.lineTo(x + w - 24, y + 166); ctx.stroke();
      const par = res.par || {};
      const label = {
        keepsake: res.keepsake ? 'Keepsake found' : 'Keepsake missed',
        swift: res.gentle ? 'Swift' : `Swift  ≤${fmtTime(par.time || 0)}`,
        bright: res.gentle ? 'Bright' : `Bright  ≥${par.wax}%`,
      };
      const slot = w / marks.length;
      marks.forEach((k, i) => {
        const sx = x + slot * (i + 0.5);
        ctx.font = `600 13px ${SANS}`;
        const tw = ctx.measureText(label[k]).width;
        const ix = sx - (tw + 24) / 2 + 9;
        drawMark(ctx, k, ix, y + 189, 9, res[k]);
        ctx.textAlign = 'left';
        ctx.fillStyle = res[k] ? '#ffe2a0' : 'rgba(251,233,200,0.5)';
        ctx.fillText(label[k], ix + 15, y + 190);
        ctx.textAlign = 'center';
      });
    }
    // retry for medals, or carry on
    const fy = y + h - foot / 2 - 4;
    ctx.strokeStyle = 'rgba(217,166,64,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 24, fy - foot / 2 + 2); ctx.lineTo(x + w - 24, fy - foot / 2 + 2); ctx.stroke();
    if (device === 'touch') {
      const bw = 104, bh = 26, bx = W / 2 - 128, by = fy - bh / 2;
      ctx.fillStyle = 'rgba(232,140,50,0.9)'; roundRect(ctx, bx, by, bw, bh, 13); ctx.fill();
      ctx.strokeStyle = '#ffe2a0'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = `700 14px ${SANS}`; ctx.fillStyle = '#2a1630';
      ctx.fillText('↻ Retry', bx + bw / 2, fy + 1);
      ctx.textAlign = 'left';
      ctx.font = `600 13px ${SANS}`; ctx.fillStyle = 'rgba(251,233,200,0.7)';
      ctx.fillText('tap elsewhere to continue', bx + bw + 14, fy + 1);
      ctx.textAlign = 'center';
      // a finger-sized hit area, in view coordinates (the card has stopped rising by now)
      this.retryRect = { x: bx - 10, y: by + rise - 10, w: bw + 20, h: bh + 20 };
    } else {
      const g = this.glyphs(device);
      const cont = device === 'gamepad' ? `${g.jump} continue` : 'any key continue';
      ctx.font = `600 13px ${SANS}`; ctx.fillStyle = 'rgba(251,233,200,0.7)';
      ctx.fillText(`${g.restart} retry  ·  ${cont}`, W / 2, fy + 1);
    }
    ctx.restore();
  },

  // the adaptive-help bubble: sign styling, top centre under the toasts, {glyph} tokens in amber
  drawTip(ctx, tip, glyphs) {
    const a = clamp(Math.min(tip.t / 0.4, (tip.life - tip.t) / 0.6), 0, 1);
    if (a <= 0) return;
    const segs = [{ text: 'Tip  ', tag: true }];
    const re = /\{(\w+)\}/g;
    let last = 0, m;
    while ((m = re.exec(tip.text))) {
      if (m.index > last) segs.push({ text: tip.text.slice(last, m.index) });
      segs.push({ text: glyphs[m[1]] || m[1], key: true });
      last = m.index + m[0].length;
    }
    if (last < tip.text.length) segs.push({ text: tip.text.slice(last) });
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const font = (seg) => (seg.tag ? `800 13px ${SANS}` : `600 16px ${SANS}`);
    let tw = 0;
    for (const seg of segs) { ctx.font = font(seg); seg.w = ctx.measureText(seg.text).width; tw += seg.w; }
    const bw = tw + 32, bh = 38, bx = W / 2 - bw / 2, by = 104 + (1 - Math.min(1, tip.t / 0.4)) * -8;
    ctx.fillStyle = 'rgba(32,16,46,0.92)';
    roundRect(ctx, bx, by, bw, bh, 10); ctx.fill();
    ctx.strokeStyle = '#d9a640'; ctx.lineWidth = 2; ctx.stroke();
    let x = bx + 16;
    for (const seg of segs) {
      ctx.font = font(seg);
      ctx.fillStyle = seg.tag ? '#e8b03a' : seg.key ? '#ffc850' : '#fbe9c8';
      ctx.fillText(seg.text, x, by + bh / 2 + 1);
      x += seg.w;
    }
    ctx.restore();
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

const STORY_LINES = [
  'Every year the castle torch lights the whole town.',
  'Tonight it has gone out, and the town is dark.',
  'So one small candle sets off to light it again.',
];

const TITLE_WORLD = { ambient: 0.78, pxH: H, data: {}, goal: null };
const END_WORLD = { ambient: 0.9, pxH: H, data: { finale: true }, goal: { lit: true } };
const TITLE_WICK = {
  w: CFG.BODY_W, h: 44, x: 0, y: 0, vx: 0, vy: 0, windVx: 0, facing: 1, onGround: true, alive: true,
  wetTime: 0, flicker: 0, squash: 0, waxFrac: () => 0.85,
};

const smooth = (k) => k * k * (3 - 2 * k);

// m:ss.cc for the speedrun timer
export function fmtClock(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), cs = Math.floor((s * 100) % 100);
  return `${m}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// a small green leaf and "gentle", right-aligned at (x, y): this run used gentle wax
function drawGentleTag(ctx, x, y) {
  ctx.save();
  ctx.font = `700 11px ${SANS}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText('gentle').width;
  const bw = tw + 30, bx = x - bw;
  ctx.fillStyle = 'rgba(70,110,60,0.85)';
  roundRect(ctx, bx, y - 10, bw, 20, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(190,230,160,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
  // leaf
  const lx = bx + 11, ly = y;
  ctx.fillStyle = '#bfe3a0';
  ctx.beginPath();
  ctx.moveTo(lx - 5, ly + 4);
  ctx.quadraticCurveTo(lx - 5, ly - 5, lx + 5, ly - 5);
  ctx.quadraticCurveTo(lx + 5, ly + 4, lx - 5, ly + 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,70,35,0.9)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(lx - 5, ly + 4); ctx.lineTo(lx + 2, ly - 2); ctx.stroke();
  ctx.fillStyle = '#e6f5d6';
  ctx.fillText('gentle', x - 8, y + 0.5);
  ctx.restore();
}

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

// The three per-level marks, as little round badges: keepsake (paper lantern), swift (clock),
// bright (flame). `on` fills them gold; off is a faint outline.
export function drawMark(ctx, kind, x, y, r, on, ink = '#1c0d2a') {
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = on ? '#ffc65a' : 'rgba(28,13,42,0.55)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.18);
  ctx.strokeStyle = on ? ink : 'rgba(251,233,200,0.45)';
  ctx.stroke();
  const fg = on ? ink : 'rgba(251,233,200,0.5)';
  ctx.fillStyle = fg; ctx.strokeStyle = fg;
  const k = r * 0.62;
  ctx.beginPath();
  if (kind === 'keepsake') {
    // a tiny paper lantern, like the one in the level
    ctx.lineWidth = Math.max(1, r * 0.13);
    ctx.ellipse(x, y + k * 0.05, k * 0.7, k * 0.78, 0, 0, Math.PI * 2);
    if (on) { ctx.fillStyle = '#e0587a'; ctx.fill(); }
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.fillRect(x - k * 0.4, y - k * 0.98, k * 0.8, k * 0.28);
    ctx.fillRect(x - k * 0.32, y + k * 0.78, k * 0.64, k * 0.24);
  } else if (kind === 'swift') {
    ctx.lineWidth = Math.max(1, r * 0.15);
    ctx.arc(x, y, k, 0, Math.PI * 2);
    ctx.moveTo(x, y); ctx.lineTo(x, y - k * 0.7);
    ctx.moveTo(x, y); ctx.lineTo(x + k * 0.55, y + k * 0.2);
    ctx.stroke();
  } else {
    ctx.moveTo(x, y - k * 1.05);
    ctx.bezierCurveTo(x + k * 0.9, y - k * 0.1, x + k * 0.75, y + k * 0.85, x, y + k * 0.85);
    ctx.bezierCurveTo(x - k * 0.75, y + k * 0.85, x - k * 0.9, y - k * 0.1, x, y - k * 1.05);
    ctx.closePath();
    on ? ctx.fill() : (ctx.lineWidth = Math.max(1, r * 0.15), ctx.stroke());
  }
  ctx.restore();
}
