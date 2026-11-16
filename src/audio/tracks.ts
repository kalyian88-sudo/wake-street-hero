/**
 * Music track definitions (pure data). Five procedural beats; everything the pattern generator
 * (patterns.ts) and the player (music.ts) need: tempo, key, progressions, drum lanes, kit, colours.
 *
 * Pattern alphabet (16 chars = one bar of 16th notes):
 *   drums:  X accent · x normal · o soft · - ghost · . rest
 *   bass:   R root · r soft root · 3 third · 5 fifth · 8 octave · a/A approach the next root from
 *           below/above · _ hold the previous note · . rest
 * Pitch classes: C0 C#1 D2 Eb3 E4 F5 F#6 G7 Ab8 A9 Bb10 B11.
 */
import type { DrumId, KitParams } from './dsp';
import type { ChordSym, ScaleName } from './theory';

export type SectionKind = 'intro' | 'A' | 'A2' | 'B' | 'breakdown';
export type BassPreset = 'sub' | '808' | 'upright' | 'synth';
export type KeysPreset = 'rhodes' | 'wurli' | 'pad' | 'softEp' | 'darkBell';
export type LeadPreset = 'kalimba' | 'vibes' | 'bell' | 'arp' | 'guitar';
export type DrumLane = Partial<Record<DrumId, readonly string[]>>;

export interface TrackDef {
  id: string;
  bpm: number;
  /** 0.5 straight … 0.667 triplet. Applied to odd 16ths. */
  swing: number;
  /** Tonic pitch class. */
  key: number;
  /** Scale of the lead line (relative to the tonic). */
  scale: ScaleName;
  prog: { A: readonly ChordSym[]; B: readonly ChordSym[] };
  drums: { A: DrumLane; B: DrumLane };
  /** Chord comping per bar: [step, lengthInSteps]. Bars holding two chords play one hit per chord instead. */
  comp: { A: readonly (readonly [number, number])[]; B: readonly (readonly [number, number])[] };
  bassPat: { A: readonly string[]; B: readonly string[] };
  bass: BassPreset;
  /** Lowest bass note (MIDI). */
  bassLow: number;
  keys: KeysPreset;
  /** Centre of the chord voicing window (MIDI). */
  keysCenter: number;
  lead: LeadPreset;
  leadStyle: 'motif' | 'arp' | 'sparse';
  /** MIDI note of the tonic in the lead register. */
  leadBase: number;
  form: readonly SectionKind[];
  /** Form index to jump back to after the last section (skips the intro). */
  loopFrom: number;
  fill: 'snare' | 'hats' | 'kickDrop';
  /** Probability of ghost snares per bar (0..1). */
  ghost: number;
  /** Probability of a hi-hat roll per bar (trap). */
  hatRolls: number;
  /** Random timing spread of hats/percussion (s) and how far the backbeat drags behind the grid (s). */
  humanize: number;
  lateSnare: number;
  /** Relative instrument levels inside the track bus. */
  mix: { drums: number; bass: number; keys: number; lead: number; crackle: number; reverb: number };
  /** Per-voice trims of the drum kit (default 1), e.g. the ride that carries the jazzy track. */
  drumMix?: Partial<Record<DrumId, number>>;
  /** Lo-fi bus low-pass (Hz), tape wow/flutter amount 0..1, sidechain depth 0..1 (how far the kick pushes keys down). */
  lofi: number;
  wobble: number;
  duck: number;
  /** Loudness trim so every track sits at the same level (measured with the offline render, see Audio.ts). */
  gain: number;
  kit: KitParams;
}

const C = 0;
const Cs = 1;
const D = 2;
const Eb = 3;
const E = 4;
const F = 5;
const Fs = 6;
const G = 7;
const Ab = 8;
const A = 9;
const Bb = 10;
const B = 11;

