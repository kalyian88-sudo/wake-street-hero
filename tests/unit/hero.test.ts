import { beforeEach, describe, expect, it } from 'vitest';
import { GAME } from '../../src/config';
import { EventBus } from '../../src/core/events';
import { createScoreKeeper, resolveTrick, SCORE_RULES as R } from '../../src/tricks/scoring';
import type { IScoreKeeper, ResolvedTrick, TrickRecord } from '../../src/types';

function rec(over: Partial<TrickRecord> = {}): TrickRecord {
  return {
    board: 'wakeboard',
    context: 'air',
    takeoff: 'pop',
    spinDeg: 0,
    spinDir: null,
    inverts: [],
    grabs: [],
    flips: [],
    shifty: false,
    handlePass: false,
    switchTakeoff: false,
    switchLanding: false,
    airTime: 1,
    height: 1.2,
    ...over,
  };
}

const spin = (deg: number): ResolvedTrick => resolveTrick(rec({ spinDeg: deg }));
/** Six different tier-3+ tricks. */
const VARIETY: ResolvedTrick[] = [
  resolveTrick(rec({ spinDeg: 360, inverts: [{ id: 'backroll', count: 1 }] })),
  resolveTrick(rec({ spinDeg: 360, inverts: [{ id: 'frontroll', count: 1 }] })),
  resolveTrick(rec({ spinDeg: 360, inverts: [{ id: 'tantrum', count: 1 }] })),
  resolveTrick(rec({ spinDeg: 360, inverts: [{ id: 'raley', count: 1 }] })),
  resolveTrick(rec({ spinDeg: 720 })),
  resolveTrick(rec({ spinDeg: 900 })),
  resolveTrick(rec({ spinDeg: 1080 })),
  resolveTrick(rec({ inverts: [{ id: 'backroll', count: 2 }] })),
];

let bus: EventBus;
let keeper: IScoreKeeper;
let events: string[];

function fillMeter(): void {
  for (const t of VARIETY) {
    if (keeper.state.hero.ready) break;
    keeper.addTrick(t, 'perfect', 0);
  }
  expect(keeper.state.hero.ready).toBe(true);
}

beforeEach(() => {
  bus = new EventBus();
  keeper = createScoreKeeper(bus);
  events = [];
  bus.on('hero:ready', () => events.push('ready'));
  bus.on('hero:start', (e) => events.push(`start:${e.duration}`));
  bus.on('hero:end', () => events.push('end'));
});

describe('HERO meter — filling', () => {
  it('a clean landing fills by tier, a new trick ×1.5', () => {
    const t = spin(360); // tier 2
    expect(t.tier).toBe(2);
    keeper.addTrick(t, 'clean', 0);
    expect(keeper.state.hero.meter).toBeCloseTo((R.heroFillBase + R.heroFillPerTier * 2) * R.heroNewTrick, 6);
  });

  it('higher tiers fill more', () => {
    const a = createScoreKeeper(new EventBus());
    const b = createScoreKeeper(new EventBus());
    a.addTrick(spin(180), 'clean', 0);
    b.addTrick(spin(1080), 'clean', 0);
    expect(spin(1080).tier).toBe(5);
    expect(b.state.hero.meter).toBeGreaterThan(a.state.hero.meter * 2);
  });

  it('perfect fills more than clean, sketchy nothing', () => {
    const clean = createScoreKeeper(new EventBus());
    const perfect = createScoreKeeper(new EventBus());
    const sketchy = createScoreKeeper(new EventBus());
    clean.addTrick(spin(360), 'clean', 0);
    perfect.addTrick(spin(360), 'perfect', 0);
    sketchy.addTrick(spin(360), 'sketchy', 0);
    expect(perfect.state.hero.meter).toBeCloseTo(clean.state.hero.meter * R.heroPerfect, 6);
    expect(sketchy.state.hero.meter).toBe(0);
  });

  it('variety pays: a repeat fills less than a trick not done yet in this run', () => {
    keeper.addTrick(spin(360), 'clean', 0);
    const first = keeper.state.hero.meter;
    keeper.addTrick(spin(360), 'clean', 1);
    const repeat = keeper.state.hero.meter - first;
    expect(repeat).toBeCloseTo((first / R.heroNewTrick) * 0.7, 6);
    keeper.addTrick(spin(540), 'clean', 2); // new, tier 2
    const fresh = keeper.state.hero.meter - first - repeat;
    expect(fresh).toBeGreaterThan(repeat * 2);
  });

  it('fillers (plain airs) do not fill', () => {
    keeper.addTrick(resolveTrick(rec({ height: 3 })), 'perfect', 0);
    expect(keeper.state.hero.meter).toBe(0);
  });

  it('a bail drains a bit', () => {
    keeper.addTrick(spin(1080), 'perfect', 0);
    const before = keeper.state.hero.meter;
    keeper.bail();
    expect(keeper.state.hero.meter).toBeCloseTo(before - R.heroBailDrain, 6);
    keeper.bail();
    keeper.bail();
    keeper.bail();
    expect(keeper.state.hero.meter).toBe(0);
  });

  it('becomes ready at 1 and says so exactly once', () => {
    fillMeter();
    expect(keeper.state.hero.meter).toBe(1);
    expect(events).toEqual(['ready']);
    keeper.addTrick(spin(180), 'perfect', 0);
    expect(events).toEqual(['ready']);
    expect(keeper.state.hero.meter).toBe(1);
  });

  it('a bail while ready takes the readiness away until the meter is refilled', () => {
    fillMeter();
    keeper.bail();
    expect(keeper.state.hero.ready).toBe(false);
    expect(keeper.activateHero()).toBe(false);
    keeper.addTrick(resolveTrick(rec({ inverts: [{ id: 'frontroll', count: 2 }] })), 'perfect', 0);
    expect(keeper.state.hero.ready).toBe(true);
    expect(events).toEqual(['ready', 'ready']);
  });
});

