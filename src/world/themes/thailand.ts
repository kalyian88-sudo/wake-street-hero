/**
 * Theme 'thailand' — Bangkok klong (canal) neighbourhood.
 *   thailand.stiltHouseRow { bays=3, bayW=6, depth=6.5 }  wooden stilt houses, corrugated roofs (row along +X, facade +Z)
 *   thailand.shophouseRow  { bays=3, bayW=4.2, floors=3, depth=10 }  painted concrete shophouses with awnings
 *   thailand.sampan        { load=0..2, umbrella=1 }  moored fruit boat (length along Z)
 *   thailand.longtail      { }  longtail boat with canopy and engine pole
 *   thailand.spiritHouse   { }  small shrine on a post
 *   thailand.powerLines    { span=22, height=8 }  poles + tangled cables across the klong (local X = across)
 *   thailand.temple        { height=44 }  big golden prang + white terrace + tiered ubosot (landmark)
 *   thailand.skyline       { width=340 }  hazy modern towers
 */
import type { PropContext, PropDef } from '../../types';
import { FACADE_UV, SIGN_UV } from '../decals';
import { GB, mixHex } from '../geo';
import { registerProp } from '../props/registry';
import { Kit, num, pick, range } from '../props/common/util';

const WOODS: readonly number[] = [0xa68258, 0x86684a, 0xb89466, 0x6c7e68, 0x8fa3a8, 0xa9684a];
const ROOFS: readonly number[] = [0xa5593a, 0x9aa0a4, 0x3f7099, 0xb04e32, 0x7f8a7a];
const WALLS: readonly number[] = [0xe8dcc0, 0xd9a888, 0xc6d6c0, 0xe4c0be, 0xb7c8d6, 0xe9d28a, 0xd8d3c6];
const GOLD = 0xe9b72e;

