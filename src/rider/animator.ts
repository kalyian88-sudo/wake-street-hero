/**
 * RiderSimState → target pose. Pure function of the state (no hidden time integration), so replay
 * scrubbing and update(state, 0) land on exactly the same pose. All maths is done in CANONICAL space
 * (regular stance); for a goofy rider the inputs are X-mirrored here and the solved skeleton is
 * mirrored back in the solver.
 */
import { Vector3 } from 'three';
import type { BoardKind, GrabId, RiderSimState } from '../types';
import { clamp, clamp01, lerp, smoothstep, wobble, wrapAngle } from './ik';
import type { BoardSpec } from './boardMesh';
import { copyPose, createPose, lerpPose, resetPose, type PoseParams } from './pose';
import type { Proportions } from './rigDef';

/** Values that are applied as they are (already continuous in the sim, or must not lag). */
export interface Direct {
  /** Invert rotation about the board's long axis (canonical sign: + tips the head towards the toes). */
  roll: number;
  /** Bail tumble angle about the horizontal axis perpendicular to `tumbleYaw`. */
  tumble: number;
  /** Yaw (canonical root space) of the direction the body tumbles towards. */
  tumbleYaw: number;
  /** Wakeskate board rotation relative to the feet. */
  flipRoll: number;
  flipYaw: number;
  flipPitch: number;
  /** Boots stay on the board instead of the feet (menu idle pose). */
  bootsOnBoard: boolean;
  handleVisible: boolean;
  /** Rider is goofy → mirror the solved skeleton. */
  mirror: boolean;
}

/** Canonical-space inputs the solver needs besides the pose. */
export interface RigInput {
  /** Handle position, root space. */
  handle: Vector3;
  /** Unit direction handle → winch anchor, root space. */
  ropeDir: Vector3;
  holding: boolean;
}

export type PreviewPose = 'idle' | 'ride' | 'grab' | 'stoked';

export function createDirect(): Direct {
  return { roll: 0, tumble: 0, tumbleYaw: 0, flipRoll: 0, flipYaw: 0, flipPitch: 0, bootsOnBoard: false, handleVisible: true, mirror: false };
}

const HALF_PI = Math.PI / 2;
const _v = new Vector3();

interface GrabDef {
  rear: boolean;
  /** Grab point: x in half board widths (−1 toe edge, +1 heel edge), z in metres (±1 → nose / tail tip). */
  x: number;
  z: number;
  tip: boolean;
  apply: (T: PoseParams, g: number, tw: number) => void;
}

const GRABS: Record<GrabId, GrabDef> = {
  indy: {
    rear: true,
    x: -1,
    z: -0.03,
    tip: false,
    apply: (T, g, tw) => {
      T.edge -= 0.22 * g;
      T.pPitch += 0.14 * g;
      T.sTwist -= 0.22 * g;
      T.sSide -= 0.12 * g;
      T.bPitch -= 0.26 * tw;
      T.bYaw += 0.24 * tw;
      T.hipZ -= 0.03 * g;
    },
  },
  melon: {
    rear: false,
    x: 1,
    z: 0.03,
    tip: false,
    apply: (T, g, tw) => {
      T.edge += 0.42 * g;
      T.pPitch -= 0.22 * g;
      T.sBend -= 0.16 * g;
      T.sTwist += 0.34 * g;
      T.sSide += 0.22 * g;
      T.hipX -= 0.05 * g;
      T.bPitch += 0.22 * tw;
      T.bYaw -= 0.3 * tw;
    },
  },
  mute: {
    rear: false,
    x: -1,
    z: 0.1,
    tip: false,
    apply: (T, g, tw) => {
      T.edge -= 0.2 * g;
      T.pPitch += 0.16 * g;
      T.sTwist -= 0.42 * g;
      T.pYaw -= 0.12 * g;
      T.sSide += 0.16 * g;
      T.bPitch += 0.24 * tw;
      T.bYaw -= 0.22 * tw;
    },
  },
  stalefish: {
    rear: true,
    x: 1,
    z: -0.14,
    tip: false,
    apply: (T, g, tw) => {
      T.edge += 0.44 * g;
      T.pPitch -= 0.26 * g;
      T.sBend -= 0.18 * g;
      T.sTwist -= 0.4 * g;
      T.sSide -= 0.2 * g;
      T.hipX -= 0.06 * g;
      T.bPitch -= 0.24 * tw;
      T.bYaw += 0.26 * tw;
    },
  },
  nose: {
    rear: false,
    x: 0,
    z: 1,
    tip: true,
    apply: (T, g, tw) => {
      T.bPitch += (0.52 + 0.2 * tw) * g;
      T.hipZ += 0.09 * g;
      T.pRoll -= 0.3 * g;
      T.sSide -= 0.14 * g;
      T.sTwist += 0.2 * g;
      T.pPitch -= 0.06 * g;
    },
  },
  tail: {
    rear: true,
    x: 0,
    z: -1,
    tip: true,
    apply: (T, g, tw) => {
      T.bPitch -= (0.52 + 0.2 * tw) * g;
      T.hipZ -= 0.09 * g;
      T.pRoll += 0.3 * g;
      T.sSide += 0.14 * g;
      T.sTwist -= 0.2 * g;
      T.pPitch -= 0.06 * g;
    },
  },
};

