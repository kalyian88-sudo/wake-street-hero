/**
 * Typed event bus — the only cross-module channel besides the interfaces in src/types.
 * Headless-safe (no DOM / three imports at runtime).
 */
import type {
  BailReason,
  BoardKind,
  FlipId,
  GameState,
  GrabId,
  InvertId,
  L10n,
  LandingQuality,
  Lang,
  QualityLevel,
  RailStance,
  ResolvedTrick,
  RunConfig,
  RunResult,
  SurfaceKind,
  TakeoffKind,
} from '../types';

/** Plain xyz so events stay serialisable (replay / tests). */
export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface GameEvents {
  // ── game flow (core) ──
  'game:state': { state: GameState; prev: GameState };
  'run:loaded': { config: RunConfig };
  'run:countdown': { n: number };
  'run:go': { config: RunConfig };
  'run:finish': { result: RunResult };
  'run:quit': Record<string, never>;
  'run:paused': { paused: boolean };
  'quality:changed': { level: QualityLevel; auto: boolean };

  // ── sim (physics + trick state machine) ──
  /** Jump released from water/solid. power 0..1. */
  'sim:pop': { power: number; pos: P3; surface: SurfaceKind };
  'sim:takeoff': { kind: TakeoffKind; pos: P3; speed: number; obstacleId?: string };
  /** Touchdown (not a bail). impact = vertical speed m/s. onto = what was landed on. */
  'sim:land': { quality: LandingQuality; impact: number; pos: P3; surface: SurfaceKind; onto: 'water' | 'solid' | 'rail' | 'wall'; hadTrick: boolean };
  'sim:bail': { reason: BailReason; pos: P3; surface: SurfaceKind; intensity: number; boardLost: boolean };
  'sim:respawn': { pos: P3 };
  'sim:railEnter': { obstacleId: string; kind: 'rail' | 'ledge' | 'pipe' | 'handrail'; pos: P3; material: 'metal' | 'stone' | 'wood' | 'plastic' };
  'sim:railStance': { stance: RailStance };
  'sim:railExit': { obstacleId: string; pos: P3; popped: boolean };
  'sim:wallEnter': { obstacleId: string; pos: P3 };
  'sim:wallExit': { obstacleId: string; pos: P3 };
  /** Rode onto / off a solid surface or kicker (scrape sounds). */
  'sim:surface': { from: SurfaceKind | 'air' | 'rail' | 'wall'; to: SurfaceKind | 'air' | 'rail' | 'wall'; obstacleId?: string };
  /** Rope went tight with a jolt. jerk in m/s. */
  'sim:ropeJerk': { jerk: number };
  'sim:handle': { holding: boolean };
  /** Surface 180 on water. */
  'sim:surfaceSpin': { dir: 1 | -1 };
  'sim:finish': { pos: P3 };
  'sim:gap': { id: string; name: L10n; points: number };

  // ── trick elements as they START in the air / on a rail (HUD ticker, sfx, slow-mo cue) ──
  'trick:spin': { deg: number };
  'trick:invert': { id: InvertId; count: number };
  'trick:grab': { id: GrabId };
  'trick:flip': { id: FlipId };
  'trick:shifty': Record<string, never>;
  /** Wakeskate catch attempt. quality 0..1, ok=false → board lost on landing. */
  'trick:catch': { quality: number; ok: boolean };

  // ── scoring ──
  /** A trick was landed and scored. `awarded` = points added to the combo pot (after staleness/landing/hero). */
  'score:trick': { trick: ResolvedTrick; awarded: number; landing: LandingQuality; stale: number; comboPoints: number; comboMult: number; time: number };
  'score:bonus': { id: string; name: L10n; points: number };
  /** Combo window ran out → pot × multiplier added to total. */
  'score:bank': { points: number; mult: number; banked: number; total: number; count: number };
  'score:lost': { points: number; mult: number };
  'hero:ready': Record<string, never>;
  'hero:start': { duration: number };
  'hero:end': Record<string, never>;

  // ── objectives (career) ──
  'letter:collect': { index: number; pos: P3; count: number };
  'goal:complete': { index: number; first: boolean };
  'clip:captured': { zone: string; trick: ResolvedTrick };
  'line:progress': { chain: string[]; total: number };

  // ── meta ──
  'save:changed': Record<string, never>;
  'lang:changed': { lang: Lang };
  'settings:changed': Record<string, never>;
  'gear:equipped': { board: BoardKind | null };
  'audio:unlocked': Record<string, never>;
  'ui:toast': { text: string; kind?: 'info' | 'good' | 'bad' };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private readonly map = new Map<keyof GameEvents, Set<Handler<never>>>();

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.map.get(type);
    if (!set) {
      set = new Set();
      this.map.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(type, fn);
  }

  off<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): void {
    this.map.get(type)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Handler<GameEvents[K]>)(payload);
      } catch (err) {
        // A broken listener must never take the frame loop down.
        console.error(`[bus] listener for "${String(type)}" threw`, err);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }
}
