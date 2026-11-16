/**
 * Audio sandbox (dev only): every one-shot, the game events that trigger them, every continuous
 * layer on sliders, every music track, live meters, and the offline level check.
 * Test hooks: window.__audio (see the bottom of this file).
 */
import { audioDebug, createAudio } from '../audio/Audio';
import type { LayerName } from '../audio/layers';
import {
  ALL_SFX,
  LAYER_SCENES,
  calibrateSfx,
  checkAll,
  checkLayers,
  checkMix,
  checkSfx,
  checkTracks,
  renderBusyMix,
  renderLayer,
  renderSfx,
  renderTrack,
  type CheckRow,
} from '../audio/levelCheck';
import type { OfflineResult } from '../audio/offline';
import { INTERNAL_SFX, SFX_IDS, type SfxName } from '../audio/sfx';
import { gainToDb } from '../audio/theory';
import { TRACKS } from '../audio/tracks';
import { EventBus } from '../core/events';
import { createRiderSimState } from '../core/riderState';
import type { ResolvedTrick, RiderMode, SfxId, SurfaceKind } from '../types';

type Kid = Node | string;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}
function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, label);
  b.addEventListener('click', onClick);
  return b;
}
function card(title: string, ...kids: Kid[]): { root: HTMLElement; info: HTMLSpanElement } {
  const info = el('span');
  const root = el('section', 'card', el('h2', '', title, info), ...kids);
  return { root, info };
}

const bus = new EventBus();
const audio = createAudio(bus);
const dbg = audioDebug(audio);
if (!dbg) throw new Error('audio debug handle missing');

const sim = createRiderSimState();
sim.mode = 'water';
sim.surface = 'water';
sim.speed = 9;
sim.distToWinch = 60;
sim.rope.taut = true;
sim.rope.tension = 0.5;
sim.rope.reelSpeed = 9.5;
const ctl = { run: false, paused: false, timeScale: 1, surface: 'concrete' as SurfaceKind, material: 'metal' as 'metal' | 'stone' | 'wood' | 'plastic' };
const P0 = { x: 0, y: 0, z: 0 };
let unlockEvents = 0;
bus.on('audio:unlocked', () => unlockEvents++);

const app = document.getElementById('app') as HTMLDivElement;

// ───────────────────────────────────────────────────────────── status ──

const dot = el('i', 'dot');
const stateText = el('span', '', 'locked');
const unlockBtn = button('UNLOCK AUDIO', () => audio.unlock(), 'primary');
const meterFill = el('i');
const meterPeak = el('b');
const meterText = el('span', '', '— dB');
const spectrum = el('canvas');
spectrum.width = 640;
spectrum.height = 110;
const status = card('Output', el('div', 'actions', unlockBtn, el('span', 'pill', dot, stateText)), spectrum, el('div', 'meter', meterFill, meterPeak));
app.append(el('header', '', el('div', '', el('div', 'mark', 'WHY ', el('b', '', 'NOT')), el('div', 'sub', 'audio sandbox · 100 % procedural'))), status.root);
status.info.append(meterText);

let analyser: AnalyserNode | null = null;
let timeBuf = new Float32Array(2048);
let freqBuf = new Uint8Array(1024);
function ensureAnalyser(): AnalyserNode | null {
  if (analyser || !dbg || !dbg.core || !dbg.context) return analyser;
  analyser = dbg.context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;
  dbg.core.output.connect(analyser);
  timeBuf = new Float32Array(analyser.fftSize);
  freqBuf = new Uint8Array(analyser.frequencyBinCount);
  return analyser;
}
function level(): { rms: number; peak: number } {
  const a = ensureAnalyser();
  if (!a) return { rms: 0, peak: 0 };
  a.getFloatTimeDomainData(timeBuf);
  let s = 0;
  let p = 0;
  for (let i = 0; i < timeBuf.length; i++) {
    const v = timeBuf[i];
    s += v * v;
    if (Math.abs(v) > p) p = Math.abs(v);
  }
  return { rms: Math.sqrt(s / timeBuf.length), peak: p };
}

