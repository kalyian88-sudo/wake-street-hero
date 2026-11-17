import type { PropDef, SpotDef } from '../../types';

/**
 * PARIS — BANKS OF THE SEINE. Golden-hour river channel between low stone quays.
 * Lower quay (top 0.9) with wide stone steps, upper street level (top 2.4) with bouquinistes boxes,
 * Haussmann facades behind, an arch bridge high above the far section and the iron lattice tower
 * far down the river. Rider's left = +X.
 */

const props: PropDef[] = [];
const add = (p: PropDef): void => {
  props.push(p);
};

// Haussmann rows (both banks, set back behind the upper street)
const rowZ = [-6, 10, 26, 42, 58, 74, 90, 106, 122, 138, 154, 186];
rowZ.forEach((z, i) => {
  add({ type: 'france.haussmannRow', pos: [17, 2.4, z + 4], rot: -90, seed: 100 + i, params: { bays: 4, floors: 6, depth: 12, palette: i } });
  add({ type: 'france.haussmannRow', pos: [-17, 2.4, z + 12], rot: 90, seed: 200 + i, params: { bays: 4, floors: 6, depth: 12, palette: i + 2 } });
});
// beyond the bridge the rows keep going, far and low-cost
[202, 218, 234, 250, 270, 290, 310].forEach((z, i) => {
  add({ type: 'france.haussmannRow', pos: [17, 2.4, z], rot: -90, seed: 300 + i, params: { bays: 4, floors: 6, depth: 12, palette: i } });
  add({ type: 'france.haussmannRow', pos: [-17, 2.4, z + 8], rot: 90, seed: 400 + i, params: { bays: 4, floors: 6, depth: 12, palette: i + 1 } });
});

// bouquinistes boxes on the upper quay wall
[8, 36, 66, 100, 130].forEach((z, i) => {
  add({ type: 'france.bouquinistes', pos: [12.5, 2.4, z], rot: -90, seed: 500 + i, params: { length: 14 } });
});
[18, 48, 82, 116, 144].forEach((z, i) => {
  add({ type: 'france.bouquinistes', pos: [-12.5, 2.4, z], rot: 90, seed: 520 + i, params: { length: 14 } });
});

// lamp posts along both upper parapets, plane trees on the lower quay
for (let i = 0; i < 9; i++) {
  const z = 4 + i * 21;
  add({ type: 'france.lampPost', pos: [12.9, 2.4, z], seed: 600 + i });
  add({ type: 'france.lampPost', pos: [-12.9, 2.4, z + 10], seed: 620 + i });
}
[6, 34, 62, 96, 126, 148].forEach((z, i) => {
  add({ type: 'common.tree', pos: [10.6, 0.9, z], seed: 700 + i, params: { height: 9.5, crown: 3.4, tint: 0x6f9a45 } });
});
[16, 40, 76, 110, 136, 168].forEach((z, i) => {
  add({ type: 'common.tree', pos: [-10.6, 0.9, z], seed: 720 + i, params: { height: 9, crown: 3.2, tint: 0x7aa04a } });
});

// the bridge high above the far section
add({ type: 'france.bridge', pos: [0, 0, 165], seed: 1, params: { span: 13, deckY: 8.6 } });

// moored barges at the edges (never in the riding line)
add({ type: 'france.barge', pos: [5.3, 0, 17], rot: 0, seed: 11, params: { length: 18, hull: 0x2d3f55 } });
add({ type: 'france.barge', pos: [-5.3, 0, 152], rot: 180, seed: 12, params: { length: 20, hull: 0x6a2f2a } });
add({ type: 'france.barge', pos: [5.3, 0, 252], rot: 0, seed: 13, params: { length: 20, hull: 0x23484a } });
add({ type: 'france.barge', pos: [-5.3, 0, 320], rot: 180, seed: 14, params: { length: 22, hull: 0x3a3a46 } });

