import type { PropDef, SpotDef } from '../../types';

/**
 * PARIS — MONTMARTRE NIGHTS. Night spot: a flooded cobbled street between narrow lit houses,
 * café terraces, a windmill-style cabaret with red neon and the floodlit white-domed basilica
 * on the hill far behind. Left bank is stepped (tier at 0.45 m). Rider's left = +X.
 */

const props: PropDef[] = [];
const add = (p: PropDef): void => {
  props.push(p);
};

// narrow old houses, alternating banks (the cabaret replaces one row on the left)
for (let k = 0; k < 11; k++) {
  const zl = -6 + k * 18;
  const zr = 3 + k * 18;
  if (k !== 5) add({ type: 'france.montmartreRow', pos: [14.7, 0.9, zl], rot: -90, seed: 1000 + k, params: { bays: 4, floors: 4 + (k % 2), palette: k } });
  add({ type: 'france.montmartreRow', pos: [-14.7, 0.9, zr], rot: 90, seed: 1100 + k, params: { bays: 4, floors: 4 + ((k + 1) % 2), palette: k + 3 } });
}
add({ type: 'france.cabaret', pos: [14.7, 0.9, 84], rot: -90, seed: 7, params: { width: 15 } });
// beyond the end: more houses climbing the hill
[196, 214, 232, 250].forEach((z, i) => {
  add({ type: 'france.montmartreRow', pos: [14.7, 0.9 + i * 1.5, z], rot: -90, seed: 1200 + i, params: { bays: 4, floors: 5, palette: i } });
  add({ type: 'france.montmartreRow', pos: [-14.7, 0.9 + i * 1.5, z + 6], rot: 90, seed: 1300 + i, params: { bays: 4, floors: 5, palette: i + 2 } });
});

// café terraces with awnings, tables and string lights
[
  [14.7, -6, -90, 0],
  [14.7, 30, -90, 1],
  [14.7, 66, -90, 2],
  [14.7, 120, -90, 3],
  [14.7, 156, -90, 4],
  [-14.7, 21, 90, 5],
  [-14.7, 57, 90, 6],
  [-14.7, 93, 90, 7],
  [-14.7, 129, 90, 8],
  [-14.7, 165, 90, 9],
].forEach(([x, z, rot, i]) => {
  add({ type: 'france.cafe', pos: [x, 0.9, z], rot, seed: 1400 + i, params: { width: 9, awning: i % 3 } });
});
[14, 52, 96, 140, 172].forEach((z, i) => add({ type: 'france.stringLights', pos: [0, 0.9, z], seed: 1500 + i, params: { span: 25, count: 20, height: 7.4 } }));

// street lamps, artists' easels and flowers
for (let i = 0; i < 9; i++) {
  add({ type: 'france.lampPost', pos: [9.2, 0.9, 6 + i * 21], seed: 1600 + i, params: { glow: 1 } });
  add({ type: 'france.lampPost', pos: [-9.2, 0.9, 16 + i * 21], seed: 1620 + i, params: { glow: 1 } });
}
[10, 44, 78, 112, 146, 170].forEach((z, i) => add({ type: 'france.easels', pos: [11.8, 0.9, z], rot: -90, seed: 1700 + i, params: { count: 2 } }));
[28, 62, 100, 136].forEach((z, i) => add({ type: 'france.easels', pos: [-11.8, 0.9, z], rot: 90, seed: 1720 + i, params: { count: 2 } }));
[20, 60, 106, 150].forEach((z, i) => add({ type: 'common.potPlant', pos: [-11.2, 0.9, z], rot: 90, seed: 1800 + i, params: { kind: 'flower', count: 3, spacing: 1.3 } }));
[36, 90, 130].forEach((z, i) => add({ type: 'common.tree', pos: [-10.2, 0.9, z], seed: 1900 + i, params: { height: 7.5, crown: 2.8, tint: 0x4f7a3a } }));

// the hill and the white basilica far behind
add({ type: 'france.basilica', pos: [0, 26, 420], seed: 5, params: { scale: 1 } });
add({ type: 'common.birds', pos: [0, 0, 120], params: { count: 4, radius: 16, height: 22 } });

