import { describe, expect, it } from 'vitest';
import { judgeLanding, LANDING_RULES as R, landingTolerance } from '../../src/tricks/landing';
import type { LandingInput } from '../../src/types';

function land(over: Partial<LandingInput> = {}): LandingInput {
  return {
    board: 'wakeboard',
    yawErrorDeg: 0,
    rollErrorDeg: 0,
    grabbing: false,
    boardCaught: true,
    catchQuality: 1,
    impactSpeed: 5,
    ropeJerk: 0,
    surface: 'water',
    onto: 'water',
    landingStat: 5,
    hadTrick: true,
    heroActive: false,
    ...over,
  };
}

const q = (over: Partial<LandingInput>): string => judgeLanding(land(over)).quality;
const why = (over: Partial<LandingInput>): string | undefined => judgeLanding(land(over)).reason;

describe('judgeLanding — докрутил / не докрутил (yaw)', () => {
  it('stomped straight after a trick is perfect', () => {
    expect(judgeLanding(land())).toEqual({ quality: 'perfect', speedKeep: 1 });
  });

  it('neutral gear: ≤12° perfect, ≤28° clean, ≤50° sketchy, beyond = under-rotated bail', () => {
    expect(q({ yawErrorDeg: 12 })).toBe('perfect');
    expect(q({ yawErrorDeg: 12.5 })).toBe('clean');
    expect(q({ yawErrorDeg: 28 })).toBe('clean');
    expect(q({ yawErrorDeg: 28.5 })).toBe('sketchy');
    expect(q({ yawErrorDeg: 50 })).toBe('sketchy');
    expect(judgeLanding(land({ yawErrorDeg: 50.5 }))).toEqual({ quality: 'bail', reason: 'underRotated', speedKeep: 0 });
    expect(why({ yawErrorDeg: 90 })).toBe('underRotated');
  });

  it('a 360 that only came round 270° is a bail, one 20° short is clean', () => {
    // the sim folds |boardYaw − travelYaw| to 0..90°: 90° short → 90, 20° short → 20
    expect(q({ yawErrorDeg: 90 })).toBe('bail');
    expect(q({ yawErrorDeg: 20 })).toBe('clean');
  });

  it('speed kept: perfect 1, clean 0.97, sketchy 0.75', () => {
    expect(judgeLanding(land({ yawErrorDeg: 5 })).speedKeep).toBe(1);
    expect(judgeLanding(land({ yawErrorDeg: 20 })).speedKeep).toBe(0.97);
    expect(judgeLanding(land({ yawErrorDeg: 40 })).speedKeep).toBe(0.75);
  });

  it('only a bail carries a reason', () => {
    expect(judgeLanding(land({ yawErrorDeg: 40 })).reason).toBeUndefined();
    expect(judgeLanding(land({ yawErrorDeg: 20 })).reason).toBeUndefined();
  });
});

describe('judgeLanding — inverts (roll)', () => {
  it('≤20° clean, ≤45° sketchy, beyond = landed mid-invert', () => {
    expect(q({ rollErrorDeg: 10 })).toBe('perfect');
    expect(q({ rollErrorDeg: 15 })).toBe('clean');
    expect(q({ rollErrorDeg: 20 })).toBe('clean');
    expect(q({ rollErrorDeg: 21 })).toBe('sketchy');
    expect(q({ rollErrorDeg: 45 })).toBe('sketchy');
    expect(judgeLanding(land({ rollErrorDeg: 46 }))).toEqual({ quality: 'bail', reason: 'inverted', speedKeep: 0 });
    expect(why({ rollErrorDeg: 180 })).toBe('inverted');
  });

  it('upside down beats under-rotated as the reason', () => {
    expect(why({ rollErrorDeg: 120, yawErrorDeg: 80 })).toBe('inverted');
  });
});

