import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const bangkokKlong: SpotDef = {
  ...phuketOldTown,
  id: 'bangkok_klong',
  cityId: 'thailand',
  name: { ru: 'Клонг в Бангкоке', en: 'Bangkok Klong' },
  theme: 'thailand',
  props: [],
  unlockStars: 3,
  mapPos: [0.62, 0.38],
};
