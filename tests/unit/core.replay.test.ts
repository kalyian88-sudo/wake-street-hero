import { describe, expect, it } from 'vitest';
import { ReplayBuffer, lerpRiderState } from '../../src/core/Replay';
import { createRiderSimState } from '../../src/core/riderState';
import type { RiderSimState } from '../../src/types';

const name = { ru: 'Трюк', en: 'Trick' };

/** Rider moving +Z at 10 m/s; `air(t)` gives the air height (0 = on the water). */
function simulate(buf: ReplayBuffer, from: number, to: number, air: (t: number) => number = () => 0, fps = 60): RiderSimState {
  const s = createRiderSimState();
  for (let t = from; t <= to + 1e-9; t += 1 / fps) {
    const h = air(t);
    s.time = t;
    s.mode = h > 0 ? 'air' : 'water';
    s.pos.set(0, h, t * 10);
    s.vel.set(0, 0, 10);
    s.speed = 10;
    s.air.height = h;
    s.air.time = h > 0 ? t : 0;
    s.boardYaw = t;
    buf.record(s);
  }
  return s;
}

const jump = (start: number, dur: number, height: number) => (t: number): number => {
  const u = (t - start) / dur;
  return u > 0 && u < 1 ? 4 * height * u * (1 - u) : 0;
};

