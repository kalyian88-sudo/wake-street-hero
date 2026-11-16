// STUB — replaced by the env/fx agent. Keep the export name/signature.
import { Group } from 'three';
import { makeStub } from '../../dev/stub';
import type { IEnvironment, IParticles, WorldBuildContext } from '../../types';

export function createParticles(_env: IEnvironment, _ctx: WorldBuildContext): IParticles {
  return makeStub<IParticles>({ object: new Group() });
}
