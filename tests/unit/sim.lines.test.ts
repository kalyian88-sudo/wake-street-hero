/**
 * Whole runs on the reference spot: every line reaches the finish with no input and with the autopilot,
 * on both boards, the state stays sane on every step and the sim is deterministic.
 */
import { describe, expect, it } from 'vitest';
import { GAME } from '../../src/config';
import { phuketOldTown } from '../../src/data/spots/phuket_oldtown';
import { createAutopilot } from '../../src/physics/autopilot';
import { createSimHarness, type SimHarness } from '../../src/physics/simTestKit';
import type { BoardKind, PowerLevel, RiderSimState } from '../../src/types';

const LINES = ['main', 'left', 'right'] as const;
const BOARDS: BoardKind[] = ['wakeboard', 'wakeskate'];

function expectSane(s: RiderSimState): void {
  const nums = [
    s.time, s.pos.x, s.pos.y, s.pos.z, s.vel.x, s.vel.y, s.vel.z, s.speed, s.heading, s.boardYaw, s.lean, s.crouch,
    s.surfaceY, s.progress, s.distToWinch, s.slowMo, s.rope.tension, s.rope.length, s.rope.slack, s.rope.jerk,
    s.rope.reelSpeed, s.rope.handlePos.x, s.rope.handlePos.y, s.rope.handlePos.z, s.air.spin, s.air.roll,
    s.air.timeToLand, s.air.height, s.air.grabBlend, s.air.flip.progress, s.air.flip.catchWindow,
  ];
  for (const n of nums) if (!Number.isFinite(n)) throw new Error(`non-finite state value at t=${s.time} mode=${s.mode}`);
  expect(Math.hypot(s.rope.dir.x, s.rope.dir.z)).toBeCloseTo(1, 5);
  expect(s.surfaceNormal.length()).toBeCloseTo(1, 4);
  expect(s.progress).toBeGreaterThanOrEqual(0);
  expect(s.progress).toBeLessThanOrEqual(1);
  expect(s.slowMo).toBeGreaterThanOrEqual(0);
  expect(s.slowMo).toBeLessThanOrEqual(1);
  expect(Math.abs(s.lean)).toBeLessThanOrEqual(1);
  expect(s.rope.tension).toBeGreaterThanOrEqual(0);
  expect(s.rope.tension).toBeLessThanOrEqual(1);
  expect(s.rope.slack).toBeGreaterThanOrEqual(0);
  // mode ↔ sub-state consistency
  expect(s.rail !== null).toBe(s.mode === 'rail');
  expect(s.wall !== null).toBe(s.mode === 'wall');
  expect(s.bail !== null).toBe(s.mode === 'bail');
  if (s.mode === 'air') expect(s.surface).toBe('air');
  if (s.mode === 'rail') expect(s.surface).toBe('rail');
  if (s.mode === 'wall') expect(s.surface).toBe('wall');
  if (s.mode === 'water') expect(s.surface).toBe('water');
  if (s.mode === 'slide') expect(['air', 'rail', 'wall', 'water']).not.toContain(s.surface);
  if (s.mode !== 'air') expect(s.air.timeToLand).toBe(0);
  // never under the canal bed, never in orbit
  expect(s.pos.y).toBeGreaterThan(-2);
  expect(s.pos.y).toBeLessThan(9);
}

/** Runs to the finish, checking the state every step and that the rider never sits still for long. */
function rideToFinish(h: SimHarness, next: (() => void) | null, maxSeconds = 70): void {
  let lastZ = h.sim.state.pos.z;
  let lastX = h.sim.state.pos.x;
  let stillFor = 0;
  const steps = Math.ceil(maxSeconds / h.dt);
  for (let i = 0; i < steps && h.sim.state.mode !== 'finished'; i++) {
    if (next) next();
    else h.step();
    const s = h.sim.state;
    expectSane(s);
    const moved = Math.hypot(s.pos.x - lastX, s.pos.z - lastZ);
    lastX = s.pos.x;
    lastZ = s.pos.z;
    // a bail takes 2 s; anything longer without moving is "stuck"
    stillFor = moved < 0.2 * h.dt ? stillFor + h.dt : 0;
    if (stillFor > 4) throw new Error(`stuck at (${s.pos.x.toFixed(1)}, ${s.pos.z.toFixed(1)}) in mode ${s.mode}`);
  }
}

