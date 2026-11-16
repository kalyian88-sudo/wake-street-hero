/**
 * Career progress helpers for the UI: stars, unlocks, rider levels, shop transactions. Pure / headless —
 * the functions that change the save MUTATE the object they are given (call them inside save.update()).
 */
import { CITIES } from '../data/cities';
import { getGear } from '../data/gear';
import { SPOTS } from '../data/spots';
import type { CityDef, EquippedGear, GearCategory, GearItem, L10n, SaveData, SpotDef } from '../types';

const cityOf = (city: CityDef | string): CityDef | undefined => (typeof city === 'string' ? CITIES.find((c) => c.id === city) : city);
const spotOf = (spot: SpotDef | string): SpotDef | undefined => (typeof spot === 'string' ? SPOTS.find((s) => s.id === spot) : spot);

// ──────────────────────────────────────────────────────────────── Stars ──

/** Stars earned on a spot = goals done (0..5). */
export function spotStars(save: SaveData, spotId: string): number {
  const goals = save.spots[spotId]?.goals;
  if (!goals) return 0;
  let n = 0;
  for (const g of goals) if (g) n++;
  return n;
}

/** Stars earned on all spots of a city (the ones it lists plus any spot that names it as its city). */
export function cityStars(save: SaveData, city: CityDef | string): number {
  const def = cityOf(city);
  if (!def) return 0;
  let n = 0;
  for (const spotId of def.spots) n += spotStars(save, spotId);
  for (const spot of SPOTS) if (spot.cityId === def.id && !def.spots.includes(spot.id)) n += spotStars(save, spot.id);
  return n;
}

/** Every star the player owns (unlock currency for spots and cities). */
export function totalStars(save: SaveData): number {
  let n = 0;
  for (const spotId of Object.keys(save.spots)) n += spotStars(save, spotId);
  return n;
}

/** Accepts the city definition or its id. Unknown city → locked. */
export function isCityUnlocked(save: SaveData, city: CityDef | string): boolean {
  const def = cityOf(city);
  return !!def && totalStars(save) >= def.unlockStars;
}

/** A spot is open when its city is open and the player has the stars the spot itself asks for. Accepts the def or its id. */
export function isSpotUnlocked(save: SaveData, spot: SpotDef | string): boolean {
  const def = spotOf(spot);
  return !!def && starsToUnlockSpot(save, def) === 0;
}

/** Stars still missing to open a spot (0 when open). */
export function starsToUnlockSpot(save: SaveData, spot: SpotDef | string): number {
  const def = spotOf(spot);
  if (!def) return Infinity;
  const city = CITIES.find((c) => c.id === def.cityId);
  return Math.max(0, Math.max(def.unlockStars, city?.unlockStars ?? 0) - totalStars(save));
}

// ───────────────────────────────────────────────────────── Rider levels ──

export interface RiderLevel {
  /** Reputation needed to reach the level. */
  rep: number;
  title: L10n;
}

/**
 * УРОВНИ РАЙДЕРА — путь от локала до Street Hero. `rep` — сколько репутации нужно для уровня.
 * Репутация идёт за цели спотов (40–70 за цель), за очки заезда (до 20 за заезд) и за спонсорские миссии.
 * Ориентир: первый город целиком ≈ 5-й уровень, второй ≈ 8-й, Street Hero — ближе к концу третьего.
 */
export const RIDER_LEVELS: readonly RiderLevel[] = [
  { rep: 0, title: { ru: 'Локал', en: 'Local' } },
  { rep: 150, title: { ru: 'Свой на споте', en: 'Spot Regular' } },
  { rep: 400, title: { ru: 'Уличный райдер', en: 'Street Rider' } },
  { rep: 750, title: { ru: 'Охотник за спотами', en: 'Spot Hunter' } },
  { rep: 1150, title: { ru: 'Флоу-райдер', en: 'Flow Rider' } },
  { rep: 1600, title: { ru: 'Райдер команды', en: 'Team Rider' } },
  { rep: 2100, title: { ru: 'Про', en: 'Pro' } },
  { rep: 2650, title: { ru: 'Звезда клипов', en: 'Clip Star' } },
  { rep: 3250, title: { ru: 'Легенда улиц', en: 'Street Legend' } },
  { rep: 3900, title: { ru: 'Street Hero', en: 'Street Hero' } },
];

