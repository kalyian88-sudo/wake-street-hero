/**
 * SIM TUNING — every number that shapes how the game FEELS lives here.
 * Units: metres, seconds, radians (angles written as degrees are converted with DEG).
 *
 * Feel targets (wakeboard, neutral gear, medium power):
 *   flat pop      tap ≈ 0.5 m, full charge ≈ 1.6 m apex / ≈ 1.2 s of air
 *   wooden kicker full charge released at the lip ≈ 3.4 m apex / ≈ 1.5 s of air
 *   360 / backroll  comfortable from a full flat pop;  540 does NOT come round from flat with neutral gear
 *   720             needs a kicker;  1080 needs a kicker + fast power + an instant spin
 *   wakeskate       ≈ 70 % of the pop height, kickflip ≈ 0.45 s
 */
import { DEG } from '../data/geometry';
import type { BoardKind, GearStats, SurfaceKind } from '../types';

// ─────────────────────────────────────────────────────────────── Shared ──

export const SIM = {
  /** Largest internal integration step. */
  maxStep: 1 / 120,

  // ── gravity: G far from the apex, floaty near it (hang time reads well in slow-mo) ──
  gravity: 13.5,
  /** Fraction of gravity removed at the very apex. */
  hang: 0.5,
  /** Vertical speed (m/s) below which the hang effect kicks in. */
  hangSpeed: 3,
  /** Horizontal air drag 1/s. */
  airDrag: 0.04,
  /** Sideways nudge in the air (m/s²) while no trick button is held — lines up rail landings. */
  airControl: 2.2,
  /** Rope pull gain is weaker in the air (body is not braced against an edge). */
  airRopeGain: 0.7,

  // ── ground following ──
  /** Highest ledge the board rides up without help (slab 0.12, stair risers 0.15). */
  stepUp: 0.3,
  /** Deeper drops than this become air. */
  stepDown: 0.32,
  /** Gaps in the ground shorter than this (m) are bridged instead of dropping. */
  gapBridge: 0.3,
  /** Rate (1/s) at which the board height catches up after a small step. */
  stepSmooth: 22,

  // ── rope & winch (PLAN §4.1) ──
  /** Slack (m) in the rope while waiting at the start. */
  startSlack: 0.8,
  /** Speed (m/s) at which the start slack is taken up before the pull begins. */
  startTakeUp: 2.2,
  /** Seconds for the drum to reach full speed after the rope goes tight. */
  reelRamp: 1.5,
  /** Shorter ramp after a respawn. */
  respawnRamp: 1.1,
  /** Elastic gain 1/s: radial speed deficit → pull acceleration. */
  ropeGain: 4,
  /** Extra target speed (m/s) per metre of stretch — lets the rider catch the drum up. */
  stretchGain: 2.5,
  /** Rope cannot stretch more than this; beyond it the drum slips. */
  maxStretch: 1.5,
  /** Pull acceleration cap m/s². */
  maxPull: 16,
  /** Pull that reads as tension = 1. */
  tensionRef: 9,
  /** The drum takes slack up this much faster than its normal speed. */
  slackReel: 1.15,
  /** Fraction of the speed deficit handed over instantly when the rope snaps tight. */
  jerkImpulse: 0.45,
  /** 'sim:ropeJerk' is emitted above this (m/s). */
  jerkEvent: 2.5,
  /** Decay rate of rope.jerk 1/s. */
  jerkDecay: 2.5,
  /** A jerk this recent (s) counts as "at the moment of landing". */
  landingJerkWindow: 0.3,
  /** Reach from the board centre to the handle (m). */
  handleReach: 0.6,
  handleHeight: 1.02,
  handleCrouchDrop: 0.36,
  /** Released handle: how far ahead of the rider the winch drags it before the operator idles. */
  releasedLead: 7,
  /** Seconds for the tension to ramp in after a re-grab. */
  regrabRamp: 0.45,
  /** Run ends when the rope is this short even if the rider never got there. */
  minRope: 4,
  /** Rider pinned somewhere with the rope stretched this far for stuckTime → bail. */
  stuckStretch: 1.45,
  stuckTime: 1.6,

  // ── water ──
  /** Drag deceleration = lin·v + quad·v². */
  waterDragLin: 0.08,
  waterDragQuad: 0.03,
  /** Below this speed the board stops planing and sinks (extra drag). */
  planingSpeed: 3,
  sinkDrag: 2.4,
  /** Heading turn rate cap rad/s. */
  turnRate: 2.6,
  /** Free steering (handle released) rad/s at full stick. */
  freeTurn: 1.5,

  // ── collisions ──
  /** Hitting a face steeper than this (sine of the angle to the face) above bailSpeed = bail. */
  headOnSin: 0.82,
  bailSpeed: 4,
  /** Share of speed lost on a glancing hit at the limit angle. */
  deflectLoss: 0.4,
  /** Continuous scrape deceleration while pressed against a face. */
  scrapeDrag: 1.6,
  /** Soft zone outside spot.bounds before the bail. */
  boundsSoft: 3,
  boundsPush: 9,

  // ── solid ground ──
  stallSpeed: 1.5,
  stallTime: 0.9,
  /** Kicker faces are wet and waxed: friction multiplier. */
  rampFriction: 0.25,
  /** Last part of a kicker (1 − lipZone … 1) where releasing JUMP gives the full boost. */
  lipZone: 0.35,
  /** Boost as a fraction of the flat pop speed: perfect release in the lip zone … */
  lipBoost: 0.52,
  /** … JUMP simply held through the lip … */
  holdBoost: 0.42,
  /** … released too early on the ramp. */
  earlyBoost: 0.3,

  // ── rails ──
  /** Rails whose top is at most this far above the surface are hopped onto automatically. */
  railAutoHeight: 0.68,
  /** Board must travel within this angle of the rail. */
  railAlign: Math.cos(40 * DEG),
  railMinSpeed: 2.5,
  /** Vertical window for locking on from the air: below / above the rail top. */
  railSnapBelow: 0.16,
  railSnapAbove: 0.3,
  /** Max climb rate relative to the rail (m/s) to count as "descending or level". */
  railMaxRise: 0.8,
  /** Seconds the hop onto a low rail takes. */
  railHopTime: 0.14,
  railEndHop: 1.7,
  railPopScale: 0.85,
  /** Share of gravity felt along a sloped rail. */
  railSlopeGravity: 0.45,
  railRelock: 0.55,
  /** Rail must be ridden at least this far (m) to score. */
  railMinDistance: 0.8,
  /** Balance: instability 1/s, wobble amplitude 1/s, stick authority 1/s. */
  balanceInstability: 1.15,
  balanceWobble: 0.5,
  balanceControl: 2.6,
  /** Extra wobble per m/s above 8 m/s. */
  balanceSpeed: 0.035,
  balanceSlope: 0.9,
  /** Seconds a board stance change takes on the rail. */
  railStanceTime: 0.2,

  // ── wallride ──
  wallMaxTime: 1.6,
  wallMinSpeed: 4.5,
  /** Steeper than this into the wall = slam. */
  wallMaxSin: Math.sin(52 * DEG),
  wallContact: 0.14,
  /** Climb speed = base + share of the speed into the wall. */
  wallClimbBase: 1.6,
  wallClimbGain: 0.75,
  wallGravity: 5.2,
  wallSinkMax: 1.3,
  wallDrag: 0.7,
  wallPopOut: 3.2,
  wallMinScore: 0.25,

  // ── bail / respawn ──
  respawnTime: 2.0,
  respawnSpeed: 2.2,
  /** How far ahead on the line (m) the search for a respawn point starts, and how far it looks. */
  respawnAhead: 4,
  respawnSearch: 60,
  respawnClear: 1.3,

  // ── tricks (shared) ──
  surfaceSpinTime: 0.3,
  /** slowMo goes back to 0 this many seconds before touchdown. */
  slowMoCutoff: 0.14,
  slowMoIn: 12,
  slowMoOut: 7,
} as const;

