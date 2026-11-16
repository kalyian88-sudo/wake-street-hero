/**
 * DATA CONTRACTS — everything that is described "by data" (spots, gear, tricks, cities, saves).
 *
 * CONVENTIONS (the whole code base follows these — see docs/PLAN.md §Conventions):
 *  - Right-handed, Y up, metres, seconds. Water level of a "normal" canal is y = 0.
 *  - Model/obstacle "forward" is local +Z. Yaw θ (rotation about +Y) maps forward to (sin θ, 0, cos θ).
 *    Positive yaw = turning LEFT (towards +X) when looking along +Z.
 *  - Spots are laid out so the typical line runs towards +Z (start at low z, winch at high z).
 *    Looking along +Z the rider's LEFT is +X and RIGHT is −X.
 *  - All `rot` fields in data are DEGREES of yaw. Runtime code uses radians.
 *  - Colours in data are 0xRRGGBB numbers.
 */

export type Lang = 'ru' | 'en';
/** Localised text used in data files. */
export interface L10n {
  ru: string;
  en: string;
}

export type BoardKind = 'wakeboard' | 'wakeskate';
export type Stance = 'regular' | 'goofy';
export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityLevel;
export type PowerLevel = 'slow' | 'medium' | 'fast';

/** Horizontal point [x, z]. */
export type V2 = readonly [number, number];
/** World point [x, y, z]. */
export type V3 = readonly [number, number, number];

export type SurfaceKind =
  | 'water'
  | 'concrete'
  | 'wetConcrete'
  | 'stone'
  | 'wood'
  | 'grass'
  | 'tile'
  | 'asphalt'
  | 'metal'
  | 'sand';

// ───────────────────────────────────────────────────────────── Environment ──

export interface EnvDef {
  timeOfDay: 'day' | 'golden' | 'sunset' | 'night' | 'overcast';
  /** Degrees above the horizon (at night: the moon). */
  sunElevation: number;
  /** Degrees of yaw of the direction TOWARDS the sun (0 = sun is in the +Z direction, 90 = +X). */
  sunAzimuth: number;
  sunColor: number;
  sunIntensity: number;
  /** Multiplier for image based / hemisphere ambient light. */
  ambientIntensity: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient?: number;
  mieDirectionalG?: number;
  /** Tone-mapping exposure. */
  exposure: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  waterShallow: number;
  waterDeep: number;
  /** 0 = murky canal, 1 = clear pool. */
  waterClarity?: number;
  /** 0 = glassy, 1 = choppy. */
  waveScale?: number;
  /** Bloom strength 0..1.5 (night neon spots use ~1). */
  bloom: number;
  /** Night spot with neon accents / practical lights. */
  neon?: boolean;
  stars?: boolean;
}

// ───────────────────────────────────────────────────────────────── Spots ──

/** Oriented rectangle or polygon footprint in the XZ plane. */
export type Footprint =
  | { kind: 'rect'; center: V2; size: V2; rot?: number }
  | { kind: 'poly'; points: V2[] };

export interface WaterRegionDef {
  id: string;
  shape: Footprint;
  /** Water surface height. */
  level: number;
  /** Depth of the basin below the surface (visual only). Default 1.5. */
  depth?: number;
  /** Optional per-region tint override (pool, fountain). */
  tint?: number;
  /** Visual style hint for the bottom/edges. */
  style?: 'canal' | 'pool' | 'fountain' | 'flood' | 'paddy' | 'river';
}

/**
 * Solid box (bank, quay, slab, step, flooded-street island…). Physical AND visual:
 * the world builder renders it with the material of `surface` unless `visible === false`.
 * Top face is at `top`, the box extends down to `bottom` (default top − 3).
 */
export interface GroundDef {
  id: string;
  center: V2;
  size: V2;
  rot?: number;
  top: number;
  bottom?: number;
  surface: SurfaceKind;
  visible?: boolean;
  /** Visual trim hint: granite parapet edge, pool coping, kerb… (world builder interprets). */
  trim?: 'none' | 'granite' | 'coping' | 'kerb' | 'brick' | 'bamboo';
}

interface ObstacleBase {
  id: string;
  /** Optional display name (used in "line" goal descriptions). */
  name?: L10n;
}

