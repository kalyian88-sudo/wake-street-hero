/** Obstacle dispatcher + gap markers + helpers shared by the preview / sandbox. */
import { BRAND } from '../../config';
import { DEG, footprintBounds, ledgeBox, stairsLayout } from '../../data/geometry';
import type { GapDef, ObstacleDef } from '../../types';
import type { BuildCtx } from '../build';
import { GB } from '../geo';
import { buildKicker } from './kickers';
import { buildLedge } from './ledges';
import { buildRail } from './rails';
import { buildStairs } from './stairs';
import { buildWall } from './walls';

/** Gaps have no geometry. Over solid ground they get a subtle painted take-off / landing marking. */
function buildGap(b: BuildCtx, def: GapDef): void {
  if (def.shape.kind !== 'rect') return;
  const [cx, cz] = def.shape.center;
  const ground = b.terrain.groundAt(cx, cz);
  const water = b.terrain.waterAt(cx, cz);
  if (!ground || (water && ground.top < water.level)) return;
  const [w, d] = def.shape.size;
  const y = ground.top + 0.02;
  const g = new GB();
  g.translate(cx, 0, cz).rotY((def.shape.rot ?? 0) * DEG);
  const n = Math.max(2, Math.round(w / 0.9));
  const sw = w / n;
  for (const sz of [-1, 1]) {
    const z = sz * (d / 2 - 0.22);
    for (let i = 0; i < n; i++) {
      g.color(i % 2 ? 0xf2f2ee : BRAND.colors.red, 0.92);
      const x0 = -w / 2 + i * sw;
      g.quad([x0, y, z + 0.11], [x0 + sw, y, z + 0.11], [x0 + sw, y, z - 0.11], [x0, y, z - 0.11]);
    }
  }
  b.statics.add(g.build(), b.mat('paint'), null, { cast: false });
}

export function buildObstacle(b: BuildCtx, def: ObstacleDef): void {
  switch (def.kind) {
    case 'rail':
      buildRail(b, def);
      break;
    case 'ledge':
      buildLedge(b, def);
      break;
    case 'kicker':
      buildKicker(b, def);
      break;
    case 'wall':
      buildWall(b, def);
      break;
    case 'stairs':
      buildStairs(b, def);
      break;
    case 'gap':
      buildGap(b, def);
      break;
  }
}

export interface ObstacleFocus {
  /** Centre of the obstacle (world). */
  x: number;
  y: number;
  z: number;
  /** Rough radius. */
  r: number;
}

/** Centre + size of an obstacle — used by the preview highlights and the sandbox close-up camera. */
export function obstacleFocus(def: ObstacleDef): ObstacleFocus {
  switch (def.kind) {
    case 'rail': {
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (const p of def.path) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
        minZ = Math.min(minZ, p[2]);
        maxZ = Math.max(maxZ, p[2]);
      }
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2, r: Math.hypot(maxX - minX, maxZ - minZ) / 2 + 0.5 };
    }
    case 'ledge': {
      const bx = ledgeBox(def);
      return { x: bx.center[0], y: bx.top, z: bx.center[2], r: Math.hypot(def.size[0], def.size[2]) / 2 };
    }
    case 'kicker': {
      const a = (def.rot ?? 0) * DEG;
      return { x: def.pos[0] + Math.sin(a) * def.length * 0.5, y: def.pos[1] + def.height * 0.5, z: def.pos[2] + Math.cos(a) * def.length * 0.5, r: Math.hypot(def.width, def.length) / 2 };
    }
    case 'wall':
      return { x: (def.a[0] + def.b[0]) / 2, y: def.a[1] + def.height / 2, z: (def.a[2] + def.b[2]) / 2, r: Math.hypot(def.b[0] - def.a[0], def.b[2] - def.a[2]) / 2 };
    case 'stairs': {
      const l = stairsLayout(def);
      const a = (def.rot ?? 0) * DEG;
      return { x: def.pos[0] + Math.sin(a) * l.length * 0.5, y: (def.pos[1] + l.topY) / 2, z: def.pos[2] + Math.cos(a) * l.length * 0.5, r: Math.hypot(def.width, l.length) / 2 + 0.3 };
    }
    case 'gap': {
      const [x0, z0, x1, z1] = footprintBounds(def.shape);
      return { x: (x0 + x1) / 2, y: 0.3, z: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 };
    }
  }
}
