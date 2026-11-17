import type { PropDef, SpotDef } from '../../types';

/**
 * MIAMI — WYNWOOD. A turquoise canal through the arts district on a hot golden afternoon.
 * 16 m wide canal along +Z between two quays (top 0.9 m); pastel art-deco rows and mural warehouses
 * line both banks, a downtown skyline + long causeway close the view over the bay.
 * Rider's left = +X, right = −X.
 */
const props: PropDef[] = [];
// building rows: left bank (x>0) faces −X (rot −90), right bank faces +X (rot 90)
for (let i = 0; i < 10; i++) {
  const z = 8 + i * 20;
  const leftMural = i % 3 === 1;
  const rightMural = i % 3 === 2;
  props.push(
    leftMural
      ? { type: 'usa.muralWarehouse', pos: [14, 0.9, z], rot: -90, seed: 100 + i, params: { w: 18, h: 6.5, depth: 14, piece: ['WYNWOOD', 'WHY NOT', 'MIAMI'][i % 3], piece2: 'ART', seed: 11 + i } }
      : { type: 'usa.deco', pos: [14, 0.9, z], rot: -90, seed: 10 + i, params: { bays: 3, bayW: 6, floors: 2 + (i % 2) } },
    rightMural
      ? { type: 'usa.muralWarehouse', pos: [-14, 0.9, z], rot: 90, seed: 200 + i, params: { w: 18, h: 7, depth: 14, piece: ['FLOW', 'WYN', 'SUN'][i % 3], piece2: 'MIA', seed: 41 + i } }
      : { type: 'usa.deco', pos: [-14, 0.9, z], rot: 90, seed: 40 + i, params: { bays: 3, bayW: 6, floors: 2 + ((i + 1) % 2) } },
  );
}
// royal palms along both sidewalks
for (const [i, z] of [4, 24, 46, 66, 88, 110, 130, 152, 172].entries()) {
  props.push({ type: 'usa.royalPalm', pos: [9.6, 0.9, z], seed: 300 + i, params: { height: 13 + (i % 3) * 2 } });
  props.push({ type: 'usa.royalPalm', pos: [-9.6, 0.9, z + 11], seed: 330 + i, params: { height: 14 + (i % 2) * 2 } });
}
// street lamps
for (const z of [12, 52, 96, 140, 176]) {
  props.push({ type: 'usa.lamp', pos: [8.7, 0.9, z], rot: -90, params: { style: 0 } });
  props.push({ type: 'usa.lamp', pos: [-8.7, 0.9, z + 20], rot: 90, params: { style: 0 } });
}
// parked classics along the sidewalks (nose along the canal)
props.push(
  { type: 'usa.classicCar', pos: [12, 0.9, 20], rot: 0, seed: 1, params: { color: 0x35c9c4 } },
  { type: 'usa.classicCar', pos: [-12, 0.9, 60], rot: 180, seed: 2, params: { color: 0xff7aa8 } },
  { type: 'usa.classicCar', pos: [12, 0.9, 78], rot: 0, seed: 3, params: { color: 0xfff0a8 } },
  { type: 'usa.classicCar', pos: [-12, 0.9, 118], rot: 180, seed: 4, params: { color: 0xf5f0e8 } },
  { type: 'usa.classicCar', pos: [12, 0.9, 140], rot: 0, seed: 5, params: { color: 0xff5a4a } },
  { type: 'usa.classicCar', pos: [-12, 0.9, 160], rot: 180, seed: 6, params: { color: 0x4aa8e8 } },
);
// lifeguard-style hut, moored boats, clutter
props.push(
  { type: 'usa.lifeguardHut', pos: [11, 0.9, 100], rot: -90 },
  { type: 'usa.lifeguardHut', pos: [-11, 0.9, 34], rot: 90, seed: 9 },
  { type: 'usa.speedboat', pos: [6.7, 0, 14], seed: 21, params: { len: 7 } },
  { type: 'usa.speedboat', pos: [-6.7, 0, 44], seed: 22, params: { len: 6 } },
  { type: 'usa.speedboat', pos: [6.7, 0, 100], seed: 23, params: { len: 7.5 } },
  { type: 'usa.speedboat', pos: [-6.7, 0, 162], seed: 24, params: { len: 6.5 } },
  { type: 'usa.crates', pos: [10.5, 0.9, 150], rot: 90, seed: 5, params: { count: 3 } },
  { type: 'common.potPlant', pos: [11.2, 0.9, 40], rot: -90, seed: 120, params: { kind: 'flower', count: 3, spacing: 1.3 } },
  { type: 'common.potPlant', pos: [-11.2, 0.9, 74], rot: 90, seed: 131, params: { kind: 'bush', count: 2, spacing: 1.4 } },
  { type: 'common.potPlant', pos: [11.2, 0.9, 126], rot: -90, seed: 123, params: { kind: 'flower', count: 3, spacing: 1.3 } },
);
// landmark: downtown skyline + long causeway over the bay
props.push(
  { type: 'usa.skylineMiami', pos: [10, 0, 350], seed: 7, params: { width: 380 } },
  { type: 'usa.causeway', pos: [0, 0, 262], seed: 8, params: { span: 520, rise: 20 } },
  { type: 'common.birds', pos: [0, 0, 90], params: { count: 8, radius: 18, height: 24 } },
);

