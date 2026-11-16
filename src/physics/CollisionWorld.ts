// STUB — replaced by the sim agent. Keep the export name/signature.
import type { ICollisionWorld, SpotDef } from '../types';

export function buildCollisionWorld(spot: SpotDef): ICollisionWorld {
  return {
    sample: () => ({ y: spot.water[0]?.level ?? 0, kind: 'water', id: 'stub', nx: 0, ny: 1, nz: 0, ramp: false }),
    debugShapes: () => [],
  };
}
