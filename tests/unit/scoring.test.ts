import { describe, expect, it } from 'vitest';
import { getTrick, TRICKS } from '../../src/data/tricks';
import { resolveTrick } from '../../src/tricks/scoring';
import { TRICK_TUNING as T } from '../../src/tricks/trickTuning';
import type { FlipId, GrabId, InvertId, RailStance, TrickRecord } from '../../src/types';

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

const pts = (id: string): number => getTrick(id)?.points ?? NaN;
const sumParts = (r: ReturnType<typeof resolveTrick>): number => r.parts.reduce((a, p) => a + p.points, 0);

describe('resolveTrick — air naming (RU + EN)', () => {
  it('names a plain spin with its direction', () => {
    const r = resolveTrick(rec({ spinDeg: -360, spinDir: 'bs' }));
    expect(r.name).toEqual({ ru: 'BS 360', en: 'BS 360' });
    expect(r.id).toBe('spin360');
    expect(r.points).toBe(pts('spin360'));
    expect(r.elements).toBe(1);
  });

  it('composes spin + grab: "BS 360 Indy"', () => {
    const r = resolveTrick(rec({ spinDeg: 360, spinDir: 'bs', grabs: [{ id: 'indy', hold: 0 }] }));
    expect(r.name).toEqual({ ru: 'BS 360 Инди', en: 'BS 360 Indy' });
    expect(r.id).toBe('spin360');
    expect(r.ids).toEqual(expect.arrayContaining(['spin360', 'indy']));
    expect(r.elements).toBe(2);
  });

  it('invert + grab has no FS/BS prefix', () => {
    const r = resolveTrick(rec({ inverts: [{ id: 'backroll', count: 1 }], grabs: [{ id: 'melon', hold: 0.4 }] }));
    expect(r.name).toEqual({ ru: 'Бэкролл Мелон', en: 'Backroll Melon' });
    expect(r.id).toBe('backroll');
  });

  it('a named combination replaces its components: backroll + 360 + indy = "Mobe Indy"', () => {
    const r = resolveTrick(rec({ spinDeg: 360, spinDir: 'fs', inverts: [{ id: 'backroll', count: 1 }], grabs: [{ id: 'indy', hold: 0 }] }));
    expect(r.name).toEqual({ ru: 'Мобиус Инди', en: 'Mobe Indy' });
    expect(r.id).toBe('mobe');
    expect(r.ids[0]).toBe('mobe');
    expect(r.ids).toEqual(expect.arrayContaining(['mobe', 'backroll', 'spin360', 'indy']));
    expect(r.elements).toBe(3);
    // the combination row pays instead of backroll + 360
    expect(r.parts.find((p) => p.id === 'mobe')?.points).toBe(pts('mobe'));
    expect(r.parts.some((p) => p.id === 'backroll' || p.id === 'spin360')).toBe(false);
  });

  it('resolves every named combination of the table from its requirements', () => {
    const combos = TRICKS.filter((t) => t.requires && !t.requires.rail);
    expect(combos.length).toBeGreaterThanOrEqual(12);
    for (const def of combos) {
      const q = def.requires!;
      const wakeskate = def.boards.length === 1 && def.boards[0] === 'wakeskate';
      const r = resolveTrick(
        rec({
          board: wakeskate ? 'wakeskate' : 'wakeboard',
          spinDeg: q.spin ?? 0,
          spinDir: q.spin ? 'fs' : null,
          inverts: q.invert ? [{ id: q.invert, count: q.invertCount ?? 1 }] : [],
          grabs: q.grab ? [{ id: q.grab, hold: 0 }] : q.anyGrab ? [{ id: 'tail', hold: 0 }] : [],
          flips: q.flip ? [{ id: q.flip, count: 1 }] : [],
        }),
      );
      expect(r.id, def.id).toBe(def.id);
      expect(r.name, def.id).toEqual(def.name);
      expect(r.points, def.id).toBe(def.points);
    }
  });

  it('knows the classic wake names', () => {
    const name = (over: Partial<TrickRecord>): string => resolveTrick(rec(over)).name.en;
    expect(name({ spinDeg: 180, inverts: [{ id: 'backroll', count: 1 }] })).toBe('Roll to Revert');
    expect(name({ spinDeg: 360, inverts: [{ id: 'backroll', count: 1 }] })).toBe('Mobe');
    expect(name({ spinDeg: 180, inverts: [{ id: 'frontroll', count: 1 }] })).toBe('Scarecrow');
    expect(name({ spinDeg: 360, inverts: [{ id: 'frontroll', count: 1 }] })).toBe('Crow Mobe');
    expect(name({ spinDeg: 180, inverts: [{ id: 'tantrum', count: 1 }] })).toBe('Tantrum to Fakie');
    expect(name({ spinDeg: 360, inverts: [{ id: 'tantrum', count: 1 }] })).toBe('Whirlybird');
    expect(name({ spinDeg: 180, inverts: [{ id: 'raley', count: 1 }] })).toBe('Blind Judge');
    expect(name({ spinDeg: 360, inverts: [{ id: 'raley', count: 1 }] })).toBe('313');
    expect(name({ inverts: [{ id: 'raley', count: 1 }], grabs: [{ id: 'mute', hold: 0.3 }] })).toBe('Hoochie Glide');
  });

  it('raley + 360 + grab is a 313 with the grab, and still counts as a Hoochie Glide for goals', () => {
    const r = resolveTrick(rec({ spinDeg: 360, inverts: [{ id: 'raley', count: 1 }], grabs: [{ id: 'melon', hold: 0 }] }));
    expect(r.name).toEqual({ ru: '313 Мелон', en: '313 Melon' });
    expect(r.id).toBe('raley313');
    expect(r.ids).toEqual(expect.arrayContaining(['raley313', 'hoochie', 'raley', 'spin360', 'melon']));
  });

  it('Hoochie Glide swallows the grab name but pays its hold time', () => {
    const short = resolveTrick(rec({ inverts: [{ id: 'raley', count: 1 }], grabs: [{ id: 'indy', hold: 0 }] }));
    const long = resolveTrick(rec({ inverts: [{ id: 'raley', count: 1 }], grabs: [{ id: 'indy', hold: 1 }] }));
    expect(short.name.ru).toBe('Хучи-глайд');
    expect(short.points).toBe(pts('hoochie'));
    expect(long.points).toBe(Math.round(pts('hoochie') + pts('indy') * T.grabHoldBonus));
    expect(short.ids).toContain('indy');
  });

  it('doubles: "Double Backroll" / «Дабл бэкролл», 2.6× a single', () => {
    const r = resolveTrick(rec({ inverts: [{ id: 'backroll', count: 2 }] }));
    expect(r.name).toEqual({ ru: 'Дабл бэкролл', en: 'Double Backroll' });
    expect(r.id).toBe('backrollDouble');
    expect(r.ids).toContain('backroll');
    expect(r.points).toBe(1300);
    expect(r.points / pts('backroll')).toBeCloseTo(2.6, 5);
    // a double with a 180 is NOT a Roll to Revert
    const rev = resolveTrick(rec({ spinDeg: 180, inverts: [{ id: 'backroll', count: 2 }] }));
    expect(rev.name.en).toBe('180 Double Backroll');
    expect(rev.ids).not.toContain('rollToRevert');
  });

  it('an unnamed spin + invert is composed in the natural order', () => {
    const r = resolveTrick(rec({ spinDeg: 720, spinDir: 'bs', inverts: [{ id: 'frontroll', count: 1 }], grabs: [{ id: 'tail', hold: 0 }] }));
    expect(r.name).toEqual({ ru: '720 Фронтролл Тейл', en: '720 Frontroll Tail' });
    expect(r.id).toBe('frontroll');
  });

  it('switch takeoff: prefix, id and +20 %', () => {
    const r = resolveTrick(rec({ spinDeg: 180, spinDir: 'fs', switchTakeoff: true }));
    expect(r.name).toEqual({ ru: 'Свитч FS 180', en: 'Switch FS 180' });
    expect(r.ids).toContain('switch');
    expect(r.points).toBe(Math.round(pts('spin180') * (1 + T.switchTakeoff)));
    const landed = resolveTrick(rec({ spinDeg: 180, spinDir: 'fs', switchLanding: true }));
    expect(landed.points).toBe(Math.round(pts('spin180') * (1 + T.switchLanding)));
    expect(landed.name.en).toBe('FS 180');
  });

  it('shifty and several grabs', () => {
    expect(resolveTrick(rec({ shifty: true })).name).toEqual({ ru: 'Шифти', en: 'Shifty' });
    const r = resolveTrick(
      rec({
        spinDeg: 540,
        spinDir: 'bs',
        shifty: true,
        grabs: [
          { id: 'indy', hold: 0.2 },
          { id: 'mute', hold: 0.2 },
        ],
      }),
    );
    expect(r.name).toEqual({ ru: 'BS 540 Шифти Инди + Мьют', en: 'BS 540 Shifty Indy + Mute' });
    expect(r.elements).toBe(4);
  });

  it('spins beyond the table are extrapolated', () => {
    const r = resolveTrick(rec({ spinDeg: 1260, spinDir: 'fs' }));
    expect(r.name.en).toBe('FS 1260');
    expect(r.points).toBe(pts('spin1080') + T.spinExtraPer180);
    expect(r.ids).toContain('spin1080');
  });

  it('a plain air is a filler: named, a few points, zero elements', () => {
    const air = resolveTrick(rec({ height: 2 }));
    expect(air.id).toBe('air');
    expect(air.name).toEqual({ ru: 'Эйр', en: 'Air' });
    expect(air.elements).toBe(0);
    expect(air.points).toBe(pts('air') + 2 * T.airPerMetre);
    expect(air.tier).toBe(1);
    const ollie = resolveTrick(rec({ board: 'wakeskate' }));
    expect(ollie.id).toBe('ollie');
    expect(ollie.name).toEqual({ ru: 'Олли', en: 'Ollie' });
    expect(ollie.elements).toBe(0);
  });
});

