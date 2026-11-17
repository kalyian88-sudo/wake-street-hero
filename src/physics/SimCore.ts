/**
 * Shared core of the rider simulation: all mutable sim data plus the transitions every mode uses
 * (take-off, touchdown, bail, respawn, finish, side collisions). The per-mode integrators live in
 * src/physics/modes/*.ts and operate on this object.
 */
import { GAME, WINCH_SPEED } from '../config';
import type { EventBus, P3 } from '../core/events';
import { createRiderSimState } from '../core/riderState';
import { clamp, hashString, lineInfo, seededRng, winchAnchor, wrapPi } from '../data/geometry';
import { hasElements, railRecord, wallRecord } from '../tricks/air/record';
import { judgeLanding } from '../tricks/landing';
import { createScoreKeeper, resolveTrick } from '../tricks/scoring';
import { TrickController } from '../tricks/TrickController';
import type {
  BailReason,
  BailState,
  InputFrame,
  IScoreKeeper,
  LandingInput,
  LandingQuality,
  RailStance,
  RailState,
  RiderSimState,
  SimConfig,
  SurfaceKind,
  SurfaceSample,
  TakeoffKind,
  TrickRecord,
  WallState,
  WinchPointDef,
} from '../types';
import { Vector3 } from 'three';
import {
  CollisionWorld,
  createCollisionWorld,
  createGrindHit,
  createSideHit,
  createSurfaceSample,
  createWallProbe,
  type GrindLine,
  type WallFace,
} from './CollisionWorld';
import { Rope } from './Rope';
import { BOARD, SIM, statMods, type BoardTuning, type StatMods } from './tuning';

const PI = Math.PI;

/** Live data of the current grind. */
export interface RailRun {
  line: GrindLine | null;
  seg: number;
  t: number;
  dir: 1 | -1;
  speed: number;
  distance: number;
  pressTime: number;
  stances: RailStance[];
  /** Stance picked with TRICK + direction (blunts, nose/tail slides); null = the stick decides. */
  trickStance: RailStance | null;
  /** Hop-on blend 1 → 0 and the offset it fades out. */
  blend: number;
  blendTime: number;
  offX: number;
  offY: number;
  offZ: number;
  /** Board yaw relative to the direction of travel (0 = 50-50, ±90° = slides). */
  stanceYaw: number;
  stanceYawTarget: number;
  noise: number;
  noiseTarget: number;
  noiseT: number;
  /** Landing quality of the lock-on (scores the rail trick). */
  quality: LandingQuality;
}

export interface WallRun {
  face: WallFace | null;
  u: number;
  h: number;
  dir: 1 | -1;
  vu: number;
  vh: number;
  time: number;
}

function neutralButton(): InputFrame['jump'] {
  return { down: false, pressed: false, released: false };
}

export function neutralInput(): InputFrame {
  return {
    steer: 0,
    pitch: 0,
    jump: neutralButton(),
    trick: neutralButton(),
    grab: neutralButton(),
    handlePressed: false,
    heroPressed: false,
    pausePressed: false,
  };
}

export class SimCore {
  readonly state: RiderSimState;
  readonly score: IScoreKeeper;
  readonly world: CollisionWorld;
  readonly config: SimConfig;
  readonly bus: EventBus;
  readonly tune: BoardTuning;
  readonly mods: StatMods;
  readonly tricks: TrickController;
  readonly rope: Rope;
  /** Input of the current sub-step (edge flags are only set in the first sub-step of a frame). */
  readonly inp: InputFrame = neutralInput();

  // ── line ──
  readonly wp: WinchPointDef;
  readonly lineYaw: number;
  readonly lineLen: number;
  readonly lineDx: number;
  readonly lineDz: number;
  readonly reelMax: number;
  private readonly obstacleKinds = new Map<string, string>();

  // ── run ──
  going = false;
  rng: () => number = seededRng(1);

