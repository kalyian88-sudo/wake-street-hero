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
 *   usa.quay            { length=40, style=0|1, top, gaps=[..], skip=[..], ladderAt=[..] }  canal edge dressing along local Z
 *                       (wall face = plane x = 0 facing −X): 0 Miami seawall + kerb blocks, 1 Brooklyn granite dock wall + bollards
 *   usa.utilityRun      { count=6, spacing=30, side=1, lamp=0 }   wooden poles with wires / transformers along local +Z
 *   usa.chainLink       { length=6, height=2.2, ret=0 }  usa.dumpster { color }  usa.streetKit { kind=0..3 }  usa.van { color }
 *   usa.crane           { height=62, boom=1 }  usa.pileField { w=20, d=14, rows=4 }  usa.dockClutter { kind=0..2, count=2 }
 *   usa.suspensionBridge{ span=170, towerH=78 }  usa.manhattan { width=420 }   Brooklyn landmark
 */
import { TRIM_TOP } from '../../data/geometry';
import type { PropContext, PropDef } from '../../types';
import { wetShade } from '../build';
import { FACADE_UV, GRIME_UV, SIGN_UV, USA_UV } from '../decals';
import type { UVRect } from '../decals';
import { GB } from '../geo';
import type { P3 } from '../geo';
import { registerProp } from '../props/registry';
import { Kit, lightLevel, list, num, pick, range, str } from '../props/common/util';

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

/** Atlas quad facing +Z in the plane z. */
function faceZ(g: GB, x0: number, x1: number, y0: number, y1: number, z: number, r: UVRect): void {
  g.quadUV([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], r[0], r[1], r[2], r[3]);
}
/** Atlas quad in the plane x, visible from both sides (z0..z1 × y0..y1). */
function crossX(g: GB, x: number, z0: number, z1: number, y0: number, y1: number, r: UVRect): void {
  g.quadUV([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], r[0], r[1], r[2], r[3]);
  g.quadUV([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], r[2], r[1], r[0], r[3]);
}
function sagWire(g: GB, a: P3, b: P3, sag: number, r: number, segs = 4): void {
  const pts: P3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  g.tube(pts, r, 3, { caps: 'none' });
}
/** A random piece of the spray-scribble tile (left / right half or all of it, sometimes mirrored). */
function tagUV(rng: () => number): UVRect {
  const r = USA_UV.tags;
  const t = rng();
  const a = t < 0.35 ? 0 : t < 0.7 ? 0.5 : 0;
  const b = t < 0.35 ? 0.5 : 1;
  const u0 = r[0] + (r[2] - r[0]) * a;
  const u1 = r[0] + (r[2] - r[0]) * b;
  return rng() < 0.5 ? [u0, r[1], u1, r[3]] : [u1, r[1], u0, r[3]];
}
/** Rooftop / wall air-conditioning condenser: box with a fan grille towards +Z. */
function acUnit(flat: GB, deco: GB, x: number, y: number, z: number, s = 1): void {
  flat.color(0xcfcfc6).boxB(x, y, z, 1.0 * s, 0.9 * s, 0.75 * s, 'y');
  faceZ(deco.white(), x - 0.45 * s, x + 0.45 * s, y + 0.02, y + 0.9 * s, z + 0.38 * s, USA_UV.acGrille);
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
  const art = k.g('usaDecor');
  const lit = k.g('usaGlow');
  const grime = k.g('grime');
  const glow = lightLevel(ctx);
  const x0 = -(bays * bayW) / 2;
  for (let b = 0; b < bays; b++) {
    const [wc, ac] = pick(rng, PASTELS);
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const fl = floors + (rng() < 0.3 ? 1 : 0);
    const h = groundH + fl * floorH;
    const wv = wall.vertexCount;
    wall.color(wc, range(rng, 0.94, 1.0)).chamferBox(cx, 0, -depth / 2, bayW, h, depth, 0.45, 'y');
    // sun-bleached top, street dirt at the foot
    wall.shadeBy(wv, (_x, y) => 0.88 + 0.12 * Math.min(1, y / 3.2));
    // racing stripes near the top
    for (let s = 0; s < 3; s++) stripe.color(s === 1 ? 0xffffff : ac).boxB(cx, h - 1.0 - s * 0.32, 0.01, bayW + 0.02, 0.14, 0.05, 'zy');
    // parapet cap with rounded look, rain streaks hanging off it
    trim.color(0xffffff).chamferBox(cx, h - 0.05, 0.05, bayW + 0.1, 0.5, 0.5, 0.15, 'y');
    faceZ(grime.white(), bx + range(rng, 0, 1.5), bx + bayW - range(rng, 0, 1.5), h - range(rng, 1.6, 2.8), h - 0.05, 0.012, GRIME_UV.streaks);
    // dark terrazzo base band with splash-back
    stripe.color(0x5c5a58).boxB(cx, 0, 0.02, bayW - 0.9, 0.55, 0.04, 'zy');
    faceZ(grime.white(), bx + 0.4, bx + bayW - 0.4, 0, 1.2, 0.045, GRIME_UV.damp);
    // windows with eyebrows (some lit behind curtains / glass blocks)
    const block = rng() < 0.3;
    for (let f = 0; f < fl; f++) {
      const y = groundH + f * floorH + 0.7;
      for (const wx of [cx - bayW * 0.25, cx + bayW * 0.25]) {
        if (rng() < 0.42) {
          lit.rgb(glow * 0.55, glow * 0.52, glow * 0.46);
          faceZ(lit, wx - 0.8, wx + 0.8, y, y + 1.6, 0.03, USA_UV.decoWin[block ? 1 : 0]);
        } else {
          const uv = rng() < 0.7 ? FACADE_UV.rectGlass : FACADE_UV.rectGlassDark;
          facade.white().quadUV([wx - 0.8, y, 0.03], [wx + 0.8, y, 0.03], [wx + 0.8, y + 1.6, 0.03], [wx - 0.8, y + 1.6, 0.03], uv[0], uv[1], uv[2], uv[3]);
        }
        trim.color(0xffffff).boxB(wx, y + 1.62, 0.22, 2.0, 0.09, 0.5, 'z');
        trim.boxB(wx, y - 0.08, 0.06, 1.8, 0.08, 0.14, 'zyxX');
        if (rng() < 0.55) faceZ(grime.white(), wx - 0.85, wx + 0.85, y - 0.08 - range(rng, 0.7, 1.3), y - 0.08, 0.012, GRIME_UV.streaks);
      }
      // sunburst relief between the windows of the top floor
      if (f === fl - 1 && rng() < 0.6) {
        art.color(wc, 1.05);
        faceZ(art, cx - 0.62, cx + 0.62, y + 0.2, y + 1.44, 0.03, USA_UV.decoRelief);
      }
    }
    // ground floor shop glass + side door + awning + neon tube
    const shop = FACADE_UV.shopGlass;
    facade.white().quadUV([cx - 1.9, 0.02, 0.03], [cx + 1.3, 0.02, 0.03], [cx + 1.3, 3.0, 0.03], [cx - 1.9, 3.0, 0.03], shop[0], shop[1], shop[2], shop[3]);
    faceZ(art.white(), cx + 1.55, cx + 2.6, 0.02, 2.3, 0.03, USA_UV.decoDoor);
    stripe.color(ac).boxB(cx, 3.05, 0.6, bayW - 0.6, 0.1, 1.2);
    neon.color(ac, glow).boxB(cx, 3.5, 0.07, bayW - 0.5, 0.07, 0.07, 'zy');
    neon.color(0xffffff, glow * 0.8).boxB(cx, h - 0.45, 0.06, bayW - 0.5, 0.05, 0.05, 'zy');
    if (rng() < 0.4) {
      lit.rgb(glow * 0.9, glow * 0.9, glow * 0.9);
      faceZ(lit, cx - 1.5, cx - 0.1, 1.6, 2.2, 0.05, USA_UV.neon);
    }
    // street-level life: tags, posters
    if (rng() < 0.4) faceZ(art.white(), bx + 0.3, bx + 2.4, 0.5, 1.3, 0.05, tagUV(rng));
    if (rng() < 0.35) faceZ(art.white(), cx + 2.62, cx + 2.62 + 0.3, 0.9, 1.6, 0.05, USA_UV.posters);
    // tower fin with a blade sign
    if (rng() < 0.45) {
      trim.color(wc).boxB(cx, h + 0.2, 0.0, 0.6, 2.6, 0.5);
      neon.color(ac, glow).boxB(cx - 0.32, h + 0.5, 0.2, 0.05, 2.2, 0.05, 'y');
      neon.boxB(cx + 0.32, h + 0.5, 0.2, 0.05, 2.2, 0.05, 'y');
    } else if (rng() < 0.7) {
      const s = SIGN_UV.v[Math.floor(rng() * SIGN_UV.v.length)];
      const px = cx + bayW * 0.5 - 0.1;
      signs.white().quadUV([px, groundH + 0.2, 0.9], [px, groundH + 0.2, 0.2], [px, groundH + 3.4, 0.2], [px, groundH + 3.4, 0.9], s[0], s[1], s[2], s[3]);
      signs.quadUV([px, groundH + 0.2, 0.2], [px, groundH + 0.2, 0.9], [px, groundH + 3.4, 0.9], [px, groundH + 3.4, 0.2], s[2], s[1], s[0], s[3]);
    } else {
      const s = SIGN_UV.h[Math.floor(rng() * SIGN_UV.h.length)];
      signs.white().quadUV([cx - 1.6, 3.6, 1.22], [cx + 1.6, 3.6, 1.22], [cx + 1.6, 4.35, 1.22], [cx - 1.6, 4.35, 1.22], s[0], s[1], s[2], s[3]);
    }
    // rooftop: condensers, drain pipe at the party wall
    if (rng() < 0.6) acUnit(dark, art, cx + range(rng, -1.6, 1.6), h + 0.45, -1.2);
    if (rng() < 0.4) dark.color(0xd8d8d0).boxB(cx + range(rng, -1.5, 1.5), h + 0.4, -3, 1.8, 0.9, 1.4, 'y');
    if (rng() < 0.4) {
      dark.color(0xb8b6ae).rod([bx + 0.5, 0.1, 0.08], [bx + 0.5, h - 0.2, 0.08], 0.06, 4);
      faceZ(grime.white(), bx + 0.15, bx + 0.85, h - range(rng, 3, 5), h - 0.2, 0.012, GRIME_UV.streaks);
    }
  }
  k.flush();
}

