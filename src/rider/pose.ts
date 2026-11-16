/**
 * Pose description of the procedural rider. A pose is a flat set of scalar parameters authored for a
 * REGULAR rider in "canonical" space (board nose +Z, toes −X, heels +X); goofy is the X-mirror of the
 * solved skeleton. Targets are pure functions of the sim state (animator.ts); critically damped
 * springs chase them, so every transition is smooth and update(state, 0) can snap exactly.
 *
 * Lengths are metres for the 1.78 m figure (multiplied by Proportions.scale when solved), angles radians.
 */
import { springStep } from './ik';

export interface PoseParams {
  // ── frame: rider + board as a whole ──
  /** Extra yaw of rider + board about world up (deep-water start, raley, rail slides). */
  wYaw: number;
  /** Pitch about the horizontal axis perpendicular to the rope (raley swing, head towards the winch). */
  tPitch: number;
  /** Vertical offset of the whole figure (sitting in the water, sinking after a bail). */
  sink: number;
  /** 0..1 — body hangs from the handle (raley): the frame is translated so the shoulders trail the handle. */
  hang: number;
  // ── board (relative to the frame) ──
  /** Roll about the long axis; + = toe-side edge down. */
  edge: number;
  /** + = nose up. */
  bPitch: number;
  /** Board yaw relative to the body (shifty, tweaks). */
  bYaw: number;
  /** z of the pitch pivot (presses pivot under one foot). */
  bPivot: number;
  /** Slide of the board (and the rider on it) along its long axis, metres; + = towards the nose. Nose/tail slides. */
  bZ: number;
  /** Board drop / lift relative to the feet (wakeskate flips). */
  bY: number;
  /** Surface normal the board lies on (frame space). */
  nX: number;
  nY: number;
  nZ: number;
  /** How much the body follows the board normal (0 = stays world-upright, 1 = perpendicular to the board). */
  upMix: number;
  // ── body core ──
  /** Pelvis centre relative to the board centre: + = towards the heels. */
  hipX: number;
  hipY: number;
  /** + = towards the nose. */
  hipZ: number;
  /** Hips opening towards the nose. */
  pYaw: number;
  /** Forward hinge (chest towards the toes). */
  pPitch: number;
  /** Torso tilt towards the tail. */
  pRoll: number;
  sBend: number;
  /** Shoulders opening towards the nose relative to the hips. */
  sTwist: number;
  sSide: number;
  /** Whole-body inclination about the board's long axis; + = towards the toes. */
  lean: number;
  /** Head relative to the chest. */
  hdYaw: number;
  hdPitch: number;
  hdRoll: number;
  /** Knees apart. */
  kneeOut: number;
  // ── feet ──
  /** Feet lifted off the deck (wakeskate flips / bails). */
  liftF: number;
  liftR: number;
  /** Extra half stance width. */
  spread: number;
  /** 0..1 — feet together on the ground instead of on the board (menu idle pose). */
  narrow: number;
  // ── free board (lost wakeskate, idle pose) ──
  /** 0..1 — board leaves the feet and uses the free transform below (root space). */
  bFree: number;
  bfX: number;
  bfY: number;
  bfZ: number;
  bfPitch: number;
  bfYaw: number;
  bfRoll: number;
  // ── arms ──
  /** Front / rear hand on the handle. */
  hF: number;
  hR: number;
  /** Front / rear hand on the board grab point. */
  gF: number;
  gR: number;
  /** Free-hand targets in chest space: x = outwards, y = up, z = forwards. */
  fFx: number;
  fFy: number;
  fFz: number;
  fRx: number;
  fRy: number;
  fRz: number;
  /** Grab point in board space. */
  gpX: number;
  gpY: number;
  gpZ: number;
  /** 0 = grab an edge running along the board (side grabs), 1 = across it (nose / tail). */
  gAcross: number;
}

export type PoseKey = keyof PoseParams;

