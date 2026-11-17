/**
 * SIMULATION CONTRACTS — state produced by the rider simulation (physics + trick state machine)
 * and consumed by the rig, camera, HUD, audio, particles, objectives and replay.
 *
 * The sim is HEADLESS: files under src/physics, src/tricks, src/career may import `three` math
 * classes only (Vector3 etc.) — never DOM, WebGL or anything from src/world, src/rider, src/ui.
 */
import type { Vector3 } from 'three';
import type {
  BoardKind,
  FlipId,
  GearStats,
  GrabId,
  InvertId,
  L10n,
  PowerLevel,
  RailStance,
  SpotDef,
  Stance,
  SurfaceKind,
} from './data';

// ───────────────────────────────────────────────────────────────── Input ──

export interface ButtonState {
  /** Currently held. */
  down: boolean;
  /** Went down since the previous poll. */
  pressed: boolean;
  /** Went up since the previous poll. */
  released: boolean;
}

/**
 * One frame of player input.
 * steer > 0  → towards SCREEN RIGHT = rider's right of travel (−X when travelling +Z, decreasing yaw).
 * pitch > 0  → stick pushed UP/away.
 */
export interface InputFrame {
  steer: number;
  pitch: number;
  jump: ButtonState;
  trick: ButtonState;
  /** GRAB on the wakeboard, FLIP on the wakeskate (same physical button). */
  grab: ButtonState;
  /** Toggle rope handle (release / re-grab). */
  handlePressed: boolean;
  /**
   * One-shot "pop now with this charge" (0..1) — the swipe controls pop instantly instead of charging a
   * held button. Off a kicker it counts as a perfectly timed lip release. 0 / undefined = none.
   */
  popNow?: number;
  /** Activate HERO mode. */
  heroPressed: boolean;
  pausePressed: boolean;
}

// ───────────────────────────────────────────────────────────── Rider state ──

export type RiderMode =
  | 'waiting' // sitting at the start, rope not pulling yet
  | 'water' // riding on water
  | 'slide' // sliding on a solid surface (concrete, kicker face, ledge top)
  | 'air'
  | 'rail' // grinding a rail / ledge edge / pipe
  | 'wall' // wallride
  | 'bail' // fallen (ragdoll-ish tumble, then resurfacing)
  | 'finished';

export type TakeoffKind = 'pop' | 'kicker' | 'rail' | 'wall' | 'drop' | 'ledge';

export type BailReason =
  | 'underRotated' // spin not finished
  | 'inverted' // landed mid-invert
  | 'grabbed' // still grabbing at touchdown
  | 'boardLost' // wakeskate flip not caught
  | 'ropeJerk' // rope snapped tight at touchdown
  | 'balance' // fell off a rail
  | 'collision' // hit a wall / bank
  | 'hardLanding' // too hard / on a bad surface
  | 'stalled' // ran out of speed on concrete
  | 'outOfBounds';

export type LandingQuality = 'perfect' | 'clean' | 'sketchy' | 'bail';

/** Wakeskate board rotation RELATIVE TO THE FEET (radians). */
export interface FlipState {
  id: FlipId | null;
  /** About the board's long axis (kickflip +, heelflip −). */
  roll: number;
  /** About the vertical axis (shuvits). */
  yaw: number;
  /** About the board's lateral axis (impossible wraps). */
  pitch: number;
  /** 0..1 progress of the current flip. */
  progress: number;
  /** Board is under the feet (no flip, or flip caught). */
  caught: boolean;
  /** 0..1 — how good a catch would be RIGHT NOW (1 = perfect). 0 when nothing to catch. */
  catchWindow: number;
}