describe('resolveTrick — wakeskate', () => {
  const sk = (over: Partial<TrickRecord>): ReturnType<typeof resolveTrick> => resolveTrick(rec({ board: 'wakeskate', ...over }));

  it('names every flip', () => {
    const want: Record<FlipId, [string, string]> = {
      shuvit: ['Шоув-ит', 'Shuvit'],
      fsShuvit: ['FS шоув-ит', 'FS Shuvit'],
      kickflip: ['Кикфлип', 'Kickflip'],
      heelflip: ['Хилфлип', 'Heelflip'],
      treflip: ['360 флип', '360 Flip'],
      impossible: ['Импоссибл', 'Impossible'],
      bigspin: ['Бигспин', 'Bigspin'],
    };
    for (const id of Object.keys(want) as FlipId[]) {
      const r = sk({ flips: [{ id, count: 1 }] });
      expect([r.name.ru, r.name.en], id).toEqual(want[id]);
      expect(r.id).toBe(id);
      expect(r.points).toBe(pts(id));
    }
  });

  it('kickflip + shuvit in one air is a 360 flip', () => {
    const r = sk({
      flips: [
        { id: 'kickflip', count: 1 },
        { id: 'shuvit', count: 1 },
      ],
    });
    expect(r.name).toEqual({ ru: '360 флип', en: '360 Flip' });
    expect(r.id).toBe('treflip');
    expect(r.points).toBe(pts('treflip'));
    expect(r.ids).toEqual(expect.arrayContaining(['treflip', 'kickflip', 'shuvit']));
  });

  it('shuvit + body 180 is a bigspin (and a ready-made bigspin is not paid twice for its 180)', () => {
    const a = sk({ spinDeg: -180, spinDir: 'bs', flips: [{ id: 'shuvit', count: 1 }] });
    expect(a.name).toEqual({ ru: 'Бигспин', en: 'Bigspin' });
    expect(a.id).toBe('bigspin');
    expect(a.points).toBe(pts('bigspin'));
    const b = sk({ spinDeg: -180, spinDir: 'bs', flips: [{ id: 'bigspin', count: 1 }] });
    expect(b.name.en).toBe('Bigspin');
    expect(b.points).toBe(pts('bigspin'));
  });

  it('counts: double kickflip, 360 shuvit', () => {
    const d = sk({ flips: [{ id: 'kickflip', count: 2 }] });
    expect(d.name).toEqual({ ru: 'Дабл кикфлип', en: 'Double Kickflip' });
    expect(d.points).toBe(Math.round(pts('kickflip') * T.flipCount[1]));
    expect(sk({ flips: [{ id: 'shuvit', count: 2 }] }).name).toEqual({ ru: '360 шоув-ит', en: '360 Shuvit' });
  });

  it('spin + flip and boneless', () => {
    expect(sk({ spinDeg: 180, spinDir: 'fs', flips: [{ id: 'kickflip', count: 1 }] }).name.en).toBe('FS 180 Kickflip');
    const b = sk({ boneless: true });
    expect(b.name).toEqual({ ru: 'Бонлесс', en: 'Boneless' });
    expect(b.id).toBe('boneless');
    expect(b.points).toBe(pts('boneless'));
    expect(b.elements).toBe(1);
    const bk = sk({ boneless: true, flips: [{ id: 'heelflip', count: 1 }] });
    expect(bk.name).toEqual({ ru: 'Бонлесс Хилфлип', en: 'Boneless Heelflip' });
    expect(bk.id).toBe('heelflip');
    expect(bk.ids).toContain('boneless');
  });
});

