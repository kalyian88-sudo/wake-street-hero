/**
 * Theme 'usa' — Miami Wynwood (pastel art deco, murals, royal palms) and Brooklyn Docks (brick
 * warehouses, water towers, piers, bridge + Manhattan skyline). Props:
 *   usa.deco            { bays=3, bayW=6, floors=2, depth=10 }   pastel art-deco row, facade faces local +Z, runs along local X
 *   usa.muralWarehouse  { w=20, h=6.5, depth=14, piece='WYNWOOD' } warehouse with a huge graffiti mural
 *   usa.royalPalm       { height=14 }
 *   usa.lifeguardHut    {}                                      stilted beach-style tower
 *   usa.classicCar      { color }                               simple parked cruiser (faces local +Z)
 *   usa.speedboat       { len=7 }  usa.tug { len=11 }           moored boats (bow to local +Z)
 *   usa.lamp            { height=5.2, style=0|1 }               street lamp / gas lamp
 *   usa.crates          { count=4 }  usa.containerStack {}      dock clutter
 *   usa.skylineMiami    { width=300 }  usa.causeway { span=420, rise=18 }   Miami landmark
 *   usa.brickWarehouse  { bays=3, bayW=5.5, floors=4, depth=12, tower=0, fire=1 }
 *   usa.pier            { len=14, width=3.2 }                   wooden pier on pilings along local Z
 *   usa.waterTower      { }
 *   usa.suspensionBridge{ span=170, towerH=78 }  usa.manhattan { width=420 }   Brooklyn landmark
 */
import type { PropContext, PropDef } from '../../types';
import { FACADE_UV, SIGN_UV } from '../decals';
import { GB } from '../geo';
import type { P3 } from '../geo';
import { registerProp } from '../props/registry';
import { Kit, lightLevel, num, pick, range, str } from '../props/common/util';

const PASTELS: readonly (readonly [number, number])[] = [
  [0xf7b6c8, 0x35c9c4], // pink / aqua
  [0xa8e6d4, 0xff7aa8], // mint / hot pink
  [0xfff0a8, 0x3cb8d8], // lemon / sky
  [0xffd2b0, 0x2fb8c0], // peach / teal
  [0xbfe3f5, 0xff8fb0], // sky / pink
  [0xe4c8f0, 0x2fc8a8], // lilac / jade
  [0xffffff, 0xff7aa8], // white / pink
];

function rep<T>(n: number, f: (i: number) => T): T[] {
  const a: T[] = [];
  for (let i = 0; i < n; i++) a.push(f(i));
  return a;
}

// ───────────────────────────────────────────────────────────── MIAMI ──