export class Animator {
  private readonly sitPose = createPose();
  private readonly tmp = createPose();
  private readonly hl = new Vector3();
  private readonly rd = new Vector3();
  private readonly n = new Vector3();
  private lookYaw = 0;
  private lookPitch = 0;
  /** When ≥ 0 the head yaw is given relative to the chest (spins, inverts) with this weight. */
  private relLook = 0;
  private relYaw = 0;
  private overrideHands = false;

  constructor(
    private P: Proportions,
    private spec: BoardSpec,
  ) {}

  configure(P: Proportions, spec: BoardSpec): void {
    this.P = P;
    this.spec = spec;
  }

  /** World direction → canonical root space. */
  private toLocalDir(v: Vector3, yaw: number, m: number, out: Vector3): Vector3 {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return out.set((v.x * c - v.z * s) * m, v.y, v.x * s + v.z * c);
  }

  compute(state: RiderSimState, T: PoseParams, D: Direct, input: RigInput, preview: PreviewPose | null = null): void {
    const P = this.P;
    const kind: BoardKind = this.spec.kind;
    const skate = kind === 'wakeskate';
    const goofy = state.stance === 'goofy' && preview !== 'idle';
    const m = goofy ? -1 : 1;
    const yaw = state.boardYaw;
    const rope = state.rope;

    resetPose(T);
    if (skate) {
      T.hipY = 0.87;
      T.hipX = 0.03;
      T.kneeOut = 0.2;
      T.pPitch = 0.2;
      T.pYaw = 0.36;
    }
    D.roll = D.tumble = D.tumbleYaw = D.flipRoll = D.flipYaw = D.flipPitch = 0;
    D.bootsOnBoard = false;
    D.handleVisible = true;
    D.mirror = goofy;
    this.relLook = 0;
    this.relYaw = 0;
    this.overrideHands = false;

    // ── canonical inputs ──
    const hl = this.toLocalDir(_v.subVectors(rope.handlePos, state.pos), yaw, m, this.hl);
    const rd = this.rd;
    _v.subVectors(rope.anchorPos, rope.handlePos);
    if (_v.lengthSq() < 0.04) _v.copy(rope.dir);
    if (_v.lengthSq() < 1e-6) _v.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.toLocalDir(_v.normalize(), yaw, m, rd);
    input.handle.copy(hl);
    input.ropeDir.copy(rd);
    input.holding = rope.holding;
    const rdYaw = Math.hypot(rd.x, rd.z) > 1e-4 ? Math.atan2(rd.x, rd.z) : 0;
    const tdYaw = m * wrapAngle(state.heading - yaw);
    const forward = Math.cos(tdYaw) >= 0 ? 1 : -1;
    const L = clamp(state.lean, -1, 1) * forward * m;
    const speedK = clamp(state.speed / 9, 0, 1.25);
    const time = state.time;
    this.lookYaw = rdYaw;
    this.lookPitch = -0.08;

    switch (state.mode) {
      case 'waiting':
        this.sit(T, rdYaw, false, time);
        break;
      case 'water':
      case 'slide': {
        this.ride(T, state, L, speedK, skate);
        this.toLocalDir(state.surfaceNormal, yaw, m, this.n);
        this.setNormal(T, this.n);
        if (state.mode === 'water') {
          // deep-water start / stalling: below planing speed the rider sits back into the water
          const rise = smoothstep(1.1, 5.2, state.speed);
          if (rise < 1) {
            this.sit(this.sitPose, rdYaw, false, time);
            copyPose(T, this.tmp);
            lerpPose(this.sitPose, this.tmp, rise, T);
          }
        } else {
          T.lean *= 0.55;
          T.edge *= 0.5;
          T.upMix = 0.5;
        }
        break;
      }
      case 'air':
        this.air(T, state, D, skate, rdYaw, m);
        break;
      case 'rail':
        this.rail(T, state, skate, tdYaw, m);
        break;
      case 'wall': {
        if (state.wall) this.toLocalDir(state.wall.normal, yaw, m, this.n);
        else this.toLocalDir(state.surfaceNormal, yaw, m, this.n);
        this.setNormal(T, this.n);
        T.upMix = 0.42;
        T.hipY = skate ? 0.68 : 0.72;
        T.pPitch = 0.22;
        T.sBend = 0.16;
        T.kneeOut = 0.16;
        T.hipX = 0.02;
        this.lookYaw = tdYaw;
        break;
      }
      case 'bail':
        this.bail(T, state, D, skate, tdYaw, rdYaw);
        break;
      case 'finished':
        this.finished(T, state, L, speedK, skate, rdYaw, time, false);
        break;
    }

    if (preview === 'stoked') this.finished(T, state, 0, 0.6, skate, rdYaw, time, true);
    if (preview === 'idle') this.idle(T, D, skate, time);

    // ── which hand holds the handle (handle passes fall out of this: a hand lets go when the bar is behind its far side) ──
    if (!this.overrideHands) {
      const s = P.scale;
      const cw = Math.cos(T.wYaw);
      const sw = Math.sin(T.wYaw);
      const bx = (T.hipX - Math.sin(T.lean) * T.hipY) * s;
      const bz = T.hipZ * s;
      const px = bx * cw + bz * sw;
      const pz = -bx * sw + bz * cw;
      const chestYaw = T.wYaw - HALF_PI + T.pYaw + T.sTwist;
      const dx = hl.x - px;
      const dz = hl.z - pz;
      const a = Math.hypot(dx, dz) > 0.12 ? wrapAngle(Math.atan2(dx, dz) - chestYaw) : HALF_PI * 0.6;
      // a > 0: bar on the front-hand side. Front hand off while the bar is behind on the rear side, and vice versa.
      const off = (x: number): number => smoothstep(2.05, 2.3, x) * (1 - smoothstep(2.75, 2.95, x));
      let wF = 1 - off(-a);
      let wR = 1 - off(a);
      if (T.hang > 0.3) wF = wR = 1;
      const hold = rope.holding ? 1 : 0;
      T.hF = Math.min(T.hF, wF * hold * (1 - T.gF));
      T.hR = Math.min(T.hR, wR * hold * (1 - T.gR));
    }

    // ── head ──
    const chestYaw = T.wYaw - HALF_PI + T.pYaw + T.sTwist;
    const absYaw = clamp(wrapAngle(this.lookYaw - chestYaw), -1.35, 1.35);
    T.hdYaw = lerp(absYaw, this.relYaw, this.relLook);
    T.hdPitch = clamp(this.lookPitch + (T.pPitch + T.sBend) * 0.8 * Math.cos(T.hdYaw), -0.75, 0.8);
    T.hdRoll = -T.lean * 0.5 - T.sSide * 0.5;
  }

