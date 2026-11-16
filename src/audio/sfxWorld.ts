/**
 * One-shot recipes for things that happen IN the world (water, board, rail, rope). Every recipe
 * builds a handful of filtered-noise bursts / swept tones on a Voice; `a` is the 0..1 amount the
 * caller derived from the event (pop power, landing impact, bail intensity, catch quality…).
 */
import type { Voice } from './graph';

export type WorldRecipe = (v: Voice, t: number, a: number, variant: string | undefined) => void;

/** Sorted random times in [t0, t0 + span). */
export function scatter(v: Voice, t0: number, span: number, count: number, curve = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(t0 + Math.pow(v.rnd(), curve) * span);
  out.sort((x, y) => x - y);
  return out;
}

function randoms(v: Voice, count: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(v.range(lo, hi));
  return out;
}

export const pop: WorldRecipe = (v, t, a, variant) => {
  if (variant === 'solid') {
    // tail snap on concrete / wood: dry "tok" + a little grit
    v.burst('white', t, { type: 'bandpass', f: 1500, q: 3 }, 0.9, 0.001, 0.014);
    v.tone('triangle', t, 420, 180, 0.03, 0.7, 0.001, 0.025);
    v.burst('pink', t + 0.004, { type: 'bandpass', f: 700, q: 0.8 }, 0.3, 0.004, 0.03);
  } else {
    // board unsticking from the water: slap + low thump + spray
    v.burst('white', t, { type: 'lowpass', f: 2600, to: 700, time: 0.08 }, 0.9, 0.002, 0.035);
    v.tone('sine', t, 150, 62, 0.07, 0.55 + 0.35 * a, 0.003, 0.05);
    v.burst('white', t + 0.03, { type: 'highpass', f: 3500 }, 0.12 + 0.16 * a, 0.02, 0.12);
  }
  // whoosh of the rider leaving, longer for a fully loaded pop
  v.burst('pink', t + 0.01, { type: 'bandpass', f: 480, to: 2200, q: 1.1, time: 0.22 }, 0.15 + 0.45 * a, 0.06, 0.07 + 0.05 * a);
};

export const landWater: WorldRecipe = (v, t, a) => {
  v.burst('pink', t, { type: 'lowpass', f: 3800, to: 600, time: 0.3 }, 1, 0.004, 0.1 + 0.1 * a);
  v.tone('sine', t, 105, 48, 0.1, 0.5 + 0.4 * a, 0.003, 0.07);
  v.burst('white', t + 0.02, { type: 'highpass', f: 4200 }, 0.2 + 0.12 * a, 0.03, 0.14 + 0.14 * a);
  if (a > 0.55) v.chirps('sine', scatter(v, t + 0.18, 0.45, 4), randoms(v, 4, 1500, 3400), 1.5, 0.03, 0.1, 0.014);
};

export const landHard: WorldRecipe = (v, t, a, variant) => {
  const wood = variant === 'wood';
  v.tone('sine', t, wood ? 170 : 130, wood ? 90 : 55, 0.06, 0.7 + 0.3 * a, 0.002, 0.045);
  v.burst('white', t, { type: 'bandpass', f: wood ? 1100 : 1900, q: wood ? 3 : 1.4 }, 0.9, 0.001, 0.016);
  v.tone('triangle', t, 260, 190, 0.05, 0.35, 0.002, 0.04);
  v.burst('pink', t + 0.015, { type: 'bandpass', f: 800, q: 0.8 }, 0.18 + 0.2 * a, 0.01, 0.07);
};

export const splashBig: WorldRecipe = (v, t, a) => {
  v.tone('sine', t, 85, 36, 0.18, 1, 0.004, 0.13);
  v.burst('pink', t, { type: 'lowpass', f: 5200, to: 700, time: 0.7 }, 1, 0.008, 0.2 + 0.12 * a);
  v.burst('white', t + 0.04, { type: 'highpass', f: 3000 }, 0.35, 0.05, 0.25 + 0.15 * a);
  // drops raining back down
  const n = 5 + Math.round(5 * a);
  v.chirps('sine', scatter(v, t + 0.25, 0.85, n, 0.8), randoms(v, n, 1300, 3600), 1.55, 0.03, 0.13, 0.016);
};

export const bailWater: WorldRecipe = (v, t, a) => {
  splashBig(v, t, a, undefined);
  // going under: bubbles through a dull filter + low rumble
  const lp = v.filter('lowpass', 750, 0.8);
  lp.connect(v.out);
  const n = 5 + Math.round(4 * a);
  v.chirps('sine', scatter(v, t + 0.2, 0.9, n), randoms(v, n, 170, 480), 2.1, 0.06, 0.5, 0.03, lp);
  v.burst('brown', t + 0.08, { type: 'lowpass', f: 320 }, 0.7, 0.1, 0.3);
};

export const bailConcrete: WorldRecipe = (v, t, a) => {
  v.tone('sine', t, 95, 40, 0.12, 1, 0.003, 0.08);
  v.burst('white', t, { type: 'bandpass', f: 1100, q: 1 }, 0.8, 0.001, 0.03);
  v.burst('pink', t + 0.01, { type: 'lowpass', f: 520 }, 0.6, 0.01, 0.1);
  // the board clattering away: knocks at shrinking gaps
  let tk = t + 0.09;
  let gap = 0.12;
  for (let i = 0; i < 4; i++) {
    const amp = 0.55 - i * 0.11;
    v.burst('white', tk, { type: 'bandpass', f: v.range(900, 1500), q: 6 }, amp, 0.001, 0.018);
    v.tone('triangle', tk, 520, 380, 0.02, amp * 0.45, 0.001, 0.02);
    tk += gap * v.range(0.85, 1.15);
    gap *= 0.68;
  }
  v.burst('pink', t + 0.1, { type: 'bandpass', f: 700, q: 0.7 }, 0.15 + 0.15 * a, 0.05, 0.18);
};

