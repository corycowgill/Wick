// iPhone touch controls: a floating analog thumb pad for movement plus buttons,
// all DOM overlays driven by Pointer Events.
// Fully multi-touch; each pointer is captured by the control it pressed and
// releasing (or cancelling) that pointer anywhere releases the control.
const NAMES = ['left', 'right', 'jump', 'drip', 'absorb', 'pause'];
export const STICK_RADIUS = 56;     // CSS px of thumb travel for full speed
export const STICK_DEADZONE = 0.18;

export class TouchState {
  constructor() {
    this.pointers = new Map();   // pointerId -> control name
    this.held = {};
    this.pressed = {};
    for (const n of NAMES) this.held[n] = false;
    this.stick = null;            // { id, ox, oy, dx, dy } while a thumb is on the pad
    this.moveX = 0;               // analog -1..1 from the pad
    this.onChange = null;
  }
  // --- thumb pad: origin where the thumb lands, knob follows it ---
  stickDown(id, x, y) {
    this.stick = { id, ox: x, oy: y, dx: 0, dy: 0 };
    this.stickUpdate();
  }
  stickMove(id, x, y) {
    if (!this.stick || this.stick.id !== id) return;
    let dx = x - this.stick.ox, dy = y - this.stick.oy;
    const d = Math.hypot(dx, dy);
    // drag the origin along if the thumb wanders past the rim, so it never feels stuck
    if (d > STICK_RADIUS * 1.4) {
      const k = (d - STICK_RADIUS * 1.4) / d;
      this.stick.ox += dx * k; this.stick.oy += dy * k;
      dx = x - this.stick.ox; dy = y - this.stick.oy;
    }
    this.stick.dx = dx; this.stick.dy = dy;
    this.stickUpdate();
  }
  stickUp(id) {
    if (!this.stick || this.stick.id !== id) return;
    this.stick = null;
    this.stickUpdate();
  }
  stickUpdate() {
    const wasL = this.held.left, wasR = this.held.right;
    let v = 0;
    if (this.stick) {
      const n = Math.max(-1, Math.min(1, this.stick.dx / STICK_RADIUS));
      const a = Math.abs(n);
      v = a < STICK_DEADZONE ? 0 : Math.sign(n) * Math.min(1, (a - STICK_DEADZONE) / (1 - STICK_DEADZONE) * 1.15);
    }
    this.moveX = v;
    this.recompute();
    if (this.held.left && !wasL) this.pressed.left = true;
    if (this.held.right && !wasR) this.pressed.right = true;
  }
  down(id, name) {
    this.pointers.set(id, name);
    if (!this.held[name]) this.pressed[name] = true;
    this.recompute();
  }
  move(id, name) {
    if (!this.pointers.has(id) || this.pointers.get(id) === name) return;
    this.pointers.set(id, name);
    if (!this.held[name]) this.pressed[name] = true;
    this.recompute();
  }
  up(id) {
    if (!this.pointers.delete(id)) return;
    this.recompute();
  }
  releaseAll() {
    this.pointers.clear();
    this.stick = null;
    this.moveX = 0;
    this.recompute();
  }
  recompute() {
    for (const n of NAMES) this.held[n] = false;
    for (const n of this.pointers.values()) this.held[n] = true;
    if (this.moveX < -0.3) this.held.left = true;
    if (this.moveX > 0.3) this.held.right = true;
    if (this.onChange) this.onChange(this.held);
  }
  consume() { this.pressed = {}; }
}

// Wire one element to the shared state. `pick(e)` names the control for an event.
export function bindControl(el, state, pick) {
  const name = typeof pick === 'function' ? pick : () => pick;
  el.addEventListener('pointerdown', (e) => {
    if (e.preventDefault) e.preventDefault();
    try { if (el.setPointerCapture) el.setPointerCapture(e.pointerId); } catch { /* capture can fail on fast taps */ }
    state.down(e.pointerId, name(e));
  });
  el.addEventListener('pointermove', (e) => {
    if (state.pointers.has(e.pointerId)) state.move(e.pointerId, name(e));
  });
  const release = (e) => state.up(e.pointerId);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
}

