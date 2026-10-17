// Unified input: keyboard, Xbox controller and touch all feed one state object.
// Gameplay reads `input` and never knows which device is in use.
import { GamepadInput } from './input-gamepad.js';
import { TouchControls } from './input-touch.js';

export const input = {
  left: false, right: false, moveX: 0,
  jumpHeld: false, jumpPressed: false,
  dripPressed: false, reabsorbPressed: false,
  pausePressed: false, restartPressed: false, mutePressed: false,
  // menus
  upPressed: false, downPressed: false, leftPressed: false, rightPressed: false,
  confirmPressed: false, backPressed: false, anyPressed: false,
};

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  ArrowDown: 'drip', KeyS: 'drip', KeyX: 'drip',
  KeyE: 'reabsorb', KeyR: 'restart', Escape: 'pause', KeyP: 'pause', KeyM: 'mute',
  Enter: 'confirm', NumpadEnter: 'confirm', Backspace: 'back',
};
const MENU_ALIAS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'mleft', ArrowRight: 'mright', KeyA: 'mleft', KeyD: 'mright', Space: 'confirm', Escape: 'back' };

const kbHeld = {};
let kbPressed = {};
let anyKey = false;

export const Input = {
  input,
  // phones start in touch mode so the title says "Tap to begin"
  lastDevice: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard',
  gamepad: null,
  touch: null,
  onDeviceChange: null,
  onGesture: null,              // called inside real user gestures (audio unlock)

  init(win = window) {
    win.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (a || MENU_ALIAS[e.code]) e.preventDefault();
      if (e.repeat) return;
      if (a) { kbHeld[a] = true; kbPressed[a] = true; }
      const m = MENU_ALIAS[e.code];
      if (m) kbPressed[m] = true;
      anyKey = true;
      this.setDevice('keyboard');
      if (this.onGesture) this.onGesture();
    });
    win.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) kbHeld[a] = false;
    });
    win.addEventListener('blur', () => { for (const k in kbHeld) kbHeld[k] = false; });

    this.gamepad = new GamepadInput(win);
    this.touch = new TouchControls(win.document, win.document.body);
    win.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.setDevice('touch');
      if (this.onGesture) this.onGesture();
    }, true);
    win.addEventListener('touchend', () => { if (this.onGesture) this.onGesture(); }, true);
  },

  setDevice(d) {
    if (d === this.lastDevice) return;
    this.lastDevice = d;
    if (this.onDeviceChange) this.onDeviceChange(d);
  },

  // Build the frame's input state. Call once per rendered frame before updates.
  poll() {
    const gp = this.gamepad ? this.gamepad.poll() : null;
    const gpp = this.gamepad ? this.gamepad.pressed : {};
    if (this.gamepad && this.gamepad.any) this.setDevice('gamepad');
    const th = this.touch ? this.touch.state.held : {};
    const tp = this.touch ? this.touch.state.pressed : {};

    const left = !!(kbHeld.left || th.left || (gp && gp.left));
    const right = !!(kbHeld.right || th.right || (gp && gp.right));
    let moveX = (right ? 1 : 0) - (left ? 1 : 0);
    if (gp && Math.abs(gp.moveX) > 0 && !kbHeld.left && !kbHeld.right && !th.left && !th.right) moveX = gp.moveX;
    // the touch thumb pad is analog
    const tx = this.touch ? this.touch.state.moveX || 0 : 0;
    if (tx !== 0 && !kbHeld.left && !kbHeld.right) moveX = tx;

    input.left = left; input.right = right; input.moveX = moveX;
    input.jumpHeld = !!(kbHeld.jump || th.jump || (gp && gp.jump));
    input.jumpPressed = !!(kbPressed.jump || tp.jump || gpp.jump);
    input.dripPressed = !!(kbPressed.drip || tp.drip || gpp.drip);
    input.reabsorbPressed = !!(kbPressed.reabsorb || tp.absorb || gpp.reabsorb);
    input.pausePressed = !!(kbPressed.pause || tp.pause || gpp.pause);
    input.restartPressed = !!(kbPressed.restart || gpp.restart);
    input.mutePressed = !!(kbPressed.mute || gpp.mute);
    input.upPressed = !!(kbPressed.up || gpp.up);
    input.downPressed = !!(kbPressed.down || gpp.down);
    input.leftPressed = !!(kbPressed.mleft || gpp.left || tp.left);
    input.rightPressed = !!(kbPressed.mright || gpp.right || tp.right);
    input.confirmPressed = !!(kbPressed.confirm || gpp.confirm || tp.jump);
    input.backPressed = !!(kbPressed.back || gpp.back);
    input.anyPressed = anyKey || !!(this.gamepad && this.gamepad.any) ||
      Object.values(tp).some(Boolean);
    return input;
  },

  // Clear one-shot presses after the first fixed update of a frame consumed them.
  consume() {
    kbPressed = {};
    anyKey = false;
    if (this.touch) this.touch.state.consume();
    input.jumpPressed = input.dripPressed = input.reabsorbPressed = false;
    input.pausePressed = input.restartPressed = input.mutePressed = false;
    input.upPressed = input.downPressed = input.leftPressed = input.rightPressed = false;
    input.confirmPressed = input.backPressed = input.anyPressed = false;
    if (this.gamepad) { this.gamepad.pressed = {}; this.gamepad.any = false; }
  },
};
