/**
 * Pops, kicker launches and air tricks: heights by charge, spins / inverts that come round (or not),
 * grabs, wakeskate flips with the catch, slow-motion request, surface 180.
 */
import { describe, expect, it } from 'vitest';
import { phuketOldTown } from '../../src/data/spots/phuket_oldtown';
import { createSimHarness, type Held, type SimHarness } from '../../src/physics/simTestKit';
import type { BoardKind, GearStats, PowerLevel } from '../../src/types';

const DEG = 180 / Math.PI;

interface AirResult {
  h: SimHarness;
  peak: number;
  airTime: number;
  landed: boolean;
  bail: string | null;
  spinDeg: number;
  rollDeg: number;
  maxSlowMo: number;
}

interface AirOptions {
  board?: BoardKind;
  power?: PowerLevel;
  stats?: Partial<GearStats>;
  /** Seconds of JUMP hold for a flat pop at t = 1.4 s. Ignored when `kicker` is set. */
  hold?: number;
  /** Take kicker_main: 'none' = just ride it, 'hold' = JUMP held through the lip, 'lip' = released in the lip zone. */
  kicker?: 'none' | 'hold' | 'lip';
  /** Extra input while airborne. `frame` counts air frames from 0. */
  air?: (frame: number, h: SimHarness) => Held | void;
  /** Stick steer on the ground (before take-off). */
  groundSteer?: number;
}

function fly(o: AirOptions): AirResult {
  const h = createSimHarness({ spot: phuketOldTown, winchId: 'main', board: o.board, power: o.power, stats: o.stats });
  const res: AirResult = { h, peak: 0, airTime: 0, landed: false, bail: null, spinDeg: 0, rollDeg: 0, maxSlowMo: 0 };
  let frame = 0;
  h.run(
    20,
    (hh) => {
      const s = hh.sim.state;
      let held: Held = {};
      if (s.mode === 'air') {
        held = (o.air && o.air(frame++, hh)) || {};
        res.peak = Math.max(res.peak, s.air.peak);
        res.airTime = s.air.time;
        res.spinDeg = s.air.spin * DEG;
        res.rollDeg = s.air.roll * DEG;
        res.maxSlowMo = Math.max(res.maxSlowMo, s.slowMo);
      } else if (o.kicker) {
        if (o.groundSteer) held.steer = o.groundSteer;
        if (o.kicker === 'hold') held.jump = s.pos.z > 18;
        if (o.kicker === 'lip') held.jump = s.pos.z > 18 && s.pos.z < 28.6;
      } else {
        if (o.groundSteer) held.steer = o.groundSteer;
        const hold = o.hold ?? 1;
        held.jump = s.time > 1.4 && s.time < 1.4 + hold;
      }
      return held;
    },
    (hh) => hh.count('sim:land') + hh.count('sim:bail') > 0,
  );
  res.landed = h.count('sim:land') > 0;
  const bail = h.of('sim:bail')[0];
  res.bail = bail ? bail.reason : null;
  return res;
}

/** TRICK + stick presses on air frames 1, 4, 7 … */
function presses(list: Held[]): (frame: number) => Held | void {
  return (frame) => {
    const k = frame - 1;
    if (k >= 0 && k % 3 === 0 && k / 3 < list.length) return { trick: true, ...list[k / 3] };
    return undefined;
  };
}
const LEFT: Held = { steer: -1 };
const RIGHT: Held = { steer: 1 };
const BACK: Held = { pitch: 1 };
const FRONT: Held = { pitch: -1 };

