/**
 * Quality manager: fixed level (settings / ?quality=) or adaptive ("auto").
 *
 * Auto picks a starting level from device hints, then watches a rolling FPS window:
 *   – average < 50 fps for ~2.5 s            → one level down
 *   – average > 58 fps WITH headroom ~10 s  → one level up
 * Hysteresis: after every change there is a cool-down, a level that had to be abandoned is blocked
 * for a while (twice → for the whole session), so it can never oscillate. The first second after a
 * load and any frame while the tab was hidden / hitching are not judged.
 */
import { QUALITY_PROFILES } from '../config';
import type { QualityLevel, QualityProfile, QualitySetting } from '../types';
import type { EventBus } from './events';

export const QUALITY_ORDER: readonly QualityLevel[] = ['low', 'medium', 'high'];

export interface DeviceHints {
  cores: number;
  memoryGb: number;
  /** Shorter screen side in physical pixels. */
  screenMin: number;
  mobile: boolean;
}

export function readDeviceHints(): DeviceHints {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & { deviceMemory?: number };
  const scr = typeof screen !== 'undefined' ? screen : { width: 1280, height: 720 };
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return {
    cores: nav.hardwareConcurrency || 4,
    memoryGb: nav.deviceMemory ?? 4,
    screenMin: Math.min(scr.width, scr.height) * dpr,
    mobile: coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent ?? ''),
  };
}

/** Conservative first guess; the governor corrects it within seconds. */
export function pickStartLevel(h: DeviceHints): QualityLevel {
  if (h.memoryGb <= 2 || h.cores <= 2) return 'low';
  if (h.mobile) {
    // Small-screen budget phones: 4 cores / ≤3 GB.
    if (h.cores <= 4 && h.memoryGb <= 3) return 'low';
    return 'medium';
  }
  if (h.cores >= 8 && h.memoryGb >= 8 && h.screenMin >= 900) return 'high';
  return 'medium';
}

const WINDOW_SEC = 1;
const RING = 180;
const GRACE_SEC = 1;
const DOWN_FPS = 50;
const DOWN_HOLD = 2.5;
const UP_FPS = 58;
const UP_HOLD = 10;
const COOLDOWN_DOWN = 4;
const COOLDOWN_UP = 6;
const BLOCK_SEC = 30;
/** A frame longer than this is an interruption (tab switch, shader compile, load), not performance. */
const HITCH_SEC = 0.25;
/** CPU work per frame (ms) that still counts as "headroom" for stepping up. */
const HEADROOM_CPU_MS = 9;
const SLOW_FRAME_SEC = 1 / 40;
/** This many over-long frames in a row are real slowness, not an interruption. */
const HITCH_RUN = 6;

/** Headless decision logic (unit-tested). Feed it one sample per rendered frame. */
export class AutoQualityGovernor {
  level: QualityLevel;
  private readonly dts = new Float32Array(RING);
  private readonly cpu = new Float32Array(RING);
  private head = 0;
  private count = 0;
  private sum = 0;
  private cpuSum = 0;
  private slowFrames = 0;
  private grace = GRACE_SEC;
  private cooldown = 0;
  private lowTime = 0;
  private highTime = 0;
  private clock = 0;
  private hitchRun = 0;
  /** Per level: how often we had to step down FROM it, and until when stepping up TO it is blocked. */
  private readonly fails: Record<QualityLevel, number> = { low: 0, medium: 0, high: 0 };
  private readonly blockedUntil: Record<QualityLevel, number> = { low: 0, medium: 0, high: 0 };

  constructor(start: QualityLevel) {
    this.level = start;
  }

  /** Rolling average FPS over the last second (0 while the window is empty). */
  get fps(): number {
    return this.sum > 0 ? this.count / this.sum : 0;
  }

  /** Load finished / tab became visible / manual change: forget the window, wait a second. */
  interruption(): void {
    this.clearWindow();
    this.grace = GRACE_SEC;
    this.lowTime = 0;
    this.highTime = 0;
  }

  setLevel(level: QualityLevel): void {
    this.level = level;
    this.interruption();
  }

  private clearWindow(): void {
    this.head = 0;
    this.count = 0;
    this.sum = 0;
    this.cpuSum = 0;
    this.slowFrames = 0;
  }

  private push(dt: number, cpuMs: number): void {
    if (this.count === RING) this.pop();
    const i = (this.head + this.count) % RING;
    this.dts[i] = dt;
    this.cpu[i] = cpuMs;
    this.count++;
    this.sum += dt;
    this.cpuSum += cpuMs;
    if (dt > SLOW_FRAME_SEC) this.slowFrames++;
    while (this.count > 1 && this.sum - this.dts[this.head] >= WINDOW_SEC) this.pop();
  }

  private pop(): void {
    const dt = this.dts[this.head];
    this.sum -= dt;
    this.cpuSum -= this.cpu[this.head];
    if (dt > SLOW_FRAME_SEC) this.slowFrames--;
    this.head = (this.head + 1) % RING;
    this.count--;
  }

