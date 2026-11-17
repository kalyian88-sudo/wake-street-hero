/**
 * Collider primitives built from a SpotDef. Every shape comes from src/data/geometry.ts so the
 * hitboxes match what the world builder draws.
 */
import { DEG, footprintBounds, footprintContains, ledgeBox, ledgeEdges, stairsLayout, wallNormal } from '../../data/geometry';
import type { Footprint, GapDef, KickerDef, LedgeDef, RailDef, SpotDef, StairsDef, SurfaceKind, V3, WallDef } from '../../types';

export interface Aabb {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Oriented box with a flat top. local = rotate(world − centre, −rot). */
export interface SolidBox extends Aabb {
  id: string;
  role: 'ground' | 'ledge' | 'step' | 'pipe';
  kind: SurfaceKind;
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
  top: number;
  bottom: number;
}

export interface Ramp extends Aabb {
  id: string;
  def: KickerDef;
  kind: SurfaceKind;
  ox: number;
  oy: number;
  oz: number;
  cos: number;
  sin: number;
  hw: number;
  length: number;
  height: number;
  curve: number;
}

export interface WaterZone extends Aabb {
  id: string;
  shape: Footprint;
  level: number;
}

export interface GapZone extends Aabb {
  def: GapDef;
}

export type GrindKind = 'rail' | 'ledge' | 'pipe' | 'handrail';
export type GrindMaterial = 'metal' | 'stone' | 'wood' | 'plastic';

/** Grindable polyline (the line the board base rides on = tube centre + radius). */
export interface GrindLine extends Aabb {
  index: number;
  /** Obstacle id (rail / ledge / stairs). */
  id: string;
  kind: GrindKind;
  material: GrindMaterial;
  radius: number;
  /** Horizontal lock-on distance. */
  snap: number;
  /** Sliding deceleration m/s². */
  friction: number;
  /** Balance difficulty multiplier (fat pipes and ledges are easier). */
  balance: number;
  n: number;
  px: Float64Array;
  py: Float64Array;
  pz: Float64Array;
  /** Per segment: 3-D length and cumulative length at the segment start. */
  segLen: Float64Array;
  cum: Float64Array;
  total: number;
}

export interface WallFace extends Aabb {
  id: string;
  kind: SurfaceKind;
  ax: number;
  ay: number;
  az: number;
  /** Unit direction a → b. */
  dx: number;
  dz: number;
  len: number;
  /** Horizontal outward normal. */
  nx: number;
  nz: number;
  height: number;
  /** tan(lean): the face recedes by this much per metre of height. */
  tanLean: number;
}

function rotTerms(rotDeg: number | undefined): { cos: number; sin: number } {
  const a = (rotDeg ?? 0) * DEG;
  return { cos: Math.cos(a), sin: Math.sin(a) };
}

function boxAabb(b: { cx: number; cz: number; hx: number; hz: number; cos: number; sin: number }): Aabb {
  const ex = Math.abs(b.hx * b.cos) + Math.abs(b.hz * b.sin);
  const ez = Math.abs(b.hx * b.sin) + Math.abs(b.hz * b.cos);
  return { minX: b.cx - ex, maxX: b.cx + ex, minZ: b.cz - ez, maxZ: b.cz + ez };
}

function makeBox(
  id: string,
  role: SolidBox['role'],
  kind: SurfaceKind,
  cx: number,
  cz: number,
  sx: number,
  sz: number,
  rotDeg: number | undefined,
  top: number,
  bottom: number,
): SolidBox {
  const { cos, sin } = rotTerms(rotDeg);
  const core = { cx, cz, hx: sx / 2, hz: sz / 2, cos, sin };
  return { id, role, kind, ...core, top, bottom, ...boxAabb(core) };
}

const KICKER_SURFACE: Record<KickerDef['style'], SurfaceKind> = {
  wood: 'wood',
  pallet: 'wood',
  concrete: 'concrete',
  plastic: 'tile',
  bank: 'concrete',
  stone: 'stone',
};

function makeRamp(def: KickerDef): Ramp {
  const { cos, sin } = rotTerms(def.rot);
  const hw = def.width / 2;
  // footprint corners: local x ∈ ±hw, local z ∈ 0..length
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const lx of [-hw, hw]) {
    for (const lz of [0, def.length]) {
      const x = def.pos[0] + lx * cos + lz * sin;
      const z = def.pos[2] - lx * sin + lz * cos;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  return {
    id: def.id,
    def,
    kind: KICKER_SURFACE[def.style],
    ox: def.pos[0],
    oy: def.pos[1],
    oz: def.pos[2],
    cos,
    sin,
    hw,
    length: def.length,
    height: def.height,
    curve: def.curve ?? 0.5,
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

const RAIL_MATERIAL: Record<NonNullable<RailDef['material']>, GrindMaterial> = {
  steel: 'metal',
  brandRed: 'metal',
  rust: 'metal',
  neon: 'metal',
  stone: 'stone',
  concrete: 'stone',
  bamboo: 'wood',
  pvc: 'plastic',
};

const MATERIAL_FRICTION: Record<GrindMaterial, number> = { metal: 0.5, plastic: 0.7, wood: 1.1, stone: 1.5 };
const MATERIAL_SURFACE: Record<GrindMaterial, SurfaceKind> = { metal: 'metal', plastic: 'tile', wood: 'wood', stone: 'concrete' };

function surfaceMaterial(kind: SurfaceKind): GrindMaterial {
  if (kind === 'wood') return 'wood';
  if (kind === 'metal') return 'metal';
  if (kind === 'tile') return 'plastic';
  return 'stone';
}

function makeGrind(
  lines: GrindLine[],
  id: string,
  kind: GrindKind,
  material: GrindMaterial,
  radius: number,
  path: readonly V3[],
  lift: number,
  snapOverride?: number,
): GrindLine {
  const n = path.length;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    px[i] = path[i][0];
    py[i] = path[i][1] + lift;
    pz[i] = path[i][2];
    minX = Math.min(minX, px[i]);
    maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]);
    maxZ = Math.max(maxZ, pz[i]);
  }
  const segLen = new Float64Array(Math.max(1, n - 1));
  const cum = new Float64Array(Math.max(1, n - 1));
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    cum[i] = total;
    segLen[i] = Math.hypot(px[i + 1] - px[i], py[i + 1] - py[i], pz[i + 1] - pz[i]) || 1e-6;
    total += segLen[i];
  }
  const fat = kind === 'pipe' && radius >= 0.15;
  const snap = snapOverride ?? (fat ? radius + 0.3 : kind === 'ledge' ? 0.66 : kind === 'handrail' ? 0.48 : 0.42);
  const balance = fat ? 0.5 : kind === 'ledge' ? 0.6 : kind === 'handrail' ? 1.1 : kind === 'pipe' ? 0.85 : 1;
  const line: GrindLine = {
    index: lines.length,
    id,
    kind,
    material,
    radius,
    snap,
    friction: MATERIAL_FRICTION[material],
    balance,
    n,
    px,
    py,
    pz,
    segLen,
    cum,
    total,
    minX: minX - snap,
    maxX: maxX + snap,
    minZ: minZ - snap,
    maxZ: maxZ + snap,
  };
  lines.push(line);
  return line;
}

