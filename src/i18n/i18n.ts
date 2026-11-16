// STUB — replaced by the shell agent. Keep the export names/signatures.
import type { II18n, L10n, Lang } from '../types';

export function detectLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

let lang: Lang = detectLang();

/** Global i18n singleton. */
export const i18n: II18n = {
  get lang() {
    return lang;
  },
  setLang(l) {
    lang = l;
  },
  t: (key) => key,
  l: (text) => text[lang],
  onChange: () => () => undefined,
};

export const t = (key: string, params?: Record<string, string | number>): string => i18n.t(key, params);
export const l = (text: L10n): string => i18n.l(text);
