/**
 * Procedural rider body (torso, limbs, hands, feet, clothes, boots) as ONE skinned geometry in bind
 * space: character faces +Z, left = +X, soles on y = 0, arms and legs hanging straight down.
 */
import { BufferGeometry, Vector3 } from 'three';
import { BRAND } from '../config';
import type { BoardKind } from '../types';
import { MeshBuilder, capsuleRings, ringsOf, type Ring } from './geo';
import { contrast, shade } from './paint';
import { ATLAS, B, SWATCH, rectUV, swatchUV, type Outfit, type Proportions } from './rigDef';

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
  [0.455, 0.16, 0.108, 0.004, 2.6],
  [0.505, 0.148, 0.094, -0.004, 2.5],
  [0.545, 0.104, 0.074, -0.008, 2.2],
  [0.572, 0.062, 0.06, -0.006, 2],
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
  [0.505, 0.128, 0.084, -0.004, 2.4],
  [0.545, 0.09, 0.066, -0.008, 2.2],
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
  const suit = wet && !hoodie;
  const skin = o.skin;
  const topC = hoodie || !wet ? o.topLook.primary : o.bottomLook.primary;
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
  const pad = (h: number): number => (hoodie ? (h > 0.02 ? 0.02 : 0.012) : wet ? 0.004 : h < 0.11 ? 0.012 : 0.005);
  const yBot = P.hipY - 0.082 * s;
  const yTop = P.hipY + 0.572 * s;
  const torso: Ring[] = table.map((r) => {
    const p = pad(r[0]) * (r[0] > 0.52 ? 0.3 : 1);
    return { y: P.hipY + r[0] * s, rx: (r[1] + p) * (P.female ? 1 : 1), rz: r[2] + p, oz: r[3], n: r[4] };
  });
  b.identity().color(0xffffff);
  b.skinFn = torsoSkin;
  b.loft(torso, {
    radial: 16,
    wrap: rectUV(ATLAS.torso, 1),
    vOf: (r) => (r.y - yBot) / (yTop - yBot),
    capStart: yBot - 0.016,
  });

  // ── impact vest shell ──
  if (o.vest) {
    const tmp: number[] = [];
    const hs = [0.085, 0.1, 0.16, 0.23, 0.31, 0.39, 0.455, 0.505, 0.548, 0.566];
    const rings: Ring[] = hs.map((h, i) => {
      torsoAt(table, h, tmp);
      const p = pad(h);
      const th = i === 0 ? 0.004 : 0.016;
      const strap = h > 0.5 ? (h > 0.54 ? 0.012 : -0.012) : 0;
      return { y: P.hipY + h * s, rx: tmp[1] + p + th * 0.8 + strap, rz: tmp[2] + p + th * 1.25 + (h > 0.54 ? 0.012 : 0), oz: tmp[3], n: tmp[4] + 0.2 };
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
  b.at(0, P.neckY - 0.03 * s, -0.004).capsule(0.115 * s, neckR * 1.08, neckR * 0.96, { radial: 10, capSeg: 1 });
  if (hoodie) {
    b.bone(B.chest).color(shade(topC, -0.06));
    sw(SWATCH.matte);
    b.at(0, P.neckY - 0.012 * s, -0.062).ellipsoid(0.105, 0.062, 0.07, { radial: 10, rings: 5 });
  } else if (suit) {
    b.bone(B.neck).color(contrast(suitC, o.bottomLook.secondary));
    sw(SWATCH.rubber);
    b.at(0, P.neckY - 0.018 * s, -0.004).capsule(0.03 * s, neckR * 1.2, neckR * 1.12, { radial: 10, capSeg: 1 });
  }

  // ── arms ──
  for (const side of [1, -1]) {
    const L = side > 0;
    const x = side * P.shoulderHalf;
    const sleeveLong = suit || hoodie;
    const fat = hoodie ? 0.016 : suit ? 0.004 : 0;
    // upper arm
    b.bone(L ? B.uarmL : B.uarmR).color(sleeveLong ? topC : skin);
    sw(sleeveLong ? (hoodie ? SWATCH.matte : SWATCH.rubber) : SWATCH.skin);
    _a.set(x, P.shoulderY, 0);
    _b.set(x, P.shoulderY - P.uarm, 0);
    b.segment(_a, _b, FRONT).capsule(P.uarm, 0.054 * g + fat, 0.04 * g + fat, { radial: 16, mid: [[0.35, 0.05 * g + fat]] });
    if (!sleeveLong) {
      // short tee sleeve
      b.color(topC);
      sw(SWATCH.cloth);
      const r0 = 0.0585 * g;
      const len = P.uarm * 0.4;
      b.loft(
        [
          { y: -r0 * 0.72, rx: r0 * 0.7, rz: r0 * 0.7 },
          { y: 0, rx: r0, rz: r0 },
          { y: len * 0.6, rx: r0 * 0.97, rz: r0 * 0.97 },
          { y: len, rx: r0 * 1.02, rz: r0 * 1.02 },
        ],
        { radial: 16, capStart: -r0, capEnd: len - 0.004 },
      );
    }
    // forearm
    b.bone(L ? B.larmL : B.larmR).color(sleeveLong ? topC : skin);
    sw(sleeveLong ? (hoodie ? SWATCH.matte : SWATCH.rubber) : SWATCH.skin);
    _a.set(x, P.shoulderY - P.uarm, 0);
    _b.set(x, P.shoulderY - P.uarm - P.larm, 0);
    b.segment(_a, _b, FRONT).capsule(P.larm, 0.04 * g + fat, 0.03 * g + fat * 0.7, { radial: 16, mid: [[0.28, 0.044 * g + fat]] });
    if (sleeveLong) {
      // cuff
      b.color(hoodie ? shade(topC, -0.2) : contrast(suitC, o.bottomLook.accent));
      b.loft(
        [
          { y: P.larm - 0.04, rx: 0.034 * g + fat, rz: 0.034 * g + fat },
          { y: P.larm - 0.004, rx: 0.035 * g + fat, rz: 0.035 * g + fat },
        ],
        { radial: 16, capStart: P.larm - 0.045, capEnd: P.larm },
      );
    }
    buildHand(b, L, x, P.shoulderY - P.uarm - P.larm, g, skin);
  }

  // ── legs ──
  for (const side of [1, -1]) {
    const L = side > 0;
    const x = side * P.hipHalf;
    const fat = suit || wet ? 0.004 : 0;
    const legC = wet ? suitC : skin;
    b.bone(L ? B.thighL : B.thighR).color(legC);
    sw(wet ? SWATCH.rubber : SWATCH.skin);
    _a.set(x, P.hipY, 0);
    _b.set(x, P.kneeY, 0);
    b.segment(_a, _b, FRONT).capsule(P.thigh, 0.096 * g + fat, 0.063 * g + fat, { radial: 16, sz: 1.06, mid: [[0.42, 0.088 * g + fat]] });
    if (!wet) {
      // board-shorts leg: loose tube, open hem
      b.color(0xffffff);
      const r0 = 0.108 * g;
      const len = P.thigh * 0.66;
      b.loft(
        [
          { y: -0.05, rx: r0 * 0.94, rz: r0 * 1.02 },
          { y: len * 0.3, rx: r0 * 0.96, rz: r0 * 1.0 },
          { y: len * 0.75, rx: r0 * 0.9, rz: r0 * 0.93 },
          { y: len, rx: r0 * 0.9, rz: r0 * 0.92 },
        ],
        { radial: 16, wrap: rectUV(ATLAS.legs, 1), vOf: (_r, i, n) => 1 - i / (n - 1), capEnd: len - 0.006 },
      );
    }
    b.bone(L ? B.shinL : B.shinR).color(legC);
    sw(wet ? SWATCH.rubber : SWATCH.skin);
    b.at(x, P.kneeY, 0);
    // shin hangs along −Y: build top-down with a calf that bulges backwards
    _a.set(x, P.kneeY, 0);
    _b.set(x, P.ankleY, 0);
    b.segment(_a, _b, FRONT);
    const calf: Ring[] = [
      ...capsuleRings(0, 0.062 * g + fat, 0.062 * g + fat, 1, 1, 2).slice(0, 2),
      { y: P.shin * 0.14, rx: 0.062 * g + fat, rz: 0.064 * g + fat, oz: -0.004 },
      { y: P.shin * 0.34, rx: 0.064 * g + fat, rz: 0.069 * g + fat, oz: -0.015 },
      { y: P.shin * 0.62, rx: 0.052 * g + fat, rz: 0.054 * g + fat, oz: -0.008 },
      { y: P.shin, rx: 0.041 * g + fat, rz: 0.043 * g + fat },
      { y: P.shin + 0.026 * g, rx: 0.027 * g, rz: 0.028 * g },
    ];
    b.loft(calf, { radial: 16, capStart: -(0.062 * g + fat), capEnd: P.shin + 0.038 * g });

    // bare foot (toes peek out of the open-toe boots)
    b.bone(L ? B.footL : B.footR);
    if (board === 'wakeskate') buildShoe(b, x, P, o);
    else {
      b.color(skin);
      sw(SWATCH.skin);
      buildFoot(b, x, P.footLen, 0);
      buildBoot(b, L, x, P, o);
    }
  }

  const geometry = b.build();
  return { geometry, triangles: b.triangleCount };
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
  // shell: tall at the heel, open at the toes
  b.color(look.primary).uv(uvR[0], uvR[1]);
  _a.set(x, 0.034, -0.3 * F);
  _b.set(x, 0.034, 0.7 * F);
  b.segment(_a, _b, UP);
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
  // cuff around the lower shin (follows the shin)
  b.bone(left ? B.cuffL : B.cuffR).color(0xffffff);
  const y0 = P.ankleY - 0.02;
  const h = 0.215 * P.scale;
  b.at(x, 0, 0.004).loft(
    [
      { y: y0, rx: 0.053, rz: 0.06, n: 2.3 },
      { y: y0 + h * 0.3, rx: 0.055, rz: 0.062, n: 2.3 },
      { y: y0 + h * 0.75, rx: 0.059, rz: 0.066, n: 2.3 },
      { y: y0 + h, rx: 0.064, rz: 0.07, n: 2.3 },
      { y: y0 + h + 0.008, rx: 0.058, rz: 0.064, n: 2.3 },
    ],
    { radial: 12, wrap: rectUV(ATLAS.boot, 1), capStart: y0 - 0.02, capEnd: y0 + h - 0.004 },
  );
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
  // fingers: two curled blocks
  const kx = x + m * 0.006;
  const ky = wristY - 0.092 * k;
  _a.set(kx, ky, -0.003);
  _b.set(kx + m * 0.03 * k, ky - 0.03 * k, -0.003);
  b.segment(_a, _b, FRONT);
  b.loft(
    ringsOf([
      [-0.004, 0.012, 0.038, 0, 3],
      [0.022 * k, 0.0115, 0.037, 0, 3],
      [0.044 * k, 0.011, 0.036, 0, 3],
    ]),
    { radial: 8, capStart: -0.01, capEnd: 0.05 * k },
  );
  _a.copy(_b);
  _b.set(_a.x + m * 0.026 * k, _a.y + 0.012 * k, -0.003);
  b.segment(_a, _b, FRONT);
  b.loft(
    ringsOf([
      [-0.004, 0.011, 0.036, 0, 3],
      [0.018 * k, 0.0105, 0.034, 0, 3],
      [0.03 * k, 0.009, 0.031, 0, 2.6],
    ]),
    { radial: 8, capStart: -0.01, capEnd: 0.037 * k },
  );
  // thumb
  _a.set(x + m * 0.004, wristY - 0.03 * k, 0.034);
  _b.set(x + m * 0.034 * k, wristY - 0.074 * k, 0.046);
  b.segment(_a, _b, FRONT).capsule(_a.distanceTo(_b), 0.0125, 0.0105, { radial: 6, capSeg: 1 });
}
