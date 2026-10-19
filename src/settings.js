// Player options, stored in localStorage 'wick.settings':
//   { v: 1, gentle, timer, shake, reduceFlash, keys: { jump: [codes], drip: [codes], soak: [codes] },
//     touchSize: 'small'|'normal'|'large', touchOpacity: 'faint'|'normal'|'solid', touchSwap }
// Bot replays force the defaults (Settings.forced) so recorded routes play out exactly.
import { GENTLE, NO_ASSIST } from './config.js';

export const DEFAULT_KEYS = Object.freeze({
  jump: Object.freeze(['Space', 'ArrowUp', 'KeyW']),
  drip: Object.freeze(['ArrowDown', 'KeyS', 'KeyX']),
  soak: Object.freeze(['KeyE']),
});
export const DEFAULTS = Object.freeze({
  v: 1, gentle: false, timer: false, shake: true, reduceFlash: false, keys: DEFAULT_KEYS,
  touchSize: 'normal', touchOpacity: 'normal', touchSwap: false,
});
// touch button layout choices, in the order the Options page cycles them
export const TOUCH_SIZES = ['small', 'normal', 'large'];
export const TOUCH_OPACITIES = ['faint', 'normal', 'solid'];

// keys a binding can never take: movement and the fixed menu/system keys
export const RESERVED_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Escape', 'Enter', 'NumpadEnter', 'Backspace',
  'KeyP', 'KeyM', 'KeyR', 'Tab', 'MetaLeft', 'MetaRight',
]);

const KEY_NAMES = {
  Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', CapsLock: 'Caps',
};
export function keyName(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  return code;
}

function copyKeys(k) { return { jump: [...k.jump], drip: [...k.drip], soak: [...k.soak] }; }

function sanitize(d) {
  const s = { ...DEFAULTS, keys: copyKeys(DEFAULT_KEYS) };
  if (!d || typeof d !== 'object') return s;
  for (const k of ['gentle', 'timer', 'shake', 'reduceFlash', 'touchSwap']) if (typeof d[k] === 'boolean') s[k] = d[k];
  if (TOUCH_SIZES.includes(d.touchSize)) s.touchSize = d.touchSize;
  if (TOUCH_OPACITIES.includes(d.touchOpacity)) s.touchOpacity = d.touchOpacity;
  if (d.keys && typeof d.keys === 'object') {
    for (const a of ['jump', 'drip', 'soak']) {
      const list = d.keys[a];
      if (Array.isArray(list) && list.length && list.every((c) => typeof c === 'string' && !RESERVED_KEYS.has(c))) s.keys[a] = list.slice(0, 4);
    }
  }
  return s;
}

let data = null;
const FORCED = sanitize(null);

export const Settings = {
  forced: false,     // true while a bot replay runs: everything reads as default
  onKeysChange: null,

  load() {
    if (data) return data;
    let d = null;
    try { d = JSON.parse(localStorage.getItem('wick.settings') || 'null'); } catch { /* storage blocked */ }
    data = sanitize(d);
    return data;
  },
  save() {
    try { localStorage.setItem('wick.settings', JSON.stringify(this.load())); } catch { /* storage blocked */ }
  },
  // the settings in effect right now
  get() { return this.forced ? FORCED : this.load(); },
  set(key, value) {
    this.load()[key] = value;
    this.save();
  },
  force(on) {
    this.forced = on;
    if (this.onKeysChange) this.onKeysChange(this.get().keys);
  },

  // wax multipliers handed to the player (never touches CFG)
  assist() {
    return this.get().gentle ? GENTLE : NO_ASSIST;
  },

  // Bind `code` as the only key for `action`. A key taken from another action is swapped:
  // that action gets this one's old main key if it would be left with none.
  bind(action, code) {
    if (RESERVED_KEYS.has(code)) return false;
    const keys = this.load().keys;
    const old = keys[action][0];
    for (const a of Object.keys(keys)) {
      if (a === action) continue;
      keys[a] = keys[a].filter((c) => c !== code);
      if (!keys[a].length) keys[a] = [old];
    }
    keys[action] = [code];
    this.save();
    if (this.onKeysChange) this.onKeysChange(this.get().keys);
    return true;
  },
  resetKeys() {
    this.load().keys = copyKeys(DEFAULT_KEYS);
    this.save();
    if (this.onKeysChange) this.onKeysChange(this.get().keys);
  },
  isDefaultKeys() {
    const k = this.load().keys;
    return Object.keys(DEFAULT_KEYS).every((a) => k[a].join() === DEFAULT_KEYS[a].join());
  },
};
