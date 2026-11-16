/**
 * Procedural texture core: tileable noise fields, height → normal map, ORM packing and the
 * conversion of generated pixel buffers into three.js textures (mipmapped, repeating, correct colour space).
 * The actual surface recipes live in src/world/surfaces.ts.
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType } from 'three';
import type { Texture } from 'three';
import { seededRng } from '../data/geometry';

export type Field = Float32Array;

/** Periodic value noise: `cx`×`cy` lattice cells across the tile (different values → streaks). */
export function valueNoise(size: number, cx: number, cy: number, seed: number): Field {
  const rnd = seededRng(seed);
  const lat = new Float32Array(cx * cy);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cy;
    const iy = Math.floor(fy);
    const ty = fy - iy;
    const sy = ty * ty * (3 - 2 * ty);
    const y0 = (iy % cy) * cx;
    const y1 = ((iy + 1) % cy) * cx;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cx;
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const sx = tx * tx * (3 - 2 * tx);
      const x0 = ix % cx;
      const x1 = (ix + 1) % cx;
      const a = lat[y0 + x0];
      const b = lat[y0 + x1];
      const c = lat[y1 + x0];
      const d = lat[y1 + x1];
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

/** Fractal noise 0..1 (periodic). */
export function fbm(size: number, cx: number, cy: number, octaves: number, seed: number, gain = 0.5): Field {
  const out = new Float32Array(size * size);
  let amp = 1;
  let sum = 0;
  for (let o = 0; o < octaves; o++) {
    const kx = Math.min(size, cx << o);
    const ky = Math.min(size, cy << o);
    const n = valueNoise(size, kx, ky, seed + o * 7919);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    sum += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

export interface Cells {
  /** Distance to the nearest feature point, in cell units (≈0..1). */
  f1: Field;
  /** F2 − F1: small near cell borders (cracks, joints). */
  edge: Field;
  /** Random value 0..1 of the nearest cell. */
  id: Field;
}

/** Periodic Worley / cellular noise. */
export function cells(size: number, n: number, seed: number, jitter = 1): Cells {
  const rnd = seededRng(seed);
  const px = new Float32Array(n * n);
  const py = new Float32Array(n * n);
  const pid = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    px[i] = 0.5 + (rnd() - 0.5) * jitter;
    py[i] = 0.5 + (rnd() - 0.5) * jitter;
    pid[i] = rnd();
  }
  const f1 = new Float32Array(size * size);
  const edge = new Float32Array(size * size);
  const id = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * n;
    const iy = Math.floor(fy);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * n;
      const ix = Math.floor(fx);
      let d1 = 9;
      let d2 = 9;
      let best = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const cy = (iy + oy + n) % n;
        for (let ox = -1; ox <= 1; ox++) {
          const cxx = (ix + ox + n) % n;
          const k = cy * n + cxx;
          const dx = ix + ox + px[k] - fx;
          const dy = iy + oy + py[k] - fy;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = k;
          } else if (d < d2) d2 = d;
        }
      }
      const i = y * size + x;
      f1[i] = Math.sqrt(d1);
      edge[i] = Math.sqrt(d2) - f1[i];
      id[i] = pid[best];
    }
  }
  return { f1, edge, id };
}

export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Integer hash → 0..1 (per brick / plank / tile variation). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Raw pixel maps of one surface. */
export interface SurfaceMaps {
  size: number;
  /** RGBA sRGB bytes. */
  albedo: Uint8ClampedArray;
  /** Height 0..1 (→ normal map). */
  height: Field;
  /** Roughness 0..1 per pixel. */
  rough: Field;
  /** Metalness 0..1 per pixel (optional). */
  metal?: Field;
  /** Ambient occlusion 0..1 (optional; derived from height when omitted). */
  ao?: Field;
  /** Size of one tile in metres [u, v]. */
  tile: [number, number];
  /** Normal strength: height range in metres (bump depth). */
  bump: number;
  /** Alpha is meaningful (cut-out). */
  alpha?: boolean;
}

/**
 * Helper to fill a SurfaceMaps: fn(u, v, i, px) writes px = [r, g, b, height, rough, metal, alpha(0..1)].
 * u, v are 0..1 across the tile.
 */
export function paint(size: number, tile: [number, number], bump: number, fn: (u: number, v: number, i: number, px: Float32Array) => void, opts: { metal?: boolean; alpha?: boolean } = {}): SurfaceMaps {
  const albedo = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const metal = opts.metal ? new Float32Array(size * size) : undefined;
  const px = new Float32Array(7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      px[0] = px[1] = px[2] = 128;
      px[3] = 0.5;
      px[4] = 0.8;
      px[5] = 0;
      px[6] = 1;
      fn((x + 0.5) / size, (y + 0.5) / size, i, px);
      albedo[i * 4] = px[0];
      albedo[i * 4 + 1] = px[1];
      albedo[i * 4 + 2] = px[2];
      albedo[i * 4 + 3] = px[6] * 255;
      height[i] = px[3];
      rough[i] = px[4];
      if (metal) metal[i] = px[5];
    }
  }
  return { size, albedo, height, rough, metal, tile, bump, alpha: opts.alpha };
}

/** Tangent-space normal map from a periodic height field. */
export function normalPixels(maps: SurfaceMaps): Uint8Array {
  const { size, height } = maps;
  const out = new Uint8Array(size * size * 4);
  // slope = Δh[m] / pixel size[m]
  const kx = (maps.bump * size) / maps.tile[0] / 2;
  const ky = (maps.bump * size) / maps.tile[1] / 2;
  for (let y = 0; y < size; y++) {
    const yu = ((y + size - 1) % size) * size;
    const yd = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const xl = (x + size - 1) % size;
      const xr = (x + 1) % size;
      const dx = (height[y * size + xr] - height[y * size + xl]) * kx;
      const dy = (height[yd + x] - height[yu + x]) * ky;
      const l = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = (-dx * l * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy * l * 0.5 + 0.5) * 255;
      out[i + 2] = (l * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** R = occlusion, G = roughness, B = metalness (the layout MeshStandardMaterial expects). */
export function ormPixels(maps: SurfaceMaps): Uint8Array {
  const { size, height, rough, metal, ao } = maps;
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    // cavities (low height) are slightly occluded
    const occ = ao ? ao[i] : 0.72 + 0.28 * Math.min(1, height[i] * 1.6);
    out[i * 4] = occ * 255;
    out[i * 4 + 1] = Math.min(1, Math.max(0.03, rough[i])) * 255;
    out[i * 4 + 2] = metal ? metal[i] * 255 : 0;
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function dataTexture(pixels: Uint8Array | Uint8ClampedArray, size: number, srgb: boolean, tile: [number, number], anisotropy: number): Texture {
  const tex = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.repeat.set(1 / tile[0], 1 / tile[1]);
  tex.needsUpdate = true;
  return tex;
}