describe('sim: pop', () => {
  it('height grows with the charge: tap ≈ 0.5 m, full ≈ 1.6 m and ≈ 1.2 s of air', () => {
    const tap = fly({ hold: 0.03 });
    const half = fly({ hold: 0.35 });
    const full = fly({ hold: 1 });
    expect(tap.peak).toBeGreaterThan(0.35);
    expect(tap.peak).toBeLessThan(0.7);
    expect(half.peak).toBeGreaterThan(tap.peak + 0.2);
    expect(full.peak).toBeGreaterThan(half.peak + 0.2);
    expect(full.peak).toBeGreaterThan(1.45);
    expect(full.peak).toBeLessThan(1.8);
    expect(full.airTime).toBeGreaterThan(1.0);
    expect(full.airTime).toBeLessThan(1.35);
    for (const r of [tap, half, full]) {
      expect(r.landed).toBe(true);
      expect(r.h.of('sim:takeoff')[0].kind).toBe('pop');
      expect(r.h.count('sim:pop')).toBe(1);
    }
    expect(full.h.of('sim:pop')[0].power).toBeCloseTo(1, 5);
    expect(tap.h.of('sim:pop')[0].power).toBeLessThan(0.2);
  });

  it('a plain pop needs no rescue: lands clean, keeps the speed, charge shows as crouch', () => {
    const h = createSimHarness({ spot: phuketOldTown });
    let maxCrouch = 0;
    h.run(4, (hh) => {
      maxCrouch = Math.max(maxCrouch, hh.sim.state.crouch);
      return { jump: hh.sim.state.time > 1.4 && hh.sim.state.time < 1.75 };
    });
    expect(maxCrouch).toBeGreaterThan(0.4);
    expect(maxCrouch).toBeLessThan(0.65);
    expect(h.sim.state.crouch).toBe(0);
    const land = h.of('sim:land')[0];
    expect(land.onto).toBe('water');
    expect(land.hadTrick).toBe(false);
    expect(land.quality).not.toBe('bail');
    expect(h.sim.state.speed).toBeGreaterThan(8);
  });

  it('wakeskate pops about 70 % as high', () => {
    const wb = fly({ hold: 1 });
    const ws = fly({ hold: 1, board: 'wakeskate' });
    const ratio = ws.peak / wb.peak;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(0.8);
  });

  it('pop gear changes the height by roughly ±18 %', () => {
    const lo = fly({ hold: 1, stats: { pop: 0 } });
    const mid = fly({ hold: 1 });
    const hi = fly({ hold: 1, stats: { pop: 10 } });
    expect(hi.peak / mid.peak).toBeGreaterThan(1.1);
    expect(hi.peak / mid.peak).toBeLessThan(1.28);
    expect(lo.peak / mid.peak).toBeGreaterThan(0.74);
    expect(lo.peak / mid.peak).toBeLessThan(0.9);
  });
});

describe('sim: kicker', () => {
  it('launches off the lip; a charged pop adds height, best when released in the lip zone', () => {
    const none = fly({ kicker: 'none' });
    const hold = fly({ kicker: 'hold' });
    const lip = fly({ kicker: 'lip' });
    for (const r of [none, hold, lip]) {
      const t = r.h.of('sim:takeoff')[0];
      expect(t.kind).toBe('kicker');
      expect(t.obstacleId).toBe('kicker_main');
      expect(r.landed).toBe(true);
    }
    expect(none.peak).toBeGreaterThan(1.8);
    expect(none.peak).toBeLessThan(2.6);
    expect(hold.peak).toBeGreaterThan(none.peak + 0.5);
    expect(lip.peak).toBeGreaterThan(hold.peak + 0.15);
    // the wooden kicker, full charge, medium power: about 3 m+ and ~1.5 s
    expect(lip.peak).toBeGreaterThan(3.0);
    expect(lip.peak).toBeLessThan(4.0);
    expect(lip.airTime).toBeGreaterThan(1.4);
    expect(lip.airTime).toBeLessThan(1.8);
    expect(none.h.count('sim:pop')).toBe(0);
    expect(lip.h.count('sim:pop')).toBe(1);
  });

  it('more winch power = more air', () => {
    const slow = fly({ kicker: 'lip', power: 'slow' });
    const fast = fly({ kicker: 'lip', power: 'fast' });
    expect(fast.peak).toBeGreaterThan(slow.peak + 0.8);
    expect(fast.airTime).toBeGreaterThan(slow.airTime + 0.2);
  });

  it('rides the ramp as a slide on its own surface before the lip', () => {
    const h = createSimHarness({ spot: phuketOldTown });
    let onRamp = 0;
    let maxTilt = 0;
    h.run(6, (hh) => {
      const s = hh.sim.state;
      if (s.mode === 'slide') {
        onRamp++;
        expect(s.surface).toBe('wood');
        maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, s.surfaceNormal.y)) * DEG);
        expect(s.pos.y).toBeCloseTo(s.surfaceY, 5);
      }
    }, (hh) => hh.sim.state.mode === 'air');
    expect(onRamp).toBeGreaterThan(15);
    // lip angle of kicker_main ≈ 24°
    expect(maxTilt).toBeGreaterThan(18);
    expect(maxTilt).toBeLessThan(30);
    expect(h.sim.state.vel.y).toBeGreaterThan(3);
  });
});

