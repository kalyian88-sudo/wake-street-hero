/**
 * Beat engine. TrackPlayer owns the per-track bus (drums / bass / keys / lead / vinyl crackle →
 * tape wobble → lo-fi low-pass → saturation → fade) and turns the pure patterns into scheduled
 * notes; MusicEngine runs the look-ahead scheduler, crossfades between tracks and rotates them.
 *
 * Scheduler: a 25 ms setInterval (plus one call per rendered frame) queues every event that
 * starts within the look-ahead window (120 ms; 600 ms for a few seconds after the main thread
 * stalled) at its exact AudioContext time. Events that are already in the past are dropped,
 * never bunched together.
 */
import { hashString, seededRng } from '../data/geometry';
import { DRUM_IDS, makeCrackle, makeSaturationCurve, renderKit, type DrumId } from './dsp';
import type { AudioCore } from './graph';
import { playBass, playChord, playLead, playSample } from './instruments';
import { barSeconds, buildSection, scheduleBar, sectionAt, type BarEvents, type SchedEvent } from './patterns';
import { stepSeconds } from './theory';
import { TRACKS, findTrack, type SectionKind, type TrackDef } from './tracks';

/** Bus levels inside a track (before the per-track loudness trim `TrackDef.gain`). */
const LEVEL = { drums: 0.8, bass: 0.39, keys: 2, lead: 1.1, crackle: 0.07, riser: 0.14 };
/** Headroom in front of the tape saturation: the summed beat peaks around 0.5 there (gentle drive, no squashing). */
const PRE_SAT = 0.42;
/** Relative level of every drum voice. */
const DRUM_LEVEL: Record<DrumId, number> = { kick: 0.85, snare: 0.9, clap: 0.7, hat: 0.5, openHat: 0.42, rim: 0.6, shaker: 0.32, perc: 0.45 };
const BASS_DRIVE: Record<TrackDef['bass'], number> = { sub: 2, '808': 2.6, upright: 1.4, synth: 1.8 };

const kitCache = new WeakMap<AudioCore, Map<string, Record<DrumId, AudioBuffer>>>();
const crackleCache = new WeakMap<AudioCore, AudioBuffer>();

function toBuffer(core: AudioCore, data: Float32Array): AudioBuffer {
  const buf = core.ctx.createBuffer(1, data.length, core.sr);
  buf.getChannelData(0).set(data);
  return buf;
}

function kitFor(core: AudioCore, def: TrackDef): Record<DrumId, AudioBuffer> {
  let map = kitCache.get(core);
  if (!map) kitCache.set(core, (map = new Map()));
  let kit = map.get(def.id);
  if (!kit) {
    const raw = renderKit(core.sr, def.kit, seededRng(hashString(`kit:${def.id}`)));
    const made = {} as Record<DrumId, AudioBuffer>;
    for (const id of DRUM_IDS) made[id] = toBuffer(core, raw[id]);
    kit = made;
    map.set(def.id, kit);
  }
  return kit;
}

function crackleFor(core: AudioCore): AudioBuffer {
  let buf = crackleCache.get(core);
  if (!buf) crackleCache.set(core, (buf = toBuffer(core, makeCrackle(core.sr, 4.3, seededRng(0x51ab)))));
  return buf;
}

export class TrackPlayer {
  readonly def: TrackDef;
  /** Unrolled form position / bar inside the section (for the sandbox + auto rotation). */
  formIndex = 0;
  barIdx = 0;
  barsPlayed = 0;
  /** Events handed to WebAudio so far. */
  scheduled = 0;
  stopped = false;

  private readonly core: AudioCore;
  private readonly out: GainNode;
  private readonly revFade: GainNode;
  private readonly sum: GainNode;
  private readonly drumBus: GainNode;
  private readonly drumRev: GainNode;
  private readonly bassIn: GainNode;
  private readonly keysIn: GainNode;
  private readonly leadIn: GainNode;
  private readonly duckKeys: GainNode;
  private readonly duckBass: GainNode;
  private readonly lofi: BiquadFilterNode;
  private readonly kit: Record<DrumId, AudioBuffer>;
  private readonly running: AudioScheduledSourceNode[] = [];
  private readonly rng: () => number;
  private readonly barDur: number;
  private section: BarEvents[];
  private events: SchedEvent[];
  private ptr = 0;
  private barStart: number;