  private setNormal(T: PoseParams, n: Vector3): void {
    // the frame may be yawed (deep start): express the normal in frame space
    const c = Math.cos(T.wYaw);
    const s = Math.sin(T.wYaw);
    const len = n.length() || 1;
    const y = n.y / len < 0.05 ? n.y / len : n.y / len;
    T.nX = (n.x * c - n.z * s) / len;
    T.nY = y;
    T.nZ = (n.x * s + n.z * c) / len;
  }

  // ─────────────────────────────────────────────────────────── surface ──

  private ride(T: PoseParams, state: RiderSimState, L: number, speedK: number, skate: boolean): void {
    const t = state.time;
    const c = clamp01(state.crouch);
    const k = clamp01(state.rope.tension);
    const taut = state.rope.holding ? k : 0;
    if (L > 0) {
      // toeside: hips driven forward over the toe edge, chest stacked over the toes, shoulders closed
      T.lean = 0.4 * L;
      T.edge = 0.46 * L;
      T.hipX -= 0.14 * L;
      T.hipY -= 0.05 * L;
      T.pPitch -= 0.12 * L;
      T.sBend += 0.1 * L;
      T.pYaw -= 0.16 * L;
      T.sTwist -= 0.12 * L;
      T.kneeOut += 0.05 * L;
    } else {
      // heelside: sit back into an invisible chair, arms long, chest open to the winch
      const a = -L;
      T.lean = -0.42 * a;
      T.edge = -0.46 * a;
      T.hipX += 0.12 * a;
      T.hipY -= 0.13 * a;
      T.pPitch += 0.2 * a;
      T.sBend += 0.05 * a;
      T.pYaw += 0.1 * a;
      T.sTwist += 0.14 * a;
    }
    // rope load: crouch and set the heel edge against the pull
    T.hipY -= (skate ? 0.26 : 0.3) * c;
    T.pPitch += 0.3 * c;
    T.sBend += 0.16 * c;
    T.hipX += 0.05 * c;
    T.edge -= 0.13 * c;
    T.lean -= 0.1 * c;
    T.pRoll += 0.12 * c;
    T.hipZ -= 0.07 * c;
    T.kneeOut += 0.1 * c;
    // rope tension opens the shoulders and leans the body back against the pull; slack stands taller
    T.sTwist += 0.12 * taut;
    T.pRoll += 0.05 * taut;
    T.hipZ -= 0.025 * taut;
    T.hipY += 0.03 * (1 - taut) * (1 - c);
    // speed-dependent life: knees soaking up chop, board chattering
    const sp = Math.min(speedK, 1.2);
    T.hipY += (0.012 * wobble(t * 5.1, 1) + 0.006 * wobble(t * 11.3, 2)) * sp;
    T.bPitch += 0.014 * wobble(t * 6.7, 3) * sp;
    T.edge += 0.018 * wobble(t * 4.3, 4) * sp;
    T.sBend += 0.012 * wobble(t * 2.9, 5) * sp;
    T.upMix = 0.4;
  }

