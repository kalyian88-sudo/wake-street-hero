// STUB — replaced by the audio agent. Keep the export name/signature.
import { makeStub } from '../dev/stub';
import type { EventBus } from '../core/events';
import type { IAudio } from '../types';

export function createAudio(_bus: EventBus): IAudio {
  return makeStub<IAudio>({ unlocked: false, tracks: [] });
}
