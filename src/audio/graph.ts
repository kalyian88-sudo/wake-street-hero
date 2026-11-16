/**
 * AudioCore — the node graph shared by one-shots, continuous layers and music, built on ANY
 * BaseAudioContext (the live AudioContext in the game, an OfflineAudioContext in the level tests).
 *
 *   one-shots (world) ┐
 *   layers → layerBus ┴→ worldBus → slowLP ┐
 *   one-shots (ui) ─────────→ uiBus ───────┴→ sfxGain ┐
 *   tracks → musicIn → musicLP → musicDuck → musicGain ┴→ compressor → trim → soft clip → out
 *
 * Also owns the shared noise loops, the reverb, the slow-motion pitch bus and the one-shot voice pool.
 */
import { makeImpulse, makeNoise, makeSoftClipCurve, type NoiseKind } from './dsp';
import { clamp, musicSlowCutoff, ratioToCents, slowMoCutoff, slowMoPitch, volumeCurve } from './theory';

/** Static mix constants — see the level table in the header of Audio.ts. */
export const MIX = {
  /** Compressor: gentle glue, not a brick wall (the soft clipper behind it is the safety net). */
  comp: { threshold: -12, knee: 12, ratio: 3, attack: 0.005, release: 0.2 },
  /** Auto make-up gain Blink/WebKit/Gecko apply for the settings above (measured: +2.4 dB). */
  compMakeup: 1.319,
  /** Output trim after the make-up has been taken back out. */
  master: 0.94,
  /** Bus trims at slider = 1. */
  sfx: 1,
  music: 0.7,
  /** Pause-menu ducking of the music: gain and low-pass cutoff. */
  duckGain: 0.3,
  duckCutoff: 650,
  /** Max simultaneous one-shot voices; the quietest-priority / oldest one is stolen beyond that. */
  maxVoices: 14,
} as const;

export type BusId = 'world' | 'ui';

export interface FilterSpec {
  type: BiquadFilterType;
  f: number;
  q?: number;
  /** Sweep the cutoff to this frequency… */
  to?: number;
  /** …within this many seconds (default: the length of the sound). */
  time?: number;
}

export class AudioCore {
  readonly ctx: BaseAudioContext;
  readonly sr: number;
  readonly sfxGain: GainNode;
  readonly musicGain: GainNode;
  readonly worldBus: GainNode;
  readonly uiBus: GainNode;
  readonly layerBus: GainNode;
  readonly slowLP: BiquadFilterNode;
  readonly musicIn: GainNode;
  readonly musicLP: BiquadFilterNode;
  readonly musicDuck: GainNode;
  /** Input of the final chain (analyser taps for the sandbox hang off `output`). */
  readonly master: GainNode;
  readonly output: GainNode;
  readonly noise: Record<NoiseKind, AudioBuffer>;
  /** Detune (cents) shared by every layer oscillator / filter: the slow-motion pitch drop. */
  readonly pitchBus: ConstantSourceNode | null;
  readonly rnd: () => number;
  /** Pitch factor applied to world one-shots at trigger time. */
  worldPitch = 1;
  readonly voices: Voice[] = [];

  private reverb: GainNode | null = null;
  private timeScale = 1;
  private ducked = false;
  private musicCutoff = 18000;