export interface AirState {
  /** Seconds since takeoff (sim time). 0 when not airborne. */
  time: number;
  /** Board height above the surface below. */
  height: number;
  /** Max height reached in this air. */
  peak: number;
  takeoff: TakeoffKind;
  /** boardYaw at takeoff. */
  takeoffYaw: number;
  /** Yaw rotation done since takeoff (rad, + = left / CCW from above). boardYaw = takeoffYaw + spin. */
  spin: number;
  spinTarget: number;
  /** Invert rotation about the board's LONG axis (rad). + = backroll/tantrum direction (over the heels), − = frontroll. */
  roll: number;
  rollTarget: number;
  invert: InvertId | null;
  /** 0..1 pose blend of a raley (body stretched out behind the handle). */
  raley: number;
  /** −1..1 shifty (board twisted, shoulders counter-twisted). */
  shifty: number;
  grab: GrabId | null;
  /** 0..1 how far the hand has reached the board. */
  grabBlend: number;
  /** Seconds the current grab has been held. */
  grabTime: number;
  flip: FlipState;
  /** 0..1 progress of a handle pass (wakeboard spins ≥ 360). 0 = handle in front. */
  handlePass: number;
  /** Predicted seconds (sim time) until touchdown; 0 when not airborne. */
  timeToLand: number;
}

export interface RailState {
  obstacleId: string;
  kind: 'rail' | 'ledge' | 'pipe' | 'handrail';
  stance: RailStance;
  /** −1..1; |balance| ≥ 1 → fall. HUD shows this as the balance bar. */
  balance: number;
  /** Seconds on the rail. */
  time: number;
  /** Unit tangent of travel along the rail (world). */
  tangent: Vector3;
}

export interface WallState {
  obstacleId: string;
  /** Wall outward normal (world, horizontal-ish). */
  normal: Vector3;
  time: number;
}

export interface RopeState {
  /** Rider holds the handle. */
  holding: boolean;
  /** Rope is tight and pulling. */
  taut: boolean;
  /** 0..1 normalised tension (for rig strain, rope vibration, audio). */
  tension: number;
  /** Current rope length handle ↔ winch. */
  length: number;
  /** Metres of slack (≥ 0) — drives the visual sag. */
  slack: number;
  /** Unit horizontal vector rider → winch. */
  dir: Vector3;
  /** World position of the handle (the rig's hands reach for it when holding). */
  handlePos: Vector3;
  /** World position where the rope leaves the winch drum. */
  anchorPos: Vector3;
  /** Current drum reel-in speed m/s (drum animation / motor sound). */
  reelSpeed: number;
  /** Magnitude (m/s) of the most recent re-tension jerk, decays to 0. */
  jerk: number;
}

export interface BailState {
  reason: BailReason;
  /** Seconds since the fall started. */
  time: number;
  surface: SurfaceKind;
  /** 0..1 how violent. */
  intensity: number;
  /** Wakeskate: board flew away. */
  boardLost: boolean;
  /** Seconds until the rider is back up and pulled again. */
  respawnIn: number;
}

export interface RiderSimState {
  mode: RiderMode;
  board: BoardKind;
  stance: Stance;
  /** Sim seconds since GO (scaled time). */
  time: number;
  /** World position of the centre of the board's base. On water y = water level. */
  pos: Vector3;
  vel: Vector3;
  /** Horizontal speed m/s. */
  speed: number;
  /** Yaw of the horizontal travel direction. */
  heading: number;
  /** Absolute yaw of the board nose (rig root yaw). Forward: == heading. Switch: heading + π. */
  boardYaw: number;
  /** Riding tail-first. */
  switch: boolean;
  /** −1..1 edge lean; > 0 = leaning towards the rider's right of travel. */
  lean: number;
  /** 0..1 pop charge (rope load / crouch). */
  crouch: number;
  /** What the board is on. */
  surface: SurfaceKind | 'air' | 'rail' | 'wall';
  /** Height of the surface directly below the rider. */
  surfaceY: number;
  /** Surface normal under the board (tilt on kicker faces). */
  surfaceNormal: Vector3;
  air: AirState;
  rail: RailState | null;
  wall: WallState | null;
  rope: RopeState;
  bail: BailState | null;
  /** 0..1 along the line start → winch. */
  progress: number;
  distToWinch: number;
  /** HERO mode active (super slow-mo, ×2 points). */
  hero: boolean;
  /** 0..1 — how much slow-motion the sim currently wants (tricks in progress). */
  slowMo: number;
}

