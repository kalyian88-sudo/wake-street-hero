import { describe, expect, it } from 'vitest';
import {
  buyBlocker,
  buyGear,
  canBuy,
  cityStars,
  equipGear,
  isCityUnlocked,
  isEquipped,
  isOwned,
  isSpotUnlocked,
  levelForRep,
  levelTitle,
  RIDER_LEVELS,
  spotStars,
  starsToUnlockSpot,
  totalStars,
  unequipGear,
} from '../../src/career/progress';
import { applyRunResult, buildRunResult, goalReward, REWARDS, scoreCoins, scoreRep } from '../../src/career/rewards';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS, SAVE_VERSION, STARTER_GEAR } from '../../src/config';
import { CITIES } from '../../src/data/cities';
import { GEAR, getGear } from '../../src/data/gear';
import { phuketOldTown } from '../../src/data/spots/phuket_oldtown';
import type { ObjectivesState, RunConfig, SaveData, ScoreState, SpotDef } from '../../src/types';

function makeSave(over: Partial<SaveData> = {}): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    appearance: { ...DEFAULT_APPEARANCE },
    coins: 0,
    rep: 0,
    ownedGear: Object.values(STARTER_GEAR),
    equipped: { ...STARTER_GEAR },
    spots: {},
    career: { dialogsSeen: [], sponsors: {}, tutorialDone: false },
    stats: { totalRuns: 0, totalScore: 0, totalFalls: 0, bestCombo: 0, tricksLanded: {} },
    last: { board: 'wakeboard', power: 'medium', cityId: null, spotId: null },
    ...over,
  };
}

function makeScore(over: Partial<ScoreState> = {}): ScoreState {
  return {
    total: 0,
    comboPoints: 0,
    comboMult: 1,
    comboTimeLeft: 0,
    comboActive: false,
    comboCount: 0,
    bestCombo: 0,
    bestTrick: null,
    tricksLanded: 0,
    falls: 0,
    hero: { meter: 0, ready: false, active: false, timeLeft: 0 },
    ...over,
  };
}

function makeObjectives(done: boolean[], before: boolean[] = [false, false, false, false, false]): ObjectivesState {
  return {
    letters: [true, true, false, false, false, false],
    goals: done.map((d, i) => ({ done: d || before[i], doneBefore: before[i], progress: d || before[i] ? 1 : 0 })),
    chain: [],
    inFilmerZone: null,
  };
}

const SPOT = phuketOldTown; // goals: score 4000, trick backroll, letters, line, clip
const CFG: RunConfig = { spotId: SPOT.id, winchId: 'main', power: 'fast', board: 'wakeskate', mode: 'career' };
const NONE = [false, false, false, false, false];

describe('rewards — score payout', () => {
  it('coins grow with diminishing returns and are capped', () => {
    expect(scoreCoins(0)).toBe(0);
    expect(scoreCoins(-50)).toBe(0);
    expect(scoreCoins(4000)).toBe(63);
    expect(scoreCoins(12000)).toBe(110);
    expect(scoreCoins(30000)).toBe(173);
    expect(scoreCoins(100000)).toBe(316);
    // doubling the score never doubles the coins
    for (const s of [1000, 5000, 20000, 80000]) expect(scoreCoins(2 * s)).toBeLessThan(2 * scoreCoins(s));
    expect(scoreCoins(1e9)).toBe(REWARDS.scoreCoinCap);
  });

  it('rep trickles in: 1 per 1000 points, at most 20 a run', () => {
    expect(scoreRep(999)).toBe(0);
    expect(scoreRep(12500)).toBe(12);
    expect(scoreRep(1e6)).toBe(20);
  });
});