  constructor(core: AudioCore, def: TrackDef, startTime: number) {
    this.core = core;
    this.def = def;
    this.kit = kitFor(core, def);
    this.rng = seededRng(hashString(`play:${def.id}`));
    this.barDur = barSeconds(def);
    const ctx = core.ctx;
    const gain = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const lfo = (hz: number): OscillatorNode => {
      const o = ctx.createOscillator();
      o.frequency.value = hz;
      o.start();
      this.running.push(o);
      return o;
    };

    // master of the track: sum → tape wow/flutter → lo-fi low-pass → saturation → trim → fade
    this.out = gain(0);
    this.out.connect(core.musicIn);
    const trim = gain(def.gain);
    const sat = ctx.createWaveShaper();
    sat.curve = makeSaturationCurve(1.5) as Float32Array<ArrayBuffer>;
    this.lofi = ctx.createBiquadFilter();
    this.lofi.type = 'lowpass';
    this.lofi.frequency.value = def.lofi;
    this.lofi.Q.value = 0.7;
    const tape = ctx.createDelay(0.05);
    tape.delayTime.value = 0.012;
    // depth A (s) of a delay LFO at f Hz detunes by ±2πfA: 0.25 % wow, 0.06 % flutter at wobble = 1
    const wow = gain(0.00095 * def.wobble);
    const flutter = gain(0.00002 * def.wobble);
    lfo(0.43).connect(wow).connect(tape.delayTime);
    lfo(4.9).connect(flutter).connect(tape.delayTime);
    this.sum = gain(PRE_SAT);
    this.sum.connect(tape).connect(this.lofi).connect(sat).connect(trim).connect(this.out);

    // reverb send follows the fade of the track
    this.revFade = gain(0);
    this.revFade.connect(core.reverbSend());
    const rev = gain(def.mix.reverb);
    rev.connect(this.revFade);

    this.drumBus = gain(LEVEL.drums * def.mix.drums);
    this.drumBus.connect(this.sum);
    this.drumRev = gain(0.5);
    this.drumRev.connect(rev);

    // bass: shaper adds the harmonics that make a sub audible on a phone speaker
    this.bassIn = gain(1);
    const bassSat = ctx.createWaveShaper();
    bassSat.curve = makeSaturationCurve(BASS_DRIVE[def.bass]) as Float32Array<ArrayBuffer>;
    this.duckBass = gain(1);
    this.bassIn.connect(bassSat).connect(this.duckBass).connect(gain(LEVEL.bass * def.mix.bass)).connect(this.sum);

    // keys: suitcase-style auto-pan for the e-pianos, sidechained to the kick
    this.keysIn = gain(1);
    this.duckKeys = gain(1);
    let keysTail: AudioNode = this.keysIn;
    if (def.keys !== 'pad' && typeof ctx.createStereoPanner === 'function') {
      const pan = ctx.createStereoPanner();
      const depth = gain(0.35);
      lfo(4.3).connect(depth).connect(pan.pan);
      this.keysIn.connect(pan);
      keysTail = pan;
    }
    const keysOut = gain(LEVEL.keys * def.mix.keys);
    keysTail.connect(this.duckKeys).connect(keysOut).connect(this.sum);
    keysOut.connect(rev);

    // lead: dotted-eighth echo with a darkening feedback loop
    this.leadIn = gain(1);
    const leadOut = gain(LEVEL.lead * def.mix.lead);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = stepSeconds(def.bpm) * 3;
    const fb = gain(0.32);
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.value = 2200;
    const wet = gain(0.3);
    this.leadIn.connect(leadOut);
    this.leadIn.connect(echo);
    echo.connect(fbLp).connect(fb).connect(echo);
    echo.connect(wet).connect(leadOut);
    leadOut.connect(this.sum);
    leadOut.connect(rev);

    // vinyl surface noise
    const crackle = ctx.createBufferSource();
    crackle.buffer = crackleFor(core);
    crackle.loop = true;
    crackle.connect(gain(LEVEL.crackle * def.mix.crackle)).connect(this.sum);
    crackle.start(startTime);
    this.running.push(crackle);

    this.barStart = startTime;
    this.section = buildSection(def, sectionAt(def, 0), 0);
    this.events = scheduleBar(this.section[0], def, this.rng);
    this.automate(this.section[0], startTime);
  }

  /** One full pass of the form has been played (auto mode moves on to the next track). */
  get formDone(): boolean {
    return this.formIndex >= this.def.form.length;
  }

