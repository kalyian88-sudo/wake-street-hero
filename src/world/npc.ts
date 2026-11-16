/**
 * Procedural people: the winch operator (animated: idle sway, hand on the throttle, leans back under
 * rope tension, cheers, facepalms) and the filmer (tracks the rider with a camera).
 * Figures are built from tapered limbs + ellipsoids in one vertex-coloured 'flat' material.
 * Local frame: feet on y = 0, facing +Z.
 */
import { Group, Mesh, Quaternion, Vector3 } from 'three';
import type { Material } from 'three';
import { BRAND } from '../config';
import { GB } from './geo';
import type { P3 } from './geo';

export interface FigureLook {
  skin: number;
  shirt: number;
  shorts: number;
  hair: number;
  cap: number | null;
  shoes: number;
  /** White chest print (reads as a logo tee). */
  print?: boolean;
  shades?: boolean;
  capBackwards?: boolean;
}

export const HIP_Y = 0.93;
const SHOULDER: P3 = [0.2, 0.5, 0];
const UPPER = 0.28;
const FORE = 0.29;

export function buildLegs(g: GB, look: FigureLook, spread = 0.1): void {
  for (const sx of [-1, 1]) {
    const x = sx * spread;
    g.color(look.shoes);
    g.chamferBox(x, 0, 0.035, 0.1, 0.075, 0.26, 0.02);
    g.color(look.skin);
    g.rod([x, 0.07, 0], [x * 1.04, 0.5, 0.012], 0.04, 7, false, 0.055);
    g.color(look.shorts);
    g.rod([x * 1.04, 0.47, 0.012], [x * 0.9, 0.92, 0], 0.062, 8, false, 0.086);
  }
  g.color(look.shorts);
  g.sphere(0, HIP_Y, 0, 0.165, 0.12, 0.118, 10, 6);
}

/** Torso + head, relative to the hip pivot (0, HIP_Y, 0). */
export function buildTorso(g: GB, look: FigureLook): void {
  g.color(look.shirt);
  g.sphere(0, 0.15, 0, 0.152, 0.2, 0.108, 10, 6);
  g.sphere(0, 0.36, 0.006, 0.186, 0.2, 0.122, 12, 7);
  for (const sx of [-1, 1]) g.sphere(sx * SHOULDER[0], SHOULDER[1], 0, 0.064, 0.06, 0.064, 8, 5);
  if (look.print) {
    g.color(0xffffff);
    g.box(0, 0.4, 0.121, 0.17, 0.05, 0.012);
    g.box(0, 0.38, -0.119, 0.22, 0.07, 0.012);
  }
  g.color(look.skin);
  g.cyl(0, 0.5, 0, 0.046, 0.044, 0.1, 8, false);
  g.sphere(0, 0.705, 0.012, 0.09, 0.112, 0.1, 12, 8);
  g.color(look.hair);
  g.sphere(0, 0.72, -0.016, 0.095, 0.104, 0.097, 10, 6);
  if (look.shades) {
    g.color(0x15161a);
    g.box(0, 0.725, 0.092, 0.15, 0.032, 0.035);
  }
  if (look.cap !== null) {
    g.color(look.cap);
    g.sphere(0, 0.75, 0.004, 0.099, 0.085, 0.106, 10, 4, 0.5, 1);
    const dir = look.capBackwards ? -1 : 1;
    g.push().translate(0, 0.758, dir * 0.135).rotX(dir * 0.12).box(0, 0, 0, 0.15, 0.012, 0.12);
    g.pop();
  }
}

/** Upper arm hanging along −Y from the shoulder joint (origin). */
function buildUpperArm(g: GB, look: FigureLook): void {
  g.color(look.shirt);
  g.rod([0, 0.01, 0], [0, -0.16, 0], 0.056, 7, false, 0.05);
  g.color(look.skin);
  g.rod([0, -0.14, 0], [0, -UPPER, 0], 0.044, 7, false, 0.039);
  g.sphere(0, -UPPER, 0, 0.04, 0.04, 0.04, 6, 4);
}
function buildForearm(g: GB, look: FigureLook): void {
  g.color(look.skin);
  g.rod([0, 0, 0], [0, -0.25, 0], 0.038, 7, false, 0.03);
  g.sphere(0, -FORE, 0, 0.04, 0.05, 0.03, 7, 5);
}

const _dir = new Vector3();
const _pole = new Vector3();

/** Analytic two-bone IK: elbow position for shoulder S and hand target T. */
export function solveElbow(S: Vector3, T: Vector3, pole: Vector3, out: Vector3): Vector3 {
  _dir.subVectors(T, S);
  let d = _dir.length();
  if (d < 1e-4) return out.copy(S).addScaledVector(pole, UPPER);
  _dir.multiplyScalar(1 / d);
  d = Math.min(UPPER + FORE - 0.004, Math.max(Math.abs(UPPER - FORE) + 0.004, d));
  const x = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - x * x));
  _pole.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_pole.lengthSq() < 1e-6) _pole.set(0, -1, 0);
  _pole.normalize();
  return out.copy(S).addScaledVector(_dir, x).addScaledVector(_pole, h);
}