describe('buildRunResult', () => {
  it('a run without goals pays for the score only and does not touch the save', () => {
    const save = makeSave({ coins: 40 });
    const snapshot = JSON.stringify(save);
    const r = buildRunResult(CFG, makeScore({ total: 2500, bestCombo: 1800, tricksLanded: 6, falls: 2 }), makeObjectives(NONE), save, 31.5);
    expect(r).toMatchObject({ config: CFG, score: 2500, bestCombo: 1800, tricksLanded: 6, falls: 2, duration: 31.5, goals: NONE, newGoals: [], stars: 0, newRecord: true });
    expect(r.coins).toBe(scoreCoins(2500));
    expect(r.rep).toBe(2);
    expect(r.letters).toEqual([true, true, false, false, false, false]);
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('newly completed goals pay by type', () => {
    const score = makeScore({ total: 5000 });
    const r = buildRunResult(CFG, score, makeObjectives([true, true, false, false, false]), makeSave(), 40);
    expect(r.goals).toEqual([true, true, false, false, false]);
    expect(r.newGoals).toEqual([0, 1]);
    expect(r.stars).toBe(2);
    expect(r.coins).toBe(goalReward('score').coins + goalReward('trick').coins + scoreCoins(5000));
    expect(r.rep).toBe(goalReward('score').rep + goalReward('trick').rep + 5);
  });

  it('harder goals pay more', () => {
    expect(goalReward('line').coins).toBeGreaterThan(goalReward('letters').coins);
    expect(goalReward('letters').coins).toBeGreaterThan(goalReward('trick').coins);
    expect(goalReward('clip').rep).toBeGreaterThan(goalReward('score').rep);
  });

  it('goals done in an earlier run are kept and not paid twice', () => {
    const save = makeSave({ spots: { [SPOT.id]: { goals: [true, false, true, false, false], bestScore: 9000, bestCombo: 3000, bestTrick: null, runs: 4 } } });
    const before = [true, false, true, false, false];
    const r = buildRunResult(CFG, makeScore({ total: 6000 }), makeObjectives([true, false, false, true, false], before), save, 30);
    expect(r.goals).toEqual([true, false, true, true, false]);
    expect(r.newGoals).toEqual([3]);
    expect(r.stars).toBe(3);
    expect(r.coins).toBe(goalReward('line').coins + scoreCoins(6000));
    expect(r.newRecord).toBe(false);
  });

  it('finishing the fifth goal adds the full-clear bonus — once', () => {
    const before = [true, true, true, true, false];
    const save = makeSave({ spots: { [SPOT.id]: { goals: before, bestScore: 0, bestCombo: 0, bestTrick: null, runs: 1 } } });
    const r = buildRunResult(CFG, makeScore({ total: 0 }), makeObjectives([false, false, false, false, true], before), save, 30);
    expect(r.stars).toBe(5);
    expect(r.coins).toBe(goalReward('clip').coins + REWARDS.fullClear.coins);
    expect(r.rep).toBe(goalReward('clip').rep + REWARDS.fullClear.rep);
    applyRunResult(save, r);
    const again = buildRunResult(CFG, makeScore({ total: 0 }), makeObjectives(NONE, [true, true, true, true, true]), save, 30);
    expect(again.newGoals).toEqual([]);
    expect(again.coins).toBe(0);
    expect(again.stars).toBe(5);
  });

  it('the score goal is double-checked against the final score', () => {
    // objectives did not see the last bank (e.g. finish() banked after the last update)
    const r = buildRunResult(CFG, makeScore({ total: 4000 }), makeObjectives(NONE), makeSave(), 30);
    expect(r.goals[0]).toBe(true);
    expect(r.newGoals).toEqual([0]);
  });

  it('an unbanked pot still counts at the end of the run', () => {
    const r = buildRunResult(CFG, makeScore({ total: 1000, comboActive: true, comboPoints: 800, comboMult: 4, bestCombo: 1000 }), makeObjectives(NONE), makeSave(), 30);
    expect(r.score).toBe(4200);
    expect(r.bestCombo).toBe(3200);
    expect(r.goals[0]).toBe(true);
  });

  it('new record only when the best score is beaten', () => {
    const save = makeSave({ spots: { [SPOT.id]: { goals: NONE, bestScore: 5000, bestCombo: 0, bestTrick: null, runs: 1 } } });
    expect(buildRunResult(CFG, makeScore({ total: 5000 }), makeObjectives(NONE), save, 1).newRecord).toBe(false);
    expect(buildRunResult(CFG, makeScore({ total: 5001 }), makeObjectives(NONE), save, 1).newRecord).toBe(true);
    expect(buildRunResult(CFG, makeScore({ total: 0 }), makeObjectives(NONE), makeSave(), 1).newRecord).toBe(false);
  });

  it('free ride: half the score coins, no rep, no goals', () => {
    const cfg: RunConfig = { ...CFG, mode: 'free' };
    const r = buildRunResult(cfg, makeScore({ total: 12000 }), makeObjectives([true, true, true, true, true]), makeSave(), 30);
    expect(r.newGoals).toEqual([]);
    expect(r.goals).toEqual(NONE);
    expect(r.stars).toBe(0);
    expect(r.coins).toBe(55);
    expect(r.rep).toBe(0);
    expect(r.newRecord).toBe(true);
  });

  it('carries the best trick and the per-trick counts', () => {
    const best = { name: { ru: 'Мобиус', en: 'Mobe' }, points: 950, time: 12 };
    const r = buildRunResult(CFG, makeScore({ total: 100, bestTrick: best, trickCounts: { mobe: 1, backroll: 2 } }), makeObjectives(NONE), makeSave(), 30);
    expect(r.bestTrick).toEqual(best);
    expect(r.bestTrick).not.toBe(best);
    expect(r.trickCounts).toEqual({ mobe: 1, backroll: 2 });
  });
});

describe('applyRunResult', () => {
  it('creates the spot progress and updates coins, rep, stats and last.*', () => {
    const save = makeSave({ coins: 50, rep: 10 });
    const best = { name: { ru: 'Мобиус', en: 'Mobe' }, points: 950, time: 12 };
    const score = makeScore({ total: 5200, bestCombo: 2600, bestTrick: best, tricksLanded: 7, falls: 1, trickCounts: { mobe: 1, backroll: 3 } });
    const r = buildRunResult(CFG, score, makeObjectives([true, true, false, false, false]), save, 42);
    applyRunResult(save, r);
    expect(save.spots[SPOT.id]).toEqual({ goals: [true, true, false, false, false], bestScore: 5200, bestCombo: 2600, bestTrick: { name: best.name, points: 950 }, runs: 1 });
    expect(save.coins).toBe(50 + r.coins);
    expect(save.rep).toBe(10 + r.rep);
    expect(save.stats).toEqual({ totalRuns: 1, totalScore: 5200, totalFalls: 1, bestCombo: 2600, tricksLanded: { mobe: 1, backroll: 3 } });
    expect(save.last).toEqual({ board: 'wakeskate', power: 'fast', cityId: 'phuket', spotId: SPOT.id });
    expect(save.career.tutorialDone).toBe(false);
  });

  it('keeps records and goals from better earlier runs', () => {
    const save = makeSave();
    applyRunResult(save, buildRunResult(CFG, makeScore({ total: 9000, bestCombo: 5000, bestTrick: { name: { ru: 'А', en: 'A' }, points: 1500, time: 1 }, trickCounts: { backroll: 1 } }), makeObjectives([true, false, true, false, false]), save, 30));
    const worse = buildRunResult(CFG, makeScore({ total: 3000, bestCombo: 900, falls: 3, bestTrick: { name: { ru: 'Б', en: 'B' }, points: 400, time: 1 }, trickCounts: { backroll: 2, spin180: 1 } }), makeObjectives([false, true, false, false, false], [true, false, true, false, false]), save, 30);
    applyRunResult(save, worse);
    const sp = save.spots[SPOT.id];
    expect(sp.goals).toEqual([true, true, true, false, false]);
    expect(sp.bestScore).toBe(9000);
    expect(sp.bestCombo).toBe(5000);
    expect(sp.bestTrick?.points).toBe(1500);
    expect(sp.runs).toBe(2);
    expect(save.stats).toMatchObject({ totalRuns: 2, totalScore: 12000, totalFalls: 3, bestCombo: 5000, tricksLanded: { backroll: 3, spin180: 1 } });
  });

  it('a finished tutorial run marks the tutorial done', () => {
    const save = makeSave();
    applyRunResult(save, buildRunResult({ ...CFG, mode: 'tutorial' }, makeScore({ total: 500 }), makeObjectives(NONE), save, 30));
    expect(save.career.tutorialDone).toBe(true);
  });

  it('free ride keeps the stars as they were but still counts records and stats', () => {
    const save = makeSave({ spots: { [SPOT.id]: { goals: [true, false, false, false, false], bestScore: 100, bestCombo: 0, bestTrick: null, runs: 1 } } });
    applyRunResult(save, buildRunResult({ ...CFG, mode: 'free' }, makeScore({ total: 8000 }), makeObjectives(NONE, [true, false, false, false, false]), save, 30));
    expect(save.spots[SPOT.id].goals).toEqual([true, false, false, false, false]);
    expect(save.spots[SPOT.id].bestScore).toBe(8000);
    expect(save.stats.totalRuns).toBe(1);
  });
});

describe('economy balance', () => {
  const price = (id: string): number => getGear(id)?.price ?? NaN;
  const paid = GEAR.filter((g) => g.price > 0).map((g) => g.price);

  it('a mid-tier item takes about 4–6 good runs', () => {
    // a good early run: 12 000 points; the first five runs on a spot also land about three goals
    const perRun = scoreCoins(12000);
    const firstFive = 5 * perRun + goalReward('score').coins + goalReward('trick').coins + goalReward('letters').coins;
    const mid = [price('bd_jib'), price('wb_butter'), price('ws_flick'), price('vest_impact'), price('hoodie_street')];
    for (const p of mid) {
      expect(p).toBeLessThanOrEqual(firstFive);
      expect(p / perRun).toBeGreaterThanOrEqual(4);
    }
  });

  it('a top-tier item is within reach after most of a city', () => {
    const goalsOfASpot = (['score', 'trick', 'letters', 'line', 'clip'] as const).reduce((a, t) => a + goalReward(t).coins, 0);
    // 3 of 4 spots fully cleared, ~8 runs each at ~10 000 points
    const mostOfACity = 3 * (goalsOfASpot + REWARDS.fullClear.coins) + 24 * scoreCoins(10000);
    const top = Math.max(...paid);
    expect(top).toBeGreaterThan(2500);
    expect(top).toBeLessThanOrEqual(mostOfACity);
    // …but not after a single spot
    expect(top).toBeGreaterThan(goalsOfASpot + REWARDS.fullClear.coins + 8 * scoreCoins(10000));
  });

  it('level-locked gear opens up along the career, the top items around the end of the first city', () => {
    const repOfASpot = (['score', 'trick', 'letters', 'line', 'clip'] as const).reduce((a, t) => a + goalReward(t).rep, 0) + REWARDS.fullClear.rep;
    const cityOne = levelForRep(4 * repOfASpot + 30 * 10).level;
    const maxLock = Math.max(...GEAR.map((g) => g.unlockLevel ?? 1));
    expect(cityOne).toBeGreaterThanOrEqual(5);
    expect(maxLock).toBeLessThanOrEqual(cityOne + 1);
    expect(maxLock).toBeLessThanOrEqual(RIDER_LEVELS.length);
    // the whole game (12 spots) gets a rider to Street Hero
    expect(levelForRep(12 * repOfASpot + 120 * 10).level).toBe(RIDER_LEVELS.length);
  });
});

describe('progress — stars and unlocks', () => {
  const save = makeSave({
    spots: {
      phuket_oldtown: { goals: [true, true, true, false, false], bestScore: 0, bestCombo: 0, bestTrick: null, runs: 1 },
      some_other_spot: { goals: [true, false, false, false, true], bestScore: 0, bestCombo: 0, bestTrick: null, runs: 1 },
    },
  });

  it('counts stars per spot, per city and in total', () => {
    expect(spotStars(save, 'phuket_oldtown')).toBe(3);
    expect(spotStars(save, 'nope')).toBe(0);
    expect(cityStars(save, 'phuket')).toBe(3);
    expect(cityStars(save, 'atlantis')).toBe(0);
    expect(totalStars(save)).toBe(5);
    expect(totalStars(makeSave())).toBe(0);
  });

  it('cities open by total stars', () => {
    const [phuket, russia, europe] = CITIES;
    expect(isCityUnlocked(makeSave(), phuket)).toBe(true);
    expect(isCityUnlocked(save, russia)).toBe(false);
    const rich = makeSave({ spots: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`s${n}`, { goals: [true, true, true, true, true], bestScore: 0, bestCombo: 0, bestTrick: null, runs: 1 }])) });
    expect(totalStars(rich)).toBe(25);
    expect(isCityUnlocked(rich, russia)).toBe(true);
    expect(isCityUnlocked(rich, europe)).toBe(true);
  });

  it('a spot needs its own stars AND an open city', () => {
    expect(isSpotUnlocked(makeSave(), phuketOldTown)).toBe(true);
    const second: SpotDef = { ...phuketOldTown, id: 'phuket_2', unlockStars: 4 };
    expect(isSpotUnlocked(makeSave(), second)).toBe(false);
    expect(starsToUnlockSpot(makeSave(), second)).toBe(4);
    expect(isSpotUnlocked(save, second)).toBe(true);
    expect(starsToUnlockSpot(save, second)).toBe(0);
    const farAway: SpotDef = { ...phuketOldTown, id: 'ru_1', cityId: 'russia', unlockStars: 0 };
    expect(isSpotUnlocked(save, farAway)).toBe(false);
    expect(starsToUnlockSpot(save, farAway)).toBe(CITIES[1].unlockStars - 5);
  });

  it('accepts ids as well as definitions; unknown ids are locked', () => {
    expect(isCityUnlocked(makeSave(), 'phuket')).toBe(true);
    expect(isCityUnlocked(makeSave(), 'russia')).toBe(false);
    expect(isCityUnlocked(makeSave(), 'atlantis')).toBe(false);
    expect(isSpotUnlocked(makeSave(), 'phuket_oldtown')).toBe(true);
    expect(isSpotUnlocked(makeSave(), 'no_such_spot')).toBe(false);
    expect(cityStars(save, CITIES[0])).toBe(3);
  });
});

