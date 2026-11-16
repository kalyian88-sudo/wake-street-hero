/**
 * Riding on a surface: 'water' (carving on an edge) and 'slide' (solid ground, kicker faces,
 * ledge tops, wet concrete). PLAN §4.1.
 */
import { damp, wrapPi } from '../../data/geometry';
import { surfaceSpinRecord } from '../../tricks/air/record';
import { resolveTrick } from '../../tricks/scoring';
import type { SurfaceKind } from '../../types';
import type { SimCore } from '../SimCore';
import { isRough, popSpeed, SIM, SURFACE, TRICK } from '../tuning';
import { tryLockRailFromGround } from './rail';
import { tryWall } from './wall';

const PI = Math.PI;

export function stepGround(c: SimCore, dt: number): void {
  const s = c.state;
  const inp = c.inp;
  const tune = c.tune;
  const kind = s.surface as SurfaceKind;
  const surf = SURFACE[kind] ?? SURFACE.water;
  const water = s.mode === 'water';
  const v = s.vel;
  const r = s.rope;

  c.rope.update(dt, 1, s.surfaceY);
  if (c.rope.stuck) {
    c.bail('stalled', 0.3);
    return;
  }
  const ropeYaw = Math.atan2(r.dir.x, r.dir.z);

  // ── heading: stick turns the board relative to the rope ──
  const prevDir = c.boardDir;
  const speed0 = Math.hypot(v.x, v.z);
  if (r.holding) {
    const target = -inp.steer * tune.carveMax * surf.carve;
    c.carve += (target - c.carve) * damp(tune.carveRate, dt);
    const diff = wrapPi(ropeYaw + c.carve - c.boardDir);
    const maxTurn = SIM.turnRate * dt;
    c.boardDir += diff > maxTurn ? maxTurn : diff < -maxTurn ? -maxTurn : diff;
  } else {
    c.carve *= Math.max(0, 1 - 3 * dt);
    c.boardDir -= inp.steer * SIM.freeTurn * surf.carve * Math.min(1, speed0 / 4) * dt;
  }
  c.boardDir = wrapPi(c.boardDir);
  const yawRate = wrapPi(c.boardDir - prevDir) / dt;

  // ── velocity: rope pull, edge grip (keel), drag / friction ──
  const fx = Math.sin(c.boardDir);
  const fz = Math.cos(c.boardDir);
  let vx = v.x + c.rope.ax * dt;
  let vz = v.z + c.rope.az * dt;
  const vf = vx * fx + vz * fz;
  const grip = Math.exp(-surf.grip * (water ? tune.grip : 1) * dt);
  vx = vf * fx + (vx - vf * fx) * grip;
  vz = vf * fz + (vz - vf * fz) * grip;
  let speed = Math.hypot(vx, vz);
  if (speed > 1e-5) {
    let dec: number;
    if (water) {
      dec = SIM.waterDragLin * speed + SIM.waterDragQuad * speed * speed;
      if (speed < SIM.planingSpeed) dec += SIM.sinkDrag * (1 - speed / SIM.planingSpeed);
    } else {
      dec = surf.friction * (c.groundRamp ? SIM.rampFriction : 1) + 0.03 * speed;
    }
    const ns = Math.max(0, speed - dec * dt);
    vx *= ns / speed;
    vz *= ns / speed;
    speed = ns;
  }
  v.x = vx;
  v.z = vz;

  // ── charge (crouch) and pop ──
  if (inp.jump.pressed) c.jumpArmed = true;
  if (inp.jump.down) {
    c.groundHold += dt;
    // held through a landing: counts as a fresh charge after a short beat
    if (!c.jumpArmed && c.groundHold > 0.12) c.jumpArmed = true;
    if (c.jumpArmed) c.charge = Math.min(1, c.charge + dt / tune.chargeTime);
  } else c.groundHold = 0;
  s.crouch = c.charge;
  if (inp.jump.released) {
    if (c.jumpArmed && c.groundRamp) {
      // on a kicker the pop is saved for the lip: released in the lip zone = full boost, earlier = weak
      const t = c.world.rampProgress(c.groundId, s.pos.x, s.pos.z);
      const boost = popSpeed(tune, c.charge) * (t >= 1 - SIM.lipZone ? SIM.lipBoost : SIM.earlyBoost);
      if (boost > c.rampBoost) {
        c.rampBoost = boost;
        c.rampPower = c.charge;
      }
    } else if (c.jumpArmed) {
      pop(c);
      return;
    }
    c.charge = 0;
    c.jumpArmed = false;
    s.crouch = 0;
  }

  // ── surface 180 ──
  if (c.spinT >= 0) {
    c.spinT += dt;
    if (c.spinT >= SIM.surfaceSpinTime) {
      c.spinT = -1;
      const was = s.switch;
      s.switch = !was;
      c.score.addTrick(resolveTrick(surfaceSpinRecord(s.board, c.spinDir, s.stance, was)), 'clean', s.time);
    }
  } else if (inp.trick.pressed && Math.abs(inp.steer) >= TRICK.dirThreshold && !c.groundRamp && speed > 2) {
    c.spinT = 0;
    c.spinDir = inp.steer < 0 ? 1 : -1;
    c.bus.emit('sim:surfaceSpin', { dir: c.spinDir });
  }

  // ── wallride faces ──
  if (c.wallCooldown <= 0 && c.world.walls.length > 0 && tryWall(c, dt, false)) return;

  // ── move ──
  if (!c.moveXZ(dt, s.surfaceY, SIM.stepUp, true)) return;
  if (!c.keepInBounds(dt)) return;

  // ── follow the ground ──
  const prevY = s.pos.y;
  const smp = c.world.sampleInto(c.smp, s.pos.x, s.pos.z, s.surfaceY, SIM.stepUp);
  const sp = Math.hypot(v.x, v.z);
  if (s.surfaceY - smp.y > SIM.stepDown) {
    // ground fell away: bridge hairline gaps, otherwise this is a launch / drop
    let bridged = false;
    if (sp > 0.5) {
      const ahead = c.world.sampleInto(c.smp2, s.pos.x + (v.x / sp) * SIM.gapBridge, s.pos.z + (v.z / sp) * SIM.gapBridge, s.surfaceY, SIM.stepUp);
      bridged = Math.abs(s.surfaceY - ahead.y) <= SIM.stepDown * 0.5;
    }
    if (!bridged) {
      launch(c);
      return;
    }
  } else {
    if (smp.ramp) {
      s.pos.y = smp.y;
      // climb rate along the direction of travel
      c.rampVy = -(v.x * smp.nx + v.z * smp.nz) / smp.ny;
      c.climbVy = c.rampVy;
    } else {
      const dy = smp.y - s.pos.y;
      s.pos.y = Math.abs(dy) < 0.004 ? smp.y : s.pos.y + dy * damp(SIM.stepSmooth, dt);
      c.rampVy = 0;
      c.climbVy += ((s.pos.y - prevY) / dt - c.climbVy) * damp(18, dt);
    }
    v.y = c.rampVy;
    if (!smp.ramp) c.rampBoost = 0;
    if (smp.kind !== s.surface || smp.id !== c.groundId) c.enterGround(smp);
    else {
      s.surfaceY = smp.y;
      s.surfaceNormal.set(smp.nx, smp.ny, smp.nz);
      c.groundRamp = smp.ramp;
    }
  }

  // ── out of speed on solid ground ──
  if (s.mode === 'slide' && !c.groundRamp && sp < SIM.stallSpeed) {
    c.stallT += dt;
    if (c.stallT > SIM.stallTime * (isRough(s.surface as SurfaceKind) ? 1 : 2.5)) {
      c.bail('stalled', 0.25);
      return;
    }
  } else c.stallT = 0;

  // ── hop onto low rails ──
  if (sp >= SIM.railMinSpeed && tryLockRailFromGround(c)) return;

  // ── outputs ──
  s.speed = sp;
  if (sp > 0.4) s.heading = Math.atan2(v.x, v.z);
  c.yawSlip *= Math.max(0, 1 - 12 * dt);
  let spinOff = 0;
  if (c.spinT >= 0) {
    const k = Math.min(1, c.spinT / SIM.surfaceSpinTime);
    spinOff = c.spinDir * PI * k * k * (3 - 2 * k);
  }
  s.boardYaw = wrapPi(c.boardDir + (s.switch ? PI : 0) + c.yawSlip + spinOff);
  // lean: into the carve + centripetal feel of the turn
  const leanTarget = Math.max(-1, Math.min(1, (-c.carve / tune.carveMax) * 0.75 - yawRate * sp * 0.012 + inp.steer * 0.15));
  s.lean += (leanTarget - s.lean) * damp(9, dt);
}

