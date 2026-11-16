/**
 * Replay recorder. Headless (three math + riderState only) so it can be unit-tested.
 *
 * A preallocated ring of RiderSimState snapshots at ~30 Hz of SIM time covers the last ~25 s, plus
 * markers for every scored trick and for the splashes that happened (so a replay can re-create them
 * without re-emitting gameplay events). Playback asks for an interpolated state at any time.
 */
import type { L10n, RiderSimState } from '../types';
import { copyRiderSimState, createRiderSimState } from './riderState';
import { lerpAngle } from './math';

export interface TrickMarker {
  /** Sim time the trick was landed / scored. */
  time: number;
  awarded: number;
  name: L10n;
  tier: number;
  id: string;
}

export type ReplayFxKind = 'pop' | 'land' | 'bail';

export interface ReplayFx {
  time: number;
  kind: ReplayFxKind;
  x: number;
  y: number;
  z: number;
  /** 0..1 */
  strength: number;
  water: boolean;
}

export interface ReplayClip {
  start: number;
  end: number;
  /** Sim time of the "hero frame" (share card, filmer placement). */
  hero: number;
  marker: TrickMarker | null;
}

const CLIP_BEFORE = 2.2;
const CLIP_AFTER = 1.6;
const MAX_MARKERS = 64;
const MAX_FX = 96;
/** Two consecutive snapshots further apart than this are a respawn, not motion: do not blend. */
const TELEPORT_SQ = 3 * 3;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Blend two snapshots. Discrete fields (mode, grab id, stance…) come from the earlier one. */
export function lerpRiderState(a: RiderSimState, b: RiderSimState, t: number, out: RiderSimState): RiderSimState {
  if (t <= 0 || a.pos.distanceToSquared(b.pos) > TELEPORT_SQ) return copyRiderSimState(a, out);
  if (t >= 1) return copyRiderSimState(b, out);
  copyRiderSimState(a, out);
  out.time = lerp(a.time, b.time, t);
  out.pos.lerpVectors(a.pos, b.pos, t);
  out.vel.lerpVectors(a.vel, b.vel, t);
  out.speed = lerp(a.speed, b.speed, t);
  out.heading = lerpAngle(a.heading, b.heading, t);
  out.boardYaw = lerpAngle(a.boardYaw, b.boardYaw, t);
  out.lean = lerp(a.lean, b.lean, t);
  out.crouch = lerp(a.crouch, b.crouch, t);
  out.surfaceY = lerp(a.surfaceY, b.surfaceY, t);
  out.surfaceNormal.lerpVectors(a.surfaceNormal, b.surfaceNormal, t).normalize();
  out.progress = lerp(a.progress, b.progress, t);
  out.distToWinch = lerp(a.distToWinch, b.distToWinch, t);
  out.slowMo = lerp(a.slowMo, b.slowMo, t);

  // Air values are cumulative within one air and reset on touchdown: only blend inside the same air.
  if (a.mode === 'air' && b.mode === 'air' && b.air.time >= a.air.time) {
    const oa = out.air;
    const aa = a.air;
    const ba = b.air;
    oa.time = lerp(aa.time, ba.time, t);
    oa.height = lerp(aa.height, ba.height, t);
    oa.peak = lerp(aa.peak, ba.peak, t);
    oa.spin = lerp(aa.spin, ba.spin, t);
    oa.roll = lerp(aa.roll, ba.roll, t);
    oa.raley = lerp(aa.raley, ba.raley, t);
    oa.shifty = lerp(aa.shifty, ba.shifty, t);
    oa.grabBlend = lerp(aa.grabBlend, ba.grabBlend, t);
    oa.grabTime = lerp(aa.grabTime, ba.grabTime, t);
    oa.handlePass = lerp(aa.handlePass, ba.handlePass, t);
    oa.timeToLand = lerp(aa.timeToLand, ba.timeToLand, t);
    if (aa.flip.id === ba.flip.id) {
      oa.flip.roll = lerp(aa.flip.roll, ba.flip.roll, t);
      oa.flip.yaw = lerp(aa.flip.yaw, ba.flip.yaw, t);
      oa.flip.pitch = lerp(aa.flip.pitch, ba.flip.pitch, t);
      oa.flip.progress = lerp(aa.flip.progress, ba.flip.progress, t);
      oa.flip.catchWindow = lerp(aa.flip.catchWindow, ba.flip.catchWindow, t);
    }
  }
  if (out.rail && a.rail && b.rail && a.rail.obstacleId === b.rail.obstacleId) {
    out.rail.balance = lerp(a.rail.balance, b.rail.balance, t);
    out.rail.time = lerp(a.rail.time, b.rail.time, t);
    out.rail.tangent.lerpVectors(a.rail.tangent, b.rail.tangent, t).normalize();
  }
  if (out.wall && a.wall && b.wall) out.wall.time = lerp(a.wall.time, b.wall.time, t);
  if (out.bail && a.bail && b.bail) {
    out.bail.time = lerp(a.bail.time, b.bail.time, t);
    out.bail.respawnIn = lerp(a.bail.respawnIn, b.bail.respawnIn, t);
  }
  const r = out.rope;
  r.tension = lerp(a.rope.tension, b.rope.tension, t);
  r.length = lerp(a.rope.length, b.rope.length, t);
  r.slack = lerp(a.rope.slack, b.rope.slack, t);
  r.dir.lerpVectors(a.rope.dir, b.rope.dir, t).normalize();
  r.handlePos.lerpVectors(a.rope.handlePos, b.rope.handlePos, t);
  r.anchorPos.lerpVectors(a.rope.anchorPos, b.rope.anchorPos, t);
  r.reelSpeed = lerp(a.rope.reelSpeed, b.rope.reelSpeed, t);
  r.jerk = lerp(a.rope.jerk, b.rope.jerk, t);
  return out;
}

