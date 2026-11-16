/**
 * AUDIO — 100 % procedural WebAudio (no files). `createAudio(bus)` returns the IAudio the game uses.
 *
 * Lifecycle
 *   · Nothing is created until unlock() (first user gesture). unlock() is idempotent, resumes a
 *     suspended / interrupted context and emits 'audio:unlocked' once the context really runs.
 *   · WebAudio missing or blocked → every method is a silent no-op; nothing here ever throws.
 *   · suspend() / resume() for page visibility. After the first unlock any later tap / key also
 *     resumes a context the OS interrupted (iOS phone call, tab switch).
 *
 * Files
 *   graph.ts      master chain, buses, shared noise, reverb, slow-mo pitch bus, one-shot voice pool
 *   sfx*.ts       one-shot recipes (+ crowd.ts), spec table with levels / cooldowns / priorities
 *   layers.ts     continuous layers (water, carve, chatter, wind, winch, rope, hero) + scrape.ts
 *   layerParams.ts  pure sim-state → layer targets
 *   music.ts      look-ahead scheduler, track bus, crossfade / rotation; instruments.ts synth voices
 *   patterns.ts / tracks.ts / theory.ts / dsp.ts   pure, unit-tested (tests/unit/audio*.test.ts)
 *   offline.ts    OfflineAudioContext harness used by dev/audio.html to measure the levels below
 *
 * MIX (all numbers measured with the offline render in dev/audio.html → "Run level check";
 *      dBFS, at the bus input = before the user volume sliders and the master chain)
 *
 *   master      sfx + music → compressor (−12 dB, knee 12, 3:1, 5 / 200 ms; its +2.4 dB auto
 *               make-up is taken back out) → ×0.94 → soft clipper (transparent below 0.7,
 *               ceiling 0.97 ≈ −0.3 dBFS, never clips)
 *   sliders     gain = slider^1.6; defaults sfx 0.9 → −1.5 dB, music 0.6 → −7.1 dB; the music bus
 *               has a further fixed −4.4 dB trim (MIX.music) so music sits clearly under the effects
 *
 *   one-shot peaks (amount = 1)
 *     bail.concrete −6 · hero.start −6 · bail.water −7 · splash.big −8 · land.water / land.hard −9
 *     goal −9 · pop −10 · countdown.go −10 · rail.lock −11 · crowd.cheer −11 (tier 5) · hero.end −11
 *     ui.unlock −11 · flip.catch −12 · combo.lost −12 · crowd.ooh −12 · rope twang −12
 *     letter / ui.buy / ui.star / countdown.tick / camera.shutter −13 · flip.click / combo.bank −14
 *     ui.tap / ui.back −17 · whoosh / grab −19
 *   continuous layers (RMS at full level)
 *     grind metal −20 · winch engine next to it under load −21 (far end of the line ≈ −35)
 *     grind stone / wood −22 · slide concrete −23 · water rush at top speed −23 · plastic pipe −24
 *     carve spray −25 · wet slide −25 · wind −26 · rope hum −30 (creaks peak ≈ −22)
 *     board chatter −30 · hero drone −31 (heartbeat peaks ≈ −17)
 *   music       every track is trimmed to ≈ −17 dBFS RMS at its bus (peaks ≈ −5); with the −4.4 dB
 *               trim and the default slider that is ≈ −28.5 dBFS RMS in the final mix, i.e. roughly
 *               8–12 dB under a busy moment of the effects. Pause: −10.5 dB and a 650 Hz low-pass.
 *
 * Slow motion: world sounds drop in pitch (×timeScale^0.44 → −8 semitones at 0.35×) and a low-pass
 * closes to ≈1.5 kHz ("under water"); music keeps its tempo and only gets a gentle low-pass < 0.6×.
 */
