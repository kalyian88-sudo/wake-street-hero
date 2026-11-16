/**
 * Collision world of one spot: surfaces to stand on (water, ground boxes, kicker faces, ledge tops,
 * stair steps), faces to hit (box sides, kicker sides), grind lines, wallride faces and gap zones.
 * All queries are allocation-free (results go into caller-owned objects) and use a coarse grid.
 */
import { footprintContains, kickerProfile, kickerProfileSlope } from '../data/geometry';
import type { CollisionDebugShape, ICollisionWorld, SpotDef, SurfaceKind, SurfaceSample } from '../types';
import { buildColliders, type Aabb, type GapZone, type GrindLine, type Ramp, type SolidBox, type SpotColliders, type WallFace } from './collision/shapes';
import { collisionDebugShapes } from './collision/debug';
import { SIM } from './tuning';

export type { GrindLine, WallFace, GapZone } from './collision/shapes';

/** Side hit against a solid. Normal is horizontal and points out of the solid. */
export interface SideHit {
  nx: number;
  nz: number;
  /** Height of the surface that blocked the move. */
  top: number;
  id: string;
  kind: SurfaceKind;
  role: 'ground' | 'ledge' | 'step' | 'pipe' | 'ramp';
}

export interface GrindHit {
  line: GrindLine | null;
  seg: number;
  t: number;
  x: number;
  y: number;
  z: number;
  /** Horizontal distance from the query point. */
  dist: number;
}

export interface WallProbe {
  wall: WallFace | null;
  /** Signed horizontal distance in front of the (leaned) face. */
  dist: number;
  /** Metres along a → b. */
  u: number;
  /** Height above the wall base. */
  h: number;
}

export function createSideHit(): SideHit {
  return { nx: 0, nz: 0, top: 0, id: '', kind: 'concrete', role: 'ground' };
}
export function createGrindHit(): GrindHit {
  return { line: null, seg: 0, t: 0, x: 0, y: 0, z: 0, dist: 0 };
}
export function createWallProbe(): WallProbe {
  return { wall: null, dist: 0, u: 0, h: 0 };
}
export function createSurfaceSample(): SurfaceSample {
  return { y: 0, kind: 'water', id: '', nx: 0, ny: 1, nz: 0, ramp: false };
}

interface Cell {
  solids: number[];
  ramps: number[];
  waters: number[];
  grinds: number[];
  walls: number[];
}

const CELL = 4;
const PAD = 12;

export class CollisionWorld implements ICollisionWorld {
  readonly spot: SpotDef;
  readonly solids: SolidBox[];
  readonly ramps: Ramp[];
  readonly grinds: GrindLine[];
  readonly walls: WallFace[];
  readonly gaps: GapZone[];
  private readonly c: SpotColliders;
  private readonly cells: Cell[];
  private readonly all: Cell;
  private readonly gx0: number;
  private readonly gz0: number;
  private readonly gnx: number;
  private readonly gnz: number;
  private readonly scratch = createSurfaceSample();
  private debugCache: CollisionDebugShape[] | null = null;

