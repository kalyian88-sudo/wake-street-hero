import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { IK_MAX_STRETCH, mirrorQuatX, quatFromYX, quatFromYZ, solveTwoBone, springStep, wrapAngle } from '../../src/rider/ik';

const mid = new Vector3();
const end = new Vector3();

function finite(v: Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

describe('solveTwoBone', () => {
  it('reaches a reachable target with exact segment lengths', () => {
    const root = new Vector3(0.1, 0.9, -0.2);
    const target = new Vector3(0.3, 0.2, 0.1);
    const ratio = solveTwoBone(root, target, new Vector3(0, 0, 1), 0.43, 0.42, mid, end);
    expect(ratio).toBeLessThan(1);
    expect(end.distanceTo(target)).toBeLessThan(1e-6);
    expect(mid.distanceTo(root)).toBeCloseTo(0.43, 6);
    expect(mid.distanceTo(end)).toBeCloseTo(0.42, 6);
  });

  it('bends towards the pole direction', () => {
    const root = new Vector3(0, 1, 0);
    const target = new Vector3(0, 0.4, 0);
    for (const pole of [new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(0.7, 0.2, -0.7)]) {
      solveTwoBone(root, target, pole, 0.4, 0.4, mid, end);
      // mid joint offset from the root→target axis must point the same way as the (perpendicular part of the) pole
      const axis = target.clone().sub(root).normalize();
      const off = mid.clone().sub(root);
      off.addScaledVector(axis, -off.dot(axis));
      const perpPole = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
      expect(off.length()).toBeGreaterThan(0.05);
      expect(off.normalize().dot(perpPole)).toBeGreaterThan(0.999);
    }
  });

  it('clamps an out-of-reach target and keeps the chain pointing at it', () => {
    const root = new Vector3(0, 0, 0);
    const target = new Vector3(0, 0, 5);
    const ratio = solveTwoBone(root, target, new Vector3(0, 1, 0), 0.3, 0.26, mid, end);
    expect(ratio).toBeGreaterThan(1);
    expect(end.length()).toBeCloseTo(0.56 * IK_MAX_STRETCH, 6);
    expect(end.clone().normalize().z).toBeCloseTo(1, 6);
    expect(mid.distanceTo(root)).toBeCloseTo(0.3, 6);
    expect(mid.distanceTo(end)).toBeCloseTo(0.26, 6);
  });

  it('does not collapse when the target is too close', () => {
    const root = new Vector3(0, 1, 0);
    solveTwoBone(root, new Vector3(0, 0.999, 0), new Vector3(0, 0, 1), 0.43, 0.3, mid, end);
    expect(finite(mid) && finite(end)).toBe(true);
    expect(mid.distanceTo(root)).toBeCloseTo(0.43, 6);
    expect(mid.distanceTo(end)).toBeCloseTo(0.3, 6);
  });

  it('survives degenerate input (target on the root, pole parallel to the chain, zero pole)', () => {
    const root = new Vector3(1, 2, 3);
    solveTwoBone(root, root.clone(), new Vector3(0, 0, 1), 0.4, 0.4, mid, end);
    expect(finite(mid) && finite(end)).toBe(true);
    solveTwoBone(root, new Vector3(1, 1.5, 3), new Vector3(0, -1, 0), 0.4, 0.4, mid, end);
    expect(finite(mid) && finite(end)).toBe(true);
    expect(mid.distanceTo(root)).toBeCloseTo(0.4, 6);
    solveTwoBone(root, new Vector3(1.2, 1.5, 3), new Vector3(0, 0, 0), 0.4, 0.4, mid, end);
    expect(finite(mid) && finite(end)).toBe(true);
    solveTwoBone(root, root.clone(), new Vector3(0, 0, 0), 0.4, 0.4, mid, end);
    expect(finite(mid) && finite(end)).toBe(true);
  });

  it('is continuous for small target moves', () => {
    const root = new Vector3(0, 1, 0);
    const pole = new Vector3(0, 0, 1);
    const prev = new Vector3();
    solveTwoBone(root, new Vector3(0.2, 0.3, 0), pole, 0.43, 0.42, prev, end);
    for (let i = 1; i <= 50; i++) {
      solveTwoBone(root, new Vector3(0.2 + i * 0.002, 0.3 - i * 0.004, i * 0.003), pole, 0.43, 0.42, mid, end);
      expect(mid.distanceTo(prev)).toBeLessThan(0.02);
      prev.copy(mid);
    }
  });
});

describe('orientation helpers', () => {
  it('quatFromYZ maps +Y onto the axis and +Z towards the hint', () => {
    const q = new Quaternion();
    const axis = new Vector3(0.3, -0.8, 0.5).normalize();
    const hint = new Vector3(0, 0, 1);
    quatFromYZ(q, axis, hint);
    expect(new Vector3(0, 1, 0).applyQuaternion(q).distanceTo(axis)).toBeLessThan(1e-6);
    const z = new Vector3(0, 0, 1).applyQuaternion(q);
    expect(Math.abs(z.dot(axis))).toBeLessThan(1e-6);
    expect(z.dot(hint)).toBeGreaterThan(0.5);
    expect(q.length()).toBeCloseTo(1, 6);
  });

  it('quatFromYZ / quatFromYX stay finite when the hint is parallel to the axis', () => {
    const q = new Quaternion();
    quatFromYZ(q, new Vector3(0, 0, 1), new Vector3(0, 0, 2));
    expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true);
    expect(new Vector3(0, 1, 0).applyQuaternion(q).z).toBeCloseTo(1, 6);
    quatFromYX(q, new Vector3(1, 0, 0), new Vector3(-3, 0, 0));
    expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true);
    expect(new Vector3(0, 1, 0).applyQuaternion(q).x).toBeCloseTo(1, 6);
  });

  it('quatFromYX maps +X towards the hint', () => {
    const q = new Quaternion();
    quatFromYX(q, new Vector3(0, 1, 0), new Vector3(1, 0.4, 0));
    expect(new Vector3(1, 0, 0).applyQuaternion(q).x).toBeCloseTo(1, 6);
  });

  it('mirrorQuatX mirrors a rotation across the YZ plane', () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0.2, 0.7, -0.4).normalize(), 1.1);
    const v = new Vector3(0.3, -0.5, 0.9);
    const rotatedThenMirrored = v.clone().applyQuaternion(q);
    rotatedThenMirrored.x *= -1;
    const mirroredThenRotated = new Vector3(-v.x, v.y, v.z).applyQuaternion(mirrorQuatX(q.clone()));
    expect(mirroredThenRotated.distanceTo(rotatedThenMirrored)).toBeLessThan(1e-6);
  });

  it('wrapAngle folds into (−π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 6);
    expect(wrapAngle(2 * Math.PI + 0.3)).toBeCloseTo(0.3, 6);
    expect(wrapAngle(-2 * Math.PI - 0.3)).toBeCloseTo(-0.3, 6);
  });
});

describe('springStep', () => {
  it('converges without overshoot and is frame-rate independent', () => {
    const a = [0, 0];
    const b = [0, 0];
    let maxA = 0;
    for (let i = 0; i < 120; i++) maxA = Math.max(maxA, springStep(a, 0, 1, 14, 1 / 60));
    for (let i = 0; i < 12; i++) springStep(b, 0, 1, 14, 1 / 6);
    expect(maxA).toBeLessThanOrEqual(1 + 1e-9);
    expect(a[0]).toBeCloseTo(1, 4);
    expect(a[0]).toBeCloseTo(b[0], 6);
  });

  it('dt = 0 leaves the state untouched', () => {
    const s = [0.3, 2];
    springStep(s, 0, 1, 14, 0);
    expect(s[0]).toBeCloseTo(0.3, 9);
    expect(s[1]).toBeCloseTo(2, 9);
  });
});
