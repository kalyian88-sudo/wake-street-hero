/**
 * One run on one spot: owns the sim, the rider rig, the objectives tracker and the replay buffer,
 * and drives them in the frame order of docs/PLAN.md §3. The spot world itself is borrowed from the
 * SpotLoader cache (so a retry or a new run on the same spot does not rebuild it).
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { GAME } from '../config';
import { applyRunResult, buildRunResult } from '../career/rewards';
import { createRunObjectives } from '../career/objectives';
import { computeStats } from '../data/gear';
import { neutralInputFrame } from '../input/Input';
import { createRiderSim } from '../physics/RiderSim';
import { createRiderRig } from '../rider/RiderRig';
import type {
  AudioView,
  HudView,
  IAudio,
  IHud,
  IInput,
  IRiderRig,
  IRiderSim,
  IRunObjectives,
  ISaveStore,
  InputFrame,
  QualityProfile,
  RiderSimState,
  RunConfig,
  RunResult,
  SpotDef,
  WorldView,
} from '../types';
import type { SwipeControls } from '../input/Swipe';
import type { CameraRig } from './CameraRig';
import type { Engine } from './Engine';
import type { EventBus } from './events';
import type { FxParams } from './PostFx';
import { ReplayBuffer, type ReplayClip } from './Replay';
import { createRiderSimState } from './riderState';
import type { LoadedSpot } from './SpotLoader';
import type { TimeScale } from './Time';

export type SessionPhase = 'countdown' | 'run' | 'finishing' | 'results' | 'replay';

export interface SessionDeps {
  bus: EventBus;
  save: ISaveStore;
  input: IInput;
  hud: IHud;
  audio: IAudio;
  engine: Engine;
  cameraRig: CameraRig;
  time: TimeScale;
  swipe: SwipeControls;
}

/** What an endless run carries from one stage to the next. */
export interface EndlessCarry {
  stage: number;
  lives: number;
  score: number;
  falls: number;
  tricksLanded: number;
  bestCombo: number;
  bestTrick: RunResult['bestTrick'];
  /** Metres ridden in the stages already cleared. */
  distance: number;
  runTime: number;
}

export const ENDLESS_LIVES = 3;

export interface SessionCallbacks {
  /** Endless canal: the winch of this stage was reached — build the next one. */
  onStageClear?(carry: EndlessCarry): void;
  /** GO: the countdown is over. */
  onGo(): void;
  /** Result built and saved. */
  onResults(result: RunResult): void;
  /** Player hit pause (Esc / P / HUD button). */
  onPauseRequest(): void;
}

/** Seconds of victory orbit between crossing the finish and the results screen. */
const FINISH_HOLD = 1.2;
/** Retries get a snappier countdown than the first drop-in. */
const RETRY_COUNTDOWN_SCALE = 0.55;
const REPLAY_SPEED = 0.5;
const NO_LETTERS: readonly boolean[] = [false, false, false, false, false, false];

export class RunSession {
  readonly spot: SpotDef;
  readonly sim: IRiderSim;
  readonly rig: IRiderRig;
  readonly replay = new ReplayBuffer();
  objectives: IRunObjectives;
  phase: SessionPhase = 'countdown';
  result: RunResult | null = null;
  /** Hitbox overlay on (kept across restarts). */
  hitboxes = false;

  private readonly neutral: InputFrame = neutralInputFrame();
  private readonly offs: (() => void)[] = [];
  private readonly letters: boolean[] = NO_LETTERS.slice();
  private readonly view: WorldView;
  private readonly hudView: HudView;
  private readonly audioView: AudioView;
  private readonly fx: FxParams = { slowMo: 0, hero: 0, bloom: 0, time: 0 };
  private countdownTotal: number = GAME.countdown;
  private countdownLeft: number = GAME.countdown;
  private countdownN = 0;
  private finishTimer = 0;
  private runTime = 0;
  private worldTime = 0;
  private clock = 0;
  private disposed = false;
  /** Endless canal state (null in every other mode). */
  endless: EndlessCarry | null = null;
  private outOfLives = false;

