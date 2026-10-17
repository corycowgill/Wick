// Wick: the candle-cat. Wax is health, height, jump and light.
import { CFG, lerp, clamp } from './config.js';
import { moveAndCollide, rectBlocked, isShelter, EMPTY } from './physics.js';
import { Events } from './events.js';

export class Player {
  constructor() {
    this.spawn(64, 64, CFG.WAX_MAX);
  }

  // x = center, y = feet
  spawn(cx, feetY, wax) {
    this.wax = clamp(wax, 0, CFG.WAX_MAX);
    this.w = CFG.BODY_W;
    this.h = this.targetHeight();
    this.x = cx - this.w / 2;
    this.y = feetY - this.h;
    this.vx = 0;
    this.vy = 0;
    this.windVx = 0;
    this.facing = 1;
    this.onGround = true;
    this.alive = true;
    this.deathReason = null;
    this.deathTimer = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumping = false;
    this.wetTime = 0;
    this.flicker = 0;
    this.squash = 0;       // + = squashed (wide), - = stretched (tall)
    this.landTimer = 0;
    this.steamTimer = 0;
    this.dripBuffer = 0;   // an airborne drip waits briefly until there is room under you
    this.stats = { jumps: 0, drips: 0 };
  }

  waxFrac() { return clamp(this.wax / CFG.WAX_MAX, 0, 1); }
  targetHeight() { return lerp(CFG.BODY_H_MIN, CFG.BODY_H_MAX, this.waxFrac()); }
  jumpVelocity() {
    const apex = (CFG.JUMP_APEX_MIN + CFG.JUMP_APEX_RANGE * this.waxFrac()) * CFG.TILE;
    return Math.sqrt(2 * CFG.GRAVITY * apex);
  }
  lightRadius() { return CFG.LIGHT_MIN + CFG.LIGHT_RANGE * this.waxFrac(); }
  get cx() { return this.x + this.w / 2; }
  get feet() { return this.y + this.h; }
  // flame position (top of head)
  flamePos() { return { x: this.cx, y: this.y - 6 }; }

  refill(amount) {
    this.wax = Math.min(CFG.WAX_MAX, this.wax + amount);
  }

  kill(reason) {
    if (!this.alive) return;
    this.alive = false;
    this.deathReason = reason;
    this.deathTimer = CFG.DEATH_DELAY;
    this.vx = 0; this.windVx = 0;
    Events.emit('death', { reason, x: this.cx, y: this.feet });
  }

  update(dt, input, world) {
    if (!this.alive) {
      this.deathTimer -= dt;
      // the stub still falls if it died mid-air
      this.vy = Math.min(this.vy + CFG.GRAVITY * dt, CFG.MAX_FALL);
      const r = moveAndCollide(this, 0, this.vy * dt, world);
      if (r.landed) this.vy = 0;
      return;
    }

    // --- height follows wax, anchored at the feet ---
    const target = this.targetHeight();
    if (target < this.h) {
      this.y += this.h - target;
      this.h = target;
    } else if (target > this.h) {
      const nh = Math.min(target, this.h + CFG.GROW_RATE * dt);
      if (!rectBlocked(world, this.x, this.y + this.h - nh, this.w, nh)) {
        this.y += this.h - nh;
        this.h = nh;
      }
    }

    // --- horizontal ---
    const mx = input.moveX || 0;
    const ctrl = this.onGround ? 1 : CFG.AIR_CONTROL;
    if (Math.abs(mx) > 0.01) {
      const targetV = mx * CFG.RUN_SPEED;
      const a = CFG.ACCEL * Math.max(0.35, Math.abs(mx)) * ctrl;
      this.vx = approach(this.vx, targetV, a * dt);
      this.facing = mx > 0 ? 1 : -1;
    } else {
      this.vx = approach(this.vx, 0, CFG.FRICTION * ctrl * dt);
    }

    // --- wind ---
    const wind = world.windAt ? world.windAt(this) : 0;
    if (wind !== 0) {
      this.windVx = clamp(this.windVx + wind * dt, -CFG.WIND_MAX, CFG.WIND_MAX);
      this.flicker = CFG.WIND_FLICKER;
    } else {
      this.windVx = approach(this.windVx, 0, (this.onGround ? 600 : 260) * dt);
      this.flicker = Math.max(0, this.flicker - dt * 0.5);
    }

    // --- jump with coyote time and buffer ---
    this.coyote = this.onGround ? CFG.COYOTE : this.coyote - dt;
    this.jumpBuffer = input.jumpPressed ? CFG.JUMP_BUFFER : this.jumpBuffer - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = -this.jumpVelocity();
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumping = true;
      this.wax -= CFG.JUMP_COST;
      this.squash = -0.28;
      this.stats.jumps++;
      Events.emit('jump', { x: this.cx, y: this.feet, frac: this.waxFrac() });
    }
    if (this.jumping && !input.jumpHeld && this.vy < 0) {
      this.vy *= CFG.JUMP_CUT;
      this.jumping = false;
    }
    if (this.vy >= 0) this.jumping = false;

