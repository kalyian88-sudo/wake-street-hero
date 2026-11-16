/**
 * Surface recipes: every tileable PBR surface of the game as a pure function → SurfaceMaps
 * (albedo + height + roughness [+ metalness]). Tintable surfaces (plaster, paintedMetal, plastic, tile,
 * fabric, corrugated) are near-white: the vertex colour / material colour supplies the hue.
 */
import { cells, fbm, hash2, paint, smooth, valueNoise } from './textures';
import type { SurfaceMaps } from './textures';

type Px = Float32Array;
const set = (px: Px, r: number, g: number, b: number): void => {
  px[0] = r;
  px[1] = g;
  px[2] = b;
};
const mul = (px: Px, k: number): void => {
  px[0] *= k;
  px[1] *= k;
  px[2] *= k;
};
const mix = (px: Px, r: number, g: number, b: number, t: number): void => {
  px[0] += (r - px[0]) * t;
  px[1] += (g - px[1]) * t;
  px[2] += (b - px[2]) * t;
};
const fr = (x: number): number => x - Math.floor(x);
const TAU = Math.PI * 2;

export interface SurfaceDef {
  size: number;
  gen: (size: number, seed: number) => SurfaceMaps;
}

function concrete(wet: boolean) {
  return (size: number, seed: number): SurfaceMaps => {
    const n1 = fbm(size, 3, 3, 5, seed);
    const n2 = fbm(size, 20, 20, 3, seed + 1);
    const n3 = valueNoise(size, size >> 1, size >> 1, seed + 2);
    const cr = cells(size, 5, seed + 3);
    const pits = cells(size, 46, seed + 4);
    const pud = fbm(size, 3, 3, 4, seed + 9);
    return paint(size, [3, 3], wet ? 0.003 : 0.004, (u, v, i, px) => {
      const g = 150 + (n1[i] - 0.5) * 38 + (n2[i] - 0.5) * 24 + (n3[i] - 0.5) * 14;
      set(px, g + 3, g, g - 7);
      let h = 0.55 + (n2[i] - 0.5) * 0.3 + (n3[i] - 0.5) * 0.12;
      let rough = 0.92 - n2[i] * 0.12;
      const crack = (1 - smooth(0.0, 0.03, cr.edge[i])) * smooth(0.5, 0.58, n1[i]);
      mul(px, 1 - crack * 0.5);
      h -= crack * 0.5;
      const pit = (1 - smooth(0.05, 0.16, pits.f1[i])) * (pits.id[i] > 0.62 ? 1 : 0);
      mul(px, 1 - pit * 0.35);
      h -= pit * 0.35;
      // formwork joints of the 3 m panel
      const jd = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v)) * 3;
      const joint = 1 - smooth(0.004, 0.012, jd);
      mul(px, 1 - joint * 0.28);
      h -= joint * 0.3;
      if (wet) {
        const p = smooth(0.46, 0.6, pud[i]);
        mul(px, 0.66 - p * 0.2);
        mix(px, 52, 62, 64, p * 0.25);
        rough = 0.5 - p * 0.44 + n2[i] * 0.12;
        h = h * (1 - p) + 0.35 * p;
      }
      px[3] = h;
      px[4] = rough;
    });
  };
}

function stonePaving(size: number, seed: number): SurfaceMaps {
  const n1 = fbm(size, 4, 4, 4, seed);
  const n2 = valueNoise(size, size >> 1, size >> 1, seed + 1);
  const n3 = fbm(size, 32, 32, 2, seed + 2);
  const cols = 4;
  const rows = 8;
  return paint(size, [2.4, 2.4], 0.007, (u, v, i, px) => {
    const row = Math.floor(v * rows);
    const uu = u * cols + (row & 1) * 0.5;
    const col = ((Math.floor(uu) % cols) + cols) % cols;
    const fu = fr(uu);
    const fv = fr(v * rows);
    const d = Math.min(Math.min(fu, 1 - fu) * 0.6, Math.min(fv, 1 - fv) * 0.3);
    const inside = smooth(0.004, 0.014, d);
    const hsh = hash2(col, row, seed);
    const tone = 0.84 + hsh * 0.3;
    const warm = hash2(col, row, seed + 5);
    const g = (150 + (n1[i] - 0.5) * 22 + (n2[i] - 0.5) * 20 + (n3[i] - 0.5) * 16) * tone;
    set(px, g + 6 + warm * 8, g + 1, g - 8 - warm * 6);
    mix(px, 66, 62, 56, 1 - inside);
    px[3] = inside * (0.72 + hsh * 0.14 + smooth(0.004, 0.05, d) * 0.12 + (n3[i] - 0.5) * 0.1);
    px[4] = inside > 0.5 ? 0.78 - n2[i] * 0.16 : 0.96;
  });
}

