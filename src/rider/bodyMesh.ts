/**
 * Procedural rider body (torso, limbs, hands, feet, clothes, boots) as ONE skinned geometry in bind
 * space: character faces +Z, left = +X, soles on y = 0, arms and legs hanging straight down.
 */
import { BufferGeometry, Vector3 } from 'three';
import { BRAND } from '../config';
import type { BoardKind } from '../types';
import { MeshBuilder, ringsOf, type Ring } from './geo';
import { contrast, shade } from './paint';
import { ATLAS, B, SWATCH, rectUV, swatchUV, type Outfit, type Proportions } from './rigDef';

/** Shorts length below the knee (m) and where the knee falls in the leg texture (v). */
const SHORTS_BELOW_KNEE = 0.04;
const SHORTS_KNEE_V = 0.22;

const FRONT = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const _a = new Vector3();
const _b = new Vector3();

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Torso section table: [h above the hip joint (unscaled m), half width, half depth, depth offset, exponent]. */
const TORSO_M: readonly (readonly number[])[] = [
  [-0.082, 0.062, 0.066, 0, 2],
  [-0.05, 0.126, 0.097, -0.006, 2.3],
  [0.0, 0.158, 0.106, -0.01, 2.5],
  [0.05, 0.16, 0.106, -0.01, 2.5],
  [0.1, 0.15, 0.1, -0.005, 2.5],
  [0.16, 0.138, 0.093, 0, 2.4],
  [0.23, 0.142, 0.097, 0.004, 2.4],
  [0.31, 0.152, 0.108, 0.008, 2.5],
  [0.39, 0.16, 0.116, 0.01, 2.6],
  [0.455, 0.16, 0.108, 0.004, 2.4],
  [0.505, 0.156, 0.094, -0.004, 2.15],
  [0.528, 0.146, 0.083, -0.008, 2.1],
  [0.552, 0.108, 0.07, -0.01, 2.1],
  [0.572, 0.062, 0.06, -0.008, 2],
];
const TORSO_F: readonly (readonly number[])[] = [
  [-0.082, 0.058, 0.064, 0, 2],
  [-0.05, 0.126, 0.096, -0.006, 2.3],
  [0.0, 0.16, 0.106, -0.012, 2.4],
  [0.05, 0.158, 0.104, -0.012, 2.4],
  [0.1, 0.142, 0.096, -0.006, 2.4],
  [0.16, 0.12, 0.084, 0, 2.3],
  [0.23, 0.122, 0.088, 0.004, 2.3],
  [0.31, 0.134, 0.104, 0.014, 2.4],
  [0.39, 0.14, 0.112, 0.018, 2.5],
  [0.455, 0.138, 0.098, 0.006, 2.5],
  [0.505, 0.134, 0.084, -0.004, 2.2],
  [0.545, 0.096, 0.066, -0.008, 2.0],
  [0.572, 0.054, 0.052, -0.006, 2],
];

/** Interpolated torso section at height h (unscaled metres above the hip joint). */
function torsoAt(table: readonly (readonly number[])[], h: number, out: number[]): number[] {
  let i = 0;
  while (i < table.length - 2 && table[i + 1][0] < h) i++;
  const a = table[i];
  const b = table[i + 1];
  const t = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0])));
  for (let k = 0; k < 5; k++) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export interface BodyBuild {
  geometry: BufferGeometry;
  triangles: number;
}

