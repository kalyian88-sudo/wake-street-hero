import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const rotterdamHaven: SpotDef = {
  ...phuketOldTown,
  id: 'rotterdam_haven',
  cityId: 'netherlands',
  name: { ru: 'Порт Роттердама', en: 'Rotterdam Harbour' },
  theme: 'netherlands',
  props: [],
  unlockStars: 33,
  mapPos: [0.6, 0.62],
};
