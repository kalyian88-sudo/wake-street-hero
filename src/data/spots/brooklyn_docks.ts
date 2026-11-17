import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const brooklynDocks: SpotDef = {
  ...phuketOldTown,
  id: 'brooklyn_docks',
  cityId: 'usa',
  name: { ru: 'Доки Бруклина', en: 'Brooklyn Docks' },
  theme: 'usa',
  props: [],
  unlockStars: 9,
  mapPos: [0.62, 0.34],
};
