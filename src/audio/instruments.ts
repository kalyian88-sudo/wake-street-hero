/**
 * Synth voices of the beat engine (WebAudio nodes, scheduled sample-accurately at time `t`):
 * drum sample playback, four basses, FM electric pianos / saw pad, five lead colours.
 * Every note cleans up after itself: when its carrier ends, its output gain is disconnected.
 */
import { midiToFreq } from './theory';
import type { BassPreset, KeysPreset, LeadPreset } from './tracks';

type Ctx = BaseAudioContext;

function osc(ctx: Ctx, type: OscillatorType, freq: number, t: number, stop: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(t);
  o.stop(stop);
  return o;
}

function gain(ctx: Ctx, v: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function lowpass(ctx: Ctx, f: number, q: number): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = 'lowpass';
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

/** One-shot sample (drums). `also` = optional second destination (reverb send). */
export function playSample(ctx: Ctx, dest: AudioNode, buffer: AudioBuffer, t: number, level: number, rate = 1, also?: AudioNode): void {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = gain(ctx, level);
  src.connect(g).connect(dest);
  if (also) g.connect(also);
  src.onended = () => g.disconnect();
  src.start(t);
}

// ───────────────────────────────────────────────────────────────── bass ──

export function playBass(ctx: Ctx, dest: AudioNode, preset: BassPreset, t: number, midi: number, dur: number, vel: number, glideFrom?: number): void {
  const f = midiToFreq(midi);
  const amp = gain(ctx, 0);
  amp.connect(dest);
  let lead: OscillatorNode;

  if (preset === '808') {
    // long sine with a pitch "thump" at the start, or a slide from the previous note
    const tail = 0.07;
    const stop = t + dur + tail * 6;
    lead = osc(ctx, 'sine', f, t, stop);
    if (glideFrom !== undefined) {
      lead.frequency.setValueAtTime(midiToFreq(glideFrom), t);
      lead.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    } else {
      lead.frequency.setValueAtTime(f * 2.2, t);
      lead.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    }
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel, t + 0.004);
    amp.gain.setTargetAtTime(vel * 0.3, t + 0.004, Math.max(0.25, dur * 0.7));
    amp.gain.setTargetAtTime(0, t + dur, tail);
    lead.connect(amp);
  } else if (preset === 'upright') {
    // plucked: triangle + a little octave, filter and level fall away quickly
    const stop = t + Math.max(dur, 0.25) + 0.35;
    lead = osc(ctx, 'triangle', f, t, stop);
    const o2 = osc(ctx, 'sine', f * 2, t, stop);
    const o2g = gain(ctx, 0.25);
    const lp = lowpass(ctx, 1100, 1);
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.setTargetAtTime(380, t, 0.12);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel, t + 0.006);
    amp.gain.setTargetAtTime(vel * 0.12, t + 0.006, 0.22);
    amp.gain.setTargetAtTime(0, t + Math.max(dur, 0.25), 0.05);
    lead.connect(lp);
    o2.connect(o2g).connect(lp);
    lp.connect(amp);
  } else if (preset === 'synth') {
    // saw with a snappy resonant filter + sine body
    const stop = t + dur + 0.25;
    lead = osc(ctx, 'sawtooth', f, t, stop);
    const o2 = osc(ctx, 'sine', f, t, stop);
    const o2g = gain(ctx, 0.6);
    const sawG = gain(ctx, 0.55);
    const lp = lowpass(ctx, 1500, 3);
    lp.frequency.setValueAtTime(1500, t);
    lp.frequency.setTargetAtTime(320, t, 0.14);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel, t + 0.005);
    amp.gain.setTargetAtTime(vel * 0.7, t + 0.005, 0.1);
    amp.gain.setTargetAtTime(0, t + dur, 0.04);
    lead.connect(sawG).connect(lp);
    lp.connect(amp);
    o2.connect(o2g).connect(amp);
  } else {
    // 'sub': round sine + triangle, soft pitch blip as the "finger"
    const stop = t + dur + 0.3;
    lead = osc(ctx, 'sine', f, t, stop);
    lead.frequency.setValueAtTime(f * 1.5, t);
    lead.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const o2 = osc(ctx, 'triangle', f, t, stop);
    const o2g = gain(ctx, 0.4);
    const lp = lowpass(ctx, 700, 0.7);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel, t + 0.008);
    amp.gain.setTargetAtTime(vel * 0.75, t + 0.008, 0.15);
    amp.gain.setTargetAtTime(0, t + dur, 0.04);
    lead.connect(lp);
    o2.connect(o2g).connect(lp);
    lp.connect(amp);
  }
  lead.onended = () => amp.disconnect();
}

// ───────────────────────────────────────────────────────────────── keys ──

interface FmKeys {
  /** Modulator : carrier frequency ratio. */
  ratio: number;
  /** FM index at the attack (the "bark") and where it settles. */
  idx0: number;
  idx1: number;
  idxTau: number;
  attack: number;
  /** Time constant of the natural decay while the key is held, and of the damper after release. */
  decay: number;
  release: number;
}

