/**
 * Level check (dev tool, not shipped in the game bundle): renders one-shots, layers, tracks and a
 * worst-case busy mix through the real graph with OfflineAudioContext and compares the numbers with
 * the targets documented in Audio.ts. Driven from dev/audio.html (`window.__audio.offline.*`).
 */
import { createRiderSimState } from '../core/riderState';
import type { RiderSimState } from '../types';
import type { LayerName } from './layers';
import { renderOffline, type OfflineResult, type OfflineRig } from './offline';
import { barSeconds } from './patterns';
import { INTERNAL_SFX, SFX_IDS, Sfx, type SfxName, type SfxOpts } from './sfx';
import { TRACKS, findTrack } from './tracks';

export interface CheckRow {
  group: 'sfx' | 'layer' | 'music' | 'mix';
  name: string;
  /** What `value` is: a peak or RMS level in dBFS, or K-weighted loudness in LUFS. */
  metric: 'peak' | 'rms' | 'lufs';
  value: number;
  target: number | null;
  /** Allowed deviation from the target (dB). */
  tol: number;
  ok: boolean;
  note: string;
  result: OfflineResult;
}

/** Render length per one-shot (seconds); default 2.5. */
const SFX_SECONDS: Partial<Record<SfxName, number>> = {
  'crowd.cheer': 5.5,
  'crowd.ooh': 3.5,
  'hero.start': 4.5,
  'splash.big': 4,
  'bail.water': 4.5,
  goal: 3,
  'ui.unlock': 3.5,
  twang: 3.5,
};

export const ALL_SFX: readonly SfxName[] = [...SFX_IDS, ...INTERNAL_SFX];

export type SfxMode = 'calibrate' | 'bus' | 'master';

/** One sound at amount = 1. 'calibrate' = raw recipe level, 'bus' = calibrated, 'master' = final output. */
export function renderSfx(id: SfxName, mode: SfxMode = 'bus', opts: SfxOpts = {}, keep = false): Promise<OfflineResult> {
  return renderOffline(
    SFX_SECONDS[id] ?? 2.5,
    (rig) => {
      rig.sfx.calibrating = mode === 'calibrate';
      rig.sfx.play(id, { amount: 1, ...opts, at: 0.05 });
    },
    { raw: mode !== 'master', keep },
  );
}

export interface LayerScene {
  name: string;
  solo: LayerName;
  /** Target RMS (dBFS at the sfx bus). */
  target: number;
  setup: (s: RiderSimState, rig: OfflineRig) => void;
}

function riding(s: RiderSimState, speed: number): void {
  s.mode = 'water';
  s.surface = 'water';
  s.speed = speed;
  s.distToWinch = 60;
  s.rope.taut = true;
  s.rope.holding = true;
  s.rope.tension = 0.5;
  s.rope.reelSpeed = 9.5;
}

export const LAYER_SCENES: readonly LayerScene[] = [
  { name: 'water rush · top speed', solo: 'water', target: -23, setup: (s) => riding(s, 14) },
  {
    name: 'carve spray · full lean',
    solo: 'carve',
    target: -25,
    setup: (s) => {
      riding(s, 14);
      s.lean = 1;
    },
  },
  { name: 'board chatter', solo: 'chatter', target: -30, setup: (s) => riding(s, 14) },
  {
    name: 'wind · 3.5 m up',
    solo: 'wind',
    target: -26,
    setup: (s) => {
      riding(s, 14);
      s.mode = 'air';
      s.surface = 'air';
      s.air.height = 3.5;
    },
  },
  {
    name: 'winch · next to it, full load',
    solo: 'engine',
    target: -21,
    setup: (s) => {
      riding(s, 11);
      s.distToWinch = 4;
      s.rope.reelSpeed = 11.5;
      s.rope.tension = 1;
    },
  },
  {
    name: 'winch · idle at 110 m',
    solo: 'engine',
    target: -43,
    setup: (s) => {
      s.mode = 'waiting';
      s.distToWinch = 110;
      s.rope.reelSpeed = 0;
    },
  },
  {
    name: 'rope hum · full tension',
    solo: 'rope',
    target: -29,
    setup: (s) => {
      riding(s, 12);
      s.rope.tension = 1;
    },
  },
  ...(['metal', 'stone', 'wood', 'plastic'] as const).map(
    (m, i): LayerScene => ({
      name: `grind · ${m}`,
      solo: 'scrape',
      target: [-22, -22, -22, -24][i],
      setup: (s, rig) => {
        riding(s, 14);
        s.mode = 'rail';
        s.surface = 'rail';
        rig.layers.railEnter(m);
      },
    }),
  ),
  ...(['concrete', 'wetConcrete', 'stone', 'wood', 'grass'] as const).map(
    (surface, i): LayerScene => ({
      name: `slide · ${surface}`,
      solo: 'scrape',
      target: [-23, -25, -22, -22, -28][i],
      setup: (s) => {
        riding(s, 14);
        s.mode = 'slide';
        s.surface = surface;
      },
    }),
  ),
  {
    name: 'hero drone + heartbeat',
    solo: 'hero',
    target: -30,
    setup: (s) => {
      riding(s, 8);
      s.hero = true;
    },
  },
];

