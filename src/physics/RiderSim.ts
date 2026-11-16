// STUB — replaced by the sim agent. Keep the export name/signature.
// Minimal mover: gets pulled straight to the winch and steers a little, so other modules have live state.
import { WINCH_SPEED, GAME } from '../config';
import type { EventBus } from '../core/events';
import { createRiderSimState } from '../core/riderState';
import { lineInfo, winchAnchor } from '../data/geometry';
import { createScoreKeeper } from '../tricks/scoring';
import type { IRiderSim, InputFrame, SimConfig } from '../types';
import { buildCollisionWorld } from './CollisionWorld';

export function createRiderSim(config: SimConfig, bus: EventBus): IRiderSim {
  const wp = config.spot.winchPoints.find((w) => w.id === config.winchId) ?? config.spot.winchPoints[0];
  const line = lineInfo(wp);
  const state = createRiderSimState(config.board, config.stance);
  const score = createScoreKeeper(bus);
  const world = buildCollisionWorld(config.spot);
  let going = false;
  const reset = (): void => {
    going = false;
    state.mode = 'waiting';
    state.time = 0;
    state.pos.set(wp.start[0], wp.start[1], wp.start[2]);
    state.vel.set(0, 0, 0);
    state.heading = state.boardYaw = line.yaw;
    state.rope.anchorPos.fromArray(winchAnchor(wp));
    score.reset();
  };
  reset();
  return {
    state,
    score,
    world,
    config,
    reset,
    go: () => {
      going = true;
      state.mode = 'water';
    },
    step(dt: number, input: InputFrame): void {
      const r = state.rope;
      const dx = wp.pos[0] - state.pos.x;
      const dz = wp.pos[2] - state.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      r.dir.set(dx / d, 0, dz / d);
      r.handlePos.set(state.pos.x + r.dir.x * 0.7, state.pos.y + 1, state.pos.z + r.dir.z * 0.7);
      state.distToWinch = d;
      state.progress = 1 - d / line.length;
      if (!going || state.mode === 'finished') return;
      state.time += dt;
      const v = WINCH_SPEED[config.power];
      const yaw = Math.atan2(dx, dz) - input.steer * 0.7;
      state.heading = state.boardYaw = yaw;
      state.lean = input.steer;
      state.vel.set(Math.sin(yaw) * v, 0, Math.cos(yaw) * v);
      state.speed = v;
      state.pos.addScaledVector(state.vel, dt);
      r.taut = true;
      r.tension = 0.5;
      r.length = d;
      r.reelSpeed = v;
      score.update(dt, false);
      if (d < GAME.finishRadius) {
        state.mode = 'finished';
        score.finish();
        bus.emit('sim:finish', { pos: { x: state.pos.x, y: state.pos.y, z: state.pos.z } });
      }
    },
  };
}