  /**
   * @param rnd     random source (seeded in offline renders so measurements are repeatable)
   * @param bypass  calibration only: skip compressor + clipper and run both volume sliders at unity
   */
  constructor(ctx: BaseAudioContext, rnd: () => number = Math.random, bypass = false) {
    this.ctx = ctx;
    this.sr = ctx.sampleRate;
    this.rnd = rnd;

    const gain = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    this.master = gain(1);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = MIX.comp.threshold;
    comp.knee.value = MIX.comp.knee;
    comp.ratio.value = MIX.comp.ratio;
    comp.attack.value = MIX.comp.attack;
    comp.release.value = MIX.comp.release;
    // the clipper curve spans ±2 → feed it at half level, the curve itself restores unity gain
    const clipIn = gain((MIX.master / MIX.compMakeup) * 0.5);
    const clip = ctx.createWaveShaper();
    clip.curve = makeSoftClipCurve(2) as Float32Array<ArrayBuffer>;
    this.output = gain(1);
    if (bypass) this.master.connect(this.output);
    else this.master.connect(comp).connect(clipIn).connect(clip).connect(this.output);
    this.output.connect(ctx.destination);

    this.sfxGain = gain(bypass ? 1 : volumeCurve(0.9) * MIX.sfx);
    this.musicGain = gain(bypass ? 1 : volumeCurve(0.6) * MIX.music);
    this.sfxGain.connect(this.master);
    this.musicGain.connect(this.master);

    this.slowLP = ctx.createBiquadFilter();
    this.slowLP.type = 'lowpass';
    this.slowLP.frequency.value = 19000;
    this.slowLP.Q.value = 0.5;
    this.worldBus = gain(1);
    this.layerBus = gain(1);
    this.uiBus = gain(1);
    this.layerBus.connect(this.worldBus);
    this.worldBus.connect(this.slowLP).connect(this.sfxGain);
    this.uiBus.connect(this.sfxGain);

    this.musicIn = gain(1);
    this.musicLP = ctx.createBiquadFilter();
    this.musicLP.type = 'lowpass';
    this.musicLP.frequency.value = 18000;
    this.musicLP.Q.value = 0.6;
    this.musicDuck = gain(1);
    this.musicIn.connect(this.musicLP).connect(this.musicDuck).connect(this.musicGain);

    const mk = (kind: NoiseKind, seconds: number): AudioBuffer => {
      const data = makeNoise(kind, this.sr, seconds, rnd);
      const buf = ctx.createBuffer(1, data.length, this.sr);
      buf.getChannelData(0).set(data);
      return buf;
    };
    this.noise = { white: mk('white', 2.1), pink: mk('pink', 3.3), brown: mk('brown', 2.7) };

    let pitch: ConstantSourceNode | null = null;
    if (typeof ctx.createConstantSource === 'function') {
      pitch = ctx.createConstantSource();
      pitch.offset.value = 0;
      pitch.start();
    }
    this.pitchBus = pitch;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  setVolumes(music: number, sfx: number): void {
    const t = this.now;
    this.musicGain.gain.setTargetAtTime(volumeCurve(music) * MIX.music, t, 0.04);
    this.sfxGain.gain.setTargetAtTime(volumeCurve(sfx) * MIX.sfx, t, 0.04);
  }

  /** Slow-motion colouring of the world bus (pitch + low-pass) and the gentle music low-pass. */
  setTimeScale(timeScale: number): void {
    const ts = clamp(timeScale, 0.1, 1);
    if (Math.abs(ts - this.timeScale) < 0.004) return;
    this.timeScale = ts;
    const t = this.now;
    this.worldPitch = slowMoPitch(ts);
    this.slowLP.frequency.setTargetAtTime(slowMoCutoff(ts), t, 0.05);
    this.pitchBus?.offset.setTargetAtTime(ratioToCents(this.worldPitch), t, 0.05);
    this.applyMusicFilter();
  }

  setDucked(ducked: boolean): void {
    if (ducked === this.ducked) return;
    this.ducked = ducked;
    this.musicDuck.gain.setTargetAtTime(ducked ? MIX.duckGain : 1, this.now, ducked ? 0.12 : 0.25);
    this.applyMusicFilter();
  }

  private applyMusicFilter(): void {
    const cutoff = Math.min(this.ducked ? MIX.duckCutoff : 18000, musicSlowCutoff(this.timeScale));
    if (cutoff === this.musicCutoff) return;
    this.musicCutoff = cutoff;
    this.musicLP.frequency.setTargetAtTime(cutoff, this.now, 0.12);
  }

  /** Follow the slow-motion pitch with an oscillator / filter detune param (layers only). */
  connectPitch(param: AudioParam): void {
    this.pitchBus?.connect(param);
  }

  /** Looping noise source started at a random offset (layers). The caller owns stop()/disconnect(). */
  noiseSource(kind: NoiseKind, rate = 1): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise[kind];
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(0, this.rnd() * this.noise[kind].duration);
    return src;
  }

