import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const veniceCanal: SpotDef = {
  ...phuketOldTown,
  id: 'venice_canal',
  cityId: 'italy',
  name: { ru: 'Канал в Венеции', en: 'Venice Canal' },
  theme: 'italy',
  props: [],
  unlockStars: 38,
  mapPos: [0.4, 0.42],
};
