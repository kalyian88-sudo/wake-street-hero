import { beforeEach, describe, expect, it } from 'vitest';
import { GAME } from '../../src/config';
import { EventBus, type GameEvents } from '../../src/core/events';
import { createScoreKeeper, resolveTrick, SCORE_RULES, trickKey } from '../../src/tricks/scoring';
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
const grab = (id: 'indy' | 'melon' | 'mute' | 'tail' | 'nose' | 'stalefish'): ResolvedTrick => resolveTrick(rec({ grabs: [{ id, hold: 0 }] }));
const backroll = (): ResolvedTrick => resolveTrick(rec({ inverts: [{ id: 'backroll', count: 1 }] }));
const surface = (): ResolvedTrick => resolveTrick(rec({ context: 'surface', spinDeg: 180 }));

let bus: EventBus;
let keeper: IScoreKeeper;
let log: { [K in keyof GameEvents]?: GameEvents[K][] };

function listen<K extends keyof GameEvents>(type: K): GameEvents[K][] {
  const list: GameEvents[K][] = [];
  (log as Record<string, unknown>)[type] = list;
  bus.on(type, (e) => list.push(e));
  return list;
}

beforeEach(() => {
  bus = new EventBus();
  keeper = createScoreKeeper(bus);
  log = {};
});

