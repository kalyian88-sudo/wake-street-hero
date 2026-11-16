/**
 * Headless noise maths for the procedural env textures (water waves, foam, clouds).
 * Everything here is tileable by construction and deterministic for a given seed.
 */
import { seededRng } from '../../data/geometry';

/** In-place radix-2 FFT of one complex row. `n` must be a power of two. Unnormalised in both directions. */
export function fft(re: Float32Array, im: Float32Array, n: number, inverse: boolean): void {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** In-place 2D FFT of an n×n complex field stored row-major. */
export function fft2d(re: Float32Array, im: Float32Array, n: number, inverse: boolean): void {
  const rowRe = new Float32Array(n);
  const rowIm = new Float32Array(n);
  for (let y = 0; y < n; y++) {
    const o = y * n;
    rowRe.set(re.subarray(o, o + n));
    rowIm.set(im.subarray(o, o + n));
    fft(rowRe, rowIm, n, inverse);
    re.set(rowRe, o);
    im.set(rowIm, o);
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      rowRe[y] = re[y * n + x];
      rowIm[y] = im[y * n + x];
    }
    fft(rowRe, rowIm, n, inverse);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = rowRe[y];
      im[y * n + x] = rowIm[y];
    }
  }
}

/**
 * Random tileable field synthesised in the frequency domain: every wave vector (kx, ky) — in cycles per tile —
 * gets a Gaussian random complex amplitude scaled by `amp`. Returns the real part, normalised to unit RMS.
 */
export function spectralNoise(size: number, seed: number, amp: (kx: number, ky: number, k: number) => number): Float32Array {
  const n = size;
  const re = new Float32Array(n * n);
  const im = new Float32Array(n * n);
  const rnd = seededRng(seed);
  const half = n >> 1;
  for (let y = 0; y < n; y++) {
    const ky = y <= half ? y : y - n;
    for (let x = 0; x < n; x++) {
      const kx = x <= half ? x : x - n;
      const k = Math.hypot(kx, ky);
      if (k === 0) continue;
      const a = amp(kx, ky, k);
      if (a <= 0) continue;
      // Box–Muller
      const u = Math.max(rnd(), 1e-7);
      const m = Math.sqrt(-2 * Math.log(u)) * a;
      const ph = rnd() * Math.PI * 2;
      re[y * n + x] = m * Math.cos(ph);
      im[y * n + x] = m * Math.sin(ph);
    }
  }
  fft2d(re, im, n, true);
  let sum = 0;
  for (let i = 0; i < re.length; i++) sum += re[i] * re[i];
  const inv = 1 / Math.sqrt(sum / re.length || 1);
  for (let i = 0; i < re.length; i++) re[i] *= inv;
  return re;
}

/**
 * Tileable cellular (Worley) noise: distance to the nearest feature point, `cells`×`cells` points per tile.
 * Returns F1 normalised so 0 = on a feature point, ~1 = as far from any point as it gets.
 */
export function worley(size: number, cells: number, seed: number): Float32Array {
  const rnd = seededRng(seed);
  const px = new Float32Array(cells * cells);
  const py = new Float32Array(cells * cells);
  for (let i = 0; i < px.length; i++) {
    px[i] = rnd();
    py[i] = rnd();
  }
  const out = new Float32Array(size * size);
  const scale = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = (y + 0.5) * scale;
    const cy = Math.floor(fy);
    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5) * scale;
      const cx = Math.floor(fx);
      let best = 9;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy;
        const wy = ((gy % cells) + cells) % cells;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const wx = ((gx % cells) + cells) % cells;
          const i = wy * cells + wx;
          const dx = gx + px[i] - fx;
          const dy = gy + py[i] - fy;
          const d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
      }
      out[y * size + x] = Math.min(1, Math.sqrt(best) / 1.1);
    }
  }
  return out;
}

/** Tileable separable box blur (wraps around). `radius` in texels. */
export function blurWrap(src: Float32Array, size: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const w = 1 / (radius * 2 + 1);
  const mask = size - 1; // size is a power of two
  for (let y = 0; y < size; y++) {
    const o = y * size;
    let acc = 0;
    for (let k = -radius; k <= radius; k++) acc += src[o + (k & mask)];
    for (let x = 0; x < size; x++) {
      tmp[o + x] = acc * w;
      acc += src[o + ((x + radius + 1) & mask)] - src[o + ((x - radius) & mask)];
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) acc += tmp[(k & mask) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = acc * w;
      acc += tmp[((y + radius + 1) & mask) * size + x] - tmp[((y - radius) & mask) * size + x];
    }
  }
  return out;
}

/** Min / max of a field. */
export function fieldRange(f: Float32Array): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < f.length; i++) {
    const v = f[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}
