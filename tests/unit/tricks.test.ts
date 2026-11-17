import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../src/data/spots';
import { EXTRA_TRICKS, getTrick, TRICKS, TRICK_WORDS } from '../../src/data/tricks';
import { resolveTrick } from '../../src/tricks/scoring';
import { FLIP_MERGES, TRICK_TUNING as T } from '../../src/tricks/trickTuning';
import type { TrickCategory, TrickDef, TrickRecord } from '../../src/types';

const CATEGORIES: TrickCategory[] = ['spin', 'invert', 'grab', 'flip', 'rail', 'surface', 'special', 'bonus'];
const ALL = [...TRICKS, ...EXTRA_TRICKS];
const ids = (list: TrickDef[]): string[] => list.map((t) => t.id);

describe('trick table — integrity', () => {
  it('ids are unique (including the reserve rows)', () => {
    expect(new Set(ids(ALL)).size).toBe(ALL.length);
  });

  it('every row has both names, an input hint in both languages, points, a difficulty and boards', () => {
    for (const t of ALL) {
      expect(t.name.ru.trim().length, t.id).toBeGreaterThan(0);
      expect(t.name.en.trim().length, t.id).toBeGreaterThan(0);
      expect(t.input.ru.trim().length, t.id).toBeGreaterThan(8);
      expect(t.input.en.trim().length, t.id).toBeGreaterThan(8);
      expect(t.input.en, t.id).not.toMatch(/[а-яё]/i);
      expect(t.name.en, t.id).not.toMatch(/[а-яё]/i);
      expect(CATEGORIES, t.id).toContain(t.category);
      expect(Number.isInteger(t.points), t.id).toBe(true);
      expect(t.points, t.id).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(t.difficulty), t.id).toBe(true);
      expect(t.difficulty, t.id).toBeGreaterThanOrEqual(1);
      expect(t.difficulty, t.id).toBeLessThanOrEqual(5);
      expect(t.boards.length, t.id).toBeGreaterThan(0);
      for (const b of t.boards) expect(['wakeboard', 'wakeskate'], t.id).toContain(b);
      if (t.tip) {
        expect(t.tip.ru.trim().length, t.id).toBeGreaterThan(8);
        expect(t.tip.en.trim().length, t.id).toBeGreaterThan(8);
      }
      // only percentage bonuses and the spot-defined gap may be worth 0
      if (t.category !== 'bonus') expect(t.points, t.id).toBeGreaterThan(0);
    }
  });

  it('contains everything the brief lists', () => {
    const need = [
      ...['spin180', 'spin360', 'spin540', 'spin720', 'spin900', 'spin1080'],
      ...['backroll', 'frontroll', 'tantrum', 'raley', 'backrollDouble', 'frontrollDouble', 'tantrumDouble'],
      ...['indy', 'melon', 'mute', 'nose', 'tail', 'stalefish'],
      ...['shifty', 'handlePass'],
      ...['shuvit', 'kickflip', 'heelflip', 'treflip', 'impossible', 'bigspin', 'boneless', 'ollie'],
      ...['rail.fifty', 'rail.boardslide', 'rail.lipslide', 'rail.nosepress', 'rail.tailpress'],
      ...['wallride', 'surface180', 'gap'],
      ...['rollToRevert', 'mobe', 'scarecrow', 'crowMobe', 'tantrumToFakie', 'whirlybird', 'hoochie', 'raley313', 'blindJudge'],
    ];
    for (const id of need) expect(ids(TRICKS), id).toContain(id);
  });

  it('uses the terms Russian riders use', () => {
    const ru = (id: string): string | undefined => getTrick(id)?.name.ru;
    expect(ru('backroll')).toBe('Бэкролл');
    expect(ru('frontroll')).toBe('Фронтролл');
    expect(ru('tantrum')).toBe('Тантрум');
    expect(ru('raley')).toBe('Рэйли');
    expect(ru('indy')).toBe('Инди');
    expect(ru('melon')).toBe('Мелон');
    expect(ru('mute')).toBe('Мьют');
    expect(ru('nose')).toBe('Ноуз');
    expect(ru('tail')).toBe('Тейл');
    expect(ru('stalefish')).toBe('Стейлфиш');
    expect(ru('shifty')).toBe('Шифти');
    expect(ru('shuvit')).toBe('Шоув-ит');
    expect(ru('kickflip')).toBe('Кикфлип');
    expect(ru('heelflip')).toBe('Хилфлип');
    expect(ru('treflip')).toBe('360 флип');
    expect(ru('impossible')).toBe('Импоссибл');
    expect(ru('boneless')).toBe('Бонлесс');
    expect(ru('rail.fifty')).toBe('50-50');
    expect(ru('rail.boardslide')).toBe('Бордслайд');
    expect(ru('rail.lipslide')).toBe('Липслайд');
    expect(ru('rail.nosepress')).toBe('Ноуз-пресс');
    expect(ru('rail.tailpress')).toBe('Тейл-пресс');
    expect(ru('wallride')).toBe('Валлрайд');
    expect(ru('surface180')).toBe('Сёрфейс 180');
    expect(ru('mobe')).toBe('Мобиус');
  });

  it('boards follow the two-board design', () => {
    const boards = (id: string): string[] => getTrick(id)?.boards ?? [];
    for (const id of ['backroll', 'frontroll', 'tantrum', 'raley', 'indy', 'stalefish', 'handlePass', 'spin720', 'spin1080', 'mobe']) expect(boards(id), id).toEqual(['wakeboard']);
    for (const id of ['shuvit', 'kickflip', 'heelflip', 'treflip', 'impossible', 'bigspin', 'boneless', 'ollie']) expect(boards(id), id).toEqual(['wakeskate']);
    for (const id of ['spin180', 'spin360', 'spin540', 'rail.fifty', 'rail.boardslide', 'wallride', 'surface180', 'gap', 'shifty']) expect(boards(id), id).toEqual(['wakeboard', 'wakeskate']);
  });

  it('input hints use the controls of PLAN §4.2', () => {
    const input = (id: string): { ru: string; en: string } => getTrick(id)!.input;
    expect(input('spin180')).toEqual({ ru: 'В воздухе: джойстик ← или → (или ТРЮК + ←/→)', en: 'In the air: stick ← or → (or TRICK + ←/→)' });
    expect(input('backroll').en).toBe('In the air: TRICK + ↑');
    expect(input('frontroll').en).toBe('In the air: TRICK + ↓');
    expect(input('tantrum').en).toContain('kicker');
    expect(input('raley').en).toMatch(/hold TRICK.*0\.25 s.*stick neutral/);
    expect(input('shifty').en).toMatch(/tap TRICK.*stick neutral/);
    const grabs: Record<string, string> = { indy: 'stick neutral', melon: 'GRAB + ←', mute: 'GRAB + →', nose: 'GRAB + ↑', tail: 'GRAB + ↓', stalefish: 'GRAB + ↓ and to the side' };
    for (const id of Object.keys(grabs)) {
      expect(input(id).en, id).toContain('hold GRAB');
      expect(input(id).en, id).toContain(grabs[id]);
      expect(input(id).ru, id).toContain('держи ГРЭБ');
    }
    const flips: Record<string, string> = { shuvit: 'FLIP, stick neutral', kickflip: 'FLIP + ←', heelflip: 'FLIP + →', impossible: 'FLIP + ↑', treflip: 'FLIP + ↓' };
    for (const id of Object.keys(flips)) {
      expect(input(id).en, id).toContain(flips[id]);
      expect(input(id).en, id).toMatch(/catch the board: FLIP or JUMP again/);
      expect(input(id).ru, id).toContain('поймай доску');
    }
    expect(input('boneless').en).toBe('On the water: hold FLIP while releasing JUMP');
    expect(input('surface180').en).toBe('On the water: TRICK + ←/→');
    expect(input('rail.boardslide').en).toBe('On the rail: stick ←');
    expect(input('rail.lipslide').en).toBe('On the rail: stick →');
    expect(input('rail.nosepress').en).toBe('On the rail: stick ↑');
    expect(input('rail.tailpress').en).toBe('On the rail: stick ↓');
    expect(input('rail.noseblunt').en).toBe('On the rail: TRICK + ←');
    expect(input('rail.tailblunt').en).toBe('On the rail: TRICK + →');
    expect(input('rail.noseslide').en).toBe('On the rail: TRICK + ↑ (again = back to the stick)');
    expect(input('rail.tailslide').en).toBe('On the rail: TRICK + ↓');
    // the hint of a wakeboard trick never mentions FLIP and vice versa
    for (const t of TRICKS) {
      if (t.boards.length === 1 && t.boards[0] === 'wakeboard') expect(t.input.en, t.id).not.toContain('FLIP');
      if (t.boards.length === 1 && t.boards[0] === 'wakeskate') expect(t.input.en, t.id).not.toContain('GRAB');
    }
  });

  it('harder tricks pay more', () => {
    const p = (id: string): number => getTrick(id)!.points;
    const spins = ['spin180', 'spin360', 'spin540', 'spin720', 'spin900', 'spin1080'].map(p);
    expect(spins).toEqual([...spins].sort((a, b) => a - b));
    expect(new Set(spins).size).toBe(6);
    expect(p('treflip')).toBeGreaterThan(p('kickflip'));
    expect(p('kickflip')).toBeGreaterThan(p('shuvit'));
    expect(p('rail.boardslide')).toBeGreaterThan(p('rail.fifty'));
    expect(T.railPerMetre.boardslide).toBeGreaterThan(T.railPerMetre.fifty);
    for (const g of ['indy', 'melon', 'mute', 'nose', 'tail', 'stalefish']) {
      expect(p(g), g).toBeGreaterThanOrEqual(150);
      expect(p(g), g).toBeLessThanOrEqual(250);
    }
    for (const inv of ['backroll', 'frontroll', 'tantrum']) expect(p(`${inv}Double`) / p(inv), inv).toBeCloseTo(2.6, 5);
    // difficulty follows the points inside a category
    for (const c of ['spin', 'grab'] as const) {
      const rows = TRICKS.filter((t) => t.category === c).sort((a, b) => a.points - b.points);
      for (let i = 1; i < rows.length; i++) expect(rows[i].difficulty, rows[i].id).toBeGreaterThanOrEqual(rows[i - 1].difficulty);
    }
  });
});