// ─────────────────────────────────────────────────────────── one-shots ──

const shots = card('One-shots · play(id)');
const shotGrid = el('div', 'grid');
for (const id of SFX_IDS) shotGrid.append(button(id, () => audio.play(id)));
const innerGrid = el('div', 'grid');
for (const id of INTERNAL_SFX) innerGrid.append(button(id, () => dbg.playAny(id), 'ghost'));
shots.root.append(shotGrid, el('div', 'sub', 'internal (bus only)'), innerGrid);
(innerGrid.previousElementSibling as HTMLElement).style.margin = '10px 0 6px';
app.append(shots.root);

// ───────────────────────────────────────────────────────── game events ──

function trick(tier: number): ResolvedTrick {
  return { id: `dev${tier}`, ids: [`dev${tier}`], name: { ru: 'Трюк', en: 'Trick' }, points: tier * 400, parts: [], tier };
}
let letterCount = 0;
const EVENTS: Record<string, () => void> = {
  '3 · 2 · 1 · GO': () => {
    [3, 2, 1].forEach((n, i) => setTimeout(() => bus.emit('run:countdown', { n }), i * 700));
    setTimeout(() => {
      letterCount = 0;
      bus.emit('run:go', { config: { spotId: 'dev', winchId: 'a', power: 'medium', board: 'wakeboard', mode: 'free' } });
    }, 2100);
  },
  'pop · soft': () => bus.emit('sim:pop', { power: 0.2, pos: P0, surface: 'water' }),
  'pop · full': () => bus.emit('sim:pop', { power: 1, pos: P0, surface: 'water' }),
  'pop · concrete': () => bus.emit('sim:pop', { power: 0.8, pos: P0, surface: 'concrete' }),
  'land water 3': () => bus.emit('sim:land', { quality: 'clean', impact: 3, pos: P0, surface: 'water', onto: 'water', hadTrick: false }),
  'land water 9': () => bus.emit('sim:land', { quality: 'clean', impact: 9, pos: P0, surface: 'water', onto: 'water', hadTrick: true }),
  'land concrete': () => bus.emit('sim:land', { quality: 'sketchy', impact: 6, pos: P0, surface: 'concrete', onto: 'solid', hadTrick: true }),
  'bail water': () => bus.emit('sim:bail', { reason: 'underRotated', pos: P0, surface: 'water', intensity: 0.8, boardLost: false }),
  'bail concrete': () => bus.emit('sim:bail', { reason: 'hardLanding', pos: P0, surface: 'concrete', intensity: 1, boardLost: false }),
  'rope jerk': () => bus.emit('sim:ropeJerk', { jerk: 6 }),
  'handle off': () => bus.emit('sim:handle', { holding: false }),
  'handle on': () => bus.emit('sim:handle', { holding: true }),
  'surface 180': () => bus.emit('sim:surfaceSpin', { dir: 1 }),
  'spin 540': () => bus.emit('trick:spin', { deg: 540 }),
  backroll: () => bus.emit('trick:invert', { id: 'backroll', count: 1 }),
  grab: () => bus.emit('trick:grab', { id: 'indy' }),
  kickflip: () => bus.emit('trick:flip', { id: 'kickflip' }),
  'catch ok': () => bus.emit('trick:catch', { quality: 0.9, ok: true }),
  'catch miss': () => bus.emit('trick:catch', { quality: 0, ok: false }),
  'trick tier 3': () => bus.emit('score:trick', { trick: trick(3), awarded: 900, landing: 'clean', stale: 1, comboPoints: 900, comboMult: 2, time: 1 }),
  'trick tier 4': () => bus.emit('score:trick', { trick: trick(4), awarded: 1800, landing: 'clean', stale: 1, comboPoints: 1800, comboMult: 3, time: 1 }),
  'trick tier 5': () => bus.emit('score:trick', { trick: trick(5), awarded: 4000, landing: 'perfect', stale: 1, comboPoints: 4000, comboMult: 5, time: 1 }),
  'bank 300': () => bus.emit('score:bank', { points: 150, mult: 2, banked: 300, total: 300, count: 2 }),
  'bank 25 000': () => bus.emit('score:bank', { points: 5000, mult: 5, banked: 25000, total: 25000, count: 5 }),
  'combo lost': () => bus.emit('score:lost', { points: 800, mult: 3 }),
  'next letter': () => {
    letterCount = (letterCount % 6) + 1;
    bus.emit('letter:collect', { index: letterCount - 1, pos: P0, count: letterCount });
  },
  gap: () => bus.emit('sim:gap', { id: 'g', name: { ru: 'Гэп', en: 'Gap' }, points: 500 }),
  'goal done': () => bus.emit('goal:complete', { index: 0, first: true }),
  'clip captured': () => bus.emit('clip:captured', { zone: 'z', trick: trick(4) }),
  'hero ready': () => bus.emit('hero:ready', {}),
  'hero start': () => {
    sim.hero = true;
    syncToggles();
    bus.emit('hero:start', { duration: 8 });
  },
  'hero end': () => {
    sim.hero = false;
    syncToggles();
    bus.emit('hero:end', {});
  },
  finish: () => bus.emit('sim:finish', { pos: P0 }),
};
const events = card('Game events · bus');
const eventGrid = el('div', 'grid');
for (const [name, fn] of Object.entries(EVENTS)) eventGrid.append(button(name, fn));
events.root.append(eventGrid);
app.append(events.root);

