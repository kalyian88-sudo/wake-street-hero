/**
 * Ground boxes, quay walls with a wet / algae band at the waterline, waterfront trims and the bed
 * under the water. Everything goes through the static batcher (merged per material, z-chunked).
 */
import { Matrix4, ShapeUtils, Vector2, Vector3 } from 'three';
import { DEG, footprintBounds, footprintOutline } from '../data/geometry';
import type { GroundDef, SurfaceKind } from '../types';
import { ALGAE, algaeWeight, wetShade } from './build';
import type { BuildCtx } from './build';
import { GB } from './geo';
import { surfaceKey } from './materials';

const SLICE = 16;
const _p = new Vector3();

/** Material of the vertical faces under a walking surface. */
function wallKey(kind: SurfaceKind): string {
  switch (kind) {
    case 'stone':
      return 'stone';
    case 'tile':
      return 'tile';
    case 'wood':
      return 'wood';
    case 'sand':
      return 'sand';
    case 'metal':
      return 'paintedMetal';
    default:
      return 'concrete';
  }
}

function sliceCount(len: number): number {
  return Math.max(1, Math.ceil(len / SLICE));
}

export function buildGround(b: BuildCtx): void {
  const { spot, terrain } = b;
  const tops = new Map<string, GB>();
  const walls = new Map<string, GB>();
  const trims = new Map<string, GB>();
  const get = (map: Map<string, GB>, key: string): GB => {
    let g = map.get(key);
    if (!g) map.set(key, (g = new GB()));
    return g;
  };
  const frame = new Matrix4();
  const rotM = new Matrix4();

  spot.ground.forEach((g: GroundDef, gi: number) => {
    if (g.visible === false) return;
    const w = g.size[0];
    const d = g.size[1];
    const top = g.top + gi * 0.0015;
    const bottom = Math.max(g.bottom ?? g.top - 3, spot.base.level - 0.2);
    const rot = (g.rot ?? 0) * DEG;

    // ── top ──
    const tg = get(tops, surfaceKey(g.surface));
    tg.reset().translate(g.center[0], 0, g.center[1]).rotY(rot);
    const nx = sliceCount(w);
    const nz = sliceCount(d);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x0 = -w / 2 + (w * i) / nx;
        const x1 = -w / 2 + (w * (i + 1)) / nx;
        const z0 = -d / 2 + (d * j) / nz;
        const z1 = -d / 2 + (d * (j + 1)) / nz;
        tg.quad([x0, top, z1], [x1, top, z1], [x1, top, z0], [x0, top, z0]);
      }
    }

    // ── sides + trims, edge by edge ──
    const wg = get(walls, wallKey(g.surface));
    const edges: { angle: number; ox: number; oz: number; len: number }[] = [
      { angle: 0, ox: w / 2, oz: 0, len: d },
      { angle: Math.PI, ox: -w / 2, oz: 0, len: d },
      { angle: -Math.PI / 2, ox: 0, oz: d / 2, len: w },
      { angle: Math.PI / 2, ox: 0, oz: -d / 2, len: w },
    ];
    for (const e of edges) {
      frame.makeTranslation(g.center[0], 0, g.center[1]);
      frame.multiply(rotM.makeRotationY(rot));
      frame.multiply(rotM.makeTranslation(e.ox, 0, e.oz));
      frame.multiply(rotM.makeRotationY(e.angle));
      const n = Math.max(1, Math.ceil(e.len / 2));
      const seg = e.len / n;
      // classify every 2 m segment by what lies just outside it
      const water: (number | null)[] = [];
      const floor: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = -e.len / 2 + (i + 0.5) * seg;
        _p.set(0.3, 0, t).applyMatrix4(frame);
        const og = terrain.groundAt(_p.x, _p.z);
        const ow = terrain.waterAt(_p.x, _p.z);
        const ogTop = og && og !== g ? og.top : -Infinity;
        floor.push(Math.max(bottom, ogTop));
        water.push(ow && ow.level > ogTop && ow.level < top + 0.01 && ow.level > bottom ? ow.level : null);
      }
      wg.reset().mul(frame);
      const v0 = wg.vertexCount;
      let i = 0;
      while (i < n) {
        // merge consecutive segments with the same classification (max SLICE metres)
        let j = i + 1;
        while (j < n && water[j] === water[i] && floor[j] === floor[i] && (j - i) * seg < SLICE) j++;
        const t0 = -e.len / 2 + i * seg;
        const t1 = -e.len / 2 + j * seg;
        const lvl = water[i];
        const y0 = lvl !== null ? Math.max(floor[i], lvl - 2.2) : floor[i];
        if (y0 < top - 0.01) {
          const ys = lvl !== null ? [y0, lvl - 0.28, lvl + 0.06, lvl + 0.42, top].filter((y, k, a) => y >= y0 && y <= top && (k === 0 || y > a[k - 1] + 1e-3)) : [y0, top];
          for (let k = 0; k < ys.length - 1; k++) {
            const a = wg.vertexCount;
            wg.quad([0, ys[k], t1], [0, ys[k], t0], [0, ys[k + 1], t0], [0, ys[k + 1], t1]);
            if (lvl !== null) {
              const s0 = wetShade(ys[k], lvl);
              const s1 = wetShade(ys[k + 1], lvl);
              wg.shade(a, s0);
              wg.shade(a + 1, s0);
              wg.shade(a + 2, s1);
              wg.shade(a + 3, s1);
            }
          }
        }
        i = j;
      }
      // algae tint around the waterline (uses world y of the emitted vertices)
      const lvlAny = water.find((x) => x !== null);
      if (lvlAny !== undefined && lvlAny !== null) wg.tintBy(v0, ALGAE, (_x, y) => algaeWeight(y, lvlAny));

      // waterfront runs → trim
      const trim = g.trim ?? 'none';
      if (trim !== 'none') {
        let s = 0;
        while (s < n) {
          if (water[s] === null) {
            s++;
            continue;
          }
          let t = s;
          while (t < n && water[t] !== null) t++;
          buildTrim(get(trims, trimKey(trim)), frame, trim, -e.len / 2 + s * seg, -e.len / 2 + t * seg, top, b);
          s = t;
        }
      }
    }
  });

  for (const [key, g] of tops) if (!g.empty) b.statics.add(g.build(), b.mat(key), null, { cast: false });
  for (const [key, g] of walls) if (!g.empty) b.statics.add(g.build(), b.mat(key), null, { cast: false });
  for (const [key, g] of trims) if (!g.empty) b.statics.add(g.build(), b.mat(key), null, { cast: true });

  buildBeds(b);

  // foam where ground meets water
  for (const g of spot.ground) {
    const outline = footprintOutline({ kind: 'rect', center: g.center, size: g.size, rot: g.rot });
    const [minX, minZ, maxX, maxZ] = footprintBounds({ kind: 'rect', center: g.center, size: g.size, rot: g.rot });
    for (const wr of spot.water) {
      if (wr.level > g.top + 0.3 || wr.level < (g.bottom ?? g.top - 3)) continue;
      const wb = footprintBounds(wr.shape);
      if (maxX < wb[0] - 0.1 || minX > wb[2] + 0.1 || maxZ < wb[1] - 0.1 || minZ > wb[3] + 0.1) continue;
      b.foam.push({ points: outline, level: wr.level });
    }
  }
}

