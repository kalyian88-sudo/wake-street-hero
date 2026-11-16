/**
 * Pure music / level maths for the audio module. No WebAudio, no DOM — unit-tested in node.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return gain > 1e-9 ? 20 * Math.log10(gain) : -180;
}

/** Pitch ratio → cents. */
export function ratioToCents(ratio: number): number {
  return 1200 * Math.log2(Math.max(1e-6, ratio));
}

/** Settings slider 0..1 → linear gain. Perceptual taper: 0.5 on the slider ≈ −10 dB. */
export function volumeCurve(v: number): number {
  const c = clamp(Number.isFinite(v) ? v : 0, 0, 1);
  return c <= 0 ? 0 : Math.pow(c, 1.6);
}

/** Time constant for setTargetAtTime so the value has decayed by 60 dB after `seconds`. */
export function tauFor60(seconds: number): number {
  return seconds / 6.908;
}

// ───────────────────────────────────────────────────────────── slow motion ──

/** Pitch factor of world sounds at a global time scale: 1 → 1, 0.35 → ≈0.63, 0.22 → ≈0.51. */
export function slowMoPitch(timeScale: number): number {
  return Math.pow(clamp(timeScale, 0.15, 1), 0.44);
}

/** Low-pass cutoff (Hz) of the world bus: fully open at 1×, ≈1.5 kHz at 0.35×, ≈0.9 kHz in HERO slow-mo. */
export function slowMoCutoff(timeScale: number): number {
  const s = clamp((1 - timeScale) / 0.65, 0, 1.25);
  return 19000 * Math.pow(1500 / 19000, s);
}

/** Music keeps its tempo; below 0.6× it only gets a gentle low-pass (≈4 kHz at 0.35×, ≈1.9 kHz at 0.22×). */
export function musicSlowCutoff(timeScale: number): number {
  if (timeScale >= 0.6) return 18000;
  const s = clamp((0.6 - timeScale) / 0.38, 0, 1);
  return 18000 * Math.pow(1900 / 18000, s);
}

// ─────────────────────────────────────────────────────────────── harmony ──

export type ChordQuality =
  | 'maj7'
  | 'maj9'
  | '6/9'
  | 'add9'
  | 'm7'
  | 'm9'
  | 'm11'
  | 'm6'
  | '7'
  | '9'
  | '13'
  | '7#9'
  | '7b9'
  | '9sus'
  | 'm7b5'
  | 'dim7';

/** Chord tones ABOVE the root (the root itself is played by the bass → rootless voicings). */
export const CHORD_INTERVALS: Record<ChordQuality, readonly number[]> = {
  maj7: [4, 7, 11],
  maj9: [4, 7, 11, 14],
  '6/9': [4, 7, 9, 14],
  add9: [4, 7, 14],
  m7: [3, 7, 10],
  m9: [3, 7, 10, 14],
  m11: [3, 10, 14, 17],
  m6: [3, 7, 9],
  '7': [4, 7, 10],
  '9': [4, 10, 14],
  '13': [4, 10, 14, 21],
  '7#9': [4, 10, 15],
  '7b9': [4, 10, 13],
  '9sus': [5, 10, 14],
  m7b5: [3, 6, 10],
  dim7: [3, 6, 9],
};

export interface ChordSym {
  /** Root pitch class 0..11 (0 = C). */
  root: number;
  q: ChordQuality;
  /** Length in beats (default 4 = a whole bar). */
  beats?: number;
}

