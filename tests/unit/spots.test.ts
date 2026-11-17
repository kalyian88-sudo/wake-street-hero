/**
 * Every spot in src/data/spots must be valid data AND rideable: for each winch line, riding with no
 * input reaches the winch, and the autopilot reaches it too. Run one spot: SPOT=<id> npx vitest run tests/unit/spots.test.ts
 */
import { describe, expect, it } from 'vitest';
import { CITIES } from '../../src/data/cities';
import { SPOTS } from '../../src/data/spots';
import { getTrick } from '../../src/data/tricks';
import { createAutopilot } from '../../src/physics/autopilot';
import { createSimHarness, type SimHarness } from '../../src/physics/simTestKit';
import { neutralInputFrame } from '../../src/input/Input';

const only = process.env.SPOT;
const list = SPOTS.filter((s) => !only || s.id === only);

function ride(h: SimHarness, bot: ReturnType<typeof createAutopilot>, limit: number): void {
  let lastX = h.sim.state.pos.x;
  let lastZ = h.sim.state.pos.z;
  let still = 0;
  for (let i = 0; i < limit * 60 && h.sim.state.mode !== 'finished'; i++) {
    h.sim.step(h.dt, bot.update(), 1);
    const s = h.sim.state;
    const moved = Math.hypot(s.pos.x - lastX, s.pos.z - lastZ);
    lastX = s.pos.x;
    lastZ = s.pos.z;
    still = moved < 0.2 * h.dt ? still + h.dt : 0;
    if (still > 4) throw new Error(`stuck at (${s.pos.x.toFixed(1)}, ${s.pos.z.toFixed(1)}) in mode ${s.mode}`);
  }
}

describe.each(list.map((s) => [s.id, s] as const))('spot %s', (_id, spot) => {
  it('is valid data', () => {
    const city = CITIES.find((c) => c.id === spot.cityId);
    expect(city, 'city').toBeDefined();
    expect(city!.spots).toContain(spot.id);
    expect(spot.goals).toHaveLength(5);
    expect(spot.winchPoints.length).toBeGreaterThanOrEqual(2);
    expect(spot.winchPoints.length).toBeLessThanOrEqual(3);
    expect(spot.name.ru && spot.name.en && spot.blurb.ru && spot.blurb.en).toBeTruthy();
    const obstacleIds = new Set(spot.obstacles.map((o) => o.id));
    expect(obstacleIds.size).toBe(spot.obstacles.length);
    for (const g of spot.goals) {
      if (g.type === 'trick') expect(getTrick(g.trickId), g.trickId).toBeDefined();
      if (g.type === 'line') for (const o of g.obstacles) expect(obstacleIds.has(o), o).toBe(true);
      if (g.type === 'line' && g.winch) expect(spot.winchPoints.some((w) => w.id === g.winch)).toBe(true);
      if (g.type === 'clip') expect(spot.filmerZones.some((z) => z.id === g.zone)).toBe(true);
    }
    for (const wp of spot.winchPoints) {
      const letters = spot.letters.filter((l) => !l.line || l.line === wp.id).map((l) => l.index).sort();
      expect(letters, `letters on line ${wp.id}`).toEqual([0, 1, 2, 3, 4, 5]);
    }
    expect(spot.props.length).toBeGreaterThan(5);
  });

  for (const wp of spot.winchPoints) {
    it(`line ${wp.id}: the autopilot rides from start to the winch`, () => {
      const h = createSimHarness({ spot, winchId: wp.id });
      const bot = createAutopilot(h.sim);
      ride(h, bot, 70);
      expect(h.sim.state.mode).toBe('finished');
    });
  }
});

describe('street start from the side bank', () => {
  it('every line starts on a bank and the rider is on the water within 3 s of GO', () => {
    for (const spot of list) {
      for (const wp of spot.winchPoints) {
        const h = createSimHarness({ spot, winchId: wp.id, bankStart: true });
        const s = h.sim.state;
        expect(s.surface, `${spot.id}/${wp.id}`).not.toBe('water');
        h.sim.go();
        let onWater = false;
        for (let i = 0; i < 60 * 3 && !onWater; i++) {
          h.sim.step(h.dt, bot0(), 1);
          onWater = s.mode === 'water';
        }
        expect(onWater, `${spot.id}/${wp.id}`).toBe(true);
        expect(h.count('sim:bail'), `${spot.id}/${wp.id}`).toBe(0);
      }
    }
  });
});

function bot0(): ReturnType<typeof neutralInputFrame> {
  return neutralInputFrame();
}