function granite(size: number, seed: number): SurfaceMaps {
  const n1 = valueNoise(size, size, size, seed);
  const n2 = fbm(size, 4, 4, 4, seed + 1);
  const min = cells(size, 64, seed + 2);
  return paint(size, [2, 2], 0.0012, (u, v, i, px) => {
    const id = min.id[i];
    if (id < 0.22) set(px, 78, 76, 82);
    else if (id < 0.55) set(px, 176, 148, 140);
    else set(px, 172, 170, 168);
    mix(px, 150, 142, 140, 0.45);
    const k = 0.86 + n1[i] * 0.22 + (n2[i] - 0.5) * 0.16;
    mul(px, k);
    // slabs 1 × 2 m
    const jd = Math.min(Math.min(fr(u * 2), 1 - fr(u * 2)) * 1, Math.min(v, 1 - v) * 2);
    const joint = 1 - smooth(0.003, 0.009, jd);
    mul(px, 1 - joint * 0.55);
    px[3] = 0.6 + n1[i] * 0.1 - joint * 0.6;
    px[4] = 0.34 + n1[i] * 0.16 + joint * 0.5;
  });
}

function marble(size: number, seed: number): SurfaceMaps {
  const w1 = fbm(size, 2, 2, 5, seed);
  const w2 = fbm(size, 5, 5, 4, seed + 1);
  return paint(size, [2, 2], 0.0005, (u, v, i, px) => {
    set(px, 234, 231, 226);
    const t1 = Math.sin((u * 2 + v + (w1[i] - 0.5) * 3.2) * TAU);
    const vein1 = Math.pow(1 - Math.abs(t1), 14);
    const t2 = Math.sin((u * 3 - v * 2 + (w2[i] - 0.5) * 2.4) * TAU);
    const vein2 = Math.pow(1 - Math.abs(t2), 24);
    mix(px, 122, 126, 138, vein1 * 0.55 + vein2 * 0.28);
    mul(px, 0.94 + w2[i] * 0.1);
    px[3] = 0.5;
    px[4] = 0.2 + w2[i] * 0.12;
  });
}

function brick(size: number, seed: number): SurfaceMaps {
  const n2 = fbm(size, 48, 48, 2, seed + 1);
  const n3 = valueNoise(size, size >> 1, size >> 1, seed + 2);
  const dirt = fbm(size, 3, 3, 4, seed + 3);
  const cols = 8;
  const rows = 24;
  return paint(size, [1.92, 1.92], 0.008, (u, v, i, px) => {
    const row = Math.floor(v * rows);
    const uu = u * cols + (row & 1) * 0.5;
    const col = ((Math.floor(uu) % cols) + cols) % cols;
    const fu = fr(uu);
    const fv = fr(v * rows);
    const d = Math.min(Math.min(fu, 1 - fu) * 0.24, Math.min(fv, 1 - fv) * 0.08);
    const inside = smooth(0.004, 0.011, d);
    const h1 = hash2(col, row, seed);
    const h2 = hash2(col, row, seed + 11);
    set(px, 152, 80, 58);
    mix(px, 118, 60, 48, h1 * 0.7);
    if (h2 > 0.82) mix(px, 182, 110, 80, 0.6);
    if (h2 < 0.08) mix(px, 70, 48, 44, 0.7);
    mul(px, 0.88 + n2[i] * 0.2 + (n3[i] - 0.5) * 0.12);
    mix(px, 178, 170, 154, 1 - inside);
    mul(px, 0.88 + dirt[i] * 0.2);
    px[3] = inside * (0.62 + h1 * 0.2 + (n2[i] - 0.5) * 0.25) + (1 - inside) * 0.18;
    px[4] = 0.9;
  });
}

