/**
 * Procedural textures shared by the sky, the water and the wake. Generated once per size and cached for
 * the lifetime of the page (they are spot-independent), so loading a second spot costs nothing.
 *
 *  wave texture (RGBA8, tileable)
 *    RG  surface slope (dH/du, dH/dv) of an ocean-like spectrum, ±3σ mapped to 0..1
 *    B   foam breakup noise (lacy cellular network)
 *    A   wave height, 0.5 = mean level
 *  cloud texture (RGBA8, tileable)
 *    R   cloud density
 *    GB  gradient of the (blurred) density — cheap directional lighting towards the sun
 *    A   wispy detail noise
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RedFormat, RepeatWrapping, UnsignedByteType } from 'three';
import { blurWrap, fieldRange, spectralNoise, worley } from './noise';

function toByte(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
}

/** Pure generator (headless, unit-tested). */
export function generateWaveData(size: number): Uint8Array {
  const n = size;
  // Height spectrum: slopes peak around `kp` cycles per tile and roll off smoothly (flowing crests,
  // not sandpaper), plus a faint high band so the glitter has something to sparkle on.
  const kp = 6;
  const kc = n * 0.17;
  const wind = 0.5;
  const h = spectralNoise(n, 0x51a7e, (kx, ky, k) => {
    const q = k / kp;
    const main = (q ** 1.5 / (1 + q ** 3.3)) / k;
    const fine = 0.022 * k ** -1.15;
    const c = Math.cos(Math.atan2(ky, kx) - wind);
    return (main * (0.3 + 0.7 * c * c) + fine) * Math.exp(-((k / kc) ** 2));
  });
  const mask = n - 1;
  const sx = new Float32Array(n * n);
  const sy = new Float32Array(n * n);
  let sum = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const dx = h[y * n + ((x + 1) & mask)] - h[y * n + ((x - 1) & mask)];
      const dy = h[((y + 1) & mask) * n + x] - h[((y - 1) & mask) * n + x];
      sx[i] = dx;
      sy[i] = dy;
      sum += dx * dx + dy * dy;
    }
  }
  const slopeScale = 1 / (3 * Math.sqrt(sum / (2 * n * n)));

  // Foam: two cellular networks + a blotchy low-frequency field so the lace opens into patches.
  const w1 = worley(n, Math.round(n / 46), 0xf0a1);
  const w2 = worley(n, Math.round(n / 17), 0xf0a2);
  const blot = spectralNoise(n, 0xb107, (_kx, _ky, k) => (k < 28 ? k ** -1.6 : 0));
  const foam = new Float32Array(n * n);
  for (let i = 0; i < foam.length; i++) foam[i] = 0.62 * w1[i] ** 1.5 + 0.34 * w2[i] ** 1.3 + 0.07 * blot[i];
  const [flo, fhi] = fieldRange(foam);

  const out = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    out[i * 4] = toByte(0.5 + 0.5 * sx[i] * slopeScale);
    out[i * 4 + 1] = toByte(0.5 + 0.5 * sy[i] * slopeScale);
    out[i * 4 + 2] = toByte((foam[i] - flo) / (fhi - flo));
    out[i * 4 + 3] = toByte(0.5 + h[i] * 0.18);
  }
  return out;
}

/** Pure generator (headless). */
export function generateCloudData(size: number): Uint8Array {
  const n = size;
  const dens = spectralNoise(n, 0xc10d, (_kx, _ky, k) => (k < n * 0.3 ? k ** -1.75 * (1 - Math.exp(-((k / 2.2) ** 2))) : 0));
  const soft = blurWrap(dens, n, Math.max(1, n >> 6));
  const detail = spectralNoise(n, 0xc10e, (_kx, _ky, k) => (k > 5 && k < n * 0.4 ? k ** -1.4 : 0));
  const mask = n - 1;
  const gx = new Float32Array(n * n);
  const gy = new Float32Array(n * n);
  let gmax = 1e-6;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      gx[i] = soft[y * n + ((x + 2) & mask)] - soft[y * n + ((x - 2) & mask)];
      gy[i] = soft[((y + 2) & mask) * n + x] - soft[((y - 2) & mask) * n + x];
      gmax = Math.max(gmax, Math.abs(gx[i]), Math.abs(gy[i]));
    }
  }
  const out = new Uint8Array(n * n * 4);
  const g = 0.5 / (gmax * 0.6);
  for (let i = 0; i < n * n; i++) {
    out[i * 4] = toByte(0.5 + dens[i] * 0.21);
    out[i * 4 + 1] = toByte(0.5 + gx[i] * g);
    out[i * 4 + 2] = toByte(0.5 + gy[i] * g);
    out[i * 4 + 3] = toByte(0.5 + detail[i] * 0.2);
  }
  return out;
}

const cache = new Map<string, DataTexture>();

function tileable(key: string, size: number, make: (size: number) => Uint8Array): DataTexture {
  let tex = cache.get(key);
  if (!tex) {
    tex = new DataTexture(make(size), size, size, RGBAFormat, UnsignedByteType);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = true;
    tex.name = key;
    tex.needsUpdate = true;
    cache.set(key, tex);
  }
  return tex;
}

/** Tileable wave/foam texture. `size` 256 (cheap) or 512. */
export function getWaveTexture(size: 256 | 512, anisotropy = 1): DataTexture {
  const tex = tileable(`wsh.waves.${size}`, size, generateWaveData);
  if (tex.anisotropy !== anisotropy) {
    tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
  }
  return tex;
}

export function getCloudTexture(): DataTexture {
  return tileable('wsh.clouds.256', 256, generateCloudData);
}

/** 1×1 "far from any shore" placeholder for the shore mask sampler. */
export function getWhiteTexture(): DataTexture {
  let tex = cache.get('wsh.white');
  if (!tex) {
    tex = new DataTexture(new Uint8Array([255]), 1, 1, RedFormat, UnsignedByteType);
    tex.unpackAlignment = 1;
    tex.magFilter = tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    cache.set('wsh.white', tex);
  }
  return tex;
}

/** Free every cached texture (page teardown / context loss recovery). */
export function disposeEnvTextures(): void {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}
