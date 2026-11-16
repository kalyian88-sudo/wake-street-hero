/**
 * One-shot recipes for menus, score feedback and run flow: UI clicks, the letter chime, combo
 * bank / lost, HERO start / end, countdown, goal fanfare, camera shutter.
 */
import type { Voice } from './graph';
import { letterMidi, midiToFreq } from './theory';

/** `a` = 0..1 amount, `step` = recipe-specific integer (letter number, blip count). */
export type MetaRecipe = (v: Voice, t: number, a: number, step: number) => void;

/** Plucked saw through a closing low-pass (arpeggio notes). */
function pluck(v: Voice, t: number, freq: number, peak: number, tau: number, bright = 6): void {
  const top = v.core.sr * 0.45;
  const o = v.osc('sawtooth', freq, t, 0.004 + tau * 6);
  const lp = v.filter('lowpass', freq * bright, 1.5);
  lp.frequency.setValueAtTime(Math.min(freq * bright * v.rate, top), t);
  lp.frequency.exponentialRampToValueAtTime(freq * 1.4 * v.rate, t + tau * 1.5);
  const g = v.gain(0);
  v.perc(g.gain, t, peak, 0.004, tau);
  o.connect(lp).connect(g).connect(v.out);
}

/** Two detuned saws through an opening filter: a short brass stab. */
function brass(v: Voice, t: number, midi: number, dur: number, peak: number): void {
  const f = midiToFreq(midi);
  const total = dur + 0.3;
  const o1 = v.osc('sawtooth', f, t, total);
  const o2 = v.osc('sawtooth', f * 1.006, t, total);
  const lp = v.filter('lowpass', 700, 1.2);
  lp.frequency.setValueAtTime(700 * v.rate, t);
  lp.frequency.linearRampToValueAtTime(3600 * v.rate, t + 0.05);
  lp.frequency.setTargetAtTime(1800 * v.rate, t + 0.05, 0.15);
  const g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.018);
  g.gain.setTargetAtTime(peak * 0.75, t + 0.018, 0.08);
  g.gain.setTargetAtTime(0, t + dur, 0.045);
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(g).connect(v.out);
}

export const uiTap: MetaRecipe = (v, t) => {
  v.tone('sine', t, 1150, 780, 0.035, 1, 0.002, 0.016);
  v.burst('white', t, { type: 'highpass', f: 5200 }, 0.22, 0.001, 0.004);
};

export const uiBack: MetaRecipe = (v, t) => {
  v.tone('triangle', t, 640, 640, 0, 0.9, 0.003, 0.028);
  v.tone('triangle', t + 0.065, 430, 390, 0.08, 1, 0.003, 0.045);
};

/** Cash drawer latch + "ka-ching". */
export const uiBuy: MetaRecipe = (v, t) => {
  v.burst('white', t, { type: 'bandpass', f: 2400, q: 2 }, 0.5, 0.001, 0.012);
  v.tone('sine', t, 190, 120, 0.04, 0.5, 0.002, 0.03);
  v.fm(t + 0.04, 1568, 2.76, 1.2, 0.1, 0.05, 0.8, 0.002, 0.16);
  v.fm(t + 0.12, 2093, 2.76, 1.4, 0.1, 0.06, 1, 0.002, 0.3);
  v.burst('white', t + 0.12, { type: 'bandpass', f: 7600, q: 3 }, 0.18, 0.002, 0.1);
};

export const uiStar: MetaRecipe = (v, t) => {
  const f = [1318.5, 1661.2, 1975.5];
  for (let i = 0; i < 3; i++) v.fm(t + i * 0.07, f[i], 2, 0.9, 0.05, 0.05, 0.75 + i * 0.12, 0.002, 0.16 + i * 0.07);
  v.burst('white', t + 0.14, { type: 'highpass', f: 6500 }, 0.1, 0.01, 0.12);
};

/** Lock thunk, then a rising major arpeggio with a bell on top. */
export const uiUnlock: MetaRecipe = (v, t) => {
  v.tone('sine', t, 180, 70, 0.08, 1, 0.002, 0.05);
  v.burst('white', t, { type: 'bandpass', f: 1800, q: 2 }, 0.5, 0.001, 0.01);
  const notes = [72, 76, 79, 84];
  for (let i = 0; i < notes.length; i++) pluck(v, t + 0.12 + i * 0.075, midiToFreq(notes[i]), 0.5, 0.14 + i * 0.03);
  v.fm(t + 0.12 + 4 * 0.075, 2093, 2.76, 1.2, 0.1, 0.08, 0.6, 0.002, 0.35);
  v.burst('white', t + 0.42, { type: 'highpass', f: 7000 }, 0.1, 0.02, 0.15);
};

