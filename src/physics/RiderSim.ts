/**
 * Headless rider simulation: winch + rope, carving, slides, air tricks, rails, wallrides, bails.
 * Deterministic (seeded RNG, no Date/Math.random), no DOM, no per-step allocations in steady state.
 * The model is described in docs/PLAN.md §4; every number lives in ./tuning.ts.
 */
import { GAME } from '../config';
import type { EventBus } from '../core/events';
import type { IRiderSim, InputFrame, SimConfig } from '../types';
import { stepAir } from './modes/air';
import { stepGround } from './modes/ground';
import { stepBail, stepFinished, stepWaiting } from './modes/passive';
import { stepRail } from './modes/rail';
import { stepWall } from './modes/wall';
import { SimCore } from './SimCore';
import { gravityAt, SIM } from './tuning';

function copyInput(src: InputFrame, dst: InputFrame): void {
  dst.steer = src.steer < -1 ? -1 : src.steer > 1 ? 1 : src.steer || 0;
  dst.pitch = src.pitch < -1 ? -1 : src.pitch > 1 ? 1 : src.pitch || 0;
  dst.jump.down = src.jump.down;
  dst.jump.pressed = src.jump.pressed;
  dst.jump.released = src.jump.released;
  dst.trick.down = src.trick.down;
  dst.trick.pressed = src.trick.pressed;
  dst.trick.released = src.trick.released;
  dst.grab.down = src.grab.down;
  dst.grab.pressed = src.grab.pressed;
  dst.grab.released = src.grab.released;
  dst.handlePressed = src.handlePressed;
  dst.heroPressed = src.heroPressed;
  dst.pausePressed = src.pausePressed;
}

function clearEdges(inp: InputFrame): void {
  inp.jump.pressed = inp.jump.released = false;
  inp.trick.pressed = inp.trick.released = false;
  inp.grab.pressed = inp.grab.released = false;
  inp.handlePressed = false;
  inp.heroPressed = false;
}

function substep(c: SimCore, dt: number): void {
  const s = c.state;
  if (c.relockT > 0) c.relockT -= dt;
  if (c.wallCooldown > 0) c.wallCooldown -= dt;
  switch (s.mode) {
    case 'waiting':
      stepWaiting(c, dt);
      break;
    case 'water':
    case 'slide':
      stepGround(c, dt);
      break;
    case 'air':
      stepAir(c, dt);
      break;
    case 'rail':
      stepRail(c, dt);
      break;
    case 'wall':
      stepWall(c, dt);
      break;
    case 'bail':
      stepBail(c, dt);
      break;
    case 'finished':
      stepFinished(c, dt);
      break;
  }
  if (c.going) s.time += dt;

  // ── common outputs ──
  const v = s.vel;
  s.speed = Math.hypot(v.x, v.z);
  if (s.speed > 0.4 && (s.mode === 'air' || s.mode === 'bail' || s.mode === 'finished')) s.heading = Math.atan2(v.x, v.z);
  const start = c.wp.start;
  const along = ((s.pos.x - start[0]) * c.lineDx + (s.pos.z - start[2]) * c.lineDz) / c.lineLen;
  s.progress = along < 0 ? 0 : along > 1 ? 1 : along;

  // ── finish line ──
  const mode = s.mode;
  if (mode === 'water' || mode === 'slide' || mode === 'rail' || mode === 'wall') {
    if (s.distToWinch <= GAME.finishRadius || c.rope.length <= SIM.minRope) c.finish();
  } else if (mode === 'air' && c.rope.length <= SIM.minRope * 0.5) c.finish();
}

/**
 * Seconds until the board meets a surface on its current ballistic path (rope pull ignored).
 * Marches the path with the sim's gravity law and looks at the ground every few steps, so a quay
 * edge or a kicker in the way is found, not just the surface under the take-off point.
 */
function predictTouchdown(c: SimCore): number {
  const s = c.state;
  const v = s.vel;
  const dt = 1 / 60;
  let y = s.pos.y;
  let vy = v.y;
  let ground = s.surfaceY;
  let prevGap = y - ground;
  if (prevGap <= 0 && vy <= 0) return 0;
  for (let i = 1; i <= 300; i++) {
    vy -= gravityAt(vy) * dt;
    y += vy * dt;
    if (i % 3 === 0) {
      const t = i * dt;
      ground = c.world.sampleInto(c.smp2, s.pos.x + v.x * t, s.pos.z + v.z * t, y + 0.3, 0).y;
    }
    const gap = y - ground;
    if (gap <= 0 && vy < 0) return (i - 1 + (prevGap > 0 ? prevGap / (prevGap - gap) : 0)) * dt;
    prevGap = gap;
  }
  return 5;
}

export function createRiderSim(config: SimConfig, bus: EventBus): IRiderSim {
  const c = new SimCore(config, bus);
  const s = c.state;

  return {
    state: s,
    score: c.score,
    world: c.world,
    config,
    reset: () => c.reset(),
    go: () => c.go(),
    step(dt: number, input: InputFrame, timeScale = 1): void {
      if (!(dt > 0)) return;
      const inp = c.inp;
      copyInput(input, inp);

      const live = c.going && s.mode !== 'waiting' && s.mode !== 'finished';
      if (inp.heroPressed && live) c.score.activateHero();
      if (inp.handlePressed && live && s.mode !== 'bail') c.rope.setHolding(!s.rope.holding);

      const n = Math.max(1, Math.ceil(dt / SIM.maxStep - 1e-9));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        substep(c, h);
        if (i === 0) clearEdges(inp);
      }

      const realDt = dt / (timeScale > 1e-3 ? timeScale : 1);
      if (c.going) {
        const mode = s.mode;
        c.score.update(dt, mode === 'air' || mode === 'rail' || mode === 'wall', realDt);
      }
      s.hero = c.score.state.hero.active;

      // ── time to touchdown + slow-motion request ──
      let want = 0;
      if (s.mode === 'air') {
        const a = s.air;
        const t = predictTouchdown(c);
        a.timeToLand = t;
        if (c.tricks.busy && t > SIM.slowMoCutoff) want = 1;
      }
      const rate = (want > s.slowMo ? SIM.slowMoIn : SIM.slowMoOut) * realDt;
      s.slowMo += (want - s.slowMo) * (rate > 1 ? 1 : rate);
      if (s.slowMo < 1e-3) s.slowMo = 0;
    },
  };
}
