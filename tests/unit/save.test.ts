import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS, SAVE_KEY, SAVE_VERSION, STARTER_GEAR } from '../../src/config';
import { EventBus } from '../../src/core/events';
import { createSaveStore, type StorageLike } from '../../src/save/SaveStore';
import { defaultSave, migrate, readVersion } from '../../src/save/migrations';
import type { SaveData } from '../../src/types';

/** In-memory Storage with call counters. */
function memoryStorage(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string>; writes: number } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    writes: 0,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem(k, v) {
      if (k === SAVE_KEY) this.writes++;
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
}

/** Structural check that a value is a complete, sane SaveData. */
function expectValid(s: SaveData): void {
  expect(s.version).toBe(SAVE_VERSION);
  expect(['ru', 'en', 'auto']).toContain(s.settings.lang);
  expect(['auto', 'low', 'medium', 'high']).toContain(s.settings.quality);
  for (const v of [s.settings.musicVolume, s.settings.sfxVolume]) {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  }
  expect(typeof s.settings.haptics).toBe('boolean');
  expect(typeof s.settings.invertY).toBe('boolean');
  expect(typeof s.settings.showFps).toBe('boolean');
  expect(['male', 'female']).toContain(s.appearance.gender);
  expect(Number.isInteger(s.appearance.skin)).toBe(true);
  expect(Number.isInteger(s.coins)).toBe(true);
  expect(s.coins).toBeGreaterThanOrEqual(0);
  expect(s.rep).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(s.ownedGear)).toBe(true);
  for (const id of Object.values(STARTER_GEAR)) expect(s.ownedGear).toContain(id);
  expect(typeof s.equipped.wakeboard).toBe('string');
  expect(typeof s.equipped.bindings).toBe('string');
  expect(typeof s.equipped.wakeskate).toBe('string');
  for (const sp of Object.values(s.spots)) {
    expect(sp.goals).toHaveLength(5);
    expect(sp.goals.every((g) => typeof g === 'boolean')).toBe(true);
    expect(sp.bestScore).toBeGreaterThanOrEqual(0);
  }
  expect(Array.isArray(s.career.dialogsSeen)).toBe(true);
  expect(typeof s.career.tutorialDone).toBe('boolean');
  expect(typeof s.stats.tricksLanded).toBe('object');
  expect(['wakeboard', 'wakeskate']).toContain(s.last.board);
  expect(['slow', 'medium', 'fast']).toContain(s.last.power);
}