function plaster(size: number, seed: number): SurfaceMaps {
  const n1 = fbm(size, 2, 2, 5, seed);
  const n1b = fbm(size, 4, 4, 5, seed + 4);
  const n3 = valueNoise(size, size >> 1, size >> 1, seed + 2);
  const streak = fbm(size, 28, 2, 3, seed + 5);
  const cr = cells(size, 6, seed + 6);
  return paint(size, [4, 4], 0.0028, (u, v, i, px) => {
    set(px, 242, 238, 230);
    mul(px, 0.93 + (n1[i] - 0.5) * 0.12 + (n3[i] - 0.5) * 0.035);
    const s = smooth(0.52, 0.8, streak[i]);
    mul(px, 1 - s * 0.13);
    const peel = smooth(0.66, 0.7, n1b[i]);
    mix(px, 206, 196, 180, peel * 0.5);
    const crack = (1 - smooth(0.0, 0.016, cr.edge[i])) * smooth(0.45, 0.6, n1[i]);
    mul(px, 1 - crack * 0.28);
    px[3] = 0.6 + (n3[i] - 0.5) * 0.25 + (n1b[i] - 0.5) * 0.2 - peel * 0.3 - crack * 0.4;
    px[4] = 0.9 + (n3[i] - 0.5) * 0.08;
  });
}

function planks(weathered: boolean) {
  return (size: number, seed: number): SurfaceMaps => {
    const grain = fbm(size, 96, 4, 3, seed);
    const grain2 = fbm(size, 24, 2, 3, seed + 1);
    const n3 = valueNoise(size, size, size >> 2, seed + 2);
    const knots = cells(size, 4, seed + 3);
    const nPlanks = weathered ? 1 : 8;
    return paint(size, weathered ? [1, 1] : [1.6, 2.4], 0.004, (u, v, i, px) => {
      const pu = u * nPlanks;
      const plank = Math.floor(pu);
      const fu = fr(pu);
      const tone = hash2(plank, 3, seed);
      if (weathered) set(px, 146, 126, 100);
      else set(px, 156 - tone * 26, 112 - tone * 22, 70 - tone * 16);
      const g = (grain[i] - 0.5) * 0.36 + (grain2[i] - 0.5) * 0.22 + (n3[i] - 0.5) * 0.1;
      mul(px, 1 + g);
      const k = (1 - smooth(0.02, 0.07, knots.f1[i])) * (knots.id[i] > 0.5 ? 1 : 0);
      mix(px, 70, 46, 30, k * 0.7);
      let h = 0.6 + g * 0.8 - k * 0.2;
      if (!weathered) {
        const gap = 1 - smooth(0.006, 0.02, Math.min(fu, 1 - fu));
        const butt = 1 - smooth(0.0015, 0.004, Math.abs(fr(v + hash2(plank, 9, seed)) - 0.5));
        const j = Math.max(gap, butt);
        mul(px, 1 - j * 0.72);
        h -= j * 0.6;
      } else {
        mul(px, 0.9 + grain2[i] * 0.2);
        // saw marks
        h += Math.sin(v * size * 0.9) * 0.04;
      }
      px[3] = h;
      px[4] = weathered ? 0.92 : 0.74 + grain[i] * 0.12;
    });
  };
}