export function renderLayer(scene: LayerScene, seconds = 4, keep = false): Promise<OfflineResult> {
  const state = createRiderSimState();
  const view = { state, timeScale: 1, paused: false };
  return renderOffline(
    seconds,
    (rig) => {
      rig.layers.solo = scene.solo;
      scene.setup(state, rig);
      rig.layers.update(1 / 60, view);
    },
    { raw: true, skip: 1, keep, frame: (rig, _t, dt) => rig.layers.update(dt, view) },
  );
}

/** A track from its start; RMS is measured after the intro (first full section onwards). */
export function renderTrack(id: string, seconds = 36, raw = true, keep = false): Promise<OfflineResult> {
  const def = findTrack(id) ?? TRACKS[0];
  return renderOffline(
    seconds,
    (rig) => {
      rig.music.play(def.id);
      rig.music.render(seconds);
    },
    { raw, skip: Math.min(seconds - 4, 4 * barSeconds(def) + 0.3), keep },
  );
}

/**
 * Worst case through the master chain at default volumes: a track in full swing, every layer at
 * its maximum and the loudest one-shots on top of each other. Must not clip.
 */
export function renderBusyMix(seconds = 22, keep = false): Promise<OfflineResult> {
  const state = createRiderSimState();
  const view = { state: null as RiderSimState | null, timeScale: 1, paused: false };
  const cues: [number, SfxName, SfxOpts][] = [
    [13, 'pop', { amount: 1 }],
    [14, 'land.water', { amount: 1 }],
    [14, 'splash.big', { amount: 1 }],
    [14.1, 'crowd.cheer', { amount: 1 }],
    [15.5, 'letter', { step: 6 }],
    [15.5, 'combo.bank', { step: 8, amount: 1 }],
    [16.5, 'bail.concrete', { amount: 1 }],
    [16.6, 'crowd.ooh', { amount: 1 }],
    [17.5, 'hero.start', {}],
    [18.6, 'rail.lock', {}],
    [19.5, 'goal', {}],
  ];
  return renderOffline(
    seconds,
    (rig) => {
      rig.music.play('old_town');
      rig.music.render(seconds);
      for (const [at, id, o] of cues) rig.sfx.play(id, { ...o, at });
    },
    {
      keep,
      skip: 12,
      frame: (rig, t, dt) => {
        if (t >= 11.5) {
          view.state = state;
          riding(state, 14);
          state.lean = 1;
          state.distToWinch = 6;
          state.rope.tension = 1;
          state.rope.reelSpeed = 11.5;
          state.hero = t >= 17.5;
          if (t >= 18.6) {
            state.mode = 'rail';
            state.surface = 'rail';
          }
        }
        rig.layers.update(dt, view);
      },
    },
  );
}