function trimKey(trim: NonNullable<GroundDef['trim']>): string {
  switch (trim) {
    case 'brick':
      return 'brick';
    case 'bamboo':
      return 'bamboo';
    default:
      return 'granite';
  }
}

/** Trim along one waterfront run. Frame: local +X = outwards (towards the water), +Z = along the edge. */
function buildTrim(g: GB, frame: Matrix4, trim: NonNullable<GroundDef['trim']>, t0: number, t1: number, top: number, b: BuildCtx): void {
  g.reset().mul(frame);
  const len = t1 - t0;
  const n = sliceCount(len);
  for (let i = 0; i < n; i++) {
    const a = t0 + (len * i) / n;
    const c = t0 + (len * (i + 1)) / n;
    const mid = (a + c) / 2;
    const l = c - a;
    const ends = (i === 0 ? 'z' : '') + (i === n - 1 ? 'Z' : '');
    const skip = 'y' + (i === 0 ? '' : 'z') + (i === n - 1 ? '' : 'Z');
    void ends;
    if (trim === 'kerb') {
      g.color(0xb9b2a6, 0.96 + (i % 2) * 0.05);
      g.chamferBox(-0.13, top, mid, 0.34, 0.15, l, 0.03, skip);
    } else if (trim === 'coping') {
      g.color(0xe6e0d2);
      g.chamferBox(-0.11, top, mid, 0.36, 0.06, l, 0.025, skip);
    } else if (trim === 'granite') {
      // solid embankment parapet with a wider cap and pedestals
      g.color(0xa9a39c);
      g.boxB(-0.22, top, mid, 0.4, 0.5, l, skip);
      g.color(0xb7b1a9);
      g.chamferBox(-0.22, top + 0.5, mid, 0.52, 0.12, l, 0.03, skip);
    } else if (trim === 'brick') {
      g.white();
      g.boxB(-0.26, top, mid, 0.52, 0.035, l, skip);
    } else if (trim === 'bamboo') {
      g.color(0xd8c98a);
      g.tube(
        [
          [-0.06, top + 0.07, a],
          [-0.06, top + 0.07, c],
        ],
        0.05,
        6,
        { caps: 'flat' },
      );
    }
  }
  if (trim === 'granite') {
    const step = 6;
    const k = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= k; i++) {
      const z = t0 + (len * i) / k;
      g.color(0xb7b1a9);
      g.chamferBox(-0.22, top, z, 0.62, 0.8, 0.62, 0.05);
    }
  } else if (trim === 'bamboo') {
    const k = Math.max(1, Math.round(len / 1.4));
    g.color(0xc9b676);
    for (let i = 0; i <= k; i++) {
      const z = t0 + (len * i) / k;
      g.cyl(-0.06, top - 0.6, z + 0.07, 0.035, 0.035, 0.85, 6, true);
    }
  }
  void b;
}

