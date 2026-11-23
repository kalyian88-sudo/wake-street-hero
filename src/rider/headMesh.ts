/**
 * Procedural head: skull with a jaw, painted stylised face, nose, ears, six hair styles that work
 * with and without headwear, a wake helmet with ear guards and a snapback cap.
 * Built in HEAD-BONE space (origin = skull base pivot, +Z = face, +X = the character's left).
 */
import { BufferGeometry, Color, Vector3 } from 'three';
import { MeshBuilder, type LoftOpts, type Ring } from './geo';
import { contrast, mix, shade } from './paint';
import { ATLAS, SWATCH, rectUV, swatchUV, type Outfit, type Proportions } from './rigDef';

const FRONT = new Vector3(0, 0, 1);
const _d = new Vector3();
const _a = new Vector3();
const _b = new Vector3();

/** Unit-sphere rings from the +Y pole down to latitude `minLat` (radians), pole first excluded. */
function sphereRings(count: number, minLat: number, maxLat = Math.PI / 2): Ring[] {
  const rings: Ring[] = [];
  for (let i = 0; i < count; i++) {
    const th = minLat + (i / count) * (maxLat - minLat);
    rings.push({ y: Math.sin(th), rx: Math.cos(th), rz: Math.cos(th) });
  }
  return rings;
}

export interface HeadBuild {
  geometry: BufferGeometry;
  triangles: number;
}

export function buildHead(o: Outfit, P: Proportions): HeadBuild {
  const b = new MeshBuilder(false);
  const cy = P.headCenterY - P.headY;
  const RX = P.headRx;
  const RY = P.headRy;
  const RZ = P.headRz;
  const sw = (k: number): void => {
    const uv = swatchUV(k);
    b.uv(uv[0], uv[1]);
  };

  /** Point on the head surface along unit direction d (from the skull centre), pushed out by `extra`. */
  const headPoint = (d: Vector3, extra: number, out: Vector3): Vector3 => {
    const t = d.y < 0 ? -d.y : 0;
    const rx = RX * (1 - 0.24 * Math.pow(t, 2));
    const rz = RZ * (1 - 0.08 * t);
    const rho = 1 / Math.sqrt((d.x * d.x) / (rx * rx) + (d.y * d.y) / (RY * RY) + (d.z * d.z) / (rz * rz));
    out.copy(d).multiplyScalar(rho + extra);
    out.z += (o.female ? 0.012 : 0.016) * t * t * (d.z > 0 ? 1 : 0.3) - (d.y > 0 ? 0.005 * d.y : 0);
    return out;
  };

  // ── skull with painted face ──
  const face = rectUV(ATLAS.face);
  const fcx = (face[0] + face[2]) / 2;
  const fcy = (face[1] + face[3]) / 2;
  const fw = face[2] - face[0];
  const faceUV = (p: Vector3, out: [number, number]): void => {
    // direction is recovered from the position (skull is star-shaped around its centre)
    _d.copy(p).normalize();
    const r = Math.acos(Math.max(-1, Math.min(1, _d.z)));
    let ux: number;
    let uy: number;
    if (r <= Math.PI / 2) {
      ux = _d.x * 0.43;
      uy = _d.y * 0.43;
    } else {
      const len = Math.hypot(_d.x, _d.y) || 1;
      const rho = 0.43 + 0.065 * ((r - Math.PI / 2) / (Math.PI / 2));
      ux = (_d.x / len) * rho;
      uy = (_d.y / len) * rho;
    }
    out[0] = fcx + ux * fw;
    out[1] = fcy + uy * fw;
  };
  b.at(0, cy, 0).color(0xffffff);
  b.loft(sphereRings(26, -Math.PI / 2 + Math.PI / 10, Math.PI / 2), {
    radial: 44,
    capStart: -1,
    capEnd: 1,
    warp: (p) => {
      _d.copy(p).normalize();
      headPoint(_d, faceSculpt(_d, o.female), p);
    },
    uvFn: faceUV,
  });

  // ── nose + ears ──
  b.color(o.skin);
  sw(SWATCH.skin);
  _a.set(0, cy + 0.014, RZ - 0.0175);
  _b.set(0, cy - 0.03, RZ - 0.0035);
  b.segment(_a, _b, FRONT).loft(
    [
      { y: 0, rx: 0.0065, rz: 0.007 },
      { y: 0.012, rx: 0.0075, rz: 0.009 },
      { y: 0.024, rx: 0.009, rz: 0.0102 },
      { y: 0.033, rx: 0.012, rz: 0.0112 },
      { y: 0.039, rx: 0.0132, rz: 0.0102 },
      { y: 0.044, rx: 0.0116, rz: 0.0078 },
    ],
    { radial: 14, capStart: -0.006, capEnd: 0.048 },
  );
  if (o.headwear !== 'helmet') {
    for (const s of [1, -1]) {
      b.at(s * (RX - 0.003), cy - 0.006, -0.01).ellipsoid(0.0105, 0.028, 0.017, { radial: 12, rings: 8 });
    }
  }

  buildHair(b, o, P, cy, headPoint);
  if (o.headwear === 'helmet') buildHelmet(b, o, P, cy, headPoint);
  else if (o.headwear === 'cap') buildCap(b, o, P, cy, headPoint);

  return { geometry: b.build(), triangles: b.triangleCount };
}

