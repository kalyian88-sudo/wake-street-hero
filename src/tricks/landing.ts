/**
 * Landing judgement — "докрутил / не докрутил". Pure function of the touchdown snapshot.
 *
 * Every threshold is multiplied by a TOLERANCE: 1 at landingStat 5, ±30 % across 0..10 (gear), and a little
 * more in HERO mode. Order of checks:
 *   1. hard bails — board not caught, landed mid-invert, under-rotated, big impact while still grabbing,
 *      brutal impact on something solid, rope snapping tight far too hard;
 *   2. faults — each of: roll / yaw outside the clean range, still grabbing, late catch, hard impact,
 *      rope jerk. One or two faults = 'sketchy'; three at once = bail (reason of the worst one);
 *   3. no faults — 'perfect' if a trick was done and it was stomped dead straight, else 'clean'.
 * Landing switch is fine: the sim folds the yaw error to 0..90°.
 */
import type { BailReason, LandingInput, LandingQuality, LandingVerdict } from '../types';

export const LANDING_RULES = {
  /** Board yaw vs. travel direction, degrees. */
  yawPerfect: 12,
  yawClean: 28,
  yawSketchy: 50,
  /** Unfinished invert rotation, degrees. */
  rollPerfect: 10,
  rollClean: 20,
  rollSketchy: 45,
  /** Fraction the thresholds move across landingStat 0..10 (5 = neutral). */
  statSpread: 0.3,
  /** Extra forgiveness while HERO mode is on. */
  heroRelax: 1.12,
  /** Still grabbing: above this impact (m/s) it is a bail, below it a sketchy landing (a full flat pop lands at ≈ 6.5, a kicker air at 9+). */
  grabBailImpact: 8,
  /** Wakeskate catch quality 0..1: below = sketchy; 'perfect' needs catchPerfect or better. */
  catchSketchy: 0.4,
  catchPerfect: 0.75,
  /** Rope re-tension jerk in the landing window, m/s. */
  jerkSketchy: 4,
  jerkBail: 8,
  /** Downward speed at touchdown, m/s. Water forgives almost anything. */
  impact: {
    water: { sketchy: 14, bail: 22 },
    solid: { sketchy: 8.5, bail: 12 },
    rail: { sketchy: 8, bail: 11.5 },
    wall: { sketchy: 9, bail: 13 },
  } satisfies Record<LandingInput['onto'], { sketchy: number; bail: number }>,
  /** Rough ground bites harder: impact limits are multiplied by this on grass / sand / asphalt. */
  roughSurface: 0.85,
  /** This many simultaneous faults turn a sketchy landing into a bail. */
  faultsToBail: 3,
  /** Fraction of speed kept. */
  speedKeep: { perfect: 1, clean: 0.97, sketchy: 0.75, bail: 0 } satisfies Record<LandingQuality, number>,
};

/** Threshold multiplier for a landing stat (0..10) and HERO mode. Exported for the HUD / tests. */
export function landingTolerance(landingStat: number, heroActive = false): number {
  const stat = landingStat < 0 ? 0 : landingStat > 10 ? 10 : landingStat;
  const tol = 1 + ((stat - 5) / 5) * LANDING_RULES.statSpread;
  return heroActive ? tol * LANDING_RULES.heroRelax : tol;
}

function verdict(quality: LandingQuality, reason?: BailReason): LandingVerdict {
  const v: LandingVerdict = { quality, speedKeep: LANDING_RULES.speedKeep[quality] };
  if (reason) v.reason = reason;
  return v;
}

export function judgeLanding(i: LandingInput): LandingVerdict {
  const R = LANDING_RULES;
  const tol = landingTolerance(i.landingStat, i.heroActive);
  const yaw = Math.abs(i.yawErrorDeg);
  const roll = Math.abs(i.rollErrorDeg);
  const rough = i.onto !== 'water' && (i.surface === 'grass' || i.surface === 'sand' || i.surface === 'asphalt');
  const limits = R.impact[i.onto] ?? R.impact.solid;
  const impactTol = tol * (rough ? R.roughSurface : 1);

  // 1. hard bails
  if (!i.boardCaught) return verdict('bail', 'boardLost');
  if (roll > R.rollSketchy * tol) return verdict('bail', 'inverted');
  if (yaw > R.yawSketchy * tol) return verdict('bail', 'underRotated');
  if (i.grabbing && i.impactSpeed > R.grabBailImpact * tol) return verdict('bail', 'grabbed');
  if (i.impactSpeed > limits.bail * impactTol) return verdict('bail', 'hardLanding');
  if (i.ropeJerk > R.jerkBail * tol) return verdict('bail', 'ropeJerk');

  // 2. faults, worst first
  let faults = 0;
  let worst: BailReason | undefined;
  if (roll > R.rollClean * tol) {
    faults++;
    worst ??= 'inverted';
  }
  if (yaw > R.yawClean * tol) {
    faults++;
    worst ??= 'underRotated';
  }
  if (i.grabbing) {
    faults++;
    worst ??= 'grabbed';
  }
  if (i.board === 'wakeskate' && i.catchQuality < R.catchSketchy / tol) {
    faults++;
    worst ??= 'boardLost';
  }
  if (i.impactSpeed > limits.sketchy * impactTol) {
    faults++;
    worst ??= 'hardLanding';
  }
  if (i.ropeJerk > R.jerkSketchy * tol) {
    faults++;
    worst ??= 'ropeJerk';
  }
  if (faults >= R.faultsToBail) return verdict('bail', worst);
  if (faults > 0) return verdict('sketchy');

  // 3. stomped
  const perfect = i.hadTrick && yaw <= R.yawPerfect * tol && roll <= R.rollPerfect * tol && (i.board !== 'wakeskate' || i.catchQuality >= R.catchPerfect);
  return verdict(perfect ? 'perfect' : 'clean');
}
