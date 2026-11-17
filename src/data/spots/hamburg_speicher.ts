import type { PropDef, SpotDef } from '../../types';

/**
 * HAMBURG — SPEICHERSTADT. Overcast harbour-canal ("Fleet") between red-brick neo-gothic warehouses.
 * A 14 m wide canal along +Z between two cobbled quays (top 1.0 m). Rider's left = +X.
 * Landmark: a modern concert hall (wavy glass crown on a brick warehouse base) at the end of the harbour.
 */
const QUAY = 1.0;

const rows: PropDef[] = [];
for (let i = 0; i < 8; i++) {
  rows.push({ type: 'germany.speicherRow', pos: [10.5, QUAY, i * 30 - 5], rot: -90, seed: 10 + i, params: { bays: 6, floors: 5 + (i % 3), turret: 1 } });
  rows.push({ type: 'germany.speicherRow', pos: [-10.5, QUAY, i * 30 + 10], rot: 90, seed: 40 + i, params: { bays: 6, floors: 6 + ((i + 1) % 2), turret: 1 } });
}
const lamps: PropDef[] = [];
for (let z = 6; z < 185; z += 26) {
  lamps.push({ type: 'germany.lamp', pos: [8.2, QUAY, z], rot: 180, params: { height: 4.6 } });
  lamps.push({ type: 'germany.lamp', pos: [-8.2, QUAY, z + 13], rot: 0, params: { height: 4.6 } });
}