function deco(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const bays = Math.max(1, Math.round(num(ctx, def, 'bays', 3)));
  const bayW = num(ctx, def, 'bayW', 6);
  const floors = Math.max(1, Math.round(num(ctx, def, 'floors', 2)));
  const depth = num(ctx, def, 'depth', 10);
  const rng = ctx.rng;
  const groundH = 3.6;
  const floorH = 3.3;
  const wall = k.g('plaster');
  const trim = k.g('plaster');
  const stripe = k.g('flat');
  const facade = k.g('facade');
  const signs = k.g('signs');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const dark = k.g('flat');
  const glow = lightLevel(ctx);
  const x0 = -(bays * bayW) / 2;
  for (let b = 0; b < bays; b++) {
    const [wc, ac] = pick(rng, PASTELS);
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const fl = floors + (rng() < 0.3 ? 1 : 0);
    const h = groundH + fl * floorH;
    wall.color(wc).chamferBox(cx, 0, -depth / 2, bayW, h, depth, 0.45, 'y');
    // racing stripes near the top
    for (let s = 0; s < 3; s++) stripe.color(s === 1 ? 0xffffff : ac).boxB(cx, h - 1.0 - s * 0.32, 0.01, bayW + 0.02, 0.14, 0.05);
    // parapet cap with rounded look
    trim.color(0xffffff).chamferBox(cx, h - 0.05, 0.05, bayW + 0.1, 0.5, 0.5, 0.15, 'y');
    // windows with eyebrows
    for (let f = 0; f < fl; f++) {
      const y = groundH + f * floorH + 0.7;
      for (const wx of [cx - bayW * 0.25, cx + bayW * 0.25]) {
        const uv = rng() < 0.7 ? FACADE_UV.rectGlass : FACADE_UV.rectGlassDark;
        facade.white().quadUV([wx - 0.8, y, 0.03], [wx + 0.8, y, 0.03], [wx + 0.8, y + 1.6, 0.03], [wx - 0.8, y + 1.6, 0.03], uv[0], uv[1], uv[2], uv[3]);
        trim.color(0xffffff).boxB(wx, y + 1.62, 0.22, 2.0, 0.09, 0.5);
        trim.boxB(wx, y - 0.08, 0.06, 1.8, 0.08, 0.14);
      }
    }
    // ground floor shop glass + awning + neon tube
    const shop = FACADE_UV.shopGlass;
    facade.white().quadUV([cx - 1.7, 0.02, 0.03], [cx + 1.7, 0.02, 0.03], [cx + 1.7, 3.0, 0.03], [cx - 1.7, 3.0, 0.03], shop[0], shop[1], shop[2], shop[3]);
    stripe.color(ac).boxB(cx, 3.05, 0.6, bayW - 0.6, 0.1, 1.2);
    neon.color(ac, glow).boxB(cx, 3.5, 0.07, bayW - 0.5, 0.07, 0.07);
    neon.color(0xffffff, glow * 0.8).boxB(cx, h - 0.45, 0.06, bayW - 0.5, 0.05, 0.05);
    // tower fin with a blade sign
    if (rng() < 0.45) {
      trim.color(wc).boxB(cx, h + 0.2, 0.0, 0.6, 2.6, 0.5);
      neon.color(ac, glow).boxB(cx - 0.32, h + 0.5, 0.2, 0.05, 2.2, 0.05);
      neon.boxB(cx + 0.32, h + 0.5, 0.2, 0.05, 2.2, 0.05);
    } else if (rng() < 0.7) {
      const s = SIGN_UV.v[Math.floor(rng() * SIGN_UV.v.length)];
      const px = cx + bayW * 0.5 - 0.1;
      signs.white().quadUV([px, groundH + 0.2, 0.9], [px, groundH + 0.2, 0.2], [px, groundH + 3.4, 0.2], [px, groundH + 3.4, 0.9], s[0], s[1], s[2], s[3]);
    } else {
      const s = SIGN_UV.h[Math.floor(rng() * SIGN_UV.h.length)];
      signs.white().quadUV([cx - 1.6, 3.6, 1.22], [cx + 1.6, 3.6, 1.22], [cx + 1.6, 4.35, 1.22], [cx - 1.6, 4.35, 1.22], s[0], s[1], s[2], s[3]);
    }
    if (rng() < 0.5) dark.color(0xd8d8d0).boxB(cx + range(rng, -1.5, 1.5), h + 0.4, -3, 1.8, 0.9, 1.4);
  }
  k.flush();
}

function muralWarehouse(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const w = num(ctx, def, 'w', 20);
  const h = num(ctx, def, 'h', 6.5);
  const depth = num(ctx, def, 'depth', 14);
  const piece = str(def, 'piece', 'WYNWOOD');
  const seed = Math.floor(num(ctx, def, 'seed', 11));
  const rng = ctx.rng;
  const wall = k.g('plaster');
  const dark = k.g('flat');
  const metal = k.g('corrugated');
  wall.color(pick(rng, [0xf0ece4, 0xe8e0d0, 0xdfe8ec, 0xf4e8dc])).boxB(0, 0, -depth / 2, w, h, depth, 'y');
  wall.color(0xffffff).boxB(0, h, 0.05, w + 0.2, 0.3, 0.4);
  // big mural (4:1 texture)
  const mh = Math.min(h - 0.6, w / 4);
  const mw = mh * 4;
  const g = k.g('graffiti', undefined, { seed, piece });
  g.white().quadUV([-mw / 2, 0.4, 0.04], [mw / 2, 0.4, 0.04], [mw / 2, 0.4 + mh, 0.04], [-mw / 2, 0.4 + mh, 0.04], 0, 0, 1, 1);
  if (w - mw > 3) {
    const g2 = k.g('graffiti', undefined, { seed: seed + 5, piece: str(def, 'piece2', 'ART') });
    const s2 = (w - mw) / 2;
    g2.white().quadUV([mw / 2, 0.5, 0.04], [mw / 2 + s2 * 0.95, 0.5, 0.04], [mw / 2 + s2 * 0.95, 0.5 + s2 * 0.24, 0.04], [mw / 2, 0.5 + s2 * 0.24, 0.04], 0, 0, 1, 1);
  }
  dark.color(0x33363c).boxB(-w / 2 + 1.7, 0, 0.1, 2.6, 2.6, 0.1);
  metal.color(0x8a9096).boxB(w / 2 - 3, h, -depth / 2, 2.5, 1.0, 3);
  k.flush();
}