/** Glassy chime, one scale step higher per collected letter; the sixth adds a run up the chord. */
export const letter: MetaRecipe = (v, t, _a, step) => {
  const f = midiToFreq(letterMidi(step));
  v.fm(t, f, 2, 0.8, 0.05, 0.06, 1, 0.002, 0.26);
  v.tone('sine', t, f * 2, f * 2, 0, 0.22, 0.002, 0.1);
  v.burst('white', t, { type: 'highpass', f: 7500 }, 0.07, 0.002, 0.03);
  if (step >= 6) {
    const run = [88, 92, 95, 100];
    for (let i = 0; i < run.length; i++) v.fm(t + 0.09 + i * 0.07, midiToFreq(run[i]), 2, 0.9, 0.05, 0.06, 0.75, 0.002, 0.2 + i * 0.08);
    v.burst('white', t + 0.36, { type: 'highpass', f: 6500 }, 0.12, 0.03, 0.22);
  }
};

const PENT = [0, 2, 4, 7, 9, 12, 14, 16] as const;

/** Cash-register run: `step` rising blips, a bell "ching" on the big ones. */
export const comboBank: MetaRecipe = (v, t, _a, step) => {
  const n = Math.max(2, Math.min(8, step));
  const lp = v.filter('lowpass', 3800, 0.7);
  lp.connect(v.out);
  for (let i = 0; i < n; i++) {
    const f = midiToFreq(79 + PENT[i]);
    v.tone('square', t + i * 0.052, f, f, 0, 0.42, 0.002, 0.02, lp);
  }
  if (n >= 5) {
    const tc = t + n * 0.052 + 0.02;
    v.fm(tc, 2637, 2.76, 1.2, 0.1, 0.06, 0.7, 0.002, 0.26);
    v.burst('white', tc, { type: 'bandpass', f: 7600, q: 3 }, 0.14, 0.002, 0.1);
  }
};

/** Descending "womp". */
export const comboLost: MetaRecipe = (v, t) => {
  const r = v.rate;
  const o = v.osc('sawtooth', 330, t, 0.75);
  o.frequency.setValueAtTime(330 * r, t);
  o.frequency.exponentialRampToValueAtTime(62 * r, t + 0.45);
  const lp = v.filter('lowpass', 1500, 5);
  lp.frequency.setValueAtTime(1500 * r, t);
  lp.frequency.exponentialRampToValueAtTime(220 * r, t + 0.45);
  const g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.9, t + 0.012);
  g.gain.setTargetAtTime(0, t + 0.3, 0.07);
  o.connect(lp).connect(g).connect(v.out);
  v.tone('sine', t, 120, 45, 0.4, 0.6, 0.01, 0.12);
};

/** Riser → impact → shimmer chord. */
export const heroStart: MetaRecipe = (v, t) => {
  const r = v.rate;
  const rise = 0.55;
  const top = v.core.sr * 0.45;
  const n = v.noise('white', t, rise + 0.08);
  const bp = v.filter('bandpass', 700, 2.5);
  bp.frequency.setValueAtTime(700 * r, t);
  bp.frequency.exponentialRampToValueAtTime(Math.min(7000 * r, top), t + rise);
  const ng = v.gain(0);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.5, t + rise);
  ng.gain.setTargetAtTime(0, t + rise, 0.012);
  n.connect(bp).connect(ng).connect(v.out);

  const o = v.osc('sawtooth', 110, t, rise + 0.08);
  o.frequency.setValueAtTime(110 * r, t);
  o.frequency.exponentialRampToValueAtTime(880 * r, t + rise);
  const lp = v.filter('lowpass', 2500, 1);
  const og = v.gain(0);
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime(0.3, t + rise);
  og.gain.setTargetAtTime(0, t + rise, 0.012);
  o.connect(lp).connect(og).connect(v.out);

  const ti = t + rise;
  v.tone('sine', ti, 82, 30, 0.45, 1, 0.004, 0.22);
  v.burst('white', ti, { type: 'lowpass', f: 9000, to: 900, time: 0.9 }, 0.55, 0.003, 0.26);
  v.burst('pink', ti, { type: 'bandpass', f: 300, q: 0.7 }, 0.5, 0.003, 0.12);
  const chord = [659.3, 987.8, 1318.5];
  for (let i = 0; i < chord.length; i++) v.fm(ti + 0.02 * i, chord[i], 3.01, 1.6, 0.3, 0.3, 0.26, 0.01, 0.45);
};

