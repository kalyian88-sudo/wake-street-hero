import type { PropDef, SpotDef } from '../../types';

/**
 * BERLIN — SPREE EMBANKMENT AT NIGHT. Neon spot: concrete embankment along the river, a long graffiti
 * wall on the right bank (east-side-gallery vibe), prefab housing blocks with lit windows, a brick
 * railway viaduct with an elevated track, club neon signs. The TV tower stands far behind the line.
 * Rider's left = +X.
 */
const Q = 0.9;

const props: PropDef[] = [];
// prefab slabs on the left bank (+X): skip the slot at z≈67 where the viaduct crosses
for (let i = 0; i < 6; i++) {
  if (i === 2) continue;
  props.push({ type: 'germany.plattenbau', pos: [11.5, Q, i * 36 - 5], rot: -90, seed: 20 + i, params: { bays: 10, floors: 8 + ((i * 3) % 6), depth: 12 } });
}
// …and on the right bank behind the graffiti wall, skipping the slot at z≈85
for (let i = 0; i < 6; i++) {
  if (i === 2) continue;
  props.push({ type: 'germany.plattenbau', pos: [-14, Q, i * 36 + 13], rot: 90, seed: 60 + i, params: { bays: 10, floors: 9 + ((i * 5) % 5), depth: 12 } });
}
for (let z = 8; z < 185; z += 24) {
  props.push({ type: 'germany.lamp', pos: [8.2, Q, z], rot: 180, params: { height: 5 } });
  props.push({ type: 'germany.lamp', pos: [-8.2, Q, z + 12], rot: 0, params: { height: 5 } });
}

