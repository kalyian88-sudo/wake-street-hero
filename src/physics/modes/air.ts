/**
 * Airborne: ballistic flight with a floaty apex, rope still pulling, tricks, and the three ways
 * it can end — touchdown on a surface, lock onto a rail, or a wall.
 */
import { wrapPi } from '../../data/geometry';
import type { GrindLine } from '../CollisionWorld';
import type { SimCore } from '../SimCore';
import { gravityAt, SIM } from '../tuning';
import { alignment, lockRail, railSurface, remaining } from './rail';
import { tryWall } from './wall';

const PI = Math.PI;
/** In the air the board clears edges up to this much above it (clipping a coping still lands on top). */
const AIR_STEP = 0.2;

export function stepAir(c: SimCore, dt: number): void {
  const s = c.state;
  const a = s.air;
  const v = s.vel;
  const inp = c.inp;

  c.rope.update(dt, SIM.airRopeGain, s.surfaceY);

  // ── forces ──
  v.y -= gravityAt(v.y) * dt;
  const dragK = Math.max(0, 1 - SIM.airDrag * dt);
  v.x = (v.x + c.rope.ax * dt) * dragK;
  v.z = (v.z + c.rope.az * dt) * dragK;
  const sp = Math.hypot(v.x, v.z);
  if (!inp.trick.down && !inp.grab.down && Math.abs(inp.steer) > 0.15 && sp > 1) {
    // rider's right of travel = (−cos h, sin h) = (−vz, vx)/|v|
    const k = (inp.steer * SIM.airControl * dt) / sp;
    const rx = -v.z * k;
    const rz = v.x * k;
    v.x += rx;
    v.z += rz;
  }

  // ── tricks ──
  c.tricks.update(dt, inp);
  c.airYawOffset *= Math.max(0, 1 - 9 * dt);
  s.boardYaw = wrapPi(a.takeoffYaw + a.spin + c.airYawOffset);
  a.time += dt;

  // ── walls, then solids ──
  if (c.wallCooldown <= 0 && c.world.walls.length > 0 && tryWall(c, dt, true)) return;
  const prevY = s.pos.y;
  if (!c.moveXZ(dt, prevY, AIR_STEP, true)) return;
  s.pos.y = prevY + v.y * dt;
  if (!c.keepInBounds(dt)) return;
  c.trackGaps();

  // ── rails: come down onto a grind line ──
  if (a.time > 0.1 && sp >= SIM.railMinSpeed) {
    const skip = c.relockT > 0 ? c.relockLine : -1;
    const g = c.grind;
    if (c.world.nearestGrind(s.pos.x, s.pos.y, s.pos.z, -SIM.railSnapAbove, SIM.railSnapBelow, 0, skip, g)) {
      const line = g.line as GrindLine;
      const dir = alignment(c, line, g.seg);
      // the BOARD may be sideways (boardslide entry) but the travel direction has to follow the rail
      const slope = ((line.py[g.seg + 1] - line.py[g.seg]) / Math.hypot(line.px[g.seg + 1] - line.px[g.seg], line.pz[g.seg + 1] - line.pz[g.seg])) * (dir || 1);
      const rise = v.y - sp * slope;
      if (dir !== 0 && rise <= SIM.railMaxRise && prevY >= g.y - SIM.railSnapBelow - 0.05 && remaining(line, g.seg, g.t, dir) > 0.6) {
        landOnRail(c, line, dir, -rise);
        return;
      }
    }
  }

  // ── ground ──
  const smp = c.world.sampleInto(c.smp, s.pos.x, s.pos.z, Math.max(prevY, s.pos.y), AIR_STEP);
  if (s.pos.y <= smp.y) {
    c.touchdown(smp);
    return;
  }
  s.surfaceY = smp.y;
  a.height = s.pos.y - smp.y;
  if (a.height > a.peak) a.peak = a.height;
}

function landOnRail(c: SimCore, line: GrindLine, dir: 1 | -1, impact: number): void {
  const s = c.state;
  const g = c.grind;
  const i = g.seg;
  const tanYaw = Math.atan2((line.px[i + 1] - line.px[i]) * dir, (line.pz[i + 1] - line.pz[i]) * dir);
  const hadTrick = c.tricks.hadTrick;
  const surface = railSurface(line);
  const verdict = c.judge(tanYaw, 'rail', surface, Math.max(0, impact));
  if (verdict.quality === 'bail') return;
  // the grind hit in c.grind is still valid: judge() does not touch it
  const rel = Math.abs(wrapPi(s.boardYaw - tanYaw));
  c.bus.emit('sim:land', { quality: verdict.quality, impact: Math.max(0, impact), pos: { x: g.x, y: g.y, z: g.z }, surface, onto: 'rail', hadTrick });
  c.scoreAir(rel >= (PI * 3) / 4, verdict.quality, line.id);
  s.vel.x *= verdict.speedKeep;
  s.vel.z *= verdict.speedKeep;
  lockRail(c, dir, verdict.quality, true);
  c.tricks.reset();
  c.airYawOffset = 0;
}