function plywood(size: number, seed: number): SurfaceMaps {
  const g1 = fbm(size, 3, 40, 4, seed);
  const g2 = fbm(size, 2, 6, 3, seed + 1);
  const n3 = valueNoise(size, size, size, seed + 2);
  return paint(size, [2.44, 1.22], 0.0014, (u, v, i, px) => {
    set(px, 200, 168, 120);
    const ring = Math.sin((v * 14 + g2[i] * 7) * TAU) * 0.5 + 0.5;
    mul(px, 0.9 + (g1[i] - 0.5) * 0.22 + ring * 0.07 + (n3[i] - 0.5) * 0.04);
    const jd = Math.min(Math.min(u, 1 - u) * 2.44, Math.min(v, 1 - v) * 1.22);
    const joint = 1 - smooth(0.003, 0.008, jd);
    mul(px, 1 - joint * 0.6);
    // screws along the long edges every 0.305 m
    const su = fr(u * 8) - 0.5;
    const sv = Math.min(v, 1 - v) * 1.22 - 0.03;
    const sd = Math.hypot(su * 0.305, sv);
    const screw = 1 - smooth(0.006, 0.01, sd);
    mix(px, 70, 70, 74, screw * 0.9);
    px[3] = 0.6 + (g1[i] - 0.5) * 0.3 - joint * 0.5 - screw * 0.3;
    px[4] = 0.66 - screw * 0.3;
  });
}

function bamboo(size: number, seed: number): SurfaceMaps {
  const st = fbm(size, 64, 3, 3, seed);
  const n3 = fbm(size, 6, 6, 3, seed + 1);
  return paint(size, [0.4, 1.2], 0.02, (u, v, i, px) => {
    const cu = u * 4;
    const culm = Math.floor(cu);
    const f = fr(cu) * 2 - 1;
    const round = Math.sqrt(Math.max(0, 1 - f * f));
    const tone = hash2(culm, 1, seed);
    set(px, 172, 166, 88);
    mix(px, 200, 176, 110, tone * 0.8);
    mix(px, 128, 150, 70, hash2(culm, 2, seed) * 0.5);
    mul(px, 0.82 + (st[i] - 0.5) * 0.3 + n3[i] * 0.2);
    const nv = fr(v * 4 + hash2(culm, 5, seed));
    const nd = Math.abs(nv - 0.5);
    const node = 1 - smooth(0.004, 0.012, nd);
    const bulge = 1 - smooth(0.0, 0.05, nd);
    mul(px, 1 - node * 0.55);
    mul(px, 0.55 + round * 0.45);
    px[3] = round * 0.85 + bulge * 0.12 - node * 0.1;
    px[4] = 0.42 + st[i] * 0.2;
  });
}

function grass(size: number, seed: number): SurfaceMaps {
  const n1 = fbm(size, 4, 4, 4, seed);
  const bl = valueNoise(size, size >> 1, size >> 3, seed + 1);
  const bl2 = valueNoise(size, size >> 3, size >> 1, seed + 2);
  return paint(size, [3, 3], 0.012, (u, v, i, px) => {
    set(px, 84, 120, 50);
    mix(px, 132, 140, 62, smooth(0.5, 0.8, n1[i]) * 0.6);
    mix(px, 58, 96, 44, smooth(0.5, 0.2, n1[i]) * 0.5);
    const b = (bl[i] + bl2[i]) * 0.5;
    mul(px, 0.72 + b * 0.56);
    px[3] = b;
    px[4] = 0.94;
  });
}

function sand(size: number, seed: number): SurfaceMaps {
  const n1 = fbm(size, 3, 3, 4, seed);
  const n3 = valueNoise(size, size, size, seed + 1);
  return paint(size, [3, 3], 0.005, (u, v, i, px) => {
    set(px, 216, 192, 150);
    const rip = Math.sin((v * 14 + (n1[i] - 0.5) * 2.2) * TAU) * 0.5 + 0.5;
    mul(px, 0.9 + (n1[i] - 0.5) * 0.14 + (n3[i] - 0.5) * 0.1 + rip * 0.05);
    px[3] = 0.4 + rip * 0.4 + (n3[i] - 0.5) * 0.2;
    px[4] = 0.95;
  });
}

