/**
 * Save schema history + migration chain. Headless (no DOM): used by the store and by unit tests.
 *
 * ── v1 (first public prototype, flat) ─────────────────────────────────────────────────────────
 *   { v: 1, coins: number, stars: Record<spotId, number>, best: Record<spotId, number>,
 *     lang: 'ru' | 'en', muted: boolean }
 *   Only a star COUNT per spot was stored, not which goals were done.
 *
 * ── v2 (career prototype) ─────────────────────────────────────────────────────────────────────
 *   { version: 2,
 *     settings: { lang, quality, music, sfx, stance, vibration },
 *     look: { gender: 'm' | 'f', skin, hair, hairColor, headwear, headwearColor,
 *             vest, vestColor, bottom, bottomColor, topColor },
 *     coins, rep,
 *     gear: { owned: string[], equipped: { board, bindings, skate, vest, helmet, apparel } },
 *     spots: Record<spotId, { goals: boolean[], best: number }>,
 *     tutorialDone: boolean }
 *
 * ── v3 (current — `SaveData` in src/types/data.ts) ────────────────────────────────────────────
 *   settings.music/sfx/vibration → musicVolume/sfxVolume/haptics (+ invertY, showFps),
 *   look → appearance (gender spelled out), gear.owned/equipped → ownedGear/equipped
 *   (board → wakeboard, skate → wakeskate), spot.best → bestScore (+ bestCombo, bestTrick, runs),
 *   tutorialDone → career.tutorialDone (+ dialogsSeen, sponsors), new `stats` and `last` blocks.
 *
 * To add v4: bump SAVE_VERSION in src/config.ts, add `3: v3ToV4` to MIGRATIONS and extend sanitize().
 */
import { LANG_IDS } from '../i18n/langs';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS, HAIR_COLORS, SAVE_VERSION, SKIN_TONES, STARTER_GEAR } from '../config';
import type { EquippedGear, L10n, RiderAppearance, SaveData, Settings, SpotProgress } from '../types';

type Dict = Record<string, unknown>;

const GOAL_COUNT = 5;
const MAX_CURRENCY = 999_999_999;
/** Keys that must never be copied from untrusted JSON into our objects. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    appearance: { ...DEFAULT_APPEARANCE },
    coins: 0,
    rep: 0,
    ownedGear: Object.values(STARTER_GEAR),
    equipped: { ...STARTER_GEAR },
    spots: {},
    career: { dialogsSeen: [], sponsors: {}, tutorialDone: false },
    stats: { totalRuns: 0, totalScore: 0, totalFalls: 0, bestCombo: 0, tricksLanded: {} },
    last: { board: 'wakeboard', power: 'medium', cityId: null, spotId: null },
  };
}

export function emptySpotProgress(): SpotProgress {
  return { goals: [false, false, false, false, false], bestScore: 0, bestCombo: 0, bestTrick: null, runs: 0 };
}

// ───────────────────────────────────────────────────────────── narrowing ──

function isDict(v: unknown): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function dict(v: unknown): Dict {
  return isDict(v) ? v : {};
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  return Math.round(num(v, fallback, min, max));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= 96 ? v : null;
}

function safeEntries(v: unknown): [string, unknown][] {
  return isDict(v) ? Object.entries(v).filter(([k]) => !FORBIDDEN_KEYS.has(k) && k.length <= 96) : [];
}

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item);
    if (s !== null && !out.includes(s)) out.push(s);
  }
  return out;
}

function l10n(v: unknown): L10n | null {
  if (typeof v === 'string' && v) return { ru: v, en: v };
  if (!isDict(v)) return null;
  const ru = typeof v.ru === 'string' ? v.ru : null;
  const en = typeof v.en === 'string' ? v.en : null;
  if (ru === null && en === null) return null;
  return { ru: ru ?? en ?? '', en: en ?? ru ?? '' };
}

function goalFlags(v: unknown): boolean[] {
  const src = Array.isArray(v) ? v : [];
  const out: boolean[] = [];
  for (let i = 0; i < GOAL_COUNT; i++) out.push(src[i] === true);
  return out;
}

// ─────────────────────────────────────────────────────────── migrations ──

/** v1 → v2. Star counts become "the first N goals are done" (v1 never stored which ones). */
function v1ToV2(old: Dict): Dict {
  const muted = old.muted === true;
  const stars = dict(old.stars);
  const best = dict(old.best);
  const spots: Dict = {};
  let played = false;
  const ids = new Set([...safeEntries(stars).map(([k]) => k), ...safeEntries(best).map(([k]) => k)]);
  for (const id of ids) {
    const n = int(stars[id], 0, 0, GOAL_COUNT);
    const score = num(best[id], 0, 0, MAX_CURRENCY);
    spots[id] = { goals: Array.from({ length: GOAL_COUNT }, (_, i) => i < n), best: score };
    if (n > 0 || score > 0) played = true;
  }
  return {
    version: 2,
    settings: {
      lang: old.lang,
      quality: 'auto',
      music: muted ? 0 : DEFAULT_SETTINGS.musicVolume,
      sfx: muted ? 0 : DEFAULT_SETTINGS.sfxVolume,
      stance: 'regular',
      vibration: true,
    },
    look: {},
    coins: old.coins,
    rep: 0,
    gear: { owned: [], equipped: {} },
    spots,
    tutorialDone: played,
  };
}

