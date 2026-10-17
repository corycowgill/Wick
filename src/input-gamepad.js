// Xbox controller via the Gamepad API (standard mapping).
export const DEADZONE = 0.25;
export const BTN = { A: 0, B: 1, X: 2, Y: 3, RT: 7, VIEW: 8, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const EDGE_KEYS = ['jump', 'drip', 'reabsorb', 'restart', 'pause', 'mute', 'up', 'down', 'left', 'right', 'confirm', 'back'];

export const EMPTY_PAD = Object.freeze({
  moveX: 0, left: false, right: false, up: false, down: false,
  jump: false, drip: false, reabsorb: false, restart: false, pause: false, mute: false,
  confirm: false, back: false, active: false,
});

// Pure: a Gamepad-like object -> held state.
export function readPad(pad) {
  const b = (i) => {
    const btn = pad.buttons[i];
    return !!btn && (btn.pressed || btn.value > 0.5);
  };
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  let moveX = 0;
  if (Math.abs(ax) > DEADZONE) moveX = Math.sign(ax) * Math.min(1, (Math.abs(ax) - DEADZONE) / (1 - DEADZONE));
  if (b(BTN.LEFT)) moveX = -1;
  if (b(BTN.RIGHT)) moveX = 1;
  const s = {
    moveX,
    left: moveX < -0.3, right: moveX > 0.3,
    up: b(BTN.UP) || ay < -0.6, down: b(BTN.DOWN) || ay > 0.6,
    jump: b(BTN.A), drip: b(BTN.X) || b(BTN.RT), reabsorb: b(BTN.B), restart: b(BTN.Y),
    pause: b(BTN.MENU), mute: b(BTN.VIEW), confirm: b(BTN.A), back: b(BTN.B),
  };
  s.active = pad.buttons.some((btn) => btn && btn.pressed) || Math.abs(ax) > 0.5 || Math.abs(ay) > 0.5;
  return s;
}

export class GamepadInput {
  constructor(env = globalThis) {
    this.env = env;
    this.index = null;
    this.prev = EMPTY_PAD;
    this.state = EMPTY_PAD;
    this.pressed = {};
    this.any = false;
    this.onConnect = null;
    this.onDisconnect = null;
    if (env.addEventListener) {
      env.addEventListener('gamepadconnected', (e) => {
        if (this.index === null && (e.gamepad.mapping === 'standard' || !this.findPad())) this.index = e.gamepad.index;
        if (this.onConnect) this.onConnect(e.gamepad);
      });
      env.addEventListener('gamepaddisconnected', (e) => {
        if (e.gamepad.index === this.index) this.lost();
      });
    }
  }

  pads() {
    const nav = this.env.navigator;
    if (!nav || !nav.getGamepads) return [];
    try { return [...nav.getGamepads()].filter((p) => p && p.connected !== false); } catch { return []; }
  }

  // first connected pad with standard mapping, else any connected pad
  findPad() {
    const pads = this.pads();
    return pads.find((p) => p.index === this.index) ||
      pads.find((p) => p.mapping === 'standard') || pads[0] || null;
  }

  lost() {
    if (this.index === null) return;
    this.index = null;
    this.prev = EMPTY_PAD;
    this.state = EMPTY_PAD;
    if (this.onDisconnect) this.onDisconnect();
  }

  poll() {
    // edges accumulate until Input.consume() so frames without a fixed update lose nothing
    const pad = this.findPad();
    if (!pad) {
      if (this.index !== null) this.lost();
      this.state = EMPTY_PAD;
      return this.state;
    }
    this.index = pad.index;
    this.pad = pad;
    const s = readPad(pad);
    for (const k of EDGE_KEYS) {
      if (s[k] && !this.prev[k]) { this.pressed[k] = true; this.any = true; }
    }
    this.prev = s;
    this.state = s;
    return s;
  }

  // kind: 'relight' | 'death' | 'land'
  rumble(kind) {
    const act = this.pad && this.pad.vibrationActuator;
    if (!act || !act.playEffect) return;
    const fx = {
      relight: { duration: 140, strongMagnitude: 0.15, weakMagnitude: 0.5 },
      death: { duration: 260, strongMagnitude: 0.7, weakMagnitude: 0.6 },
      land: { duration: 110, strongMagnitude: 0.45, weakMagnitude: 0.1 },
    }[kind];
    if (!fx) return;
    try { const p = act.playEffect('dual-rumble', { startDelay: 0, ...fx }); if (p && p.catch) p.catch(() => {}); } catch { /* unsupported */ }
  }
}