  /** Deep-water start / floating: sitting in the water behind the board, knees up, arms long. */
  private sit(T: PoseParams, rdYaw: number, floating: boolean, time: number): void {
    resetPose(T);
    T.wYaw = floating ? 0 : wrapAngle(rdYaw + HALF_PI);
    T.edge = -1.02;
    T.hipX = 0.37;
    T.hipY = -0.15;
    T.hipZ = 0;
    T.pYaw = 0;
    T.pPitch = -0.26;
    T.pRoll = 0;
    T.sBend = 0.46;
    T.sTwist = 0;
    T.kneeOut = 0.16;
    T.upMix = 0;
    T.sink = -0.17 + 0.02 * Math.sin(time * 2.1);
    T.bPitch = 0.04 * Math.sin(time * 1.7);
    T.fFx = T.fRx = 0.4 + 0.05 * Math.sin(time * 2.4);
    T.fFy = T.fRy = -0.16;
    T.fFz = 0.26 + 0.05 * Math.cos(time * 2.4);
    T.fRz = 0.26 - 0.05 * Math.cos(time * 2.4);
  }

  private finished(T: PoseParams, state: RiderSimState, L: number, speedK: number, skate: boolean, rdYaw: number, time: number, both: boolean): void {
    resetPose(T);
    T.hipY = skate ? 0.92 : 0.95;
    T.pPitch = 0.06;
    T.sBend = both ? -0.06 : 0.02;
    T.sTwist = 0.3;
    T.pYaw = 0.34;
    T.lean = 0.3 * L;
    T.edge = 0.34 * L;
    T.hF = T.hR = 0;
    this.overrideHands = true;
    // rear fist in the air (both for the stoked menu pose), front arm loose for balance
    T.fRx = 0.26;
    T.fRy = 0.6 + 0.03 * Math.sin(time * 7);
    T.fRz = 0.16;
    if (both) {
      T.fFx = 0.28;
      T.fFy = 0.6 + 0.03 * Math.sin(time * 7 + 1.2);
      T.fFz = 0.14;
      T.hipY += 0.025 * Math.abs(Math.sin(time * 3.5));
    } else {
      T.fFx = 0.34;
      T.fFy = -0.22;
      T.fFz = 0.16;
    }
    T.hipY += 0.008 * wobble(time * 5.1, 1) * speedK;
    this.lookYaw = rdYaw;
    this.lookPitch = 0.06;
    if (state.speed < 5.2 && !both && state.surface === 'water') {
      const rise = smoothstep(1.1, 5.2, state.speed);
      this.sit(this.sitPose, rdYaw, true, time);
      this.sitPose.fRx = T.fRx;
      this.sitPose.fRy = T.fRy;
      this.sitPose.fRz = T.fRz;
      this.sitPose.hF = this.sitPose.hR = 0;
      copyPose(T, this.tmp);
      lerpPose(this.sitPose, this.tmp, rise, T);
    }
  }