  // ── ground ──
  /** Yaw the board travels along (rope direction + carve). */
  boardDir = 0;
  carve = 0;
  /** Visual yaw offset left over from a landing, decays to 0. */
  yawSlip = 0;
  /** Surface 180 in progress: seconds since start (−1 = none) and direction. */
  spinT = -1;
  spinDir: 1 | -1 = 1;
  charge = 0;
  jumpArmed = false;
  groundHold = 0;
  groundId = '';
  groundRamp = false;
  rampVy = 0;
  /** Pop saved on a kicker for the lip (m/s) and the charge it came from. */
  rampBoost = 0;
  rampPower = 0;
  climbVy = 0;
  stallT = 0;
  contactT = 9;

  // ── air ──
  airYawOffset = 0;
  readonly gapState: Int8Array;

  // ── rail / wall ──
  readonly rail: RailRun = {
    line: null,
    seg: 0,
    t: 0,
    dir: 1,
    speed: 0,
    distance: 0,
    pressTime: 0,
    stances: [],
    trickStance: null,
    blend: 0,
    blendTime: 0.1,
    offX: 0,
    offY: 0,
    offZ: 0,
    stanceYaw: 0,
    stanceYawTarget: 0,
    noise: 0,
    noiseTarget: 0,
    noiseT: 0,
    quality: 'clean',
  };
  readonly railState: RailState = { obstacleId: '', kind: 'rail', stance: 'fifty', balance: 0, time: 0, tangent: new Vector3(0, 0, 1) };
  relockLine = -1;
  relockT = 0;
  /** Seconds after GO during which grind locks are off (dropping off the start bank). */
  noGrindT = 0;
  /** Direction (+1 / −1 along the right-of-line axis) of the bank start push, 0 = water start. */
  bankSide = 0;
  readonly wall: WallRun = { face: null, u: 0, h: 0, dir: 1, vu: 0, vh: 0, time: 0 };
  readonly wallState: WallState = { obstacleId: '', normal: new Vector3(1, 0, 0), time: 0 };
  wallCooldown = 0;

  // ── bail ──
  bailFinish = false;

  // ── scratch (no per-step allocations) ──
  readonly smp: SurfaceSample = createSurfaceSample();
  readonly smp2: SurfaceSample = createSurfaceSample();
  readonly hit = createSideHit();
  readonly grind = createGrindHit();
  readonly probe = createWallProbe();
  readonly probe0 = createWallProbe();
  readonly v2 = { x: 0, z: 0 };
  private readonly landing: LandingInput = {
    board: 'wakeboard',
    yawErrorDeg: 0,
    rollErrorDeg: 0,
    grabbing: false,
    boardCaught: true,
    catchQuality: 1,
    impactSpeed: 0,
    ropeJerk: 0,
    surface: 'water',
    onto: 'water',
    landingStat: 5,
    hadTrick: false,
    heroActive: false,
  };

  constructor(config: SimConfig, bus: EventBus) {
    this.config = config;
    this.bus = bus;
    const spot = config.spot;
    this.wp = spot.winchPoints.find((w) => w.id === config.winchId) ?? spot.winchPoints[0];
    const line = lineInfo(this.wp);
    this.lineYaw = line.yaw;
    this.lineLen = line.length;
    this.lineDx = line.dx;
    this.lineDz = line.dz;
    this.reelMax = WINCH_SPEED[config.power];
    for (const o of spot.obstacles) this.obstacleKinds.set(o.id, o.kind);
    this.state = createRiderSimState(config.board, config.stance);
    this.score = createScoreKeeper(bus);
    this.world = createCollisionWorld(spot);
    this.tune = BOARD[config.board];
    this.mods = statMods(config.stats);
    this.rope = new Rope(this.state, bus, this.reelMax);
    this.tricks = new TrickController(this.state, bus, this.tune, this.mods);
    this.gapState = new Int8Array(this.world.gaps.length);
    this.reset();
  }

  // ─────────────────────────────────────────────────────────── helpers ──

  p3(): P3 {
    const p = this.state.pos;
    return { x: p.x, y: p.y, z: p.z };
  }

  /** Id to report in events: only real obstacles (kicker, rail, ledge, stairs, wall). */
  obstacleOf(id: string): string | undefined {
    return this.obstacleKinds.has(id) ? id : undefined;
  }

