/**
 * Shared, headless geometry helpers. BOTH the collision world (src/physics) and the visual world
 * builder (src/world) must derive obstacle shapes from these functions so physics and visuals match.
 * No three.js imports — plain numbers only.
 */
import { GAME } from '../config';
import type { Footprint, KickerDef, LedgeDef, StairsDef, V2, V3, WallDef, WinchPointDef } from '../types';

export const DEG = Math.PI / 180;

/** Unit horizontal direction [x, z] for a yaw in radians (yaw 0 → +Z, yaw +90° → +X). */
export function yawDir(yaw: number): [number, number] {
  return [Math.sin(yaw), Math.cos(yaw)];
}

/** Yaw (rad) of a horizontal direction. */
export function dirYaw(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Wrap an angle to (−π, π]. */
export function wrapPi(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a <= 0) a += 2 * Math.PI;
  return a - Math.PI;
}

/** Rotate a local (x, z) offset by a yaw in DEGREES (same as THREE rotation.y). */
export function rotXZ(lx: number, lz: number, rotDeg = 0): [number, number] {
  if (!rotDeg) return [lx, lz];
  const a = rotDeg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [lx * c + lz * s, -lx * s + lz * c];
}

/** Local (x,y,z) of an object at `pos` with yaw `rotDeg` → world. */
export function toWorld(pos: V3, rotDeg: number | undefined, lx: number, ly: number, lz: number): [number, number, number] {
  const [x, z] = rotXZ(lx, lz, rotDeg ?? 0);
  return [pos[0] + x, pos[1] + ly, pos[2] + z];
}

/** World (x,z) → local (x,z) of an object centred at `center` with yaw `rotDeg`. */
export function toLocalXZ(center: V2 | V3, rotDeg: number | undefined, x: number, z: number): [number, number] {
  const cz = center.length === 3 ? (center as V3)[2] : (center as V2)[1];
  return rotXZ(x - center[0], z - cz, -(rotDeg ?? 0));
}

/** Closed outline of a footprint (rect → 4 corners, counter-clockwise seen from above… order: −x−z, +x−z, +x+z, −x+z in local space). */
export function footprintOutline(fp: Footprint): [number, number][] {
  if (fp.kind === 'poly') return fp.points.map((p) => [p[0], p[1]]);
  const hx = fp.size[0] / 2;
  const hz = fp.size[1] / 2;
  const corners: [number, number][] = [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ];
  return corners.map(([lx, lz]) => {
    const [x, z] = rotXZ(lx, lz, fp.rot ?? 0);
    return [fp.center[0] + x, fp.center[1] + z];
  });
}