describe('sim: spins and inverts (wakeboard)', () => {
  it('holding the stick left in the air spins without the TRICK button (360 when let go past 180)', () => {
    const r = fly({ hold: 1, air: (f, hh) => (f >= 2 && hh.sim.state.air.spin * DEG < 200 ? { steer: -1 } : undefined) });
    expect(r.landed).toBe(true);
    expect(Math.abs(r.spinDeg - 360)).toBeLessThan(3);
    expect(r.h.of('trick:spin').map((e) => e.deg)).toEqual([180, 360]);
    expect(r.h.count('score:trick')).toBe(1);
  });

  it('a stick already held at take-off does not spin until it passes neutral', () => {
    const r = fly({ hold: 1, groundSteer: -0.6, air: () => ({ steer: -0.6 }) });
    expect(r.h.count('trick:spin')).toBe(0);
    expect(Math.abs(r.spinDeg)).toBeLessThan(1);
  });

  it('a 180 lands switch, a 360 from a full pop lands regular and scores', () => {
    const r180 = fly({ hold: 0.25, air: presses([LEFT]) });
    expect(r180.landed).toBe(true);
    expect(r180.h.sim.state.switch).toBe(true);
    expect(r180.h.count('score:trick')).toBe(1);

    const r360 = fly({ hold: 1, air: presses([LEFT, LEFT]) });
    expect(r360.landed).toBe(true);
    expect(Math.abs(r360.spinDeg - 360)).toBeLessThan(3);
    expect(r360.h.sim.state.switch).toBe(false);
    expect(r360.h.of('trick:spin').map((e) => e.deg)).toEqual([180, 360]);
    expect(r360.h.count('score:trick')).toBe(1);
    expect(r360.h.of('sim:land')[0].hadTrick).toBe(true);
    // comfortable: the rotation is done well before touchdown
    const right = fly({ hold: 1, air: presses([RIGHT, RIGHT]) });
    expect(right.landed).toBe(true);
    expect(Math.abs(right.spinDeg + 360)).toBeLessThan(3);
  });

  it('the 360 is finished with air to spare', () => {
    const h = createSimHarness({ spot: phuketOldTown });
    let frame = 0;
    let doneAt = -1;
    let airTime = 0;
    h.run(8, (hh) => {
      const s = hh.sim.state;
      if (s.mode !== 'air') return { jump: s.time > 1.4 && s.time < 2.4 };
      airTime = s.air.time;
      if (doneAt < 0 && Math.abs(s.air.spin) > 2 * Math.PI - 0.02) doneAt = s.air.time;
      return presses([LEFT, LEFT])(frame++) || {};
    }, (hh) => hh.count('sim:land') > 0);
    expect(doneAt).toBeGreaterThan(0.6);
    expect(airTime - doneAt).toBeGreaterThan(0.15);
  });

  it('540 asked for with too little air = bail (under-rotated), nothing scored', () => {
    const r = fly({ hold: 0.45, air: presses([LEFT, LEFT, LEFT]) });
    expect(r.landed).toBe(false);
    expect(r.bail).toBe('underRotated');
    expect(r.h.count('score:trick')).toBe(0);
    expect(r.h.sim.state.mode).toBe('bail');
    expect(r.h.sim.state.bail?.reason).toBe('underRotated');
    // even the full flat pop does not bring a 540 round with neutral gear …
    const full = fly({ hold: 1, air: presses([LEFT, LEFT, LEFT]) });
    expect(full.spinDeg).toBeLessThan(505);
    // … but the kicker does
    const kick = fly({ kicker: 'lip', air: presses([LEFT, LEFT, LEFT]) });
    expect(kick.landed).toBe(true);
    expect(Math.abs(kick.spinDeg - 540)).toBeLessThan(3);
    expect(kick.h.sim.state.switch).toBe(true);
  });

  it('720 comes round off the kicker; 1080 only with fast power', () => {
    const r720 = fly({ kicker: 'lip', air: presses([LEFT, LEFT, LEFT, LEFT]) });
    expect(r720.landed).toBe(true);
    expect(Math.abs(r720.spinDeg - 720)).toBeLessThan(5);
    expect(r720.h.count('score:trick')).toBe(1);
    const six = [LEFT, LEFT, LEFT, LEFT, LEFT, LEFT];
    const medium = fly({ kicker: 'lip', air: presses(six) });
    expect(medium.spinDeg).toBeLessThan(1040);
    const fast = fly({ kicker: 'lip', power: 'fast', air: presses(six) });
    expect(fast.spinDeg).toBeGreaterThan(1060);
    expect(fast.landed).toBe(true);
    // not from flat water
    const flat = fly({ hold: 1, air: presses([LEFT, LEFT, LEFT, LEFT]) });
    expect(flat.spinDeg).toBeLessThan(640);
  });

  it('backroll and frontroll land from a full flat pop; off a kicker the backroll is a tantrum', () => {
    const back = fly({ hold: 1, air: presses([BACK]) });
    expect(back.landed).toBe(true);
    expect(Math.abs(back.rollDeg - 360)).toBeLessThan(3);
    expect(back.h.of('trick:invert')[0]).toEqual({ id: 'backroll', count: 1 });
    expect(back.h.count('score:trick')).toBe(1);
    const front = fly({ hold: 1, air: presses([FRONT]) });
    expect(front.landed).toBe(true);
    expect(Math.abs(front.rollDeg + 360)).toBeLessThan(3);
    expect(front.h.of('trick:invert')[0].id).toBe('frontroll');
    const tantrum = fly({ kicker: 'lip', air: presses([BACK]) });
    expect(tantrum.h.of('trick:invert')[0].id).toBe('tantrum');
    expect(tantrum.landed).toBe(true);
  });

  it('a double roll needs a kicker: from flat it lands on the head', () => {
    const flat = fly({ hold: 1, air: presses([BACK, BACK]) });
    expect(flat.bail).toBe('inverted');
    const kick = fly({ kicker: 'lip', air: presses([BACK, BACK]) });
    expect(kick.landed).toBe(true);
    expect(kick.h.of('trick:invert').map((e) => e.count)).toEqual([1, 2]);
  });

  it('spin and roll combine in one air', () => {
    const r = fly({ hold: 1, air: presses([BACK, LEFT, LEFT]) });
    expect(r.landed).toBe(true);
    expect(Math.abs(r.spinDeg - 360)).toBeLessThan(3);
    expect(Math.abs(r.rollDeg - 360)).toBeLessThan(3);
    expect(r.h.count('score:trick')).toBe(1);
  });

  it('spin gear changes the rotation speed', () => {
    const slow = fly({ hold: 1, stats: { spin: 0 }, air: presses([LEFT, LEFT, LEFT]) });
    const quick = fly({ hold: 1, stats: { spin: 10 }, air: presses([LEFT, LEFT, LEFT]) });
    expect(quick.spinDeg).toBeGreaterThan(slow.spinDeg + 100);
  });

  it('tap TRICK with a neutral stick = shifty, hold it = raley', () => {
    const shifty = fly({ hold: 1, air: (f) => (f === 2 ? { trick: true } : undefined) });
    expect(shifty.h.count('trick:shifty')).toBe(1);
    expect(shifty.h.count('trick:invert')).toBe(0);
    expect(shifty.landed).toBe(true);
    let maxRaley = 0;
    const raley = fly({
      hold: 1,
      air: (f, h) => {
        maxRaley = Math.max(maxRaley, h.sim.state.air.raley);
        return f >= 2 && f < 40 ? { trick: true } : undefined;
      },
    });
    expect(raley.h.of('trick:invert')[0]).toEqual({ id: 'raley', count: 1 });
    expect(maxRaley).toBeGreaterThan(0.95);
    expect(raley.landed).toBe(true);
    expect(raley.h.sim.state.air.raley).toBe(0);
    // still stretched out at touchdown = slam
    const late = fly({ hold: 1, air: (f) => (f >= 2 ? { trick: true } : undefined) });
    expect(late.landed).toBe(false);
  });
});