function stiltHouseRow(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const bays = Math.max(1, Math.round(num(ctx, def, 'bays', 3)));
  const bayW = num(ctx, def, 'bayW', 6);
  const depth = num(ctx, def, 'depth', 6.5);
  const fh = 1.5;
  const wallH = 2.5;
  const x0 = -(bays * bayW) / 2;
  const wood = k.g('wood');
  const post = k.g('wood');
  const roofG = k.g('corrugated', { cast: true, receive: true }, { side: 'double' });
  const facade = k.g('facade');
  const bam = k.g('bamboo');
  const flat = k.g('flat');

  for (let b = 0; b < bays; b++) {
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const wc = pick(rng, WOODS);
    const rc = pick(rng, ROOFS);
    const dz = 1.8; // front deck depth
    // posts
    post.color(0x5a4430);
    for (const px of [bx + 0.3, cx, bx + bayW - 0.3]) {
      for (const pz of [dz - 0.2, -depth / 2, -depth + 0.3]) post.boxB(px + range(rng, -0.04, 0.04), -0.6, pz, 0.2, fh + 0.6, 0.2);
    }
    // floor / deck
    wood.color(0x7a5e40).boxB(cx, fh - 0.14, (dz - depth) / 2, bayW - 0.1, 0.14, depth + dz);
    // cross beams
    post.boxB(cx, fh - 0.3, (dz - depth) / 2, bayW, 0.14, 0.12);
    // body
    wood.color(wc).boxB(cx, fh, -depth / 2, bayW - 0.7, wallH, depth, 'y');
    // gable ends (triangles) under roof
    const rx0 = bx + 0.05;
    const rx1 = bx + bayW - 0.05;
    const eaveY = fh + wallH + 0.05;
    const ridgeY = eaveY + 1.15;
    const zf = dz + 0.15;
    const zb = -depth - 0.2;
    roofG.color(rc, range(rng, 0.85, 1.05));
    roofG.quad([rx0, eaveY, zf], [cx, ridgeY, zf], [cx, ridgeY, zb], [rx0, eaveY, zb]);
    roofG.quad([cx, ridgeY, zf], [rx1, eaveY, zf], [rx1, eaveY, zb], [cx, ridgeY, zb]);
    wood.color(wc, 0.8).tri([cx - bayW / 2 + 0.35, fh + wallH, 0.02], [cx + bayW / 2 - 0.35, fh + wallH, 0.02], [cx, ridgeY - 0.1, 0.02]);
    // roof ridge
    flat.color(0x6d5a4a).boxB(cx, ridgeY - 0.03, (zf + zb) / 2, 0.14, 0.1, zf - zb);
    // facade details
    facade.white();
    const wy = fh + 0.9;
    for (const wx of [cx - 1.7, cx + 1.7]) {
      const uv = rng() < 0.5 ? FACADE_UV.rectShutter : FACADE_UV.rectGlassDark;
      facade.quadUV([wx - 0.5, wy, 0.02], [wx + 0.5, wy, 0.02], [wx + 0.5, wy + 1.2, 0.02], [wx - 0.5, wy + 1.2, 0.02], uv[0], uv[1], uv[2], uv[3]);
    }
    const dr = FACADE_UV.doorWood;
    facade.quadUV([cx - 0.5, fh, 0.02], [cx + 0.5, fh, 0.02], [cx + 0.5, fh + 2.0, 0.02], [cx - 0.5, fh + 2.0, 0.02], dr[0], dr[1], dr[2], dr[3]);
    // deck railing (bamboo)
    bam.color(0xc9bb6a);
    const rz = dz - 0.1;
    for (const px of [bx + 0.35, bx + bayW * 0.33, bx + bayW * 0.66, bx + bayW - 0.35]) bam.boxB(px, fh, rz, 0.07, 0.95, 0.07);
    bam.boxB(cx, fh + 0.9, rz, bayW - 0.5, 0.06, 0.06);
    bam.boxB(cx, fh + 0.45, rz, bayW - 0.5, 0.05, 0.05);
    // pots / laundry
    if (rng() < 0.7) {
      const px = bx + range(rng, 0.9, bayW - 0.9);
      flat.color(0xc0623a).cyl(px, fh, dz - 0.5, 0.2, 0.15, 0.3, 7);
      flat.color(0x3f8a3a).sphere(px, fh + 0.5, dz - 0.5, 0.3, 0.26, 0.3, 7, 4);
    }
    if (rng() < 0.5) {
      const lx = bx + 0.6;
      flat.color(0x3a2e24).boxB(lx, fh + 1.5, 1.2, 0.05, 1.4, 0.05).boxB(lx + 3.4, fh + 1.5, 1.2, 0.05, 1.4, 0.05);
      flat.boxB(lx + 1.7, fh + 2.85, 1.2, 3.4, 0.02, 0.02);
      for (let i = 0; i < 4; i++) {
        flat.color(pick(rng, [0xe85a8a, 0x3fa0d8, 0xf2f2e8, 0xf0c030, 0x6cc070]));
        const qx = lx + 0.4 + i * 0.8;
        flat.quad([qx, fh + 2.0, 1.2], [qx + 0.5, fh + 2.0, 1.2], [qx + 0.5, fh + 2.85, 1.2], [qx, fh + 2.85, 1.2]);
      }
    }
    // water tank on a stand at the back
    if (rng() < 0.4) {
      flat.color(0x3a7f4a).cyl(bx + 0.9, eaveY + 0.0, -depth + 1.0, 0.45, 0.45, 0.9, 8);
    }
  }
  k.flush();
}