  /** Menu pose: standing on the ground, board upright at the rear hand. */
  private idle(T: PoseParams, D: Direct, skate: boolean, time: number): void {
    resetPose(T);
    const breathe = Math.sin(time * 1.6);
    T.narrow = 1;
    T.upMix = 0;
    T.hipX = 0.0;
    T.hipY = 0.972 + 0.003 * breathe;
    T.hipZ = -0.035;
    T.pYaw = 0.22;
    T.pPitch = 0.03;
    T.pRoll = 0.05;
    T.sBend = 0.03 + 0.012 * breathe;
    T.sTwist = 0.12;
    T.sSide = -0.05;
    T.kneeOut = 0.04;
    T.hF = T.hR = 0;
    T.fFx = 0.2;
    T.fFy = -0.44;
    T.fFz = 0.05;
    this.overrideHands = true;
    // board stands on its tail next to the rear foot, deck towards the viewer, rear hand on it
    const half = this.spec.length / 2;
    T.bFree = 1;
    T.bfX = -0.05;
    T.bfY = half * Math.cos(0.1) + 0.012;
    T.bfZ = -(skate ? 0.4 : 0.44);
    T.bfPitch = -HALF_PI + 0.1;
    T.bfYaw = HALF_PI;
    T.gR = 1;
    if (skate) {
      T.gpX = 0;
      T.gpY = 0.02;
      T.gpZ = half - 0.02;
      T.gAcross = 1;
    } else {
      T.gpX = -this.spec.width / 2 + 0.03;
      T.gpY = 0.012;
      T.gpZ = 0.34;
      T.gAcross = 0;
    }
    D.bootsOnBoard = true;
    D.handleVisible = false;
    this.lookYaw = -HALF_PI + 0.3 + 0.18 * Math.sin(time * 0.5);
    this.lookPitch = 0.02;
  }

  // ─────────────────────────────────────────────────────────────── air ──

