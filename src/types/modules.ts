/**
 * MODULE CONTRACTS — the public surface of every module. Modules talk to each other ONLY through
 * these interfaces + the typed event bus (src/core/events.ts). Factories live in the files listed
 * in docs/PLAN.md §Module map and keep the exact export names given there.
 */
import type {
  BufferGeometry,
  Camera,
  Color,
  DirectionalLight,
  Material,
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import type {
  BoardKind,
  EnvDef,
  L10n,
  Lang,
  PropDef,
  QualityLevel,
  RiderLook,
  RunConfig,
  RunResult,
  SaveData,
  SpotDef,
  WaterRegionDef,
} from './data';
import type { InputFrame, RiderSimState, ScoreState } from './sim';
import type { EventBus } from '../core/events';

// ─────────────────────────────────────────────────────────────── Quality ──

export interface QualityProfile {
  level: QualityLevel;
  /** Max devicePixelRatio. */
  dprCap: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Half-size (m) of the shadow frustum that follows the rider. */
  shadowRange: number;
  /** Use the post-processing composer at all. */
  post: boolean;
  bloom: boolean;
  aa: 'none' | 'fxaa' | 'smaa';
  /** 0 = cheap (single normal layer, no foam texture), 1 = standard, 2 = full (extra layers, refraction tint). */
  waterDetail: 0 | 1 | 2;
  /** Particle budget multiplier 0..1. */
  particles: number;
  /** Multiplier for decor density / LOD distance 0..1. */
  detail: number;
  /** Far plane / fog-limited draw distance in metres. */
  drawDistance: number;
  /** Anisotropy for ground textures. */
  anisotropy: number;
}

// ───────────────────────────────────────────────────────────────── Input ──

export type ButtonId = 'jump' | 'trick' | 'grab' | 'handle' | 'hero' | 'pause';

export interface VirtualInput {
  steer: number;
  pitch: number;
  jump: boolean;
  trick: boolean;
  grab: boolean;
  handle: boolean;
  hero: boolean;
}

export interface IInput {
  /** Start listening (touch / pointer / keyboard). `surface` receives joystick touches. */
  attach(surface: HTMLElement): void;
  detach(): void;
  /** Call exactly once per rendered frame. Edge flags (pressed/released) are valid for that frame only. */
  poll(): InputFrame;
  /** Gameplay input on/off (menus). When off poll() returns a neutral frame. */
  setEnabled(on: boolean): void;
  /** HUD registers its on-screen buttons so multi-touch hit-testing is done in one place. */
  bindButton(id: ButtonId, el: HTMLElement | null): void;
  /** Floating joystick state in CSS px (for the HUD to draw). */
  readonly joystick: { active: boolean; originX: number; originY: number; x: number; y: number };
  /** Haptic feedback (no-op when unsupported / disabled). */
  vibrate(pattern: number | number[]): void;
  setHaptics(on: boolean): void;
  /** Invert the stick's vertical axis (settings.invertY). */
  setInvertY(on: boolean): void;
  /** Synthetic input (tests, bots, tutorial demos). Pass null to return control to the player. */
  setVirtual(v: Partial<VirtualInput> | null): void;
  /** True if the last real input came from touch (HUD shows touch controls) vs keyboard. */
  readonly touchMode: boolean;
}

// ─────────────────────────────────────────────────────────────────── HUD ──

export interface GoalProgress {
  done: boolean;
  /** Was already done before this run. */
  doneBefore: boolean;
  /** 0..1 */
  progress: number;
}

export interface ObjectivesState {
  /** 6 flags W-H-Y-N-O-T. */
  letters: boolean[];
  goals: GoalProgress[];
  /** Obstacle ids hit so far in the current combo (for the "line" goal). */
  chain: string[];
  /** Rider is inside a filmer zone right now. */
  inFilmerZone: string | null;
}

export interface HudView {
  state: RiderSimState;
  score: ScoreState;
  objectives: ObjectivesState | null;
  /** Current global time scale (1 = normal). */
  timeScale: number;
  /** 3,2,1 … or null when running. */
  countdown: number | null;
}

/** Tracks letters / goals / line chain / filmer clips during a run (src/career/objectives.ts). Headless. */
export interface IRunObjectives {
  readonly state: ObjectivesState;
  /** Per sim step: letter pickup, filmer-zone test, goal progress. */
  update(state: RiderSimState, score: ScoreState, dt: number): void;
  dispose(): void;
}

export interface IHud {
  mount(parent: HTMLElement): void;
  /** Show for a run (configures GRAB/FLIP label, goal list…). */
  show(cfg: RunConfig, spot: SpotDef): void;
  hide(): void;
  update(view: HudView, realDt: number): void;
  /** Tutorial coach line + highlighted buttons (null to clear). */
  setHint(text: string | null, highlight?: ButtonId[]): void;
  /** Control scheme of the run: 'swipe' hides the joystick and buttons and shows gesture hints. */
  setScheme?(scheme: 'swipe' | 'classic'): void;
  /** Endless canal badge (stage + lives); null hides it. */
  setEndless?(info: { stage: number; lives: number } | null): void;
}

// ───────────────────────────────────────────────────────────────── Rider ──

export interface IRiderRig {
  /** Add this to the scene. Root is positioned/oriented by update(). */
  readonly root: Object3D;
  setLook(look: RiderLook): void;
  setBoard(kind: BoardKind): void;
  /** Pose the rider from the sim state. `dt` = sim seconds (0 allowed: snap, used by replay scrubbing). */
  update(state: RiderSimState, dt: number): void;
  /** Static pose for menus / editor / shop (no sim). `t` = seconds for idle motion. */
  setPreviewPose(pose: 'idle' | 'ride' | 'grab' | 'stoked', t: number): void;
  getHeadWorldPosition(out: Vector3): Vector3;
  getChestWorldPosition(out: Vector3): Vector3;
  setVisible(v: boolean): void;
  dispose(): void;
}

// ─────────────────────────────────────────────────── World: env / water / fx ──

export interface WorldBuildContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  profile: QualityProfile;
  bus: EventBus;
}

