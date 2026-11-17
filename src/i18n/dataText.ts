/**
 * Translations of the texts written in the data files (tricks, gear, spots, cities, rider levels).
 *
 * The data files keep Russian + English inline ({ ru, en }). Every other language lives in
 * src/i18n/data/<lang>.json as a flat map  "<path>" → text,  where <path> is the location of the
 * text object in the data, e.g.  "tricks.backroll.name",  "gear.wb_street.desc",
 * "spots.phuket_oldtown.winchPoints.main.hint". Array items are addressed by their `id` (or index).
 *
 *   node scripts/i18n-data.mjs   (via `npm run i18n:data`) lists every path with its ru/en source.
 * Missing translations fall back to English.
 */
import { RIDER_LEVELS } from '../career/progress';
import { CITIES } from '../data/cities';
import { GEAR } from '../data/gear';
import { SPOTS } from '../data/spots';
import { TRICKS, TRICK_WORDS } from '../data/tricks';
import type { L10n, Lang } from '../types';

type Obj = Record<string, unknown>;

function isL10n(o: unknown): o is L10n {
  return !!o && typeof o === 'object' && typeof (o as Obj).ru === 'string' && typeof (o as Obj).en === 'string';
}

function walk(node: unknown, path: string, out: Map<string, L10n>, depth: number): void {
  if (depth > 8 || node === null || typeof node !== 'object') return;
  if (isL10n(node)) {
    out.set(path, node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      const id = item && typeof item === 'object' && typeof (item as Obj).id === 'string' ? ((item as Obj).id as string) : String(i);
      walk(item, `${path}.${id}`, out, depth + 1);
    });
    return;
  }
  for (const [k, v] of Object.entries(node as Obj)) walk(v, path ? `${path}.${k}` : k, out, depth + 1);
}

/** Every translatable data text, keyed by its path. */
export function collectDataTexts(): Map<string, L10n> {
  const out = new Map<string, L10n>();
  walk(TRICKS, 'tricks', out, 0);
  walk(TRICK_WORDS, 'words', out, 0);
  walk(GEAR, 'gear', out, 0);
  walk(SPOTS, 'spots', out, 0);
  walk(CITIES, 'cities', out, 0);
  walk(RIDER_LEVELS, 'levels', out, 0);
  return out;
}

let texts: Map<string, L10n> | null = null;

/** Write the translations of one language into the data text objects (idempotent). */
export function applyDataTranslations(lang: Lang, dict: Record<string, string>): void {
  if (lang === 'ru' || lang === 'en') return;
  texts ??= collectDataTexts();
  for (const [path, text] of texts) {
    const v = dict[path];
    if (typeof v === 'string' && v) text[lang] = v;
  }
}
