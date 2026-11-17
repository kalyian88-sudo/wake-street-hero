import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const miamiWynwood: SpotDef = {
  ...phuketOldTown,
  id: 'miami_wynwood',
  cityId: 'usa',
  name: { ru: 'Майами, Винвуд', en: 'Miami Wynwood' },
  theme: 'usa',
  props: [],
  unlockStars: 6,
  mapPos: [0.35, 0.62],
};