function shophouseRow(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const bays = Math.max(1, Math.round(num(ctx, def, 'bays', 3)));
  const bayW = num(ctx, def, 'bayW', 4.2);
  const floors = Math.max(1, Math.round(num(ctx, def, 'floors', 3)));
  const depth = num(ctx, def, 'depth', 10);
  const x0 = -(bays * bayW) / 2;
  const wall = k.g('plaster');
  const trim = k.g('plaster');
  const facade = k.g('facade');
  const signs = k.g('signs');
  const awn = k.g('corrugated', undefined, { side: 'double' });
  const flat = k.g('flat');
  const groundH = 3.4;
  const floorH = 3.1;
  for (let b = 0; b < bays; b++) {
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const fl = floors + (rng() < 0.3 ? 1 : 0) - (rng() < 0.25 ? 1 : 0);
    const f = Math.max(2, fl);
    const h = groundH + f * floorH;
    const wc = pick(rng, WALLS);
    wall.color(wc, range(rng, 0.88, 1.0)).boxB(cx, 0, -depth / 2, bayW - 0.04, h, depth, 'y');
    // slab lines
    trim.color(mixHex(wc, 0xffffff, 0.45));
    for (let i = 0; i <= f; i++) trim.boxB(cx, groundH + i * floorH - 0.1, 0.08, bayW, 0.2, 0.16);
    // shop front
    const shop = rng() < 0.5 ? FACADE_UV.shopRoller : FACADE_UV.shopGlass;
    facade.white().quadUV([cx - 1.6, 0.05, 0.02], [cx + 1.6, 0.05, 0.02], [cx + 1.6, 2.9, 0.02], [cx - 1.6, 2.9, 0.02], shop[0], shop[1], shop[2], shop[3]);
    // awning
    awn.color(pick(rng, [0xd23a2a, 0x2f7fb8, 0xe9b030, 0x3a9a5a, 0xcfcfc8]));
    awn.quad([cx - 1.9, 2.95, 0.0], [cx + 1.9, 2.95, 0.0], [cx + 1.9, 2.55, 1.3], [cx - 1.9, 2.55, 1.3]);
    // upper windows + balconies
    for (let i = 0; i < f; i++) {
      const y = groundH + i * floorH;
      for (const wx of [cx - bayW * 0.25, cx + bayW * 0.25]) {
        const uv = rng() < 0.55 ? FACADE_UV.rectGlassDark : FACADE_UV.rectShutter;
        const hh = uv === FACADE_UV.rectShutter ? 1.6 : 1.2;
        facade.white().quadUV([wx - 0.55, y + 0.9, 0.025], [wx + 0.55, y + 0.9, 0.025], [wx + 0.55, y + 0.9 + hh, 0.025], [wx - 0.55, y + 0.9 + hh, 0.025], uv[0], uv[1], uv[2], uv[3]);
      }
      if (rng() < 0.4) {
        const ac = FACADE_UV.aircon;
        const ax = cx + range(rng, -1.2, 1.2);
        facade.white().quadUV([ax - 0.4, y + 0.2, 0.03], [ax + 0.4, y + 0.2, 0.03], [ax + 0.4, y + 0.8, 0.03], [ax - 0.4, y + 0.8, 0.03], ac[0], ac[1], ac[2], ac[3]);
      }
      if (i > 0 && rng() < 0.35) {
        trim.color(0x4a4a48).boxB(cx, y, 0.5, bayW - 0.5, 0.1, 0.9);
        flat.color(0x2c2c2c).boxB(cx, y + 0.9, 0.92, bayW - 0.5, 0.05, 0.05);
      }
    }
    // sign
    if (rng() < 0.85) {
      const s = pick(rng, SIGN_UV.h);
      signs.white().quadUV([cx - 1.7, groundH + 0.15, 0.2], [cx + 1.7, groundH + 0.15, 0.2], [cx + 1.7, groundH + 0.95, 0.2], [cx - 1.7, groundH + 0.95, 0.2], s[0], s[1], s[2], s[3]);
    }
    // parapet + rooftop tank
    trim.color(mixHex(wc, 0x888888, 0.3)).boxB(cx, h, 0.0, bayW, 0.5, 0.2);
    if (rng() < 0.55) {
      flat.color(pick(rng, [0x2f6f9a, 0x3a3a3a, 0x9a9a92])).cyl(cx + range(rng, -1, 1), h, -depth * 0.5, 0.8, 0.8, 1.5, 9);
    }
  }
  k.flush();
}