/** Sliding friction (m/s²) and edge grip (1/s) per surface. Water uses the drag model instead. */
export const SURFACE: Record<SurfaceKind, { friction: number; grip: number; carve: number; solid: boolean }> = {
  water: { friction: 0, grip: 9, carve: 1, solid: false },
  wetConcrete: { friction: 1.1, grip: 1.4, carve: 0.3, solid: true },
  tile: { friction: 1.4, grip: 1.6, carve: 0.3, solid: true },
  wood: { friction: 2.6, grip: 2.4, carve: 0.35, solid: true },
  metal: { friction: 2.2, grip: 2.0, carve: 0.3, solid: true },
  concrete: { friction: 4.4, grip: 3.2, carve: 0.4, solid: true },
  stone: { friction: 4.0, grip: 3.0, carve: 0.4, solid: true },
  asphalt: { friction: 5.2, grip: 3.6, carve: 0.4, solid: true },
  grass: { friction: 8, grip: 4.5, carve: 0.3, solid: true },
  sand: { friction: 9.5, grip: 5, carve: 0.25, solid: true },
};

/** Surfaces on which running out of speed is a fall ('stalled'). */
export function isRough(kind: SurfaceKind): boolean {
  return SURFACE[kind].friction >= 2;
}

/** Vertical acceleration (positive number) for a vertical speed — reduced near the apex. */
export function gravityAt(vy: number): number {
  const u = vy / SIM.hangSpeed;
  return SIM.gravity * (1 - SIM.hang * Math.exp(-u * u));
}

// ──────────────────────────────────────────────────────────── Per board ──

export interface BoardTuning {
  /** Pop take-off speed (m/s) for a tap and for a full charge. */
  popMin: number;
  popMax: number;
  /** Seconds of JUMP hold for a full charge. */
  chargeTime: number;
  /** Max carve angle off the rope direction (rad) and how fast the board follows the stick (1/s). */
  carveMax: number;
  carveRate: number;
  /** Edge grip multiplier on water (fins / channels vs. a flat skate deck). */
  grip: number;
  /** Base yaw rate rad/s and the multiplier per queued half-turn (index = number of 180s, clamped). */
  spinRate: number;
  spinTuck: readonly number[];
  /** Seconds to reach full rotation speed. */
  spinRamp: number;
  /** Invert rate rad/s; doubles tuck tighter. */
  rollRate: number;
  rollTuck: number;
  /** Rail balance difficulty multiplier. */
  railDrift: number;
  /** Wakeskate boneless: pop multiplier. */
  bonelessBoost: number;
}