  // replay playback
  private clip: ReplayClip | null = null;
  private replayT = 0;
  private replayFxIndex = 0;
  private replayDone: (() => void) | null = null;
  private readonly scratch: RiderSimState;
  private readonly stillCam = new PerspectiveCamera();
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly v3 = new Vector3();

  constructor(
    private readonly deps: SessionDeps,
    private readonly loaded: LoadedSpot,
    readonly config: RunConfig,
    profile: QualityProfile,
    private readonly cb: SessionCallbacks,
  ) {
    const { bus, save } = deps;
    this.spot = loaded.spot;
    const settings = save.data.settings;
    const winch = this.spot.winchPoints.find((w) => w.id === config.winchId) ?? this.spot.winchPoints[0];
    this.config = { ...config, winchId: winch.id };

    this.sim = createRiderSim(
      {
        spot: this.spot,
        winchId: winch.id,
        power: config.power,
        board: config.board,
        stance: settings.stance,
        stats: computeStats(save.data.equipped, config.board),
      },
      bus,
    );
    this.rig = createRiderRig({ appearance: save.data.appearance, gear: save.data.equipped, stance: settings.stance }, config.board, profile);
    loaded.scene.add(this.rig.root);
    this.objectives = this.makeObjectives();
    this.scratch = createRiderSimState(config.board, settings.stance);

    const state = this.sim.state;
    this.view = { rider: state, camera: deps.cameraRig.camera };
    this.hudView = { state, score: this.sim.score.state, objectives: this.objectives.state, timeScale: 1, countdown: null };
    this.audioView = { state, timeScale: 1, paused: false };

    this.offs.push(
      bus.on('sim:finish', () => this.beginFinish()),
      bus.on('score:trick', (e) => {
        if (this.phase === 'replay') return;
        this.replay.addTrick({ time: e.time, awarded: e.awarded, name: e.trick.name, tier: e.trick.tier, id: e.trick.id });
      }),
      bus.on('sim:pop', (e) => this.markFx('pop', e.pos.x, e.pos.y, e.pos.z, 0.25 + 0.5 * e.power, e.surface === 'water')),
      bus.on('sim:land', (e) =>
        this.markFx('land', e.pos.x, e.pos.y, e.pos.z, Math.min(1, Math.max(0.15, e.impact / 9)), e.onto === 'water' || e.surface === 'water'),
      ),
      bus.on('sim:bail', (e) => this.markFx('bail', e.pos.x, e.pos.y, e.pos.z, 0.7 + 0.3 * e.intensity, e.surface === 'water')),
      bus.on('sim:bail', () => this.onEndlessBail()),
    );
    if (config.mode === 'endless') {
      this.endless = { stage: 0, lives: ENDLESS_LIVES, score: 0, falls: 0, tricksLanded: 0, bestCombo: 0, bestTrick: null, distance: 0, runTime: 0 };
    }

    loaded.world.setWinchPoint(winch.id);
    loaded.world.setLinePreview(false);
    deps.cameraRig.setSpot(this.spot, this.sim.world);
    this.begin(false);
  }

  private markFx(kind: 'pop' | 'land' | 'bail', x: number, y: number, z: number, strength: number, water: boolean): void {
    if (this.phase === 'replay') return;
    this.replay.addFx({ time: this.sim.state.time, kind, x, y, z, strength, water });
  }

  private makeObjectives(): IRunObjectives {
    const before = this.deps.save.data.spots[this.spot.id]?.goals ?? [];
    const done = this.spot.goals.map((_, i) => !!before[i]);
    return createRunObjectives(this.spot, this.config, done, this.deps.bus);
  }