/** Bed under the water: a dark base plane + raised beds of pools / fountains. */
function buildBeds(b: BuildCtx): void {
  const { spot } = b;
  const key = surfaceKey(spot.base.surface);
  const g = new GB();
  const m = 80;
  const x0 = spot.bounds.min[0] - m;
  const x1 = spot.bounds.max[0] + m;
  const z0 = spot.bounds.min[1] - m;
  const z1 = spot.bounds.max[1] + m;
  g.color(0x4a5a52, 0.5);
  const nz = sliceCount(z1 - z0);
  for (let j = 0; j < nz; j++) {
    const a = z0 + ((z1 - z0) * j) / nz;
    const c = z0 + ((z1 - z0) * (j + 1)) / nz;
    g.quad([x0, spot.base.level, c], [x1, spot.base.level, c], [x1, spot.base.level, a], [x0, spot.base.level, a]);
  }
  for (const w of spot.water) {
    const bed = w.level - (w.depth ?? 1.5);
    if (Math.abs(bed - spot.base.level) < 0.05) continue;
    const pts = footprintOutline(w.shape);
    const faces = ShapeUtils.triangulateShape(
      pts.map((p) => new Vector2(p[0], p[1])),
      [],
    );
    const pool = w.style === 'pool' || w.style === 'fountain';
    if (pool) g.color(w.tint ?? 0x8fd0d8, 0.9);
    else g.color(0x4a5a52, 0.5);
    for (const f of faces) {
      const pa = pts[f[0]];
      const pb = pts[f[1]];
      const pc = pts[f[2]];
      // orient upwards
      const up = (pb[1] - pa[1]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[1] - pa[1]) > 0;
      if (up) g.tri([pa[0], bed, pa[1]], [pb[0], bed, pb[1]], [pc[0], bed, pc[1]]);
      else g.tri([pa[0], bed, pa[1]], [pc[0], bed, pc[1]], [pb[0], bed, pb[1]]);
    }
  }
  b.statics.add(g.build(), b.mat(key), null, { cast: false, receive: false });
}