export const miamiWynwood: SpotDef = {
  id: 'miami_wynwood',
  cityId: 'usa',
  name: { ru: 'Майами, Винвуд', en: 'Miami Wynwood' },
  blurb: {
    ru: 'Бирюзовый канал среди пастельного арт-деко и огромных муралов. Жара, золотой свет, пальмы.',
    en: 'A turquoise canal between pastel art deco and giant murals. Heat, golden light, royal palms.',
  },
  theme: 'usa',
  env: {
    timeOfDay: 'golden',
    sunElevation: 30,
    sunAzimuth: 135,
    sunColor: 0xffd9a0,
    sunIntensity: 3.4,
    ambientIntensity: 1.0,
    turbidity: 4,
    rayleigh: 1.4,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
    exposure: 0.66,
    fogColor: 0xbfe4f0,
    fogNear: 110,
    fogFar: 560,
    waterShallow: 0x2fd6cc,
    waterDeep: 0x0a7f9a,
    waterClarity: 0.8,
    waveScale: 0.3,
    bloom: 0.3,
  },
  bounds: { min: [-23, -16], max: [23, 188] },
  base: { level: -1.6, surface: 'concrete' },
  water: [
    { id: 'canal', shape: { kind: 'rect', center: [0, 80], size: [16, 190] }, level: 0, depth: 1.6, style: 'canal' },
    { id: 'bay', shape: { kind: 'rect', center: [0, 345], size: [1000, 280] }, level: 0, depth: 3, style: 'river' },
  ],
  ground: [
    { id: 'quay_left', center: [78, 80], size: [140, 190], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'quay_right', center: [-78, 80], size: [140, 190], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'quay_end', center: [0, 182], size: [16, 14], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'promenade', center: [0, 199], size: [1000, 20], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'quay_start', center: [0, -20], size: [16, 10], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'slab_gap', center: [0, 94.5], size: [16, 5], top: 0.12, surface: 'wetConcrete', trim: 'none' },
  ],
  obstacles: [
    { kind: 'kicker', id: 'kicker_pallet', name: { ru: 'Кикер из поддонов', en: 'Pallet kicker' }, pos: [-1.5, 0, 22], width: 2.4, length: 3.6, height: 0.95, curve: 0.25, style: 'pallet' },
    {
      kind: 'rail',
      id: 'rail_pastel',
      name: { ru: 'Пастельный рейл', en: 'Pastel rail' },
      path: [
        [-3, 0.45, 38],
        [-3, 0.45, 52],
      ],
      style: 'round',
      radius: 0.05,
      material: 'pvc',
      supports: 'posts',
    },
    { kind: 'kicker', id: 'kicker_container', name: { ru: 'Кикер из контейнера', en: 'Container kicker' }, pos: [2.5, 0, 60], width: 2.6, length: 4.2, height: 1.1, curve: 0.35, style: 'wood' },
    { kind: 'ledge', id: 'ledge_deco', name: { ru: 'Ледж-клумба', en: 'Planter ledge' }, pos: [-3, 0, 74], size: [1.2, 0.6, 9], surface: 'concrete', style: 'planter' },
    { kind: 'kicker', id: 'kicker_gap', name: { ru: 'Бетонный кикер', en: 'Concrete kicker' }, pos: [-1.5, 0, 86.5], width: 2.6, length: 4.2, height: 1.15, curve: 0.6, style: 'concrete' },
    {
      kind: 'gap',
      id: 'gap_wynwood',
      name: { ru: 'Гэп Винвуда', en: 'Wynwood Gap' },
      shape: { kind: 'rect', center: [0, 94.5], size: [16, 5] },
      points: 500,
    },
    {
      kind: 'wall',
      id: 'wall_mural',
      name: { ru: 'Стена-мурал', en: 'Mural wall' },
      a: [-8, 0, 103],
      b: [-8, 0, 119],
      height: 3.4,
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
    { kind: 'stairs', id: 'stairs_left', name: { ru: 'Лестница с перилами', en: 'Stairs & handrail' }, pos: [6.7, 0, 126], width: 1.7, steps: 6, stepH: 0.15, stepD: 0.45, handrail: 'right', railHeight: 0.8, surface: 'concrete', wet: false },
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
      material: 'neon',
      supports: 'posts',
    },
    { kind: 'kicker', id: 'kicker_final', name: { ru: 'Финальный кикер WHY NOT', en: 'WHY NOT finish kicker' }, pos: [2, 0, 153], width: 2.4, length: 4.2, height: 1.25, curve: 0.55, style: 'plastic' },
  ],
  props,
  winchPoints: [
    {
      id: 'main',
      name: { ru: 'Конец канала', en: 'End of the canal' },
      pos: [0, 0.9, 177],
      start: [0, 0, -2],
      difficulty: 1,
      hint: { ru: 'Прямая линия: кикер, рейл, гэп, кинк', en: 'Straight line: kicker, rail, gap, kink' },
    },
    {
      id: 'left',
      name: { ru: 'Левая набережная', en: 'Left quay' },
      pos: [10.5, 0.9, 150],
      start: [-4, 0, 0],
      difficulty: 2,
      hint: { ru: 'Диагональ: ледж, труба, лестница', en: 'Diagonal: ledge, pipe, stairs' },
    },
    {
      id: 'right',
      name: { ru: 'У мурала', en: 'By the mural' },
      pos: [-10.5, 0.9, 132],
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
    { index: 4, pos: [-7.1, 2.1, 111] },
    { index: 5, pos: [-1, 2.0, 142] },
  ],
  filmerZones: [{ id: 'gap_cam', pos: [10.2, 0.9, 89], center: [0, 93], radius: 13 }],
  goals: [
    { type: 'score', target: 6000 },
    { type: 'trick', trickId: 'frontroll' },
    { type: 'letters' },
    { type: 'line', obstacles: ['kicker_pallet', 'rail_pastel', 'ledge_deco'], winch: 'main' },
    { type: 'clip', zone: 'gap_cam', minPoints: 800 },
  ],
  unlockStars: 6,
  mapPos: [0.35, 0.62],
};
