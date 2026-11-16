/**
 * Grind / slide loops. One ScrapeVoice per contact (created on rail enter or when a slide starts,
 * torn down shortly after) built from a per-material recipe:
 *   noise bands      — the scrape itself (bright for metal, low and gritty for stone…)
 *   narrow resonators — the "singing" of a steel rail (white noise through Q≈35 band-passes)
 *   saw AM            — audio-rate roughness, the serrated "zzzz" of a hard surface
 *   knock generator   — a slow saw whose resets excite hollow resonators (wood / bamboo joints)
 */
import type { NoiseKind } from './dsp';
import type { AudioCore } from './graph';
import type { ScrapeKind } from './layerParams';

interface Band {
  src: NoiseKind;
  type: BiquadFilterType;
  f: number;
  q: number;
  gain: number;
}

interface ScrapeDef {
  bands: readonly Band[];
  /** Roughness: saw LFO rate (Hz) and depth 0..1. */
  am?: { rate: number; depth: number };
  /** Hollow knocks: base rate, extra rate at full speed, resonators [f, Q, gain]. */
  knock?: { rate: number; perSpeed: number; res: readonly (readonly [number, number, number])[] };
  /** Output low-pass at standstill; opens ×1.6 at full speed. */
  lp: number;
  /** Calibration gain (measured offline) → RMS at level 1 as listed in the table in Audio.ts. */
  gain: number;
}

const SCRAPES: Record<ScrapeKind, ScrapeDef> = {
  metal: {
    bands: [
      { src: 'white', type: 'bandpass', f: 3400, q: 0.9, gain: 0.5 },
      { src: 'white', type: 'bandpass', f: 2150, q: 32, gain: 7 },
      { src: 'white', type: 'bandpass', f: 3160, q: 36, gain: 5 },
      { src: 'white', type: 'bandpass', f: 4490, q: 40, gain: 4 },
    ],
    am: { rate: 34, depth: 0.35 },
    lp: 6500,
    gain: 1,
  },
  stone: {
    bands: [
      { src: 'brown', type: 'bandpass', f: 260, q: 0.7, gain: 1.6 },
      { src: 'pink', type: 'bandpass', f: 1100, q: 0.8, gain: 0.5 },
      { src: 'white', type: 'bandpass', f: 2600, q: 1, gain: 0.12 },
    ],
    am: { rate: 43, depth: 0.5 },
    lp: 2000,
    gain: 1,
  },
  wood: {
    bands: [{ src: 'pink', type: 'bandpass', f: 900, q: 0.6, gain: 0.25 }],
    knock: {
      rate: 7,
      perSpeed: 10,
      res: [
        [380, 9, 1],
        [760, 7, 0.5],
        [1320, 5, 0.25],
      ],
    },
    lp: 3000,
    gain: 1,
  },
  plastic: {
    bands: [
      { src: 'pink', type: 'bandpass', f: 420, q: 1.2, gain: 1 },
      { src: 'pink', type: 'bandpass', f: 230, q: 8, gain: 0.8 },
    ],
    am: { rate: 17, depth: 0.15 },
    lp: 1100,
    gain: 1,
  },
  concrete: {
    bands: [
      { src: 'pink', type: 'bandpass', f: 800, q: 0.6, gain: 1 },
      { src: 'white', type: 'bandpass', f: 2600, q: 0.8, gain: 0.2 },
    ],
    am: { rate: 55, depth: 0.4 },
    lp: 3600,
    gain: 1,
  },
  wet: {
    bands: [
      { src: 'white', type: 'bandpass', f: 4800, q: 0.7, gain: 0.45 },
      { src: 'pink', type: 'bandpass', f: 500, q: 0.7, gain: 0.5 },
    ],
    am: { rate: 23, depth: 0.12 },
    lp: 7000,
    gain: 1,
  },
  soft: {
    bands: [{ src: 'pink', type: 'lowpass', f: 1400, q: 0.5, gain: 0.6 }],
    lp: 1600,
    gain: 1,
  },
};