/** Chain-link fence along X (x0..x1) in the plane z, posts + top rail; `ret` adds return legs towards −Z. */
function fenceGeo(steel: GB, mesh: GB, x0: number, x1: number, z: number, h: number, ret = 0): void {
  const r = USA_UV.chainLink;
  const tile = 1.1;
  const span = (ax: number, az: number, bx: number, bz: number): void => {
    const len = Math.hypot(bx - ax, bz - az);
    // the atlas tile cannot repeat: split into tile-sized quads (two rows, both windings)
    const n = Math.max(1, Math.round(len / tile));
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const pa: P3 = [ax + (bx - ax) * t0, 0, az + (bz - az) * t0];
      const pb: P3 = [ax + (bx - ax) * t1, 0, az + (bz - az) * t1];
      for (let j = 0; j < 2; j++) {
        const ya = 0.06 + (j * (h - 0.06)) / 2;
        const yb = 0.06 + ((j + 1) * (h - 0.06)) / 2;
        mesh.quadUV([pa[0], ya, pa[2]], [pb[0], ya, pb[2]], [pb[0], yb, pb[2]], [pa[0], yb, pa[2]], r[0], r[1], r[2], r[3]);
        mesh.quadUV([pb[0], ya, pb[2]], [pa[0], ya, pa[2]], [pa[0], yb, pa[2]], [pb[0], yb, pb[2]], r[0], r[1], r[2], r[3]);
      }
    }
    steel.color(0x8a9094).rod([ax, h, az], [bx, h, bz], 0.022, 4);
    const np = Math.max(1, Math.round(len / 2.6));
    for (let i = 0; i <= np; i++) steel.cyl(ax + ((bx - ax) * i) / np, 0, az + ((bz - az) * i) / np, 0.03, 0.03, h + 0.06, 4, false);
  };
  mesh.white();
  span(x0, z, x1, z);
  if (ret > 0) {
    span(x0, z - ret, x0, z);
    span(x1, z, x1, z - ret);
  }
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
  const art = k.g('usaDecor');
  const grime = k.g('grime');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const glow = lightLevel(ctx);
  const wc = pick(rng, [0xf0ece4, 0xe8e0d0, 0xdfe8ec, 0xf4e8dc]);
  const wv = wall.vertexCount;
  wall.color(wc).boxB(0, 0, -depth / 2, w, h, depth, 'y');
  wall.shadeBy(wv, (_x, y) => 0.82 + 0.18 * Math.min(1, y / 2.5));
  wall.color(0xffffff).boxB(0, h, 0.05, w + 0.2, 0.3, 0.4);
  // painted base band in an accent colour
  const acc = pick(rng, [0x35c9c4, 0xff7aa8, 0xffd22e, 0x2a3a9a, 0xff8a3a]);
  dark.color(acc, 0.9).boxB(0, 0, 0.02, w, 0.7, 0.04, 'zy');
  // big original mural from the shared atlas (2.67 : 1) on the right part of the wall
  const svc = Math.min(6.4, w * 0.36); // service zone on the left: roll-up door, steel-sash window
  const mh = Math.min(h - 1.3, (w - svc - 0.4) / 2.667);
  const mw = mh * 2.667;
  const mx0 = -w / 2 + svc + (w - svc - mw) / 2;
  faceZ(art.white(), mx0, mx0 + mw, 0.8, 0.8 + mh, 0.03, USA_UV.mural[(seed + Math.floor(rng() * 4)) % 4]);
  // lettered piece above the door (procedural graffiti, 4 : 1)
  const g = k.g('graffiti', undefined, { seed, piece });
  const pw = svc - 0.5;
  g.white().quadUV([-w / 2 + 0.25, h - 0.5 - pw / 4, 0.04], [-w / 2 + 0.25 + pw, h - 0.5 - pw / 4, 0.04], [-w / 2 + 0.25 + pw, h - 0.5, 0.04], [-w / 2 + 0.25, h - 0.5, 0.04], 0, 0, 1, 1);
  // roll-up door in a steel frame, bollards, steel-sash window, tags, posters
  const dx = -w / 2 + 2.0;
  dark.color(0x2e3034).boxB(dx, 0, 0.05, 3.3, 3.45, 0.1, 'zy');
  faceZ(art.color(0xffffff, range(rng, 0.85, 1)), dx - 1.5, dx + 1.5, 0.02, 3.3, 0.11, USA_UV.rollDoor[Math.floor(rng() * 2)]);
  for (const s of [-1, 1]) dark.color(0xe8c020).cyl(dx + s * 1.9, 0, 0.7, 0.09, 0.09, 1.0, 6);
  if (svc > 5.4) {
    const wx = -w / 2 + svc - 1.25;
    faceZ(art.white(), wx - 0.8, wx + 0.8, 1.3, 2.9, 0.03, USA_UV.indWin);
    faceZ(art, wx - 1.0, wx + 1.0, 0.25, 1.05, 0.05, tagUV(rng));
  }
  faceZ(art.white(), dx + 1.75, dx + 2.25, 1.0, 1.9, 0.05, USA_UV.posters);
  // weathering: streaks under the coping, splash-back, soot above the door
  for (let i = 0; i < 4; i++) {
    const sx = -w / 2 + (w * (i + rng())) / 4;
    faceZ(grime.white(), sx - 1.4, sx + 1.4, h - range(rng, 1.5, 3.2), h, 0.035, GRIME_UV.streaks);
  }
  faceZ(grime, -w / 2, 0, 0, 1.2, 0.035, GRIME_UV.damp);
  faceZ(grime, 0, w / 2, 0, 1.2, 0.035, GRIME_UV.damp);
  faceZ(grime, dx - 1.6, dx + 1.6, 3.3, 4.3, 0.035, GRIME_UV.blot);
  // wall-pack lights washing the mural, conduit
  for (const t of [0.2, 0.5, 0.8]) {
    const lx = mx0 + mw * t;
    dark.color(0x2a2c30).beam([lx, h - 0.25, 0.02], [lx, h - 0.15, 0.6], 0.04);
    neon.color(0xfff0d0, glow * 1.2).boxB(lx, h - 0.24, 0.6, 0.4, 0.07, 0.16, 'Y');
  }
  dark.color(0xa8a8a0).rod([-w / 2 + 0.1, h - 0.45, 0.06], [mx0 + mw * 0.8, h - 0.45, 0.06], 0.03, 4);
  dark.rod([w / 2 - 0.25, 0.1, 0.08], [w / 2 - 0.25, h, 0.08], 0.06, 4);
  // roof: plant room, condensers, duct
  metal.color(0x8a9096).boxB(w / 2 - 3, h, -depth / 2, 2.5, 1.0, 3);
  acUnit(dark, art, -w / 2 + 2.5, h + 0.3, -1.4, 1.2);
  acUnit(dark, art, -w / 2 + 4.2, h + 0.3, -1.4, 1.2);
  dark.color(0xb8bcc0).boxB(0, h + 0.3, -2.2, w * 0.5, 0.4, 0.5, 'y');
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
  const art = k.g('usaDecor');
  const grime = k.g('grime');
  const cols = [0xc4402e, 0x2f6a9a, 0xd8b03a, 0x4a8a5a, 0xb0b4b8, 0x8a4a2a];
  const rng = ctx.rng;
  const one = (x: number, y: number): void => {
    const col = pick(rng, cols);
    const v0 = c.vertexCount;
    c.color(col, range(rng, 0.8, 1.02)).boxB(x, y, 0, 2.4, 2.6, 6.0, 'y');
    c.shadeBy(v0, (_x, yy) => 0.86 + 0.14 * Math.min(1, (yy - y) / 1.2));
    // door end towards +Z, blank end with a stencil plate towards −Z, rust weeping from the top rail
    const r = USA_UV.containerDoor;
    art.color(col, 1.25);
    art.quadUV([x - 1.14, y + 0.08, 3.012], [x + 1.14, y + 0.08, 3.012], [x + 1.14, y + 2.52, 3.012], [x - 1.14, y + 2.52, 3.012], r[0], r[1], r[2], r[3]);
    art.quadUV([x + 1.14, y + 0.08, -3.012], [x - 1.14, y + 0.08, -3.012], [x - 1.14, y + 2.52, -3.012], [x + 1.14, y + 2.52, -3.012], r[0], r[1], r[2], r[3]);
    const d = GRIME_UV.drip;
    grime.white().quadUV([x - 1.1, y + 1.2, 3.02], [x + 1.1, y + 1.2, 3.02], [x + 1.1, y + 2.6, 3.02], [x - 1.1, y + 2.6, 3.02], d[0], d[1], d[2], d[3]);
    grime.quadUV([x + 1.1, y + 1.2, -3.02], [x - 1.1, y + 1.2, -3.02], [x - 1.1, y + 2.6, -3.02], [x + 1.1, y + 2.6, -3.02], d[0], d[1], d[2], d[3]);
  };
  for (let i = 0; i < 3; i++) {
    one(i * 2.6, 0);
    if (i !== 1) one(i * 2.6, 2.6);
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
  const iron = k.g('flat');
  const bits = k.g('flat');
  const wood = k.g('wood');
  const art = k.g('usaDecor');
  const lit = k.g('usaGlow');
  const grime = k.g('grime');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const glow = lightLevel(ctx);
  const x0 = -(bays * bayW) / 2;
  const h = groundH + floors * floorH;
  const brick = pick(rng, BRICKS);
  const dockBay = Math.floor(rng() * bays);
  const signBay = rng() < 0.6 ? Math.floor(rng() * bays) : -1;
  for (let b = 0; b < bays; b++) {
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const wv = wall.vertexCount;
    wall.color(brick, range(rng, 0.9, 1.08)).boxB(cx, 0, -depth / 2, bayW, h, depth, 'y');
    // a century of soot: darker towards the street
    wall.shadeBy(wv, (_x, y) => 0.74 + 0.26 * Math.min(1, y / (h * 0.6)));
    stone.color(0xb8aa96).boxB(cx, 0, 0.04, bayW, 0.7, 0.1, 'zy');
    faceZ(grime.white(), bx, bx + bayW, 0, 1.6, 0.1, GRIME_UV.damp);
    // ground floor
    if (b === dockBay) {
      // loading dock: concrete platform with a hazard edge, numbered door, rubber bumpers, steel canopy
      const pw = bayW - 0.5;
      stone.color(0x9a968c).boxB(cx, 0, 0.75, pw, 1.05, 1.5, 'zy');
      const hz = USA_UV.hazard;
      art.white().quadUV([cx - pw / 2, 0.8, 1.505], [cx + pw / 2, 0.8, 1.505], [cx + pw / 2, 1.05, 1.505], [cx - pw / 2, 1.05, 1.505], hz[0], hz[1] + (hz[3] - hz[1]) * 0.3, hz[2], hz[1] + (hz[3] - hz[1]) * 0.7);
      faceZ(art.color(0xffffff, 0.95), cx - 1.6, cx + 1.6, 1.05, 4.0, 0.05, USA_UV.dockDoor[Math.floor(rng() * 2)]);
      for (const s of [-1, 1]) bits.color(0x1c1c1e).boxB(cx + s * 1.2, 0.45, 1.54, 0.3, 0.5, 0.08, 'z');
      // steps at one side
      for (let i = 0; i < 3; i++) stone.color(0x8a867c).boxB(cx - pw / 2 - 0.45, 0, 0.45 + i * 0.36, 0.9, 0.78 - i * 0.26, 0.36, 'y');
      iron.color(0x4a5056).quad([cx - pw / 2, 4.0, 2.2], [cx + pw / 2, 4.0, 2.2], [cx + pw / 2, 4.3, 0.02], [cx - pw / 2, 4.3, 0.02]);
      iron.color(0x2a2e32).quad([cx + pw / 2, 3.98, 2.2], [cx - pw / 2, 3.98, 2.2], [cx - pw / 2, 4.28, 0.02], [cx + pw / 2, 4.28, 0.02]);
      for (const s of [-1, 1]) bits.color(0x23262a).rod([cx + s * (pw / 2 - 0.2), 5.6, 0.04], [cx + s * (pw / 2 - 0.2), 4.02, 2.1], 0.025, 4);
      neon.color(0xffd9a0, glow * 1.3).boxB(cx, 3.92, 1.2, 1.2, 0.06, 0.14, 'Y');
    } else {
      const roll = rng() < 0.4;
      if (roll) {
        bits.color(0x2e3034).boxB(cx, 0, 0.06, 3.0, 3.35, 0.1, 'zy');
        faceZ(art.color(0xffffff, range(rng, 0.8, 1)), cx - 1.35, cx + 1.35, 0.02, 3.2, 0.12, USA_UV.rollDoor[rng() < 0.6 ? 2 : 0]);
      } else {
        wood.color(0x5a4430).boxB(cx, 0.05, 0.05, 2.2, 3.2, 0.1, 'zy');
        bits.color(0x23262a).boxB(cx, 1.1, 0.11, 2.2, 0.08, 0.02, 'zy').boxB(cx, 2.4, 0.11, 2.2, 0.08, 0.02, 'zy').boxB(cx, 0.05, 0.11, 0.06, 3.2, 0.02, 'zy');
      }
      stone.color(0xcfc4b0).boxB(cx, 3.25, 0.08, 2.7, 0.3, 0.18, 'zy');
      // gooseneck lamp over the door
      if (rng() < 0.7) {
        bits.color(0x23262a).rod([cx, 3.95, 0.05], [cx, 4.05, 0.6], 0.025, 4);
        bits.cyl(cx, 3.86, 0.6, 0.26, 0.06, 0.16, 6);
        neon.color(0xffd9a0, glow * 1.4).disc(cx, 3.855, 0.6, 0.2, 6, -1);
      }
      if (rng() < 0.45) faceZ(art.white(), cx + 1.35, cx + 2.5, 0.8, 1.5, 0.11, tagUV(rng));
      if (rng() < 0.35) faceZ(art.white(), cx - 2.4, cx - 1.6, 1.0, 2.0, 0.11, USA_UV.posters);
    }
    // upper floors: arched windows with stone sills, some lit
    for (let f = 0; f < floors; f++) {
      const y = groundH + f * floorH + 0.4;
      for (const wx of [cx - bayW * 0.26, cx + bayW * 0.26]) {
        const t = rng();
        if (t < 0.24) {
          lit.rgb(glow * 0.52, glow * 0.5, glow * 0.46);
          faceZ(lit, wx - 0.7, wx + 0.7, y, y + 2.4, 0.03, USA_UV.archLit[Math.floor(rng() * 3)]);
        } else {
          const uv = t < 0.9 ? FACADE_UV.archGlass : FACADE_UV.archLouvre[1];
          facade.white().quadUV([wx - 0.7, y, 0.03], [wx + 0.7, y, 0.03], [wx + 0.7, y + 2.4, 0.03], [wx - 0.7, y + 2.4, 0.03], uv[0], uv[1], uv[2], uv[3]);
        }
        stone.color(0xcfc4b0).boxB(wx, y - 0.1, 0.1, 1.6, 0.12, 0.2, 'zyxX');
        if (rng() < 0.4) faceZ(grime.white(), wx - 0.8, wx + 0.8, y - 0.1 - range(rng, 0.7, 1.3), y - 0.1, 0.012, GRIME_UV.streaks);
        // window air-con with a rust trail
        if (t > 0.94) {
          bits.color(0xc8c6be).boxB(wx, y + 0.02, 0.22, 0.7, 0.45, 0.45, 'zy');
          faceZ(grime.white(), wx - 0.35, wx + 0.35, y - 1.1, y, 0.014, GRIME_UV.drip);
        }
      }
    }
    stone.color(0xd8cdb8).boxB(cx, groundH - 0.1, 0.1, bayW, 0.2, 0.22, 'zy');
    // cornice with soot hanging below it
    stone.color(0xd8cdb8).boxB(cx, h - 0.35, 0.28, bayW, 0.45, 0.6, 'z');
    stone.boxB(cx, h + 0.1, 0.1, bayW, 0.4, 0.32, 'zy');
    faceZ(grime.white(), bx, bx + bayW, h - 0.35 - range(rng, 1.6, 3.0), h - 0.35, 0.012, GRIME_UV.streaks);
    // worn painted lettering high on the wall
    if (b === signBay && bays > 1) {
      art.color(0xffffff, range(rng, 0.7, 0.9));
      const sx = Math.min(cx, x0 + bays * bayW - 3.0);
      faceZ(art, sx - 2.2, sx + 2.2, h - 4.4, h - 1.26, 0.02, USA_UV.ghostSign);
    }
    // drain pipe at the party wall
    if (rng() < 0.5) bits.color(0x3a3632).rod([bx + 0.12, 0.2, 0.09], [bx + 0.12, h - 0.4, 0.09], 0.07, 4);
  }
  // fire escape on one bay (+ drop ladder)
  if (fire > 0) {
    const fx = x0 + bayW * (bays > 1 ? 1.5 : 0.5);
    const w = 2.6;
    for (let f = 0; f < floors; f++) {
      const y = groundH + f * floorH + 0.3;
      iron.color(0x23262a).boxB(fx, y, 0.9, w, 0.07, 1.5);
      iron.boxB(fx, y + 0.9, 1.62, w, 0.05, 0.05, 'xX');
      iron.boxB(fx - w / 2, y + 0.9, 0.9, 0.05, 0.05, 1.5, 'zZ');
      iron.boxB(fx + w / 2, y + 0.9, 0.9, 0.05, 0.05, 1.5, 'zZ');
      for (const s of [-1, 1]) bits.color(0x23262a).boxB(fx + s * (w / 2), y, 1.62, 0.04, 0.9, 0.04, 'yY');
      if (f < floors - 1) {
        const dir = f % 2 ? 1 : -1;
        iron.beam([fx + dir * 1.0, y + 0.05, 0.9], [fx - dir * 1.0, y + floorH, 0.9], 0.09, 0.05);
        iron.beam([fx + dir * 1.0, y + 0.95, 0.9], [fx - dir * 1.0, y + floorH + 0.9, 0.9], 0.04);
      }
    }
    for (const s of [-0.22, 0.22]) bits.boxB(fx + 0.9 + s, groundH - 1.9, 1.55, 0.04, 2.2, 0.04, 'yY');
    for (let i = 0; i < 5; i++) bits.boxB(fx + 0.9, groundH - 1.7 + i * 0.42, 1.55, 0.44, 0.03, 0.03, 'xX');
  }
  // hoist beam over the top loading door
  if (rng() < 0.5) {
    const hx = x0 + bayW * (dockBay + 0.5);
    iron.color(0x23262a).boxB(hx, h - 0.9, 0.9, 0.14, 0.2, 1.8, 'z');
    bits.color(0x1c1c1e).rod([hx, h - 0.9, 1.6], [hx, h - 2.3, 1.6], 0.015, 3);
  }
  // flat roof: chimney, water tower, stair bulkhead, vents
  if (tower > 0) waterTowerGeo(iron, x0 + bayW * 0.7, h + 0.5, -depth * 0.35, 1.0);
  iron.color(0x6a3a2e).boxB(x0 + bayW * bays * 0.8, h + 0.5, -depth * 0.55, 1.2, 3.2, 1.2, 'y');
  wall.color(brick, 0.8).boxB(x0 + bayW * bays * 0.42, h + 0.5, -2.6, 2.6, 2.5, 3.0, 'y');
  for (let i = 0; i < 2; i++) bits.color(0x8a8e92).cyl(x0 + bayW * (0.4 + i * 1.3 + rng()), h + 0.5, -range(rng, 1.5, 4), 0.25, 0.25, 0.7, 6);
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

// ────────────────────────────────────────────── shared street dressing ──

const UQ_BOTTOM = -0.75;

/**
 * Canal edge dressing along local Z: wall face = plane x = 0 facing −X (water side), quay at x > 0.
 * style 0 = Miami concrete seawall + kerb blocks, style 1 = Brooklyn granite dock wall with timber
 * fenders (painted) + cast-iron bollards behind the parapet. Nothing reaches more than 7 cm into the water.
 */
function quay(def: PropDef, ctx: PropContext): void {
  const len = num(ctx, def, 'length', 40);
  const style = Math.round(num(ctx, def, 'style', 0));
  const top = num(ctx, def, 'top', style ? 1.0 : 0.9);
  const gaps = list(def, 'gaps') ?? [];
  const skip = list(def, 'skip') ?? [];
  const ladderAt = list(def, 'ladderAt') ?? [];
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const art = k.g('usaDecor');
  const grime = k.g('grime');
  const cope = k.g('stone');
  const iron = k.g('flat');
  const bits = k.g('flat');
  const z0 = -len / 2;
  const z1 = len / 2;
  const within = (arr: readonly number[], z: number): boolean => {
    for (let i = 0; i + 1 < arr.length; i += 2) if (z > arr[i] && z < arr[i + 1]) return true;
    return false;
  };
  const tileL = 8;
  const st = style ? USA_UV.quayDock : USA_UV.quayMiami;
  const ys = [UQ_BOTTOM, -0.28, 0.06, 0.42, top];
  const vAt = (y: number): number => st[1] + ((y - UQ_BOTTOM) / (top - UQ_BOTTOM)) * (st[3] - st[1]);
  const xf = -0.006;
  for (let z = z0; z < z1 - 1e-3; z += tileL) {
    const zb = Math.min(z1, z + tileL);
    if (within(gaps, (z + zb) / 2)) continue;
    const u1 = st[0] + ((zb - z) / tileL) * (st[2] - st[0]);
    for (let i = 0; i < ys.length - 1; i++) {
      const ya = ys[i];
      const yb = ys[i + 1];
      const v = art.vertexCount;
      art.white().quadUV([xf, ya, z], [xf, ya, zb], [xf, yb, zb], [xf, yb, z], st[0], vAt(ya), u1, vAt(yb));
      const sa = wetShade(ya, 0);
      const sb = wetShade(yb, 0);
      art.shade(v, sa);
      art.shade(v + 1, sa);
      art.shade(v + 2, sb);
      art.shade(v + 3, sb);
    }
  }
  const al = GRIME_UV.algae;
  for (let z = z0; z < z1 - 1e-3; z += 3.2) {
    const zb = Math.min(z1, z + 3.2);
    if (within(gaps, (z + zb) / 2)) continue;
    const u1 = al[0] + ((zb - z) / 3.2) * (al[2] - al[0]);
    grime.white().quadUV([xf - 0.006, -0.02, z], [xf - 0.006, -0.02, zb], [xf - 0.006, 0.5, zb], [xf - 0.006, 0.5, z], al[0], al[1], u1, al[3]);
  }
  for (let z = z0 + range(rng, 0.5, 3); z < z1 - 1.8; z += range(rng, 3.5, 8)) {
    const w = range(rng, 0.6, 1.6);
    if (within(gaps, z)) continue;
    const s = GRIME_UV.streaks;
    grime.quadUV([xf - 0.008, range(rng, 0, 0.3), z], [xf - 0.008, 0.2, z + w], [xf - 0.008, top, z + w], [xf - 0.008, top, z], s[0], s[1], s[2], s[3]);
  }
  if (style === 0) {
    // kerb: pale cast-stone blocks exactly over the kerb the rider grinds (TRIM_TOP.kerb tall, centred
    // 0.14 m in from the edge) so the board sits on the stone
    for (let z = z0; z < z1 - 0.05; ) {
      const l = Math.min(z1 - z, range(rng, 4, 6.5));
      if (!within(gaps, z + l / 2)) {
        cope.color(pick(rng, [0xcfc8b8, 0xc2bbab, 0xd8d1c2, 0xb9b2a4]), range(rng, 0.9, 1.05));
        cope.chamferBox(0.14, top, z + l / 2, 0.36, TRIM_TOP.kerb, l - 0.014, 0.03, 'yzZ');
      }
      z += l;
    }
    // mooring cleats
    for (let z = z0 + range(rng, 6, 10); z < z1 - 4; z += range(rng, 13, 18)) {
      if (within(gaps, z) || within(skip, z)) continue;
      bits.color(0x8a8e92).boxB(0.6, top, z, 0.12, 0.1, 0.2, 'y').boxB(0.6, top + 0.1, z, 0.07, 0.06, 0.5, 'y');
    }
  } else {
    // cast-iron mushroom bollards behind the parapet, some with a turn of hawser
    for (let z = z0 + range(rng, 4, 8); z < z1 - 3; z += range(rng, 10, 14)) {
      if (within(gaps, z) || within(skip, z)) continue;
      iron.color(0x1e2022).cyl(1.05, top, z, 0.2, 0.15, 0.55, 6, false).cyl(1.05, top + 0.55, z, 0.26, 0.2, 0.13, 6);
      if (rng() < 0.5) bits.color(0xb8a070).cyl(1.05, top + 0.12, z, 0.2, 0.2, 0.16, 6, false);
    }
  }
  for (const lz of ladderAt) {
    bits.color(style ? 0x3a2a22 : 0x9aa0a4);
    for (const dz of [-0.22, 0.22]) {
      bits.boxB(-0.05, -1.0, lz + dz, 0.035, top + 1.0, 0.04, 'y');
      if (style === 0) {
        bits.rod([-0.05, top, lz + dz], [-0.05, top + 0.5, lz + dz], 0.02, 4);
        bits.rod([-0.05, top + 0.5, lz + dz], [0.5, top + 0.5, lz + dz], 0.02, 4);
        bits.rod([0.5, top + 0.5, lz + dz], [0.5, top + 0.15, lz + dz], 0.02, 4);
      }
    }
    for (let y = -0.7; y < top; y += 0.3) bits.rod([-0.05, y, lz - 0.22], [-0.05, y, lz + 0.22], 0.016, 4);
    const d = GRIME_UV.drip;
    grime.white().quadUV([xf - 0.01, -0.3, lz - 0.45], [xf - 0.01, -0.3, lz + 0.45], [xf - 0.01, top, lz + 0.45], [xf - 0.01, top, lz - 0.45], d[0], d[1], d[2], d[3]);
  }
  k.flush();
}

/**
 * Wooden utility poles along local +Z with cross-arms, three conductors, a comms cable, transformer
 * cans and (lamp = 1) industrial dish lamps. side = +1: buildings at +X, canal at −X.
 */
function utilityRun(def: PropDef, ctx: PropContext): void {
  const count = Math.max(2, Math.round(num(ctx, def, 'count', 6)));
  const spacing = num(ctx, def, 'spacing', 30);
  const side = num(ctx, def, 'side', 1) >= 0 ? 1 : -1;
  const lampOn = num(ctx, def, 'lamp', 0) > 0;
  const H = num(ctx, def, 'height', 9.6);
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const pole = k.g('wood');
  const bits = k.g('flat', { cast: false });
  const neon = k.g('neon', undefined, { intensity: 1 });
  const glow = lightLevel(ctx);
  for (let i = 0; i < count; i++) {
    const z = i * spacing;
    const lean = range(rng, -0.12, 0.12);
    pole.color(0x5a4636, range(rng, 0.8, 1.05)).rod([0, 0, z], [lean, H, z], 0.15, 6, false, 0.1);
    const tx = lean;
    bits.color(0x4a3a2c).boxB(tx, H - 0.5, z, 1.0, 0.1, 0.09).boxB(tx, H - 1.3, z, 0.8, 0.09, 0.08);
    bits.color(0x9aa8a8);
    for (const ix of [-0.42, 0, 0.42]) bits.cyl(tx + ix, H - 0.4, z, 0.04, 0.03, 0.14, 4, false);
    if (i % 2 === 1) {
      bits.color(0x7c8286).cyl(tx - side * 0.33, H - 2.6, z, 0.26, 0.26, 0.8, 7);
      bits.color(0x1c1a18);
      sagWire(bits, [tx - side * 0.33, H - 1.78, z], [tx + 0.42, H - 0.3, z], -0.1, 0.012, 3);
    }
    if (lampOn && i % 2 === 0) {
      // dish lamp on a bracket over the quay
      bits.color(0x23262a).beam([tx, H - 3.0, z], [tx - side * 1.3, H - 2.7, z], 0.05);
      bits.color(0x2f4a44).cyl(tx - side * 1.3, H - 2.95, z, 0.34, 0.08, 0.2, 7);
      neon.color(0xffd9a0, glow * 1.6).disc(tx - side * 1.3, H - 2.955, z, 0.26, 7, -1);
    }
    // posters stapled to the pole
    if (rng() < 0.5) {
      const r = USA_UV.posters;
      const art = k.g('usaDecor');
      art.white().quadUV([-side * 0.16, 1.2, z + 0.2], [-side * 0.16, 1.2, z - 0.2], [-side * 0.16, 1.75, z - 0.2], [-side * 0.16, 1.75, z + 0.2], r[0], r[1], (r[0] + r[2]) / 2, r[3]);
    }
    if (i === count - 1) break;
    const z1 = z + spacing;
    bits.color(0x1c1a18);
    for (const ix of [-0.42, 0, 0.42]) sagWire(bits, [tx + ix, H - 0.26, z], [ix, H - 0.26, z1], range(rng, 0.5, 0.8), 0.014, 4);
    for (const ix of [-0.32, 0.32]) sagWire(bits, [tx + ix, H - 1.2, z], [ix, H - 1.2, z1], range(rng, 0.5, 0.9), 0.013, 4);
    sagWire(bits, [-side * 0.18, H - 3.4, z], [-side * 0.18, H - 3.4, z1], range(rng, 0.8, 1.2), 0.035, 4);
    sagWire(bits, [-side * 0.2, H - 3.7, z], [-side * 0.2, H - 3.75, z1], range(rng, 0.9, 1.5), 0.016, 4);
  }
  k.flush();
}

/** Chain-link fence along local X: { length=6, height=2.2, ret=0 } (return legs go towards local −Z). */
function chainLink(def: PropDef, ctx: PropContext): void {
  const len = num(ctx, def, 'length', 6);
  const h = num(ctx, def, 'height', 2.2);
  const ret = num(ctx, def, 'ret', 0);
  const k = new Kit(ctx);
  fenceGeo(k.g('flat'), k.g('usaDecor'), -len / 2, len / 2, 0, h, ret);
  k.flush();
}

/** Steel dumpster with a sloped lid (opening side faces local +Z). */
function dumpster(def: PropDef, ctx: PropContext): void {
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const body = k.g('flat');
  const bits = k.g('flat');
  const grime = k.g('grime');
  const art = k.g('usaDecor');
  const col = typeof def.params?.color === 'number' ? (def.params.color as number) : pick(rng, [0x2f6a4a, 0x2a4a7a, 0x7a2a22, 0x4a4e52]);
  const v0 = body.vertexCount;
  body.color(col).boxB(0, 0.15, 0, 1.9, 1.05, 1.1, 'y');
  body.shadeBy(v0, (_x, y) => 0.7 + 0.3 * Math.min(1, y / 0.8));
  // sloped lids (one propped open a little)
  body.color(0x2a2c30).quad([-0.97, 1.2, 0.57], [0.0, 1.2, 0.57], [0.0, 1.42, -0.55], [-0.97, 1.42, -0.55]);
  body.quad([0.0, 1.2 + 0.12, 0.57], [0.97, 1.2 + 0.2, 0.57], [0.97, 1.42, -0.55], [0.0, 1.42, -0.55]);
  bits.color(col, 0.8).boxB(-1.0, 0.75, 0, 0.1, 0.12, 0.7).boxB(1.0, 0.75, 0, 0.1, 0.12, 0.7);
  for (const [x, z] of [[-0.8, 0.45], [0.8, 0.45], [-0.8, -0.45], [0.8, -0.45]] as const) bits.color(0x1c1c1e).cyl(x, 0, z, 0.08, 0.08, 0.15, 5, false);
  faceZ(grime.white(), -0.95, 0.95, 0.15, 1.2, 0.56, GRIME_UV.drip);
  faceZ(art.white(), -0.7, 0.5, 0.35, 0.95, 0.565, tagUV(rng));
  // bin bags beside it
  if (rng() < 0.7) {
    bits.color(0x1e1f22).sphere(1.35, 0.25, 0.2, 0.32, 0.27, 0.3, 6, 4);
    bits.sphere(1.5, 0.2, -0.25, 0.26, 0.22, 0.26, 6, 4);
  }
  k.flush();
}

/** Small sidewalk props: kind 0 hydrant · 1 wire trash can · 2 pair of newspaper boxes · 3 traffic cones. */
function streetKit(def: PropDef, ctx: PropContext): void {
  const kind = Math.round(num(ctx, def, 'kind', 0));
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const g = k.g('flat');
  if (kind === 0) {
    const col = pick(rng, [0xd8342a, 0xe8c020, 0xd8342a]);
    g.color(col).cyl(0, 0, 0, 0.13, 0.11, 0.55, 7, false).sphere(0, 0.55, 0, 0.12, 0.1, 0.12, 7, 3, 0.5, 1);
    g.cyl(0, 0, 0, 0.17, 0.17, 0.06, 7);
    g.rod([-0.2, 0.36, 0], [0.2, 0.36, 0], 0.05, 5, true);
    g.color(0xc8ccd0).rod([0, 0.3, 0], [0, 0.3, 0.2], 0.06, 5, true);
  } else if (kind === 1) {
    g.color(0x2f5a44).cyl(0, 0, 0, 0.26, 0.3, 0.85, 8, false);
    g.color(0x1c1c1e).disc(0, 0.8, 0, 0.28, 8);
    g.color(0x24452f).cyl(0, 0.85, 0, 0.32, 0.32, 0.05, 8, false);
  } else if (kind === 2) {
    const cols = [0xd8342a, 0x2a5ab8, 0xe8c020, 0x2f8a5a];
    for (let i = 0; i < 2; i++) {
      const x = i * 0.6;
      g.color(0x3a3c40).boxB(x, 0, 0, 0.12, 0.5, 0.12, 'y');
      g.color(pick(rng, cols)).boxB(x, 0.5, 0, 0.5, 0.75, 0.45);
      g.color(0x1c2630).boxB(x, 0.78, 0.23, 0.38, 0.36, 0.01, 'z');
    }
  } else {
    const n = Math.max(1, Math.round(num(ctx, def, 'count', 3)));
    for (let i = 0; i < n; i++) {
      const x = i * 0.9 + range(rng, -0.15, 0.15);
      const z = range(rng, -0.2, 0.2);
      g.color(0x1c1c1e).boxB(x, 0, z, 0.38, 0.04, 0.38, 'y');
      g.color(0xf06a1e).cyl(x, 0.04, z, 0.15, 0.04, 0.62, 7);
      g.color(0xf2f0e8).cyl(x, 0.3, z, 0.105, 0.075, 0.14, 7, false);
    }
  }
  k.flush();
}

/** Parked box van, cargo box painted with a mural / tags (faces local +Z). */
function van(def: PropDef, ctx: PropContext): void {
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const body = k.g('paintedMetal');
  const bits = k.g('flat');
  const art = k.g('usaDecor');
  const col = typeof def.params?.color === 'number' ? (def.params.color as number) : pick(rng, [0xf2f0ea, 0xe8e4d8, 0xd8dce0]);
  body.color(col).boxB(0, 0.75, -0.7, 2.05, 2.2, 3.9, 'y');
  body.color(col, 0.92).chamferBox(0, 0.55, 2.05, 1.95, 1.55, 1.5, 0.3, 'y');
  bits.color(0x1c2630).boxB(0, 1.4, 2.5, 1.75, 0.55, 0.62, 'yzY');
  bits.color(0x2a2c30).boxB(0, 0.4, 0.6, 1.9, 0.36, 5.5, 'Y');
  for (const [x, z] of [[-0.95, 1.9], [0.95, 1.9], [-0.95, -1.6], [0.95, -1.6]] as const) bits.color(0x15161a).rod([x - 0.12, 0.38, z], [x + 0.12, 0.38, z], 0.38, 8, true);
  // art on both long sides + scribbles on the roll door at the back
  const m = USA_UV.mural[Math.floor(rng() * 4)];
  art.white().quadUV([-1.035, 0.95, -2.55], [-1.035, 0.95, 1.15], [-1.035, 2.85, 1.15], [-1.035, 2.85, -2.55], m[0], m[1], (m[0] + m[2]) / 2, m[3]);
  art.quadUV([1.035, 0.95, 1.15], [1.035, 0.95, -2.55], [1.035, 2.85, -2.55], [1.035, 2.85, 1.15], (m[0] + m[2]) / 2, m[1], m[2], m[3]);
  const r = USA_UV.rollDoor[0];
  art.quadUV([0.95, 0.85, -2.66], [-0.95, 0.85, -2.66], [-0.95, 2.85, -2.66], [0.95, 2.85, -2.66], r[0], r[1], r[2], r[3]);
  bits.color(0xfff2d0).boxB(-0.7, 0.95, 2.81, 0.3, 0.16, 0.02, 'z').boxB(0.7, 0.95, 2.81, 0.3, 0.16, 0.02, 'z');
  k.flush();
}

// ─────────────────────────────────────────────────────────── dock props ──

/** Distant ship-to-shore gantry crane on its own quay slab: { height=62, boom=1 (raised) }. Rails along local X. */
function crane(def: PropDef, ctx: PropContext): void {
  const H = num(ctx, def, 'height', 62);
  const up = num(ctx, def, 'boom', 1) > 0;
  const rng = ctx.rng;
  const g = new GB();
  const col = pick(rng, [0x4a7a9a, 0xb8483a, 0x5a6a7a, 0xc8a23a]);
  const leg = H * 0.035;
  const sx = H * 0.22; // half gauge along the quay
  const sz = H * 0.16; // half span across
  g.color(0x6a6660).boxB(0, -3, 0, sx * 3.4, 4.0, sz * 3.2, 'y');
  const v0 = g.vertexCount;
  g.color(col);
  const yb = 1;
  const yg = H * 0.62; // girder level
  for (const x of [-sx, sx]) {
    for (const z of [-sz, sz]) g.boxB(x, yb, z, leg, yg - yb, leg, 'yY');
    g.beam([x, yb + 2, -sz], [x, yg * 0.55, sz], leg * 0.5);
    g.beam([x, yb + 2, sz], [x, yg * 0.55, -sz], leg * 0.5);
    g.boxB(x, yg * 0.55, 0, leg * 0.7, leg * 0.7, sz * 2, 'zZ');
  }
  for (const z of [-sz, sz]) g.boxB(0, yg * 0.3, z, sx * 2, leg * 0.7, leg * 0.7, 'xX');
  // main girder + machinery house + A-frame
  g.boxB(0, yg, -sz * 0.4, sx * 0.5, leg * 1.4, sz * 3.4, 'y');
  g.color(0xd8d4c8).boxB(0, yg + leg * 1.4, sz * 0.9, sx * 0.9, leg * 3, sz * 0.9, 'y');
  g.color(col);
  const apex: P3 = [0, H, -sz * 0.6];
  g.beam([-sx * 0.2, yg, -sz * 1.2], apex, leg * 0.6).beam([sx * 0.2, yg, -sz * 1.2], apex, leg * 0.6).beam([0, yg, sz * 0.6], apex, leg * 0.6);
  // boom towards local −Z (over the water): raised when idle
  const hinge: P3 = [0, yg + leg * 0.7, -sz * 2.1];
  const bl = H * 0.62;
  const tip: P3 = up ? [0, hinge[1] + bl * 0.9, hinge[2] - bl * 0.42] : [0, hinge[1], hinge[2] - bl];
  g.beam(hinge, tip, sx * 0.3, leg * 1.2);
  g.color(0x2a2c30).rod(apex, tip, 0.18, 3).rod(apex, [0, hinge[1] + (tip[1] - hinge[1]) * 0.5, hinge[2] + (tip[2] - hinge[2]) * 0.5], 0.18, 3);
  g.shadeBy(v0, (_x, y) => 0.7 + 0.3 * Math.min(1, y / H));
  const k = new Kit(ctx);
  k.g('flat', { cast: false }).append(g);
  k.flush();
}

/** Field of weathered timber piles (remains of an old pier) standing in open water: { w=20, d=14, rows=4 }. */
function pileField(def: PropDef, ctx: PropContext): void {
  const w = num(ctx, def, 'w', 20);
  const d = num(ctx, def, 'd', 14);
  const rows = Math.max(1, Math.round(num(ctx, def, 'rows', 4)));
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const pile = k.g('bark');
  const cols = Math.max(2, Math.round(w / 2.4));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() < 0.22) continue;
      const x = -w / 2 + (w * c) / (cols - 1) + range(rng, -0.25, 0.25);
      const z = (d * r) / Math.max(1, rows - 1) + range(rng, -0.25, 0.25);
      const hgt = range(rng, 1.4, 4.2);
      const v0 = pile.vertexCount;
      pile.color(0x4a3a2e, range(rng, 0.7, 1.1)).rod([x, -2.5, z], [x + range(rng, -0.25, 0.25), hgt, z + range(rng, -0.25, 0.25)], 0.2, 5, true, 0.15);
      pile.shadeBy(v0, (_x, y) => (y < 0.5 ? 0.5 : 1));
    }
    // a surviving cap beam on some rows
    if (rng() < 0.5) pile.color(0x3e3026).boxB(range(rng, -w * 0.2, w * 0.2), 1.3, (d * r) / Math.max(1, rows - 1), w * 0.45, 0.28, 0.3);
  }
  k.flush();
}