export interface LevelInfo {
  /** 1-based. */
  level: number;
  title: L10n;
  /** Rep at which this level started. */
  current: number;
  /** Rep needed for the next level (= `current` at the top level). */
  next: number;
  /** 0..1 towards the next level (1 at the top). */
  progress: number;
  /** Top level reached. */
  max: boolean;
}

export function levelForRep(rep: number): LevelInfo {
  const r = Number.isFinite(rep) ? Math.max(0, rep) : 0;
  let idx = 0;
  for (let i = 1; i < RIDER_LEVELS.length; i++) if (r >= RIDER_LEVELS[i].rep) idx = i;
  const cur = RIDER_LEVELS[idx];
  const nxt = RIDER_LEVELS[idx + 1];
  return {
    level: idx + 1,
    title: cur.title,
    current: cur.rep,
    next: nxt ? nxt.rep : cur.rep,
    progress: nxt ? Math.min(1, (r - cur.rep) / (nxt.rep - cur.rep)) : 1,
    max: !nxt,
  };
}

/** Title of a level number (1-based), e.g. for "needs level 3: Street Rider". */
export function levelTitle(level: number): L10n {
  const idx = Math.min(RIDER_LEVELS.length, Math.max(1, Math.floor(level))) - 1;
  return RIDER_LEVELS[idx].title;
}

// ───────────────────────────────────────────────────────────────── Shop ──

/** Why an item cannot be bought right now. */
export type BuyBlock = 'unknown' | 'owned' | 'level' | 'coins';

export interface BuyResult {
  ok: boolean;
  reason?: BuyBlock;
}

/** Save slot of each gear category. */
export const GEAR_SLOT: Record<GearCategory, keyof EquippedGear> = {
  bindings: 'bindings',
  wakeboard: 'wakeboard',
  wakeskate: 'wakeskate',
  vest: 'vest',
  helmet: 'helmet',
  apparel: 'apparel',
};

export function isOwned(save: SaveData, itemId: string): boolean {
  return save.ownedGear.includes(itemId);
}

export function isEquipped(save: SaveData, itemId: string): boolean {
  const item = getGear(itemId);
  return !!item && save.equipped[GEAR_SLOT[item.category]] === itemId;
}

/** null when the item can be bought; otherwise the first thing in the way (owned → level → coins). */
export function buyBlocker(save: SaveData, item: GearItem | null | undefined): BuyBlock | null {
  if (!item || !getGear(item.id)) return 'unknown';
  if (isOwned(save, item.id)) return 'owned';
  if (item.unlockLevel !== undefined && levelForRep(save.rep).level < item.unlockLevel) return 'level';
  if (save.coins < item.price) return 'coins';
  return null;
}

export function canBuy(save: SaveData, item: GearItem | null | undefined): boolean {
  return buyBlocker(save, item) === null;
}

/** Buys the item (mutates the save: coins, ownedGear). Does not equip it. */
export function buyGear(save: SaveData, itemId: string): BuyResult {
  const item = getGear(itemId);
  const reason = buyBlocker(save, item);
  if (reason || !item) return { ok: false, reason: reason ?? 'unknown' };
  save.coins -= item.price;
  save.ownedGear.push(item.id);
  return { ok: true };
}

/** Puts an OWNED item into its slot (mutates the save). Returns false when the item is unknown or not owned. */
export function equipGear(save: SaveData, itemId: string): boolean {
  const item = getGear(itemId);
  if (!item || !isOwned(save, item.id)) return false;
  save.equipped[GEAR_SLOT[item.category]] = item.id;
  return true;
}

/** Takes off the vest / helmet / apparel (boards and bindings cannot be left empty). */
export function unequipGear(save: SaveData, category: GearCategory): boolean {
  if (category !== 'vest' && category !== 'helmet' && category !== 'apparel') return false;
  save.equipped[category] = null;
  return true;
}
