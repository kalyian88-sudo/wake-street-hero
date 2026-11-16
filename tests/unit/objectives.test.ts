import { beforeEach, describe, expect, it } from 'vitest';
import { createRunObjectives } from '../../src/career/objectives';
import { GAME } from '../../src/config';
import { EventBus, type GameEvents } from '../../src/core/events';
import { createRiderSimState } from '../../src/core/riderState';
import { phuketOldTown } from '../../src/data/spots/phuket_oldtown';
import { createScoreKeeper, resolveTrick } from '../../src/tricks/scoring';
import type { IRunObjectives, IScoreKeeper, ResolvedTrick, RiderSimState, RunConfig, SpotDef, TrickRecord } from '../../src/types';

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

const spin360 = (): ResolvedTrick => resolveTrick(rec({ spinDeg: 360 }));
const spin180 = (): ResolvedTrick => resolveTrick(rec({ spinDeg: 180 }));
const backroll = (): ResolvedTrick => resolveTrick(rec({ inverts: [{ id: 'backroll', count: 1 }] }));
const mobe = (): ResolvedTrick => resolveTrick(rec({ spinDeg: 360, inverts: [{ id: 'backroll', count: 1 }] }));
const grind = (): ResolvedTrick => resolveTrick(rec({ context: 'rail', rail: { obstacleId: 'rail_a', kind: 'rail', stances: ['fifty'], distance: 6, pressTime: 0 } }));

/** A straight 100 m canal: kicker at z=20, rail at z=40, ledge at z=60, gap at z=80; filmer zone around z=50. */
const SPOT: SpotDef = {
  ...phuketOldTown,
  id: 'test_spot',
  obstacles: [
    { kind: 'kicker', id: 'kicker_a', pos: [0, 0, 20], width: 2, length: 4, height: 1, style: 'wood' },
    { kind: 'rail', id: 'rail_a', path: [[0, 0.4, 40], [0, 0.4, 48]], style: 'round' },
    { kind: 'ledge', id: 'ledge_a', pos: [0, 0, 60], size: [1, 0.5, 6], surface: 'concrete' },
    { kind: 'gap', id: 'gap_a', name: { ru: 'Гэп', en: 'Gap' }, shape: { kind: 'rect', center: [0, 80], size: [10, 4] }, points: 300 },
    { kind: 'stairs', id: 'stairs_a', pos: [4, 0, 90], width: 2, steps: 4, stepH: 0.15, stepD: 0.4, handrail: 'left', surface: 'stone' },
  ],
  winchPoints: [
    { id: 'main', name: { ru: 'Прямо', en: 'Straight' }, pos: [0, 0.9, 110], start: [0, 0, 0], difficulty: 1 },
    { id: 'side', name: { ru: 'Сбоку', en: 'Side' }, pos: [8, 0.9, 100], start: [-3, 0, 0], difficulty: 2 },
  ],
  letters: [
    { index: 0, pos: [0, 1, 10] },
    { index: 1, pos: [0, 3, 22] },
    { index: 2, pos: [0, 1.4, 44] },
    { index: 3, pos: [0, 1, 63], line: 'main' },
    { index: 3, pos: [6, 1, 63], line: 'side' },
    { index: 4, pos: [0, 2, 80] },
    { index: 5, pos: [0, 1, 95] },
  ],
  filmerZones: [{ id: 'cam', pos: [8, 1, 50], center: [0, 50], radius: 10 }],
  goals: [
    { type: 'score', target: 2000 },
    { type: 'trick', trickId: 'backroll' },
    { type: 'letters' },
    { type: 'line', obstacles: ['kicker_a', 'rail_a', 'ledge_a'] },
    { type: 'clip', zone: 'cam', minPoints: 400 },
  ],
};

const CFG: RunConfig = { spotId: SPOT.id, winchId: 'main', power: 'medium', board: 'wakeboard', mode: 'career' };
const P = (x: number, y: number, z: number): { x: number; y: number; z: number } => ({ x, y, z });

let bus: EventBus;
let score: IScoreKeeper;
let rider: RiderSimState;
let obj: IRunObjectives;
let seen: { type: string; payload: unknown }[];

