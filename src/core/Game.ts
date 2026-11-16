/**
 * Composition root. Creates every subsystem, owns the game state machine
 *   boot → menu ⇄ preview → countdown → run ⇄ paused → results ⇄ replay → menu
 * and the render loop. The UI talks to it through IGame only.
 */
import { Scene, Vector3 } from 'three';
import { createAudio } from '../audio/Audio';
import { BRAND } from '../config';
import { SPOTS } from '../data/spots';
import { detectLang, i18n } from '../i18n/i18n';
import enPart from '../i18n/parts/core.en.json';
import ruPart from '../i18n/parts/core.ru.json';
import { createInput } from '../input/Input';
import { createSaveStore } from '../save/SaveStore';
import type {
  AudioView,
  FrameStats,
  GameState,
  IAudio,
  IBackdropScene,
  IGame,
  IHud,
  II18n,
  IInput,
  ISaveStore,
  Lang,
  MenuBackdrop,
  QualityProfile,
  QualitySetting,
  RiderSimState,
  RunConfig,
  RunResult,
  WorldView,
} from '../types';
import { createHud } from '../ui/hud/Hud';
import { createBackdrop } from '../world/menu/backdrops';
import { CameraRig } from './CameraRig';
import { DebugOverlay, type DebugHost } from './debug';
import { Engine } from './Engine';
import { EventBus } from './events';
import type { FxParams } from './PostFx';
import { QualityManager } from './Quality';
import { RunSession, type SessionDeps } from './RunSession';
import { SpotLoader, markMaterialsDirty, type LoadedSpot } from './SpotLoader';
import { installTestHooks } from './testHooks';
import { TimeScale } from './Time';
import { readUrlParams, type UrlParams } from './urlParams';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  /** Layer for the in-run HUD. */
  hudRoot: HTMLElement;
}

/** Backdrops that can morph into each other through IBackdropScene.set() share one instance. */
type BackdropGroup = 'map' | 'rider' | 'splash';
interface BackdropEntry {
  scene: IBackdropScene;
  exposure: number;
}

const MAX_DT = 1 / 20;
const STEP = 1 / 60;
const DEBUG_TIME_SCALES = [1, 0.5, 0.25, 2] as const;
const MENU_BLOOM = 0.3;

function backdropGroup(b: MenuBackdrop): BackdropGroup | null {
  if (b.kind === 'hub' || b.kind === 'city') return 'map';
  if (b.kind === 'rider') return 'rider';
  if (b.kind === 'splash') return 'splash';
  return null;
}

