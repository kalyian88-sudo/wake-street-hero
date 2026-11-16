/**
 * Air trick state machine (PLAN §4.2): turns button + stick input into spins, inverts, raley, shifty,
 * grabs (wakeboard) and flips with a catch (wakeskate). Writes state.air, emits 'trick:*' events and,
 * at touchdown, produces the LandingInput and the TrickRecord for the rules module.
 */
import type { EventBus } from '../core/events';
import { DEG, wrapPi } from '../data/geometry';
import { TRICK, type BoardTuning, type StatMods } from '../physics/tuning';
import type {
  FlipId,
  GrabId,
  InputFrame,
  InvertId,
  LandingInput,
  RiderSimState,
  SurfaceKind,
  TakeoffKind,
  TrickRecord,
} from '../types';
import { catchQuality, flipForStick, FLIPS, grabForStick, type FlipSpec } from './air/flips';
import { emptyRecord, spinDirection } from './air/record';

const TAU = Math.PI * 2;
const DONE = 2 * DEG;

export class TrickController {
  private readonly s: RiderSimState;
  private readonly bus: EventBus;
  private readonly tune: BoardTuning;
  private readonly mods: StatMods;

  private spinVel = 0;
  private rollVel = 0;
  private first = true;
  private didTrick = false;
  private takeoff: TakeoffKind = 'pop';
  private obstacleId: string | undefined = undefined;
  private boneless = false;
  private switchTakeoff = false;

  // neutral TRICK press: shifty first, raley if it stays held
  private neutralHeld = false;
  private neutralTime = 0;
  private shiftyT = -1;
  private shiftySign = 1;
  private shiftyDone = false;
  private raleyOn = false;
  private raleyTime = 0;

  // grabs
  private grabHeld = false;
  private readonly grabs: { id: GrabId; hold: number }[] = [];

  // flips
  private flip: FlipSpec | null = null;
  private flipLost = false;
  private flipSettle = false;
  private catchMin = 1;
  private readonly flips: { id: FlipId; count: number }[] = [];

  constructor(state: RiderSimState, bus: EventBus, tune: BoardTuning, mods: StatMods) {
    this.s = state;
    this.bus = bus;
    this.tune = tune;
    this.mods = mods;
  }

  /** Clear everything (ground modes keep state.air neutral). */
  reset(): void {
    const a = this.s.air;
    a.time = 0;
    a.height = 0;
    a.peak = 0;
    a.spin = 0;
    a.spinTarget = 0;
    a.roll = 0;
    a.rollTarget = 0;
    a.invert = null;
    a.raley = 0;
    a.shifty = 0;
    a.grab = null;
    a.grabBlend = 0;
    a.grabTime = 0;
    a.handlePass = 0;
    a.timeToLand = 0;
    const f = a.flip;
    f.id = null;
    f.roll = 0;
    f.yaw = 0;
    f.pitch = 0;
    f.progress = 0;
    f.caught = true;
    f.catchWindow = 0;
    this.spinVel = 0;
    this.rollVel = 0;
    this.first = true;
    this.didTrick = false;
    this.neutralHeld = false;
    this.neutralTime = 0;
    this.shiftyT = -1;
    this.shiftyDone = false;
    this.raleyOn = false;
    this.raleyTime = 0;
    this.grabHeld = false;
    this.grabs.length = 0;
    this.flip = null;
    this.flipLost = false;
    this.flipSettle = false;
    this.catchMin = 1;
    this.flips.length = 0;
    this.boneless = false;
    this.obstacleId = undefined;
  }

  /** Start of an air. boardYaw must already be final for the take-off. */
  begin(kind: TakeoffKind, obstacleId: string | undefined, boneless: boolean): void {
    this.reset();
    const a = this.s.air;
    a.takeoff = kind;
    a.takeoffYaw = this.s.boardYaw;
    this.takeoff = kind;
    this.obstacleId = obstacleId;
    this.boneless = boneless;
    this.switchTakeoff = this.s.switch;
  }

  /** A rotation / flip / grab / raley is in progress (drives slow-motion). */
  get busy(): boolean {
    const a = this.s.air;
    return (
      Math.abs(a.spinTarget - a.spin) > DONE ||
      Math.abs(a.rollTarget - a.roll) > DONE ||
      a.raley > 0.03 ||
      a.grabBlend > 0.03 ||
      (this.flip !== null && !this.flipLost && !this.flipSettle)
    );
  }

  get hadTrick(): boolean {
    return this.didTrick;
  }