type HeadPoint = (d: Vector3, extra: number, out: Vector3) => Vector3;

function gauss(x: number, y: number): number {
  return Math.exp(-(x * x + y * y));
}

/**
 * Facial relief (m, along the skull direction) on top of the head ellipsoid. Feature positions are in
 * skull-direction coordinates and match the painted face (eyes at |x| 0.354, y 0.09; mouth y −0.53).
 */
function faceSculpt(d: Vector3, female: boolean): number {
  if (d.z <= 0.05) return 0;
  const m = Math.min(1, (d.z - 0.05) / 0.4);
  const x = d.x;
  const ax = Math.abs(x);
  const y = d.y;
  const k = female ? 0.75 : 1;
  let h = 0;
  // brow ridge, eye sockets, the eyeball bulging back out of them
  h += 0.0042 * k * gauss(x / 0.55, (y - 0.25) / 0.075);
  h -= 0.0062 * gauss((ax - 0.35) / 0.15, (y - 0.1) / 0.11);
  h += 0.0036 * gauss((ax - 0.354) / 0.085, (y - 0.09) / 0.06);
  // nose bridge running down into the nose
  h += 0.0058 * gauss(x / 0.075, (y + 0.02) / 0.2) * (y < 0.2 ? 1 : 0.5);
  // cheekbones and the soft hollow under them
  h += 0.0042 * gauss((ax - 0.5) / 0.16, (y + 0.1) / 0.11);
  h -= 0.0028 * k * gauss((ax - 0.48) / 0.13, (y + 0.42) / 0.13);
  // muzzle: philtrum, lips, the line between them, mentolabial crease, chin
  h += 0.0034 * gauss(x / 0.26, (y + 0.44) / 0.14);
  h += (female ? 0.0034 : 0.0024) * gauss(x / 0.17, (y + 0.49) / 0.04);
  h += (female ? 0.0036 : 0.0028) * gauss(x / 0.15, (y + 0.575) / 0.045);
  h -= 0.0016 * gauss(x / 0.2, (y + 0.528) / 0.016);
  h -= 0.0022 * gauss(x / 0.14, (y + 0.66) / 0.04);
  h += (female ? 0.003 : 0.0052) * gauss(x / 0.2, (y + 0.78) / 0.09);
  // nasolabial folds
  h += 0.0016 * gauss((ax - 0.2 + (y + 0.35) * 0.25) / 0.05, (y + 0.36) / 0.12);
  // temples
  h -= 0.0028 * gauss((ax - 0.78) / 0.12, (y - 0.2) / 0.22);
  // jaw angle a touch squarer for him
  if (!female) h += 0.003 * gauss((ax - 0.7) / 0.14, (y + 0.62) / 0.12);
  return h * m;
}

/** Cap of the head surface: unit-sphere rings in a frame tilted about X by `tilt` (rad, − = rim higher in front). */
function shell(
  b: MeshBuilder,
  cy: number,
  headPoint: HeadPoint,
  tilt: number,
  minLat: number,
  rings: number,
  thickness: (d: Vector3, ring: number) => number,
  opts: LoftOpts = {},
  earDrop = 0,
): void {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  b.at(0, cy, 0).loft(sphereRings(rings * 2, minLat), {
    radial: 32,
    capEnd: 1,
    ...opts,
    warp: (p, ring2) => {
      const ring = ring2 / 2;
      _d.copy(p).normalize();
      const y = _d.y * c - _d.z * s;
      const z = _d.y * s + _d.z * c;
      _d.y = y;
      _d.z = z;
      if (earDrop > 0 && ring < 3) {
        // pull the rim down over the ears (sides, slightly behind the middle)
        const ax = Math.min(1, Math.abs(_d.x) * 1.1);
        const win = 1 - Math.min(1, Math.max(0, (Math.abs(_d.z + 0.1) - 0.3) / 0.4));
        const side = ax * ax * (3 - 2 * ax) * win * win * (3 - 2 * win);
        _d.y -= earDrop * side * (1 - ring / 3.4);
        _d.normalize();
      }
      headPoint(_d, thickness(_d, ring), p);
    },
  });
}

