/**
 * Internal glue between the three env modules (sky/IBL → water, wake, particles). Not part of the public
 * contracts: other modules only see IEnvironment / IWater / IParticles.
 */
import { Color, type CubeTexture } from 'three';
import type { EnvDef, IEnvironment } from '../../types';

/** Lighting summary of the baked sky, in scene-linear HDR units. */
export interface EnvLighting {
  /** Mip-mapped cube map of the sky without the sun disc — what the water reflects. null on Low. */
  skyCube: CubeTexture | null;
  /** Sky radiance straight up / just above the horizon (average over azimuth). */
  zenith: Color;
  horizon: Color;
  /** Sun (moon) colour × intensity. */
  sunLight: Color;
  /** Soft sky light for unlit-ish things (foam, droplets, water body): mean sky radiance × ambientIntensity. */
  ambient: Color;
  /** 0..1 how much of a crisp sun highlight the water should show (0 under overcast). */
  sunSpecular: number;
  /** Bumped whenever any of the above changed (re-bake). */
  version: number;
}

interface WithLighting {
  lighting: EnvLighting;
}

function hasLighting(env: object): env is WithLighting {
  return 'lighting' in env && typeof (env as { lighting: unknown }).lighting === 'object';
}

/** Rough sky colours per time of day — used until the sky has been baked and when the env is a stub. */
export function estimateSky(def: EnvDef, zenith: Color, horizon: Color): void {
  const fog = new Color(def.fogColor);
  switch (def.timeOfDay) {
    case 'night':
      zenith.setRGB(0.006, 0.01, 0.026);
      horizon.copy(fog).multiplyScalar(0.5);
      break;
    case 'overcast':
      zenith.setRGB(0.42, 0.45, 0.5);
      horizon.copy(fog).multiplyScalar(0.8);
      break;
    case 'sunset':
      zenith.setRGB(0.1, 0.16, 0.34);
      horizon.copy(fog);
      break;
    case 'golden':
      zenith.setRGB(0.12, 0.25, 0.52);
      horizon.copy(fog);
      break;
    default:
      zenith.setRGB(0.1, 0.27, 0.62);
      horizon.copy(fog);
  }
}

export function createLighting(def: EnvDef): EnvLighting {
  const lighting: EnvLighting = {
    skyCube: null,
    zenith: new Color(),
    horizon: new Color(),
    sunLight: new Color(def.sunColor).multiplyScalar(def.sunIntensity),
    ambient: new Color(),
    sunSpecular: def.timeOfDay === 'overcast' ? 0.12 : 1,
    version: 0,
  };
  estimateSky(def, lighting.zenith, lighting.horizon);
  updateAmbient(lighting, def);
  return lighting;
}

/** ambient = mean of zenith and horizon radiance, scaled by the def's ambient multiplier. */
export function updateAmbient(lighting: EnvLighting, def: EnvDef): void {
  lighting.ambient.copy(lighting.zenith).lerp(lighting.horizon, 0.55).multiplyScalar(def.ambientIntensity);
}

const fallbacks = new WeakMap<object, EnvLighting>();

/** Lighting of any IEnvironment: the real bake for our Environment, an estimate from the def otherwise. */
export function getLighting(env: IEnvironment): EnvLighting {
  if (hasLighting(env)) return env.lighting;
  let l = fallbacks.get(env);
  if (!l) {
    l = createLighting(env.def);
    fallbacks.set(env, l);
  }
  return l;
}