  /** Put everything at the start line and begin the countdown. */
  private begin(retry: boolean): void {
    const { cameraRig, time, hud, input } = this.deps;
    this.phase = 'countdown';
    this.result = null;
    this.countdownTotal = GAME.countdown * (retry ? RETRY_COUNTDOWN_SCALE : 1);
    this.countdownLeft = this.countdownTotal;
    this.countdownN = 0;
    this.finishTimer = 0;
    this.runTime = 0;
    time.reset();
    this.replay.clear();
    for (let i = 0; i < this.letters.length; i++) this.letters[i] = false;
    this.loaded.world.setLetters(this.letters);
    this.hudView.objectives = this.objectives.state;
    this.hudView.countdown = Math.ceil(GAME.countdown);
    this.rig.setVisible(true);
    this.rig.update(this.sim.state, 0);
    cameraRig.setMode('chase');
    cameraRig.reset(this.sim.state);
    hud.show(this.config, this.spot);
    hud.setScheme?.(this.deps.save.data.settings.controls);
    hud.setEndless?.(this.endless ? { stage: this.endless.stage, lives: this.endless.lives } : null);
    this.deps.swipe.reset();
    input.setEnabled(true);
    if (this.hitboxes) this.loaded.world.setDebug(true, this.sim.world.debugShapes());
  }

  /** Endless: continue from the previous stage (score, lives…) and skip the countdown. */
  applyCarry(carry: EndlessCarry): void {
    this.endless = { ...carry };
    const sc = this.sim.score.state;
    sc.total = carry.score;
    sc.falls = carry.falls;
    sc.tricksLanded = carry.tricksLanded;
    sc.bestCombo = carry.bestCombo;
    sc.bestTrick = carry.bestTrick;
    this.runTime = carry.runTime;
    this.deps.hud.setEndless?.({ stage: carry.stage, lives: carry.lives });
    this.skipCountdown();
  }

  private onEndlessBail(): void {
    const e = this.endless;
    if (!e || this.phase !== 'run') return;
    e.lives = Math.max(0, e.lives - 1);
    this.deps.hud.setEndless?.({ stage: e.stage, lives: e.lives });
    if (e.lives === 0) {
      this.outOfLives = true;
      this.phase = 'finishing';
      this.finishTimer = -0.6; // let the splash play out
    }
  }

  /** Metres ridden in this stage so far. */
  private stageDistance(): number {
    const wp = this.spot.winchPoints[0];
    return Math.max(0, this.sim.state.pos.z - wp.start[2]);
  }

  /** Same spot, same line, fresh attempt — nothing is rebuilt. */
  restart(): void {
    if (this.disposed) return;
    this.abortReplay();
    this.sim.reset();
    this.objectives.dispose();
    this.objectives = this.makeObjectives();
    this.begin(true);
  }

  /** Test hook / impatient players: GO right now. */
  skipCountdown(): void {
    if (this.phase === 'countdown') this.go();
  }

  private go(): void {
    this.countdownLeft = 0;
    this.hudView.countdown = null;
    this.phase = 'run';
    this.sim.go();
    this.deps.bus.emit('run:go', { config: this.config });
    this.cb.onGo();
  }

  private beginFinish(): void {
    if (this.phase !== 'run') return;
    const e = this.endless;
    if (e && this.cb.onStageClear) {
      // stage cleared: bank everything and hand over to the next stage
      const score = this.sim.score;
      if (score.state.comboActive || score.state.comboPoints > 0) score.finish();
      const sc = score.state;
      this.phase = 'finishing';
      this.finishTimer = -1e9; // never times out into results: the game builds the next stage
      this.cb.onStageClear({
        stage: e.stage + 1,
        lives: e.lives,
        score: sc.total,
        falls: sc.falls,
        tricksLanded: sc.tricksLanded,
        bestCombo: sc.bestCombo,
        bestTrick: sc.bestTrick,
        distance: e.distance + this.stageDistance(),
        runTime: this.runTime,
      });
      return;
    }
    this.phase = 'finishing';
    this.finishTimer = 0;
  }

