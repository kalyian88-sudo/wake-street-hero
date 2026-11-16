import { describe, expect, it } from 'vitest';
import { RIDER_LEVELS } from '../../src/career/progress';
import { BRAND, NEUTRAL_STATS, STARTER_GEAR } from '../../src/config';
import { computeStats, GEAR, GEAR_CATEGORIES, gearInCategory, gearUrl, getGear, STAT_KEYS } from '../../src/data/gear';
import type { EquippedGear, GearCategory, GearItem, GearLook } from '../../src/types';

const STARTER: EquippedGear = { ...STARTER_GEAR };
const GRAPHICS: GearLook['graphic'][] = ['logo', 'stripe', 'split', 'camo', 'wood', 'fade', 'checker', 'plain', 'flames', 'tape'];

describe('gear catalogue — integrity', () => {
  it('ids are unique', () => {
    const ids = GEAR.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('has the range the brief asks for', () => {
    const count = (c: GearCategory): number => gearInCategory(c).length;
    expect(count('bindings')).toBe(4);
    expect(count('wakeboard')).toBe(4);
    expect(count('wakeskate')).toBe(3);
    expect(count('vest')).toBe(3);
    expect(count('helmet')).toBe(3);
    expect(count('apparel')).toBe(4);
    expect(GEAR.every((g) => GEAR_CATEGORIES.includes(g.category))).toBe(true);
    expect(gearInCategory('apparel').map((g) => g.apparelKind).sort()).toEqual(['hoodie', 'shorts', 'tee', 'wetsuit']);
    expect(gearInCategory('helmet').map((g) => g.headKind)).toEqual(expect.arrayContaining(['helmet', 'cap']));
  });

  it('every starter item exists, sits in its own slot and is free', () => {
    for (const slot of Object.keys(STARTER_GEAR) as (keyof typeof STARTER_GEAR)[]) {
      const item = getGear(STARTER_GEAR[slot]);
      expect(item, slot).toBeDefined();
      expect(item!.price, slot).toBe(0);
      expect(item!.category, slot).toBe(slot);
      expect(item!.unlockLevel, slot).toBeUndefined();
      expect(Object.keys(item!.stats), slot).toHaveLength(0);
    }
  });

  it('names and descriptions are filled in both languages', () => {
    for (const g of GEAR) {
      for (const text of [g.name, g.desc]) {
        expect(text.ru.trim().length, g.id).toBeGreaterThan(2);
        expect(text.en.trim().length, g.id).toBeGreaterThan(2);
      }
      expect(g.desc.ru.length, g.id).toBeGreaterThan(30);
      expect(g.desc.en.length, g.id).toBeGreaterThan(30);
      expect(g.desc.ru, g.id).toMatch(/[а-яё]/i);
      expect(g.desc.en, g.id).not.toMatch(/[а-яё]/i);
      expect(g.name.en, g.id).toContain(BRAND.name);
      expect(g.name.ru, g.id).toContain(BRAND.name);
    }
  });

  it('prices: free starters, sensible steps, a top tier', () => {
    for (const g of GEAR) {
      expect(Number.isInteger(g.price), g.id).toBe(true);
      expect(g.price, g.id).toBeGreaterThanOrEqual(0);
      expect(g.price % 50, g.id).toBe(0);
    }
    for (const c of GEAR_CATEGORIES) {
      const prices = gearInCategory(c).map((g) => g.price);
      expect(prices, c).toEqual([...prices].sort((a, b) => a - b)); // listed cheapest first
      expect(prices[0], c).toBe(0);
    }
    expect(Math.max(...GEAR.map((g) => g.price))).toBeGreaterThanOrEqual(3000);
  });

  it('stat deltas are noticeable but balanced', () => {
    for (const g of GEAR) {
      const keys = Object.keys(g.stats) as (keyof typeof g.stats)[];
      for (const k of keys) {
        expect(STAT_KEYS, g.id).toContain(k);
        const v = g.stats[k] ?? 0;
        expect(Math.abs(v), `${g.id}.${k}`).toBeGreaterThanOrEqual(0.5);
        expect(Math.abs(v), `${g.id}.${k}`).toBeLessThanOrEqual(2);
      }
      const sum = keys.reduce((a, k) => a + (g.stats[k] ?? 0), 0);
      if (g.price > 0) {
        expect(keys.length, g.id).toBeGreaterThan(0);
        expect(sum, g.id).toBeGreaterThanOrEqual(0); // paid gear is never a net downgrade
        expect(sum, g.id).toBeLessThanOrEqual(5);
      }
      // mid-tier gear always trades something away
      if (g.price > 0 && g.price < 1000 && g.category !== 'apparel') expect(Math.min(...keys.map((k) => g.stats[k] ?? 0)), g.id).toBeLessThan(0);
    }
    // only wakeskates and soft goods touch the catch stat; bindings never do (a wakeskate has none)
    expect(gearInCategory('bindings').every((g) => g.stats.catch === undefined)).toBe(true);
    expect(gearInCategory('wakeboard').every((g) => g.stats.catch === undefined)).toBe(true);
  });

  it('more expensive means better overall inside a category', () => {
    const total = (g: GearItem): number => STAT_KEYS.reduce((a, k) => a + (g.stats[k] ?? 0), 0);
    for (const c of GEAR_CATEGORIES) {
      const items = gearInCategory(c);
      const top = items[items.length - 1];
      for (const g of items) expect(total(top), `${c}: ${g.id}`).toBeGreaterThanOrEqual(total(g));
    }
  });

  it('looks: valid colours and graphics, brand palette first', () => {
    for (const g of GEAR) {
      for (const colour of [g.look.primary, g.look.secondary, g.look.accent]) {
        expect(Number.isInteger(colour), g.id).toBe(true);
        expect(colour, g.id).toBeGreaterThanOrEqual(0);
        expect(colour, g.id).toBeLessThanOrEqual(0xffffff);
      }
      expect(GRAPHICS, g.id).toContain(g.look.graphic);
    }
    const brand: number[] = [BRAND.colors.red, BRAND.colors.dark, BRAND.colors.darker, BRAND.colors.grey, BRAND.colors.white];
    const brandOnly = GEAR.filter((g) => [g.look.primary, g.look.secondary, g.look.accent].every((c) => brand.includes(c)));
    expect(brandOnly.length).toBeGreaterThan(GEAR.length / 2);
    expect(GEAR.length - brandOnly.length).toBeGreaterThanOrEqual(4); // some colourful options
    expect(GEAR.filter((g) => [g.look.primary, g.look.secondary, g.look.accent].includes(BRAND.colors.red)).length).toBeGreaterThan(GEAR.length * 0.7);
    for (const slot of Object.values(STARTER_GEAR)) {
      const look = getGear(slot)!.look;
      expect([look.primary, look.secondary, look.accent]).toContain(BRAND.colors.red);
    }
  });

  it('links default to the brand site', () => {
    for (const g of GEAR) {
      expect(gearUrl(g), g.id).toMatch(/^https:\/\//);
      expect(gearUrl(g).startsWith(BRAND.siteUrl), g.id).toBe(true);
    }
    expect(gearUrl({ ...GEAR[0], url: undefined })).toBe(BRAND.siteUrl);
    expect(gearUrl({ ...GEAR[0], url: 'https://example.com/board' })).toBe('https://example.com/board');
    expect(gearUrl(null)).toBe(BRAND.siteUrl);
  });

  it('premium items are level-locked, everything is reachable', () => {
    const locked = GEAR.filter((g) => g.unlockLevel !== undefined);
    expect(locked.length).toBeGreaterThanOrEqual(5);
    for (const g of locked) {
      expect(g.unlockLevel, g.id).toBeGreaterThanOrEqual(2);
      expect(g.unlockLevel, g.id).toBeLessThanOrEqual(RIDER_LEVELS.length);
      expect(g.price, g.id).toBeGreaterThanOrEqual(1000);
    }
    expect(GEAR.filter((g) => g.price > 0 && g.price < 1000).every((g) => g.unlockLevel === undefined)).toBe(true);
  });

  it('getGear handles missing ids', () => {
    expect(getGear('wb_street')?.category).toBe('wakeboard');
    expect(getGear('nope')).toBeUndefined();
    expect(getGear(null)).toBeUndefined();
    expect(getGear(undefined)).toBeUndefined();
  });
});

describe('computeStats', () => {
  it('starter gear is neutral on both boards', () => {
    expect(computeStats(STARTER, 'wakeboard')).toEqual(NEUTRAL_STATS);
    expect(computeStats(STARTER, 'wakeskate')).toEqual(NEUTRAL_STATS);
    expect(computeStats(STARTER, 'wakeboard')).not.toBe(NEUTRAL_STATS);
  });

  it('adds the deltas of the board being ridden', () => {
    const eq: EquippedGear = { ...STARTER, wakeboard: 'wb_butter', wakeskate: 'ws_flick' };
    expect(computeStats(eq, 'wakeboard')).toEqual({ pop: 4, spin: 5, rail: 7, landing: 5.5, catch: 5 });
    expect(computeStats(eq, 'wakeskate')).toEqual({ pop: 4.5, spin: 6, rail: 5, landing: 5, catch: 6.5 });
  });

  it('bindings only count on the wakeboard', () => {
    const eq: EquippedGear = { ...STARTER, bindings: 'bd_lock' };
    expect(computeStats(eq, 'wakeboard')).toEqual({ pop: 6.5, spin: 5.5, rail: 4, landing: 5, catch: 5 });
    expect(computeStats(eq, 'wakeskate')).toEqual(NEUTRAL_STATS);
  });

  it('vest, helmet and apparel count on both boards', () => {
    const eq: EquippedGear = { ...STARTER, vest: 'vest_impact', helmet: 'helmet_pro', apparel: 'hoodie_street' };
    const want = { pop: 5, spin: 4, rail: 6.5, landing: 8, catch: 5 };
    expect(computeStats(eq, 'wakeboard')).toEqual(want);
    expect(computeStats(eq, 'wakeskate')).toEqual(want);
  });

  it('empty slots and unknown ids are ignored', () => {
    const eq: EquippedGear = { wakeboard: 'ghost', bindings: 'ghost', wakeskate: 'ghost', vest: null, helmet: null, apparel: null };
    expect(computeStats(eq, 'wakeboard')).toEqual(NEUTRAL_STATS);
  });

  it('clamps every stat to 0..10', () => {
    // the softest-landing set there is: 5 + 1 + 1.5 + 1.5 + 1 + 0.5 = 10.5 → 10
    const soft: EquippedGear = { wakeboard: 'wb_hero', bindings: 'bd_hero', wakeskate: 'ws_plank', vest: 'vest_impact', helmet: 'helmet_pro', apparel: 'hoodie_street' };
    const s = computeStats(soft, 'wakeboard');
    expect(s.landing).toBe(10);
    for (const k of STAT_KEYS) {
      expect(s[k]).toBeGreaterThanOrEqual(0);
      expect(s[k]).toBeLessThanOrEqual(10);
    }
  });

  it('no combination of catalogue items leaves 0..10 or drops a stat below 2', () => {
    const opt = (c: GearCategory): (string | null)[] => [null, ...gearInCategory(c).map((g) => g.id)];
    let builds = 0;
    for (const wakeboard of gearInCategory('wakeboard'))
      for (const bindings of gearInCategory('bindings'))
        for (const wakeskate of gearInCategory('wakeskate'))
          for (const vest of opt('vest'))
            for (const helmet of opt('helmet'))
              for (const apparel of opt('apparel')) {
                const eq: EquippedGear = { wakeboard: wakeboard.id, bindings: bindings.id, wakeskate: wakeskate.id, vest, helmet, apparel };
                for (const board of ['wakeboard', 'wakeskate'] as const) {
                  const s = computeStats(eq, board);
                  for (const k of STAT_KEYS) {
                    if (s[k] < 2 || s[k] > 10) throw new Error(`${JSON.stringify(eq)} ${board} ${k}=${s[k]}`);
                  }
                  builds++;
                }
              }
    expect(builds).toBeGreaterThan(1000);
  });

  it('builds feel different: a rail build and a pop build are 2+ points apart', () => {
    const railBuild = computeStats({ ...STARTER, wakeboard: 'wb_butter', bindings: 'bd_jib' }, 'wakeboard');
    const popBuild = computeStats({ ...STARTER, wakeboard: 'wb_boost', bindings: 'bd_lock' }, 'wakeboard');
    expect(railBuild.rail - popBuild.rail).toBeGreaterThanOrEqual(4);
    expect(popBuild.pop - railBuild.pop).toBeGreaterThanOrEqual(4);
    expect(railBuild.rail).toBe(8.5);
    expect(popBuild.pop).toBe(8.5);
  });
});
