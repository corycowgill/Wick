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
import { STONE, ONEWAY, EMITTER, GATE, BLOB, DOOR } from '../src/physics.js';

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

// Puzzle moves (levels with plates): drip in front without jumping, soak the
// nearest blob, and jump forward dripping at the top so the blob drops below.
const dripFront = (d) => seq([face(d), (p, w, f) => (f === 0 ? inp({ dripPressed: true }) : f < 3 ? inp() : null)]);
const soak = () => (p, w, f) => (f === 0 ? inp({ reabsorbPressed: true }) : f < 3 ? inp() : null);
const jumpDrip = (d, at) => (p, w, f) => {
  if (f > 0 && p.onGround && p.vy === 0 && f > 3) return null;
  if (f > 150) return null;
  return inp({ jumpPressed: f === 0, jumpHeld: true, moveX: d, dripPressed: f === at });
};

export function programs({ drip = true, hazards = false, puzzle = false, soaking = false } = {}) {
  const list = [];
  if (soaking && !puzzle && drip) list.push(['soak', soak(), 0]);
  if (puzzle && drip) {
    list.push(['soak', soak(), 0]);
    for (const d of [-1, 1]) {
      list.push(['dripFront' + d, dripFront(d), 1]);
      for (const at of [8, 14, 20]) list.push([`jumpDrip${at}:${d}`, jumpDrip(d, at), 1]);
    }
  }
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

const isPermanent = (k) => k === STONE || k === ONEWAY || k === EMITTER || k === GATE || k === DOOR;

function standingOnPermanent(p, w, blobsOk = false) {
  if (!p.onGround) return false;
  const ty = Math.round(p.feet / T);
  const tx0 = Math.floor(p.x / T), tx1 = Math.floor((p.x + p.w - 0.01) / T);
  for (let tx = tx0; tx <= tx1; tx++) if (isPermanent(w.cell(tx, ty)) || (blobsOk && w.cell(tx, ty) === BLOB)) return true;
  return false;
}

// Search a level. opts: { drip, start: {x, feet, wax}, litTorches: [idx], takenPumpkins: [idx],
// target: 'goal' | 'nextTorch' | 'keepsake', maxStates }. Each state's ks says whether the
// keepsake has been found; with needKeepsake the goal only counts once it has.
export function search(levelData, opts = {}) {
  Events.muted = true;
  const world = createWorld(levelData);
  // hazard mode only matters where something runs on a clock: wind, rain, fire
  const timed = world.entities.some((e) => e.frames !== undefined) || world.flammables.size > 0;
  const HZ = !!opts.hazards && timed;
  // moving platforms are geometry, not hazards: they always run, so the clock always matters
  const CLOCKED = HZ || world.movers.length > 0;
  if (!HZ) {
    world.windAt = () => 0;
    world.wetAt = () => false;
    world.mothHit = () => null;
    // harmless now: skip flying the moths and raining the curtains
    for (const e of world.entities) if (e.type === 'moth' || e.type === 'drip') e.update = () => {};
  } else {
    // rain drops are only drawn: drop them at once (the curtain's on/off clock is all that wets)
    for (const e of world.emitters) {
      const update = e.update.bind(e);
      e.update = (dt, w) => { update(dt, w); e.drops.length = 0; };
    }
  }
  const player = new Player();
  let arrivalWax = null;
  const origRefill = player.refill.bind(player);
  player.refill = (a) => { if (a === CFG.TORCH_REFILL) arrivalWax = player.wax; origRefill(a); };
  // plate levels: blobs are part of the puzzle state, so they carry between moves
  const PUZZLE = world.plates.length > 0;
  // soak: also try soaking blobs back up (blobs then carry between moves)
  const CARRY = !!opts.record || PUZZLE || !!opts.soak;
  const progs = programs({ drip: opts.drip !== false, hazards: CLOCKED, puzzle: PUZZLE, soaking: !!opts.soak });
  const nT = world.torches.length, nP = world.pumpkins.length;

  // fuse/gate handling: each state remembers the fuses it lit ([cell, time]).
  // opened: flammable -> { ign, gone } times. Without hazards, gone at once.
  const netCache = new Map();
  const openedFor = (fires) => {
    const k = (fires || []).map((x) => x[0] + '@' + x[1].toFixed(3)).join('|');
    let o = netCache.get(k);
    if (!o) {
      o = new Map();
      for (const [cell, t] of fires || []) openNetwork(o, world.flammables.get(cell), t);
      if (netCache.size > 5000) netCache.clear();
      netCache.set(k, o);
    }
    return o;
  };
  const applyOpened = (opened, now = Infinity) => {
    for (const f of world.flammables.values()) {
      const o = opened.get(f);
      if (!o || now < o.ign) continue;
      if (now >= o.gone) { f.state = 'gone'; if (f.solid) world.clearCell(f.tx, f.ty); continue; }
      // still burning at this moment: resume the fire where it is
      f.state = 'burning'; f.t = now - o.ign; f.spreadDone = f.t >= f.spread;
    }
  };
  const openNetwork = (opened, start, t0 = 0) => {
    // earliest-arrival spread along the network, so each cell burns out after the fire reaches it
    const q = [[start, t0]];
    const seen = new Map([[start, t0]]);
    while (q.length) {
      q.sort((a, b) => a[1] - b[1]);
      const [f, t] = q.shift();
      const gone = HZ ? t + f.burn : 0;
      const prev = opened.get(f);
      if (!prev || prev.gone > gone) opened.set(f, { ign: HZ ? t : 0, gone });
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = world.flammables.get((f.ty + dy) * world.w + f.tx + dx);
        const tn = t + f.spread;
        if (n && (!seen.has(n) || seen.get(n) > tn)) { seen.set(n, tn); q.push([n, tn]); }
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

  // fuse networks: fire spreads through every connected flammable, so a state's fires are
  // keyed by network (lowest cell of each), not by whichever cell happened to catch first
  const netOf = new Map();
  for (const [cell, f0] of world.flammables) {
    if (netOf.has(cell)) continue;
    const comp = [cell], q = [f0];
    netOf.set(cell, -1);
    while (q.length) {
      const f = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = (f.ty + dy) * world.w + f.tx + dx;
        const n = world.flammables.get(c);
        if (n && !netOf.has(c)) { netOf.set(c, -1); comp.push(c); q.push(n); }
      }
    }
    const id = Math.min(...comp);
    for (const c of comp) netOf.set(c, id);
  }
  const firesKey = (fires) => [...new Set((fires || []).map((x) => netOf.get(x[0])))].sort((a, b) => a - b).join('.');

  // Without hazards only the movers keep time. Within 3 tiles of a mover's path (room to stand and
  // wait for it) the phase stays in the key, so the wait moves can line up any phase there; further
  // away it is left out, which drops ~20x duplicate states without losing a route.
  const NEAR = 3;
  const moverBoxes = world.movers.map((m) => [Math.min(m.ax, m.bx) / T - NEAR, Math.min(m.ay, m.by) / T - NEAR,
    (Math.max(m.ax, m.bx) + m.w) / T + NEAR, Math.max(m.ay, m.by) / T + NEAR]);
  const clockMatters = (s) => HZ || s.ride >= 0 || moverBoxes.some(([x0, y0, x1, y1]) => {
    const cx = (s.x + CFG.BODY_W / 2) / T, fy = s.feet / T;
    return cx >= x0 && cx <= x1 && fy >= y0 && fy <= y1;
  });
  // with hazards the clock matters too (coarse phase bucket)
  const keyOf = (s) => `${Math.floor((s.x + CFG.BODY_W / 2) / T)},${Math.round(s.feet / T)},${s.pm},${s.tm}${s.ks ? 'K' : ''}` +
    (CLOCKED && clockMatters(s) ? `,${Math.floor(s.time) % 20}` : '') +
    (PUZZLE ? `,${plateMask(s)}` : '') +
    (world.flammables.size ? `,F${firesKey(s.fires)}` : '');
  // only wax on plates changes what the level allows; other blobs are just footholds
  function plateMask(s) {
    let m = 0;
    for (const b of s.blobs || []) world.plates.forEach((pl, i) => { if (pl.tx === b[0] && pl.ty === b[1]) m |= 1 << i; });
    return m;
  }
  // wax only comes back from unlit torches and untaken pumpkins (and soaking, when the bot may
  // soak): a state that could not beat the best goal even taking every one of them is dropped
  const SOAKS = PUZZLE || !!opts.soak;
  const bits = (m, n) => { let c = 0; for (let i = 0; i < n; i++) if (m & (1 << i)) c++; return c; };
  const hopeless = (s) => !SOAKS && goalHit &&
    Math.min(CFG.WAX_MAX, s.wax + CFG.TORCH_REFILL * (nT - bits(s.tm, nT)) + CFG.PUMPKIN_REFILL * (nP - bits(s.pm, nP))) <= goalHit.wax + 0.5;
  const push = (s) => {
    if (hopeless(s)) return;
    const k = keyOf(s);
    const b = best.get(k);
    if (b && b.wax >= s.wax - 0.5) return;
    best.set(k, s);
    s.pri = PUZZLE ? s.wax + (opts.bias ?? 0.4) * (s.x / T) : s.wax;   // puzzles: lean toward progress
    heapPush(queue, s);
  };
  // startState: continue from a state of an earlier search (chained, segment by segment)
  if (opts.startState) push({ ...opts.startState, parent: null, act: 'start', frames: null, arrivals: [] });
  else push({ x: start.x, feet: start.feet, wax: start.wax, pm: startPump, tm: startTorch, time: 0, fc: 0, parent: null, act: 'start', arrivals: [] });

  const maxStates = opts.maxStates || (CLOCKED ? 200000 : 60000);
  let expanded = 0;

  while (queue.length && expanded < maxStates) {
    const s = heapPop(queue);           // best-first: highest wax
    if (best.get(keyOf(s)) !== s || hopeless(s)) continue;
    expanded++;

    for (const [name, prog, cost] of progs) {
      world.restore(base);
      applyOpened(openedFor(s.fires), HZ ? s.time : Infinity);
      if (CLOCKED) {
        // hazards and platforms on the real clock; refresh their on/off state now, because the player
        // reads it before the next world update would
        for (const [e, f0] of base.ent) { e.frames = f0 + s.fc; e.update(0, world); }
      }
      // blobs from earlier moves still stand (they last 14s), as in real play
      if (CARRY) for (const [bx, by, age] of s.blobs || []) {
        if (world.cell(bx, by) === DOOR) world.grid[by * world.w + bx] = 0;   // wedged in a doorway that was open
        const b = world.addBlob(bx, by, by * T);
        if (b) { b.age = age; b.drawY = b.y; }
      }
      world.torches.forEach((t, i) => { t.lit = !!(s.tm & (1 << i)); });
      world.pumpkins.forEach((pk, i) => { pk.taken = !!(s.pm & (1 << i)); });
      if (world.keepsake) world.keepsake.got = !!s.ks;
      player.spawn(s.x + CFG.BODY_W / 2, s.feet, s.wax);
      player.h = player.targetHeight();
      player.y = s.feet - player.h;
      player.wetTime = s.wet || 0;          // wetness carries over between moves, as in real play
      player.hurt = s.hurt || 0;
      player.riding = s.ride >= 0 ? world.movers[s.ride] : null;
      world.updateDoors(player);          // plates held by carried blobs open their doors at once
      if (player.wax - cost * CFG.DRIP_COST < CFG.DRIP_MIN_LEFT && cost > 0) continue;
      arrivalWax = null;

      const mem = {};
      let f = 0, done = false, ok = false;
      sims++;
      const ignitedFuses = [];
      world.onIgnite = (fl) => { ignitedFuses.push([fl, s.time + f * DT]); };
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
        if (done && player.onGround && player.vy === 0 && (!rec || (player.vx === 0 && player.windVx === 0))) { ok = true; break; }
      }
      // fuses this move lit (one per network is enough: the rest is the spread)
      let fires = s.fires || [];
      if (ignitedFuses.length) {
        let known = openedFor(fires);
        fires = [...fires];
        for (const [fl, t] of ignitedFuses) {
          if (known.has(fl)) continue;
          fires.push([fl.ty * world.w + fl.tx, t]);
          openNetwork(known = new Map(known), fl, t);
        }
      }
      if (!ok || !player.alive) continue;

      const tm = world.torches.reduce((m, t, i) => m | (t.lit ? 1 << i : 0), 0);
      const pm = world.pumpkins.reduce((m, pk, i) => m | (pk.taken ? 1 << i : 0), 0);
      const ks = !!(world.keepsake && world.keepsake.got);
      const ns = {
        x: player.x, feet: player.feet, wax: player.wax, pm, tm, ks,
        time: s.time + f * DT, fc: s.fc + f, wet: player.wetTime, hurt: player.hurt, parent: s, act: name,
        ride: player.riding ? world.movers.indexOf(player.riding) : -1, fires,
        blobs: CARRY ? world.blobs.map((b) => [b.tx, b.ty, b.age]) : null,
        complete: world.complete, frames: rec ? Int8Array.from(rec) : null,
        arrivals: arrivalWax !== null ? [...s.arrivals, Math.round(arrivalWax)] : s.arrivals,
      };
      if (world.complete) {
        if ((ks || !(opts.needKeepsake || opts.target === 'keepsake')) && (!goalHit || ns.wax > goalHit.wax)) goalHit = ns;
        continue;
      }
      if (opts.target === 'keepsake' && ks && !s.ks) {
        if (!goalHit || ns.wax > goalHit.wax) goalHit = ns;
        continue;
      }
      if (tm !== s.tm) torchHits.push(ns);
      if (opts.target === 'nextTorch' && tm !== s.tm) {
        if (!goalHit || ns.wax > goalHit.wax) goalHit = ns;
        continue;
      }
      if (!standingOnPermanent(player, world, PUZZLE) && !player.riding) continue;
      push(ns);
    }
    // clocked levels have ~20x the states: best-first by wax, so the first goal is near the best anyway
    if (goalHit && (opts.firstHit ?? (CLOCKED || PUZZLE))) break;
  }
  Events.muted = false;
  // budgetHit: the search stopped at maxStates with states still queued (a miss is then not a proof)
  return { goal: goalHit, expanded, sims, torchHits, world, states: best.size, best, maxStates, budgetHit: expanded >= maxStates && queue.length > 0 };
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
    if (h[p].pri >= h[i].pri) break;
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
      if (l < h.length && h[l].pri > h[m].pri) m = l;
      if (r < h.length && h[r].pri > h[m].pri) m = r;
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