/** Power-down. */
export const heroEnd: MetaRecipe = (v, t) => {
  const r = v.rate;
  const o = v.osc('sawtooth', 440, t, 1.1);
  o.frequency.setValueAtTime(440 * r, t);
  o.frequency.exponentialRampToValueAtTime(55 * r, t + 0.6);
  const lp = v.filter('lowpass', 2000, 2);
  lp.frequency.setValueAtTime(2000 * r, t);
  lp.frequency.exponentialRampToValueAtTime(200 * r, t + 0.6);
  const g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.6, t + 0.01);
  g.gain.setTargetAtTime(0, t + 0.35, 0.12);
  o.connect(lp).connect(g).connect(v.out);
  v.burst('pink', t, { type: 'lowpass', f: 2500, to: 300, time: 0.6 }, 0.4, 0.02, 0.18);
  v.tone('sine', t + 0.5, 90, 45, 0.1, 0.7, 0.004, 0.08);
};

/** Shimmer when the HERO meter fills. */
export const heroReady: MetaRecipe = (v, t) => {
  v.fm(t, 987.8, 3.01, 1.5, 0.2, 0.2, 0.7, 0.01, 0.3);
  v.fm(t + 0.09, 1480, 3.01, 1.5, 0.2, 0.2, 0.8, 0.01, 0.4);
  v.burst('white', t, { type: 'highpass', f: 7000 }, 0.08, 0.1, 0.2);
};

export const countdownTick: MetaRecipe = (v, t) => {
  v.tone('triangle', t, 880, 880, 0, 1, 0.002, 0.035);
  v.tone('sine', t, 1760, 1760, 0, 0.3, 0.002, 0.02);
};

export const countdownGo: MetaRecipe = (v, t) => {
  v.tone('triangle', t, 1320, 1320, 0, 1, 0.002, 0.13);
  v.tone('sine', t, 660, 660, 0, 0.6, 0.002, 0.15);
  v.tone('sine', t, 1980, 1980, 0, 0.3, 0.002, 0.09);
  v.burst('pink', t, { type: 'bandpass', f: 800, to: 3000, q: 1, time: 0.3 }, 0.3, 0.05, 0.1);
};

/** G–C–E pickup into a held C major stab with a bell on top. */
export const goal: MetaRecipe = (v, t) => {
  brass(v, t, 67, 0.07, 0.3);
  brass(v, t + 0.1, 72, 0.07, 0.3);
  brass(v, t + 0.2, 76, 0.07, 0.32);
  for (const m of [72, 76, 79, 84]) brass(v, t + 0.3, m, 0.5, 0.17);
  v.fm(t + 0.3, 2093, 2.76, 1.2, 0.1, 0.1, 0.4, 0.002, 0.4);
  v.burst('white', t + 0.3, { type: 'highpass', f: 6000 }, 0.12, 0.004, 0.16);
};

/** Small two-note ping for bonuses (gaps). */
export const bonus: MetaRecipe = (v, t) => {
  v.fm(t, 1318.5, 2, 0.8, 0.05, 0.05, 0.8, 0.002, 0.11);
  v.fm(t + 0.08, 1975.5, 2, 0.8, 0.05, 0.05, 1, 0.002, 0.2);
};

/** SLR shutter: curtain tick, mirror clack, tick, tiny motor wind. */
export const cameraShutter: MetaRecipe = (v, t) => {
  v.burst('white', t, { type: 'highpass', f: 2800 }, 1, 0.0005, 0.005);
  v.burst('white', t + 0.045, { type: 'bandpass', f: 1700, q: 1.5 }, 0.8, 0.0005, 0.009);
  v.tone('sine', t + 0.045, 320, 240, 0.02, 0.3, 0.001, 0.015);
  v.burst('white', t + 0.11, { type: 'highpass', f: 3500 }, 0.6, 0.0005, 0.004);
  v.tone('sawtooth', t + 0.125, 340, 520, 0.09, 0.1, 0.01, 0.025);
};
