// Reachability bot: searches a level using the real Player physics.
// States are "standing on permanent ground" positions; edges are scripted
// input programs (walks, jumps, drip steps, pillars, bridges). The search
// maximises remaining wax, tracking which torches and pumpkins were used.
//
// By default wind gusts and drip columns are switched off (geometry and wax budget
// only). With { hazards: true } they run on the real clock, the bot gets "wait"
// moves to time them, fuses burn at their real speed, and with { record: true }
// every move's inputs are kept so the route can be replayed in the actual game.
import { CFG } from '../src/config.js';
import { createWorld } from '../src/level.js';
import { Player } from '../src/player.js';
import { Events } from '../src/events.js';
import { STONE, ONEWAY, EMITTER, GATE } from '../src/physics.js';

const DT = CFG.STEP;
const T = CFG.TILE;

function inp(o = {}) {
  return { moveX: 0, jumpHeld: false, jumpPressed: false, dripPressed: false, reabsorbPressed: false, ...o };
}

// --- input programs: (player, world, frame, mem) => input | null (null = program done) ---
const walk = (d) => (p, w, f, m) => {
  if (f === 0) m.startCell = Math.floor(p.cx / T);
  if (f > 40) return null;
  if (Math.floor(p.cx / T) !== m.startCell && f > 2) return null;
  return inp({ moveX: d });
};

const jump = (d, hold, delay = 0, moveDur = 9) => (p, w, f) => {
  const t = f * DT;
  if (f > 0 && p.onGround && p.vy === 0 && t > 0.05) return null;
  return inp({
    jumpPressed: f === 0, jumpHeld: t < hold,
    moveX: t >= delay && t < delay + moveDur ? d : 0,
  });
};

const frontBelowEmpty = (p, w, d) => {
  const front = d > 0 ? Math.floor((p.x + p.w + 12) / T) : Math.floor((p.x - 12) / T);
  return w.cell(front, Math.round(p.feet / T)) === 0;
};

// Drip a step in front, then jump onto/over it.
const dripStep = (d) => seq([
  face(d),
  (p, w, f) => (f === 0 ? inp({ dripPressed: true }) : null),
  jump(d, 9, 0.08),
]);

// k times: jump straight up, drip under yourself at the apex, land. Then jump d.
const pillar = (k, d) => {
  const rep = [face(d)];
  for (let i = 0; i < k; i++) {
    rep.push((p, w, f, m) => {
      if (f === 0) return inp({ jumpPressed: true, jumpHeld: true });
      if (!m.dripped && p.vy >= -30) { m.dripped = true; return inp({ jumpHeld: true, dripPressed: true }); }
      if (m.dripped && p.onGround && p.vy === 0) return null;
      if (f > 120) return null;
      return inp({ jumpHeld: true });
    });
  }
  rep.push(jump(d, 9, 0.06));
  return seq(rep);
};

// Walk to the edge, then k times: drip a bridge blob and walk onto it. Then jump d.
const bridge = (k, d) => {
  const rep = [(p, w, f) => {
    if (f > 50 || !p.onGround) return null;
    if (frontBelowEmpty(p, w, d)) return null;
    return inp({ moveX: d * 0.5 });
  }];
  for (let i = 0; i < k; i++) {
    rep.push((p, w, f) => (f === 0 ? inp({ dripPressed: true }) : null));
    rep.push((p, w, f, m) => {
      if (f === 0) m.x0 = p.cx;
      if (Math.abs(p.cx - m.x0) >= T - 1 || f > 30) return null;
      return inp({ moveX: d * 0.6 });
    });
  }
  rep.push(jump(d, 9, 0));
  return seq(rep);
};

const face = (d) => (p, w, f) => (f === 0 ? inp({ moveX: d * 0.01 }) : null);

// Against a wall: drip k times to rise on the blobs, then jump off toward jd.
const lift = (k, d, jd) => {
  const rep = [face(d)];
  for (let i = 0; i < k; i++) {
    rep.push((p, w, f, m) => {
      if (f === 0) return inp({ dripPressed: true });
      if (f > 3 && p.onGround) return null;
      return f > 40 ? null : inp();
    });
  }
  rep.push(face(jd));
  rep.push(jump(jd, 9, 0.05));
  return seq(rep);
};

function seq(progs) {
  return (p, w, f, m) => {
    if (m.i === undefined) { m.i = 0; m.f0 = 0; m.sub = {}; }
    while (m.i < progs.length) {
      const r = progs[m.i](p, w, f - m.f0, m.sub);
      if (r) return r;
      m.i++; m.f0 = f; m.sub = {};
    }
    return null;
  };
}

const wait = (frames) => (p, w, f) => (f < frames ? inp() : null);

