import type { PropDef, SpotDef } from '../../types';

/**
 * VENICE — FLOODED SAN MARCO. Sunset acqua alta: a wide flooded piazza between long white arcades,
 * duckboard walkways on trestles, café chairs in the water; the basilica closes the piazza, campanile on the side.
 * Rider's left = +X, right = −X.
 */

const arcades: PropDef[] = [];
{
  for (let i = 0; i < 11; i++) arcades.push({ type: 'italy.arcadeRow', pos: [17.7, 0.9, -6 + 17.6 * i], rot: -90, seed: 10 + i, params: { bays: 4, floors: 2 } });
  for (let i = 0; i < 9; i++) arcades.push({ type: 'italy.arcadeRow', pos: [-17.7, 0.9, 3 + 17.6 * i], rot: 90, seed: 40 + i, params: { bays: 4, floors: 2 } });
}

const lamps: PropDef[] = [10, 38, 66, 94, 122, 150, 172].flatMap((z, i): PropDef[] => [
  { type: 'italy.lampPost', pos: [16.5, 0.9, z], seed: 10 + i },
  { type: 'italy.lampPost', pos: [-16.5, 0.9, z + 12], seed: 30 + i },
]);

export const veniceSanMarco: SpotDef = {
  id: 'venice_sanmarco',
  cityId: 'italy',
  name: { ru: 'Затопленный Сан-Марко', en: 'Flooded San Marco' },
  blurb: {
    ru: 'Аква альта на закате: площадь по колено в воде, мостки на козлах и базилика вдалеке.',
    en: 'Acqua alta at sunset: a knee-deep piazza, duckboards on trestles and the basilica ahead.',
  },
  theme: 'italy',
  env: {
    timeOfDay: 'sunset',
    sunElevation: 6,
    sunAzimuth: 150,
    sunColor: 0xffc090,
    sunIntensity: 3.0,
    ambientIntensity: 1.05,
    turbidity: 9,
    rayleigh: 2.2,
    mieCoefficient: 0.008,
    mieDirectionalG: 0.86,
    exposure: 0.8,
    fogColor: 0xecd2ba,
    fogNear: 90,
    fogFar: 520,
    waterShallow: 0x9ecec2,
    waterDeep: 0x56908e,
    waterClarity: 0.35,
    waveScale: 0.22,
    bloom: 0.16,
  },
  bounds: { min: [-22, -16], max: [22, 188] },
  base: { level: -0.7, surface: 'stone' },
  water: [
    { id: 'piazza', shape: { kind: 'rect', center: [0, 100], size: [32, 220] }, level: 0, depth: 0.7, style: 'flood' },
  ],
  ground: [
    { id: 'arcade_left', center: [23.5, 80], size: [15, 220], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'arcade_right', center: [-23.5, 80], size: [15, 220], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'quay_end', center: [0, 190], size: [60, 30], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'quay_start', center: [0, -20], size: [60, 10], top: 0.9, surface: 'stone', trim: 'kerb' },
    // wooden landings for the side winches
    { id: 'landing_left', center: [11.5, 150], size: [9, 10], top: 0.9, surface: 'wood', trim: 'none' },
    { id: 'landing_right', center: [-11.5, 132], size: [9, 10], top: 0.9, surface: 'wood', trim: 'none' },
    // low submerged paving step across the piazza: slide over it, or gap it
    { id: 'slab_gap', center: [0, 94.5], size: [14, 5], top: 0.12, surface: 'stone', trim: 'none' },
  ],
  obstacles: [
    { kind: 'kicker', id: 'kicker_pallet', name: { ru: 'Кикер из поддонов', en: 'Pallet kicker' }, pos: [0, 0, 25], width: 2.6, length: 4.6, height: 1.3, curve: 0.55, style: 'pallet' },
    {
      kind: 'rail',
      id: 'rail_trestle',
      name: { ru: 'Рейл мостков', en: 'Duckboard rail' },
      path: [
        [-3, 0.42, 42],
        [-3, 0.42, 55],
      ],
      style: 'flat',
      radius: 0.05,
      material: 'steel',
      supports: 'posts',
    },
    { kind: 'kicker', id: 'kicker_wood', name: { ru: 'Деревянный кикер', en: 'Wooden kicker' }, pos: [3, 0, 63], width: 2.2, length: 3.2, height: 0.85, curve: 0.2, style: 'wood' },
    { kind: 'ledge', id: 'ledge_duck_a', name: { ru: 'Мостки на козлах', en: 'Duckboard ledge' }, pos: [3, 0, 74], size: [1.2, 0.55, 9], surface: 'wood', style: 'wood' },
    { kind: 'ledge', id: 'ledge_duck_b', name: { ru: 'Длинные мостки', en: 'Long duckboard' }, pos: [-6, 0, 68], size: [1.1, 0.5, 10], surface: 'wood', style: 'wood' },
    { kind: 'kicker', id: 'kicker_gap', name: { ru: 'Каменный кикер', en: 'Stone kicker' }, pos: [-1.5, 0, 86.5], width: 2.6, length: 4.2, height: 1.15, curve: 0.6, style: 'stone' },
    {
      kind: 'gap',
      id: 'gap_piazza',
      name: { ru: 'Гэп пьяццы', en: 'Piazza Gap' },
      shape: { kind: 'rect', center: [0, 94.5], size: [14, 5] },
      points: 500,
    },
    {
      kind: 'wall',
      id: 'wall_barrier',
      name: { ru: 'Противопаводковая стена', en: 'Flood barrier wall' },
      a: [-7, 0, 103],
      b: [-7, 0, 119],
      height: 3.2,
      lean: 12,
      surface: 'stone',
      style: 'plaster',
    },
    {
      kind: 'rail',
      id: 'pipe_fat',
      name: { ru: 'Водосточная труба', en: 'Drain pipe' },
      path: [
        [2.2, 0.32, 107],
        [5, 0.32, 121],
      ],
      style: 'pipe',
      radius: 0.3,
      material: 'concrete',
      supports: 'none',
    },
    { kind: 'stairs', id: 'stairs_bridge', name: { ru: 'Ступени с перилами', en: 'Steps & handrail' }, pos: [6.1, 0, 126], width: 1.7, steps: 6, stepH: 0.15, stepD: 0.45, handrail: 'right', railHeight: 0.8, surface: 'stone', wet: true },
    {
      kind: 'rail',
      id: 'rail_kink',
      name: { ru: 'Кинк-рейл', en: 'Kinked rail' },
      path: [
        [-1, 0.4, 134],
        [-1, 0.95, 139],
        [-1, 0.95, 145],
        [-1, 0.4, 149],
      ],
      style: 'kink',
      radius: 0.05,
      material: 'steel',
      supports: 'posts',
    },
    { kind: 'kicker', id: 'kicker_final', name: { ru: 'Финальный кикер WHY NOT', en: 'WHY NOT finish kicker' }, pos: [2, 0, 152], width: 2.4, length: 4.2, height: 1.25, curve: 0.55, style: 'plastic' },
  ],
  props: [
    ...arcades,
    ...lamps,
    // raised duckboard walkways on trestles (acqua alta passerelle)
    { type: 'italy.passerella', pos: [12.5, 0, 38], seed: 1, params: { length: 44, width: 1.3, height: 0.55 } },
    { type: 'italy.passerella', pos: [12.5, 0, 112], seed: 2, params: { length: 44, width: 1.3, height: 0.55 } },
    { type: 'italy.passerella', pos: [-12.5, 0, 36], seed: 3, params: { length: 40, width: 1.3, height: 0.55 } },
    { type: 'italy.passerella', pos: [-12.5, 0, 92], seed: 4, params: { length: 40, width: 1.3, height: 0.55 } },
    // café tables and chairs half in the water
    { type: 'italy.cafeSet', pos: [13.5, 0, 12], rot: 20, seed: 1, params: { tables: 3 } },
    { type: 'italy.cafeSet', pos: [-13.8, 0, 22], rot: -10, seed: 2, params: { tables: 3 } },
    { type: 'italy.cafeSet', pos: [14.2, 0, 66], rot: 40, seed: 3, params: { tables: 2 } },
    { type: 'italy.cafeSet', pos: [-14.2, 0, 62], rot: 70, seed: 4, params: { tables: 3 } },
    { type: 'italy.cafeSet', pos: [13.8, 0, 94], rot: 5, seed: 5, params: { tables: 3 } },
    { type: 'italy.cafeSet', pos: [-13.6, 0, 112], rot: -30, seed: 6, params: { tables: 2 } },
    { type: 'italy.cafeSet', pos: [14.0, 0, 128], rot: 100, seed: 7, params: { tables: 3 } },
    { type: 'italy.cafeSet', pos: [-14.4, 0, 160], rot: 15, seed: 8, params: { tables: 3 } },
    { type: 'italy.cafeSet', pos: [13.6, 0, 168], rot: -50, seed: 9, params: { tables: 3 } },
    // the basilica closes the piazza; flagpoles in front
    { type: 'italy.basilica', pos: [0, 0.9, 198], rot: 180, seed: 1, params: { width: 50 } },
    { type: 'italy.flagMasts', pos: [0, 0.9, 191], seed: 1, params: { count: 3, span: 34, height: 17 } },
    // the campanile beside it
    { type: 'italy.campanile', pos: [-25, 0.9, 168], seed: 3, params: { height: 70, width: 11 } },
    { type: 'common.birds', pos: [0, 0, 80], params: { count: 12, radius: 20, height: 18 } },
    { type: 'common.birds', pos: [0, 0, 150], params: { count: 9, radius: 16, height: 26 } },
  ],
  winchPoints: [
    {
      id: 'main',
      name: { ru: 'У базилики', en: 'By the basilica' },
      pos: [0, 0.9, 177],
      start: [0, 0, -6],
      difficulty: 1,
      hint: { ru: 'Прямая линия через всю площадь', en: 'Straight line across the whole piazza' },
    },
    {
      id: 'left',
      name: { ru: 'Левые мостки', en: 'Left landing' },
      pos: [9.5, 0.9, 150],
      start: [-4, 0, -4],
      difficulty: 2,
      hint: { ru: 'Диагональ: мостки, труба, ступени', en: 'Diagonal: duckboard, pipe, steps' },
    },
    {
      id: 'right',
      name: { ru: 'У стены', en: 'By the barrier' },
      pos: [-9.5, 0.9, 132],
      start: [4, 0, -4],
      difficulty: 3,
      hint: { ru: 'Короткая и злая: рейл, гэп, валлрайд', en: 'Short and mean: rail, gap, wallride' },
    },
  ],
  letters: [
    { index: 0, pos: [0, 2.7, 31] },
    { index: 1, pos: [-3, 1.5, 49] },
    { index: 2, pos: [3, 1.7, 76] },
    { index: 3, pos: [-1.2, 2.4, 94] },
    { index: 4, pos: [-6.1, 2.1, 111] },
    { index: 5, pos: [-1, 2.0, 142] },
  ],
  filmerZones: [{ id: 'gap_cam', pos: [9.2, 0.9, 89], center: [0, 93], radius: 13 }],
  goals: [
    { type: 'score', target: 14000 },
    { type: 'trick', trickId: 'spin540' },
    { type: 'letters' },
    { type: 'line', obstacles: ['kicker_pallet', 'rail_trestle', 'ledge_duck_a'], winch: 'main' },
    { type: 'clip', zone: 'gap_cam', minPoints: 1200 },
  ],
  unlockStars: 42,
  mapPos: [0.62, 0.6],
};