export function buildBody(o: Outfit, P: Proportions, board: BoardKind): BodyBuild {
  const b = new MeshBuilder(true);
  const s = P.scale;
  const g = P.girth;
  const table = P.female ? TORSO_F : TORSO_M;
  const wet = o.bottom === 'wetsuit';
  const hoodie = o.top === 'hoodie';
  const jersey = o.top === 'jersey';
  const suit = wet && !hoodie && !jersey;
  const skin = o.skin;
  const topC = hoodie || jersey || !wet ? o.topLook.primary : o.bottomLook.primary;
  const suitC = o.bottomLook.primary;
  const sw = (k: number): void => {
    const uv = swatchUV(k);
    b.uv(uv[0], uv[1]);
  };

  // ── torso: one loft, weights blended pelvis → spine → chest by height ──
  const torsoSkin = (p: Vector3, out: [number, number, number]): void => {
    const h = (p.y - P.hipY) / s;
    if (h < 0.2) {
      out[0] = B.pelvis;
      out[1] = B.spine;
      out[2] = 1 - smooth(0.04, 0.17, h);
    } else {
      out[0] = B.spine;
      out[1] = B.chest;
      out[2] = 1 - smooth(0.22, 0.37, h);
    }
  };
  const pad = (h: number): number => (hoodie ? (h > 0.02 ? 0.02 : 0.012) : jersey ? 0.014 : wet ? 0.004 : h < 0.11 ? 0.012 : 0.005);
  /** Clothed torso section at height h: [rx, rz, oz, n]. A loose jersey hangs straight from the chest instead of hugging the waist. */
  const tmpS: number[] = [];
  const sect = (h: number, out: number[]): number[] => {
    torsoAt(table, h, tmpS);
    const p = pad(h) * (h > 0.52 ? 0.3 : 1);
    let rx = tmpS[1] + p;
    let rz = tmpS[2] + p;
    let oz = tmpS[3];
    if (!suit && h > 0.42) {
      // yoke: the shirt spans from the neck to the points of the shoulders
      rx += (P.female ? 0.012 : 0.02) * smooth(0.42, 0.5, h) * smooth(0.572, 0.54, h);
    }
    if (jersey && h < 0.39 && h > -0.06) {
      const k = smooth(0.39, 0.3, h);
      const lx = (P.female ? 0.136 : 0.154) + p;
      const lz = (P.female ? 0.1 : 0.104) + p;
      if (lx > rx) rx += (lx - rx) * k;
      if (lz > rz) {
        // the back of the shirt falls off the shoulder blades, the front off the chest
        rz += (lz - rz) * k;
        oz += 0.004 * k;
      }
    }
    out[0] = rx;
    out[1] = rz;
    out[2] = oz;
    out[3] = tmpS[4];
    return out;
  };
  const yBot = P.hipY - 0.082 * s;
  const yTop = P.hipY + 0.572 * s;
  const tmpT: number[] = [];
  const torso: Ring[] = table.map((r) => {
    sect(r[0], tmpT);
    return { y: P.hipY + r[0] * s, rx: tmpT[0], rz: tmpT[1], oz: tmpT[2], n: r[4] };
  });
  // loose jersey: long hanging drapes that deepen towards the hem (real geometry, so the hem silhouette waves)
  const drape = jersey
    ? (p: Vector3): void => {
        const h = (p.y - P.hipY) / s;
        const k = smooth(0.34, -0.02, h);
        if (k <= 0) return;
        const phi = Math.atan2(p.z, p.x);
        const w = 0.6 * Math.sin(6 * phi + 0.8) + 0.4 * Math.sin(3 * phi + 2 + h * 5) + 0.25;
        const a = 0.0085 * k * w;
        p.x += Math.cos(phi) * a;
        p.z += Math.sin(phi) * a;
      }
    : undefined;
  b.identity().color(0xffffff);
  b.skinFn = torsoSkin;
  b.loft(torso, {
    warp: drape,
    radial: 28,
    wrap: rectUV(ATLAS.torso, 1),
    vOf: (r) => (r.y - yBot) / (yTop - yBot),
    capStart: yBot - 0.016,
  });

  // ── oversize jersey: the body of the shirt carries on below the hips as one loose tube (same
  //    wrap texture as the torso, so there is no seam or "belt"), ending in a soft hem over the shorts.
  //    The hem is partly carried by the thighs, so it rides up over a lifted knee instead of ballooning ──
  if (jersey) {
    const tmpJ: number[] = [];
    const ringAt = (h: number, grow: number): Ring => {
      sect(Math.max(h, 0.0), tmpJ);
      // wider at the sides than front / back: the hem has to clear the legs of the shorts
      return { y: P.hipY + h * s, rx: tmpJ[0] + grow * 2.3, rz: tmpJ[1] + grow, oz: tmpJ[2] - 0.004, n: 2.3 };
    };
    // starts just inside the torso surface (hidden), widens a touch as it falls; the last ring folds under
    const tube: Ring[] = [ringAt(-0.12, 0.007), ringAt(-0.108, 0.013), ringAt(-0.085, 0.014), ringAt(-0.045, 0.011), ringAt(0.0, 0.007), ringAt(0.05, 0.003), ringAt(0.11, -0.002)];
    const uvT = rectUV(ATLAS.torso, 1);
    // texture v: reuse the plain lower band of the torso wrap (below the prints)
    const vBand = (i: number, n: number): number => 0.02 + 0.1 * (Math.max(0, i - 1) / (n - 2));
    b.identity().color(0xffffff);
    b.skinFn = (p: Vector3, out: [number, number, number]): void => {
      const h = (p.y - P.hipY) / s;
      if (h > 0.02) {
        out[0] = B.pelvis;
        out[1] = B.spine;
        out[2] = 1 - smooth(0.04, 0.17, h);
      } else {
        const side = smooth(0.015, 0.08, Math.abs(p.x));
        out[0] = B.pelvis;
        out[1] = p.x > 0 ? B.thighL : B.thighR;
        out[2] = 1 - 0.2 * smooth(0.02, -0.11, h) * side;
      }
    };
    b.loft(tube, {
      warp: drape,
      radial: 28,
      wrap: uvT,
      vOf: (_r, i, n) => vBand(i, n),
      colorFn: (_p, i, c) => (i === 0 ? c.multiplyScalar(0.8) : c),
    });
    b.skinFn = null;
  }

  // ── impact vest shell ──
  if (o.vest) {
    const tmp: number[] = [];
    const hs = [0.085, 0.1, 0.16, 0.23, 0.31, 0.39, 0.455, 0.505, 0.548, 0.566];
    const rings: Ring[] = hs.map((h, i) => {
      sect(h, tmp);
      const th = i === 0 ? 0.004 : 0.016;
      const strap = h > 0.5 ? (h > 0.54 ? 0.012 : -0.012) : 0;
      return { y: P.hipY + h * s, rx: tmp[0] + th * 0.8 + strap, rz: tmp[1] + th * 1.25 + (h > 0.54 ? 0.012 : 0), oz: tmp[2], n: tmp[3] + 0.2 };
    });
    const v0 = rings[0].y;
    const v1 = rings[rings.length - 1].y;
    b.color(0xffffff);
    b.skinFn = torsoSkin;
    b.loft(rings, {
      radial: 16,
      wrap: rectUV(ATLAS.vest, 1),
      vOf: (r) => (r.y - v0) / (v1 - v0),
      capStart: v0,
      capEnd: v1,
    });
  }

  // ── neck (+ hood / collar) ──
  const neckR = (P.female ? 0.046 : 0.055) * (suit ? 1.04 : 1);
  b.bone(B.neck).color(skin);
  sw(SWATCH.skin);
  b.at(0, P.neckY - 0.034 * s, -0.004).capsule(0.115 * s, neckR * 1.16, neckR * 1.0, { radial: 20, capSeg: 2, sz: 0.94, mid: [[0.3, neckR * 1.05]] });
  if (jersey || (!hoodie && !wet)) {
    // ribbed crew collar hiding the seam between neck and torso
    b.bone(B.chest).color(shade(topC, -0.1));
    sw(SWATCH.cloth);
    const tmpC: number[] = [];
    const band = [0.534, 0.546, 0.558, 0.566].map((h, i) => {
      torsoAt(table, h, tmpC);
      const grow = i === 0 ? 0.002 : i === 3 ? 0.001 : 0.006;
      return { y: P.hipY + h * s, rx: tmpC[1] + grow, rz: tmpC[2] + grow, oz: tmpC[3], n: 2 };
    });
    band[3].rx = band[2].rx - 0.006;
    band[3].rz = band[2].rz - 0.006;
    b.identity().loft(band, { radial: 24 });
  }
  if (hoodie) {
    b.bone(B.chest).color(shade(topC, -0.06));
    sw(SWATCH.matte);
    b.at(0, P.neckY - 0.012 * s, -0.062).ellipsoid(0.105, 0.062, 0.07, { radial: 10, rings: 5 });
  } else if (suit) {
    b.bone(B.neck).color(contrast(suitC, o.bottomLook.secondary));
    sw(SWATCH.rubber);
    b.at(0, P.neckY - 0.018 * s, -0.004).capsule(0.03 * s, neckR * 1.2, neckR * 1.12, { radial: 10, capSeg: 1 });
  }

  // ── arms: ONE loft shoulder → wrist per side; the elbow is skinned to both arm bones, the deltoid partly to the chest ──
  for (const side of [1, -1]) {
    const L = side > 0;
    const x = side * P.shoulderHalf;
    const sleeveLong = suit || hoodie || jersey;
    const fat = hoodie ? 0.015 : jersey ? 0.011 : suit ? 0.003 : 0;
    const loose = hoodie || jersey;
    const uarmBone = L ? B.uarmL : B.uarmR;
    const larmBone = L ? B.larmL : B.larmR;
    const elbowY = P.shoulderY - P.uarm;
    const armSkin = (p: Vector3, out: [number, number, number]): void => {
      out[0] = uarmBone;
      if (p.y > elbowY + P.uarm * 0.5) {
        out[1] = B.chest;
        out[2] = 1 - 0.25 * smooth(P.shoulderY - 0.05, P.shoulderY + 0.035, p.y) * smooth(x * side + 0.05, x * side - 0.03, p.x * side);
      } else {
        out[1] = larmBone;
        out[2] = smooth(elbowY - 0.05, elbowY + 0.05, p.y);
      }
    };
    const L1 = P.uarm;
    const L2 = P.larm;
    const T = L1 + L2;
    const cuffC = hoodie || jersey ? shade(topC, -0.2) : contrast(suitC, o.bottomLook.accent);
    b.color(sleeveLong ? topC : skin);
    sw(sleeveLong ? (hoodie ? SWATCH.matte : jersey ? SWATCH.cloth : SWATCH.rubber) : SWATCH.skin);
    _a.set(x, P.shoulderY, 0);
    _b.set(x, P.shoulderY - T, 0);
    // rows: [y along the arm, radius, depth scale, oz (+ = front), ox (+ = away from the body), sleeve looseness 0..1]
    const armRows: readonly (readonly number[])[] = [
      [-0.031, 0.02, 1.05, 0, -0.016, 0.6],
      [-0.024, 0.034, 1.05, 0, -0.009, 0.8],
      [-0.01, 0.046, 1.06, 0, -0.002, 1],
      [0.012, 0.054, 1.06, 0, 0.003, 1],
      [0.055, 0.053, 1.04, 0.001, 0.004, 1],
      [0.105, 0.049, 1.06, 0.003, 0.002, 1.1],
      [L1 * 0.56, 0.0465, 1.08, 0.004, 0, 1.2],
      [L1 * 0.76, 0.042, 1.06, 0.002, 0, 0.9],
      [L1 - 0.05, 0.039, 1.04, 0, 0, 1.25],
      [L1 - 0.025, 0.0385, 1.05, -0.002, 0, 0.85],
      [L1, 0.0395, 1.08, -0.004, 0, 1.3],
      [L1 + 0.025, 0.041, 1.04, -0.002, 0, 0.9],
      [L1 + 0.05, 0.0425, 1.0, 0, 0, 1.2],
      [L1 + L2 * 0.34, 0.041, 0.98, 0.001, 0, 0.95],
      [L1 + L2 * 0.52, 0.037, 0.96, 0, 0, 1.2],
      [L1 + L2 * 0.68, 0.032, 0.95, 0, 0, 0.9],
      [L1 + L2 * 0.82, 0.0285, 0.95, 0, 0, 1.1],
      [T - 0.03, 0.0265, 0.96, 0, 0, 0.55],
      [T - 0.004, 0.0255, 0.96, 0, 0, 0.5],
      [T + 0.012, 0.021, 0.96, 0, 0, 0],
    ];
    const arm: Ring[] = armRows.map((r) => {
      const f = fat * (loose ? r[5] : 1);
      const rr = r[1] * g + f;
      // local +X points to world −X (segment frame), so "away from the body" is −side
      return { y: r[0], rx: rr, rz: rr * r[2], oz: r[3] - (loose ? f * 0.25 : 0), ox: -side * r[4] };
    });
    b.segment(_a, _b, FRONT);
    b.skinFn = armSkin;
    b.loft(arm, {
      radial: 16,
      capStart: -0.036,
      capEnd: T + 0.02,
      colorFn: sleeveLong ? (_p, i, c) => (i >= armRows.length - 3 ? c.setHex(cuffC) : c) : undefined,
    });
    if (!sleeveLong) {
      // short tee sleeve
      b.color(topC);
      sw(SWATCH.cloth);
      const r0 = 0.058 * g;
      const len = P.uarm * 0.42;
      b.skinFn = armSkin;
      b.loft(
        [
          { y: -0.056, rx: r0 * 0.5, rz: r0 * 0.52, ox: side * 0.01 },
          { y: -0.036, rx: r0 * 0.82, rz: r0 * 0.86, ox: side * 0.004 },
          { y: -0.012, rx: r0 * 0.98, rz: r0 * 1.02 },
          { y: 0.02, rx: r0 * 1.02, rz: r0 * 1.06 },
          { y: len * 0.6, rx: r0 * 1.0, rz: r0 * 1.03 },
          { y: len, rx: r0 * 1.03, rz: r0 * 1.05 },
          { y: len + 0.002, rx: r0 * 0.94, rz: r0 * 0.96 },
        ],
        { radial: 16, capStart: -0.064, colorFn: (_p, i, c) => (i === 6 ? c.multiplyScalar(0.5) : c) },
      );
    }
    b.skinFn = null;
    buildHand(b, L, x, P.shoulderY - T, g, skin);
  }

  // ── legs: ONE loft hip → ankle per side; the knee is skinned to thigh + shin, the top of the thigh partly to the pelvis ──
  for (const side of [1, -1]) {
    const L = side > 0;
    const x = side * P.hipHalf;
    const fat = suit || wet ? 0.004 : 0;
    const legC = wet ? suitC : skin;
    const thighBone = L ? B.thighL : B.thighR;
    const shinBone = L ? B.shinL : B.shinR;
    const legSkin = (p: Vector3, out: [number, number, number]): void => {
      out[0] = thighBone;
      if (p.y > P.kneeY + P.thigh * 0.5) {
        out[1] = B.pelvis;
        out[2] = 1 - 0.6 * smooth(P.hipY - 0.12, P.hipY + 0.05, p.y);
      } else {
        out[1] = shinBone;
        out[2] = smooth(P.kneeY - 0.055, P.kneeY + 0.055, p.y);
      }
    };
    const L1 = P.thigh;
    const L2 = P.shin;
    b.color(legC);
    sw(wet ? SWATCH.rubber : SWATCH.skin);
    _a.set(x, P.hipY, 0);
    _b.set(x, P.ankleY, 0);
    // rows: [y down the leg, rx, rz, oz (+ = front), ox (+ = outside)]
    const legRows: readonly (readonly number[])[] = [
      [-0.07, 0.05, 0.056, 0, 0],
      [-0.04, 0.076, 0.08, 0, 0],
      [0, 0.088, 0.091, 0, 0],
      [L1 * 0.2, 0.089, 0.094, 0.004, 0.002],
      [L1 * 0.45, 0.082, 0.088, 0.006, 0.003],
      [L1 * 0.7, 0.07, 0.076, 0.005, 0.002],
      [L1 - 0.075, 0.061, 0.065, 0.003, 0],
      [L1 - 0.045, 0.057, 0.061, 0.004, 0],
      [L1 - 0.018, 0.0555, 0.06, 0.007, 0],
      [L1 + 0.008, 0.0545, 0.058, 0.007, 0],
      [L1 + 0.035, 0.0515, 0.054, 0.004, 0],
      [L1 + 0.065, 0.05, 0.053, -0.002, 0.001],
      [L1 + L2 * 0.3, 0.055, 0.06, -0.012, 0.003],
      [L1 + L2 * 0.44, 0.051, 0.056, -0.012, 0.002],
      [L1 + L2 * 0.62, 0.042, 0.045, -0.007, 0],
      [L1 + L2 * 0.82, 0.035, 0.038, -0.002, 0],
      [L1 + L2, 0.034, 0.037, 0, 0],
      [L1 + L2 + 0.026 * g, 0.026, 0.027, 0, 0],
    ];
    b.segment(_a, _b, FRONT);
    b.skinFn = legSkin;
    b.loft(
      legRows.map((r) => {
        // under the shorts the thigh is slimmed so it never pokes through the cloth
        const k = !wet && r[0] < L1 - 0.1 ? 0.88 : 1;
        return { y: r[0], rx: r[1] * g * k + fat, rz: r[2] * g * k + fat, oz: r[3] * k, ox: -side * r[4] };
      }),
      { radial: 18, capStart: -0.085, capEnd: L1 + L2 + 0.038 * g },
    );
    if (!wet) {
      // plain knee-length boardshorts: one loose tube per leg hanging from the hips (texture v: hip 1 → hem 0).
      // It ends just above the kneecap so a deep knee bend never pushes the calf through the hem.
      b.color(0xffffff);
      const r0 = 0.104 * g;
      const len = P.thigh - 0.038;
      const legUV = rectUV(ATLAS.legs, 1);
      b.skinFn = (p: Vector3, out: [number, number, number]): void => {
        out[0] = thighBone;
        out[1] = B.pelvis;
        out[2] = 1 - 0.6 * smooth(P.hipY - 0.12, P.hipY + 0.05, p.y);
      };
      const shortRows: readonly (readonly number[])[] = [
        [-0.07, 0.88, 0.96, 1],
        [0, 1.0, 1.04, 0.84],
        [len * 0.3, 1.0, 1.05, 0.6],
        [len * 0.6, 0.96, 1.01, 0.36],
        [len * 0.85, 0.9, 0.95, 0.14],
        [len, 0.875, 0.92, 0.02],
        [len + 0.003, 0.82, 0.86, 0],
        [len - 0.02, 0.64, 0.68, 0],
      ];
      b.loft(
        shortRows.map((r) => ({ y: r[0], rx: r0 * r[1], rz: r0 * r[2], oz: -0.002 })),
        { radial: 18, wrap: legUV, vOf: (_r, i) => shortRows[i][3], colorFn: (_p, i, c) => (i >= 6 ? c.multiplyScalar(i === 6 ? 0.95 : 0.8) : c) },
      );
    }
    b.skinFn = null;

    // bare foot (toes peek out of the open-toe boots)
    b.bone(L ? B.footL : B.footR);
    if (board === 'wakeskate') buildShoe(b, x, P, o);
    else {
      if (o.bindings.graphic !== 'mark') {
        // open-toe boots: the toes peek out
        b.color(skin);
        sw(SWATCH.skin);
        buildFoot(b, x, P.footLen, 0);
      }
      buildBoot(b, L, x, P, o);
    }
  }

  const geometry = b.build();
  bakeAmbientOcclusion(geometry, P, table);
  return { geometry, triangles: b.triangleCount };
}

