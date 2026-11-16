/**
 * Shore mask: a distance-field-like texture in world XZ. Each texel stores the distance to the nearest
 * "shore" segment (quay edge, obstacle outline, pool rim…), 0 at the edge → 255 at SHORE_RANGE metres.
 * The water shader turns it into a lapping foam band and a shallow-water tint. Headless (unit-tested).
 */
import { footprintBounds, footprintContains, footprintOutline } from '../../data/geometry';
import type { FoamShape, WaterRegionDef } from '../../types';

/** Metres covered by the 0..1 range of the mask. Must match SHORE_RANGE in the water shader. */
export const SHORE_RANGE = 3;

export interface ShoreMask {
  /** Row-major, `width`×`height`, row 0 = minZ. */
  data: Uint8Array;
  width: number;
  height: number;
  minX: number;
  minZ: number;
  sizeX: number;
  sizeZ: number;
}

export interface ShoreMaskOptions {
  /** Target texel size in metres (default 0.1). */
  texel?: number;
  /** Longest side in texels (default 2048). */
  maxDim?: number;
  /** Total texel budget (default 600 000). */
  maxTexels?: number;
}

/** Union bounds of all regions: [minX, minZ, maxX, maxZ]. */
export function regionsBounds(regions: readonly WaterRegionDef[]): [number, number, number, number] {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const r of regions) {
    const b = footprintBounds(r.shape);
    minX = Math.min(minX, b[0]);
    minZ = Math.min(minZ, b[1]);
    maxX = Math.max(maxX, b[2]);
    maxZ = Math.max(maxZ, b[3]);
  }
  if (!Number.isFinite(minX)) return [0, 0, 1, 1];
  return [minX, minZ, maxX, maxZ];
}

/**
 * Outline segments of the water regions that are real shores: pieces of an edge that border another
 * region at (about) the same level are dropped, so two touching regions do not get a foam line between them.
 * Appends x0,z0,x1,z1 quadruples to `out`.
 */
export function regionShoreSegments(regions: readonly WaterRegionDef[], out: number[] = []): number[] {
  for (const region of regions) {
    const pts = footprintOutline(region.shape);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const nx = dz / len;
      const nz = -dx / len;
      const pieces = Math.max(1, Math.ceil(len));
      let runStart = -1;
      for (let p = 0; p <= pieces; p++) {
        let shore = false;
        if (p < pieces) {
          const t = (p + 0.5) / pieces;
          const mx = a[0] + dx * t;
          const mz = a[1] + dz * t;
          // the side of the edge that is NOT inside this region
          const side = footprintContains(region.shape, mx + nx * 0.15, mz + nz * 0.15) ? -1 : 1;
          const ox = mx + nx * 0.15 * side;
          const oz = mz + nz * 0.15 * side;
          shore = true;
          for (const other of regions) {
            if (other === region || Math.abs(other.level - region.level) > 0.3) continue;
            if (footprintContains(other.shape, ox, oz)) {
              shore = false;
              break;
            }
          }
        }
        if (shore && runStart < 0) runStart = p;
        if (!shore && runStart >= 0) {
          const t0 = runStart / pieces;
          const t1 = p / pieces;
          out.push(a[0] + dx * t0, a[1] + dz * t0, a[0] + dx * t1, a[1] + dz * t1);
          runStart = -1;
        }
      }
    }
  }
  return out;
}

/** Closed outlines of foam shapes → segments (x0,z0,x1,z1 …) appended to `out`. */
export function shapeSegments(shapes: readonly FoamShape[], out: number[] = []): number[] {
  for (const s of shapes) {
    const pts = s.points;
    if (pts.length < 2) continue;
    const n = pts.length === 2 ? 1 : pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.push(a[0], a[1], b[0], b[1]);
    }
  }
  return out;
}

/**
 * Rasterise segments into the mask: exact point-to-segment distance for every texel within
 * SHORE_RANGE of a segment (long segments are cut up so their bounding boxes stay tight).
 */
