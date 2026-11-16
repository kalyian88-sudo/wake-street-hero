/**
 * Grinding: rails, pipes, stair handrails and ledge edges. The board is locked to a polyline,
 * the player keeps state.rail.balance inside ±1 and can change stance, press and pop off.
 */
import { damp, DEG, wrapPi } from '../../data/geometry';
import type { LandingQuality, RailStance, SurfaceKind } from '../../types';
import type { GrindLine } from '../CollisionWorld';
import type { SimCore } from '../SimCore';
import { gravityAt, popSpeed, SIM, TRICK } from '../tuning';

const PI = Math.PI;
const HALF = PI / 2;

const MATERIAL_SURFACE: Record<GrindLine['material'], SurfaceKind> = { metal: 'metal', stone: 'stone', wood: 'wood', plastic: 'tile' };

export function railSurface(line: GrindLine): SurfaceKind {
  return MATERIAL_SURFACE[line.material];
}

/** Low rail next to a board riding roughly along it: hop on. Uses c.grind as scratch. */
export function tryLockRailFromGround(c: SimCore): boolean {
  const s = c.state;
  const v = s.vel;
  const sp = Math.hypot(v.x, v.z);
  if (sp < SIM.railMinSpeed) return false;
  const skip = c.relockT > 0 ? c.relockLine : -1;
  const g = c.grind;
  // look a little ahead so the hop starts before the board would hit the obstacle's face
  if (!c.world.nearestGrind(s.pos.x + (v.x / sp) * 0.3, s.surfaceY, s.pos.z + (v.z / sp) * 0.3, -0.06, SIM.railAutoHeight, 0, skip, g)) return false;
  const dir = alignment(c, g.line as GrindLine, g.seg);
  if (dir === 0) return false;
  if (remaining(g.line as GrindLine, g.seg, g.t, dir) < 0.9) return false;
  lockRail(c, dir, 'clean', false);
  return true;
}

/** +1 / −1 = travelling along / against the segment within the alignment cone, 0 = too sideways. */
export function alignment(c: SimCore, line: GrindLine, seg: number): 1 | -1 | 0 {
  const v = c.state.vel;
  const tx = line.px[seg + 1] - line.px[seg];
  const tz = line.pz[seg + 1] - line.pz[seg];
  const len = Math.hypot(tx, tz);
  const sp = Math.hypot(v.x, v.z);
  if (len < 1e-6 || sp < 1e-6) return 0;
  const cos = (v.x * tx + v.z * tz) / (len * sp);
  if (Math.abs(cos) < SIM.railAlign) return 0;
  return cos >= 0 ? 1 : -1;
}

/** Metres of rail left ahead. */
export function remaining(line: GrindLine, seg: number, t: number, dir: 1 | -1): number {
  const at = line.cum[seg] + t * line.segLen[seg];
  return dir > 0 ? line.total - at : at;
}

/**
 * Lock onto the grind point in c.grind. From the air the board may land straight (50-50) or
 * sideways (boardslide / lipslide); from the ground it hops on in a 50-50.
 */