function tile(size: number, seed: number): SurfaceMaps {
  const n1 = fbm(size, 6, 6, 3, seed);
  return paint(size, [1.2, 1.2], 0.002, (u, v, i, px) => {
    const tx = Math.floor(u * 4);
    const ty = Math.floor(v * 4);
    const fu = fr(u * 4);
    const fv = fr(v * 4);
    const d = Math.min(Math.min(fu, 1 - fu), Math.min(fv, 1 - fv)) * 0.3;
    const inside = smooth(0.003, 0.007, d);
    const h = hash2(tx, ty, seed);
    set(px, 238, 240, 238);
    mul(px, 0.93 + h * 0.07 + (n1[i] - 0.5) * 0.04);
    mix(px, 150, 150, 144, 1 - inside);
    px[3] = inside * (0.8 + smooth(0.003, 0.02, d) * 0.1);
    px[4] = inside > 0.5 ? 0.14 + n1[i] * 0.1 : 0.9;
  });
}

/** Encaustic "Sino-Portuguese" floor tile: star, ring and quarter circles in terracotta / teal / navy on cream. */
function patternTile(size: number, seed: number): SurfaceMaps {
  const wear = fbm(size, 5, 5, 4, seed);
  const n3 = valueNoise(size, size, size, seed + 1);
  return paint(size, [0.8, 0.8], 0.0008, (u, v, i, px) => {
    const p = fr(u * 2) * 2 - 1;
    const q = fr(v * 2) * 2 - 1;
    const r = Math.hypot(p, q);
    const a = Math.atan2(q, p);
    set(px, 228, 216, 188);
    if (Math.hypot(Math.abs(p) - 1, Math.abs(q) - 1) < 0.4) set(px, 58, 76, 100);
    if (Math.abs(r - 0.8) < 0.065) set(px, 50, 112, 110);
    if (r < 0.52 + 0.2 * Math.cos(4 * a)) set(px, 178, 86, 56);
    if (r < 0.17) set(px, 228, 216, 188);
    const jd = Math.min(Math.min(Math.abs(p), 1 - Math.abs(p)), Math.min(Math.abs(q), 1 - Math.abs(q)));
    const edge = 1 - smooth(0.0, 0.02, 1 - Math.max(Math.abs(p), Math.abs(q)));
    mul(px, 1 - edge * 0.4);
    mul(px, 0.84 + wear[i] * 0.2 + (n3[i] - 0.5) * 0.06);
    px[3] = 0.6 - edge * 0.5 + jd * 0;
    px[4] = 0.3 + wear[i] * 0.25;
  });
}

function asphalt(size: number, seed: number): SurfaceMaps {
  const n1 = fbm(size, 3, 3, 4, seed);
  const n3 = valueNoise(size, size, size, seed + 1);
  const st = cells(size, 70, seed + 2);
  const cr = cells(size, 4, seed + 3);
  return paint(size, [4, 4], 0.003, (u, v, i, px) => {
    const g = 60 + (n1[i] - 0.5) * 22 + (n3[i] - 0.5) * 26;
    set(px, g, g, g + 2);
    const stone = (1 - smooth(0.1, 0.3, st.f1[i])) * st.id[i];
    mix(px, 132, 130, 126, stone * 0.5);
    const crack = (1 - smooth(0.0, 0.02, cr.edge[i])) * smooth(0.55, 0.62, n1[i]);
    mul(px, 1 - crack * 0.6);
    px[3] = 0.5 + stone * 0.4 + (n3[i] - 0.5) * 0.2 - crack * 0.5;
    px[4] = 0.9 - stone * 0.15;
  });
}

function steel(size: number, seed: number): SurfaceMaps {
  const br = fbm(size, 3, 128, 3, seed);
  const n1 = fbm(size, 4, 4, 3, seed + 1);
  return paint(
    size,
    [1, 1],
    0.0004,
    (u, v, i, px) => {
      const g = 184 + (br[i] - 0.5) * 34 + (n1[i] - 0.5) * 14;
      set(px, g - 2, g, g + 5);
      px[3] = br[i];
      px[4] = 0.26 + br[i] * 0.2 + n1[i] * 0.08;
      px[5] = 1;
    },
    { metal: true },
  );
}