/**
 * Soft contact shadows baked into the vertex colours: the body is approximated by spheres along the
 * bones (bind pose) and every vertex is darkened by the spheres its normal faces (analytic sphere AO).
 * Gives armpits, the crotch, the inner thighs, under the chin and the backs of the knees their shade.
 */
function bakeAmbientOcclusion(geo: BufferGeometry, P: Proportions, table: readonly (readonly number[])[]): void {
  const s = P.scale;
  const g = P.girth;
  const sph: number[] = []; // x, y, z, r
  const add = (x: number, y: number, z: number, r: number): void => {
    sph.push(x, y, z, r);
  };
  const tmp: number[] = [];
  for (let h = -0.06; h <= 0.56; h += 0.05) {
    torsoAt(table, h, tmp);
    add(0, P.hipY + h * s, tmp[3], Math.min(tmp[1], tmp[2]) * 1.05);
  }
  add(0, P.headCenterY, 0.01, P.headRy * 0.85);
  add(0, P.neckY + 0.02, 0, 0.05);
  for (const side of [1, -1]) {
    const ax = side * P.shoulderHalf;
    const arm = P.uarm + P.larm;
    for (let t = 0; t <= arm; t += 0.05) add(ax, P.shoulderY - t, 0, (0.052 - (t / arm) * 0.018) * g);
    const lx = side * P.hipHalf;
    for (let y = P.hipY; y >= P.ankleY; y -= 0.05) add(lx, y, 0, (y > P.kneeY ? 0.075 + ((y - P.kneeY) / P.thigh) * 0.02 : 0.05) * g);
  }
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const col = geo.getAttribute('color');
  const n = sph.length / 4;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    let occ = 0;
    for (let k = 0; k < n; k++) {
      const dx = sph[k * 4] - px;
      const dy = sph[k * 4 + 1] - py;
      const dz = sph[k * 4 + 2] - pz;
      const r = sph[k * 4 + 3];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r * r * 1.1) continue; // the vertex sits on / in this sphere (its own part)
      const d = Math.sqrt(d2);
      const facing = (dx * nx + dy * ny + dz * nz) / d;
      if (facing <= 0) continue;
      occ += facing * ((r * r) / d2);
    }
    const ao = 1 - 0.55 * Math.min(1, occ * 0.9);
    col.setXYZ(i, col.getX(i) * ao, col.getY(i) * ao, col.getZ(i) * ao);
  }
  col.needsUpdate = true;
}

