import type { CityDef } from '../types';

/** Cities in career order. `spots` lists spot ids (src/data/spots). */
export const CITIES: CityDef[] = [
  {
    id: 'phuket',
    name: { ru: 'Пхукет', en: 'Phuket' },
    country: { ru: 'Таиланд', en: 'Thailand' },
    blurb: { ru: 'Здесь всё начинается: тёплая вода, старый город и первая лебёдка.', en: 'Where it all starts: warm water, the old town and your first winch.' },
    globe: { lat: 7.88, lon: 98.39 },
    unlockStars: 0,
    spots: ['phuket_oldtown'],
    color: 0x19b5a5,
  },
  {
    id: 'russia',
    name: { ru: 'Москва / Питер', en: 'Moscow / St. Petersburg' },
    country: { ru: 'Россия', en: 'Russia' },
    blurb: { ru: 'Гранит, каналы, фонтаны и ночная промзона.', en: 'Granite, canals, fountains and a neon industrial zone.' },
    globe: { lat: 57.8, lon: 34.0 },
    unlockStars: 8,
    spots: [],
    color: 0x3b7bd6,
  },
  {
    id: 'europe',
    name: { ru: 'Амстердам / Париж', en: 'Amsterdam / Paris' },
    country: { ru: 'Европа', en: 'Europe' },
    blurb: { ru: 'Каналы с велосипедами, набережная Сены и огни ночного холма.', en: 'Canals full of bikes, the banks of the Seine and the lights of the night hill.' },
    globe: { lat: 50.6, lon: 3.6 },
    unlockStars: 22,
    spots: [],
    color: 0xf2a53a,
  },
];

export function getCity(id: string): CityDef {
  const c = CITIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown city "${id}"`);
  return c;
}
