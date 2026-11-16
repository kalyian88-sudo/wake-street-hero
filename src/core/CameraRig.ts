/**
 * Camera rig: one PerspectiveCamera driven by four modes.
 *   chase   — behind-and-above the rider, looking down the line (run)
 *   preview — elevated three-quarter fly-along of the selected line (spot card)
 *   filmer  — fixed filmer position tracking the rider with handheld sway (replay)
 *   free    — debug fly camera
 *
 * The chase camera works in "orbit" terms around the rider: a base yaw (blend of rope direction and
 * heading, heavily damped so carving does not swing the view), plus an orbit offset, distance, height,
 * look-ahead and FOV. Every shot (establishing, chase, air, trick, rail, wall, bail, finish) is just a
 * different set of targets for those few numbers, so transitions are always smooth.
 */
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { ICollisionWorld, IRiderRig, RiderSimState, SpotDef, WinchPointDef } from '../types';
import type { EventBus } from './events';
import { FreeCam } from './FreeCam';
import { clamp01, expDamp, smoothDampAngle, smoothDampVec, smoothstep, wobble, type Spring } from './math';

export type CameraMode = 'chase' | 'preview' | 'filmer' | 'free';

const DEG = Math.PI / 180;
/** Front three-quarter angle of the establishing shot (rad from "directly behind"). */
const ESTABLISH_ORBIT = 2.5;
/** Lens never gets closer than this to water / ground. */
const MIN_CLEARANCE = 0.45;
const BOUNDS_MARGIN = 4;
const RIDER_HEIGHT = 1.8;