describe('score keeper — pot, multiplier, window', () => {
  it('starts empty', () => {
    expect(keeper.state.total).toBe(0);
    expect(keeper.state.comboActive).toBe(false);
    expect(keeper.state.comboMult).toBe(1);
    expect(keeper.state.hero).toEqual({ meter: 0, ready: false, active: false, timeLeft: 0 });
  });

  it('a single trick opens a combo at ×1 and reports it', () => {
    const tricks = listen('score:trick');
    const got = keeper.addTrick(spin(360), 'clean', 12.5);
    expect(got).toBe(250);
    expect(keeper.state.comboActive).toBe(true);
    expect(keeper.state.comboPoints).toBe(250);
    expect(keeper.state.comboMult).toBe(1);
    expect(keeper.state.comboCount).toBe(1);
    expect(keeper.state.comboTimeLeft).toBe(GAME.comboWindow);
    expect(keeper.state.total).toBe(0);
    expect(tricks).toHaveLength(1);
    expect(tricks[0]).toMatchObject({ awarded: 250, landing: 'clean', stale: 1, comboPoints: 250, comboMult: 1, time: 12.5 });
    expect(tricks[0].trick.id).toBe('spin360');
  });

  it('the multiplier grows by the number of elements of each trick', () => {
    keeper.addTrick(spin(180), 'clean', 1); // 1 element
    expect(keeper.state.comboMult).toBe(1);
    keeper.addTrick(resolveTrick(rec({ spinDeg: 360, grabs: [{ id: 'indy', hold: 0 }] })), 'clean', 2); // +2
    expect(keeper.state.comboMult).toBe(3);
    keeper.addTrick(resolveTrick(rec({ spinDeg: 360, inverts: [{ id: 'backroll', count: 1 }], grabs: [{ id: 'mute', hold: 0 }] })), 'clean', 3); // Mobe Mute: +3
    expect(keeper.state.comboMult).toBe(6);
    expect(keeper.state.comboCount).toBe(6);
  });

  it('a trick without `elements` counts as one', () => {
    const plain: ResolvedTrick = { id: 'x', ids: ['x'], name: { ru: 'x', en: 'x' }, points: 100, parts: [], tier: 1 };
    keeper.addTrick(plain, 'clean', 0);
    keeper.addTrick({ ...plain, id: 'y', ids: ['y'] }, 'clean', 0);
    expect(keeper.state.comboMult).toBe(2);
  });

  it('caps the multiplier at ×12', () => {
    const ids = ['indy', 'melon', 'mute', 'tail', 'nose', 'stalefish'] as const;
    for (let i = 0; i < 20; i++) keeper.addTrick(resolveTrick(rec({ spinDeg: 180 * (1 + (i % 6)), grabs: [{ id: ids[(i * 5) % 6], hold: 0 }] })), 'clean', i);
    expect(keeper.state.comboCount).toBeGreaterThan(12);
    expect(keeper.state.comboMult).toBe(SCORE_RULES.multCap);
    expect(SCORE_RULES.multCap).toBe(12);
  });

  it('banks pot × multiplier when the 3 s window runs out', () => {
    const banks = listen('score:bank');
    keeper.addTrick(spin(360), 'clean', 1); // 250
    keeper.addTrick(backroll(), 'clean', 2); // 500
    keeper.update(1, false);
    keeper.update(1, false);
    expect(keeper.state.comboActive).toBe(true);
    expect(keeper.state.comboTimeLeft).toBeCloseTo(1, 6);
    expect(banks).toHaveLength(0);
    keeper.update(1.01, false);
    expect(keeper.state.comboActive).toBe(false);
    expect(keeper.state.total).toBe(1500);
    expect(keeper.state.comboPoints).toBe(0);
    expect(keeper.state.comboMult).toBe(1);
    expect(keeper.state.bestCombo).toBe(1500);
    expect(banks).toEqual([{ points: 750, mult: 2, banked: 1500, total: 1500, count: 2 }]);
  });

  it('the window does not run while hold is true (airborne / rail / wall)', () => {
    keeper.addTrick(spin(360), 'clean', 1);
    for (let i = 0; i < 100; i++) keeper.update(0.1, true);
    expect(keeper.state.comboActive).toBe(true);
    expect(keeper.state.comboTimeLeft).toBe(GAME.comboWindow);
    keeper.update(2.9, false);
    expect(keeper.state.comboActive).toBe(true);
    keeper.update(0.2, false);
    expect(keeper.state.comboActive).toBe(false);
    expect(keeper.state.total).toBe(250);
  });

  it('every new trick restarts the window', () => {
    keeper.addTrick(spin(360), 'clean', 1);
    keeper.update(2.5, false);
    keeper.addTrick(backroll(), 'clean', 2);
    expect(keeper.state.comboTimeLeft).toBe(GAME.comboWindow);
    keeper.update(2.5, false);
    expect(keeper.state.comboActive).toBe(true);
  });

  it('runs on sim time: slow-motion dt stretches the window in real time', () => {
    keeper.addTrick(spin(360), 'clean', 1);
    // 5 real seconds at 0.35× = 1.75 sim seconds
    for (let i = 0; i < 50; i++) keeper.update(0.1 * 0.35, false, 0.1);
    expect(keeper.state.comboActive).toBe(true);
    expect(keeper.state.comboTimeLeft).toBeCloseTo(3 - 1.75, 6);
  });

  it('finish() banks whatever is pending', () => {
    const banks = listen('score:bank');
    keeper.addTrick(spin(540), 'clean', 1);
    keeper.addTrick(backroll(), 'clean', 2);
    keeper.finish();
    expect(keeper.state.total).toBe((450 + 500) * 2);
    expect(keeper.state.comboActive).toBe(false);
    expect(banks).toHaveLength(1);
    keeper.finish();
    expect(banks).toHaveLength(1);
  });

  it('two separate combos add up', () => {
    keeper.addTrick(spin(360), 'clean', 1);
    keeper.update(3.1, false);
    keeper.addTrick(backroll(), 'clean', 5);
    keeper.addTrick(spin(180), 'clean', 6);
    keeper.update(3.1, false);
    expect(keeper.state.total).toBe(250 + 600 * 2);
    expect(keeper.state.bestCombo).toBe(1200);
  });
});

describe('score keeper — bail', () => {
  it('burns the pot, counts the fall and keeps the banked total', () => {
    const lost = listen('score:lost');
    keeper.addTrick(spin(360), 'clean', 1);
    keeper.update(3.1, false); // banked 250
    keeper.addTrick(backroll(), 'clean', 5);
    keeper.addTrick(spin(180), 'clean', 6);
    keeper.bail();
    expect(lost).toEqual([{ points: 600, mult: 2 }]);
    expect(keeper.state.total).toBe(250);
    expect(keeper.state.comboActive).toBe(false);
    expect(keeper.state.comboPoints).toBe(0);
    expect(keeper.state.comboMult).toBe(1);
    expect(keeper.state.comboCount).toBe(0);
    expect(keeper.state.falls).toBe(1);
    keeper.update(10, false);
    expect(keeper.state.total).toBe(250);
  });

  it('a bail with no combo only counts the fall', () => {
    const lost = listen('score:lost');
    keeper.bail();
    keeper.bail();
    expect(keeper.state.falls).toBe(2);
    expect(lost).toHaveLength(0);
  });

  it('a landing judged "bail" scores nothing', () => {
    expect(keeper.addTrick(spin(360), 'bail', 1)).toBe(0);
    expect(keeper.state.comboActive).toBe(false);
    expect(keeper.state.tricksLanded).toBe(0);
  });
});

