import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const berlinSpree: SpotDef = {
  ...phuketOldTown,
  id: 'berlin_spree',
  cityId: 'germany',
  name: { ru: 'Берлин, Шпрее', en: 'Berlin Spree' },
  theme: 'germany',
  props: [],
  unlockStars: 17,
  mapPos: [0.6, 0.6],
};
