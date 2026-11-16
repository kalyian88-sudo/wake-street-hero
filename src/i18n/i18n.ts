/**
 * i18n: flat key → string dictionaries (src/i18n/ru.json, en.json), `{param}` interpolation,
 * plural forms and runtime extension by other modules (`i18n.extend`).
 *
 * Plurals: a value may hold forms separated by `|` — Russian "one|few|many" (звезда|звезды|звёзд),
 * English "one|other". The form is picked by the numeric `count` param:
 *   t('ui.stars', { count: 3 })   with   "ui.stars": "{count} звезда|{count} звезды|{count} звёзд"
 * A value without `count` in the params is never split, so `|` stays usable in ordinary strings.
 *
 * The singleton only fires its own onChange callbacks; whoever calls setLang() is responsible for
 * emitting 'lang:changed' on the event bus.
 */
import type { II18n, L10n, Lang } from '../types';
import enDict from './en.json';
import ruDict from './ru.json';

const RU_LIKE = ['ru', 'uk', 'be', 'kk'];

/**
 * Language of the device: 'ru' for Russian and the neighbouring languages whose speakers read Russian
 * (uk / be / kk), otherwise 'en'. A `?lang=ru|en` URL parameter wins (dev / tests / shared links).
 */
export function detectLang(): Lang {
  try {
    const search = (globalThis as { location?: { search?: string } }).location?.search;
    if (search) {
      const forced = new URLSearchParams(search).get('lang');
      if (forced === 'ru' || forced === 'en') return forced;
    }
  } catch {
    /* no URL available */
  }
  let tag = '';
  try {
    tag = typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : '';
  } catch {
    tag = '';
  }
  const primary = tag.toLowerCase().split(/[-_]/)[0];
  return RU_LIKE.includes(primary) ? 'ru' : 'en';
}

/** Index of the plural form for `n`: ru → 0 one, 1 few, 2 many; en → 0 one, 1 other. */
export function pluralIndex(lang: Lang, n: number): number {
  const abs = Math.abs(n);
  if (lang === 'ru') {
    if (!Number.isInteger(abs)) return 1; // "1,5 звезды"
    const d10 = abs % 10;
    const d100 = abs % 100;
    if (d10 === 1 && d100 !== 11) return 0;
    if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 1;
    return 2;
  }
  return abs === 1 ? 0 : 1;
}

/** Pick a plural form from an explicit list (missing forms fall back to the last one). */
export function plural(lang: Lang, n: number, forms: readonly string[]): string {
  if (forms.length === 0) return '';
  return forms[Math.min(pluralIndex(lang, n), forms.length - 1)];
}

function isDev(): boolean {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

class I18n implements II18n {
  private current: Lang = detectLang();
  private readonly dicts: Record<Lang, Record<string, string>> = {
    ru: { ...(ruDict as Record<string, string>) },
    en: { ...(enDict as Record<string, string>) },
  };
  private readonly listeners = new Set<(lang: Lang) => void>();
  private readonly warned = new Set<string>();

  get lang(): Lang {
    return this.current;
  }

  setLang(lang: Lang): void {
    if (lang !== 'ru' && lang !== 'en') return;
    if (lang === this.current) return;
    this.current = lang;
    try {
      if (typeof document !== 'undefined') document.documentElement.lang = lang;
    } catch {
      /* headless */
    }
    for (const cb of [...this.listeners]) {
      try {
        cb(lang);
      } catch (err) {
        console.error('[i18n] onChange listener threw', err);
      }
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    let template = this.dicts[this.current][key];
    if (template === undefined) {
      // Untranslated in the current language: better the other language than a raw key.
      template = this.dicts[this.current === 'ru' ? 'en' : 'ru'][key];
      if (isDev() && !this.warned.has(`${this.current}:${key}`)) {
        this.warned.add(`${this.current}:${key}`);
        console.warn(`[i18n] missing "${key}" for "${this.current}"`);
      }
      if (template === undefined) return key;
    }
    if (!params) return template;
    const count = params.count;
    if (typeof count === 'number' && template.includes('|')) {
      template = plural(this.current, count, template.split('|'));
    }
    return interpolate(template, params);
  }

  l(text: L10n): string {
    if (!text) return '';
    return text[this.current] || text.en || text.ru || '';
  }

  /** True when the key exists in the current language (or the fallback one). */
  has(key: string): boolean {
    return key in this.dicts.ru || key in this.dicts.en;
  }

  onChange(cb: (lang: Lang) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  extend(lang: Lang, dict: Record<string, string>): void {
    if (lang !== 'ru' && lang !== 'en') return;
    Object.assign(this.dicts[lang], dict);
  }
}

/** Global i18n singleton. */
export const i18n: II18n & { has(key: string): boolean } = new I18n();

export const t = (key: string, params?: Record<string, string | number>): string => i18n.t(key, params);
export const l = (text: L10n): string => i18n.l(text);
