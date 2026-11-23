/**
 * Theme 'thailand' — Bangkok klong (canal) neighbourhood.
 *   thailand.stiltHouseRow { bays=3, bayW=6, depth=6.5 }  wooden stilt houses, corrugated roofs (row along +X, facade +Z):
 *       timber windows (some open and lit), doors, rusty sheet patches, laundry, tarps, plants, signs, antennas
 *   thailand.shophouseRow  { bays=3, bayW=4.2, floors=3, depth=10 }  painted concrete shophouses with awnings,
 *       sills, air-cons, blade signs, rooftop shacks / billboards, rain streaks
 *   thailand.sampan        { load=0..2, umbrella=1 }  moored fruit boat (length along Z)
 *   thailand.longtail      { }  longtail boat with canopy and engine pole
 *   thailand.spiritHouse   { }  small shrine on a post
 *   thailand.powerLines    { span=22, height=8 }  poles + tangled cables across the klong (local X = across)
 *   thailand.poleRun       { count=9, spacing=19, side=1 }  concrete utility poles along local +Z with sagging
 *       cable bundles, transformers, tube lamps and service drops (side = +1: houses at +X, canal at −X)
 *   thailand.klongQuay     { length=40, top=0.8, ladderAt=[..], gaps=[z0,z1,..], paint=0 }  canal edge dressing along
 *       local Z: wall face = plane x = 0 facing −X (water side), bank at x > 0. Stained concrete facing, algae,
 *       kerb blocks exactly TRIM_TOP.kerb tall, mooring stubs, ladders. Nothing reaches > 7 cm into the water.
 *   thailand.foodCart      { }  street-food cart with canopy (long side along local Z, serving side faces −X)
 *   thailand.wat           { w=13, depth=16 }  temple hall with a three-tiered roof, gilded gable, compound wall
 *       and two small chedis (front faces local +Z)
 *   thailand.temple        { height=44 }  big golden prang + white terrace + tiered ubosot (landmark)
 *   thailand.skyline       { width=340 }  hazy modern towers
 */
import { TRIM_TOP } from '../../data/geometry';
import type { PropContext, PropDef } from '../../types';
import { wetShade } from '../build';
import { FACADE_UV, GRIME_UV, KLONG_UV, SIGN_UV } from '../decals';
import type { UVRect } from '../decals';
import { GB, mixHex } from '../geo';
import type { P3 } from '../geo';
import { registerProp } from '../props/registry';
import { Kit, lightLevel, list, num, pick, range } from '../props/common/util';

const WOODS: readonly number[] = [0xa68258, 0x86684a, 0xb89466, 0x6c7e68, 0x8fa3a8, 0xa9684a];
const ROOFS: readonly number[] = [0xa5593a, 0x9aa0a4, 0x3f7099, 0xb04e32, 0x7f8a7a];
const WALLS: readonly number[] = [0xe8dcc0, 0xd9a888, 0xc6d6c0, 0xe4c0be, 0xb7c8d6, 0xe9d28a, 0xd8d3c6];
const GOLD = 0xe9b72e;

/** Atlas quad facing +Z in the plane z. */
function faceZ(g: GB, x0: number, x1: number, y0: number, y1: number, z: number, r: UVRect): void {
  g.quadUV([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], r[0], r[1], r[2], r[3]);
}
/** Atlas quad in the plane x, visible from both sides (z0..z1 × y0..y1). */
function crossX(g: GB, x: number, z0: number, z1: number, y0: number, y1: number, r: UVRect): void {
  g.quadUV([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], r[0], r[1], r[2], r[3]);
  g.quadUV([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], r[2], r[1], r[0], r[3]);
}
/** Part of an atlas rect (u range a..b of its width). */
function subU(r: UVRect, a: number, b: number): UVRect {
  return [r[0] + (r[2] - r[0]) * a, r[1], r[0] + (r[2] - r[0]) * b, r[3]];
}
/**
 * Atlas quad lying on a roof slope whose ridge runs along Z: from the eave (xe, ye) up to (xr, yr),
 * between z0 < z1. U runs along Z, V up the slope.
 */