// the iron lattice tower, far down the river, plus a hazy city skyline
add({ type: 'france.tower', pos: [10, 0, 410], seed: 3, params: { height: 215 } });
add({ type: 'france.haussmannRow', pos: [-40, 2.4, 380], rot: 0, seed: 801, params: { bays: 10, floors: 6, depth: 14, palette: 3 } });
add({ type: 'france.haussmannRow', pos: [60, 2.4, 340], rot: 0, seed: 802, params: { bays: 10, floors: 6, depth: 14, palette: 1 } });
add({ type: 'france.haussmannRow', pos: [-10, 2.4, 470], rot: 0, seed: 803, params: { bays: 12, floors: 6, depth: 14, palette: 5 } });
add({ type: 'common.birds', pos: [0, 0, 90], params: { count: 7, radius: 18, height: 24 } });
add({ type: 'common.birds', pos: [0, 0, 190], params: { count: 5, radius: 22, height: 30 } });

export const parisSeine: SpotDef = {
  id: 'paris_seine',
  cityId: 'france',
  name: { ru: 'Набережная Сены', en: 'Banks of the Seine' },
  blurb: {
    ru: 'Золотой час над рекой: каменные набережные, букинисты и железная башня вдали.',
    en: 'Golden hour on the river: stone quays, bookstalls and the iron tower in the distance.',
  },
  theme: 'france',
  env: {
    timeOfDay: 'golden',
    sunElevation: 17,
    sunAzimuth: 62,
    sunColor: 0xffc884,
    sunIntensity: 3.4,
    ambientIntensity: 0.85,
    turbidity: 7,
    rayleigh: 1.9,
    mieCoefficient: 0.008,
    mieDirectionalG: 0.84,
    exposure: 0.6,
    fogColor: 0xe6d3bd,
    fogNear: 110,
    fogFar: 640,
    waterShallow: 0x5c8a76,
    waterDeep: 0x1f3d38,
    waterClarity: 0.3,
    waveScale: 0.3,
    bloom: 0.3,
  },
  bounds: { min: [-22, -16], max: [22, 188] },
  base: { level: -1.6, surface: 'stone' },
  water: [{ id: 'river', shape: { kind: 'rect', center: [0, 225], size: [14, 480] }, level: 0, depth: 1.8, style: 'river' }],
  ground: [
    // lower quays (towpaths) with wide stepped banks
    { id: 'quay_left', center: [10.45, 80], size: [3.7, 190], top: 0.9, surface: 'stone', trim: 'granite' },
    { id: 'quay_right', center: [-9.65, 80], size: [5.3, 190], top: 0.9, surface: 'stone', trim: 'granite' },
    { id: 'step_left', center: [7.8, 80], size: [1.6, 190], top: 0.45, surface: 'stone', trim: 'none' },
    // upper street level (road + pavement above the quay wall)
    { id: 'street_left', center: [17.65, 80], size: [10.7, 190], top: 2.4, surface: 'stone', trim: 'granite' },
    { id: 'street_right', center: [-17.65, 80], size: [10.7, 190], top: 2.4, surface: 'stone', trim: 'granite' },
    // far river banks (visual only, beyond the playable bounds)
    { id: 'far_left', center: [9.65, 330], size: [5.3, 280], top: 0.9, surface: 'stone', trim: 'granite' },
    { id: 'far_right', center: [-9.65, 330], size: [5.3, 280], top: 0.9, surface: 'stone', trim: 'granite' },
    { id: 'far_street_left', center: [19.65, 330], size: [14.7, 280], top: 2.4, surface: 'stone', trim: 'none' },
    { id: 'far_street_right', center: [-19.65, 330], size: [14.7, 280], top: 2.4, surface: 'stone', trim: 'none' },
    { id: 'quay_end_l', center: [10.45, 182], size: [3.7, 14], top: 0.9, surface: 'stone', trim: 'granite' },
    { id: 'pontoon_end', center: [0, 181], size: [10, 8], top: 0.9, surface: 'stone', trim: 'granite' },
    { id: 'quay_start', center: [0, -20], size: [44, 10], top: 0.9, surface: 'stone', trim: 'granite' },
    // submerged stone sill across the river: slide over it or gap it
    { id: 'slab_gap', center: [0, 94.5], size: [14, 5], top: 0.12, surface: 'wetConcrete', trim: 'none' },
  ],
  obstacles: [
    { kind: 'kicker', id: 'kicker_main', name: { ru: 'Деревянный кикер', en: 'Quay wooden kicker' }, pos: [0, 0, 25], width: 2.6, length: 4.6, height: 1.3, curve: 0.55, style: 'wood' },
    {
      kind: 'rail',
      id: 'rail_iron',
      name: { ru: 'Железная ограда', en: 'Iron railing' },
      path: [
        [-3, 0.42, 42],
        [-3, 0.42, 55],
      ],
      style: 'round',
      radius: 0.05,
      material: 'steel',
      supports: 'posts',
    },
    { kind: 'kicker', id: 'kicker_crate', name: { ru: 'Кикер из ящиков', en: 'Crate kicker' }, pos: [3, 0, 63], width: 2.2, length: 3.2, height: 0.85, curve: 0.2, style: 'pallet' },
    { kind: 'ledge', id: 'ledge_stone', name: { ru: 'Каменный парапет', en: 'Stone ledge' }, pos: [3, 0, 74], size: [1.2, 0.55, 9], surface: 'stone', style: 'granite' },
    { kind: 'kicker', id: 'kicker_stone', name: { ru: 'Каменный кикер', en: 'Stone kicker' }, pos: [-1.5, 0, 86.5], width: 2.6, length: 4.2, height: 1.15, curve: 0.6, style: 'stone' },
    {
      kind: 'gap',
      id: 'gap_seine',
      name: { ru: 'Гэп через порог', en: 'Weir gap' },
      shape: { kind: 'rect', center: [0, 94.5], size: [14, 5] },
      points: 500,
    },
    {
      kind: 'wall',
      id: 'wall_quay',
      name: { ru: 'Стена набережной', en: 'Quay wall' },
      a: [-7, 0, 103],
      b: [-7, 0, 119],
      height: 3.2,
      lean: 10,
      surface: 'stone',
      style: 'granite',
    },
    {
      kind: 'rail',
      id: 'pipe_mooring',
      name: { ru: 'Швартовая труба', en: 'Mooring pipe' },
      path: [
        [2.2, 0.32, 107],
        [5, 0.32, 121],
      ],
      style: 'pipe',
      radius: 0.3,
      material: 'rust',
      supports: 'none',
    },
    { kind: 'stairs', id: 'stairs_steps', name: { ru: 'Каменные ступени с перилами', en: 'Stone steps & handrail' }, pos: [6, 0, 126], width: 1.9, steps: 6, stepH: 0.15, stepD: 0.45, handrail: 'right', railHeight: 0.8, surface: 'stone', wet: true },
    {
      kind: 'rail',
      id: 'rail_kink',
      name: { ru: 'Кованый кинк-рейл', en: 'Wrought-iron kink rail' },
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
    { kind: 'kicker', id: 'kicker_final', name: { ru: 'Финальный кикер', en: 'Finish kicker' }, pos: [2, 0, 152], width: 2.4, length: 4.2, height: 1.25, curve: 0.55, style: 'concrete' },
  ],
  props,
  winchPoints: [
    {
      id: 'main',
      name: { ru: 'Понтон в конце реки', en: 'End pontoon' },
      pos: [0, 0.9, 179],
      start: [0, 0, -2],
      difficulty: 1,
      hint: { ru: 'Прямая линия под мостом через все препятствия', en: 'Straight line under the bridge, all obstacles' },
    },
    {
      id: 'left',
      name: { ru: 'Левая набережная', en: 'Left quay' },
      pos: [9.5, 0.9, 150],
      start: [-4, 0, 0],
      difficulty: 2,
      hint: { ru: 'Диагональ: парапет, труба, ступени', en: 'Diagonal: ledge, pipe, steps' },
    },
    {
      id: 'right',
      name: { ru: 'У стены', en: 'By the wall' },
      pos: [-9.5, 0.9, 132],
      start: [4, 0, 0],
      difficulty: 3,
      hint: { ru: 'Короткая и злая: ограда, гэп, валлрайд', en: 'Short and mean: railing, gap, wallride' },
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
    { type: 'score', target: 11000 },
    { type: 'trick', trickId: 'tantrum' },
    { type: 'letters' },
    { type: 'line', obstacles: ['kicker_main', 'rail_iron', 'ledge_stone'], winch: 'main' },
    { type: 'clip', zone: 'gap_cam', minPoints: 1000 },
  ],
  unlockStars: 22,
  mapPos: [0.45, 0.58],
};