export const parisMontmartre: SpotDef = {
  id: 'paris_montmartre',
  cityId: 'france',
  name: { ru: 'Ночной Монмартр', en: 'Montmartre Nights' },
  blurb: {
    ru: 'Затопленная мощёная улочка, кафе с гирляндами, красный неон кабаре и белая базилика на холме.',
    en: 'A flooded cobbled lane, café string lights, red cabaret neon and the white basilica on the hill.',
  },
  theme: 'france',
  env: {
    timeOfDay: 'night',
    sunElevation: 32,
    sunAzimuth: 200,
    sunColor: 0x8fa6ff,
    sunIntensity: 0.55,
    ambientIntensity: 0.6,
    turbidity: 3,
    rayleigh: 0.6,
    exposure: 1.15,
    fogColor: 0x0d1226,
    fogNear: 70,
    fogFar: 720,
    waterShallow: 0x2b4568,
    waterDeep: 0x080c1e,
    waterClarity: 0.35,
    waveScale: 0.25,
    bloom: 1.0,
    neon: true,
    stars: true,
  },
  bounds: { min: [-22, -16], max: [22, 188] },
  base: { level: -1.6, surface: 'stone' },
  water: [{ id: 'street', shape: { kind: 'rect', center: [0, 80], size: [14, 190] }, level: 0, depth: 1.4, style: 'flood' }],
  ground: [
    // stepped left bank: a 0.45 m tier along the water, then the pavement
    { id: 'tier_left', center: [7.8, 80], size: [1.6, 190], top: 0.45, surface: 'stone', trim: 'none' },
    { id: 'quay_left', center: [15.3, 80], size: [13.4, 190], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'quay_right', center: [-14.5, 80], size: [15, 190], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'quay_end', center: [0, 182], size: [44, 14], top: 0.9, surface: 'stone', trim: 'kerb' },
    { id: 'quay_start', center: [0, -20], size: [44, 10], top: 0.9, surface: 'stone', trim: 'kerb' },
    // the cobbles rise out of the flood: wet slab across the street
    { id: 'slab_gap', center: [0, 94.5], size: [14, 5], top: 0.12, surface: 'wetConcrete', trim: 'none' },
  ],
  obstacles: [
    { kind: 'kicker', id: 'kicker_cart', name: { ru: 'Деревянная тележка', en: 'Wooden cart kicker' }, pos: [0, 0, 25], width: 2.6, length: 4.6, height: 1.3, curve: 0.55, style: 'wood' },
    {
      kind: 'rail',
      id: 'rail_neon',
      name: { ru: 'Неоновый рейл', en: 'Neon rail' },
      path: [
        [-3, 0.42, 42],
        [-3, 0.42, 55],
      ],
      style: 'round',
      radius: 0.05,
      material: 'neon',
      supports: 'posts',
    },
    { kind: 'kicker', id: 'kicker_crates', name: { ru: 'Кикер из ящиков', en: 'Wine-crate kicker' }, pos: [3, 0, 63], width: 2.2, length: 3.2, height: 0.85, curve: 0.2, style: 'pallet' },
    { kind: 'ledge', id: 'ledge_planter', name: { ru: 'Каменная клумба', en: 'Stone planter ledge' }, pos: [3, 0, 74], size: [1.2, 0.55, 9], surface: 'stone', style: 'planter' },
    { kind: 'kicker', id: 'kicker_cobble', name: { ru: 'Булыжный кикер', en: 'Cobble kicker' }, pos: [-1.5, 0, 86.5], width: 2.6, length: 4.2, height: 1.15, curve: 0.6, style: 'stone' },
    {
      kind: 'gap',
      id: 'gap_montmartre',
      name: { ru: 'Гэп Монмартра', en: 'Montmartre Gap' },
      shape: { kind: 'rect', center: [0, 94.5], size: [14, 5] },
      points: 500,
    },
    {
      kind: 'wall',
      id: 'wall_brick',
      name: { ru: 'Кирпичная стена', en: 'Old brick wall' },
      a: [-7, 0, 103],
      b: [-7, 0, 119],
      height: 3.2,
      lean: 12,
      surface: 'concrete',
      style: 'brick',
    },
    {
      kind: 'rail',
      id: 'pipe_gutter',
      name: { ru: 'Водосточная труба', en: 'Gutter pipe' },
      path: [
        [2.2, 0.32, 107],
        [5, 0.32, 121],
      ],
      style: 'pipe',
      radius: 0.3,
      material: 'rust',
      supports: 'none',
    },
    { kind: 'stairs', id: 'stairs_hill', name: { ru: 'Крутая лестница с поручнем', en: 'Steep stairs & centre rail' }, pos: [5.9, 0, 126], width: 2.0, steps: 6, stepH: 0.15, stepD: 0.45, handrail: 'center', railHeight: 0.8, surface: 'stone', wet: true },
    {
      kind: 'rail',
      id: 'rail_kink',
      name: { ru: 'Кованый кинк-рейл', en: 'Wrought kink rail' },
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
      name: { ru: 'Конец улицы', en: 'Top of the street' },
      pos: [0, 0.9, 177],
      start: [0, 0, -2],
      difficulty: 1,
      hint: { ru: 'Прямая линия по залитой улице', en: 'Straight line up the flooded street' },
    },
    {
      id: 'left',
      name: { ru: 'Ступенчатый берег', en: 'Stepped bank' },
      pos: [9.5, 0.9, 150],
      start: [-4, 0, 0],
      difficulty: 2,
      hint: { ru: 'Диагональ: клумба, труба, лестница', en: 'Diagonal: planter, pipe, stairs' },
    },
    {
      id: 'right',
      name: { ru: 'У кирпичной стены', en: 'By the brick wall' },
      pos: [-9.5, 0.9, 132],
      start: [4, 0, 0],
      difficulty: 3,
      hint: { ru: 'Короткая и злая: неон, гэп, валлрайд', en: 'Short and mean: neon rail, gap, wallride' },
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
  filmerZones: [{ id: 'cabaret_cam', pos: [9.2, 0.9, 89], center: [0, 93], radius: 13 }],
  goals: [
    { type: 'score', target: 12000 },
    { type: 'trick', trickId: 'spin540' },
    { type: 'letters' },
    { type: 'line', obstacles: ['kicker_cart', 'rail_neon', 'ledge_planter'], winch: 'main' },
    { type: 'clip', zone: 'cabaret_cam', minPoints: 1100 },
  ],
  unlockStars: 25,
  mapPos: [0.55, 0.32],
};