function setup(config: RunConfig = CFG, doneBefore: boolean[] = [false, false, false, false, false], spot: SpotDef = SPOT): void {
  bus = new EventBus();
  score = createScoreKeeper(bus);
  rider = createRiderSimState(config.board);
  rider.mode = 'water';
  obj = createRunObjectives(spot, config, doneBefore, bus);
  seen = [];
  for (const type of ['letter:collect', 'goal:complete', 'clip:captured', 'line:progress'] as const) {
    bus.on(type, (payload: GameEvents[typeof type]) => seen.push({ type, payload }));
  }
}

function ride(x: number, y: number, z: number, mode: RiderSimState['mode'] = 'water'): void {
  rider.mode = mode;
  rider.pos.set(x, y, z);
  obj.update(rider, score.state, 1 / 60);
}

const events = (type: string): unknown[] => seen.filter((e) => e.type === type).map((e) => e.payload);
const goal = (i: number): { done: boolean; doneBefore: boolean; progress: number } => obj.state.goals[i];

beforeEach(() => setup());

describe('objectives — initial state', () => {
  it('six letter flags, five goals, empty chain', () => {
    expect(obj.state.letters).toEqual([false, false, false, false, false, false]);
    expect(obj.state.goals).toHaveLength(5);
    expect(obj.state.goals.every((g) => !g.done && !g.doneBefore && g.progress === 0)).toBe(true);
    expect(obj.state.chain).toEqual([]);
    expect(obj.state.inFilmerZone).toBeNull();
  });

  it('goals done in an earlier run start done', () => {
    setup(CFG, [true, false, true, false, false]);
    expect(goal(0)).toEqual({ done: true, doneBefore: true, progress: 1 });
    expect(goal(1)).toEqual({ done: false, doneBefore: false, progress: 0 });
    expect(goal(2).done).toBe(true);
  });
});

describe('objectives — letters', () => {
  it('picks a letter up inside GAME.letterRadius of the body', () => {
    ride(0, 0, 0);
    ride(0, 0, 10 - GAME.letterRadius - 0.3);
    expect(obj.state.letters[0]).toBe(false);
    ride(0, 0, 9);
    expect(obj.state.letters[0]).toBe(true);
    expect(events('letter:collect')).toEqual([{ index: 0, pos: P(0, 1, 10), count: 1 }]);
  });

  it('the body reaches about a metre above the board — higher letters need air', () => {
    ride(0, 0, 21);
    ride(0, 0, 22); // letter at y = 3: 1.8 m above the top of the body
    expect(obj.state.letters[1]).toBe(false);
    ride(0, 1.9, 22, 'air');
    expect(obj.state.letters[1]).toBe(true);
  });

  it('a fast rider cannot tunnel through a letter between two frames', () => {
    ride(0, 0, 5);
    ride(0, 0, 13); // 8 m in one step, the letter at z = 10 is in between
    expect(obj.state.letters[0]).toBe(true);
  });

  it('a respawn jump is not a sweep', () => {
    ride(0, 0, 0);
    ride(0, 0, 30); // teleported past the letter at z = 10 and z = 22
    expect(obj.state.letters[0]).toBe(false);
  });

  it('only letters of the active line count', () => {
    ride(6, 0, 62.5);
    ride(6, 0, 63);
    expect(obj.state.letters[3]).toBe(false);
    ride(0, 0, 62.5);
    ride(0, 0, 63);
    expect(obj.state.letters[3]).toBe(true);
    setup({ ...CFG, winchId: 'side' });
    ride(6, 0, 62.5);
    ride(6, 0, 63);
    expect(obj.state.letters[3]).toBe(true);
  });

  it('nothing is picked up while waiting or bailing', () => {
    ride(0, 0, 10, 'waiting');
    ride(0, 0, 10, 'bail');
    expect(obj.state.letters[0]).toBe(false);
    ride(0, 0, 10, 'water');
    expect(obj.state.letters[0]).toBe(true);
  });

  it('all six in one run complete the letters goal', () => {
    const stops: [number, number, number][] = [
      [0, 0, 10],
      [0, 2, 22],
      [0, 0.5, 44],
      [0, 0, 63],
      [0, 1.5, 80],
    ];
    for (const [x, y, z] of stops) ride(x, y, z);
    expect(goal(2).done).toBe(false);
    expect(goal(2).progress).toBeCloseTo(5 / 6, 6);
    ride(0, 0, 95);
    expect(obj.state.letters).toEqual([true, true, true, true, true, true]);
    expect(goal(2)).toEqual({ done: true, doneBefore: false, progress: 1 });
    expect(events('letter:collect')).toHaveLength(6);
    expect(events('goal:complete')).toEqual([{ index: 2, first: true }]);
  });

  it('a letter is collected once', () => {
    ride(0, 0, 10);
    ride(0, 0, 10.2);
    ride(0, 0, 9.8);
    expect(events('letter:collect')).toHaveLength(1);
  });
});