/** Dock clutter: kind 0 wooden cable drums · 1 pallet stacks · 2 oil drums. */
function dockClutter(def: PropDef, ctx: PropContext): void {
  const kind = Math.round(num(ctx, def, 'kind', 0));
  const n = Math.max(1, Math.round(num(ctx, def, 'count', 2)));
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const wood = k.g('pallet');
  const rust = k.g('rust');
  for (let i = 0; i < n; i++) {
    if (kind === 0) {
      const x = i * 1.9;
      const r = range(rng, 0.7, 0.95);
      const lay = rng() < 0.35;
      wood.push().translate(x, lay ? 0 : r, range(rng, -0.2, 0.2));
      if (!lay) wood.rotZ(Math.PI / 2);
      wood.color(0xb89868, range(rng, 0.75, 1)).cyl(0, 0, 0, r, r, 0.07, 10).cyl(0, 0.07, 0, r * 0.45, r * 0.45, 0.76, 8, false).cyl(0, 0.83, 0, r, r, 0.07, 10, true, true);
      wood.pop();
    } else if (kind === 1) {
      const x = i * 1.5;
      const m = 3 + Math.floor(rng() * 5);
      for (let j = 0; j < m; j++) wood.color(0xc9a878, range(rng, 0.7, 1)).boxR(x + range(rng, -0.04, 0.04), 0.07 + j * 0.15, range(rng, -0.04, 0.04), 1.2, 0.12, 1.0, range(rng, -0.06, 0.06), j ? 'y' : '');
    } else {
      const x = i * 0.75;
      rust.color(pick(rng, [0xa05838, 0x3a6a8a, 0x8a8a3a, 0x5a5e62]), range(rng, 0.8, 1)).cyl(x, 0, range(rng, -0.3, 0.3), 0.3, 0.3, 0.88, 8);
    }
  }
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
registerProp('usa.quay', quay);
registerProp('usa.utilityRun', utilityRun);
registerProp('usa.chainLink', chainLink);
registerProp('usa.dumpster', dumpster);
registerProp('usa.streetKit', streetKit);
registerProp('usa.van', van);
registerProp('usa.crane', crane);
registerProp('usa.pileField', pileField);
registerProp('usa.dockClutter', dockClutter);
