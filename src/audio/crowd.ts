/**
 * Procedural crowd. A "voice bank" = pink noise plus a few gliding sawtooth voices pushed through
 * vowel formant band-passes; on top of it whoops (formant-filtered chirps), whistles and claps
 * (ONE noise source whose gain fires dozens of micro-envelopes). Two banks panned left / right.
 */
import type { AudioCore, Voice } from './graph';
import { scatter } from './sfxWorld';
import { clamp } from './theory';

type Formants = readonly (readonly [number, number])[];
const VOWELS: Record<'ah' | 'eh' | 'oh' | 'oo', Formants> = {
  ah: [[750, 5], [1250, 6]],
  eh: [[520, 5], [1850, 7]],
  oh: [[450, 5], [850, 6]],
  oo: [[330, 5], [760, 6]],
};

/** Formant bank: returns its input node; the filtered sum goes to `env`. */
function vowelBank(v: Voice, vowel: Formants, env: GainNode): GainNode {
  const input = v.gain(1);
  for (const [f, q] of vowel) {
    const bp = v.filter('bandpass', f * v.range(0.93, 1.07), q);
    input.connect(bp).connect(env);
  }
  // breath / consonant band so it does not sound like a synth pad
  const air = v.filter('bandpass', 2700, 0.9);
  const airGain = v.gain(0.22);
  input.connect(air).connect(airGain).connect(env);
  return input;
}

function side(v: Voice, intensity: number, vowel: Formants, withClaps: boolean): void {
  const i = intensity;
  const t = v.t;
  const hold = 0.5 + 1.9 * i;
  const release = 0.26;
  const total = hold + release * 6;

  const env = v.gain(0);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + 0.1 + 0.12 * (1 - i));
  env.gain.setTargetAtTime(0.7, t + 0.25, 0.3);
  env.gain.setTargetAtTime(0, t + hold, release);
  env.connect(v.out);
  // swell (LFO on a gain stage BEFORE the envelope) so the roar breathes instead of sitting flat
  const swell = v.gain(1);
  swell.connect(env);
  const lfo = v.osc('sine', v.range(2.3, 3.6) / v.rate, t, total);
  const lfoGain = v.gain(0.16);
  lfo.connect(lfoGain).connect(swell.gain);
  const bank = vowelBank(v, vowel, swell);

  const bed = v.noise('pink', t, total);
  const bedGain = v.gain(1.5);
  bed.connect(bedGain).connect(bank);

  // people: each a saw swooping up into the cheer and sagging at the end
  const people = 2 + Math.round(3 * i);
  for (let k = 0; k < people; k++) {
    const f0 = v.range(170, 400) * v.rate;
    const start = t + v.range(0, 0.15);
    const o = v.osc('sawtooth', 200, start, total - (start - t));
    o.frequency.setValueAtTime(f0 * 0.85, start);
    o.frequency.linearRampToValueAtTime(f0 * 1.12, start + v.range(0.12, 0.3));
    o.frequency.linearRampToValueAtTime(f0 * v.range(0.8, 0.95), t + hold + 0.4);
    const g = v.gain(0.2);
    o.connect(g).connect(bank);
  }

  const whoops = Math.round(i * 2.6 + v.rnd() * 0.8);
  if (whoops > 0) {
    const freqs: number[] = [];
    for (let k = 0; k < whoops; k++) freqs.push(v.range(480, 720));
    v.chirps('triangle', scatter(v, t + 0.08, hold, whoops), freqs, 1.9, 0.17, 0.55, 0.09, bank);
  }

  if (withClaps) {
    const src = v.noise('white', t, total);
    const bp = v.filter('bandpass', 1700, 1.1);
    const hp = v.filter('highpass', 900, 0.7);
    const g = v.gain(0);
    src.connect(bp).connect(hp).connect(g).connect(v.out);
    const n = Math.round(6 + 34 * i);
    const times = scatter(v, t + 0.05, hold + 0.35, n, 1.3);
    g.gain.setValueAtTime(0, t);
    for (const tc of times) {
      const fade = 1 - (tc - t) / (total + 0.2);
      g.gain.setValueAtTime(v.range(0.3, 0.7) * fade, tc);
      g.gain.setTargetAtTime(0, tc + 0.001, 0.007);
    }
  }

  if (i > 0.8) {
    const times = scatter(v, t + 0.25, hold * 0.7, 2);
    v.chirps('sine', times, [v.range(2100, 2500), v.range(2500, 2900)], 1.32, 0.24, 0.1, 0.1);
  }
}

/** Cheer. intensity 0.45 = polite (tier 3) … 1 = the whole quay goes wild (tier 5). */
export function cheer(core: AudioCore, level: number, intensity: number, pitch: number, at?: number): void {
  const i = clamp(intensity, 0.15, 1);
  const lvl = level * (0.5 + 0.5 * i);
  const left = core.voice('world', lvl, -0.4, 2, pitch * (0.97 + core.rnd() * 0.06), at);
  if (left) side(left, i, VOWELS.ah, false);
  const right = core.voice('world', lvl, 0.4, 2, pitch * (0.97 + core.rnd() * 0.06), at === undefined ? undefined : at + 0.03);
  if (right) side(right, i, VOWELS.eh, true);
}

/** Sympathetic "ooooh" after a heavy slam. */
export function ooh(v: Voice, t: number, a: number): void {
  const hold = 0.3 + 0.3 * a;
  const release = 0.3;
  const total = hold + release * 6;
  const env = v.gain(0);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + 0.09);
  env.gain.setTargetAtTime(0, t + hold, release);
  env.connect(v.out);
  const bank = vowelBank(v, VOWELS.oh, env);
  const bank2 = vowelBank(v, VOWELS.oo, env);
  const bed = v.noise('pink', t, total);
  const bedGain = v.gain(0.9);
  bed.connect(bedGain).connect(bank);
  for (let k = 0; k < 4; k++) {
    const f0 = v.range(140, 250) * v.rate;
    const o = v.osc('sawtooth', 200, t, total);
    o.frequency.setValueAtTime(f0 * 1.06, t);
    o.frequency.linearRampToValueAtTime(f0, t + 0.15);
    o.frequency.linearRampToValueAtTime(f0 * 0.84, t + hold + 0.5);
    const g = v.gain(0.26);
    o.connect(g).connect(k % 2 ? bank : bank2);
  }
}