describe('objectives — score goal', () => {
  it('counts the BANKED score only', () => {
    score.addTrick(mobe(), 'clean', 1); // 950 in the pot
    score.addTrick(backroll(), 'clean', 2); // +500, ×3
    ride(0, 0, 5);
    expect(score.state.comboPoints * score.state.comboMult).toBeGreaterThan(2000);
    expect(goal(0).done).toBe(false);
    expect(goal(0).progress).toBe(0);
    score.update(3.1, false);
    expect(score.state.total).toBe(1450 * 3);
    // completed straight from the 'score:bank' event, before the next update
    expect(goal(0)).toEqual({ done: true, doneBefore: false, progress: 1 });
    expect(events('goal:complete')).toContainEqual({ index: 0, first: true });
  });

  it('shows progress = total / target', () => {
    score.addTrick(spin360(), 'clean', 1);
    score.finish();
    ride(0, 0, 5);
    expect(goal(0).progress).toBeCloseTo(250 / 2000, 6);
    expect(goal(0).done).toBe(false);
  });

  it('a burned pot does not count', () => {
    score.addTrick(mobe(), 'clean', 1);
    score.addTrick(backroll(), 'clean', 2);
    score.bail();
    ride(0, 0, 5);
    expect(goal(0).progress).toBe(0);
  });
});

describe('objectives — trick goal', () => {
  it('any landed trick whose ids include the trick completes it', () => {
    score.addTrick(spin360(), 'clean', 1);
    expect(goal(1).done).toBe(false);
    score.addTrick(mobe(), 'sketchy', 2); // a Mobe contains a backroll; sketchy still counts
    expect(goal(1)).toEqual({ done: true, doneBefore: false, progress: 1 });
    expect(events('goal:complete')).toEqual([{ index: 1, first: true }]);
  });

  it('respects the board restriction', () => {
    const spot: SpotDef = { ...SPOT, goals: [{ type: 'trick', trickId: 'spin360', board: 'wakeskate' }, ...SPOT.goals.slice(1)] };
    setup(CFG, undefined, spot);
    score.addTrick(spin360(), 'clean', 1);
    expect(goal(0).done).toBe(false);
    setup({ ...CFG, board: 'wakeskate' }, undefined, spot);
    score.addTrick(resolveTrick(rec({ board: 'wakeskate', spinDeg: 360 })), 'clean', 1);
    expect(goal(0).done).toBe(true);
  });

  it('a goal done before fires again with first = false and stays done', () => {
    setup(CFG, [false, true, false, false, false]);
    score.addTrick(backroll(), 'clean', 1);
    score.addTrick(backroll(), 'clean', 2);
    expect(goal(1)).toEqual({ done: true, doneBefore: true, progress: 1 });
    expect(events('goal:complete')).toEqual([{ index: 1, first: false }]);
  });
});