describe('defaultSave', () => {
  it('is a valid current-version save with the starter kit', () => {
    const s = defaultSave();
    expectValid(s);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(s.equipped).toEqual(STARTER_GEAR);
    expect(s.coins).toBe(0);
    expect(s.spots).toEqual({});
  });

  it('returns independent objects', () => {
    const a = defaultSave();
    const b = defaultSave();
    a.ownedGear.push('x');
    a.settings.musicVolume = 0;
    a.spots.foo = { goals: [true, true, true, true, true], bestScore: 1, bestCombo: 1, bestTrick: null, runs: 1 };
    expect(b.ownedGear).not.toContain('x');
    expect(b.settings.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(b.spots).toEqual({});
    expect(DEFAULT_SETTINGS.musicVolume).not.toBe(0);
  });

  it('round-trips through migrate unchanged', () => {
    expect(migrate(JSON.parse(JSON.stringify(defaultSave())))).toEqual(defaultSave());
  });
});

describe('migrate v1 → v3', () => {
  const v1 = {
    v: 1,
    coins: 320,
    stars: { phuket_oldtown: 3, phuket_canal: 9, ghost_spot: 1 },
    best: { phuket_oldtown: 5400, phuket_pool: 800 },
    lang: 'ru',
    muted: true,
  };

  it('detects the version from the legacy `v` key', () => {
    expect(readVersion(v1)).toBe(1);
  });

  it('carries coins, language and records over', () => {
    const s = migrate(v1);
    expectValid(s);
    expect(s.coins).toBe(320);
    expect(s.settings.lang).toBe('ru');
    expect(s.spots.phuket_oldtown.bestScore).toBe(5400);
    expect(s.spots.phuket_pool.bestScore).toBe(800);
  });

  it('turns star counts into the first N goal flags (clamped to 5)', () => {
    const s = migrate(v1);
    expect(s.spots.phuket_oldtown.goals).toEqual([true, true, true, false, false]);
    expect(s.spots.phuket_canal.goals).toEqual([true, true, true, true, true]);
    expect(s.spots.phuket_pool.goals).toEqual([false, false, false, false, false]);
  });

  it('keeps unknown spot ids', () => {
    expect(migrate(v1).spots.ghost_spot.goals).toEqual([true, false, false, false, false]);
  });

  it('maps `muted` to zero volumes and fills everything v1 never had', () => {
    const s = migrate(v1);
    expect(s.settings.musicVolume).toBe(0);
    expect(s.settings.sfxVolume).toBe(0);
    expect(migrate({ ...v1, muted: false }).settings.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(s.rep).toBe(0);
    expect(s.equipped).toEqual(STARTER_GEAR);
    expect(s.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(s.career.tutorialDone).toBe(true); // had progress → not a first-time player
    expect(s.spots.phuket_oldtown.runs).toBe(1);
  });

  it('survives a v1 save with broken fields', () => {
    const s = migrate({ v: 1, coins: 'lots', stars: [1, 2], best: null, lang: 42 });
    expectValid(s);
    expect(s.coins).toBe(0);
    expect(s.settings.lang).toBe('auto');
    expect(s.spots).toEqual({});
    expect(s.career.tutorialDone).toBe(false);
  });
});

describe('migrate v2 → v3', () => {
  const v2 = {
    version: 2,
    settings: { lang: 'en', quality: 'high', music: 0.25, sfx: 0.5, stance: 'goofy', vibration: false },
    look: { gender: 'f', skin: 4, hair: 'ponytail', hairColor: 0xb5382a, headwear: 'cap', headwearColor: 0xffffff, vest: false, vestColor: 0x112233, bottom: 'wetsuit', bottomColor: 0x223344, topColor: 0x334455 },
    coins: 1500,
    rep: 740,
    gear: {
      owned: ['wb_street', 'wb_pro', 'retired_item_2023', 17, null],
      equipped: { board: 'wb_pro', bindings: 'bd_classic', skate: 'ws_plank', vest: null, helmet: 'helmet_basic', apparel: 'shorts_basic' },
    },
    spots: {
      phuket_oldtown: { goals: [true, false, true, true, false], best: 8200 },
      future_spot: { goals: [true], best: 100 },
      broken: 'nope',
    },
    tutorialDone: true,
  };

  it('renames settings and keeps their values', () => {
    const s = migrate(v2);
    expectValid(s);
    expect(s.settings).toEqual({ lang: 'en', quality: 'high', musicVolume: 0.25, sfxVolume: 0.5, stance: 'goofy', haptics: false, invertY: false, showFps: false });
  });

  it('moves look → appearance and spells the gender out', () => {
    const s = migrate(v2);
    expect(s.appearance).toEqual({ gender: 'female', skin: 4, hair: 'ponytail', hairColor: 0xb5382a, headwear: 'cap', headwearColor: 0xffffff, vest: false, vestColor: 0x112233, bottom: 'wetsuit', bottomColor: 0x223344, topColor: 0x334455 });
  });

  it('moves gear, renames slots, keeps unknown string ids and drops invalid types', () => {
    const s = migrate(v2);
    // v3 → v4 swaps the starter shorts for the team jersey
    expect(s.equipped).toEqual({ wakeboard: 'wb_pro', bindings: 'bd_classic', wakeskate: 'ws_plank', vest: null, helmet: 'helmet_basic', apparel: 'jersey_pink' });
    expect(s.ownedGear).toContain('wb_pro');
    expect(s.ownedGear).toContain('retired_item_2023');
    expect(s.ownedGear.every((id) => typeof id === 'string')).toBe(true);
    expect(new Set(s.ownedGear).size).toBe(s.ownedGear.length);
  });

  it('converts spot progress, pads goals to 5 and keeps unknown spots', () => {
    const s = migrate(v2);
    expect(s.spots.phuket_oldtown).toEqual({ goals: [true, false, true, true, false], bestScore: 8200, bestCombo: 0, bestTrick: null, runs: 1 });
    expect(s.spots.future_spot.goals).toEqual([true, false, false, false, false]);
    expect(s.spots.broken).toBeUndefined();
  });

  it('moves tutorialDone into career and creates the new blocks', () => {
    const s = migrate(v2);
    expect(s.coins).toBe(1500);
    expect(s.rep).toBe(740);
    expect(s.career).toEqual({ dialogsSeen: [], sponsors: {}, tutorialDone: true });
    expect(s.stats).toEqual(defaultSave().stats);
    expect(s.last).toEqual(defaultSave().last);
  });

  it('survives a v2 save with missing blocks', () => {
    const s = migrate({ version: 2, coins: 10 });
    expectValid(s);
    expect(s.coins).toBe(10);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.equipped).toEqual(STARTER_GEAR);
  });
});

describe('migrate — current version, garbage and future saves', () => {
  it('never throws and always returns a valid save', () => {
    const cyclic: Record<string, unknown> = { version: 3 };
    cyclic.self = cyclic;
    const inputs: unknown[] = [
      undefined,
      null,
      0,
      42,
      NaN,
      '',
      'hello',
      true,
      [],
      [1, 2, 3],
      {},
      () => 1,
      Symbol('x'),
      { version: 'three' },
      { version: -5 },
      { version: 0.5 },
      { version: 1e9, coins: 5 },
      { v: 1 },
      { version: 2, settings: null, look: 7, gear: 'x', spots: [] },
      { version: 3, settings: 'loud', appearance: [], spots: { a: null, b: 5, c: { goals: 'yes' } }, career: 0, stats: [], last: null },
      cyclic,
    ];
    for (const input of inputs) {
      let s: SaveData | undefined;
      expect(() => (s = migrate(input))).not.toThrow();
      expectValid(s as SaveData);
    }
  });

  it('returns pure defaults for non-objects', () => {
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate('{"coins":5}')).toEqual(defaultSave());
    expect(migrate([{ coins: 5 }])).toEqual(defaultSave());
  });

  it('deep-merges partial v3 data over the defaults', () => {
    const s = migrate({ version: 3, coins: 77, settings: { musicVolume: 0.1 }, appearance: { hair: 'bun' }, last: { board: 'wakeskate' } });
    expect(s.coins).toBe(77);
    expect(s.settings).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 0.1 });
    expect(s.appearance).toEqual({ ...DEFAULT_APPEARANCE, hair: 'bun' });
    expect(s.last).toEqual({ board: 'wakeskate', power: 'medium', cityId: null, spotId: null });
  });

  it('clamps numbers and rejects wrong types field by field', () => {
    const s = migrate({
      version: 3,
      coins: -50,
      rep: Infinity,
      settings: { musicVolume: 7, sfxVolume: -1, quality: 'ultra', stance: 'sideways', haptics: 'yes', lang: 'xx' },
      appearance: { skin: 99, hairColor: -4, gender: 'robot', vest: 1 },
      stats: { totalRuns: 3.7, totalFalls: -2, tricksLanded: { backroll: 4, indy: 'many', bad: -1 } },
      last: { power: 'ludicrous', cityId: 5, spotId: 'phuket_oldtown' },
    });
    expectValid(s);
    expect(s.coins).toBe(0);
    expect(s.rep).toBe(0);
    expect(s.settings.musicVolume).toBe(1);
    expect(s.settings.sfxVolume).toBe(0);
    expect(s.settings.quality).toBe('auto');
    expect(s.settings.stance).toBe('regular');
    expect(s.settings.haptics).toBe(true);
    expect(s.settings.lang).toBe('auto');
    expect(s.appearance.skin).toBe(5);
    expect(s.appearance.hairColor).toBe(0);
    expect(s.appearance.gender).toBe('male');
    expect(s.appearance.vest).toBe(DEFAULT_APPEARANCE.vest);
    expect(s.stats.totalRuns).toBe(4);
    expect(s.stats.totalFalls).toBe(0);
    expect(s.stats.tricksLanded).toEqual({ backroll: 4 });
    expect(s.last.power).toBe('medium');
    expect(s.last.cityId).toBeNull();
    expect(s.last.spotId).toBe('phuket_oldtown');
  });

  it('keeps full v3 spot progress, career and sponsor state', () => {
    const src = defaultSave();
    src.spots.somewhere_new = { goals: [true, true, false, false, true], bestScore: 12345, bestCombo: 4200, bestTrick: { name: { ru: 'Бэкролл', en: 'Backroll' }, points: 900 }, runs: 12 };
    src.career = { dialogsSeen: ['intro'], sponsors: { whynot: { state: 'active', progress: 2 } }, tutorialDone: true };
    src.ownedGear.push('mystery_board');
    src.equipped.vest = null;
    const s = migrate(JSON.parse(JSON.stringify(src)));
    expect(s).toEqual(src);
  });

  it('always owns what is equipped and never loses the starter kit', () => {
    const s = migrate({ version: 3, ownedGear: ['wb_pro'], equipped: { wakeboard: 'wb_gold', bindings: 5, vest: null } });
    expect(s.equipped.wakeboard).toBe('wb_gold');
    expect(s.equipped.bindings).toBe(STARTER_GEAR.bindings);
    expect(s.equipped.vest).toBeNull();
    expect(s.ownedGear).toEqual(expect.arrayContaining(['wb_pro', 'wb_gold', ...Object.values(STARTER_GEAR)]));
  });

  it('reads a save from a future version best-effort', () => {
    const s = migrate({ version: SAVE_VERSION + 4, coins: 900, rep: 50, brandNewBlock: { x: 1 }, settings: { lang: 'ru', hologram: true } });
    expectValid(s);
    expect(s.coins).toBe(900);
    expect(s.settings.lang).toBe('ru');
    expect('brandNewBlock' in s).toBe(false);
  });

  it('does not let stored JSON pollute prototypes', () => {
    const evil = JSON.parse('{"version":3,"spots":{"__proto__":{"goals":[true]},"constructor":{"goals":[]},"ok":{"goals":[true]}},"stats":{"tricksLanded":{"__proto__":5}}}');
    const s = migrate(evil);
    expect(Object.keys(s.spots)).toEqual(['ok']);
    expect(({} as Record<string, unknown>).goals).toBeUndefined();
  });
});

