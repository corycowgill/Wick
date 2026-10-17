// Headless QA for WICK. Run: node tests/playtest.js  (or npm test)
// Flags: --quick  skips the slow torch-segment searches.
import { CFG } from '../src/config.js';
import { createWorld, normaliseTiles } from '../src/level.js';
import { Player } from '../src/player.js';
import { Events } from '../src/events.js';
import { search, pathOf } from './bot.js';
import { readPad, GamepadInput, DEADZONE } from '../src/input-gamepad.js';
import { TouchState, bindControl } from '../src/input-touch.js';
import { Input, input } from '../src/input.js';

const QUICK = process.argv.includes('--quick');
const LEVELS = [];
for (let i = 1; i <= 8; i++) LEVELS.push((await import(`../src/levels/level${i}.js`)).default);

let failures = 0, warnings = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const warn = (msg) => { warnings++; console.log(`  warn  ${msg}`); };
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));
const section = (t) => console.log(`\n== ${t}`);

// ------------------------------------------------------------ parse
section('Level parsing');
LEVELS.forEach((L, i) => {
  try {
    const { errors } = normaliseTiles(L.tiles);
    const w = createWorld(L);
    check(errors.length === 0 && w.torches.length >= 1,
      `level ${i + 1} "${L.name}" parses: 1 spawn, 1 goal, ${w.torches.length} torches, ${w.pumpkins.length} pumpkins`);
    if (L.tiles.some((r) => r.includes('^'))) fail(`level ${i + 1} contains spikes (^), which are not in the game`);
  } catch (e) {
    fail(`level ${i + 1} failed to parse: ${e.message}`);
  }
});

// ------------------------------------------------------------ reachability
section('Reachability bot (real Player physics; wind/water timing disabled)');
const routes = [];
for (let i = 0; i < LEVELS.length; i++) {
  const t0 = Date.now();
  const r = search(LEVELS[i], {});
  const ms = Date.now() - t0;
  if (!r.goal) { fail(`level ${i + 1}: goal NOT reachable from spawn at full wax (${r.states} states, ${ms}ms)`); routes.push(null); continue; }
  const minArrival = Math.min(r.goal.wax, ...r.goal.arrivals);
  check(true, `level ${i + 1}: goal reached, optimal ${r.goal.time.toFixed(1)}s, ${r.goal.wax.toFixed(0)} wax left (${ms}ms)`);
  if (minArrival < 15) warn(`level ${i + 1}: tightest point leaves ${minArrival.toFixed(0)} wax (target >= 15)`);
  else ok(`level ${i + 1}: >= 15 wax spare at every torch and the goal (min ${minArrival.toFixed(0)})`);
  routes.push(r);
}

section('Wax management required (no-drip bot must fail on level 3)');
{
  const r = search(LEVELS[2], { drip: false });
  check(!r.goal, 'level 3 cannot be finished without dripping wax');
}

if (!QUICK) {
  section('Torch to torch at the guaranteed respawn wax (RESPAWN_MIN)');
  for (let i = 0; i < LEVELS.length; i++) {
    const r = routes[i];
    if (!r) continue;
    // order in which the optimal route lit torches, and pumpkins used before each
    const path = pathOf(r.goal);
    const order = [];
    let prev = path[0];
    for (const s of path) {
      if (s.tm !== prev.tm) {
        const idx = Math.log2(s.tm ^ prev.tm) | 0;
        order.push({ idx, pm: s.pm });
      }
      prev = s;
    }
    const world = createWorld(LEVELS[i]);
    order.forEach((o, k) => {
      const torch = world.torches[o.idx];
      const lit = order.slice(0, k + 1).map((x) => x.idx);
      const taken = world.pumpkins.map((_, j) => j).filter((j) => o.pm & (1 << j));
      const res = search(LEVELS[i], {
        start: { x: torch.x - CFG.BODY_W / 2, feet: torch.y, wax: CFG.RESPAWN_MIN },
        litTorches: lit, takenPumpkins: taken, target: 'nextTorch', firstHit: true,
      });
      const to = k + 1 < order.length ? `torch ${k + 2}` : 'goal';
      if (res.goal) ok(`level ${i + 1}: torch ${k + 1} -> ${to} at ${CFG.RESPAWN_MIN} wax (${res.goal.wax.toFixed(0)} left)`);
      else fail(`level ${i + 1}: torch ${k + 1} -> ${to} NOT reachable at ${CFG.RESPAWN_MIN} wax`);
    });
  }
}

