// STUB — replaced by the env/fx agent. Keep the export name/signature.
import { AmbientLight, Color, DirectionalLight, Fog, Group, Vector3 } from 'three';
import { makeStub } from '../../dev/stub';
import { DEG } from '../../data/geometry';
import type { EnvDef, IEnvironment, WorldBuildContext } from '../../types';

export function createEnvironment(def: EnvDef, _ctx: WorldBuildContext): IEnvironment {
  const object = new Group();
  const sun = new DirectionalLight(def.sunColor, def.sunIntensity);
  const el = def.sunElevation * DEG;
  const az = def.sunAzimuth * DEG;
  const sunDirection = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  sun.position.copy(sunDirection).multiplyScalar(60);
  object.add(sun, sun.target, new AmbientLight(0xffffff, 0.8));
  return makeStub<IEnvironment>({
    object,
    sun,
    sunDirection,
    envMap: null,
    def,
    attach(scene, renderer) {
      scene.background = new Color(def.fogColor);
      scene.fog = new Fog(def.fogColor, def.fogNear, def.fogFar);
      renderer.toneMappingExposure = def.exposure;
    },
  });
}