export const berlinSpree: SpotDef = {
  id: 'berlin_spree',
  cityId: 'germany',
  name: { ru: 'Берлин, Шпрее', en: 'Berlin Spree' },
  blurb: {
    ru: 'Ночная набережная: стена граффити, панельки, неон клубов и телебашня вдалеке.',
    en: 'Night embankment: a graffiti wall, prefab blocks, club neon and the TV tower in the distance.',
  },
  theme: 'germany',
  env: {
    timeOfDay: 'night',
    sunElevation: 30,
    sunAzimuth: 200,
    sunColor: 0x8da2e8,
    sunIntensity: 1.8,
    ambientIntensity: 1.15,
    turbidity: 2,
    rayleigh: 0.3,
    mieCoefficient: 0.002,
    mieDirectionalG: 0.7,
    exposure: 1.35,
    fogColor: 0x10142c,
    fogNear: 80,
    fogFar: 700,
    waterShallow: 0x2a4278,
    waterDeep: 0x050818,
    waterClarity: 0.3,
    waveScale: 0.3,
    bloom: 1,
    neon: true,
    stars: true,
  },
  bounds: { min: [-22, -16], max: [22, 188] },
  base: { level: -1.6, surface: 'concrete' },
  water: [{ id: 'spree', shape: { kind: 'rect', center: [0, 80], size: [14, 190] }, level: 0, depth: 1.6, style: 'canal' }],
  ground: [
    { id: 'quay_left', center: [14.5, 80], size: [15, 190], top: Q, surface: 'concrete', trim: 'kerb' },
    { id: 'quay_right', center: [-14.5, 80], size: [15, 190], top: Q, surface: 'concrete', trim: 'kerb' },
    { id: 'quay_end', center: [0, 182], size: [44, 14], top: Q, surface: 'concrete', trim: 'kerb' },
    { id: 'quay_start', center: [0, -20], size: [44, 10], top: Q, surface: 'concrete', trim: 'kerb' },
    // low flooded slab across the river: slide over it or gap it
    { id: 'slab_gap', center: [0, 94.5], size: [14, 5], top: 0.12, surface: 'wetConcrete', trim: 'none' },
  ],
  obstacles: [
    { kind: 'kicker', id: 'kicker_main', name: { ru: 'Бетонный кикер', en: 'Concrete kicker' }, pos: [0, 0, 25], width: 2.6, length: 4.6, height: 1.3, curve: 0.55, style: 'concrete' },
    { kind: 'ledge', id: 'ledge_long', name: { ru: 'Длинный ледж', en: 'Long ledge' }, pos: [-3, 0, 48], size: [1.2, 0.55, 13], surface: 'concrete', style: 'concrete' },
    { kind: 'kicker', id: 'kicker_pallet', name: { ru: 'Кикер из поддонов', en: 'Pallet kicker' }, pos: [3, 0, 63], width: 2.2, length: 3.2, height: 0.85, curve: 0.2, style: 'pallet' },
    { kind: 'ledge', id: 'ledge_block', name: { ru: 'Бетонный блок', en: 'Concrete block' }, pos: [3, 0, 74], size: [1.2, 0.55, 9], surface: 'concrete', style: 'concrete' },
    { kind: 'kicker', id: 'kicker_gap', name: { ru: 'Кикер через гэп', en: 'Gap kicker' }, pos: [-1.5, 0, 86.5], width: 2.6, length: 4.2, height: 1.15, curve: 0.6, style: 'concrete' },
    {
      kind: 'gap',
      id: 'gap_spree',
      name: { ru: 'Гэп Шпрее', en: 'Spree Gap' },
      shape: { kind: 'rect', center: [0, 94.5], size: [14, 5] },
      points: 500,
    },
    {
      kind: 'wall',
      id: 'wall_graffiti',
      name: { ru: 'Стена-галерея', en: 'Gallery wall' },
      a: [-7, 0, 103],
      b: [-7, 0, 119],
      height: 3.2,
      lean: 12,
      surface: 'concrete',
      style: 'graffiti',
    },
    {
      kind: 'rail',
      id: 'pipe_fat',
      name: { ru: 'Труба', en: 'Pipe' },
      path: [
        [2.2, 0.32, 107],
        [5, 0.32, 121],
      ],
      style: 'pipe',
      radius: 0.3,
      material: 'concrete',
      supports: 'none',
    },
    { kind: 'stairs', id: 'stairs_bank', name: { ru: 'Спуск с перилами', en: 'Steps & handrail' }, pos: [6.1, 0, 126], width: 1.7, steps: 6, stepH: 0.15, stepD: 0.45, handrail: 'right', railHeight: 0.8, surface: 'concrete', wet: false },
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
    ...props,
    // long graffiti wall on the right bank (two sections around the viaduct)
    { type: 'germany.muralWall', pos: [-9.6, Q, 25], rot: 90, params: { length: 78, height: 3.2 } },
    { type: 'germany.muralWall', pos: [-9.6, Q, 134], rot: 90, params: { length: 108, height: 3.2 } },
    { type: 'germany.railBridge', pos: [0, 0, 72], params: { depth: 9 } },
    { type: 'germany.clubSign', pos: [9.4, Q, 13], rot: -90, params: { variant: 0 } },
    { type: 'germany.clubSign', pos: [9.4, Q, 49], rot: -90, params: { variant: 1 } },
    { type: 'germany.clubSign', pos: [9.4, Q, 121], rot: -90, params: { variant: 2 } },
    { type: 'germany.clubSign', pos: [9.4, Q, 157], rot: -90, params: { variant: 3 } },
    { type: 'germany.clubSign', pos: [-8.6, Q, 34], rot: 90, params: { variant: 3 } },
    { type: 'germany.clubSign', pos: [-8.6, Q, 150], rot: 90, params: { variant: 1 } },
    { type: 'common.tree', pos: [8.8, Q, 28], seed: 1, params: { height: 6.5, crown: 2.4 } },
    { type: 'common.tree', pos: [8.8, Q, 100], seed: 2, params: { height: 7, crown: 2.6 } },
    { type: 'common.tree', pos: [8.8, Q, 140], seed: 3, params: { height: 6, crown: 2.4 } },
    { type: 'common.tree', pos: [-8.4, Q, 60], seed: 4, params: { height: 7, crown: 2.6 } },
    { type: 'germany.crates', pos: [9.2, Q, 64], rot: 90, seed: 3, params: { count: 3 } },
    // landmark: TV tower far behind the line, plus a lit city skyline
    { type: 'germany.tvTower', pos: [38, -1.6, 360], seed: 1, params: { height: 190 } },
    { type: 'germany.skyline', pos: [0, -1.6, 300], rot: 180, seed: 5, params: { width: 420, count: 28, minH: 25, maxH: 70, lit: 1, tone: 0x2a3050 } },
    { type: 'germany.skyline', pos: [-140, -1.6, 130], rot: 90, seed: 6, params: { width: 300, count: 20, minH: 25, maxH: 70, lit: 1, tone: 0x2a3050 } },
    { type: 'germany.skyline', pos: [140, -1.6, 130], rot: -90, seed: 7, params: { width: 300, count: 20, minH: 25, maxH: 70, lit: 1, tone: 0x2a3050 } },
  ],
  winchPoints: [
    {
      id: 'main',
      name: { ru: 'Конец набережной', en: 'End of the embankment' },
      pos: [0, Q, 177],
      start: [0, 0, -2],
      difficulty: 1,
      hint: { ru: 'Прямая линия через все препятствия', en: 'Straight line through everything' },
    },
    {
      id: 'left',
      name: { ru: 'У панелек', en: 'By the prefabs' },
      pos: [9.5, Q, 150],
      start: [-4, 0, 0],
      difficulty: 2,
      hint: { ru: 'Диагональ: блок, труба, спуск', en: 'Diagonal: block, pipe, steps' },
    },
    {
      id: 'right',
      name: { ru: 'У стены-галереи', en: 'By the gallery wall' },
      pos: [-9.5, Q, 132],
      start: [4, 0, 0],
      difficulty: 3,
      hint: { ru: 'Короткая и злая: ледж, гэп, валлрайд', en: 'Short and mean: ledge, gap, wallride' },
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
  filmerZones: [{ id: 'gap_cam', pos: [9.2, Q, 89], center: [0, 93], radius: 13 }],
  goals: [
    { type: 'score', target: 10000 },
    { type: 'trick', trickId: 'rail.boardslide' },
    { type: 'letters' },
    { type: 'line', obstacles: ['kicker_main', 'ledge_long', 'ledge_block'], winch: 'main' },
    { type: 'clip', zone: 'gap_cam', minPoints: 1000 },
  ],
  unlockStars: 17,
  mapPos: [0.6, 0.6],
};