export function pc(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/** Pitch classes of a chord including its root. */
export function chordPitchClasses(ch: ChordSym): number[] {
  const out = [pc(ch.root)];
  for (const iv of CHORD_INTERVALS[ch.q]) {
    const p = pc(ch.root + iv);
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * Close rootless voicing around `center`. Every pitch class always lands on the same note of the
 * 12-semitone window, so common tones between chords stay put (cheap voice leading). Semitone
 * clusters are opened by lifting the lower note an octave (b3‑5‑b7‑9, 3‑b7‑9‑13 shapes).
 */
export function voiceChord(ch: ChordSym, center = 62): number[] {
  const lo = Math.round(center) - 6;
  const notes: number[] = [];
  for (const iv of CHORD_INTERVALS[ch.q]) {
    const p = pc(ch.root + iv);
    const n = lo + ((((p - lo) % 12) + 12) % 12);
    if (!notes.includes(n)) notes.push(n);
  }
  notes.sort((a, b) => a - b);
  for (let guard = 0; guard < 4; guard++) {
    let moved = false;
    for (let i = 0; i < notes.length - 1; i++) {
      if (notes[i + 1] - notes[i] === 1) {
        notes[i] += 12;
        notes.sort((a, b) => a - b);
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return notes;
}

/** Bass register note for a pitch class: lowest note ≥ `low` with that pitch class. */
export function bassMidi(rootPc: number, low = 28): number {
  return low + ((((pc(rootPc) - low) % 12) + 12) % 12);
}

export type ScaleName = 'major' | 'minor' | 'dorian' | 'majPent' | 'minPent' | 'harmMinor' | 'blues' | 'mixolydian';

export const SCALES: Record<ScaleName, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  majPent: [0, 2, 4, 7, 9],
  minPent: [0, 3, 5, 7, 10],
  harmMinor: [0, 2, 3, 5, 7, 8, 11],
  blues: [0, 3, 5, 6, 7, 10],
};

/** MIDI note of scale `degree` (may be negative or past the octave) above `base` (a MIDI note of the tonic). */
export function scaleNote(base: number, scale: readonly number[], degree: number): number {
  const n = scale.length;
  const d = Math.round(degree);
  const oct = Math.floor(d / n);
  const idx = ((d % n) + n) % n;
  return base + oct * 12 + scale[idx];
}

/** Nearest note to `midi` whose pitch class belongs to the chord (ties resolve downwards). */
export function nearestChordTone(midi: number, ch: ChordSym): number {
  const pcs = chordPitchClasses(ch);
  for (let d = 0; d <= 6; d++) {
    if (pcs.includes(pc(midi - d))) return midi - d;
    if (pcs.includes(pc(midi + d))) return midi + d;
  }
  return midi;
}

// ──────────────────────────────────────────────────────────────── rhythm ──

/** Seconds per 16th note. */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

/**
 * Start time (seconds from the bar start) of a 16th `step` (fractional steps allowed for rolls)
 * with MPC-style swing: every odd 16th is pushed late. swing 0.5 = straight, 0.667 = triplet feel.
 */
export function swingTime(step: number, stepDur: number, swing: number): number {
  const pair = Math.floor(step / 2);
  const within = step - pair * 2; // 0..2
  const s = clamp(swing, 0.5, 0.75);
  // piecewise-linear warp of the pair: [0,1) → [0, 2s), [1,2) → [2s, 2)
  const warped = within < 1 ? within * 2 * s : 2 * s + (within - 1) * (2 - 2 * s);
  return (pair * 2 + warped) * stepDur;
}

// ───────────────────────────────────────────────────────── gameplay maps ──

const LETTER_STEPS = [0, 2, 4, 5, 7, 9] as const;

/** Chime note for the n-th collected letter (1..6): one step of the E-major scale higher each time. */
export function letterMidi(count: number): number {
  const i = clamp(Math.round(count), 1, 6) - 1;
  return 76 + LETTER_STEPS[i];
}

/** Number of cash-register blips for a banked combo. */
export function bankBlipCount(banked: number): number {
  if (!(banked > 0)) return 0;
  return clamp(Math.round(1 + Math.log10(Math.max(banked, 50) / 50) * 2), 2, 8);
}

/** Crowd reaction 0..1 for a scored trick; 0 = nobody cares (tier < 3). */
export function cheerIntensity(tier: number, landing: 'perfect' | 'clean' | 'sketchy' | 'bail'): number {
  if (landing === 'bail' || tier < 3) return 0;
  const base = tier >= 5 ? 1 : tier >= 4 ? 0.72 : 0.45;
  const k = landing === 'perfect' ? 1.12 : landing === 'sketchy' ? 0.7 : 1;
  return clamp(base * k, 0, 1);
}

/** Landing impact (vertical m/s) → 0..1. */
export function impactNorm(impact: number): number {
  return clamp((Math.abs(impact) - 1) / 8, 0, 1);
}