/** v2 → v3. Pure renames / regrouping; value validation happens in sanitize(). */
function v2ToV3(old: Dict): Dict {
  const s = dict(old.settings);
  const look = dict(old.look);
  const gear = dict(old.gear);
  const eq = dict(gear.equipped);
  const spots: Dict = {};
  for (const [id, sp] of safeEntries(old.spots)) {
    if (!isDict(sp)) continue;
    const best = num(sp.best, 0, 0, MAX_CURRENCY);
    const goals = goalFlags(sp.goals);
    spots[id] = { goals, bestScore: best, bestCombo: 0, bestTrick: null, runs: best > 0 || goals.some(Boolean) ? 1 : 0 };
  }
  const gender = look.gender === 'f' || look.gender === 'female' ? 'female' : look.gender === 'm' || look.gender === 'male' ? 'male' : undefined;
  return {
    version: 3,
    settings: {
      lang: s.lang,
      quality: s.quality,
      musicVolume: s.music,
      sfxVolume: s.sfx,
      stance: s.stance,
      haptics: s.vibration,
    },
    appearance: { ...look, gender },
    coins: old.coins,
    rep: old.rep,
    ownedGear: gear.owned,
    equipped: {
      wakeboard: eq.board,
      bindings: eq.bindings,
      wakeskate: eq.skate,
      vest: eq.vest,
      helmet: eq.helmet,
      apparel: eq.apparel,
    },
    spots,
    career: { tutorialDone: old.tutorialDone },
  };
}

/** `MIGRATIONS[n]` upgrades a save of version n to version n + 1. */
const MIGRATIONS: Record<number, (old: Dict) => Dict> = {
  1: v1ToV2,
  2: v2ToV3,
};

/** Schema version of a stored blob (v1 used the key `v`), or null when it carries none. */
export function readVersion(raw: unknown): number | null {
  if (!isDict(raw)) return null;
  const v = typeof raw.version === 'number' ? raw.version : typeof raw.v === 'number' ? raw.v : null;
  return v !== null && Number.isFinite(v) ? Math.floor(v) : null;
}

// ───────────────────────────────────────────────────────────── sanitize ──

function sanitizeSettings(raw: unknown): Settings {
  const s = dict(raw);
  const d = DEFAULT_SETTINGS;
  return {
    lang: oneOf(s.lang, [...LANG_IDS, 'auto'] as const, d.lang),
    quality: oneOf(s.quality, ['auto', 'low', 'medium', 'high'] as const, d.quality),
    musicVolume: num(s.musicVolume, d.musicVolume, 0, 1),
    sfxVolume: num(s.sfxVolume, d.sfxVolume, 0, 1),
    stance: oneOf(s.stance, ['regular', 'goofy'] as const, d.stance),
    haptics: bool(s.haptics, d.haptics),
    invertY: bool(s.invertY, d.invertY),
    showFps: bool(s.showFps, d.showFps),
  };
}

function color(v: unknown, fallback: number): number {
  return int(v, fallback, 0, 0xffffff);
}

function sanitizeAppearance(raw: unknown): RiderAppearance {
  const a = dict(raw);
  const d = DEFAULT_APPEARANCE;
  return {
    gender: oneOf(a.gender, ['male', 'female'] as const, d.gender),
    skin: int(a.skin, d.skin, 0, SKIN_TONES.length - 1),
    hair: oneOf(a.hair, ['buzz', 'short', 'curly', 'long', 'bun', 'ponytail'] as const, d.hair),
    hairColor: color(a.hairColor, HAIR_COLORS.includes(d.hairColor) ? d.hairColor : HAIR_COLORS[0]),
    headwear: oneOf(a.headwear, ['none', 'helmet', 'cap'] as const, d.headwear),
    headwearColor: color(a.headwearColor, d.headwearColor),
    vest: bool(a.vest, d.vest),
    vestColor: color(a.vestColor, d.vestColor),
    bottom: oneOf(a.bottom, ['shorts', 'wetsuit'] as const, d.bottom),
    bottomColor: color(a.bottomColor, d.bottomColor),
    topColor: color(a.topColor, d.topColor),
  };
}