function paintedMetal(size: number, seed: number): SurfaceMaps {
  const n3 = valueNoise(size, size >> 1, size >> 1, seed);
  const n1 = fbm(size, 4, 4, 4, seed + 1);
  const chips = cells(size, 14, seed + 2);
  const scr = fbm(size, 2, 96, 2, seed + 3);
  return paint(
    size,
    [2, 2],
    0.0008,
    (u, v, i, px) => {
      set(px, 240, 240, 240);
      mul(px, 0.95 + (n3[i] - 0.5) * 0.03 + (n1[i] - 0.5) * 0.08);
      const chip = (1 - smooth(0.05, 0.085, chips.f1[i] + (n1[i] - 0.5) * 0.08)) * (chips.id[i] > 0.74 ? 1 : 0);
      const rustRing = (1 - smooth(0.08, 0.14, chips.f1[i])) * (chips.id[i] > 0.74 ? 1 : 0) - chip;
      mix(px, 150, 96, 60, Math.max(0, rustRing) * 0.5);
      mix(px, 96, 92, 90, chip);
      const scratch = smooth(0.74, 0.78, scr[i]) * 0.5;
      mul(px, 1 - scratch * 0.2);
      px[3] = 0.6 - chip * 0.4 + (n3[i] - 0.5) * 0.1;
      px[4] = 0.36 + n1[i] * 0.14 + chip * 0.2 + scratch * 0.2;
      px[5] = chip * 0.8;
    },
    { metal: true },
  );
}

function rust(size: number, seed: number): SurfaceMaps {
  const n1 = fbm(size, 4, 4, 5, seed);
  const n2 = fbm(size, 16, 16, 3, seed + 1);
  const c = cells(size, 18, seed + 2);
  return paint(
    size,
    [1.5, 1.5],
    0.003,
    (u, v, i, px) => {
      set(px, 124, 64, 34);
      mix(px, 164, 88, 42, smooth(0.4, 0.7, n1[i]));
      mix(px, 72, 46, 36, smooth(0.55, 0.3, n2[i]) * 0.8);
      mul(px, 0.8 + c.f1[i] * 0.4);
      px[3] = n2[i] * 0.6 + c.f1[i] * 0.4;
      px[4] = 0.9;
      px[5] = 0.25;
    },
    { metal: true },
  );
}

function simple(r: number, g: number, b: number, rough: number, amount: number, tileM: number, bump: number) {
  return (size: number, seed: number): SurfaceMaps => {
    const n1 = fbm(size, 4, 4, 4, seed);
    const n3 = valueNoise(size, size >> 1, size >> 1, seed + 1);
    return paint(size, [tileM, tileM], bump, (u, v, i, px) => {
      set(px, r, g, b);
      mul(px, 1 + (n1[i] - 0.5) * amount + (n3[i] - 0.5) * amount * 0.6);
      px[3] = 0.5 + (n3[i] - 0.5) * 0.6 + (n1[i] - 0.5) * 0.3;
      px[4] = rough + (n1[i] - 0.5) * 0.12;
    });
  };
}

function roofTile(size: number, seed: number): SurfaceMaps {
  const n1 = fbm(size, 4, 4, 4, seed);
  const n3 = valueNoise(size, size >> 1, size >> 1, seed + 1);
  return paint(size, [1.2, 1.2], 0.035, (u, v, i, px) => {
    const cu = u * 4;
    const rv = v * 3;
    const col = Math.floor(cu);
    const row = Math.floor(rv);
    const f = fr(cu) * 2 - 1;
    const fv = fr(rv);
    const barrel = Math.sqrt(Math.max(0, 1 - f * f * 0.92));
    const tone = hash2(col, row, seed);
    set(px, 184, 92, 54);
    mix(px, 150, 70, 44, tone * 0.8);
    if (hash2(col, row, seed + 3) > 0.85) mix(px, 206, 124, 76, 0.6);
    // weathering: darker and mossier towards the lower (overlapped) end of each tile
    const low = smooth(0.25, 0.0, fv);
    mul(px, 0.82 + (n1[i] - 0.5) * 0.3 + (n3[i] - 0.5) * 0.1 - low * 0.3);
    mix(px, 84, 86, 60, smooth(0.62, 0.8, n1[i]) * 0.35);
    mul(px, 0.5 + barrel * 0.5);
    px[3] = barrel * 0.6 + (1 - fv) * 0.4;
    px[4] = 0.86;
  });
}

