// STUB — replaced by the rules agent. Keep the export names/signatures.
import type { EventBus } from '../core/events';
import type { IScoreKeeper, ResolvedTrick, ScoreState, TrickRecord } from '../types';

export function resolveTrick(_rec: TrickRecord): ResolvedTrick {
  return { id: 'stub', ids: ['stub'], name: { ru: 'Трюк', en: 'Trick' }, points: 100, parts: [], tier: 1 };
}

export function createScoreKeeper(_bus: EventBus): IScoreKeeper {
  const fresh = (): ScoreState => ({
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
  });
  const state = fresh();
  return {
    state,
    reset: () => void Object.assign(state, fresh()),
    addTrick: (t) => {
      state.total += t.points;
      return t.points;
    },
    addBonus: () => undefined,
    update: () => undefined,
    bail: () => undefined,
    activateHero: () => false,
    finish: () => undefined,
  };
}
