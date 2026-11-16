/**
 * Player-facing texts of the rules module: goal descriptions, shop refusals, level lines, stat / category names.
 * The strings live in src/i18n/parts/rules.{ru,en}.json and are registered with the i18n singleton here, so the
 * UI can use either `t('rules.goal.score', { target })` or the ready-made L10n builders below with `l(...)`.
 * UI-side helper: the sim (objectives / rewards / scoring) does not import this file.
 */
import { BRAND } from '../config';
import { getTrick } from '../data/tricks';
import { i18n } from '../i18n/i18n';
import enPart from '../i18n/parts/rules.en.json';
import ruPart from '../i18n/parts/rules.ru.json';
import type { GearCategory, GearStats, GoalDef, L10n, SaveData, SpotDef, TrickCategory } from '../types';
import { type BuyBlock, buyBlocker, levelForRep, levelTitle } from './progress';
import { getGear } from '../data/gear';

const RU: Record<string, string> = ruPart;
const EN: Record<string, string> = enPart;

i18n.extend('ru', RU);
i18n.extend('en', EN);

type Params = Record<string, string | number | L10n>;

function fill(template: string, params: Params | undefined, lang: 'ru' | 'en'): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    if (v === undefined) return whole;
    return typeof v === 'object' ? v[lang] : String(v);
  });
}

/** Both languages of a rules string at once. L10n params are resolved per language. */
export function rulesText(key: string, params?: Params): L10n {
  return { ru: fill(RU[key] ?? EN[key] ?? key, params, 'ru'), en: fill(EN[key] ?? RU[key] ?? key, params, 'en') };
}

const groupDigits = (n: number): L10n => {
  const s = String(Math.round(n));
  return { ru: s.replace(/\B(?=(\d{3})+(?!\d))/g, ' '), en: s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') };
};

function trickName(id: string): L10n {
  return getTrick(id)?.name ?? { ru: id, en: id };
}

/** One-line description of a spot goal, e.g. «Линия одним комбо: Деревянный кикер → Красный рейл → Бетонный ледж». */
export function describeGoal(goal: GoalDef, spot: SpotDef): L10n {
  switch (goal.type) {
    case 'score':
      return rulesText('rules.goal.score', { target: groupDigits(goal.target) });
    case 'trick':
      return rulesText(goal.board ? `rules.goal.trick.${goal.board}` : 'rules.goal.trick', { trick: trickName(goal.trickId) });
    case 'letters':
      return rulesText('rules.goal.letters');
    case 'line': {
      const names = goal.obstacles.map((id) => spot.obstacles.find((o) => o.id === id)?.name ?? { ru: id, en: id });
      const sep = rulesText('rules.goal.listSeparator');
      const obstacles: L10n = { ru: names.map((n) => n.ru).join(sep.ru), en: names.map((n) => n.en).join(sep.en) };
      const winch = goal.winch ? spot.winchPoints.find((w) => w.id === goal.winch)?.name : undefined;
      return winch ? rulesText('rules.goal.line.winch', { obstacles, winch }) : rulesText('rules.goal.line', { obstacles });
    }
    case 'clip': {
      const points = goal.minPoints ? groupDigits(goal.minPoints) : undefined;
      if (goal.trickId && points) return rulesText('rules.goal.clip.trickPoints', { trick: trickName(goal.trickId), points });
      if (goal.trickId) return rulesText('rules.goal.clip.trick', { trick: trickName(goal.trickId) });
      if (points) return rulesText('rules.goal.clip.points', { points });
      return rulesText('rules.goal.clip');
    }
  }
}

/** Why the shop refuses a purchase (e.g. «Не хватает монет: 250»). */
export function buyBlockText(save: SaveData, itemId: string, reason?: BuyBlock): L10n | null {
  const item = getGear(itemId);
  const why = reason ?? buyBlocker(save, item);
  if (!why) return null;
  if (why === 'level' && item?.unlockLevel !== undefined) return rulesText('rules.buy.level', { level: item.unlockLevel, title: levelTitle(item.unlockLevel) });
  if (why === 'coins' && item) return rulesText('rules.buy.coins', { missing: groupDigits(Math.max(0, item.price - save.coins)) });
  return rulesText(`rules.buy.${why}`);
}

/** «Уровень 3 · Уличный райдер» plus what is left to the next one. */
export function levelText(rep: number): { label: L10n; next: L10n } {
  const info = levelForRep(rep);
  return {
    label: rulesText('rules.level.label', { level: info.level, title: info.title }),
    next: info.next === null ? rulesText('rules.level.max') : rulesText('rules.level.next', { title: levelTitle(info.level + 1), rep: groupDigits(info.next - Math.max(0, rep)) }),
  };
}

export const statName = (stat: keyof GearStats): L10n => rulesText(`rules.stat.${stat}`);
export const gearCategoryName = (category: GearCategory): L10n => rulesText(`rules.category.${category}`);
export const trickCategoryName = (category: TrickCategory): L10n => rulesText(`rules.trickCategory.${category}`);

/** Brand name constant re-exported so texts built here never hard-code it. */
export const BRAND_NAME = BRAND.name;
