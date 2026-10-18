// Parses ASCII level data into a live world: grid, entities, lights, hazards.
import { CFG } from './config.js';
import { EMPTY, STONE, ONEWAY, BLOB, COBWEB, GATE, EMITTER, DOOR, isFull } from './physics.js';
import { Events } from './events.js';
import { Torch } from './entities/torch.js';
import { Pumpkin } from './entities/pumpkin.js';
import { Goal } from './entities/goal.js';
import { WaxBlob } from './entities/wax-blob.js';
import { WindZone } from './entities/wind.js';
import { DripEmitter } from './entities/drip-emitter.js';
import { Cobweb } from './entities/cobweb.js';
import { Fuse, Gate } from './entities/fuse.js';
import { Mover } from './entities/mover.js';
import { Moth } from './entities/moth.js';

const PROP_CHARS = { h: 'hay', j: 'jack', b: 'barrel', k: 'crate', n: 'banner', l: 'lamp' };

// Validates and normalises level rows. Returns { rows, w, h, errors }.
export function normaliseTiles(tiles) {
  const errors = [];
  const h = tiles.length;
  const w = Math.max(...tiles.map((r) => r.length));
  const rows = tiles.map((r) => r.padEnd(w, '.'));
  let spawns = 0, goals = 0;
  for (const r of rows) for (const c of r) { if (c === 'S') spawns++; if (c === 'G') goals++; }
  if (spawns !== 1) errors.push(`expected 1 spawn, found ${spawns}`);
  if (goals !== 1) errors.push(`expected 1 goal, found ${goals}`);
  return { rows, w, h, errors };
}