/** Boat hull lofted from sections. Bow at +Z. */
function hull(g: GB, len: number, width: number, depth: number, rise: number, col: number, inner: number): void {
  const n = 10;
  const secs: { z: number; hw: number; yb: number; yt: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = Math.abs(t * 2 - 1);
    secs.push({
      z: -len / 2 + len * t,
      hw: (width / 2) * (0.35 + 0.65 * Math.cos(u * Math.PI * 0.5) ** 0.7) * (u > 0.97 ? 0.4 : 1),
      yb: -depth * (1 - 0.7 * u ** 2),
      yt: 0.3 + rise * u ** 4,
    });
  }
  g.color(col);
  for (let i = 0; i < n; i++) {
    const a = secs[i];
    const b = secs[i + 1];
    g.quad([-a.hw, a.yt, a.z], [-a.hw * 0.6, a.yb, a.z], [-b.hw * 0.6, b.yb, b.z], [-b.hw, b.yt, b.z]);
    g.quad([a.hw, a.yt, a.z], [b.hw, b.yt, b.z], [b.hw * 0.6, b.yb, b.z], [a.hw * 0.6, a.yb, a.z]);
    g.quad([-a.hw * 0.6, a.yb, a.z], [a.hw * 0.6, a.yb, a.z], [b.hw * 0.6, b.yb, b.z], [-b.hw * 0.6, b.yb, b.z]);
    // inner floor + gunwale rim
    g.color(inner).quad([-a.hw * 0.7, 0.08, a.z], [-b.hw * 0.7, 0.08, b.z], [b.hw * 0.7, 0.08, b.z], [a.hw * 0.7, 0.08, a.z]);
    g.color(col, 1.15);
    g.quad([-a.hw, a.yt, a.z], [-b.hw, b.yt, b.z], [-b.hw + 0.07, b.yt, b.z], [-a.hw + 0.07, a.yt, a.z]);
    g.quad([a.hw - 0.07, a.yt, a.z], [b.hw - 0.07, b.yt, b.z], [b.hw, b.yt, b.z], [a.hw, a.yt, a.z]);
    g.color(col);
  }
}

function sampan(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const load = Math.round(num(ctx, def, 'load', Math.floor(rng() * 3)));
  const umbrella = num(ctx, def, 'umbrella', 1) > 0;
  const hullG = k.g('wood', undefined, { side: 'double' });
  const flat = k.g('flat');
  const fab = k.g('fabric', undefined, { side: 'double' });
  const bam = k.g('bamboo');
  hull(hullG, 5.2, 1.4, 0.3, 0.55, pick(rng, [0x7b5a3a, 0x3f7a8a, 0x9a4a32, 0x5a6a42]), 0x6a5238);
  // fruit baskets / sacks
  const cols = [[0xf08a1e, 0xe8c22e], [0x3f9a3a, 0xc8d84a], [0xd8323a, 0xf0a0a0]];
  for (let i = 0; i < 3 + load; i++) {
    const bz = -1.4 + i * 0.85;
    const bx = range(rng, -0.25, 0.25);
    bam.color(0xcaa860).cyl(bx, 0.08, bz, 0.34, 0.4, 0.3, 8);
    const [c1, c2] = pick(rng, cols);
    for (let j = 0; j < 6; j++) {
      flat.color(j % 2 ? c1 : c2).sphere(bx + range(rng, -0.22, 0.22), 0.42 + range(rng, 0, 0.1), bz + range(rng, -0.22, 0.22), 0.14, 0.14, 0.14, 6, 4);
    }
  }
  if (umbrella) {
    const uc = pick(rng, [0xe0342a, 0x2f8fd0, 0xf0c030, 0x36a85a, 0xf2f2e6]);
    flat.color(0x6a5a48).cyl(0.0, 0.1, -0.6, 0.03, 0.03, 2.2, 5);
    fab.color(uc).cyl(0.0, 2.1, -0.6, 1.5, 0.08, 0.5, 10);
    fab.color(uc, 0.7).disc(0.0, 2.1, -0.6, 1.5, 10, -1);
  }
  // vendor
  flat.color(0xd9b38a).sphere(0.05, 0.95, 1.5, 0.13, 0.15, 0.13, 7, 5);
  flat.color(0xc8b050).cyl(0.05, 0.98, 1.5, 0.3, 0.05, 0.16, 9);
  flat.color(pick(rng, [0x2a6ab0, 0xc03a3a, 0x2a8a5a])).cyl(0.05, 0.1, 1.5, 0.2, 0.15, 0.78, 7);
  // oar
  flat.color(0x6a5238).rod([0.5, 0.5, 2.2], [0.9, 0.0, 3.4], 0.03, 5);
  k.flush();
}

