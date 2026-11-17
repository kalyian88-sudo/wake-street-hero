import { describe, expect, it } from 'vitest';
import { ENDLESS_ROUTE, generateEndlessStage } from '../../src/endless/generate';
import { createAutopilot } from '../../src/physics/autopilot';
import { createSimHarness } from '../../src/physics/simTestKit';

describe('endless canal stages', () => {
  it('every country stage generates valid, deterministic data', () => {
    for (let stage = 0; stage < ENDLESS_ROUTE.length; stage++) {
      const a = generateEndlessStage(1234, stage);
      const b = generateEndlessStage(1234, stage);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.obstacles.length).toBeGreaterThanOrEqual(8);
      expect(a.letters.map((l) => l.index).sort()).toEqual([0, 1, 2, 3, 4, 5]);
      expect(a.props.length).toBeGreaterThan(20);
      expect(new Set(a.obstacles.map((o) => o.id)).size).toBe(a.obstacles.length);
    }
  });

  for (const stage of [0, 1, 3, 5, 9, 11]) {
    it(`stage ${stage}: the autopilot rides it to the winch`, () => {
      const spot = generateEndlessStage(77 + stage, stage);
      const h = createSimHarness({ spot, winchId: 'main' });
      const bot = createAutopilot(h.sim);
      for (let i = 0; i < 60 * 120 && h.sim.state.mode !== 'finished'; i++) h.sim.step(h.dt, bot.update(), 1);
      expect(h.sim.state.mode).toBe('finished');
    });
  }
});