  get takeoffObstacle(): string | undefined {
    return this.obstacleId;
  }

  // ─────────────────────────────────────────────────────────── update ──

  update(dt: number, inp: InputFrame): void {
    const a = this.s.air;
    const wakeboard = this.s.board === 'wakeboard';
    const thr = TRICK.dirThreshold;
    const ax = Math.abs(inp.steer);
    const ay = Math.abs(inp.pitch);

    // ── TRICK button ──
    if (inp.trick.pressed) {
      if (ax >= thr && ax >= ay) {
        // steer < 0 = stick left = spin left (+yaw)
        const limit = wakeboard ? 6 : 3;
        const next = a.spinTarget + (inp.steer < 0 ? Math.PI : -Math.PI);
        if (Math.abs(next) <= limit * Math.PI + 1e-6) {
          a.spinTarget = next;
          this.didTrick = true;
          this.bus.emit('trick:spin', { deg: Math.round(Math.abs(next) / DEG) });
        }
      } else if (ay >= thr && wakeboard) {
        const next = a.rollTarget + (inp.pitch > 0 ? TAU : -TAU);
        if (Math.abs(next) <= 2 * TAU + 1e-6) {
          a.rollTarget = next;
          this.didTrick = true;
          const count = Math.round(Math.abs(next) / TAU);
          if (count > 0) {
            a.invert = this.rollId(next);
            this.bus.emit('trick:invert', { id: a.invert, count });
          } else a.invert = null;
        }
      } else if (ax < thr && ay < thr) {
        this.neutralHeld = true;
        this.neutralTime = 0;
        if (this.shiftyT < 0) {
          this.shiftyT = 0;
          this.shiftySign = -this.shiftySign;
          this.bus.emit('trick:shifty', {});
        }
      }
    }
    if (this.neutralHeld) {
      if (!inp.trick.down) {
        this.neutralHeld = false;
        this.raleyOn = false;
      } else {
        this.neutralTime += dt;
        if (wakeboard && !this.raleyOn && this.neutralTime >= TRICK.raleyHold) {
          this.raleyOn = true;
          this.didTrick = true;
          // the shifty was only the wind-up of the raley
          this.shiftyT = -1;
          if (a.invert === null) a.invert = 'raley';
          this.bus.emit('trick:invert', { id: 'raley', count: 1 });
        }
      }
    }

    // ── shifty: one quick twist out and back ──
    if (this.shiftyT >= 0) {
      this.shiftyT += dt;
      const p = this.shiftyT / TRICK.shiftyTime;
      if (p >= 1) {
        this.shiftyT = -1;
        this.shiftyDone = true;
        a.shifty = 0;
      } else a.shifty = this.shiftySign * Math.sin(Math.PI * p);
    } else if (a.shifty !== 0) {
      a.shifty *= Math.max(0, 1 - 14 * dt);
      if (Math.abs(a.shifty) < 0.01) a.shifty = 0;
    }

    // ── raley pose ──
    if (this.raleyOn) {
      a.raley = Math.min(1, a.raley + TRICK.raleyIn * dt);
      if (a.raley > 0.8) this.raleyTime += dt;
    } else if (a.raley > 0) {
      a.raley = Math.max(0, a.raley - TRICK.raleyOut * dt);
      if (a.raley === 0 && a.invert === 'raley') a.invert = null;
    }

    // ── spin ──
    a.spin = this.rotate(a.spin, a.spinTarget, dt, true);
    // ── invert ──
    if (wakeboard) a.roll = this.rotate(a.roll, a.rollTarget, dt, false);

    // ── GRAB (wakeboard) / FLIP (wakeskate) ──
    if (wakeboard) this.updateGrab(dt, inp);
    else this.updateFlip(dt, inp);

    // ── handle pass: the handle goes behind the back around the half turn of every 360 ──
    if (wakeboard && this.s.rope.holding && Math.abs(a.spinTarget) >= TAU - 1e-3) {
      const phase = (Math.abs(a.spin) % TAU) / TAU;
      const bump = (0.5 - Math.abs(phase - 0.5)) * 4 - 0.5;
      a.handlePass = bump < 0 ? 0 : bump > 1 ? 1 : bump;
    } else a.handlePass = 0;

    this.first = false;
  }

  private rollId(target: number): InvertId {
    if (target < 0) return 'frontroll';
    return this.takeoff === 'kicker' ? 'tantrum' : 'backroll';
  }