export function buildShoreMask(bounds: readonly [number, number, number, number], segments: ArrayLike<number>, opts: ShoreMaskOptions = {}): ShoreMask {
  const pad = 0.25;
  const minX = bounds[0] - pad;
  const minZ = bounds[1] - pad;
  const sizeX = Math.max(0.5, bounds[2] - bounds[0] + pad * 2);
  const sizeZ = Math.max(0.5, bounds[3] - bounds[1] + pad * 2);
  const maxDim = opts.maxDim ?? 2048;
  const maxTexels = opts.maxTexels ?? 600000;
  const texel = Math.max(opts.texel ?? 0.1, sizeX / maxDim, sizeZ / maxDim, Math.sqrt((sizeX * sizeZ) / maxTexels));
  const width = Math.max(2, Math.ceil(sizeX / texel));
  const height = Math.max(2, Math.ceil(sizeZ / texel));
  const tx = sizeX / width;
  const tz = sizeZ / height;

  const dist = new Float32Array(width * height).fill(SHORE_RANGE);
  const maxPiece = 8;
  for (let s = 0; s + 3 < segments.length; s += 4) {
    const sx0 = segments[s];
    const sz0 = segments[s + 1];
    const sx1 = segments[s + 2];
    const sz1 = segments[s + 3];
    const len = Math.hypot(sx1 - sx0, sz1 - sz0);
    // axis-aligned segments already have a tight box
    const diagonal = Math.min(Math.abs(sx1 - sx0), Math.abs(sz1 - sz0)) > SHORE_RANGE;
    const pieces = diagonal ? Math.max(1, Math.ceil(len / maxPiece)) : 1;
    for (let p = 0; p < pieces; p++) {
      const x0 = sx0 + ((sx1 - sx0) * p) / pieces;
      const z0 = sz0 + ((sz1 - sz0) * p) / pieces;
      const x1 = sx0 + ((sx1 - sx0) * (p + 1)) / pieces;
      const z1 = sz0 + ((sz1 - sz0) * (p + 1)) / pieces;
      const ix0 = Math.max(0, Math.floor((Math.min(x0, x1) - SHORE_RANGE - minX) / tx));
      const ix1 = Math.min(width - 1, Math.ceil((Math.max(x0, x1) + SHORE_RANGE - minX) / tx));
      const iz0 = Math.max(0, Math.floor((Math.min(z0, z1) - SHORE_RANGE - minZ) / tz));
      const iz1 = Math.min(height - 1, Math.ceil((Math.max(z0, z1) + SHORE_RANGE - minZ) / tz));
      const ex = x1 - x0;
      const ez = z1 - z0;
      const inv = 1 / Math.max(ex * ex + ez * ez, 1e-9);
      for (let iz = iz0; iz <= iz1; iz++) {
        const pz = minZ + (iz + 0.5) * tz - z0;
        const row = iz * width;
        for (let ix = ix0; ix <= ix1; ix++) {
          const px = minX + (ix + 0.5) * tx - x0;
          let t = (px * ex + pz * ez) * inv;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = px - ex * t;
          const qz = pz - ez * t;
          const d = Math.sqrt(qx * qx + qz * qz);
          if (d < dist[row + ix]) dist[row + ix] = d;
        }
      }
    }
  }

  const data = new Uint8Array(width * height);
  const k = 255 / SHORE_RANGE;
  for (let i = 0; i < data.length; i++) data[i] = Math.round(dist[i] * k);
  return { data, width, height, minX, minZ, sizeX, sizeZ };
}

/** Bilinear lookup in metres (CPU twin of the shader lookup; used by tests). */
export function sampleShoreMask(mask: ShoreMask, x: number, z: number): number {
  const u = ((x - mask.minX) / mask.sizeX) * mask.width - 0.5;
  const v = ((z - mask.minZ) / mask.sizeZ) * mask.height - 0.5;
  const x0 = Math.min(mask.width - 1, Math.max(0, Math.floor(u)));
  const z0 = Math.min(mask.height - 1, Math.max(0, Math.floor(v)));
  const x1 = Math.min(mask.width - 1, x0 + 1);
  const z1 = Math.min(mask.height - 1, z0 + 1);
  const fx = Math.min(1, Math.max(0, u - x0));
  const fz = Math.min(1, Math.max(0, v - z0));
  const d = mask.data;
  const a = d[z0 * mask.width + x0] * (1 - fx) + d[z0 * mask.width + x1] * fx;
  const b = d[z1 * mask.width + x0] * (1 - fx) + d[z1 * mask.width + x1] * fx;
  return ((a * (1 - fz) + b * fz) / 255) * SHORE_RANGE;
}