export const BOARD: Record<BoardKind, BoardTuning> = {
  wakeboard: {
    popMin: 2.95,
    popMax: 6.1,
    chargeTime: 0.7,
    carveMax: 50 * DEG,
    carveRate: 4.2,
    grip: 1,
    spinRate: 420 * DEG,
    spinTuck: [1, 1, 1, 1, 1.27, 1.47, 1.655],
    spinRamp: 0.1,
    rollRate: 470 * DEG,
    rollTuck: 1.12,
    railDrift: 1,
    bonelessBoost: 1,
  },
  wakeskate: {
    // ≈ 70 % of the wakeboard's height → √0.7 of its speed
    popMin: 2.6,
    popMax: 5.1,
    chargeTime: 0.6,
    carveMax: 46 * DEG,
    carveRate: 4.8,
    grip: 0.72,
    spinRate: 400 * DEG,
    spinTuck: [1, 1, 1, 1, 1.2, 1.35, 1.5],
    spinRamp: 0.1,
    rollRate: 0,
    rollTuck: 1,
    railDrift: 1.12,
    bonelessBoost: 1.1,
  },
};

/** Pop take-off speed for a charge 0..1. */
export function popSpeed(tune: BoardTuning, charge: number): number {
  const c = charge < 0 ? 0 : charge > 1 ? 1 : charge;
  return tune.popMin + (tune.popMax - tune.popMin) * Math.pow(c, 0.85);
}

// ────────────────────────────────────────────────────────────── Tricks ──

export const TRICK = {
  /** Stick deflection that counts as a direction. */
  dirThreshold: 0.45,
  /** TRICK held this long with a neutral stick = raley (wakeboard). Shorter = shifty. */
  raleyHold: 0.25,
  raleyIn: 5.5,
  raleyOut: 6.5,
  /** Raley must be stretched at least this long to count. */
  raleyMin: 0.22,
  shiftyTime: 0.5,
  grabIn: 7,
  grabOut: 9,
  /** Hold counted while the hand is on the board (blend above this). */
  grabOn: 0.75,
  /** A grab shorter than this is not scored. */
  grabMin: 0.12,
  /** Touching down with the hand still this far on the board = "still grabbing". */
  grabLandBlend: 0.45,
  /** Flip progress where the catch window opens, and the late side width (in progress units). */
  catchOpen: 0.55,
  catchLate: 0.42,
  /** Board keeps turning after a full flip until this progress, then it is gone. */
  flipOverrun: 1.6,
  /** Catch quality below this still counts but lands sketchy (passed on as catchQuality). */
  handlePassMin: 360,
} as const;

// ──────────────────────────────────────────────────────────── Gear stats ──

export interface StatMods {
  /** Pop speed multiplier (height ±18 %). */
  pop: number;
  /** Rotation speed multiplier (±20 %). */
  spin: number;
  /** Rail drift multiplier (good gear = less drift, ∓30 %). */
  railDrift: number;
  /** Catch window width multiplier (±40 %). */
  catchWindow: number;
  /** Passed straight to judgeLanding. */
  landing: number;
}

/** GearStats are 0..10 with 5 = neutral. */
export function statMods(stats: GearStats): StatMods {
  const u = (v: number): number => Math.min(1, Math.max(-1, (v - 5) / 5));
  return {
    pop: Math.sqrt(1 + 0.18 * u(stats.pop)),
    spin: 1 + 0.2 * u(stats.spin),
    railDrift: 1 - 0.3 * u(stats.rail),
    catchWindow: 1 + 0.4 * u(stats.catch),
    landing: Math.min(10, Math.max(0, stats.landing)),
  };
}

/**
 * Seconds until a body at height `h` above the ground with vertical speed `vy` touches down
 * (uses the same gravity law as the sim; pure arithmetic, no allocations).
 */
export function fallTime(h: number, vy: number): number {
  if (h <= 0 && vy <= 0) return 0;
  let t = 0;
  let y = h;
  let v = vy;
  const dt = 1 / 60;
  for (let i = 0; i < 360; i++) {
    v -= gravityAt(v) * dt;
    const ny = y + v * dt;
    if (ny <= 0 && v < 0) return t + (y > 0 ? (y / (y - ny)) * dt : 0);
    y = ny;
    t += dt;
  }
  return t;
}

/** Apex height above the take-off point for a vertical take-off speed. */
export function apexHeight(vy: number): number {
  let y = 0;
  let v = vy;
  const dt = 1 / 120;
  while (v > 0) {
    v -= gravityAt(v) * dt;
    y += v * dt;
  }
  return y;
}
