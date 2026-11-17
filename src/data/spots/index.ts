import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';
import { bangkokKlong } from './bangkok_klong';
import { miamiWynwood } from './miami_wynwood';
import { brooklynDocks } from './brooklyn_docks';
import { hamburgSpeicher } from './hamburg_speicher';
import { berlinSpree } from './berlin_spree';
import { parisSeine } from './paris_seine';
import { parisMontmartre } from './paris_montmartre';
import { amsterdamGrachten } from './amsterdam_grachten';
import { rotterdamHaven } from './rotterdam_haven';
import { veniceCanal } from './venice_canal';
import { veniceSanMarco } from './venice_sanmarco';

/**
 * Spot registry. To add a spot: create `src/data/spots/<id>.ts` exporting a SpotDef,
 * add it to this list and to its city in `src/data/cities.ts`. No engine changes needed.
 */
export const SPOTS: SpotDef[] = [
  phuketOldTown,
  bangkokKlong,
  miamiWynwood,
  brooklynDocks,
  hamburgSpeicher,
  berlinSpree,
  parisSeine,
  parisMontmartre,
  amsterdamGrachten,
  rotterdamHaven,
  veniceCanal,
  veniceSanMarco,
];

export function getSpot(id: string): SpotDef {
  const s = SPOTS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown spot "${id}"`);
  return s;
}

export function findSpot(id: string): SpotDef | undefined {
  return SPOTS.find((x) => x.id === id);
}