// ─────────────────────────────────────────────────────────────── Scoring ──

/** A finished trick as described by the sim; resolveTrick() turns it into a name + points. */
export interface TrickRecord {
  board: BoardKind;
  context: 'air' | 'rail' | 'surface' | 'wall';
  takeoff?: TakeoffKind;
  /** Total yaw in degrees, signed (+ = left), already rounded to a multiple of 180. */
  spinDeg: number;
  /** Frontside / backside (derived by the sim from stance + direction). */
  spinDir: 'fs' | 'bs' | null;
  inverts: { id: InvertId; count: number }[];
  grabs: { id: GrabId; hold: number }[];
  flips: { id: FlipId; count: number }[];
  shifty: boolean;
  handlePass: boolean;
  switchTakeoff: boolean;
  switchLanding: boolean;
  rail?: { obstacleId: string; kind: 'rail' | 'ledge' | 'pipe' | 'handrail'; stances: RailStance[]; distance: number; pressTime: number };
  wall?: { time: number };
  /** Gap cleared during this air. */
  gap?: { id: string; name: L10n; points: number };
  airTime: number;
  height: number;
  /** Obstacle involved (kicker / rail / ledge / wall id). */
  obstacleId?: string;
  /** Wakeskate: the pop was a Boneless (FLIP held while releasing JUMP). */
  boneless?: boolean;
}

export interface TrickPart {
  id: string;
  name: L10n;
  points: number;
}

export interface ResolvedTrick {
  /** Stable id used for staleness + goals (e.g. 'backroll', 'spin360', 'mobe', 'indy', 'rail.boardslide'). */
  id: string;
  /** Every table id this trick satisfies (goal matching): e.g. ['spin360','indy','backroll','mobe']. */
  ids: string[];
  name: L10n;
  /** Base points before combo multiplier, staleness and landing quality. */
  points: number;
  parts: TrickPart[];
  /** 1..5 — drives popup size, crowd reaction, replay worthiness. */
  tier: number;
  /**
   * Number of scoring elements in this trick (spin, invert, flip, each grab, rail stance…) = how much the combo
   * multiplier grows. 0 = filler (plain air / ollie): points only, no multiplier, no combo-window restart. Default 1.
   */
  elements?: number;
}

export interface ScoreState {
  /** Banked score. */
  total: number;
  /** Unbanked points in the running combo. */
  comboPoints: number;
  /** Running multiplier (1 when no combo). */
  comboMult: number;
  /** Seconds left before the combo banks (0..COMBO_WINDOW). */
  comboTimeLeft: number;
  comboActive: boolean;
  /** Number of elements in the running combo. */
  comboCount: number;
  bestCombo: number;
  bestTrick: { name: L10n; points: number; time: number } | null;
  tricksLanded: number;
  falls: number;
  hero: { meter: number; ready: boolean; active: boolean; timeLeft: number };
  /** Trick table id → times landed in this run (every id in ResolvedTrick.ids is counted). */
  trickCounts?: Record<string, number>;
}

export interface IScoreKeeper {
  readonly state: ScoreState;
  reset(): void;
  /**
   * Register a landed trick. Applies staleness, landing quality, hero ×2; adds to the combo pot,
   * bumps the multiplier, restarts the combo window, feeds the HERO meter. Emits 'score:trick'.
   * @param time sim time of the trick (for bestTrick / replay).
   * @returns points added to the combo pot.
   */
  addTrick(trick: ResolvedTrick, landing: LandingQuality, time: number): number;
  /** Flat bonus added to the running combo without touching staleness (letters, gaps handled by resolveTrick). */
  addBonus(id: string, name: L10n, points: number): void;
  /**
   * Advance timers. `dt` = sim (scaled) seconds: drives the combo window, which does not run down while
   * `hold` is true (airborne / on rail / on wall). `realDt` = unscaled seconds: drives the HERO timer
   * (8 real seconds); defaults to dt.
   */
  update(dt: number, hold: boolean, realDt?: number): void;
  /** Burn the combo pot, count a fall, drain the HERO meter. Emits 'score:lost'. */
  bail(): void;
  /** Start HERO mode if ready. Emits 'hero:start'. */
  activateHero(): boolean;
  /** Bank whatever is pending (run finished). */
  finish(): void;
}