function buildHair(b: MeshBuilder, o: Outfit, P: Proportions, cy: number, headPoint: HeadPoint): void {
  const covered = o.headwear !== 'none';
  const helmet = o.headwear === 'helmet';
  const hair = o.hairColor;
  const uv = swatchUV(SWATCH.hair);
  b.uv(uv[0], uv[1]);
  const RZ = P.headRz;
  const RY = P.headRy;
  const tone = (p: Vector3, _i: number, c: Color): void => {
    // darker roots / underside, lighter crown
    const k = 0.8 + 0.3 * Math.max(0, Math.min(1, (p.y + 0.05) / 0.17));
    c.multiplyScalar(k);
  };
  const tilt = -0.62;
  switch (o.hair) {
    case 'buzz': {
      b.color(mix(o.skin, hair, 0.72));
      shell(b, cy, headPoint, tilt, 0.06, 5, () => 0.003);
      break;
    }
    case 'short': {
      b.color(hair);
      shell(b, cy, headPoint, tilt, 0.03, 6, (d) => (covered ? 0.006 : 0.012 + 0.016 * Math.max(0, d.z * 0.8 + d.y * 0.6)), { colorFn: tone });
      break;
    }
    case 'curly': {
      b.color(hair);
      shell(b, cy, headPoint, tilt, 0.02, 5, () => (covered ? 0.006 : 0.012), { colorFn: tone });
      const n = 16;
      for (let i = 0; i < n; i++) {
        // golden-spiral directions over the hair cap
        const yy = 1 - (i / (n - 1)) * 1.15;
        const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
        const ph = i * 2.39996;
        _d.set(Math.cos(ph) * rr, yy, Math.sin(ph) * rr);
        // tilt back like the cap, skip the face
        const y = _d.y * Math.cos(tilt) - _d.z * Math.sin(tilt);
        const z = _d.y * Math.sin(tilt) + _d.z * Math.cos(tilt);
        _d.y = y;
        _d.z = z;
        if (covered && _d.y > -0.15) continue;
        headPoint(_d, 0.016, _a);
        const r = 0.03 + ((i * 7) % 5) * 0.0028;
        b.color(shade(hair, ((i * 5) % 4) * 0.035 - 0.05));
        b.at(_a.x, cy + _a.y, _a.z).ellipsoid(r, r * 0.95, r, { radial: 6, rings: 3 });
      }
      break;
    }
    case 'long': {
      b.color(hair);
      shell(b, cy, headPoint, tilt, 0.03, 6, (d) => (covered ? 0.006 : 0.014 + 0.008 * Math.max(0, d.y)), { colorFn: tone });
      // curtain down the back + two locks framing the face
      b.color(shade(hair, -0.06));
      b.at(0, cy, 0).loft(
        [
          { y: -0.33, rx: 0.05, rz: 0.014, oz: -0.085 },
          { y: -0.27, rx: 0.086, rz: 0.026, oz: -0.088 },
          { y: -0.16, rx: 0.1, rz: 0.036, oz: -0.078 },
          { y: -0.06, rx: 0.094, rz: 0.044, oz: -0.062, n: 2.4 },
          { y: 0.02, rx: 0.082, rz: 0.04, oz: -0.056, n: 2.4 },
        ],
        { radial: 10, capStart: -0.345, capEnd: 0.04, colorFn: tone },
      );
      for (const s of [1, -1]) {
        _a.set(s * (P.headRx + 0.002), cy + 0.03, 0.02);
        _b.set(s * (P.headRx + 0.012), cy - 0.2, 0.03);
        b.segment(_a, _b, FRONT).capsule(_a.distanceTo(_b), 0.02, 0.012, { radial: 6, capSeg: 1, sx: 0.7 });
      }
      break;
    }
    case 'bun': {
      b.color(hair);
      shell(b, cy, headPoint, tilt, 0.03, 6, () => (covered ? 0.005 : 0.009), { colorFn: tone });
      if (!helmet) {
        b.color(shade(hair, -0.05));
        b.at(0, cy + RY * 0.72, -RZ * 0.86).ellipsoid(0.043, 0.04, 0.043, { radial: 8, rings: 5, colorFn: tone });
      } else {
        // low bun under the helmet rim
        b.at(0, cy - RY * 0.5, -RZ * 0.98).ellipsoid(0.036, 0.032, 0.034, { radial: 8, rings: 4 });
      }
      break;
    }
    case 'ponytail': {
      b.color(hair);
      shell(b, cy, headPoint, tilt, 0.03, 6, () => (covered ? 0.005 : 0.01), { colorFn: tone });
      const low = helmet;
      const pts: [number, number, number, number][] = low
        ? [
            [-0.05, -RZ - 0.002, 0.026, 0],
            [-0.12, -RZ - 0.04, 0.03, 0],
            [-0.22, -RZ - 0.05, 0.022, 0],
            [-0.3, -RZ - 0.035, 0.009, 0],
          ]
        : [
            [0.045, -RZ - 0.004, 0.026, 0],
            [0.035, -RZ - 0.07, 0.034, 0],
            [-0.07, -RZ - 0.115, 0.03, 0],
            [-0.2, -RZ - 0.1, 0.02, 0],
            [-0.28, -RZ - 0.075, 0.008, 0],
          ];
      b.color(shade(hair, -0.04));
      for (let i = 0; i < pts.length - 1; i++) {
        _a.set(0, cy + pts[i][0], pts[i][1]);
        _b.set(0, cy + pts[i + 1][0], pts[i + 1][1]);
        b.segment(_a, _b, FRONT).capsule(_a.distanceTo(_b), pts[i][2], pts[i + 1][2], { radial: 7, capSeg: 1, sx: 0.85 });
      }
      break;
    }
  }
}