/** Foot-shaped loft running heel → toes along +Z; `grow` inflates it (shoe / boot shells). */
function footRings(F: number, grow: number, toe = 1): Ring[] {
  const gz = grow;
  return ringsOf([
    [0, 0.02 + gz, 0.022 + gz, 0.012],
    [0.08 * F, 0.03 + gz, 0.034 + gz, 0.008, 2.4],
    [0.25 * F, 0.034 + gz, 0.04 + gz, 0.012, 2.6],
    [0.45 * F, 0.038 + gz, 0.032 + gz, 0.004, 2.6],
    [0.7 * F, 0.046 + gz, 0.022 + gz, -0.004, 2.8],
    [0.9 * F * toe, 0.044 + gz, 0.015 + gz, -0.01, 2.8],
    [1.0 * F * toe, 0.034 + gz, 0.011 + gz, -0.013, 2.4],
  ]);
}

function footSegment(b: MeshBuilder, x: number, F: number, lift: number): void {
  _a.set(x, 0.032 + lift, -0.27 * F);
  _b.set(x, 0.032 + lift, 0.73 * F);
  b.segment(_a, _b, UP);
}

function buildFoot(b: MeshBuilder, x: number, F: number, lift: number): void {
  footSegment(b, x, F, lift);
  b.loft(footRings(F, 0), { radial: 10, capStart: -0.014, capEnd: F * 1.035 });
}

