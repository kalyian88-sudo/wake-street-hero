/**
 * Pure sample-level DSP: shared noise loops, the drum kit (rendered once per track into small mono
 * buffers and then played back as cheap samples), vinyl crackle, the reverb impulse and the
 * waveshaper curves. Plain Float32Array maths — no WebAudio, so everything is unit-testable in node.
 */

export type Rng = () => number;

/** RBJ cookbook biquad (direct form 1). */
export class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private constructor(
    private readonly b0: number,
    private readonly b1: number,
    private readonly b2: number,
    private readonly a1: number,
    private readonly a2: number,
  ) {}

  private static make(sr: number, f: number, q: number, kind: 'lp' | 'hp' | 'bp'): Biquad {
    const w0 = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.05, q));
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (kind === 'lp') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
    } else if (kind === 'hp') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = b0;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    return new Biquad(b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
  }

  static lowpass(sr: number, f: number, q = 0.707): Biquad {
    return Biquad.make(sr, f, q, 'lp');
  }
  static highpass(sr: number, f: number, q = 0.707): Biquad {
    return Biquad.make(sr, f, q, 'hp');
  }
  /** Constant 0 dB peak gain band-pass. */
  static bandpass(sr: number, f: number, q = 1): Biquad {
    return Biquad.make(sr, f, q, 'bp');
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

export function peakOf(buf: ArrayLike<number>, from = 0, to = buf.length): number {
  let p = 0;
  for (let i = from; i < to; i++) {
    const a = Math.abs(buf[i]);
    if (a > p) p = a;
  }
  return p;
}

export function rmsOf(buf: ArrayLike<number>, from = 0, to = buf.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

function normalize(buf: Float32Array, peak: number): Float32Array {
  const p = peakOf(buf);
  if (p > 1e-9) {
    const k = peak / p;
    for (let i = 0; i < buf.length; i++) buf[i] *= k;
  }
  return buf;
}

/** Linear fade of the last `ms` so one-shot buffers end at exactly zero. */
function fadeTail(buf: Float32Array, sr: number, ms: number): Float32Array {
  const n = Math.min(buf.length, Math.floor((sr * ms) / 1000));
  for (let i = 0; i < n; i++) buf[buf.length - 1 - i] *= i / n;
  return buf;
}

// ──────────────────────────────────────────────────────────────── noise ──

export type NoiseKind = 'white' | 'pink' | 'brown';

/** Equal-power crossfade of the tail into the head → seamless loop (returns a shorter array). */
export function makeLoopable(buf: Float32Array, fade: number): Float32Array {
  const n = buf.length - fade;
  const out = buf.slice(0, n);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    out[i] = buf[i] * Math.sqrt(a) + buf[n + i] * Math.sqrt(1 - a);
  }
  return out;
}

export function makeNoise(kind: NoiseKind, sr: number, seconds: number, rng: Rng): Float32Array {
  const fade = Math.floor(sr * 0.05);
  const n = Math.floor(sr * seconds) + fade;
  const buf = new Float32Array(n);
  if (kind === 'white') {
    for (let i = 0; i < n; i++) buf[i] = rng() * 2 - 1;
  } else if (kind === 'pink') {
    // Paul Kellet's economy pink filter
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = rng() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      buf[i] = b0 + b1 + b2 + w * 0.1848;
    }
  } else {
    let y = 0;
    for (let i = 0; i < n; i++) {
      y = (y + 0.02 * (rng() * 2 - 1)) / 1.02;
      buf[i] = y;
    }
  }
  return normalize(makeLoopable(buf, fade), 0.95);
}

/** Vinyl surface noise: sparse ticks of random size over a faint hiss, plus the odd louder pop. */
export function makeCrackle(sr: number, seconds: number, rng: Rng, density = 14): Float32Array {
  const fade = Math.floor(sr * 0.03);
  const n = Math.floor(sr * seconds) + fade;
  const buf = new Float32Array(n);
  const hp = Biquad.highpass(sr, 900, 0.7);
  const lp = Biquad.lowpass(sr, 7500, 0.7);
  const pTick = density / sr;
  let env = 0;
  let sign = 1;
  let decay = 0.5;
  for (let i = 0; i < n; i++) {
    if (rng() < pTick) {
      const big = rng() < 0.08;
      const a = Math.pow(rng(), 3) * (big ? 1 : 0.45) + 0.05;
      env = Math.max(env, a);
      sign = rng() < 0.5 ? -1 : 1;
      decay = big ? 0.86 : 0.45 + rng() * 0.3;
    }
    const hiss = (rng() * 2 - 1) * 0.02;
    buf[i] = lp.process(hp.process(sign * env + hiss));
    env *= decay;
  }
  return normalize(makeLoopable(buf, fade), 0.9);
}

// ───────────────────────────────────────────────────────────── drum kit ──