describe('progress — rider levels', () => {
  it('about ten levels from Local to Street Hero, thresholds strictly growing', () => {
    expect(RIDER_LEVELS.length).toBeGreaterThanOrEqual(9);
    expect(RIDER_LEVELS.length).toBeLessThanOrEqual(11);
    expect(RIDER_LEVELS[0]).toEqual({ rep: 0, title: { ru: 'Локал', en: 'Local' } });
    expect(RIDER_LEVELS[RIDER_LEVELS.length - 1].title.en).toBe('Street Hero');
    for (let i = 1; i < RIDER_LEVELS.length; i++) expect(RIDER_LEVELS[i].rep).toBeGreaterThan(RIDER_LEVELS[i - 1].rep);
    for (const lv of RIDER_LEVELS) {
      expect(lv.title.ru.length).toBeGreaterThan(0);
      expect(lv.title.en.length).toBeGreaterThan(0);
    }
  });

  it('levelForRep gives level, title, bounds and progress', () => {
    expect(levelForRep(0)).toEqual({ level: 1, title: { ru: 'Локал', en: 'Local' }, current: 0, next: 150, progress: 0, max: false });
    expect(levelForRep(75)).toMatchObject({ level: 1, progress: 0.5 });
    expect(levelForRep(149)).toMatchObject({ level: 1 });
    expect(levelForRep(150)).toMatchObject({ level: 2, current: 150, next: 400, progress: 0 });
    expect(levelForRep(275).progress).toBeCloseTo(0.5, 6);
    const top = levelForRep(1e9);
    expect(top).toMatchObject({ level: RIDER_LEVELS.length, current: 3900, next: 3900, progress: 1, max: true });
    expect(top.title.en).toBe('Street Hero');
    expect(levelForRep(-5).level).toBe(1);
    expect(levelForRep(NaN).level).toBe(1);
    expect(levelTitle(3)).toEqual(RIDER_LEVELS[2].title);
    expect(levelTitle(99).en).toBe('Street Hero');
  });
});