/** Skate shoe for the wakeskate: white cup sole, dark upper, brand-red heel tab. */
function buildShoe(b: MeshBuilder, x: number, P: Proportions, o: Outfit): void {
  const F = P.footLen;
  const uvU = swatchUV(SWATCH.cloth);
  const uvS = swatchUV(SWATCH.semi);
  const upper = contrast(o.skin, BRAND.colors.dark);
  // sole
  b.color(0xeeeeea).uv(uvS[0], uvS[1]);
  _a.set(x, 0.013, -0.3 * F);
  _b.set(x, 0.013, 0.78 * F);
  b.segment(_a, _b, UP);
  b.loft(
    ringsOf([
      [0, 0.03, 0.013, 0, 3],
      [0.1 * F, 0.042, 0.013, 0, 3.4],
      [0.5 * F, 0.046, 0.013, 0, 3.4],
      [0.85 * F, 0.054, 0.013, 0, 3.4],
      [1.04 * F, 0.046, 0.013, 0, 3],
      [1.09 * F, 0.03, 0.012, 0, 2.6],
    ]),
    { radial: 10, capStart: -0.012, capEnd: 1.11 * F },
  );
  // upper
  b.color(upper).uv(uvU[0], uvU[1]);
  footSegment(b, x, F, 0.012);
  const rings = footRings(F, 0.008, 1.03);
  rings[1].rz += 0.01;
  rings[2].rz += 0.012;
  rings[2].oz = (rings[2].oz ?? 0) + 0.012;
  b.loft(rings, { radial: 10, capStart: -0.02, capEnd: F * 1.075 });
  // toe cap + heel tab
  b.color(0xeeeeea).uv(uvS[0], uvS[1]);
  b.at(x, 0.03, 0.66 * F).ellipsoid(0.047, 0.022, 0.05, { radial: 8, rings: 4 });
  b.color(BRAND.colors.red);
  b.at(x, 0.075, -0.265 * F).roundBox(0.018, 0.022, 0.008, { radial: 6 });
  // sock collar
  b.color(0xf2f2f2).uv(uvU[0], uvU[1]);
  b.at(x, P.ankleY - 0.012, -0.004).capsule(0.05, 0.043, 0.041, { radial: 8, capSeg: 1 });
}

