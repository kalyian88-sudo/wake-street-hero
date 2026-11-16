/**
 * Cheap height / water queries over the spot data (visual side only — the sim has its own collision world).
 * Used to drape the rope and the line preview, to find waterfront edges and to seat props.
 */
import { footprintBounds, footprintContains, toLocalXZ } from '../data/geometry';
import type { GroundDef, SpotDef, WaterRegionDef } from '../types';

export class Terrain {
  private readonly waterBounds: [number, number, number, number][];
  constructor(readonly spot: SpotDef) {
    this.waterBounds = spot.water.map((w) => footprintBounds(w.shape));
  }

  /** Water region containing the point (ignores ground on top of it). */
  waterAt(x: number, z: number): WaterRegionDef | null {
    const ws = this.spot.water;
    for (let i = 0; i < ws.length; i++) {
      const b = this.waterBounds[i];
      if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      if (footprintContains(ws[i].shape, x, z)) return ws[i];
    }
    return null;
  }

  /** Highest ground box under the point, or null. */
  groundAt(x: number, z: number): GroundDef | null {
    let best: GroundDef | null = null;
    const gs = this.spot.ground;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      const [lx, lz] = toLocalXZ(g.center, g.rot, x, z);
      if (Math.abs(lx) <= g.size[0] / 2 && Math.abs(lz) <= g.size[1] / 2 && (!best || g.top > best.top)) best = g;
    }
    return best;
  }

  /** Height of whatever is visible from above at (x, z): ground top, water surface or the base. */
  heightAt(x: number, z: number): number {
    let h = this.spot.base.level;
    const g = this.groundAt(x, z);
    if (g && g.top > h) h = g.top;
    const w = this.waterAt(x, z);
    if (w && w.level > h) h = w.level;
    return h;
  }

  /** True when the point is open water (a water region with no ground poking through it). */
  isOpenWater(x: number, z: number): boolean {
    const w = this.waterAt(x, z);
    if (!w) return false;
    const g = this.groundAt(x, z);
    return !g || g.top < w.level;
  }

  /** Water level near a point (searches a small cross), or null when dry. */
  waterLevelNear(x: number, z: number, r = 0.6): number | null {
    const w = this.waterAt(x, z) ?? this.waterAt(x + r, z) ?? this.waterAt(x - r, z) ?? this.waterAt(x, z + r) ?? this.waterAt(x, z - r);
    return w ? w.level : null;
  }
}
