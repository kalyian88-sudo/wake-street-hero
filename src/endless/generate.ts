/**
 * ENDLESS CANAL — procedural stages.
 *
 * A stage is an ordinary SpotDef (so physics, world builder, scoring, replay all just work):
 *  - the canal, quays and decor are borrowed from a country spot and tiled `TILES` times along +Z
 *    (every spot in src/data/spots is authored on the same template: canal from z −15 to 175);
 *  - the obstacles are generated on three lanes from a seeded RNG, getting denser stage by stage;
 *  - the winch waits at the end; reaching it clears the stage and the next country follows.
 */
import { seededRng } from '../data/geometry';
import { findSpot } from '../data/spots';
import type { GroundDef, L10n, LetterDef, ObstacleDef, PropDef, SpotDef } from '../types';

/** Country spot whose canal, decor and light each stage borrows, in tour order. */
export const ENDLESS_ROUTE: readonly string[] = [
  'phuket_oldtown',
  'miami_wynwood',
  'hamburg_speicher',
  'paris_seine',
  'amsterdam_grachten',
  'venice_canal',
  'bangkok_klong',
  'brooklyn_docks',
  'berlin_spree',
  'paris_montmartre',
  'rotterdam_haven',
  'venice_sanmarco',
];

const TILE = 190;
const TILE_Z0 = -15;
const TILES = 3;
const LANES = [-3.5, 0, 3.5] as const;

export interface EndlessStageInfo {
  stage: number;
  /** Spot the decor comes from. */
  sourceId: string;
  length: number;
}

export function endlessSourceFor(stage: number): string {
  return ENDLESS_ROUTE[stage % ENDLESS_ROUTE.length];
}

export function endlessSpotId(seed: number, stage: number): string {
  return `endless_${seed.toString(36)}_${stage}`;
}