export function createWorld(data) {
  const T = CFG.TILE;
  const { rows, w, h, errors } = normaliseTiles(data.tiles);
  if (errors.length) throw new Error(`${data.name}: ${errors.join(', ')}`);

  const grid = new Uint8Array(w * h);
  const dark = new Uint8Array(w * h);
  const windMask = new Uint8Array(w * h);
  const tiles = rows.map((r) => r.split(''));
  const entities = [];
  const flammables = new Map();
  const props = [];
  const emitters = [];
  const torches = [];
  const pumpkins = [];
  const plates = [];
  const doorMask = new Uint8Array(w * h);
  let spawn = null, goal = null;

  const key = (tx, ty) => ty * w + tx;
  const floorEntity = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 1) * T });

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const c = rows[ty][tx];
      const k = key(tx, ty);
      switch (c) {
        case '#': grid[k] = STONE; break;
        case '=': grid[k] = ONEWAY; break;
        case '~': {
          grid[k] = EMITTER;
          const e = new DripEmitter(tx, ty, 0);
          emitters.push(e);
          entities.push(e);
          break;
        }
        case 'S': spawn = floorEntity(tx, ty); break;
        case 'T': { const p = floorEntity(tx, ty); const t = new Torch(p.x, p.y); torches.push(t); entities.push(t); break; }
        case 'P': case 'L': {
          const p = floorEntity(tx, ty);
          const e = new Pumpkin(p.x, p.y, c === 'L' ? 'lantern' : 'pumpkin');
          pumpkins.push(e); entities.push(e); break;
        }
        case 'G': { const p = floorEntity(tx, ty); goal = new Goal(p.x, p.y); entities.push(goal); break; }
        case 'w': { grid[k] = COBWEB; const e = new Cobweb(tx, ty); flammables.set(k, e); entities.push(e); break; }
        case 'f': { const e = new Fuse(tx, ty); flammables.set(k, e); entities.push(e); break; }
        case 'g': { grid[k] = GATE; const e = new Gate(tx, ty); flammables.set(k, e); entities.push(e); break; }
        case 'W': windMask[k] = 1; break;
        case 'o': plates.push({ tx, ty, pressed: false, door: -1 }); break;
        case 'd': grid[k] = DOOR; doorMask[k] = 1; break;
        case 'D': dark[k] = 1; break;
        default:
          if (PROP_CHARS[c]) props.push({ kind: PROP_CHARS[c], tx, ty, ...floorEntity(tx, ty) });
      }
    }
  }
  // Hard borders: side walls and a floor, so nothing falls out of the world.
  for (let ty = 0; ty < h; ty++) { grid[key(0, ty)] = STONE; grid[key(w - 1, ty)] = STONE; }
  for (let tx = 0; tx < w; tx++) grid[key(tx, h - 1)] = STONE;

  // Dark zones from column ranges: [[fromCol, toCol], ...]
  // or rects: [[x0, y0, x1, y1], ...]
  for (const d of data.dark || []) {
    const [x0, y0, x1, y1] = d.length === 4 ? d : [d[0], 0, d[1], h - 1];
    for (let tx = Math.max(0, x0); tx <= Math.min(w - 1, x1); tx++)
      for (let ty = Math.max(0, y0); ty <= Math.min(h - 1, y1); ty++) dark[key(tx, ty)] = 1;
  }

  // Drip emitters: each contiguous run on a row rains as one curtain.
  emitters.sort((a, b) => a.ty - b.ty || a.tx - b.tx);
  let group = -1, last = null;
  const dripOpts = data.drip || {};
  for (const e of emitters) {
    if (!last || last.ty !== e.ty || last.tx !== e.tx - 1) group++;
    const offsets = dripOpts.phases || [];
    e.phase0 = e.t = offsets[group] ?? (group * 1.15) % e.period;
    e.group = group;
    last = e;
  }

  // Wind zones: connected components of W cells, sorted left to right.
  const windSeen = new Uint8Array(w * h);
  const zones = [];
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (!windMask[key(tx, ty)] || windSeen[key(tx, ty)]) continue;
    let x0 = tx, x1 = tx, y0 = ty, y1 = ty;
    const stack = [[tx, ty]];
    windSeen[key(tx, ty)] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = key(nx, ny);
        if (windMask[nk] && !windSeen[nk]) { windSeen[nk] = 1; stack.push([nx, ny]); }
      }
    }
    zones.push({ x: x0 * T, y: y0 * T, w: (x1 - x0 + 1) * T, h: (y1 - y0 + 1) * T });
  }
  zones.sort((a, b) => a.x - b.x);
  const windDefaults = data.wind || {};
  const windOverrides = (data.entities || []).filter((e) => e.type === 'wind');
  zones.forEach((rect, i) => {
    const z = new WindZone(rect, { ...windDefaults, ...(windOverrides[i] || {}) });
    entities.push(z);
  });

  // Doors: connected runs of 'd' cells, left to right. Plate i opens door i
  // (plates also sorted left to right) unless data.links maps plate -> door.
  const doors = [];
  const doorSeen = new Uint8Array(w * h);
  for (let tx = 0; tx < w; tx++) for (let ty = 0; ty < h; ty++) {
    if (!doorMask[key(tx, ty)] || doorSeen[key(tx, ty)]) continue;
    const cells = [];
    const stack = [[tx, ty]];
    doorSeen[key(tx, ty)] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      cells.push([cx, cy]);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = key(nx, ny);
        if (doorMask[nk] && !doorSeen[nk]) { doorSeen[nk] = 1; stack.push([nx, ny]); }
      }
    }
    cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    doors.push({ cells, tx: Math.min(...cells.map((c) => c[0])), open: false, amt: 0, index: doors.length });
  }
  plates.sort((a, b) => a.tx - b.tx || a.ty - b.ty);
  plates.forEach((pl, i) => { pl.door = data.links ? data.links[i] : i; });

  // Movers and moths: given in tile units; they run on the frame clock like wind and rain.
  const movers = [], moths = [];
  for (const e of data.entities || []) {
    if (e.type === 'mover') {
      const [bx, by] = e.to;
      const m = new Mover({ ax: e.x * T, ay: e.y * T, bx: bx * T, by: by * T, w: (e.w || 3) * T, period: e.period, phase: e.phase, style: e.style });
      movers.push(m); entities.push(m);
    } else if (e.type === 'moth') {
      const c = (v) => (v + 0.5) * T;
      const m = e.to
        ? new Moth({ path: 'line', ax: c(e.x), ay: c(e.y), bx: c(e.to[0]), by: c(e.to[1]), period: e.period, phase: e.phase })
        : new Moth({ cx: c(e.x), cy: c(e.y), r: (e.r ?? 2) * T, period: e.period, phase: e.phase });
      moths.push(m); entities.push(m);
    }
  }

  const signs = (data.entities || []).filter((e) => e.type === 'sign').map((s) => ({
    ...s, px: (s.x + 0.5) * T, py: (s.y + 1) * T,
  }));

  const world = {
    name: data.name,
    hint: data.hint || '',
    data,
    w, h,
    pxW: w * T, pxH: h * T,
    tiles,
    grid, dark,
    entities,
    torches, pumpkins, goal, emitters, flammables, props, signs, movers, moths, plates, doors,
    blobs: [],
    spawn,
    checkpoint: { x: spawn.x, y: spawn.y, wax: CFG.WAX_MAX },
    ambient: data.ambient ?? 0.85,
    complete: false,
    time: 0,
    onSplash: null,
    onIgnite: (f) => Events.emit('ignite', { x: f.x + T / 2, y: f.y + T / 2, type: f.type }),

    cell(tx, ty) {
      if (tx < 0 || tx >= w || ty >= h) return STONE;
      if (ty < 0) return EMPTY;
      return grid[ty * w + tx];
    },
    isSolid(tx, ty) { return isFull(this.cell(tx, ty)); },
    isDark(tx, ty) { return tx >= 0 && ty >= 0 && tx < w && ty < h && dark[ty * w + tx] === 1; },
    clearCell(tx, ty) { if (tx > 0 && ty >= 0 && tx < w - 1 && ty < h - 1) grid[ty * w + tx] = EMPTY; },

    blockedForBlob(tx, ty) {
      const f = flammables.get(key(tx, ty));
      return !!(f && f.state !== 'gone');
    },
    addBlob(tx, ty, fromY) {
      if (this.cell(tx, ty) !== EMPTY) return null;
      const b = new WaxBlob(tx, ty, fromY);
      grid[key(tx, ty)] = BLOB;
      this.blobs.push(b);
      return b;
    },
    removeBlob(blob, melted = false) {
      const i = this.blobs.indexOf(blob);
      if (i < 0) return;
      this.blobs.splice(i, 1);
      if (grid[key(blob.tx, blob.ty)] === BLOB) grid[key(blob.tx, blob.ty)] = EMPTY;
      if (melted) Events.emit('melt', { x: blob.x + T / 2, y: blob.y + T });
    },
    nearestBlob(x, y, range) {
      let best = null, bd = range * range;
      for (const b of this.blobs) {
        const dx = b.x + T / 2 - x, dy = b.y + T / 2 - y;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    },

    ignite(tx, ty) {
      const f = flammables.get(key(tx, ty));
      if (f) f.ignite(this);
    },
    touchFlammables(body) {
      if (!flammables.size) return;
      const tx0 = Math.floor((body.x - 3) / T), tx1 = Math.floor((body.x + body.w + 3) / T);
      const ty0 = Math.floor((body.y - 3) / T), ty1 = Math.floor((body.y + body.h + 1) / T);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const f = flammables.get(key(tx, ty));
        if (f && f.state === 'intact' && f.type !== 'gate') f.ignite(this);
      }
    },
    windAt(body) {
      let a = 0;
      for (const e of entities) if (e.type === 'wind') a += e.push(body);
      return a;
    },
    mothHit(body) {
      for (const m of moths) if (m.hits(body)) return m;
      return null;
    },
    windZones() { return entities.filter((e) => e.type === 'wind'); },
    wetAt(body) {
      for (const e of emitters) if (e.wets(body)) return true;
      return false;
    },

    lights(player) {
      const out = [];
      for (const e of entities) {
        const l = e.light;
        if (l) out.push(l);
      }
      if (player && player.alive) {
        const f = player.flamePos();
        out.push({ x: f.x, y: f.y, r: player.lightRadius(), flicker: 0.05 + player.flicker, player: true });
      }
      return out;
    },

    update(dt, player) {
      this.time += dt;
      for (const e of entities) e.update(dt, this, player);
      for (let i = this.blobs.length - 1; i >= 0; i--) this.blobs[i]?.update(dt, this);
      this.updateDoors(player, dt);
    },

    // A plate is held down by wax sitting on it, or by Wick standing on it.
    // Its door is open while any of its plates are held. A closing door never
    // shuts on Wick or on a blob wedged in the doorway.
    updateDoors(player, dt = 0) {
      if (!plates.length) return;
      for (const pl of plates) {
        const onIt = player && player.alive && player.onGround &&
          player.x < (pl.tx + 1) * T && player.x + player.w > pl.tx * T && Math.abs(player.feet - (pl.ty + 1) * T) < 1;
        const was = pl.pressed;
        pl.pressed = grid[key(pl.tx, pl.ty)] === BLOB || !!onIt;
        if (dt > 0 && was !== pl.pressed) Events.emit('plate', { x: (pl.tx + 0.5) * T, y: (pl.ty + 1) * T, down: pl.pressed });
      }
      for (const d of doors) {
        const wasOpen = d.open;
        d.open = plates.some((pl) => pl.door === d.index && pl.pressed);
        if (dt > 0 && wasOpen !== d.open) Events.emit('door', { x: (d.tx + 0.5) * T, y: (d.cells[d.cells.length - 1][1] + 1) * T, open: d.open });
        for (const [cx, cy] of d.cells) {
          const k = key(cx, cy);
          if (d.open) { if (grid[k] === DOOR) grid[k] = EMPTY; continue; }
          if (grid[k] !== EMPTY) continue;
          if (player && player.alive && player.x < (cx + 1) * T && player.x + player.w > cx * T &&
              player.y < (cy + 1) * T && player.y + player.h > cy * T) continue;
          grid[k] = DOOR;
        }
        d.amt += ((d.open ? 1 : 0) - d.amt) * Math.min(1, dt * 10);
      }
    },

    // Respawn at the last lit torch. Melts all blobs; burnt things stay burnt.
    reset(player) {
      for (const b of [...this.blobs]) this.removeBlob(b);
      const cp = this.checkpoint;
      player.spawn(cp.x, cp.y, Math.max(cp.wax, CFG.RESPAWN_MIN));
    },

    // Bot support: capture/restore all mutable state.
    snapshot() {
      return {
        grid: grid.slice(),
        blobs: this.blobs.map((b) => ({ b, age: b.age })),
        flam: [...flammables.values()].map((f) => [f, f.state, f.t, f.spreadDone]),
        torches: torches.map((t) => t.lit),
        pumpkins: pumpkins.map((p) => p.taken),
        goal: goal.lit,
        checkpoint: { ...this.checkpoint },
        complete: this.complete,
        time: this.time,
        ent: entities.filter((e) => e.frames !== undefined).map((e) => [e, e.frames]),
      };
    },
    restore(s) {
      grid.set(s.grid);
      this.blobs = s.blobs.map(({ b, age }) => { b.age = age; return b; });
      for (const [f, st, t, sd] of s.flam) { f.state = st; f.t = t; f.spreadDone = sd; }
      torches.forEach((t, i) => { t.lit = s.torches[i]; });
      pumpkins.forEach((p, i) => { p.taken = s.pumpkins[i]; });
      goal.lit = s.goal;
      this.checkpoint = { ...s.checkpoint };
      this.complete = s.complete;
      this.time = s.time;
      for (const [e, f] of s.ent) { e.frames = f; if (e.sync) e.sync(); else e.t = (e.phase0 + f * CFG.STEP) % e.period; }
    },
  };
  return world;
}