// ────────────────────────────────────────────────────────────── layers ──

const layers = card('Continuous layers · update(state)');
const runBtn = button('RIDE', () => {
  ctl.run = !ctl.run;
  syncToggles();
});
const pauseBtn = button('paused', () => {
  ctl.paused = !ctl.paused;
  bus.emit('run:paused', { paused: ctl.paused });
  syncToggles();
});
const heroBtn = button('hero', () => {
  sim.hero = !sim.hero;
  syncToggles();
});
function syncToggles(): void {
  runBtn.classList.toggle('on', ctl.run);
  runBtn.classList.toggle('primary', ctl.run);
  pauseBtn.classList.toggle('on', ctl.paused);
  heroBtn.classList.toggle('on', sim.hero);
}

function select<T extends string>(options: readonly T[], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const s = el('select');
  for (const o of options) s.append(new Option(o, o, false, o === value));
  s.addEventListener('change', () => onChange(s.value as T));
  return s;
}
function setMode(mode: RiderMode): void {
  const was = sim.mode;
  sim.mode = mode;
  sim.surface = mode === 'water' || mode === 'waiting' || mode === 'finished' ? 'water' : mode === 'air' ? 'air' : mode === 'rail' ? 'rail' : mode === 'wall' ? 'wall' : ctl.surface;
  sim.bail = mode === 'bail' ? { reason: 'collision', time: 0, surface: 'water', intensity: 0.5, boardLost: false, respawnIn: 2 } : null;
  if (mode === 'rail' && was !== 'rail') bus.emit('sim:railEnter', { obstacleId: 'dev', kind: 'rail', pos: P0, material: ctl.material });
  if (was === 'rail' && mode !== 'rail') bus.emit('sim:railExit', { obstacleId: 'dev', pos: P0, popped: true });
}
const MODES: readonly RiderMode[] = ['water', 'air', 'rail', 'slide', 'wall', 'waiting', 'bail', 'finished'];
const SURFACES: readonly SurfaceKind[] = ['concrete', 'wetConcrete', 'stone', 'wood', 'metal', 'grass'];
const SOLO: readonly (LayerName | 'all')[] = ['all', 'water', 'carve', 'chatter', 'wind', 'engine', 'rope', 'scrape', 'hero'];
const modeSel = select(MODES, 'water', setMode);
const surfSel = select(SURFACES, ctl.surface, (v) => {
  ctl.surface = v;
  if (sim.mode === 'slide') sim.surface = v;
});
const matSel = select(['metal', 'stone', 'wood', 'plastic'] as const, ctl.material, (v) => {
  ctl.material = v;
  if (sim.mode === 'rail') {
    bus.emit('sim:railExit', { obstacleId: 'dev', pos: P0, popped: false });
    bus.emit('sim:railEnter', { obstacleId: 'dev', kind: 'rail', pos: P0, material: v });
  }
});
const soloSel = select(SOLO, 'all', (v) => {
  if (dbg.layers) dbg.layers.solo = v === 'all' ? null : v;
});