describe('sim: grabs (wakeboard)', () => {
  const grabOf = (stick: Held): string => {
    const r = fly({ hold: 1, air: (f) => (f >= 2 && f < 30 ? { grab: true, ...stick } : undefined) });
    expect(r.landed).toBe(true);
    return r.h.of('trick:grab')[0].id;
  };

  it('maps the stick to the six grabs', () => {
    expect(grabOf({})).toBe('indy');
    expect(grabOf({ steer: -1 })).toBe('melon');
    expect(grabOf({ steer: 1 })).toBe('mute');
    expect(grabOf({ pitch: 1 })).toBe('nose');
    expect(grabOf({ pitch: -1 })).toBe('tail');
    expect(grabOf({ pitch: -1, steer: 1 })).toBe('stalefish');
  });

  it('blends in, counts the hold, blends out and scores', () => {
    let maxBlend = 0;
    let maxHold = 0;
    const r = fly({
      hold: 1,
      air: (f, h) => {
        const a = h.sim.state.air;
        maxBlend = Math.max(maxBlend, a.grabBlend);
        maxHold = Math.max(maxHold, a.grabTime);
        return f >= 2 && f < 38 ? { grab: true } : undefined;
      },
    });
    expect(maxBlend).toBe(1);
    expect(maxHold).toBeGreaterThan(0.4);
    expect(r.landed).toBe(true);
    expect(r.h.sim.state.air.grab).toBeNull();
    expect(r.h.count('score:trick')).toBe(1);
    expect(r.h.of('sim:land')[0].hadTrick).toBe(true);
  });

  it('still holding the board at touchdown is not a clean landing', () => {
    const r = fly({ hold: 1, air: (f) => (f >= 2 ? { grab: true } : undefined) });
    const land = r.h.of('sim:land')[0];
    expect(r.bail !== null || (land.quality !== 'perfect' && land.quality !== 'clean')).toBe(true);
  });
});