  constructor(spot: SpotDef) {
    this.spot = spot;
    const c = (this.c = buildColliders(spot));
    this.solids = c.solids;
    this.ramps = c.ramps;
    this.grinds = c.grinds;
    this.walls = c.walls;
    this.gaps = c.gaps;

    this.gx0 = spot.bounds.min[0] - PAD;
    this.gz0 = spot.bounds.min[1] - PAD;
    this.gnx = Math.max(1, Math.ceil((spot.bounds.max[0] + PAD - this.gx0) / CELL));
    this.gnz = Math.max(1, Math.ceil((spot.bounds.max[1] + PAD - this.gz0) / CELL));
    this.cells = [];
    for (let i = 0; i < this.gnx * this.gnz; i++) this.cells.push({ solids: [], ramps: [], waters: [], grinds: [], walls: [] });
    this.all = { solids: [], ramps: [], waters: [], grinds: [], walls: [] };
    const fill = (key: keyof Cell, list: Aabb[]): void => {
      list.forEach((b, i) => {
        this.all[key].push(i);
        const x0 = Math.max(0, Math.floor((b.minX - this.gx0) / CELL));
        const x1 = Math.min(this.gnx - 1, Math.floor((b.maxX - this.gx0) / CELL));
        const z0 = Math.max(0, Math.floor((b.minZ - this.gz0) / CELL));
        const z1 = Math.min(this.gnz - 1, Math.floor((b.maxZ - this.gz0) / CELL));
        for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) this.cells[iz * this.gnx + ix][key].push(i);
      });
    };
    fill('solids', c.solids);
    fill('ramps', c.ramps);
    fill('waters', c.waters);
    fill('grinds', c.grinds);
    fill('walls', c.walls);
  }

  private cellAt(x: number, z: number): Cell {
    const ix = Math.floor((x - this.gx0) / CELL);
    const iz = Math.floor((z - this.gz0) / CELL);
    if (ix < 0 || iz < 0 || ix >= this.gnx || iz >= this.gnz) return this.all;
    return this.cells[iz * this.gnx + ix];
  }

  // ───────────────────────────────────────────────────────── surfaces ──

  /** Allocation-free version of sample(). */
  sampleInto(out: SurfaceSample, x: number, z: number, yRef: number, stepUp: number = SIM.stepUp): SurfaceSample {
    const limit = yRef + stepUp;
    const cell = this.cellAt(x, z);
    out.y = this.spot.base.level;
    out.kind = this.spot.base.surface;
    out.id = 'base';
    out.nx = 0;
    out.ny = 1;
    out.nz = 0;
    out.ramp = false;

    const waters = this.c.waters;
    for (let k = 0; k < cell.waters.length; k++) {
      const w = waters[cell.waters[k]];
      if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
      if (w.level > limit || w.level <= out.y) continue;
      if (!footprintContains(w.shape, x, z)) continue;
      out.y = w.level;
      out.kind = 'water';
      out.id = w.id;
    }
    const solids = this.solids;
    for (let k = 0; k < cell.solids.length; k++) {
      const b = solids[cell.solids[k]];
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (b.top > limit || b.top < out.y) continue;
      const dx = x - b.cx;
      const dz = z - b.cz;
      if (Math.abs(dx * b.cos - dz * b.sin) > b.hx || Math.abs(dx * b.sin + dz * b.cos) > b.hz) continue;
      out.y = b.top;
      out.kind = b.kind;
      out.id = b.id;
      out.ramp = false;
      out.nx = 0;
      out.ny = 1;
      out.nz = 0;
    }
    const ramps = this.ramps;
    for (let k = 0; k < cell.ramps.length; k++) {
      const r = ramps[cell.ramps[k]];
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      const dx = x - r.ox;
      const dz = z - r.oz;
      const lx = dx * r.cos - dz * r.sin;
      const lz = dx * r.sin + dz * r.cos;
      if (Math.abs(lx) > r.hw || lz < 0 || lz > r.length) continue;
      const t = lz / r.length;
      const y = r.oy + r.height * kickerProfile(r.curve, t);
      if (y > limit || y < out.y) continue;
      const slope = (r.height / r.length) * kickerProfileSlope(r.curve, t);
      const inv = 1 / Math.sqrt(1 + slope * slope);
      out.y = y;
      out.kind = r.kind;
      out.id = r.id;
      out.ramp = true;
      // local normal (0, 1, −slope) → world (local +Z is (sin, cos))
      out.nx = -slope * r.sin * inv;
      out.ny = inv;
      out.nz = -slope * r.cos * inv;
    }
    return out;
  }

  sample(x: number, z: number, yRef: number, stepUp: number = SIM.stepUp): SurfaceSample {
    return this.sampleInto(createSurfaceSample(), x, z, yRef, stepUp);
  }

  /** Normalised position 0..1 along a kicker (entry → lip) for a point on it, −1 when not on that ramp. */
  rampProgress(id: string, x: number, z: number): number {
    for (let i = 0; i < this.ramps.length; i++) {
      const r = this.ramps[i];
      if (r.id !== id) continue;
      const dx = x - r.ox;
      const dz = z - r.oz;
      const lz = dx * r.sin + dz * r.cos;
      return Math.min(1, Math.max(0, lz / r.length));
    }
    return -1;
  }

  /** True when the top-most surface at the point is water. */
  isWater(x: number, z: number): boolean {
    return this.sampleInto(this.scratch, x, z, 1e6, 0).kind === 'water';
  }

  /** Water with nothing solid, no rail and no wall within `r` metres (respawn test). */
  isClearWater(x: number, z: number, r: number): boolean {
    if (!this.isWater(x, z)) return false;
    const level = this.scratch.y;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = this.sampleInto(this.scratch, x + Math.cos(a) * r, z + Math.sin(a) * r, 1e6, 0);
      if (s.kind !== 'water' || s.y !== level) return false;
    }
    for (let i = 0; i < this.grinds.length; i++) {
      const g = this.grinds[i];
      if (x < g.minX - r || x > g.maxX + r || z < g.minZ - r || z > g.maxZ + r) continue;
      for (let s = 0; s < g.n - 1; s++) {
        if (segDistXZ(x, z, g.px[s], g.pz[s], g.px[s + 1], g.pz[s + 1]) < r) return false;
      }
    }
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      if (segDistXZ(x, z, w.ax, w.az, w.ax + w.dx * w.len, w.az + w.dz * w.len) < r) return false;
    }
    const b = this.spot.bounds;
    return x > b.min[0] + r && x < b.max[0] - r && z > b.min[1] + r && z < b.max[1] - r;
  }

  // ────────────────────────────────────────────────────── side hits ──

  /**
   * Does the move (x0,z0) → (x1,z1) at board height `y` run into the side of a solid
   * (something at the target whose top is more than stepUp above the board)?
   */
  obstruct(x0: number, z0: number, x1: number, z1: number, y: number, stepUp: number, out: SideHit): boolean {
    const limit = y + stepUp;
    const cell = this.cellAt(x1, z1);
    const solids = this.solids;
    for (let k = 0; k < cell.solids.length; k++) {
      const b = solids[cell.solids[k]];
      if (x1 < b.minX || x1 > b.maxX || z1 < b.minZ || z1 > b.maxZ) continue;
      if (b.top <= limit || b.bottom > y + 0.4) continue;
      const dx = x1 - b.cx;
      const dz = z1 - b.cz;
      const a1 = dx * b.cos - dz * b.sin;
      const b1 = dx * b.sin + dz * b.cos;
      if (Math.abs(a1) > b.hx || Math.abs(b1) > b.hz) continue;
      const ex = x0 - b.cx;
      const ez = z0 - b.cz;
      entryNormal(ex * b.cos - ez * b.sin, ex * b.sin + ez * b.cos, a1, b1, b.hx, b.hz, b.cos, b.sin, out);
      out.top = b.top;
      out.id = b.id;
      out.kind = b.kind;
      out.role = b.role;
      return true;
    }
    const ramps = this.ramps;
    for (let k = 0; k < cell.ramps.length; k++) {
      const r = ramps[cell.ramps[k]];
      if (x1 < r.minX || x1 > r.maxX || z1 < r.minZ || z1 > r.maxZ) continue;
      const dx = x1 - r.ox;
      const dz = z1 - r.oz;
      const a1 = dx * r.cos - dz * r.sin;
      const lz = dx * r.sin + dz * r.cos;
      if (Math.abs(a1) > r.hw || lz < 0 || lz > r.length) continue;
      const top = r.oy + r.height * kickerProfile(r.curve, lz / r.length);
      if (top <= limit) continue;
      const ex = x0 - r.ox;
      const ez = z0 - r.oz;
      const half = r.length / 2;
      entryNormal(ex * r.cos - ez * r.sin, ex * r.sin + ez * r.cos - half, a1, lz - half, r.hw, half, r.cos, r.sin, out);
      out.top = top;
      out.id = r.id;
      out.kind = r.kind;
      out.role = 'ramp';
      return true;
    }
    return false;
  }

  // ────────────────────────────────────────────────────────── grinds ──

  /**
   * Closest grind line to a point whose height at the closest point satisfies
   * dyMin ≤ (lineY − y) ≤ dyMax and whose horizontal distance is within line.snap + extra.
   * `skip` = a line index to ignore (re-lock cooldown), −1 for none.
   */
  nearestGrind(x: number, y: number, z: number, dyMin: number, dyMax: number, extra: number, skip: number, out: GrindHit): boolean {
    const cell = this.cellAt(x, z);
    const grinds = this.grinds;
    let best = Infinity;
    out.line = null;
    for (let k = 0; k < cell.grinds.length; k++) {
      const g = grinds[cell.grinds[k]];
      if (g.index === skip) continue;
      if (x < g.minX - extra || x > g.maxX + extra || z < g.minZ - extra || z > g.maxZ + extra) continue;
      const reach = g.snap + extra;
      for (let s = 0; s < g.n - 1; s++) {
        const ax = g.px[s];
        const az = g.pz[s];
        const dx = g.px[s + 1] - ax;
        const dz = g.pz[s + 1] - az;
        const l2 = dx * dx + dz * dz;
        if (l2 < 1e-8) continue;
        let t = ((x - ax) * dx + (z - az) * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t;
        const qz = az + dz * t;
        const d = Math.hypot(x - qx, z - qz);
        if (d > reach || d >= best) continue;
        const qy = g.py[s] + (g.py[s + 1] - g.py[s]) * t;
        const dy = qy - y;
        if (dy < dyMin || dy > dyMax) continue;
        best = d;
        out.line = g;
        out.seg = s;
        out.t = t;
        out.x = qx;
        out.y = qy;
        out.z = qz;
        out.dist = d;
      }
    }
    return out.line !== null;
  }

  // ─────────────────────────────────────────────────────────── walls ──

  /** Nearest wallride face around a point (within its length and height). */
  probeWall(x: number, y: number, z: number, out: WallProbe): boolean {
    const cell = this.cellAt(x, z);
    const walls = this.walls;
    let best = Infinity;
    out.wall = null;
    for (let k = 0; k < cell.walls.length; k++) {
      const w = walls[cell.walls[k]];
      const rx = x - w.ax;
      const rz = z - w.az;
      const u = rx * w.dx + rz * w.dz;
      if (u < 0 || u > w.len) continue;
      const h = y - w.ay;
      if (h < -0.35 || h > w.height) continue;
      const dist = rx * w.nx + rz * w.nz + Math.max(0, h) * w.tanLean;
      if (Math.abs(dist) >= best) continue;
      best = Math.abs(dist);
      out.wall = w;
      out.dist = dist;
      out.u = u;
      out.h = h;
    }
    return out.wall !== null;
  }

  // ──────────────────────────────────────────────────────────── gaps ──

  inGap(index: number, x: number, z: number): boolean {
    const g = this.gaps[index];
    if (x < g.minX || x > g.maxX || z < g.minZ || z > g.maxZ) return false;
    return footprintContains(g.def.shape, x, z);
  }

  /** Metres outside spot.bounds (0 inside). `out` receives the unit direction back inside. */
  outOfBounds(x: number, z: number, out: { x: number; z: number }): number {
    const b = this.spot.bounds;
    const ox = x < b.min[0] ? b.min[0] - x : x > b.max[0] ? b.max[0] - x : 0;
    const oz = z < b.min[1] ? b.min[1] - z : z > b.max[1] ? b.max[1] - z : 0;
    const d = Math.hypot(ox, oz);
    if (d > 0) {
      out.x = ox / d;
      out.z = oz / d;
    }
    return d;
  }

  debugShapes(): CollisionDebugShape[] {
    if (!this.debugCache) this.debugCache = collisionDebugShapes(this.spot, this.c);
    return this.debugCache;
  }
}

