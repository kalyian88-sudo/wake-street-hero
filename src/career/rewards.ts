// STUB — replaced by the rules agent. Keep the export names/signatures.
import type { ObjectivesState, RunConfig, RunResult, SaveData, ScoreState } from '../types';

/** Pure: build the result of a finished run (does not touch the save). */
export function buildRunResult(config: RunConfig, score: ScoreState, objectives: ObjectivesState, save: SaveData, durationSec: number): RunResult {
  const goals = objectives.goals.map((g) => g.done);
  return {
    config,
    score: score.total,
    bestTrick: score.bestTrick,
    bestCombo: score.bestCombo,
    tricksLanded: score.tricksLanded,
    falls: score.falls,
    duration: durationSec,
    letters: objectives.letters.slice(),
    goals,
    newGoals: [],
    coins: 0,
    rep: 0,
    newRecord: score.total > (save.spots[config.spotId]?.bestScore ?? 0),
    stars: goals.filter(Boolean).length,
  };
}

/** Mutates the save data in place with the result (call inside save.update). */
export function applyRunResult(_save: SaveData, _result: RunResult): void {
  /* stub */
}