function royalPalm(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const h = num(ctx, def, 'height', 14) * range(ctx.rng, 0.9, 1.1);
  const rng = ctx.rng;
  const trunk = k.g('palmBark');
  const fronds = k.g('frond');
  const lean = range(rng, -0.35, 0.35);
  trunk.color(0xd4cdbf);
  const pts: P3[] = rep(7, (i) => {
    const t = i / 6;
    return [lean * t * t * h * 0.12, t * h * 0.82, 0] as P3;
  });
  trunk.tube(pts, 0.3, 8, { caps: 'flat', radiusAt: (i, n) => 1 + 0.3 * Math.sin((i / (n - 1)) * 3.1) * 0.5 - (i / (n - 1)) * 0.35, vScale: 0.5 });
  const top = pts[6];
  trunk.color(0x7ab04a).cyl(top[0], top[1], 0, 0.22, 0.2, h * 0.14, 8);
  const cy = top[1] + h * 0.14;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.4;
    const elev = i % 3 === 0 ? 0.9 : 0.3 + rng() * 0.4;
    const L = h * 0.3 * range(rng, 0.9, 1.1);
    const droop = i % 3 === 0 ? 0.3 : 1.1;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const segs = 4;
    const hw = 0.55;
    fronds.color(0xb4e08a, range(rng, 0.8, 1.1));
    let pl: P3 | null = null;
    let pr: P3 | null = null;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const r = L * t * Math.cos(elev * (1 - t * 0.4));
      const y = L * (Math.sin(elev) * t - droop * t * t * 0.75);
      const px = top[0] + dx * r;
      const py = cy + y;
      const pz = dz * r;
      const wv = hw * (1 - 0.5 * t);
      const l: P3 = [px - dz * wv, py - wv * 0.4, pz + dx * wv];
      const rr: P3 = [px + dz * wv, py - wv * 0.4, pz - dx * wv];
      if (pl && pr) fronds.quadUV(pl, l, rr, pr, (s - 1) / segs, 0, t, 1);
      pl = l;
      pr = rr;
    }
  }
  k.flush();
}

function lifeguardHut(_def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const wood = k.g('wood');
  const paint = k.g('plaster');
  const roof = k.g('flat');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const glow = lightLevel(ctx);
  const sh = 2.1;
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) wood.color(0xe8e0d0).boxB(x, 0, z, 0.2, sh, 0.2);
  wood.color(0xf0e8d8).boxB(0, sh, 0, 3.2, 0.12, 3.2);
  paint.color(0xff9ab8).boxB(0, sh + 0.12, 0, 2.6, 1.7, 2.6, 'y');
  paint.color(0x35c9c4).boxB(0, sh + 0.9, 0, 2.64, 0.3, 2.64, 'yY');
  paint.color(0xffffff).boxB(0, sh + 1.2, 0.0, 2.64, 0.2, 2.64, 'yY');
  roof.color(0x35c9c4).chamferBox(0, sh + 1.82, 0, 3.4, 0.22, 3.4, 0.1);
  neon.color(0xff5a9a, glow).boxB(0, sh + 1.82, 1.72, 3.2, 0.05, 0.05);
  wood.color(0x2a3a4a).boxB(0, sh + 0.7, 1.31, 1.5, 0.7, 0.04);
  // ladder
  for (const x of [-0.45, 0.45]) wood.color(0xe8e0d0).beam([x, 0, 2.3], [x, sh, 1.5], 0.07);
  for (let i = 1; i < 6; i++) wood.beam([-0.45, (i / 6) * sh, 2.3 - (i / 6) * 0.8], [0.45, (i / 6) * sh, 2.3 - (i / 6) * 0.8], 0.05);
  // flag mast
  wood.color(0xffffff).boxB(1.3, sh + 1.8, -1.3, 0.06, 1.6, 0.06);
  paint.color(0xff3a6a).boxB(1.55, sh + 2.8, -1.3, 0.5, 0.3, 0.02);
  k.flush();
}

function classicCar(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const body = k.g('paintedMetal');
  const glass = k.g('glass');
  const tyre = k.g('flat');
  const chrome = k.g('metal');
  const col = typeof def.params?.color === 'number' ? (def.params.color as number) : pick(ctx.rng, [0x35c9c4, 0xff7aa8, 0xfff0a8, 0xf5f0e8, 0xff5a4a]);
  body.color(col).chamferBox(0, 0.32, 0, 1.9, 0.62, 4.9, 0.12, 'y');
  body.color(col, 0.95).chamferBox(0, 0.9, -0.25, 1.6, 0.5, 2.3, 0.14, 'y');
  body.color(col).boxB(-0.78, 0.9, -1.9, 0.12, 0.4, 0.5);
  body.boxB(0.78, 0.9, -1.9, 0.12, 0.4, 0.5);
  glass.color(0x1c2630).boxB(0, 0.93, -0.25, 1.64, 0.42, 2.0, 'yY');
  body.color(col, 0.9).boxB(0, 1.4, -0.25, 1.5, 0.06, 2.2);
  chrome.color(0xe8e8e8).boxB(0, 0.4, 2.47, 1.9, 0.18, 0.08);
  chrome.boxB(0, 0.4, -2.47, 1.9, 0.18, 0.08);
  for (const [x, z] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) {
    tyre.color(0x15161a).rod([x - 0.1, 0.34, z], [x + 0.1, 0.34, z], 0.34, 10, true);
    chrome.color(0xdddddd).rod([x - 0.115, 0.34, z], [x + 0.115, 0.34, z], 0.17, 8, true);
  }
  k.flush();
}