export interface IEnvironment {
  /** Sky dome, lights etc. */
  readonly object: Object3D;
  readonly sun: DirectionalLight;
  /** Unit vector pointing TOWARDS the sun. */
  readonly sunDirection: Vector3;
  /** PMREM environment (also assigned to scene.environment by attach()). */
  readonly envMap: Texture | null;
  readonly def: EnvDef;
  /** Sets scene.background/environment/fog and renderer.toneMappingExposure. */
  attach(scene: Scene, renderer: WebGLRenderer): void;
  /** Keep the shadow frustum centred on `focus` (texel-snapped). */
  update(dt: number, focus: Vector3, camera: Camera): void;
  setProfile(profile: QualityProfile): void;
  dispose(): void;
}

export interface WakeSource {
  pos: Vector3;
  vel: Vector3;
  /** Horizontal speed. */
  speed: number;
  /** Board is in the water (draw wake). */
  onWater: boolean;
  /** −1..1 edge lean (spray side). */
  lean: number;
}

export interface FoamShape {
  /** Closed XZ outline of something standing in / bounding the water. */
  points: [number, number][];
  /** Water level at this shape. */
  level: number;
}

export interface IWater {
  readonly object: Object3D;
  /** Per frame. `wake` = rider info or null (menus / airborne is expressed via onWater=false). */
  update(dt: number, time: number, camera: Camera, wake: WakeSource | null): void;
  /** Expanding ring (landing, bail, drop of water). strength 0..1. */
  ripple(pos: Vector3, strength: number): void;
  /** Shoreline / obstacle foam. Call once after the spot is built. */
  setFoamShapes(shapes: FoamShape[]): void;
  setProfile(profile: QualityProfile): void;
  dispose(): void;
}

export type SplashKind = 'pop' | 'land' | 'bail' | 'carve' | 'drop';

export interface IParticles {
  readonly object: Object3D;
  /** One-shot water burst. strength 0..1. */
  splash(pos: Vector3, strength: number, kind: SplashKind): void;
  /** Continuous spray (edge carve / rooster tail). Call every frame while carving. amount 0..1. */
  spray(pos: Vector3, dir: Vector3, amount: number): void;
  /** Metal grind sparks. */
  sparks(pos: Vector3, dir: Vector3, amount: number): void;
  /** Concrete slide dust / water film mist. */
  dust(pos: Vector3, amount: number, wet: boolean): void;
  /** Droplets falling off the rider/board after leaving water. */
  drips(pos: Vector3, vel: Vector3, amount: number): void;
  update(dt: number, camera: Camera): void;
  setProfile(profile: QualityProfile): void;
  dispose(): void;
}

// ──────────────────────────────────────────────────────── World: spot builder ──

export interface WorldView {
  /** null in menus / previews. */
  rider: RiderSimState | null;
  camera: PerspectiveCamera;
}

