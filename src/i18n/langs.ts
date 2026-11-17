import type { Lang } from '../types';

/** Every interface language, in the order of the language picker. `label` is the language's own name. */
export const LANGS: readonly { id: Lang; label: string; short: string; locale: string }[] = [
  { id: 'ru', label: 'Русский', short: 'RU', locale: 'ru-RU' },
  { id: 'en', label: 'English', short: 'EN', locale: 'en-US' },
  { id: 'fr', label: 'Français', short: 'FR', locale: 'fr-FR' },
  { id: 'de', label: 'Deutsch', short: 'DE', locale: 'de-DE' },
  { id: 'pl', label: 'Polski', short: 'PL', locale: 'pl-PL' },
  { id: 'pt', label: 'Português (Brasil)', short: 'PT', locale: 'pt-BR' },
  { id: 'es', label: 'Español', short: 'ES', locale: 'es-ES' },
  { id: 'it', label: 'Italiano', short: 'IT', locale: 'it-IT' },
  { id: 'th', label: 'ไทย', short: 'TH', locale: 'th-TH' },
  { id: 'ja', label: '日本語', short: 'JA', locale: 'ja-JP' },
];

export const LANG_IDS: readonly Lang[] = LANGS.map((x) => x.id);

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANG_IDS as readonly string[]).includes(v);
}

export function localeOf(lang: Lang): string {
  return LANGS.find((x) => x.id === lang)?.locale ?? 'en-US';
}
