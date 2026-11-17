/**
 * Headless driver for the rider sim — used by the unit tests, the e2e smoke test and the 2-D sandbox.
 * Builds InputFrames from "held" button states (edges are derived) and steps the sim at a fixed rate.
 */
import { NEUTRAL_STATS } from '../config';
import { EventBus, type GameEvents } from '../core/events';
import type { BoardKind, GearStats, IRiderSim, PowerLevel, SpotDef, Stance } from '../types';
import { InputScript, type Held } from './inputScript';
import { createRiderSim } from './RiderSim';

export { InputScript, type Held } from './inputScript';

export interface EventLog {
  type: keyof GameEvents;
  time: number;
  payload: unknown;
}

export interface SimHarness {
  sim: IRiderSim;
  bus: EventBus;
  input: InputScript;
  /** Every 'sim:*', 'trick:*', 'score:*' and 'hero:*' event in order. */
  events: EventLog[];
  /** Advance one fixed step with the given held input. */
  step(held?: Held): void;
  /**
   * Run until `until` returns true or `maxSeconds` of sim time pass. `control` is asked for the held
   * input before every step. Returns true when `until` was satisfied.
   */
  run(maxSeconds: number, control?: ((h: SimHarness) => Held | void) | null, until?: (h: SimHarness) => boolean): boolean;
  /** Events of one type. */
  of<K extends keyof GameEvents>(type: K): GameEvents[K][];
  count(type: keyof GameEvents): number;
  dt: number;
}

export interface HarnessOptions {
  spot: SpotDef;
  winchId?: string;
  board?: BoardKind;
  power?: PowerLevel;
  stance?: Stance;
  stats?: Partial<GearStats>;
  /** Fixed step, default 1/60 s. */
  dt?: number;
  /** Call go() straight away (default true). */
  go?: boolean;
  bankStart?: boolean;
}

const LOGGED: (keyof GameEvents)[] = [
  'sim:pop',
  'sim:takeoff',
  'sim:land',
  'sim:bail',
  'sim:respawn',
  'sim:railEnter',
  'sim:railStance',
  'sim:railExit',
  'sim:wallEnter',
  'sim:wallExit',
  'sim:surface',
  'sim:ropeJerk',
  'sim:handle',
  'sim:surfaceSpin',
  'sim:finish',
  'sim:gap',
  'trick:spin',
  'trick:invert',
  'trick:grab',
  'trick:flip',
  'trick:shifty',
  'trick:catch',
  'score:trick',
  'score:bonus',
  'score:bank',
  'score:lost',
  'hero:ready',
  'hero:start',
  'hero:end',
];

export function createSimHarness(opts: HarnessOptions): SimHarness {
  const bus = new EventBus();
  const sim = createRiderSim(
    {
      spot: opts.spot,
      winchId: opts.winchId ?? opts.spot.winchPoints[0].id,
      power: opts.power ?? 'medium',
      board: opts.board ?? 'wakeboard',
      stance: opts.stance ?? 'regular',
      stats: { ...NEUTRAL_STATS, ...opts.stats },
      // most tests reason about a start on the water; the bank start has its own test
      bankStart: opts.bankStart ?? false,
    },
    bus,
  );
  const events: EventLog[] = [];
  for (const type of LOGGED) bus.on(type, (payload) => events.push({ type, time: sim.state.time, payload }));
  const input = new InputScript();
  const h: SimHarness = {
    sim,
    bus,
    input,
    events,
    dt: opts.dt ?? 1 / 60,
    step(held) {
      sim.step(h.dt, input.set(held ?? {}), 1);
    },
    run(maxSeconds, control, until) {
      const steps = Math.ceil(maxSeconds / h.dt);
      for (let i = 0; i < steps; i++) {
        if (until && until(h)) return true;
        h.step((control && control(h)) || undefined);
      }
      return until ? until(h) : false;
    },
    of(type) {
      const out: unknown[] = [];
      for (const e of events) if (e.type === type) out.push(e.payload);
      return out as never;
    },
    count(type) {
      let n = 0;
      for (const e of events) if (e.type === type) n++;
      return n;
    },
  };
  if (opts.go !== false) sim.go();
  return h;
}

/** Stick value that brings the rider to the lateral position `x` (spots whose line runs along +Z). */
export function steerToX(h: SimHarness, x: number): number {
  const s = h.sim.state;
  const v = (s.pos.x - x) * 0.6 + s.vel.x * 0.22;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/** Stick value that keeps the rail balance centred. */
export function balanceSteer(h: SimHarness): number {
  const r = h.sim.state.rail;
  if (!r) return 0;
  const v = -r.balance * 4;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