describe('sim: wakeskate flips', () => {
  const flip = (stick: Held, catchAt: number | null, catchWith: 'grab' | 'jump' = 'grab'): AirResult =>
    fly({
      board: 'wakeskate',
      hold: 1,
      air: (f, h) => {
        const fl = h.sim.state.air.flip;
        if (f === 2) return { grab: true, ...stick };
        if (catchAt !== null && f > 4 && fl.id !== null && !fl.caught && fl.progress >= catchAt && f % 2 === 0) return { [catchWith]: true };
        return undefined;
      },
    });

  it('kickflip takes about 0.45 s and is caught with a second FLIP press', () => {
    const r = flip({ steer: -1 }, 0.97);
    expect(r.h.of('trick:flip')[0].id).toBe('kickflip');
    const c = r.h.of('trick:catch')[0];
    expect(c.ok).toBe(true);
    expect(c.quality).toBeGreaterThan(0.85);
    const flipT = r.h.events.find((e) => e.type === 'trick:flip')?.time ?? 0;
    const catchT = r.h.events.find((e) => e.type === 'trick:catch')?.time ?? 0;
    expect(catchT - flipT).toBeGreaterThan(0.38);
    expect(catchT - flipT).toBeLessThan(0.55);
    expect(r.landed).toBe(true);
    expect(r.h.count('score:trick')).toBe(1);
    expect(r.h.sim.state.air.flip.caught).toBe(true);
  });

  it('JUMP catches too; an early catch is worse than a well-timed one', () => {
    const r = flip({ steer: 1 }, 0.7, 'jump');
    expect(r.h.of('trick:flip')[0].id).toBe('heelflip');
    const c = r.h.of('trick:catch')[0];
    expect(c.ok).toBe(true);
    expect(c.quality).toBeLessThan(0.8);
    expect(r.landed).toBe(true);
  });

  it('maps the stick to the flips', () => {
    expect(flip({}, 0.97).h.of('trick:flip')[0].id).toBe('shuvit');
    expect(flip({ pitch: 1 }, 0.97).h.of('trick:flip')[0].id).toBe('impossible');
    expect(flip({ pitch: -1 }, 0.97).h.of('trick:flip')[0].id).toBe('treflip');
  });

  it('not caught = the board is gone: bail boardLost', () => {
    const r = flip({ steer: -1 }, null);
    expect(r.landed).toBe(false);
    expect(r.bail).toBe('boardLost');
    const bail = r.h.of('sim:bail')[0];
    expect(bail.boardLost).toBe(true);
    expect(r.h.sim.state.bail?.boardLost).toBe(true);
    expect(r.h.of('trick:catch')[0]).toEqual({ quality: 0, ok: false });
    expect(r.h.count('score:trick')).toBe(0);
  });

  it('a late press misses the window', () => {
    const r = flip({ steer: -1 }, 1.55);
    expect(r.bail).toBe('boardLost');
  });

  it('exposes the catch window while the board comes round', () => {
    let opened = -1;
    let best = 0;
    fly({
      board: 'wakeskate',
      hold: 1,
      air: (f, h) => {
        const fl = h.sim.state.air.flip;
        if (fl.catchWindow > 0 && opened < 0) opened = fl.progress;
        best = Math.max(best, fl.catchWindow);
        return f === 2 ? { grab: true, steer: -1 } : undefined;
      },
    });
    expect(opened).toBeGreaterThan(0.5);
    expect(opened).toBeLessThan(0.62);
    expect(best).toBeGreaterThan(0.97);
  });

  it('has no grabs or inverts; FLIP held on the pop is a boneless', () => {
    const r = fly({ board: 'wakeskate', hold: 1, air: presses([BACK]) });
    expect(r.h.count('trick:invert')).toBe(0);
    expect(r.h.count('trick:grab')).toBe(0);
    expect(Math.abs(r.rollDeg)).toBeLessThan(1);
    const plain = fly({ board: 'wakeskate', hold: 1 });
    const h = createSimHarness({ spot: phuketOldTown, board: 'wakeskate' });
    let peak = 0;
    h.run(8, (hh) => {
      const s = hh.sim.state;
      peak = Math.max(peak, s.air.peak);
      return { jump: s.time > 1.4 && s.time < 2.4, grab: s.mode !== 'air' && s.time > 2.2 && s.time < 2.45 };
    }, (hh) => hh.count('sim:land') > 0);
    expect(peak).toBeGreaterThan(plain.peak * 1.1);
    expect(h.count('trick:flip')).toBe(0);
    expect(h.count('score:trick')).toBe(1);
  });
});