export class ReplayBuffer {
  readonly capacity: number;
  private readonly step: number;
  private readonly ring: RiderSimState[] = [];
  private head = 0;
  private size = 0;
  private lastTime = -Infinity;
  readonly tricks: TrickMarker[] = [];
  readonly fx: ReplayFx[] = [];

  /**
   * @param seconds sim seconds of history
   * @param hz      snapshots per sim second
   */
  constructor(seconds = 25, hz = 30) {
    this.capacity = Math.ceil(seconds * hz) + 2;
    this.step = 1 / hz;
    for (let i = 0; i < this.capacity; i++) this.ring.push(createRiderSimState());
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
    this.lastTime = -Infinity;
    this.tricks.length = 0;
    this.fx.length = 0;
  }

  get count(): number {
    return this.size;
  }

  get startTime(): number {
    return this.size ? this.at(0).time : 0;
  }

  get endTime(): number {
    return this.size ? this.at(this.size - 1).time : 0;
  }

  /** i-th oldest snapshot. */
  at(i: number): RiderSimState {
    return this.ring[(this.head + i) % this.capacity];
  }

  /** Call every frame with the live state; stores a snapshot when 1/hz of sim time has passed. */
  record(state: RiderSimState): void {
    if (state.mode === 'waiting') return;
    if (state.time < this.lastTime) this.clear(); // sim was reset
    if (this.size > 0 && state.time - this.lastTime < this.step - 1e-6) return;
    let slot: RiderSimState;
    if (this.size < this.capacity) {
      slot = this.ring[(this.head + this.size) % this.capacity];
      this.size++;
    } else {
      slot = this.ring[this.head];
      this.head = (this.head + 1) % this.capacity;
    }
    copyRiderSimState(state, slot);
    this.lastTime = state.time;
  }

  addTrick(m: TrickMarker): void {
    if (this.tricks.length >= MAX_MARKERS) this.tricks.shift();
    this.tricks.push(m);
  }

  addFx(f: ReplayFx): void {
    if (this.fx.length >= MAX_FX) this.fx.shift();
    this.fx.push(f);
  }

