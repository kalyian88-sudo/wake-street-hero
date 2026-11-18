import type { PropDef, SpotDef } from '../../types';

/**
 * VENICE — CANAL (rio). Golden hour, a 14 m wide rio between palazzi, stone footbridge near the start,
 * mooring poles and moored gondolas along the edges, campanile far behind.
 * Rider's left = +X, right = −X.
 */

const palazzi: PropDef[] = [];
{
  // rows: a short one before the bridge gap (z 7.5..12.5) and a chain after it
  const centres = [-0.9];
  for (let z = 20.9; z < 175; z += 16.8) centres.push(Math.round(z * 10) / 10);
  centres.forEach((z, i) => {
    palazzi.push({ type: 'italy.palazzoRow', pos: [8.7, 0.9, z], rot: -90, seed: 10 + i, params: { bays: 3, floors: 3 } });
    palazzi.push({ type: 'italy.palazzoRow', pos: [-8.7, 0.9, z], rot: 90, seed: 60 + i, params: { bays: 3, floors: 3 } });
  });
}

export const veniceCanal: SpotDef = {
  id: 'venice_canal',
  cityId: 'italy',
  name: { ru: 'Канал в Венеции', en: 'Venice Canal' },
  blurb: {
    ru: 'Узкий рио между палаццо, полосатые швартовые столбы и чёрные гондолы. Золотой час.',
    en: 'A narrow rio between palazzi, striped mooring poles and black gondolas. Golden hour.',
  },
  theme: 'italy',
  env: {
    timeOfDay: 'golden',
    sunElevation: 15,
    sunAzimuth: 78,
    sunColor: 0xffc58a,
    sunIntensity: 3.4,
    ambientIntensity: 0.85,
    turbidity: 7,
    rayleigh: 1.8,
    mieCoefficient: 0.008,
    mieDirectionalG: 0.84,
    exposure: 0.66,
    fogColor: 0xf2cfa6,
    fogNear: 80,
    fogFar: 430,
    waterShallow: 0x4fa396,
    waterDeep: 0x143e40,
    waterClarity: 0.3,
    waveScale: 0.3,
    bloom: 0.32,
  },
  bounds: { min: [-22, -16], max: [22, 188] },
  base: { level: -1.6, surface: 'concrete' },
  water: [
    { id: 'rio', shape: { kind: 'rect', center: [0, 80], size: [14, 190] }, level: 0, depth: 1.6, style: 'canal' },
  ],
  ground: [
    { id: 'fond_left', center: [14.5, 80], size: [15, 190], top: 0.9, surface: 'stone', trim: 'granite' },
    { id: 'fond_right', center: [-14.5, 80], size: [15, 190], top: 0.9, surface: 'stone', trim: 'granite' },
    { id: 'quay_end', center: [0, 188], size: [44, 26], top: 0.9, surface: 'stone', trim: 'granite' },
    { id: 'quay_start', center: [0, -20], size: [44, 10], top: 0.9, surface: 'stone', trim: 'granite' },
    // low submerged stone step across the rio: slide over it, or gap it from the kicker
    { id: 'slab_gap', center: [0, 94.5], size: [14, 5], top: 0.12, surface: 'stone', trim: 'none' },
  ],
  obstacles: [
    { kind: 'kicker', id: 'kicker_deck', name: { ru: 'Деревянный кикер', en: 'Wooden kicker' }, pos: [0, 0, 25], width: 2.6, length: 4.6, height: 1.3, curve: 0.55, style: 'wood' },
    {
      kind: 'rail',
      id: 'rail_pali',
      name: { ru: 'Рейл на швартовых столбах', en: 'Mooring-pole rail' },
      path: [
        [-3, 0.42, 42],
        [-3, 0.42, 55],
      ],
      style: 'round',
      radius: 0.05,
      material: 'steel',
      supports: 'posts',
    },
    { kind: 'kicker', id: 'kicker_barge', name: { ru: 'Кикер из поддонов', en: 'Pallet kicker' }, pos: [3, 0, 63], width: 2.2, length: 3.2, height: 0.85, curve: 0.2, style: 'pallet' },
    { kind: 'ledge', id: 'ledge_fond', name: { ru: 'Каменный ледж фондаменты', en: 'Fondamenta stone ledge' }, pos: [3, 0, 74], size: [1.2, 0.55, 9], surface: 'stone', style: 'granite' },
    { kind: 'kicker', id: 'kicker_ponte', name: { ru: 'Каменный кикер', en: 'Stone kicker' }, pos: [-1.5, 0, 86.5], width: 2.6, length: 4.2, height: 1.15, curve: 0.6, style: 'stone' },
    {
      kind: 'gap',
      id: 'gap_rialto',
      name: { ru: 'Гэп Риальто', en: 'Rialto Gap' },
      shape: { kind: 'rect', center: [0, 94.5], size: [14, 5] },
      points: 500,
    },
    {
      kind: 'wall',
      id: 'wall_palazzo',
      name: { ru: 'Стена палаццо', en: 'Palazzo wall' },
      a: [-7, 0, 103],
      b: [-7, 0, 119],
      height: 3.2,
      lean: 12,
      surface: 'stone',
      style: 'plaster',
    },
    {
      kind: 'rail',
      id: 'pipe_drain',
      name: { ru: 'Свинцовая труба', en: 'Lead drain pipe' },
      path: [
        [2.2, 0.32, 107],
        [5, 0.32, 121],
      ],
      style: 'pipe',
      radius: 0.3,
      material: 'concrete',
      supports: 'none',
    },
    { kind: 'stairs', id: 'stairs_water', name: { ru: 'Водные ступени с перилами', en: 'Water steps & handrail' }, pos: [6.1, 0, 126], width: 1.7, steps: 6, stepH: 0.15, stepD: 0.45, handrail: 'right', railHeight: 0.8, surface: 'stone', wet: true },
    {
      kind: 'rail',
      id: 'rail_balcony',
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
    { kind: 'kicker', id: 'kicker_final', name: { ru: 'Финальный кикер WHY NOT', en: 'WHY NOT finish kicker' }, pos: [2, 0, 152], width: 2.4, length: 4.2, height: 1.25, curve: 0.55, style: 'plastic' },
  ],
  props: [
    ...palazzi,
    // closing palazzo at the dead end of the rio
    { type: 'italy.palazzoRow', pos: [0, 0.9, 186], rot: 180, seed: 5, params: { bays: 5, floors: 3, palette: 1 } },
    // stone footbridge near the start (clearance 4.4 m)
    { type: 'italy.footbridge', pos: [0, 0, 10], seed: 1, params: { span: 16.8, width: 3.6 } },
    // moored gondolas along the edges (not in the line)
    { type: 'italy.gondola', pos: [6.1, 0, 18], seed: 1 },
    { type: 'italy.gondola', pos: [6.1, 0, 45], seed: 2 },
    { type: 'italy.gondola', pos: [6.1, 0, 80], seed: 3 },
    { type: 'italy.gondola', pos: [6.1, 0, 162], seed: 4 },
    { type: 'italy.gondola', pos: [-6.1, 0, 31], rot: 180, seed: 5 },
    { type: 'italy.gondola', pos: [-6.1, 0, 64], rot: 180, seed: 6 },
    { type: 'italy.gondola', pos: [-6.1, 0, 143], rot: 180, seed: 7 },
    { type: 'italy.gondola', pos: [-6.1, 0, 168], rot: 180, seed: 8 },
    // striped mooring poles
    { type: 'italy.poleCluster', pos: [6.6, 0, 3], seed: 1, params: { count: 3 } },
    { type: 'italy.poleCluster', pos: [-6.6, 0, 16], seed: 2, params: { count: 2 } },
    { type: 'italy.poleCluster', pos: [6.6, 0, 33], seed: 3, params: { count: 3 } },
    { type: 'italy.poleCluster', pos: [-4.4, 0, 41], seed: 4, params: { count: 1 } },
    { type: 'italy.poleCluster', pos: [-4.4, 0, 56], seed: 5, params: { count: 1 } },
    { type: 'italy.poleCluster', pos: [6.6, 0, 58], seed: 6, params: { count: 2 } },
    { type: 'italy.poleCluster', pos: [-6.6, 0, 82], seed: 7, params: { count: 3 } },
    { type: 'italy.poleCluster', pos: [6.6, 0, 99], seed: 8, params: { count: 3 } },
    { type: 'italy.poleCluster', pos: [-6.6, 0, 125], seed: 9, params: { count: 2 } },
    { type: 'italy.poleCluster', pos: [6.6, 0, 133], seed: 10, params: { count: 3 } },
    { type: 'italy.poleCluster', pos: [-6.6, 0, 155], seed: 11, params: { count: 3 } },
    { type: 'italy.poleCluster', pos: [6.6, 0, 150], seed: 12, params: { count: 2 } },
    // fondamenta details
    { type: 'italy.lampPost', pos: [7.7, 0.9, 25], rot: 0, seed: 1, params: { height: 4.2 } },
    { type: 'italy.lampPost', pos: [-7.7, 0.9, 60], seed: 2, params: { height: 4.2 } },
    { type: 'italy.lampPost', pos: [7.7, 0.9, 96], seed: 3, params: { height: 4.2 } },
    { type: 'italy.lampPost', pos: [-7.7, 0.9, 135], seed: 4, params: { height: 4.2 } },
    { type: 'italy.lampPost', pos: [7.7, 0.9, 165], seed: 5, params: { height: 4.2 } },
    { type: 'common.potPlant', pos: [8.1, 0.9, 30], rot: -90, seed: 120, params: { kind: 'flower', count: 3, spacing: 1.2 } },
    { type: 'common.potPlant', pos: [-8.1, 0.9, 48], rot: 90, seed: 130, params: { kind: 'bush', count: 2, spacing: 1.3 } },
    { type: 'common.potPlant', pos: [8.1, 0.9, 70], rot: -90, seed: 121, params: { kind: 'flower', count: 3, spacing: 1.2 } },
    { type: 'common.potPlant', pos: [-8.1, 0.9, 90], rot: 90, seed: 131, params: { kind: 'flower', count: 3, spacing: 1.2 } },
    { type: 'common.potPlant', pos: [8.1, 0.9, 118], rot: -90, seed: 122, params: { kind: 'bush', count: 2, spacing: 1.3 } },
    { type: 'common.potPlant', pos: [-8.1, 0.9, 150], rot: 90, seed: 132, params: { kind: 'flower', count: 3, spacing: 1.2 } },
    // the landmark: brick campanile with a pointed green spire, far behind the line
    { type: 'italy.campanile', pos: [-4, 0, 262], seed: 1, params: { height: 66, width: 9.5 } },
    { type: 'italy.campanile', pos: [58, 0, 330], seed: 2, params: { height: 38, width: 7 } },
    { type: 'common.birds', pos: [0, 0, 90], params: { count: 8, radius: 18, height: 22 } },
  ],
  winchPoints: [
    {
      id: 'main',
      name: { ru: 'Конец рио', en: 'End of the rio' },
      pos: [0, 0.9, 177],
      start: [0, 0, -11],
      difficulty: 1,
      hint: { ru: 'Прямая линия через все препятствия', en: 'Straight line through everything' },
    },
    {
      id: 'left',
      name: { ru: 'Левая фондамента', en: 'Left fondamenta' },
      pos: [9.5, 0.9, 150],
      start: [-4, 0, -9],
      difficulty: 2,
      hint: { ru: 'Диагональ: ледж, труба, ступени', en: 'Diagonal: ledge, pipe, steps' },
    },
    {
      id: 'right',
      name: { ru: 'У стены палаццо', en: 'By the palazzo wall' },
      pos: [-9.5, 0.9, 132],
      start: [4, 0, -9],
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
    { type: 'score', target: 13000 },
    { type: 'trick', trickId: 'frontroll' },
    { type: 'letters' },
    { type: 'line', obstacles: ['kicker_deck', 'rail_pali', 'ledge_fond'], winch: 'main' },
    { type: 'clip', zone: 'gap_cam', minPoints: 1000 },
  ],
  unlockStars: 38,
  mapPos: [0.4, 0.42],
};
