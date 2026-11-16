/**
 * Run rewards — what a finished run is worth and how it lands in the save. Pure / headless.
 *
 * ECONOMY (numbers in REWARDS; gear prices in src/data/gear.ts)
 *  - every goal completed for the FIRST time pays coins + rep by type; all five on a spot adds a full-clear bonus;
 *  - the score pays coins with diminishing returns: coins = scoreCoinFactor × √(score / 100), capped
 *    (4 000 → 63, 12 000 → 110, 30 000 → 173, 100 000 → 316) and a small rep trickle (1 per 1 000 points, max 20);
 *  - free ride pays half the score coins and nothing else.
 * A good early run is ~100–150 coins plus 100–180 per new goal, so a mid-tier item (600–900) takes 4–6 good
 * runs; one city (4 spots: 20 goals ≈ 3 500 coins incl. full clears, plus the runs it takes) covers a top-tier
 * item (2 600–3 200) with change. Rider levels (src/career/progress.ts) are tuned to the same rep flow.
 */
import { findSpot } from '../data/spots';
import type { GoalDef, ObjectivesState, RunConfig, RunResult, SaveData, ScoreState, SpotProgress } from '../types';

export const REWARDS = {
  goal: {
    score: { coins: 100, rep: 40 },
    trick: { coins: 100, rep: 40 },
    letters: { coins: 150, rep: 60 },
    line: { coins: 180, rep: 70 },
    clip: { coins: 150, rep: 60 },
  } satisfies Record<GoalDef['type'], { coins: number; rep: number }>,
  /** All goals of a spot done (paid once, in the run that completes the set). */
  fullClear: { coins: 200, rep: 50 },
  scoreCoinFactor: 10,
  scoreCoinCap: 400,
  /** Score needed for 1 rep, and the per-run cap of that trickle. */
  scorePerRep: 1000,
  scoreRepCap: 20,
  freeRideCoinFactor: 0.5,
};

/** Coins for the score alone (diminishing returns). */
export function scoreCoins(score: number): number {
  if (!(score > 0)) return 0;
  return Math.min(REWARDS.scoreCoinCap, Math.round(REWARDS.scoreCoinFactor * Math.sqrt(score / 100)));
}

/** Rep trickle for the score alone. */
export function scoreRep(score: number): number {
  if (!(score > 0)) return 0;
  return Math.min(REWARDS.scoreRepCap, Math.floor(score / REWARDS.scorePerRep));
}

/** Coins + rep for completing goal `type` for the first time. */
export function goalReward(type: GoalDef['type']): { coins: number; rep: number } {
  return REWARDS.goal[type];
}

function emptyProgress(goalCount: number): SpotProgress {
  return { goals: new Array<boolean>(goalCount).fill(false), bestScore: 0, bestCombo: 0, bestTrick: null, runs: 0 };
}

/** Pure: build the result of a finished run (does not touch the save). */
export function buildRunResult(config: RunConfig, score: ScoreState, objectives: ObjectivesState, save: SaveData, durationSec: number): RunResult {
  const spot = findSpot(config.spotId);
  const prev = save.spots[config.spotId];
  const career = config.mode !== 'free';
  // an unbanked pot still counts — the run is over (score.finish() normally banks it before we get here)
  const pending = score.comboActive ? Math.round(score.comboPoints * score.comboMult) : 0;
  const total = score.total + pending;
  const bestCombo = Math.max(score.bestCombo, pending);

  const goalCount = Math.max(objectives.goals.length, spot?.goals.length ?? 0, prev?.goals.length ?? 0);
  const goals: boolean[] = [];
  const newGoals: number[] = [];
  let coins = 0;
  let rep = 0;
  for (let i = 0; i < goalCount; i++) {
    const before = !!prev?.goals[i];
    const def = spot?.goals[i];
    let now = career && !!objectives.goals[i]?.done;
    if (career && def?.type === 'score' && total >= def.target) now = true;
    goals.push(before || now);
    if (now && !before) {
      newGoals.push(i);
      const pay = REWARDS.goal[def?.type ?? 'score'];
      coins += pay.coins;
      rep += pay.rep;
    }
  }
  const stars = goals.filter(Boolean).length;
  if (newGoals.length > 0 && goalCount > 0 && stars === goalCount) {
    coins += REWARDS.fullClear.coins;
    rep += REWARDS.fullClear.rep;
  }
  if (career) {
    coins += scoreCoins(total);
    rep += scoreRep(total);
  } else {
    coins = Math.round(scoreCoins(total) * REWARDS.freeRideCoinFactor);
    rep = 0;
  }

  return {
    config,
    score: total,
    bestTrick: score.bestTrick ? { ...score.bestTrick } : null,
    bestCombo,
    tricksLanded: score.tricksLanded,
    falls: score.falls,
    duration: durationSec,
    letters: objectives.letters.slice(),
    goals,
    newGoals,
    coins,
    rep,
    newRecord: total > 0 && total > (prev?.bestScore ?? 0),
    stars,
    trickCounts: { ...(score.trickCounts ?? {}) },
  };
}

/** Mutates the save data in place with the result (call inside save.update). */
export function applyRunResult(save: SaveData, result: RunResult): void {
  const { config } = result;
  const sp = (save.spots[config.spotId] ??= emptyProgress(result.goals.length));
  for (let i = 0; i < result.goals.length; i++) sp.goals[i] = !!sp.goals[i] || result.goals[i];
  sp.runs++;
  if (result.score > sp.bestScore) sp.bestScore = result.score;
  if (result.bestCombo > sp.bestCombo) sp.bestCombo = result.bestCombo;
  if (result.bestTrick && (!sp.bestTrick || result.bestTrick.points > sp.bestTrick.points)) {
    sp.bestTrick = { name: { ...result.bestTrick.name }, points: result.bestTrick.points };
  }

  save.coins = Math.max(0, save.coins + result.coins);
  save.rep = Math.max(0, save.rep + result.rep);

  const stats = save.stats;
  stats.totalRuns++;
  stats.totalScore += result.score;
  stats.totalFalls += result.falls;
  if (result.bestCombo > stats.bestCombo) stats.bestCombo = result.bestCombo;
  if (result.trickCounts) {
    for (const id of Object.keys(result.trickCounts)) stats.tricksLanded[id] = (stats.tricksLanded[id] ?? 0) + result.trickCounts[id];
  }

  save.last.board = config.board;
  save.last.power = config.power;
  save.last.spotId = config.spotId;
  const cityId = findSpot(config.spotId)?.cityId;
  if (cityId) save.last.cityId = cityId;
  if (config.mode === 'tutorial') save.career.tutorialDone = true;
}