function hull(g: GB, len: number, w: number, bowH: number, sternH: number, keel: number): void {
  g.push().rotY(Math.PI / 2);
  g.prism(
    [
      [-len / 2, bowH],
      [-len / 2 + len * 0.28, keel],
      [len / 2 - 0.2, keel],
      [len / 2, sternH],
    ],
    -w / 2,
    w / 2,
  );
  g.pop();
}

function speedboat(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const len = num(ctx, def, 'len', 7);
  const body = k.g('paintedMetal');
  const trim = k.g('flat');
  const glass = k.g('glass');
  body.color(0xf8f6f0);
  hull(body, len, 2.1, 0.75, 0.55, -0.3);
  trim.color(pick(ctx.rng, [0x35c9c4, 0xff7aa8, 0x3a6ad8])).boxB(0, 0.2, 0, 2.14, 0.14, len * 0.92);
  body.color(0xf8f6f0).chamferBox(0, 0.55, -len * 0.06, 1.7, 0.7, len * 0.3, 0.1);
  glass.color(0x1c2630).boxB(0, 0.85, len * 0.02, 1.5, 0.35, len * 0.14, 'yY');
  trim.color(0x202428).boxB(0, 0.5, -len * 0.42, 1.0, 0.5, 0.4);
  k.flush();
}

function tug(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const len = num(ctx, def, 'len', 11);
  const body = k.g('paintedMetal');
  const rust = k.g('rust');
  const flat = k.g('flat');
  const glass = k.g('glass');
  body.color(0x2a3440);
  hull(body, len, 3.6, 1.5, 1.1, -0.9);
  flat.color(0xc4402e).boxB(0, 0.15, 0, 3.66, 0.18, len * 0.92);
  body.color(0xe8e2d4).chamferBox(0, 1.1, -len * 0.12, 2.6, 1.6, len * 0.3, 0.1);
  glass.color(0x1c2630).boxB(0, 1.8, len * 0.05, 2.1, 0.5, 0.06, 'yY');
  body.color(0xe8e2d4).boxB(0, 2.7, -len * 0.14, 2.2, 0.15, len * 0.26);
  flat.color(0x15161a).cyl(0, 2.7, -len * 0.2, 0.55, 0.45, 1.4, 10);
  flat.color(0xc4402e).cyl(0, 3.6, -len * 0.2, 0.46, 0.45, 0.3, 10);
  rust.color(0x6a4a3a);
  for (let i = 0; i < 4; i++) rust.rod([-1.85, 0.7, len * (0.2 - i * 0.1)], [-1.85, 0.7, len * (0.18 - i * 0.1)], 0.22, 6, true);
  k.flush();
}

function lamp(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const h = num(ctx, def, 'height', 5.2);
  const style = Math.floor(num(ctx, def, 'style', 0));
  const post = k.g('metal');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const glow = lightLevel(ctx);
  post.color(style ? 0x1e2226 : 0x3a8f8a).cyl(0, 0, 0, 0.14, 0.08, h, 7);
  post.cyl(0, 0, 0, 0.22, 0.2, 0.5, 7);
  if (style) {
    post.color(0x1e2226).boxB(0, h, 0, 0.42, 0.1, 0.42);
    neon.color(0xffd890, glow).boxB(0, h + 0.1, 0, 0.3, 0.4, 0.3);
    post.boxB(0, h + 0.5, 0, 0.4, 0.08, 0.4);
  } else {
    post.beam([0, h, 0], [0.9, h + 0.35, 0], 0.09);
    neon.color(0xfff0d0, glow).boxB(0.95, h + 0.28, 0, 0.5, 0.07, 0.22);
  }
  k.flush();
}

function crates(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const n = Math.round(num(ctx, def, 'count', 4));
  const wood = k.g('pallet');
  const rust = k.g('rust');
  const rng = ctx.rng;
  for (let i = 0; i < n; i++) {
    const s = range(rng, 0.8, 1.2);
    wood.color(0xc9a878, range(rng, 0.8, 1.05)).boxR(i * 1.3 + range(rng, -0.1, 0.1), s / 2, range(rng, -0.2, 0.2), s, s, s, range(rng, -0.3, 0.3));
    if (i % 3 === 1) wood.boxR(i * 1.3 - 0.3, s * 1.5, 0, 0.8, 0.8, 0.8, 0.5);
  }
  rust.color(0xa05838).cyl(n * 1.3 + 0.2, 0, 0.2, 0.36, 0.36, 0.9, 10);
  rust.color(0x3a6a8a).cyl(n * 1.3 + 0.8, 0, -0.2, 0.36, 0.36, 0.9, 10);
  k.flush();
}