describe('objectives — line goal (obstacles linked in one combo)', () => {
  const takeoff = (id: string): void => bus.emit('sim:takeoff', { kind: 'kicker', pos: P(0, 1, 24), speed: 9, obstacleId: id });
  const railEnter = (id: string): void => bus.emit('sim:railEnter', { obstacleId: id, kind: 'rail', pos: P(0, 0.4, 40), material: 'metal' });

  it('completes when every obstacle is used inside one unbroken combo', () => {
    takeoff('kicker_a');
    expect(obj.state.chain).toEqual([]); // nothing landed yet
    score.addTrick(spin360(), 'clean', 1);
    expect(obj.state.chain).toEqual(['kicker_a']);
    expect(goal(3).progress).toBeCloseTo(1 / 3, 6);
    railEnter('rail_a');
    score.addTrick(grind(), 'clean', 2);
    expect(obj.state.chain).toEqual(['kicker_a', 'rail_a']);
    expect(goal(3).done).toBe(false);
    railEnter('ledge_a');
    score.addTrick(grind(), 'clean', 3);
    expect(goal(3)).toEqual({ done: true, doneBefore: false, progress: 1 });
    expect(events('line:progress')).toEqual([
      { chain: ['kicker_a'], total: 3 },
      { chain: ['kicker_a', 'rail_a'], total: 3 },
      { chain: ['kicker_a', 'rail_a', 'ledge_a'], total: 3 },
    ]);
    expect(events('goal:complete')).toEqual([{ index: 3, first: true }]);
  });

  it('banking the combo resets the chain', () => {
    takeoff('kicker_a');
    score.addTrick(spin360(), 'clean', 1);
    railEnter('rail_a');
    score.addTrick(grind(), 'clean', 2);
    score.update(3.1, false); // window ran out → banked
    expect(obj.state.chain).toEqual([]);
    expect(goal(3).progress).toBe(0);
    railEnter('ledge_a');
    score.addTrick(grind(), 'clean', 6);
    expect(obj.state.chain).toEqual(['ledge_a']);
    expect(goal(3).done).toBe(false);
    expect(events('line:progress')).toContainEqual({ chain: [], total: 3 });
  });

  it('a bail resets the chain', () => {
    takeoff('kicker_a');
    score.addTrick(spin360(), 'clean', 1);
    railEnter('rail_a');
    score.bail(); // fell off the rail: 'score:lost'
    expect(obj.state.chain).toEqual([]);
    railEnter('rail_a');
    score.addTrick(grind(), 'clean', 5);
    railEnter('ledge_a');
    score.addTrick(grind(), 'clean', 6);
    expect(obj.state.chain).toEqual(['rail_a', 'ledge_a']);
    expect(goal(3).done).toBe(false);
  });

  it('a bail with no combo running still forgets the obstacle that was touched', () => {
    railEnter('rail_a');
    bus.emit('sim:bail', { reason: 'balance', pos: P(0, 0, 42), surface: 'water', intensity: 0.5, boardLost: false });
    score.bail();
    takeoff('kicker_a');
    score.addTrick(spin360(), 'clean', 1);
    expect(obj.state.chain).toEqual(['kicker_a']);
  });

  it('an obstacle only counts once a trick is landed off it', () => {
    takeoff('kicker_a');
    bus.emit('sim:land', { quality: 'clean', impact: 5, pos: P(0, 0, 30), surface: 'water', onto: 'water', hadTrick: false });
    railEnter('rail_a'); // the kicker air had no trick: forgotten at the next touch
    score.addTrick(grind(), 'clean', 2);
    expect(obj.state.chain).toEqual(['rail_a']);
  });

  it('gaps, walls and slides over a ledge count as touches; unknown ids are ignored', () => {
    const spot: SpotDef = { ...SPOT, goals: [...SPOT.goals.slice(0, 3), { type: 'line', obstacles: ['kicker_a', 'gap_a', 'ledge_a', 'stairs_a'] }, SPOT.goals[4]] };
    setup(CFG, undefined, spot);
    takeoff('kicker_a');
    bus.emit('sim:gap', { id: 'gap_a', name: { ru: 'Гэп', en: 'Gap' }, points: 300 });
    bus.emit('sim:surface', { from: 'water', to: 'stone', obstacleId: 'quay_left' });
    score.addTrick(spin360(), 'clean', 1);
    expect(obj.state.chain).toEqual(['kicker_a', 'gap_a']);
    bus.emit('sim:surface', { from: 'water', to: 'concrete', obstacleId: 'ledge_a' });
    score.addTrick(spin180(), 'clean', 2);
    // the sim may report a sub-part of an obstacle (a stair handrail): it maps to the obstacle
    bus.emit('sim:railEnter', { obstacleId: 'stairs_a:rail0', kind: 'handrail', pos: P(4, 1, 90), material: 'metal' });
    score.addTrick(grind(), 'clean', 3);
    expect(obj.state.chain).toEqual(['kicker_a', 'gap_a', 'ledge_a', 'stairs_a']);
    expect(goal(3).done).toBe(true);
  });

  it('clearing a gap without a trick still links the kicker it was jumped from (sim event order)', () => {
    const spot: SpotDef = { ...SPOT, goals: [...SPOT.goals.slice(0, 3), { type: 'line', obstacles: ['kicker_a', 'gap_a'] }, SPOT.goals[4]] };
    setup(CFG, undefined, spot);
    const gap = { id: 'gap_a', name: { ru: 'Гэп', en: 'Gap' }, points: 300 };
    // exactly what the sim does at touchdown: land → gap → score → surface change
    takeoff('kicker_a');
    bus.emit('sim:surface', { from: 'wood', to: 'air', obstacleId: 'kicker_a' });
    bus.emit('sim:land', { quality: 'clean', impact: 6, pos: P(0, 0, 84), surface: 'water', onto: 'water', hadTrick: false });
    bus.emit('sim:gap', gap);
    score.addTrick(resolveTrick(rec({ takeoff: 'kicker', gap })), 'clean', 1);
    bus.emit('sim:surface', { from: 'air', to: 'water' });
    expect(obj.state.chain).toEqual(['kicker_a', 'gap_a']);
    expect(goal(3).done).toBe(true);
  });

  it('a no-trick air is forgotten as soon as the board is back on the water', () => {
    takeoff('kicker_a');
    bus.emit('sim:land', { quality: 'clean', impact: 6, pos: P(0, 0, 30), surface: 'water', onto: 'water', hadTrick: false });
    bus.emit('sim:surface', { from: 'air', to: 'water' });
    score.addTrick(resolveTrick(rec({ context: 'surface', spinDeg: 180 })), 'clean', 1); // surface 180 right after
    expect(obj.state.chain).toEqual([]);
  });

  it('a line goal tied to another winch point cannot be done on this line', () => {
    const spot: SpotDef = { ...SPOT, goals: [...SPOT.goals.slice(0, 3), { type: 'line', obstacles: ['kicker_a'], winch: 'side' }, SPOT.goals[4]] };
    setup(CFG, undefined, spot);
    takeoff('kicker_a');
    score.addTrick(spin360(), 'clean', 1);
    expect(goal(3).done).toBe(false);
    setup({ ...CFG, winchId: 'side' }, undefined, spot);
    takeoff('kicker_a');
    score.addTrick(spin360(), 'clean', 1);
    expect(goal(3).done).toBe(true);
  });
});