export function footprintContains(fp: Footprint, x: number, z: number): boolean {
  if (fp.kind === 'rect') {
    const [lx, lz] = toLocalXZ(fp.center, fp.rot, x, z);
    return Math.abs(lx) <= fp.size[0] / 2 && Math.abs(lz) <= fp.size[1] / 2;
  }
  // even-odd rule
  let inside = false;
  const pts = fp.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const zi = pts[i][1];
    const xj = pts[j][0];
    const zj = pts[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Axis-aligned bounds of a footprint: [minX, minZ, maxX, maxZ]. */
export function footprintBounds(fp: Footprint): [number, number, number, number] {
  const pts = footprintOutline(fp);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return [minX, minZ, maxX, maxZ];
}

// ─────────────────────────────────────────────────────────────── Kicker ──

/** Normalised kicker height profile, t = 0 (entry) … 1 (lip). */
export function kickerProfile(curve: number, t: number): number {
  const c = Math.min(1, Math.max(0, curve));
  const tt = Math.min(1, Math.max(0, t));
  return (1 - c) * tt + c * tt * tt;
}

/** d(profile)/dt. Multiply by height/length for the real slope. */
export function kickerProfileSlope(curve: number, t: number): number {
  const c = Math.min(1, Math.max(0, curve));
  const tt = Math.min(1, Math.max(0, t));
  return 1 - c + 2 * c * tt;
}

/**
 * Kicker surface under a world point. Returns null when outside the ramp footprint.
 * `y` is the world height of the face, `slope` = dy/d(local z).
 */
export function kickerSurface(def: KickerDef, x: number, z: number): { y: number; slope: number; t: number } | null {
  const [lx, lz] = toLocalXZ(def.pos, def.rot, x, z);
  if (Math.abs(lx) > def.width / 2 || lz < 0 || lz > def.length) return null;
  const curve = def.curve ?? 0.5;
  const t = lz / def.length;
  return {
    y: def.pos[1] + def.height * kickerProfile(curve, t),
    slope: (def.height / def.length) * kickerProfileSlope(curve, t),
    t,
  };
}

// ──────────────────────────────────────────────────────────────── Ledge ──

/** World-space description of a ledge box. */
export function ledgeBox(def: LedgeDef): { center: V3; size: V3; rot: number; top: number } {
  return {
    center: [def.pos[0], def.pos[1] + def.size[1] / 2, def.pos[2]],
    size: def.size,
    rot: def.rot ?? 0,
    top: def.pos[1] + def.size[1],
  };
}

/** The two grindable top edges of a ledge (world paths, each 2 points) + its centre line. */
export function ledgeEdges(def: LedgeDef): { left: [V3, V3]; right: [V3, V3]; center: [V3, V3] } {
  const hx = def.size[0] / 2;
  const hz = def.size[2] / 2;
  const h = def.size[1];
  const p = (lx: number, lz: number): V3 => toWorld(def.pos, def.rot, lx, h, lz);
  return {
    left: [p(hx, -hz), p(hx, hz)],
    right: [p(-hx, -hz), p(-hx, hz)],
    center: [p(0, -hz), p(0, hz)],
  };
}

// ─────────────────────────────────────────────────────────────── Stairs ──

export interface StairsLayout {
  /** One box per step. */
  steps: { center: V2; size: V2; rot: number; top: number; bottom: number }[];
  /** Grindable handrail centre lines (world). */
  rails: V3[][];
  /** Height of the top landing. */
  topY: number;
  /** Horizontal run. */
  length: number;
}

export function stairsLayout(def: StairsDef): StairsLayout {
  const rot = def.rot ?? 0;
  const steps: StairsLayout['steps'] = [];
  for (let i = 0; i < def.steps; i++) {
    const [x, , z] = toWorld(def.pos, rot, 0, 0, (i + 0.5) * def.stepD);
    steps.push({
      center: [x, z],
      size: [def.width, def.stepD],
      rot,
      top: def.pos[1] + (i + 1) * def.stepH,
      bottom: def.pos[1] - 0.5,
    });
  }
  const length = def.steps * def.stepD;
  const rise = def.steps * def.stepH;
  const rh = def.railHeight ?? 0.85;
  const railAt = (lx: number): V3[] => [
    toWorld(def.pos, rot, lx, rh + def.stepH * 0.5, -0.15),
    toWorld(def.pos, rot, lx, rise + rh, length - def.stepD * 0.5),
    toWorld(def.pos, rot, lx, rise + rh, length + 0.6),
  ];
  const edge = def.width / 2 - 0.06;
  const rails: V3[][] = [];
  if (def.handrail === 'left' || def.handrail === 'both') rails.push(railAt(edge));
  if (def.handrail === 'right' || def.handrail === 'both') rails.push(railAt(-edge));
  if (def.handrail === 'center') rails.push(railAt(0));
  return { steps, rails, topY: def.pos[1] + rise, length };
}

// ───────────────────────────────────────────────────────────────── Wall ──

/** Horizontal unit normal [nx, nz] of the rideable wall face (left of a→b). */
export function wallNormal(def: WallDef): [number, number] {
  const dx = def.b[0] - def.a[0];
  const dz = def.b[2] - def.a[2];
  const len = Math.hypot(dx, dz) || 1;
  return [dz / len, -dx / len];
}

// ──────────────────────────────────────────────────────────────── Winch ──

/** Point where the rope leaves the drum. */
export function winchAnchor(wp: WinchPointDef): [number, number, number] {
  return [wp.pos[0], wp.pos[1] + GAME.winchAnchorHeight, wp.pos[2]];
}

/** Line start → winch: unit direction, yaw and horizontal length. */
export function lineInfo(wp: WinchPointDef): { dx: number; dz: number; yaw: number; length: number } {
  const ddx = wp.pos[0] - wp.start[0];
  const ddz = wp.pos[2] - wp.start[2];
  const length = Math.hypot(ddx, ddz) || 1;
  return { dx: ddx / length, dz: ddz / length, yaw: Math.atan2(ddx, ddz), length };
}

// ────────────────────────────────────────────────────────────────── RNG ──

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) → [0, 1). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}
