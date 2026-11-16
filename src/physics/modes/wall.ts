/**
 * Wallride: hit a WallDef face at a shallow angle with speed and the board sticks to it, riding
 * along while it slowly sinks. JUMP pops off away from the wall.
 */
import { wrapPi } from '../../data/geometry';
import type { WallFace } from '../CollisionWorld';
import type { SimCore } from '../SimCore';
import { popSpeed, SIM } from '../tuning';

const PI = Math.PI;

/**
 * Called by the ground and air integrators before they move. Returns true when the step was taken
 * over (wallride started or the rider slammed); false = carry on (velocity may have been bounced).
 */
export function tryWall(c: SimCore, dt: number, fromAir: boolean): boolean {
  const s = c.state;
  const v = s.vel;
  const p = c.probe;
  const ny = s.pos.y + (fromAir ? v.y * dt : 0);
  if (!c.world.probeWall(s.pos.x + v.x * dt, ny, s.pos.z + v.z * dt, p)) return false;
  const w = p.wall as WallFace;
  if (p.dist > SIM.wallContact || p.dist < -0.6) return false;
  const vn = v.x * w.nx + v.z * w.nz;
  if (vn > -0.05) return false;
  // must be coming from the front of the face
  if (c.world.probeWall(s.pos.x, s.pos.y, s.pos.z, c.probe0) && c.probe0.wall === w && c.probe0.dist < -0.25) return false;

  const sp = Math.hypot(v.x, v.z);
  const sinA = sp > 1e-6 ? -vn / sp : 1;
  if (sp >= SIM.wallMinSpeed && sinA <= SIM.wallMaxSin) {
    const along = v.x * w.dx + v.z * w.dz;
    const dir: 1 | -1 = along >= 0 ? 1 : -1;
    if (fromAir) {
      const travelYaw = Math.atan2(w.dx * dir, w.dz * dir);
      const hadTrick = c.tricks.hadTrick;
      const verdict = c.judge(travelYaw, 'wall', w.kind, -vn);
      if (verdict.quality === 'bail') return true;
      const sw = Math.abs(wrapPi(s.boardYaw - travelYaw)) > PI / 2;
      c.bus.emit('sim:land', { quality: verdict.quality, impact: -vn, pos: c.p3(), surface: w.kind, onto: 'wall', hadTrick });
      c.scoreAir(sw, verdict.quality, w.id);
      s.switch = sw;
      c.tricks.reset();
      c.airYawOffset = 0;
    }
    enterWall(c, w, p.u, Math.max(0, p.h), vn, dir, fromAir);
    return true;
  }
  if (sp > SIM.bailSpeed && sinA > SIM.headOnSin) {
    c.bail('collision', Math.min(1, 0.4 + sp / 18));
    return true;
  }
  // too slow or a little too square: bounce off and keep going
  v.x -= 1.3 * vn * w.nx;
  v.z -= 1.3 * vn * w.nz;
  v.x *= 0.75;
  v.z *= 0.75;
  return false;
}

function enterWall(c: SimCore, w: WallFace, u: number, h: number, vn: number, dir: 1 | -1, fromAir: boolean): void {
  const s = c.state;
  const v = s.vel;
  const run = c.wall;
  const from = s.surface;
  run.face = w;
  run.u = u;
  run.h = h;
  run.dir = dir;
  run.vu = Math.abs(v.x * w.dx + v.z * w.dz);
  const push = SIM.wallClimbGain * -vn;
  run.vh = fromAir ? Math.max(-SIM.wallSinkMax, Math.min(4, v.y * 0.5 + push * 0.6)) : SIM.wallClimbBase + push;
  run.time = 0;
  const cosL = 1 / Math.sqrt(1 + w.tanLean * w.tanLean);
  const ws = c.wallState;
  ws.obstacleId = w.id;
  ws.normal.set(w.nx * cosL, w.tanLean * cosL, w.nz * cosL);
  ws.time = 0;
  s.wall = ws;
  s.mode = 'wall';
  s.surface = 'wall';
  s.surfaceNormal.copy(ws.normal);
  s.crouch = 0;
  c.charge = 0;
  c.jumpArmed = false;
  c.spinT = -1;
  c.yawSlip = 0;
  c.bus.emit('sim:wallEnter', { obstacleId: w.id, pos: c.p3() });
  c.bus.emit('sim:surface', { from, to: 'wall', obstacleId: w.id });
}

export function stepWall(c: SimCore, dt: number): void {
  const s = c.state;
  const run = c.wall;
  const w = run.face;
  if (!w) {
    s.mode = 'air';
    return;
  }
  c.rope.update(dt, 1, w.ay);
  const along = (c.rope.ax * w.dx + c.rope.az * w.dz) * run.dir;
  run.vu = Math.max(0, run.vu + (along * 0.5 - SIM.wallDrag) * dt);
  run.vh = Math.max(-SIM.wallSinkMax, run.vh - SIM.wallGravity * dt);
  run.u += run.vu * run.dir * dt;
  run.h += run.vh * dt;
  if (run.h > w.height - 0.05) {
    run.h = w.height - 0.05;
    if (run.vh > 0) run.vh = 0;
  }
  run.time += dt;
  c.wallState.time = run.time;

  const back = run.h * w.tanLean;
  s.pos.set(w.ax + w.dx * run.u - w.nx * back, w.ay + run.h, w.az + w.dz * run.u - w.nz * back);
  s.vel.set(w.dx * run.vu * run.dir, run.vh, w.dz * run.vu * run.dir);
  const yaw = Math.atan2(w.dx * run.dir, w.dz * run.dir);
  s.heading = yaw;
  c.boardDir = yaw;
  s.boardYaw = wrapPi(yaw + (s.switch ? PI : 0));
  s.surfaceY = w.ay;
  // lean into the wall: wall on the rider's right when the normal points to the left of travel
  const wallOnRight = w.nx * -Math.cos(yaw) + w.nz * Math.sin(yaw) < 0;
  s.lean += ((wallOnRight ? 0.8 : -0.8) - s.lean) * Math.min(1, 10 * dt);

  if (c.inp.jump.pressed) {
    leaveWall(c, true);
    return;
  }
  if (run.time >= SIM.wallMaxTime || (run.vh < 0 && run.h <= 0.02) || run.u < 0 || run.u > w.len || run.vu < 1.5) leaveWall(c, false);
}

function leaveWall(c: SimCore, popped: boolean): void {
  const s = c.state;
  const run = c.wall;
  const w = run.face as WallFace;
  const out = popped ? SIM.wallPopOut : 1.6;
  const vx = w.dx * run.vu * run.dir + w.nx * out;
  const vz = w.dz * run.vu * run.dir + w.nz * out;
  const vy = popped ? Math.max(0, run.vh) + popSpeed(c.tune, 0.45) * c.mods.pop * 0.8 : Math.max(0.4, run.vh);
  s.vel.set(vx, vy, vz);
  if (run.h < 0.05) s.pos.y = w.ay + 0.05;
  const yaw = Math.atan2(vx, vz);
  s.boardYaw = wrapPi(yaw + (s.switch ? PI : 0));
  c.boardDir = yaw;
  if (popped) c.bus.emit('sim:pop', { power: 0.45, pos: c.p3(), surface: w.kind });
  c.closeWall(true);
  c.takeoff('wall', w.id, vy);
}
