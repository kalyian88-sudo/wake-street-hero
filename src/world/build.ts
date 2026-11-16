/**
 * Shared state of one spot build: batchers, material library, terrain queries, per-frame updaters.
 */
import type { BufferGeometry, Material, Object3D } from 'three';
import type { FoamShape, QualityProfile, SpotDef } from '../types';
import type { InstanceBatcher, StaticBatcher } from './batch';
import type { MaterialLibrary } from './materials';
import type { Terrain } from './terrain';

export type Updater = (dt: number, time: number) => void;

export interface BuildCtx {
  spot: SpotDef;
  profile: QualityProfile;
  lib: MaterialLibrary;
  terrain: Terrain;
  statics: StaticBatcher;
  instances: InstanceBatcher;
  /** Parent of every unbatched object. */
  dynamic: Object3D;
  updaters: Updater[];
  /** Per-build cache of shared geometries (instanced props). */
  shared: Map<string, BufferGeometry>;
  /** Outlines of things standing in the water (→ IWater.setFoamShapes). */
  foam: FoamShape[];
  mat(key: string, opts?: Record<string, unknown>): Material;
}

/** Wet / algae colouring of a vertical surface standing in water: multiplier for a vertex at height y. */
export function wetShade(y: number, level: number): number {
  const d = y - level;
  if (d <= -0.25) return 0.42;
  if (d <= 0.06) return 0.5;
  if (d <= 0.4) return 0.5 + ((d - 0.06) / 0.34) * 0.5;
  return 1;
}

/** Hex of the algae tint blended in around the waterline. */
export const ALGAE = 0x4a5a3a;
export function algaeWeight(y: number, level: number): number {
  const d = y - level;
  if (d < -0.5 || d > 0.45) return 0;
  return d < 0.05 ? 0.55 : 0.55 * (1 - (d - 0.05) / 0.4);
}