export function lockRail(c: SimCore, dir: 1 | -1, quality: LandingQuality, fromAir: boolean): void {
  const s = c.state;
  const run = c.rail;
  const g = c.grind;
  const line = g.line as GrindLine;
  const from = s.surface;
  const i = g.seg;
  const sx = line.px[i + 1] - line.px[i];
  const sy = line.py[i + 1] - line.py[i];
  const sz = line.pz[i + 1] - line.pz[i];
  const len = line.segLen[i];
  const tx = (sx / len) * dir;
  const ty = (sy / len) * dir;
  const tz = (sz / len) * dir;
  const tanYaw = Math.atan2(tx, tz);
  const v = s.vel;
  const sp = Math.hypot(v.x, v.z);
  const hl = Math.hypot(tx, tz) || 1;
  const along = (v.x * tx + v.z * tz) / hl;

  run.line = line;
  run.seg = i;
  run.t = g.t;
  run.dir = dir;
  run.speed = Math.max(SIM.railMinSpeed, along);
  run.distance = 0;
  run.pressTime = 0;
  run.stances.length = 0;
  run.offX = s.pos.x - g.x;
  run.offY = s.pos.y - g.y;
  run.offZ = s.pos.z - g.z;
  run.blend = 1;
  run.blendTime = fromAir ? 0.07 : SIM.railHopTime;
  run.noise = 0;
  run.noiseTarget = c.rng() * 2 - 1;
  run.noiseT = 0;
  run.quality = quality;

  let stance: RailStance = 'fifty';
  let target = 0;
  if (fromAir) {
    const rel = wrapPi(s.boardYaw - tanYaw);
    const a = Math.abs(rel);
    if (a > 45 * DEG && a < 135 * DEG) {
      stance = rel > 0 ? 'boardslide' : 'lipslide';
      target = rel > 0 ? HALF : -HALF;
    } else s.switch = a >= 135 * DEG;
  }
  run.stanceYaw = wrapPi(s.boardYaw - (tanYaw + (s.switch ? PI : 0)));
  run.stanceYawTarget = target;
  run.stances.push(stance);

  // entry error tips the balance: coming in from one side / at an angle
  // (balance > 0 = towards the rider's right of travel; right = (−tz, tx))
  const side = tx * run.offZ - tz * run.offX;
  const sinA = sp > 1e-6 ? (tx * v.z - tz * v.x) / (hl * sp) : 0;
  let b0 = sinA * 0.45 - (side / line.snap) * 0.3;
  b0 = Math.max(-0.5, Math.min(0.5, b0)) * (fromAir ? 1 : 0.5);

  const rs = c.railState;
  rs.obstacleId = line.id;
  rs.kind = line.kind;
  rs.stance = stance;
  rs.balance = b0;
  rs.time = 0;
  rs.tangent.set(tx, ty, tz);
  s.rail = rs;
  s.mode = 'rail';
  s.surface = 'rail';
  s.surfaceY = g.y;
  s.surfaceNormal.set(0, 1, 0);
  s.heading = tanYaw;
  c.boardDir = tanYaw;
  c.spinT = -1;
  c.charge = 0;
  c.jumpArmed = false;
  c.yawSlip = 0;
  s.crouch = 0;
  c.bus.emit('sim:railEnter', { obstacleId: line.id, kind: line.kind, pos: { x: g.x, y: g.y, z: g.z }, material: line.material });
  c.bus.emit('sim:surface', { from, to: 'rail', obstacleId: line.id });
}

function setStance(c: SimCore, stance: RailStance): void {
  const rs = c.railState;
  if (rs.stance === stance) return;
  rs.stance = stance;
  const run = c.rail;
  run.stanceYawTarget = stance === 'boardslide' ? HALF : stance === 'lipslide' ? -HALF : 0;
  if (run.stances.indexOf(stance) < 0 && run.stances.length < 8) run.stances.push(stance);
  c.bus.emit('sim:railStance', { stance });
}

const STANCE_DIFFICULTY: Record<RailStance, number> = { fifty: 1, boardslide: 1.3, lipslide: 1.35, nosepress: 1.2, tailpress: 1.2 };