  obstacleKind(id: string): string | undefined {
    return this.obstacleKinds.get(id);
  }

  ropeYaw(): number {
    const d = this.state.rope.dir;
    return Math.atan2(d.x, d.z);
  }

  // ───────────────────────────────────────────────────────── lifecycle ──

  reset(): void {
    const s = this.state;
    const cfg = this.config;
    this.going = false;
    this.rng = seededRng(hashString(`${cfg.spot.id}:${this.wp.id}:${cfg.board}:${cfg.power}`));
    s.mode = 'waiting';
    s.time = 0;
    const start = this.wp.start;
    // Street start: the rider stands on the side bank next to the start and drops into the canal on GO.
    const bank = cfg.bankStart === false ? null : this.findBankStart(start[0], start[2]);
    const sx = bank ? bank.x : start[0];
    const sz = bank ? bank.z : start[2];
    const smp = this.world.sampleInto(this.smp, sx, sz, bank ? bank.y + 0.5 : start[1] + 0.5, 0);
    s.pos.set(sx, smp.y, sz);
    s.vel.set(0, 0, 0);
    s.speed = 0;
    this.bankSide = bank ? bank.side : 0;
    // on the bank the board points a little out over the water, towards the line
    s.heading = s.boardYaw = this.lineYaw + (bank ? bank.side * 0.5 : 0);
    s.switch = false;
    s.lean = 0;
    s.crouch = 0;
    s.surface = smp.kind;
    s.surfaceY = smp.y;
    s.surfaceNormal.set(0, 1, 0);
    s.rail = null;
    s.wall = null;
    s.bail = null;
    s.progress = 0;
    s.hero = false;
    s.slowMo = 0;
    this.tricks.reset();
    s.rope.anchorPos.fromArray(winchAnchor(this.wp));
    this.rope.reset(SIM.startSlack);
    this.score.reset();

    this.boardDir = this.lineYaw;
    this.carve = 0;
    this.yawSlip = 0;
    this.spinT = -1;
    this.charge = 0;
    this.jumpArmed = false;
    this.groundHold = 0;
    this.groundId = smp.id;
    this.groundRamp = false;
    this.rampVy = 0;
    this.rampBoost = 0;
    this.rampPower = 0;
    this.climbVy = 0;
    this.stallT = 0;
    this.noGrindT = 0;
    this.contactT = 9;
    this.airYawOffset = 0;
    this.gapState.fill(0);
    this.rail.line = null;
    this.wall.face = null;
    this.relockLine = -1;
    this.relockT = 0;
    this.wallCooldown = 0;
    this.bailFinish = false;
  }

  go(): void {
    if (this.state.mode !== 'waiting') return;
    this.going = true;
    if (this.bankSide !== 0) {
      // push off the bank towards the water: the rope does the rest
      const s = this.state;
      const yaw = s.heading;
      s.vel.set(Math.sin(yaw) * 3.2, 0, Math.cos(yaw) * 3.2);
      s.speed = 3.2;
      this.noGrindT = 2.2;
    }
  }

  /**
   * Nearest side bank to the line start: walks out sideways (perpendicular to the line) until the
   * surface rises out of the water, and returns a standing spot 0.45 m inside the bank's edge.
   * `side` = +1 when the push into the canal is towards the left of the line (yaw +), −1 otherwise.
   */
  private findBankStart(x0: number, z0: number): { x: number; z: number; y: number; side: number } | null {
    const dx = Math.sin(this.lineYaw);
    const dz = Math.cos(this.lineYaw);
    // left of the line = (dz, −dx) rotated… left of travel for yaw θ is (cos θ, −sin θ)
    const lx = dz;
    const lz = -dx;
    let best: { x: number; z: number; y: number; side: number; d: number } | null = null;
    for (const sgn of [1, -1]) {
      let prevWater = true;
      for (let d = 0.5; d <= 20; d += 0.25) {
        const x = x0 + lx * sgn * d;
        const z = z0 + lz * sgn * d;
        const smp = this.world.sampleInto(this.smp, x, z, 5, 0);
        const solid = smp.kind !== 'water' && smp.y > 0.3 && smp.y < 2.5 && smp.ny > 0.95;
        if (solid && prevWater) {
          const e = d + 0.45;
          const ex = x0 + lx * sgn * e;
          const ez = z0 + lz * sgn * e;
          const chk = this.world.sampleInto(this.smp, ex, ez, 5, 0);
          if (chk.kind !== 'water' && Math.abs(chk.y - smp.y) < 0.05 && (!best || d < best.d)) {
            // standing on the left bank the board points right (into the canal), and vice versa
            best = { x: ex, z: ez, y: chk.y, side: -sgn, d };
          }
          break;
        }
        prevWater = !solid;
      }
    }
    return best ? { x: best.x, z: best.z, y: best.y, side: best.side } : null;
  }