// ────────────────────────────────────────────────────────── Sim interface ──

export interface SimConfig {
  spot: SpotDef;
  winchId: string;
  power: PowerLevel;
  board: BoardKind;
  stance: Stance;
  /** Totals from equipped gear (0..10, 5 = neutral). */
  stats: GearStats;
}

export interface CollisionDebugShape {
  kind: 'box' | 'line' | 'poly' | 'ramp' | 'wall' | 'circle';
  /** Flat list of world-space points (xyz…) describing the outline. */
  points: number[];
  /** Hex colour hint. */
  color: number;
  label?: string;
}

/** Result of a downward surface query. */
export interface SurfaceSample {
  y: number;
  kind: SurfaceKind;
  /** Obstacle / ground / water id. */
  id: string;
  /** Unit normal (points up-ish). */
  nx: number;
  ny: number;
  nz: number;
  /** true if the surface is a kicker face. */
  ramp: boolean;
}

export interface ICollisionWorld {
  /** Highest surface under (x,z) not higher than yRef + stepUp. Never returns null (falls back to spot.base). */
  sample(x: number, z: number, yRef: number, stepUp?: number): SurfaceSample;
  /** Outlines of every collider for the ?debug hitbox view. */
  debugShapes(): CollisionDebugShape[];
}

export interface IRiderSim {
  readonly state: RiderSimState;
  readonly score: IScoreKeeper;
  readonly world: ICollisionWorld;
  readonly config: SimConfig;
  /** Put the rider back at the start ('waiting'), clear score. */
  reset(): void;
  /** GO — the winch starts pulling. */
  go(): void;
  /**
   * Advance the simulation by `dt` seconds of SCALED time (internally sub-stepped, max 1/120 s).
   * `timeScale` = the global time scale that produced dt (so the sim can derive real time for the HERO timer).
   * Emits bus events ('sim:*', 'trick:*').
   */
  step(dt: number, input: InputFrame, timeScale?: number): void;
}

// ─────────────────────────────────────────────────────── Landing judgement ──

/** Everything judgeLanding() (src/tricks/landing.ts) needs at touchdown. */
export interface LandingInput {
  board: BoardKind;
  /** Board yaw vs. travel direction folded to 0..90° (0 = straight OR switch — both are fine). */
  yawErrorDeg: number;
  /** Unfinished invert rotation folded to 0..180° (0 = upright). */
  rollErrorDeg: number;
  /** Still holding a grab at touchdown. */
  grabbing: boolean;
  /** Wakeskate: board is under the feet (no flip in progress or flip caught). Always true on a wakeboard. */
  boardCaught: boolean;
  /** Wakeskate: 0..1 quality of the catch (1 = perfect). 1 when no flip was done. */
  catchQuality: number;
  /** Downward speed at touchdown (m/s, positive). */
  impactSpeed: number;
  /** Rope re-tension jerk (m/s) within the landing window. */
  ropeJerk: number;
  surface: SurfaceKind;
  /** What was landed on. */
  onto: 'water' | 'solid' | 'rail' | 'wall';
  /** Gear landing stat 0..10 (5 neutral). */
  landingStat: number;
  /** A trick (spin/invert/flip/grab) was performed during this air. */
  hadTrick: boolean;
  heroActive: boolean;
}

export interface LandingVerdict {
  quality: LandingQuality;
  /** Set when quality === 'bail'. */
  reason?: BailReason;
  /** Fraction of speed kept (sketchy landings scrub speed). */
  speedKeep: number;
}
