import { describe, expect, it } from 'vitest';
import {
  Biquad,
  DRUM_IDS,
  makeCrackle,
  makeImpulse,
  makeLoopable,
  makeNoise,
  makeSaturationCurve,
  makeSoftClipCurve,
  peakOf,
  renderKit,
  rmsOf,
  softClip,
} from '../../src/audio/dsp';
import { TRACKS } from '../../src/audio/tracks';
import { seededRng } from '../../src/data/geometry';

const SR = 44100;

function finite(buf: Float32Array): boolean {
  for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) return false;
  return true;
}

/** Share of the signal energy above `hz` (one-pole split, good enough to tell dark from bright). */
function brightness(buf: Float32Array, hz: number): number {
  const hp = Biquad.highpass(SR, hz);
  let hi = 0;
  let all = 0;
  for (let i = 0; i < buf.length; i++) {
    const y = hp.process(buf[i]);
    hi += y * y;
    all += buf[i] * buf[i];
  }
  return hi / Math.max(all, 1e-12);
}

describe('audio / dsp', () => {
  it('biquads pass and reject the right bands', () => {
    const tone = (f: number): Float32Array => {
      const b = new Float32Array(SR / 2);
      for (let i = 0; i < b.length; i++) b[i] = Math.sin((2 * Math.PI * f * i) / SR);
      return b;
    };
    const run = (flt: Biquad, f: number): number => {
      const src = tone(f);
      const out = new Float32Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = flt.process(src[i]);
      return rmsOf(out, 4000) / rmsOf(src, 4000);
    };
    expect(run(Biquad.lowpass(SR, 1000), 100)).toBeGreaterThan(0.95);
    expect(run(Biquad.lowpass(SR, 1000), 8000)).toBeLessThan(0.05);
    expect(run(Biquad.highpass(SR, 1000), 8000)).toBeGreaterThan(0.95);
    expect(run(Biquad.highpass(SR, 1000), 100)).toBeLessThan(0.05);
    expect(run(Biquad.bandpass(SR, 1000, 4), 1000)).toBeGreaterThan(0.95);
    expect(run(Biquad.bandpass(SR, 1000, 4), 200)).toBeLessThan(0.2);
    expect(run(Biquad.bandpass(SR, 1000, 4), 6000)).toBeLessThan(0.2);
  });

  it('noise loops are bounded, loud enough and coloured as named', () => {
    const white = makeNoise('white', SR, 1, seededRng(1));
    const pink = makeNoise('pink', SR, 1, seededRng(2));
    const brown = makeNoise('brown', SR, 1, seededRng(3));
    for (const b of [white, pink, brown]) {
      expect(finite(b)).toBe(true);
      expect(b.length).toBe(SR);
      expect(peakOf(b)).toBeLessThanOrEqual(0.951);
      expect(peakOf(b)).toBeGreaterThan(0.9);
      expect(rmsOf(b)).toBeGreaterThan(0.1);
    }
    const w = brightness(white, 4000);
    const p = brightness(pink, 4000);
    const br = brightness(brown, 4000);
    expect(w).toBeGreaterThan(p);
    expect(p).toBeGreaterThan(br);
    expect(br).toBeLessThan(0.06);
  });

  it('loop crossfade removes the seam', () => {
    const n = 4000;
    const fade = 500;
    const ramp = new Float32Array(n);
    for (let i = 0; i < n; i++) ramp[i] = i / n; // worst case: a saw would click at the loop point
    const loop = makeLoopable(ramp, fade);
    expect(loop.length).toBe(n - fade);
    // the first sample continues where the last one left off
    expect(Math.abs(loop[0] - loop[loop.length - 1])).toBeLessThan(0.01);
  });

  it('vinyl crackle is sparse ticks, not hiss', () => {
    const c = makeCrackle(SR, 2, seededRng(4));
    expect(finite(c)).toBe(true);
    expect(peakOf(c)).toBeCloseTo(0.9, 2);
    // crest factor of ticks is huge compared with steady noise (≈ 1.7 for white)
    expect(peakOf(c) / rmsOf(c)).toBeGreaterThan(12);
    let loud = 0;
    for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) > 0.2) loud++;
    expect(loud).toBeGreaterThan(3);
    expect(loud / c.length).toBeLessThan(0.01);
  });

  it('renders every drum of every kit: audible, bounded, ending in silence', () => {
    for (const t of TRACKS) {
      const kit = renderKit(SR, t.kit, seededRng(99));
      for (const id of DRUM_IDS) {
        const b = kit[id];
        const tag = `${t.id}.${id}`;
        expect(finite(b), tag).toBe(true);
        expect(b.length, tag).toBe(Math.ceil(SR * t.kit[id].len));
        expect(peakOf(b), tag).toBeLessThanOrEqual(0.951);
        expect(peakOf(b), tag).toBeGreaterThan(0.9);
        expect(rmsOf(b), tag).toBeGreaterThan(0.02);
        // starts quiet enough not to click, ends at zero
        expect(Math.abs(b[0]), tag).toBeLessThan(0.3);
        expect(Math.abs(b[b.length - 1]), tag).toBeLessThan(0.002);
        // the natural decay is over before the buffer ends (the fade is only a safety net)
        expect(rmsOf(b, Math.floor(b.length * 0.85)), tag).toBeLessThan(rmsOf(b, 0, Math.floor(b.length * 0.3)) * 0.35);
      }
    }
  });

  it('drums have the spectrum of what they are', () => {
    for (const t of TRACKS) {
      const kit = renderKit(SR, t.kit, seededRng(5));
      expect(brightness(kit.kick, 1000), `${t.id} kick`).toBeLessThan(0.1);
      expect(brightness(kit.hat, 4000), `${t.id} hat`).toBeGreaterThan(0.6);
      expect(brightness(kit.openHat, 4000), `${t.id} open hat`).toBeGreaterThan(0.6);
      expect(brightness(kit.shaker, 2500), `${t.id} shaker`).toBeGreaterThan(0.6);
      const snare = brightness(kit.snare, 1000);
      expect(snare, `${t.id} snare`).toBeGreaterThan(0.15);
      // open hat rings longer than the closed one
      expect(kit.openHat.length).toBeGreaterThan(kit.hat.length);
    }
  });

  it('kits differ between tracks', () => {
    const a = renderKit(SR, TRACKS[0].kit, seededRng(5));
    const b = renderKit(SR, TRACKS[2].kit, seededRng(5));
    expect(a.kick.length).not.toBe(b.kick.length);
    expect(Math.abs(brightness(a.snare, 3000) - brightness(b.snare, 3000))).toBeGreaterThan(0.02);
  });

  it('reverb impulse decays and is stereo-decorrelated', () => {
    const [l, r] = makeImpulse(SR, 1.1, seededRng(6));
    expect(finite(l) && finite(r)).toBe(true);
    expect(l.length).toBe(r.length);
    const q = Math.floor(l.length / 4);
    expect(rmsOf(l, 0, q)).toBeGreaterThan(rmsOf(l, q, 2 * q) * 2);
    expect(rmsOf(l, q, 2 * q)).toBeGreaterThan(rmsOf(l, 3 * q) * 2);
    expect(Math.abs(l[l.length - 1])).toBeLessThan(1e-4);
    let dot = 0;
    for (let i = 0; i < l.length; i++) dot += l[i] * r[i];
    const corr = dot / (rmsOf(l) * rmsOf(r) * l.length);
    expect(Math.abs(corr)).toBeLessThan(0.3);
  });

  it('saturation curve is odd, monotonic and normalised', () => {
    const c = makeSaturationCurve(2.5, 257);
    expect(c[0]).toBeCloseTo(-1, 6);
    expect(c[256]).toBeCloseTo(1, 6);
    expect(c[128]).toBeCloseTo(0, 6);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);
    for (let i = 0; i < 128; i++) expect(c[i]).toBeCloseTo(-c[256 - i], 6);
    // adds level to quiet signals (that is where the harmonics come from)
    expect(c[160]).toBeGreaterThan((160 - 128) / 128);
  });

  it('master soft clipper is transparent below the knee and never exceeds the ceiling', () => {
    for (const x of [-0.7, -0.3, 0, 0.1, 0.5, 0.7]) expect(softClip(x)).toBe(x);
    expect(softClip(0.9)).toBeLessThan(0.9);
    expect(softClip(0.9)).toBeGreaterThan(0.8);
    for (const x of [1, 2, 10, 1000]) {
      expect(softClip(x)).toBeLessThanOrEqual(0.97);
      expect(softClip(-x)).toBeGreaterThanOrEqual(-0.97);
    }
    const curve = makeSoftClipCurve(2);
    expect(curve.length % 2).toBe(1);
    expect(curve[(curve.length - 1) / 2]).toBe(0);
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    expect(peakOf(curve)).toBeLessThanOrEqual(0.97);
    // unity gain in the linear region: input 0.5 sits at 0.25 of the ±2 range
    const idx = Math.round(((0.5 / 2 + 1) / 2) * (curve.length - 1));
    expect(curve[idx]).toBeCloseTo(0.5, 3);
  });
});