/** Bake an arm (shoulder → hand) into a builder using the same IK as the animated one. */
function bakeArm(g: GB, look: FigureLook, s: P3, t: P3, pole: P3): void {
  const S = new Vector3(...s);
  const T = new Vector3(...t);
  const E = solveElbow(S, T, new Vector3(...pole), new Vector3());
  const e: P3 = [E.x, E.y, E.z];
  const mid: P3 = [s[0] + (e[0] - s[0]) * 0.55, s[1] + (e[1] - s[1]) * 0.55, s[2] + (e[2] - s[2]) * 0.55];
  g.color(look.shirt);
  g.rod(s, mid, 0.056, 7, false, 0.05);
  g.color(look.skin);
  g.rod(mid, e, 0.044, 7, false, 0.039);
  g.sphere(e[0], e[1], e[2], 0.04, 0.04, 0.04, 6, 4);
  g.rod(e, t, 0.038, 7, false, 0.03);
  g.sphere(t[0], t[1], t[2], 0.042, 0.042, 0.042, 7, 5);
}

const DOWN = new Vector3(0, -1, 0);
const _q = new Quaternion();
const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _s = new Vector3();
const _t = new Vector3();
const _e = new Vector3();

function aim(mesh: Mesh, from: Vector3, to: Vector3): void {
  mesh.position.copy(from);
  _v1.subVectors(to, from).normalize();
  mesh.quaternion.copy(_q.setFromUnitVectors(DOWN, _v1));
}

export type OperatorMood = 'idle' | 'cheer' | 'facepalm';

export interface Operator {
  readonly group: Group;
  /** Hand targets in the operator's local space. */
  setHands(throttle: Vector3, rest: Vector3): void;
  react(mood: OperatorMood, seconds?: number): void;
  update(dt: number, time: number, tension: number): void;
}

export const OPERATOR_LOOK: FigureLook = { skin: 0xd29a6c, shirt: BRAND.colors.red, shorts: 0x24252a, hair: 0x1b1512, cap: 0x1c1d21, shoes: 0xe9e9e6, print: true, shades: true };

