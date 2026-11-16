import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import { AutoQualityGovernor, QualityManager, pickStartLevel, type DeviceHints } from '../../src/core/Quality';
import type { QualityLevel } from '../../src/types';

/** Feed `seconds` of frames at `fps`; returns every level change that happened. */
function feed(g: AutoQualityGovernor, seconds: number, fps: number, cpuMs = 4): QualityLevel[] {
  const changes: QualityLevel[] = [];
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) {
    const r = g.sample(dt, cpuMs);
    if (r) changes.push(r);
  }
  return changes;
}

const phone: DeviceHints = { cores: 8, memoryGb: 6, screenMin: 1170, mobile: true };

describe('pickStartLevel', () => {
  it('maps device hints to a starting level', () => {
    expect(pickStartLevel({ cores: 2, memoryGb: 2, screenMin: 720, mobile: true })).toBe('low');
    expect(pickStartLevel({ cores: 4, memoryGb: 3, screenMin: 720, mobile: true })).toBe('low');
    expect(pickStartLevel(phone)).toBe('medium');
    expect(pickStartLevel({ cores: 12, memoryGb: 16, screenMin: 1440, mobile: false })).toBe('high');
    expect(pickStartLevel({ cores: 4, memoryGb: 8, screenMin: 1080, mobile: false })).toBe('medium');
  });
});

describe('AutoQualityGovernor', () => {
  it('holds the level at a steady 60 fps without headroom information', () => {
    const g = new AutoQualityGovernor('medium');
    expect(feed(g, 30, 60, 14)).toEqual([]);
    expect(g.level).toBe('medium');
  });

  it('steps down after ~2.5 s below 50 fps, not earlier', () => {
    const g = new AutoQualityGovernor('high');
    // 1 s grace + 1 s window + < 2.5 s low → nothing yet
    expect(feed(g, 3.5, 40)).toEqual([]);
    expect(feed(g, 2, 40)).toEqual(['medium']);
  });

  it('keeps stepping down to low when it stays slow, with a cool-down in between', () => {
    const g = new AutoQualityGovernor('high');
    const changes = feed(g, 30, 30);
    expect(changes).toEqual(['medium', 'low']);
    expect(g.level).toBe('low');
  });

  it('steps up only after ~10 s above 58 fps with CPU headroom', () => {
    const g = new AutoQualityGovernor('low');
    expect(feed(g, 9, 60, 4)).toEqual([]);
    expect(feed(g, 6, 60, 4)).toEqual(['medium']);
    // no headroom → stays
    const g2 = new AutoQualityGovernor('low');
    expect(feed(g2, 40, 60, 15)).toEqual([]);
  });

  it('does not judge the first second after a load or a hitch', () => {
    const g = new AutoQualityGovernor('medium');
    feed(g, 5, 60);
    // one long frame (tab switch / shader compile) must not count as slowness
    expect(g.sample(1.5, 300)).toBeNull();
    expect(feed(g, 2, 60)).toEqual([]);
    expect(g.level).toBe('medium');
  });

  it('never oscillates: a level that failed twice is not tried again', () => {
    const g = new AutoQualityGovernor('medium');
    const changes: QualityLevel[] = [];
    // Device that does 60 fps on low but 40 fps on medium, for ten minutes.
    for (let t = 0; t < 600; t += 1) changes.push(...feed(g, 1, g.level === 'low' ? 60 : 40, 4));
    const ups = changes.filter((c) => c === 'medium').length;
    expect(ups).toBeLessThanOrEqual(1);
    expect(g.level).toBe('low');
    expect(changes.length).toBeLessThanOrEqual(3);
  });

  it('a device that cannot even do 4 fps still steps down', () => {
    const g = new AutoQualityGovernor('high');
    const changes: QualityLevel[] = [];
    for (let i = 0; i < 60; i++) {
      const r = g.sample(0.4, 380);
      if (r) changes.push(r);
    }
    expect(changes).toEqual(['medium', 'low']);
  });
});

describe('QualityManager', () => {
  it('fixed setting wins and emits quality:changed on change', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('quality:changed', (e) => seen.push(`${e.level}:${e.auto}`));
    const q = new QualityManager(bus, 'high', false, phone);
    expect(q.level).toBe('high');
    expect(q.auto).toBe(false);
    const applied: string[] = [];
    q.onChange = (p) => applied.push(p.level);
    q.setSetting('low');
    expect(q.profile.post).toBe(false);
    expect(applied).toEqual(['low']);
    expect(seen).toEqual(['low:false']);
    // feeding slow frames does nothing while fixed
    for (let i = 0; i < 600; i++) q.frame(1 / 20, 40);
    expect(q.level).toBe('low');
  });

  it('auto starts from the device hint and adapts; frozen never adapts', () => {
    const bus = new EventBus();
    const q = new QualityManager(bus, 'auto', false, phone);
    expect(q.level).toBe('medium');
    expect(q.auto).toBe(true);
    for (let i = 0; i < 30 * 10; i++) q.frame(1 / 30, 30);
    expect(q.level).toBe('low');

    const frozen = new QualityManager(new EventBus(), 'auto', true, phone);
    for (let i = 0; i < 30 * 10; i++) frozen.frame(1 / 30, 30);
    expect(frozen.level).toBe('medium');
  });

  it('cycle() walks low → medium → high → auto', () => {
    const q = new QualityManager(new EventBus(), 'low', false, phone);
    expect(q.cycle()).toBe('medium');
    expect(q.cycle()).toBe('high');
    expect(q.cycle()).toBe('auto');
    expect(q.level).toBe('high');
    expect(q.cycle()).toBe('low');
  });
});