/** Horizontal distance from a point to a segment. */
export function segDistXZ(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

/**
 * Which face of the local rectangle [−hx,hx]×[−hz,hz] the segment (a0,b0)→(a1,b1) enters through.
 * Writes the world-space outward normal of that face into `out`.
 */
function entryNormal(a0: number, b0: number, a1: number, b1: number, hx: number, hz: number, cos: number, sin: number, out: SideHit): void {
  let lnx = 0;
  let lnz = 0;
  const outsideX = Math.abs(a0) > hx;
  const outsideZ = Math.abs(b0) > hz;
  if (!outsideX && !outsideZ) {
    // already inside: leave through the nearest face
    const px = hx - Math.abs(a0);
    const pz = hz - Math.abs(b0);
    if (px < pz) lnx = a0 >= 0 ? 1 : -1;
    else lnz = b0 >= 0 ? 1 : -1;
  } else {
    const tx = outsideX ? ((a0 > 0 ? hx : -hx) - a0) / (a1 - a0 || 1e-9) : -Infinity;
    const tz = outsideZ ? ((b0 > 0 ? hz : -hz) - b0) / (b1 - b0 || 1e-9) : -Infinity;
    if (tx > tz) lnx = a0 > 0 ? 1 : -1;
    else lnz = b0 > 0 ? 1 : -1;
  }
  // local +X = world (cos, −sin), local +Z = world (sin, cos)
  out.nx = lnx * cos + lnz * sin;
  out.nz = -lnx * sin + lnz * cos;
}

export function createCollisionWorld(spot: SpotDef): CollisionWorld {
  return new CollisionWorld(spot);
}

export function buildCollisionWorld(spot: SpotDef): ICollisionWorld {
  return new CollisionWorld(spot);
}
