import { describe, expect, it } from 'vitest';
import { GAME } from '../../src/config';
import { TimeScale } from '../../src/core/Time';

const run = (t: TimeScale, seconds: number, slowMo: number, hero: boolean, fps = 60): number => {
  let scale = t.scale;
  for (let i = 0; i < Math.round(seconds * fps); i++) scale = t.update(1 / fps, slowMo, hero);
  return scale;
};

describe('TimeScale', () => {
  it('stays at real time without a trick', () => {
    const t = new TimeScale();
    expect(run(t, 1, 0, false)).toBe(1);
    expect(t.slowMo).toBe(0);
  });

  it('eases into slow-motion fast (~0.15 s) and settles on GAME.slowMoScale', () => {
    const t = new TimeScale();
    const after = run(t, 0.15, 1, false);
    // 95 % of the way after 0.15 s
    expect(after).toBeLessThan(1 - (1 - GAME.slowMoScale) * 0.9);
    expect(after).toBeGreaterThan(GAME.slowMoScale);
    expect(run(t, 1, 1, false)).toBeCloseTo(GAME.slowMoScale, 4);
    expect(t.slowMo).toBeCloseTo(1, 4);
  });

  it('eases out slower than in (~0.35 s)', () => {
    const t = new TimeScale();
    run(t, 1, 1, false);
    const early = run(t, 0.15, 0, false);
    // after 0.15 s of easing out it is clearly not back yet…
    expect(early).toBeLessThan(0.9);
    // …but after 0.35 s (+0.2) it nearly is
    expect(run(t, 0.2, 0, false)).toBeGreaterThan(0.95);
    expect(run(t, 1, 0, false)).toBe(1);
  });

  it('HERO mode: base scale without a trick, deeper slow-mo with one', () => {
    const t = new TimeScale();
    expect(run(t, 2, 0, true)).toBeCloseTo(GAME.heroBaseScale, 3);
    expect(run(t, 2, 1, true)).toBeCloseTo(GAME.heroTrickScale, 3);
    expect(t.hero).toBeCloseTo(1, 3);
    expect(run(t, 3, 0, false)).toBe(1);
  });

  it('is frame-rate independent', () => {
    const a = new TimeScale();
    const b = new TimeScale();
    const sa = run(a, 0.1, 1, false, 30);
    const sb = run(b, 0.1, 1, false, 120);
    expect(Math.abs(sa - sb)).toBeLessThan(0.01);
  });

  it('never leaves the 0..1 range and applies the debug multiplier', () => {
    const t = new TimeScale();
    run(t, 0.5, 5, false);
    expect(t.slowMo).toBeLessThanOrEqual(1);
    t.debugScale = 0.5;
    expect(run(t, 2, 0, false)).toBeCloseTo(0.5, 4);
    t.reset();
    expect(t.scale).toBe(1);
  });
});
