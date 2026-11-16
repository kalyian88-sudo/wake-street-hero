/**
 * AUTOPILOT — a bot that rides a line like a decent player: lines up the next obstacle, charges and
 * pops at kickers (and onto high rails), throws a safe trick when it has the air for it, balances
 * on rails and rides walls. Used by the unit tests, the e2e smoke test and the attract mode.
 * Deterministic: its only randomness is a seeded RNG that varies the tricks.
 */
import { WINCH_SPEED } from '../config';
import { hashString, seededRng, wrapPi } from '../data/geometry';
import type { InputFrame, IRiderSim } from '../types';
import { RoutePlan, type Feature } from './autopilot/plan';
import { CollisionWorld, createCollisionWorld } from './CollisionWorld';
import { InputScript, type Held } from './inputScript';
import { BOARD, SIM, statMods } from './tuning';

export interface AutopilotOptions {
  /** Do air / rail tricks (default true). false = just ride the obstacles. */
  tricks?: boolean;
  /** Seed for the trick variety. */
  seed?: number;
  /** Press HERO when the meter is full (default true). */
  hero?: boolean;
}

export interface Autopilot {
  /** Call once per frame BEFORE sim.step(); returns the input to feed it. */
  update(): InputFrame;
  /** Id of the obstacle the bot is going for (debug / sandbox). */
  readonly targetId: string | null;
}

type AirPlan =
  | { kind: 'none' }
  | { kind: 'spin'; presses: number; dir: 1 | -1; grab: boolean }
  | { kind: 'roll'; dir: 1 | -1; spin: number }
  | { kind: 'grab'; steer: number; pitch: number }
  | { kind: 'flip'; steer: number; pitch: number }
  | { kind: 'shifty' };