    // --- gravity + move ---
    this.vy = Math.min(this.vy + CFG.GRAVITY * dt, CFG.MAX_FALL);
    const fallSpeed = this.vy;
    const res = moveAndCollide(this, (this.vx + this.windVx) * dt, this.vy * dt, world);
    if (res.hitX) {
      if (Math.sign(this.vx) === res.hitX) this.vx = 0;
      if (Math.sign(this.windVx) === res.hitX) this.windVx = 0;
    }
    if (res.ceiling) this.vy = 0;
    const wasGround = this.onGround;
    if (res.landed) {
      if (!wasGround && fallSpeed > 260) {
        const hard = clamp((fallSpeed - 260) / 600, 0, 1);
        this.squash = 0.18 + 0.25 * hard;
        Events.emit('land', { x: this.cx, y: this.feet, hard, frac: this.waxFrac() });
      }
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    this.squash *= Math.exp(-10 * dt);

    // --- burning: wax drain ---
    const moving = Math.abs(mx) > 0.01 && Math.abs(this.vx) > 15;
    this.wax -= (moving ? CFG.DRAIN_MOVE : CFG.DRAIN_IDLE) * dt;

    // --- abilities ---
    if (input.dripPressed) {
      // in the air, keep trying for a moment (jump + drip pressed together still stacks)
      if (!this.drip(world, !this.onGround) && !this.onGround && this.canAffordDrip()) this.dripBuffer = CFG.DRIP_BUFFER;
    } else if (this.dripBuffer > 0) {
      this.dripBuffer -= dt;
      if (this.drip(world, true)) this.dripBuffer = 0;
      else if (this.dripBuffer <= 0 || this.onGround) {
        this.dripBuffer = 0;
        Events.emit('dripFail', { x: this.cx, y: this.y, reason: 'space' });
      }
    }
    if (input.reabsorbPressed) this.reabsorb(world);

    // --- flammables: the flame lights anything it touches ---
    if (world.touchFlammables) world.touchFlammables(this);

    // --- water ---
    const wet = world.wetAt ? world.wetAt(this) : false;
    if (wet) {
      this.wetTime += dt;
      this.steamTimer -= dt;
      if (this.steamTimer <= 0) {
        this.steamTimer = 0.07;
        const f = this.flamePos();
        Events.emit('steam', { x: f.x, y: f.y });
      }
      if (this.wetTime >= CFG.WATER_KILL_TIME) this.kill('water');
    } else {
      this.wetTime = Math.max(0, this.wetTime - dt * 1.5);
    }

    if (this.wax <= 0) {
      this.wax = 0;
      this.kill('burnout');
    }
  }

  canAffordDrip() { return this.wax - CFG.DRIP_COST >= CFG.DRIP_MIN_LEFT; }