function slider(label: string, min: number, max: number, value: number, set: (v: number) => void, digits = 1): HTMLElement {
  const input = el('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String((max - min) / 200);
  input.value = String(value);
  const out = el('output', '', value.toFixed(digits));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = v.toFixed(digits);
    set(v);
  });
  const lab = el('label', '', label);
  return el('div', 'row', lab, input, out);
}
function picker(label: string, control: HTMLElement): HTMLElement {
  return el('div', 'row', el('label', '', label), control, el('output'));
}
layers.root.append(
  el('div', 'actions', runBtn, pauseBtn, heroBtn),
  el(
    'div',
    'cols',
    el('div', '', picker('mode', modeSel), picker('slide on', surfSel), picker('rail', matSel), picker('solo', soloSel)),
    el(
      'div',
      '',
      slider('speed m/s', 0, 18, sim.speed, (v) => (sim.speed = v)),
      slider('lean', -1, 1, 0, (v) => (sim.lean = v), 2),
      slider('rope tension', 0, 1, sim.rope.tension, (v) => (sim.rope.tension = v), 2),
      slider('reel m/s', 0, 12, sim.rope.reelSpeed, (v) => (sim.rope.reelSpeed = v)),
      slider('winch dist m', 0, 120, sim.distToWinch, (v) => (sim.distToWinch = v), 0),
      slider('air height m', 0, 5, 0, (v) => (sim.air.height = v)),
      slider('time scale', 0.2, 1, 1, (v) => (ctl.timeScale = v), 2),
    ),
  ),
);
app.append(layers.root);

// ─────────────────────────────────────────────────────────────── music ──

const music = card('Music · look-ahead beat engine');
const trackBtns = new Map<string, HTMLButtonElement>();
const trackGrid = el('div', 'grid');
for (const tr of audio.tracks) {
  const b = button(tr.name, () => audio.playMusic(tr.id));
  b.title = tr.id;
  trackBtns.set(tr.id, b);
  trackGrid.append(b);
}
let ducked = false;
const duckBtn = button('duck (pause menu)', () => {
  ducked = !ducked;
  audio.setDucked(ducked);
  duckBtn.classList.toggle('on', ducked);
});
const vol = { music: 0.6, sfx: 0.9 };
music.root.append(
  trackGrid,
  el('div', 'actions', button('auto · rotate', () => audio.playMusic('auto')), button('stop', () => audio.stopMusic()), duckBtn),
  slider('music vol', 0, 1, vol.music, (v) => audio.setVolumes((vol.music = v), vol.sfx), 2),
  slider('sfx vol', 0, 1, vol.sfx, (v) => audio.setVolumes(vol.music, (vol.sfx = v)), 2),
);
(trackGrid.nextElementSibling as HTMLElement).style.marginTop = '8px';
app.append(music.root);

// ───────────────────────────────────────────────────────── level check ──