function longtail(_def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const hullG = k.g('wood', undefined, { side: 'double' });
  const flat = k.g('flat');
  const fab = k.g('fabric', undefined, { side: 'double' });
  const metal = k.g('metal');
  hull(hullG, 8.4, 1.3, 0.35, 0.9, pick(rng, [0x2f6fa8, 0xb83a2a, 0x2a8a6a, 0xd0902a]), 0x7a5a3a);
  // canopy
  const cc = pick(rng, [0xf0d8a0, 0x4aa0c8, 0xe85a3a]);
  for (const [px, pz] of [[-0.5, 0.2], [0.5, 0.2], [-0.5, 2.8], [0.5, 2.8]] as const) flat.color(0x5a4530).boxB(px, 0.1, pz, 0.06, 1.8, 0.06);
  fab.color(cc).quad([-0.8, 1.95, 0.0], [0.8, 1.95, 0.0], [0.8, 1.95, 3.1], [-0.8, 1.95, 3.1]);
  // engine + long shaft at stern
  metal.color(0x555a60).boxB(0, 0.3, -3.3, 0.6, 0.5, 0.7);
  metal.color(0x3a3d42).rod([0, 0.6, -3.5], [0, -0.1, -6.3], 0.035, 6);
  flat.color(0x2a2a2a).cyl(0, -0.2, -6.3, 0.1, 0.1, 0.12, 6);
  // bow garland + ribbons
  for (let i = 0; i < 3; i++) flat.color(pick(rng, [0xe85a8a, 0xf0c030, 0xffffff])).boxB(0, 1.0 + i * 0.12, 4.15 + i * 0.03, 0.1, 0.35, 0.03);
  // seats
  flat.color(0x6a5238).boxB(0, 0.2, 0.2, 1.0, 0.08, 0.35).boxB(0, 0.2, 1.4, 1.0, 0.08, 0.35).boxB(0, 0.2, 2.5, 1.0, 0.08, 0.35);
  k.flush();
}

function spiritHouse(_def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const wh = k.g('plaster');
  const gold = k.g('paintedMetal');
  const flat = k.g('flat');
  wh.color(0xefe8d8).cyl(0, 0, 0, 0.14, 0.14, 1.5, 6);
  wh.color(0xefe8d8).boxB(0, 1.5, 0, 0.9, 0.1, 0.9);
  wh.color(0xd9402a).boxB(0, 1.6, 0, 0.62, 0.5, 0.62);
  gold.color(GOLD);
  for (let i = 0; i < 3; i++) {
    gold.push().translate(0, 2.1 + i * 0.22, 0).rotY(Math.PI / 4).cyl(0, 0, 0, 0.62 - i * 0.14, 0.32 - i * 0.08, 0.22, 4).pop();
  }
  gold.cyl(0, 2.75, 0, 0.03, 0.0, 0.3, 4);
  wh.color(0xefe8d8).boxB(0.0, 1.5, 0.75, 0.9, 0.06, 0.5);
  for (let i = 0; i < 4; i++) flat.color(pick(rng, [0xe8302a, 0xf0a020, 0x3a9a50, 0xf2f2e8])).cyl(-0.3 + i * 0.2, 1.56, 0.72, 0.04, 0.04, 0.1, 5);
  // marigold garland
  for (let i = 0; i < 5; i++) flat.color(0xf0a010).sphere(-0.36 + i * 0.18, 1.94, 0.32, 0.05, 0.05, 0.05, 5, 3);
  k.flush();
}