  // ──────────────────────────────────────────────────────── surfaces ──

  /** Put the board on a sampled surface (water / slide) and announce the change. */
  enterGround(smp: SurfaceSample): void {
    const s = this.state;
    const from = s.surface;
    s.mode = smp.kind === 'water' ? 'water' : 'slide';
    s.surface = smp.kind;
    s.surfaceY = smp.y;
    s.surfaceNormal.set(smp.nx, smp.ny, smp.nz);
    this.groundId = smp.id;
    this.groundRamp = smp.ramp;
    if (from !== smp.kind) {
      this.stallT = 0;
      this.bus.emit('sim:surface', { from, to: smp.kind, obstacleId: smp.kind === 'water' || smp.id === 'base' ? undefined : smp.id });
    }
  }

  // ──────────────────────────────────────────────────── side collisions ──

  /**
   * Horizontal move by vel·dt with deflection off the sides of solids. Near head-on hits above
   * SIM.bailSpeed slam (when `canBail`). Returns false if a bail was started.
   */
  moveXZ(dt: number, yRef: number, stepUp: number, canBail: boolean): boolean {
    const s = this.state;
    const v = s.vel;
    const hit = this.hit;
    const x0 = s.pos.x;
    const z0 = s.pos.z;
    let nx = x0 + v.x * dt;
    let nz = z0 + v.z * dt;
    this.contactT += dt;
    if (this.world.obstruct(x0, z0, nx, nz, yRef, stepUp, hit)) {
      const vn = v.x * hit.nx + v.z * hit.nz;
      // vn ≥ 0 can only mean the board is already inside the solid and on its way out: let it
      if (vn < 0) {
        const sp = Math.hypot(v.x, v.z);
        const sinA = sp > 1e-6 ? -vn / sp : 0;
        if (canBail && sp > SIM.bailSpeed && sinA > SIM.headOnSin) {
          this.bail('collision', clamp(sp / 11, 0.35, 1));
          return false;
        }
        v.x -= vn * hit.nx;
        v.z -= vn * hit.nz;
        if (this.contactT > 0.3) {
          const keep = 1 - SIM.deflectLoss * Math.min(1, sinA / SIM.headOnSin);
          v.x *= keep;
          v.z *= keep;
          if (s.mode !== 'bail' && s.mode !== 'finished') this.bus.emit('sim:surface', { from: s.surface, to: hit.kind, obstacleId: hit.id });
        }
        const sp2 = Math.hypot(v.x, v.z);
        if (sp2 > 1e-4) {
          const k = Math.max(0, sp2 - SIM.scrapeDrag * dt) / sp2;
          v.x *= k;
          v.z *= k;
        }
        this.contactT = 0;
        nx = x0 + v.x * dt;
        nz = z0 + v.z * dt;
        if (this.world.obstruct(x0, z0, nx, nz, yRef, stepUp, hit)) {
          // corner, or pressed into something: do not go deeper, creep out along the face normal
          const vn2 = v.x * hit.nx + v.z * hit.nz;
          if (vn2 < 0) {
            v.x -= vn2 * hit.nx;
            v.z -= vn2 * hit.nz;
          }
          nx = x0 + hit.nx * 0.8 * dt;
          nz = z0 + hit.nz * 0.8 * dt;
        }
      }
    }
    s.pos.x = nx;
    s.pos.z = nz;
    return true;
  }