export interface KickParams {
  /** Start / end pitch (Hz) and the time constant of the sweep. */
  f0: number;
  f1: number;
  pitchTau: number;
  ampTau: number;
  /** Beater click 0..1. */
  click: number;
  /** tanh drive (1 = clean … 4 = crunchy). */
  drive: number;
  len: number;
}
export interface SnareParams {
  tone: number;
  toneAmt: number;
  noiseF: number;
  noiseQ: number;
  tau: number;
  /** Low-pass for the lo-fi "blanket" (Hz). */
  lp: number;
  drive: number;
  len: number;
}
export interface ClapParams {
  f: number;
  q: number;
  tau: number;
  /** Seconds between the three hand bursts. */
  spread: number;
  len: number;
}
export interface HatParams {
  hp: number;
  tau: number;
  /** 0 = pure noise, 1 = pure metallic square cluster. */
  metal: number;
  /** Base frequency of the square cluster. */
  f: number;
  len: number;
}
export interface RimParams {
  f: number;
  tau: number;
  click: number;
  len: number;
}
export interface ShakerParams {
  f: number;
  q: number;
  attack: number;
  tau: number;
  len: number;
}
export interface PercParams {
  f0: number;
  f1: number;
  tau: number;
  /** Level of the 2.4× partial (wood block) or 3× partial (blip). */
  partial: number;
  len: number;
}
export interface KitParams {
  kick: KickParams;
  snare: SnareParams;
  clap: ClapParams;
  hat: HatParams;
  openHat: HatParams;
  rim: RimParams;
  shaker: ShakerParams;
  perc: PercParams;
}

export type DrumId = keyof KitParams;
export const DRUM_IDS: readonly DrumId[] = ['kick', 'snare', 'clap', 'hat', 'openHat', 'rim', 'shaker', 'perc'];

export function renderKick(sr: number, p: KickParams, rng: Rng): Float32Array {
  const n = Math.ceil(sr * p.len);
  const out = new Float32Array(n);
  const norm = Math.tanh(p.drive);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = p.f1 + (p.f0 - p.f1) * Math.exp(-t / p.pitchTau);
    phase += (2 * Math.PI * f) / sr;
    const attack = Math.min(1, t / 0.0012);
    let s = Math.sin(phase) * Math.exp(-t / p.ampTau) * attack;
    s += (rng() * 2 - 1) * Math.exp(-t / 0.0022) * Math.min(1, t / 0.0003) * p.click;
    out[i] = Math.tanh(s * p.drive) / norm;
  }
  return normalize(fadeTail(out, sr, 12), 0.95);
}

export function renderSnare(sr: number, p: SnareParams, rng: Rng): Float32Array {
  const n = Math.ceil(sr * p.len);
  const out = new Float32Array(n);
  const bp = Biquad.bandpass(sr, p.noiseF, p.noiseQ);
  const hp = Biquad.highpass(sr, 320, 0.7);
  const lp = Biquad.lowpass(sr, p.lp, 0.6);
  const norm = Math.tanh(p.drive);
  let ph1 = 0;
  let ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const bend = 1 + 0.6 * Math.exp(-t / 0.007);
    ph1 += (2 * Math.PI * p.tone * bend) / sr;
    ph2 += (2 * Math.PI * p.tone * 1.78 * bend) / sr;
    const tone = Math.sin(ph1) * Math.exp(-t / 0.05) + 0.55 * Math.sin(ph2) * Math.exp(-t / 0.03);
    const w = rng() * 2 - 1;
    const noise = (bp.process(w) * 1.6 + hp.process(w) * 0.35) * Math.exp(-t / p.tau);
    const attack = Math.min(1, t / 0.0006);
    out[i] = Math.tanh(lp.process((tone * p.toneAmt + noise) * attack) * p.drive) / norm;
  }
  return normalize(fadeTail(out, sr, 10), 0.95);
}

export function renderClap(sr: number, p: ClapParams, rng: Rng): Float32Array {
  const n = Math.ceil(sr * p.len);
  const out = new Float32Array(n);
  const bp = Biquad.bandpass(sr, p.f, p.q);
  const hp = Biquad.highpass(sr, 650, 0.7);
  const amps = [0.75 + rng() * 0.25, 0.75 + rng() * 0.25, 0.75 + rng() * 0.25];
  const tTail = p.spread * 3;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let env = 0;
    for (let k = 0; k < 3; k++) {
      const dt = t - k * p.spread;
      if (dt >= 0) env += amps[k] * Math.exp(-dt / 0.0045);
    }
    if (t >= tTail) env += Math.exp(-(t - tTail) / p.tau);
    out[i] = hp.process(bp.process(rng() * 2 - 1)) * env;
  }
  return normalize(fadeTail(out, sr, 10), 0.95);
}

const HAT_RATIOS = [1, 1.483, 1.8, 2.546, 2.63, 3.897] as const;