function fabric(size: number, seed: number): SurfaceMaps {
  const n1 = fbm(size, 4, 4, 3, seed);
  return paint(size, [0.25, 0.25], 0.0006, (u, v, i, px) => {
    const w = Math.sin(u * 48 * TAU) * Math.sin(v * 48 * TAU);
    set(px, 236, 236, 236);
    mul(px, 0.93 + w * 0.05 + (n1[i] - 0.5) * 0.06);
    px[3] = 0.5 + w * 0.5;
    px[4] = 0.92;
  });
}

function corrugated(size: number, seed: number): SurfaceMaps {
  const st = fbm(size, 40, 2, 3, seed);
  const n1 = fbm(size, 4, 4, 4, seed + 1);
  return paint(
    size,
    [1, 1],
    0.022,
    (u, v, i, px) => {
      const f = fr(u * 8);
      const wave = smooth(0.08, 0.3, f) - smooth(0.58, 0.8, f);
      set(px, 236, 236, 236);
      mul(px, 0.84 + wave * 0.14 + (n1[i] - 0.5) * 0.1 - smooth(0.6, 0.85, st[i]) * 0.14);
      px[3] = wave;
      px[4] = 0.5 + n1[i] * 0.16;
      px[5] = 0.2;
    },
    { metal: true },
  );
}

function bark(palm: boolean) {
  return (size: number, seed: number): SurfaceMaps => {
    const f1 = fbm(size, 20, 3, 4, seed);
    const n1 = fbm(size, 4, 4, 3, seed + 1);
    return paint(size, palm ? [0.6, 0.6] : [1, 1], 0.014, (u, v, i, px) => {
      if (palm) {
        const ring = fr(v * 5 + (n1[i] - 0.5) * 0.3);
        const scar = 1 - smooth(0.0, 0.16, Math.abs(ring - 0.5));
        set(px, 150, 132, 108);
        mul(px, 0.8 + (f1[i] - 0.5) * 0.3 - scar * 0.3 + n1[i] * 0.2);
        px[3] = 0.5 + ring * 0.4 - scar * 0.4;
      } else {
        const ridge = Math.abs(f1[i] - 0.5) * 2;
        set(px, 104, 82, 62);
        mix(px, 62, 48, 38, 1 - smooth(0.0, 0.3, ridge));
        mul(px, 0.85 + n1[i] * 0.3);
        px[3] = ridge;
      }
      px[4] = 0.95;
    });
  };
}

/**
 * Foliage atlas (NOT tileable). Left half: opaque leafy mass for canopy blobs. Right half: a ragged
 * leaf-clump silhouette (alpha) for the cards that break up the blob outline.
 */
function foliage(size: number, seed: number): SurfaceMaps {
  const leaves = cells(size, 22, seed);
  const n1 = fbm(size, 5, 5, 4, seed + 1);
  const edge = fbm(size, 10, 10, 3, seed + 2);
  return paint(
    size,
    [1, 1],
    0.02,
    (u, v, i, px) => {
      const leaf = 1 - smooth(0.0, 0.55, leaves.f1[i]);
      const lum = 0.55 + leaf * 0.5 + (leaves.id[i] - 0.5) * 0.3 + (n1[i] - 0.5) * 0.3;
      set(px, 190 * lum, 220 * lum, 150 * lum);
      px[3] = leaf;
      px[4] = 0.78;
      if (u > 0.5) {
        const cx = (u - 0.75) * 4;
        const cy = (v - 0.5) * 2;
        const r = Math.hypot(cx, cy);
        const ragged = r + (edge[i] - 0.5) * 0.7 + (1 - leaf) * 0.35;
        px[6] = ragged < 0.86 ? 1 : 0;
      }
    },
    { alpha: true },
  );
}