function containerStack(_def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const c = k.g('corrugated');
  const cols = [0xc4402e, 0x2f6a9a, 0xd8b03a, 0x4a8a5a, 0xb0b4b8];
  const rng = ctx.rng;
  for (let i = 0; i < 3; i++) {
    c.color(pick(rng, cols)).boxB(i * 2.6, 0, 0, 2.4, 2.6, 6.0);
    if (i !== 1) c.color(pick(rng, cols)).boxB(i * 2.6, 2.6, 0, 2.4, 2.6, 6.0);
  }
  k.flush();
}

function skylineMiami(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const width = num(ctx, def, 'width', 300);
  const rng = ctx.rng;
  const glass = k.g('flat');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const glow = lightLevel(ctx) * 0.6;
  const n = 18;
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + (width * (i + range(rng, 0.2, 0.8))) / n;
    const z = range(rng, -25, 25);
    const w = range(rng, 12, 22);
    const d = range(rng, 12, 20);
    const h = range(rng, 40, 110) * (1 - Math.abs(x) / width * 0.6);
    const hue = pick(rng, [[0x5aa8c8, 0x8ecbe0], [0x4a90b8, 0x7ab8d4], [0x6ab0b8, 0x9ad0d4], [0xd8eaf4, 0xb0cfe0], [0x3c7aa0, 0x6aa8c8]]);
    const bands = Math.max(4, Math.round(h / 4));
    for (let b = 0; b < bands; b++) {
      glass.color(hue[b & 1], 0.62 + (b / bands) * 0.25).boxB(x, (h * b) / bands, z, w, h / bands, d, b === bands - 1 ? '' : 'yY');
    }
    if (i % 4 === 1) {
      glass.color(0xe8f0f4).boxB(x, h, z, w * 0.5, 7, d * 0.5);
      neon.color(0xff5aa8, glow).boxB(x, h + 7, z, w * 0.52, 0.8, d * 0.52);
    } else if (i % 5 === 2) {
      glass.color(0xcfd8de).cyl(x, h, z, 0.3, 0.1, 22, 5);
    }
  }
  k.flush();
}

function causeway(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const span = num(ctx, def, 'span', 420);
  const rise = num(ctx, def, 'rise', 18);
  const conc = k.g('concrete');
  const rail = k.g('flat');
  const steel = k.g('metal');
  const deckY = (x: number): number => 9 + rise * Math.exp(-Math.pow(x / (span * 0.16), 2));
  const step = 8;
  const half = span / 2;
  for (let x = -half; x < half; x += step) {
    const a: P3 = [x, deckY(x), 0];
    const b: P3 = [x + step, deckY(x + step), 0];
    conc.color(0xe4e2dc).beam(a, b, 11, 1.4);
    rail.color(0xc8ccd0).beam([x, deckY(x) + 1.0, -5.4], [x + step, deckY(x + step) + 1.0, -5.4], 0.12, 0.9);
    rail.beam([x, deckY(x) + 1.0, 5.4], [x + step, deckY(x + step) + 1.0, 5.4], 0.12, 0.9);
  }
  for (let x = -half; x <= half; x += 16) {
    const y = deckY(x);
    conc.color(0xd8d6d0).cyl(x, -3, -2.6, 1.1, 1.0, y + 3 - 0.7, 8);
    conc.cyl(x, -3, 2.6, 1.1, 1.0, y + 3 - 0.7, 8);
    conc.boxB(x, y - 1.3, 0, 1.2, 0.6, 9);
  }
  // pylons + stay cables on the high span
  for (const px of [-span * 0.09, span * 0.09]) {
    const y = deckY(px);
    steel.color(0xf4f0e8).boxB(px, y, -5.4, 1.4, 26, 1.4);
    steel.boxB(px, y, 5.4, 1.4, 26, 1.4);
    for (let i = 1; i <= 7; i++) {
      for (const sgn of [-1, 1]) {
        const tx = px + sgn * i * 4.5;
        for (const z of [-5.4, 5.4]) steel.color(0xe8e4dc).rod([px, y + 25, z], [tx, deckY(tx) + 1, z], 0.09, 4);
      }
    }
  }
  k.flush();
}

// ─────────────────────────────────────────────────────────── BROOKLYN ──

const BRICKS: readonly number[] = [0xb04c38, 0xa0442e, 0xc2694a, 0x8e4234, 0xb85c42];