export class ScrapeVoice {
  readonly kind: ScrapeKind;
  private readonly core: AudioCore;
  private readonly def: ScrapeDef;
  private readonly out: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly detunes: AudioParam[] = [];
  private readonly knockOsc: OscillatorNode | null = null;
  private lastLevel = -1;
  private lastSpeed = -1;
  released = false;

  constructor(core: AudioCore, kind: ScrapeKind) {
    this.core = core;
    this.kind = kind;
    const def = (this.def = SCRAPES[kind]);
    const ctx = core.ctx;

    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(core.layerBus);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = def.lp;
    this.lp.Q.value = 0.5;
    this.lp.connect(this.out);
    this.follow(this.lp.detune);

    const am = ctx.createGain();
    am.connect(this.lp);
    if (def.am) {
      // gain swings between 1 − depth and 1 at the saw rate
      am.gain.value = 1 - def.am.depth * 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = 'sawtooth';
      lfo.frequency.value = def.am.rate * (0.9 + core.rnd() * 0.2);
      const depth = ctx.createGain();
      depth.gain.value = def.am.depth * 0.5;
      lfo.connect(depth).connect(am.gain);
      lfo.start();
      this.follow(lfo.detune);
      this.sources.push(lfo);
    }

    const srcs = new Map<NoiseKind, AudioBufferSourceNode>();
    for (const b of def.bands) {
      let src = srcs.get(b.src);
      if (!src) {
        src = core.noiseSource(b.src);
        srcs.set(b.src, src);
        this.sources.push(src);
      }
      const f = ctx.createBiquadFilter();
      f.type = b.type;
      // every rail sings at a slightly different pitch
      f.frequency.value = b.f * (b.q > 10 ? 0.9 + core.rnd() * 0.2 : 1);
      f.Q.value = b.q;
      this.follow(f.detune);
      const g = ctx.createGain();
      g.gain.value = b.gain;
      src.connect(f).connect(g).connect(am);
    }

    if (def.knock) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = def.knock.rate;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 250;
      osc.connect(hp);
      for (const [f, q, gain] of def.knock.res) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f * (0.94 + core.rnd() * 0.12);
        bp.Q.value = q;
        this.follow(bp.detune);
        const g = ctx.createGain();
        g.gain.value = gain;
        hp.connect(bp).connect(g).connect(this.lp);
      }
      osc.start();
      this.sources.push(osc);
      this.knockOsc = osc;
    }
  }

  private follow(detune: AudioParam): void {
    if (!this.core.pitchBus) return;
    this.core.pitchBus.connect(detune);
    this.detunes.push(detune);
  }

  /** level 0..1 (already includes the speed curve), speed 0..1 (brightness / knock rate). */
  set(level: number, speed: number): void {
    if (this.released) return;
    const now = this.core.now;
    if (Math.abs(level - this.lastLevel) > 0.01) {
      this.lastLevel = level;
      this.out.gain.setTargetAtTime(level * this.def.gain, now, 0.035);
    }
    if (Math.abs(speed - this.lastSpeed) > 0.02) {
      this.lastSpeed = speed;
      this.lp.frequency.setTargetAtTime(this.def.lp * (1 + 0.6 * speed), now, 0.08);
      if (this.knockOsc && this.def.knock) {
        this.knockOsc.frequency.setTargetAtTime(this.def.knock.rate + this.def.knock.perSpeed * speed, now, 0.08);
      }
    }
  }

  /** Fade out and free the nodes. */
  release(): void {
    if (this.released) return;
    this.released = true;
    const now = this.core.now;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, 0.04);
    const last = this.sources[0];
    for (const s of this.sources) {
      try {
        s.stop(now + 0.35);
      } catch {
        /* never started */
      }
    }
    const cleanup = (): void => {
      this.out.disconnect();
      for (const p of this.detunes) {
        try {
          this.core.pitchBus?.disconnect(p);
        } catch {
          /* already gone */
        }
      }
    };
    if (last) last.onended = cleanup;
    else cleanup();
  }
}
