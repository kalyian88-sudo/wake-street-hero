/**
 * Run objectives — letters, the five goals of a spot, the "line" chain and filmer clips. Headless, no DOM.
 *
 * LETTERS   Picked up when the rider's body (a vertical segment from the board to BODY_HEIGHT above it, swept
 *           along the path since the previous update) passes within GAME.letterRadius. Only letters of the
 *           active line count (LetterDef.line undefined or === config.winchId). Tracked in every mode.
 * GOALS     mode 'free' tracks nothing but letters. Goals done in an earlier run stay done; doing one again
 *           emits 'goal:complete' with first = false (once per run), a new one with first = true.
 *   score   BANKED score only (ScoreState.total) — the pending pot counts once it is banked. progress = total / target.
 *   trick   any landed trick whose ids include trickId (optionally on a given board). Sketchy landings count.
 *   letters all six in one run. progress = collected / 6.
 *   line    every listed obstacle used inside ONE unbroken combo. An obstacle is "used" when it was touched
 *           ('sim:takeoff', 'sim:railEnter', 'sim:wallEnter', 'sim:gap', 'sim:surface' with an obstacle id) and the
 *           next trick was then landed and scored ('score:trick'). The chain is wiped by 'score:bank',
 *           'score:lost' and 'sim:bail'. A touch that ends in a no-trick landing is forgotten at the next touch.
 *           `goal.winch` restricts the goal to one line.
 *   clip    a trick landed while the rider was inside the filmer zone at any moment between the start of
 *           that trick (takeoff / rail or wall entry) and its landing; minPoints is compared with the better
 *           of the trick's base value and the points actually awarded; trickId must be among the trick's ids.
 */
import { GAME } from '../config';
import type { EventBus, GameEvents } from '../core/events';
import type { GoalDef, IRunObjectives, ObjectivesState, RiderSimState, RunConfig, ScoreState, SpotDef } from '../types';

/** Height of the pickup segment above the board (m). */
const BODY_HEIGHT = 1.2;
/** A jump of more than this between two updates is a respawn, not a ride — no sweep. */
const TELEPORT = 8;
const LETTER_COUNT = GAME.letters.length;

type TrickEvent = GameEvents['score:trick'];
type LineGoal = Extract<GoalDef, { type: 'line' }>;

