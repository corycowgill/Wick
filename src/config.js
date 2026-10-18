// All tuning lives here. Change numbers in one place.
export const CFG = {
  // display
  VIEW_W: 960,
  VIEW_H: 540,
  STEP: 1 / 60,
  MAX_DPR: 2,

  // world
  TILE: 32,

  // wax
  WAX_MAX: 100,
  DRAIN_IDLE: 0.8,        // per second, always burning
  DRAIN_MOVE: 1.6,        // per second while moving horizontally
  JUMP_COST: 2,
  DRIP_COST: 8,
  DRIP_MIN_LEFT: 5,       // cannot drip if wax would fall below this
  TORCH_REFILL: 40,
  PUMPKIN_REFILL: 15,
  RESPAWN_MIN: 70,        // respawn wax = max(wax at checkpoint, this). Tuned up from 50 so no torch soft-locks

  // body
  BODY_W: 24,
  BODY_H_MIN: 20,
  BODY_H_MAX: 56,
  GROW_RATE: 150,          // px/s the body grows back after a refill

  // movement
  GRAVITY: 3000,         // scaled with RUN_SPEED (g ~ speed^2) so jump heights AND reach match the level design
  MAX_FALL: 1160,
  RUN_SPEED: 220,
  ACCEL: 2200,
  FRICTION: 2800,
  AIR_CONTROL: 0.95,
  JUMP_APEX_MIN: 0.9,     // tiles at zero wax
  JUMP_APEX_RANGE: 2.3,   // extra tiles at full wax
  JUMP_CUT: 0.45,         // vy multiplier when jump released early
  COYOTE: 0.1,
  JUMP_BUFFER: 0.12,
  // feel
  FALL_GRAVITY_MULT: 1.15,  // a bit heavier on the way down: snappier jumps
  APEX_HANG_VEL: 104,       // near the top of a held jump...
  APEX_HANG_MULT: 0.55,     // ...gravity eases off for a moment of hang time
  TURN_BOOST: 1.8,          // extra acceleration when reversing direction
  CORNER_NUDGE: 7,          // px: slide around ceiling corners instead of bonking
  LEDGE_ASSIST: 10,         // px: pop up onto a ledge you just barely missed

  // light
  LIGHT_MIN: 70,
  LIGHT_RANGE: 230,
  TORCH_LIGHT: 200,
  TORCH_EMBER_LIGHT: 46,
  PUMPKIN_LIGHT: 110,
  PUMPKIN_IDLE_LIGHT: 46,
  GOAL_LIGHT: 320,
  FIRE_LIGHT: 60,

  // hazards
  WIND_PUSH: 540,         // px/s^2 ramp while a gust blows
  WIND_MAX: 194,          // px/s top wind speed
  WIND_WARN: 1.0,         // seconds of leaf swirl before a gust
  WIND_FLICKER: 0.15,
  WATER_KILL_TIME: 0.6,   // seconds exposed to a drip column
  DRIP_ON: 1.7,           // emitter cycle (seconds raining)
  DRIP_OFF: 1.5,          // emitter cycle (seconds dry)
  MOTH_STEAL: 12,         // wax a moth takes when it brushes Wick
  MOTH_INVULN: 1.0,       // seconds before another moth can hit

  // wax blobs
  BLOB_LIFE: 14,
  BLOB_SAG: 3,
  REABSORB_FRAC: 0.5,
  REABSORB_RANGE: 60,
  DRIP_BUFFER: 0.3,       // seconds an airborne drip keeps trying to find room

  // flow
  DEATH_DELAY: 0.6,
  LEVEL_CARD_TIME: 1.6,
  GOAL_DELAY: 1.2,
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