import { DEFAULT_SETTINGS } from '../config';
import type { EventBus } from '../core/events';
import { i18n, t } from '../i18n/i18n';
import enPart from '../i18n/parts/audio.en.json';
import ruPart from '../i18n/parts/audio.ru.json';
import type { AudioView, IAudio, RiderSimState, SfxId } from '../types';
import { AudioCore } from './graph';
import { Layers } from './layers';
import { MusicEngine, type MusicState } from './music';
import { Sfx, type SfxName, type SfxOpts } from './sfx';
import { bankBlipCount, cheerIntensity, clamp, impactNorm } from './theory';
import { TRACKS } from './tracks';

i18n.extend('ru', ruPart);
i18n.extend('en', enPart);

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

/** Internals exposed to the dev sandbox / smoke tests through audioDebug(). Not part of the game API. */
export interface AudioDebug {
  readonly context: AudioContext | null;
  readonly core: AudioCore | null;
  readonly layers: Layers | null;
  readonly music: MusicState | null;
  /** Number of one-shot voices currently alive. */
  readonly voices: number;
  /** True when WebAudio is unavailable and the module runs silent. */
  readonly failed: boolean;
  /** Any sound of the module, including the internal ones (twang, whoosh…). */
  playAny(id: SfxName, opts?: SfxOpts): void;
}

const debugHandles = new WeakMap<IAudio, AudioDebug>();

export function audioDebug(audio: IAudio): AudioDebug | null {
  return debugHandles.get(audio) ?? null;
}

class GameAudio implements IAudio {
  private readonly bus: EventBus;
  private ctx: AudioContext | null = null;
  private core: AudioCore | null = null;
  private sfx: Sfx | null = null;
  private layers: Layers | null = null;
  private music: MusicEngine | null = null;
  private failed = false;
  private announced = false;
  private hidden = false;
  private warned = false;
  private gestureHooked = false;
  private musicVolume: number = DEFAULT_SETTINGS.musicVolume;
  private sfxVolume: number = DEFAULT_SETTINGS.sfxVolume;
  private musicWanted = false;
  private musicTrack: string | undefined;
  private duckApi = false;
  private duckPause = false;
  private state: RiderSimState | null = null;

  constructor(bus: EventBus) {
    this.bus = bus;
    this.wire();
  }

  // ───────────────────────────────────────────────────────────── lifecycle ──

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get tracks(): { id: string; name: string }[] {
    return TRACKS.map((tr) => ({ id: tr.id, name: t(`audio.track.${tr.id}`) }));
  }

