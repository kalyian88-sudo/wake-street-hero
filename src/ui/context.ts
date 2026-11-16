/**
 * Shared context handed to every screen + a defensive wrapper around IGame.
 * While other modules are still stubs (src/dev/stub.ts) any IGame member may be a no-op returning
 * undefined — so the UI never calls the game directly, only through `SafeGame`.
 */
import type { EventBus } from '../core/events';
import type { BoardKind, GameState, IGame, ISaveStore, Lang, MenuBackdrop, RunConfig, RunResult, ScreenId, SfxId } from '../types';
import type { Nav } from './nav';
import type { ModalOptions } from './overlays';

export type Params = Record<string, unknown>;

const GAME_STATES: readonly GameState[] = ['boot', 'menu', 'preview', 'countdown', 'run', 'paused', 'results', 'replay'];

export interface Marker {
  x: number;
  y: number;
  visible: boolean;
}

export class SafeGame {
  constructor(readonly raw: IGame) {}

  private call<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      console.error('[ui] game call failed', err);
      return undefined;
    }
  }

  private async wait(fn: () => unknown): Promise<void> {
    try {
      await fn();
    } catch (err) {
      console.error('[ui] game call failed', err);
    }
  }

  get state(): GameState {
    const s = this.call(() => this.raw.state);
    return typeof s === 'string' && (GAME_STATES as readonly string[]).includes(s) ? (s as GameState) : 'menu';
  }

  get debug(): boolean {
    return this.call(() => this.raw.debug) === true;
  }

  get lastResult(): RunResult | null {
    const r = this.call(() => this.raw.lastResult);
    return r && typeof r === 'object' && typeof r.config === 'object' && r.config !== null && typeof r.score === 'number' ? r : null;
  }

  setBackdrop(b: MenuBackdrop): void {
    this.call(() => this.raw.setBackdrop(b));
  }
  previewSpot(spotId: string, winchId: string): Promise<void> {
    return this.wait(() => this.raw.previewSpot(spotId, winchId));
  }
  setPreviewLine(winchId: string): void {
    this.call(() => this.raw.setPreviewLine(winchId));
  }
  startRun(cfg: RunConfig): Promise<void> {
    return this.wait(() => this.raw.startRun(cfg));
  }
  restartRun(): void {
    this.call(() => this.raw.restartRun());
  }
  pauseRun(): void {
    this.call(() => this.raw.pauseRun());
  }
  resumeRun(): void {
    this.call(() => this.raw.resumeRun());
  }
  quitRun(): void {
    this.call(() => this.raw.quitRun());
  }
  playReplay(): Promise<void> {
    return this.wait(() => this.raw.playReplay());
  }
  stopReplay(): void {
    this.call(() => this.raw.stopReplay());
  }
  applySettings(): void {
    this.call(() => this.raw.applySettings());
  }

  pickBackdrop(x: number, y: number): { type: 'city' | 'spot'; id: string } | null {
    const p = this.call(() => this.raw.pickBackdrop(x, y));
    return p && typeof p === 'object' && (p.type === 'city' || p.type === 'spot') && typeof p.id === 'string' ? p : null;
  }

  projectMarker(type: 'city' | 'spot', id: string): Marker | null {
    const m = this.call(() => this.raw.projectMarker(type, id));
    return m && typeof m === 'object' && Number.isFinite(m.x) && Number.isFinite(m.y) ? { x: m.x, y: m.y, visible: m.visible !== false } : null;
  }

  // ── audio / haptics ──
  sfx(id: SfxId, opts?: { volume?: number; pitch?: number }): void {
    this.call(() => this.raw.audio?.play?.(id, opts));
  }
  unlockAudio(): void {
    this.call(() => this.raw.audio?.unlock?.());
  }
  startMusic(): void {
    this.call(() => this.raw.audio?.playMusic?.('auto'));
  }
  duck(on: boolean): void {
    this.call(() => this.raw.audio?.setDucked?.(on));
  }
  vibrate(pattern: number | number[]): void {
    this.call(() => this.raw.input?.vibrate?.(pattern));
  }
}

/** Things the UI remembers for the session only (the save has no slot for them). */
export interface Session {
  /** Last winch point chosen per spot. */
  winch: Map<string, string>;
  /** Last run mode chosen per spot. */
  mode: Map<string, RunConfig['mode']>;
  shopTab: string | null;
  tricksTab: string | null;
  riderTab: string | null;
  /** True once the game has proven it renders 3D menu backdrops (projectMarker returned a position). */
  backdrop3D: boolean;
  /** Coins / rep right before the current run started (for the results "level up" moment). */
  before: { coins: number; rep: number } | null;
  /** City the player came from (target of "back to city"). */
  cityId: string | null;
  /** Board shown on the rider backdrop. */
  board: BoardKind;
}

export interface UICtx {
  readonly g: SafeGame;
  readonly bus: EventBus;
  readonly save: ISaveStore;
  readonly nav: Nav;
  readonly session: Session;
  sfx(id: SfxId): void;
  toast(text: string, kind?: 'info' | 'good' | 'bad'): void;
  /** Modal dialog / bottom sheet. Resolves with the chosen action value, or null when dismissed. */
  modal<T extends string>(opts: ModalOptions<T>): Promise<T | null>;
  confirm(opts: { title: string; text?: string; ok: string; cancel?: string; danger?: boolean }): Promise<boolean>;
  go(screen: ScreenId, params?: Params): void;
  back(): void;
  /** Run control from the pause / results screens (also hides the menus right away). */
  resume(): void;
  restart(): void;
  /** Abort / leave the run and land on the city screen. */
  quit(): void;
  /** Switch language everywhere (i18n, save, bus, game settings). */
  setLang(lang: Lang): void;
}
