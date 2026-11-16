/** Helpers shared by the built-in prop builders. */
import { Color } from 'three';
import type { BufferGeometry, Matrix4 } from 'three';
import type { PropContext } from '../../../types';
import type { BatchFlags } from '../../batch';
import { GB } from '../../geo';
import { asWorldCtx } from '../context';

interface Part {
  g: GB;
  key: string;
  opts?: Record<string, unknown>;
  flags?: BatchFlags;
}

/**
 * A prop usually needs a handful of materials. Kit hands out one GB per material and flushes them
 * all into the static batcher (prop-local coordinates → the prop's matrix).
 */
export class Kit {
  private readonly parts = new Map<string, Part>();
  constructor(readonly ctx: PropContext) {}

  g(key: string, flags?: BatchFlags, opts?: Record<string, unknown>): GB {
    const id = key + (opts ? JSON.stringify(opts) : '') + (flags ? `${flags.cast}${flags.receive}${flags.noChunk}` : '');
    let p = this.parts.get(id);
    if (!p) {
      p = { g: new GB(), key, opts, flags };
      this.parts.set(id, p);
    }
    return p.g;
  }

  flush(matrix?: Matrix4): void {
    const w = asWorldCtx(this.ctx);
    const m = matrix ?? this.ctx.matrixAt();
    for (const p of this.parts.values()) {
      if (p.g.empty) continue;
      const mat = this.ctx.mat(p.key, p.opts);
      if (w) w.addStaticEx(p.g.build(), mat, m, p.flags);
      else this.ctx.addStatic(p.g.build(), mat, m);
    }
    this.parts.clear();
  }
}

const fallbackShared = new Map<string, BufferGeometry>();

/** Geometry built once per world and reused by every instance of a prop variant. */
export function sharedGeo(ctx: PropContext, key: string, build: () => BufferGeometry): BufferGeometry {
  const w = asWorldCtx(ctx);
  const map = w ? w.build.shared : fallbackShared;
  let g = map.get(key);
  if (!g) {
    g = build();
    map.set(key, g);
  }
  return g;
}

export function num(ctx: PropContext, def: { params?: Record<string, unknown> }, name: string, fallback: number): number {
  void ctx;
  const v = def.params?.[name];
  return typeof v === 'number' ? v : fallback;
}
export function str(def: { params?: Record<string, unknown> }, name: string, fallback: string): string {
  const v = def.params?.[name];
  return typeof v === 'string' ? v : fallback;
}
export function flag(def: { params?: Record<string, unknown> }, name: string, fallback: boolean): boolean {
  const v = def.params?.[name];
  return typeof v === 'boolean' ? v : fallback;
}
export function list(def: { params?: Record<string, unknown> }, name: string): readonly number[] | null {
  const v = def.params?.[name];
  return Array.isArray(v) ? (v as readonly number[]) : null;
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}
export function range(rng: () => number, a: number, b: number): number {
  return a + (b - a) * rng();
}

const _c = new Color();
/** Instance colour from an sRGB hex (optionally brightness-jittered). */
export function tint(hex: number, mul = 1): Color {
  return new Color().setHex(hex).multiplyScalar(mul);
}
export function tmpColor(hex: number, mul = 1): Color {
  return _c.setHex(hex).multiplyScalar(mul);
}

/** Emissive strength of practical lights for the spot's time of day. */
export function lightLevel(ctx: PropContext): number {
  switch (ctx.spot.env.timeOfDay) {
    case 'night':
      return 4.2;
    case 'sunset':
      return 2.6;
    case 'golden':
      return 1.9;
    case 'overcast':
      return 1.3;
    default:
      return 1.0;
  }
}
