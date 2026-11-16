import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../src/i18n/en.json';
import { detectLang, i18n, l, plural, pluralIndex, t } from '../../src/i18n/i18n';
import ru from '../../src/i18n/ru.json';

const ruDict = ru as Record<string, string>;
const enDict = en as Record<string, string>;

function placeholders(s: string): string[] {
  return [...new Set(s.match(/\{\w+\}/g) ?? [])].sort();
}

describe('dictionaries', () => {
  it('ru.json and en.json have exactly the same keys', () => {
    expect(Object.keys(ruDict).sort()).toEqual(Object.keys(enDict).sort());
    expect(Object.keys(ruDict).length).toBeGreaterThan(100);
  });

  it('have no empty strings', () => {
    for (const [dict, name] of [
      [ruDict, 'ru'],
      [enDict, 'en'],
    ] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value, `${name}:${key}`).toBe('string');
        expect(value.trim().length, `${name}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('use the same placeholders in both languages', () => {
    for (const key of Object.keys(ruDict)) {
      expect(placeholders(enDict[key]), key).toEqual(placeholders(ruDict[key]));
    }
  });

  it('give plural keys 3 Russian forms and 2 English forms', () => {
    const pluralKeys = Object.keys(ruDict).filter((k) => ruDict[k].includes('|') || enDict[k].includes('|'));
    expect(pluralKeys.length).toBeGreaterThan(0);
    for (const key of pluralKeys) {
      expect(ruDict[key].split('|'), key).toHaveLength(3);
      expect(enDict[key].split('|'), key).toHaveLength(2);
      expect(ruDict[key], key).toContain('{count}');
    }
  });

  it('really are Russian / English', () => {
    const cyr = /[а-яё]/i;
    const ruShare = Object.values(ruDict).filter((v) => cyr.test(v)).length / Object.keys(ruDict).length;
    expect(ruShare).toBeGreaterThan(0.9);
    for (const [key, value] of Object.entries(enDict)) expect(cyr.test(value), key).toBe(false);
  });
});

describe('i18n', () => {
  beforeEach(() => {
    i18n.setLang('ru');
    i18n.extend('ru', {
      'test.hello': 'Привет, {name}!',
      'test.stars': '{count} звезда|{count} звезды|{count} звёзд',
      'test.pipe': 'A | B',
      'test.onlyRu': 'только по-русски',
    });
    i18n.extend('en', { 'test.hello': 'Hi, {name}!', 'test.stars': '{count} star|{count} stars', 'test.pipe': 'A | B', 'test.onlyEn': 'english only' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('looks keys up in the current language', () => {
    expect(t('ui.common.back')).toBe('Назад');
    i18n.setLang('en');
    expect(t('ui.common.back')).toBe('Back');
    expect(i18n.lang).toBe('en');
  });

  it('interpolates {params} and leaves unknown placeholders alone', () => {
    expect(t('test.hello', { name: 'Коля' })).toBe('Привет, Коля!');
    expect(t('test.hello', { other: 1 })).toBe('Привет, {name}!');
    expect(t('test.hello')).toBe('Привет, {name}!');
    expect(t('ui.spot.speed', { kmh: 34 })).toBe('≈ 34 км/ч');
  });

  it('picks Russian plural forms by `count`', () => {
    const forms: Record<number, string> = {
      0: '0 звёзд',
      1: '1 звезда',
      2: '2 звезды',
      4: '4 звезды',
      5: '5 звёзд',
      11: '11 звёзд',
      12: '12 звёзд',
      14: '14 звёзд',
      21: '21 звезда',
      22: '22 звезды',
      25: '25 звёзд',
      101: '101 звезда',
      111: '111 звёзд',
      112: '112 звёзд',
      1000: '1000 звёзд',
    };
    for (const [n, expected] of Object.entries(forms)) expect(t('test.stars', { count: Number(n) })).toBe(expected);
    expect(t('test.stars', { count: 1.5 })).toBe('1.5 звезды');
  });

  it('picks English plural forms by `count`', () => {
    i18n.setLang('en');
    expect(t('test.stars', { count: 0 })).toBe('0 stars');
    expect(t('test.stars', { count: 1 })).toBe('1 star');
    expect(t('test.stars', { count: 2 })).toBe('2 stars');
    expect(t('ui.hub.spots', { count: 1 })).toBe('1 spot');
    expect(t('ui.hub.spots', { count: 4 })).toBe('4 spots');
  });

  it('uses real plural keys from the dictionary', () => {
    expect(t('ui.hub.spots', { count: 1 })).toBe('1 спот');
    expect(t('ui.hub.spots', { count: 3 })).toBe('3 спота');
    expect(t('ui.hub.spots', { count: 12 })).toBe('12 спотов');
    expect(t('ui.tricks.landed', { count: 2 })).toBe('Сделан 2 раза');
    expect(t('ui.hub.lockedToast', { count: 5, city: 'Москва' })).toBe('Москва: не хватает 5 звёзд');
  });

  it('does not split on | without a numeric count', () => {
    expect(t('test.pipe')).toBe('A | B');
    expect(t('test.pipe', { name: 'x' })).toBe('A | B');
  });

  it('plural() / pluralIndex() helpers', () => {
    expect(pluralIndex('ru', 1)).toBe(0);
    expect(pluralIndex('ru', 3)).toBe(1);
    expect(pluralIndex('ru', 7)).toBe(2);
    expect(pluralIndex('ru', -21)).toBe(0);
    expect(pluralIndex('en', 1)).toBe(0);
    expect(pluralIndex('en', 0)).toBe(1);
    expect(plural('ru', 3, ['звезда', 'звезды', 'звёзд'])).toBe('звезды');
    expect(plural('ru', 8, ['раз', 'раза'])).toBe('раза'); // missing form → last one
    expect(plural('en', 8, [])).toBe('');
  });

  it('returns the key itself for a missing key and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(t('nope.missing.key')).toBe('nope.missing.key');
    expect(t('nope.missing.key')).toBe('nope.missing.key');
    expect(t('nope.missing.key', { count: 2 })).toBe('nope.missing.key');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('nope.missing.key')).length).toBeLessThanOrEqual(1);
  });

  it('falls back to the other language before giving up', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(t('test.onlyEn')).toBe('english only');
    i18n.setLang('en');
    expect(t('test.onlyRu')).toBe('только по-русски');
  });

  it('l() picks the current language from data text', () => {
    const name = { ru: 'Бэкролл', en: 'Backroll' };
    expect(l(name)).toBe('Бэкролл');
    i18n.setLang('en');
    expect(l(name)).toBe('Backroll');
    expect(l({ ru: 'Только так', en: '' })).toBe('Только так');
  });

  it('extend() merges namespaces at runtime and can override', () => {
    i18n.extend('ru', { 'hud.combo': 'Комбо ×{mult}' });
    i18n.extend('en', { 'hud.combo': 'Combo ×{mult}' });
    expect(t('hud.combo', { mult: 4 })).toBe('Комбо ×4');
    i18n.setLang('en');
    expect(t('hud.combo', { mult: 4 })).toBe('Combo ×4');
    i18n.extend('en', { 'hud.combo': 'x{mult}!' });
    expect(t('hud.combo', { mult: 4 })).toBe('x4!');
    expect(t('ui.common.back')).toBe('Back');
  });

  it('setLang fires onChange once per real change and unsubscribes', () => {
    const cb = vi.fn();
    const off = i18n.onChange(cb);
    i18n.setLang('ru'); // already ru
    expect(cb).not.toHaveBeenCalled();
    i18n.setLang('en');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith('en');
    i18n.setLang('de' as never);
    expect(i18n.lang).toBe('en');
    off();
    i18n.setLang('ru');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a throwing onChange listener does not break the others', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const good = vi.fn();
    const offBad = i18n.onChange(() => {
      throw new Error('boom');
    });
    const offGood = i18n.onChange(good);
    expect(() => i18n.setLang('en')).not.toThrow();
    expect(good).toHaveBeenCalledWith('en');
    offBad();
    offGood();
  });
});

describe('detectLang', () => {
  afterEach(() => vi.unstubAllGlobals());

  const cases: [string, 'ru' | 'en'][] = [
    ['ru', 'ru'],
    ['ru-RU', 'ru'],
    ['RU-ru', 'ru'],
    ['uk-UA', 'ru'],
    ['be', 'ru'],
    ['kk-KZ', 'ru'],
    ['en-US', 'en'],
    ['en', 'en'],
    ['de-DE', 'en'],
    ['fr', 'en'],
    ['th-TH', 'en'],
    ['rup', 'en'],
    ['', 'en'],
  ];

  for (const [tag, expected] of cases) {
    it(`"${tag}" → ${expected}`, () => {
      vi.stubGlobal('navigator', { language: tag });
      expect(detectLang()).toBe(expected);
    });
  }

  it('defaults to en without a navigator', () => {
    vi.stubGlobal('navigator', undefined);
    expect(detectLang()).toBe('en');
  });

  it('honours ?lang= in the URL', () => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    vi.stubGlobal('location', { search: '?debug&lang=ru' });
    expect(detectLang()).toBe('ru');
    vi.stubGlobal('location', { search: '?lang=xx' });
    expect(detectLang()).toBe('en');
  });
});