describe('sim: slow-motion request and landing prediction', () => {
  it('slowMo rises while a rotation is in progress and is back to 0 at touchdown', () => {
    const h = createSimHarness({ spot: phuketOldTown });
    let frame = 0;
    let maxSlow = 0;
    let lastT = Infinity;
    let wentUpAgain = 0;
    let slowNearLanding = 1;
    h.run(8, (hh) => {
      const s = hh.sim.state;
      if (s.mode !== 'air') {
        if (hh.count('sim:takeoff') === 0) expect(s.slowMo).toBe(0);
        return { jump: s.time > 1.4 && s.time < 2.4 };
      }
      maxSlow = Math.max(maxSlow, s.slowMo);
      if (frame > 2) {
        if (s.air.timeToLand > lastT + 0.02) wentUpAgain++;
        lastT = s.air.timeToLand;
        if (s.air.timeToLand < 0.04) slowNearLanding = s.slowMo;
      }
      return presses([LEFT, LEFT])(frame++) || {};
    }, (hh) => hh.count('sim:land') > 0);
    expect(maxSlow).toBeGreaterThan(0.95);
    expect(wentUpAgain).toBe(0);
    expect(slowNearLanding).toBeLessThan(0.6);
    h.run(0.6);
    expect(h.sim.state.slowMo).toBe(0);
  });

  it('a plain air asks for no slow-motion and predicts its landing', () => {
    const h = createSimHarness({ spot: phuketOldTown });
    let maxSlow = 0;
    let predicted = -1;
    let at = 0;
    h.run(8, (hh) => {
      const s = hh.sim.state;
      maxSlow = Math.max(maxSlow, s.slowMo);
      if (s.mode === 'air' && predicted < 0 && s.air.time > 0.1) {
        predicted = s.air.timeToLand;
        at = s.time;
      }
      return { jump: s.time > 1.4 && s.time < 2.4 };
    }, (hh) => hh.count('sim:land') > 0);
    expect(maxSlow).toBe(0);
    const landedAt = h.events.find((e) => e.type === 'sim:land')?.time ?? 0;
    expect(Math.abs(landedAt - at - predicted)).toBeLessThan(0.08);
  });

  it('time scale only changes how much sim time passes, not the physics', () => {
    const a = createSimHarness({ spot: phuketOldTown });
    const b = createSimHarness({ spot: phuketOldTown });
    for (let i = 0; i < 300; i++) a.sim.step(1 / 60, a.input.set({}), 1);
    // same sim time in slow-motion sized steps
    for (let i = 0; i < 600; i++) b.sim.step(1 / 120, b.input.set({}), 0.5);
    expect(b.sim.state.time).toBeCloseTo(a.sim.state.time, 6);
    expect(b.sim.state.pos.z).toBeCloseTo(a.sim.state.pos.z, 1);
  });
});

