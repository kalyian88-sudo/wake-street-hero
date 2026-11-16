/**
 * Outlines of every collider for the ?debug hitbox view and the 2-D sim sandbox.
 * Shape conventions (CollisionDebugShape.points is a flat xyz list):
 *   box / poly / ramp / wall / circle → CLOSED loop,   line → OPEN polyline.
 */
import { GAME } from '../../config';
import { footprintOutline, kickerProfile } from '../../data/geometry';
import type { CollisionDebugShape, SpotDef } from '../../types';
import type { SpotColliders } from './shapes';

const COLORS = {
  water: 0x2aa7c9,
  ground: 0x9aa3ad,
  ledge: 0xffb300,
  step: 0xc9a35a,
  pipe: 0xb0b6bf,
  ramp: 0x7ad957,
  rail: 0xe30613,
  wall: 0xb967ff,
  gap: 0xffe14d,
  bounds: 0x5a5f6b,
  winch: 0xffffff,
} as const;

export function collisionDebugShapes(spot: SpotDef, c: SpotColliders): CollisionDebugShape[] {
  const shapes: CollisionDebugShape[] = [];

  const b = spot.bounds;
  shapes.push({
    kind: 'poly',
    color: COLORS.bounds,
    label: 'bounds',
    points: [b.min[0], 0, b.min[1], b.max[0], 0, b.min[1], b.max[0], 0, b.max[1], b.min[0], 0, b.max[1]],
  });

  for (const w of c.waters) {
    const pts: number[] = [];
    for (const [x, z] of footprintOutline(w.shape)) pts.push(x, w.level, z);
    shapes.push({ kind: 'poly', color: COLORS.water, label: w.id, points: pts });
  }

  for (const s of c.solids) {
    const pts: number[] = [];
    for (const [lx, lz] of [
      [-s.hx, -s.hz],
      [s.hx, -s.hz],
      [s.hx, s.hz],
      [-s.hx, s.hz],
    ]) {
      pts.push(s.cx + lx * s.cos + lz * s.sin, s.top, s.cz - lx * s.sin + lz * s.cos);
    }
    shapes.push({ kind: 'box', color: COLORS[s.role], label: s.id, points: pts });
  }

  for (const r of c.ramps) {
    const pts: number[] = [];
    const n = 8;
    const at = (lx: number, t: number): void => {
      const lz = t * r.length;
      pts.push(r.ox + lx * r.cos + lz * r.sin, r.oy + r.height * kickerProfile(r.curve, t), r.oz - lx * r.sin + lz * r.cos);
    };
    for (let i = 0; i <= n; i++) at(-r.hw, i / n);
    for (let i = n; i >= 0; i--) at(r.hw, i / n);
    shapes.push({ kind: 'ramp', color: COLORS.ramp, label: r.id, points: pts });
  }

  for (const g of c.grinds) {
    const pts: number[] = [];
    for (let i = 0; i < g.n; i++) pts.push(g.px[i], g.py[i], g.pz[i]);
    shapes.push({ kind: 'line', color: g.kind === 'ledge' ? COLORS.ledge : COLORS.rail, label: g.id, points: pts });
  }

  for (const w of c.walls) {
    const bx = w.ax + w.dx * w.len;
    const bz = w.az + w.dz * w.len;
    const back = w.height * w.tanLean;
    shapes.push({
      kind: 'wall',
      color: COLORS.wall,
      label: w.id,
      points: [
        w.ax, w.ay, w.az,
        bx, w.ay, bz,
        bx - w.nx * back, w.ay + w.height, bz - w.nz * back,
        w.ax - w.nx * back, w.ay + w.height, w.az - w.nz * back,
      ],
    });
  }

  for (const g of c.gaps) {
    const pts: number[] = [];
    for (const [x, z] of footprintOutline(g.def.shape)) pts.push(x, 0.3, z);
    shapes.push({ kind: 'poly', color: COLORS.gap, label: g.def.id, points: pts });
  }

  // finish circle of every winch point
  for (const wp of spot.winchPoints) {
    const pts: number[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      pts.push(wp.pos[0] + Math.cos(a) * GAME.finishRadius, wp.start[1] + 0.05, wp.pos[2] + Math.sin(a) * GAME.finishRadius);
    }
    shapes.push({ kind: 'circle', color: COLORS.winch, label: `finish:${wp.id}`, points: pts });
  }

  return shapes;
}