export function createOperator(mat: Material, look: FigureLook = OPERATOR_LOOK): Operator {
  const group = new Group();
  group.name = 'operator';
  const mk = (g: GB): Mesh => {
    const m = new Mesh(g.build(), mat);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const lg = new GB();
  buildLegs(lg, look, 0.11);
  mk(lg);
  const torso = new Group();
  torso.position.set(0, HIP_Y, 0);
  const tg = new GB();
  buildTorso(tg, look);
  const torsoMesh = new Mesh(tg.build(), mat);
  torsoMesh.castShadow = true;
  torso.add(torsoMesh);
  group.add(torso);
  const ua = new GB();
  buildUpperArm(ua, look);
  const uaGeo = ua.build();
  const fa = new GB();
  buildForearm(fa, look);
  const faGeo = fa.build();
  const arms = [-1, 1].map((sx) => {
    const upper = new Mesh(uaGeo, mat);
    const fore = new Mesh(faGeo, mat);
    upper.castShadow = fore.castShadow = true;
    group.add(upper, fore);
    return { sx, upper, fore };
  });

  const throttle = new Vector3(0.12, 1.03, 0.4);
  const rest = new Vector3(-0.36, 1.0, 0.38);
  let mood: OperatorMood = 'idle';
  let moodLeft = 0;
  let w = 0;
  let lean = 0;
  const pole = new Vector3();

  return {
    group,
    setHands(t, r) {
      throttle.copy(t);
      rest.copy(r);
    },
    react(m, seconds = 2.4) {
      mood = m;
      moodLeft = seconds;
    },
    update(dt, time, tension) {
      if (moodLeft > 0) {
        moodLeft -= dt;
        w += (1 - w) * Math.min(1, dt * 9);
      } else {
        w += (0 - w) * Math.min(1, dt * 5);
        if (w < 0.01) mood = 'idle';
      }
      lean += (tension * 0.2 - lean) * Math.min(1, dt * 4);
      const cheer = mood === 'cheer' ? w : 0;
      const palm = mood === 'facepalm' ? w : 0;
      torso.rotation.set(-lean + palm * 0.22 + Math.sin(time * 0.9) * 0.012, Math.sin(time * 0.55) * 0.05 * (1 - w), Math.sin(time * 0.8) * 0.02);
      torso.position.y = HIP_Y + Math.abs(Math.sin(time * 7.5)) * 0.045 * cheer - palm * 0.01;
      torso.updateMatrix();
      for (const a of arms) {
        _s.set(a.sx * SHOULDER[0], SHOULDER[1], SHOULDER[2]).applyMatrix4(torso.matrix);
        // idle target: right hand on the throttle, left hand on the bar
        _t.copy(a.sx > 0 ? throttle : rest);
        if (cheer > 0) {
          _v2.set(a.sx * 0.3, torso.position.y + 0.98 + Math.sin(time * 13 + a.sx) * 0.07, 0.08);
          _t.lerp(_v2, cheer);
        }
        if (palm > 0) {
          if (a.sx > 0) _v2.set(0.02, 0.69, 0.13).applyMatrix4(torso.matrix);
          else _v2.set(-0.22, HIP_Y + 0.02, 0.07);
          _t.lerp(_v2, palm);
        }
        pole.set(a.sx * 0.7, -0.8 + cheer * 0.6, -0.5 + cheer * 0.2 + palm * 0.4);
        solveElbow(_s, _t, pole, _e);
        aim(a.upper, _s, _e);
        // the hand may not reach the target → the forearm still points at it
        _v3.subVectors(_t, _e).normalize();
        a.fore.position.copy(_e);
        a.fore.quaternion.copy(_q.setFromUnitVectors(DOWN, _v3));
      }
    },
  };
}

export interface Filmer {
  readonly group: Group;
  /** World position of the camera lens (for getFilmerCamera). */
  lensWorld(out: Vector3): Vector3;
  /** Track a world point (null = slow idle pan). */
  update(dt: number, time: number, target: Vector3 | null): void;
}

export const FILMER_LOOK: FigureLook = { skin: 0xb47a4e, shirt: 0x24252a, shorts: 0x8a8468, hair: 0x1b1512, cap: BRAND.colors.red, shoes: 0x2a2b30, print: true, capBackwards: true };

export function createFilmer(mat: Material, baseYaw: number, look: FigureLook = FILMER_LOOK): Filmer {
  const group = new Group();
  group.name = 'filmer';
  const lg = new GB();
  buildLegs(lg, look, 0.14);
  const legs = new Mesh(lg.build(), mat);
  legs.castShadow = true;
  group.add(legs);
  const upper = new Group();
  upper.position.set(0, HIP_Y, 0);
  const g = new GB();
  buildTorso(g, look);
  // camera rig held in front of the face
  const cam: P3 = [0.05, 0.66, 0.27];
  g.color(0x1a1b1e);
  g.chamferBox(cam[0], cam[1] - 0.06, cam[2], 0.12, 0.12, 0.2, 0.015, '');
  g.push().translate(cam[0], cam[1], cam[2] + 0.1).rotX(Math.PI / 2).cyl(0, 0, 0, 0.048, 0.055, 0.12, 10, true);
  g.pop();
  g.color(0x0a0a0c);
  g.push().translate(cam[0], cam[1], cam[2] + 0.221).rotX(Math.PI / 2).disc(0, 0, 0, 0.045, 10, 1);
  g.pop();
  g.color(0x2a2b30);
  g.beam([cam[0], cam[1] + 0.07, cam[2] - 0.08], [cam[0], cam[1] + 0.07, cam[2] + 0.08], 0.022, 0.022);
  g.box(cam[0], cam[1] + 0.045, cam[2] - 0.07, 0.02, 0.05, 0.02);
  g.box(cam[0], cam[1] + 0.045, cam[2] + 0.07, 0.02, 0.05, 0.02);
  // fluffy mic
  g.color(0x6d6a66);
  g.sphere(cam[0] + 0.03, cam[1] + 0.11, cam[2] + 0.1, 0.03, 0.03, 0.06, 7, 5);
  g.color(BRAND.colors.red);
  g.box(cam[0] - 0.062, cam[1] - 0.01, cam[2], 0.004, 0.03, 0.1);
  bakeArm(g, look, [SHOULDER[0], SHOULDER[1], 0], [cam[0] + 0.09, cam[1] - 0.02, cam[2] + 0.02], [0.8, -0.7, -0.2]);
  bakeArm(g, look, [-SHOULDER[0], SHOULDER[1], 0], [cam[0] - 0.03, cam[1] - 0.085, cam[2] + 0.12], [-0.7, -0.8, -0.1]);
  const up = new Mesh(g.build(), mat);
  up.castShadow = true;
  upper.add(up);
  group.add(upper);
  group.rotation.y = baseYaw;
  let yaw = baseYaw;
  let pitch = 0;
  const lensLocal = new Vector3(cam[0], cam[1], cam[2] + 0.24);

  return {
    group,
    lensWorld(out) {
      return out.copy(lensLocal).applyMatrix4(upper.matrixWorld);
    },
    update(dt, time, target) {
      let wantYaw = baseYaw + Math.sin(time * 0.3) * 0.35;
      let wantPitch = 0;
      if (target) {
        const dx = target.x - group.position.x;
        const dz = target.z - group.position.z;
        wantYaw = Math.atan2(dx, dz);
        wantPitch = -Math.atan2(target.y + 0.9 - (group.position.y + 1.6), Math.hypot(dx, dz));
      }
      let dy = wantYaw - yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw += dy * Math.min(1, dt * 5);
      pitch += (Math.max(-0.5, Math.min(0.5, wantPitch)) - pitch) * Math.min(1, dt * 5);
      group.rotation.y = yaw;
      upper.rotation.x = pitch * 0.8 + 0.04;
    },
  };
}