export function generateEndlessStage(seed: number, stage: number): SpotDef {
  const src = findSpot(endlessSourceFor(stage)) ?? findSpot('phuket_oldtown');
  if (!src) throw new Error('endless: no source spot');
  const rng = seededRng((seed ^ Math.imul(stage + 1, 0x9e3779b1)) >>> 0);
  const pick = <T,>(a: readonly T[]): T => a[Math.min(a.length - 1, Math.floor(rng() * a.length))];
  const length = TILE * TILES;
  const zEnd = TILE_Z0 + length; // end of the canal

  // ── canal: width from the source's main water, quay height from its long banks ──
  const mainWater = src.water.reduce((a, w) => (w.shape.kind === 'rect' && a.shape.kind === 'rect' && w.shape.size[0] * w.shape.size[1] > a.shape.size[0] * a.shape.size[1] ? w : a), src.water[0]);
  const width = mainWater.shape.kind === 'rect' ? Math.min(18, Math.max(12, mainWater.shape.size[0])) : 14;
  const long = src.ground.filter((g) => g.size[1] >= 180 && Math.abs(g.rot ?? 0) < 1);
  const quayTop = long.length ? Math.max(...long.map((g) => g.top)) : 0.9;

  const ground: GroundDef[] = [];
  for (let k = 0; k < TILES; k++) {
    for (const g of long) {
      // keep the source's banks only outside our canal (Saint-Mark's piazza is wider than our lanes)
      const inner = Math.abs(g.center[0]) - g.size[0] / 2;
      if (inner < width / 2 - 0.05 && Math.abs(g.center[0]) < width / 2) continue;
      ground.push({ ...g, id: `${g.id}_${k}`, center: [g.center[0], g.center[1] + k * TILE] });
    }
  }
  if (!ground.some((g) => g.center[0] > 0)) ground.push({ id: 'bank_l', center: [width / 2 + 8, TILE_Z0 + length / 2], size: [16, length], top: quayTop, surface: 'stone', trim: 'kerb' });
  if (!ground.some((g) => g.center[0] < 0)) ground.push({ id: 'bank_r', center: [-width / 2 - 8, TILE_Z0 + length / 2], size: [16, length], top: quayTop, surface: 'stone', trim: 'kerb' });
  ground.push({ id: 'quay_start', center: [0, TILE_Z0 - 5], size: [width + 40, 10], top: quayTop, surface: 'stone', trim: 'kerb' });
  ground.push({ id: 'quay_end', center: [0, zEnd + 8], size: [width + 40, 16], top: quayTop, surface: 'stone', trim: 'kerb' });

  // ── decor: tile the source props; landmarks (outside the template) once, pushed to the far end ──
  const props: PropDef[] = [];
  for (const p of src.props) {
    const z = p.pos[2];
    if (z >= TILE_Z0 && z < TILE_Z0 + TILE) {
      for (let k = 0; k < TILES; k++) props.push({ ...p, pos: [p.pos[0], p.pos[1], z + k * TILE], seed: (p.seed ?? 1) + k * 101 });
    } else if (z >= TILE_Z0 + TILE) {
      props.push({ ...p, pos: [p.pos[0], p.pos[1], z + (TILES - 1) * TILE] });
    }
  }

  // ── obstacles on three lanes ──
  const obstacles: ObstacleDef[] = [];
  const letters: LetterDef[] = [];
  const density = Math.min(1, 0.55 + stage * 0.08);
  let z = 26;
  let n = 0;
  const lanePos: number[] = [];
  const name = (ru: string, en: string): L10n => ({ ru, en });
  while (z < zEnd - 45) {
    const lane = pick(LANES);
    const kind = rng();
    const id = (k: string): string => `${k}_${n}`;
    if (kind < 0.3) {
      obstacles.push({ kind: 'kicker', id: id('kicker'), name: name('Кикер', 'Kicker'), pos: [lane, 0, z], width: 2.4, length: 4.2, height: 1.1 + rng() * 0.35, curve: 0.55, style: pick(['wood', 'pallet', 'concrete', 'plastic'] as const) });
      lanePos.push(lane);
      z += 6;
    } else if (kind < 0.55) {
      const len = 9 + Math.floor(rng() * 6);
      const kink = rng() < 0.3;
      const path: [number, number, number][] = kink
        ? [
            [lane, 0.42, z],
            [lane, 0.9, z + len * 0.35],
            [lane, 0.9, z + len * 0.7],
            [lane, 0.42, z + len],
          ]
        : [
            [lane, 0.42, z],
            [lane, 0.42, z + len],
          ];
      obstacles.push({ kind: 'rail', id: id('rail'), name: name('Рейл', 'Rail'), path, style: kink ? 'kink' : 'round', radius: 0.05, material: pick(['steel', 'brandRed', 'rust'] as const), supports: 'posts' });
      lanePos.push(lane);
      z += len;
    } else if (kind < 0.72) {
      const len = 8 + Math.floor(rng() * 4);
      obstacles.push({ kind: 'ledge', id: id('ledge'), name: name('Ледж', 'Ledge'), pos: [lane, 0, z + len / 2], size: [1.1, 0.5, len], surface: 'concrete', style: 'concrete' });
      lanePos.push(lane);
      z += len;
    } else if (kind < 0.84) {
      const len = 10 + Math.floor(rng() * 4);
      obstacles.push({ kind: 'rail', id: id('pipe'), name: name('Труба', 'Pipe'), path: [[lane, 0.3, z], [lane, 0.3, z + len]], style: 'pipe', radius: 0.28, material: 'pvc', supports: 'none' });
      lanePos.push(lane);
      z += len;
    } else {
      // kicker → a low wet slab across the canal → named gap
      obstacles.push({ kind: 'kicker', id: id('kicker'), name: name('Кикер на гэп', 'Gap kicker'), pos: [lane, 0, z], width: 2.6, length: 4.2, height: 1.2, curve: 0.6, style: 'concrete' });
      ground.push({ id: id('slab'), center: [0, z + 9], size: [width, 4.5], top: 0.12, surface: 'wetConcrete', trim: 'none' });
      obstacles.push({ kind: 'gap', id: id('gap'), name: name('Гэп', 'Gap'), shape: { kind: 'rect', center: [0, z + 9], size: [width, 4.5] }, points: 400 + stage * 50 });
      lanePos.push(lane);
      z += 14;
    }
    n++;
    z += (30 - 14 * density) * (0.75 + rng() * 0.5);
  }
  // six letters spread over the stage, above the obstacles' lanes
  for (let i = 0; i < 6; i++) {
    const zl = 40 + ((zEnd - 100) * (i + 0.5)) / 6;
    letters.push({ index: i, pos: [pick(LANES), 1.9 + rng() * 0.6, zl] });
  }
  const firstTwo = obstacles.filter((o) => o.kind !== 'gap').slice(0, 2).map((o) => o.id);

  return {
    id: endlessSpotId(seed, stage),
    cityId: src.cityId,
    name: { ru: `Бесконечный канал · ${src.name.ru}`, en: `Endless Canal · ${src.name.en}` },
    blurb: src.blurb,
    theme: src.theme,
    env: src.env,
    bounds: { min: [-width / 2 - 14, TILE_Z0 - 2], max: [width / 2 + 14, zEnd + 14] },
    base: src.base,
    water: [{ id: 'canal', shape: { kind: 'rect', center: [0, TILE_Z0 + length / 2], size: [width, length] }, level: 0, depth: 1.6, style: mainWater.style ?? 'canal', tint: mainWater.tint }],
    ground,
    obstacles,
    props,
    winchPoints: [{ id: 'main', name: { ru: 'Конец этапа', en: 'Stage end' }, pos: [0, quayTop, zEnd + 4], start: [0, 0, TILE_Z0 + 13], difficulty: 1 }],
    letters,
    filmerZones: [{ id: 'cam', pos: [width / 2 + 2, quayTop, length / 2], center: [0, length / 2], radius: 14 }],
    goals: [
      { type: 'score', target: 5000 },
      { type: 'trick', trickId: 'spin360' },
      { type: 'letters' },
      { type: 'line', obstacles: firstTwo.length ? firstTwo : [obstacles[0]?.id ?? 'none'], winch: 'main' },
      { type: 'clip', zone: 'cam', minPoints: 600 },
    ],
    unlockStars: 0,
    mapPos: [0.5, 0.5],
    music: src.music,
  };
}
