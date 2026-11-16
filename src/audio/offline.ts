/**
 * OfflineAudioContext harness: renders the REAL graph (same AudioCore / Sfx / Layers / MusicEngine
 * classes as the live game) faster than real time and measures it. Used by dev/audio.html to
 * calibrate and verify levels; not used by the game itself.
 */
import { seededRng } from '../data/geometry';
import { AudioCore } from './graph';
import { Layers } from './layers';
import { MusicEngine } from './music';
import { Sfx } from './sfx';
import { gainToDb } from './theory';

export interface OfflineRig {
  ctx: OfflineAudioContext;
  core: AudioCore;
  sfx: Sfx;
  layers: Layers;
  music: MusicEngine;
}

export interface OfflineOptions {
  /** Skip the master chain and run both volume sliders at unity → bus-level numbers. */
  raw?: boolean;
  /** Called every `frameStep` seconds of rendered time (drive Layers.update like the game loop). */
  frame?: (rig: OfflineRig, time: number, dt: number) => void;
  frameStep?: number;
  /** Ignore this many seconds at the start when measuring RMS (attack ramps). */
  skip?: number;
  sampleRate?: number;
  seed?: number;
  /** Keep the rendered samples (mono mix) in the result, e.g. for a spectrogram. */
  keep?: boolean;
}

export interface OfflineResult {
  seconds: number;
  sampleRate: number;
  peak: number;
  peakDb: number;
  /** RMS over [skip, end]. */
  rms: number;
  rmsDb: number;
  /** Loudest 300 ms window. */
  rmsMaxDb: number;
  /** Samples at or above 0.999 (hard clipping). */
  clipped: number;
  /** NaN / Infinity samples (a broken filter). */
  bad: number;
  /** Peak of the last 20 ms: should be ~0 for one-shots (no cut-off tails). */
  tailPeak: number;
  data?: Float32Array;
}

export function offlineSupported(): boolean {
  return typeof OfflineAudioContext === 'function';
}

export async function renderOffline(seconds: number, setup: (rig: OfflineRig) => void, opts: OfflineOptions = {}): Promise<OfflineResult> {
  const sr = opts.sampleRate ?? 44100;
  const length = Math.ceil(seconds * sr);
  const ctx = new OfflineAudioContext(2, length, sr);
  const core = new AudioCore(ctx, seededRng(opts.seed ?? 12345), opts.raw === true);
  const rig: OfflineRig = { ctx, core, sfx: new Sfx(core), layers: new Layers(core), music: new MusicEngine(core, false) };
  setup(rig);
  if (opts.frame) {
    const step = opts.frameStep ?? 1 / 60;
    const frame = opts.frame;
    for (let t = step; t < seconds - step; t += step) {
      const at = t;
      void ctx.suspend(at).then(() => {
        frame(rig, at, step);
        void ctx.resume();
      });
    }
  }
  const buf = await ctx.startRendering();
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  const from = Math.min(length - 1, Math.floor((opts.skip ?? 0) * sr));
  const win = Math.floor(sr * 0.3);
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  let bad = 0;
  let winSum = 0;
  let winMax = 0;
  let tailPeak = 0;
  const tailFrom = length - Math.floor(sr * 0.02);
  for (let i = 0; i < length; i++) {
    const a = l[i];
    const b = r[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      bad++;
      continue;
    }
    const m = Math.max(Math.abs(a), Math.abs(b));
    if (m > peak) peak = m;
    if (m >= 0.999) clipped++;
    if (i >= tailFrom && m > tailPeak) tailPeak = m;
    const p = (a * a + b * b) * 0.5;
    if (i >= from) sum += p;
    winSum += p;
    if (i >= win) {
      const a0 = l[i - win];
      const b0 = r[i - win];
      winSum -= (a0 * a0 + b0 * b0) * 0.5;
      if (winSum > winMax) winMax = winSum;
    } else if (i === length - 1) {
      winMax = winSum;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, length - from));
  const result: OfflineResult = {
    seconds,
    sampleRate: sr,
    peak,
    peakDb: gainToDb(peak),
    rms,
    rmsDb: gainToDb(rms),
    rmsMaxDb: gainToDb(Math.sqrt(Math.max(0, winMax) / Math.min(win, length))),
    clipped,
    bad,
    tailPeak,
  };
  if (opts.keep) {
    const mono = new Float32Array(length);
    for (let i = 0; i < length; i++) mono[i] = (l[i] + r[i]) * 0.5;
    result.data = mono;
  }
  return result;
}