  private air(T: PoseParams, state: RiderSimState, D: Direct, skate: boolean, rdYaw: number, m: number): void {
    const air = state.air;
    const ta = air.time;
    const tl = air.timeToLand;
    const popKind = air.takeoff === 'pop' || air.takeoff === 'kicker';
    const pop = popKind ? 1 - smoothstep(0.03, 0.26, ta) : 0;
    const land = tl > 0 ? 1 - smoothstep(0.1, 0.36, tl) : 0;
    const spinLeft = air.spinTarget - air.spin;
    const spinning = Math.abs(spinLeft) > 0.12;
    const rolling = air.invert !== null && air.invert !== 'raley' && Math.abs(air.rollTarget - air.roll) > 0.1;
    const flip = air.flip;
    const flipping = skate && flip.id !== null && !flip.caught;
    const grabbing = air.grab !== null && air.grabBlend > 0.02;
    const raley = clamp01(air.raley);
    const active = spinning || rolling || flipping || grabbing || Math.abs(air.shifty) > 0.05;
    const tuck = (1 - pop) * (1 - land * 0.8) * (active ? 1 : 0.62) * (1 - raley);

    // base air shape: pop extension → tuck → reach for the landing
    T.hipY = lerp(skate ? 0.87 : 0.9, skate ? 0.6 : 0.54, tuck) + 0.1 * pop;
    T.pPitch = 0.16 + 0.26 * tuck - 0.1 * pop;
    T.sBend = 0.1 + 0.2 * tuck - 0.08 * pop;
    T.hipX = 0.05 - 0.05 * tuck;
    T.kneeOut = 0.1 + 0.14 * tuck;
    T.upMix = 0;
    this.lookPitch = -0.2 - 0.25 * land;

    // spins: shoulders and head lead the board
    if (spinning) {
      const sd = clamp(spinLeft / 1.3, -1, 1) * m;
      T.sTwist += 0.36 * sd;
      T.pYaw += 0.1 * sd;
      T.hipY -= 0.02;
      this.relLook = Math.abs(sd) * 0.9;
      this.relYaw = sd * 1.15;
    }
    T.sTwist += 0; // (handle follows via the solver's reach twist)

    // inverts: rotate the whole rider about the board's long axis, tuck shape per trick
    D.roll = -air.roll;
    if (rolling) {
      const total = Math.max(Math.abs(air.rollTarget), 1e-3);
      const prog = clamp01(Math.abs(air.roll) / total);
      this.relLook = Math.max(this.relLook, 0.85);
      if (air.invert === 'frontroll') {
        T.hipY = 0.5;
        T.pPitch = 0.62;
        T.sBend = 0.44;
        T.kneeOut = 0.26;
        this.relYaw = 0.5;
        this.lookPitch = -0.55;
      } else if (air.invert === 'tantrum') {
        // laid-out arch off the kicker, then snap into the tuck
        const arch = 1 - smoothstep(0.1, 0.42, prog);
        T.hipY = lerp(0.52, 0.9, arch);
        T.pPitch = lerp(0.3, -0.14, arch);
        T.sBend = lerp(0.14, -0.3, arch);
        T.kneeOut = 0.2;
        this.relYaw = 0.55;
        this.lookPitch = 0.5 * arch + 0.2;
      } else {
        // backroll: tight tuck, head thrown back over the lead shoulder spotting the landing
        T.hipY = 0.5;
        T.pPitch = 0.28;
        T.sBend = 0.12;
        T.sTwist += 0.16;
        T.kneeOut = 0.24;
        this.relYaw = 0.75;
        this.lookPitch = 0.35;
      }
    }

    // raley: body laid out behind the handle, board swings up above the head
    if (raley > 0.001) {
      const r = raley * raley * (3 - 2 * raley);
      T.wYaw = wrapAngle(rdYaw + HALF_PI) * r;
      T.tPitch = 1.95 * r;
      T.hang = r;
      T.hipY = lerp(T.hipY, 0.99, r);
      T.hipX = lerp(T.hipX, 0, r);
      T.pYaw = lerp(T.pYaw, 0, r);
      T.sTwist = lerp(T.sTwist, 0, r);
      T.pPitch = lerp(T.pPitch, -0.16, r);
      T.sBend = lerp(T.sBend, -0.22, r);
      T.bPitch = 0;
      T.kneeOut = lerp(T.kneeOut, 0.06, r);
      this.lookYaw = rdYaw;
      this.lookPitch = lerp(this.lookPitch, 0.75, r);
    }

    // shifty: board one way, shoulders the other
    if (Math.abs(air.shifty) > 0.001) {
      const sh = clamp(air.shifty, -1, 1) * m;
      T.bYaw += 0.72 * sh;
      T.sTwist -= 0.48 * sh;
      T.pYaw -= 0.1 * sh;
      T.hipY = Math.min(T.hipY, 0.66);
      T.kneeOut += 0.06;
    }

    // grabs: knees to the hand, hand to the board, held grabs get boned out
    if (grabbing && air.grab) {
      const def = GRABS[air.grab];
      const g = clamp01(air.grabBlend);
      const tw = smoothstep(0.1, 0.7, air.grabTime) * g;
      T.hipY = lerp(T.hipY, 0.47, g);
      T.pPitch = lerp(T.pPitch, 0.4, g * 0.8);
      T.sBend = lerp(T.sBend, 0.3, g * 0.8);
      T.kneeOut = lerp(T.kneeOut, 0.3, g);
      def.apply(T, g, tw);
      const half = this.spec.length / 2;
      T.gpX = def.x * (this.spec.width / 2 - 0.008);
      T.gpY = def.tip ? 0.07 : 0.012;
      T.gpZ = def.tip ? def.z * (half - 0.03) : def.z;
      T.gAcross = def.tip ? 1 : 0;
      if (def.rear) T.gR = g;
      else T.gF = g;
      this.lookPitch -= 0.15 * g;
    }

    // wakeskate: the board flips under the floating feet
    if (skate) {
      D.flipRoll = -flip.roll;
      D.flipYaw = flip.yaw * m * 0 + flip.yaw;
      D.flipPitch = flip.pitch;
      if (flipping) {
        const up = smoothstep(0.0, 0.25, flip.progress) * (1 - 0.35 * smoothstep(0.75, 1, flip.progress));
        T.liftF = 0.2 * up + 0.04;
        T.liftR = 0.17 * up + 0.04;
        T.spread = 0.05;
        T.bY = -0.07 * up;
        T.hipY = 0.64;
        T.kneeOut = 0.3;
        T.pPitch = 0.34;
        this.lookPitch = -0.6;
        this.lookYaw = rdYaw;
        this.relLook = 0.5;
        this.relYaw = 0.6;
      }
    }
  }