export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly free = new FreeCam();
  mode: CameraMode = 'chase';

  private aspect = 0.46;
  private spot: SpotDef | null = null;
  private collision: ICollisionWorld | null = null;
  /** ±1: which side the camera prefers for orbit shots (the sunny one, so faces are lit). */
  private side = 1;

  // chase state
  private yaw = 0;
  private readonly yawSpring: Spring = { v: 0 };
  private orbit = 0;
  private readonly orbitSpring: Spring = { v: 0 };
  private dist = 6;
  private height = 2.9;
  private lookAhead = 5;
  private lookY = 1;
  private fov = 70;
  private focusY = 0;
  private roll = 0;
  private readonly camPos = new Vector3();
  private readonly camVel = new Vector3();
  private readonly look = new Vector3();
  private readonly lookVel = new Vector3();
  private trauma = 0;
  private clock = 0;
  private needSnap = true;
  private wasBail = false;

  // preview state
  private readonly pvStart = new Vector3();
  private readonly pvEnd = new Vector3();
  private pvTime = 0;
  private pvSide = 1;
  private pvSnap = true;

  // filmer state
  private readonly filmerPos = new Vector3();
  private filmerTime = 0;

  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly offs: (() => void)[] = [];

  constructor(bus: EventBus) {
    this.camera = new PerspectiveCamera(70, this.aspect, 0.25, 900);
    this.camera.position.set(0, 3, -8);
    this.offs.push(
      bus.on('sim:land', (e) => {
        // Soft water landings barely register; a flat 7 m/s slap rattles the lens.
        const hard = clamp01((e.impact - 4.5) / 7);
        this.addShake(hard * (e.onto === 'water' ? 0.55 : 0.8) + (e.quality === 'sketchy' ? 0.15 : 0));
      }),
      bus.on('sim:bail', (e) => this.addShake(0.45 + 0.5 * clamp01(e.intensity))),
      bus.on('sim:ropeJerk', (e) => this.addShake(clamp01((e.jerk - 3) / 10) * 0.25)),
    );
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.free.disable();
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setFar(far: number): void {
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /** Spot the camera is in (bounds, sun side) + the collision world for the "never under the surface" rule. */
  setSpot(spot: SpotDef | null, collision: ICollisionWorld | null): void {
    this.spot = spot;
    this.collision = collision;
  }

  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  setMode(mode: CameraMode, surface?: HTMLElement): void {
    if (mode === this.mode) return;
    if (this.mode === 'free') this.free.disable();
    this.mode = mode;
    if (mode === 'free' && surface) this.free.enable(this.camera, surface);
    if (mode === 'chase') this.camera.up.set(0, 1, 0);
  }

  /** 1 on a portrait phone … 0 in landscape / desktop. */
  private portrait(): number {
    return 1 - smoothstep(0.7, 1.35, this.aspect);
  }

  private setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) > 0.005) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Keep a position inside the spot (plus a margin) and above whatever is under it. */
  private constrain(p: Vector3, vel: Vector3 | null): void {
    const spot = this.spot;
    if (spot) {
      p.x = MathUtils.clamp(p.x, spot.bounds.min[0] - BOUNDS_MARGIN, spot.bounds.max[0] + BOUNDS_MARGIN);
      p.z = MathUtils.clamp(p.z, spot.bounds.min[1] - BOUNDS_MARGIN, spot.bounds.max[1] + BOUNDS_MARGIN);
    }
    if (this.collision) {
      const floor = this.collision.sample(p.x, p.z, p.y + 1.5, 0).y + MIN_CLEARANCE;
      if (p.y < floor) {
        p.y = floor;
        if (vel && vel.y < 0) vel.y = 0;
      }
    }
  }

  // ───────────────────────────────────────────────────────────── chase ──

  /** Next update() jumps straight to the wanted shot (new run / restart). */
  reset(state: RiderSimState): void {
    this.needSnap = true;
    this.trauma = 0;
    this.roll = 0;
    this.wasBail = false;
    this.yaw = Math.atan2(state.rope.dir.x, state.rope.dir.z);
    this.yawSpring.v = 0;
    this.orbitSpring.v = 0;
    this.camVel.set(0, 0, 0);
    this.lookVel.set(0, 0, 0);
    // Orbit shots sit on the sunny side so the rider's face is lit. A positive orbit moves the camera
    // towards the rider's right (−cos yaw, sin yaw); its dot with the sun direction is sin(yaw − az).
    if (this.spot) this.side = Math.sin(this.yaw - this.spot.env.sunAzimuth * DEG) >= 0 ? 1 : -1;
  }

  /**
   * Per frame (run). `realDt` drives all smoothing so the camera stays fluid in slow-motion;
   * `simDt` is unused by the follow maths but kept for the contract in PLAN §3.
   */
  update(realDt: number, _simDt: number, s: RiderSimState, rig: IRiderRig | null): void {
    this.clock += realDt;
    if (this.mode === 'free') {
      this.free.update(realDt, this.camera);
      return;
    }
    if (this.mode !== 'chase') return;
    const dt = realDt;
    const p = this.portrait();
    const mode = s.mode;
    const waiting = mode === 'waiting';
    const finished = mode === 'finished';
    const bail = mode === 'bail';

    // ── base yaw: where "down the line" is ──
    if (!bail && !finished) {
      const hx = Math.sin(s.heading);
      const hz = Math.cos(s.heading);
      // Close to the winch the rope direction whips round as the rider passes — trust the heading there.
      let wRope = (s.rope.holding ? 0.68 : 0.25) * smoothstep(5, 16, s.distToWinch);
      if (waiting || s.speed < 1) wRope = 1;
      const dx = s.rope.dir.x * wRope + hx * (1 - wRope);
      const dz = s.rope.dir.z * wRope + hz * (1 - wRope);
      if (dx * dx + dz * dz > 1e-4) {
        const target = Math.atan2(dx, dz);
        this.yaw = this.needSnap ? target : smoothDampAngle(this.yaw, target, this.yawSpring, 0.5, dt);
      }
    }

    // ── shot targets ──
    let fov = MathUtils.lerp(57, 70, p);
    // The follow spring trails by ~0.09 s (≈0.85 m at winch speed): effective distance ≈ 5.3 / 6.1 m.
    let dist = MathUtils.lerp(4.5, 5.25, p);
    let height = MathUtils.lerp(2.3, 2.9, p);
    let lookAhead = MathUtils.lerp(5.0, 5.5, p);
    let lookY = MathUtils.lerp(1.1, 1.0, p);
    let orbit = 0;
    let orbitTime = 0.42;

    if (waiting) {
      orbit = this.side * ESTABLISH_ORBIT;
      dist = MathUtils.lerp(4.4, 5.3, p);
      height = 1.35;
      lookAhead = 0;
      lookY = 1.0;
      fov = MathUtils.lerp(46, 58, p);
    } else if (finished) {
      dist = MathUtils.lerp(4.4, 5.4, p);
      height = 1.6;
      lookAhead = 0;
      lookY = 1.0;
      fov = MathUtils.lerp(48, 60, p);
    } else {
      const speedK = MathUtils.clamp((s.speed - 9) / 8, -0.25, 1);
      dist += speedK * 0.9;
      fov += Math.max(0, speedK) * 4;
      if (mode === 'air') {
        // Rise and pull back — but less than the rider climbs (see focusY), and tilt up after him,
        // so he moves UP the frame and the water drops away: that is what sells the height.
        const h = Math.max(0, s.air.height);
        height += Math.min(h * 0.15, 0.8);
        dist += Math.min(h * 0.5, 2.4);
        lookY += Math.min(h * 0.25, 1.4);
      } else if (mode === 'rail') {
        height -= 0.95;
        dist -= 0.5;
        lookAhead -= 2.6;
        lookY -= 0.15;
        orbit = this.side * 0.52;
      } else if (mode === 'wall' && s.wall) {
        // Swing out to the open side so the wall is the backdrop, not an obstruction.
        const cross = Math.sin(this.yaw) * s.wall.normal.z - Math.cos(this.yaw) * s.wall.normal.x;
        orbit = (cross > 0 ? 1 : -1) * 0.5;
        dist += 0.5;
        lookAhead -= 2;
      }
      // Trick in progress: push in a little and drift sideways so the rotation reads.
      const trick = clamp01(s.slowMo);
      fov -= 6 * trick;
      dist -= 0.45 * trick;
      if (mode === 'air') orbit += this.side * 0.18 * trick;
      orbitTime = 0.5;
    }

    // ── smooth the shot numbers ──
    if (this.needSnap) {
      this.orbit = orbit;
      this.dist = dist;
      this.height = height;
      this.lookAhead = lookAhead;
      this.lookY = lookY;
      this.fov = fov;
      this.focusY = s.pos.y;
    } else if (!bail) {
      if (finished) {
        // Slow victory orbit.
        this.orbitSpring.v = expDamp(this.orbitSpring.v, 0.42 * this.side, 2.5, dt);
        this.orbit += this.orbitSpring.v * dt;
      } else if (waiting) {
        // Creep round during the countdown so the shot is alive.
        this.orbit += -this.side * 0.045 * dt;
        this.orbitSpring.v = 0;
      } else {
        this.orbit = smoothDampAngle(this.orbit, orbit, this.orbitSpring, orbitTime, dt);
      }
      this.dist = expDamp(this.dist, dist, 3.5, dt);
      this.height = expDamp(this.height, height, 3.5, dt);
      this.lookAhead = expDamp(this.lookAhead, lookAhead, 3, dt);
      this.lookY = expDamp(this.lookY, lookY, 3, dt);
      this.fov = expDamp(this.fov, fov, 5, dt);
      // The camera's own "floor" follows only part of an air.
      const floor = mode === 'air' ? s.pos.y - Math.max(0, s.air.height) * 0.45 : s.pos.y;
      this.focusY = expDamp(this.focusY, floor, mode === 'air' ? 6 : 10, dt);
    }

    // ── wanted position + look target ──
    const wantPos = this.tmpA;
    const wantLook = this.tmpB;
    if (bail) {
      // Hold the shot where it was and just watch the slam (follow only if he slides far away).
      wantPos.copy(this.camPos);
      if (rig) rig.getChestWorldPosition(wantLook);
      else wantLook.copy(s.pos).setY(s.pos.y + 0.5);
      const far = wantPos.distanceTo(s.pos);
      if (far > 11) wantPos.lerp(s.pos, 1 - 11 / far).setY(this.camPos.y);
      this.fov = expDamp(this.fov, MathUtils.lerp(52, 64, p), 2, dt);
    } else {
      const a = this.yaw + this.orbit;
      const fx = Math.sin(a);
      const fz = Math.cos(a);
      wantPos.set(s.pos.x - fx * this.dist, this.focusY + this.height, s.pos.z - fz * this.dist);
      wantLook.set(s.pos.x + fx * this.lookAhead, this.focusY + this.lookY, s.pos.z + fz * this.lookAhead);
      if (finished && rig) {
        rig.getChestWorldPosition(wantLook);
        wantLook.y -= 0.1;
      }
    }
    this.constrain(wantPos, null);

    // A respawn after a bail can be far away: cut instead of flying through the scenery.
    const respawned = this.wasBail && !bail;
    this.wasBail = bail;
    if (this.needSnap || (respawned && wantPos.distanceToSquared(this.camPos) > 30 * 30)) {
      this.camPos.copy(wantPos);
      this.look.copy(wantLook);
      this.camVel.set(0, 0, 0);
      this.lookVel.set(0, 0, 0);
      this.needSnap = false;
    } else {
      const soft = respawned ? 0.35 : 0;
      smoothDampVec(this.camPos, wantPos, this.camVel, 0.09 + soft, 0.15 + soft, dt);
      smoothDampVec(this.look, wantLook, this.lookVel, bail ? 0.22 : 0.07, bail ? 0.22 : 0.11, dt);
    }
    this.constrain(this.camPos, this.camVel);

    // ── apply + shake ──
    const cam = this.camera;
    cam.position.copy(this.camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    this.setFov(this.fov);

    this.trauma = Math.max(0, this.trauma - 1.5 * dt);
    const shake = this.trauma * this.trauma;
    const buzz = waiting || finished || bail ? 0 : smoothstep(11.5, 18, s.speed) * 0.012;
    const t = this.clock;
    if (shake > 1e-4 || buzz > 0) {
      cam.translateX(wobble(t * 34, 1) * 0.16 * shake + wobble(t * 47, 4) * buzz);
      cam.translateY(wobble(t * 39, 2) * 0.16 * shake + wobble(t * 53, 5) * buzz);
    }
    // Bank a hair into carves.
    const leanRoll = mode === 'water' || mode === 'slide' ? -s.lean * 0.028 : 0;
    this.roll = expDamp(this.roll, leanRoll, 4, dt);
    const roll = this.roll + wobble(t * 31, 3) * 0.035 * shake;
    if (Math.abs(roll) > 1e-5) cam.rotateZ(roll);
  }

  // ─────────────────────────────────────────────────────────── preview ──

  /** Line to fly along (spot card). Call again when the player picks another winch point. */
  setPreviewLine(wp: WinchPointDef, restart: boolean): void {
    this.pvStart.set(wp.start[0], wp.start[1], wp.start[2]);
    this.pvEnd.set(wp.pos[0], wp.start[1], wp.pos[2]);
    if (restart) {
      this.pvTime = 0;
      this.pvSnap = true;
    }
    if (this.spot) {
      // Sit on the sunny side of the line so we look at lit faces.
      const az = this.spot.env.sunAzimuth * DEG;
      const dx = this.pvEnd.x - this.pvStart.x;
      const dz = this.pvEnd.z - this.pvStart.z;
      this.pvSide = dz * Math.sin(az) - dx * Math.cos(az) >= 0 ? 1 : -1;
    }
  }

  updatePreview(realDt: number): void {
    this.clock += realDt;
    if (this.mode === 'free') {
      this.free.update(realDt, this.camera);
      return;
    }
    const p = this.portrait();
    const dx = this.pvEnd.x - this.pvStart.x;
    const dz = this.pvEnd.z - this.pvStart.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;

    // start → winch at a steady glide, short hold, quick rewind, repeat.
    const fwdT = MathUtils.clamp(len / 10, 8, 22);
    const holdT = 1.2;
    const backT = 2.8;
    const total = fwdT + holdT + backT + 0.6;
    this.pvTime = (this.pvTime + realDt) % total;
    let u: number;
    if (this.pvTime < fwdT) {
      const x = this.pvTime / fwdT;
      // ease in/out only at the ends (linear cruise in between)
      u = x < 0.12 ? (x * x) / 0.24 : x > 0.88 ? 1 - ((1 - x) * (1 - x)) / 0.24 : x - 0.06;
      u /= 0.88;
    } else if (this.pvTime < fwdT + holdT) u = 1;
    else if (this.pvTime < fwdT + holdT + backT) u = 1 - smoothstep(0, 1, (this.pvTime - fwdT - holdT) / backT);
    else u = 0;
    // Do not fly past the last obstacles into the winch itself.
    u = 0.04 + u * 0.86;

    const back = MathUtils.lerp(9.5, 11.5, p);
    const lateral = MathUtils.lerp(7.5, 6.5, p) * this.pvSide;
    const up = MathUtils.lerp(6, 8.5, p);
    const fx = this.pvStart.x + dx * u;
    const fz = this.pvStart.z + dz * u;
    const fy = this.pvStart.y;
    const sway = Math.sin(this.clock * 0.35) * 0.9;
    const wantPos = this.tmpA.set(fx - ux * back + uz * (lateral + sway), fy + up, fz - uz * back - ux * (lateral + sway));
    // Look a little ahead of the focus and (portrait) below it, so the action sits in the upper half above the card.
    const wantLook = this.tmpB.set(fx + ux * 3.5, fy + 0.4 - 1.9 * p, fz + uz * 3.5);
    this.constrain(wantPos, null);
    if (this.pvSnap) {
      this.camPos.copy(wantPos);
      this.look.copy(wantLook);
      this.camVel.set(0, 0, 0);
      this.lookVel.set(0, 0, 0);
      this.pvSnap = false;
    } else {
      smoothDampVec(this.camPos, wantPos, this.camVel, 0.4, 0.4, realDt);
      smoothDampVec(this.look, wantLook, this.lookVel, 0.4, 0.4, realDt);
    }
    const cam = this.camera;
    cam.position.copy(this.camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    this.setFov(MathUtils.lerp(42, 50, p));
  }

  // ──────────────────────────────────────────────────────────── filmer ──

  /** Plant the filmer at `pos`, already looking at `subject`. */
  startFilmer(pos: Vector3, subject: Vector3): void {
    this.filmerPos.copy(pos);
    this.constrain(this.filmerPos, null);
    this.look.copy(subject);
    this.lookVel.set(0, 0, 0);
    this.filmerTime = 0;
    this.fov = this.filmerFov(subject, 0.34);
  }

  /** FOV that makes the rider fill `frac` of the frame height from the filmer position. */
  private filmerFov(subject: Vector3, frac: number): number {
    const d = Math.max(1.5, this.filmerPos.distanceTo(subject));
    return MathUtils.clamp((2 * Math.atan(RIDER_HEIGHT / frac / 2 / d)) / DEG, 11, 62);
  }

  /** Replay camera: pans/tilts after the rider like a person holding a camera, slowly zooming in. */
  updateFilmer(realDt: number, s: RiderSimState, rig: IRiderRig | null): void {
    this.clock += realDt;
    if (this.mode === 'free') {
      this.free.update(realDt, this.camera);
      return;
    }
    this.filmerTime += realDt;
    const subject = this.tmpA;
    if (rig) rig.getChestWorldPosition(subject);
    else subject.copy(s.pos).setY(s.pos.y + 1);
    // A human operator trails the action slightly.
    smoothDampVec(this.look, subject, this.lookVel, 0.14, 0.14, realDt);
    const frac = 0.34 + 0.12 * smoothstep(0, 6, this.filmerTime);
    this.fov = expDamp(this.fov, this.filmerFov(this.look, frac), 2.5, realDt);

    const cam = this.camera;
    const t = this.clock;
    cam.position.copy(this.filmerPos);
    cam.position.y += wobble(t * 1.7, 7) * 0.02;
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    // Handheld sway scales with the zoom (long lens = more visible wobble, but keep it gentle).
    const k = 0.0045 * (this.fov / 40);
    cam.rotateX(wobble(t * 1.3, 8) * k + wobble(t * 6.1, 9) * k * 0.25);
    cam.rotateY(wobble(t * 1.1, 10) * k + wobble(t * 5.3, 11) * k * 0.25);
    cam.rotateZ(wobble(t * 0.7, 12) * k * 0.8);
    this.setFov(this.fov);
  }

  // ───────────────────────────────────────────────────────── still frame ──

  /**
   * Frame a tall story image on `cam` (a separate camera): the rider takes about a third of the height
   * and sits at ~57 % from the top, leaving sky above for the title and room below for the score.
   */
  frameStill(cam: PerspectiveCamera, from: Vector3, chest: Vector3, aspect: number): void {
    const pos = this.tmpA.copy(from);
    this.constrain(pos, null);
    const d = Math.max(1.5, pos.distanceTo(chest));
    // In a very tall frame the horizontal FOV is tiny — keep the rider's width (board ≈ 1.4 m) inside it too.
    const fracV = 0.3;
    const halfV = Math.max(RIDER_HEIGHT / fracV / 2 / d, 1.5 / Math.max(0.2, aspect) / d);
    const fov = MathUtils.clamp((2 * Math.atan(halfV)) / DEG, 12, 70);
    cam.fov = fov;
    cam.aspect = aspect;
    cam.near = this.camera.near;
    cam.far = this.camera.far;
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    // Chest at NDC y = 1 − 2·0.57 → aim above it by the matching angle.
    const lift = 0.14 * Math.tan((fov * DEG) / 2) * d;
    this.tmpB.copy(chest);
    this.tmpB.y += lift;
    cam.lookAt(this.tmpB);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }
}