const check = card('Level check · OfflineAudioContext');
const checkBody = el('tbody');
const checkTable = el('table', '', el('thead', '', el('tr', '', el('th', '', 'sound'), el('th', 'num', 'peak'), el('th', 'num', 'rms'), el('th', 'num', 'target'), el('th', '', ''))), checkBody);
const spectro = el('canvas');
spectro.width = 640;
spectro.height = 200;
const spectroLabel = el('div', 'sub', 'tap a row for its spectrogram (0 – 12 kHz, log)');
spectroLabel.style.margin = '8px 0 6px';
let checkRows: CheckRow[] = [];
let lastGroup = '';

function fmt(db: number): string {
  return db < -120 ? '−∞' : db.toFixed(1);
}
function addRow(r: CheckRow): void {
  checkRows.push(r);
  if (r.group !== lastGroup) {
    lastGroup = r.group;
    const g = el('tr', 'grp', el('td', '', r.group));
    (g.firstChild as HTMLTableCellElement).colSpan = 5;
    checkBody.append(g);
  }
  const tr = el(
    'tr',
    r.ok ? '' : 'bad',
    el('td', '', r.name),
    el('td', 'num', fmt(r.result.peakDb)),
    el('td', 'num', fmt(r.result.rmsDb)),
    el('td', 'num muted', r.target === null ? '' : `${r.metric} ${r.target}`),
    el('td', r.ok ? 'ok' : 'bad', r.ok ? '✓' : `✗ ${r.note}`),
  );
  tr.dataset.name = r.name;
  tr.addEventListener('click', () => void showSpectrogram(r));
  checkBody.append(tr);
  const bad = checkRows.filter((x) => !x.ok).length;
  check.info.textContent = `${checkRows.length} rendered · ${bad ? `${bad} off` : 'all good'}`;
  check.info.className = bad ? 'bad' : 'ok';
}
async function runCheck(fn: (on: (r: CheckRow) => void) => Promise<CheckRow[]>): Promise<CheckRow[]> {
  checkRows = [];
  lastGroup = '';
  checkBody.replaceChildren();
  check.info.textContent = 'rendering…';
  check.info.className = 'muted';
  return fn(addRow);
}
check.root.append(
  el(
    'div',
    'actions',
    button('RUN LEVEL CHECK', () => void runCheck(checkAll), 'primary'),
    button('one-shots', () => void runCheck(checkSfx)),
    button('layers', () => void runCheck(checkLayers)),
    button('tracks', () => void runCheck((on) => checkTracks(on))),
    button('mix', () => void runCheck(checkMix)),
  ),
  spectroLabel,
  spectro,
  checkTable,
);
(checkTable as HTMLElement).style.marginTop = '8px';
app.append(check.root);

// ───────────────────────────────────────────────────────── spectrogram ──

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Log-frequency spectrogram (60 Hz … 12 kHz, 80 dB range) + waveform strip. */
function drawSpectrogram(canvas: HTMLCanvasElement, data: Float32Array, sr: number): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  const waveH = 36;
  const specH = H - waveH;
  const N = 2048;
  const img = g.createImageData(W, specH);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const fLo = 60;
  const fHi = 12000;
  for (let x = 0; x < W; x++) {
    const centre = Math.floor((x / W) * data.length);
    for (let i = 0; i < N; i++) {
      const s = centre - N / 2 + i;
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = s >= 0 && s < data.length ? data[s] * w : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < specH; y++) {
      const f = fLo * Math.pow(fHi / fLo, 1 - y / specH);
      const bin = Math.min(N / 2 - 1, Math.round((f / sr) * N));
      const mag = Math.hypot(re[bin], im[bin]) / (N / 4);
      const v = Math.max(0, Math.min(1, (gainToDb(mag) + 80) / 80));
      const o = (y * W + x) * 4;
      // black → brand red → white
      img.data[o] = Math.min(255, v * 2.2 * 227);
      img.data[o + 1] = Math.max(0, (v - 0.55) * 2.2 * 255);
      img.data[o + 2] = Math.max(0, (v - 0.6) * 2.5 * 255) + v * 19;
      img.data[o + 3] = 255;
    }
  }
  g.fillStyle = '#0a0b0d';
  g.fillRect(0, 0, W, H);
  g.putImageData(img, 0, 0);
  g.fillStyle = '#e30613';
  const mid = specH + waveH / 2;
  for (let x = 0; x < W; x++) {
    const a = Math.floor((x / W) * data.length);
    const b = Math.floor(((x + 1) / W) * data.length);
    let p = 0;
    for (let i = a; i < b; i++) p = Math.max(p, Math.abs(data[i]));
    const h = Math.max(1, p * waveH);
    g.fillRect(x, mid - h / 2, 1, h);
  }
}