function buildHelmet(b: MeshBuilder, o: Outfit, P: Proportions, cy: number, headPoint: HeadPoint): void {
  const look = o.headLook;
  const wrap = rectUV(ATLAS.headwear, 1);
  b.color(0xffffff);
  // shell: rim above the brows in front, down over the ears and nape; last ring folds inwards (rim thickness)
  const rings = 7;
  shell(
    b,
    cy,
    headPoint,
    -0.45,
    -0.07,
    rings,
    (d, ring) => {
      const side = Math.abs(d.x);
      const base = 0.021 + 0.003 * side;
      return ring === 0 ? base - 0.014 : base;
    },
    {
      radial: 32,
      wrap,
      vOf: (_r, i, n) => Math.max(0, (i - 1) / (n - 2)),
    },
    0.55,
  );
  // chin strap
  const uvS = swatchUV(SWATCH.cloth);
  b.color(0x121315).uv(uvS[0], uvS[1]);
  const uvS0 = swatchUV(SWATCH.cloth);
  void uvS0;
  // follows the jaw line from under the ear guard to the chin
  const chinDirs: [number, number, number][] = [
    [0.93, -0.36, -0.06],
    [0.8, -0.6, 0.06],
    [0.55, -0.8, 0.2],
    [0.25, -0.92, 0.3],
    [0, -0.95, 0.32],
  ];
  const _p0 = new Vector3();
  const _p1 = new Vector3();
  for (const s of [1, -1]) {
    for (let i = 0; i < chinDirs.length - 1; i++) {
      headPoint(_d.set(s * chinDirs[i][0], chinDirs[i][1], chinDirs[i][2]).normalize(), 0.003, _p0);
      headPoint(_d.set(s * chinDirs[i + 1][0], chinDirs[i + 1][1], chinDirs[i + 1][2]).normalize(), 0.003, _p1);
      _p0.y += cy;
      _p1.y += cy;
      b.segment(_p0, _p1, FRONT).capsule(_p0.distanceTo(_p1), 0.0055, 0.0055, { radial: 5, capSeg: 1, sx: 0.45 });
    }
  }
  void P;
}

function buildCap(b: MeshBuilder, o: Outfit, P: Proportions, cy: number, headPoint: HeadPoint): void {
  const look = o.headLook;
  const wrap = rectUV(ATLAS.headwear, 1);
  b.color(0xffffff);
  shell(b, cy, headPoint, -0.26, 0.16, 5, (d) => 0.012 + 0.012 * Math.max(0, d.y) * Math.max(0, d.z + 0.3), {
    radial: 32,
    wrap,
  });
  // flat-ish brim + top button
  const uv = swatchUV(SWATCH.cloth);
  b.color(contrast(look.primary, look.secondary)).uv(uv[0], uv[1]);
  _d.set(0, 0.3, 0.954).normalize();
  headPoint(_d, 0.0, _a);
  _a.y += cy;
  _b.set(0, _a.y - 0.018, _a.z + 0.1);
  _a.z -= 0.02;
  b.segment(_a, _b, new Vector3(0, 1, 0)).loft(
    [
      { y: 0, rx: 0.074, rz: 0.006, n: 2.4 },
      { y: 0.05, rx: 0.08, rz: 0.005, n: 2.6 },
      { y: 0.098, rx: 0.068, rz: 0.004, n: 2.8 },
      { y: 0.118, rx: 0.04, rz: 0.003, n: 2.4 },
    ],
    { radial: 10, capStart: -0.004, capEnd: 0.124 },
  );
  b.color(look.primary);
  _d.set(0, 0.97, -0.24).normalize();
  headPoint(_d, 0.022, _a);
  b.at(_a.x, cy + _a.y, _a.z).ellipsoid(0.011, 0.006, 0.011, { radial: 6, rings: 3 });
}