describe('objectives — filmer clip', () => {
  it('tracks the zone the rider is in', () => {
    ride(0, 0, 30);
    expect(obj.state.inFilmerZone).toBeNull();
    ride(0, 0, 45);
    expect(obj.state.inFilmerZone).toBe('cam');
    ride(0, 0, 61);
    expect(obj.state.inFilmerZone).toBeNull();
  });

  it('a big enough trick landed in the zone is a clip', () => {
    ride(0, 0, 45);
    const trick = backroll();
    score.addTrick(trick, 'clean', 1);
    expect(goal(4)).toEqual({ done: true, doneBefore: false, progress: 1 });
    expect(events('clip:captured')).toEqual([{ zone: 'cam', trick }]);
    expect(events('goal:complete')).toContainEqual({ index: 4, first: true });
  });

  it('too small a trick is not', () => {
    ride(0, 0, 45);
    score.addTrick(spin360(), 'clean', 1); // 250 < 400
    expect(goal(4).done).toBe(false);
    expect(events('clip:captured')).toEqual([]);
  });

  it('a trick outside the zone is not', () => {
    ride(0, 0, 20);
    score.addTrick(backroll(), 'clean', 1);
    expect(goal(4).done).toBe(false);
  });

  it('taking off inside the zone and landing just outside still counts', () => {
    ride(0, 0, 58);
    bus.emit('sim:takeoff', { kind: 'pop', pos: P(0, 0, 58), speed: 9 });
    ride(0, 1.5, 60, 'air');
    ride(0, 0.2, 63, 'air'); // left the zone in the air
    score.addTrick(backroll(), 'clean', 1);
    expect(goal(4).done).toBe(true);
  });

  it('riding through the zone earlier does not count for a later trick', () => {
    ride(0, 0, 50);
    ride(0, 0, 65);
    ride(0, 0, 70);
    score.addTrick(backroll(), 'clean', 1);
    expect(goal(4).done).toBe(false);
  });

  it('honours trickId', () => {
    const spot: SpotDef = { ...SPOT, goals: [...SPOT.goals.slice(0, 4), { type: 'clip', zone: 'cam', trickId: 'spin360' }] };
    setup(CFG, undefined, spot);
    ride(0, 0, 50);
    score.addTrick(backroll(), 'clean', 1);
    expect(goal(4).done).toBe(false);
    score.addTrick(spin360(), 'clean', 2);
    expect(goal(4).done).toBe(true);
  });

  it('HERO-doubled points can lift a trick over minPoints', () => {
    ride(0, 0, 50);
    const trick = spin360();
    bus.emit('score:trick', { trick, awarded: 500, landing: 'clean', stale: 1, comboPoints: 500, comboMult: 1, time: 1 });
    expect(goal(4).done).toBe(true);
  });
});