  private finish(): void {
    const { save, bus, hud, input } = this.deps;
    const score = this.sim.score;
    // The sim banks the combo when it crosses the line; make sure nothing is left hanging.
    if (score.state.comboActive || score.state.comboPoints > 0) score.finish();
    const result = buildRunResult(this.config, score.state, this.objectives.state, save.data, this.runTime);
    if (this.endless) {
      const e = this.endless;
      const distance = Math.round(e.distance + this.stageDistance());
      const best = result.score > (save.data.stats.endlessBest ?? 0);
      result.coins = Math.floor(result.score / 40) + e.stage * 25;
      result.rep = 0;
      result.newGoals = [];
      result.goals = [];
      result.stars = 0;
      result.newRecord = best;
      result.endless = { stage: e.stage, distance, best };
      save.update((d) => {
        d.coins += result.coins;
        d.stats.totalRuns++;
        d.stats.totalScore += result.score;
        d.stats.totalFalls += result.falls;
        d.stats.bestCombo = Math.max(d.stats.bestCombo, result.bestCombo);
        d.stats.endlessBest = Math.max(d.stats.endlessBest ?? 0, result.score);
        d.stats.endlessStage = Math.max(d.stats.endlessStage ?? 0, e.stage);
      });
    } else if (this.config.mode === 'free') {
      // Free ride: no goals, no rewards — only the personal best is kept.
      const prev = save.data.spots[this.spot.id];
      result.coins = 0;
      result.rep = 0;
      result.newGoals = [];
      result.goals = this.spot.goals.map((_, i) => !!prev?.goals[i]);
      result.stars = result.goals.filter(Boolean).length;
      if (result.score > (prev?.bestScore ?? 0)) {
        save.update((d) => {
          const sp = d.spots[this.spot.id] ?? (d.spots[this.spot.id] = { goals: result.goals.slice(), bestScore: 0, bestCombo: 0, bestTrick: null, runs: 0 });
          sp.bestScore = Math.max(sp.bestScore, result.score);
        });
      }
    } else {
      save.update((d) => applyRunResult(d, result));
    }
    this.result = result;
    this.phase = 'results';
    hud.hide();
    input.setEnabled(false);
    bus.emit('run:finish', { result });
    this.cb.onResults(result);
  }

  private syncLetters(): void {
    const src = this.objectives.state.letters;
    let changed = false;
    for (let i = 0; i < this.letters.length; i++) {
      const v = !!src[i];
      if (v !== this.letters[i]) {
        this.letters[i] = v;
        changed = true;
      }
    }
    if (changed) this.loaded.world.setLetters(this.letters);
  }

  /**
   * One frame of the session (everything except drawing). `paused` freezes the sim but keeps the
   * continuous audio layers informed.
   */
  frame(realDt: number, paused: boolean): void {
    if (this.disposed) return;
    const { input, time, cameraRig, audio, hud } = this.deps;
    this.clock += realDt;
    const polled = input.poll();
    if (this.phase === 'replay') {
      this.replayFrame(realDt);
      return;
    }
    const state = this.sim.state;
    if (paused) {
      this.deps.swipe.setEnabled(false);
      this.audioView.state = state;
      this.audioView.timeScale = time.scale;
      this.audioView.paused = true;
      audio.update(realDt, this.audioView);
      if (cameraRig.mode === 'free') cameraRig.update(realDt, 0, state, this.rig);
      return;
    }
    const playing = this.phase === 'countdown' || this.phase === 'run';
    if (playing && polled.pausePressed) {
      this.cb.onPauseRequest();
      return;
    }

    if (this.phase === 'countdown') {
      this.countdownLeft -= realDt;
      if (this.countdownLeft <= 0) this.go();
      else {
        const n = Math.ceil((this.countdownLeft / this.countdownTotal) * GAME.countdown);
        if (n !== this.countdownN) {
          this.countdownN = n;
          this.hudView.countdown = n;
          this.deps.bus.emit('run:countdown', { n });
        }
      }
    } else if (this.phase === 'run') {
      this.runTime += realDt;
      // Belt and braces in case a listener missed 'sim:finish'.
      if (state.mode === 'finished') this.beginFinish();
    } else if (this.phase === 'finishing') {
      this.runTime += realDt;
      this.finishTimer += realDt;
    }

    // ── PLAN §3 frame order ──
    const swipeOn = playing && this.deps.save.data.settings.controls === 'swipe' && this.deps.input.touchMode;
    this.deps.swipe.setEnabled(swipeOn);
    if (swipeOn) this.deps.swipe.apply(polled, state);
    const frame = playing ? polled : this.neutral;
    const scale = time.update(realDt, state.slowMo, state.hero);
    const dt = realDt * scale;
    this.sim.step(dt, frame, scale);
    this.objectives.update(state, this.sim.score.state, dt);
    this.syncLetters();
    this.rig.update(state, dt);
    this.worldTime += dt;
    this.view.rider = state;
    this.view.camera = cameraRig.camera;
    this.loaded.world.update(dt, this.worldTime, this.view);
    cameraRig.update(realDt, dt, state, this.rig);
    this.replay.record(state);
    this.audioView.state = state;
    this.audioView.timeScale = scale;
    this.audioView.paused = false;
    audio.update(realDt, this.audioView);
    if (this.phase !== 'results') {
      this.hudView.timeScale = scale;
      hud.update(this.hudView, realDt);
    }

    if (this.phase === 'finishing' && this.finishTimer >= FINISH_HOLD) this.finish();
    void this.outOfLives;
  }

