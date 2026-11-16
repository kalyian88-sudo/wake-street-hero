/**
 * Builds ONE merged water mesh for all regions of a spot. Rect regions become a coarse grid (so the
 * gentle vertex swell at waterDetail 2 has something to move), polygons are triangulated as they are.
 * Per-vertex attributes carry the basin look of the region (colours, clarity, caustics, opacity).
 */
import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Sphere, Vector2, Vector3 } from 'three';
import { rotXZ } from '../../data/geometry';
import type { EnvDef, WaterRegionDef } from '../../types';

export interface RegionLook {
  shallow: Color;
  deep: Color;
  /** 0 murky … 1 crystal clear. */
  clarity: number;
  /** 0..1 amount of caustics / visible bottom pattern (pools, fountains). */
  caustics: number;
  /** Basin depth in metres (visual). */
  depth: number;
  /** < 1 = the street / bed shows through (flooded streets, paddies). */
  opacity: number;
  /** Multiplier on the wave strength. */
  waves: number;
  /** Multiplier on shoreline foam. */
  foam: number;
}

const _a = new Color();

/** Region style + env def → concrete look. */
export function regionLook(region: WaterRegionDef, def: EnvDef): RegionLook {
  const clarity = def.waterClarity ?? 0.5;
  const shallow = new Color(def.waterShallow);
  const deep = new Color(def.waterDeep);
  const look: RegionLook = { shallow, deep, clarity, caustics: 0, depth: region.depth ?? 1.5, opacity: 1, waves: 1, foam: 1 };
  switch (region.style ?? 'canal') {
    case 'pool':
      shallow.set(region.tint ?? 0x3fd0d8);
      deep.copy(shallow).lerp(_a.set(0x0a5a8c), 0.72);
      look.clarity = Math.max(clarity, 0.88);
      look.caustics = 1;
      look.waves = 0.55;
      look.foam = 0.35;
      break;
    case 'fountain':
      shallow.set(region.tint ?? 0x62d2cc);
      deep.copy(shallow).lerp(_a.set(0x17708c), 0.65);
      look.clarity = Math.max(clarity, 0.8);
      look.caustics = 0.75;
      look.waves = 0.85;
      look.foam = 0.8;
      break;
    case 'flood':
      if (region.tint !== undefined) shallow.set(region.tint);
      else shallow.lerp(_a.set(0x8f8b7c), 0.45);
      deep.lerp(_a.set(0x3d3f3c), 0.4);
      look.clarity = Math.max(clarity, 0.6);
      look.opacity = 0.6;
      look.waves = 0.5;
      look.foam = 0.5;
      look.depth = region.depth ?? 0.25;
      break;
    case 'paddy':
      shallow.set(region.tint ?? 0x77905a);
      deep.set(0x34422a);
      look.clarity = Math.min(clarity, 0.4);
      look.opacity = 0.9;
      look.waves = 0.35;
      look.foam = 0.3;
      look.depth = region.depth ?? 0.4;
      break;
    case 'river':
      if (region.tint !== undefined) shallow.set(region.tint);
      else shallow.lerp(_a.set(0x5f8f7a), 0.2);
      look.clarity = clarity * 0.9;
      look.waves = 1.25;
      break;
    default:
      if (region.tint !== undefined) shallow.set(region.tint);
  }
  return look;
}

export interface WaterGeometry {
  geometry: BufferGeometry;
  /** Any region needs alpha blending. */
  blend: boolean;
  /** Any region shows a bottom pattern with caustics. */
  bottom: boolean;
}

/** Grid cell size (m) for rect regions. */
const CELL = 2.5;
const MAX_CELLS = 96;

export function buildWaterGeometry(regions: readonly WaterRegionDef[], def: EnvDef): WaterGeometry {
  const pos: number[] = [];
  const shallow: number[] = [];
  const deep: number[] = [];
  const style: number[] = [];
  const index: number[] = [];
  let blend = false;
  let bottom = false;

  for (const region of regions) {
    const look = regionLook(region, def);
    blend ||= look.opacity < 0.999;
    bottom ||= look.caustics > 0;
    const base = pos.length / 3;
    const pushVertex = (x: number, z: number): void => {
      pos.push(x, region.level, z);
      shallow.push(look.shallow.r, look.shallow.g, look.shallow.b, look.waves);
      deep.push(look.deep.r, look.deep.g, look.deep.b, look.foam);
      style.push(look.clarity, look.caustics, look.depth, look.opacity);
    };
    const fp = region.shape;
    if (fp.kind === 'rect') {
      const nx = Math.min(MAX_CELLS, Math.max(1, Math.ceil(fp.size[0] / CELL)));
      const nz = Math.min(MAX_CELLS, Math.max(1, Math.ceil(fp.size[1] / CELL)));
      for (let iz = 0; iz <= nz; iz++) {
        for (let ix = 0; ix <= nx; ix++) {
          const lx = (ix / nx - 0.5) * fp.size[0];
          const lz = (iz / nz - 0.5) * fp.size[1];
          const [x, z] = rotXZ(lx, lz, fp.rot ?? 0);
          pushVertex(fp.center[0] + x, fp.center[1] + z);
        }
      }
      const row = nx + 1;
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const a = base + iz * row + ix;
          // counter-clockwise seen from above (+Y)
          index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
        }
      }
    } else if (fp.points.length >= 3) {
      const contour = fp.points.map((p) => new Vector2(p[0], p[1]));
      const tris = ShapeUtils.triangulateShape(contour, []);
      for (const p of contour) pushVertex(p.x, p.y);
      for (const t of tris) {
        // make every triangle face up regardless of the polygon winding
        const [i0, i1, i2] = t;
        const a = contour[i0];
        const b = contour[i1];
        const c = contour[i2];
        const up = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);
        if (up >= 0) index.push(base + i0, base + i1, base + i2);
        else index.push(base + i0, base + i2, base + i1);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('aShallow', new BufferAttribute(new Float32Array(shallow), 4));
  geometry.setAttribute('aDeep', new BufferAttribute(new Float32Array(deep), 4));
  geometry.setAttribute('aStyle', new BufferAttribute(new Float32Array(style), 4));
  const vertexCount = pos.length / 3;
  geometry.setIndex(new BufferAttribute(vertexCount > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1));
  if (vertexCount > 0) geometry.computeBoundingBox();
  if (geometry.boundingBox) {
    // a little head-room for the vertex swell
    geometry.boundingBox.min.y -= 0.2;
    geometry.boundingBox.max.y += 0.2;
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
  } else {
    geometry.boundingSphere = new Sphere(new Vector3(), 0);
  }
  return { geometry, blend, bottom };
}
