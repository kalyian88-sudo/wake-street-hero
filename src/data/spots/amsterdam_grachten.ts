import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const amsterdamGrachten: SpotDef = {
  ...phuketOldTown,
  id: 'amsterdam_grachten',
  cityId: 'netherlands',
  name: { ru: 'Каналы Амстердама', en: 'Amsterdam Canals' },
  theme: 'netherlands',
  props: [],
  unlockStars: 30,
  mapPos: [0.42, 0.4],
};