  // ────────────────────────────────────────────────────────────── rail ──

  private rail(T: PoseParams, state: RiderSimState, skate: boolean, tdYaw: number, m: number): void {
    const rail = state.rail;
    const bal = rail ? clamp(rail.balance, -1.2, 1.2) : 0;
    const stance = rail ? rail.stance : 'fifty';
    T.setNormalDone = undefined as never;
    T.hipY = skate ? 0.72 : 0.76;
    T.pPitch = 0.26;
    T.sBend = 0.14;
    T.kneeOut = 0.18;
    T.upMix = 0;
    T.hipX = 0.02;
    // balance: body tips, free arm counter-swings
    T.lean = 0.24 * bal;
    T.edge = 0.07 * bal;
    T.sSide = 0;
    T.hipX -= 0.05 * bal;
    T.hR = 0;
    T.fRx = 0.52;
    T.fRy = 0.04 + 0.26 * bal;
    T.fRz = 0.1 - 0.2 * bal;
    T.fFx = 0.5;
    T.fFy = 0.02 - 0.26 * bal;
    T.fFz = 0.12 + 0.2 * bal;

    // board orientation relative to the rail
    let along = tdYaw;
    if (rail) {
      this.toLocalDir(rail.tangent, state.boardYaw, m, this.n);
      if (Math.hypot(this.n.x, this.n.z) > 1e-4) along = Math.atan2(this.n.x, this.n.z);
    }
    // fold so the nose (or tail, when switch) points down the rail
    let fold = wrapAngle(along);
    if (fold > HALF_PI) fold -= Math.PI;
    else if (fold <= -HALF_PI) fold += Math.PI;
    if (stance === 'boardslide' || stance === 'lipslide') {
      if (Math.abs(fold) > Math.PI / 4) {
        // the sim already turned the board across: only square it up
        T.wYaw = fold - Math.sign(fold) * HALF_PI;
      } else {
        T.wYaw = fold + (stance === 'boardslide' ? 1 : -1) * m * HALF_PI;
      }
      T.hipY -= 0.03;
      T.kneeOut = 0.24;
      T.pPitch = 0.3;
      // shoulders turn down the rail
      const lead = wrapAngle(along - T.wYaw);
      T.sTwist = clamp(0.2 + 0.35 * Math.sin(lead), -0.3, 0.6);
    } else {
      T.wYaw = fold;
      if (stance === 'nosepress') {
        T.bPitch = -0.27;
        T.bPivot = this.spec.kind === 'wakeboard' ? this.P.stanceWakeboard : this.P.stanceWakeskate;
        T.hipZ = 0.17;
        T.pRoll = -0.12;
        T.hipY -= 0.02;
      } else if (stance === 'tailpress') {
        T.bPitch = 0.27;
        T.bPivot = -(this.spec.kind === 'wakeboard' ? this.P.stanceWakeboard : this.P.stanceWakeskate);
        T.hipZ = -0.17;
        T.pRoll = 0.14;
        T.hipY -= 0.02;
      }
    }
    this.lookYaw = along;
    this.lookPitch = -0.3;
  }

  // ────────────────────────────────────────────────────────────── bail ──