export const hamburgSpeicher: SpotDef = {
  id: 'hamburg_speicher',
  cityId: 'germany',
  name: { ru: 'Гамбург, Шпайхерштадт', en: 'Hamburg Speicherstadt' },
  blurb: {
    ru: 'Серое небо, красный кирпич и зелёные медные крыши: катаем по каналу между старыми складами.',
    en: 'Grey sky, red brick and green copper roofs: ride the canal between the old warehouses.',
  },
  theme: 'germany',
  env: {
    timeOfDay: 'overcast',
    sunElevation: 42,
    sunAzimuth: 150,
    sunColor: 0xe4eaf0,
    sunIntensity: 1.7,
    ambientIntensity: 1.25,
    turbidity: 9,
    rayleigh: 1.1,
    mieCoefficient: 0.01,
    mieDirectionalG: 0.7,
    exposure: 0.72,
    fogColor: 0xaeb8bc,
    fogNear: 90,
    fogFar: 560,
    waterShallow: 0x5f8574,
    waterDeep: 0x1f3d38,
    waterClarity: 0.2,
    waveScale: 0.22,
    bloom: 0.15,
  },
  bounds: { min: [-22, -16], max: [22, 188] },
  base: { level: -1.6, surface: 'stone' },
  water: [{ id: 'fleet', shape: { kind: 'rect', center: [0, 80], size: [14, 190] }, level: 0, depth: 1.6, style: 'canal' }],
  ground: [
    { id: 'quay_left', center: [14.5, 80], size: [15, 190], top: QUAY, surface: 'stone', trim: 'granite' },
    { id: 'quay_right', center: [-14.5, 80], size: [15, 190], top: QUAY, surface: 'stone', trim: 'granite' },
    { id: 'quay_end', center: [0, 182], size: [44, 14], top: QUAY, surface: 'stone', trim: 'granite' },
    { id: 'quay_start', center: [0, -20], size: [44, 10], top: QUAY, surface: 'stone', trim: 'granite' },
    // low wet slab across the canal (a lock sill): slide over it or gap it
    { id: 'slab_gap', center: [0, 94.5], size: [14, 5], top: 0.12, surface: 'wetConcrete', trim: 'none' },
  ],
  obstacles: [
    { kind: 'kicker', id: 'kicker_main', name: { ru: 'Деревянный кикер', en: 'Wooden kicker' }, pos: [0, 0, 25], width: 2.6, length: 4.6, height: 1.3, curve: 0.55, style: 'wood' },
    {
      kind: 'rail',
      id: 'rail_iron',
      name: { ru: 'Чугунный рейл', en: 'Iron rail' },
      path: [
        [-3, 0.42, 42],
        [-3, 0.42, 55],
      ],
      style: 'round',
      radius: 0.05,
      material: 'steel',
      supports: 'posts',
    },
    { kind: 'kicker', id: 'kicker_pallet', name: { ru: 'Кикер из поддонов', en: 'Pallet kicker' }, pos: [3, 0, 63], width: 2.2, length: 3.2, height: 0.85, curve: 0.2, style: 'pallet' },
    { kind: 'ledge', id: 'ledge_granite', name: { ru: 'Гранитный ледж', en: 'Granite ledge' }, pos: [3, 0, 74], size: [1.2, 0.55, 9], surface: 'stone', style: 'granite' },
    { kind: 'kicker', id: 'kicker_gap', name: { ru: 'Бетонный кикер', en: 'Concrete kicker' }, pos: [-1.5, 0, 86.5], width: 2.6, length: 4.2, height: 1.15, curve: 0.6, style: 'concrete' },
    {
      kind: 'gap',
      id: 'gap_sill',
      name: { ru: 'Гэп шлюза', en: 'Lock Sill Gap' },
      shape: { kind: 'rect', center: [0, 94.5], size: [14, 5] },
      points: 500,
    },
    {
      kind: 'wall',
      id: 'wall_brick',
      name: { ru: 'Кирпичная стена', en: 'Brick wall' },
      a: [-7, 0, 103],
      b: [-7, 0, 119],
      height: 3.2,
      lean: 12,
      surface: 'concrete',
      style: 'brick',
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
      material: 'rust',
      supports: 'none',
    },
    { kind: 'stairs', id: 'stairs_water', name: { ru: 'Лестница к воде', en: 'Stairs to the water' }, pos: [6.1, 0, 126], width: 1.7, steps: 6, stepH: 0.15, stepD: 0.45, handrail: 'right', railHeight: 0.8, surface: 'stone', wet: true },
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
    ...rows,
    ...lamps,
    { type: 'germany.footbridge', pos: [0, QUAY, 66], params: { span: 21, height: 7.4 } },
    { type: 'germany.footbridge', pos: [0, QUAY, 128], params: { span: 21, height: 8.4 } },
    { type: 'germany.barge', pos: [-5.4, 0, 8], seed: 3, params: { length: 10, width: 3 } },
    { type: 'germany.barge', pos: [5.4, 0, 33], seed: 5, params: { length: 9, width: 3 } },
    { type: 'germany.barge', pos: [5.4, 0, 164], seed: 8, params: { length: 10, width: 3.2 } },
    { type: 'germany.crates', pos: [9.0, QUAY, 20], rot: 90, seed: 3, params: { count: 4 } },
    { type: 'germany.crates', pos: [-9.0, QUAY, 52], rot: 90, seed: 4, params: { count: 3 } },
    { type: 'germany.crates', pos: [9.0, QUAY, 100], rot: 90, seed: 5, params: { count: 4 } },
    { type: 'germany.crates', pos: [-9.0, QUAY, 150], rot: 90, seed: 6, params: { count: 3 } },
    { type: 'common.tree', pos: [8.6, QUAY, 14], seed: 1, params: { height: 6.5, crown: 2.4 } },
    { type: 'common.tree', pos: [-8.6, QUAY, 40], seed: 2, params: { height: 7, crown: 2.6 } },
    { type: 'common.tree', pos: [8.6, QUAY, 90], seed: 3, params: { height: 6, crown: 2.4 } },
    { type: 'common.tree', pos: [-8.6, QUAY, 112], seed: 4, params: { height: 7.5, crown: 2.8 } },
    { type: 'common.tree', pos: [8.6, QUAY, 156], seed: 5, params: { height: 6.5, crown: 2.4 } },
    // landmark: concert hall at the end of the harbour + harbour cranes
    { type: 'germany.hall', pos: [-10, -1.6, 285], rot: 180, scale: 1.4, params: { width: 80 } },
    { type: 'germany.cranes', pos: [95, -1.6, 250], rot: 90, seed: 7, params: { count: 3, spacing: 48 } },
    { type: 'germany.cranes', pos: [-100, -1.6, 270], rot: -90, seed: 9, params: { count: 2, spacing: 60 } },
    { type: 'germany.skyline', pos: [0, -1.6, 420], rot: 180, seed: 2, params: { width: 420, count: 26, minH: 18, maxH: 52, tone: 0x8d979c } },
    { type: 'germany.skyline', pos: [-140, -1.6, 130], rot: 90, seed: 4, params: { width: 300, count: 20, minH: 20, maxH: 60, tone: 0x8d979c } },
    { type: 'germany.skyline', pos: [140, -1.6, 130], rot: -90, seed: 6, params: { width: 300, count: 20, minH: 20, maxH: 60, tone: 0x8d979c } },
    { type: 'common.birds', pos: [0, 0, 90], params: { count: 8, radius: 20, height: 24 } },
  ],
  winchPoints: [
    {
      id: 'main',
      name: { ru: 'Конец канала', en: 'End of the canal' },
      pos: [0, QUAY, 177],
      start: [0, 0, -2],
      difficulty: 1,
      hint: { ru: 'Прямая линия через все препятствия', en: 'Straight line through everything' },
    },
    {
      id: 'left',
      name: { ru: 'Левая набережная', en: 'Left quay' },
      pos: [9.5, QUAY, 150],
      start: [-4, 0, 0],
      difficulty: 2,
      hint: { ru: 'Диагональ: гранит, труба, лестница', en: 'Diagonal: granite, pipe, stairs' },
    },
    {
      id: 'right',
      name: { ru: 'У кирпичной стены', en: 'By the brick wall' },
      pos: [-9.5, QUAY, 132],
      start: [4, 0, 0],
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
  filmerZones: [{ id: 'gap_cam', pos: [9.2, QUAY, 89], center: [0, 93], radius: 13 }],
  goals: [
    { type: 'score', target: 10000 },
    { type: 'trick', trickId: 'tantrum' },
    { type: 'letters' },
    { type: 'line', obstacles: ['kicker_main', 'rail_iron', 'ledge_granite'], winch: 'main' },
    { type: 'clip', zone: 'gap_cam', minPoints: 900 },
  ],
  unlockStars: 14,
  mapPos: [0.38, 0.36],
};