export function programs({ drip = true, hazards = false } = {}) {
  const list = [];
  if (hazards) for (const n of [20, 45, 90]) list.push(['wait' + n, wait(n), 0]);
  for (const d of [-1, 1]) list.push(['walk' + d, walk(d), 0]);
  list.push(['jump0', jump(0, 9), 0], ['hop0', jump(0, 0.15), 0]);
  for (const d of [-1, 1]) {
    list.push(['jump' + d, jump(d, 9), 0]);
    list.push(['hop' + d, jump(d, 0.15), 0]);
    list.push(['jumpLate' + d, jump(d, 9, 0.12), 0]);
    list.push(['hopLate' + d, jump(d, 0.15, 0.12), 0]);
    list.push(['jumpShort' + d, jump(d, 9, 0, 0.2), 0]);
    list.push(['jumpUpOver' + d, jump(d, 9, 0.25), 0]);
  }
  if (drip) {
    for (const d of [-1, 1]) {
      list.push(['dripStep' + d, dripStep(d), 1]);
      for (const k of [1, 2, 3]) list.push([`pillar${k}:${d}`, pillar(k, d), k]);
      for (const k of [1, 2, 3]) list.push([`bridge${k}:${d}`, bridge(k, d), k]);
      for (const k of [1, 2, 3]) {
        list.push([`lift${k}:${d}`, lift(k, d, -d), k]);
        list.push([`liftUp${k}:${d}`, lift(k, d, 0), k]);
      }
    }
  }
  return list;
}

const isPermanent = (k) => k === STONE || k === ONEWAY || k === EMITTER || k === GATE;

function standingOnPermanent(p, w) {
  if (!p.onGround) return false;
  const ty = Math.round(p.feet / T);
  const tx0 = Math.floor(p.x / T), tx1 = Math.floor((p.x + p.w - 0.01) / T);
  for (let tx = tx0; tx <= tx1; tx++) if (isPermanent(w.cell(tx, ty))) return true;
  return false;
}

