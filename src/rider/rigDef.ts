/**
 * Rider rig definition: bone ids, body proportions, atlas layout and the resolved outfit.
 * Headless-safe (no DOM / WebGL).
 */
import { BRAND, SKIN_TONES } from '../config';
import { getGear } from '../data/gear';
import type { BoardKind, GearLook, RiderAppearance, RiderLook, Stance } from '../types';

/**
 * Flat skeleton — every bone is a direct child of the rig root and keeps the root's axes in bind pose
 * (character faces +Z, left = +X). L = the character's left side. The boot / cuff bones carry the
 * wakeboard boots so they can stay on the board when the rider steps off (menu idle pose).
 */
export const B = {
  pelvis: 0,
  spine: 1,
  chest: 2,
  neck: 3,
  head: 4,
  uarmL: 5,
  larmL: 6,
  handL: 7,
  uarmR: 8,
  larmR: 9,
  handR: 10,
  thighL: 11,
  shinL: 12,
  footL: 13,
  thighR: 14,
  shinR: 15,
  footR: 16,
  bootL: 17,
  cuffL: 18,
  bootR: 19,
  cuffR: 20,
} as const;
export const BONE_COUNT = 21;

export interface Proportions {
  female: boolean;
  /** height / 1.78 — pose offsets authored for the male figure are multiplied by this. */
  scale: number;
  height: number;
  // bind-pose joint heights above the sole
  ankleY: number;
  kneeY: number;
  hipY: number;
  pelvisY: number;
  spineY: number;
  chestY: number;
  shoulderY: number;
  neckY: number;
  headY: number;
  headCenterY: number;
  // widths / lengths
  hipHalf: number;
  shoulderHalf: number;
  thigh: number;
  shin: number;
  uarm: number;
  larm: number;
  footLen: number;
  /** Head ellipsoid half extents. */
  headRx: number;
  headRy: number;
  headRz: number;
  /** Limb thickness multiplier. */
  girth: number;
  /** Half distance between the feet on a wakeboard / wakeskate. */
  stanceWakeboard: number;
  stanceWakeskate: number;
}

export function proportionsFor(female: boolean): Proportions {
  const s = female ? 1.68 / 1.78 : 1;
  const ankleY = 0.085 * s;
  const shin = 0.42 * s;
  const thigh = 0.43 * s;
  const hipY = ankleY + shin + thigh;
  return {
    female,
    scale: s,
    height: 1.78 * s,
    ankleY,
    kneeY: ankleY + shin,
    hipY,
    pelvisY: hipY + 0.05 * s,
    spineY: hipY + 0.165 * s,
    chestY: hipY + 0.325 * s,
    shoulderY: hipY + 0.52 * s,
    neckY: hipY + 0.572 * s,
    headY: hipY + 0.632 * s,
    headCenterY: hipY + 0.722 * s,
    hipHalf: female ? 0.088 : 0.09,
    shoulderHalf: female ? 0.158 : 0.186,
    thigh,
    shin,
    uarm: 0.285 * s,
    larm: 0.255 * s,
    footLen: female ? 0.238 : 0.262,
    headRx: female ? 0.073 : 0.076,
    headRy: female ? 0.108 : 0.113,
    headRz: female ? 0.088 : 0.092,
    girth: female ? 0.86 : 1,
    stanceWakeboard: female ? 0.27 : 0.29,
    stanceWakeskate: female ? 0.225 : 0.24,
  };
}

// ─────────────────────────────────────────────────────────────── Atlas ──

/** Body atlas (colour 1024², roughness same layout). Rects are canvas pixels [x, y, w, h]. */
export const ATLAS = {
  size: 1024,
  face: [0, 0, 512, 512],
  torso: [512, 0, 512, 512],
  vest: [0, 512, 512, 512],
  legs: [512, 512, 256, 256],
  boot: [768, 512, 256, 256],
  headwear: [512, 768, 512, 192],
  swatches: [512, 960, 512, 64],
} as const;

/** Plain (white) atlas cells that only differ in roughness — flat-coloured parts point their UVs here. */
export const SWATCH = { gloss: 0, semi: 1, skin: 2, rubber: 3, cloth: 4, matte: 5, hair: 6, eva: 7 } as const;
export const SWATCH_ROUGHNESS = [0.24, 0.42, 0.44, 0.55, 0.84, 0.95, 0.5, 0.9]; // skin + neoprene read wet

export type AtlasRect = readonly [number, number, number, number];

/** Canvas rect → [u0, v0, u1, v1] (v0 = bottom edge of the rect). `inset` in pixels. */
export function rectUV(r: AtlasRect, inset = 0, size: number = ATLAS.size): [number, number, number, number] {
  return [(r[0] + inset) / size, 1 - (r[1] + r[3] - inset) / size, (r[0] + r[2] - inset) / size, 1 - (r[1] + inset) / size];
}

export function swatchUV(k: number): [number, number] {
  const r = ATLAS.swatches;
  return [(r[0] + k * 64 + 32) / ATLAS.size, 1 - (r[1] + 32) / ATLAS.size];
}

// ─────────────────────────────────────────────────────────────── Outfit ──

export interface Outfit {
  female: boolean;
  stance: Stance;
  skin: number;
  hair: RiderAppearance['hair'];
  hairColor: number;
  headwear: 'none' | 'helmet' | 'cap';
  headLook: GearLook;
  vest: GearLook | null;
  bottom: 'shorts' | 'wetsuit';
  bottomLook: GearLook;
  top: 'tee' | 'hoodie' | 'jersey';
  topLook: GearLook;
  bindings: GearLook;
  wakeboard: GearLook;
  wakeskate: GearLook;
}

