/**
 * Winch + rope model (PLAN §4.1). The drum reels the rope in at a fixed speed; while the rope is
 * taut the rider's speed towards the winch is pulled up to the drum speed with an elastic gain.
 * Slack = no pull; re-tension produces a jerk. Fills state.rope and state.distToWinch.
 */
import type { EventBus } from '../core/events';
import { damp } from '../data/geometry';
import type { RiderSimState } from '../types';
import { SIM } from './tuning';

export class Rope {
  /** Pull acceleration of the current step (horizontal, world). */
  ax = 0;
  az = 0;
  /** Allowed horizontal distance rider ↔ winch. */
  length = 0;
  /** Rope is being reeled (false while waiting / after the finish / during a bail). */
  pulling = false;

  private readonly s: RiderSimState;
  private readonly bus: EventBus;
  private readonly reelMax: number;
  private rampT = 0;
  private rampDur: number = SIM.reelRamp;
  private wasTaut = false;
  private slackPeak = 0;
  private holdBlend = 1;
  private lead = 0;
  private dropBlend = 0;
  private jerkAge = 99;
  private jerkPeak = 0;
  private stuckT = 0;
  /** Board surface height for the released handle to lie on. */
  private restY = 0;

  constructor(state: RiderSimState, bus: EventBus, reelMax: number) {
    this.s = state;
    this.bus = bus;
    this.reelMax = reelMax;
  }

  /** Rope laid out from the winch to the rider with `slack` metres to spare, drum stopped. */
  reset(slack: number): void {
    const s = this.s;
    const r = s.rope;
    const d = this.measure();
    this.length = d + slack;
    this.pulling = false;
    this.rampT = 0;
    this.rampDur = SIM.reelRamp;
    this.wasTaut = false;
    this.slackPeak = 0;
    this.holdBlend = 1;
    this.lead = 0;
    this.dropBlend = 0;
    this.jerkAge = 99;
    this.jerkPeak = 0;
    this.stuckT = 0;
    this.ax = this.az = 0;
    r.holding = true;
    r.taut = false;
    r.tension = 0;
    r.slack = slack;
    r.reelSpeed = 0;
    r.jerk = 0;
    r.length = Math.max(0, this.length - SIM.handleReach);
    this.restY = s.pos.y;
    this.placeHandle(0);
  }

  /** Start reeling with a soft ramp. */
  startPull(ramp: number): void {
    this.pulling = true;
    this.rampT = 0;
    this.rampDur = ramp;
    this.wasTaut = true;
    this.slackPeak = 0;
  }

  stopPull(): void {
    this.pulling = false;
  }

  /** Take the start slack up (waiting → go). Returns true once the rope is tight. */
  takeUp(dt: number): boolean {
    const d = this.measure();
    this.length = Math.max(d, this.length - SIM.startTakeUp * dt);
    const r = this.s.rope;
    r.slack = this.length - d;
    r.reelSpeed = SIM.startTakeUp;
    r.length = Math.max(0, this.length - SIM.handleReach);
    this.placeHandle(dt);
    return this.length <= d + 1e-4;
  }

  /** Rider lets go of / grabs the handle. */
  setHolding(on: boolean): void {
    const r = this.s.rope;
    if (r.holding === on) return;
    r.holding = on;
    if (on) {
      // the handle comes back to the hands; tension ramps in, no jerk
      this.length = this.measure() + 0.05;
      this.holdBlend = 0;
      this.wasTaut = true;
      this.slackPeak = 0;
      if (this.s.speed < 3 && this.pulling) {
        // picked up from (almost) a standstill: the operator eases the drum in again
        this.rampT = 0;
        this.rampDur = SIM.respawnRamp;
      }
    } else {
      this.dropBlend = 0;
      this.lead = 0;
      r.taut = false;
    }
    this.bus.emit('sim:handle', { holding: on });
  }

  /** Largest re-tension jerk (m/s) inside the landing window. */
  recentJerk(): number {
    return this.jerkAge <= SIM.landingJerkWindow ? this.jerkPeak : 0;
  }

  /** Rider pinned with the rope fully stretched for too long. */
  get stuck(): boolean {
    return this.stuckT > SIM.stuckTime;
  }