export function createRunObjectives(spot: SpotDef, config: RunConfig, doneBefore: boolean[], bus: EventBus): IRunObjectives {
  const tracking = config.mode !== 'free';
  const goals = spot.goals;
  const state: ObjectivesState = {
    letters: new Array<boolean>(LETTER_COUNT).fill(false),
    goals: goals.map((_, i) => ({ done: !!doneBefore[i], doneBefore: !!doneBefore[i], progress: doneBefore[i] ? 1 : 0 })),
    chain: [],
    inFilmerZone: null,
  };
  /** Completed in THIS run (also set for goals that were already done before). */
  const achieved = goals.map(() => false);

  // ── letters of the active line, flattened for the per-frame loop ──
  const active = spot.letters.filter((lt) => (lt.line === undefined || lt.line === config.winchId) && lt.index >= 0 && lt.index < LETTER_COUNT);
  const letterIndex = active.map((lt) => lt.index);
  const lx = active.map((lt) => lt.pos[0]);
  const ly = active.map((lt) => lt.pos[1]);
  const lz = active.map((lt) => lt.pos[2]);
  let collected = 0;
  let hasPrev = false;
  let px = 0;
  let py = 0;
  let pz = 0;

  // ── filmer zones ──
  const zones = spot.filmerZones;
  const zoneNow = zones.map(() => false);
  /** Rider was inside the zone at some point since the current trick started. */
  const zoneSeen = zones.map(() => false);

  // ── line chain ──
  const obstacleIds = spot.obstacles.map((o) => o.id);
  /** Obstacles touched since the last scored trick, waiting for a landed trick to commit them. */
  const pending: string[] = [];
  let pendingStale = false;
  /** Per goal: how many of a line goal's obstacles are in the chain (to emit 'line:progress' only on change). */
  const lineHits = goals.map(() => 0);

  function complete(i: number): void {
    const g = state.goals[i];
    if (!g || achieved[i]) return;
    achieved[i] = true;
    g.done = true;
    g.progress = 1;
    bus.emit('goal:complete', { index: i, first: !g.doneBefore });
  }

  function setProgress(i: number, value: number): void {
    const g = state.goals[i];
    if (g && !g.done) g.progress = value < 0 ? 0 : value > 1 ? 1 : value;
  }

  /** Map whatever id the sim reports (maybe a sub-part such as "stairs_left:rail0") to an obstacle of the spot. */
  function obstacleOf(id: string | undefined): string | null {
    if (!id) return null;
    if (obstacleIds.includes(id)) return id;
    let best: string | null = null;
    for (const o of obstacleIds) {
      if (id.length > o.length && id.startsWith(o) && !/[A-Za-z0-9_]/.test(id.charAt(o.length)) && (!best || o.length > best.length)) best = o;
    }
    return best;
  }

  function lineApplies(goal: LineGoal): boolean {
    return goal.winch === undefined || goal.winch === config.winchId;
  }

  function touch(rawId: string | undefined): void {
    const id = obstacleOf(rawId);
    if (pendingStale) {
      pending.length = 0;
      pendingStale = false;
    }
    if (id && !pending.includes(id) && !state.chain.includes(id)) pending.push(id);
  }

  function resetChain(): void {
    pending.length = 0;
    pendingStale = false;
    if (state.chain.length === 0) return;
    state.chain.length = 0;
    for (let i = 0; i < goals.length; i++) {
      const goal = goals[i];
      if (goal.type !== 'line' || lineHits[i] === 0) continue;
      lineHits[i] = 0;
      if (achieved[i]) continue;
      setProgress(i, 0);
      bus.emit('line:progress', { chain: [], total: goal.obstacles.length });
    }
  }

  function commitChain(): void {
    if (pending.length === 0) return;
    for (const id of pending) if (!state.chain.includes(id)) state.chain.push(id);
    pending.length = 0;
    pendingStale = false;
    for (let i = 0; i < goals.length; i++) {
      const goal = goals[i];
      if (goal.type !== 'line' || achieved[i] || !lineApplies(goal)) continue;
      const hit = state.chain.filter((id) => goal.obstacles.includes(id));
      if (hit.length === lineHits[i]) continue;
      lineHits[i] = hit.length;
      const total = new Set(goal.obstacles).size;
      setProgress(i, total ? hit.length / total : 0);
      bus.emit('line:progress', { chain: hit, total });
      if (total > 0 && hit.length >= total) complete(i);
    }
  }

  function trickStarts(): void {
    for (let z = 0; z < zones.length; z++) zoneSeen[z] = zoneNow[z];
  }

  /** `midTrick`: airborne / on a rail / on a wall — a zone the rider has left still counts for the trick in progress. */
  function markZones(x: number, z: number, midTrick: boolean): void {
    let inside: string | null = null;
    for (let k = 0; k < zones.length; k++) {
      const zone = zones[k];
      const dx = x - zone.center[0];
      const dz = z - zone.center[1];
      const hit = dx * dx + dz * dz <= zone.radius * zone.radius;
      zoneNow[k] = hit;
      if (hit) {
        zoneSeen[k] = true;
        inside ??= zone.id;
      } else if (!midTrick) zoneSeen[k] = false;
    }
    state.inFilmerZone = inside;
  }

  function onTrick(e: TrickEvent): void {
    if (e.landing === 'bail') return;
    commitChain();
    for (let i = 0; i < goals.length; i++) {
      const goal = goals[i];
      if (achieved[i]) continue;
      if (goal.type === 'trick') {
        if (e.trick.ids.includes(goal.trickId) && (goal.board === undefined || goal.board === config.board)) complete(i);
      } else if (goal.type === 'clip') {
        const k = zones.findIndex((zone) => zone.id === goal.zone);
        if (k < 0 || !zoneSeen[k]) continue;
        if (goal.trickId !== undefined && !e.trick.ids.includes(goal.trickId)) continue;
        if (Math.max(e.trick.points, e.awarded) < (goal.minPoints ?? 0)) continue;
        complete(i);
        bus.emit('clip:captured', { zone: goal.zone, trick: e.trick });
      }
    }
    trickStarts();
  }

  function checkScore(total: number): void {
    for (let i = 0; i < goals.length; i++) {
      const goal = goals[i];
      if (goal.type !== 'score' || achieved[i]) continue;
      setProgress(i, goal.target > 0 ? total / goal.target : 1);
      if (total >= goal.target) complete(i);
    }
  }

  const unsubscribe: (() => void)[] = [];
  if (tracking) {
    unsubscribe.push(
      bus.on('score:trick', onTrick),
      bus.on('score:bank', (e) => {
        checkScore(e.total);
        resetChain();
      }),
      bus.on('score:lost', resetChain),
      bus.on('sim:bail', resetChain),
      bus.on('sim:takeoff', (e) => {
        touch(e.obstacleId);
        trickStarts();
      }),
      bus.on('sim:railEnter', (e) => {
        touch(e.obstacleId);
        trickStarts();
      }),
      bus.on('sim:wallEnter', (e) => {
        touch(e.obstacleId);
        trickStarts();
      }),
      bus.on('sim:gap', (e) => touch(e.id)),
      bus.on('sim:surface', (e) => {
        if (e.obstacleId) touch(e.obstacleId);
      }),
      bus.on('sim:land', (e) => {
        markZones(e.pos.x, e.pos.z, true);
        if (!e.hadTrick) pendingStale = true;
      }),
    );
  }

  function collectLetters(rs: RiderSimState): void {
    const x = rs.pos.x;
    const y = rs.pos.y;
    const z = rs.pos.z;
    const riding = rs.mode !== 'waiting' && rs.mode !== 'bail' && rs.mode !== 'finished';
    if (!riding) {
      hasPrev = false;
      return;
    }
    let mx = x - px;
    let my = y - py;
    let mz = z - pz;
    if (!hasPrev || mx * mx + my * my + mz * mz > TELEPORT * TELEPORT) {
      px = x;
      py = y;
      pz = z;
      mx = my = mz = 0;
    }
    const moved2 = mx * mx + my * my + mz * mz;
    const r2 = GAME.letterRadius * GAME.letterRadius;
    for (let k = 0; k < letterIndex.length; k++) {
      const index = letterIndex[k];
      if (state.letters[index]) continue;
      // closest point of the path (of the body's middle) to the letter
      let t = 1;
      if (moved2 > 1e-8) {
        t = ((lx[k] - px) * mx + (ly[k] - (py + BODY_HEIGHT * 0.5)) * my + (lz[k] - pz) * mz) / moved2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      const dx = lx[k] - (px + mx * t);
      const dz = lz[k] - (pz + mz * t);
      // vertical distance to the body segment [board, board + BODY_HEIGHT]
      let dy = ly[k] - (py + my * t);
      dy = dy < 0 ? dy : dy > BODY_HEIGHT ? dy - BODY_HEIGHT : 0;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      state.letters[index] = true;
      collected++;
      bus.emit('letter:collect', { index, pos: { x: lx[k], y: ly[k], z: lz[k] }, count: collected });
      if (!tracking) continue;
      for (let i = 0; i < goals.length; i++) {
        if (goals[i].type !== 'letters' || achieved[i]) continue;
        setProgress(i, collected / LETTER_COUNT);
        if (collected >= LETTER_COUNT) complete(i);
      }
    }
    px = x;
    py = y;
    pz = z;
    hasPrev = true;
  }

  return {
    state,
    update(rs: RiderSimState, score: ScoreState, _dt: number): void {
      collectLetters(rs);
      markZones(rs.pos.x, rs.pos.z, rs.mode === 'air' || rs.mode === 'rail' || rs.mode === 'wall');
      if (tracking) checkScore(score.total);
    },
    dispose(): void {
      for (const off of unsubscribe) off();
      unsubscribe.length = 0;
    },
  };
}