  /** Soft push back inside spot.bounds; far outside = bail. Returns false if a bail was started. */
  keepInBounds(dt: number): boolean {
    const s = this.state;
    const d = this.world.outOfBounds(s.pos.x, s.pos.z, this.v2);
    if (d <= 0) return true;
    if (d > SIM.boundsSoft) {
      this.bail('outOfBounds', 0.4);
      return false;
    }
    const a = SIM.boundsPush * Math.min(1, d) * dt;
    s.vel.x += this.v2.x * a;
    s.vel.z += this.v2.z * a;
    return true;
  }

  // ───────────────────────────────────────────────────────── take-off ──

  /**
   * Leave the surface. The caller has already set state.boardYaw and the horizontal velocity;
   * `vy` is the vertical take-off speed.
   */
  takeoff(kind: TakeoffKind, obstacleId: string | undefined, vy: number, boneless = false): void {
    const s = this.state;
    const from = s.surface;
    this.tricks.begin(kind, obstacleId, boneless);
    if (this.spinT >= 0) {
      // a surface 180 that leaves the water simply continues as an air 180
      const done = this.spinDir * PI * Math.min(1, this.spinT / SIM.surfaceSpinTime);
      s.air.takeoffYaw = wrapPi(s.boardYaw - done);
      s.air.spin = done;
      s.air.spinTarget = this.spinDir * PI;
      this.spinT = -1;
    }
    s.vel.y = vy;
    s.mode = 'air';
    s.surface = 'air';
    s.surfaceNormal.set(0, 1, 0);
    s.crouch = 0;
    s.lean *= 0.5;
    this.charge = 0;
    this.jumpArmed = false;
    this.groundHold = 0;
    this.yawSlip = 0;
    this.stallT = 0;
    const gaps = this.gapState;
    for (let i = 0; i < gaps.length; i++) gaps[i] = this.world.inGap(i, s.pos.x, s.pos.z) ? -1 : 0;
    this.bus.emit('sim:takeoff', { kind, pos: this.p3(), speed: Math.hypot(s.vel.x, s.vel.z), obstacleId });
    this.bus.emit('sim:surface', { from, to: 'air', obstacleId });
  }

  /** Per air step: which gap footprints has the board flown into / out of. */
  trackGaps(): void {
    const gaps = this.gapState;
    if (gaps.length === 0) return;
    const p = this.state.pos;
    for (let i = 0; i < gaps.length; i++) {
      const st = gaps[i];
      if (st < 0 || st === 2) continue;
      const inside = this.world.inGap(i, p.x, p.z);
      if (st === 0 && inside) gaps[i] = 1;
      else if (st === 1 && !inside) gaps[i] = 2;
    }
  }

  /** Best gap fully cleared in this air (and announce every cleared one). */
  private collectGaps(): TrickRecord['gap'] {
    let best: TrickRecord['gap'];
    const gaps = this.gapState;
    for (let i = 0; i < gaps.length; i++) {
      if (gaps[i] !== 2) continue;
      const def = this.world.gaps[i].def;
      if (!best || def.points > best.points) best = { id: def.id, name: def.name, points: def.points };
      this.bus.emit('sim:gap', { id: def.id, name: def.name, points: def.points });
    }
    return best;
  }

  /** Score the air that just ended cleanly. */
  scoreAir(switchLanding: boolean, quality: LandingQuality, obstacleId: string | undefined): void {
    const rec = this.tricks.buildRecord(switchLanding, this.collectGaps(), obstacleId);
    if (hasElements(rec)) this.score.addTrick(resolveTrick(rec), quality, this.state.time);
  }