  /** Draw the current frame. */
  render(realDt: number): void {
    const { engine, time } = this.deps;
    const fx = this.fx;
    const replaying = this.phase === 'replay';
    fx.slowMo = replaying ? 0.3 : time.slowMo;
    fx.hero = replaying ? 0 : time.hero;
    fx.bloom = this.spot.env.bloom;
    fx.time = this.clock;
    engine.render(this.loaded.scene, this.deps.cameraRig.camera, fx, realDt);
  }

  // ───────────────────────────────────────────────────────────── replay ──

  /** Filmer zone whose frame contains `pos` (else null → virtual filmer next to the rider). */
  private zoneAt(pos: Vector3): string | null {
    for (const z of this.spot.filmerZones) {
      if (Math.hypot(pos.x - z.center[0], pos.z - z.center[1]) <= z.radius) return z.id;
    }
    return null;
  }

  /** Best-trick replay from the filmer's position at half speed. Resolves when it ends or is stopped. */
  playReplay(): Promise<void> {
    if (this.disposed || this.phase !== 'results') return Promise.resolve();
    const clip = this.replay.bestClip();
    if (!clip || clip.end - clip.start < 0.3) return Promise.resolve();
    const { cameraRig } = this.deps;
    const hero = this.replay.sample(clip.hero, this.scratch);
    if (!hero) return Promise.resolve();
    const filmerPos = this.v1;
    const filmerLook = this.v2;
    this.loaded.world.getFilmerCamera(this.zoneAt(hero.pos), hero.pos, filmerPos, filmerLook);

    this.clip = clip;
    this.replayT = clip.start;
    this.replayFxIndex = 0;
    while (this.replayFxIndex < this.replay.fx.length && this.replay.fx[this.replayFxIndex].time < clip.start) this.replayFxIndex++;
    this.phase = 'replay';

    const first = this.replay.sample(clip.start, this.scratch) ?? hero;
    this.rig.update(first, 0);
    this.rig.root.updateMatrixWorld(true);
    cameraRig.setMode('filmer');
    cameraRig.startFilmer(filmerPos, this.rig.getChestWorldPosition(this.v3));
    return new Promise<void>((resolve) => {
      this.replayDone = resolve;
    });
  }

  stopReplay(): void {
    this.abortReplay();
  }

  private abortReplay(): void {
    if (this.phase !== 'replay') return;
    const { cameraRig } = this.deps;
    this.phase = 'results';
    this.clip = null;
    // Back to the live (finished) rider and the orbit camera.
    const state = this.sim.state;
    this.rig.update(state, 0);
    cameraRig.setMode('chase');
    cameraRig.reset(state);
    const done = this.replayDone;
    this.replayDone = null;
    done?.();
  }

