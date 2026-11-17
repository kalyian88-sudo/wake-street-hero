import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const parisSeine: SpotDef = {
  ...phuketOldTown,
  id: 'paris_seine',
  cityId: 'france',
  name: { ru: 'Набережная Сены', en: 'Banks of the Seine' },
  theme: 'france',
  props: [],
  unlockStars: 22,
  mapPos: [0.45, 0.58],
};
