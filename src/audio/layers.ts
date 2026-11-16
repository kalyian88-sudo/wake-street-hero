/**
 * Continuous sound layers driven every frame by the sim state:
 * water rush + fizz, carve spray, board chatter, wind, winch engine, rope hum + creaks,
 * grind / slide loops (ScrapeVoice) and the HERO drone + heartbeat.
 *
 * The static rig (≈45 nodes, three shared noise sources) exists only while a run is on screen;
 * it is torn down after a few seconds in the menus. update() does no allocations: targets come
 * from computeLayerTargets() into a reused struct and reach the AudioParams through Smooth, which
 * skips redundant automation events.
 */
import type { AudioView } from '../types';
import type { AudioCore } from './graph';
import { computeLayerTargets, createLayerTargets, railScrape, type ScrapeKind } from './layerParams';
import { ScrapeVoice } from './scrape';

export type LayerName = 'water' | 'carve' | 'chatter' | 'wind' | 'engine' | 'rope' | 'scrape' | 'hero';

/** Calibration gains (measured offline): layer level 1 → the RMS listed in the table in Audio.ts. */
const G = {
  water: 0.4,
  fizz: 0.16,
  carve: 0.325,
  chatter: 0.7,
  wind: 0.7,
  engine: 1.08,
  ropeHum: 0.1,
  creak: 1.3,
  drone: 0.03,
  heart: 0.11,
};

/** setTargetAtTime wrapper that ignores changes too small to hear (keeps the automation queue short). */
class Smooth {
  private last = Number.NaN;
  constructor(
    private readonly param: AudioParam,
    private readonly tau: number,
    private readonly eps = 0.015,
    private readonly floor = 0.02,
  ) {}

  set(v: number, now: number): void {
    const last = this.last;
    if (v === last) return;
    if (last === last && v !== 0 && Math.abs(v - last) < this.eps * Math.max(Math.abs(last), this.floor)) return;
    this.last = v;
    this.param.setTargetAtTime(v, now, this.tau);
  }
}

interface Rig {
  out: GainNode;
  sources: AudioScheduledSourceNode[];
  detunes: AudioParam[];
  water: Smooth;
  waterCut: Smooth;
  fizz: Smooth;
  carve: Smooth;
  carvePan: Smooth | null;
  chatter: Smooth;
  chatRate: Smooth;
  wind: Smooth;
  windFreq: Smooth;
  engine: Smooth;
  engSaw: Smooth;
  engSub: Smooth;
  engRing: Smooth;
  engPan: Smooth | null;
  rope: Smooth;
  ropeF1: Smooth;
  ropeF2: Smooth;
  creak: Smooth;
  creakF: Smooth;
}

interface HeroRig {
  out: GainNode;
  sources: AudioScheduledSourceNode[];
  drone: Smooth;
  beat: AudioParam;
}

export class Layers {
  /** Sandbox / calibration: play only this layer. */
  solo: LayerName | null = null;

  private readonly core: AudioCore;
  private readonly tg = createLayerTargets();
  private readonly master: Smooth;
  private rig: Rig | null = null;
  private hero: HeroRig | null = null;
  private grind: ScrapeVoice | null = null;
  private slide: ScrapeVoice | null = null;
  private idle = 0;
  private grindLost = 0;
  private slideLost = 0;
  private heroOff = 0;
  private nextBeat = 0;
  private prevTension = 0;
  private creakEnv = 0;
  private creakFreq = 1000;
  // two slow random signals in −1..1 that keep the noise layers alive
  private n1 = 0;
  private n2 = 0;
  private n1Target = 0;
  private n2Target = 0;

  constructor(core: AudioCore) {
    this.core = core;
    this.master = new Smooth(core.layerBus.gain, 0.04, 0.001);
  }

  /** 'sim:railEnter' — start the grind loop for the rail's material. */
  railEnter(material: 'metal' | 'stone' | 'wood' | 'plastic'): void {
    this.startGrind(railScrape(material));
  }

  /** 'sim:railExit'. */
  railExit(): void {
    this.grind?.release();
    this.grind = null;
  }

  private startGrind(kind: ScrapeKind): void {
    if (this.grind && this.grind.kind === kind) return;
    this.grind?.release();
    this.grind = new ScrapeVoice(this.core, kind);
    this.grindLost = 0;
  }

  private s(name: LayerName): number {
    return this.solo === null || this.solo === name ? 1 : 0;
  }