  private bail(T: PoseParams, state: RiderSimState, D: Direct, skate: boolean, tdYaw: number, rdYaw: number): void {
    const b = state.bail;
    const t = b ? b.time : 0;
    const I = clamp(b ? b.intensity : 0.5, 0.25, 1);
    const water = !b || b.surface === 'water';
    const A = I * Math.exp(-2.1 * t);
    const w = (seed: number, rate = 9): number => wobble(t * rate, seed + 20);

    // rag-doll phase
    T.hipY = 0.62 + 0.12 * w(1) * A;
    T.hipX = 0.04 * w(2) * A;
    T.pPitch = 0.34 + 0.4 * w(3) * A;
    T.sBend = 0.24 + 0.34 * w(4) * A;
    T.sTwist = 0.6 * w(5) * A;
    T.pYaw = 0.3 + 0.4 * w(6) * A;
    T.sSide = 0.34 * w(7) * A;
    T.kneeOut = 0.22 + 0.1 * w(8) * A;
    T.edge = 0.5 * w(9) * A;
    T.bPitch = 0.45 * w(10) * A;
    T.bYaw = 0.5 * w(11) * A;
    T.upMix = 0;
    T.hF = T.hR = 0;
    this.overrideHands = true;
    T.fFx = 0.42 + 0.22 * w(12) * A;
    T.fFy = 0.12 + 0.6 * w(13) * A + 0.25 * A;
    T.fFz = 0.14 + 0.34 * w(14) * A;
    T.fRx = 0.42 + 0.22 * w(15) * A;
    T.fRy = 0.1 + 0.6 * w(16) * A + 0.2 * A;
    T.fRz = 0.14 + 0.34 * w(17) * A;
    if (skate) {
      T.liftF = 0.1 + 0.2 * (0.5 + 0.5 * w(18)) * A;
      T.liftR = 0.1 + 0.2 * (0.5 + 0.5 * w(19)) * A;
      T.spread = 0.06 * w(20) * A;
    }

    // tumble along the direction of travel: whole turns so it ends upright in the water
    const turns = I > 0.62 ? 2 : 1;
    const dur = 0.72 + 0.36 * I;
    const x = clamp01(t / dur);
    D.tumble = Math.PI * 2 * turns * (1 - Math.pow(1 - x, 2.6));
    D.tumbleYaw = tdYaw;

    // settle: float in the water (or sit on the ground) until the respawn
    const settle = smoothstep(0.5 * dur, dur + 0.5, t);
    if (settle > 0) {
      this.sit(this.sitPose, rdYaw, true, state.time);
      this.sitPose.hF = this.sitPose.hR = 0;
      if (!water) {
        this.sitPose.sink = 0;
        this.sitPose.edge = -0.2;
        this.sitPose.hipY = 0.13;
        this.sitPose.hipX = 0.45;
        this.sitPose.pPitch = -0.1;
        this.sitPose.bPitch = 0;
        this.sitPose.fFx = this.sitPose.fRx = 0.26;
        this.sitPose.fFy = this.sitPose.fRy = -0.3;
        this.sitPose.fFz = this.sitPose.fRz = 0.26;
      }
      copyPose(T, this.tmp);
      lerpPose(this.tmp, this.sitPose, settle, T);
    }
    if (water) {
      // little hop of the impact, plunge, bob back up
      const plunge = smoothstep(0.22, 0.6, t) * (1 - smoothstep(0.75, 1.6, t));
      T.sink += 0.1 * I * Math.sin(Math.PI * clamp01(t / 0.3)) - 0.42 * I * plunge;
    } else {
      T.sink += 0.14 * I * Math.sin(Math.PI * clamp01(t / 0.3));
    }

    // wakeskate: nothing holds the board — it shoots off (lost flip) or drifts away
    if (skate) {
      const lost = !!b && b.boardLost;
      const e = 1 - Math.pow(1 - clamp01(t / 0.85), 2);
      T.bFree = 1;
      const c = Math.cos(tdYaw);
      const s = Math.sin(tdYaw);
      const fwd = lost ? 3.1 * e : 1.5 * e;
      const side = lost ? 1.5 * e : 0.55 * e;
      T.bfX = s * fwd - c * side;
      T.bfZ = c * fwd + s * side;
      const tt = Math.min(t, 0.85);
      T.bfY = Math.max(0.015, (lost ? 0.25 + 3.4 * tt - 4.9 * tt * tt : 0.12 + 1.2 * tt - 4.9 * tt * tt) * (1 - e * e));
      T.bfYaw = (lost ? 5.5 : 1.1) * e;
      T.bfRoll = lost ? Math.PI * 2 * e : 0;
      T.bfPitch = (lost ? 0.5 : 0.12) * Math.sin(Math.PI * e);
    }
    this.lookYaw = tdYaw;
    this.lookPitch = 0.1;
  }
}
