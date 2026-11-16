/**
 * Global time scale (PLAN §4.3). The sim asks for slow-motion through `state.slowMo` / `state.hero`;
 * this smooths the request in REAL time — fast in (~0.15 s), slower out (~0.35 s) — so tricks snap
 * into slow-mo but the world eases back to speed.
 */
import { GAME } from '../config';
import { clamp01, expDamp } from './math';

/** exp(−rate · T) = 5 % ⇒ rate = 3 / T. */
const RATE_IN = 3 / 0.15;
const RATE_OUT = 3 / 0.35;
const HERO_RATE_IN = 3 / 0.25;
const HERO_RATE_OUT = 3 / 0.5;

export class TimeScale {
  /** Current global scale (1 = real time). */
  scale = 1;
  /** 0..1 smoothed trick slow-mo amount (post grade, HUD vignette). */
  slowMo = 0;
  /** 0..1 smoothed HERO amount (post tint). */
  hero = 0;
  /** Debug multiplier (?debug time button). */
  debugScale = 1;

  reset(): void {
    this.scale = 1;
    this.slowMo = 0;
    this.hero = 0;
  }

  /**
   * @param realDt   unscaled seconds since the previous frame
   * @param wanted   0..1 slow-mo requested by the sim (state.slowMo)
   * @param heroOn   HERO mode active (state.hero)
   * @returns the scale to multiply realDt with
   */
  update(realDt: number, wanted: number, heroOn: boolean): number {
    const w = clamp01(wanted);
    this.slowMo = clamp01(expDamp(this.slowMo, w, w > this.slowMo ? RATE_IN : RATE_OUT, realDt));
    const h = heroOn ? 1 : 0;
    this.hero = clamp01(expDamp(this.hero, h, h > this.hero ? HERO_RATE_IN : HERO_RATE_OUT, realDt));
    if (Math.abs(this.slowMo - w) < 1e-4) this.slowMo = w;
    if (Math.abs(this.hero - h) < 1e-4) this.hero = h;

    const normal = 1 + (GAME.slowMoScale - 1) * this.slowMo;
    const hero = GAME.heroBaseScale + (GAME.heroTrickScale - GAME.heroBaseScale) * this.slowMo;
    this.scale = (normal + (hero - normal) * this.hero) * this.debugScale;
    return this.scale;
  }
}