describe('judgeLanding — landing stat and HERO scale the thresholds', () => {
  it('tolerance is 1 at stat 5 and ±30 % across 0..10', () => {
    expect(landingTolerance(5)).toBe(1);
    expect(landingTolerance(0)).toBeCloseTo(0.7, 6);
    expect(landingTolerance(10)).toBeCloseTo(1.3, 6);
    expect(landingTolerance(-4)).toBeCloseTo(0.7, 6);
    expect(landingTolerance(99)).toBeCloseTo(1.3, 6);
    expect(landingTolerance(5, true)).toBeCloseTo(R.heroRelax, 6);
  });

  it('good gear saves a landing that neutral gear loses', () => {
    expect(q({ yawErrorDeg: 60, landingStat: 5 })).toBe('bail');
    expect(q({ yawErrorDeg: 60, landingStat: 10 })).toBe('sketchy'); // limit 65°
    expect(q({ yawErrorDeg: 34, landingStat: 5 })).toBe('sketchy');
    expect(q({ yawErrorDeg: 34, landingStat: 10 })).toBe('clean'); // limit 36.4°
    expect(q({ yawErrorDeg: 15, landingStat: 10 })).toBe('perfect'); // limit 15.6°
  });

  it('bad gear punishes a landing that neutral gear survives', () => {
    expect(q({ yawErrorDeg: 40, landingStat: 5 })).toBe('sketchy');
    expect(q({ yawErrorDeg: 40, landingStat: 0 })).toBe('bail'); // limit 35°
    expect(q({ yawErrorDeg: 25, landingStat: 0 })).toBe('sketchy'); // limit 19.6°
    expect(q({ yawErrorDeg: 10, landingStat: 0 })).toBe('clean'); // limit 8.4°
    expect(q({ rollErrorDeg: 35, landingStat: 0 })).toBe('bail'); // limit 31.5°
  });

  it('HERO mode is slightly more forgiving', () => {
    expect(q({ yawErrorDeg: 54 })).toBe('bail');
    expect(q({ yawErrorDeg: 54, heroActive: true })).toBe('sketchy'); // limit 56°
    expect(q({ yawErrorDeg: 30 })).toBe('sketchy');
    expect(q({ yawErrorDeg: 30, heroActive: true })).toBe('clean'); // limit 31.4°
    expect(q({ yawErrorDeg: 70, heroActive: true })).toBe('bail');
  });
});

describe('judgeLanding — grabs', () => {
  it('still grabbing on an otherwise clean landing is sketchy', () => {
    expect(q({ grabbing: true })).toBe('sketchy');
    expect(q({ grabbing: true, impactSpeed: 6.5 })).toBe('sketchy'); // full flat pop
  });

  it('still grabbing with a big impact is a bail', () => {
    expect(judgeLanding(land({ grabbing: true, impactSpeed: 9.3 }))).toEqual({ quality: 'bail', reason: 'grabbed', speedKeep: 0 });
  });
});

describe('judgeLanding — wakeskate catch', () => {
  const sk = (over: Partial<LandingInput>): LandingInput => land({ board: 'wakeskate', ...over });

  it('board not caught = board lost, whatever else happened', () => {
    expect(judgeLanding(sk({ boardCaught: false }))).toEqual({ quality: 'bail', reason: 'boardLost', speedKeep: 0 });
    expect(judgeLanding(sk({ boardCaught: false, rollErrorDeg: 170, yawErrorDeg: 90 })).reason).toBe('boardLost');
  });

  it('a late / early catch is sketchy, a good one clean, a great one perfect', () => {
    expect(judgeLanding(sk({ catchQuality: 0.3 })).quality).toBe('sketchy');
    expect(judgeLanding(sk({ catchQuality: 0.5 })).quality).toBe('clean');
    expect(judgeLanding(sk({ catchQuality: 0.8 })).quality).toBe('perfect');
    expect(judgeLanding(sk({ catchQuality: 1 })).quality).toBe('perfect');
  });

  it('catch quality is ignored on a wakeboard', () => {
    expect(q({ catchQuality: 0 })).toBe('perfect');
  });
});

