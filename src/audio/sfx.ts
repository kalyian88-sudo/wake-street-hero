/**
 * One-shot player: spec table (bus, calibrated level, priority, cooldown, pitch variation) on top of
 * the recipes in sfxWorld.ts / sfxMeta.ts / crowd.ts.
 */
import type { SfxId } from '../types';
import { cheer, ooh } from './crowd';
import type { AudioCore, BusId, Voice } from './graph';
import * as M from './sfxMeta';
import * as W from './sfxWorld';
import { clamp, dbToGain } from './theory';

/** Sounds the module triggers itself from bus events but that are not part of the public SfxId list. */
export type InternalSfx = 'twang' | 'whoosh' | 'grab' | 'handle' | 'swish' | 'bonus' | 'hero.ready';
export type SfxName = SfxId | InternalSfx;

export interface SfxOpts {
  volume?: number;
  pitch?: number;
  pan?: number;
  /** 0..1 — pop power, landing impact, bail / cheer intensity, catch quality, rope jerk… */
  amount?: number;
  /** Recipe variant: surface / rail material / direction. */
  variant?: string;
  /** Letter number 1..6 or number of bank blips. */
  step?: number;
  /** Start this many seconds from now. */
  delay?: number;
  /** Absolute context time to start at (offline renders). Skips the cooldown. */
  at?: number;
}

interface Spec {
  bus: BusId;
  /** Voice gain in dB at amount = 1 — calibrated so the sound peaks at the level listed in Audio.ts. */
  db: number;
  /** Gain at amount = 0 as a fraction of the full level. */
  floor: number;
  /** Default amount when the caller gives none. */
  amount: number;
  /** 3 = must be heard, 2 = normal, 1 = decoration (first to be stolen). */
  priority: number;
  /** Minimum seconds between two plays of the same id. */
  cooldown: number;
  /** Random pitch spread (± fraction) so repeats do not sound like a machine gun. */
  vary: number;
  make: (v: Voice, t: number, a: number, o: SfxOpts) => void;
}

const world = (r: W.WorldRecipe): Spec['make'] => (v, t, a, o) => r(v, t, a, o.variant);
const meta = (r: M.MetaRecipe): Spec['make'] => (v, t, a, o) => r(v, t, a, o.step ?? 0);