describe('objectives — modes and lifetime', () => {
  it('free ride tracks letters and nothing else', () => {
    setup({ ...CFG, mode: 'free' }, [true, false, false, false, false]);
    ride(0, 0, 10);
    expect(obj.state.letters[0]).toBe(true);
    ride(0, 0, 52);
    expect(obj.state.inFilmerZone).toBe('cam');
    bus.emit('sim:takeoff', { kind: 'kicker', pos: P(0, 1, 24), speed: 9, obstacleId: 'kicker_a' });
    score.addTrick(mobe(), 'clean', 1);
    score.addTrick(backroll(), 'clean', 2);
    score.finish();
    ride(0, 0, 53);
    expect(obj.state.goals.map((g) => g.done)).toEqual([true, false, false, false, false]);
    expect(obj.state.chain).toEqual([]);
    expect(events('goal:complete')).toEqual([]);
    expect(events('clip:captured')).toEqual([]);
    expect(events('letter:collect')).toHaveLength(1);
  });

  it('dispose() stops listening', () => {
    obj.dispose();
    score.addTrick(backroll(), 'clean', 1);
    expect(goal(1).done).toBe(false);
  });

  it('works on the real Old Town spot: its goals can all be completed', () => {
    setup({ ...CFG, spotId: phuketOldTown.id }, undefined, phuketOldTown);
    // letters: fly through every one of them
    for (const lt of phuketOldTown.letters) {
      ride(lt.pos[0], lt.pos[1] - 0.6, lt.pos[2] - 1, 'air');
      ride(lt.pos[0], lt.pos[1] - 0.6, lt.pos[2], 'air');
    }
    // line: kicker → rail → ledge in one combo, with a backroll off the kicker
    bus.emit('sim:takeoff', { kind: 'kicker', pos: P(0, 1.3, 29), speed: 9, obstacleId: 'kicker_main' });
    score.addTrick(backroll(), 'clean', 1);
    bus.emit('sim:railEnter', { obstacleId: 'rail_red', kind: 'rail', pos: P(-3, 0.5, 42), material: 'metal' });
    score.addTrick(grind(), 'clean', 2);
    bus.emit('sim:railEnter', { obstacleId: 'ledge_block', kind: 'ledge', pos: P(3, 0.55, 70), material: 'stone' });
    score.addTrick(grind(), 'clean', 3);
    // clip: a 600+ trick inside the gap camera zone
    ride(0, 0, 90);
    score.addTrick(mobe(), 'clean', 4);
    score.finish();
    ride(0, 0, 100);
    expect(obj.state.goals.map((g) => g.done)).toEqual([true, true, true, true, true]);
    expect(events('goal:complete')).toHaveLength(5);
  });
});