function waterTowerGeo(g: GB, ox: number, oy: number, oz: number, s: number): void {
  const wood = 0x8a5a38;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.color(0x2a2522).rod([ox + x * 1.1 * s, oy, oz + z * 1.1 * s], [ox + x * 1.3 * s, oy + 2.6 * s, oz + z * 1.3 * s], 0.08 * s, 5);
  }
  g.color(0x2a2522).beam([ox - 1.1 * s, oy + 0.4 * s, oz - 1.1 * s], [ox + 1.1 * s, oy + 1.6 * s, oz + 1.1 * s], 0.05 * s);
  g.beam([ox + 1.1 * s, oy + 0.4 * s, oz - 1.1 * s], [ox - 1.1 * s, oy + 1.6 * s, oz + 1.1 * s], 0.05 * s);
  g.color(wood).cyl(ox, oy + 2.6 * s, oz, 1.55 * s, 1.55 * s, 2.6 * s, 12);
  for (const y of [0.4, 1.3, 2.2]) g.color(0x1e1e20).cyl(ox, oy + (2.6 + y) * s, oz, 1.6 * s, 1.6 * s, 0.07 * s, 12);
  g.color(0x4a3a30).cyl(ox, oy + 5.2 * s, oz, 1.7 * s, 0.05, 1.1 * s, 12);
}

function brickWarehouse(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const bays = Math.max(1, Math.round(num(ctx, def, 'bays', 3)));
  const bayW = num(ctx, def, 'bayW', 5.5);
  const floors = Math.max(2, Math.round(num(ctx, def, 'floors', 4)));
  const depth = num(ctx, def, 'depth', 12);
  const fire = Math.round(num(ctx, def, 'fire', 1));
  const tower = Math.round(num(ctx, def, 'tower', 0));
  const rng = ctx.rng;
  const groundH = 4.2;
  const floorH = 3.5;
  const wall = k.g('brick');
  const stone = k.g('granite');
  const facade = k.g('facade');
  const signs = k.g('signs');
  const iron = k.g('flat');
  const wood = k.g('wood');
  const x0 = -(bays * bayW) / 2;
  const h = groundH + floors * floorH;
  const brick = pick(rng, BRICKS);
  for (let b = 0; b < bays; b++) {
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    wall.color(brick, range(rng, 0.9, 1.08)).boxB(cx, 0, -depth / 2, bayW, h, depth, 'y');
    stone.color(0xb8aa96).boxB(cx, 0, 0.04, bayW, 0.7, 0.1);
    // ground floor: big timber door + transom window
    wood.color(0x5a4430).boxB(cx, 0.05, 0.05, 2.2, 3.2, 0.1);
    stone.color(0xcfc4b0).boxB(cx, 3.25, 0.08, 2.7, 0.3, 0.18);
    // upper floors: arched windows with stone sills
    for (let f = 0; f < floors; f++) {
      const y = groundH + f * floorH + 0.4;
      for (const wx of [cx - bayW * 0.26, cx + bayW * 0.26]) {
        const uv = rng() < 0.85 ? FACADE_UV.archGlass : FACADE_UV.archLouvre[1];
        facade.white().quadUV([wx - 0.7, y, 0.03], [wx + 0.7, y, 0.03], [wx + 0.7, y + 2.4, 0.03], [wx - 0.7, y + 2.4, 0.03], uv[0], uv[1], uv[2], uv[3]);
        stone.color(0xcfc4b0).boxB(wx, y - 0.1, 0.1, 1.6, 0.12, 0.2);
        stone.boxB(wx, y + 2.38, 0.07, 1.7, 0.1, 0.12);
      }
    }
    stone.color(0xd8cdb8).boxB(cx, groundH - 0.1, 0.1, bayW, 0.2, 0.22);
    // cornice
    stone.color(0xd8cdb8).boxB(cx, h - 0.35, 0.28, bayW, 0.45, 0.6);
    stone.boxB(cx, h + 0.1, 0.1, bayW, 0.4, 0.32);
    // painted brand sign near the top (faded)
    if (rng() < 0.35) {
      const s = SIGN_UV.h[Math.floor(rng() * SIGN_UV.h.length)];
      signs.color(0xbbbbbb).quadUV([cx - 1.6, h - 2.4, 0.04], [cx + 1.6, h - 2.4, 0.04], [cx + 1.6, h - 1.6, 0.04], [cx - 1.6, h - 1.6, 0.04], s[0], s[1], s[2], s[3]);
    }
  }
  // fire escape on one bay
  if (fire > 0) {
    const fx = x0 + bayW * (bays > 1 ? 1.5 : 0.5);
    const w = 2.6;
    for (let f = 0; f < floors; f++) {
      const y = groundH + f * floorH + 0.3;
      iron.color(0x23262a).boxB(fx, y, 0.9, w, 0.07, 1.5);
      iron.boxB(fx, y + 0.9, 1.62, w, 0.05, 0.05);
      iron.boxB(fx - w / 2, y + 0.9, 0.9, 0.05, 0.05, 1.5);
      iron.boxB(fx + w / 2, y + 0.9, 0.9, 0.05, 0.05, 1.5);
      if (f < floors - 1) {
        const dir = f % 2 ? 1 : -1;
        iron.beam([fx + dir * 1.0, y + 0.05, 0.9], [fx - dir * 1.0, y + floorH, 0.9], 0.09, 0.05);
        iron.beam([fx + dir * 1.0, y + 0.95, 0.9], [fx - dir * 1.0, y + floorH + 0.9, 0.9], 0.04);
      }
    }
  }
  // flat roof + chimney + water tower
  if (tower > 0) waterTowerGeo(iron, x0 + bayW * 0.7, h + 0.5, -depth * 0.35, 1.0);
  iron.color(0x6a3a2e).boxB(x0 + bayW * bays * 0.8, h + 0.5, -depth * 0.55, 1.2, 3.2, 1.2);
  k.flush();
}