async function showSpectrogram(r: CheckRow): Promise<void> {
  spectroLabel.textContent = `${r.name} · rendering…`;
  let res: OfflineResult;
  if (r.group === 'sfx') res = await renderSfx(r.name as SfxName, 'bus', {}, true);
  else if (r.group === 'layer') res = await renderLayer(LAYER_SCENES.find((s) => s.name === r.name) ?? LAYER_SCENES[0], 4, true);
  else if (r.group === 'music') res = await renderTrack(r.name, 24, true, true);
  else res = await renderBusyMix(22, true);
  if (res.data) drawSpectrogram(spectro, res.data, res.sampleRate);
  spectroLabel.textContent = `${r.name} · ${res.seconds.toFixed(1)} s · peak ${fmt(res.peakDb)} dB · rms ${fmt(res.rmsDb)} dB`;
}

// ──────────────────────────────────────────────────────────────── loop ──

const sg = spectrum.getContext('2d');
let last = performance.now();
let peakHold = 0;
let frames = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frames++;
  audio.update(dt, { state: ctl.run ? sim : null, timeScale: ctl.timeScale, paused: ctl.paused });

  const running = audio.unlocked;
  dot.classList.toggle('run', running);
  const ctx = dbg ? dbg.context : null;
  stateText.textContent = dbg && dbg.failed ? 'no WebAudio — running silent' : ctx ? `${ctx.state} · ${ctx.sampleRate} Hz · ${dbg ? dbg.voices : 0} voices` : 'locked';
  unlockBtn.textContent = running ? 'AUDIO ON' : 'UNLOCK AUDIO';
  unlockBtn.classList.toggle('primary', !running);

  const lv = level();
  peakHold = Math.max(lv.peak, peakHold * 0.96);
  const pos = (db: number): number => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  meterFill.style.width = `${pos(gainToDb(lv.rms))}%`;
  meterPeak.style.left = `${pos(gainToDb(peakHold))}%`;
  meterText.textContent = running ? `rms ${fmt(gainToDb(lv.rms))} · peak ${fmt(gainToDb(peakHold))} dB` : '';

  if (sg && analyser) {
    analyser.getByteFrequencyData(freqBuf);
    const W = spectrum.width;
    const H = spectrum.height;
    sg.fillStyle = '#0a0b0d';
    sg.fillRect(0, 0, W, H);
    const bars = 96;
    const nyq = analyser.context.sampleRate / 2;
    for (let i = 0; i < bars; i++) {
      const f0 = 40 * Math.pow(16000 / 40, i / bars);
      const f1 = 40 * Math.pow(16000 / 40, (i + 1) / bars);
      const b0 = Math.floor((f0 / nyq) * freqBuf.length);
      const b1 = Math.max(b0 + 1, Math.floor((f1 / nyq) * freqBuf.length));
      let m = 0;
      for (let b = b0; b < b1 && b < freqBuf.length; b++) m = Math.max(m, freqBuf[b]);
      const h = (m / 255) * (H - 6);
      sg.fillStyle = m > 200 ? '#ffffff' : '#e30613';
      sg.fillRect((i / bars) * W + 1, H - h - 2, W / bars - 2, h + 1);
    }
  }

  const ms = dbg ? dbg.music : null;
  music.info.textContent = ms && ms.track ? `${ms.track} · ${ms.section} · bar ${ms.bar + 1} · ${ms.scheduled} notes` : 'stopped';
  for (const [id, b] of trackBtns) b.classList.toggle('on', !!ms && ms.track === id);
  requestAnimationFrame(frame);
}
syncToggles();
requestAnimationFrame(frame);