export function createAutopilot(sim: IRiderSim, opts: AutopilotOptions = {}): Autopilot {
  const doTricks = opts.tricks !== false;
  const useHero = opts.hero !== false;
  const cfg = sim.config;
  const s = sim.state;
  const wp = cfg.spot.winchPoints.find((w) => w.id === cfg.winchId) ?? cfg.spot.winchPoints[0];
  const world = sim.world instanceof CollisionWorld ? sim.world : createCollisionWorld(cfg.spot);
  const tune = BOARD[cfg.board];
  const mods = statMods(cfg.stats);
  const reel = WINCH_SPEED[cfg.power];
  const plan = new RoutePlan(cfg.spot, wp, world, tune, mods, reel);
  const rng = seededRng(opts.seed ?? hashString(`bot:${cfg.spot.id}:${wp.id}:${cfg.board}`));
  const script = new InputScript();
  const held: Held = {};

  let target: Feature | null = null;
  let done: Feature | null = null;
  let replanIn = 0;
  let lastTime = 0;
  let lastMode = s.mode;
  let jumpHold = false;
  let released = false;

  // air
  let air: AirPlan = { kind: 'none' };
  let airFrame = 0;
  let airStarted = false;
  let trickCount = 0;
  // rail
  let railTrick = 0;
  let railDid = false;
  let prevBalance = 0;

  function clear(): void {
    held.steer = 0;
    held.pitch = 0;
    held.jump = false;
    held.trick = false;
    held.grab = false;
    held.handle = false;
    held.hero = false;
  }

  /** Steer value that points the board along `yaw` (the board follows rope direction − steer·carveMax). */
  function steerFor(yaw: number): number {
    const d = s.rope.dir;
    const v = -wrapPi(yaw - Math.atan2(d.x, d.z)) / tune.carveMax;
    return v < -1 ? -1 : v > 1 ? 1 : v;
  }

  /** Pure-pursuit heading onto the approach axis of a feature. */
  function aim(f: Feature): number {
    const rx = s.pos.x - f.ex;
    const rz = s.pos.z - f.ez;
    const ahead = -(rx * f.ax + rz * f.az);
    const left = rx * f.az - rz * f.ax - f.bias;
    const look = Math.min(9, Math.max(3, ahead * 0.6));
    return Math.atan2(f.ax, f.az) - Math.atan2(left, look);
  }

  function pickAirPlan(): AirPlan {
    const a = s.air;
    const t = a.timeToLand;
    const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;
    const n = trickCount++;
    if (!doTricks) return { kind: 'none' };
    // coming down onto a rail: keep it clean
    if (target && target.pop) return { kind: 'none' };
    if (cfg.board === 'wakeskate') {
      if (t >= 0.9) {
        const menu: [number, number][] = [
          [-1, 0],
          [1, 0],
          [0, 0],
          [0, -1],
        ];
        const m = menu[n % menu.length];
        return { kind: 'flip', steer: m[0], pitch: m[1] };
      }
      if (t >= 0.75) return { kind: 'flip', steer: 0, pitch: 0 };
      if (t >= 0.6) return { kind: 'shifty' };
      return { kind: 'none' };
    }
    const spin = (presses: number): number => 0.2 + (presses * 180) / 400;
    const kicker = a.takeoff === 'kicker';
    if (t >= spin(4) + 0.12 && kicker && n % 3 === 0) return { kind: 'spin', presses: 4, dir, grab: false };
    if (t >= 1.12) {
      switch (n % 4) {
        case 0:
          return { kind: 'spin', presses: 2, dir, grab: t >= 1.35 };
        case 1:
          return { kind: 'roll', dir: 1, spin: 0 };
        case 2:
          return { kind: 'roll', dir: -1, spin: 0 };
        default:
          return { kind: 'roll', dir: 1, spin: t >= 1.3 ? 2 : 0 };
      }
    }
    if (t >= spin(1) + 0.12) return n % 2 === 0 ? { kind: 'spin', presses: 1, dir, grab: false } : { kind: 'grab', steer: n % 4 === 1 ? -1 : 0, pitch: n % 4 === 3 ? -1 : 0 };
    if (t >= 0.5) return { kind: 'shifty' };
    return { kind: 'none' };
  }

  function driveAir(): void {
    const a = s.air;
    if (!airStarted) {
      // the first prediction of the landing time is there one frame after take-off
      if (a.timeToLand <= 0) return;
      airStarted = true;
      airFrame = 0;
      air = pickAirPlan();
    }
    const k = airFrame++;
    const t = a.timeToLand;
    switch (air.kind) {
      case 'spin':
        if (k % 4 === 0 && k / 4 < air.presses) {
          held.trick = true;
          held.steer = -air.dir;
        } else if (air.grab && k > air.presses * 4 && t > 0.42) held.grab = true;
        break;
      case 'roll': {
        const presses = 1 + air.spin;
        if (k % 4 === 0 && k / 4 < presses) {
          held.trick = true;
          if (k === 0) held.pitch = air.dir;
          else held.steer = -1;
        }
        break;
      }
      case 'grab':
        if (k >= 1 && t > 0.4) {
          held.grab = true;
          held.steer = air.steer;
          held.pitch = air.pitch;
        }
        break;
      case 'flip': {
        const f = a.flip;
        if (k === 1) {
          held.grab = true;
          held.steer = air.steer;
          held.pitch = air.pitch;
        } else if (k > 2 && f.id !== null && !f.caught && k % 2 === 0 && (f.catchWindow >= 0.9 || (f.catchWindow > 0 && t < 0.16))) held.grab = true;
        break;
      }
      case 'shifty':
        if (k === 1) held.trick = true;
        break;
      case 'none':
        // nudge towards the rail we are trying to come down on
        if (target && target.pop) {
          const left = (s.pos.x - target.ex) * target.az - (s.pos.z - target.ez) * target.ax;
          held.steer = Math.max(-1, Math.min(1, left * 2.5));
        }
        break;
    }
  }

  function driveRail(dt: number): void {
    const r = s.rail;
    if (!r) return;
    const rate = dt > 0 ? (r.balance - prevBalance) / dt : 0;
    prevBalance = r.balance;
    held.steer = Math.max(-1, Math.min(1, -r.balance * 4.5 - rate * 0.35));
    if (!doTricks) return;
    if (r.time < 0.02) {
      railTrick = Math.floor(rng() * 3);
      railDid = false;
    }
    if (railTrick === 1 && !railDid && r.time > 0.25) {
      // boardslide: one TRICK + direction press (the balance correction resumes next frame)
      held.trick = true;
      held.steer = rng() < 0.5 ? -1 : 1;
      railDid = true;
    } else if (railTrick === 2 && r.time > 0.2 && r.time < 1.1) {
      held.grab = true;
      held.pitch = 1;
    }
  }

  function driveGround(): void {
    const along = plan.along(s.pos.x, s.pos.z);
    const lat = plan.lateral(s.pos.x, s.pos.z);
    if (target) {
      // gone past it without using it?
      const past = (s.pos.x - target.ex) * target.ax + (s.pos.z - target.ez) * target.az;
      if (past > target.len + 0.5) {
        done = target;
        target = null;
      }
    }
    if (!target && replanIn <= 0) {
      target = plan.choose(along, lat, done);
      replanIn = 0.2;
      jumpHold = false;
      released = false;
    }
    if (!target) {
      held.steer = 0;
      return;
    }
    const f = target;
    held.steer = steerFor(aim(f));
    const dEntry = (f.ex - s.pos.x) * f.ax + (f.ez - s.pos.z) * f.az;
    const speed = Math.max(3, s.speed);
    if (f.kind === 'kicker') {
      const toLip = dEntry + f.len;
      const t = -dEntry / f.len;
      if (!released && toLip <= speed * (tune.chargeTime + 0.2)) jumpHold = true;
      if (jumpHold && t >= 1 - SIM.lipZone + 0.1) {
        jumpHold = false;
        released = true;
      }
    } else if (f.pop) {
      const lead = speed * (f.pop.charge * tune.chargeTime + 0.06);
      if (!released && dEntry <= f.pop.dist + lead && dEntry > f.pop.dist) jumpHold = true;
      if (jumpHold && dEntry <= f.pop.dist) {
        jumpHold = false;
        released = true;
      }
    }
    held.jump = jumpHold;
  }

  return {
    get targetId() {
      return target ? target.id : null;
    },
    update(): InputFrame {
      clear();
      const dt = Math.max(0, s.time - lastTime);
      lastTime = s.time;
      if (replanIn > 0) replanIn -= dt;
      const mode = s.mode;
      if (mode !== lastMode) {
        if (mode === 'air') {
          airStarted = false;
          air = { kind: 'none' };
          // whatever we took off from is used up (unless we are jumping onto a high rail)
          if (target && !target.pop) {
            done = target;
            target = null;
          }
        } else if (mode === 'rail' || mode === 'wall') {
          if (target) done = target;
          target = null;
          prevBalance = s.rail ? s.rail.balance : 0;
        } else if (mode === 'bail') {
          target = null;
          done = null;
        } else if (mode === 'water' || mode === 'slide') {
          if (lastMode === 'air' || lastMode === 'bail' || lastMode === 'rail' || lastMode === 'wall') {
            if (target && target.pop) done = target;
            target = null;
            replanIn = 0;
          }
        }
        jumpHold = false;
        released = false;
        lastMode = mode;
      }
      switch (mode) {
        case 'water':
        case 'slide':
          driveGround();
          break;
        case 'air':
          driveAir();
          break;
        case 'rail':
          driveRail(dt);
          break;
        default:
          break;
      }
      if (useHero && sim.score.state.hero.ready && !sim.score.state.hero.active && (mode === 'water' || mode === 'slide')) held.hero = true;
      // never feed a direction threshold by accident while pressing nothing
      if (!held.trick && !held.grab && Math.abs(held.steer ?? 0) < 0.02) held.steer = 0;
      return script.set(held);
    },
  };
}