describe('progress — shop', () => {
  const cheap = getGear('tee_logo')!;
  const locked = getGear('bd_hero')!;

  it('canBuy: needs coins, the level and not owning it yet', () => {
    expect(canBuy(makeSave({ coins: cheap.price - 1 }), cheap)).toBe(false);
    expect(buyBlocker(makeSave({ coins: cheap.price - 1 }), cheap)).toBe('coins');
    expect(canBuy(makeSave({ coins: cheap.price }), cheap)).toBe(true);
    expect(buyBlocker(makeSave({ coins: 99999 }), locked)).toBe('level');
    expect(canBuy(makeSave({ coins: 99999, rep: RIDER_LEVELS[(locked.unlockLevel ?? 1) - 1].rep }), locked)).toBe(true);
    expect(buyBlocker(makeSave({ coins: 99999 }), getGear('wb_street'))).toBe('owned');
    expect(buyBlocker(makeSave(), undefined)).toBe('unknown');
    expect(canBuy(makeSave(), null)).toBe(false);
  });

  it('buyGear takes the coins and adds the item — once', () => {
    const save = makeSave({ coins: 1000 });
    expect(buyGear(save, 'tee_logo')).toEqual({ ok: true });
    expect(save.coins).toBe(1000 - cheap.price);
    expect(isOwned(save, 'tee_logo')).toBe(true);
    expect(save.equipped.apparel).toBe(STARTER_GEAR.apparel);
    expect(buyGear(save, 'tee_logo')).toEqual({ ok: false, reason: 'owned' });
    expect(save.coins).toBe(1000 - cheap.price);
    expect(save.ownedGear.filter((id) => id === 'tee_logo')).toHaveLength(1);
  });

  it('buyGear refuses with a reason and changes nothing', () => {
    const save = makeSave({ coins: 10 });
    expect(buyGear(save, 'wb_butter')).toEqual({ ok: false, reason: 'coins' });
    expect(buyGear(save, 'wb_hero')).toEqual({ ok: false, reason: 'level' });
    expect(buyGear(save, 'no_such_item')).toEqual({ ok: false, reason: 'unknown' });
    expect(save.coins).toBe(10);
    expect(save.ownedGear).toEqual(Object.values(STARTER_GEAR));
  });

  it('equipGear puts owned items into their slot', () => {
    const save = makeSave({ coins: 5000 });
    expect(equipGear(save, 'wb_butter')).toBe(false);
    buyGear(save, 'wb_butter');
    buyGear(save, 'cap_crew');
    expect(equipGear(save, 'wb_butter')).toBe(true);
    expect(equipGear(save, 'cap_crew')).toBe(true);
    expect(save.equipped).toMatchObject({ wakeboard: 'wb_butter', helmet: 'cap_crew', bindings: 'bd_classic', wakeskate: 'ws_plank' });
    expect(isEquipped(save, 'wb_butter')).toBe(true);
    expect(isEquipped(save, 'wb_street')).toBe(false);
    expect(equipGear(save, 'nope')).toBe(false);
  });

  it('vest, helmet and apparel can be taken off; boards and bindings cannot', () => {
    const save = makeSave();
    expect(unequipGear(save, 'vest')).toBe(true);
    expect(unequipGear(save, 'helmet')).toBe(true);
    expect(save.equipped.vest).toBeNull();
    expect(save.equipped.helmet).toBeNull();
    expect(unequipGear(save, 'wakeboard')).toBe(false);
    expect(unequipGear(save, 'bindings')).toBe(false);
    expect(save.equipped.wakeboard).toBe('wb_street');
  });
});
