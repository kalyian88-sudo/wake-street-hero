/**
 * PropContext implementation handed to prop builders (decor). Static geometry is merged per
 * material by the StaticBatcher, repeated pieces go to the InstanceBatcher.
 *
 * Built-in props may use the extra members of WorldPropContext (shadow flags, crowd, terrain);
 * third-party props only need the PropContext contract from src/types/modules.ts.
 */
import { Matrix4, Mesh } from 'three';
import type { BufferGeometry, Color, Material, Object3D } from 'three';
import { DEG, hashString, seededRng } from '../../data/geometry';
import type { PropContext, PropDef } from '../../types';
import type { BatchFlags } from '../batch';
import type { BuildCtx } from '../build';
import { ensureColor } from '../geo';

export interface SpectatorSpec {
  x: number;
  y: number;
  z: number;
  /** Facing yaw (radians). */
  yaw: number;
  pose?: 'stand' | 'cheer' | 'film' | 'sit';
  scale?: number;
  shirt?: number;
}

export interface WorldPropContext extends PropContext {
  readonly build: BuildCtx;
  readonly def: PropDef;
  /** addStatic with explicit shadow / chunk flags. */
  addStaticEx(geometry: BufferGeometry, material: Material, matrix?: Matrix4 | null, flags?: BatchFlags): void;
  addInstanceEx(key: string, geometry: BufferGeometry, material: Material, matrix: Matrix4, color?: Color, flags?: BatchFlags): void;
  /** Register a spectator with the crowd system (instanced, reacts to tricks). */
  addSpectator(s: SpectatorSpec): void;
  /** Numeric / string / boolean param with a default. */
  num(name: string, fallback: number): number;
  str(name: string, fallback: string): string;
  flag(name: string, fallback: boolean): boolean;
  list(name: string): readonly number[] | null;
}

const _a = new Matrix4();
const _b = new Matrix4();

export function createPropContext(build: BuildCtx, def: PropDef, index: number, addSpectator: (s: SpectatorSpec) => void): WorldPropContext {
  const rng = seededRng((def.seed ?? hashString(`${def.type}#${index}`)) ^ 0x9e3779b9);
  const base = new Matrix4();
  const s = def.scale ?? 1;
  base.makeRotationY((def.rot ?? 0) * DEG);
  base.multiply(_a.makeScale(s, s, s));
  base.setPosition(def.pos[0], def.pos[1], def.pos[2]);
  const params = def.params ?? {};
  return {
    spot: build.spot,
    profile: build.profile,
    rng,
    build,
    def,
    mat: (key, opts) => build.mat(key, opts),
    addStatic(geometry, material, matrix) {
      build.statics.add(geometry, material, matrix ?? base);
    },
    addStaticEx(geometry, material, matrix, flags) {
      build.statics.add(geometry, material, matrix === undefined ? base : matrix, flags);
    },
    addInstance(key, geometry, material, matrix, color) {
      build.instances.add(key, geometry, material, matrix, color);
    },
    addInstanceEx(key, geometry, material, matrix, color, flags) {
      build.instances.add(key, geometry, material, matrix, color, flags);
    },
    addObject(obj: Object3D) {
      obj.traverse((o) => {
        if (o instanceof Mesh) {
          const m = o.material as Material & { vertexColors?: boolean };
          if (!Array.isArray(m) && m.vertexColors) ensureColor(o.geometry as BufferGeometry);
        }
      });
      build.dynamic.add(obj);
    },
    onUpdate(fn) {
      build.updaters.push(fn);
    },
    matrixAt(local, rotDeg, scale) {
      const out = new Matrix4();
      _a.makeRotationY((rotDeg ?? 0) * DEG);
      if (scale !== undefined) {
        if (typeof scale === 'number') _a.multiply(_b.makeScale(scale, scale, scale));
        else _a.multiply(_b.makeScale(scale[0], scale[1], scale[2]));
      }
      if (local) _a.setPosition(local[0], local[1], local[2]);
      return out.multiplyMatrices(base, _a);
    },
    addSpectator,
    num: (name, fallback) => (typeof params[name] === 'number' ? (params[name] as number) : fallback),
    str: (name, fallback) => (typeof params[name] === 'string' ? (params[name] as string) : fallback),
    flag: (name, fallback) => (typeof params[name] === 'boolean' ? (params[name] as boolean) : fallback),
    list: (name) => (Array.isArray(params[name]) ? (params[name] as readonly number[]) : null),
  };
}

/** Narrow a PropContext to the built-in extended one (true inside buildSpotWorld). */
export function asWorldCtx(ctx: PropContext): WorldPropContext | null {
  return 'build' in ctx && 'addSpectator' in ctx ? (ctx as WorldPropContext) : null;
}