export interface SpotColliders {
  solids: SolidBox[];
  ramps: Ramp[];
  waters: WaterZone[];
  gaps: GapZone[];
  grinds: GrindLine[];
  walls: WallFace[];
}

function addRail(def: RailDef, out: SpotColliders): void {
  const radius = def.radius ?? 0.04;
  const kind: GrindKind = def.style === 'pipe' ? 'pipe' : def.style === 'handrail' ? 'handrail' : def.style === 'edge' ? 'ledge' : 'rail';
  const material: GrindMaterial = def.material ? RAIL_MATERIAL[def.material] : def.style === 'bamboo' ? 'wood' : def.style === 'pipe' ? 'plastic' : 'metal';
  makeGrind(out.grinds, def.id, kind, material, radius, def.path, radius);
  if (radius < 0.15) return;
  // fat pipes are solid: one thin box per segment so they cannot be ridden through sideways
  for (let i = 0; i < def.path.length - 1; i++) {
    const a = def.path[i];
    const b = def.path[i + 1];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (len < 1e-3) continue;
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]) / DEG;
    const low = Math.min(a[1], b[1]);
    out.solids.push(
      makeBox(def.id, 'pipe', MATERIAL_SURFACE[material], (a[0] + b[0]) / 2, (a[2] + b[2]) / 2, radius * 2, len, yaw, low + radius, low - radius - 0.6),
    );
  }
}

function addLedge(def: LedgeDef, out: SpotColliders): void {
  const box = ledgeBox(def);
  out.solids.push(makeBox(def.id, 'ledge', def.surface, box.center[0], box.center[2], def.size[0], def.size[2], box.rot, box.top, def.pos[1] - 0.6));
  const edges = ledgeEdges(def);
  const material = surfaceMaterial(def.surface);
  if (def.size[0] <= 0.6) {
    makeGrind(out.grinds, def.id, 'ledge', material, 0, edges.center, 0);
  } else {
    makeGrind(out.grinds, def.id, 'ledge', material, 0, edges.left, 0);
    makeGrind(out.grinds, def.id, 'ledge', material, 0, edges.right, 0);
  }
}

function addStairs(def: StairsDef, out: SpotColliders): void {
  const layout = stairsLayout(def);
  const kind: SurfaceKind = def.wet ? 'wetConcrete' : def.surface;
  for (const s of layout.steps) {
    out.solids.push(makeBox(def.id, 'step', kind, s.center[0], s.center[1], s.size[0], s.size[1], s.rot, s.top, s.bottom));
  }
  for (const rail of layout.rails) makeGrind(out.grinds, def.id, 'handrail', 'metal', 0.03, rail, 0.03);
}