  private stepDown(): QualityLevel | null {
    const idx = QUALITY_ORDER.indexOf(this.level);
    if (idx <= 0) return null;
    const from = this.level;
    this.fails[from]++;
    this.blockedUntil[from] = this.fails[from] >= 2 ? Infinity : this.clock + BLOCK_SEC;
    this.level = QUALITY_ORDER[idx - 1];
    this.interruption();
    this.cooldown = COOLDOWN_DOWN;
    return this.level;
  }

  /**
   * @param dt     real seconds since the previous rendered frame (unclamped)
   * @param cpuMs  JS + draw submission time of that frame
   * @returns the new level when it changed, else null
   */
  sample(dt: number, cpuMs: number): QualityLevel | null {
    if (!(dt > 0)) return null;
    if (dt > HITCH_SEC) {
      // One long frame is an interruption. A whole run of them is a device that cannot cope at all
      // (it would never fill a window), so that still has to step down.
      this.clock += HITCH_SEC;
      this.cooldown -= HITCH_SEC;
      this.clearWindow();
      this.highTime = 0;
      this.lowTime = 0;
      if (++this.hitchRun >= HITCH_RUN && this.cooldown <= 0) {
        this.hitchRun = 0;
        return this.stepDown();
      }
      return null;
    }
    this.hitchRun = 0;
    this.clock += dt;
    if (this.grace > 0) {
      this.grace -= dt;
      return null;
    }
    this.push(dt, cpuMs);
    if (this.cooldown > 0) this.cooldown -= dt;
    // Judge only once the window holds (almost) a full second.
    if (this.sum < WINDOW_SEC * 0.9) return null;

    const fps = this.count / this.sum;
    const idx = QUALITY_ORDER.indexOf(this.level);

    if (fps < DOWN_FPS) {
      this.lowTime += dt;
      this.highTime = 0;
    } else {
      this.lowTime = Math.max(0, this.lowTime - dt * 2);
      const headroom = this.cpuSum / this.count < HEADROOM_CPU_MS && this.slowFrames <= 1;
      if (fps > UP_FPS && headroom) this.highTime += dt;
      else this.highTime = 0;
    }

    if (this.lowTime >= DOWN_HOLD && this.cooldown <= 0) {
      const next = this.stepDown();
      if (next) return next;
    }
    if (this.highTime >= UP_HOLD && idx < QUALITY_ORDER.length - 1 && this.cooldown <= 0) {
      const to = QUALITY_ORDER[idx + 1];
      if (this.clock >= this.blockedUntil[to]) {
        this.level = to;
        this.interruption();
        this.cooldown = COOLDOWN_UP;
        return this.level;
      }
      this.highTime = 0;
    }
    return null;
  }
}

export class QualityManager {
  private setting: QualitySetting;
  private readonly governor: AutoQualityGovernor;
  private current: QualityLevel;
  /** Called after the level changed (engine + session apply the profile). */
  onChange: ((profile: QualityProfile) => void) | null = null;

  /**
   * @param frozen when true the adaptive governor never changes the level (automation / screenshots).
   */
  constructor(
    private readonly bus: EventBus,
    setting: QualitySetting,
    private readonly frozen = false,
    hints: DeviceHints = readDeviceHints(),
  ) {
    this.setting = setting;
    this.governor = new AutoQualityGovernor(pickStartLevel(hints));
    this.current = setting === 'auto' ? this.governor.level : setting;
    if (setting !== 'auto') this.governor.setLevel(setting);
  }

  get level(): QualityLevel {
    return this.current;
  }

  get profile(): QualityProfile {
    return QUALITY_PROFILES[this.current];
  }

  get auto(): boolean {
    return this.setting === 'auto';
  }

  get settingValue(): QualitySetting {
    return this.setting;
  }

  /** Rolling FPS as seen by the governor (debug overlay). */
  get windowFps(): number {
    return this.governor.fps;
  }

  setSetting(setting: QualitySetting): void {
    if (setting === this.setting) return;
    this.setting = setting;
    // Auto continues from wherever we are now; a fixed level is applied directly.
    if (setting !== 'auto') this.governor.setLevel(setting);
    else this.governor.interruption();
    this.apply(setting === 'auto' ? this.governor.level : setting, true);
  }

  /** Debug: low → medium → high → auto → … */
  cycle(): QualitySetting {
    const order: QualitySetting[] = ['low', 'medium', 'high', 'auto'];
    const next = order[(order.indexOf(this.setting) + 1) % order.length];
    this.setSetting(next);
    return next;
  }

  /** Tab was hidden / a load just finished: do not judge the next second. */
  interruption(): void {
    this.governor.interruption();
  }

  /** Once per rendered frame. */
  frame(rawDt: number, cpuMs: number): void {
    if (this.setting !== 'auto' || this.frozen) return;
    const next = this.governor.sample(rawDt, cpuMs);
    if (next) this.apply(next, false);
  }

  private apply(level: QualityLevel, force: boolean): void {
    if (level === this.current && !force) return;
    const changed = level !== this.current;
    this.current = level;
    if (changed) this.onChange?.(QUALITY_PROFILES[level]);
    this.bus.emit('quality:changed', { level, auto: this.setting === 'auto' });
  }
}
