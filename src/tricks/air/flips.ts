/**
 * Wakeskate flip catalogue + stick → trick mappings for the air (PLAN §4.2).
 * Angles are board rotation RELATIVE TO THE FEET over one full flip (radians).
 */
import type { FlipId, GrabId } from '../../types';

const TAU = Math.PI * 2;

export interface FlipSpec {
  id: FlipId;
  /** Totals at progress = 1. */
  roll: number;
  yaw: number;
  pitch: number;
  /** Seconds for one flip (sim time). */
  time: number;
}

export const FLIPS: Record<FlipId, FlipSpec> = {
  shuvit: { id: 'shuvit', roll: 0, yaw: -Math.PI, pitch: 0, time: 0.4 },
  fsShuvit: { id: 'fsShuvit', roll: 0, yaw: Math.PI, pitch: 0, time: 0.4 },
  kickflip: { id: 'kickflip', roll: TAU, yaw: 0, pitch: 0, time: 0.45 },
  heelflip: { id: 'heelflip', roll: -TAU, yaw: 0, pitch: 0, time: 0.45 },
  treflip: { id: 'treflip', roll: TAU, yaw: -TAU, pitch: 0, time: 0.56 },
  impossible: { id: 'impossible', roll: 0, yaw: 0, pitch: TAU, time: 0.56 },
  bigspin: { id: 'bigspin', roll: 0, yaw: -TAU, pitch: 0, time: 0.52 },
};

/** FLIP + direction: neutral Shuvit · ← Kickflip · → Heelflip · ↑ Impossible · ↓ 360 Flip. */
export function flipForStick(steer: number, pitch: number, threshold: number): FlipId {
  const ax = Math.abs(steer);
  const ay = Math.abs(pitch);
  if (ax < threshold && ay < threshold) return 'shuvit';
  if (ax >= ay) return steer < 0 ? 'kickflip' : 'heelflip';
  return pitch > 0 ? 'impossible' : 'treflip';
}

/** GRAB + direction: neutral Indy · ← Melon · → Mute · ↑ Nose · ↓ Tail · ↓+side Stalefish. */
export function grabForStick(steer: number, pitch: number, threshold: number): GrabId {
  const ax = Math.abs(steer);
  const ay = Math.abs(pitch);
  if (ax < threshold && ay < threshold) return 'indy';
  if (pitch <= -threshold * 0.8 && ax >= threshold * 0.8) return 'stalefish';
  if (ay >= ax) return pitch > 0 ? 'nose' : 'tail';
  return steer < 0 ? 'melon' : 'mute';
}

/**
 * How good a catch would be at flip progress `p` (0 = cannot catch, 1 = perfect).
 * The window opens at `open`, peaks at p = 1 and closes `late` after it.
 */
export function catchQuality(p: number, open: number, late: number): number {
  if (p < open || p > 1 + late) return 0;
  if (p <= 1) return 0.25 + 0.75 * ((p - open) / (1 - open));
  return 1 - 0.8 * ((p - 1) / late);
}
