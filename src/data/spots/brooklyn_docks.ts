import type { PropDef, SpotDef } from '../../types';

/**
 * BROOKLYN DOCKS. A 14 m dock channel at sunset between red-brick warehouses; wooden piers on
 * pilings, rusty steel, a cobblestone quay. A suspension bridge and the Manhattan skyline glow beyond.
 * Quay top 1.0 m. Rider's left = +X, right = −X.
 */
const props: PropDef[] = [];
for (let i = 0; i < 10; i++) {
  const z = 8 + i * 19;
  props.push(
    { type: 'usa.brickWarehouse', pos: [13, 1.0, z], rot: -90, seed: 10 + i, params: { bays: 3, bayW: 5.5, floors: 3 + (i % 3), tower: i % 3 === 1 ? 1 : 0, fire: i % 2 } },
    { type: 'usa.brickWarehouse', pos: [-13, 1.0, z + 7], rot: 90, seed: 60 + i, params: { bays: 3, bayW: 5.5, floors: 3 + ((i + 1) % 3), tower: i % 3 === 2 ? 1 : 0, fire: (i + 1) % 2 } },
  );
}
// wooden piers on pilings (a little overhang over the water)
props.push(
  { type: 'usa.pier', pos: [8.0, 1.04, 12], seed: 1, params: { len: 12, width: 3.2 } },
  { type: 'usa.pier', pos: [-8.0, 1.04, 22], seed: 2, params: { len: 11, width: 3.2 } },
  { type: 'usa.pier', pos: [-8.0, 1.04, 92], seed: 3, params: { len: 10, width: 3.2 } },
  { type: 'usa.pier', pos: [8.0, 1.04, 112], seed: 4, params: { len: 9, width: 3.2 } },
  { type: 'usa.pier', pos: [-8.0, 1.04, 158], seed: 5, params: { len: 12, width: 3.2 } },
);
// gas lamps on the quays
for (const z of [6, 40, 80, 118, 156]) {
  props.push({ type: 'usa.lamp', pos: [7.6, 1.0, z], params: { style: 1, height: 4.6 } });
  props.push({ type: 'usa.lamp', pos: [-7.6, 1.0, z + 18], params: { style: 1, height: 4.6 } });
}
// boats, containers, crates
props.push(
  { type: 'usa.tug', pos: [-5.8, 0, 61], seed: 31, params: { len: 11 } },
  { type: 'usa.tug', pos: [5.9, 0, 40], seed: 32, params: { len: 9 } },
  { type: 'usa.containerStack', pos: [10.2, 1.0, 82], rot: 90, seed: 3 },
  { type: 'usa.containerStack', pos: [-10.2, 1.0, 128], rot: 90, seed: 4 },
  { type: 'usa.containerStack', pos: [10.2, 1.0, 166], rot: 90, seed: 5 },
  { type: 'usa.crates', pos: [9.5, 1.0, 20], rot: 90, seed: 6, params: { count: 4 } },
  { type: 'usa.crates', pos: [-9.5, 1.0, 75], rot: 90, seed: 7, params: { count: 3 } },
  { type: 'usa.crates', pos: [-9.5, 1.0, 144], rot: 90, seed: 8, params: { count: 4 } },
  { type: 'usa.crates', pos: [9.5, 1.0, 130], rot: 90, seed: 9, params: { count: 2 } },
);
// landmarks: suspension bridge + Manhattan skyline with one very tall spire
props.push(
  { type: 'usa.suspensionBridge', pos: [-25, 0, 300], rot: 32, seed: 3, params: { span: 170, towerH: 78 } },
  { type: 'usa.manhattan', pos: [0, 0, 500], seed: 5, params: { width: 560 } },
  { type: 'common.birds', pos: [0, 0, 100], params: { count: 6, radius: 20, height: 26 } },
);

