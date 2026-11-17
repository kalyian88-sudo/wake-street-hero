import type { CityDef } from '../types';

/**
 * Countries of the world tour, in career order (the hub calls them "cities" internally).
 * `spots` lists spot ids (src/data/spots). `unlockStars` = total stars needed to open the country.
 * Wave 2 (Japan, Philippines, UAE, Russia, Brazil, Poland) plugs in here the same way.
 */
export const CITIES: CityDef[] = [
  {
    id: 'thailand',
    name: { ru: 'Таиланд', en: 'Thailand' },
    country: { ru: 'Пхукет · Бангкок', en: 'Phuket · Bangkok' },
    blurb: { ru: 'Здесь всё начинается: тёплая вода, старый город, клонги и первая лебёдка.', en: 'Where it all starts: warm water, the old town, the klongs and your first winch.' },
    globe: { lat: 10.5, lon: 100.5 },
    unlockStars: 0,
    spots: ['phuket_oldtown', 'bangkok_klong'],
    color: 0x19b5a5,
  },
  {
    id: 'usa',
    name: { ru: 'США', en: 'USA' },
    country: { ru: 'Майами · Нью-Йорк', en: 'Miami · New York' },
    blurb: { ru: 'Родина вейка: арт-деко и граффити Майами, доки и мосты Бруклина.', en: 'The home of wake: Miami art deco and graffiti, Brooklyn docks and bridges.' },
    globe: { lat: 33, lon: -78 },
    unlockStars: 6,
    spots: ['miami_wynwood', 'brooklyn_docks'],
    color: 0x3b7bd6,
  },
  {
    id: 'germany',
    name: { ru: 'Германия', en: 'Germany' },
    country: { ru: 'Гамбург · Берлин', en: 'Hamburg · Berlin' },
    blurb: { ru: 'Кирпичные склады над каналами и бетонный Берлин в граффити.', en: 'Brick warehouses over the canals and concrete Berlin covered in graffiti.' },
    globe: { lat: 52.5, lon: 11 },
    unlockStars: 14,
    spots: ['hamburg_speicher', 'berlin_spree'],
    color: 0xf2c230,
  },
  {
    id: 'france',
    name: { ru: 'Франция', en: 'France' },
    country: { ru: 'Париж', en: 'Paris' },
    blurb: { ru: 'Каменные ступени Сены днём и огни Монмартра ночью.', en: 'The stone steps of the Seine by day and the lights of Montmartre by night.' },
    globe: { lat: 47.5, lon: 2.3 },
    unlockStars: 22,
    spots: ['paris_seine', 'paris_montmartre'],
    color: 0x5a6ee8,
  },
  {
    id: 'netherlands',
    name: { ru: 'Нидерланды', en: 'Netherlands' },
    country: { ru: 'Амстердам · Роттердам', en: 'Amsterdam · Rotterdam' },
    blurb: { ru: 'Каналы, велосипеды на каждом мосту и современный порт Роттердама.', en: 'Canals, bikes on every bridge and the modern harbour of Rotterdam.' },
    globe: { lat: 53.5, lon: 5.2 },
    unlockStars: 30,
    spots: ['amsterdam_grachten', 'rotterdam_haven'],
    color: 0xf28a30,
  },
  {
    id: 'italy',
    name: { ru: 'Италия', en: 'Italy' },
    country: { ru: 'Венеция', en: 'Venice' },
    blurb: { ru: 'Город на воде: гондолы, мостики и затопленная площадь.', en: 'The city on water: gondolas, little bridges and a flooded square.' },
    globe: { lat: 45.4, lon: 12.3 },
    unlockStars: 38,
    spots: ['venice_canal', 'venice_sanmarco'],
    color: 0x2fbf71,
  },
];

export function getCity(id: string): CityDef {
  const c = CITIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown city "${id}"`);
  return c;
}