  // Signature mechanic: drip a 1x1 wax blob. Returns true if placed.
  // `quiet` suppresses the failure event (used while an airborne drip is buffered).
  drip(world, quiet = false) {
    if (!this.canAffordDrip()) {
      Events.emit('dripFail', { x: this.cx, y: this.y, reason: 'wax' });
      return false;
    }
    const cell = this.findDripCell(world);
    if (!cell) {
      if (!quiet) Events.emit('dripFail', { x: this.cx, y: this.y, reason: 'space' });
      return false;
    }
    if (cell.lift) {
      // the blob forms under Wick and pushes them up a tile
      this.y -= CFG.TILE;
      this.vy = Math.min(this.vy, 0);
      this.squash = -0.2;
    }
    world.addBlob(cell.tx, cell.ty, cell.fromY);
    this.wax -= CFG.DRIP_COST;
    this.stats.drips++;
    Events.emit('drip', { x: (cell.tx + 0.5) * CFG.TILE, y: (cell.ty + 0.5) * CFG.TILE });
    return true;
  }

  findDripCell(world) {
    const T = CFG.TILE;
    const feet = this.feet;
    const below = this.onGround ? Math.round(feet / T) : Math.ceil(feet / T - 0.001);
    const foot = below - 1;
    // look a little ahead on the ground so dripping near (not exactly at) a ledge still bridges
    const ahead = this.onGround ? 12 : 2;
    const front = this.facing > 0 ? Math.floor((this.x + this.w + ahead) / T) : Math.floor((this.x - ahead) / T);
    const centerTx = Math.floor(this.cx / T);
    const tries = [];
    if (this.onGround) {
      tries.push([front, below, false]);          // bridge over a gap
      tries.push([front, foot, false]);           // a step in front
      // one further only when the front cell is open (Wick overlaps it); never through a wall
      if (world.cell(front, foot) === EMPTY) tries.push([front + this.facing, foot, false]);
    } else {
      tries.push([centerTx, below, true]);        // drip falls under you
      tries.push([front, below, true]);
    }
    for (const [tx, ty, falls] of tries) {
      const c = this.resolveDrip(world, tx, ty, falls);
      if (c) return c;
    }
    // blocked in front (a wall)? build under yourself and rise on it
    if (this.onGround) {
      const ty = foot;
      if (world.cell(centerTx, ty) === EMPTY && !(world.blockedForBlob && world.blockedForBlob(centerTx, ty)) &&
          !rectBlocked(world, this.x, this.y - T, this.w, this.h) &&
          !rectBlocked(world, centerTx * T, ty * T, T, T)) {
        return { tx: centerTx, ty, fromY: ty * T, lift: true };
      }
    }
    return null;
  }

  // A blob sticks if its cell is supported or touches a solid side; otherwise it falls.
  resolveDrip(world, tx, ty, falls) {
    const T = CFG.TILE;
    if (tx < 0 || tx >= world.w || ty < 0 || ty >= world.h) return null;
    const startY = ty;
    for (let y = ty; y < world.h; y++) {
      if (world.cell(tx, y) !== EMPTY) return null;
      if (world.blockedForBlob && world.blockedForBlob(tx, y)) return null;
      const r = { x: tx * T, y: y * T, w: T, h: T };
      if (r.x < this.x + this.w && r.x + T > this.x && r.y < this.y + this.h && r.y + T > this.y) return null;
      const supported = isShelter(world.cell(tx, y + 1)) ||
        isShelter(world.cell(tx - 1, y)) || isShelter(world.cell(tx + 1, y));
      if (supported) return { tx, ty: y, fromY: startY * T };
      if (!falls) return null;
    }
    return null;
  }

  reabsorb(world) {
    const blob = world.nearestBlob ? world.nearestBlob(this.cx, this.y + this.h / 2, CFG.REABSORB_RANGE) : null;
    if (!blob) return false;
    world.removeBlob(blob);
    this.refill(CFG.DRIP_COST * CFG.REABSORB_FRAC);
    Events.emit('reabsorb', { x: blob.x + CFG.TILE / 2, y: blob.y + CFG.TILE / 2, tx: this.cx, ty: this.y });
    return true;
  }
}

function approach(v, target, step) {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return v;
}