const DEFAULT_BOARD: GearLook = { primary: BRAND.colors.red, secondary: BRAND.colors.dark, accent: BRAND.colors.white, graphic: 'logo' };
const DEFAULT_SKATE: GearLook = { primary: 0xc79a5b, secondary: BRAND.colors.dark, accent: BRAND.colors.red, graphic: 'wood' };
const DEFAULT_BINDINGS: GearLook = { primary: BRAND.colors.dark, secondary: BRAND.colors.red, accent: BRAND.colors.white, graphic: 'logo' };

function plain(primary: number, graphic: GearLook['graphic'] = 'logo'): GearLook {
  // readable trim on any base colour: dark trim on light colours, white on dark ones
  const r = (primary >> 16) & 255;
  const g = (primary >> 8) & 255;
  const b = primary & 255;
  const luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const isRed = r > 170 && g < 80 && b < 80;
  return {
    primary,
    secondary: luma > 0.3 ? BRAND.colors.dark : BRAND.colors.grey,
    accent: luma > 0.72 ? BRAND.colors.red : isRed ? BRAND.colors.white : luma > 0.3 ? BRAND.colors.white : BRAND.colors.red,
    graphic,
  };
}

/**
 * RiderLook → concrete outfit. Equipped gear wins over the editor appearance for the slot it fills
 * (same rule as the contract states for headwear); unknown / null gear ids fall back to the appearance.
 */
export function resolveOutfit(look: RiderLook): Outfit {
  const a = look.appearance;
  const g = look.gear;
  const helmet = getGear(g.helmet);
  const vestGear = getGear(g.vest);
  const apparel = getGear(g.apparel);
  const kind = apparel?.apparelKind;

  let headwear: Outfit['headwear'] = a.headwear;
  let headLook = plain(a.headwearColor);
  if (helmet && helmet.category === 'helmet') {
    headwear = helmet.headKind ?? 'helmet';
    headLook = helmet.look;
  }

  let bottom: Outfit['bottom'] = a.bottom;
  let bottomLook = plain(a.bottomColor, 'stripe');
  let top: Outfit['top'] = 'tee';
  let topLook = plain(a.topColor);
  if (apparel && apparel.category === 'apparel') {
    if (kind === 'wetsuit' || kind === 'shorts') {
      bottom = kind;
      bottomLook = apparel.look;
    } else if (kind === 'tee' || kind === 'hoodie' || kind === 'jersey') {
      top = kind;
      topLook = apparel.look;
    }
  }

  return {
    female: a.gender === 'female',
    stance: look.stance,
    skin: sunTan(SKIN_TONES[Math.max(0, Math.min(SKIN_TONES.length - 1, a.skin | 0))] ?? SKIN_TONES[1]),
    hair: a.hair,
    hairColor: a.hairColor,
    headwear,
    headLook,
    vest: a.vest ? (vestGear && vestGear.category === 'vest' ? vestGear.look : plain(a.vestColor)) : null,
    bottom,
    bottomLook,
    top,
    topLook,
    bindings: getGear(g.bindings)?.look ?? DEFAULT_BINDINGS,
    wakeboard: getGear(g.wakeboard)?.look ?? DEFAULT_BOARD,
    wakeskate: getGear(g.wakeskate)?.look ?? DEFAULT_SKATE,
  };
}

/** Riders live outdoors: light skin tones pick up a warm tan (dark tones are left as they are). */
export function sunTan(skin: number): number {
  const r = (skin >> 16) & 255;
  const g = (skin >> 8) & 255;
  const b = skin & 255;
  const luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const k = 0.5 * Math.max(0, Math.min(1, (luma - 0.42) / 0.3));
  const m = (c: number, t: number): number => Math.round(c + (t - c) * k);
  return (m(r, 0xa6) << 16) | (m(g, 0x62) << 8) | m(b, 0x34);
}

export function lookKey(l: GearLook | null): string {
  return l ? `${l.primary.toString(16)}.${l.secondary.toString(16)}.${l.accent.toString(16)}.${l.graphic}` : '-';
}

/** Signatures used by setLook() to rebuild only what changed. */
export function outfitKeys(o: Outfit, board: BoardKind): { atlas: string; body: string; head: string; board: string } {
  const atlas = [
    o.female ? 'f' : 'm',
    o.skin.toString(16),
    o.hairColor.toString(16),
    o.headwear,
    lookKey(o.headLook),
    lookKey(o.vest),
    o.bottom,
    lookKey(o.bottomLook),
    o.top,
    lookKey(o.topLook),
    lookKey(o.bindings),
  ].join('|');
  const body = [o.female ? 'f' : 'm', o.skin.toString(16), o.vest ? lookKey(o.vest) : '-', o.bottom, lookKey(o.bottomLook), o.top, lookKey(o.topLook), board, lookKey(o.bindings)].join('|');
  const head = [o.female ? 'f' : 'm', o.skin.toString(16), o.hair, o.hairColor.toString(16), o.headwear, lookKey(o.headLook)].join('|');
  const brd = [board, lookKey(board === 'wakeboard' ? o.wakeboard : o.wakeskate), board === 'wakeboard' ? lookKey(o.bindings) : '-', o.female ? 'f' : 'm'].join('|');
  return { atlas, body, head, board: brd };
}