// Search a level. opts: { drip, start: {x, feet, wax}, litTorches: [idx], takenPumpkins: [idx],
// target: 'goal' | 'nextTorch', maxStates }
export function search(levelData, opts = {}) {
  Events.muted = true;
  const world = createWorld(levelData);
  // hazard mode only matters where something runs on a clock: wind, rain, fire
  const timed = world.entities.some((e) => e.type === 'wind' || e.type === 'drip') || world.flammables.size > 0;
  const HZ = !!opts.hazards && timed;
  if (!HZ) {
    world.windAt = () => 0;
    world.wetAt = () => false;
  }
  const player = new Player();
  let arrivalWax = null;
  const origRefill = player.refill.bind(player);
  player.refill = (a) => { if (a === CFG.TORCH_REFILL) arrivalWax = player.wax; origRefill(a); };
  const progs = programs({ drip: opts.drip !== false, hazards: HZ });
  const nT = world.torches.length, nP = world.pumpkins.length;

  // fuse/gate handling: gates opened by any fuse the bot has lit stay open
  // opened: flammable -> time it is gone (Infinity until lit). Without hazards, gone at once.
  const opened = new Map();
  const applyOpened = (now = Infinity) => {
    for (const f of world.flammables.values()) {
      const at = opened.get(f);
      if (at !== undefined && now >= at) { f.state = 'gone'; if (f.solid) world.clearCell(f.tx, f.ty); }
    }
  };
  const openNetwork = (start, t0 = 0) => {
    // breadth-first along the network so each cell burns out after the fire reaches it
    const q = [[start, t0]];
    const seen = new Set([start]);
    while (q.length) {
      const [f, t] = q.shift();
      const gone = HZ ? t + f.burn : 0;
      if (!opened.has(f) || opened.get(f) > gone) opened.set(f, gone);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = world.flammables.get((f.ty + dy) * world.w + f.tx + dx);
        if (n && !seen.has(n)) { seen.add(n); q.push([n, t + f.spread]); }
      }
    }
  };

  let base = world.snapshot();
  const start = opts.start || { x: world.spawn.x - CFG.BODY_W / 2, feet: world.spawn.y, wax: CFG.WAX_MAX };
  const startTorch = (opts.litTorches || []).reduce((m, i) => m | (1 << i), 0);
  const startPump = (opts.takenPumpkins || []).reduce((m, i) => m | (1 << i), 0);

  const best = new Map();
  const queue = [];
  let goalHit = null;
  const torchHits = [];
  let sims = 0;

  // with hazards the clock matters too (coarse phase bucket)
  const keyOf = (s) => `${Math.floor((s.x + CFG.BODY_W / 2) / T)},${Math.round(s.feet / T)},${s.pm},${s.tm}` +
    (HZ ? `,${Math.floor(s.time) % 20}` : '');
  const push = (s) => {
    const k = keyOf(s);
    const b = best.get(k);
    if (b && b.wax >= s.wax - 0.5) return;
    best.set(k, s);
    heapPush(queue, s);
  };
  push({ x: start.x, feet: start.feet, wax: start.wax, pm: startPump, tm: startTorch, time: 0, parent: null, act: 'start', arrivals: [] });

  const maxStates = opts.maxStates || (HZ ? 200000 : 60000);
  let expanded = 0;
  let restart = false;

  while (queue.length && expanded < maxStates) {
    const s = heapPop(queue);           // best-first: highest wax
    if (best.get(keyOf(s)) !== s) continue;
    expanded++;

    for (const [name, prog, cost] of progs) {
      world.restore(base);
      applyOpened(HZ ? s.time : Infinity);
      if (HZ) for (const [e, t0] of base.ent) e.t = (t0 + s.time) % e.period;   // hazards on the real clock
      world.torches.forEach((t, i) => { t.lit = !!(s.tm & (1 << i)); });
      world.pumpkins.forEach((pk, i) => { pk.taken = !!(s.pm & (1 << i)); });
      player.spawn(s.x + CFG.BODY_W / 2, s.feet, s.wax);
      player.h = player.targetHeight();
      player.y = s.feet - player.h;
      if (player.wax - cost * CFG.DRIP_COST < CFG.DRIP_MIN_LEFT && cost > 0) continue;
      arrivalWax = null;

      const mem = {};
      let f = 0, done = false, ok = false;
      sims++;
      const ignitedFuses = [];
      world.onIgnite = (fl) => { if (fl.type === 'fuse') ignitedFuses.push([fl, s.time + f * DT]); };
      const rec = opts.record ? [] : null;
      while (f < 60 * 6) {
        const input = done ? inp() : prog(player, world, f, mem);
        if (!input) { done = true; }
        const i = input || inp();
        if (rec) rec.push(Math.round(i.moveX * 100), (i.jumpHeld ? 1 : 0) | (i.jumpPressed ? 2 : 0) | (i.dripPressed ? 4 : 0) | (i.reabsorbPressed ? 8 : 0));
        player.update(DT, i, world);
        world.update(DT, player);
        f++;
        if (!player.alive) break;
        if (world.complete) { ok = true; break; }
        // settled: on the ground and at rest, so the next move starts exactly where this one ended
        if (done && player.onGround && player.vy === 0 && (!rec || (Math.abs(player.vx) < 1 && Math.abs(player.windVx) < 1))) { ok = true; break; }
      }
      if (ignitedFuses.length) {
        const before = [...opened.values()].join();
        for (const [fl, t] of ignitedFuses) openNetwork(fl, t);
        if ([...opened.values()].join() !== before) restart = true;
      }
      if (!ok || !player.alive) continue;

      const tm = world.torches.reduce((m, t, i) => m | (t.lit ? 1 << i : 0), 0);
      const pm = world.pumpkins.reduce((m, pk, i) => m | (pk.taken ? 1 << i : 0), 0);
      const ns = {
        x: player.x, feet: player.feet, wax: player.wax, pm, tm,
        time: s.time + f * DT, parent: s, act: name, frames: rec ? Int8Array.from(rec) : null,
        arrivals: arrivalWax !== null ? [...s.arrivals, Math.round(arrivalWax)] : s.arrivals,
      };
      if (world.complete) {
        if (!goalHit || ns.wax > goalHit.wax) goalHit = ns;
        continue;
      }
      if (tm !== s.tm) torchHits.push(ns);
      if (opts.target === 'nextTorch' && tm !== s.tm) {
        if (!goalHit || ns.wax > goalHit.wax) goalHit = ns;
        continue;
      }
      if (!standingOnPermanent(player, world)) continue;
      push(ns);
    }
    if (restart) {
      // a fuse opened new gates: rebuild the base state and requeue everything
      restart = false;
      if (!HZ) {
        world.restore(base);
        applyOpened();
        base = world.snapshot();
      }
      for (const st of best.values()) heapPush(queue, st);
    }
    if (goalHit && opts.firstHit) break;
  }
  Events.muted = false;
  return { goal: goalHit, expanded, sims, torchHits, world, states: best.size, best };
}

export function pathOf(s) {
  const out = [];
  for (let n = s; n; n = n.parent) out.push(n);
  return out.reverse();
}

// max-heap on wax
function heapPush(h, v) {
  h.push(v);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p].wax >= h[i].wax) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}
function heapPop(h) {
  const top = h[0];
  const last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l].wax > h[m].wax) m = l;
      if (r < h.length && h[r].wax > h[m].wax) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
  return top;
}

// Concatenate the recorded inputs of a route into one replayable Int8Array.
export function routeFrames(goal) {
  const parts = pathOf(goal).map((s) => s.frames).filter(Boolean);
  const out = new Int8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
