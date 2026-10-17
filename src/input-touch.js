// iPhone touch controls: DOM overlay buttons driven by Pointer Events.
// Fully multi-touch; each pointer is captured by the control it pressed and
// releasing (or cancelling) that pointer anywhere releases the control.
const NAMES = ['left', 'right', 'jump', 'drip', 'absorb', 'pause'];

export class TouchState {
  constructor() {
    this.pointers = new Map();   // pointerId -> control name
    this.held = {};
    this.pressed = {};
    for (const n of NAMES) this.held[n] = false;
    this.onChange = null;
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
    this.recompute();
  }
  recompute() {
    for (const n of NAMES) this.held[n] = false;
    for (const n of this.pointers.values()) this.held[n] = true;
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

export class TouchControls {
  constructor(doc = document, parent = document.body) {
    this.state = new TouchState();
    this.visible = false;
    const root = doc.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div class="tc" id="tc-move"><span class="half" data-side="left">&#9664;</span><span class="half" data-side="right">&#9654;</span></div>
      <div class="tc round" id="tc-jump">JUMP</div>
      <div class="tc round" id="tc-drip">DRIP</div>
      <div class="tc round small" id="tc-absorb">SOAK</div>
      <div class="tc round tiny" id="tc-pause">&#10073;&#10073;</div>`;
    parent.appendChild(root);
    this.root = root;
    const $ = (id) => root.querySelector(id);
    const move = $('#tc-move');
    const halves = move.querySelectorAll('.half');
    bindControl(move, this.state, (e) => {
      const r = move.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? 'left' : 'right';
    });
    bindControl($('#tc-jump'), this.state, 'jump');
    bindControl($('#tc-drip'), this.state, 'drip');
    bindControl($('#tc-absorb'), this.state, 'absorb');
    bindControl($('#tc-pause'), this.state, 'pause');
    const els = { jump: $('#tc-jump'), drip: $('#tc-drip'), absorb: $('#tc-absorb'), pause: $('#tc-pause') };
    this.state.onChange = (held) => {
      for (const [k, el] of Object.entries(els)) el.classList.toggle('down', held[k]);
      halves[0].classList.toggle('down', held.left);
      halves[1].classList.toggle('down', held.right);
    };
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // dim a button that cannot do anything right now (e.g. DRIP without enough wax)
  setEnabled(name, on) {
    const el = this.root.querySelector('#tc-' + name);
    if (el && el.classList.contains('off') === on) el.classList.toggle('off', !on);
  }
  show(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.root.classList.toggle('on', v);
    if (!v) this.state.releaseAll();
  }
}