  get sectionKind(): SectionKind {
    return sectionAt(this.def, this.formIndex);
  }

  fadeIn(t: number, seconds: number): void {
    for (const g of [this.out.gain, this.revFade.gain]) {
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(1, t + seconds);
    }
  }

  /** Stop scheduling, fade, then free the bus. `timer` = false in offline renders. */
  fadeOut(seconds: number, timer = true): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.core.now;
    for (const g of [this.out.gain, this.revFade.gain]) {
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0, t, seconds / 4);
    }
    const end = t + seconds + 0.2;
    for (const s of this.running) s.stop(end);
    const free = (): void => {
      this.out.disconnect();
      this.revFade.disconnect();
    };
    if (timer) setTimeout(free, (seconds + 0.4) * 1000);
  }

  /** Queue everything that starts before `horizon` (context seconds). */
  schedule(horizon: number): void {
    if (this.stopped) return;
    const now = this.core.now;
    for (let guard = 0; guard < 5000; guard++) {
      if (this.ptr >= this.events.length) {
        const next = this.barStart + this.barDur;
        if (next >= horizon) return;
        this.nextBar(next);
        continue;
      }
      const ev = this.events[this.ptr];
      const t = this.barStart + ev.t;
      if (t >= horizon) return;
      this.ptr++;
      // the main thread stalled past this event: drop it rather than play a flam of late notes
      if (t < now - 0.03) continue;
      this.fire(ev, Math.max(t, now));
      this.scheduled++;
    }
  }

  private nextBar(start: number): void {
    this.barStart = start;
    this.barsPlayed++;
    this.barIdx++;
    if (this.barIdx >= this.section.length) {
      this.formIndex++;
      this.barIdx = 0;
      this.section = buildSection(this.def, sectionAt(this.def, this.formIndex), this.formIndex);
    }
    const bar = this.section[this.barIdx];
    this.events = scheduleBar(bar, this.def, this.rng);
    this.ptr = 0;
    this.automate(bar, start);
  }

  /** Section-level moves of the lo-fi filter + the riser that leads out of a breakdown. */
  private automate(bar: BarEvents, t: number): void {
    const f = this.lofi.frequency;
    const open = this.def.lofi;
    const last = bar.bar === this.section.length - 1;
    if (bar.section === 'intro') {
      if (bar.bar === 0) {
        f.setValueAtTime(900, t);
        f.exponentialRampToValueAtTime(open, t + this.barDur * this.section.length * 0.95);
      }
    } else if (bar.section === 'breakdown') {
      if (bar.bar === 0) f.setTargetAtTime(1100, t, this.barDur * 0.25);
      if (last) {
        f.setTargetAtTime(open, t + this.barDur * 0.25, this.barDur * 0.2);
        this.riser(t, this.barDur);
      }
    } else if (bar.bar === 0) {
      f.setTargetAtTime(open, t, 0.05);
    }
  }

  private riser(t: number, dur: number): void {
    const core = this.core;
    const ctx = core.ctx;
    const src = ctx.createBufferSource();
    src.buffer = core.noise.white;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(LEVEL.riser, t + dur);
    g.gain.setTargetAtTime(0, t + dur, 0.02);
    src.connect(bp).connect(g).connect(this.sum);
    src.onended = () => g.disconnect();
    src.start(t);
    src.stop(t + dur + 0.2);
  }

  private fire(ev: SchedEvent, t: number): void {
    const ctx = this.core.ctx;
    const def = this.def;
    if (ev.kind === 'drum') {
      const inst = ev.inst;
      const tonal = inst === 'kick' || inst === 'perc';
      const rate = tonal ? 1 : 1 + (this.rng() - 0.5) * 0.03;
      const wet = inst === 'snare' || inst === 'clap' || inst === 'rim' || inst === 'perc';
      const level = Math.pow(ev.vel, 1.5) * DRUM_LEVEL[inst] * (def.drumMix?.[inst] ?? 1);
      playSample(ctx, this.drumBus, this.kit[inst], t, level, rate, wet ? this.drumRev : undefined);
      if (inst === 'kick' && ev.vel > 0.5) {
        // sidechain: the kick pushes keys (and, less, the bass) down for a moment
        const depth = def.duck * ev.vel;
        this.duckKeys.gain.setTargetAtTime(1 - depth, t, 0.006);
        this.duckKeys.gain.setTargetAtTime(1, t + 0.07, 0.11);
        this.duckBass.gain.setTargetAtTime(1 - depth * 0.6, t, 0.004);
        this.duckBass.gain.setTargetAtTime(1, t + 0.05, 0.07);
      }
    } else if (ev.kind === 'bass') {
      playBass(ctx, this.bassIn, def.bass, t, ev.midi, ev.dur, ev.vel, ev.glideFrom);
    } else if (ev.kind === 'chord') {
      playChord(ctx, this.keysIn, def.keys, t, ev.midis, ev.dur, ev.vel);
    } else {
      playLead(ctx, this.leadIn, def.lead, t, ev.midi, ev.dur, ev.vel);
    }
  }
}