function powerLines(def: PropDef, ctx: PropContext): void {
  const rng = ctx.rng;
  const span = num(ctx, def, 'span', 22);
  const height = num(ctx, def, 'height', 8);
  const k = new Kit(ctx);
  const conc = k.g('concrete');
  const flat = k.g('flat');
  for (const sx of [-span / 2, span / 2]) {
    conc.color(0xa8a8a0).cyl(sx, 0, 0, 0.17, 0.12, height + 0.6, 7);
    flat.color(0x4a4036).boxB(sx, height - 0.2, 0, 0.1, 0.1, 1.9).boxB(sx, height - 1.0, 0, 0.1, 0.1, 1.4);
    if (rng() < 0.6) flat.color(0x6a6e72).cyl(sx + 0.3, height - 2.4, 0.2, 0.28, 0.28, 0.7, 8);
  }
  k.flush();
  const cab = new GB();
  cab.color(0x1c1a18);
  const nWire = 6;
  for (let w = 0; w < nWire; w++) {
    const y0 = height - (w < 3 ? 0.15 : 0.95);
    const z0 = (w % 3 - 1) * 0.8 + range(rng, -0.1, 0.1);
    const pts: [number, number, number][] = [];
    const sag = range(rng, 0.5, 1.6);
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push([-span / 2 + span * t, y0 - sag * 4 * t * (1 - t), z0 + Math.sin(t * Math.PI * 2 + w) * 0.12]);
    }
    cab.tube(pts, 0.016, 4);
  }
  // loose hanging loop / tangle
  for (let i = 0; i < 2; i++) {
    const pts: [number, number, number][] = [];
    const cxl = range(rng, -span * 0.3, span * 0.3);
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      pts.push([cxl + (t - 0.5) * 6, height - 0.6 - 2.2 * Math.sin(t * Math.PI), range(rng, -0.2, 0.2) + (t - 0.5) * 0.6]);
    }
    cab.tube(pts, 0.014, 4);
  }
  ctx.addStatic(cab.build(), ctx.mat('flat'), ctx.matrixAt());
}

function temple(def: PropDef, ctx: PropContext): void {
  const H = num(ctx, def, 'height', 44);
  const k = new Kit(ctx);
  const white = k.g('plaster');
  const gold = k.g('paintedMetal');
  const flat = k.g('flat');
  const R = H * 0.2;
  // terrace
  white.color(0xf4efe4).boxB(0, -4, 0, R * 4.6, 4 + 1.2, R * 4.6);
  white.boxB(0, 1.2, 0, R * 3.8, 1.0, R * 3.8);
  white.boxB(0, 2.2, 0, R * 3.0, 1.0, R * 3.0);
  const base = 3.2;
  // main prang: stepped tiers
  const prof: [number, number][] = [];
  const tiers = 7;
  let y = base;
  let r = R;
  for (let i = 0; i < tiers; i++) {
    const th = (H * 0.62) / tiers * (i < 2 ? 1.25 : 0.95);
    prof.push([r, y]);
    prof.push([r * 0.84, y + th]);
    y += th;
    r *= 0.8;
    if (i === 1) r = R * 0.6;
  }
  prof.push([r * 0.9, y + 0.5]);
  prof.push([r * 0.55, y + 2.2]);
  prof.push([0.15, y + H * 0.12]);
  const g = new GB();
  g.color(0xf1ecdc).lathe(0, 0, prof.slice(0, 2), 12);
  white.merge(g.build());
  const g2 = new GB();
  g2.color(GOLD).lathe(0, 0, prof.slice(2), 12);
  gold.merge(g2.build());
  // gold bands on the white tiers
  gold.color(GOLD);
  for (let i = 0; i < 2; i++) gold.cyl(0, base + i * H * 0.1 + 0.2, 0, R * 1.0 - i * 0.2, R * 0.96, 0.5, 12);
  // spire
  gold.rod([0, y + H * 0.1, 0], [0, y + H * 0.22, 0], 0.2, 5, false, 0.03);
  // four corner prangs
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const cx = sx * R * 1.55;
    const cz = sz * R * 1.55;
    const hh = H * 0.34;
    const gp = new GB();
    gp.color(0xf1ecdc).lathe(cx, cz, [[R * 0.4, 2.2], [R * 0.34, 2.2 + hh * 0.4], [R * 0.4, 2.2 + hh * 0.4], [R * 0.22, 2.2 + hh * 0.8]], 8);
    white.merge(gp.build());
    gold.cyl(cx, 2.2 + hh * 0.8, cz, R * 0.22, 0.04, hh * 0.35, 8);
  }
  // ubosot (hall) with tiered roofs in front (toward -Z)
  const hz = -R * 4.4;
  white.color(0xf4efe4).boxB(0, 0, hz, R * 2.2, 5.5, R * 3.0);
  const roofCols = [0xd2541c, 0xb82a1c, 0xd2541c];
  for (let t = 0; t < 3; t++) {
    const w = R * (1.35 - t * 0.2);
    const rh = 2.4 - t * 0.2;
    const yy = 5.5 + t * 2.2;
    const L = R * (1.8 - t * 0.3);
    const rg = new GB();
    rg.color(roofCols[t]).prism([[-w, 0], [w, 0], [w * 0.88, rh * 0.3], [0, rh], [-w * 0.88, rh * 0.3]], hz - L, hz + L, true, true, true);
    rg.translate(0, 0, 0);
    const geo = rg.build();
    geo.translate(0, yy, 0);
    flat.merge(geo);
    gold.boxB(0, yy + rh - 0.05, hz, 0.3, 0.3, L * 2 + 0.6);
    gold.boxB(0, yy + rh * 0.35, hz - L - 0.1, w * 1.75, 0.18, 0.2);
  }
  // chofa horns at the front gable
  gold.rod([0, 10.6, hz - R * 1.5], [0, 12.0, hz - R * 1.7], 0.14, 5, false, 0.03);
  // columns
  for (let i = -2; i <= 2; i++) white.boxB(i * R * 0.45, 0, hz - R * 1.62, 0.5, 5.0, 0.5);
  k.flush();
}