function sanitizeEquipped(raw: unknown): EquippedGear {
  const e = dict(raw);
  // Optional slots: a string id, an explicit null (taken off) or — when missing/garbage — the starter item.
  const optional = (v: unknown, fallback: string): string | null => (v === null ? null : (str(v) ?? fallback));
  return {
    wakeboard: str(e.wakeboard) ?? STARTER_GEAR.wakeboard,
    bindings: str(e.bindings) ?? STARTER_GEAR.bindings,
    wakeskate: str(e.wakeskate) ?? STARTER_GEAR.wakeskate,
    vest: optional(e.vest, STARTER_GEAR.vest),
    helmet: optional(e.helmet, STARTER_GEAR.helmet),
    apparel: optional(e.apparel, STARTER_GEAR.apparel),
  };
}

function sanitizeSpot(raw: unknown): SpotProgress | null {
  if (!isDict(raw)) return null;
  const bt = dict(raw.bestTrick);
  const name = l10n(bt.name);
  return {
    goals: goalFlags(raw.goals),
    bestScore: int(raw.bestScore, 0, 0, MAX_CURRENCY),
    bestCombo: int(raw.bestCombo, 0, 0, MAX_CURRENCY),
    bestTrick: name ? { name, points: int(bt.points, 0, 0, MAX_CURRENCY) } : null,
    runs: int(raw.runs, 0, 0, MAX_CURRENCY),
  };
}

/**
 * Deep-merge an (already version-3 shaped) blob over the defaults: every field is type-checked and
 * clamped, unknown spot ids and unknown gear ids are KEPT (data files change between releases).
 */
function sanitize(raw: Dict): SaveData {
  const def = defaultSave();

  // Gear: keep every string id (the catalogue is editable), always own the starters and whatever is equipped.
  const equipped = sanitizeEquipped(raw.equipped);
  const owned = stringList(raw.ownedGear);
  for (const id of [...Object.values(STARTER_GEAR), ...Object.values(equipped)]) {
    if (id !== null && !owned.includes(id)) owned.push(id);
  }

  const spots: Record<string, SpotProgress> = {};
  for (const [id, sp] of safeEntries(raw.spots)) {
    const clean = sanitizeSpot(sp);
    if (clean) spots[id] = clean;
  }

  const career = dict(raw.career);
  const sponsors: SaveData['career']['sponsors'] = {};
  for (const [id, sp] of safeEntries(career.sponsors)) {
    if (!isDict(sp)) continue;
    sponsors[id] = {
      state: oneOf(sp.state, ['offered', 'active', 'done'] as const, 'offered'),
      progress: num(sp.progress, 0, 0, MAX_CURRENCY),
    };
  }

  const stats = dict(raw.stats);
  const tricksLanded: Record<string, number> = {};
  for (const [id, n] of safeEntries(stats.tricksLanded)) {
    const count = int(n, 0, 0, MAX_CURRENCY);
    if (count > 0) tricksLanded[id] = count;
  }

  const last = dict(raw.last);
  return {
    version: SAVE_VERSION,
    settings: sanitizeSettings(raw.settings),
    appearance: sanitizeAppearance(raw.appearance),
    coins: int(raw.coins, def.coins, 0, MAX_CURRENCY),
    rep: int(raw.rep, def.rep, 0, MAX_CURRENCY),
    ownedGear: owned,
    equipped,
    spots,
    career: {
      dialogsSeen: stringList(career.dialogsSeen),
      sponsors,
      tutorialDone: bool(career.tutorialDone, false),
    },
    stats: {
      totalRuns: int(stats.totalRuns, 0, 0, MAX_CURRENCY),
      totalScore: int(stats.totalScore, 0, 0, Number.MAX_SAFE_INTEGER),
      totalFalls: int(stats.totalFalls, 0, 0, MAX_CURRENCY),
      bestCombo: int(stats.bestCombo, 0, 0, MAX_CURRENCY),
      tricksLanded,
    },
    last: {
      board: oneOf(last.board, ['wakeboard', 'wakeskate'] as const, def.last.board),
      power: oneOf(last.power, ['slow', 'medium', 'fast'] as const, def.last.power),
      cityId: str(last.cityId),
      spotId: str(last.spotId),
    },
  };
}

/**
 * Upgrade any previously stored JSON (or garbage) to the current SaveData. Never throws.
 *  - older versions run through the MIGRATIONS chain,
 *  - blobs without a version are treated as the current shape (best effort),
 *  - FUTURE versions are read best-effort too (known fields kept, the rest dropped) — the store keeps
 *    a backup copy of such a blob before overwriting it,
 *  - anything unusable yields `defaultSave()`.
 */
export function migrate(raw: unknown): SaveData {
  try {
    if (!isDict(raw)) return defaultSave();
    let data: Dict = raw;
    let version = readVersion(data) ?? SAVE_VERSION;
    if (version < 1) version = 1;
    while (version < SAVE_VERSION) {
      const step = MIGRATIONS[version];
      if (!step) break;
      data = step(data);
      version++;
    }
    return sanitize(data);
  } catch {
    return defaultSave();
  }
}
