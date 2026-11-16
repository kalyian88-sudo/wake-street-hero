/**
 * HUD + INPUT sandbox: the real HUD and Input over a fake moving backdrop, driven by a scripted fake
 * RiderSimState / ScoreState and synthetic bus events.
 *
 *   /dev/hud.html                 auto-cycles through every scene
 *   /dev/hud.html?scene=rail      start on (and stay in) one scene
 *   &bg=golden|night|bright       backdrop palette (legibility checks)   &lang=ru|en
 *   window.__hud.scene('air')     jump to a scene;  window.__hud.scenes = list;  .auto(true|false)
 *   scene 'free' is interactive: the on-screen controls / keyboard drive the fake rider.
 */
import { Vector3 } from 'three';
import { GAME } from '../config';
import { EventBus } from '../core/events';
import { createRiderSimState } from '../core/riderState';
import { phuketOldTown } from '../data/spots/phuket_oldtown';
import { i18n } from '../i18n/i18n';
import { createInput } from '../input/Input';
import type { BoardKind, ButtonId, HudView, LandingQuality, ObjectivesState, ResolvedTrick, RunConfig, ScoreState } from '../types';
import { createHud } from '../ui/hud/Hud';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;
const g = canvas.getContext('2d') as CanvasRenderingContext2D;

const bus = new EventBus();
const input = createInput();
const hud = createHud({ bus, input, i18n });
input.attach(canvas);
hud.mount(hudRoot);

let state = createRiderSimState('wakeboard');
const score: ScoreState = {
  total: 0,
  comboPoints: 0,
  comboMult: 1,
  comboTimeLeft: 0,
  comboActive: false,
  comboCount: 0,
  bestCombo: 0,
  bestTrick: null,
  tricksLanded: 0,
  falls: 0,
  hero: { meter: 0, ready: false, active: false, timeLeft: 0 },
};
const objectives: ObjectivesState = { letters: [false, false, false, false, false, false], goals: [], chain: [], inFilmerZone: null };
const view: HudView = { state, score, objectives, timeScale: 1, countdown: null };
const P0 = { x: 0, y: 0, z: 0 };

// ───────────────────────────────────────────────────────── scene script ──

interface Cue {
  at: number;
  fn: () => void;
}
interface Scene {
  dur: number;
  start(): void;
  tick?(t: number, dt: number): void;
}

let cues: Cue[] = [];
let sceneName = 'riding';
let sceneT = 0;
let auto = !params.has('scene');
const after = (at: number, fn: () => void): void => void cues.push({ at, fn });

function trick(name: [string, string], points: number, tier: number, id = name[1].toLowerCase()): ResolvedTrick {
  return { id, ids: [id], name: { ru: name[0], en: name[1] }, points, parts: [], tier };
}

function land(tr: ResolvedTrick, landing: LandingQuality, stale = 1): void {
  const awarded = Math.round(tr.points * stale * (landing === 'sketchy' ? 0.5 : landing === 'perfect' ? 1.2 : 1));
  score.comboActive = true;
  score.comboPoints += awarded;
  score.comboMult = Math.min(12, score.comboMult + 1);
  score.comboCount++;
  score.comboTimeLeft = GAME.comboWindow;
  bus.emit('sim:land', { quality: landing, impact: 4, pos: P0, surface: 'water', onto: 'water', hadTrick: true });
  bus.emit('score:trick', { trick: tr, awarded, landing, stale, comboPoints: score.comboPoints, comboMult: score.comboMult, time: state.time });
}

/** Fresh run in a neutral "riding" state. */
function base(board: BoardKind = 'wakeboard', total = 2450): void {
  state = createRiderSimState(board);
  view.state = state;
  state.mode = 'water';
  state.speed = 9.4;
  state.progress = 0.34;
  state.rope.taut = true;
  state.rope.tension = 0.55;
  Object.assign(score, { total, comboPoints: 0, comboMult: 1, comboTimeLeft: 0, comboActive: false, comboCount: 0 });
  Object.assign(score.hero, { meter: 0.42, ready: false, active: false, timeLeft: 0 });
  objectives.letters = [true, true, false, false, false, false];
  view.countdown = null;
  input.setVirtual(null);
  const cfg: RunConfig = { spotId: phuketOldTown.id, winchId: 'main', power: 'medium', board, mode: 'career' };
  hud.hide();
  hud.show(cfg, phuketOldTown);
}