export function createPose(): PoseParams {
  return {
    wYaw: 0,
    tPitch: 0,
    sink: 0,
    hang: 0,
    edge: 0,
    bPitch: 0,
    bYaw: 0,
    bPivot: 0,
    bZ: 0,
    bY: 0,
    nX: 0,
    nY: 1,
    nZ: 0,
    upMix: 0.5,
    hipX: 0.05,
    hipY: 0.9,
    hipZ: -0.02,
    pYaw: 0.3,
    pPitch: 0.16,
    pRoll: 0.04,
    sBend: 0.1,
    sTwist: 0.2,
    sSide: 0,
    lean: 0,
    hdYaw: 0,
    hdPitch: 0,
    hdRoll: 0,
    kneeOut: 0.1,
    liftF: 0,
    liftR: 0,
    spread: 0,
    narrow: 0,
    bFree: 0,
    bfX: 0,
    bfY: 0,
    bfZ: 0,
    bfPitch: 0,
    bfYaw: 0,
    bfRoll: 0,
    hF: 1,
    hR: 1,
    gF: 0,
    gR: 0,
    fFx: 0.22,
    fFy: -0.38,
    fFz: 0.1,
    fRx: 0.22,
    fRy: -0.38,
    fRz: 0.1,
    gpX: 0,
    gpY: 0,
    gpZ: 0,
    gAcross: 0,
  };
}

export const POSE_KEYS = Object.keys(createPose()) as PoseKey[];

const NEUTRAL = createPose();

export function resetPose(p: PoseParams): PoseParams {
  for (const k of POSE_KEYS) p[k] = NEUTRAL[k];
  return p;
}

export function copyPose(src: PoseParams, dst: PoseParams): PoseParams {
  for (const k of POSE_KEYS) dst[k] = src[k];
  return dst;
}

/** dst = a + (b − a)·t for every parameter. */
export function lerpPose(a: PoseParams, b: PoseParams, t: number, dst: PoseParams): PoseParams {
  for (const k of POSE_KEYS) dst[k] = a[k] + (b[k] - a[k]) * t;
  return dst;
}

/** Spring stiffness (rad/s) per parameter: arms and board react faster than the heavy body core. */
const FAST: Partial<Record<PoseKey, number>> = {
  hF: 22,
  hR: 22,
  gF: 24,
  gR: 24,
  gpX: 30,
  gpY: 30,
  gpZ: 30,
  gAcross: 30,
  fFx: 15,
  fFy: 15,
  fFz: 15,
  fRx: 15,
  fRy: 15,
  fRz: 15,
  edge: 16,
  bPitch: 16,
  bYaw: 16,
  bY: 22,
  bPivot: 16,
  bZ: 12,
  liftF: 22,
  liftR: 22,
  spread: 18,
  hdYaw: 11,
  hdPitch: 11,
  hdRoll: 11,
  nX: 18,
  nY: 18,
  nZ: 18,
  wYaw: 9,
  tPitch: 12,
  hang: 12,
  sink: 7,
  bFree: 40,
  bfX: 40,
  bfY: 40,
  bfZ: 40,
  bfPitch: 40,
  bfYaw: 40,
  bfRoll: 40,
};
const BODY_OMEGA = 13;

/** Per-parameter critically damped springs chasing a target pose. */
export class PoseSprings {
  readonly value = createPose();
  private readonly state = new Float32Array(POSE_KEYS.length * 2);
  private readonly omega = new Float32Array(POSE_KEYS.length);

  constructor() {
    POSE_KEYS.forEach((k, i) => {
      this.omega[i] = FAST[k] ?? BODY_OMEGA;
      this.state[i * 2] = NEUTRAL[k];
    });
  }

  snap(target: PoseParams): void {
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const k = POSE_KEYS[i];
      this.state[i * 2] = target[k];
      this.state[i * 2 + 1] = 0;
      this.value[k] = target[k];
    }
  }

  step(target: PoseParams, dt: number): void {
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const k = POSE_KEYS[i];
      this.value[k] = springStep(this.state, i * 2, target[k], this.omega[i], dt);
    }
  }

  /** Kick a parameter's velocity (landing compression, rope jerk). */
  impulse(key: PoseKey, velocity: number): void {
    const i = POSE_KEYS.indexOf(key);
    if (i >= 0) this.state[i * 2 + 1] += velocity;
  }
}