// ------------------------------------------------------------ soak
section('60s random-input soak per level (all hazards on)');
let updTotal = 0, updFrames = 0;
LEVELS.forEach((L, i) => {
  Events.muted = true;
  const world = createWorld(L);
  const p = new Player();
  p.spawn(world.spawn.x, world.spawn.y, CFG.WAX_MAX);
  let seed = 1234 + i;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let bad = null, deaths = 0;
  const inp = { moveX: 0, jumpHeld: false, jumpPressed: false, dripPressed: false, reabsorbPressed: false };
  for (let f = 0; f < 60 * 60 && !bad; f++) {
    if (f % 12 === 0) inp.moveX = rnd() < 0.7 ? 1 : rnd() < 0.5 ? -1 : 0;
    inp.jumpPressed = rnd() < 0.06;
    inp.jumpHeld = inp.jumpPressed || (inp.jumpHeld && rnd() < 0.9);
    inp.dripPressed = rnd() < 0.02;
    inp.reabsorbPressed = rnd() < 0.01;
    const t0 = performance.now();
    p.update(CFG.STEP, inp, world);
    world.update(CFG.STEP, p);
    updTotal += performance.now() - t0; updFrames++;
    if (!p.alive && p.deathTimer <= 0) { deaths++; world.reset(p); }
    for (const v of [p.x, p.y, p.vx, p.vy, p.wax, p.h]) if (!Number.isFinite(v)) bad = `NaN at frame ${f}`;
    if (p.x < 0 || p.x + p.w > world.pxW || p.y + p.h > world.pxH + 1) bad = `out of bounds at frame ${f} (${p.x | 0}, ${p.y | 0})`;
    if (world.complete) break;
  }
  Events.muted = false;
  check(!bad, `level ${i + 1}: soak clean${bad ? ': ' + bad : ''} (${deaths} deaths)`);
});
const avgUpd = updTotal / updFrames;
check(avgUpd < 8, `simulation update averages ${avgUpd.toFixed(3)}ms/frame (budget 8ms incl. render; render is measured in-browser, ?debug)`);

// ------------------------------------------------------------ drip rules
section('Wax drip behaves the way a player expects');
{
  const T = CFG.TILE;
  const room = (rows) => createWorld({ name: 'test', tiles: rows, entities: [] });
  const blank = { moveX: 0, jumpHeld: false, jumpPressed: false, dripPressed: false, reabsorbPressed: false };
  const run = (w, p, frames, inp = {}) => {
    for (let f = 0; f < frames; f++) {
      const i = typeof inp === 'function' ? inp(f) : inp;
      p.update(CFG.STEP, { ...blank, ...i }, w);
      w.update(CFG.STEP, p);
    }
  };
  const fails = [];
  Events.on('dripFail', (e) => fails.push(e.reason));
  const at = (w, cx, feetRow, facing = 1, wax = 100) => {
    const p = new Player();
    p.spawn(cx, feetRow * T, wax);
    p.facing = facing;
    run(w, p, 2);
    return p;
  };
  //        0123456789012345
  const flat = [
    '................',
    '................',
    '................',
    '..S..........G..',
    '################',
  ];
  {
    const w = room(flat), p = at(w, 3 * T, 4);
    const ghost = p.findDripCell(w);
    run(w, p, 1, { dripPressed: true });
    const b = w.blobs[0];
    check(b && b.ty === 3 && b.tx === 4, 'standing on flat ground: drip makes a step right in front');
    check(b && ghost && ghost.tx === b.tx && ghost.ty === b.ty, 'the ghost preview matches where the blob landed');
  }
  {
    const ledge = ['................', '................', '................', '..S..........G..', '#####......#####', '................'];
    const w = room(ledge), p = at(w, 4.5 * T, 4);
    run(w, p, 1, { dripPressed: true });
    const b = w.blobs[0];
    check(b && b.ty === 4 && b.tx === 5, 'at a ledge: drip bridges the gap at floor level');
  }
  {
    const wall = ['......#.........', '......#.........', '......#.........', '..S...#......G..', '################'];
    const w = room(wall), p = at(w, 6 * T - 12, 4);
    const before = p.feet;
    run(w, p, 1, { dripPressed: true });
    run(w, p, 10);
    check(w.blobs.length === 1 && Math.abs(p.feet - (before - T)) < 1, 'against a wall: drip builds under Wick and lifts them a tile');
  }
  {
    const w = room(flat), p = at(w, 7 * T, 4);
    run(w, p, 1, { jumpPressed: true, jumpHeld: true, dripPressed: true });
    run(w, p, 90, { jumpHeld: true });
    check(w.blobs.length === 1 && Math.abs(p.feet - 3 * T) < 1 && p.onGround,
      'jump and drip pressed together: the blob forms underneath and Wick lands on it');
  }
  {
    fails.length = 0;
    const w = room(flat), p = at(w, 3 * T, 4, 1, 10);
    run(w, p, 1, { dripPressed: true });
    check(w.blobs.length === 0 && fails[0] === 'wax', 'not enough wax: no blob and a clear "wax" failure');
  }
  {
    const w = room(flat), p = at(w, 3 * T, 4);
    run(w, p, 1, { dripPressed: true });
    const wax = p.wax;
    run(w, p, 1, { reabsorbPressed: true });
    check(w.blobs.length === 0 && p.wax > wax + 3, 'soak takes the nearby blob back for half its wax');
  }
  Events.clear();
}