/** Open-toe binding boot: shell + footbed on the boot bone, laced cuff on the cuff bone. */
function buildBoot(b: MeshBuilder, left: boolean, x: number, P: Proportions, o: Outfit): void {
  const F = P.footLen;
  const look = o.bindings;
  const uvR = swatchUV(SWATCH.rubber);
  const uvG = swatchUV(SWATCH.semi);
  b.bone(left ? B.bootL : B.bootR);
  // footbed / sole plate
  b.color(shade(look.secondary, -0.1)).uv(uvG[0], uvG[1]);
  _a.set(x, -0.006, -0.33 * F);
  _b.set(x, -0.006, 0.6 * F);
  b.segment(_a, _b, UP);
  b.loft(
    ringsOf([
      [0, 0.04, 0.012, 0, 3],
      [0.08 * F, 0.054, 0.013, 0, 3.6],
      [0.82 * F, 0.06, 0.013, 0, 3.6],
      [0.93 * F, 0.054, 0.012, 0, 3],
    ]),
    { radial: 10, capStart: -0.01, capEnd: 0.95 * F },
  );
  // shell: tall at the heel; open at the toes, or a closed toe box for full boots (graphic 'mark')
  const closed = look.graphic === 'mark';
  b.color(look.primary).uv(uvR[0], uvR[1]);
  _a.set(x, 0.034, -0.3 * F);
  _b.set(x, 0.034, 0.7 * F);
  b.segment(_a, _b, UP);
  if (closed) {
    b.loft(
      ringsOf([
        [0, 0.03, 0.05, 0.03, 2.4],
        [0.06 * F, 0.047, 0.073, 0.046, 2.6],
        [0.24 * F, 0.054, 0.082, 0.052, 2.8],
        [0.42 * F, 0.058, 0.064, 0.032, 2.8],
        [0.62 * F, 0.062, 0.052, 0.016, 3],
        [0.82 * F, 0.06, 0.042, 0.006, 3],
        [0.96 * F, 0.05, 0.032, 0, 2.6],
        [1.04 * F, 0.03, 0.02, -0.004, 2.2],
      ]),
      { radial: 12, capStart: -0.012, capEnd: 1.07 * F },
    );
    // three wide slotted straps: forefoot, instep, ankle
    b.color(look.secondary).uv(uvG[0], uvG[1]);
    b.at(x, 0.07, 0.52 * F).roundBox(0.068, 0.012, 0.034, { radial: 8, n: 3 });
    b.at(x, 0.082, 0.3 * F).roundBox(0.07, 0.012, 0.034, { radial: 8, n: 3 });
    b.at(x, 0.075, -0.3 * F).roundBox(0.04, 0.05, 0.014, { radial: 8, n: 3 });
    // slots in the straps (dark dashes) + white ?! hits on the strap ends
    b.color(0x050506);
    for (const [zz, yy] of [
      [0.52, 0.083],
      [0.3, 0.095],
    ] as const) {
      for (let k = -2; k <= 2; k++) b.at(x + k * 0.012, yy, zz * F).roundBox(0.003, 0.002, 0.012, { radial: 4 });
    }
    b.color(0xf2f2f2);
    b.at(x - Math.sign(x || 1) * 0.064, 0.074, 0.52 * F).roundBox(0.004, 0.008, 0.01, { radial: 4 });
    b.at(x - Math.sign(x || 1) * 0.066, 0.086, 0.3 * F).roundBox(0.004, 0.008, 0.01, { radial: 4 });
  } else {
    b.loft(
      ringsOf([
        [0, 0.03, 0.05, 0.03, 2.4],
        [0.06 * F, 0.046, 0.072, 0.045, 2.6],
        [0.24 * F, 0.052, 0.08, 0.052, 2.8],
        [0.42 * F, 0.055, 0.058, 0.03, 2.8],
        [0.62 * F, 0.058, 0.04, 0.012, 3],
        [0.8 * F, 0.058, 0.032, 0.004, 3],
        [0.83 * F, 0.05, 0.026, 0.002, 3],
      ]),
      { radial: 12, capStart: -0.012, capEnd: 0.815 * F, colorFn: (p, i, c) => (i >= 6 ? c.setHex(0x0b0b0c) : c) },
    );
    // toe strap + heel hoop
    b.color(look.secondary).uv(uvG[0], uvG[1]);
    b.at(x, 0.052, 0.3 * F).roundBox(0.064, 0.03, 0.026, { radial: 8, n: 3 });
    b.color(contrast(look.secondary, look.accent));
    b.at(x, 0.086, 0.3 * F).roundBox(0.03, 0.005, 0.016, { radial: 6 });
    b.color(look.secondary);
    b.at(x, 0.075, -0.3 * F).roundBox(0.036, 0.05, 0.012, { radial: 8, n: 3 });
  }
  // tall cuff around the lower shin (follows the shin): padded collar, tongue pushed forward, two raised strap bands
  b.bone(left ? B.cuffL : B.cuffR).color(0xffffff);
  const y0 = P.ankleY - 0.02;
  const h = 0.225 * P.scale;
  // rows: [t up the cuff (= texture v), rx, rz, oz]; the straps sit at v 0.17–0.34 and 0.47–0.64 in the boot texture
  const st = closed ? 0.005 : 0;
  const cuffRows: readonly (readonly number[])[] = [
    [0, 0.056, 0.064, 0.004],
    [0.15, 0.057, 0.065, 0.005],
    [0.175, 0.058 + st, 0.066 + st, 0.005],
    [0.335, 0.06 + st, 0.068 + st, 0.006],
    [0.36, 0.0595, 0.0675, 0.006],
    [0.45, 0.0605, 0.0685, 0.007],
    [0.475, 0.0615 + st, 0.0695 + st, 0.007],
    [0.635, 0.0635 + st, 0.0715 + st, 0.008],
    [0.66, 0.063, 0.071, 0.008],
    [0.86, 0.066, 0.074, 0.009],
    [0.96, 0.0685, 0.0765, 0.009],
    [1.0, 0.066, 0.074, 0.009],
    [1.0, 0.057, 0.064, 0.008],
  ];
  b.at(x, 0, 0).loft(
    cuffRows.map((r, i) => ({ y: y0 + h * r[0] - (i === cuffRows.length - 1 ? 0.012 : 0), rx: r[1], rz: r[2], oz: r[3], n: 2.3 })),
    { radial: 14, wrap: rectUV(ATLAS.boot, 1), vOf: (_r, i) => Math.min(1, cuffRows[i][0]), capStart: y0 - 0.02, colorFn: (_p, i, c) => (i === cuffRows.length - 1 ? c.multiplyScalar(0.3) : c) },
  );
  if (closed) {
    // heel pull loop + buckle blocks where the straps close on the outside
    const out = Math.sign(x || 1);
    b.color(0x0a0a0b).uv(uvR[0], uvR[1]);
    b.at(x, y0 + h * 0.93, -0.076).roundBox(0.012, 0.022, 0.006, { radial: 6 });
    b.color(0x18181a).uv(uvG[0], uvG[1]);
    b.at(x + out * 0.066, y0 + h * 0.255, 0.012).roundBox(0.005, 0.014, 0.014, { radial: 6 });
    b.at(x + out * 0.069, y0 + h * 0.555, 0.014).roundBox(0.005, 0.014, 0.014, { radial: 6 });
  }
}