  unlock(): void {
    if (this.failed) return;
    this.guard(() => {
      if (!this.ctx) this.create();
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state === 'running') this.onRunning();
      else if (!this.hidden && ctx.state !== 'closed') ctx.resume().then(() => this.onRunning(), () => undefined);
    });
  }

  private create(): void {
    const g = globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) {
      this.failed = true;
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      ctx = new Ctor();
    }
    this.ctx = ctx;
    const core = (this.core = new AudioCore(ctx));
    this.sfx = new Sfx(core);
    this.layers = new Layers(core);
    this.music = new MusicEngine(core);
    core.setVolumes(this.musicVolume, this.sfxVolume);
    core.setDucked(this.duckApi || this.duckPause);
    // iOS only counts the context as user-activated once a buffer was started inside the gesture
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start(0);
    ctx.onstatechange = () => {
      if (ctx.state === 'running') this.onRunning();
    };
    this.hookGestures();
  }

  /** After the first unlock, any later gesture revives a context the OS suspended behind our back. */
  private hookGestures(): void {
    if (this.gestureHooked || typeof window === 'undefined') return;
    this.gestureHooked = true;
    const revive = (): void => {
      const ctx = this.ctx;
      if (ctx && !this.hidden && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => undefined);
    };
    for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
      window.addEventListener(type, revive, { capture: true, passive: true });
    }
  }

  private onRunning(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.musicWanted) this.guard(() => this.music?.play(this.musicTrack));
    this.music?.resume();
    if (!this.announced) {
      this.announced = true;
      this.bus.emit('audio:unlocked', {});
    }
  }

  suspend(): void {
    this.hidden = true;
    this.guard(() => {
      this.music?.pause();
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => undefined);
    });
  }

  resume(): void {
    this.hidden = false;
    this.guard(() => {
      const ctx = this.ctx;
      if (!ctx || ctx.state === 'closed') return;
      if (ctx.state === 'running') this.music?.resume();
      else ctx.resume().then(() => this.onRunning(), () => undefined);
    });
  }

  /** Run `fn`; an audio failure must never reach the game loop. */
  private guard(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.warn('[audio] disabled part of the sound after an error', err);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────── API ──

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = clamp(music, 0, 1);
    this.sfxVolume = clamp(sfx, 0, 1);
    this.guard(() => this.core?.setVolumes(this.musicVolume, this.sfxVolume));
  }

  playMusic(track?: string): void {
    this.musicWanted = true;
    this.musicTrack = track;
    if (this.unlocked) this.guard(() => this.music?.play(track));
  }

  stopMusic(): void {
    this.musicWanted = false;
    this.guard(() => this.music?.stop());
  }

  setDucked(ducked: boolean): void {
    this.duckApi = ducked;
    this.applyDuck();
  }

  private applyDuck(): void {
    this.guard(() => this.core?.setDucked(this.duckApi || this.duckPause));
  }

  play(id: SfxId, opts?: { volume?: number; pitch?: number; pan?: number }): void {
    this.fx(id, opts);
  }

  private fx(id: SfxName, opts?: SfxOpts): void {
    if (!this.sfx || !this.unlocked) return;
    this.guard(() => this.sfx?.play(id, opts));
  }

  update(realDt: number, view: AudioView): void {
    this.state = view.state;
    const core = this.core;
    if (!core || !this.unlocked) return;
    this.guard(() => {
      core.setTimeScale(view.paused || !view.state ? 1 : view.timeScale);
      this.layers?.update(realDt, view);
      this.music?.tick();
    });
  }

  // ─────────────────────────────────────────────────────────── bus events ──

  /** Small pan from the rider's lean: impacts land slightly on the side the board is edging to. */
  private leanPan(): number {
    return this.state ? clamp(this.state.lean, -1, 1) * 0.25 : 0;
  }

  private wire(): void {
    const bus = this.bus;

    bus.on('run:countdown', (e) => {
      if (e.n > 0) this.fx('countdown.tick');
    });
    bus.on('run:loaded', () => this.sfx?.resetRun());
    bus.on('run:go', () => {
      this.sfx?.resetRun();
      this.fx('countdown.go');
    });
    bus.on('run:paused', (e) => {
      this.duckPause = e.paused;
      this.applyDuck();
    });
    bus.on('run:quit', () => {
      this.duckPause = false;
      this.applyDuck();
      this.layers?.railExit();
    });
    bus.on('game:state', (e) => {
      if (e.state !== 'paused' && this.duckPause) {
        this.duckPause = false;
        this.applyDuck();
      }
      if (e.state === 'menu' || e.state === 'results') this.layers?.railExit();
    });

    bus.on('sim:pop', (e) => this.fx('pop', { amount: e.power, variant: e.surface === 'water' ? undefined : 'solid', pan: this.leanPan() }));
    bus.on('sim:land', (e) => {
      const a = impactNorm(e.impact);
      const pan = this.leanPan();
      if (e.onto === 'water') {
        this.fx('land.water', { amount: a, pan });
        if (a > 0.75) this.fx('splash.big', { amount: a, volume: 0.7, pan });
      } else if (e.onto !== 'rail') {
        // landing on a rail: 'sim:railEnter' brings the lock sound
        this.fx('land.hard', { amount: e.onto === 'wall' ? a * 0.5 : a, variant: e.surface === 'wood' ? 'wood' : undefined, pan });
      }
    });
    bus.on('sim:bail', (e) => {
      this.layers?.railExit();
      this.fx(e.surface === 'water' ? 'bail.water' : 'bail.concrete', { amount: e.intensity });
      if (e.intensity >= 0.6) this.fx('crowd.ooh', { amount: e.intensity, delay: 0.18 });
    });
    bus.on('sim:railEnter', (e) => {
      this.fx('rail.lock', { variant: e.material });
      this.guard(() => {
        if (this.unlocked) this.layers?.railEnter(e.material);
      });
    });
    bus.on('sim:railStance', () => this.fx('rail.lock', { volume: 0.4, pitch: 1.3 }));
    bus.on('sim:railExit', () => this.guard(() => this.layers?.railExit()));
    bus.on('sim:wallEnter', () => this.fx('land.hard', { amount: 0.3, volume: 0.7 }));
    bus.on('sim:ropeJerk', (e) => {
      if (e.jerk > 0.8) this.fx('twang', { amount: clamp(e.jerk / 8, 0.1, 1) });
    });
    bus.on('sim:handle', (e) => this.fx('handle', { variant: e.holding ? 'grab' : 'release' }));
    bus.on('sim:surfaceSpin', (e) => this.fx('swish', { pan: e.dir * -0.2 }));
    bus.on('sim:gap', () => this.fx('bonus'));
    bus.on('sim:finish', () => this.fx('crowd.cheer', { amount: 0.5, volume: 0.8 }));

    bus.on('trick:spin', (e) => this.fx('whoosh', { amount: clamp(Math.abs(e.deg) / 720, 0.3, 1) }));
    bus.on('trick:invert', () => this.fx('whoosh', { amount: 0.9, variant: 'down' }));
    bus.on('trick:shifty', () => this.fx('whoosh', { amount: 0.3, pitch: 1.3 }));
    bus.on('trick:grab', () => this.fx('grab'));
    bus.on('trick:flip', () => this.fx('flip.click'));
    bus.on('trick:catch', (e) => {
      if (e.ok) this.fx('flip.catch', { amount: e.quality });
      else this.fx('flip.click', { pitch: 0.6, volume: 0.8 });
    });

    bus.on('score:trick', (e) => {
      const intensity = cheerIntensity(e.trick.tier, e.landing);
      if (intensity > 0) this.fx('crowd.cheer', { amount: intensity, delay: 0.12 });
    });
    bus.on('score:bank', (e) => {
      if (e.banked > 0) this.fx('combo.bank', { step: bankBlipCount(e.banked), amount: clamp(Math.log10(Math.max(e.banked, 10)) / 5, 0.2, 1) });
    });
    bus.on('score:lost', (e) => {
      if (e.points > 0) this.fx('combo.lost');
    });
    bus.on('hero:ready', () => this.fx('hero.ready'));
    bus.on('hero:start', () => this.fx('hero.start'));
    bus.on('hero:end', () => this.fx('hero.end'));

    bus.on('letter:collect', (e) => this.fx('letter', { step: clamp(e.count, 1, 6) }));
    bus.on('goal:complete', (e) => this.fx('goal', { volume: e.first ? 1 : 0.6, delay: 0.25 }));
    bus.on('clip:captured', () => this.fx('camera.shutter'));
  }

  debug(): AudioDebug {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      get context() {
        return self.ctx;
      },
      get core() {
        return self.core;
      },
      get layers() {
        return self.layers;
      },
      get music() {
        return self.music ? self.music.state : null;
      },
      get voices() {
        return self.core ? self.core.voices.length : 0;
      },
      get failed() {
        return self.failed;
      },
      playAny: (id, opts) => self.fx(id, opts),
    };
  }
}

export function createAudio(bus: EventBus): IAudio {
  const audio = new GameAudio(bus);
  debugHandles.set(audio, audio.debug());
  return audio;
}
