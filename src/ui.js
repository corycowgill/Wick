// HUD candle meter, level card, menus, title and end screens, toasts.
import { CFG, clamp, lerp } from './config.js';
import { drawFlame, drawWick, wickMood } from './render/draw-wick.js';
import { drawBackground, THEMES, themeOf } from './render/draw-world.js';
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
    // a soft dark plate, so the candle and keepsake never collide with the world behind them
    {
      const px = opts.keepsake != null ? x + 22 : x, py = base - 26;
      const pg = ctx.createRadialGradient(px, py, 0, px, py, 92);
      pg.addColorStop(0, 'rgba(14,6,28,0.62)'); pg.addColorStop(0.55, 'rgba(14,6,28,0.4)'); pg.addColorStop(1, 'rgba(14,6,28,0)');
      ctx.fillStyle = pg; ctx.fillRect(px - 92, py - 92, 184, 184);
    }
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
      const kx = 88, ky = base - 10, r = 14 * (1 + 0.6 * Math.sin(pop * Math.PI) * pop);
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
      const cut = opts.toggles && opts.toggles[i] ? label.lastIndexOf(': ') : -1;
      if (cut < 0) { ctx.fillText(label, cx, y + 1); return; }
      // a setting: name on the left, ◀ value ▶ in a pill on the right
      const name = label.slice(0, cut), value = label.slice(cut + 2);
      ctx.textAlign = 'left';
      ctx.fillText(name, r.x + 18, y + 1);
      ctx.font = `700 16px ${SANS}`;
      const vw = Math.max(64, ctx.measureText(value).width + 22), vx = r.x + r.w - 40 - vw, on = value === 'On';
      ctx.fillStyle = sel ? 'rgba(42,22,48,0.85)' : on ? 'rgba(232,140,50,0.32)' : 'rgba(14,6,28,0.55)';
      roundRect(ctx, vx, y - 13, vw, 26, 13); ctx.fill();
      ctx.strokeStyle = sel ? 'rgba(42,22,48,0.9)' : 'rgba(217,166,64,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = sel ? '#ffd690' : on ? '#ffd690' : '#fbe9c8';
      ctx.fillText(value, vx + vw / 2, y + 1);
      ctx.font = `700 12px ${SANS}`;
      ctx.fillStyle = sel ? '#2a1630' : 'rgba(251,233,200,0.55)';
      ctx.fillText('◀', vx - 12, y + 1);
      ctx.fillText('▶', vx + vw + 12, y + 1);
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
    const glow = ctx.createRadialGradient(wx, H * 0.6, 10, wx, H * 0.6, 260);
    glow.addColorStop(0, 'rgba(255,170,80,0.35)'); glow.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3c2140';
    // the ledge sits low enough that the flame's tip clears the tagline
    const ly = H * 0.78;
    ctx.beginPath(); ctx.ellipse(wx, ly + 6, 104, 13, 0, 0, Math.PI * 2); ctx.fill();
    TITLE_WICK.squash = Math.sin(time * 2) * 0.03;
    ctx.save();
    ctx.translate(wx, ly + bob * 0.2);
    ctx.scale(3.2, 3.2);
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
      ctx.fillText(prompt, W / 2, H * 0.9);
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
  // `time` is the global clock; `meta.since` is seconds since the end screen opened, and
  // `meta.fx(ctx)` draws the fireworks over the sky
  drawEnd(ctx, time, stats, device, meta = {}) {
    const since = meta.since ?? time;
    drawBackground(ctx, { x: time * 10, y: 0, w: W, h: H }, END_WORLD, time);
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.5);
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.45, W * 0.7);
    g.addColorStop(0, `rgba(255,180,90,${0.3 + pulse * 0.08})`); g.addColorStop(1, 'rgba(60,20,60,0.4)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (meta.fx) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; meta.fx(ctx); ctx.restore(); }

    // the town, its windows lighting up row by row from the street to the rooftops
    drawEndTown(ctx, since);

    // the castle torch Wick lit, blazing on its plinth, with Wick beside it
    const bx = W - 150, bgY = H - 40;
    const blaze = clamp(since / 0.8, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flick = 1 + Math.sin(time * 9) * 0.05 + Math.sin(time * 23) * 0.04;
    const lg = ctx.createRadialGradient(bx, bgY - 120, 0, bx, bgY - 120, 230 * flick);
    lg.addColorStop(0, `rgba(255,170,80,${0.5 * blaze})`); lg.addColorStop(1, 'rgba(255,110,50,0)');
    ctx.fillStyle = lg; ctx.fillRect(bx - 240, bgY - 360, 480, 480);
    ctx.restore();
    ctx.fillStyle = '#2c1a2e';
    ctx.beginPath(); ctx.ellipse(bx - 40, bgY + 6, 150, 16, 0, 0, Math.PI * 2); ctx.fill();
    // plinth, bowl and flame
    ctx.strokeStyle = '#1c0d2a'; ctx.lineWidth = 2.5;
    ctx.fillStyle = '#7c6272'; roundRect(ctx, bx - 20, bgY - 82, 40, 84, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5c4454'; ctx.fillRect(bx - 18, bgY - 80, 9, 80);
    ctx.fillStyle = '#c0485a'; ctx.fillRect(bx - 6, bgY - 66, 12, 36);
    ctx.fillStyle = '#886c7c'; roundRect(ctx, bx - 28, bgY - 92, 56, 12, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a2a36';
    ctx.beginPath(); ctx.moveTo(bx - 36, bgY - 106); ctx.lineTo(bx + 36, bgY - 106); ctx.lineTo(bx + 24, bgY - 92); ctx.lineTo(bx - 24, bgY - 92); ctx.closePath(); ctx.fill(); ctx.stroke();
    drawFlame(ctx, bx, bgY - 104, (16 + 8 * blaze) * flick, Math.sin(time * 1.7) * 0.12, time);
    // Wick, beaming
    wickMood('joy', 0.25);
    ctx.save();
    ctx.translate(bx - 88, bgY + Math.abs(Math.sin(time * 3)) * -3);
    ctx.scale(2.2, 2.2);
    END_WICK.x = -END_WICK.w / 2; END_WICK.y = -END_WICK.h; END_WICK.squash = Math.sin(time * 6) * 0.04;
    drawWick(ctx, END_WICK, time);
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    titleText(ctx, 'The castle is lit', W / 2, H * 0.17, 58, true);
    // the payoff, a line at a time
    const lines = [
      'The festival lanterns glow again, all the way down to Market Row.',
      'Wick made it, one drop of wax at a time.',
    ];
    if (meta.keepsakes > 0) {
      lines.push(meta.keepsakes === 1 ? 'And brought one keepsake home from the road.'
        : `And brought ${meta.keepsakes} keepsakes home from the road.`);
    }
    ctx.lineJoin = 'round';
    lines.forEach((line, i) => {
      ctx.globalAlpha = clamp((since - 0.4 - i * 1.1) / 0.8, 0, 1);
      ctx.font = `italic 19px ${SERIF}`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(28,13,42,0.55)';
      ctx.strokeText(line, W / 2, H * 0.28 + i * 30);
      ctx.fillStyle = i === 2 ? '#ffd690' : '#fbe9c8';
      ctx.fillText(line, W / 2, H * 0.28 + i * 30);
    });
    ctx.globalAlpha = 1;
    const sy = H * 0.28 + lines.length * 30 + 22;
    ctx.font = `700 24px ${SANS}`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(28,13,42,0.6)';
    const st = `Time  ${fmtTime(stats.time)}     Deaths  ${stats.deaths}`;
    ctx.strokeText(st, W / 2, sy);
    ctx.fillStyle = '#ffd690';
    ctx.fillText(st, W / 2, sy);
    ctx.font = `16px ${SANS}`;
    ctx.fillStyle = 'rgba(251,233,200,0.85)';
    ctx.fillText(`Wax drips placed: ${stats.drips}`, W / 2, sy + 32);
    const a = 0.55 + 0.45 * Math.sin(time * 3);
    ctx.font = `700 20px ${SANS}`;
    const msg = device === 'touch' ? 'Tap to roll the credits' : 'Press any button to roll the credits';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(28,13,42,0.85)';
    ctx.strokeText(msg, W / 2, H * 0.63);
    ctx.fillStyle = `rgba(255,214,140,${0.6 + 0.4 * a})`;
    ctx.fillText(msg, W / 2, H * 0.63);
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
    const cols = this.SELECT_COLS, cw = 146, ch = 88, gap = 9;
    const rows = Math.ceil(levels.length / cols);
    const x0 = W / 2 - (cols * cw + (cols - 1) * gap) / 2, y0 = 100;
    // one type size for every card: the largest at which all the names fit
    let nameSize = 17;
    for (; nameSize > 12; nameSize--) {
      ctx.font = `700 ${nameSize}px ${SERIF}`;
      if (levels.every((L) => ctx.measureText(L.name).width <= cw - 16)) break;
    }
    const HINT = `italic 12px ${SERIF}`;
    // hints wrap onto a second line instead of shrinking
    const wrap = (text) => {
      ctx.font = HINT;
      if (ctx.measureText(text).width <= cw - 16) return [text];
      const words = text.split(' ');
      let a = '';
      for (let k = 0; k < words.length; k++) {
        const next = a ? `${a} ${words[k]}` : words[k];
        if (a && ctx.measureText(next).width > cw - 16) return [a, words.slice(k).join(' ')];
        a = next;
      }
      return [a];
    };
    this.menuRects = [];
    levels.forEach((L, i) => {
      const cx = x0 + (i % cols) * (cw + gap), cy = y0 + Math.floor(i / cols) * (ch + gap);
      const r = { x: cx, y: cy, w: cw, h: ch };
      this.menuRects.push(r);
      const open = reached.has(L.name), on = i === sel;
      ctx.fillStyle = on ? 'rgba(232,140,50,0.92)' : open ? 'rgba(50,26,70,0.9)' : 'rgba(30,16,40,0.75)';
      roundRect(ctx, cx, cy, cw, ch, 12); ctx.fill();
      const th = themeOf({ data: L });   // scene palettes (Firebreak, Gale Locks) included
      if (open && !on && th) {
        // the level's own sky, washed across the top of the card
        ctx.save();
        roundRect(ctx, cx, cy, cw, ch, 12); ctx.clip();
        const sg = ctx.createLinearGradient(0, cy, 0, cy + ch);
        sg.addColorStop(0, th.sky[2]); sg.addColorStop(0.5, th.sky[1]); sg.addColorStop(1, th.sky[0]);
        ctx.globalAlpha = 0.5; ctx.fillStyle = sg; ctx.fillRect(cx, cy, cw, ch);
        ctx.globalAlpha = 0.55; ctx.fillStyle = 'rgba(30,14,44,1)'; ctx.fillRect(cx, cy + 30, cw, ch - 30);
        ctx.restore();
        // and a chip of its warm light by the level number
        ctx.fillStyle = th.sky[3];
        ctx.beginPath(); ctx.arc(cx + 15, cy + 18, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(28,13,42,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      roundRect(ctx, cx, cy, cw, ch, 12);
      ctx.strokeStyle = on ? '#ffe2a0' : open ? 'rgba(217,166,64,0.65)' : 'rgba(120,90,130,0.4)';
      ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `700 13px ${SANS}`;
      ctx.fillStyle = on ? '#2a1630' : open ? '#e8b03a' : 'rgba(200,180,200,0.45)';
      // with marks in the corner, the level number moves left to make room
      const m = open && meta && meta.marks[i];
      const hasMarks = m && (m.keepsake !== null || m.swift !== null || m.bright !== null);
      const chip = open && !on && th ? 10 : 0;
      if (hasMarks) { ctx.textAlign = 'left'; ctx.fillText(`LEVEL ${i + 1}`, cx + 10 + chip, cy + 19); ctx.textAlign = 'center'; }
      else ctx.fillText(`LEVEL ${i + 1}`, cx + cw / 2, cy + 19);
      ctx.fillStyle = on ? '#2a1630' : open ? '#fbe9c8' : 'rgba(200,180,200,0.45)';
      const hint = open ? wrap(L.hint) : null;
      ctx.font = `700 ${nameSize}px ${SERIF}`;
      if (open) {
        const ny = hint.length > 1 ? cy + 42 : cy + 46;
        ctx.fillText(L.name, cx + cw / 2, ny);
        ctx.font = HINT;
        ctx.fillStyle = on ? 'rgba(42,22,48,0.85)' : 'rgba(251,233,200,0.7)';
        hint.forEach((line, k) => ctx.fillText(line, cx + cw / 2, ny + 22 + k * 14));
      } else ctx.fillText('Locked', cx + cw / 2, cy + 44);
      if (hasMarks) {
        // keepsake / swift / bright, tucked into the top-right corner
        let mx = cx + cw - 15;
        for (const k of ['bright', 'swift', 'keepsake']) {
          if (m[k] === null) continue;
          drawMark(ctx, k, mx, cy + 18, 8.5, m[k], on ? '#2a1630' : '#1c0d2a');
          mx -= 19;
        }
      }
      if (!open) {
        // a little padlock
        ctx.strokeStyle = 'rgba(200,180,200,0.45)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx + cw / 2, cy + 66, 5, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = 'rgba(200,180,200,0.45)'; ctx.fillRect(cx + cw / 2 - 7, cy + 66, 14, 10);
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

  // `focusX` is the lit goal's screen x: the card slides in on the other side, so the
  // goal and the happy Wick beside it stay in view
  drawCompleteCard(ctx, world, index, stats, shown, left, res = null, device = 'keyboard', focusX = null) {
    this.retryRect = null;
    const a = clamp(Math.min((shown - 0.5) / 0.35, (left + 0.3) / 0.4), 0, 1);
    if (a <= 0) return;
    const marks = res ? ['keepsake', 'swift', 'bright'].filter((k) => res[k] !== null) : [];
    const foot = 34;   // the retry / continue hint along the bottom
    const w = marks.length ? 420 : 380, h = (marks.length ? 212 : 170) + foot;
    const side = focusX == null ? 0 : focusX > W / 2 ? -1 : 1;
    const x = side < 0 ? 34 : side > 0 ? W - 34 - w : W / 2 - w / 2, y = Math.round(H * 0.46 - h / 2);
    const k = smooth(Math.min(1, (shown - 0.5) / 0.35));
    const slide = side ? (1 - k) * 60 * side : 0, rise = side ? 0 : (1 - k) * 24;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(slide + x + w / 2 - W / 2, rise);
    // everything below is laid out around the card's centre line
    const mid = W / 2, x0 = W / 2 - w / 2;
    ctx.fillStyle = 'rgba(28,12,40,0.9)'; roundRect(ctx, x0, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = '#d9a640'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 14px ${SANS}`; ctx.fillStyle = '#e8b03a';
    ctx.fillText(`LEVEL ${index + 1} LIT`, W / 2, y + 26);
    if (res && res.gentle) drawGentleTag(ctx, x0 + w - 18, y + 16);
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
      ctx.beginPath(); ctx.moveTo(x0 + 24, y + 166); ctx.lineTo(x0 + w - 24, y + 166); ctx.stroke();
      const par = res.par || {};
      const label = {
        keepsake: res.keepsake ? 'Keepsake found' : 'Keepsake missed',
        swift: res.gentle ? 'Swift' : `Swift  ≤${fmtTime(par.time || 0)}`,
        bright: res.gentle ? 'Bright' : `Bright  ≥${par.wax}%`,
      };
      // measure each mark (badge + gap + label), then spread them inside real insets
      const inset = 26, inner = w - inset * 2, badge = 18, pad = 7;
      let px = 13, widths;
      for (;; px--) {
        ctx.font = `600 ${px}px ${SANS}`;
        widths = marks.map((m) => badge + pad + ctx.measureText(label[m]).width);
        if (widths.reduce((s, v) => s + v, 0) + 14 * (marks.length - 1) <= inner || px <= 10) break;
      }
      const total = widths.reduce((s, v) => s + v, 0);
      const spread = marks.length > 1 ? (inner - total) / (marks.length - 1) : 0;
      let ix = marks.length > 1 ? x0 + inset : mid - total / 2;
      marks.forEach((k, i) => {
        drawMark(ctx, k, ix + badge / 2, y + 189, 9, res[k]);
        ctx.textAlign = 'left';
        ctx.font = `600 ${px}px ${SANS}`;
        ctx.fillStyle = res[k] ? '#ffe2a0' : 'rgba(251,233,200,0.5)';
        ctx.fillText(label[k], ix + badge + pad, y + 190);
        ctx.textAlign = 'center';
        ix += widths[i] + spread;
      });
    }
    // retry for medals, or carry on
    const fy = y + h - foot / 2 - 4;
    ctx.strokeStyle = 'rgba(217,166,64,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 + 24, fy - foot / 2 + 2); ctx.lineTo(x0 + w - 24, fy - foot / 2 + 2); ctx.stroke();
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
      // a finger-sized hit area, in view coordinates (the card has stopped moving by now)
      const ox = slide + x - x0;
      this.retryRect = { x: bx + ox - 10, y: by + rise - 10, w: bw + 20, h: bh + 20 };
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
const END_WORLD = { ambient: 0.9, pxH: H, data: { finale: true }, goal: { lit: true, litTime: 99 } };
const TITLE_WICK = {
  w: CFG.BODY_W, h: 44, x: 0, y: 0, vx: 0, vy: 0, windVx: 0, facing: 1, onGround: true, alive: true,
  wetTime: 0, flicker: 0, squash: 0, waxFrac: () => 0.85,
};

const smooth = (k) => k * k * (3 - 2 * k);
const END_WICK = { ...TITLE_WICK, riding: true, waxFrac: () => 0.6 };   // riding: never dozes off

// The end screen's town: a row of house fronts across the bottom, built once. Each window
// lights at its own moment, row by row from the street up, a little later further from the torch.
let endTown = null;
function buildEndTown() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const houses = [];
  for (let x = -10; x < W - 250;) {
    const w = 70 + rnd() * 50, h = 70 + rnd() * 80;
    const cols = w > 100 ? 3 : 2, rows = Math.max(1, Math.floor((h - 26) / 30));
    const wins = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rnd() < 0.12) continue;
      wins.push({ x: x + (w / cols) * (c + 0.5), y: H - 22 - r * 30, at: 0.8 + r * 0.7 + (1 - x / W) * 0.6 + rnd() * 0.3 });
    }
    houses.push({ x, w, h, roof: rnd() < 0.6, wins });
    x += w + 4 + rnd() * 10;
  }
  return houses;
}
function drawEndTown(ctx, since) {
  if (!endTown) endTown = buildEndTown();
  for (const hs of endTown) {
    ctx.fillStyle = '#24132c';
    ctx.fillRect(hs.x, H - hs.h, hs.w, hs.h);
    if (hs.roof) {
      ctx.beginPath(); ctx.moveTo(hs.x - 6, H - hs.h); ctx.lineTo(hs.x + hs.w / 2, H - hs.h - 26); ctx.lineTo(hs.x + hs.w + 6, H - hs.h); ctx.closePath(); ctx.fill();
    } else ctx.fillRect(hs.x - 3, H - hs.h - 5, hs.w + 6, 6);
  }
  ctx.save();
  for (const hs of endTown) for (const wn of hs.wins) {
    const k = clamp((since - wn.at) / 0.35, 0, 1);
    ctx.fillStyle = k > 0 ? `rgb(${lerp(58, 255, k) | 0},${lerp(36, 200, k) | 0},${lerp(60, 100, k) | 0})` : '#3a2440';
    ctx.fillRect(wn.x - 6, wn.y - 16, 12, 16);
    ctx.fillStyle = '#24132c'; ctx.fillRect(wn.x - 0.75, wn.y - 16, 1.5, 16);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const hs of endTown) for (const wn of hs.wins) {
    const k = clamp((since - wn.at) / 0.35, 0, 1);
    if (k <= 0) continue;
    const pop = 1 + Math.max(0, 1 - (since - wn.at) / 0.5) * 0.8;
    const gg = ctx.createRadialGradient(wn.x, wn.y - 8, 0, wn.x, wn.y - 8, 22 * pop);
    gg.addColorStop(0, `rgba(255,180,90,${0.3 * k})`); gg.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = gg; ctx.fillRect(wn.x - 30, wn.y - 38, 60, 60);
  }
  ctx.restore();
}

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