  /** Judge a touchdown. Returns the verdict quality ('bail' = a bail was started). */
  judge(travelYaw: number, onto: LandingInput['onto'], surface: SurfaceKind, impact: number): { quality: LandingQuality; speedKeep: number } {
    const li = this.tricks.landingInput(this.landing, travelYaw, onto, surface, impact, this.rope.recentJerk(), this.score.state.hero.active);
    const verdict = judgeLanding(li);
    if (verdict.quality === 'bail') {
      const s = this.state;
      this.bail(verdict.reason ?? 'hardLanding', clamp(0.3 + impact / 14 + Math.hypot(s.vel.x, s.vel.z) / 30, 0.3, 1));
    }
    return verdict;
  }

  // ───────────────────────────────────────────────────────── touchdown ──

  /** Board met a surface (water or solid) coming out of the air. */
  touchdown(smp: SurfaceSample): void {
    const s = this.state;
    const v = s.vel;
    const vn = v.x * smp.nx + v.y * smp.ny + v.z * smp.nz;
    const impact = Math.max(0, -vn);
    const sp = Math.hypot(v.x, v.z);
    const travelYaw = sp > 0.6 ? Math.atan2(v.x, v.z) : s.boardYaw;
    const hadTrick = this.tricks.hadTrick;
    s.pos.y = smp.y;
    s.surfaceY = smp.y;
    const verdict = this.judge(travelYaw, smp.kind === 'water' ? 'water' : 'solid', smp.kind, impact);
    if (verdict.quality === 'bail') return;

    const sw = Math.abs(wrapPi(s.boardYaw - travelYaw)) > PI / 2;
    this.yawSlip = wrapPi(s.boardYaw - (travelYaw + (sw ? PI : 0)));
    this.boardDir = travelYaw;
    this.carve = clamp(wrapPi(travelYaw - this.ropeYaw()), -this.tune.carveMax, this.tune.carveMax);
    if (vn < 0) {
      v.x -= smp.nx * vn;
      v.y -= smp.ny * vn;
      v.z -= smp.nz * vn;
    }
    v.x *= verdict.speedKeep;
    v.z *= verdict.speedKeep;
    if (!smp.ramp) v.y = 0;
    this.rampVy = smp.ramp ? v.y : 0;
    this.climbVy = 0;
    this.airYawOffset = 0;
    const obstacle = this.obstacleOf(smp.id);
    this.bus.emit('sim:land', {
      quality: verdict.quality,
      impact,
      pos: this.p3(),
      surface: smp.kind,
      onto: smp.kind === 'water' ? 'water' : 'solid',
      hadTrick,
    });
    this.scoreAir(sw, verdict.quality, obstacle);
    s.switch = sw;
    this.tricks.reset();
    this.enterGround(smp);
  }

  // ───────────────────────────────────────────────────── rail / wall end ──

  /** Leave the rail bookkeeping-wise: event + score. Motion is up to the caller. */
  closeRail(popped: boolean, scored: boolean): void {
    const s = this.state;
    const run = this.rail;
    const line = run.line;
    if (!line) return;
    this.bus.emit('sim:railExit', { obstacleId: line.id, pos: this.p3(), popped });
    if (scored && run.distance >= SIM.railMinDistance) {
      const rec = railRecord(s.board, line.id, line.kind, run.stances, run.distance, run.pressTime, s.switch);
      this.score.addTrick(resolveTrick(rec), run.quality, s.time);
    }
    this.relockLine = line.index;
    this.relockT = SIM.railRelock;
    run.line = null;
    s.rail = null;
  }

  closeWall(scored: boolean): void {
    const s = this.state;
    const run = this.wall;
    const face = run.face;
    if (!face) return;
    this.bus.emit('sim:wallExit', { obstacleId: face.id, pos: this.p3() });
    if (scored && run.time >= SIM.wallMinScore) {
      this.score.addTrick(resolveTrick(wallRecord(s.board, face.id, run.time, s.switch)), 'clean', s.time);
    }
    this.wallCooldown = 0.7;
    run.face = null;
    s.wall = null;
  }

  // ────────────────────────────────────────────────────────────── bail ──