function combo(points: number, mult: number): void {
  Object.assign(score, { comboActive: true, comboPoints: points, comboMult: mult, comboTimeLeft: GAME.comboWindow, comboCount: mult - 1 });
}

function takeoff(): void {
  state.mode = 'air';
  state.surface = 'air';
  bus.emit('sim:pop', { power: 0.8, pos: P0, surface: 'water' });
  bus.emit('sim:takeoff', { kind: 'kicker', pos: P0, speed: state.speed, obstacleId: 'kicker_main' });
}

const coachText = (): string =>
  i18n.lang === 'ru' ? 'Зажми ПРЫЖОК, чтобы загрузить канат. Отпусти — и ты в воздухе.' : 'Hold JUMP to load the rope. Let go and you are airborne.';

const scenes: Record<string, Scene> = {
  countdown: {
    dur: 4.6,
    start() {
      base('wakeboard', 0);
      state.mode = 'waiting';
      state.speed = 0;
      state.progress = 0;
      state.rope.taut = false;
      state.rope.slack = 0.6;
      objectives.letters = [false, false, false, false, false, false];
      for (let n = 3; n >= 1; n--) {
        after(3 - n, () => {
          view.countdown = n;
          bus.emit('run:countdown', { n });
        });
      }
      after(3, () => scenes.go.start());
    },
  },
  go: {
    dur: 1.6,
    start() {
      if (sceneName === 'go') base('wakeboard', 0);
      view.countdown = null;
      state.mode = 'water';
      state.rope.taut = true;
      bus.emit('run:go', { config: { spotId: phuketOldTown.id, winchId: 'main', power: 'medium', board: 'wakeboard', mode: 'career' } });
    },
    tick(t) {
      state.speed = Math.min(9.4, t * 6);
    },
  },
  riding: {
    dur: 3,
    start: () => base(),
    tick(t) {
      state.lean = Math.sin(t * 1.3) * 0.7;
      state.speed = 9.4 + Math.sin(t * 0.9) * 1.2;
      state.rope.tension = 0.55 + state.lean * 0.3;
      state.progress = 0.34 + t * 0.01;
    },
  },
  charging: {
    dur: 3.2,
    start() {
      base();
      input.setVirtual({ jump: true });
    },
    tick(t) {
      state.crouch = Math.min(1, t / 1.9);
      state.rope.tension = 0.6 + state.crouch * 0.4;
    },
  },
  air: {
    dur: 3.4,
    start() {
      base();
      combo(450, 2);
      takeoff();
      after(0.15, () => {
        state.slowMo = 1;
        state.air.invert = 'backroll';
        bus.emit('trick:invert', { id: 'backroll', count: 1 });
      });
      after(0.45, () => bus.emit('trick:spin', { deg: 180 }));
      after(0.62, () => bus.emit('trick:spin', { deg: 360 }));
      after(0.9, () => {
        input.setVirtual({ grab: true });
        state.air.grab = 'indy';
        bus.emit('trick:grab', { id: 'indy' });
      });
    },
    tick(t) {
      state.air.height = 1.2 + Math.sin(Math.min(t, 2.6) * 0.6) * 1.4;
      state.air.roll = t * 1.6;
    },
  },
  land: {
    dur: 3.4,
    start() {
      base();
      combo(450, 2);
      land(trick(['FS 180', 'FS 180'], 200, 2), 'clean');
      after(0.4, () => land(trick(['Мобе 360 + инди', 'Mobe 360 + Indy'], 1650, 4), 'perfect'));
    },
    tick(t, dt) {
      if (t > 0.4) score.comboTimeLeft = Math.max(0.5, score.comboTimeLeft - dt * 0.8);
    },
  },
  rail: {
    dur: 3.6,
    start() {
      base();
      combo(1250, 4);
      state.mode = 'rail';
      state.surface = 'rail';
      state.rail = { obstacleId: 'rail_red', kind: 'rail', stance: 'fifty', balance: 0, time: 0, tangent: new Vector3(0, 0, 1) };
      bus.emit('sim:railEnter', { obstacleId: 'rail_red', kind: 'rail', pos: P0, material: 'metal' });
      after(0.7, () => {
        if (state.rail) state.rail.stance = 'boardslide';
        bus.emit('sim:railStance', { stance: 'boardslide' });
      });
    },
    tick(t) {
      if (state.rail) state.rail.balance = 0.6 * Math.sin(t * 1.5) + 0.22 * Math.sin(t * 6.1);
    },
  },
  bank: {
    dur: 3.2,
    start() {
      base();
      combo(3100, 4);
      score.comboTimeLeft = 0.5;
      after(0.5, () => {
        score.comboActive = false;
        score.total += 12400;
        bus.emit('score:bank', { points: 3100, mult: 4, banked: 12400, total: score.total, count: 5 });
      });
    },
    tick(_t, dt) {
      if (score.comboActive) score.comboTimeLeft = Math.max(0, score.comboTimeLeft - dt);
    },
  },
  bail: {
    dur: 3.4,
    start() {
      base();
      combo(2400, 3);
      after(0.3, () => {
        state.mode = 'bail';
        state.bail = { reason: 'underRotated', time: 0, surface: 'water', intensity: 0.8, boardLost: false, respawnIn: 2 };
        state.rope.taut = false;
        state.rope.slack = 2.4;
        score.comboActive = false;
        bus.emit('sim:bail', { reason: 'underRotated', pos: P0, surface: 'water', intensity: 0.8, boardLost: false });
        bus.emit('score:lost', { points: 2400, mult: 3 });
      });
    },
    tick(t) {
      if (t > 0.3) state.speed = Math.max(0, state.speed - 0.2);
    },
  },
  heroReady: {
    dur: 3,
    start() {
      base('wakeboard', 18650);
      Object.assign(score.hero, { meter: 1, ready: true });
      bus.emit('hero:ready', {});
    },
    tick: (t) => void (state.lean = Math.sin(t * 1.3) * 0.5),
  },
  heroActive: {
    dur: 4.4,
    start() {
      base('wakeboard', 18650);
      combo(2200, 5);
      Object.assign(score.hero, { meter: 1, ready: false, active: true, timeLeft: GAME.heroDuration });
      state.hero = true;
      bus.emit('hero:start', { duration: GAME.heroDuration });
    },
    tick(t) {
      score.hero.timeLeft = Math.max(0, GAME.heroDuration - t * 0.9);
      state.lean = Math.sin(t * 1.3) * 0.5;
    },
  },
  letters: {
    dur: 4.4,
    start() {
      base();
      objectives.letters = [false, false, false, false, false, false];
      for (let i = 0; i < 6; i++) {
        after(0.3 + i * 0.5, () => {
          objectives.letters[i] = true;
          bus.emit('letter:collect', { index: i, pos: P0, count: i + 1 });
        });
      }
    },
    tick: (t) => void (state.progress = 0.2 + t * 0.14),
  },
  toasts: {
    dur: 4.4,
    start() {
      base();
      after(0.2, () => bus.emit('sim:gap', { id: 'gap_oldtown', name: { ru: 'Гэп Олд-Тауна', en: 'Old Town Gap' }, points: 500 }));
      after(0.9, () => bus.emit('goal:complete', { index: 0, first: true }));
      after(1.6, () => bus.emit('clip:captured', { zone: 'gap_cam', trick: trick(['Тантрум', 'Tantrum'], 900, 3) }));
      after(3, () => bus.emit('line:progress', { chain: ['kicker_main', 'rail_red'], total: 3 }));
    },
  },
  wakeskate: {
    dur: 4,
    start() {
      base('wakeskate', 6120);
      after(0.2, () => {
        takeoff();
        state.slowMo = 1;
        Object.assign(state.air.flip, { id: 'kickflip', caught: false, progress: 0, catchWindow: 0 });
        bus.emit('trick:flip', { id: 'kickflip' });
      });
      after(2.5, () => {
        input.setVirtual({ grab: true });
        Object.assign(state.air.flip, { caught: true, catchWindow: 0 });
        bus.emit('trick:catch', { quality: 0.92, ok: true });
      });
      after(2.7, () => {
        input.setVirtual(null);
        state.mode = 'water';
        state.slowMo = 0;
        land(trick(['Кикфлип', 'Kickflip'], 600, 3), 'clean');
      });
    },
    tick(t) {
      if (state.mode !== 'air') return;
      state.air.height = 0.9;
      const f = state.air.flip;
      if (!f.caught) {
        f.progress = Math.min(1, (t - 0.2) / 1.5);
        f.catchWindow = Math.max(0, Math.min(1, (t - 0.45) / 1.15));
      }
    },
  },
  keyboard: {
    dur: 3,
    start() {
      base();
      // a real key event flips the HUD into keyboard mode (touchMode = last used device)
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
      after(0.5, () => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' })));
    },
    tick: (t) => void (state.lean = Math.sin(t * 1.3) * 0.6),
  },
  coach: {
    dur: 3.4,
    start() {
      base('wakeboard', 0);
      hud.setHint(coachText(), ['jump'] satisfies ButtonId[]);
    },
  },
  tiers: {
    dur: 4.2,
    start() {
      base();
      after(0.1, () => land(trick(['Сёрфейс 180', 'Surface 180'], 100, 1), 'clean'));
      after(0.7, () => land(trick(['Бэкролл', 'Backroll'], 800, 3), 'sketchy', 0.7));
      after(1.3, () => land(trick(['Дабл бэкролл 720', 'Double Backroll 720'], 4200, 5), 'perfect'));
    },
  },
  handle: {
    dur: 3,
    start() {
      base();
      state.switch = true;
      state.rope.holding = false;
      state.rope.taut = false;
      state.rope.slack = 3;
      bus.emit('sim:handle', { holding: false });
    },
    tick: (t) => void (state.speed = Math.max(3, 9.4 - t * 1.6)),
  },
  free: {
    dur: 1e9,
    start: () => base(),
    tick(_t, dt) {
      const f = lastFrame;
      state.lean += (f.steer - state.lean) * Math.min(1, dt * 8);
      state.crouch = f.jump.down ? Math.min(1, state.crouch + dt / 0.7) : Math.max(0, state.crouch - dt * 6);
      if (f.jump.released) bus.emit('sim:pop', { power: state.crouch, pos: P0, surface: 'water' });
      if (f.handlePressed) state.rope.holding = !state.rope.holding;
      if (f.heroPressed && score.hero.ready) scenes.heroActive.start();
      if (f.trick.pressed) land(trick(['Шифти', 'Shifty'], 150, 1), 'clean');
      if (f.grab.pressed) score.hero.meter = Math.min(1, score.hero.meter + 0.2);
      if (score.hero.meter >= 1 && !score.hero.ready && !score.hero.active) {
        score.hero.ready = true;
        bus.emit('hero:ready', {});
      }
      if (score.comboActive) {
        score.comboTimeLeft -= dt;
        if (score.comboTimeLeft <= 0) {
          const banked = score.comboPoints * score.comboMult;
          score.total += banked;
          bus.emit('score:bank', { points: score.comboPoints, mult: score.comboMult, banked, total: score.total, count: score.comboCount });
          combo(0, 1);
          score.comboActive = false;
        }
      }
    },
  },
};
const ORDER = ['countdown', 'riding', 'charging', 'air', 'land', 'rail', 'bank', 'bail', 'heroReady', 'heroActive', 'letters', 'toasts', 'tiers', 'wakeskate', 'handle', 'coach', 'keyboard'];

function setScene(name: string): string {
  if (!scenes[name]) return `unknown scene "${name}" — try: ${Object.keys(scenes).join(', ')}`;
  cues = [];
  sceneT = 0;
  sceneName = name;
  hud.setHint(null);
  scenes[name].start();
  return name;
}

// ─────────────────────────────────────────────────────── fake backdrop ──

const PALETTES = {
  golden: { sky: ['#7fb0d8', '#f3c98f'], water: ['#3f9c95', '#0f4a55'], quay: '#b9a58c', houses: ['#e8c9a0', '#d98f6c', '#f1e3c4', '#8fb8b0', '#e6a9a0'] },
  night: { sky: ['#070a18', '#1c1740'], water: ['#16304a', '#050b16'], quay: '#22252e', houses: ['#191b29', '#231a33', '#141c2c', '#2a1626', '#101826'] },
  bright: { sky: ['#cfe6f7', '#ffffff'], water: ['#9fe0dc', '#58b9c4'], quay: '#ece6da', houses: ['#ffffff', '#f6efe2', '#e9f2f4', '#fbe9df', '#f2f2f2'] },
} as const;
const palette = PALETTES[(params.get('bg') as keyof typeof PALETTES) ?? 'golden'] ?? PALETTES.golden;
let worldT = 0;

function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawBackdrop(): void {
  const w = innerWidth;
  const h = innerHeight;
  const hz = h * 0.36;
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, palette.sky[0]);
  sky.addColorStop(1, palette.sky[1]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, hz);
  // shophouse row on the horizon
  const n = Math.ceil(w / 46);
  for (let i = 0; i < n; i++) {
    const bh = h * (0.07 + ((i * 37) % 11) * 0.011);
    g.fillStyle = palette.houses[i % palette.houses.length];
    g.fillRect(i * 46, hz - bh, 44, bh);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(i * 46 + 8, hz - bh + 10, 10, 14);
    g.fillRect(i * 46 + 26, hz - bh + 10, 10, 14);
    if (palette === PALETTES.night && i % 3 === 0) {
      g.fillStyle = i % 2 ? '#ff2d6f' : '#31e0ff';
      g.fillRect(i * 46 + 6, hz - bh * 0.45, 32, 4);
    }
  }
  // quays + canal in one-point perspective
  g.fillStyle = palette.quay;
  g.fillRect(0, hz, w, h - hz);
  const water = g.createLinearGradient(0, hz, 0, h);
  water.addColorStop(0, palette.water[0]);
  water.addColorStop(1, palette.water[1]);
  g.fillStyle = water;
  g.beginPath();
  g.moveTo(w * 0.42, hz);
  g.lineTo(w * 0.58, hz);
  g.lineTo(w * 1.25, h);
  g.lineTo(-w * 0.25, h);
  g.fill();
  // streaks rushing towards the camera
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const p = (i / 26 + worldT * 0.42) % 1;
    const y = hz + (h - hz) * p * p;
    const half = (w * 0.08 + w * 0.67 * p * p) * 0.9;
    const x = w / 2 + (((i * 53) % 17) / 8.5 - 1) * half;
    g.beginPath();
    g.moveTo(x - 6 - 30 * p, y);
    g.lineTo(x + 6 + 30 * p, y);
    g.stroke();
  }
  // rider + rope
  const air = state.mode === 'air' ? state.air.height : 0;
  const rx = w / 2 + state.lean * w * 0.1;
  const ry = h * 0.62 - air * h * 0.07 + (state.mode === 'bail' ? 14 : 0);
  if (state.rope.holding) {
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(rx, ry - 38);
    g.quadraticCurveTo((rx + w / 2) / 2, (ry + hz) / 2 + state.rope.slack * 14, w / 2, hz + 4);
    g.stroke();
  }
  g.save();
  g.translate(rx, ry);
  g.rotate(state.lean * 0.35 + (state.mode === 'air' ? state.air.roll : 0) + (state.mode === 'bail' ? 1.2 : 0));
  g.fillStyle = 'rgba(0,0,0,0.25)';
  if (air === 0) g.fillRect(-34, 8, 68, 5);
  g.fillStyle = '#f2f2f2';
  g.fillRect(-30, 0, 60, 8);
  g.fillStyle = '#e30613';
  g.fillRect(-9, -40 + state.crouch * 12, 18, 26);
  g.fillStyle = '#1c1d21';
  g.fillRect(-10, -15 + state.crouch * 8, 20, 16 - state.crouch * 8);
  g.beginPath();
  g.arc(0, -48 + state.crouch * 12, 8, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// ──────────────────────────────────────────────────────────────── loop ──

let lastFrame = input.poll();
let last = performance.now();

function frame(now: number): void {
  const realDt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  lastFrame = input.poll();
  if (lastFrame.pausePressed) auto = !auto;

  sceneT += realDt;
  for (const cue of cues) {
    if (cue.at <= sceneT) cue.fn();
  }
  cues = cues.filter((c) => c.at > sceneT);
  scenes[sceneName].tick?.(sceneT, realDt);
  if (auto && sceneT >= scenes[sceneName].dur) setScene(ORDER[(ORDER.indexOf(sceneName) + 1) % ORDER.length]);

  const target = state.hero ? (state.slowMo > 0 ? GAME.heroTrickScale : GAME.heroBaseScale) : state.slowMo > 0 ? GAME.slowMoScale : 1;
  view.timeScale += (target - view.timeScale) * Math.min(1, realDt * 7);
  worldT += realDt * view.timeScale * (state.speed / 9.4);
  state.time += realDt * view.timeScale;

  drawBackdrop();
  hud.update(view, realDt);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
setScene(params.get('scene') ?? ORDER[0]);
requestAnimationFrame(frame);

Object.assign(window, {
  __hud: {
    scene: setScene,
    scenes: Object.keys(scenes),
    auto: (on: boolean) => void (auto = on),
    hud,
    input,
    bus,
    view,
    get t() {
      return sceneT;
    },
  },
});
