/**
 * Pure mapping RiderSimState → target levels / pitches of the continuous sound layers.
 * No WebAudio; writes into a preallocated struct (called every frame — must not allocate).
 */
import type { RiderSimState, SurfaceKind } from '../types';
import { clamp } from './theory';

export type ScrapeKind = 'metal' | 'stone' | 'wood' | 'plastic' | 'concrete' | 'wet' | 'soft';

export interface LayerTargets {
  /** 0 while paused, else 1 (layer bus gain). */
  master: number;
  /** 0..1 normalised horizontal speed (14 m/s = 1). */
  speed: number;
  water: number;
  waterCutoff: number;
  /** High "fizz" band that only appears at speed. */
  fizz: number;
  carve: number;
  carvePan: number;
  chatter: number;
  chatterRate: number;
  wind: number;
  windFreq: number;
  engine: number;
  /** Firing frequency in Hz. */
  engineHz: number;
  engineLoad: number;
  enginePan: number;
  rope: number;
  ropeHz: number;
  /** Rope tension 0..1 while it is actually pulling (drives the creaks). */
  tension: number;
  /** Solid-surface slide loop (mode 'slide' / 'wall'). */
  slide: number;
  slideKind: ScrapeKind | null;
  /** Level of the rail grind loop while mode === 'rail'. */
  grind: number;
  hero: number;
}

export function createLayerTargets(): LayerTargets {
  return {
    master: 1,
    speed: 0,
    water: 0,
    waterCutoff: 500,
    fizz: 0,
    carve: 0,
    carvePan: 0,
    chatter: 0,
    chatterRate: 10,
    wind: 0,
    windFreq: 400,
    engine: 0,
    engineHz: 26,
    engineLoad: 0,
    enginePan: 0,
    rope: 0,
    ropeHz: 62,
    tension: 0,
    slide: 0,
    slideKind: null,
    grind: 0,
    hero: 0,
  };
}

export function surfaceScrape(surface: SurfaceKind | 'air' | 'rail' | 'wall'): ScrapeKind | null {
  switch (surface) {
    case 'wetConcrete':
      return 'wet';
    case 'concrete':
    case 'asphalt':
    case 'tile':
    case 'wall':
      return 'concrete';
    case 'stone':
      return 'stone';
    case 'wood':
      return 'wood';
    case 'metal':
      return 'metal';
    case 'grass':
    case 'sand':
      return 'soft';
    default:
      return null;
  }
}

export function railScrape(material: 'metal' | 'stone' | 'wood' | 'plastic'): ScrapeKind {
  return material;
}

/** Winch engine firing frequency: idle ≈ 26 Hz, flat out ≈ 90 Hz, bogging down a little under load. */
export function engineHz(reelSpeed: number, load: number): number {
  const rpm = clamp(reelSpeed / 12, 0, 1);
  return (26 + 64 * Math.pow(rpm, 0.9)) * (1 - 0.09 * clamp(load, 0, 1));
}

/** Loudness of the winch by distance: 0.35 at the far end of the line (still there, just small), 1 next to it. */
export function winchAttenuation(dist: number): number {
  const near = 1 - clamp(dist / 110, 0, 1);
  return 0.35 + 0.65 * Math.pow(near, 1.7);
}

export function computeLayerTargets(state: RiderSimState | null, paused: boolean, out: LayerTargets): LayerTargets {
  out.master = paused ? 0 : 1;
  if (!state) {
    out.speed = 0;
    out.water = out.fizz = out.carve = out.chatter = out.wind = out.engine = out.rope = out.tension = out.slide = out.grind = out.hero = 0;
    out.engineLoad = 0;
    out.slideKind = null;
    return out;
  }
  const mode = state.mode;
  const speed = clamp(state.speed / 14, 0, 1);
  const lean = clamp(state.lean, -1, 1);
  const absLean = Math.abs(lean);
  out.speed = speed;

  const onWater = mode === 'water' && state.surface === 'water';
  if (onWater) {
    out.water = 0.12 + 0.88 * Math.pow(speed, 0.8);
    out.waterCutoff = 500 + 3300 * speed;
    out.fizz = speed * speed;
  } else if (mode === 'waiting' || mode === 'finished') {
    // sitting in the water: quiet lapping
    out.water = 0.07;
    out.waterCutoff = 450;
    out.fizz = 0;
  } else if (mode === 'bail' && state.bail && state.bail.surface === 'water') {
    out.water = 0.14;
    out.waterCutoff = 380;
    out.fizz = 0;
  } else {
    out.water = 0;
    out.fizz = 0;
  }

  out.carve = onWater && speed > 0.05 ? clamp(absLean * (0.25 + 0.75 * speed) * 1.3, 0, 1) : 0;
  // leaning right throws the spray wall out to the left
  out.carvePan = -lean * 0.6;

  out.chatter = onWater ? speed * (1 - 0.6 * absLean) * 0.7 : mode === 'slide' ? 0.5 + 0.5 * speed : 0;
  out.chatterRate = 9 + 16 * speed;

  const height = clamp(state.air.height / 3.5, 0, 1);
  if (mode === 'air') out.wind = (0.25 + 0.75 * Math.pow(height, 0.7)) * (0.35 + 0.65 * speed);
  else if (mode === 'bail' || mode === 'waiting' || mode === 'finished') out.wind = 0;
  else out.wind = 0.1 * speed * speed;
  out.windFreq = 380 + 900 * speed + 250 * height;

  const rope = state.rope;
  const load = rope.taut && rope.holding ? clamp(rope.tension, 0, 1) : 0;
  const rpm = clamp(rope.reelSpeed / 12, 0, 1);
  const near = 1 - clamp(state.distToWinch / 110, 0, 1);
  out.engineHz = engineHz(rope.reelSpeed, load);
  out.engineLoad = load;
  out.engine = (0.45 + 0.35 * rpm + 0.2 * load) * winchAttenuation(state.distToWinch);
  // + = winch is to the left of the direction of travel → pan left; centred when standing next to it
  const leftness = rope.dir.x * Math.cos(state.heading) - rope.dir.z * Math.sin(state.heading);
  out.enginePan = clamp(-leftness, -1, 1) * 0.6 * (1 - near * near * near);

  out.tension = load;
  out.rope = Math.pow(load, 1.4);
  out.ropeHz = 62 + 70 * load;

  if (mode === 'slide') {
    out.slideKind = surfaceScrape(state.surface);
    out.slide = out.slideKind ? 0.3 + 0.7 * speed : 0;
  } else if (mode === 'wall') {
    out.slideKind = 'concrete';
    out.slide = 0.35 + 0.65 * speed;
  } else {
    out.slideKind = null;
    out.slide = 0;
  }
  out.grind = mode === 'rail' ? 0.35 + 0.65 * speed : 0;
  out.hero = state.hero ? 1 : 0;
  return out;
}