  private replayFrame(realDt: number): void {
    const clip = this.clip;
    if (!clip) return;
    const { cameraRig, audio } = this.deps;
    const world = this.loaded.world;
    const dt = realDt * REPLAY_SPEED;
    this.replayT += dt;
    if (this.replayT >= clip.end) {
      this.abortReplay();
      return;
    }
    const s = this.replay.sample(this.replayT, this.scratch);
    if (!s) {
      this.abortReplay();
      return;
    }
    this.rig.update(s, dt);

    // Re-create the splashes of the original run (no gameplay events are re-emitted).
    const fxList = this.replay.fx;
    while (this.replayFxIndex < fxList.length && fxList[this.replayFxIndex].time <= this.replayT) {
      const f = fxList[this.replayFxIndex++];
      const p = this.v1.set(f.x, f.y, f.z);
      if (f.water) {
        world.particles.splash(p, f.strength, f.kind);
        world.water.ripple(p, f.strength);
      }
      if (f.kind === 'pop') audio.play('pop', { volume: 0.7 });
      else if (f.kind === 'land') audio.play(f.water ? 'land.water' : 'land.hard', { volume: 0.8 });
      else audio.play(f.water ? 'bail.water' : 'bail.concrete', { volume: 0.8 });
    }

    this.worldTime += dt;
    this.view.rider = s;
    this.view.camera = cameraRig.camera;
    world.update(dt, this.worldTime, this.view);
    cameraRig.updateFilmer(realDt, s, this.rig);
    this.audioView.state = s;
    this.audioView.timeScale = REPLAY_SPEED;
    this.audioView.paused = false;
    audio.update(realDt, this.audioView);
  }

  // ──────────────────────────────────────────────────────── share frame ──

  /**
   * Pose rig + world at the hero frame of the best trick and render it from the filmer camera into a
   * w×h canvas. Leaves the live state exactly as it was.
   */
  renderBestFrame(w: number, h: number): HTMLCanvasElement | null {
    if (this.disposed) return null;
    const { engine, cameraRig } = this.deps;
    const world = this.loaded.world;
    const live = this.sim.state;
    const clip = this.replay.bestClip();
    // Use a private scratch so a replay that is playing right now is not disturbed.
    const still = createRiderSimState(live.board, live.stance);
    const hero = (clip && this.replay.sample(clip.hero, still)) || null;
    const pose = hero ?? live;

    this.rig.update(pose, 0);
    this.rig.root.updateMatrixWorld(true);
    const chest = this.rig.getChestWorldPosition(this.v3);
    const filmerPos = this.v1;
    world.getFilmerCamera(this.zoneAt(pose.pos), pose.pos, filmerPos, this.v2);
    cameraRig.frameStill(this.stillCam, filmerPos, chest, w / h);
    this.view.rider = pose;
    this.view.camera = this.stillCam;
    world.update(0, this.worldTime, this.view);

    const fx: FxParams = { slowMo: 0.2, hero: 0, bloom: this.spot.env.bloom, time: this.clock };
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = engine.renderStill(this.loaded.scene, this.stillCam, w, h, fx);
    } finally {
      // Restore what the live camera was looking at.
      const back = this.phase === 'replay' ? (this.replay.sample(this.replayT, this.scratch) ?? live) : live;
      this.rig.update(back, 0);
      this.view.rider = back;
      this.view.camera = cameraRig.camera;
      world.update(0, this.worldTime, this.view);
    }
    return canvas;
  }

  // ─────────────────────────────────────────────────────────────── misc ──

  setHitboxes(on: boolean): void {
    this.hitboxes = on;
    this.loaded.world.setDebug(on, on ? this.sim.world.debugShapes() : undefined);
  }

  /** Countdown digit for external readers (null once running). */
  get countdown(): number | null {
    return this.phase === 'countdown' ? this.hudView.countdown : null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.abortReplay();
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.objectives.dispose();
    if (this.hitboxes) this.loaded.world.setDebug(false);
    this.loaded.scene.remove(this.rig.root);
    this.rig.dispose();
    this.loaded.world.setLetters(NO_LETTERS.slice());
    this.deps.cameraRig.setSpot(this.spot, null);
    this.deps.hud.hide();
    this.deps.input.setEnabled(false);
  }
}