const SPECS: Record<SfxName, Spec> = {
  'ui.tap': { bus: 'ui', db: -17, floor: 1, amount: 1, priority: 3, cooldown: 0.03, vary: 0.03, make: meta(M.uiTap) },
  'ui.back': { bus: 'ui', db: -17, floor: 1, amount: 1, priority: 3, cooldown: 0.05, vary: 0.02, make: meta(M.uiBack) },
  'ui.buy': { bus: 'ui', db: -13, floor: 1, amount: 1, priority: 3, cooldown: 0.15, vary: 0.01, make: meta(M.uiBuy) },
  'ui.star': { bus: 'ui', db: -13, floor: 1, amount: 1, priority: 3, cooldown: 0.1, vary: 0.01, make: meta(M.uiStar) },
  'ui.unlock': { bus: 'ui', db: -11, floor: 1, amount: 1, priority: 3, cooldown: 0.3, vary: 0, make: meta(M.uiUnlock) },
  pop: { bus: 'world', db: -10, floor: 0.45, amount: 0.7, priority: 2, cooldown: 0.08, vary: 0.06, make: world(W.pop) },
  'land.water': { bus: 'world', db: -9, floor: 0.4, amount: 0.6, priority: 2, cooldown: 0.08, vary: 0.07, make: world(W.landWater) },
  'land.hard': { bus: 'world', db: -9, floor: 0.4, amount: 0.6, priority: 2, cooldown: 0.08, vary: 0.07, make: world(W.landHard) },
  'splash.big': { bus: 'world', db: -8, floor: 0.5, amount: 0.8, priority: 2, cooldown: 0.2, vary: 0.06, make: world(W.splashBig) },
  'bail.water': { bus: 'world', db: -7, floor: 0.55, amount: 0.8, priority: 3, cooldown: 0.3, vary: 0.05, make: world(W.bailWater) },
  'bail.concrete': { bus: 'world', db: -6, floor: 0.55, amount: 0.8, priority: 3, cooldown: 0.3, vary: 0.05, make: world(W.bailConcrete) },
  'rail.lock': { bus: 'world', db: -11, floor: 1, amount: 1, priority: 2, cooldown: 0.1, vary: 0.05, make: world(W.railLock) },
  'flip.click': { bus: 'world', db: -14, floor: 1, amount: 1, priority: 2, cooldown: 0.05, vary: 0.06, make: world(W.flipClick) },
  'flip.catch': { bus: 'world', db: -12, floor: 0.6, amount: 0.8, priority: 2, cooldown: 0.05, vary: 0.05, make: world(W.flipCatch) },
  letter: { bus: 'ui', db: -13, floor: 1, amount: 1, priority: 3, cooldown: 0.05, vary: 0, make: meta(M.letter) },
  'combo.bank': { bus: 'ui', db: -14, floor: 0.6, amount: 0.6, priority: 2, cooldown: 0.2, vary: 0.01, make: meta(M.comboBank) },
  'combo.lost': { bus: 'ui', db: -12, floor: 1, amount: 1, priority: 2, cooldown: 0.3, vary: 0.03, make: meta(M.comboLost) },
  'hero.start': { bus: 'ui', db: -6, floor: 1, amount: 1, priority: 3, cooldown: 1, vary: 0, make: meta(M.heroStart) },
  'hero.end': { bus: 'ui', db: -11, floor: 1, amount: 1, priority: 3, cooldown: 1, vary: 0, make: meta(M.heroEnd) },
  'crowd.cheer': { bus: 'world', db: -11, floor: 1, amount: 0.7, priority: 2, cooldown: 0.9, vary: 0.04, make: () => undefined },
  'crowd.ooh': { bus: 'world', db: -12, floor: 0.6, amount: 0.7, priority: 2, cooldown: 0.8, vary: 0.05, make: (v, t, a) => ooh(v, t, a) },
  'countdown.tick': { bus: 'ui', db: -13, floor: 1, amount: 1, priority: 3, cooldown: 0.1, vary: 0, make: meta(M.countdownTick) },
  'countdown.go': { bus: 'ui', db: -10, floor: 1, amount: 1, priority: 3, cooldown: 0.3, vary: 0, make: meta(M.countdownGo) },
  goal: { bus: 'ui', db: -9, floor: 1, amount: 1, priority: 3, cooldown: 0.5, vary: 0, make: meta(M.goal) },
  'camera.shutter': { bus: 'ui', db: -13, floor: 1, amount: 1, priority: 2, cooldown: 0.25, vary: 0.03, make: meta(M.cameraShutter) },
  twang: { bus: 'world', db: -12, floor: 0.35, amount: 0.6, priority: 2, cooldown: 0.15, vary: 0.08, make: world(W.twang) },
  whoosh: { bus: 'world', db: -19, floor: 0.6, amount: 0.6, priority: 1, cooldown: 0.12, vary: 0.12, make: world(W.whoosh) },
  grab: { bus: 'world', db: -19, floor: 1, amount: 1, priority: 1, cooldown: 0.1, vary: 0.1, make: world(W.grab) },
  handle: { bus: 'world', db: -17, floor: 1, amount: 1, priority: 1, cooldown: 0.1, vary: 0.08, make: world(W.handle) },
  swish: { bus: 'world', db: -15, floor: 1, amount: 1, priority: 1, cooldown: 0.15, vary: 0.1, make: world(W.swish) },
  bonus: { bus: 'ui', db: -14, floor: 1, amount: 1, priority: 2, cooldown: 0.15, vary: 0.01, make: meta(M.bonus) },
  'hero.ready': { bus: 'ui', db: -14, floor: 1, amount: 1, priority: 2, cooldown: 1, vary: 0, make: meta(M.heroReady) },
};

