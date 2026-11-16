/**
 * Stairs: steps and grindable handrails straight from stairsLayout(), plus an optional film of
 * running water over the treads.
 */
import { DEG, stairsLayout, toLocalXZ } from '../../data/geometry';
import type { RailDef, StairsDef } from '../../types';
import { ALGAE, algaeWeight, wetShade } from '../build';
import type { BuildCtx } from '../build';
import { GB } from '../geo';
import { surfaceKey } from '../materials';
import { buildRail } from './rails';

export function buildStairs(b: BuildCtx, def: StairsDef): void {
  const layout = stairsLayout(def);
  const rot = (def.rot ?? 0) * DEG;
  const W = def.width;
  const midX = def.pos[0] + Math.sin(rot) * layout.length * 0.5;
  const midZ = def.pos[2] + Math.cos(rot) * layout.length * 0.5;
  const level = b.terrain.waterLevelNear(midX, midZ, 1.5);
  const inWater = level !== null && level > def.pos[1] - 0.6;
  const yB = inWater ? def.pos[1] - 1.0 : def.pos[1] - 0.5;

  const g = new GB();
  const film = new GB();
  g.translate(def.pos[0], 0, def.pos[2]).rotY(rot);
  film.translate(def.pos[0], 0, def.pos[2]).rotY(rot);
  const n = def.steps;
  for (let i = 0; i < n; i++) {
    const z0 = i * def.stepD;
    const z1 = (i + 1) * def.stepD;
    const top = def.pos[1] + (i + 1) * def.stepH;
    const prev = def.pos[1] + i * def.stepH;
    g.color(0xffffff, 1.03);
    // tread with a slightly proud nosing
    g.quad([-W / 2, top, z1], [W / 2, top, z1], [W / 2, top, z0 - 0.02], [-W / 2, top, z0 - 0.02]);
    g.color(0xffffff, 0.86);
    g.quad([W / 2, top - 0.035, z0 - 0.02], [-W / 2, top - 0.035, z0 - 0.02], [-W / 2, top, z0 - 0.02], [W / 2, top, z0 - 0.02]);
    // riser
    g.color(0xffffff, 0.78);
    g.quad([W / 2, i === 0 ? yB : prev, z0], [-W / 2, i === 0 ? yB : prev, z0], [-W / 2, top - 0.035, z0], [W / 2, top - 0.035, z0]);
    // cheeks
    g.color(0xffffff, 0.9);
    g.quad([W / 2, yB, z1], [W / 2, yB, z0], [W / 2, top, z0], [W / 2, top, z1]);
    g.quad([-W / 2, yB, z0], [-W / 2, yB, z1], [-W / 2, top, z1], [-W / 2, top, z0]);
    if (def.wet) {
      const e = 0.007;
      film.white();
      film.quadUV([-W / 2 + 0.03, top + e, z1], [W / 2 - 0.03, top + e, z1], [W / 2 - 0.03, top + e, z0 - 0.02 - e], [-W / 2 + 0.03, top + e, z0 - 0.02 - e], 0, (n - i) * 0.4, W, (n - i) * 0.4 + 0.3);
      film.quadUV([W / 2 - 0.03, prev + e, z0 - 0.02 - e], [-W / 2 + 0.03, prev + e, z0 - 0.02 - e], [-W / 2 + 0.03, top + e, z0 - 0.02 - e], [W / 2 - 0.03, top + e, z0 - 0.02 - e], 0, (n - i) * 0.4 + 0.3, W, (n - i) * 0.4 + 0.4);
    }
  }
  // back of the flight
  const topY = layout.topY;
  g.color(0xffffff, 0.85);
  g.quad([-W / 2, yB, layout.length], [W / 2, yB, layout.length], [W / 2, topY, layout.length], [-W / 2, topY, layout.length]);
  if (inWater && level !== null) {
    g.shadeBy(0, (_x, y) => wetShade(y, level) * (def.wet ? 0.9 : 1));
    g.tintBy(0, ALGAE, (_x, y) => algaeWeight(y, level));
  } else if (def.wet) g.shadeBy(0, () => 0.85);
  b.statics.add(g.build(), b.mat(def.wet && def.surface === 'concrete' ? 'wetConcrete' : surfaceKey(def.surface)), null, { cast: true });

  if (!film.empty) {
    const mat = b.mat('waterFilm');
    b.statics.add(film.build(), mat, null, { cast: false, receive: false, noChunk: true });
    const nm = (mat as unknown as { normalMap?: { offset: { y: number } } | null }).normalMap;
    if (nm) b.updaters.push((dt) => (nm.offset.y = (nm.offset.y + dt * 0.55) % 1));
  }

  // handrails: grind lines from the layout, posts standing on the steps
  const floor = (x: number, z: number): number | null => {
    const [, lz] = toLocalXZ(def.pos, def.rot, x, z);
    if (lz < 0) return b.terrain.isOpenWater(x, z) ? null : b.terrain.heightAt(x, z);
    if (lz >= layout.length) return topY;
    return def.pos[1] + (Math.floor(lz / def.stepD) + 1) * def.stepH;
  };
  layout.rails.forEach((path, i) => {
    const rail: RailDef = { kind: 'rail', id: `${def.id}:rail${i}`, path, style: 'handrail', radius: 0.03, material: 'steel', supports: 'posts' };
    buildRail(b, rail, { floor });
  });

  if (inWater && level !== null) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const pt = (lx: number, lz: number): [number, number] => [def.pos[0] + lx * c + lz * s, def.pos[2] - lx * s + lz * c];
    b.foam.push({ level, points: [pt(-W / 2, 0), pt(W / 2, 0), pt(W / 2, layout.length), pt(-W / 2, layout.length)] });
  }
}