  /** Shared music reverb send (created on first use): small dark room → musicIn. */
  reverbSend(): GainNode {
    if (this.reverb) return this.reverb;
    const ctx = this.ctx;
    const send = ctx.createGain();
    const conv = ctx.createConvolver();
    const [l, r] = makeImpulse(this.sr, 1.1, this.rnd);
    const ir = ctx.createBuffer(2, l.length, this.sr);
    ir.getChannelData(0).set(l);
    ir.getChannelData(1).set(r);
    conv.buffer = ir;
    send.connect(conv).connect(this.musicIn);
    this.reverb = send;
    return send;
  }

  // ── one-shot voice pool ──

  /**
   * Start a one-shot voice, or return null when the pool is full of more important sounds.
   * `at` (context time) defaults to "now".
   */
  voice(bus: BusId, level: number, pan = 0, priority = 1, pitch = 1, at?: number): Voice | null {
    if (this.voices.length >= MIX.maxVoices) {
      let victim = this.voices[0];
      for (const v of this.voices) {
        if (v.priority < victim.priority || (v.priority === victim.priority && v.t < victim.t)) victim = v;
      }
      if (victim.priority > priority) return null;
      victim.kill();
    }
    const rate = pitch * (bus === 'world' ? this.worldPitch : 1);
    const v = new Voice(this, at ?? this.now + 0.004, rate, level, pan, bus, priority);
    this.voices.push(v);
    return v;
  }

  /** Called by Voice when its last source has ended. */
  release(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  killAll(): void {
    for (const v of [...this.voices]) v.kill();
  }
}

/**
 * Builder for one one-shot sound: every source created through it is started/stopped on schedule,
 * and when the last one ends the whole sub-graph is disconnected and dropped from the pool.
 */
export class Voice {
  readonly out: GainNode;
  /** Latest scheduled stop time. */
  end: number;
  private readonly panner: StereoPannerNode | null = null;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private live = 0;
  private dead = false;

  constructor(
    readonly core: AudioCore,
    /** Start time (context seconds). */
    readonly t: number,
    /** Pitch factor (variation × caller pitch × slow-mo) — applied by osc()/burst()/tone(). */
    readonly rate: number,
    level: number,
    pan: number,
    bus: BusId,
    readonly priority: number,
  ) {
    const ctx = core.ctx;
    this.end = t;
    this.out = ctx.createGain();
    this.out.gain.value = level;
    const dest = bus === 'ui' ? core.uiBus : core.worldBus;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      this.panner = ctx.createStereoPanner();
      this.panner.pan.value = clamp(pan, -1, 1);
      this.out.connect(this.panner).connect(dest);
    } else {
      this.out.connect(dest);
    }
  }

  get ctx(): BaseAudioContext {
    return this.core.ctx;
  }

  rnd(): number {
    return this.core.rnd();
  }

  /** Random value in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.core.rnd();
  }

  private track(src: AudioScheduledSourceNode, stop: number): void {
    this.live++;
    this.sources.push(src);
    if (stop > this.end) this.end = stop;
    src.onended = () => {
      if (--this.live <= 0) this.dispose();
    };
  }

  /** Oscillator at `freq × rate`, running from `t` for `dur` seconds. */
  osc(type: OscillatorType, freq: number, t: number, dur: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq * this.rate;
    this.track(o, t + dur);
    o.start(t);
    o.stop(t + dur);
    return o;
  }

  noise(kind: NoiseKind, t: number, dur: number): AudioBufferSourceNode {
    const buf = this.core.noise[kind];
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    this.track(s, t + dur);
    s.start(t, this.core.rnd() * buf.duration);
    s.stop(t + dur);
    return s;
  }

