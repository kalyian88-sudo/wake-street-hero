/**
 * Global configuration: brand, quality profiles, shared gameplay constants.
 * Николай: бренд-настройки (ник, ссылка на сайт, цвета) меняются здесь.
 */
import type { GearStats, PowerLevel, QualityLevel, QualityProfile, RiderAppearance, Settings } from './types';

export const BRAND = {
  name: 'WHY NOT',
  gameTitle: 'WHY NOT: Wake Street Hero',
  /** Instagram handle printed on the share card. */
  handle: '@whynot_wakeboard',
  /** Default target of every "Смотреть на сайте" button (per-item override in src/data/gear.ts). */
  siteUrl: 'https://whynotwake.com',
  colors: {
    red: 0xe30613,
    dark: 0x1c1d21,
    darker: 0x101114,
    grey: 0x3a3c43,
    white: 0xffffff,
  },
  css: {
    red: '#E30613',
    dark: '#1C1D21',
    darker: '#101114',
    grey: '#3A3C43',
    white: '#FFFFFF',
  },
} as const;

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: {
    level: 'low',
    dprCap: 1,
    shadows: false,
    shadowMapSize: 512,
    shadowRange: 18,
    post: false,
    bloom: false,
    aa: 'none',
    waterDetail: 0,
    particles: 0.4,
    detail: 0.5,
    drawDistance: 380,
    anisotropy: 1,
  },
  medium: {
    level: 'medium',
    dprCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    shadowRange: 22,
    post: true,
    bloom: true,
    aa: 'fxaa',
    waterDetail: 1,
    particles: 0.75,
    detail: 0.8,
    drawDistance: 520,
    anisotropy: 4,
  },
  high: {
    level: 'high',
    dprCap: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowRange: 28,
    post: true,
    bloom: true,
    aa: 'smaa',
    waterDetail: 2,
    particles: 1,
    detail: 1,
    drawDistance: 700,
    anisotropy: 8,
  },
};

/** Winch reel-in speed (m/s) per power setting. */
export const WINCH_SPEED: Record<PowerLevel, number> = { slow: 7.5, medium: 9.5, fast: 11.5 };

/** Shared gameplay constants referenced by several modules. Sim-only tuning lives in src/physics/tuning.ts. */
export const GAME = {
  /** Seconds a combo stays alive between tricks. */
  comboWindow: 3,
  /** HERO mode duration (real seconds). */
  heroDuration: 8,
  /** Global time scale while a trick is in progress. */
  slowMoScale: 0.35,
  /** HERO mode: time scale when no trick is in progress… */
  heroBaseScale: 0.6,
  /** …and while a trick is in progress (super slow-mo). */
  heroTrickScale: 0.22,
  /** Run ends when the rider is this close to the winch (m). */
  finishRadius: 9,
  /** Letter pickup radius (m). */
  letterRadius: 1.6,
  /** Height (m) above its base position where the rope leaves the winch drum. */
  winchAnchorHeight: 0.9,
  /** Countdown seconds before GO. */
  countdown: 3,
  letters: ['W', 'H', 'Y', 'N', 'O', 'T'] as const,
} as const;

export const NEUTRAL_STATS: GearStats = { pop: 5, spin: 5, rail: 5, landing: 5, catch: 5 };

export const SKIN_TONES: readonly number[] = [0xf6d7bd, 0xe9bd97, 0xd29a6c, 0xb47a4e, 0x8a5a36, 0x5b3a22];
export const HAIR_COLORS: readonly number[] = [0x1b1512, 0x4a2f1c, 0x8a5a2b, 0xc9a35a, 0xe8d9a8, 0xb5382a, 0x9aa3ad, 0x2a5fd0, 0xe30613];

/** Default rider = the WHY NOT team rider: pink ?! jersey, long navy boardshorts, black ?! helmet, no vest. */
export const DEFAULT_APPEARANCE: RiderAppearance = {
  gender: 'male',
  skin: 1,
  hair: 'short',
  hairColor: 0x4a2f1c,
  headwear: 'helmet',
  headwearColor: 0x101114,
  vest: false,
  vestColor: 0xe30613,
  bottom: 'shorts',
  bottomColor: 0x1f2a44,
  topColor: 0xf3a3bd,
};

/** The pre-v4 default look — saves still wearing it are moved to the new team look by the v3→v4 migration. */
export const LEGACY_DEFAULT_APPEARANCE_V3 = {
  vest: true,
  vestColor: 0xe30613,
  bottomColor: 0x1c1d21,
  topColor: 0xffffff,
  headwearColor: 0x1c1d21,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  lang: 'auto',
  quality: 'auto',
  musicVolume: 0.6,
  sfxVolume: 0.9,
  stance: 'regular',
  haptics: true,
  invertY: false,
  showFps: false,
  controls: 'swipe',
};

/** Ids of the gear every new player owns (must exist in src/data/gear.ts). */
export const STARTER_GEAR = {
  wakeboard: 'wb_street',
  bindings: 'bd_classic',
  wakeskate: 'ws_plank',
  vest: 'vest_basic',
  helmet: 'helmet_basic',
  apparel: 'jersey_pink',
} as const;

export const SAVE_KEY = 'whynot.wsh.save';
export const SAVE_VERSION = 4;