function row(group: CheckRow['group'], name: string, metric: CheckRow['metric'], result: OfflineResult, target: number | null, tol: number, extra = ''): CheckRow {
  const value = metric === 'peak' ? result.peakDb : metric === 'lufs' ? result.lufs : result.rmsDb;
  const problems: string[] = [];
  if (result.bad > 0) problems.push(`${result.bad} NaN`);
  if (result.clipped > 0) problems.push(`${result.clipped} clipped`);
  if (result.peak < 1e-4) problems.push('silent');
  if (target !== null && Math.abs(value - target) > tol) problems.push(`off target by ${(value - target).toFixed(1)} dB`);
  if (extra) problems.push(extra);
  return { group, name, metric, value, target, tol, ok: problems.length === 0, note: problems.join(', '), result };
}

/** Raw recipe peaks (dB) → paste into RAW_PEAK_DB in sfx.ts when a recipe changes. */
export async function calibrateSfx(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of ALL_SFX) out[id] = Math.round((await renderSfx(id, 'calibrate')).peakDb * 10) / 10;
  return out;
}

export async function checkSfx(onRow?: (r: CheckRow) => void): Promise<CheckRow[]> {
  const rows: CheckRow[] = [];
  for (const id of ALL_SFX) {
    const res = await renderSfx(id, 'bus');
    // a one-shot must have finished ringing before the end of its render window
    // noise-based sounds with random pitch: the peak wanders a couple of dB from take to take
    const r = row('sfx', id, 'peak', res, Sfx.targetDb(id), 2.5, res.tailPeak > 0.004 ? 'tail cut off' : '');
    rows.push(r);
    onRow?.(r);
  }
  return rows;
}

export async function checkLayers(onRow?: (r: CheckRow) => void): Promise<CheckRow[]> {
  const rows: CheckRow[] = [];
  for (const scene of LAYER_SCENES) {
    const r = row('layer', scene.name, 'rms', await renderLayer(scene), scene.target, 2);
    rows.push(r);
    onRow?.(r);
  }
  return rows;
}

/** Target programme loudness (LUFS) of every track at the music bus — see TrackDef.gain. */
export const TRACK_TARGET_LUFS = -16;

export async function checkTracks(onRow?: (r: CheckRow) => void, seconds = 36): Promise<CheckRow[]> {
  const rows: CheckRow[] = [];
  for (const def of TRACKS) {
    const r = row('music', def.id, 'lufs', await renderTrack(def.id, seconds), TRACK_TARGET_LUFS, 1.2);
    rows.push(r);
    onRow?.(r);
  }
  return rows;
}

export async function checkMix(onRow?: (r: CheckRow) => void): Promise<CheckRow[]> {
  const rows: CheckRow[] = [];
  const push = (r: CheckRow): void => {
    rows.push(r);
    onRow?.(r);
  };
  const busy = await renderBusyMix();
  push(row('mix', 'busy mix · master peak', 'peak', busy, null, 0, busy.peak > 0.975 ? 'over the clipper ceiling' : ''));
  // music alone at default volume through the master chain: this is what the player hears in menus
  const music = await renderTrack('phuket_sunset', 30, false);
  push(row('mix', 'music alone · default volume', 'lufs', music, null, 0, music.lufs > -21 ? 'music too hot' : music.lufs < -32 ? 'music inaudible' : ''));
  // loudest one-shot alone through the master chain
  const bail = await renderSfx('bail.concrete', 'master');
  push(row('mix', 'bail.concrete · master peak', 'peak', bail, null, 0, bail.peakDb - music.rmsMaxDb < 8 ? 'effects not clearly above music' : ''));
  // paused: the layers must be mute
  const state = createRiderSimState();
  riding(state, 14);
  const view = { state, timeScale: 1, paused: true };
  const paused = await renderOffline(2, (rig) => rig.layers.update(1 / 60, view), { raw: true, frame: (rig, _t, dt) => rig.layers.update(dt, view), skip: 0.5 });
  const silent = paused.peak < 1e-3;
  const r = row('mix', 'layers while paused', 'peak', paused, null, 0, silent ? '' : 'layers audible while paused');
  r.ok = silent && paused.bad === 0;
  r.note = silent ? 'silent, as it should be' : 'layers audible while paused';
  push(r);
  return rows;
}

export async function checkAll(onRow?: (r: CheckRow) => void): Promise<CheckRow[]> {
  return [...(await checkSfx(onRow)), ...(await checkLayers(onRow)), ...(await checkTracks(onRow)), ...(await checkMix(onRow))];
}
