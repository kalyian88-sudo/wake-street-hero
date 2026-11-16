import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

/**
 * Spot registry. To add a spot: create `src/data/spots/<id>.ts` exporting a SpotDef,
 * add it to this list and to its city in `src/data/cities.ts`. No engine changes needed.
 */
export const SPOTS: SpotDef[] = [phuketOldTown];

export function getSpot(id: string): SpotDef {
  const s = SPOTS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown spot "${id}"`);
  return s;
}

export function findSpot(id: string): SpotDef | undefined {
  return SPOTS.find((x) => x.id === id);
}