describe('createSaveStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts from defaults on empty storage and is persistent', () => {
    const storage = memoryStorage();
    const store = createSaveStore(new EventBus(), { storage });
    expect(store.data).toEqual(defaultSave());
    expect(store.persistent).toBe(true);
    expect(storage.map.has(`${SAVE_KEY}.probe`)).toBe(false);
  });

  it('loads and migrates an old save and writes the upgrade back once', () => {
    const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, coins: 40, stars: { phuket_oldtown: 2 }, best: {}, lang: 'en', muted: false }) });
    const store = createSaveStore(new EventBus(), { storage });
    expect(store.data.coins).toBe(40);
    expect(store.data.spots.phuket_oldtown.goals.filter(Boolean)).toHaveLength(2);
    expect(storage.writes).toBe(1);
    expect(JSON.parse(storage.map.get(SAVE_KEY) as string).version).toBe(SAVE_VERSION);
  });

  it('does not rewrite an up-to-date save on load', () => {
    const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ ...defaultSave(), coins: 5 }) });
    const store = createSaveStore(new EventBus(), { storage });
    expect(store.data.coins).toBe(5);
    expect(storage.writes).toBe(0);
  });

  it('debounces writes (~300 ms) and emits save:changed on every update', () => {
    const storage = memoryStorage();
    const bus = new EventBus();
    const changed = vi.fn();
    bus.on('save:changed', changed);
    const store = createSaveStore(bus, { storage });

    store.update((d) => (d.coins += 10));
    vi.advanceTimersByTime(200);
    store.update((d) => (d.coins += 10));
    vi.advanceTimersByTime(200);
    store.update((d) => (d.coins += 10));
    expect(changed).toHaveBeenCalledTimes(3);
    expect(store.data.coins).toBe(30);
    expect(storage.writes).toBe(0); // still inside the debounce window

    vi.advanceTimersByTime(299);
    expect(storage.writes).toBe(0);
    vi.advanceTimersByTime(1);
    expect(storage.writes).toBe(1);
    expect(JSON.parse(storage.map.get(SAVE_KEY) as string).coins).toBe(30);

    vi.advanceTimersByTime(5000);
    expect(storage.writes).toBe(1);
  });

  it('flush() writes immediately and cancels the pending timer', () => {
    const storage = memoryStorage();
    const store = createSaveStore(new EventBus(), { storage });
    store.flush();
    expect(storage.writes).toBe(0); // nothing to write

    store.update((d) => (d.rep = 99));
    store.flush();
    expect(storage.writes).toBe(1);
    expect(JSON.parse(storage.map.get(SAVE_KEY) as string).rep).toBe(99);
    vi.advanceTimersByTime(1000);
    expect(storage.writes).toBe(1);
  });

  it('a second store sees what the first one saved', () => {
    const storage = memoryStorage();
    const a = createSaveStore(new EventBus(), { storage });
    a.update((d) => {
      d.coins = 1234;
      d.settings.stance = 'goofy';
      d.spots.phuket_oldtown = { goals: [true, false, false, false, false], bestScore: 900, bestCombo: 300, bestTrick: null, runs: 1 };
    });
    a.flush();
    const b = createSaveStore(new EventBus(), { storage });
    expect(b.data).toEqual(a.data);
    expect(b.data).not.toBe(a.data);
  });

  it('reset() restores defaults in place, writes at once and notifies', () => {
    const storage = memoryStorage();
    const bus = new EventBus();
    const changed = vi.fn();
    bus.on('save:changed', changed);
    const store = createSaveStore(bus, { storage });
    const ref = store.data;
    store.update((d) => {
      d.coins = 500;
      d.ownedGear.push('wb_pro');
    });
    store.reset();
    expect(store.data).toBe(ref);
    expect(store.data).toEqual(defaultSave());
    expect(changed).toHaveBeenCalledTimes(2);
    expect(JSON.parse(storage.map.get(SAVE_KEY) as string)).toEqual(defaultSave());
    vi.advanceTimersByTime(1000); // the debounced write of the update must not resurrect old data
    expect(JSON.parse(storage.map.get(SAVE_KEY) as string).coins).toBe(0);
  });

  it('keeps emitting and saving when a mutator throws', () => {
    const storage = memoryStorage();
    const bus = new EventBus();
    const changed = vi.fn();
    bus.on('save:changed', changed);
    const store = createSaveStore(bus, { storage });
    expect(() =>
      store.update((d) => {
        d.coins = 7;
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(changed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(JSON.parse(storage.map.get(SAVE_KEY) as string).coins).toBe(7);
  });

  it('works in memory when getItem and setItem throw', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const bus = new EventBus();
    const changed = vi.fn();
    bus.on('save:changed', changed);
    let store!: ReturnType<typeof createSaveStore>;
    expect(() => (store = createSaveStore(bus, { storage }))).not.toThrow();
    expect(store.persistent).toBe(false);
    expect(store.data).toEqual(defaultSave());
    expect(() => {
      store.update((d) => (d.coins = 5));
      vi.advanceTimersByTime(1000);
      store.flush();
      store.reset();
    }).not.toThrow();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(store.data.coins).toBe(0);
  });

  it('turns non-persistent when the quota runs out mid-session and recovers later', () => {
    const storage = memoryStorage();
    let full = false;
    const real = storage.setItem.bind(storage);
    storage.setItem = (k, v) => {
      if (full) throw new Error('QuotaExceededError');
      real(k, v);
    };
    const store = createSaveStore(new EventBus(), { storage });
    expect(store.persistent).toBe(true);
    full = true;
    store.update((d) => (d.coins = 1));
    store.flush();
    expect(store.persistent).toBe(false);
    expect(store.data.coins).toBe(1);
    full = false;
    store.update((d) => (d.coins = 2));
    store.flush();
    expect(store.persistent).toBe(true);
    expect(JSON.parse(storage.map.get(SAVE_KEY) as string).coins).toBe(2);
  });

  it('works without any storage (null / missing localStorage / throwing getter)', () => {
    const none = createSaveStore(new EventBus(), { storage: null });
    expect(none.persistent).toBe(false);
    none.update((d) => (d.coins = 3));
    none.flush();
    expect(none.data.coins).toBe(3);

    vi.stubGlobal('localStorage', undefined);
    expect(createSaveStore(new EventBus()).persistent).toBe(false);

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: The operation is insecure.');
      },
    });
    let store!: ReturnType<typeof createSaveStore>;
    expect(() => (store = createSaveStore(new EventBus()))).not.toThrow();
    expect(store.persistent).toBe(false);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined });
  });

  it('uses globalThis.localStorage by default', () => {
    const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ ...defaultSave(), rep: 321 }) });
    vi.stubGlobal('localStorage', storage);
    const store = createSaveStore(new EventBus());
    expect(store.persistent).toBe(true);
    expect(store.data.rep).toBe(321);
  });

  it('recovers from corrupt JSON and keeps a backup of it', () => {
    const storage = memoryStorage({ [SAVE_KEY]: '{"version":3,"coins":12' });
    const store = createSaveStore(new EventBus(), { storage });
    expect(store.data).toEqual(defaultSave());
    expect(storage.map.get(`${SAVE_KEY}.backup`)).toBe('{"version":3,"coins":12');
    expect(JSON.parse(storage.map.get(SAVE_KEY) as string)).toEqual(defaultSave());
  });

  it('backs up a save written by a newer version before downgrading it', () => {
    const future = JSON.stringify({ version: SAVE_VERSION + 1, coins: 60, holograms: [1, 2, 3] });
    const storage = memoryStorage({ [SAVE_KEY]: future });
    const store = createSaveStore(new EventBus(), { storage });
    expect(store.data.coins).toBe(60);
    expect(store.data.version).toBe(SAVE_VERSION);
    expect(storage.map.get(`${SAVE_KEY}.backup`)).toBe(future);
  });
});