function slopeQuad(g: GB, xe: number, ye: number, xr: number, yr: number, z0: number, z1: number, r: UVRect, lift = 0.03): void {
  const dx = xr - xe;
  const dy = yr - ye;
  const len = Math.hypot(dx, dy) || 1;
  const s = dx > 0 ? 1 : -1;
  const ox = (-dy / len) * s * lift;
  const oy = (dx / len) * s * lift;
  if (dx < 0) g.quadUV([xe + ox, ye + oy, z1], [xe + ox, ye + oy, z0], [xr + ox, yr + oy, z0], [xr + ox, yr + oy, z1], r[0], r[1], r[2], r[3]);
  else g.quadUV([xe + ox, ye + oy, z0], [xe + ox, ye + oy, z1], [xr + ox, yr + oy, z1], [xr + ox, yr + oy, z0], r[0], r[1], r[2], r[3]);
}

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
  const deco = k.g('klongDecor');
  const glow = k.g('klongGlow');
  const grime = k.g('grime');
  const bam = k.g('bamboo');
  const flat = k.g('flat');
  const lamp = k.g('neon', undefined, { intensity: 1 });
  const lvl = lightLevel(ctx);
  const stairBay = Math.floor(rng() * bays);

  for (let b = 0; b < bays; b++) {
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const wc = pick(rng, WOODS);
    const rc = pick(rng, ROOFS);
    const dz = 1.8; // front deck depth
    // posts (darker and damp towards the ground)
    post.color(0x5a4430);
    const pv = post.vertexCount;
    for (const px of [bx + 0.3, cx, bx + bayW - 0.3]) {
      for (const pz of [dz - 0.2, -depth / 2, -depth + 0.3]) post.boxB(px + range(rng, -0.04, 0.04), -0.6, pz, 0.2, fh + 0.6, 0.2);
    }
    post.shadeBy(pv, (_x, y) => 0.6 + 0.4 * Math.min(1, Math.max(0, y / 1.1)));
    // floor / deck
    wood.color(0x7a5e40).boxB(cx, fh - 0.14, (dz - depth) / 2, bayW - 0.1, 0.14, depth + dz);
    // cross beams
    post.boxB(cx, fh - 0.3, (dz - depth) / 2, bayW, 0.14, 0.12);
    post.boxB(cx, fh - 0.3, dz - 0.2, bayW, 0.14, 0.12);
    // body: weathered boards, darker towards the deck
    const bv = wood.vertexCount;
    wood.color(wc, range(rng, 0.85, 1.02)).boxB(cx, fh, -depth / 2, bayW - 0.7, wallH, depth, 'y');
    wood.shadeBy(bv, (_x, y) => 0.72 + 0.28 * Math.min(1, (y - fh) / (wallH * 0.7)));
    // roof
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
    flat.color(0x6d5a4a).boxB(cx, ridgeY - 0.03, (zf + zb) / 2, 0.14, 0.1, zf - zb);
    // fascia boards on the canal-side gable
    wood.color(0x4a382a).beam([rx0, eaveY - 0.04, zf], [cx, ridgeY - 0.04, zf], 0.05, 0.16).beam([cx, ridgeY - 0.04, zf], [rx1, eaveY - 0.04, zf], 0.05, 0.16);
    // rust and a mismatched replacement sheet on the roof
    for (const [xe, w0] of [[rx0, 1], [rx1, -1]] as const) {
      if (rng() < 0.75) {
        const t0 = range(rng, 0, 0.45);
        const t1 = t0 + range(rng, 0.35, 0.55);
        const za = range(rng, zb + 0.5, zf - 3.2);
        deco.color(0xffffff, range(rng, 0.75, 1));
        slopeQuad(deco, xe + (cx - xe) * t0, eaveY + (ridgeY - eaveY) * t0, xe + (cx - xe) * t1, eaveY + (ridgeY - eaveY) * t1, za, za + range(rng, 1.6, 2.8), KLONG_UV.rustBlot);
      }
      if (rng() < 0.3) {
        const za = range(rng, zb + 0.5, zf - 2.6);
        deco.color(0xffffff, range(rng, 0.8, 1));
        slopeQuad(deco, xe + w0 * 0.1, eaveY + 0.04, xe + (cx - xe) * 0.5, eaveY + (ridgeY - eaveY) * 0.5, za, za + 2.2, KLONG_UV.rustSheet[Math.floor(rng() * 2)], 0.04);
      }
    }
    // TV antenna
    if (rng() < 0.35) {
      const az = range(rng, zb + 1, -1);
      flat.color(0x8a8e92).boxB(cx, ridgeY, az, 0.04, 1.7, 0.04, 'y');
      for (let i = 0; i < 3; i++) flat.boxB(cx, ridgeY + 1.1 + i * 0.22, az, 0.9 - i * 0.2, 0.025, 0.025, 'y');
    }

    // ── facade: windows, door, tube lamp ──
    const wy = fh + 0.95;
    for (const wx of [cx - 1.7, cx + 1.7]) {
      if (rng() < 0.38) {
        glow.rgb(lvl * 0.78, lvl * 0.8, lvl * 0.72);
        faceZ(glow, wx - 0.46, wx + 0.46, wy + 0.06, wy + 1.0, 0.012, KLONG_UV.litRoom[Math.floor(rng() * 2)]);
        faceZ(deco.white(), wx - 0.55, wx + 0.55, wy, wy + 1.1, 0.03, KLONG_UV.winFrame);
      } else {
        deco.color(0xffffff, range(rng, 0.8, 1));
        faceZ(deco, wx - 0.55, wx + 0.55, wy, wy + 1.1, 0.03, KLONG_UV.winShut[Math.floor(rng() * 2)]);
      }
      wood.color(0x4a382a).boxB(wx, wy - 0.06, 0.07, 1.25, 0.06, 0.12, 'z');
      if (rng() < 0.6) faceZ(grime.white(), wx - 0.6, wx + 0.6, wy - 0.06 - range(rng, 0.5, 0.9), wy - 0.06, 0.03, GRIME_UV.streaks);
    }
    faceZ(deco.color(0xffffff, range(rng, 0.85, 1)), cx - 0.5, cx + 0.5, fh, fh + 2.0, 0.03, KLONG_UV.door[rng() < 0.55 ? 0 : 1]);
    lamp.color(0xeaffee, lvl * 1.15).boxB(cx + range(rng, -0.3, 0.3), fh + 2.2, 0.1, 1.15, 0.04, 0.05, 'z');
    // damp at the foot of the wall, soot above the door
    faceZ(grime.white(), cx - bayW / 2 + 0.35, cx + bayW / 2 - 0.35, fh, fh + 0.8, 0.034, GRIME_UV.damp);
    if (rng() < 0.5) faceZ(grime, cx - 1.0, cx + 1.0, fh + 1.9, fh + 2.6, 0.034, GRIME_UV.blot);
    // meters / posters / sheet patch next to the door
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.6) faceZ(deco.white(), cx + side * 0.62, cx + side * 0.62 + side * 0.5, fh + 1.2, fh + 1.7, 0.035, KLONG_UV.meters);
    if (rng() < 0.4) faceZ(deco.white(), cx - side * 0.6 - 0.3, cx - side * 0.6 + 0.3, fh + 0.9, fh + 1.5, 0.035, KLONG_UV.posters);
    if (rng() < 0.35) {
      const px = cx + side * range(rng, 1.9, 2.1);
      deco.color(0xffffff, range(rng, 0.75, 1));
      faceZ(deco, px - 0.5, px + 0.5, fh + 0.02, fh + 0.92, 0.035, KLONG_UV.rustSheet[Math.floor(rng() * 2)]);
    }
    // sign in the gable
    if (rng() < 0.4) {
      const s = pick(rng, KLONG_UV.hSign);
      faceZ(deco.white(), cx - 1.05, cx + 1.05, fh + wallH + 0.03, fh + wallH + 0.69, 0.06, s);
    }

    // ── deck: railing, plants, laundry, tarps, signs ──
    bam.color(0xc9bb6a);
    const rz = dz - 0.1;
    for (const px of [bx + 0.35, bx + bayW * 0.33, bx + bayW * 0.66, bx + bayW - 0.35]) bam.boxB(px, fh, rz, 0.07, 0.95, 0.07);
    bam.boxB(cx, fh + 0.9, rz, bayW - 0.5, 0.06, 0.06);
    bam.boxB(cx, fh + 0.45, rz, bayW - 0.5, 0.05, 0.05);
    // board or banner tied to the railing
    const railSign = rng();
    if (railSign < 0.3) faceZ(deco.white(), cx - 1.1, cx + 1.1, fh + 0.12, fh + 0.81, rz + 0.06, pick(rng, KLONG_UV.hSign));
    else if (railSign < 0.45) faceZ(deco.white(), cx - 1.5, cx + 1.5, fh + 0.14, fh + 0.8, rz + 0.06, KLONG_UV.banner);
    else if (railSign < 0.6) faceZ(deco.color(0xffffff, 0.9), cx - 1.2, cx + 1.2, fh + 0.05, fh + 0.9, rz + 0.06, KLONG_UV.tarp);
    // potted plants on the rail and the deck (crossed cards)
    const nPl = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < nPl; i++) {
      const px = bx + range(rng, 0.6, bayW - 0.6);
      const onRail = rng() < 0.5;
      const py = onRail ? fh + 0.93 : fh;
      const pz = onRail ? rz : dz - range(rng, 0.45, 0.9);
      const u = Math.floor(rng() * 3) / 3;
      const r = subU(KLONG_UV.plants, u, u + 1 / 3);
      const hw = 0.42;
      const hh = onRail ? 0.7 : 1.05;
      deco.color(0xffffff, range(rng, 0.8, 1.05));
      faceZ(deco, px - hw, px + hw, py, py + hh, pz, r);
      crossX(deco, px, pz - hw, pz + hw, py, py + hh, r);
    }
    // washing hung across the deck (faces up / down the canal)
    if (rng() < 0.5) {
      const lx = bx + range(rng, 0.7, bayW - 0.7);
      crossX(deco.white(), lx, 0.08, 1.68, fh + 1.55, fh + 2.2, KLONG_UV.laundry);
    }
    // tarp screen between neighbours
    if (rng() < 0.28) {
      deco.color(0xffffff, range(rng, 0.75, 0.95));
      crossX(deco, bx + 0.12, 0.05, 1.65, fh + 0.05, fh + range(rng, 1.5, 2.1), KLONG_UV.tarp);
    }
    // blade sign on a post at the deck edge
    if (rng() < 0.3) {
      const px = bx + bayW - 0.3;
      flat.color(0x3a3430).boxB(px, fh, dz - 0.05, 0.06, 2.9, 0.06, 'y');
      crossX(deco.white(), px, dz, dz + 0.5, fh + 0.85, fh + 2.85, pick(rng, KLONG_UV.vSign));
    }
    // tarp awning stretched out over the walkway
    if (rng() < 0.3) {
      const ax = cx + range(rng, -0.8, 0.8);
      const aw = 1.4;
      const y1 = eaveY - 0.25;
      const y2 = eaveY - 0.75;
      const z2 = zf + 0.95;
      const r = rng() < 0.5 ? KLONG_UV.tarp : KLONG_UV.awning;
      deco.color(0xffffff, 0.95).quadUV([ax - aw, y2, z2], [ax + aw, y2, z2], [ax + aw, y1, zf - 0.3], [ax - aw, y1, zf - 0.3], r[0], r[1], r[2], r[3]);
      deco.color(0xffffff, 0.6).quadUV([ax + aw, y2, z2], [ax - aw, y2, z2], [ax - aw, y1, zf - 0.3], [ax + aw, y1, zf - 0.3], r[0], r[1], r[2], r[3]);
      bam.color(0xb8a860);
      for (const s of [-1, 1]) bam.beam([ax + s * aw, fh + 0.9, rz], [ax + s * aw, y2, z2], 0.035);
    }
    // blue PVC downpipe
    if (rng() < 0.4) {
      const px = bx + 0.14;
      flat.color(0x3f78b8).rod([px, eaveY - 0.1, dz - 0.05], [px, -0.1, dz - 0.05], 0.04, 4);
    }
    // under the house: jars, barrels, crates in the shade
    if (rng() < 0.6) {
      const px = bx + range(rng, 1.5, bayW - 1.5);
      deco.color(0xffffff, 0.72);
      faceZ(deco, px - 1.1, px + 1.1, 0, 0.96, dz - 0.55, KLONG_UV.jars);
    }
    if (rng() < 0.35) {
      const px = bx + range(rng, 1.0, bayW - 1.0);
      deco.color(0xffffff, 0.7);
      faceZ(deco, px - 0.55, px + 0.55, 0, 0.96, dz - 0.75, KLONG_UV.crates);
    }
    // steps from the deck down to the walkway (run along the deck front)
    if (b === stairBay) {
      const sx = bx + 1.2;
      const n = 6;
      wood.color(0x6a5238);
      for (let i = 0; i < n; i++) wood.boxB(sx + i * 0.3, fh - (i + 1) * (fh / (n + 1)) - 0.05, dz + 0.28, 0.3, 0.05, 0.5);
      wood.color(0x4a382a).beam([sx - 0.15, fh - 0.2, dz + 0.5], [sx + n * 0.3, 0.0, dz + 0.5], 0.05, 0.16);
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
  const deco = k.g('klongDecor');
  const glow = k.g('klongGlow');
  const grime = k.g('grime');
  const lvl = lightLevel(ctx);
  const groundH = 3.4;
  const floorH = 3.1;
  for (let b = 0; b < bays; b++) {
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const fl = floors + (rng() < 0.3 ? 1 : 0) - (rng() < 0.25 ? 1 : 0);
    const f = Math.max(2, fl);
    const h = groundH + f * floorH;
    const wc = pick(rng, WALLS);
    const wv = wall.vertexCount;
    wall.color(wc, range(rng, 0.84, 1.0)).boxB(cx, 0, -depth / 2, bayW - 0.04, h, depth, 'y');
    wall.shadeBy(wv, (_x, y) => 0.8 + 0.2 * Math.min(1, y / (h * 0.8)));
    // slab lines
    trim.color(mixHex(wc, 0xffffff, 0.45));
    for (let i = 0; i <= f; i++) trim.boxB(cx, groundH + i * floorH - 0.1, 0.08, bayW, 0.2, 0.16, 'z');
    // shop front
    const shop = rng() < 0.5 ? FACADE_UV.shopRoller : FACADE_UV.shopGlass;
    facade.white().quadUV([cx - 1.6, 0.05, 0.02], [cx + 1.6, 0.05, 0.02], [cx + 1.6, 2.9, 0.02], [cx - 1.6, 2.9, 0.02], shop[0], shop[1], shop[2], shop[3]);
    // awning
    awn.color(pick(rng, [0xd23a2a, 0x2f7fb8, 0xe9b030, 0x3a9a5a, 0xcfcfc8]));
    awn.quad([cx - 1.9, 2.95, 0.0], [cx + 1.9, 2.95, 0.0], [cx + 1.9, 2.55, 1.3], [cx - 1.9, 2.55, 1.3]);
    // upper windows + balconies
    for (let i = 0; i < f; i++) {
      const y = groundH + i * floorH;
      const lit = rng() < 0.22;
      for (const wx of [cx - bayW * 0.25, cx + bayW * 0.25]) {
        if (lit) {
          glow.rgb(lvl * 0.8, lvl * 0.8, lvl * 0.7);
          faceZ(glow, wx - 0.5, wx + 0.5, y + 0.95, y + 2.05, 0.02, KLONG_UV.litRoom[Math.floor(rng() * 2)]);
          faceZ(deco.white(), wx - 0.6, wx + 0.6, y + 0.9, y + 2.1, 0.035, KLONG_UV.winFrame);
        } else {
          const uv = rng() < 0.55 ? FACADE_UV.rectGlassDark : FACADE_UV.rectShutter;
          const hh = uv === FACADE_UV.rectShutter ? 1.6 : 1.2;
          facade.white().quadUV([wx - 0.55, y + 0.9, 0.025], [wx + 0.55, y + 0.9, 0.025], [wx + 0.55, y + 0.9 + hh, 0.025], [wx - 0.55, y + 0.9 + hh, 0.025], uv[0], uv[1], uv[2], uv[3]);
        }
      }
      // one sill band per floor + rain streaks below it
      trim.color(mixHex(wc, 0xffffff, 0.3)).boxB(cx, y + 0.78, 0.07, bayW - 0.7, 0.1, 0.14, 'z');
      if (rng() < 0.7) faceZ(grime.white(), bx + range(rng, 0.2, 0.8), bx + bayW - range(rng, 0.2, 0.8), y + 0.78 - range(rng, 0.7, 1.4), y + 0.78, 0.03, GRIME_UV.streaks);
      if (rng() < 0.45) {
        // air-con box on brackets with a rust trail
        const ac = FACADE_UV.aircon;
        const ax = cx + range(rng, -0.3, 0.3);
        flat.color(0xdedbd2).boxB(ax, y + 0.12, 0.2, 0.8, 0.56, 0.34, 'zZ');
        facade.white().quadUV([ax - 0.4, y + 0.12, 0.372], [ax + 0.4, y + 0.12, 0.372], [ax + 0.4, y + 0.68, 0.372], [ax - 0.4, y + 0.68, 0.372], ac[0], ac[1], ac[2], ac[3]);
        faceZ(grime.white(), ax - 0.4, ax + 0.4, y - 1.0, y + 0.12, 0.03, GRIME_UV.drip);
      }
      if (i > 0 && rng() < 0.35) {
        trim.color(0x4a4a48).boxB(cx, y, 0.5, bayW - 0.5, 0.1, 0.9);
        flat.color(0x2c2c2c).boxB(cx, y + 0.9, 0.92, bayW - 0.5, 0.05, 0.05);
        // washing or plants on the balcony
        if (rng() < 0.6) faceZ(deco.white(), cx - 1.2, cx + 1.2, y + 0.95, y + 1.9, 0.9, KLONG_UV.laundry);
        else faceZ(deco.white(), cx - 1.3, cx + 1.3, y + 0.1, y + 1.2, 0.95, KLONG_UV.plants);
      }
    }
    // sign over the shop
    if (rng() < 0.85) {
      if (rng() < 0.6) {
        faceZ(deco.white(), cx - 1.7, cx + 1.7, groundH + 0.1, groundH + 1.16, 0.2, pick(rng, KLONG_UV.hSign));
      } else {
        const s = pick(rng, SIGN_UV.h);
        signs.white().quadUV([cx - 1.7, groundH + 0.15, 0.2], [cx + 1.7, groundH + 0.15, 0.2], [cx + 1.7, groundH + 0.95, 0.2], [cx - 1.7, groundH + 0.95, 0.2], s[0], s[1], s[2], s[3]);
      }
    }
    // vertical blade sign high on the party wall
    if (rng() < 0.4) {
      const px = bx + 0.05;
      const y0 = groundH + floorH * range(rng, 0.4, 1.2);
      crossX(deco.white(), px, 0.12, 0.92, y0, y0 + 3.2, pick(rng, KLONG_UV.vSign));
      flat.color(0x2a2622).boxB(px, y0 + 3.2, 0.5, 0.05, 0.05, 1.0, 'y');
    }
    // drain pipe + streak
    if (rng() < 0.45) {
      const px = bx + bayW - 0.12;
      flat.color(0x8a8680).rod([px, groundH, 0.1], [px, h, 0.1], 0.06, 4);
      faceZ(grime.white(), px - 0.35, px + 0.25, h - range(rng, 2, 4), h, 0.03, GRIME_UV.streaks);
    }
    // parapet with grime, rooftop tank / shack / billboard / antenna
    trim.color(mixHex(wc, 0x888888, 0.3)).boxB(cx, h, 0.0, bayW, 0.5, 0.2);
    faceZ(grime.white(), bx, bx + bayW, h - range(rng, 0.8, 1.6), h + 0.5, 0.11, GRIME_UV.streaks);
    const top = rng();
    if (top < 0.4) {
      flat.color(pick(rng, [0x2f6f9a, 0x3a3a3a, 0x9a9a92])).cyl(cx + range(rng, -1, 1), h, -depth * 0.5, 0.8, 0.8, 1.5, 9);
    } else if (top < 0.62) {
      // corrugated shack
      const sw = bayW - 0.8;
      awn.color(pick(rng, [0x8f9496, 0x7a8a6a, 0x9a6a4a])).boxB(cx, h, -1.6, sw, 2.0, 2.4, 'y');
      deco.color(0xffffff, range(rng, 0.8, 1));
      faceZ(deco, cx - sw / 2, cx + sw / 2, h + 0.02, h + 2.0, -0.38, KLONG_UV.shack);
      awn.color(0x9aa0a4).quad([cx - sw / 2 - 0.2, h + 2.02, 0.0], [cx + sw / 2 + 0.2, h + 2.02, 0.0], [cx + sw / 2 + 0.2, h + 2.4, -3.0], [cx - sw / 2 - 0.2, h + 2.4, -3.0]);
    } else if (top < 0.76) {
      // billboard on a steel frame
      const bw = Math.min(bayW - 0.2, 4.0);
      const by = h + 1.3;
      flat.color(0x3a3a38);
      for (const s of [-1, 1]) flat.boxB(cx + s * bw * 0.35, h + 0.5, -0.3, 0.1, 0.8, 0.1, 'y').beam([cx + s * bw * 0.35, h + 0.5, -1.8], [cx + s * bw * 0.35, by + 1.6, -0.34], 0.07);
      flat.boxB(cx, by, -0.3, bw, bw / 2, 0.06, 'z');
      deco.color(0xffffff, range(rng, 0.85, 1));
      faceZ(deco, cx - bw / 2, cx + bw / 2, by, by + bw / 2, -0.26, KLONG_UV.billboard);
    }
    if (rng() < 0.3) {
      const ax = cx + range(rng, -1.5, 1.5);
      flat.color(0x8a8e92).boxB(ax, h, -2.5, 0.05, 2.6, 0.05, 'y');
      for (let i = 0; i < 3; i++) flat.boxB(ax, h + 1.8 + i * 0.28, -2.5, 1.1 - i * 0.25, 0.03, 0.03, 'y');
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

// ═════════════════════════════════════════════════ klong street dressing ══

function sagWire(g: GB, a: P3, b: P3, sag: number, r: number, segs = 5): void {
  const pts: P3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  g.tube(pts, r, 3, { caps: 'none' });
}

function poleRun(def: PropDef, ctx: PropContext): void {
  const count = Math.max(2, Math.round(num(ctx, def, 'count', 9)));
  const spacing = num(ctx, def, 'spacing', 19);
  const side = num(ctx, def, 'side', 1) >= 0 ? 1 : -1;
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const conc = k.g('concrete');
  const flat = k.g('flat');
  const lamp = k.g('neon', undefined, { intensity: 1 });
  const lvl = lightLevel(ctx);
  const H = 8.6;
  const cab = new GB();
  const omit = list(def, 'omit') ?? [];
  const zs: number[] = [];
  for (let i = 0; i < count; i++) if (!omit.includes(i)) zs.push(i * spacing);
  for (let n = 0; n < zs.length; n++) {
    const z = zs[n];
    const i = Math.round(z / spacing);
    const v0 = conc.vertexCount;
    conc.color(0xa9a79d).cyl(0, 0, z, 0.17, 0.11, H, 7);
    conc.shadeBy(v0, (_x, y) => 0.72 + 0.28 * Math.min(1, y / 2.5));
    // cross-arms with insulators
    flat.color(0x55514a).boxB(0, H - 0.4, z, 1.2, 0.08, 0.08).boxB(0, H - 1.15, z, 1.0, 0.07, 0.07);
    flat.color(0x7a4a34);
    for (const ix of [-0.5, 0, 0.5]) flat.cyl(ix, H - 0.32, z, 0.05, 0.035, 0.16, 5);
    for (const ix of [-0.45, 0.45]) flat.cyl(ix, H - 1.08, z, 0.045, 0.03, 0.13, 5);
    // junction boxes and a strapped splice case
    flat.color(0x6c6f70).boxB(-side * 0.2, H - 4.4, z, 0.22, 0.42, 0.3);
    flat.color(0x2a2a2a).boxB(-side * 0.2, H - 3.2, z + 0.5, 0.16, 0.16, 0.6);
    if (i % 3 === 1) {
      // twin transformer cans on a bracket
      flat.color(0x55514a).boxB(0, H - 2.95, z, 0.12, 0.1, 1.5);
      for (const s of [-1, 1]) {
        flat.color(0x70767a).cyl(0, H - 2.85, z + s * 0.47, 0.27, 0.27, 0.78, 8);
        flat.color(0x8a4a34).cyl(side * 0.12, H - 2.07, z + s * 0.47, 0.04, 0.03, 0.2, 5);
        cab.color(0x1c1a18);
        sagWire(cab, [side * 0.12, H - 1.88, z + s * 0.47], [side * 0.45, H - 1.0, z], -0.08, 0.012, 3);
      }
    }
    if (i % 2 === 0) {
      // fluorescent street lamp on an arm over the walkway
      flat.color(0x6c6f70).beam([0, H - 2.3, z], [side * 1.0, H - 2.0, z], 0.045);
      flat.color(0xd8d8d0).boxB(side * 0.75, H - 2.06, z, 0.95, 0.07, 0.16);
      lamp.color(0xeaffee, lvl * 1.4).boxB(side * 0.75, H - 2.11, z, 0.85, 0.04, 0.1);
    }
    // a spare coil of cable hanging on the pole
    if (rng() < 0.6) {
      const ring: P3[] = [];
      const cy = H - 3.75;
      for (let j = 0; j <= 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        ring.push([-side * 0.22, cy + Math.cos(a) * 0.3, z - 0.35 + Math.sin(a) * 0.26]);
      }
      cab.color(0x1c1a18).tube(ring, 0.03, 3, { caps: 'none' });
    }
    // service drops to the houses
    const nd = 1 + Math.floor(rng() * 3);
    for (let d = 0; d < nd; d++) {
      cab.color(0x1c1a18);
      sagWire(cab, [side * 0.1, H - 3.3 - d * 0.15, z], [side * range(rng, 1.4, 2.6), range(rng, 4.3, 5.1), z + range(rng, -7, 7)], range(rng, 0.15, 0.5), 0.011, 4);
    }
    if (n === zs.length - 1) break;
    const z1 = zs[n + 1];
    const q = ((z1 - z) / spacing) ** 2;
    // power conductors
    cab.color(0x24211e);
    for (const ix of [-0.5, 0, 0.5]) sagWire(cab, [ix, H - 0.16, z], [ix, H - 0.16, z1], range(rng, 0.22, 0.4) * q, 0.013, 5);
    for (const ix of [-0.45, 0.45]) sagWire(cab, [ix, H - 0.95, z], [ix, H - 0.95, z1], range(rng, 0.25, 0.45) * q, 0.012, 5);
    // telecom bundle: many thin lines sagging differently + one fat lashed cable
    cab.color(0x151413);
    const nt = 5 + Math.floor(rng() * 3);
    for (let w = 0; w < nt; w++) {
      const ya = H - 3.15 - w * 0.09 + range(rng, -0.04, 0.04);
      const yb = H - 3.15 - ((w * 3) % nt) * 0.09 + range(rng, -0.04, 0.04);
      sagWire(cab, [-side * range(rng, 0.14, 0.3), ya, z], [-side * range(rng, 0.14, 0.3), yb, z1], range(rng, 0.35, 1.15) * Math.min(q, 2), range(rng, 0.011, 0.02), 6);
    }
    sagWire(cab, [-side * 0.2, H - 3.9, z], [-side * 0.2, H - 3.9, z1], range(rng, 0.5, 0.8) * Math.min(q, 2), 0.04, 6);
    // a loop that came loose mid-span
    if (rng() < 0.45) {
      const zc = z + (z1 - z) * range(rng, 0.25, 0.75);
      const loop: P3[] = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6;
        loop.push([-side * 0.22, H - 4.0 - 1.1 * Math.sin(Math.PI * t), zc + (t - 0.5) * 2.4]);
      }
      cab.tube(loop, 0.014, 3, { caps: 'none' });
    }
  }
  k.flush();
  ctx.addStatic(cab.build(), ctx.mat('flat'), ctx.matrixAt());
}

const KQ_BOTTOM = -0.75;

function klongQuay(def: PropDef, ctx: PropContext): void {
  const len = num(ctx, def, 'length', 40);
  const top = num(ctx, def, 'top', 0.8);
  const paint = num(ctx, def, 'paint', 0) > 0;
  const gaps = list(def, 'gaps') ?? [];
  const ladderAt = list(def, 'ladderAt') ?? [];
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const deco = k.g('klongDecor');
  const grime = k.g('grime');
  const cope = k.g('concrete');
  const iron = k.g('flat');
  const z0 = -len / 2;
  const z1 = len / 2;
  const inGap = (z: number): boolean => {
    for (let i = 0; i + 1 < gaps.length; i += 2) if (z > gaps[i] && z < gaps[i + 1]) return true;
    return false;
  };
  // stained concrete facing on the wall face, split at the wet-shade breaks
  const tileL = 6.4;
  const st = KLONG_UV.quay;
  const ys = [KQ_BOTTOM, -0.28, 0.06, 0.42, top];
  const vAt = (y: number): number => st[1] + ((y - KQ_BOTTOM) / (top - KQ_BOTTOM)) * (st[3] - st[1]);
  const xf = -0.006;
  for (let z = z0; z < z1 - 1e-3; z += tileL) {
    const zb = Math.min(z1, z + tileL);
    if (inGap((z + zb) / 2)) continue;
    const u1 = st[0] + ((zb - z) / tileL) * (st[2] - st[0]);
    for (let i = 0; i < ys.length - 1; i++) {
      const ya = ys[i];
      const yb = ys[i + 1];
      const v = deco.vertexCount;
      deco.white().quadUV([xf, ya, z], [xf, ya, zb], [xf, yb, zb], [xf, yb, z], st[0], vAt(ya), u1, vAt(yb));
      const sa = wetShade(ya, 0);
      const sb = wetShade(yb, 0);
      deco.shade(v, sa);
      deco.shade(v + 1, sa);
      deco.shade(v + 2, sb);
      deco.shade(v + 3, sb);
    }
  }
  // waterline algae + streaks from the kerb
  const al = GRIME_UV.algae;
  for (let z = z0; z < z1 - 1e-3; z += 3.2) {
    const zb = Math.min(z1, z + 3.2);
    if (inGap((z + zb) / 2)) continue;
    const u1 = al[0] + ((zb - z) / 3.2) * (al[2] - al[0]);
    grime.white().quadUV([xf - 0.006, -0.02, z], [xf - 0.006, -0.02, zb], [xf - 0.006, 0.5, zb], [xf - 0.006, 0.5, z], al[0], al[1], u1, al[3]);
  }
  for (let z = z0 + range(rng, 0.5, 3); z < z1 - 1.8; z += range(rng, 3, 7)) {
    const w = range(rng, 0.6, 1.6);
    if (inGap(z)) continue;
    const s = GRIME_UV.streaks;
    grime.quadUV([xf - 0.008, range(rng, 0, 0.3), z], [xf - 0.008, 0.2, z + w], [xf - 0.008, top, z + w], [xf - 0.008, top, z], s[0], s[1], s[2], s[3]);
  }
  // kerb: cast concrete blocks exactly over the kerb the rider grinds (TRIM_TOP.kerb tall, 0.14 m in
  // from the edge) so the board sits on the stone; a few stretches carry faded warning paint
  let n = 0;
  for (let z = z0; z < z1 - 0.05; n++) {
    const l = Math.min(z1 - z, range(rng, 2.0, 3.2));
    if (!inGap(z + l / 2)) {
      if (paint && Math.floor((z - z0) / 22) % 3 === 1) cope.color(n % 2 ? 0xc9b23a : 0x3a3936, range(rng, 0.85, 1.0));
      else cope.color(pick(rng, [0xb4b1a6, 0xa6a398, 0xbdb9ac, 0x9c998e]), range(rng, 0.88, 1.05));
      cope.chamferBox(0.14, top, z + l / 2, 0.36, TRIM_TOP.kerb, l - 0.014, 0.03);
    }
    z += l;
  }
  // squat concrete mooring stubs with a rope turn, well inside the edge
  for (let z = z0 + range(rng, 5, 9); z < z1 - 3; z += range(rng, 11, 16)) {
    if (inGap(z)) continue;
    cope.color(0x9c998e).cyl(0.55, top, z, 0.11, 0.09, 0.36, 6);
    iron.color(0xc8b080).cyl(0.55, top + 0.1, z, 0.125, 0.125, 0.1, 6, false);
  }
  // steel ladders (stiles 5 cm off the wall, grab loops over the kerb)
  for (const lz of ladderAt) {
    iron.color(0x4a4640);
    for (const dz of [-0.22, 0.22]) {
      iron.boxB(-0.05, -1.0, lz + dz, 0.035, top + 1.0, 0.04);
      iron.rod([-0.05, top, lz + dz], [-0.05, top + 0.5, lz + dz], 0.02, 4);
      iron.rod([-0.05, top + 0.5, lz + dz], [0.5, top + 0.5, lz + dz], 0.02, 4);
      iron.rod([0.5, top + 0.5, lz + dz], [0.5, top + 0.15, lz + dz], 0.02, 4);
    }
    for (let y = -0.7; y < top; y += 0.3) iron.rod([-0.05, y, lz - 0.22], [-0.05, y, lz + 0.22], 0.016, 4);
    const d = GRIME_UV.drip;
    grime.white().quadUV([xf - 0.01, -0.3, lz - 0.45], [xf - 0.01, -0.3, lz + 0.45], [xf - 0.01, top, lz + 0.45], [xf - 0.01, top, lz - 0.45], d[0], d[1], d[2], d[3]);
  }
  k.flush();
}

function foodCart(def: PropDef, ctx: PropContext): void {
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const flat = k.g('flat');
  const deco = k.g('klongDecor');
  const lamp = k.g('neon', undefined, { intensity: 1 });
  const lvl = lightLevel(ctx);
  void def;
  // steel body + glass case
  flat.color(0xb4b8bc).boxB(0, 0.38, 0, 0.66, 0.5, 1.5);
  flat.color(0xd4e6e6).boxB(0, 0.88, 0, 0.6, 0.42, 1.4, 'y');
  deco.white().quadUV([-0.335, 0.38, 0.75], [-0.335, 0.38, -0.75], [-0.335, 1.3, -0.75], [-0.335, 1.3, 0.75], KLONG_UV.cartFront[0], KLONG_UV.cartFront[1], KLONG_UV.cartFront[2], KLONG_UV.cartFront[3]);
  // wheels + handle + prop leg
  for (const wz of [-0.45, 0.45]) {
    flat.color(0x1c1c1e).rod([-0.37, 0.3, wz], [-0.33, 0.3, wz], 0.3, 8, true);
    flat.rod([0.33, 0.3, wz], [0.37, 0.3, wz], 0.3, 8, true);
  }
  flat.color(0x8a8e92).rod([-0.3, 0.8, 0.75], [-0.3, 0.9, 1.1], 0.018, 4).rod([0.3, 0.8, 0.75], [0.3, 0.9, 1.1], 0.018, 4).rod([-0.3, 0.9, 1.1], [0.3, 0.9, 1.1], 0.018, 4);
  // canopy on four posts, menu board, tube light
  for (const [px, pz] of [[-0.3, -0.72], [0.3, -0.72], [-0.3, 0.72], [0.3, 0.72]] as const) flat.boxB(px, 0.88, pz, 0.03, 1.2, 0.03, 'y');
  const r = rng() < 0.5 ? KLONG_UV.awning : KLONG_UV.tarp;
  deco.color(0xffffff, 0.95).quadUV([-0.6, 2.0, 0.9], [0.5, 2.12, 0.9], [0.5, 2.12, -0.9], [-0.6, 2.0, -0.9], r[0], r[1], r[2], r[3]);
  deco.color(0xffffff, 0.6).quadUV([0.5, 2.1, 0.9], [-0.6, 1.98, 0.9], [-0.6, 1.98, -0.9], [0.5, 2.1, -0.9], r[0], r[1], r[2], r[3]);
  const m = KLONG_UV.cartMenu;
  deco.white().quadUV([-0.6, 1.72, 0.6], [-0.6, 1.72, -0.6], [-0.6, 2.0, -0.6], [-0.6, 2.0, 0.6], m[0], m[1], m[2], m[3]);
  lamp.color(0xfff4d8, lvl * 1.2).boxB(0, 1.96, 0, 0.04, 0.035, 0.9);
  // pots on the counter, gas cylinder, cool box, stool
  flat.color(0xc8ccd0).cyl(0.05, 1.3, 0.35, 0.16, 0.16, 0.18, 7);
  flat.color(0x3a3a3a).cyl(0.05, 1.3, -0.3, 0.2, 0.14, 0.1, 7);
  flat.color(pick(rng, [0x3a8a4a, 0xe8762a])).cyl(0.15, 0, -1.05, 0.15, 0.15, 0.5, 7);
  flat.color(0x3a3a3a).cyl(0.15, 0.5, -1.05, 0.05, 0.05, 0.1, 5);
  flat.color(pick(rng, [0x2f6fc0, 0xd8342a, 0xf2f0e6])).boxB(0.1, 0, 1.25, 0.42, 0.36, 0.55);
  flat.color(pick(rng, [0xd8342a, 0x2f6fc0, 0x36a85a])).cyl(0.4, 0, 0.3 + range(rng, -0.2, 0.2), 0.15, 0.13, 0.4, 6);
  k.flush();
}

function wat(def: PropDef, ctx: PropContext): void {
  const w = num(ctx, def, 'w', 13);
  const depth = num(ctx, def, 'depth', 16);
  const court = num(ctx, def, 'court', 16);
  const slabX = num(ctx, def, 'slabX', 0);
  const slabW = num(ctx, def, 'slabW', w + 18);
  const wallL = num(ctx, def, 'wallL', w / 2 + 7.5);
  const wallR = num(ctx, def, 'wallR', w / 2 + 7.5);
  const chedis = list(def, 'chedis') ?? [-(w / 2 + 4.2), w / 2 + 4.2];
  const k = new Kit(ctx);
  const white = k.g('plaster');
  const gold = k.g('paintedMetal');
  const flat = k.g('flat');
  const deco = k.g('klongDecor');
  const grime = k.g('grime');
  const hw = w / 2 - 1;
  // paved forecourt slab + raised hall base with steps
  white.color(0xd9d4c6).boxB(slabX, -2.4, (court - depth - 2) / 2, slabW, 2.4, court + depth + 2, 'y');
  white.color(0xf1ecdf).boxB(0, 0, -depth / 2, w + 1.6, 0.7, depth + 1.6, 'y');
  for (let i = 0; i < 3; i++) white.color(0xe6e0d0).boxB(0, 0, 0.8 + 0.45 + i * 0.4, 4.4, 0.52 - i * 0.17, 0.42, 'y');
  // hall
  const wallH = 6.2;
  const bv = white.vertexCount;
  white.color(0xf6f1e6).boxB(0, 0.7, -depth / 2, hw * 2, wallH, depth - 1, 'y');
  white.shadeBy(bv, (_x, y) => 0.84 + 0.16 * Math.min(1, y / 3));
  const fz = -0.5;
  // gilded door and windows, red / gold dado
  deco.white();
  faceZ(deco, -1.3, 1.3, 0.7, 4.3, fz + 0.03, KLONG_UV.watDoor);
  for (const s of [-1, 1]) faceZ(deco, s * (hw * 0.62) - 0.65, s * (hw * 0.62) + 0.65, 1.7, 4.3, fz + 0.03, KLONG_UV.watWindow);
  const nP = Math.round((hw * 2) / 0.8);
  for (let i = 0; i < nP; i++) {
    const xa = -hw + (i * hw * 2) / nP;
    if (Math.abs(xa + hw / nP) < 1.35) continue;
    faceZ(deco, xa, xa + (hw * 2) / nP, 0.7, 1.55, fz + 0.025, KLONG_UV.watPanel);
  }
  faceZ(grime.white(), -hw, hw, 0.7, 2.0, fz + 0.04, GRIME_UV.damp);
  faceZ(grime, -hw, hw, wallH - 1.8, wallH + 0.7, fz + 0.04, GRIME_UV.streaks);
  // side windows
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const zc = -2.5 - i * ((depth - 5) / 2.2);
      const r = KLONG_UV.watWindow;
      const x = s * (hw + 0.03);
      if (s > 0) deco.quadUV([x, 1.7, zc + 0.6], [x, 1.7, zc - 0.6], [x, 4.3, zc - 0.6], [x, 4.3, zc + 0.6], r[0], r[1], r[2], r[3]);
      else deco.quadUV([x, 1.7, zc - 0.6], [x, 1.7, zc + 0.6], [x, 4.3, zc + 0.6], [x, 4.3, zc - 0.6], r[0], r[1], r[2], r[3]);
    }
  }
  // portico columns with gilded capitals
  for (const cxs of [-hw + 0.2, -hw * 0.36, hw * 0.36, hw - 0.2]) {
    white.color(0xf6f1e6).boxB(cxs, 0.7, 0.55, 0.55, wallH - 0.5, 0.55, 'y');
    gold.color(GOLD).boxB(cxs, 0.7 + wallH - 1.0, 0.55, 0.7, 0.5, 0.7, 'y');
    gold.boxB(cxs, 0.7, 0.55, 0.7, 0.3, 0.7, 'y');
  }
  // three-tiered roof (ridge along Z): skirt, main, raised upper tier — green-bordered orange tiles
  const tiers: readonly (readonly [number, number, number, number, number, number])[] = [
    // xe, ye, xr, yr, zFront, zBack
    [hw + 2.2, wallH + 0.3, hw * 0.55, wallH + 2.5, 1.9, -depth - 0.9],
    [hw + 0.2, wallH + 2.1, 0, wallH + 2.1 + (hw + 0.2) * 0.98, 1.1, -depth - 0.1],
    [hw * 0.74, wallH + 4.0, 0, wallH + 4.0 + hw * 0.74 * 1.08, -1.4, -depth + 2.4],
  ];
  const tiles = KLONG_UV.watRoof;
  for (let t = 0; t < tiers.length; t++) {
    const [xe, ye, xr, yr, zF, zB] = tiers[t];
    deco.color(0xffffff, 1 - t * 0.04);
    slopeQuad(deco, xe, ye, xr, yr, zB, zF, tiles, 0);
    slopeQuad(deco, -xe, ye, -xr, yr, zB, zF, tiles, 0);
    // underside (seen from the water) + eave board
    flat.color(0x7a1a14, 0.7);
    flat.quad([xr, yr - 0.05, zF], [xr, yr - 0.05, zB], [xe, ye - 0.05, zB], [xe, ye - 0.05, zF]);
    flat.quad([-xr, yr - 0.05, zB], [-xr, yr - 0.05, zF], [-xe, ye - 0.05, zF], [-xe, ye - 0.05, zB]);
    gold.color(GOLD);
    for (const s of [-1, 1]) {
      // gilded barge boards on the front gable, upturned finials at the eaves
      gold.beam([s * xe, ye, zF + 0.04], [s * xr, yr, zF + 0.04], 0.1, 0.34);
      gold.rod([s * xe, ye, zF], [s * (xe + 0.55), ye + 0.95, zF + 0.25], 0.11, 4, false, 0.02);
      gold.rod([s * xe, ye, zB], [s * (xe + 0.55), ye + 0.95, zB - 0.25], 0.11, 4, false, 0.02);
    }
    if (xr === 0) {
      // gable pediment + chofa at both ridge ends
      const gz = zF - 0.12;
      const r = KLONG_UV.watGable;
      const i0 = deco.color(0xffffff, 1).v(-xe, ye, gz, 0, 0, 1, r[0], r[1]);
      deco.v(xe, ye, gz, 0, 0, 1, r[2], r[1]);
      deco.v(0, yr, gz, 0, 0, 1, (r[0] + r[2]) / 2, r[3]);
      deco.tri3(i0, i0 + 1, i0 + 2);
      white.color(0xe8e2d4).tri([xe, ye, zB + 0.1], [-xe, ye, zB + 0.1], [0, yr, zB + 0.1]);
      gold.rod([0, yr - 0.1, zF], [0, yr + 1.0, zF + 0.5], 0.14, 5, false, 0.07);
      gold.rod([0, yr + 1.0, zF + 0.5], [0, yr + 2.1, zF + 0.25], 0.07, 5, false, 0.015);
      gold.rod([0, yr - 0.1, zB], [0, yr + 1.6, zB - 0.5], 0.14, 5, false, 0.015);
      gold.boxB(0, yr - 0.12, (zF + zB) / 2, 0.24, 0.24, zF - zB, 'y');
    } else {
      white.color(0xf1ecdf).boxB(0, ye - 0.3, zF - 0.5, xe * 2 - 0.6, 0.3, 0.3, 'y');
    }
  }
  // compound wall with a gate, lotus-bud posts
  const wz = court - 2.2;
  for (const s of [-1, 1]) {
    const half = s < 0 ? wallL : wallR;
    if (half < 3) continue;
    white.color(0xf1ecdf).boxB((s * (half + 2.2)) / 2, 0, wz, half - 2.2, 1.5, 0.3, 'y');
    flat.color(0x7a1a14).boxB((s * (half + 2.2)) / 2, 1.5, wz, half - 2.2, 0.14, 0.42, 'y');
    const np = Math.max(1, Math.round((half - 2.2) / 4));
    for (let i = 0; i <= np; i++) {
      const px = 2.2 + ((half - 2.2) * i) / np;
      const ph = i === 0 ? 2.9 : 1.9;
      white.color(0xf6f1e6).boxB(s * px, 0, wz, 0.55, ph, 0.55, 'y');
      gold.color(GOLD).cyl(s * px, ph, wz, 0.3, 0.12, 0.22, 6).sphere(s * px, ph + 0.42, wz, 0.2, 0.3, 0.2, 6, 4);
    }
    const d = GRIME_UV.damp;
    grime.white().quadUV([s > 0 ? 2.2 : -half, 0, wz + 0.16], [s > 0 ? half : -2.2, 0, wz + 0.16], [s > 0 ? half : -2.2, 1.1, wz + 0.16], [s > 0 ? 2.2 : -half, 1.1, wz + 0.16], d[0], d[1], d[2], d[3]);
  }
  // small gilded chedis on white octagonal bases
  for (const cx of chedis) {
    const cz = wz - 5;
    const g1 = new GB();
    g1.color(0xf1ecdf).lathe(cx, cz, [[1.5, 0], [1.5, 0.7], [1.15, 0.7], [1.15, 1.5], [0.95, 1.5]], 8);
    white.merge(g1.build());
    const g2 = new GB();
    g2.color(GOLD).lathe(cx, cz, [[0.95, 1.5], [0.9, 2.1], [0.55, 2.9], [0.32, 3.2], [0.36, 3.5], [0.14, 4.6], [0.02, 6.2]], 8);
    gold.merge(g2.build());
  }
  k.flush();
}

registerProp('thailand.stiltHouseRow', stiltHouseRow);
registerProp('thailand.shophouseRow', shophouseRow);
registerProp('thailand.sampan', sampan);
registerProp('thailand.longtail', longtail);
registerProp('thailand.spiritHouse', spiritHouse);
registerProp('thailand.powerLines', powerLines);
registerProp('thailand.poleRun', poleRun);
registerProp('thailand.klongQuay', klongQuay);
registerProp('thailand.foodCart', foodCart);
registerProp('thailand.wat', wat);
registerProp('thailand.temple', temple);
registerProp('thailand.skyline', skyline);