/** Board locking onto a rail / ledge. variant = material from 'sim:railEnter'. */
export const railLock: WorldRecipe = (v, t, _a, variant) => {
  if (variant === 'stone') {
    v.burst('pink', t, { type: 'bandpass', f: 650, q: 1.5 }, 1, 0.001, 0.03);
    v.tone('sine', t, 140, 80, 0.05, 0.6, 0.002, 0.04);
    v.burst('white', t, { type: 'bandpass', f: 2500, q: 1 }, 0.3, 0.001, 0.02);
  } else if (variant === 'wood') {
    v.tone('sine', t, 400, 330, 0.03, 0.8, 0.001, 0.035);
    v.tone('sine', t, 830, 760, 0.02, 0.35, 0.001, 0.02);
    v.burst('white', t, { type: 'bandpass', f: 1200, q: 2 }, 0.4, 0.001, 0.01);
  } else if (variant === 'plastic') {
    v.tone('sine', t, 230, 150, 0.05, 0.8, 0.002, 0.04);
    v.burst('pink', t, { type: 'lowpass', f: 1500 }, 0.5, 0.001, 0.025);
  } else {
    // metal clank: inharmonic partials of a struck bar + contact click + low clunk
    const f0 = v.range(480, 560);
    const ratios = [1, 2.76, 5.4, 8.93];
    const peaks = [0.6, 0.45, 0.3, 0.15];
    const taus = [0.12, 0.09, 0.05, 0.03];
    for (let i = 0; i < 4; i++) v.tone('sine', t, f0 * ratios[i], f0 * ratios[i], 0, peaks[i], 0.001, taus[i]);
    v.burst('white', t, { type: 'highpass', f: 4500 }, 0.6, 0.0005, 0.006);
    v.tone('sine', t, 170, 110, 0.04, 0.5, 0.002, 0.04);
  }
};

/** Wakeskate: the tail tick that starts a flip. */
export const flipClick: WorldRecipe = (v, t) => {
  v.burst('white', t, { type: 'bandpass', f: 2300, q: 2.5 }, 1, 0.0005, 0.007);
  v.tone('triangle', t, 1300, 650, 0.02, 0.5, 0.0005, 0.012);
  v.burst('white', t + 0.012, { type: 'bandpass', f: 900, q: 2 }, 0.35, 0.001, 0.012);
};

/** Wakeskate: both feet slapping back onto the grip. a = catch quality. */
export const flipCatch: WorldRecipe = (v, t, a) => {
  v.burst('pink', t, { type: 'lowpass', f: 1100 + 900 * a }, 1, 0.001, 0.022);
  v.burst('pink', t + 0.028, { type: 'lowpass', f: 900 }, 0.7, 0.001, 0.02);
  v.tone('sine', t, 190, 120, 0.04, 0.7, 0.002, 0.035);
  v.burst('white', t, { type: 'highpass', f: 3500 }, 0.25 * a, 0.001, 0.012);
};

/** Rope snapping tight. a = jerk 0..1. */
export const twang: WorldRecipe = (v, t, a) => {
  const dur = 0.5 + 0.5 * a;
  const o1 = v.osc('sawtooth', 96, t, dur);
  const o2 = v.osc('triangle', 193, t, dur);
  for (const o of [o1, o2]) {
    const f = o.frequency.value;
    o.frequency.setValueAtTime(f * 1.22, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
  }
  const bp = v.filter('bandpass', 520, 2);
  const g = v.gain(0);
  v.perc(g.gain, t, 0.9, 0.002, 0.08 + 0.1 * a);
  o1.connect(bp);
  o2.connect(bp);
  bp.connect(g).connect(v.out);
  v.burst('white', t, { type: 'bandpass', f: 2800, q: 1.5 }, 0.5 * a, 0.001, 0.012);
};

/** Air whoosh when a spin / invert starts. variant 'down' sweeps downwards. */
export const whoosh: WorldRecipe = (v, t, a, variant) => {
  const up = variant !== 'down';
  v.burst('pink', t, { type: 'bandpass', f: up ? 600 : 2400, to: up ? 2400 : 600, q: 1.4, time: 0.24 }, 0.5 + 0.5 * a, 0.08, 0.07);
};

/** Hand finding the board. */
export const grab: WorldRecipe = (v, t) => {
  v.burst('white', t, { type: 'bandpass', f: 1800, q: 1.5 }, 1, 0.001, 0.008);
  v.tone('sine', t, 300, 220, 0.02, 0.4, 0.001, 0.015);
};

export const handle: WorldRecipe = (v, t, _a, variant) => {
  if (variant === 'grab') {
    v.burst('white', t, { type: 'bandpass', f: 1500, q: 3 }, 1, 0.001, 0.01);
    v.tone('triangle', t, 520, 400, 0.02, 0.5, 0.001, 0.015);
  } else {
    v.burst('white', t, { type: 'bandpass', f: 3000, to: 900, q: 2, time: 0.08 }, 1, 0.003, 0.03);
  }
};

/** Surface 180: the board smearing round on the water. */
export const swish: WorldRecipe = (v, t) => {
  v.burst('white', t, { type: 'bandpass', f: 1800, to: 3800, q: 0.9, time: 0.15 }, 1, 0.04, 0.07);
  v.burst('pink', t, { type: 'lowpass', f: 900 }, 0.5, 0.02, 0.06);
};