// ────────────────────────────────────────────────────────── test hooks ──

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const hooks = {
  audio,
  bus,
  debug: dbg,
  sim,
  ctl,
  get unlockEvents(): number {
    return unlockEvents;
  },
  get frames(): number {
    return frames;
  },
  /** unlock() and wait until the context really runs. */
  async unlock(): Promise<string> {
    audio.unlock();
    for (let i = 0; i < 100 && !audio.unlocked; i++) await sleep(20);
    ensureAnalyser();
    return dbg.context ? dbg.context.state : 'none';
  },
  /** Live RMS / peak (dBFS) of the final output over `ms`. */
  async measure(ms = 500): Promise<{ rmsDb: number; peakDb: number }> {
    let sum = 0;
    let n = 0;
    let peak = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      const lv = level();
      sum += lv.rms * lv.rms;
      n++;
      peak = Math.max(peak, lv.peak);
      await sleep(15);
    }
    return { rmsDb: Math.round(gainToDb(Math.sqrt(sum / Math.max(1, n))) * 10) / 10, peakDb: Math.round(gainToDb(peak) * 10) / 10 };
  },
  /** Every sound once through the public API (internal ones through the debug handle). */
  async playAll(gap = 90): Promise<{ played: number; errors: string[]; maxVoices: number; peakDb: number }> {
    const errors: string[] = [];
    let maxVoices = 0;
    let peak = 0;
    for (const id of ALL_SFX) {
      try {
        if ((SFX_IDS as readonly string[]).includes(id)) audio.play(id as SfxId, { volume: 1, pitch: 1, pan: 0 });
        else dbg.playAny(id);
      } catch (err) {
        errors.push(`${id}: ${String(err)}`);
      }
      const until = performance.now() + gap;
      while (performance.now() < until) {
        maxVoices = Math.max(maxVoices, dbg.voices);
        peak = Math.max(peak, level().peak);
        await sleep(10);
      }
    }
    return { played: ALL_SFX.length, errors, maxVoices, peakDb: Math.round(gainToDb(peak) * 10) / 10 };
  },
  /** Fire every sandbox game event. */
  async fireEvents(gap = 60): Promise<string[]> {
    const errors: string[] = [];
    for (const [name, fn] of Object.entries(EVENTS)) {
      try {
        fn();
      } catch (err) {
        errors.push(`${name}: ${String(err)}`);
      }
      await sleep(gap);
    }
    return errors;
  },
  offline: {
    calibrateSfx,
    sfx: renderSfx,
    layer: (name: string) => renderLayer(LAYER_SCENES.find((s) => s.name === name) ?? LAYER_SCENES[0]),
    track: renderTrack,
    mix: renderBusyMix,
    /** Run a group through the table UI and return compact rows. */
    async check(group: 'all' | 'sfx' | 'layers' | 'tracks' | 'mix' = 'all'): Promise<{ name: string; peak: number; rms: number; target: number | null; ok: boolean; note: string }[]> {
      const fn = group === 'sfx' ? checkSfx : group === 'layers' ? checkLayers : group === 'tracks' ? (on: (r: CheckRow) => void) => checkTracks(on) : group === 'mix' ? checkMix : checkAll;
      const rows = await runCheck(fn);
      return rows.map((r) => ({ name: r.name, peak: Math.round(r.result.peakDb * 10) / 10, rms: Math.round(r.result.rmsDb * 10) / 10, target: r.target, ok: r.ok, note: r.note }));
    },
    spectrogram: (name: string) => {
      const r = checkRows.find((x) => x.name === name);
      return r ? showSpectrogram(r) : Promise.resolve();
    },
  },
};
(window as unknown as { __audio: typeof hooks }).__audio = hooks;