  private measure(): number {
    const s = this.s;
    const r = s.rope;
    const dx = r.anchorPos.x - s.pos.x;
    const dz = r.anchorPos.z - s.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) r.dir.set(dx / d, 0, dz / d);
    s.distToWinch = d;
    return d;
  }

  /**
   * Advance the rope by dt. `gain` scales the pull (weaker in the air), `restY` is the height the
   * released handle lies at (surface under the rider).
   */
  update(dt: number, gain: number, restY: number): void {
    const s = this.s;
    const r = s.rope;
    const d = this.measure();
    this.restY = restY;
    this.ax = this.az = 0;
    this.jerkAge += dt;
    r.jerk = Math.max(0, r.jerk - r.jerk * SIM.jerkDecay * dt - 0.2 * dt);

    // drum
    let reel = 0;
    if (this.pulling) {
      this.rampT += dt;
      const k = Math.min(1, this.rampT / this.rampDur);
      reel = this.reelMax * k * k * (3 - 2 * k);
    }
    // released: the handle skims ahead while the operator winds some slack in, then idles
    if (!r.holding && this.lead >= SIM.releasedLead) reel = 0;
    r.reelSpeed += (reel - r.reelSpeed) * damp(10, dt);

    let tensionTarget = 0;
    if (!r.holding) {
      this.holdBlend = 0;
      this.lead = Math.min(SIM.releasedLead, this.lead + reel * 0.5 * dt);
      this.dropBlend = Math.min(1, this.dropBlend + dt / 0.35);
      this.length = d;
      r.taut = false;
      r.slack = 0.6 + this.lead * 0.2;
      r.length = Math.max(0, d - SIM.handleReach - this.lead);
      this.stuckT = 0;
    } else {
      this.holdBlend = Math.min(1, this.holdBlend + dt / SIM.regrabRamp);
      if (d >= this.length) {
        const vr = s.vel.x * r.dir.x + s.vel.z * r.dir.z;
        if (!this.wasTaut) {
          // rope snaps tight
          const deficit = reel * SIM.slackReel - vr;
          if (deficit > 0.4 && this.slackPeak > 0.12) {
            const jerk = deficit * this.holdBlend;
            const kick = jerk * SIM.jerkImpulse;
            s.vel.x += r.dir.x * kick;
            s.vel.z += r.dir.z * kick;
            if (jerk > r.jerk) r.jerk = jerk;
            this.jerkPeak = this.jerkAge <= SIM.landingJerkWindow ? Math.max(this.jerkPeak, jerk) : jerk;
            this.jerkAge = 0;
            if (jerk >= SIM.jerkEvent) this.bus.emit('sim:ropeJerk', { jerk });
          }
          this.slackPeak = 0;
        }
        this.wasTaut = true;
        let stretch = d - this.length;
        if (stretch > SIM.maxStretch) {
          // the drum slips rather than stretch the rope further
          this.length = d - SIM.maxStretch;
          stretch = SIM.maxStretch;
        }
        this.stuckT = stretch >= SIM.stuckStretch && reel > 1 ? this.stuckT + dt : 0;
        const vr2 = s.vel.x * r.dir.x + s.vel.z * r.dir.z;
        const target = reel + SIM.stretchGain * stretch;
        let a = SIM.ropeGain * (target - vr2);
        a = a < 0 ? 0 : a > SIM.maxPull ? SIM.maxPull : a;
        a *= this.holdBlend * gain;
        this.ax = r.dir.x * a;
        this.az = r.dir.z * a;
        this.length -= reel * dt;
        r.taut = this.pulling;
        r.slack = 0;
        tensionTarget = Math.min(1, a / SIM.tensionRef);
      } else {
        this.wasTaut = false;
        const slack = this.length - d;
        if (slack > this.slackPeak) this.slackPeak = slack;
        this.length = Math.max(d, this.length - reel * SIM.slackReel * dt);
        r.taut = false;
        r.slack = slack;
        this.stuckT = 0;
      }
      r.length = Math.max(0, this.length - SIM.handleReach);
    }
    r.tension += (tensionTarget - r.tension) * damp(12, dt);
    this.placeHandle(dt);
  }

  /** Handle in front of the chest while held; on the water ahead of the rider when released. */
  private placeHandle(_dt: number): void {
    const s = this.s;
    const r = s.rope;
    const hx = s.pos.x + r.dir.x * SIM.handleReach;
    const hz = s.pos.z + r.dir.z * SIM.handleReach;
    const hy = s.pos.y + SIM.handleHeight - SIM.handleCrouchDrop * s.crouch;
    if (this.holdBlend >= 1 && r.holding) {
      r.handlePos.set(hx, hy, hz);
      return;
    }
    const lx = hx + r.dir.x * this.lead;
    const lz = hz + r.dir.z * this.lead;
    const ly = hy + (this.restY + 0.04 - hy) * this.dropBlend;
    const k = r.holding ? this.holdBlend : 0;
    r.handlePos.set(lx + (hx - lx) * k, ly + (hy - ly) * k, lz + (hz - lz) * k);
  }
}