function pier(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const len = num(ctx, def, 'len', 14);
  const w = num(ctx, def, 'width', 3.2);
  const wood = k.g('wood');
  const pile = k.g('bark');
  const rope = k.g('flat');
  // deck runs along local Z from 0..len, sits at local y = 0 (placed at quay level + 0.04 by the spot)
  wood.color(0xb09070).boxB(0, 0, len / 2, w, 0.16, len);
  for (let z = 0.8; z < len; z += 2.2) wood.color(0x6a5038).boxB(0, -0.3, z, w + 0.3, 0.18, 0.3);
  for (let z = 0.5; z <= len; z += 2.7) {
    for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) {
      pile.color(0x4a3a2e).cyl(x, -4.2, z, 0.2, 0.17, 4.9, 7);
      rope.color(0x23262a).cyl(x, 0.16, z, 0.14, 0.12, 0.34, 6);
    }
  }
  k.flush();
}

function waterTowerProp(_def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  waterTowerGeo(k.g('flat'), 0, 0, 0, 1.4);
  k.flush();
}

function suspensionBridge(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const span = num(ctx, def, 'span', 170);
  const th = num(ctx, def, 'towerH', 78);
  const stone = k.g('granite');
  const steel = k.g('metal');
  const deck = k.g('flat');
  const half = span / 2;
  const deckY = 30;
  const side = 75;
  // Towers: pointed-arch silhouette in the ZY plane, extruded along X (the roadway runs through the arch).
  const towerOutline = (): [number, number][] => {
    const o: [number, number][] = [[-14, -6], [-7.5, -6], [-7.5, 46]];
    for (let i = 1; i <= 5; i++) {
      const t = i / 6;
      o.push([-7.5 + 7.5 * t * (2 - t), 46 + 15 * Math.pow(t, 0.75)]);
    }
    o.push([0, 61.5]);
    for (let i = 5; i >= 1; i--) {
      const t = i / 6;
      o.push([7.5 - 7.5 * t * (2 - t), 46 + 15 * Math.pow(t, 0.75)]);
    }
    o.push([7.5, 46], [7.5, -6], [14, -6], [14, th - 6], [10, th], [-10, th], [-14, th - 6]);
    return o;
  };
  stone.color(0xa49680);
  for (const sx of [-half, half]) {
    stone.push().translate(sx, 0, 0).rotY(Math.PI / 2);
    const v0 = stone.vertexCount;
    stone.prism(towerOutline(), -4.5, 4.5);
    stone.shadeBy(v0, (_x, y) => 0.72 + 0.34 * Math.min(1, y / th));
    stone.pop();
    // tower cap / finials
    stone.color(0x8f8068).boxB(sx, th, -5, 1.2, 4, 1.2);
    stone.boxB(sx, th, 5, 1.2, 4, 1.2);
    stone.color(0xa49680);
  }
  // anchorage blocks
  for (const sx of [-half - side, half + side]) stone.color(0x8f8068).boxB(sx, -6, 0, 18, deckY + 6, 16);
  // Deck: girder along X
  deck.color(0x3a3e44).boxB(0, deckY - 1.2, 0, span + side * 2, 2.4, 13);
  steel.color(0x6a7078);
  for (let x = -half - side; x < half + side; x += 6) {
    steel.boxB(x, deckY + 1.2, -6.4, 0.2, 2.6, 0.2);
    steel.boxB(x, deckY + 1.2, 6.4, 0.2, 2.6, 0.2);
  }
  steel.boxB(0, deckY + 3.7, -6.4, span + side * 2, 0.2, 0.2);
  steel.boxB(0, deckY + 3.7, 6.4, span + side * 2, 0.2, 0.2);
  // Main cables (2) + suspenders + diagonal stays
  const cableY = (x: number): number => {
    const ax = Math.abs(x);
    if (ax <= half) return deckY + 4 + (th - deckY - 4 + 0) * Math.pow(x / half, 2);
    const t = (ax - half) / side;
    return th - (th - deckY - 6) * t - 6 * Math.sin(Math.PI * t) * 0.5;
  };
  for (const z of [-6.4, 6.4]) {
    const pts: P3[] = [];
    for (let x = -half - side; x <= half + side; x += 5) pts.push([x, cableY(x), z]);
    steel.color(0x2a2e34).tube(pts, 0.55, 5, { caps: 'none' });
    for (let x = -half + 6; x < half; x += 6) steel.color(0x4a4e54).rod([x, deckY + 1, z], [x, cableY(x), z], 0.06, 3);
    for (const sx of [-half, half]) {
      for (let i = 1; i <= 10; i++) {
        const dx = (sx > 0 ? -1 : 1) * i * 6.5;
        const ax = sx + dx;
        steel.color(0x4a4e54).rod([sx, th - 2, z], [ax, deckY + 3.7, z], 0.05, 3);
        const bx = sx - dx * 0.8 + (sx > 0 ? 0 : 0);
        if (Math.abs(bx) < half + side - 2) steel.rod([sx, th - 2, z], [bx, deckY + 3.7, z], 0.05, 3);
      }
    }
  }
  k.flush();
}

