// STUB — replaced by the rules agent. Keep the export name/signature.
import type { EventBus } from '../core/events';
import type { IRunObjectives, RunConfig, SpotDef } from '../types';

/** @param doneBefore goal flags from the save (5). */
export function createRunObjectives(spot: SpotDef, _config: RunConfig, doneBefore: boolean[], _bus: EventBus): IRunObjectives {
  return {
    state: {
      letters: [false, false, false, false, false, false],
      goals: spot.goals.map((_, i) => ({ done: !!doneBefore[i], doneBefore: !!doneBefore[i], progress: 0 })),
      chain: [],
      inFilmerZone: null,
    },
    update: () => undefined,
    dispose: () => undefined,
  };
}
