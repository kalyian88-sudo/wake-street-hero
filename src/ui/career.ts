/**
 * Career queries used by the menus: stars, unlocks, reputation levels, buying / equipping gear.
 *
 * The canonical rules live in `src/career/progress.ts` (rules agent). That file may not exist yet,
 * so it is loaded OPTIONALLY (import.meta.glob yields an empty map when the file is missing) and
 * every function below falls back to an equivalent local rule when the export is absent or throws.
 * Expected signatures of the optional module:
 *   totalStars(save): number
 *   spotStars(save, spotId): number
 *   isCityUnlocked(save, cityId): boolean          isSpotUnlocked(save, spotId): boolean
 *   levelForRep(rep): number | { level, current?, next?, progress? }
 *   buyGear(save, gearId): boolean | { ok: boolean }     equipGear(save, gearId): boolean | { ok: boolean }
 */
import { CITIES } from '../data/cities';
import { GEAR, getGear } from '../data/gear';
import { SPOTS, findSpot } from '../data/spots';
import type { CityDef, EquippedGear, GearCategory, GearItem, SaveData, SpotDef } from '../types';

type AnyFn = (...args: unknown[]) => unknown;

const loaded = import.meta.glob('../career/progress.ts', { eager: true }) as Record<string, Record<string, unknown>>;
const ext: Record<string, unknown> = Object.values(loaded)[0] ?? {};

function external(name: string, ...args: unknown[]): unknown {
  const fn = ext[name];
  if (typeof fn !== 'function') return undefined;
  try {
    return (fn as AnyFn)(...args);
  } catch (err) {
    console.error(`[ui] career/progress.${name} threw`, err);
    return undefined;
  }
}

/** `?debug` unlocks everything (set by the UI root from game.debug). */
let unlockAll = false;
export function setUnlockAll(on: boolean): void {
  unlockAll = on;
}

// ───────────────────────────────────────────────────────────────── stars ──

export function spotStars(save: SaveData, spotId: string): number {
  const v = external('spotStars', save, spotId);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return save.spots[spotId]?.goals.filter(Boolean).length ?? 0;
}

/** Stars earned on spots that exist in the game. */
export function totalStars(save: SaveData): number {
  const v = external('totalStars', save);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  let n = 0;
  for (const s of SPOTS) n += save.spots[s.id]?.goals.filter(Boolean).length ?? 0;
  return n;
}

export function citySpots(city: CityDef): SpotDef[] {
  const out: SpotDef[] = [];
  for (const id of city.spots) {
    const s = findSpot(id);
    if (s) out.push(s);
  }
  // Spots that name the city but are not listed in CityDef.spots yet go last.
  for (const s of SPOTS) if (s.cityId === city.id && !out.includes(s)) out.push(s);
  return out;
}

export function cityStars(save: SaveData, city: CityDef): { earned: number; total: number } {
  const spots = citySpots(city);
  let earned = 0;
  for (const s of spots) earned += spotStars(save, s.id);
  return { earned, total: spots.length * 5 };
}

export function isCityUnlocked(save: SaveData, city: CityDef): boolean {
  if (unlockAll) return true;
  const v = external('isCityUnlocked', save, city.id);
  if (typeof v === 'boolean') return v;
  return totalStars(save) >= city.unlockStars;
}

export function isSpotUnlocked(save: SaveData, spot: SpotDef): boolean {
  if (unlockAll) return true;
  const v = external('isSpotUnlocked', save, spot.id);
  if (typeof v === 'boolean') return v;
  const city = CITIES.find((c) => c.id === spot.cityId);
  if (city && totalStars(save) < city.unlockStars) return false;
  return totalStars(save) >= spot.unlockStars;
}

// ──────────────────────────────────────────────────────────── reputation ──

export const MAX_LEVEL = 20;

/** Rep needed to REACH `level` (level 1 = 0): 150, 400, 750, 1200, 1750 … */
export function repForLevel(level: number): number {
  const n = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  return 50 * n * (n + 2);
}

export interface LevelInfo {
  level: number;
  /** Rep at the start of this level. */
  floor: number;
  /** Rep needed for the next level (= floor at max level). */
  next: number;
  /** 0..1 towards the next level. */
  progress: number;
  max: boolean;
}