export function renderHat(sr: number, p: HatParams, rng: Rng): Float32Array {
  const n = Math.ceil(sr * p.len);
  const out = new Float32Array(n);
  const hp1 = Biquad.highpass(sr, p.hp, 0.8);
  const hp2 = Biquad.highpass(sr, p.hp * 0.8, 0.7);
  const phases = HAT_RATIOS.map(() => rng());
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let metal = 0;
    for (let k = 0; k < HAT_RATIOS.length; k++) {
      phases[k] += (p.f * HAT_RATIOS[k]) / sr;
      phases[k] -= Math.floor(phases[k]);
      metal += phases[k] < 0.5 ? 1 : -1;
    }
    const s = (metal / HAT_RATIOS.length) * p.metal * 1.8 + (rng() * 2 - 1) * (1 - p.metal);
    const attack = Math.min(1, t / 0.0005);
    out[i] = hp2.process(hp1.process(s)) * Math.exp(-t / p.tau) * attack;
  }
  return normalize(fadeTail(out, sr, 8), 0.95);
}

export function renderRim(sr: number, p: RimParams, rng: Rng): Float32Array {
  const n = Math.ceil(sr * p.len);
  const out = new Float32Array(n);
  const bp = Biquad.bandpass(sr, 3200, 1.5);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const body = Math.sin(2 * Math.PI * p.f * t) * Math.exp(-t / p.tau) + 0.6 * Math.sin(2 * Math.PI * p.f * 0.28 * t) * Math.exp(-t / (p.tau * 1.6));
    const click = bp.process(rng() * 2 - 1) * Math.exp(-t / 0.0016) * p.click * 3;
    out[i] = body + click;
  }
  return normalize(fadeTail(out, sr, 6), 0.95);
}

export function renderShaker(sr: number, p: ShakerParams, rng: Rng): Float32Array {
  const n = Math.ceil(sr * p.len);
  const out = new Float32Array(n);
  const bp = Biquad.bandpass(sr, p.f, p.q);
  const hp = Biquad.highpass(sr, p.f * 0.55, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = t < p.attack ? t / p.attack : Math.exp(-(t - p.attack) / p.tau);
    out[i] = hp.process(bp.process(rng() * 2 - 1)) * env;
  }
  return normalize(fadeTail(out, sr, 8), 0.95);
}

export function renderPerc(sr: number, p: PercParams): Float32Array {
  const n = Math.ceil(sr * p.len);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = p.f1 + (p.f0 - p.f1) * Math.exp(-t / 0.018);
    ph += (2 * Math.PI * f) / sr;
    const attack = Math.min(1, t / 0.0008);
    out[i] = (Math.sin(ph) * Math.exp(-t / p.tau) + p.partial * Math.sin(ph * 2.4) * Math.exp(-t / (p.tau * 0.45))) * attack;
  }
  return normalize(fadeTail(out, sr, 8), 0.95);
}

export function renderKit(sr: number, kit: KitParams, rng: Rng): Record<DrumId, Float32Array> {
  return {
    kick: renderKick(sr, kit.kick, rng),
    snare: renderSnare(sr, kit.snare, rng),
    clap: renderClap(sr, kit.clap, rng),
    hat: renderHat(sr, kit.hat, rng),
    openHat: renderHat(sr, kit.openHat, rng),
    rim: renderRim(sr, kit.rim, rng),
    shaker: renderShaker(sr, kit.shaker, rng),
    perc: renderPerc(sr, kit.perc),
  };
}

// ─────────────────────────────────────────────────── reverb / waveshapers ──

/** Small dark room: pre-delay, a few early taps, exponentially decaying low-passed noise tail. Stereo pair. */
export function makeImpulse(sr: number, seconds: number, rng: Rng): [Float32Array, Float32Array] {
  const n = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.012);
  const make = (): Float32Array => {
    const buf = new Float32Array(n);
    const lp = Biquad.lowpass(sr, 3800, 0.6);
    const hp = Biquad.highpass(sr, 260, 0.7);
    const tau = seconds / 5.5;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      buf[i] = hp.process(lp.process(rng() * 2 - 1)) * Math.exp(-t / tau);
    }
    for (let k = 0; k < 5; k++) {
      const at = pre + Math.floor(sr * (0.004 + rng() * 0.05));
      if (at < n) buf[at] += (rng() < 0.5 ? -1 : 1) * (0.5 - k * 0.07);
    }
    return fadeTail(buf, sr, 40);
  };
  return [make(), make()];
}

/** tanh saturation curve for a WaveShaperNode (input −1..1). */
export function makeSaturationCurve(drive: number, n = 1025): Float32Array {
  const out = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    out[i] = Math.tanh(x * drive) / norm;
  }
  return out;
}

/**
 * Master safety clipper. The curve spans an input of ±`range` (feed the shaper with gain 1/range):
 * transparent up to `knee`, then bends smoothly towards `ceiling`, which it never exceeds.
 */
export function softClip(x: number, knee = 0.7, ceiling = 0.97): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  const y = knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee));
  return x < 0 ? -y : y;
}

export function makeSoftClipCurve(range = 2, knee = 0.7, ceiling = 0.97, n = 4097): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * range;
    out[i] = softClip(x, knee, ceiling);
  }
  return out;
}