/**
 * Grindable line. `path` is the CENTRE line of the tube/edge; the grind line is path + (0, radius, 0).
 * `style: 'pipe'` with radius ≥ 0.15 is a fat pipe (wider snap tolerance, easier balance).
 */
export interface RailDef extends ObstacleBase {
  kind: 'rail';
  path: V3[];
  style: 'round' | 'flat' | 'kink' | 'bamboo' | 'handrail' | 'pipe' | 'edge';
  /** Tube radius (default 0.04; pipes 0.15–0.5). */
  radius?: number;
  material?: 'steel' | 'brandRed' | 'bamboo' | 'stone' | 'pvc' | 'concrete' | 'rust' | 'neon';
  /** How the rail is held up (visual only). */
  supports?: 'posts' | 'none' | 'wall';
}

/**
 * Box you can slide on top of and grind along its long (local Z) top edges.
 * `pos` = centre of the BASE, `size` = [width (local X), height (Y), length (local Z)].
 */
export interface LedgeDef extends ObstacleBase {
  kind: 'ledge';
  pos: V3;
  size: V3;
  rot?: number;
  surface: SurfaceKind;
  style?: 'granite' | 'concrete' | 'marble' | 'wood' | 'bamboo' | 'brick' | 'planter';
}

/**
 * Launch ramp. `pos` = centre of the ENTRY edge at base level; the ramp rises along local +Z
 * (rotated by `rot`). Height at normalised distance t = z/length is
 *   height * kickerProfile(curve, t)      — see src/data/geometry.ts
 */
export interface KickerDef extends ObstacleBase {
  kind: 'kicker';
  pos: V3;
  rot?: number;
  width: number;
  length: number;
  height: number;
  /** 0 = flat incline … 1 = full curved transition. Default 0.5. */
  curve?: number;
  style: 'wood' | 'pallet' | 'concrete' | 'plastic' | 'bank' | 'stone';
}

/**
 * Wallride surface. Base line runs a → b; the rideable face is on the LEFT of the a→b direction
 * (normal = normalize((b−a).z, 0, −(b−a).x)). `lean` tilts the wall back (0 = vertical).
 */
export interface WallDef extends ObstacleBase {
  kind: 'wall';
  a: V3;
  b: V3;
  height: number;
  lean?: number;
  surface: SurfaceKind;
  style?: 'canal' | 'brick' | 'graffiti' | 'granite' | 'container' | 'plaster';
}

/**
 * Flight of stairs. `pos` = centre of the bottom edge of the first riser (lower level);
 * the stairs climb along local +Z. Generates step colliders and optional grindable handrails
 * (see stairsLayout() in src/data/geometry.ts).
 */
export interface StairsDef extends ObstacleBase {
  kind: 'stairs';
  pos: V3;
  rot?: number;
  width: number;
  steps: number;
  stepH: number;
  stepD: number;
  handrail: 'left' | 'right' | 'both' | 'center' | 'none';
  /** Height of the handrail above the step nosing line. Default 0.85. */
  railHeight?: number;
  surface: SurfaceKind;
  /** Water running down the steps (visual + slippery). */
  wet?: boolean;
}

/**
 * Named gap: a bonus is awarded when the rider's track crosses this footprint entirely in the air
 * (took off before entering, touched down after leaving).
 */
export interface GapDef extends ObstacleBase {
  kind: 'gap';
  name: L10n;
  shape: Footprint;
  points: number;
}

export type ObstacleDef = RailDef | LedgeDef | KickerDef | WallDef | StairsDef | GapDef;
export type ObstacleKind = ObstacleDef['kind'];

/** Decorative prop — resolved through the prop registry (src/world/props/registry.ts). */
export interface PropDef {
  /** Registered builder id, e.g. 'common.palm', 'phuket.shophouseRow', 'ams.bike'. */
  type: string;
  pos: V3;
  rot?: number;
  scale?: number;
  seed?: number;
  params?: Record<string, number | string | boolean | readonly number[]>;
}

export interface WinchPointDef {
  id: string;
  name: L10n;
  /** Where the winch stands (on a bank / quay). */
  pos: V3;
  /** Where the rider starts (on water). */
  start: V3;
  /** 1..3 — shown on the spot card. */
  difficulty: number;
  /** One-line description of the line through the obstacles. */
  hint?: L10n;
}

