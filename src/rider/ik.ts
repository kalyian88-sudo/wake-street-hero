/**
 * Analytic IK + small orientation helpers for the procedural rider rig.
 * Pure math (three math classes only) — unit-tested headless in tests/unit/ik.test.ts.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';

const _d = new Vector3();
const _p = new Vector3();
const _alt = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _m = new Matrix4();

/** Fraction of the full chain length the solver is allowed to reach (keeps the joint from locking dead straight). */
export const IK_MAX_STRETCH = 0.9985;

/**
 * Two-bone IK. The chain root → mid → end has segment lengths `l1`, `l2`. Places `outMid` so the
 * end reaches `target` (clamped to what the chain can reach) with the middle joint bending towards
 * `pole` — a DIRECTION in the same space, not a point. `outEnd` receives the reached end position.
 *
 * Never produces NaN: degenerate inputs (target on the root, pole parallel to the chain) fall back to
 * a stable perpendicular.
 *
 * @returns the unclamped root → target distance divided by the chain length (> 1 = out of reach).
 */
export function solveTwoBone(
  root: Vector3,
  target: Vector3,
  pole: Vector3,
  l1: number,
  l2: number,
  outMid: Vector3,
  outEnd: Vector3,
): number {
  const total = l1 + l2;
  _d.subVectors(target, root);
  const raw = _d.length();
  const maxD = total * IK_MAX_STRETCH;
  const minD = Math.abs(l1 - l2) + total * 0.02;
  const dist = Math.min(maxD, Math.max(minD, raw));
  if (raw > 1e-6) _d.multiplyScalar(1 / raw);
  else {
    // target sits on the root: fold the chain along −pole
    _d.copy(pole).multiplyScalar(-1);
    if (_d.lengthSq() < 1e-10) _d.set(0, -1, 0);
    _d.normalize();
  }
  // perpendicular component of the pole = bend direction
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) {
    // pole is parallel to the chain: pick the world axis least aligned with it
    const ax = Math.abs(_d.x);
    const ay = Math.abs(_d.y);
    const az = Math.abs(_d.z);
    if (ax <= ay && ax <= az) _alt.set(1, 0, 0);
    else if (az <= ay) _alt.set(0, 0, 1);
    else _alt.set(0, 1, 0);
    _p.copy(_alt).addScaledVector(_d, -_alt.dot(_d));
  }
  _p.normalize();
  // distance from the root to the foot of the mid joint along the chain axis, and its height off the axis
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  outMid.copy(root).addScaledVector(_d, a).addScaledVector(_p, h);
  outEnd.copy(root).addScaledVector(_d, dist);
  return raw / total;
}

/**
 * Orientation whose local +Y points along `yDir` and whose local +Z is as close as possible to `zHint`.
 * Used for limb bones (bind pose limbs hang along −Y, so callers pass the reversed limb direction).
 */
export function quatFromYZ(out: Quaternion, yDir: Vector3, zHint: Vector3): Quaternion {
  _y.copy(yDir);
  if (_y.lengthSq() < 1e-12) _y.set(0, 1, 0);
  _y.normalize();
  _z.copy(zHint).addScaledVector(_y, -zHint.dot(_y));
  if (_z.lengthSq() < 1e-8) {
    // hint parallel to the axis → any stable perpendicular
    if (Math.abs(_y.x) < 0.9) _alt.set(1, 0, 0);
    else _alt.set(0, 0, 1);
    _z.copy(_alt).addScaledVector(_y, -_alt.dot(_y));
  }
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/** Orientation from an (assumed roughly orthogonal) X hint and exact Y: local +Y = yDir, local +X ≈ xHint. */
export function quatFromYX(out: Quaternion, yDir: Vector3, xHint: Vector3): Quaternion {
  _y.copy(yDir);
  if (_y.lengthSq() < 1e-12) _y.set(0, 1, 0);
  _y.normalize();
  _x.copy(xHint).addScaledVector(_y, -xHint.dot(_y));
  if (_x.lengthSq() < 1e-8) {
    if (Math.abs(_y.z) < 0.9) _alt.set(0, 0, 1);
    else _alt.set(1, 0, 0);
    _x.copy(_alt).addScaledVector(_y, -_alt.dot(_y));
  }
  _x.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/** Mirror a rotation across the YZ plane (x → −x). Used to turn the regular-stance pose into goofy. */
export function mirrorQuatX(q: Quaternion): Quaternion {
  q.y = -q.y;
  q.z = -q.z;
  return q;
}

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a <= 0) a += 2 * Math.PI;
  return a - Math.PI;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * Exact critically damped spring step (stable for any dt). `state` = [value, velocity] stored at
 * `i`, `i + 1` of a Float32Array / number[].
 */
export function springStep(state: Float32Array | number[], i: number, target: number, omega: number, dt: number): number {
  const c1 = state[i] - target;
  const c2 = state[i + 1] + omega * c1;
  const e = Math.exp(-omega * dt);
  state[i] = target + (c1 + c2 * dt) * e;
  state[i + 1] = (state[i + 1] - omega * c2 * dt) * e;
  return state[i];
}

/** Cheap deterministic smooth noise in −1..1 (sum of incommensurate sines) — pose jitter that survives replay scrubbing. */
export function wobble(t: number, seed: number): number {
  return (
    Math.sin(t * 1.0 + seed * 12.9898) * 0.5 +
    Math.sin(t * 2.31 + seed * 78.233) * 0.3 +
    Math.sin(t * 4.17 + seed * 37.719) * 0.2
  );
}
