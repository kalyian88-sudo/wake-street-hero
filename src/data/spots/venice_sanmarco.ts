import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const veniceSanMarco: SpotDef = {
  ...phuketOldTown,
  id: 'venice_sanmarco',
  cityId: 'italy',
  name: { ru: 'Затопленный Сан-Марко', en: 'Flooded San Marco' },
  theme: 'italy',
  props: [],
  unlockStars: 42,
  mapPos: [0.62, 0.6],
};