export interface ISpotWorld {
  readonly spot: SpotDef;
  /** Everything of the spot (already added to ctx.scene by buildSpotWorld). */
  readonly group: Object3D;
  readonly env: IEnvironment;
  readonly water: IWater;
  readonly particles: IParticles;
  /** Place winch + operator + start buoy for this line; show its letters. */
  setWinchPoint(id: string): void;
  /** Animated dashed line start → winch (spot card preview). */
  setLinePreview(visible: boolean): void;
  /** Hide collected letters (6 flags). */
  setLetters(collected: boolean[]): void;
  /** Filmer camera pose for a zone (or a nice virtual filmer near `riderPos` when zoneId is null). */
  getFilmerCamera(zoneId: string | null, riderPos: Vector3, outPos: Vector3, outLook: Vector3): void;
  /** Per frame: water, particles, winch drum, rope, operator, letters spin, flags, env follow… */
  update(dt: number, time: number, view: WorldView): void;
  /** Hitbox overlay (?debug). */
  setDebug(on: boolean, shapes?: import('./sim').CollisionDebugShape[]): void;
  setProfile(profile: QualityProfile): void;
  dispose(): void;
}

/** Passed to prop builders (decor). Static geometry is merged per material; repeated things are instanced. */
export interface PropContext {
  spot: SpotDef;
  profile: QualityProfile;
  /** Seeded RNG 0..1 (deterministic per prop). */
  rng: () => number;
  /** Shared PBR material library — see src/world/materials.ts (world agent defines the keys). */
  mat(key: string, opts?: Record<string, unknown>): Material;
  /** Geometry merged into one mesh per material (transform baked). */
  addStatic(geometry: BufferGeometry, material: Material, matrix?: Matrix4): void;
  /** Instanced by `key` (same geometry+material). */
  addInstance(key: string, geometry: BufferGeometry, material: Material, matrix: Matrix4, color?: Color): void;
  /** Unbatched object (animated / emissive / transparent specials). Use sparingly. */
  addObject(obj: Object3D): void;
  /** Per-frame callback (flags waving, neon flicker…). */
  onUpdate(fn: (dt: number, time: number) => void): void;
  /** Local→world matrix helper for this prop (pos, rot°, scale from the def, plus a local offset). */
  matrixAt(local?: readonly [number, number, number], rotDeg?: number, scale?: number | readonly [number, number, number]): Matrix4;
}

export type PropBuilder = (def: PropDef, ctx: PropContext) => void;

// ───────────────────────────────────────────────────────────────── Audio ──

export type SfxId =
  | 'ui.tap'
  | 'ui.back'
  | 'ui.buy'
  | 'ui.star'
  | 'ui.unlock'
  | 'pop'
  | 'land.water'
  | 'land.hard'
  | 'splash.big'
  | 'bail.water'
  | 'bail.concrete'
  | 'rail.lock'
  | 'flip.click'
  | 'flip.catch'
  | 'letter'
  | 'combo.bank'
  | 'combo.lost'
  | 'hero.start'
  | 'hero.end'
  | 'crowd.cheer'
  | 'crowd.ooh'
  | 'countdown.tick'
  | 'countdown.go'
  | 'goal'
  | 'camera.shutter';

export interface AudioView {
  /** null in menus. */
  state: RiderSimState | null;
  timeScale: number;
  paused: boolean;
}

export interface IAudio {
  /** Create/resume the AudioContext — call from the first user gesture. Safe to call repeatedly. */
  unlock(): void;
  readonly unlocked: boolean;
  setVolumes(music: number, sfx: number): void;
  /** Start a procedural track by id, or 'auto' to pick/rotate. */
  playMusic(track?: string): void;
  stopMusic(): void;
  /** Lower music (pause menu). */
  setDucked(ducked: boolean): void;
  readonly tracks: { id: string; name: string }[];
  /** One-shot. The audio module ALSO plays most sounds on its own by listening to bus events. */
  play(id: SfxId, opts?: { volume?: number; pitch?: number; pan?: number }): void;
  /** Continuous layers (water, carve, winch motor, rope strain, grind) driven by the sim state. */
  update(realDt: number, view: AudioView): void;
  /** Page hidden / shown. */
  suspend(): void;
  resume(): void;
}

// ────────────────────────────────────────────────────────── Save / i18n ──

export interface ISaveStore {
  /** Live data object. Mutate ONLY through update(). */
  readonly data: SaveData;
  /** Mutate + persist (debounced) + emit 'save:changed'. */
  update(mutator: (d: SaveData) => void): void;
  /** Write immediately (page hide). */
  flush(): void;
  reset(): void;
  /** false when localStorage is unavailable (private mode…) — game still works in memory. */
  readonly persistent: boolean;
}