  update(realDt: number, view: AudioView): void {
    const core = this.core;
    const now = core.now;
    const tg = computeLayerTargets(view.state, view.paused, this.tg);
    this.master.set(tg.master, now);

    if (view.state) {
      this.idle = 0;
      if (!this.rig) this.rig = this.build();
    } else {
      this.idle += realDt;
      if (this.rig && this.idle > 2.5) this.teardown();
    }

    // slow random drift
    const k = Math.min(1, realDt * 3);
    if (core.rnd() < realDt * 2) this.n1Target = core.rnd() * 2 - 1;
    if (core.rnd() < realDt * 1.3) this.n2Target = core.rnd() * 2 - 1;
    this.n1 += (this.n1Target - this.n1) * k;
    this.n2 += (this.n2Target - this.n2) * k;
    const n1 = this.n1;
    const n2 = this.n2;

    const rig = this.rig;
    if (rig) {
      const sWater = this.s('water');
      rig.water.set(tg.water * G.water * (1 + 0.12 * n1) * sWater, now);
      rig.waterCut.set(tg.waterCutoff * (1 + 0.1 * n2), now);
      rig.fizz.set(tg.fizz * G.fizz * sWater, now);

      rig.carve.set(tg.carve * G.carve * (1 + 0.15 * n2) * this.s('carve'), now);
      rig.carvePan?.set(tg.carvePan, now);

      rig.chatter.set(tg.chatter * G.chatter * this.s('chatter'), now);
      rig.chatRate.set(tg.chatterRate * (1 + 0.3 * n1), now);

      rig.wind.set(tg.wind * G.wind * (1 + 0.2 * n2) * this.s('wind'), now);
      rig.windFreq.set(tg.windFreq * (1 + 0.15 * n1), now);

      const hz = tg.engineHz * (1 + 0.015 * n1);
      rig.engSaw.set(hz, now);
      rig.engSub.set(hz * 0.5, now);
      rig.engRing.set(0.1 + 0.5 * tg.engineLoad, now);
      rig.engine.set(tg.engine * G.engine * this.s('engine'), now);
      rig.engPan?.set(tg.enginePan, now);

      const sRope = this.s('rope');
      rig.rope.set(tg.rope * G.ropeHum * sRope, now);
      rig.ropeF1.set(tg.ropeHz, now);
      rig.ropeF2.set(tg.ropeHz * 2.01, now);
      // creaks: fibres slipping when the load changes fast, plus the odd one under steady strain
      const dTension = (tg.tension - this.prevTension) / Math.max(realDt, 1e-3);
      this.prevTension = tg.tension;
      if (tg.tension > 0.3 && (Math.abs(dTension) > 1.2 || core.rnd() < realDt * tg.tension * 1.2)) {
        this.creakEnv = 1;
        this.creakFreq = 750 + core.rnd() * 800;
      }
      this.creakEnv *= Math.exp(-realDt * 7);
      rig.creak.set(this.creakEnv > 0.02 ? this.creakEnv * tg.tension * G.creak * sRope : 0, now);
      rig.creakF.set(this.creakFreq * (1 + 0.2 * this.creakEnv), now);
    }

    this.updateScrapes(realDt);
    this.updateHero(realDt, now);
  }

  private updateScrapes(realDt: number): void {
    const tg = this.tg;
    const sScrape = this.s('scrape');
    if (tg.grind > 0) {
      // event missed (replay, sandbox): fall back to steel
      if (!this.grind) this.startGrind('metal');
      this.grindLost = 0;
      this.grind?.set(tg.grind * sScrape, tg.speed);
    } else if (this.grind) {
      this.grindLost += realDt;
      this.grind.set(0, tg.speed);
      if (this.grindLost > 0.35) this.railExit();
    }

    const kind = tg.slideKind;
    if (kind && tg.slide > 0) {
      this.slideLost = 0;
      if (!this.slide || this.slide.kind !== kind) {
        this.slide?.release();
        this.slide = new ScrapeVoice(this.core, kind);
      }
      this.slide.set(tg.slide * sScrape, tg.speed);
    } else if (this.slide) {
      this.slideLost += realDt;
      this.slide.set(0, tg.speed);
      if (this.slideLost > 0.15) {
        this.slide.release();
        this.slide = null;
      }
    }
  }

  private updateHero(realDt: number, now: number): void {
    const on = this.tg.hero > 0;
    if (on && !this.hero) {
      this.hero = this.buildHero();
      this.nextBeat = now + 0.25;
    }
    const hero = this.hero;
    if (!hero) return;
    if (on) {
      this.heroOff = 0;
      hero.drone.set(G.drone * this.s('hero'), now);
      // lub-dub, ~65 bpm, scheduled a little ahead with automation only (no new nodes)
      while (this.nextBeat < now + 0.25) {
        const tb = Math.max(this.nextBeat, now);
        const amp = G.heart * this.s('hero');
        hero.beat.setTargetAtTime(amp, tb, 0.008);
        hero.beat.setTargetAtTime(0, tb + 0.05, 0.045);
        hero.beat.setTargetAtTime(amp * 0.7, tb + 0.25, 0.008);
        hero.beat.setTargetAtTime(0, tb + 0.3, 0.05);
        this.nextBeat = tb + 0.92;
      }
    } else {
      hero.drone.set(0, now);
      this.heroOff += realDt;
      if (this.heroOff > 1.5) {
        for (const s of hero.sources) s.stop();
        hero.out.disconnect();
        this.hero = null;
      }
    }
  }