function addWall(def: WallDef, out: SpotColliders): void {
  const ddx = def.b[0] - def.a[0];
  const ddz = def.b[2] - def.a[2];
  const len = Math.hypot(ddx, ddz) || 1;
  const [nx, nz] = wallNormal(def);
  const tanLean = Math.tan((def.lean ?? 0) * DEG);
  const back = Math.abs(tanLean) * def.height + 0.5;
  out.walls.push({
    id: def.id,
    kind: def.surface,
    ax: def.a[0],
    ay: def.a[1],
    az: def.a[2],
    dx: ddx / len,
    dz: ddz / len,
    len,
    nx,
    nz,
    height: def.height,
    tanLean,
    minX: Math.min(def.a[0], def.b[0]) - back,
    maxX: Math.max(def.a[0], def.b[0]) + back,
    minZ: Math.min(def.a[2], def.b[2]) - back,
    maxZ: Math.max(def.a[2], def.b[2]) + back,
  });
}

/**
 * Canal edges: every side of a ground box (quay, bank) that runs along water and stands at least
 * 0.4 m above it becomes a grindable ledge line along its top edge ("<groundId>.edge.<n>").
 */
function addQuayEdges(spot: SpotDef, g: SpotDef['ground'][number], out: SpotColliders): void {
  const rot = (g.rot ?? 0) * DEG;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const hx = g.size[0] / 2;
  const hz = g.size[1] / 2;
  const toWorld = (lx: number, lz: number): [number, number] => [g.center[0] + lx * c + lz * s, g.center[1] - lx * s + lz * c];
  const inset = 0.14;
  // side: start corner, end corner, outward normal (local)
  const sides: [[number, number], [number, number], [number, number]][] = [
    [[-hx, -hz], [-hx, hz], [-1, 0]],
    [[hx, -hz], [hx, hz], [1, 0]],
    [[-hx, -hz], [hx, -hz], [0, -1]],
    [[-hx, hz], [hx, hz], [0, 1]],
  ];
  let n = 0;
  for (const [a, b, nrm] of sides) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(2, Math.floor(len / 1));
    let runStart = -1;
    const flush = (end: number): void => {
      if (runStart < 0) return;
      const t0 = runStart / steps;
      const t1 = end / steps;
      if ((t1 - t0) * len >= 3) {
        const p = (t: number): V3 => {
          const lx = a[0] + (b[0] - a[0]) * t - nrm[0] * inset;
          const lz = a[1] + (b[1] - a[1]) * t - nrm[1] * inset;
          const [x, z] = toWorld(lx, lz);
          return [x, g.top, z];
        };
        // a little more forgiving than a ledge: coming down on the first ~0.9 m of the quay top locks onto its edge
        makeGrind(out.grinds, `${g.id}.edge.${n++}`, 'ledge', surfaceMaterial(g.surface), 0, [p(t0), p(t1)], 0, 0.9);
      }
      runStart = -1;
    };
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lx = a[0] + (b[0] - a[0]) * t + nrm[0] * 0.5;
      const lz = a[1] + (b[1] - a[1]) * t + nrm[1] * 0.5;
      const [x, z] = toWorld(lx, lz);
      const wet = spot.water.some((w) => g.top - w.level >= 0.4 && footprintContains(w.shape, x, z));
      if (wet && runStart < 0) runStart = i;
      else if (!wet) flush(i - 1);
    }
    flush(steps);
  }
}

export function buildColliders(spot: SpotDef): SpotColliders {
  const out: SpotColliders = { solids: [], ramps: [], waters: [], gaps: [], grinds: [], walls: [] };
  for (const w of spot.water) {
    const [minX, minZ, maxX, maxZ] = footprintBounds(w.shape);
    out.waters.push({ id: w.id, shape: w.shape, level: w.level, minX, minZ, maxX, maxZ });
  }
  for (const g of spot.ground) {
    out.solids.push(makeBox(g.id, 'ground', g.surface, g.center[0], g.center[1], g.size[0], g.size[1], g.rot, g.top, g.bottom ?? g.top - 3));
    if (g.visible !== false) addQuayEdges(spot, g, out);
  }
  for (const o of spot.obstacles) {
    switch (o.kind) {
      case 'kicker':
        out.ramps.push(makeRamp(o));
        break;
      case 'rail':
        addRail(o, out);
        break;
      case 'ledge':
        addLedge(o, out);
        break;
      case 'stairs':
        addStairs(o, out);
        break;
      case 'wall':
        addWall(o, out);
        break;
      case 'gap': {
        const [minX, minZ, maxX, maxZ] = footprintBounds(o.shape);
        out.gaps.push({ def: o, minX, minZ, maxX, maxZ });
        break;
      }
    }
  }
  return out;
}