export interface II18n {
  readonly lang: Lang;
  setLang(lang: Lang): void;
  /** Lookup in src/i18n/{ru,en}.json. `{name}` placeholders are replaced from params. Missing key → key. */
  t(key: string, params?: Record<string, string | number>): string;
  /** Pick the current language from a data L10n. */
  l(text: L10n): string;
  onChange(cb: (lang: Lang) => void): () => void;
  /** Merge extra strings into a language at runtime (modules register their own namespaces, e.g. 'hud.*'). */
  extend(lang: Lang, dict: Record<string, string>): void;
}

// ───────────────────────────────────────────────────────────── Game / UI ──

export type GameState = 'boot' | 'menu' | 'preview' | 'countdown' | 'run' | 'paused' | 'results' | 'replay';

export type MenuBackdrop =
  | { kind: 'none' }
  | { kind: 'splash' }
  | { kind: 'hub'; focusCity?: string }
  | { kind: 'city'; cityId: string }
  | { kind: 'rider'; look?: RiderLook; pose?: 'idle' | 'ride' | 'grab' | 'stoked'; board?: BoardKind };

/** What the UI can ask the game (core) to do. */
export interface IGame {
  readonly bus: EventBus;
  readonly save: ISaveStore;
  readonly i18n: II18n;
  readonly audio: IAudio;
  readonly input: IInput;
  readonly hud: IHud;
  readonly state: GameState;
  /** ?debug in the URL. */
  readonly debug: boolean;

  /** 3D backdrop behind menu screens. */
  setBackdrop(b: MenuBackdrop): void;
  /** Load a spot and show the fly-around preview with the chosen line (spot card). */
  previewSpot(spotId: string, winchId: string): Promise<void>;
  /** Change the previewed line without reloading. */
  setPreviewLine(winchId: string): void;
  /** Start a run (loads the spot if needed) → countdown → run. */
  startRun(cfg: RunConfig): Promise<void>;
  restartRun(): void;
  /** Start an endless-canal run (procedural stages through every country, 3 lives). */
  startEndless?(board: BoardKind): Promise<void>;
  pauseRun(): void;
  resumeRun(): void;
  /** Abort the run and go back to menus. */
  quitRun(): void;
  /** Result of the last finished run. */
  readonly lastResult: RunResult | null;
  /** Play the best-trick replay from the filmer camera (results screen). Resolves when it ends. */
  playReplay(): Promise<void>;
  stopReplay(): void;
  /** Render the best-trick frame from the filmer camera into a canvas (share card background). */
  renderBestFrame(width: number, height: number): Promise<HTMLCanvasElement | null>;
  /** Re-apply settings from the save (quality, volumes, haptics, stance, language). */
  applySettings(): void;
  /** Pick a spot under a screen point on the city backdrop / a city on the hub (null if none). */
  pickBackdrop(clientX: number, clientY: number): { type: 'city' | 'spot'; id: string } | null;
  /** Screen position (CSS px) of a hub city / city-map spot marker for DOM labels; null if off-screen. */
  projectMarker(type: 'city' | 'spot', id: string): { x: number; y: number; visible: boolean } | null;
}

export type ScreenId =
  | 'splash'
  | 'hub'
  | 'city'
  | 'spot'
  | 'results'
  | 'shop'
  | 'rider'
  | 'tricks'
  | 'settings'
  | 'pause'
  | 'dialog'
  | 'none';

export interface IUI {
  /** Build DOM, show the splash. */
  start(): void;
  /** Navigate. */
  show(screen: ScreenId, params?: Record<string, unknown>): void;
  readonly current: ScreenId;
}

/**
 * 3D scene shown behind menu screens (hub globe, city map, rider turntable).
 * Created by createBackdrop() in src/world/menu/backdrops.ts; rendered by the core engine.
 */
export interface IBackdropScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Switch what is shown (e.g. hub → city fly-in, new rider look) without rebuilding everything. */
  set(b: MenuBackdrop): void;
  update(realDt: number, time: number): void;
  resize(width: number, height: number): void;
  /** Hit-test markers. ndc = normalised device coords −1..1. */
  pick(ndcX: number, ndcY: number): { type: 'city' | 'spot'; id: string } | null;
  /** World position of a marker (for DOM labels). Returns false if unknown. */
  markerPosition(type: 'city' | 'spot', id: string, out: Vector3): boolean;
  /** User drag on the backdrop (rotate globe / pan map / spin rider). dx,dy in CSS px. */
  drag(dx: number, dy: number): void;
  dispose(): void;
}

// ───────────────────────────────────────────────────────── Engine (core) ──

export interface FrameStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  quality: QualityLevel;
  dpr: number;
}

export type { InputFrame, RiderSimState, ScoreState, WaterRegionDef };