describe('resolveTrick — points', () => {
  it('follows the base scale of the table', () => {
    const want: Record<string, number> = { spin180: 100, spin360: 250, spin540: 450, spin720: 800, spin900: 1300, spin1080: 2000, backroll: 500, frontroll: 550, tantrum: 500, raley: 400 };
    for (const id of Object.keys(want)) expect(pts(id), id).toBe(want[id]);
    for (const deg of [180, 360, 540, 720, 900, 1080]) expect(resolveTrick(rec({ spinDeg: deg })).points).toBe(want[`spin${deg}`]);
  });

  it('grab hold grows a grab up to +60 % at one second', () => {
    const base = pts('indy');
    const at = (hold: number): number => resolveTrick(rec({ grabs: [{ id: 'indy', hold }] })).points;
    expect(at(0)).toBe(base);
    expect(at(0.5)).toBe(Math.round(base * 1.3));
    expect(at(1)).toBe(Math.round(base * 1.6));
    expect(at(3)).toBe(Math.round(base * 1.6));
  });

  it('stacking: spin + invert + grab is worth more than the sum', () => {
    const r = resolveTrick(rec({ spinDeg: 720, inverts: [{ id: 'backroll', count: 1 }], grabs: [{ id: 'indy', hold: 0 }] }));
    const sum = pts('spin720') + pts('backroll') + pts('indy');
    expect(r.points).toBe(Math.round(sum * (1 + T.stack[3])));
    expect(r.points).toBeGreaterThan(sum);
    expect(r.parts.find((p) => p.id === 'stack')?.points).toBe(Math.round(sum * T.stack[3]));
    // two elements: smaller bonus
    const two = resolveTrick(rec({ spinDeg: 360, grabs: [{ id: 'indy', hold: 0 }] }));
    expect(two.points).toBe(Math.round((pts('spin360') + pts('indy')) * (1 + T.stack[2])));
  });

  it('height and hang time add a Big Air bonus — a flat pop does not', () => {
    const flat = resolveTrick(rec({ spinDeg: 360, height: 1.6, airTime: 1.2 }));
    expect(flat.points).toBe(pts('spin360'));
    expect(flat.ids).not.toContain('bigAir');
    const kicker = resolveTrick(rec({ spinDeg: 360, height: 3.4, airTime: 1.5 }));
    expect(kicker.points).toBeGreaterThan(flat.points);
    expect(kicker.ids).toContain('bigAir');
    const huge = resolveTrick(rec({ spinDeg: 360, height: 9, airTime: 5 }));
    expect(huge.points).toBe(pts('spin360') + Math.round(pts('spin360') * (T.heightBonus + T.airTimeBonus)));
  });

  it('handle pass, pop-out and off-the-wall takeoffs are flat bonuses', () => {
    const base = resolveTrick(rec({ spinDeg: 360 })).points;
    const hp = resolveTrick(rec({ spinDeg: 360, handlePass: true }));
    expect(hp.points).toBe(base + pts('handlePass'));
    expect(hp.ids).toContain('handlePass');
    expect(hp.elements).toBe(1);
    const rail = resolveTrick(rec({ spinDeg: 360, takeoff: 'rail' }));
    expect(rail.points).toBe(base + pts('popOut'));
    expect(rail.ids).toContain('popOut');
    const wall = resolveTrick(rec({ spinDeg: 360, takeoff: 'wall' }));
    expect(wall.points).toBe(base + pts('wallOut'));
    expect(wall.ids).toContain('wallOut');
  });

  it('gap points come from the record', () => {
    const gap = { id: 'gap_oldtown', name: { ru: 'Гэп Олд-Тауна', en: 'Old Town Gap' }, points: 500 };
    const r = resolveTrick(rec({ spinDeg: 360, spinDir: 'bs', gap }));
    expect(r.points).toBe(pts('spin360') + 500);
    expect(r.name).toEqual({ ru: 'BS 360 через гэп', en: 'BS 360 over the Gap' });
    expect(r.ids).toContain('gap');
    expect(r.elements).toBe(2);
    const plain = resolveTrick(rec({ gap, height: 0 }));
    expect(plain.name).toEqual(gap.name);
    expect(plain.id).toBe('gap');
    expect(plain.points).toBe(500 + pts('air'));
    expect(plain.elements).toBe(1);
  });

  it('parts always add up to the total and tiers follow the points', () => {
    const samples: Partial<TrickRecord>[] = [
      { spinDeg: 180 },
      { spinDeg: 540, grabs: [{ id: 'stalefish', hold: 0.77 }], height: 3.1, airTime: 1.61, switchTakeoff: true, switchLanding: true, handlePass: true },
      { spinDeg: 360, inverts: [{ id: 'tantrum', count: 1 }], grabs: [{ id: 'nose', hold: 0.33 }], takeoff: 'kicker', height: 3.7, airTime: 1.7 },
      { spinDeg: 1080, inverts: [{ id: 'frontroll', count: 2 }], grabs: [{ id: 'mute', hold: 1 }], height: 5, airTime: 2.4 },
    ];
    let prev = 0;
    for (const s of samples) {
      const r = resolveTrick(rec(s));
      expect(sumParts(r)).toBe(r.points);
      expect(Number.isInteger(r.points)).toBe(true);
      expect(r.tier).toBeGreaterThanOrEqual(prev);
      prev = r.tier;
    }
    expect(resolveTrick(rec(samples[0])).tier).toBe(1);
    expect(resolveTrick(rec(samples[3])).tier).toBe(5);
    expect(resolveTrick(rec({ spinDeg: 360 })).tier).toBe(2);
    expect(resolveTrick(rec({ inverts: [{ id: 'backroll', count: 1 }], spinDeg: 360 })).tier).toBe(3);
  });

  it('every component id of the contracts has a row with both names', () => {
    const inverts: InvertId[] = ['backroll', 'frontroll', 'tantrum', 'raley'];
    const grabs: GrabId[] = ['indy', 'melon', 'tail', 'nose', 'mute', 'stalefish'];
    const flips: FlipId[] = ['shuvit', 'fsShuvit', 'kickflip', 'heelflip', 'treflip', 'impossible', 'bigspin'];
    const stances: RailStance[] = ['fifty', 'boardslide', 'lipslide', 'nosepress', 'tailpress'];
    for (const id of [...inverts, ...grabs, ...flips, ...stances.map((s) => `rail.${s}`)]) {
      const def = getTrick(id);
      expect(def, id).toBeDefined();
      expect(def!.name.ru.length, id).toBeGreaterThan(0);
      expect(def!.name.en.length, id).toBeGreaterThan(0);
      expect(def!.points, id).toBeGreaterThan(0);
    }
  });
});

