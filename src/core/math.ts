/**
 * Small allocation-free smoothing helpers shared by the core (camera, time, replay).
 */
import type { Vector3 } from 'three';

const TAU = Math.PI * 2;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Wrap to (−π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a <= 0) a += TAU;
  return a - Math.PI;
}

/** Shortest signed difference b − a. */
export function angleDelta(a: number, b: number): number {
  return wrapAngle(b - a);
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDelta(a, b) * t;
}

/** Frame-rate independent exponential approach. */
export function expDamp(cur: number, target: number, rate: number, dt: number): number {
  return target + (cur - target) * Math.exp(-rate * dt);
}

/** Scalar with its own velocity for critically damped springs. */
export interface Spring {
  v: number;
}

/**
 * Critically damped spring (same maths as Unity's SmoothDamp). `smoothTime` ≈ time to cover most of the gap.
 * The velocity is kept in `s.v`.
 */
export function smoothDamp(cur: number, target: number, s: Spring, smoothTime: number, dt: number): number {
  if (dt <= 0) return cur;
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (s.v + omega * change) * dt;
  s.v = (s.v - omega * temp) * exp;
  return target + (change + temp) * exp;
}

export function smoothDampAngle(cur: number, target: number, s: Spring, smoothTime: number, dt: number): number {
  return smoothDamp(cur, cur + angleDelta(cur, target), s, smoothTime, dt);
}

/** Per-component critically damped spring for vectors; `vel` holds the spring velocity. */
export function smoothDampVec(cur: Vector3, target: Vector3, vel: Vector3, smoothTimeXZ: number, smoothTimeY: number, dt: number): void {
  if (dt <= 0) return;
  for (let i = 0; i < 3; i++) {
    const st = i === 1 ? smoothTimeY : smoothTimeXZ;
    const omega = 2 / Math.max(1e-4, st);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const c = cur.getComponent(i);
    const tg = target.getComponent(i);
    const v = vel.getComponent(i);
    const change = c - tg;
    const temp = (v + omega * change) * dt;
    vel.setComponent(i, (v - omega * temp) * exp);
    cur.setComponent(i, tg + (change + temp) * exp);
  }
}

/** Cheap smooth pseudo-noise −1..1 from a few incommensurate sines (camera shake / handheld sway). */
export function wobble(t: number, seed: number): number {
  return (
    Math.sin(t * 1.0 + seed * 12.9898) * 0.5 +
    Math.sin(t * 2.31 + seed * 78.233) * 0.3 +
    Math.sin(t * 4.73 + seed * 37.719) * 0.2
  );
}