function manhattan(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const width = num(ctx, def, 'width', 420);
  const rng = ctx.rng;
  const g = k.g('flat');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const glow = lightLevel(ctx) * 0.5;
  const palette = [0x3a4558, 0x4a5568, 0x2f3a4a, 0x5a5f6e, 0x3c4a5c];
  const band = (x: number, z: number, w: number, d: number, y0: number, y1: number, c: number): void => {
    const nb = Math.max(1, Math.round((y1 - y0) / 4));
    for (let b = 0; b < nb; b++) {
      const bh = (y1 - y0) / nb;
      g.color(c, b % 2 ? 1.12 : 0.88).boxB(x, y0 + b * bh, z, w, bh, d, b === nb - 1 ? '' : 'yY');
    }
  };
  const n = 36;
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + (width * (i + range(rng, 0.1, 0.9))) / n;
    if (Math.abs(x - 40) < 12) continue; // the spire gets this slot
    const z = range(rng, -20, 20);
    const w = range(rng, 9, 18);
    const d = range(rng, 9, 16);
    const mid = 1 - Math.pow(Math.abs(x - 40) / (width * 0.6), 2);
    const h = (range(rng, 30, 80) + 40 * mid * rng()) * 0.9;
    const c = pick(rng, palette);
    band(x, z, w, d, -4, h * 0.7, c);
    band(x, z, w * 0.75, d * 0.75, h * 0.7, h, c);
    if (rng() < 0.3) g.color(0x2a3040).boxB(x, h, z, 1.2, 12, 1.2);
    if (rng() < 0.2) {
      g.color(0x6a5a50).boxB(x - w * 0.15, h, z, w * 0.3, 5, d * 0.3);
      neon.color(0xff9a3a, glow).boxB(x, h * 0.7, z + d * 0.38, w * 0.7, 0.5, 0.2);
    }
  }
  // the very tall stepped spire tower
  const sx = 40;
  const base = 56;
  band(sx, 0, 26, 24, -4, base, 0x4a5262);
  band(sx, 0, 20, 18, base, base + 40, 0x555d6e);
  band(sx, 0, 13, 12, base + 40, base + 70, 0x5e6678);
  band(sx, 0, 8, 8, base + 70, base + 92, 0x666e80);
  g.color(0x7a8092).boxB(sx, base + 92, 0, 4.5, 14, 4.5);
  g.color(0x8a90a2).cyl(sx, base + 106, 0, 2.2, 0.6, 12, 8);
  g.color(0xb0b6c4).cyl(sx, base + 118, 0, 0.5, 0.12, 40, 5);
  neon.color(0xffe0a0, glow * 1.5).boxB(sx, base + 92, 2.3, 3.4, 0.6, 0.3);
  neon.color(0xff7a3a, glow * 1.5).boxB(sx, base + 70, 4.1, 6, 0.5, 0.3);
  k.flush();
}

registerProp('usa.deco', deco);
registerProp('usa.muralWarehouse', muralWarehouse);
registerProp('usa.royalPalm', royalPalm);
registerProp('usa.lifeguardHut', lifeguardHut);
registerProp('usa.classicCar', classicCar);
registerProp('usa.speedboat', speedboat);
registerProp('usa.tug', tug);
registerProp('usa.lamp', lamp);
registerProp('usa.crates', crates);
registerProp('usa.containerStack', containerStack);
registerProp('usa.skylineMiami', skylineMiami);
registerProp('usa.causeway', causeway);
registerProp('usa.brickWarehouse', brickWarehouse);
registerProp('usa.pier', pier);
registerProp('usa.waterTower', waterTowerProp);
registerProp('usa.suspensionBridge', suspensionBridge);
registerProp('usa.manhattan', manhattan);