export interface LetterDef {
  /** 0..5 → W-H-Y-N-O-T */
  index: number;
  pos: V3;
  /** Winch point id this letter belongs to. Omit to show it for every line. */
  line?: string;
}

export interface FilmerZoneDef {
  id: string;
  /** Where the filmer (NPC with a camera) stands. */
  pos: V3;
  /** Centre + radius of the area where a trick counts as "in frame". */
  center: V2;
  radius: number;
}

export type GoalDef =
  | { type: 'score'; target: number }
  | { type: 'trick'; trickId: string; board?: BoardKind }
  | { type: 'letters' }
  | { type: 'line'; obstacles: string[]; winch?: string }
  | { type: 'clip'; zone: string; minPoints?: number; trickId?: string };

export interface SpotDef {
  id: string;
  cityId: string;
  name: L10n;
  blurb: L10n;
  /** Theme id (decor style / palette), e.g. 'phuket', 'russia', 'europe'. */
  theme: string;
  env: EnvDef;
  /** Playable area in XZ. Outside → rider is steered back / bails. */
  bounds: { min: V2; max: V2 };
  /** Fallback infinite plane under everything (canal bed). */
  base: { level: number; surface: SurfaceKind };
  water: WaterRegionDef[];
  ground: GroundDef[];
  obstacles: ObstacleDef[];
  props: PropDef[];
  winchPoints: WinchPointDef[];
  letters: LetterDef[];
  filmerZones: FilmerZoneDef[];
  /** Exactly 5 goals. */
  goals: GoalDef[];
  /** Stars needed (total) to unlock the spot. */
  unlockStars: number;
  /** Position on the city map, 0..1 in both axes. */
  mapPos: V2;
  /** Music track id (see audio) or omitted for auto. */
  music?: string;
}

export interface CityDef {
  id: string;
  name: L10n;
  country: L10n;
  blurb: L10n;
  /** Position on the world globe. */
  globe: { lat: number; lon: number };
  /** Total stars needed to unlock the city. */
  unlockStars: number;
  spots: string[];
  /** Accent colour of the city in the hub. */
  color: number;
}

// ────────────────────────────────────────────────────────────────── Gear ──

/** Nominal scale 0..10, 5 = neutral. Sum of equipped items is clamped to 0..10 per stat. */
export interface GearStats {
  /** Pop height. */
  pop: number;
  /** Rotation speed. */
  spin: number;
  /** Rail balance. */
  rail: number;
  /** Landing forgiveness. */
  landing: number;
  /** Board-catch window (wakeskate). */
  catch: number;
}

export type GearCategory = 'bindings' | 'wakeboard' | 'wakeskate' | 'vest' | 'helmet' | 'apparel';

export interface GearLook {
  primary: number;
  secondary: number;
  accent: number;
  /** Procedural graphic style drawn on the item (deck graphic, vest print…). */
  graphic: 'logo' | 'stripe' | 'split' | 'camo' | 'wood' | 'fade' | 'checker' | 'plain' | 'flames' | 'tape';
}

export interface GearItem {
  id: string;
  category: GearCategory;
  name: L10n;
  desc: L10n;
  price: number;
  /** DELTAS relative to neutral (e.g. { pop: +1.5, landing: -0.5 }). */
  stats: Partial<GearStats>;
  look: GearLook;
  /** Product page; falls back to BRAND.siteUrl. */
  url?: string;
  /** Rider reputation level needed to buy. */
  unlockLevel?: number;
  /** apparel sub-type for the rider rig */
  apparelKind?: 'shorts' | 'wetsuit' | 'tee' | 'hoodie';
  /** helmet sub-type */
  headKind?: 'helmet' | 'cap';
}

export interface EquippedGear {
  wakeboard: string;
  bindings: string;
  wakeskate: string;
  vest: string | null;
  helmet: string | null;
  apparel: string | null;
}

// ───────────────────────────────────────────────────────────────── Rider ──

export interface RiderAppearance {
  gender: 'male' | 'female';
  /** Index into SKIN_TONES (src/config.ts). */
  skin: number;
  hair: 'buzz' | 'short' | 'curly' | 'long' | 'bun' | 'ponytail';
  hairColor: number;
  /** Used when no helmet gear is equipped. */
  headwear: 'none' | 'helmet' | 'cap';
  headwearColor: number;
  vest: boolean;
  vestColor: number;
  bottom: 'shorts' | 'wetsuit';
  bottomColor: number;
  topColor: number;
}