/**
 * Gain that maps the recipe's raw output to the peak promised by `db`. Recipes are written with
 * convenient internal amplitudes; this table (raw peak in dB, measured offline at amount = default)
 * takes the guesswork out of the level. See dev/audio.html → "calibration".
 */
const RAW_PEAK_DB: Record<SfxName, number> = {
  'ui.tap': 0.8,
  'ui.back': -0.2,
  'ui.buy': 3.5,
  'ui.star': 5.3,
  'ui.unlock': 0.6,
  pop: 1,
  'land.water': 0.8,
  'land.hard': 1.8,
  'splash.big': 2.9,
  'bail.water': 2.9,
  'bail.concrete': 0.9,
  'rail.lock': 5.1,
  'flip.click': -4.5,
  'flip.catch': 0.2,
  letter: 1.9,
  'combo.bank': -3,
  'combo.lost': 5,
  'hero.start': 4.2,
  'hero.end': -1.7,
  'crowd.cheer': -5,
  'crowd.ooh': -8.2,
  'countdown.tick': 0,
  'countdown.go': 4,
  goal: 0.2,
  'camera.shutter': -0.7,
  twang: -7.6,
  whoosh: -13.5,
  grab: -4.9,
  handle: -9.1,
  swish: -6,
  bonus: 2.6,
  'hero.ready': 2.5,
};

export const SFX_IDS = Object.keys(SPECS).filter((k) => !['twang', 'whoosh', 'grab', 'handle', 'swish', 'bonus', 'hero.ready'].includes(k)) as SfxId[];
export const INTERNAL_SFX: readonly InternalSfx[] = ['twang', 'whoosh', 'grab', 'handle', 'swish', 'bonus', 'hero.ready'];

export class Sfx {
  private readonly last = new Map<SfxName, number>();
  private letterStep = 0;
  /** Offline calibration run: unity voice gain and no random pitch → measures RAW_PEAK_DB. */
  calibrating = false;

  constructor(private readonly core: AudioCore) {}

  /** New run: the letter chime starts from the bottom of the scale again. */
  resetRun(): void {
    this.letterStep = 0;
  }

  /** Target peak level (dBFS at sfx volume 1, before the master chain) of a sound at full amount. */
  static targetDb(id: SfxName): number {
    return SPECS[id].db;
  }

  play(id: SfxName, o: SfxOpts = {}): void {
    const spec = SPECS[id];
    if (!spec) return;
    const core = this.core;
    const now = core.now;
    if (o.at === undefined) {
      const last = this.last.get(id);
      if (last !== undefined && now - last < spec.cooldown) return;
      this.last.set(id, now);
    }
    const a = clamp(o.amount ?? spec.amount, 0, 1);
    const cal = this.calibrating ? 1 : dbToGain(spec.db - RAW_PEAK_DB[id]);
    const level = cal * clamp(o.volume ?? 1, 0, 2) * (spec.floor + (1 - spec.floor) * a);
    const pitch = clamp(o.pitch ?? 1, 0.25, 4) * (this.calibrating ? 1 : 1 + (core.rnd() * 2 - 1) * spec.vary);
    const at = o.at ?? (o.delay ? now + o.delay : undefined);
    if (id === 'crowd.cheer') {
      cheer(core, level, a, pitch, at);
      return;
    }
    const v = core.voice(spec.bus, level, o.pan ?? 0, spec.priority, pitch, at);
    if (!v) return;
    let opts = o;
    if (id === 'letter') {
      this.letterStep = o.step ?? (this.letterStep % 6) + 1;
      opts = { ...o, step: this.letterStep };
    } else if (id === 'combo.bank' && o.step === undefined) {
      opts = { ...o, step: 2 + Math.round(a * 6) };
    }
    spec.make(v, v.t, a, opts);
  }
}