const FM_KEYS: Record<Exclude<KeysPreset, 'pad'>, FmKeys> = {
  rhodes: { ratio: 1, idx0: 1.1, idx1: 0.22, idxTau: 0.22, attack: 0.006, decay: 1.3, release: 0.14 },
  wurli: { ratio: 1, idx0: 2.2, idx1: 0.5, idxTau: 0.1, attack: 0.004, decay: 0.55, release: 0.08 },
  softEp: { ratio: 2, idx0: 0.7, idx1: 0.08, idxTau: 0.14, attack: 0.008, decay: 0.7, release: 0.12 },
  darkBell: { ratio: 3.5, idx0: 1.3, idx1: 0.05, idxTau: 0.09, attack: 0.004, decay: 0.9, release: 0.2 },
};

function fmVoice(ctx: Ctx, dest: AudioNode, p: FmKeys, t: number, f: number, dur: number, peak: number): OscillatorNode {
  const stop = t + dur + p.release * 6;
  const car = osc(ctx, 'sine', f, t, stop);
  const mod = osc(ctx, 'sine', f * p.ratio, t, stop);
  // tame the index for high notes so the top of a voicing does not get glassy
  const k = Math.min(1, Math.sqrt(330 / f)) * f * p.ratio;
  const mg = gain(ctx, 0);
  mg.gain.setValueAtTime(p.idx0 * k, t);
  mg.gain.setTargetAtTime(p.idx1 * k, t, p.idxTau);
  mod.connect(mg).connect(car.frequency);
  const amp = gain(ctx, 0);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + p.attack);
  amp.gain.setTargetAtTime(0, t + p.attack, p.decay);
  amp.gain.setTargetAtTime(0, t + dur, p.release);
  car.connect(amp).connect(dest);
  car.onended = () => amp.disconnect();
  return car;
}

export function playChord(ctx: Ctx, dest: AudioNode, preset: KeysPreset, t: number, midis: readonly number[], dur: number, vel: number): void {
  const n = midis.length;
  if (n === 0) return;
  const per = (vel * 0.42) / Math.sqrt(n);
  if (preset === 'pad') {
    // two detuned saws per note into one slowly opening filter
    const attack = 0.2;
    const release = 0.25;
    const stop = t + dur + release * 6;
    const lp = lowpass(ctx, 500, 0.8);
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1900, t + 0.4);
    lp.frequency.setTargetAtTime(1300, t + 0.4, 0.6);
    const amp = gain(ctx, 0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(per * 0.6, t + attack);
    amp.gain.setTargetAtTime(0, t + dur, release);
    lp.connect(amp).connect(dest);
    let last: OscillatorNode | null = null;
    for (const m of midis) {
      const f = midiToFreq(m);
      const a = osc(ctx, 'sawtooth', f, t, stop);
      const b = osc(ctx, 'sawtooth', f, t, stop);
      a.detune.value = -8;
      b.detune.value = 8;
      a.connect(lp);
      b.connect(lp);
      last = b;
    }
    if (last) last.onended = () => amp.disconnect();
    return;
  }
  const p = FM_KEYS[preset];
  for (let i = 0; i < n; i++) {
    // top notes a touch softer, strummed by a few ms
    fmVoice(ctx, dest, p, t + i * 0.004, midiToFreq(midis[i]), dur, per * (1 - 0.1 * i));
  }
}

// ───────────────────────────────────────────────────────────────── lead ──

const FM_LEAD: Record<'kalimba' | 'vibes' | 'bell', FmKeys> = {
  kalimba: { ratio: 3, idx0: 1.8, idx1: 0, idxTau: 0.03, attack: 0.002, decay: 0.28, release: 0.28 },
  vibes: { ratio: 4, idx0: 0.9, idx1: 0.02, idxTau: 0.07, attack: 0.003, decay: 0.75, release: 0.3 },
  bell: { ratio: 3.5, idx0: 2.2, idx1: 0.25, idxTau: 0.3, attack: 0.003, decay: 1.1, release: 0.5 },
};

export function playLead(ctx: Ctx, dest: AudioNode, preset: LeadPreset, t: number, midi: number, dur: number, vel: number): void {
  const f = midiToFreq(midi);
  if (preset === 'arp' || preset === 'guitar') {
    // filter-plucked square (arp) or saw (muted guitar)
    const arp = preset === 'arp';
    const tau = arp ? 0.11 : 0.13;
    const hold = arp ? 0 : Math.min(dur, 0.12);
    const stop = t + hold + tau * 6;
    const o = osc(ctx, arp ? 'square' : 'sawtooth', f, t, stop);
    const lp = lowpass(ctx, f * (arp ? 5 : 4.5), arp ? 2.5 : 1);
    lp.frequency.setValueAtTime(Math.min(f * (arp ? 5 : 4.5), 12000), t);
    lp.frequency.setTargetAtTime(f * (arp ? 1.5 : 1.1), t, arp ? 0.06 : 0.035);
    const amp = gain(ctx, 0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel * (arp ? 0.3 : 0.4), t + 0.003);
    amp.gain.setTargetAtTime(0, t + 0.003 + hold, tau);
    o.connect(lp).connect(amp).connect(dest);
    o.onended = () => amp.disconnect();
    return;
  }
  // FM mallets ring out on their own; `dur` only matters for the long ones
  const p = FM_LEAD[preset];
  fmVoice(ctx, dest, p, t, f, Math.max(dur, p.decay * 2), vel * 0.5);
}