  /** Advance an angle towards its target with a ramp-in and a soft arrival. */
  private rotate(angle: number, target: number, dt: number, spin: boolean): number {
    const rem = target - angle;
    if (Math.abs(rem) < 1e-5) {
      if (spin) this.spinVel = 0;
      else this.rollVel = 0;
      return target;
    }
    let max: number;
    if (spin) {
      const halves = Math.min(this.tune.spinTuck.length - 1, Math.round(Math.abs(target) / Math.PI));
      max = this.tune.spinRate * this.mods.spin * this.tune.spinTuck[halves];
    } else {
      max = this.tune.rollRate * this.mods.spin * (Math.abs(target) > TAU + 0.1 ? this.tune.rollTuck : 1);
    }
    const want = Math.sign(rem) * Math.min(max, Math.abs(rem) * 12 + 1.2);
    let vel = spin ? this.spinVel : this.rollVel;
    const dv = (max / this.tune.spinRamp) * dt;
    vel += Math.min(dv, Math.max(-dv, want - vel));
    let next = angle + vel * dt;
    if ((target - next) * rem <= 0) {
      next = target;
      vel = 0;
    }
    if (spin) this.spinVel = vel;
    else this.rollVel = vel;
    return next;
  }

  private updateGrab(dt: number, inp: InputFrame): void {
    const a = this.s.air;
    if (inp.grab.pressed || (this.first && inp.grab.down)) {
      this.closeGrab();
      a.grab = grabForStick(inp.steer, inp.pitch, TRICK.dirThreshold);
      a.grabTime = 0;
      this.grabHeld = true;
      this.didTrick = true;
      this.bus.emit('trick:grab', { id: a.grab });
    }
    if (this.grabHeld && !inp.grab.down) this.grabHeld = false;
    if (a.grab === null) return;
    if (this.grabHeld) {
      a.grabBlend = Math.min(1, a.grabBlend + TRICK.grabIn * dt);
      if (a.grabBlend >= TRICK.grabOn) a.grabTime += dt;
    } else {
      a.grabBlend = Math.max(0, a.grabBlend - TRICK.grabOut * dt);
      if (a.grabBlend === 0) this.closeGrab();
    }
  }

  /** Bank the current grab into the list. */
  private closeGrab(): void {
    const a = this.s.air;
    if (a.grab !== null && a.grabTime >= TRICK.grabMin) {
      const hit = this.grabs.find((g) => g.id === a.grab);
      if (hit) hit.hold += a.grabTime;
      else this.grabs.push({ id: a.grab, hold: a.grabTime });
    }
    a.grab = null;
    a.grabTime = 0;
    a.grabBlend = 0;
  }

  private updateFlip(dt: number, inp: InputFrame): void {
    const f = this.s.air.flip;
    const scale = this.mods.catchWindow;
    const open = Math.max(0.3, 1 - (1 - TRICK.catchOpen) * scale);
    const late = TRICK.catchLate * scale;

    const flipping = this.flip !== null && !this.flipSettle && !this.flipLost;
    if (flipping && (inp.grab.pressed || inp.jump.pressed)) {
      const q = catchQuality(f.progress, open, late);
      if (q > 0) this.catchBoard(q);
      // too early: nothing happens, the board is not round yet
    } else if (!flipping && !this.flipLost && inp.grab.pressed) {
      const spec = FLIPS[flipForStick(inp.steer, inp.pitch, TRICK.dirThreshold)];
      this.flip = spec;
      this.flipSettle = false;
      f.id = spec.id;
      f.progress = 0;
      f.roll = 0;
      f.yaw = 0;
      f.pitch = 0;
      f.caught = false;
      f.catchWindow = 0;
      this.didTrick = true;
      this.bus.emit('trick:flip', { id: spec.id });
    }

    const spec = this.flip;
    if (spec === null) return;
    if (this.flipSettle) {
      // caught: the board snaps the last few degrees under the feet
      const k = Math.max(0, 1 - 26 * dt);
      f.roll *= k;
      f.yaw *= k;
      f.pitch *= k;
      if (Math.abs(f.roll) + Math.abs(f.yaw) + Math.abs(f.pitch) < 0.02) {
        f.roll = f.yaw = f.pitch = 0;
        f.id = null;
        f.progress = 0;
        this.flip = null;
        this.flipSettle = false;
      }
      return;
    }
    // constant speed — and the board keeps turning past the full flip if nobody catches it
    f.progress = Math.min(TRICK.flipOverrun, f.progress + dt / spec.time);
    f.roll = spec.roll * f.progress;
    f.yaw = spec.yaw * f.progress;
    f.pitch = spec.pitch * f.progress;
    if (this.flipLost) {
      f.catchWindow = 0;
      return;
    }
    f.catchWindow = catchQuality(f.progress, open, late);
    if (f.progress > 1 + late) {
      // window missed: the board is gone
      this.flipLost = true;
      f.caught = false;
      f.catchWindow = 0;
      this.catchMin = 0;
      this.bus.emit('trick:catch', { quality: 0, ok: false });
    }
  }