function banner(parent: HTMLElement, text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;text-align:center;' +
    `padding:24px;background:${BRAND.css.darker};color:#fff;font:600 16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
  el.textContent = text;
  parent.append(el);
  return el;
}

export class Game implements IGame, DebugHost {
  readonly bus = new EventBus();
  readonly save: ISaveStore;
  readonly i18n: II18n = i18n;
  readonly audio: IAudio;
  readonly input: IInput;
  readonly hud: IHud;
  readonly debug: boolean;
  readonly params: UrlParams;
  readonly engine: Engine;
  readonly quality: QualityManager;
  readonly time = new TimeScale();
  readonly cameraRig: CameraRig;
  readonly loader: SpotLoader;

  session: RunSession | null = null;
  lastResult: RunResult | null = null;
  /** Test hook: real frames stop advancing the game (only __wsh.step does). */
  manualClock = false;

  private _state: GameState = 'boot';
  private pausedFrom: GameState = 'run';
  private readonly app: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: DebugOverlay;
  private readonly backdrops = new Map<BackdropGroup, BackdropEntry>();
  private backdrop: BackdropEntry | null = null;
  private navToken = 0;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private lookKey: object | null = null;
  private lostBanner: HTMLDivElement | null = null;
  private debugTimeIndex = 0;
  private dragId = -1;
  private dragX = 0;
  private dragY = 0;
  private readonly menuFx: FxParams = { slowMo: 0, hero: 0, bloom: MENU_BLOOM, time: 0 };
  private readonly previewView: WorldView;
  private readonly menuAudio: AudioView = { state: null, timeScale: 1, paused: false };
  private readonly ndc = { x: 0, y: 0 };
  private readonly v = new Vector3();
  private readonly v2 = new Vector3();
  private readonly menuScene = new Scene();
  private readonly sessionDeps: SessionDeps;

  constructor(opts: GameOptions) {
    this.canvas = opts.canvas;
    this.app = opts.canvas.parentElement ?? document.body;
    this.params = readUrlParams();
    this.debug = this.params.debug;

    this.save = createSaveStore(this.bus);
    i18n.extend('ru', ruPart);
    i18n.extend('en', enPart);
    this.applyLanguage();

    const settings = this.save.data.settings;
    this.audio = createAudio(this.bus);
    this.audio.setVolumes(settings.musicVolume, settings.sfxVolume);
    this.input = createInput();
    this.input.attach(this.app);
    this.input.setHaptics(settings.haptics);
    this.input.setInvertY(settings.invertY);
    this.input.setEnabled(false);
    this.hud = createHud({ bus: this.bus, input: this.input, i18n });
    this.hud.mount(opts.hudRoot);

    // Under automation the adaptive governor is frozen so screenshots are reproducible
    // (software GL would drag everything to "low"); ?quality=auto turns it back on.
    const automated = typeof navigator !== 'undefined' && navigator.webdriver === true && this.params.quality !== 'auto';
    this.quality = new QualityManager(this.bus, this.params.quality ?? settings.quality, automated);
    try {
      this.engine = new Engine(opts.canvas, this.quality.profile);
    } catch (err) {
      banner(this.app, i18n.t('core.webgl.unsupported'));
      throw err;
    }
    this.cameraRig = new CameraRig(this.bus);
    this.cameraRig.setAspect(this.engine.aspect);
    this.cameraRig.setFar(this.farPlane(this.quality.profile));
    this.loader = new SpotLoader(this.engine.renderer, this.cameraRig.camera, this.bus, () => this.quality.profile);
    this.previewView = { rider: null, camera: this.cameraRig.camera };
    this.sessionDeps = {
      bus: this.bus,
      save: this.save,
      input: this.input,
      hud: this.hud,
      audio: this.audio,
      engine: this.engine,
      cameraRig: this.cameraRig,
      time: this.time,
    };

    this.quality.onChange = (profile) => this.applyProfile(profile);
    this.engine.onResize = (w, h) => {
      this.cameraRig.setAspect(w / h);
      for (const b of this.backdrops.values()) b.scene.resize(w, h);
    };
    this.engine.onContextLost = () => {
      this.pauseRun();
      this.lostBanner ??= banner(this.app, i18n.t('core.webgl.lost'));
    };
    this.engine.onContextRestored = () => {
      this.lostBanner?.remove();
      this.lostBanner = null;
      this.lookKey = null;
      this.quality.interruption();
    };

    this.overlay = new DebugOverlay(this.app, this);
    this.overlay.setMode(this.debug, settings.showFps);

    this.bus.on('settings:changed', () => this.applySettings());
    this.bus.on('lang:changed', () => this.overlay.relabel());
    this.bindPage();
    installTestHooks(this);

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ─────────────────────────────────────────────────────────── plumbing ──

  get state(): GameState {
    return this._state;
  }

  get stats(): FrameStats {
    return this.engine.stats;
  }

  get qualityAuto(): boolean {
    return this.quality.auto;
  }

  private setState(next: GameState): void {
    if (next === this._state) return;
    const prev = this._state;
    this._state = next;
    this.bus.emit('game:state', { state: next, prev });
  }

  /** Generous far plane: the sky dome and distant skyline must survive, fog hides the rest. */
  private farPlane(profile: QualityProfile): number {
    return profile.drawDistance * 2 + 250;
  }

  private applyLanguage(): void {
    const s = this.save.data.settings.lang;
    const lang: Lang = this.params.lang ?? (s === 'auto' ? detectLang() : s);
    if (i18n.lang !== lang) {
      i18n.setLang(lang);
      this.bus.emit('lang:changed', { lang });
    }
    document.documentElement.lang = lang;
  }

  private applyProfile(profile: QualityProfile): void {
    const shadowsChanged = profile.shadows !== this.engine.profile.shadows;
    this.engine.applyProfile(profile);
    this.cameraRig.setFar(this.farPlane(profile));
    this.loader.applyProfile(profile, shadowsChanged);
    if (shadowsChanged) for (const b of this.backdrops.values()) markMaterialsDirty(b.scene.scene);
  }

  /** Tone-mapping exposure belongs to whatever scene is on screen (spot env vs. menu backdrop). */
  private useLook(key: object, exposure: number): void {
    if (this.lookKey === key) return;
    this.lookKey = key;
    this.engine.renderer.toneMappingExposure = exposure;
  }

  private bindPage(): void {
    const unlock = (): void => {
      this.audio.unlock();
      if (this.audio.unlocked) {
        for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.removeEventListener(type, unlock, true);
      }
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, unlock, { capture: true, passive: true });

    const hide = (): void => {
      this.pauseRun();
      this.audio.suspend();
      this.save.flush();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hide();
      else {
        this.audio.resume();
        this.last = performance.now();
        this.quality.interruption();
      }
    });
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', () => {
      this.last = performance.now();
    });

    // Drags on the bare canvas rotate the globe / pan the map / spin the rider.
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this._state !== 'menu' || !this.backdrop || this.dragId !== -1) return;
      this.dragId = e.pointerId;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.dragId) return;
      const dx = e.clientX - this.dragX;
      const dy = e.clientY - this.dragY;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      if (this._state === 'menu' && this.backdrop && (dx || dy)) this.backdrop.scene.drag(dx, dy);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.dragId) this.dragId = -1;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  // ─────────────────────────────────────────────────────────────── loop ──

  private readonly loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const raw = (now - this.last) / 1000;
    this.last = now;
    if (document.hidden || this.engine.contextLost) return;
    const realDt = Math.min(Math.max(raw, 0), MAX_DT);
    this.engine.beginFrame(realDt);
    if (this._state === 'boot') this.setState('menu');
    if (!this.manualClock) this.advance(realDt);
    this.draw(realDt);
    this.overlay.update(realDt);
    const cpu = this.engine.endFrame(raw);
    this.quality.frame(raw, cpu);
  };

  /** Everything of one frame except drawing. */
  private advance(realDt: number): void {
    this.clock += realDt;
    const st = this._state;
    const session = this.session;
    if (session && st !== 'menu' && st !== 'preview' && st !== 'boot') {
      session.frame(realDt, st === 'paused');
      return;
    }
    const loaded = this.loader.current;
    if (st === 'preview' && loaded) {
      this.previewView.camera = this.cameraRig.camera;
      loaded.world.update(realDt, this.clock, this.previewView);
      this.cameraRig.updatePreview(realDt);
    } else if (this.backdrop) {
      this.backdrop.scene.update(realDt, this.clock);
    }
    this.audio.update(realDt, this.menuAudio);
  }

  private draw(realDt: number): void {
    const st = this._state;
    const session = this.session;
    const loaded = this.loader.current;
    if (session && loaded && st !== 'menu' && st !== 'preview' && st !== 'boot') {
      this.useLook(loaded, loaded.spot.env.exposure);
      session.render(realDt);
    } else if (st === 'preview' && loaded) {
      this.useLook(loaded, loaded.spot.env.exposure);
      const fx = this.menuFx;
      fx.bloom = loaded.spot.env.bloom;
      fx.time = this.clock;
      this.engine.render(loaded.scene, this.cameraRig.camera, fx, realDt);
    } else if (this.backdrop) {
      this.useLook(this.backdrop, this.backdrop.exposure);
      const fx = this.menuFx;
      fx.bloom = MENU_BLOOM;
      fx.time = this.clock;
      this.engine.render(this.backdrop.scene.scene, this.backdrop.scene.camera, fx, realDt);
    } else {
      this.engine.clear(BRAND.colors.darker);
    }
  }

  /** Test hook: advance by fixed 1/60 s steps without waiting for real frames, then draw once. */
  stepFrames(seconds: number): void {
    const n = Math.max(1, Math.round(seconds / STEP));
    if (this._state === 'boot') this.setState('menu');
    for (let i = 0; i < n; i++) this.advance(STEP);
    this.engine.beginFrame(0);
    this.draw(STEP);
    this.engine.endFrame(0);
  }

  // ─────────────────────────────────────────────────────────── backdrop ──

  setBackdrop(b: MenuBackdrop): void {
    const group = backdropGroup(b);
    if (!group) {
      // 'none' while a spot preview is up means "nothing extra" — the preview stays.
      this.backdrop = null;
      return;
    }
    let entry = this.backdrops.get(group) ?? null;
    if (entry) entry.scene.set(b);
    else {
      const r = this.engine.renderer;
      const keep = r.toneMappingExposure;
      r.toneMappingExposure = 1;
      let scene: IBackdropScene | null = null;
      try {
        // Backdrops own their scene + camera; the context only carries the renderer, profile and bus.
        scene = createBackdrop(b, { renderer: r, scene: this.menuScene, camera: this.cameraRig.camera, profile: this.quality.profile, bus: this.bus });
      } catch (err) {
        console.error('[core] backdrop failed', err);
      }
      if (scene) {
        entry = { scene, exposure: r.toneMappingExposure };
        scene.resize(this.engine.width, this.engine.height);
        this.backdrops.set(group, entry);
      }
      r.toneMappingExposure = keep;
      this.lookKey = null;
    }
    this.backdrop = entry;
    // Leaving the spot card for a menu screen with its own backdrop ends the preview.
    if (this._state === 'preview') {
      this.navToken++;
      this.loader.current?.world.setLinePreview(false);
      this.setState('menu');
    }
  }

  pickBackdrop(clientX: number, clientY: number): { type: 'city' | 'spot'; id: string } | null {
    if (!this.backdrop || this._state !== 'menu') return null;
    const n = this.engine.clientToNdc(clientX, clientY, this.ndc);
    if (Math.abs(n.x) > 1 || Math.abs(n.y) > 1) return null;
    return this.backdrop.scene.pick(n.x, n.y);
  }

  projectMarker(type: 'city' | 'spot', id: string): { x: number; y: number; visible: boolean } | null {
    const b = this.backdrop;
    if (!b || !b.scene.markerPosition(type, id, this.v)) return null;
    const cam = b.scene.camera;
    cam.updateMatrixWorld();
    // Behind the camera → project() mirrors the point; treat it as hidden.
    const behind = this.v2.copy(this.v).applyMatrix4(cam.matrixWorldInverse).z > 0;
    this.v.project(cam);
    const visible = !behind && Math.abs(this.v.x) <= 1 && Math.abs(this.v.y) <= 1 && this.v.z >= -1 && this.v.z <= 1;
    const p = this.engine.ndcToClient(this.v.x, this.v.y, this.ndc);
    return { x: p.x, y: p.y, visible };
  }

  // ──────────────────────────────────────────────────────── preview / run ──

  private endSession(): void {
    const s = this.session;
    if (!s) return;
    this.session = null;
    s.dispose();
    this.time.reset();
    this.audio.setDucked(false);
  }

  private async loadSpot(spotId: string): Promise<LoadedSpot> {
    try {
      const loaded = await this.loader.load(spotId);
      this.lookKey = null;
      return loaded;
    } catch (err) {
      console.error('[core] spot load failed', err);
      this.bus.emit('ui:toast', { text: i18n.t('core.load.failed'), kind: 'bad' });
      throw err;
    }
  }

  async previewSpot(spotId: string, winchId: string): Promise<void> {
    const token = ++this.navToken;
    if (this.session) {
      this.endSession();
      this.bus.emit('run:quit', {});
    }
    const loaded = await this.loadSpot(spotId);
    if (token !== this.navToken) return;
    const wp = loaded.spot.winchPoints.find((w) => w.id === winchId) ?? loaded.spot.winchPoints[0];
    loaded.world.setWinchPoint(wp.id);
    loaded.world.setLinePreview(true);
    this.cameraRig.setSpot(loaded.spot, null);
    this.cameraRig.setMode('preview');
    this.cameraRig.setPreviewLine(wp, true);
    this.quality.interruption();
    this.setState('preview');
  }

  setPreviewLine(winchId: string): void {
    const loaded = this.loader.current;
    if (!loaded || this._state !== 'preview') return;
    const wp = loaded.spot.winchPoints.find((w) => w.id === winchId);
    if (!wp) return;
    loaded.world.setWinchPoint(wp.id);
    loaded.world.setLinePreview(true);
    this.cameraRig.setPreviewLine(wp, false);
  }

  async startRun(cfg: RunConfig): Promise<void> {
    const token = ++this.navToken;
    this.endSession();
    const loaded = await this.loadSpot(cfg.spotId);
    if (token !== this.navToken) return;
    this.session = new RunSession(this.sessionDeps, loaded, cfg, this.quality.profile, {
      onGo: () => {
        if (this._state === 'countdown') this.setState('run');
      },
      onResults: (result) => {
        this.lastResult = result;
        this.setState('results');
      },
      onPauseRequest: () => this.pauseRun(),
    });
    if (loaded.spot.music) this.audio.playMusic(loaded.spot.music);
    this.bus.emit('run:loaded', { config: this.session.config });
    this.quality.interruption();
    this.last = performance.now();
    this.setState('countdown');
  }

  restartRun(): void {
    const s = this.session;
    if (!s) return;
    const wasPaused = this._state === 'paused';
    s.restart();
    this.audio.setDucked(false);
    if (wasPaused) this.bus.emit('run:paused', { paused: false });
    this.quality.interruption();
    this.setState('countdown');
  }

  pauseRun(): void {
    const s = this.session;
    if (!s || (this._state !== 'run' && this._state !== 'countdown')) return;
    // The last second before the results screen is not pausable (nothing to control any more).
    if (s.phase === 'finishing') return;
    this.pausedFrom = this._state;
    this.input.setEnabled(false);
    this.audio.setDucked(true);
    this.setState('paused');
    this.bus.emit('run:paused', { paused: true });
  }

  resumeRun(): void {
    if (this._state !== 'paused' || !this.session) return;
    this.input.setEnabled(true);
    this.audio.setDucked(false);
    this.last = performance.now();
    this.quality.interruption();
    this.setState(this.pausedFrom);
    this.bus.emit('run:paused', { paused: false });
  }

  quitRun(): void {
    this.navToken++;
    if (!this.session) {
      if (this._state !== 'menu' && this._state !== 'boot') this.setState('menu');
      return;
    }
    this.endSession();
    this.bus.emit('run:quit', {});
    this.setState('menu');
  }

  async playReplay(): Promise<void> {
    const s = this.session;
    if (!s || this._state !== 'results') return;
    const done = s.playReplay();
    if (s.phase !== 'replay') return;
    this.setState('replay');
    await done;
    if (this._state === 'replay' && this.session === s) this.setState('results');
  }

  stopReplay(): void {
    this.session?.stopReplay();
  }

  async renderBestFrame(width: number, height: number): Promise<HTMLCanvasElement | null> {
    const s = this.session;
    if (!s || this.engine.contextLost) return null;
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    const canvas = s.renderBestFrame(w, h);
    this.quality.interruption();
    return canvas;
  }

  applySettings(): void {
    const s = this.save.data.settings;
    if (!this.params.quality) this.quality.setSetting(s.quality);
    this.audio.setVolumes(s.musicVolume, s.sfxVolume);
    this.input.setHaptics(s.haptics);
    this.input.setInvertY(s.invertY);
    this.applyLanguage();
    this.overlay.setMode(this.debug, s.showFps);
    // settings.stance is read when the next run is created.
  }

  // ───────────────────────────────────────────────────────── debug host ──

  riderState(): RiderSimState | null {
    return this.session?.sim.state ?? null;
  }

  toggleHitboxes(): boolean {
    const s = this.session;
    if (!s) return false;
    s.setHitboxes(!s.hitboxes);
    return s.hitboxes;
  }

  toggleFreeCam(): boolean {
    const rig = this.cameraRig;
    if (rig.mode === 'free') {
      rig.setMode(this._state === 'preview' ? 'preview' : this.session?.phase === 'replay' ? 'filmer' : 'chase');
      return false;
    }
    rig.setMode('free', this.app);
    return true;
  }

  cycleQuality(): QualitySetting {
    return this.quality.cycle();
  }

  cycleTimeScale(): number {
    this.debugTimeIndex = (this.debugTimeIndex + 1) % DEBUG_TIME_SCALES.length;
    this.time.debugScale = DEBUG_TIME_SCALES[this.debugTimeIndex];
    return this.time.debugScale;
  }

  unlockAll(): void {
    this.save.update((d) => {
      for (const spot of SPOTS) {
        const sp = d.spots[spot.id] ?? (d.spots[spot.id] = { goals: [], bestScore: 0, bestCombo: 0, bestTrick: null, runs: 0 });
        sp.goals = spot.goals.map(() => true);
      }
      d.coins = Math.max(d.coins, 0) + 99999;
    });
    this.bus.emit('ui:toast', { text: i18n.t('core.debug.unlocked'), kind: 'good' });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.endSession();
    this.loader.unload();
    for (const b of this.backdrops.values()) b.scene.dispose();
    this.backdrops.clear();
    this.overlay.dispose();
    this.cameraRig.dispose();
    this.input.detach();
    this.engine.dispose();
  }
}

export function createGame(opts: GameOptions): IGame {
  return new Game(opts);
}