// Wire the floating thumb pad zone.
export function bindStick(zone, state) {
  zone.addEventListener('pointerdown', (e) => {
    if (e.preventDefault) e.preventDefault();
    if (state.stick) return;              // one thumb steers
    try { if (zone.setPointerCapture) zone.setPointerCapture(e.pointerId); } catch { /* fast taps */ }
    state.stickDown(e.pointerId, e.clientX, e.clientY);
  });
  zone.addEventListener('pointermove', (e) => state.stickMove(e.pointerId, e.clientX, e.clientY));
  const up = (e) => state.stickUp(e.pointerId);
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);
  zone.addEventListener('lostpointercapture', up);
}

export class TouchControls {
  constructor(doc = document, parent = document.body) {
    this.state = new TouchState();
    this.visible = false;
    const root = doc.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="tc-zone"></div>
      <div id="tc-pad"><div id="tc-ring"></div><div id="tc-knob"></div><span class="arrow l">&#9664;</span><span class="arrow r">&#9654;</span></div>
      <div class="tc round" id="tc-jump">JUMP</div>
      <div class="tc round" id="tc-drip">DRIP</div>
      <div class="tc round small" id="tc-absorb">SOAK</div>
      <div class="tc round tiny" id="tc-pause">&#10073;&#10073;</div>`;
    parent.appendChild(root);
    this.root = root;
    const $ = (id) => root.querySelector(id);
    const zone = $('#tc-zone'), pad = $('#tc-pad'), knob = $('#tc-knob');
    bindStick(zone, this.state);
    bindControl($('#tc-jump'), this.state, 'jump');
    bindControl($('#tc-drip'), this.state, 'drip');
    bindControl($('#tc-absorb'), this.state, 'absorb');
    bindControl($('#tc-pause'), this.state, 'pause');
    const els = { jump: $('#tc-jump'), drip: $('#tc-drip'), absorb: $('#tc-absorb'), pause: $('#tc-pause') };
    this.state.onChange = (held) => {
      for (const [k, el] of Object.entries(els)) el.classList.toggle('down', held[k]);
      // the pad jumps under the thumb, the knob follows it (clamped to the rim)
      const st = this.state.stick;
      pad.classList.toggle('down', !!st);
      if (st) {
        const zr = root.getBoundingClientRect();
        pad.style.left = `${st.ox - zr.left}px`;
        pad.style.top = `${st.oy - zr.top}px`;
        pad.style.bottom = 'auto';
        const d = Math.hypot(st.dx, st.dy), max = STICK_RADIUS;
        const k = d > max ? max / d : 1;
        knob.style.transform = `translate(${st.dx * k}px, ${st.dy * k}px)`;
      } else {
        pad.style.left = pad.style.top = pad.style.bottom = '';
        knob.style.transform = '';
      }
    };
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // dim a button that cannot do anything right now (e.g. DRIP without enough wax)
  setEnabled(name, on) {
    const el = this.root.querySelector('#tc-' + name);
    if (el && el.classList.contains('off') === on) el.classList.toggle('off', !on);
  }
  // size: small|normal|large, opacity: faint|normal|solid, swap: buttons on the left
  setLayout(size, opacity, swap) {
    const key = `${size}|${opacity}|${swap}`;
    if (key === this.layout) return;
    this.layout = key;
    const cl = this.root.classList;
    for (const c of [...cl]) if (c.startsWith('size-') || c.startsWith('op-')) cl.remove(c);
    if (size !== 'normal') cl.add('size-' + size);
    if (opacity !== 'normal') cl.add('op-' + opacity);
    cl.toggle('swap', !!swap);
  }
  // shown over the Options page so layout changes can be seen; never takes presses
  setPreview(on) {
    if (on === this.root.classList.contains('preview')) return;
    this.root.classList.toggle('preview', on);
    if (on) this.state.releaseAll();
  }
  show(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.root.classList.toggle('on', v);
    if (!v) this.state.releaseAll();
  }
}
