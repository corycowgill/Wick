// Tile collision: axis-separated AABB resolve against the world grid.
import { CFG } from './config.js';

// Grid cell kinds
export const EMPTY = 0;
export const STONE = 1;
export const ONEWAY = 2;
export const BLOB = 3;
export const COBWEB = 4;
export const GATE = 5;
export const EMITTER = 6;
export const DOOR = 7;

export const isFull = (k) => k === STONE || k === BLOB || k === COBWEB || k === GATE || k === EMITTER || k === DOOR;
// Anything that blocks rain or counts as support for a wax blob.
export const isShelter = (k) => k !== EMPTY;

const EPS = 0.001;

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// True if the rectangle overlaps any full-solid cell.
export function rectBlocked(world, x, y, w, h) {
  const T = CFG.TILE;
  const tx0 = Math.floor(x / T), tx1 = Math.floor((x + w - EPS) / T);
  const ty0 = Math.floor(y / T), ty1 = Math.floor((y + h - EPS) / T);
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      if (isFull(world.cell(tx, ty))) return true;
  return false;
}

// Moves body {x,y,w,h} by dx, dy. Returns contact flags.
export function moveAndCollide(body, dx, dy, world) {
  const T = CFG.TILE;
  const res = { hitX: 0, landed: false, ceiling: false };

  // X axis
  if (dx !== 0) {
    body.x += dx;
    const ty0 = Math.floor(body.y / T), ty1 = Math.floor((body.y + body.h - EPS) / T);
    if (dx > 0) {
      const tx = Math.floor((body.x + body.w - EPS) / T);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (isFull(world.cell(tx, ty))) { body.x = tx * T - body.w; res.hitX = 1; break; }
      }
    } else {
      const tx = Math.floor(body.x / T);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (isFull(world.cell(tx, ty))) { body.x = (tx + 1) * T; res.hitX = -1; break; }
      }
    }
  }

  // Y axis
  if (dy !== 0) {
    const prevBottom = body.y + body.h;
    body.y += dy;
    const tx0 = Math.floor(body.x / T), tx1 = Math.floor((body.x + body.w - EPS) / T);
    if (dy > 0) {
      const ty = Math.floor((body.y + body.h - EPS) / T);
      for (let tx = tx0; tx <= tx1; tx++) {
        const k = world.cell(tx, ty);
        if (isFull(k) || (k === ONEWAY && prevBottom <= ty * T + 0.5)) {
          body.y = ty * T - body.h; res.landed = true; break;
        }
      }
      // moving platforms: one-way tops (allow for a lift that rose this frame)
      if (world.movers && world.movers.length) {
        for (const m of world.movers) {
          if (body.x >= m.x + m.w || body.x + body.w <= m.x) continue;
          if (prevBottom > m.y + 0.5 + Math.max(0, -m.dy)) continue;
          const bottom = body.y + body.h;
          if (bottom < m.y) continue;
          body.y = Math.min(body.y, m.y - body.h);
          res.landed = true; res.mover = m;
        }
      }
    } else {
      const ty = Math.floor(body.y / T);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (isFull(world.cell(tx, ty))) { body.y = (ty + 1) * T; res.ceiling = true; break; }
      }
    }
  }
  return res;
}