describe('judgeLanding — rope jerk', () => {
  it('a jerk in the landing window is sketchy, a brutal one is a bail', () => {
    expect(q({ ropeJerk: 3.5 })).toBe('perfect');
    expect(q({ ropeJerk: 5 })).toBe('sketchy');
    expect(judgeLanding(land({ ropeJerk: 9 }))).toEqual({ quality: 'bail', reason: 'ropeJerk', speedKeep: 0 });
  });

  it('thresholds scale with the landing stat', () => {
    expect(q({ ropeJerk: 5, landingStat: 10 })).toBe('perfect'); // limit 5.2
    expect(q({ ropeJerk: 6, landingStat: 0 })).toBe('bail'); // limit 5.6
  });
});

describe('judgeLanding — impact', () => {
  it('water is forgiving', () => {
    expect(q({ impactSpeed: 9.3 })).toBe('perfect');
    expect(q({ impactSpeed: 13 })).toBe('perfect');
    expect(q({ impactSpeed: 16 })).toBe('sketchy');
  });

  it('a hard landing on something solid is sketchy, a very hard one is a bail', () => {
    const solid = { onto: 'solid', surface: 'concrete' } as const;
    expect(q({ ...solid, impactSpeed: 6.5 })).toBe('perfect');
    expect(q({ ...solid, impactSpeed: 9.3 })).toBe('sketchy');
    expect(judgeLanding(land({ ...solid, impactSpeed: 12.5 }))).toEqual({ quality: 'bail', reason: 'hardLanding', speedKeep: 0 });
  });

  it('rough ground bites harder', () => {
    expect(q({ onto: 'solid', surface: 'wetConcrete', impactSpeed: 8 })).toBe('perfect');
    expect(q({ onto: 'solid', surface: 'asphalt', impactSpeed: 8 })).toBe('sketchy'); // limit 7.2
    expect(q({ onto: 'solid', surface: 'grass', impactSpeed: 10.5 })).toBe('bail'); // limit 10.2
  });

  it('rails and walls have their own limits', () => {
    expect(q({ onto: 'rail', surface: 'metal', impactSpeed: 7 })).toBe('perfect');
    expect(q({ onto: 'rail', surface: 'metal', impactSpeed: 9 })).toBe('sketchy');
    expect(why({ onto: 'rail', surface: 'metal', impactSpeed: 12 })).toBe('hardLanding');
    expect(q({ onto: 'wall', surface: 'concrete', impactSpeed: 8.8 })).toBe('perfect');
  });
});

describe('judgeLanding — no trick, several faults', () => {
  it('a landing with no trick is never "perfect"', () => {
    expect(judgeLanding(land({ hadTrick: false }))).toEqual({ quality: 'clean', speedKeep: 0.97 });
  });

  it('…but it can still be sketchy or a bail', () => {
    expect(q({ hadTrick: false, yawErrorDeg: 35 })).toBe('sketchy');
    expect(why({ hadTrick: false, yawErrorDeg: 80 })).toBe('underRotated');
    expect(why({ hadTrick: false, onto: 'solid', surface: 'stone', impactSpeed: 14 })).toBe('hardLanding');
    expect(why({ hadTrick: false, ropeJerk: 10 })).toBe('ropeJerk');
  });

  it('two faults are still sketchy, three at once are a bail with the worst reason', () => {
    expect(q({ yawErrorDeg: 40, grabbing: true })).toBe('sketchy');
    expect(judgeLanding(land({ yawErrorDeg: 40, grabbing: true, ropeJerk: 5 }))).toEqual({ quality: 'bail', reason: 'underRotated', speedKeep: 0 });
    expect(why({ rollErrorDeg: 30, yawErrorDeg: 40, ropeJerk: 5 })).toBe('inverted');
    expect(R.faultsToBail).toBe(3);
  });
});