  // ───────────────────────────────────────────────────────────── graphs ──

  private build(): Rig {
    const core = this.core;
    const ctx = core.ctx;
    const out = ctx.createGain();
    out.connect(core.layerBus);
    const sources: AudioScheduledSourceNode[] = [];
    const detunes: AudioParam[] = [];
    const follow = (p: AudioParam): void => {
      if (!core.pitchBus) return;
      core.pitchBus.connect(p);
      detunes.push(p);
    };
    const gain = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const biq = (type: BiquadFilterType, f: number, q: number): BiquadFilterNode => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      follow(b.detune);
      return b;
    };
    const osc = (type: OscillatorType, f: number): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start();
      sources.push(o);
      return o;
    };
    const panner = (): StereoPannerNode | null => (typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null);
    const toOut = (node: AudioNode, pan: StereoPannerNode | null): void => {
      if (pan) node.connect(pan).connect(out);
      else node.connect(out);
    };

    const pink = core.noiseSource('pink');
    const white = core.noiseSource('white');
    const brown = core.noiseSource('brown');
    sources.push(pink, white, brown);

    // water rush: pink noise, brighter with speed, plus a high fizz band
    const wHp = biq('highpass', 180, 0.7);
    const wLp = biq('lowpass', 500, 0.4);
    const wG = gain(0);
    pink.connect(wHp).connect(wLp).connect(wG).connect(out);
    const fzBp = biq('bandpass', 4200, 0.6);
    const fzG = gain(0);
    white.connect(fzBp).connect(fzG).connect(out);

    // carve spray: hissy band thrown to the outside of the turn
    const cHp = biq('highpass', 2600, 0.7);
    const cBp = biq('bandpass', 5200, 0.8);
    const cG = gain(0);
    const cPan = panner();
    white.connect(cHp).connect(cBp).connect(cG);
    toOut(cG, cPan);

    // board chatter: low slaps — the AM gain jumps to 1 at every saw reset and decays linearly
    const chBp = biq('bandpass', 240, 1.2);
    const chBp2 = biq('bandpass', 850, 1);
    const chBp2G = gain(0.35);
    const chAm = gain(0.5);
    const chG = gain(0);
    const chLfo = osc('sawtooth', 10);
    const chDepth = gain(-0.5);
    chLfo.connect(chDepth).connect(chAm.gain);
    brown.connect(chBp).connect(chAm);
    pink.connect(chBp2).connect(chBp2G).connect(chAm);
    chAm.connect(chG).connect(out);

    // wind
    const wiBp = biq('bandpass', 400, 1.1);
    const wiG = gain(0);
    pink.connect(wiBp).connect(wiG).connect(out);

    // winch engine: firing pulse (saw) + half-rate lope (square) + exhaust noise gated by the pulse,
    // through fixed exhaust formants; the 2.5 kHz "ring-ding" formant opens with load
    const eSaw = osc('sawtooth', 26);
    const eSub = osc('square', 13);
    follow(eSaw.detune);
    follow(eSub.detune);
    const eIn = gain(1);
    const eSawG = gain(0.5);
    const eSubG = gain(0.28);
    eSaw.connect(eSawG).connect(eIn);
    eSub.connect(eSubG).connect(eIn);
    const exAm = gain(0.5);
    const exDepth = gain(0.5);
    eSaw.connect(exDepth).connect(exAm.gain);
    const exG = gain(0.35);
    white.connect(exAm).connect(exG).connect(eIn);
    const f1 = biq('bandpass', 310, 1.4);
    const f2 = biq('bandpass', 1150, 2.2);
    const f3 = biq('bandpass', 2500, 3);
    const g2 = gain(0.55);
    const g3 = gain(0.1);
    const eLp = biq('lowpass', 3000, 0.6);
    const eG = gain(0);
    const ePan = panner();
    eIn.connect(f1).connect(eLp);
    eIn.connect(f2).connect(g2).connect(eLp);
    eIn.connect(f3).connect(g3).connect(eLp);
    eLp.connect(eG);
    toOut(eG, ePan);

    // rope: strained hum (triangle + band-passed saw an octave up) and narrow-band creaks
    const rTri = osc('triangle', 62);
    const rSaw = osc('sawtooth', 124.6);
    follow(rTri.detune);
    follow(rSaw.detune);
    const rSawG = gain(0.9);
    const rTriG = gain(0.5);
    const rBp = biq('bandpass', 700, 3);
    const rHum = gain(0);
    rTri.connect(rTriG).connect(rHum);
    rSaw.connect(rSawG).connect(rBp).connect(rHum);
    rHum.connect(out);
    const crBp = biq('bandpass', 1100, 28);
    const crG = gain(0);
    white.connect(crBp).connect(crG).connect(out);

    return {
      out,
      sources,
      detunes,
      water: new Smooth(wG.gain, 0.09),
      waterCut: new Smooth(wLp.frequency, 0.12),
      fizz: new Smooth(fzG.gain, 0.09),
      carve: new Smooth(cG.gain, 0.06),
      carvePan: cPan ? new Smooth(cPan.pan, 0.08, 0.05, 0.1) : null,
      chatter: new Smooth(chG.gain, 0.08),
      chatRate: new Smooth(chLfo.frequency, 0.15, 0.02),
      wind: new Smooth(wiG.gain, 0.12),
      windFreq: new Smooth(wiBp.frequency, 0.15),
      engine: new Smooth(eG.gain, 0.1),
      engSaw: new Smooth(eSaw.frequency, 0.07, 0.004),
      engSub: new Smooth(eSub.frequency, 0.07, 0.004),
      engRing: new Smooth(g3.gain, 0.1),
      engPan: ePan ? new Smooth(ePan.pan, 0.15, 0.05, 0.1) : null,
      rope: new Smooth(rHum.gain, 0.06),
      ropeF1: new Smooth(rTri.frequency, 0.08, 0.005),
      ropeF2: new Smooth(rSaw.frequency, 0.08, 0.005),
      creak: new Smooth(crG.gain, 0.012),
      creakF: new Smooth(crBp.frequency, 0.05, 0.005),
    };
  }

  private buildHero(): HeroRig {
    const core = this.core;
    const ctx = core.ctx;
    const out = ctx.createGain();
    out.connect(core.layerBus);
    const sources: AudioScheduledSourceNode[] = [];
    const osc = (type: OscillatorType, f: number): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start();
      sources.push(o);
      return o;
    };
    // drone: an open fifth of detuned saws breathing through a slow low-pass
    const d1 = osc('sawtooth', 82.4);
    const d2 = osc('sawtooth', 123.9);
    const d2G = ctx.createGain();
    d2G.gain.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    lp.Q.value = 2;
    const lfo = osc('sine', 0.23);
    const lfoG = ctx.createGain();
    lfoG.gain.value = 120;
    lfo.connect(lfoG).connect(lp.frequency);
    const dG = ctx.createGain();
    dG.gain.value = 0;
    d1.connect(lp);
    d2.connect(d2G).connect(lp);
    lp.connect(dG).connect(out);
    // heartbeat: low thump (95 Hz + octave) with a soft noise body, gated by `beat`
    const h1 = osc('triangle', 95);
    const h2 = osc('sine', 190);
    const h2G = ctx.createGain();
    h2G.gain.value = 0.5;
    const noise = core.noiseSource('brown');
    sources.push(noise);
    const nBp = ctx.createBiquadFilter();
    nBp.type = 'bandpass';
    nBp.frequency.value = 260;
    nBp.Q.value = 1.2;
    const nG = ctx.createGain();
    nG.gain.value = 1.5;
    const beat = ctx.createGain();
    beat.gain.value = 0;
    h1.connect(beat);
    h2.connect(h2G).connect(beat);
    noise.connect(nBp).connect(nG).connect(beat);
    beat.connect(out);
    return { out, sources, drone: new Smooth(dG.gain, 0.4), beat: beat.gain };
  }

  private teardown(): void {
    const rig = this.rig;
    if (!rig) return;
    this.rig = null;
    for (const s of rig.sources) {
      try {
        s.stop();
      } catch {
        /* not started */
      }
    }
    for (const p of rig.detunes) {
      try {
        this.core.pitchBus?.disconnect(p);
      } catch {
        /* already gone */
      }
    }
    rig.out.disconnect();
  }

  /** Stop everything (context closing / tests). */
  dispose(): void {
    this.teardown();
    this.grind?.release();
    this.slide?.release();
    this.grind = this.slide = null;
    if (this.hero) {
      for (const s of this.hero.sources) s.stop();
      this.hero.out.disconnect();
      this.hero = null;
    }
  }
}