/**
 * Relaxed half-closed hand (works as a bar grip, an edge grab and a loose hand). Bind: fingers
 * point −Y, palm faces the body (−X for the left hand), thumb forward (+Z).
 */
function buildHand(b: MeshBuilder, left: boolean, x: number, wristY: number, g: number, skin: number): void {
  const m = left ? -1 : 1; // palm side in X
  const uv = swatchUV(SWATCH.skin);
  b.bone(left ? B.handL : B.handR).color(skin).uv(uv[0], uv[1]);
  const k = 0.94 + 0.06 * g;
  // palm
  _a.set(x, wristY + 0.006, 0);
  _b.set(x + m * 0.006, wristY - 0.092 * k, 0);
  b.segment(_a, _b, FRONT);
  b.loft(
    ringsOf([
      [0, 0.016, 0.027, 0, 2.6],
      [0.03 * k, 0.017, 0.038, 0, 3],
      [0.075 * k, 0.016, 0.043, 0, 3],
      [0.096 * k, 0.014, 0.04, 0, 3],
    ]),
    { radial: 8, capStart: -0.008, capEnd: 0.102 * k },
  );
  // four separate fingers, each curled in three phalanges towards the palm (closes round the bar)
  const kx = x + m * 0.004;
  const ky = wristY - 0.09 * k;
  const FINGERS: readonly [number, number, number][] = [
    // z across the palm, length scale, radius
    [0.03, 0.92, 0.0098],
    [0.0105, 1.0, 0.0102],
    [-0.009, 0.96, 0.0098],
    [-0.027, 0.8, 0.0088],
  ];
  const _c = new Vector3();
  for (const [fz, fl, fr] of FINGERS) {
    _c.set(kx, ky + (1 - fl) * 0.01, fz);
    const segs: readonly [number, number, number][] = [
      [m * 0.012, -0.036, 1],
      [m * 0.024, -0.012, 0.9],
      [m * 0.014, 0.012, 0.8],
    ];
    for (const [ddx, ddy, rr] of segs) {
      _a.copy(_c);
      _b.set(_a.x + ddx * fl * k, _a.y + ddy * fl * k, fz);
      b.segment(_a, _b, FRONT).capsule(_a.distanceTo(_b), fr * rr * k, fr * rr * 0.92 * k, { radial: 7, capSeg: 2 });
      _c.copy(_b);
    }
  }
  // thumb
  _a.set(x + m * 0.004, wristY - 0.03 * k, 0.034);
  _b.set(x + m * 0.034 * k, wristY - 0.074 * k, 0.046);
  b.segment(_a, _b, FRONT).capsule(_a.distanceTo(_b), 0.0128, 0.0102, { radial: 8, capSeg: 2, mid: [[0.5, 0.0118]] });
}
