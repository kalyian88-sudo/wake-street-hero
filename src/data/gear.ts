// STUB — replaced by the rules/data agent. Keep the export names/signatures.
import { BRAND, NEUTRAL_STATS } from '../config';
import type { BoardKind, EquippedGear, GearItem, GearStats } from '../types';

const look = { primary: BRAND.colors.red, secondary: BRAND.colors.dark, accent: BRAND.colors.white, graphic: 'logo' } as const;
const txt = (s: string) => ({ ru: s, en: s });

export const GEAR: GearItem[] = [
  { id: 'wb_street', category: 'wakeboard', name: txt('WHY NOT Street'), desc: txt(''), price: 0, stats: {}, look },
  { id: 'bd_classic', category: 'bindings', name: txt('WHY NOT Classic'), desc: txt(''), price: 0, stats: {}, look },
  { id: 'ws_plank', category: 'wakeskate', name: txt('WHY NOT Plank'), desc: txt(''), price: 0, stats: {}, look: { ...look, graphic: 'wood' } },
  { id: 'vest_basic', category: 'vest', name: txt('Vest'), desc: txt(''), price: 0, stats: {}, look },
  { id: 'helmet_basic', category: 'helmet', name: txt('Helmet'), desc: txt(''), price: 0, stats: {}, look, headKind: 'helmet' },
  { id: 'shorts_basic', category: 'apparel', name: txt('Shorts'), desc: txt(''), price: 0, stats: {}, look, apparelKind: 'shorts' },
];

export function getGear(id: string | null | undefined): GearItem | undefined {
  return id ? GEAR.find((g) => g.id === id) : undefined;
}

/** Totals (0..10, 5 neutral) for the equipped set when riding `board`. */
export function computeStats(_equipped: EquippedGear, _board: BoardKind): GearStats {
  return { ...NEUTRAL_STATS };
}