describe('trick table — named combinations', () => {
  const combos = TRICKS.filter((t) => t.requires);

  it('requirements point at real components', () => {
    expect(combos.length).toBeGreaterThanOrEqual(13);
    for (const t of combos) {
      const q = t.requires!;
      expect(Object.keys(q).length, t.id).toBeGreaterThan(0);
      if (q.spin !== undefined) {
        expect(q.spin % 180, t.id).toBe(0);
        expect(getTrick(`spin${q.spin}`), t.id).toBeDefined();
      }
      if (q.invert) expect(getTrick(q.invert), t.id).toBeDefined();
      if (q.grab) expect(getTrick(q.grab), t.id).toBeDefined();
      if (q.flip) expect(getTrick(q.flip), t.id).toBeDefined();
      if (q.rail) expect(getTrick(`rail.${q.rail}`), t.id).toBeDefined();
      if (q.invertCount !== undefined) expect(q.invert, t.id).toBeDefined();
    }
  });

  it('no two combinations ask for the same thing', () => {
    const keys = combos.map((t) => JSON.stringify(Object.entries(t.requires!).sort()));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a combination is worth more than its parts', () => {
    for (const t of combos) {
      const q = t.requires!;
      if (q.invertCount && q.invertCount > 1) continue; // doubles: checked against the single
      let sum = 0;
      if (q.spin) sum += getTrick(`spin${q.spin}`)!.points;
      if (q.invert) sum += getTrick(q.invert)!.points;
      if (q.flip) sum += getTrick(q.flip)!.points;
      if (q.grab) sum += getTrick(q.grab)!.points;
      if (q.anyGrab) sum += getTrick('stalefish')!.points; // even with the priciest grab
      expect(t.points, t.id).toBeGreaterThanOrEqual(sum);
    }
  });

  it('flip merges reference table rows', () => {
    for (const m of FLIP_MERGES) {
      for (const id of [...m.parts, m.into]) expect(getTrick(id), id).toBeDefined();
    }
  });

  it('words for composed names exist in both languages', () => {
    for (const key of Object.keys(TRICK_WORDS) as (keyof typeof TRICK_WORDS)[]) {
      expect(TRICK_WORDS[key].ru.length, key).toBeGreaterThan(0);
      expect(TRICK_WORDS[key].en.length, key).toBeGreaterThan(0);
    }
  });
});