  gain(value = 1): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.min(freq * this.rate, this.core.sr * 0.45);
    f.Q.value = q;
    return f;
  }

  /** Percussive envelope: 0 → peak in `attack`, then exponential decay with time constant `tau`. */
  perc(param: AudioParam, t: number, peak: number, attack: number, tau: number): void {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.setTargetAtTime(0, t + attack, tau);
  }

  /** Filtered noise burst with a percussive envelope → `dest` (default: voice output). */
  burst(kind: NoiseKind, t: number, f: FilterSpec, peak: number, attack: number, tau: number, dest: AudioNode = this.out): GainNode {
    const dur = attack + tau * 6;
    const src = this.noise(kind, t, dur);
    const flt = this.filter(f.type, f.f, f.q ?? 0.707);
    if (f.to !== undefined) {
      const top = this.core.sr * 0.45;
      flt.frequency.setValueAtTime(Math.min(f.f * this.rate, top), t);
      flt.frequency.exponentialRampToValueAtTime(Math.min(f.to * this.rate, top), t + (f.time ?? dur));
    }
    const g = this.gain(0);
    this.perc(g.gain, t, peak, attack, tau);
    src.connect(flt).connect(g).connect(dest);
    return g;
  }

  /** Oscillator blip with an optional exponential pitch sweep f0 → f1 over `sweep` seconds. */
  tone(type: OscillatorType, t: number, f0: number, f1: number, sweep: number, peak: number, attack: number, tau: number, dest: AudioNode = this.out): OscillatorNode {
    const o = this.osc(type, f0, t, attack + tau * 6);
    if (f1 !== f0 && sweep > 0) {
      o.frequency.setValueAtTime(f0 * this.rate, t);
      o.frequency.exponentialRampToValueAtTime(f1 * this.rate, t + sweep);
    }
    const g = this.gain(0);
    this.perc(g.gain, t, peak, attack, tau);
    o.connect(g).connect(dest);
    return o;
  }

  /**
   * Two-operator FM note (bells, chimes, e-piano-ish pings): modulator `ratio × f` with an index
   * decaying from idx0 → idx1, percussive amplitude.
   */
  fm(t: number, freq: number, ratio: number, idx0: number, idx1: number, idxTau: number, peak: number, attack: number, tau: number, dest: AudioNode = this.out): void {
    const dur = attack + tau * 6;
    const car = this.osc('sine', freq, t, dur);
    const mod = this.osc('sine', freq * ratio, t, dur);
    const mg = this.gain(0);
    const f = freq * this.rate;
    mg.gain.setValueAtTime(idx0 * f * ratio, t);
    mg.gain.setTargetAtTime(idx1 * f * ratio, t, idxTau);
    mod.connect(mg).connect(car.frequency);
    const g = this.gain(0);
    this.perc(g.gain, t, peak, attack, tau);
    car.connect(g).connect(dest);
  }

  /**
   * Many tiny chirps from ONE oscillator + ONE gain (droplets, bubbles, whoops): at each time the
   * pitch jumps to f and glides to f × `glide` while the gain fires a short percussive blip.
   */
  chirps(type: OscillatorType, times: number[], freqs: number[], glide: number, glideTime: number, peak: number, tau: number, dest: AudioNode = this.out): void {
    if (times.length === 0) return;
    const t0 = times[0];
    const tEnd = times[times.length - 1] + glideTime + tau * 6;
    const o = this.osc(type, freqs[0], t0, tEnd - t0);
    const g = this.gain(0);
    g.gain.setValueAtTime(0, t0);
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const f = freqs[i % freqs.length] * this.rate;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * glide, t + glideTime);
      g.gain.setTargetAtTime(peak, t, 0.002);
      g.gain.setTargetAtTime(0, t + 0.008, tau);
    }
    o.connect(g).connect(dest);
  }

  /** Fade out fast and stop everything (voice stealing, pause, shutdown). */
  kill(): void {
    if (this.dead) return;
    const now = this.core.now;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, 0.012);
    for (const s of this.sources) {
      try {
        s.stop(now + 0.08);
      } catch {
        /* already stopped */
      }
    }
    // make room in the pool right away; the nodes disconnect themselves when they end
    this.core.release(this);
  }

  private dispose(): void {
    if (this.dead) return;
    this.dead = true;
    this.out.disconnect();
    this.panner?.disconnect();
    this.sources.length = 0;
    this.core.release(this);
  }
}
