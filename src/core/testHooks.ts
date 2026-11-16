/**
 * Test / automation hooks (always on — used by Playwright smoke tests and the dev sandboxes):
 *   window.__game  the IGame
 *   window.__wsh   { ready, start(), step(), state(), setInput(), stats(), manual() }
 */
import { findSpot } from '../data/spots';
import type { BoardKind, FrameStats, PowerLevel, RunConfig, VirtualInput } from '../types';
import type { Game } from './Game';

export interface WshState {
  game: string;
  phase: string | null;
  mode: string | null;
  pos: [number, number, number] | null;
  speed: number;
  heading: number;
  time: number;
  score: number;
  combo: { points: number; mult: number; count: number; active: boolean };
  tricksLanded: number;
  falls: number;
  hero: { meter: number; ready: boolean; active: boolean };
  letters: boolean[];
  goals: boolean[];
  progress: number;
  airHeight: number;
  slowMo: number;
  timeScale: number;
  quality: string;
}

export interface WshHooks {
  /** true once the menus can be used (first frame rendered). */
  readonly ready: boolean;
  /** Start a run and resolve at GO (the countdown is skipped). */
  start(spotId: string, winchId?: string, board?: BoardKind, power?: PowerLevel, mode?: RunConfig['mode']): Promise<void>;
  /** Advance by fixed 1/60 s steps without waiting for real frames; renders once at the end. */
  step(seconds: number): void;
  /** Plain JSON summary of the sim. */
  state(): WshState;
  /** Synthetic input (null = back to the real controls). */
  setInput(v: Partial<VirtualInput> | null): void;
  stats(): FrameStats;
  /** Manual clock: real frames stop advancing the game, only step() does (deterministic tests). */
  manual(on: boolean): void;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export function installTestHooks(game: Game): WshHooks {
  const hooks: WshHooks = {
    get ready() {
      return game.state !== 'boot';
    },

    async start(spotId, winchId, board = 'wakeboard', power = 'medium', mode = 'career') {
      const spot = findSpot(spotId);
      if (!spot) throw new Error(`__wsh.start: unknown spot "${spotId}"`);
      const winch = spot.winchPoints.find((w) => w.id === winchId) ?? spot.winchPoints[0];
      await game.startRun({ spotId, winchId: winch.id, board, power, mode });
      game.session?.skipCountdown();
    },

    step(seconds) {
      game.stepFrames(seconds);
    },

    state() {
      const session = game.session;
      const s = session?.sim.state ?? null;
      const sc = session?.sim.score.state ?? null;
      const obj = session?.objectives.state ?? null;
      return {
        game: game.state,
        phase: session?.phase ?? null,
        mode: s?.mode ?? null,
        pos: s ? [r3(s.pos.x), r3(s.pos.y), r3(s.pos.z)] : null,
        speed: s ? r3(s.speed) : 0,
        heading: s ? r3(s.heading) : 0,
        time: s ? r3(s.time) : 0,
        score: sc?.total ?? 0,
        combo: { points: sc?.comboPoints ?? 0, mult: sc?.comboMult ?? 1, count: sc?.comboCount ?? 0, active: sc?.comboActive ?? false },
        tricksLanded: sc?.tricksLanded ?? 0,
        falls: sc?.falls ?? 0,
        hero: { meter: sc?.hero.meter ?? 0, ready: sc?.hero.ready ?? false, active: sc?.hero.active ?? false },
        letters: obj ? obj.letters.slice() : [],
        goals: obj ? obj.goals.map((g) => g.done) : [],
        progress: s ? r3(s.progress) : 0,
        airHeight: s ? r3(s.air.height) : 0,
        slowMo: s ? r3(s.slowMo) : 0,
        timeScale: r3(game.time.scale),
        quality: game.quality.level,
      };
    },

    setInput(v) {
      game.input.setVirtual(v);
    },

    stats() {
      return { ...game.engine.stats };
    },

    manual(on) {
      game.manualClock = on;
    },
  };
  const w = window as unknown as { __game: Game; __wsh: WshHooks };
  w.__game = game;
  w.__wsh = hooks;
  return hooks;
}