describe('HERO mode — activate, ×2, expire', () => {
  it('cannot be activated before the meter is full', () => {
    keeper.addTrick(spin(360), 'clean', 0);
    expect(keeper.activateHero()).toBe(false);
    expect(keeper.state.hero.active).toBe(false);
    expect(events).toEqual([]);
  });

  it('activates for GAME.heroDuration real seconds', () => {
    fillMeter();
    expect(keeper.activateHero()).toBe(true);
    expect(keeper.state.hero).toEqual({ meter: 1, ready: false, active: true, timeLeft: GAME.heroDuration });
    expect(events).toEqual(['ready', `start:${GAME.heroDuration}`]);
    expect(GAME.heroDuration).toBe(8);
    expect(keeper.activateHero()).toBe(false);
  });

  it('doubles every point while active', () => {
    fillMeter();
    keeper.finish();
    const total = keeper.state.total;
    keeper.activateHero();
    expect(keeper.addTrick(spin(180), 'clean', 0)).toBe(200);
    keeper.addBonus('letter', { ru: 'Буква', en: 'Letter' }, 100);
    expect(keeper.state.comboPoints).toBe(400);
    keeper.finish();
    expect(keeper.state.total).toBe(total + 400);
  });

  it('the timer runs on REAL seconds, not on slowed-down sim time', () => {
    fillMeter();
    keeper.activateHero();
    // 7.9 real seconds of deep slow-motion: only 1.7 s of sim time pass
    for (let i = 0; i < 79; i++) keeper.update(0.1 * 0.22, true, 0.1);
    expect(keeper.state.hero.active).toBe(true);
    expect(keeper.state.hero.timeLeft).toBeCloseTo(0.1, 6);
    expect(keeper.state.hero.meter).toBeCloseTo(0.1 / 8, 6);
    keeper.update(0.1 * 0.22, true, 0.11);
    expect(keeper.state.hero.active).toBe(false);
    expect(keeper.state.hero).toEqual({ meter: 0, ready: false, active: false, timeLeft: 0 });
    expect(events).toEqual(['ready', 'start:8', 'end']);
  });

  it('realDt defaults to dt', () => {
    fillMeter();
    keeper.activateHero();
    keeper.update(4, true);
    expect(keeper.state.hero.timeLeft).toBeCloseTo(4, 6);
    expect(keeper.state.hero.meter).toBeCloseTo(0.5, 6);
    keeper.update(4.01, true);
    expect(keeper.state.hero.active).toBe(false);
  });

  it('the meter does not fill while HERO is on and starts from zero afterwards', () => {
    fillMeter();
    keeper.activateHero();
    keeper.update(1, true, 1);
    keeper.addTrick(spin(1080), 'perfect', 0);
    expect(keeper.state.hero.meter).toBeCloseTo(7 / 8, 6);
    keeper.update(1, true, 8);
    expect(keeper.state.hero.meter).toBe(0);
    keeper.addTrick(resolveTrick(rec({ spinDeg: 900, grabs: [{ id: 'tail', hold: 0 }] })), 'clean', 0);
    expect(keeper.state.hero.meter).toBeGreaterThan(0);
    expect(keeper.state.hero.ready).toBe(false);
  });

  it('a bail during HERO burns the pot but not the mode', () => {
    fillMeter();
    keeper.activateHero();
    keeper.bail();
    expect(keeper.state.hero.active).toBe(true);
    expect(keeper.state.hero.timeLeft).toBe(GAME.heroDuration);
  });

  it('points go back to normal after HERO ends', () => {
    fillMeter();
    keeper.activateHero();
    keeper.update(0, true, 9);
    expect(keeper.addTrick(spin(180), 'clean', 0)).toBe(100);
  });

  it('reset() during HERO ends it', () => {
    fillMeter();
    keeper.activateHero();
    keeper.reset();
    expect(keeper.state.hero).toEqual({ meter: 0, ready: false, active: false, timeLeft: 0 });
    expect(events[events.length - 1]).toBe('end');
  });
});