  private catchBoard(quality: number): void {
    const f = this.s.air.flip;
    const spec = this.flip;
    if (spec === null) return;
    // residual = how far the board is from flat when the feet stop it
    f.roll -= spec.roll;
    f.yaw -= spec.yaw;
    f.pitch -= spec.pitch;
    f.caught = true;
    f.catchWindow = 0;
    f.progress = 1;
    this.flipSettle = true;
    if (quality < this.catchMin) this.catchMin = quality;
    const hit = this.flips.find((x) => x.id === spec.id);
    if (hit) hit.count++;
    else this.flips.push({ id: spec.id, count: 1 });
    this.bus.emit('trick:catch', { quality, ok: true });
  }

  // ───────────────────────────────────────────────────────── touchdown ──

  /**
   * Fill the LandingInput. `travelYaw` = yaw of the direction the board will ride away in.
   * On a rail both straight (50-50) and sideways (boardslide) are fine, so the error folds to 0..45°.
   */
  landingInput(
    out: LandingInput,
    travelYaw: number,
    onto: LandingInput['onto'],
    surface: SurfaceKind,
    impactSpeed: number,
    ropeJerk: number,
    heroActive: boolean,
  ): LandingInput {
    const a = this.s.air;
    let yawErr = Math.abs(wrapPi(this.s.boardYaw - travelYaw));
    if (onto === 'rail') {
      yawErr %= Math.PI / 2;
      if (yawErr > Math.PI / 4) yawErr = Math.PI / 2 - yawErr;
    } else if (yawErr > Math.PI / 2) yawErr = Math.PI - yawErr;
    const rollErr = Math.abs(wrapPi(a.roll)) / DEG;
    out.board = this.s.board;
    out.yawErrorDeg = yawErr / DEG;
    out.rollErrorDeg = Math.max(rollErr, a.raley * 110);
    out.grabbing = a.grab !== null && a.grabBlend >= TRICK.grabLandBlend;
    out.boardCaught = this.s.board === 'wakeboard' || (!this.flipLost && (this.flip === null || this.flipSettle));
    out.catchQuality = this.catchMin;
    out.impactSpeed = impactSpeed;
    out.ropeJerk = ropeJerk;
    out.surface = surface;
    out.onto = onto;
    out.landingStat = this.mods.landing;
    out.hadTrick = this.didTrick;
    out.heroActive = heroActive;
    return out;
  }

  /** The record of this air (call after a successful landing). */
  buildRecord(switchLanding: boolean, gap: TrickRecord['gap'], obstacleId: string | undefined): TrickRecord {
    const a = this.s.air;
    this.closeGrab();
    const rec = emptyRecord(this.s.board, 'air');
    rec.takeoff = this.takeoff;
    const halves = Math.round(a.spin / Math.PI);
    rec.spinDeg = halves * 180;
    rec.spinDir = spinDirection(Math.sign(halves), this.s.stance, this.switchTakeoff);
    const rolls = Math.round(a.roll / TAU);
    if (rolls !== 0) rec.inverts.push({ id: this.rollId(rolls), count: Math.abs(rolls) });
    if (this.raleyTime >= TRICK.raleyMin) rec.inverts.push({ id: 'raley', count: 1 });
    for (const g of this.grabs) rec.grabs.push({ id: g.id, hold: g.hold });
    for (const f of this.flips) rec.flips.push({ id: f.id, count: f.count });
    rec.shifty = this.shiftyDone;
    rec.handlePass = this.s.board === 'wakeboard' && this.s.rope.holding && Math.abs(rec.spinDeg) >= TRICK.handlePassMin;
    rec.switchTakeoff = this.switchTakeoff;
    rec.switchLanding = switchLanding;
    if (gap) rec.gap = gap;
    rec.airTime = a.time;
    rec.height = a.peak;
    rec.obstacleId = obstacleId ?? this.obstacleId;
    if (this.boneless) rec.boneless = true;
    return rec;
  }
}