describe('resolveTrick — rail, wall, surface', () => {
  const rail = (stances: RailStance[], distance: number, over: Partial<TrickRecord> = {}, kind: 'rail' | 'ledge' | 'pipe' | 'handrail' = 'rail', pressTime = 0): ReturnType<typeof resolveTrick> =>
    resolveTrick(rec({ context: 'rail', rail: { obstacleId: 'r', kind, stances, distance, pressTime }, ...over }));

  it('50-50: 100 + 40 per metre, distance in the name', () => {
    const r = rail(['fifty'], 6.5);
    expect(r.name).toEqual({ ru: '50-50 6,5 м', en: '50-50 6.5 m' });
    expect(r.id).toBe('rail.fifty');
    expect(r.points).toBe(100 + 40 * 6.5);
    expect(r.elements).toBe(1);
  });

  it('boardslide: 200 + 60 per metre; long slides drop the decimals', () => {
    const r = rail(['boardslide'], 12.4);
    expect(r.name).toEqual({ ru: 'Бордслайд 12 м', en: 'Boardslide 12 m' });
    expect(r.points).toBe(Math.round(200 + 60 * 12.4));
  });

  it('stance changes and a spin in', () => {
    const r = rail(['fifty', 'boardslide', 'fifty'], 8, { spinDeg: 180 });
    expect(r.name).toEqual({ ru: '180 в 50-50 → Бордслайд 8 м', en: '180 to 50-50 → Boardslide 8 m' });
    expect(r.id).toBe('rail.boardslide');
    expect(r.ids).toEqual(expect.arrayContaining(['rail.fifty', 'rail.boardslide', 'spin180']));
    expect(r.points).toBe(100 + 100 + 200 + 60 * 8);
    expect(r.elements).toBe(3);
  });

  it('a press adds up to +50 %', () => {
    const plain = rail(['fifty'], 5);
    const pressed = rail(['fifty', 'nosepress'], 5, {}, 'rail', 1);
    const core = 100 + pts('rail.nosepress') + 50 * 5;
    expect(pressed.name.ru).toBe('50-50 → Ноуз-пресс 5 м');
    expect(pressed.points).toBe(Math.round(core * 1.5));
    expect(pressed.points).toBeGreaterThan(plain.points * 1.5);
    const half = rail(['fifty', 'tailpress'], 5, {}, 'rail', 0.5);
    expect(half.points).toBe(Math.round(core * 1.25));
  });

  it('handrails pay more per metre than a fat pipe; switch adds 20 %', () => {
    expect(rail(['fifty'], 10, {}, 'handrail').points).toBe(100 + 500);
    expect(rail(['fifty'], 10, {}, 'pipe').points).toBe(100 + 320);
    const sw = rail(['fifty'], 10, { switchTakeoff: true });
    expect(sw.name.en).toBe('Switch 50-50 10 m');
    expect(sw.points).toBe(Math.round(500 * 1.2));
  });

  it('a rail record without details is still a 50-50', () => {
    const r = resolveTrick(rec({ context: 'rail' }));
    expect(r.id).toBe('rail.fifty');
    expect(r.name.en).toBe('50-50');
    expect(r.points).toBe(100);
  });

  it('wallride: 300 + time on the wall', () => {
    const r = resolveTrick(rec({ context: 'wall', wall: { time: 1.2 } }));
    expect(r.name).toEqual({ ru: 'Валлрайд', en: 'Wallride' });
    expect(r.id).toBe('wallride');
    expect(r.points).toBe(300 + Math.round(1.2 * T.wallPerSecond));
    expect(resolveTrick(rec({ context: 'wall', wall: { time: 99 } })).points).toBe(300 + T.wallMaxTime * T.wallPerSecond);
  });

  it('surface 180: 50 points, one element', () => {
    const r = resolveTrick(rec({ context: 'surface', spinDeg: -180, spinDir: 'bs', switchLanding: true }));
    expect(r.name).toEqual({ ru: 'Сёрфейс 180', en: 'Surface 180' });
    expect(r.id).toBe('surface180');
    expect(r.ids).toEqual(['surface180']);
    expect(r.points).toBe(50);
    expect(r.elements).toBe(1);
    expect(r.tier).toBe(1);
  });
});