describe('migrate v3 → v4 (team jersey)', () => {
  it('gives everyone the jersey, equips it over the starter shorts and moves untouched riders to the team look', () => {
    const v3 = {
      version: 3,
      appearance: { gender: 'male', skin: 1, hair: 'short', hairColor: 0x4a2f1c, headwear: 'helmet', headwearColor: 0x1c1d21, vest: true, vestColor: 0xe30613, bottom: 'shorts', bottomColor: 0x1c1d21, topColor: 0xffffff },
      ownedGear: ['wb_street', 'bd_classic', 'ws_plank', 'vest_basic', 'helmet_basic', 'shorts_basic'],
      equipped: { wakeboard: 'wb_street', bindings: 'bd_classic', wakeskate: 'ws_plank', vest: 'vest_basic', helmet: 'helmet_basic', apparel: 'shorts_basic' },
    };
    const s = migrate(v3);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.ownedGear).toContain('jersey_pink');
    expect(s.ownedGear).toContain('shorts_basic');
    expect(s.equipped.apparel).toBe('jersey_pink');
    expect(s.appearance.vest).toBe(false);
    expect(s.appearance.topColor).toBe(DEFAULT_APPEARANCE.topColor);
  });

  it('keeps a customised rider and a non-starter outfit as they were', () => {
    const s = migrate({
      version: 3,
      appearance: { gender: 'female', skin: 3, hair: 'long', hairColor: 0x1b1512, headwear: 'cap', headwearColor: 0x3a3c43, vest: true, vestColor: 0x2a5fd0, bottom: 'wetsuit', bottomColor: 0x1c1d21, topColor: 0xffffff },
      ownedGear: ['hoodie_street'],
      equipped: { apparel: 'hoodie_street' },
    });
    expect(s.equipped.apparel).toBe('hoodie_street');
    expect(s.appearance.vest).toBe(true);
    expect(s.appearance.vestColor).toBe(0x2a5fd0);
  });
});