describe('sim: surface 180', () => {
  it('TRICK + direction on the water flips switch, turns the board over ~0.3 s and scores', () => {
    const h = createSimHarness({ spot: phuketOldTown });
    h.run(2);
    const s = h.sim.state;
    expect(s.switch).toBe(false);
    const yaw0 = s.boardYaw;
    h.step({ trick: true, steer: -1 });
    expect(h.of('sim:surfaceSpin')[0]).toEqual({ dir: 1 });
    h.run(0.15);
    // half way round
    const mid = Math.abs(Math.atan2(Math.sin(s.boardYaw - yaw0), Math.cos(s.boardYaw - yaw0))) * DEG;
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(140);
    h.run(0.3);
    expect(s.switch).toBe(true);
    expect(s.mode).toBe('water');
    expect(Math.abs(Math.cos(s.boardYaw - s.heading) + 1)).toBeLessThan(0.02);
    expect(h.count('score:trick')).toBe(1);
    // and back, the other way
    h.step({ trick: true, steer: 1 });
    h.run(0.5);
    expect(h.of('sim:surfaceSpin')[1]).toEqual({ dir: -1 });
    expect(s.switch).toBe(false);
    expect(h.count('score:trick')).toBe(2);
    expect(s.speed).toBeGreaterThan(8.5);
  });
});