describe('trick table — used by the spots', () => {
  it('every trick a spot goal asks for is in the table and doable on the board it names', () => {
    for (const spot of SPOTS) {
      expect(spot.goals, spot.id).toHaveLength(5);
      for (const goal of spot.goals) {
        if (goal.type !== 'trick' && goal.type !== 'clip') continue;
        if (!goal.trickId) continue;
        const def = TRICKS.find((t) => t.id === goal.trickId);
        expect(def, `${spot.id}: ${goal.trickId}`).toBeDefined();
        if (goal.type === 'trick' && goal.board) expect(def!.boards, `${spot.id}: ${goal.trickId}`).toContain(goal.board);
      }
    }
  });

  it('getTrick finds table and service rows, nothing else', () => {
    expect(getTrick('mobe')?.name.en).toBe('Mobe');
    expect(getTrick('fsShuvit')?.name.en).toBe('FS Shuvit');
    for (const id of ['fsShuvit', 'switch', 'bigAir', 'air']) {
      expect(TRICKS.some((t) => t.id === id), id).toBe(false);
      expect(getTrick(id), id).toBeDefined();
    }
    expect(getTrick('nope')).toBeUndefined();
  });

  it('the visible table has no dead rows: everything in it can be landed with the game controls', () => {
    // only the gap is worth 0 in the list (each spot sets its own gap points)
    expect(TRICKS.filter((t) => t.points === 0).map((t) => t.id)).toEqual(['gap']);
    const base: TrickRecord = { board: 'wakeboard', context: 'air', takeoff: 'pop', spinDeg: 0, spinDir: null, inverts: [], grabs: [], flips: [], shifty: false, handlePass: false, switchTakeoff: false, switchLanding: false, airTime: 1, height: 1.2 };
    const gap = { id: 'g', name: { ru: 'Гэп', en: 'Gap' }, points: 500 };
    const samples: Partial<TrickRecord>[] = [
      // what the sim can produce (src/tricks/TrickController.ts): spins to 1080 / 540, rolls ×2, raley, six grabs, five flips
      ...[180, 360, 540, 720, 900, 1080].map((spinDeg) => ({ spinDeg, handlePass: spinDeg >= 360 })),
      ...(['backroll', 'frontroll', 'tantrum'] as const).flatMap((id) => [0, 180, 360, 540].flatMap((spinDeg) => [1, 2].map((count) => ({ spinDeg, inverts: [{ id, count }] })))),
      ...[0, 180, 360].map((spinDeg) => ({ spinDeg, inverts: [{ id: 'raley' as const, count: 1 }] })),
      { inverts: [{ id: 'raley', count: 1 }], grabs: [{ id: 'indy', hold: 0.5 }] },
      ...(['indy', 'melon', 'mute', 'nose', 'tail', 'stalefish'] as const).map((id) => ({ grabs: [{ id, hold: 0.5 }] })),
      { shifty: true },
      { spinDeg: 360, gap },
      { spinDeg: 180, takeoff: 'rail' },
      { spinDeg: 180, takeoff: 'wall' },
      ...(['shuvit', 'kickflip', 'heelflip', 'impossible', 'treflip'] as const).map((id) => ({ board: 'wakeskate' as const, flips: [{ id, count: 1 }] })),
      { board: 'wakeskate', spinDeg: 180, flips: [{ id: 'shuvit', count: 1 }] },
      { board: 'wakeskate', boneless: true },
      ...(['fifty', 'boardslide', 'lipslide', 'noseslide', 'tailslide', 'noseblunt', 'tailblunt', 'nosepress', 'tailpress'] as const).map((st) => ({ context: 'rail' as const, rail: { obstacleId: 'r', kind: 'rail' as const, stances: [st], distance: 5, pressTime: 0.5 } })),
      { context: 'wall', wall: { time: 1 } },
      { context: 'surface', spinDeg: 180 },
    ];
    const landed = new Set<string>();
    for (const sample of samples) for (const id of resolveTrick({ ...base, ...sample }).ids) landed.add(id);
    for (const t of TRICKS) expect(landed.has(t.id), t.id).toBe(true);
  });

  it('composed names stay short enough for a phone popup', () => {
    const longest = resolveTrick({
      board: 'wakeboard',
      context: 'air',
      takeoff: 'kicker',
      spinDeg: 1080,
      spinDir: 'bs',
      inverts: [],
      grabs: [{ id: 'stalefish', hold: 1 }],
      flips: [],
      shifty: false,
      handlePass: true,
      switchTakeoff: true,
      switchLanding: false,
      airTime: 2,
      height: 4,
      gap: { id: 'g', name: { ru: 'Гэп Олд-Тауна', en: 'Old Town Gap' }, points: 500 },
    });
    expect(longest.name.ru).toBe('Свитч BS 1080 Стейлфиш через гэп');
    expect(longest.name.ru.length).toBeLessThanOrEqual(34);
    expect(longest.name.en.length).toBeLessThanOrEqual(38);
  });
});