describe('score keeper — landing quality', () => {
  it('perfect ×1.2, clean ×1, sketchy ×0.5', () => {
    expect(keeper.addTrick(backroll(), 'perfect', 1)).toBe(600);
    expect(keeper.addTrick(spin(360), 'clean', 2)).toBe(250);
    expect(keeper.addTrick(spin(540), 'sketchy', 3)).toBe(225);
    expect(keeper.state.comboPoints).toBe(1075);
    expect(keeper.state.comboMult).toBe(3);
  });
});

describe('score keeper — staleness', () => {
  it('repeating a trick pays ×0.7, ×0.5, ×0.35, then ×0.2', () => {
    const tricks = listen('score:trick');
    const got: number[] = [];
    for (let i = 0; i < 6; i++) got.push(keeper.addTrick(spin(360), 'clean', i));
    expect(got).toEqual([250, 175, 125, 88, 50, 50]);
    expect(tricks.map((e) => e.stale)).toEqual([1, 0.7, 0.5, 0.35, 0.2, 0.2]);
  });

  it('each different trick landed restores one step', () => {
    keeper.addTrick(spin(360), 'clean', 0); // level 1
    keeper.addTrick(spin(360), 'clean', 1); // level 2
    keeper.addTrick(spin(360), 'clean', 2); // level 3 (paid ×0.5)
    keeper.addTrick(backroll(), 'clean', 3); // 360 back to level 2
    expect(keeper.addTrick(spin(360), 'clean', 4)).toBe(125); // ×0.5 again, now level 3
    keeper.addTrick(grab('indy'), 'clean', 5); // level 2
    keeper.addTrick(grab('melon'), 'clean', 6); // level 1
    keeper.addTrick(grab('mute'), 'clean', 7); // level 0
    expect(keeper.addTrick(spin(360), 'clean', 8)).toBe(250);
  });

  it('alternating two tricks never goes stale', () => {
    for (let i = 0; i < 4; i++) {
      expect(keeper.addTrick(spin(360), 'clean', i)).toBe(250);
      expect(keeper.addTrick(backroll(), 'clean', i)).toBe(500);
    }
  });

  it('"same trick" is the set of elements: another grab is a new trick, a switch version is not', () => {
    const a = resolveTrick(rec({ spinDeg: 360, grabs: [{ id: 'indy', hold: 0 }] }));
    const b = resolveTrick(rec({ spinDeg: 360, grabs: [{ id: 'melon', hold: 0 }] }));
    const sw = resolveTrick(rec({ spinDeg: 360, grabs: [{ id: 'indy', hold: 0 }], switchTakeoff: true, handlePass: true }));
    expect(trickKey(a)).not.toBe(trickKey(b));
    expect(trickKey(a)).toBe(trickKey(sw));
    const events = listen('score:trick');
    keeper.addTrick(a, 'clean', 0);
    keeper.addTrick(b, 'clean', 1);
    keeper.addTrick(sw, 'clean', 2);
    expect(events.map((e) => e.stale)).toEqual([1, 1, 0.7]);
  });

  it('a trick stale to ×0.5 or worse keeps the combo alive but adds no elements', () => {
    keeper.addTrick(surface(), 'clean', 0);
    keeper.addTrick(surface(), 'clean', 1);
    expect(keeper.state.comboMult).toBe(2);
    keeper.update(2.9, false);
    keeper.addTrick(surface(), 'clean', 2); // ×0.5
    expect(keeper.state.comboMult).toBe(2);
    expect(keeper.state.comboTimeLeft).toBe(GAME.comboWindow);
    for (let i = 0; i < 10; i++) keeper.addTrick(surface(), 'clean', 3 + i);
    expect(keeper.state.comboMult).toBe(2);
    expect(keeper.state.comboPoints).toBe(50 + 35 + 25 + 18 + 10 * 9);
  });
});