export const brooklynDocks: SpotDef = {
  id: 'brooklyn_docks',
  cityId: 'usa',
  name: { ru: 'Доки Бруклина', en: 'Brooklyn Docks' },
  blurb: {
    ru: 'Закат над старым доковым каналом: кирпичные склады, ржавая сталь и мост на фоне Манхэттена. Жёстче всех.',
    en: 'Sunset over an old dock channel: brick warehouses, rusty steel and a bridge against the Manhattan skyline. The toughest one.',
  },
  theme: 'usa',
  env: {
    timeOfDay: 'sunset',
    sunElevation: 7,
    sunAzimuth: 25,
    sunColor: 0xff8a4a,
    sunIntensity: 2.8,
    ambientIntensity: 0.75,
    turbidity: 10,
    rayleigh: 2.4,
    mieCoefficient: 0.012,
    mieDirectionalG: 0.9,
    exposure: 0.56,
    fogColor: 0xe89a78,
    fogNear: 110,
    fogFar: 700,
    waterShallow: 0x3a566e,
    waterDeep: 0x0b1a2a,
    waterClarity: 0.25,
    waveScale: 0.45,
    bloom: 0.5,
    neon: true,
  },
  bounds: { min: [-21, -16], max: [21, 188] },
  base: { level: -1.6, surface: 'stone' },
  water: [
    { id: 'channel', shape: { kind: 'rect', center: [0, 80], size: [14, 190] }, level: 0, depth: 1.8, style: 'canal' },
    { id: 'river', shape: { kind: 'rect', center: [0, 365], size: [1200, 320] }, level: 0, depth: 4, style: 'river' },
  ],
  ground: [
    { id: 'quay_left', center: [77, 80], size: [140, 190], top: 1.0, surface: 'stone', trim: 'granite' },
    { id: 'quay_right', center: [-77, 80], size: [140, 190], top: 1.0, surface: 'stone', trim: 'granite' },
    { id: 'quay_end', center: [0, 182], size: [14, 14], top: 1.0, surface: 'stone', trim: 'granite' },
    { id: 'promenade', center: [0, 199], size: [1200, 20], top: 1.0, surface: 'stone', trim: 'granite' },
    { id: 'quay_start', center: [0, -20], size: [14, 10], top: 1.0, surface: 'stone', trim: 'granite' },
    { id: 'far_shore', center: [0, 505], size: [1200, 60], top: 1.0, surface: 'stone', visible: false },
    { id: 'slab_gap', center: [0, 96.5], size: [14, 5], top: 0.12, surface: 'wetConcrete', trim: 'none' },
  ],
  obstacles: [
    { kind: 'kicker', id: 'kicker_wood', name: { ru: 'Деревянный кикер', en: 'Wooden kicker' }, pos: [0, 0, 20], width: 2.4, length: 4.2, height: 1.2, curve: 0.5, style: 'wood' },
    {
      kind: 'rail',
      id: 'rail_rust',
      name: { ru: 'Ржавый рейл', en: 'Rusty rail' },
      path: [
        [3, 0.45, 34],
        [3, 0.45, 47],
      ],
      style: 'round',
      radius: 0.05,
      material: 'rust',
      supports: 'posts',
    },
    { kind: 'kicker', id: 'kicker_pallet', name: { ru: 'Кикер из поддонов', en: 'Pallet kicker' }, pos: [-2, 0, 55], width: 2.2, length: 3.2, height: 0.9, curve: 0.2, style: 'pallet' },
    {
      kind: 'wall',
      id: 'wall_container',
      name: { ru: 'Контейнерная стенка', en: 'Container wall' },
      a: [7, 0, 82],
      b: [7, 0, 68],
      height: 2.9,
      lean: 8,
      surface: 'metal',
      style: 'container',
    },
    { kind: 'ledge', id: 'ledge_pier', name: { ru: 'Деревянный ледж', en: 'Timber ledge' }, pos: [-3, 0, 72], size: [1.2, 0.5, 8], surface: 'wood', style: 'wood' },
    { kind: 'kicker', id: 'kicker_gap', name: { ru: 'Бетонный кикер', en: 'Concrete kicker' }, pos: [0, 0, 89], width: 2.6, length: 4.2, height: 1.2, curve: 0.6, style: 'concrete' },
    {
      kind: 'gap',
      id: 'gap_docks',
      name: { ru: 'Гэп доков', en: 'Docks Gap' },
      shape: { kind: 'rect', center: [0, 96.5], size: [14, 5] },
      points: 600,
    },
    {
      kind: 'rail',
      id: 'pipe_steel',
      name: { ru: 'Стальная труба', en: 'Steel pipe' },
      path: [
        [-2, 0.3, 107],
        [2.5, 0.3, 121],
      ],
      style: 'pipe',
      radius: 0.28,
      material: 'steel',
      supports: 'none',
    },
    { kind: 'stairs', id: 'stairs_quay', name: { ru: 'Лестница на пирс', en: 'Pier stairs' }, pos: [5.2, 0, 125], width: 1.7, steps: 6, stepH: 0.15, stepD: 0.45, handrail: 'left', railHeight: 0.8, surface: 'stone', wet: true },
    {
      kind: 'rail',
      id: 'rail_kink',
      name: { ru: 'Кинк-рейл', en: 'Kinked rail' },
      path: [
        [-2, 0.4, 134],
        [-2, 0.95, 139],
        [-2, 0.95, 145],
        [-2, 0.4, 149],
      ],
      style: 'kink',
      radius: 0.05,
      material: 'steel',
      supports: 'posts',
    },
    { kind: 'kicker', id: 'kicker_final', name: { ru: 'Финальный кикер WHY NOT', en: 'WHY NOT finish kicker' }, pos: [1.5, 0, 153], width: 2.4, length: 4.2, height: 1.25, curve: 0.55, style: 'plastic' },
  ],
  props,
  winchPoints: [
    {
      id: 'main',
      name: { ru: 'Конец дока', en: 'End of the dock' },
      pos: [0, 1.0, 177],
      start: [0, 0, -11],
      difficulty: 2,
      hint: { ru: 'Прямая линия: кикер, рейл, гэп, кинк', en: 'Straight line: kicker, rail, gap, kink' },
    },
    {
      id: 'left',
      name: { ru: 'Левый пирс', en: 'Left pier' },
      pos: [8.5, 1.0, 150],
      start: [-3.5, 0, -9],
      difficulty: 2,
      hint: { ru: 'Диагональ: ледж, труба, лестница', en: 'Diagonal: ledge, pipe, stairs' },
    },
    {
      id: 'right',
      name: { ru: 'Под контейнерами', en: 'Under the containers' },
      pos: [-8.5, 1.0, 132],
      start: [3.5, 0, -9],
      difficulty: 3,
      hint: { ru: 'Короткая и злая: рейл, контейнер, гэп', en: 'Short and mean: rail, container wall, gap' },
    },
  ],
  letters: [
    { index: 0, pos: [0, 2.7, 29] },
    { index: 1, pos: [3, 1.6, 41] },
    { index: 2, pos: [-2, 1.9, 61] },
    { index: 3, pos: [0, 2.4, 96] },
    { index: 4, pos: [5.9, 2.1, 75] },
    { index: 5, pos: [-2, 2.0, 142] },
  ],
  filmerZones: [{ id: 'gap_cam', pos: [8.4, 1.0, 91], center: [0, 95], radius: 13 }],
  goals: [
    { type: 'score', target: 8000 },
    { type: 'trick', trickId: 'tantrum' },
    { type: 'letters' },
    { type: 'line', obstacles: ['kicker_wood', 'rail_rust', 'kicker_pallet'], winch: 'main' },
    { type: 'clip', zone: 'gap_cam', minPoints: 1000 },
  ],
  unlockStars: 9,
  mapPos: [0.62, 0.34],
};