  bail(reason: BailReason, intensity = -1): void {
    const s = this.state;
    if (s.mode === 'bail' || s.mode === 'finished' || s.mode === 'waiting') return;
    const from = s.surface;
    this.closeRail(false, false);
    this.closeWall(false);
    const under = this.world.sampleInto(this.smp2, s.pos.x, s.pos.z, s.pos.y + 0.3, 0);
    const power = intensity >= 0 ? intensity : clamp(Math.hypot(s.vel.x, s.vel.y, s.vel.z) / 13, 0.25, 1);
    const state: BailState = {
      reason,
      time: 0,
      surface: under.kind,
      intensity: power,
      boardLost: s.board === 'wakeskate',
      respawnIn: SIM.respawnTime,
    };
    s.mode = 'bail';
    s.bail = state;
    s.crouch = 0;
    s.lean = 0;
    s.surface = s.pos.y > under.y + 0.05 ? 'air' : under.kind;
    s.surfaceY = under.y;
    s.surfaceNormal.set(0, 1, 0);
    this.charge = 0;
    this.jumpArmed = false;
    this.spinT = -1;
    this.yawSlip = 0;
    this.airYawOffset = 0;
    this.bailFinish = false;
    this.tricks.reset();
    this.rope.setHolding(false);
    this.rope.stopPull();
    this.score.bail();
    if (from !== s.surface && from !== 'air') this.bus.emit('sim:surface', { from, to: s.surface });
    this.bus.emit('sim:bail', { reason, pos: this.p3(), surface: under.kind, intensity: power, boardLost: state.boardLost });
  }

  /**
   * Back on the board: nearest clear water on the line ahead of the fall. No water left before the
   * winch → the run is over.
   */
  respawn(): void {
    const s = this.state;
    const start = this.wp.start;
    const along = (s.pos.x - start[0]) * this.lineDx + (s.pos.z - start[2]) * this.lineDz;
    const end = this.lineLen - GAME.finishRadius - 0.5;
    let found = false;
    let px = 0;
    let pz = 0;
    for (let d = Math.max(0, along + SIM.respawnAhead); d <= end; d += 0.75) {
      px = start[0] + this.lineDx * d;
      pz = start[2] + this.lineDz * d;
      if (this.world.isClearWater(px, pz, SIM.respawnClear)) {
        found = true;
        break;
      }
    }
    if (!found) {
      this.finish();
      return;
    }
    const smp = this.world.sampleInto(this.smp, px, pz, 1e6, 0);
    const from = s.surface;
    s.pos.set(px, smp.y, pz);
    s.bail = null;
    s.mode = 'water';
    s.surface = 'water';
    s.surfaceY = smp.y;
    s.surfaceNormal.set(0, 1, 0);
    s.switch = false;
    s.lean = 0;
    s.crouch = 0;
    this.groundId = smp.id;
    this.groundRamp = false;
    this.rampVy = 0;
    this.climbVy = 0;
    this.stallT = 0;
    this.contactT = 9;
    this.carve = 0;
    this.yawSlip = 0;
    this.spinT = -1;
    this.relockLine = -1;
    this.rope.reset(0);
    this.rope.startPull(SIM.respawnRamp);
    // a deep-water start again: the drum eases in from zero, so no slack and no jerk
    const dir = s.rope.dir;
    s.vel.set(0, 0, 0);
    s.speed = 0;
    this.boardDir = Math.atan2(dir.x, dir.z);
    s.heading = s.boardYaw = this.boardDir;
    if (from !== 'water') this.bus.emit('sim:surface', { from, to: 'water' });
    this.bus.emit('sim:handle', { holding: true });
    this.bus.emit('sim:respawn', { pos: this.p3() });
  }

  finish(): void {
    const s = this.state;
    if (s.mode === 'finished' || s.mode === 'waiting') return;
    this.closeRail(false, true);
    this.closeWall(true);
    s.bail = null;
    s.mode = 'finished';
    s.crouch = 0;
    s.slowMo = 0;
    this.spinT = -1;
    this.tricks.reset();
    this.rope.stopPull();
    this.score.finish();
    this.bus.emit('sim:finish', { pos: this.p3() });
  }
}