describe('score keeper — fillers and bonuses', () => {
  it('a plain air adds points but no multiplier and does not restart the window', () => {
    const air = resolveTrick(rec({ height: 2 }));
    expect(air.elements).toBe(0);
    keeper.addTrick(spin(360), 'clean', 0);
    keeper.update(2, false);
    const got = keeper.addTrick(air, 'clean', 2);
    expect(got).toBe(air.points);
    expect(keeper.state.comboPoints).toBe(250 + air.points);
    expect(keeper.state.comboMult).toBe(1);
    expect(keeper.state.comboTimeLeft).toBeCloseTo(1, 6);
    expect(keeper.state.tricksLanded).toBe(1);
    // …and it never goes stale or makes other tricks recover
    expect(keeper.addTrick(air, 'clean', 3)).toBe(air.points);
  });

  it('a filler with no combo running starts a pot that banks at ×1', () => {
    const air = resolveTrick(rec({ height: 1 }));
    keeper.addTrick(air, 'clean', 0);
    expect(keeper.state.comboActive).toBe(true);
    keeper.update(3.1, false);
    expect(keeper.state.total).toBe(air.points);
  });

  it('addBonus adds flat points to the pot without touching multiplier, window or staleness', () => {
    const bonuses = listen('score:bonus');
    keeper.addTrick(spin(360), 'clean', 0);
    keeper.update(1, false);
    keeper.addBonus('letter', { ru: 'Буква', en: 'Letter' }, 100);
    expect(keeper.state.comboPoints).toBe(350);
    expect(keeper.state.comboMult).toBe(1);
    expect(keeper.state.comboTimeLeft).toBeCloseTo(2, 6);
    expect(bonuses).toEqual([{ id: 'letter', name: { ru: 'Буква', en: 'Letter' }, points: 100 }]);
    keeper.update(2.1, false);
    expect(keeper.state.total).toBe(350);
  });

  it('a bonus on its own banks after the window', () => {
    keeper.addBonus('letter', { ru: 'Буква', en: 'Letter' }, 100);
    expect(keeper.state.comboActive).toBe(true);
    keeper.update(3.1, false);
    expect(keeper.state.total).toBe(100);
  });
});

describe('score keeper — bookkeeping', () => {
  it('tracks best trick, best combo, tricks landed and per-id counts', () => {
    keeper.addTrick(spin(360), 'clean', 3);
    const mobe = resolveTrick(rec({ spinDeg: 360, inverts: [{ id: 'backroll', count: 1 }] }));
    keeper.addTrick(mobe, 'perfect', 7);
    keeper.addTrick(spin(180), 'sketchy', 9);
    expect(keeper.state.tricksLanded).toBe(3);
    expect(keeper.state.bestTrick).toEqual({ name: { ru: 'Мобиус', en: 'Mobe' }, points: Math.round(950 * 1.2), time: 7 });
    expect(keeper.state.trickCounts).toMatchObject({ spin360: 2, mobe: 1, backroll: 1, spin180: 1 });
    keeper.finish();
    expect(keeper.state.bestCombo).toBe(keeper.state.total);
    expect(keeper.state.total).toBe((250 + 1140 + 50) * 4);
  });

  it('reset() clears everything, including staleness', () => {
    keeper.addTrick(spin(360), 'clean', 0);
    keeper.addTrick(spin(360), 'clean', 1);
    keeper.bail();
    keeper.addTrick(spin(360), 'clean', 2);
    keeper.finish();
    const stateRef = keeper.state;
    const heroRef = keeper.state.hero;
    keeper.reset();
    expect(keeper.state).toBe(stateRef);
    expect(keeper.state.hero).toBe(heroRef);
    expect(keeper.state).toMatchObject({ total: 0, comboPoints: 0, comboMult: 1, comboActive: false, comboCount: 0, bestCombo: 0, bestTrick: null, tricksLanded: 0, falls: 0 });
    expect(keeper.state.trickCounts).toEqual({});
    expect(keeper.addTrick(spin(360), 'clean', 0)).toBe(250);
  });
});