export interface MusicState {
  mode: 'off' | 'auto' | 'fixed';
  track: string | null;
  section: SectionKind | null;
  formIndex: number;
  bar: number;
  barsPlayed: number;
  scheduled: number;
  lookAhead: number;
}

const LOOK_AHEAD = 0.12;
const LOOK_AHEAD_JANK = 0.6;
const TICK_MS = 25;

export class MusicEngine {
  private readonly core: AudioCore;
  private readonly realtime: boolean;
  private current: TrackPlayer | null = null;
  private mode: 'off' | 'auto' | 'fixed' = 'off';
  private autoIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private boostUntil = 0;
  private lookAhead = LOOK_AHEAD;

  /** `realtime` = false for OfflineAudioContext renders (no timers; call render(seconds)). */
  constructor(core: AudioCore, realtime = true) {
    this.core = core;
    this.realtime = realtime;
  }

  /** Track id, or 'auto' / undefined / unknown id → rotate through all tracks. */
  play(id?: string): void {
    const def = id && id !== 'auto' ? findTrack(id) : undefined;
    if (!def) {
      // auto: keep whatever is playing (it moves on at the end of its form), else start the next one
      this.mode = 'auto';
      if (!this.current) this.start(TRACKS[this.autoIndex % TRACKS.length]);
      return;
    }
    this.mode = 'fixed';
    if (this.current && this.current.def.id === def.id) return;
    this.start(def);
  }

  stop(): void {
    this.mode = 'off';
    this.current?.fadeOut(0.5, this.realtime);
    this.current = null;
    this.stopTimer();
  }

  private start(def: TrackDef): void {
    const now = this.core.now;
    const old = this.current;
    old?.fadeOut(1.6, this.realtime);
    const idx = TRACKS.indexOf(def);
    if (idx >= 0) this.autoIndex = idx;
    const t0 = now + 0.08;
    this.current = new TrackPlayer(this.core, def, t0);
    this.current.fadeIn(t0, old ? 1.1 : 0.4);
    this.startTimer();
    this.tick();
  }

  /** Scheduler pass. Safe to call as often as you like. */
  tick(): void {
    const cur = this.current;
    if (!cur) return;
    if (this.realtime) {
      const wall = performance.now();
      if (this.lastTick !== 0 && wall - this.lastTick > 90) this.boostUntil = wall + 4000;
      this.lastTick = wall;
      this.lookAhead = wall < this.boostUntil ? LOOK_AHEAD_JANK : LOOK_AHEAD;
    }
    cur.schedule(this.core.now + this.lookAhead);
    if (this.mode === 'auto' && cur.formDone) {
      this.start(TRACKS[(this.autoIndex + 1) % TRACKS.length]);
    }
  }

  /** Offline: queue the first `seconds` of the current track in one go. */
  render(seconds: number): void {
    this.current?.schedule(seconds);
  }

  /** Context suspended (tab hidden) / resumed. */
  pause(): void {
    this.stopTimer();
  }

  resume(): void {
    if (!this.current) return;
    // do not treat the time spent hidden as a stall
    this.lastTick = 0;
    this.startTimer();
  }

  private startTimer(): void {
    if (!this.realtime || this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  get state(): MusicState {
    const c = this.current;
    return {
      mode: this.mode,
      track: c ? c.def.id : null,
      section: c ? c.sectionKind : null,
      formIndex: c ? c.formIndex : 0,
      bar: c ? c.barIdx : 0,
      barsPlayed: c ? c.barsPlayed : 0,
      scheduled: c ? c.scheduled : 0,
      lookAhead: this.lookAhead,
    };
  }
}