// ------------------------------------------------------------ input
section('Input layer');
{
  const pad = (axes, pressed = []) => ({
    index: 0, connected: true, mapping: 'standard', axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  });
  check(readPad(pad([0.2, 0])).moveX === 0, `stick inside deadzone (${DEADZONE}) gives moveX 0`);
  const half = readPad(pad([0.625, 0])).moveX;
  check(Math.abs(half - 0.5) < 1e-6, 'stick at 0.625 rescales to moveX 0.5');
  check(readPad(pad([-1, 0])).moveX === -1, 'full left stick gives -1');
  check(readPad(pad([0, 0], [15])).moveX === 1, 'D-pad right gives +1');
  const p7 = readPad(pad([0, 0], [7]));
  check(p7.drip && !p7.jump, 'right trigger drips');

  // gamepad edges + disconnect
  let pads = [pad([0, 0])];
  const listeners = {};
  const env = {
    navigator: { getGamepads: () => pads },
    addEventListener: (n, f) => { listeners[n] = f; },
  };
  const gp = new GamepadInput(env);
  let disconnected = 0;
  gp.onDisconnect = () => disconnected++;
  gp.poll();
  pads = [pad([0, 0], [0])];
  gp.poll();
  check(gp.pressed.jump === true, 'A press registers a jump edge');
  gp.pressed = {};
  gp.poll();
  check(!gp.pressed.jump, 'held A does not re-trigger');
  pads = [];
  gp.poll();
  check(disconnected === 1, 'controller loss fires onDisconnect once (game auto-pauses)');
  pads = [pad([0, 0])];
  gp.poll();
  listeners.gamepaddisconnected({ gamepad: { index: 0 } });
  check(disconnected === 2, 'gamepaddisconnected event fires onDisconnect');

  // touch: multi-touch, capture release, cancel, move pad sliding
  const ts = new TouchState();
  const mkEl = () => { const el = new EventTarget(); el.setPointerCapture = () => {}; return el; };
  const ev = (type, id, x = 0) => Object.assign(new Event(type), { pointerId: id, clientX: x });
  const move = mkEl(), jump = mkEl(), drip = mkEl();
  bindControl(move, ts, (e) => (e.clientX < 100 ? 'left' : 'right'));
  bindControl(jump, ts, 'jump');
  bindControl(drip, ts, 'drip');
  move.dispatchEvent(ev('pointerdown', 1, 150));
  jump.dispatchEvent(ev('pointerdown', 2));
  drip.dispatchEvent(ev('pointerdown', 3));
  check(ts.held.right && ts.held.jump && ts.held.drip, 'three simultaneous touches: move + jump + drip held');
  check(ts.pressed.jump && ts.pressed.drip, 'touch presses register edges');
  move.dispatchEvent(ev('pointermove', 1, 40));
  check(ts.held.left && !ts.held.right, 'sliding on the move pad switches right -> left');
  jump.dispatchEvent(ev('pointerup', 2));
  check(!ts.held.jump && ts.held.left && ts.held.drip, 'lifting one finger releases only that control');
  drip.dispatchEvent(ev('pointercancel', 3));
  check(!ts.held.drip, 'pointercancel releases the control');
  move.dispatchEvent(ev('lostpointercapture', 1));
  check(!ts.held.left && ts.pointers.size === 0, 'lost capture releases the control');

  // thumb pad: analog, deadzone, release
  {
    const st = new TouchState();
    st.stickDown(7, 100, 300);
    st.stickMove(7, 105, 300);
    check(st.moveX === 0, 'thumb pad: a small wobble stays inside the deadzone');
    st.stickMove(7, 100 + 56 * 0.6, 300);
    check(st.moveX > 0.4 && st.moveX < 0.8 && st.held.right, 'thumb pad: partial push gives partial analog speed');
    st.stickMove(7, 100 - 200, 300);
    check(st.moveX === -1 && st.held.left, 'thumb pad: full push left gives -1');
    st.stickMove(7, 0, 300);
    check(st.moveX > 0, 'thumb pad: origin follows a wandering thumb, so sliding back reverses at once');
    st.stickUp(7);
    check(st.moveX === 0 && !st.held.left, 'thumb pad: lifting the thumb stops Wick');
  }

  // unified state: all devices feed one input object
  Input.gamepad = new GamepadInput({ navigator: { getGamepads: () => [pad([0.625, 0], [0])] } });
  Input.touch = { state: new TouchState() };
  Input.poll();
  check(Math.abs(input.moveX - 0.5) < 1e-6 && input.jumpHeld && input.jumpPressed, 'unified input: analog moveX and jump from the controller');
  check(Input.lastDevice === 'gamepad', 'last device switches to gamepad on input');
  Input.consume();
  check(!input.jumpPressed && input.jumpHeld, 'consume() clears presses but keeps held state');
  Input.gamepad = new GamepadInput({ navigator: { getGamepads: () => [] } });
  Input.touch.state.down(9, 'left');
  Input.poll();
  check(input.moveX === -1 && input.left, 'unified input: touch left gives moveX -1');
}

console.log(`\n${failures ? 'FAILED' : 'PASSED'}: ${failures} failure(s), ${warnings} warning(s)`);
process.exit(failures ? 1 : 0);
