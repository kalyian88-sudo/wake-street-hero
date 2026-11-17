import type { SpotDef } from '../../types';
import { phuketOldTown } from './phuket_oldtown';

// PLACEHOLDER — the layout is still Phuket's; replaced by the real spot.
export const hamburgSpeicher: SpotDef = {
  ...phuketOldTown,
  id: 'hamburg_speicher',
  cityId: 'germany',
  name: { ru: 'Гамбург, Шпайхерштадт', en: 'Hamburg Speicherstadt' },
  theme: 'germany',
  props: [],
  unlockStars: 14,
  mapPos: [0.38, 0.36],
};