function skyline(def: PropDef, ctx: PropContext): void {
  const width = num(ctx, def, 'width', 340);
  const rng = ctx.rng;
  const g = new GB();
  const hazeCol = 0xc9d3d6;
  let x = -width / 2;
  while (x < width / 2) {
    const w = range(rng, 8, 20);
    const h = range(rng, 25, 85) * (0.55 + 0.45 * Math.cos((x / (width / 2)) * 1.3));
    const col = mixHex(pick(rng, [0x5f7080, 0x6c7a84, 0x56667a, 0x7a8890]), hazeCol, 0.28);
    const v0 = g.vertexCount;
    g.color(col).boxB(x + w / 2, -6, 0, w, h + 6, range(rng, 10, 16), 'y');
    if (rng() < 0.4) g.boxB(x + w / 2, h - 6, 0, w * 0.6, 6 + range(rng, 2, 10), 8, 'y');
    g.shadeBy(v0, (_x, yy) => 0.72 + 0.28 * Math.min(1, Math.max(0, (yy + 6) / 80)));
    x += w + range(rng, 1, 7);
  }
  // needle tower
  g.color(0x9aa7ad).cyl(-width * 0.12, -6, 0, 3, 2, 100, 8).sphere(-width * 0.12, 112, 0, 6, 6, 6, 8, 5).cyl(-width * 0.12, 116, 0, 0.8, 0.1, 40, 5);
  // pointed crown tower
  g.color(0x8794a0).boxB(width * 0.2, -6, 0, 18, 125, 14, 'y').cyl(width * 0.2, 119, 0, 6, 0.3, 30, 4);
  ctx.addStatic(g.build(), ctx.mat('flat', { roughness: 1 }), ctx.matrixAt());
}

registerProp('thailand.stiltHouseRow', stiltHouseRow);
registerProp('thailand.shophouseRow', shophouseRow);
registerProp('thailand.sampan', sampan);
registerProp('thailand.longtail', longtail);
registerProp('thailand.spiritHouse', spiritHouse);
registerProp('thailand.powerLines', powerLines);
registerProp('thailand.temple', temple);
registerProp('thailand.skyline', skyline);