describe('ReplayBuffer', () => {
  it('records at ~30 Hz of sim time and ignores the waiting state', () => {
    const buf = new ReplayBuffer(25, 30);
    const s = createRiderSimState();
    s.mode = 'waiting';
    buf.record(s);
    expect(buf.count).toBe(0);
    simulate(buf, 0, 2);
    expect(buf.count).toBeGreaterThanOrEqual(58);
    expect(buf.count).toBeLessThanOrEqual(62);
    expect(buf.startTime).toBeCloseTo(0, 5);
    expect(buf.endTime).toBeGreaterThan(1.95);
  });

  it('keeps only the last ~25 s (ring)', () => {
    const buf = new ReplayBuffer(25, 30);
    simulate(buf, 0, 60);
    expect(buf.count).toBe(buf.capacity);
    expect(buf.endTime - buf.startTime).toBeGreaterThan(24.9);
    expect(buf.endTime - buf.startTime).toBeLessThan(25.2);
    expect(buf.endTime).toBeGreaterThan(59.9);
  });

  it('interpolates positions and wraps angles; discrete fields come from the earlier sample', () => {
    const a = createRiderSimState();
    const b = createRiderSimState();
    a.time = 1;
    b.time = 2;
    a.pos.set(0, 0, 0);
    b.pos.set(0, 1, 2);
    a.boardYaw = Math.PI - 0.1;
    b.boardYaw = -Math.PI + 0.1;
    a.mode = 'water';
    b.mode = 'air';
    b.air.grab = 'indy';
    const out = lerpRiderState(a, b, 0.5, createRiderSimState());
    expect(out.pos.z).toBeCloseTo(1, 6);
    expect(out.pos.y).toBeCloseTo(0.5, 6);
    expect(out.time).toBeCloseTo(1.5, 6);
    // shortest way round through ±π, not through 0
    expect(Math.abs(Math.abs(out.boardYaw) - Math.PI)).toBeLessThan(1e-6);
    expect(out.mode).toBe('water');
    expect(out.air.grab).toBeNull();
  });

  it('does not blend across a respawn teleport', () => {
    const a = createRiderSimState();
    const b = createRiderSimState();
    a.pos.set(0, 0, 0);
    b.pos.set(0, 0, 40);
    const out = lerpRiderState(a, b, 0.5, createRiderSimState());
    expect(out.pos.z).toBe(0);
  });

  it('sample() clamps to the recorded range', () => {
    const buf = new ReplayBuffer();
    expect(buf.sample(1, createRiderSimState())).toBeNull();
    simulate(buf, 0, 3);
    const out = createRiderSimState();
    expect(buf.sample(-5, out)?.pos.z).toBeCloseTo(0, 5);
    expect(buf.sample(1.234, out)?.pos.z).toBeCloseTo(12.34, 2);
    expect(buf.sample(99, out)?.pos.z).toBeCloseTo(buf.endTime * 10, 5);
  });

  it('best clip = window around the highest-scoring trick, hero frame = peak of THAT air', () => {
    const buf = new ReplayBuffer();
    // small trick (1 m air landing at 4 s) and the big one (2.5 m air, 9 → 10.2 s), then a bigger untricked air at 14 s
    const air = (t: number): number => jump(3, 1, 1)(t) + jump(9, 1.2, 2.5)(t) + jump(14, 1.2, 3)(t);
    simulate(buf, 0, 20, air);
    buf.addTrick({ time: 4.02, awarded: 300, name, tier: 1, id: 'spin180' });
    buf.addTrick({ time: 10.22, awarded: 1500, name, tier: 4, id: 'backroll' });
    const clip = buf.bestClip();
    expect(clip).not.toBeNull();
    expect(clip?.marker?.id).toBe('backroll');
    expect(clip?.start).toBeCloseTo(10.22 - 2.2, 5);
    expect(clip?.end).toBeCloseTo(10.22 + 1.6, 5);
    // apex of the 9 → 10.2 s air
    expect(clip?.hero).toBeGreaterThan(9.5);
    expect(clip?.hero).toBeLessThan(9.7);
  });

  it('forgets tricks that scrolled out of the buffer and clamps the clip to what exists', () => {
    const buf = new ReplayBuffer(25, 30);
    simulate(buf, 0, 40, jump(38, 1, 2));
    buf.addTrick({ time: 5, awarded: 9000, name, tier: 5, id: 'old' });
    buf.addTrick({ time: 39.02, awarded: 200, name, tier: 1, id: 'new' });
    const clip = buf.bestClip();
    expect(clip?.marker?.id).toBe('new');
    expect(clip?.end).toBeLessThanOrEqual(buf.endTime);
    expect(clip?.end).toBeCloseTo(40, 1);
  });

  it('without a scored trick: highest air, else a riding frame; empty buffer → null', () => {
    const buf = new ReplayBuffer();
    expect(buf.bestClip()).toBeNull();
    simulate(buf, 0, 10, jump(4, 1, 2));
    const clip = buf.bestClip();
    expect(clip?.marker).toBeNull();
    expect(clip?.hero).toBeGreaterThan(4.4);
    expect(clip?.hero).toBeLessThan(4.6);

    const flat = new ReplayBuffer();
    simulate(flat, 0, 10);
    const c2 = flat.bestClip();
    expect(c2).not.toBeNull();
    expect(c2?.hero).toBeCloseTo(flat.endTime, 5);
    expect((c2?.end ?? 0) - (c2?.start ?? 0)).toBeGreaterThan(3);
  });

  it('rail tricks use the middle of the grind as the hero frame', () => {
    const buf = new ReplayBuffer();
    const s = createRiderSimState();
    for (let t = 0; t <= 8; t += 1 / 60) {
      s.time = t;
      s.mode = t > 4 && t < 6 ? 'rail' : 'water';
      s.pos.set(0, 0, t * 10);
      buf.record(s);
    }
    buf.addTrick({ time: 6.05, awarded: 700, name, tier: 2, id: 'rail.boardslide' });
    const clip = buf.bestClip();
    expect(clip?.hero).toBeGreaterThan(4.8);
    expect(clip?.hero).toBeLessThan(5.2);
  });

  it('a sim reset (time going backwards) clears the recording', () => {
    const buf = new ReplayBuffer();
    simulate(buf, 0, 5);
    buf.addTrick({ time: 2, awarded: 100, name, tier: 1, id: 'x' });
    simulate(buf, 0, 1);
    expect(buf.endTime).toBeLessThan(1.1);
    expect(buf.tricks.length).toBe(0);
  });
});