export const TRACKS: readonly TrackDef[] = [
  // ── 1. laid-back lo-fi: dusty Rhodes, soft kick, kalimba hook ──────────────────────────────
  {
    id: 'phuket_sunset',
    bpm: 80,
    swing: 0.585,
    key: Eb,
    scale: 'majPent',
    prog: {
      A: [{ root: Eb, q: 'maj9' }, { root: C, q: 'm9' }, { root: Ab, q: 'maj9' }, { root: Bb, q: '13' }],
      B: [{ root: Ab, q: 'maj9' }, { root: G, q: 'm7' }, { root: F, q: 'm9' }, { root: Bb, q: '9sus' }],
    },
    drums: {
      A: {
        kick: ['x......o..x.....', 'x......o..x..o..'],
        snare: ['....x.......x...'],
        hat: ['x.o.x.o.x.o.x.o.', 'x.o.x.o.x.oox.o.'],
        shaker: ['.o.o.o.o.o.o.o.o'],
        rim: ['................', '.........o......'],
        openHat: ['................', '..............o.'],
        perc: ['...o......o.....', '......o.........'],
      },
      B: {
        kick: ['x.....x...x.....', 'x.....x..ox.....'],
        snare: ['....x.......x...'],
        hat: ['x.x.x.x.x.x.x.x.'],
        shaker: ['.o.o.o.o.o.o.o.o'],
        rim: ['.......o........', '...............o'],
        perc: ['...o......o.....'],
      },
    },
    comp: { A: [[0, 14]], B: [[0, 6], [6, 9]] },
    bassPat: {
      A: ['R_____..r.R___..', 'R_____..r.R__.a.'],
      B: ['R__.r_..R___.5_.', 'R__.r_..R__.a_..'],
    },
    bass: 'sub',
    bassLow: 31,
    keys: 'rhodes',
    keysCenter: 63,
    lead: 'kalimba',
    leadStyle: 'motif',
    leadBase: 75,
    form: ['intro', 'A', 'A2', 'B', 'breakdown', 'A2', 'B'],
    loopFrom: 1,
    fill: 'snare',
    ghost: 0.3,
    hatRolls: 0,
    humanize: 0.006,
    lateSnare: 0.012,
    mix: { drums: 0.9, bass: 0.8, keys: 0.9, lead: 0.6, crackle: 1, reverb: 0.28 },
    drumMix: { hat: 1.7, shaker: 1.6, openHat: 1.3 },
    lofi: 5200,
    wobble: 1,
    duck: 0.45,
    gain: 0.94,
    kit: {
      kick: { f0: 150, f1: 50, pitchTau: 0.03, ampTau: 0.16, click: 0.15, drive: 1.6, len: 0.5 },
      snare: { tone: 190, toneAmt: 0.5, noiseF: 2200, noiseQ: 0.8, tau: 0.085, lp: 5200, drive: 1.3, len: 0.32 },
      clap: { f: 1300, q: 1.3, tau: 0.07, spread: 0.011, len: 0.3 },
      hat: { hp: 4500, tau: 0.022, metal: 0.35, f: 330, len: 0.12 },
      openHat: { hp: 4200, tau: 0.16, metal: 0.4, f: 330, len: 0.5 },
      rim: { f: 1650, tau: 0.012, click: 0.5, len: 0.08 },
      shaker: { f: 4200, q: 0.9, attack: 0.012, tau: 0.03, len: 0.14 },
      perc: { f0: 620, f1: 520, tau: 0.05, partial: 0.3, len: 0.22 },
    },
  },

  // ── 2. boom-bap: hard swung drums, Wurli stabs, muted guitar licks ─────────────────────────
  {
    id: 'old_town',
    bpm: 90,
    swing: 0.62,
    key: A,
    scale: 'minPent',
    prog: {
      A: [{ root: A, q: 'm9' }, { root: F, q: 'maj9' }, { root: D, q: 'm9' }, { root: E, q: '7#9' }],
      B: [{ root: D, q: 'm9' }, { root: G, q: '13' }, { root: C, q: 'maj9' }, { root: E, q: '7b9' }],
    },
    drums: {
      A: {
        kick: ['x......ox.x.....', 'x......ox.x...o.'],
        snare: ['....X.......X...'],
        hat: ['x.o.x.o.x.o.x.o.', 'x.o.x.o.x.o.x.xo'],
        openHat: ['................', '......o.........'],
        perc: ['..........o.....', '...o............'],
      },
      B: {
        kick: ['x..x....x.x.....', 'x..x....x.x..x..'],
        snare: ['....X.......X...'],
        hat: ['x.x.x.x.x.x.x.x.'],
        openHat: ['..............o.', '................'],
        perc: ['......o.......o.'],
      },
    },
    comp: { A: [[0, 3], [6, 4], [11, 3]], B: [[0, 5], [6, 8]] },
    bassPat: {
      A: ['R__.R_...r.R_.a.', 'R__.R_...r.R_8_.'],
      B: ['R_.r..R_..5_.a..', 'R_.r..R_..8_.a..'],
    },
    bass: 'sub',
    bassLow: 33,
    keys: 'wurli',
    keysCenter: 60,
    lead: 'guitar',
    leadStyle: 'motif',
    leadBase: 69,
    form: ['intro', 'A', 'A2', 'B', 'A2', 'breakdown', 'B'],
    loopFrom: 1,
    fill: 'kickDrop',
    ghost: 0.55,
    hatRolls: 0,
    humanize: 0.004,
    lateSnare: 0.006,
    mix: { drums: 1, bass: 0.85, keys: 0.8, lead: 0.6, crackle: 0.6, reverb: 0.2 },
    lofi: 6500,
    wobble: 0.6,
    duck: 0.5,
    gain: 0.76,
    kit: {
      kick: { f0: 170, f1: 55, pitchTau: 0.022, ampTau: 0.13, click: 0.35, drive: 2.4, len: 0.42 },
      snare: { tone: 210, toneAmt: 0.8, noiseF: 2600, noiseQ: 0.7, tau: 0.1, lp: 7500, drive: 1.8, len: 0.34 },
      clap: { f: 1250, q: 1.2, tau: 0.08, spread: 0.012, len: 0.32 },
      hat: { hp: 5500, tau: 0.03, metal: 0.3, f: 350, len: 0.14 },
      openHat: { hp: 5200, tau: 0.2, metal: 0.35, f: 350, len: 0.6 },
      rim: { f: 1700, tau: 0.013, click: 0.5, len: 0.08 },
      shaker: { f: 5600, q: 0.9, attack: 0.01, tau: 0.03, len: 0.14 },
      perc: { f0: 900, f1: 760, tau: 0.04, partial: 0.4, len: 0.2 },
    },
  },

  // ── 3. dark half-time: long 808s, hat rolls, cold bells ────────────────────────────────────
  {
    id: 'granite',
    bpm: 78,
    swing: 0.5,
    key: Cs,
    scale: 'minor',
    prog: {
      A: [{ root: Cs, q: 'm9' }, { root: A, q: 'maj7' }, { root: Fs, q: 'm9' }, { root: Ab, q: '7b9' }],
      B: [{ root: Fs, q: 'm9' }, { root: Ab, q: 'm7' }, { root: A, q: 'maj9' }, { root: Ab, q: '7' }],
    },
    drums: {
      A: {
        kick: ['x.........x..x..', 'x......x..x.....'],
        snare: ['........X.......'],
        clap: ['........x.......'],
        hat: ['xoxoxoxoxoxoxoxo'],
        openHat: ['....o...........', '..............o.'],
        perc: ['...........o....', '.....o..........'],
      },
      B: {
        kick: ['x..x......x.....', 'x..x......xx....'],
        snare: ['........X.......'],
        clap: ['........x.......'],
        hat: ['x.x.x.x.xoxox.x.', 'xoxox.x.x.x.xoxo'],
        openHat: ['..x.............', '................'],
        perc: ['.....o.......o..'],
      },
    },
    comp: { A: [[0, 15]], B: [[0, 7], [8, 7]] },
    bassPat: {
      A: ['R_________R__r_.', 'R______r__R_____'],
      B: ['R__R______R_____', 'R__R______RR___a'],
    },
    bass: '808',
    bassLow: 30,
    keys: 'darkBell',
    keysCenter: 61,
    lead: 'bell',
    leadStyle: 'sparse',
    leadBase: 73,
    form: ['intro', 'A', 'B', 'A2', 'breakdown', 'B', 'A2'],
    loopFrom: 1,
    fill: 'hats',
    ghost: 0,
    hatRolls: 0.6,
    humanize: 0.002,
    lateSnare: 0,
    mix: { drums: 0.95, bass: 0.62, keys: 1, lead: 0.75, crackle: 0.35, reverb: 0.34 },
    drumMix: { hat: 1.3, snare: 1.1 },
    lofi: 8000,
    wobble: 0.3,
    duck: 0.55,
    gain: 0.82,
    kit: {
      kick: { f0: 130, f1: 44, pitchTau: 0.045, ampTau: 0.28, click: 0.2, drive: 2.8, len: 0.8 },
      snare: { tone: 230, toneAmt: 0.45, noiseF: 3400, noiseQ: 0.7, tau: 0.07, lp: 9000, drive: 1.5, len: 0.28 },
      clap: { f: 1500, q: 1.1, tau: 0.09, spread: 0.012, len: 0.34 },
      hat: { hp: 7000, tau: 0.016, metal: 0.55, f: 380, len: 0.09 },
      openHat: { hp: 6500, tau: 0.14, metal: 0.55, f: 380, len: 0.45 },
      rim: { f: 1900, tau: 0.01, click: 0.6, len: 0.07 },
      shaker: { f: 6200, q: 0.9, attack: 0.008, tau: 0.025, len: 0.12 },
      perc: { f0: 1250, f1: 1180, tau: 0.03, partial: 0.2, len: 0.15 },
    },
  },

  // ── 4. jazzy: ii–V–I, ride cymbal, walking upright, vibraphone ─────────────────────────────
  {
    id: 'canal_ride',
    bpm: 96,
    swing: 0.645,
    key: C,
    scale: 'major',
    prog: {
      A: [{ root: D, q: 'm9' }, { root: G, q: '13' }, { root: C, q: 'maj9' }, { root: A, q: '7b9' }],
      B: [
        { root: F, q: 'maj9' },
        { root: Bb, q: '13' },
        { root: E, q: 'm7', beats: 2 },
        { root: A, q: '7#9', beats: 2 },
        { root: D, q: 'm9', beats: 2 },
        { root: G, q: '13', beats: 2 },
      ],
    },
    drums: {
      A: {
        kick: ['x.........o.....', 'x......o..o.....'],
        rim: ['....x.......x...'],
        hat: ['x..ox..ox..ox..o'],
        snare: ['................'],
        perc: ['..........o.....', '......o.........'],
      },
      B: {
        kick: ['x.....o...x.....'],
        rim: ['....x..o....x...'],
        hat: ['x..ox..ox..ox..o'],
        openHat: ['..........o.....', '................'],
        snare: ['................'],
        perc: ['...o............'],
      },
    },
    comp: { A: [[0, 5], [6, 6]], B: [[0, 3], [7, 6]] },
    bassPat: {
      A: ['R___3___5___a___', 'R___5___3___A___'],
      B: ['R___5___8___a___', 'R___3___5___a___'],
    },
    bass: 'upright',
    bassLow: 36,
    keys: 'softEp',
    keysCenter: 62,
    lead: 'vibes',
    leadStyle: 'motif',
    leadBase: 72,
    form: ['intro', 'A', 'A2', 'B', 'A2', 'B', 'breakdown'],
    loopFrom: 1,
    fill: 'snare',
    ghost: 0.6,
    hatRolls: 0,
    humanize: 0.007,
    lateSnare: 0.004,
    mix: { drums: 0.8, bass: 0.9, keys: 0.85, lead: 0.65, crackle: 0.7, reverb: 0.3 },
    drumMix: { hat: 2.2, openHat: 1.6, rim: 1.3 },
    lofi: 6800,
    wobble: 0.6,
    duck: 0.3,
    gain: 0.99,
    kit: {
      kick: { f0: 120, f1: 52, pitchTau: 0.03, ampTau: 0.12, click: 0.1, drive: 1.3, len: 0.4 },
      snare: { tone: 200, toneAmt: 0.25, noiseF: 3000, noiseQ: 0.5, tau: 0.06, lp: 6000, drive: 1.1, len: 0.25 },
      clap: { f: 1300, q: 1.2, tau: 0.07, spread: 0.011, len: 0.3 },
      hat: { hp: 4200, tau: 0.11, metal: 0.6, f: 410, len: 0.4 },
      openHat: { hp: 4000, tau: 0.3, metal: 0.6, f: 410, len: 0.8 },
      rim: { f: 1800, tau: 0.014, click: 0.6, len: 0.08 },
      shaker: { f: 5000, q: 0.9, attack: 0.012, tau: 0.03, len: 0.14 },
      perc: { f0: 540, f1: 430, tau: 0.07, partial: 0.15, len: 0.28 },
    },
  },

  // ── 5. synth night: pumping pad, arpeggio, claps ───────────────────────────────────────────
  {
    id: 'neon_zone',
    bpm: 86,
    swing: 0.52,
    key: B,
    scale: 'minPent',
    prog: {
      A: [{ root: B, q: 'm9' }, { root: G, q: 'maj9' }, { root: E, q: 'm9' }, { root: Fs, q: '9sus', beats: 2 }, { root: Fs, q: '7', beats: 2 }],
      B: [{ root: G, q: 'maj9' }, { root: A, q: '6/9' }, { root: Fs, q: 'm7' }, { root: B, q: 'm9' }],
    },
    drums: {
      A: {
        kick: ['x.....x...x.....', 'x.....x...x..x..'],
        clap: ['....x.......x...'],
        snare: ['....o.......o...'],
        hat: ['x.o.x.o.x.o.x.oo'],
        openHat: ['..o.......o.....'],
        perc: ['.......o.....o..', '...o.....o......'],
      },
      B: {
        kick: ['x...x...x...x...'],
        clap: ['....x.......x...'],
        snare: ['....o.......o...'],
        hat: ['..x...x...x...x.'],
        shaker: ['o-o-o-o-o-o-o-o-'],
        perc: ['.......o.....o..'],
      },
    },
    comp: { A: [[0, 16]], B: [[0, 16]] },
    bassPat: {
      A: ['R_.R_.R_..R_.8_.', 'R_.R_.R_..R_.5_.'],
      B: ['R_R_8_R_R_R_8_R_', 'R_R_8_R_R_R_5_8_'],
    },
    bass: 'synth',
    bassLow: 33,
    keys: 'pad',
    keysCenter: 59,
    lead: 'arp',
    leadStyle: 'arp',
    leadBase: 71,
    form: ['intro', 'A', 'A2', 'B', 'breakdown', 'A2', 'B'],
    loopFrom: 1,
    fill: 'hats',
    ghost: 0,
    hatRolls: 0.15,
    humanize: 0.001,
    lateSnare: 0,
    mix: { drums: 0.95, bass: 0.85, keys: 0.75, lead: 0.5, crackle: 0.15, reverb: 0.32 },
    drumMix: { hat: 1.4, openHat: 1.3, shaker: 1.4 },
    lofi: 9500,
    wobble: 0.25,
    duck: 0.65,
    gain: 0.65,
    kit: {
      kick: { f0: 160, f1: 47, pitchTau: 0.028, ampTau: 0.2, click: 0.3, drive: 2.2, len: 0.6 },
      snare: { tone: 220, toneAmt: 0.4, noiseF: 4000, noiseQ: 0.6, tau: 0.08, lp: 10000, drive: 1.4, len: 0.3 },
      clap: { f: 1400, q: 1, tau: 0.1, spread: 0.01, len: 0.36 },
      hat: { hp: 7500, tau: 0.02, metal: 0.5, f: 400, len: 0.1 },
      openHat: { hp: 7000, tau: 0.17, metal: 0.5, f: 400, len: 0.5 },
      rim: { f: 1900, tau: 0.01, click: 0.6, len: 0.07 },
      shaker: { f: 6800, q: 0.8, attack: 0.006, tau: 0.02, len: 0.1 },
      perc: { f0: 1500, f1: 1480, tau: 0.04, partial: 0.3, len: 0.18 },
    },
  },
];

export function findTrack(id: string | undefined): TrackDef | undefined {
  return TRACKS.find((t) => t.id === id);
}