/** JUMP released on flat water / ground / a ledge top. */
function pop(c: SimCore): void {
  const s = c.state;
  const v = s.vel;
  const power = c.charge;
  const speed = Math.hypot(v.x, v.z);
  const boneless = s.board === 'wakeskate' && c.inp.grab.down;
  // you cannot ollie from a standstill
  const vy = popSpeed(c.tune, power) * c.mods.pop * (0.4 + 0.6 * Math.min(1, speed / 4)) * (boneless ? c.tune.bonelessBoost : 1);
  const kind = c.obstacleKind(c.groundId) === 'ledge' ? 'ledge' : 'pop';
  c.bus.emit('sim:pop', { power, pos: c.p3(), surface: s.surface as SurfaceKind });
  s.boardYaw = wrapPi(c.boardDir + (s.switch ? PI : 0) + spinOffset(c));
  c.takeoff(kind, c.obstacleOf(c.groundId), vy, boneless);
}

function spinOffset(c: SimCore): number {
  if (c.spinT < 0) return 0;
  return c.spinDir * PI * Math.min(1, c.spinT / SIM.surfaceSpinTime);
}

/** The ground dropped away under the board: kicker lip, ledge end, quay edge, top of the stairs. */
function launch(c: SimCore): void {
  const s = c.state;
  const v = s.vel;
  const role = c.obstacleKind(c.groundId);
  let vy = 0;
  let kind: 'kicker' | 'ledge' | 'drop' = 'drop';
  if (c.groundRamp) {
    kind = 'kicker';
    let boost = c.rampBoost;
    let power = c.rampPower;
    if (boost <= 0 && c.inp.jump.down && c.jumpArmed && c.charge > 0.05) {
      // JUMP held through the lip: the charge goes off by itself, a little less cleanly
      boost = popSpeed(c.tune, c.charge) * SIM.holdBoost;
      power = c.charge;
    }
    // a faster run-up turns the same pop into more lift
    vy = c.rampVy + boost * c.mods.pop * (0.55 + 0.45 * Math.min(1.4, Math.hypot(v.x, v.z) / 9.5));
    if (boost > 0) c.bus.emit('sim:pop', { power, pos: c.p3(), surface: s.surface as SurfaceKind });
  } else if (role === 'ledge') kind = 'ledge';
  else if (role === 'stairs') vy = Math.max(0, Math.min(3.5, c.climbVy * 0.8));
  c.rampBoost = 0;
  s.boardYaw = wrapPi(c.boardDir + (s.switch ? PI : 0) + spinOffset(c));
  c.takeoff(kind, c.obstacleOf(c.groundId), vy, false);
}
