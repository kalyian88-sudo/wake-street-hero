import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const parisMontmartre: SpotDef = {
  ...phuketOldTown,
  id: 'paris_montmartre',
  cityId: 'france',
  name: { ru: 'Ночной Монмартр', en: 'Montmartre Nights' },
  theme: 'france',
  props: [],
  unlockStars: 25,
  mapPos: [0.55, 0.32],
};