export function stepRail(c: SimCore, dt: number): void {
  const s = c.state;
  const inp = c.inp;
  const run = c.rail;
  const rs = c.railState;
  const line = run.line;
  if (!line) {
    s.mode = 'air';
    return;
  }
  c.rope.update(dt, 1, s.surfaceY);

  // ── motion along the polyline ──
  let i = run.seg;
  let len = line.segLen[i];
  let tx = ((line.px[i + 1] - line.px[i]) / len) * run.dir;
  let ty = ((line.py[i + 1] - line.py[i]) / len) * run.dir;
  let tz = ((line.pz[i + 1] - line.pz[i]) / len) * run.dir;
  const pressing = rs.stance === 'nosepress' || rs.stance === 'tailpress';
  const sliding = rs.stance === 'boardslide' || rs.stance === 'lipslide';
  const friction = line.friction * (pressing ? 1.5 : sliding ? 1.25 : 1);
  const accel = c.rope.ax * tx + c.rope.az * tz - friction - gravityAt(9) * SIM.railSlopeGravity * ty;
  run.speed += accel * dt;
  if (run.speed < 1) {
    c.bail('balance', 0.3);
    return;
  }
  let ds = run.speed * dt;
  run.distance += ds;
  let ended = false;
  while (ds > 0) {
    const left = (run.dir > 0 ? 1 - run.t : run.t) * len;
    if (ds < left) {
      run.t += (ds / len) * run.dir;
      ds = 0;
    } else {
      ds -= left;
      const next = i + run.dir;
      if (next < 0 || next >= line.n - 1) {
        run.t = run.dir > 0 ? 1 : 0;
        ended = true;
        break;
      }
      i = next;
      run.seg = i;
      run.t = run.dir > 0 ? 0 : 1;
      len = line.segLen[i];
      tx = ((line.px[i + 1] - line.px[i]) / len) * run.dir;
      ty = ((line.py[i + 1] - line.py[i]) / len) * run.dir;
      tz = ((line.pz[i + 1] - line.pz[i]) / len) * run.dir;
    }
  }
  const qx = line.px[i] + (line.px[i + 1] - line.px[i]) * run.t;
  const qy = line.py[i] + (line.py[i + 1] - line.py[i]) * run.t;
  const qz = line.pz[i] + (line.pz[i + 1] - line.pz[i]) * run.t;
  if (run.blend > 0) run.blend = Math.max(0, run.blend - dt / run.blendTime);
  const k = run.blend * run.blend * (3 - 2 * run.blend);
  s.pos.set(qx + run.offX * k, qy + run.offY * k, qz + run.offZ * k);
  s.vel.set(tx * run.speed, ty * run.speed, tz * run.speed);
  rs.tangent.set(tx, ty, tz);
  rs.time += dt;
  s.surfaceY = qy;
  const tanYaw = Math.atan2(tx, tz);
  s.heading = tanYaw;
  c.boardDir = tanYaw;

  // ── stance ──
  if (inp.trick.pressed && Math.abs(inp.steer) >= TRICK.dirThreshold) {
    if (sliding) setStance(c, 'fifty');
    else setStance(c, inp.steer < 0 ? 'boardslide' : 'lipslide');
  }
  if (inp.grab.down && !sliding) {
    const want: RailStance = inp.pitch < -0.3 ? 'tailpress' : inp.pitch > 0.3 ? 'nosepress' : rs.stance === 'tailpress' ? 'tailpress' : 'nosepress';
    setStance(c, want);
    run.pressTime += dt;
  } else if (pressing && !inp.grab.down) setStance(c, 'fifty');
  const turn = (HALF / SIM.railStanceTime) * dt;
  const dyaw = run.stanceYawTarget - run.stanceYaw;
  run.stanceYaw += dyaw > turn ? turn : dyaw < -turn ? -turn : dyaw;
  s.boardYaw = wrapPi(tanYaw + (s.switch ? PI : 0) + run.stanceYaw);

  // ── balance: unstable, wobbling, corrected with the stick ──
  run.noiseT -= dt;
  if (run.noiseT <= 0) {
    run.noiseT = 0.3 + c.rng() * 0.35;
    run.noiseTarget = c.rng() * 2 - 1;
  }
  run.noise += (run.noiseTarget - run.noise) * damp(5, dt);
  const difficulty = line.balance * c.tune.railDrift * c.mods.railDrift * STANCE_DIFFICULTY[rs.stance];
  const wobble = SIM.balanceWobble * (1 + SIM.balanceSpeed * Math.max(0, run.speed - 8)) * (1 + SIM.balanceSlope * Math.abs(ty));
  // rope pulling across the rail drags the rider off to that side
  const side = (c.rope.ax * tz - c.rope.az * tx) / SIM.maxPull;
  const drift = difficulty * (wobble * run.noise + SIM.balanceInstability * rs.balance - side * 0.6);
  rs.balance += (drift + inp.steer * SIM.balanceControl) * dt;
  s.lean = Math.max(-1, Math.min(1, rs.balance * 0.7));
  if (Math.abs(rs.balance) >= 1) {
    rs.balance = rs.balance > 0 ? 1 : -1;
    // fall off to the side the balance went
    const out = rs.balance * 1.4;
    s.vel.x += -tz * out;
    s.vel.z += tx * out;
    c.bail('balance', Math.min(1, 0.35 + run.speed / 25));
    return;
  }

  // ── pop off / end of the rail ──
  if (inp.jump.pressed) c.jumpArmed = true;
  if (inp.jump.down && c.jumpArmed) c.charge = Math.min(1, c.charge + dt / c.tune.chargeTime);
  s.crouch = c.charge;
  if (inp.jump.released && c.jumpArmed) {
    leaveRail(c, true, tx, ty, tz);
    return;
  }
  if (ended) leaveRail(c, inp.jump.down && c.jumpArmed && c.charge > 0.05, tx, ty, tz);
}

function leaveRail(c: SimCore, popped: boolean, tx: number, ty: number, tz: number): void {
  const s = c.state;
  const run = c.rail;
  const line = run.line as GrindLine;
  const power = c.charge;
  const up = popped ? popSpeed(c.tune, power) * c.mods.pop * SIM.railPopScale : SIM.railEndHop;
  const vy = Math.max(0, ty * run.speed) + up;
  s.vel.set(tx * run.speed, vy, tz * run.speed);
  const tanYaw = Math.atan2(tx, tz);
  if (popped) c.bus.emit('sim:pop', { power, pos: c.p3(), surface: railSurface(line) });
  // the board swings back to straight during the first moments of the air
  const offset = run.stanceYaw;
  s.boardYaw = wrapPi(tanYaw + (s.switch ? PI : 0));
  c.boardDir = tanYaw;
  c.closeRail(popped, true);
  c.takeoff('rail', line.id, vy);
  c.airYawOffset = offset;
}