  /** Index of the last snapshot with time ≤ t (binary search), clamped to the buffer. */
  private indexAt(t: number): number {
    let lo = 0;
    let hi = this.size - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.at(mid).time <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Interpolated state at sim time `t` (clamped to what is recorded). Returns null when empty. */
  sample(t: number, out: RiderSimState): RiderSimState | null {
    if (!this.size) return null;
    const i = this.indexAt(t);
    const a = this.at(i);
    if (i >= this.size - 1 || t <= a.time) return copyRiderSimState(a, out);
    const b = this.at(i + 1);
    const span = b.time - a.time;
    return lerpRiderState(a, b, span > 1e-6 ? (t - a.time) / span : 0, out);
  }

  /** Highest-scoring trick that is still inside the recorded window. */
  bestTrick(): TrickMarker | null {
    let best: TrickMarker | null = null;
    const from = this.startTime;
    for (const m of this.tricks) {
      if (m.time < from) continue;
      if (!best || m.awarded > best.awarded) best = m;
    }
    return best;
  }

  /** Time of the snapshot with the greatest air height in [from, to]; −1 when nobody left the ground. */
  private highestAir(from: number, to: number): number {
    let bestT = -1;
    let bestH = 0.15;
    for (let i = this.indexAt(from); i < this.size; i++) {
      const s = this.at(i);
      if (s.time > to) break;
      if (s.mode === 'air' && s.air.height > bestH) {
        bestH = s.air.height;
        bestT = s.time;
      }
    }
    return bestT;
  }

  /**
   * Peak of the air that ended (was landed) just before `to` — the air the scored trick belongs to,
   * not some bigger jump earlier in the clip. −1 when there is none.
   */
  private peakOfAirBefore(from: number, to: number): number {
    let bestT = -1;
    let bestH = 0.15;
    let inAir = false;
    for (let i = this.indexAt(to); i >= 0; i--) {
      const s = this.at(i);
      if (s.time < from) break;
      if (s.mode === 'air') {
        inAir = true;
        if (s.air.height > bestH) {
          bestH = s.air.height;
          bestT = s.time;
        }
      } else if (inAir) break;
      else if (to - s.time > 0.6) break; // the trick was not an air trick
    }
    return bestT;
  }

  /** Middle of the grind / wallride nearest before `to` (tricks that never leave the obstacle). */
  private midGrind(from: number, to: number): number {
    let end = -1;
    let start = -1;
    for (let i = this.indexAt(to); i >= 0; i--) {
      const s = this.at(i);
      if (s.time < from) break;
      const on = s.mode === 'rail' || s.mode === 'wall';
      if (on && end < 0) end = s.time;
      if (on) start = s.time;
      else if (end >= 0) break;
    }
    return end >= 0 ? (start + end) / 2 : -1;
  }

  /**
   * Best clip = window around the highest-scoring trick (≈2.2 s before → 1.6 s after). Without any
   * scored trick: around the highest air, else the last few seconds of riding. Null when (almost) empty.
   */
  bestClip(): ReplayClip | null {
    if (this.size < 2) return null;
    const t0 = this.startTime;
    const t1 = this.endTime;
    const marker = this.bestTrick();
    let centre: number;
    let hero: number;
    if (marker) {
      centre = Math.min(Math.max(marker.time, t0), t1);
      const from = Math.max(t0, centre - CLIP_BEFORE - 1.5);
      hero = this.peakOfAirBefore(from, centre + 0.1);
      if (hero < 0) hero = this.midGrind(from, centre + 0.1);
      if (hero < 0) hero = Math.max(t0, centre - 0.35);
    } else {
      hero = this.highestAir(t0, t1);
      if (hero >= 0) centre = hero + 0.4;
      else {
        // No air at all: a riding frame from the last stretch.
        centre = Math.max(t0, t1 - CLIP_AFTER);
        hero = this.ridingFrame();
      }
    }
    const start = Math.max(t0, centre - CLIP_BEFORE);
    const end = Math.min(t1, centre + CLIP_AFTER);
    return { start, end, hero: Math.min(Math.max(hero, t0), t1), marker };
  }

  /** Latest snapshot where the rider is up and moving. */
  private ridingFrame(): number {
    for (let i = this.size - 1; i >= 0; i--) {
      const s = this.at(i);
      if ((s.mode === 'water' || s.mode === 'slide') && s.speed > 3) return s.time;
    }
    return this.endTime;
  }
}