describe('sim: full runs on phuket_oldtown', () => {
  for (const board of BOARDS) {
    for (const winchId of LINES) {
      it(`${board} / ${winchId}: neutral input reaches the finish`, () => {
        const h = createSimHarness({ spot: phuketOldTown, winchId, board });
        rideToFinish(h, null);
        const s = h.sim.state;
        expect(s.mode).toBe('finished');
        expect(s.time).toBeLessThan(45);
        expect(h.count('sim:finish')).toBe(1);
        // riding straight never needs a rescue on this spot
        expect(h.of('sim:bail').filter((b) => b.reason !== 'balance')).toHaveLength(0);
        expect(s.distToWinch).toBeLessThanOrEqual(GAME.finishRadius + 0.5);
      });

      it(`${board} / ${winchId}: autopilot reaches the finish and scores`, () => {
        const h = createSimHarness({ spot: phuketOldTown, winchId, board });
        const bot = createAutopilot(h.sim);
        rideToFinish(h, () => h.sim.step(h.dt, bot.update(), 1));
        expect(h.sim.state.mode).toBe('finished');
        expect(h.sim.state.time).toBeLessThan(55);
        expect(h.count('sim:finish')).toBe(1);
        expect(h.count('score:trick')).toBeGreaterThanOrEqual(2);
        expect(h.count('sim:takeoff')).toBeGreaterThanOrEqual(1);
        expect(h.sim.score.state.total).toBeGreaterThan(0);
      });
    }
  }

  it('autopilot copes with every power setting and without tricks', () => {
    for (const power of ['slow', 'fast'] as PowerLevel[]) {
      for (const tricks of [true, false]) {
        const h = createSimHarness({ spot: phuketOldTown, winchId: 'main', power });
        const bot = createAutopilot(h.sim, { tricks });
        rideToFinish(h, () => h.sim.step(h.dt, bot.update(), 1));
        expect(h.sim.state.mode).toBe('finished');
      }
    }
  });

  it('uses the kickers, a rail, the gap and the wall on its routes', () => {
    const seen = new Set<string>();
    let gaps = 0;
    for (const winchId of LINES) {
      const h = createSimHarness({ spot: phuketOldTown, winchId });
      const bot = createAutopilot(h.sim);
      rideToFinish(h, () => h.sim.step(h.dt, bot.update(), 1));
      for (const e of h.of('sim:takeoff')) if (e.obstacleId) seen.add(e.obstacleId);
      for (const e of h.of('sim:railEnter')) seen.add(e.obstacleId);
      for (const e of h.of('sim:wallEnter')) seen.add(e.obstacleId);
      gaps += h.count('sim:gap');
    }
    expect(seen.has('kicker_main')).toBe(true);
    expect(seen.has('kicker_gap')).toBe(true);
    expect(seen.has('wall_graffiti')).toBe(true);
    expect([...seen].some((id) => id.startsWith('rail_') || id === 'pipe_fat' || id === 'ledge_block')).toBe(true);
    expect(gaps).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic: same inputs → same final state', () => {
    const run = (): { h: SimHarness; trace: number[] } => {
      const h = createSimHarness({ spot: phuketOldTown, winchId: 'main', board: 'wakeskate' });
      const bot = createAutopilot(h.sim);
      const trace: number[] = [];
      for (let i = 0; i < 60 * 40 && h.sim.state.mode !== 'finished'; i++) {
        h.sim.step(h.dt, bot.update(), 1);
        if (i % 30 === 0) trace.push(h.sim.state.pos.x, h.sim.state.pos.y, h.sim.state.pos.z, h.sim.state.boardYaw);
      }
      return { h, trace };
    };
    const a = run();
    const b = run();
    expect(a.trace).toEqual(b.trace);
    expect(a.h.sim.state.time).toBe(b.h.sim.state.time);
    expect(a.h.sim.state.pos.toArray()).toEqual(b.h.sim.state.pos.toArray());
    expect(a.h.sim.score.state.total).toBe(b.h.sim.score.state.total);
    expect(a.h.events.map((e) => e.type)).toEqual(b.h.events.map((e) => e.type));
  });

  it('reset() puts the rider back at the start and the run can be repeated identically', () => {
    const h = createSimHarness({ spot: phuketOldTown, winchId: 'left' });
    const bot = createAutopilot(h.sim);
    for (let i = 0; i < 60 * 8; i++) h.sim.step(h.dt, bot.update(), 1);
    expect(h.sim.state.pos.z).toBeGreaterThan(30);
    h.sim.reset();
    const s = h.sim.state;
    expect(s.mode).toBe('waiting');
    expect(s.time).toBe(0);
    expect(s.pos.x).toBeCloseTo(-4, 6);
    expect(s.pos.z).toBeCloseTo(0, 6);
    expect(s.speed).toBe(0);
    // waiting until go()
    for (let i = 0; i < 60; i++) h.step();
    expect(s.mode).toBe('waiting');
    expect(s.time).toBe(0);
    expect(s.pos.z).toBeCloseTo(0, 6);
    h.sim.go();
    h.run(60, null, (hh) => hh.sim.state.mode === 'finished');
    expect(s.mode).toBe('finished');
  });
});