export function levelForRep(rep: number): LevelInfo {
  const r = Math.max(0, Number.isFinite(rep) ? rep : 0);
  const v = external('levelForRep', r);
  let level = 0;
  if (typeof v === 'number' && Number.isFinite(v)) level = Math.max(1, Math.round(v));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.level === 'number' && Number.isFinite(o.level)) {
      level = Math.max(1, Math.round(o.level));
      const floor = typeof o.current === 'number' ? o.current : typeof o.floor === 'number' ? o.floor : null;
      const next = typeof o.next === 'number' ? o.next : null;
      if (floor !== null && next !== null) {
        const span = next - floor;
        const progress = typeof o.progress === 'number' ? o.progress : span > 0 ? (r - floor) / span : 1;
        return { level, floor, next, progress: Math.min(1, Math.max(0, progress)), max: span <= 0 };
      }
    }
  }
  if (!level) {
    level = 1;
    while (level < MAX_LEVEL && r >= repForLevel(level + 1)) level++;
  }
  const floor = repForLevel(level);
  const next = level >= MAX_LEVEL ? floor : repForLevel(level + 1);
  const span = next - floor;
  return { level, floor, next, progress: span > 0 ? Math.min(1, Math.max(0, (r - floor) / span)) : 1, max: span <= 0 };
}

/** i18n key of the rider title for a level ("Local", "Pro", "Street Hero"…). */
export function levelTitleKey(level: number): string {
  const tiers = [15, 12, 9, 6, 4, 2, 1];
  return `ui.rank.${tiers.find((t) => level >= t) ?? 1}`;
}

// ────────────────────────────────────────────────────────────────── gear ──

export const GEAR_CATEGORIES: readonly GearCategory[] = ['bindings', 'wakeboard', 'wakeskate', 'vest', 'helmet', 'apparel'];

export function gearByCategory(cat: GearCategory): GearItem[] {
  return GEAR.filter((g) => g.category === cat).sort((a, b) => a.price - b.price || (a.unlockLevel ?? 0) - (b.unlockLevel ?? 0));
}

export function isOwned(save: SaveData, id: string): boolean {
  return save.ownedGear.includes(id);
}

export function equippedId(equipped: EquippedGear, cat: GearCategory): string | null {
  return equipped[cat];
}

export type BuyBlock = 'owned' | 'coins' | 'level' | null;

/** Why the item cannot be bought right now (null = can buy). */
export function buyBlock(save: SaveData, item: GearItem): BuyBlock {
  if (isOwned(save, item.id)) return 'owned';
  if (!unlockAll && (item.unlockLevel ?? 0) > levelForRep(save.rep).level) return 'level';
  if (save.coins < item.price) return 'coins';
  return null;
}

function okResult(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v && typeof v === 'object' && typeof (v as { ok?: unknown }).ok === 'boolean') return (v as { ok: boolean }).ok;
  return null;
}

/** Mutates `save` (call inside save.update). Returns true when the purchase went through. */
export function buyGear(save: SaveData, id: string): boolean {
  const item = getGear(id);
  if (!item || buyBlock(save, item) !== null) return false;
  const owned = save.ownedGear.length;
  const r = okResult(external('buyGear', save, id));
  if (r !== null) return r;
  if (save.ownedGear.length !== owned || isOwned(save, id)) return true; // the external rule mutated without a result
  save.coins -= item.price;
  save.ownedGear.push(id);
  return true;
}

/** Mutates `save` (call inside save.update). */
export function equipGear(save: SaveData, id: string): boolean {
  const item = getGear(id);
  if (!item || !isOwned(save, id)) return false;
  const r = okResult(external('equipGear', save, id));
  if (r === false) return false;
  save.equipped[item.category] = id;
  return true;
}

/** Take off an optional item (vest / helmet / apparel). */
export function unequip(save: SaveData, cat: GearCategory): boolean {
  if (cat === 'vest' || cat === 'helmet' || cat === 'apparel') {
    save.equipped[cat] = null;
    return true;
  }
  return false;
}