export interface RiderLook {
  appearance: RiderAppearance;
  gear: EquippedGear;
  stance: Stance;
}

// ──────────────────────────────────────────────────────────────── Tricks ──

export type GrabId = 'indy' | 'melon' | 'tail' | 'nose' | 'mute' | 'stalefish';
export type InvertId = 'backroll' | 'frontroll' | 'tantrum' | 'raley';
export type FlipId = 'shuvit' | 'fsShuvit' | 'kickflip' | 'heelflip' | 'treflip' | 'impossible' | 'bigspin';
export type RailStance = 'fifty' | 'boardslide' | 'lipslide' | 'nosepress' | 'tailpress';

export type TrickCategory = 'spin' | 'invert' | 'grab' | 'flip' | 'rail' | 'surface' | 'special' | 'bonus';

/** One row of the trick table (src/data/tricks.ts). */
export interface TrickDef {
  id: string;
  name: L10n;
  category: TrickCategory;
  boards: BoardKind[];
  /** Base points. */
  points: number;
  /** 1..5 */
  difficulty: number;
  /** How to do it (shown in the trick list). */
  input: L10n;
  /** Short description / tip. */
  tip?: L10n;
  /**
   * Requirements used by resolveTrick() for NAMED COMBINATIONS (e.g. Mobe = backroll + 360).
   * Atomic tricks (a grab, a 180…) are matched by their component and need no requirements.
   */
  requires?: {
    spin?: number; // absolute degrees
    invert?: InvertId;
    invertCount?: number;
    grab?: GrabId;
    /** Matches ANY grab (e.g. Hoochie Glide = raley + a grab). Ignored when `grab` is set. */
    anyGrab?: boolean;
    flip?: FlipId;
    takeoff?: string;
    rail?: RailStance;
  };
}

// ────────────────────────────────────────────────────────────────── Save ──

export interface Settings {
  lang: Lang | 'auto';
  quality: QualitySetting;
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  stance: Stance;
  haptics: boolean;
  /** Invert joystick Y for trick directions. */
  invertY: boolean;
  showFps: boolean;
}

export interface SpotProgress {
  /** 5 goal flags. Stars = number of true. */
  goals: boolean[];
  bestScore: number;
  bestCombo: number;
  bestTrick: { name: L10n; points: number } | null;
  runs: number;
}

export interface SaveData {
  /** Schema version — see src/save/migrations.ts. */
  version: number;
  settings: Settings;
  appearance: RiderAppearance;
  coins: number;
  rep: number;
  ownedGear: string[];
  equipped: EquippedGear;
  spots: Record<string, SpotProgress>;
  career: {
    dialogsSeen: string[];
    sponsors: Record<string, { state: 'offered' | 'active' | 'done'; progress: number }>;
    tutorialDone: boolean;
  };
  stats: {
    totalRuns: number;
    totalScore: number;
    totalFalls: number;
    bestCombo: number;
    tricksLanded: Record<string, number>;
  };
  last: { board: BoardKind; power: PowerLevel; cityId: string | null; spotId: string | null };
}

// ─────────────────────────────────────────────────────────────────── Run ──

export interface RunConfig {
  spotId: string;
  winchId: string;
  power: PowerLevel;
  board: BoardKind;
  mode: 'career' | 'free' | 'tutorial';
}

export interface RunResult {
  config: RunConfig;
  score: number;
  bestTrick: { name: L10n; points: number; time: number } | null;
  bestCombo: number;
  tricksLanded: number;
  falls: number;
  /** Seconds of real time. */
  duration: number;
  letters: boolean[];
  /** Goal flags after this run (5). */
  goals: boolean[];
  /** Indexes of goals completed for the first time in this run. */
  newGoals: number[];
  coins: number;
  rep: number;
  newRecord: boolean;
  /** Stars on this spot after the run (0..5). */
  stars: number;
  /** Trick table id → times landed in this run (copied from ScoreState.trickCounts; feeds save.stats.tricksLanded). */
  trickCounts?: Record<string, number>;
}