/** Palm frond: rachis along U, slanted leaflets, alpha cut-out. */
function frond(size: number, seed: number): SurfaceMaps {
  const n1 = fbm(size, 8, 8, 3, seed);
  return paint(
    size,
    [1, 1],
    0.01,
    (u, v, i, px) => {
      const w = Math.abs(v - 0.5) * 2;
      const env = Math.sin(Math.PI * Math.pow(u, 0.62)) * 0.96 + 0.04;
      const ph = fr(u * 26 - w * 1.4 + (n1[i] - 0.5) * 0.2);
      const leaflet = ph < 0.6 && w < env * (0.92 + (hash2(Math.floor(u * 26 - w * 1.4), 0, seed) - 0.5) * 0.3);
      const rachis = w < 0.035 && u < 0.97;
      const lum = 0.7 + (1 - w) * 0.2 + (n1[i] - 0.5) * 0.3 + u * 0.15;
      set(px, 150 * lum, 200 * lum, 96 * lum);
      if (rachis) set(px, 150, 150, 84);
      px[3] = rachis ? 1 : ph < 0.3 ? 0.7 : 0.4;
      px[4] = 0.6;
      px[6] = leaflet || rachis ? 1 : 0;
    },
    { alpha: true },
  );
}

/** Streaky water film normal (stairs, wet walls). */
function film(size: number, seed: number): SurfaceMaps {
  const st = fbm(size, 24, 3, 3, seed);
  const n1 = fbm(size, 6, 12, 3, seed + 1);
  return paint(size, [1, 1], 0.004, (u, v, i, px) => {
    set(px, 255, 255, 255);
    px[3] = st[i] * 0.6 + n1[i] * 0.4;
    px[4] = 0.04;
  });
}

/** Twisted rope: diagonal strands, white with red flecks (brand rope). U runs along the rope. */
function rope(size: number, seed: number): SurfaceMaps {
  return paint(size, [0.16, 0.05], 0.004, (u, v, i, px) => {
    const s = fr(u * 4 + v);
    const strand = Math.sin(s * Math.PI);
    const which = Math.floor(u * 4 + v) % 4;
    if (which === 1 && hash2(Math.floor(u * 4 + v), 0, seed) > 0.2) set(px, 226, 26, 34);
    else set(px, 236, 232, 222);
    mul(px, 0.6 + strand * 0.4);
    px[3] = strand;
    px[4] = 0.8;
  });
}

export const SURFACES: Record<string, SurfaceDef> = {
  concrete: { size: 512, gen: concrete(false) },
  wetConcrete: { size: 512, gen: concrete(true) },
  stone: { size: 512, gen: stonePaving },
  granite: { size: 256, gen: granite },
  marble: { size: 256, gen: marble },
  brick: { size: 512, gen: brick },
  plaster: { size: 512, gen: plaster },
  wood: { size: 256, gen: planks(false) },
  pallet: { size: 256, gen: planks(true) },
  plywood: { size: 256, gen: plywood },
  bamboo: { size: 256, gen: bamboo },
  grass: { size: 256, gen: grass },
  sand: { size: 256, gen: sand },
  tile: { size: 256, gen: tile },
  patternTile: { size: 256, gen: patternTile },
  asphalt: { size: 256, gen: asphalt },
  metal: { size: 256, gen: steel },
  paintedMetal: { size: 256, gen: paintedMetal },
  rust: { size: 256, gen: rust },
  rubber: { size: 128, gen: simple(38, 38, 40, 0.86, 0.3, 0.5, 0.002) },
  plastic: { size: 128, gen: simple(240, 240, 240, 0.34, 0.05, 1, 0.0006) },
  roofTile: { size: 256, gen: roofTile },
  fabric: { size: 128, gen: fabric },
  corrugated: { size: 256, gen: corrugated },
  bark: { size: 128, gen: bark(false) },
  palmBark: { size: 128, gen: bark(true) },
  foliage: { size: 256, gen: foliage },
  frond: { size: 256, gen: frond },
  film: { size: 128, gen: film },
  rope: { size: 64, gen: rope },
};
