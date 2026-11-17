/**
 * Theme 'germany' — Hamburg Speicherstadt (red-brick warehouses) and Berlin Spree (night, Plattenbau, graffiti).
 *   germany.speicherRow  { bays=6, bayW=5, floors=6, depth=11, turret=0|1 }  neo-gothic brick warehouse row (local +X, facade +Z)
 *   germany.footbridge   { span=18, height=5.4 }   iron gantry/footbridge with green railings across local X
 *   germany.barge        { length=10, width=3, color }  moored lighter barge (long axis local Z)
 *   germany.lamp         { height=4.6 }            cast-iron street lamp
 *   germany.crates       { count=4 }               stacked wooden crates / barrels
 *   germany.hall         { width=70 }              concert hall: brick warehouse base + wavy glass crown (landmark)
 *   germany.cranes       { count=3, spacing=40 }   harbour portal cranes along local X
 *   germany.skyline      { width=240, count=18, minH=14, maxH=60, lit=0|1, tone=0xRRGGBB }  far block silhouettes
 *   germany.plattenbau   { bays=10, floors=11, depth=12 }  prefab housing slab with lit windows
 *   germany.muralWall    { length=190, height=3.2 } long graffiti wall (east-side-gallery vibe), facade +Z
 *   germany.railBridge   { depth=9 }               brick viaduct with arches + elevated train track across local X
 *   germany.clubSign     { variant=0..3 }          neon club sign on a post
 *   germany.tvTower      { height=170 }            TV tower silhouette with red lights (landmark)
 */
import type { PropContext, PropDef } from '../../types';
import { FACADE_UV, SIGN_UV } from '../decals';
import { GB } from '../geo';
import { registerProp } from '../props/registry';
import { Kit, lightLevel, num, pick, range, sharedGeo } from '../props/common/util';

const VERDIGRIS = 0x5fa08a;
const BRICK_TINTS: readonly number[] = [0xffffff, 0xf0d2c2, 0xe2b8a4, 0xf6e0d0, 0xd9a692];

type UV = readonly [number, number, number, number];
function winQuad(g: GB, uv: UV, x: number, y: number, z: number, w: number, h: number): void {
  g.quadUV([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z], uv[0], uv[1], uv[2], uv[3]);
}

// ───────────────────────────────────────────────────────────── Hamburg ──

function speicherRow(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const bays = Math.max(1, Math.round(num(ctx, def, 'bays', 6)));
  const bayW = num(ctx, def, 'bayW', 5);
  const floors = Math.max(3, Math.round(num(ctx, def, 'floors', 6)));
  const depth = num(ctx, def, 'depth', 11);
  const turret = num(ctx, def, 'turret', 1) > 0;
  const floorH = 3.4;
  const groundH = 3.8;
  const total = bays * bayW;
  const x0 = -total / 2;
  const brick = k.g('brick');
  const stone = k.g('plaster');
  const roof = k.g('flat', { cast: true, receive: true });
  const facade = k.g('facade');
  const iron = k.g('flat');
  const darkMetal = k.g('metal');

  const h = groundH + floors * floorH;
  // one big brick mass per building group keeps tri count low; variation per bay via tint
  for (let b = 0; b < bays; b++) {
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const fl = floors - (rng() < 0.3 ? 1 : 0);
    const hh = groundH + fl * floorH;
    brick.color(pick(rng, BRICK_TINTS), range(rng, 0.88, 1.04));
    brick.boxB(cx, -0.4, -depth / 2, bayW, hh + 0.4, depth, 'y');
    // pale sandstone bands + plinth
    stone.color(0xd9c7a8);
    stone.boxB(cx, 0, 0.03, bayW + 0.04, 0.7, 0.1);
    for (let f = 0; f <= fl; f++) stone.boxB(cx, groundH + f * floorH - 0.13, 0.05, bayW + 0.04, 0.2, 0.12);
    // pilasters at bay edges
    brick.color(0xc99483);
    brick.boxB(bx + 0.12, 0, 0.06, 0.34, hh, 0.14);
    if (b === bays - 1) brick.boxB(bx + bayW - 0.12, 0, 0.06, 0.34, hh, 0.14);

    // loading doors on the centre axis (every floor), pointed-arch windows either side
    const dw = 1.3;
    for (let f = 0; f < fl; f++) {
      const y = f === 0 ? 0.7 : groundH + (f - 1) * floorH + 0.5;
      const dh = f === 0 ? 2.8 : 2.4;
      if (f === 0) {
        winQuad(facade.white(), FACADE_UV.doorWood, cx, y, 0.13, dw + 0.2, dh);
      } else {
        winQuad(facade.white(), FACADE_UV.doorWood, cx, y, 0.13, dw, dh);
        iron.color(0x2d2f2f).boxB(cx, y, 0.22, dw + 0.1, 0.07, 0.22); // sill/guard rail stub
      }
      for (const wx of [cx - 1.75, cx + 1.75]) winQuad(facade.white(), f % 2 ? FACADE_UV.archGlass : FACADE_UV.archLouvre[2], wx, y + 0.1, 0.13, 0.85, 1.85);
    }
    // top-floor loading door + hoist beam under the gable
    const topY = groundH + (fl - 1) * floorH + 0.5;
    darkMetal.color(0x30353a).boxB(cx, topY + 3.0, 0.4, 0.14, 0.14, 1.5);
    darkMetal.boxB(cx, topY + 2.6, 1.05, 0.05, 0.4, 0.05); // hook line
    darkMetal.boxB(cx, topY + 2.35, 1.05, 0.16, 0.18, 0.16);

    // stepped gable with pinnacles
    const steps = 4;
    const sw = (bayW - 0.9) / 2 / steps;
    const peak = hh + 0.5 + steps * 0.75;
    const outline: [number, number][] = [];
    outline.push([bx + bayW, hh], [bx, hh]);
    for (let i = 0; i < steps; i++) {
      outline.push([bx + i * sw, hh + 0.5 + i * 0.75], [bx + (i + 1) * sw, hh + 0.5 + i * 0.75]);
    }
    outline.push([cx - 0.15, peak + 0.6], [cx + 0.15, peak + 0.6]);
    for (let i = steps - 1; i >= 0; i--) {
      outline.push([bx + bayW - (i + 1) * sw, hh + 0.5 + i * 0.75], [bx + bayW - i * sw, hh + 0.5 + i * 0.75]);
    }
    brick.color(pick(rng, BRICK_TINTS), 0.97);
    brick.prism(outline, -0.05, 0.12, true, true);
    // copper-green steep roof behind the gable
    roof.color(VERDIGRIS, range(rng, 0.85, 1.05));
    const ry = hh + 0.5;
    const rp = hh + 4.2;
    roof.quad([bx, ry, 0.0], [cx, rp, 0.0], [cx, rp, -depth], [bx, ry, -depth]);
    roof.quad([cx, rp, 0.0], [bx + bayW, ry, 0.0], [bx + bayW, ry, -depth], [cx, rp, -depth]);
    // pointed little finial
    roof.color(0x3e7c68).cyl(cx, peak + 0.6, 0.02, 0.07, 0.0, 0.9, 5, false);
  }
  // corner turret(s) with a pointed copper cap
  if (turret) {
    for (const tx of [x0 + 0.1, x0 + total - 0.1]) {
      brick.color(0xe6c4b0).cyl(tx, 0, 0.1, 0.95, 0.95, h + 0.6, 10, false);
      stone.color(0xd9c7a8).boxB(tx, h * 0.5, 0.06, 0.2, 0.2, 0.2);
      for (const wy of [groundH + 0.6, groundH + floorH + 0.6, groundH + floorH * 2 + 0.6, h - 2.6]) {
        winQuad(facade.white(), FACADE_UV.archGlass, tx, wy, 1.04, 0.55, 1.2);
      }
      roof.color(VERDIGRIS, 0.95).cyl(tx, h + 0.6, 0.1, 1.1, 0.0, 4.4, 10, false);
      roof.color(0x3e7c68).cyl(tx, h + 5.0, 0.1, 0.04, 0.0, 1.2, 4, false);
    }
  }
  k.flush();
}

function footbridge(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const span = num(ctx, def, 'span', 18);
  const y = num(ctx, def, 'height', 5.4);
  const iron = k.g('paintedMetal');
  const rail = k.g('paintedMetal');
  const deck = k.g('wood');
  const hw = span / 2;
  const w = 2.2;
  deck.boxB(0, y, 0, span, 0.22, w);
  iron.color(0x33383c).boxB(0, y - 0.45, 0, span, 0.45, w * 0.9);
  // lattice: diagonals along both sides
  const bay = 1.5;
  rail.color(0x2f6e57);
  for (const sz of [-w / 2 + 0.05, w / 2 - 0.05]) {
    rail.boxB(0, y + 0.22 + 0.95, sz, span, 0.07, 0.07); // top rail
    rail.boxB(0, y + 0.22 + 0.45, sz, span, 0.04, 0.04);
    for (let x = -hw; x <= hw + 0.01; x += bay) {
      rail.boxB(x, y + 0.22, sz, 0.05, 1.0, 0.05);
      if (x < hw - 0.01) rail.beam([x, y + 0.22, sz], [x + bay, y + 1.17, sz], 0.035);
    }
  }
  // piers / lattice towers at both ends (kept clear of the water)
  iron.color(0x33383c);
  for (const sx of [-hw, hw]) {
    for (const sz of [-w / 2 + 0.15, w / 2 - 0.15]) iron.boxB(sx, 0.9, sz, 0.28, y - 0.9, 0.28);
    iron.boxB(sx, y - 1.4, 0, 0.2, 0.2, w);
  }
  // little lamps on the rail ends
  const glow = k.g('neon');
  for (const sx of [-hw + 0.3, hw - 0.3]) glow.color(0xffe0a8, lightLevel(ctx) * 0.9).sphere(sx, y + 1.5, 0, 0.14, 0.18, 0.14, 6, 4);
  k.flush();
}

function barge(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const len = num(ctx, def, 'length', 10);
  const wd = num(ctx, def, 'width', 3);
  const hull = k.g('paintedMetal');
  const dark = k.g('flat');
  const cab = k.g('paintedMetal');
  const facade = k.g('facade');
  const bodyCol = pick(rng, [0x1d4f6e, 0x7d2b24, 0x22513a, 0x2a2e36]);
  const hw = wd / 2;
  // hull: straight body + raked bow/stern, freeboard 0.7 above water, 0.6 below
  hull.color(bodyCol);
  hull.boxB(0, -0.6, 0, wd, 1.35, len - 2.2, 'y');
  for (const s of [1, -1]) {
    const z0 = s * (len / 2 - 1.1);
    const z1 = s * (len / 2);
    hull.quad([-hw, -0.6, z0], [hw, -0.6, z0], [hw * 0.55, 0.75 + 0.1, z1], [-hw * 0.55, 0.75 + 0.1, z1]);
    hull.quad([hw, 0.75, z0], [-hw, 0.75, z0], [-hw * 0.55, 0.85, z1], [hw * 0.55, 0.85, z1]);
    hull.quad([hw, -0.6, z0], [hw * 0.55, -0.6, z1], [hw * 0.55, 0.85, z1], [hw, 0.75, z0]);
    hull.quad([-hw * 0.55, -0.6, z1], [-hw, -0.6, z0], [-hw, 0.75, z0], [-hw * 0.55, 0.85, z1]);
  }
  dark.color(0x16181a).boxB(0, 0.72, 0, wd - 0.2, 0.06, len - 1.2); // deck
  dark.color(0xb48a44).boxB(0, 0.76, 0, wd - 0.5, 0.04, len - 2.6); // cargo tarp base
  // cargo hatch cover or wheelhouse
  if (rng() < 0.6) {
    cab.color(0xe9e6dc).boxB(0, 0.78, -len / 2 + 2.2, wd - 0.9, 1.7, 2.0);
    cab.color(0xb02a22).boxB(0, 2.45, -len / 2 + 2.2, wd - 0.6, 0.12, 2.3);
    facade.white().quadUV([-0.7, 1.45, -len / 2 + 3.22], [0.7, 1.45, -len / 2 + 3.22], [0.7, 2.25, -len / 2 + 3.22], [-0.7, 2.25, -len / 2 + 3.22], FACADE_UV.rectGlassDark[0], FACADE_UV.rectGlassDark[1], FACADE_UV.rectGlassDark[2], FACADE_UV.rectGlassDark[3]);
  } else {
    cab.color(0x6b4a2e).boxB(0, 0.78, 1, wd - 0.8, 0.55, len - 5);
  }
  // tyre fenders along the side + mooring bollards
  dark.color(0x1a1a1a);
  for (let z = -len / 2 + 1.5; z < len / 2 - 1; z += 2.2) dark.sphere(-hw - 0.05, 0.3, z, 0.12, 0.18, 0.18, 6, 4).sphere(hw + 0.05, 0.3, z, 0.12, 0.18, 0.18, 6, 4);
  k.flush();
}

function lamp(def: PropDef, ctx: PropContext): void {
  const h = num(ctx, def, 'height', 4.6);
  const night = ctx.spot.env.timeOfDay === 'night';
  const geo = sharedGeo(ctx, `germany.lamp:${h}`, () => {
    const g = new GB();
    g.color(0x24302c).cyl(0, 0, 0, 0.16, 0.16, 0.35, 8);
    g.cyl(0, 0.35, 0, 0.09, 0.06, h - 0.55, 8);
    g.cyl(0, h - 0.2, 0, 0.12, 0.12, 0.08, 8);
    g.beam([0, h - 0.15, 0], [0.55, h + 0.05, 0], 0.05); // bracket arm toward local +X
    return g.build();
  });
  ctx.addStatic(geo, ctx.mat('paintedMetal'), ctx.matrixAt());
  const hg = new GB();
  hg.color(night ? 0xffd9a0 : 0xfff2d8, lightLevel(ctx) * (night ? 1.0 : 0.5)).sphere(0.6, h - 0.1, 0, 0.17, 0.2, 0.17, 7, 5);
  ctx.addStatic(hg.build(), ctx.mat('neon'), ctx.matrixAt());
}

function crates(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const count = Math.round(num(ctx, def, 'count', 4));
  const w = k.g('wood');
  const m = k.g('metal');
  for (let i = 0; i < count; i++) {
    const x = i * 1.0 + range(rng, -0.1, 0.1);
    const stack = 1 + Math.floor(rng() * 3);
    for (let s = 0; s < stack; s++) {
      w.color(0xb08a58, range(rng, 0.8, 1.05)).boxR(x, 0.38 + s * 0.76, 0, 0.9, 0.72, 0.9, range(rng, -0.2, 0.2));
    }
  }
  m.color(0x2d4a40).cyl(count + 0.6, 0, 0, 0.38, 0.38, 0.95, 10);
  k.flush();
}

/** Elbphilharmonie-like: brick warehouse base + wavy glass crown. Faces local +Z. */
function hall(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const W = num(ctx, def, 'width', 70);
  const D = 42;
  const baseH = 26;
  const brick = k.g('brick');
  const glass = k.g('glass');
  const stone = k.g('plaster');
  const roof = k.g('flat');
  const facade = k.g('facade');
  brick.color(0xdcb9a6).boxB(0, 0, 0, W, baseH, D, 'y');
  stone.color(0xd9c7a8);
  for (let y = 4; y < baseH; y += 4) stone.boxB(0, y, D / 2 + 0.05, W + 0.1, 0.25, 0.1);
  // rows of small windows on the base (front only)
  for (let r = 0; r < 5; r++) for (let c = 0; c < 24; c++) winQuad(facade.white(), FACADE_UV.archGlass, -W / 2 + 1.6 + c * ((W - 3.2) / 23), 1.2 + r * 4.8, D / 2 + 0.02, 1.1, 2.2);
  // glass crown: wavy ridge line, stepped back from the base edges
  const cw = W - 6;
  const cd = D - 10;
  const n = 26;
  const hs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    hs.push(11 + 15 * Math.pow(Math.sin(t * 2.4 + 0.35), 2) * (0.6 + 0.4 * Math.sin(t * 9)) + 6 * Math.sin(t * 5.6 + 1.4) * Math.sin(Math.PI * t) + 8 * Math.sin(Math.PI * t));
  }
  const y0 = baseH;
  glass.color(0xcfe6ee, 1);
  for (let i = 0; i < n; i++) {
    const xa = -cw / 2 + (cw * i) / n;
    const xb = -cw / 2 + (cw * (i + 1)) / n;
    const ha = y0 + hs[i];
    const hb = y0 + hs[i + 1];
    const zf = cd / 2;
    const zb = -cd / 2;
    // wavy top: slopes toward the back, the front is the tall wave face
    const tf = 0.75;
    glass.quad([xa, ha, zf], [xb, hb, zf], [xb, y0, zf], [xa, y0, zf]);
    glass.quad([xa, ha * tf + y0 * (1 - tf) + 3, zb], [xb, y0, zb], [xb, hb * tf + y0 * (1 - tf) + 3, zb], [xa, y0, zb]);
    glass.quad([xa, ha, zf], [xb, hb, zf], [xb, hb * tf + y0 * (1 - tf) + 3, zb], [xa, ha * tf + y0 * (1 - tf) + 3, zb]);
  }
  glass.quad([-cw / 2, y0, cd / 2], [-cw / 2, y0 + hs[0], cd / 2], [-cw / 2, y0 + hs[0] * 0.75 + 3, -cd / 2], [-cw / 2, y0, -cd / 2]);
  glass.quad([cw / 2, y0 + hs[n], cd / 2], [cw / 2, y0, cd / 2], [cw / 2, y0, -cd / 2], [cw / 2, y0 + hs[n] * 0.75 + 3, -cd / 2]);
  // silvery mullions + roof rim glints
  roof.color(0xe9eef0);
  for (let i = 0; i <= n; i += 2) {
    const x = -cw / 2 + (cw * i) / n;
    roof.boxB(x, y0, cd / 2 + 0.05, 0.12, hs[i], 0.1);
  }
  k.flush();
}

function cranes(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const count = Math.round(num(ctx, def, 'count', 3));
  const spacing = num(ctx, def, 'spacing', 40);
  const red = k.g('paintedMetal');
  const grey = k.g('paintedMetal');
  const dark = k.g('flat');
  for (let c = 0; c < count; c++) {
    const x = (c - (count - 1) / 2) * spacing + range(rng, -4, 4);
    const rot = range(rng, 0.3, 1.2);
    // portal frame (two legs + beam), on rails
    red.color(0xc0392b);
    const gauge = 9;
    for (const s of [-1, 1]) {
      red.boxB(x + s * gauge / 2, 0, 0, 1.2, 22, 1.2);
      red.boxB(x + s * gauge / 2, 0, 5, 1.2, 22, 1.2);
      dark.color(0x222222).boxB(x + s * gauge / 2, 0, 2.5, 1.6, 0.8, 8);
    }
    red.boxB(x, 20.5, 2.5, gauge + 1.2, 1.4, 7);
    // tower + cab + jib
    grey.color(0x7e8a90).boxB(x, 21.9, 2.5, 3.4, 9, 3.4);
    grey.color(0x6a767c).boxB(x, 30.4, 2.5, 5.2, 2.4, 4.2);
    // jib: a boom pointing toward the water side (local +Z) and raised
    const jy0 = 31.0;
    red.color(0xd24a37).beam([x, jy0, 2.5], [x + Math.sin(rot) * 6, jy0 + 12, 2.5 + 24], 0.8, 1.2);
    red.color(0xd24a37).beam([x, jy0 + 0.5, 2.5], [x - Math.sin(rot) * 3, jy0 + 5, 2.5 - 9], 1.2, 1.6);
    dark.color(0x303030).boxB(x - Math.sin(rot) * 3 - 1, jy0 + 3, 2.5 - 10, 3, 3.5, 3);
    // hoist cables
    dark.color(0x202020).beam([x + Math.sin(rot) * 6, jy0 + 11.6, 2.5 + 24], [x + Math.sin(rot) * 6, jy0 + 6, 2.5 + 24], 0.09);
  }
  k.flush();
}

// ────────────────────────────────────────────────────────────── Berlin ──

function plattenbau(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const bays = Math.round(num(ctx, def, 'bays', 10));
  const floors = Math.round(num(ctx, def, 'floors', 11));
  const depth = num(ctx, def, 'depth', 12);
  const bayW = 3.0;
  const floorH = 2.8;
  const total = bays * bayW;
  const x0 = -total / 2;
  const h = floors * floorH + 0.8;
  const wall = k.g('concrete');
  const facade = k.g('facade');
  const lit = k.g('neon');
  const trim = k.g('concrete');
  const glow = lightLevel(ctx);
  wall.color(pick(rng, [0xc8c4bc, 0xb9bcc0, 0xd2c8b0, 0xaeb4b8]));
  wall.boxB(0, 0, -depth / 2, total, h, depth, 'y');
  // roof parapet + stair/lift tower
  trim.color(0x8c8f92).boxB(0, h, -depth / 2, total + 0.3, 0.5, depth + 0.3, 'y');
  trim.boxB(x0 + total * 0.3, h + 0.5, -depth * 0.6, 4, 2.6, 4);
  // colour panels (balcony fronts) every other bay
  for (let b = 0; b < bays; b++) {
    const cx = x0 + b * bayW + bayW / 2;
    const panel = pick(rng, [0xe8b34a, 0x4a86c2, 0xd8d4c8, 0xc2523f, 0x7fa86a]);
    for (let f = 0; f < floors; f++) {
      const y = 0.8 + f * floorH;
      // balcony slab + railing on alternate bays
      if (b % 2 === 0) {
        trim.color(panel, 0.9).boxB(cx, y + 0.15, 0.35, bayW - 0.4, 0.95, 0.12);
        trim.color(0xaaaaaa).boxB(cx, y, 0.3, bayW - 0.3, 0.15, 0.7);
      }
      const isLit = rng() < 0.5;
      const wx = cx;
      const ww = 1.25;
      const wh = 1.35;
      const wy = y + 0.9;
      if (isLit) {
        const col = pick(rng, [0xffc873, 0xffe2a0, 0xfff0c8, 0xffb060, 0xcfe4ff]);
        lit.color(col, glow * range(rng, 0.55, 0.95));
        lit.quad([wx - ww / 2, wy, 0.04], [wx + ww / 2, wy, 0.04], [wx + ww / 2, wy + wh, 0.04], [wx - ww / 2, wy + wh, 0.04]);
        // dark mullion cross
        wall.color(0x2a2c30).boxB(wx, wy, 0.05, 0.04, wh, 0.02);
      } else {
        winQuad(facade.white(), rng() < 0.5 ? FACADE_UV.rectGlassDark : FACADE_UV.rectGlass, wx, wy, 0.04, ww, wh);
      }
    }
  }
  k.flush();
}

function muralWall(def: PropDef, ctx: PropContext): void {
  const length = num(ctx, def, 'length', 190);
  const height = num(ctx, def, 'height', 3.2);
  const k = new Kit(ctx);
  const wall = k.g('concrete');
  const night = ctx.spot.env.timeOfDay === 'night';
  wall.color(night ? 0xb8b6b0 : 0xd0ccc4).boxB(0, 0, 0, length, height, 0.35, 'y');
  wall.color(0x8a8a88).boxB(0, height, 0, length, 0.18, 0.5); // coping
  k.flush();
  // graffiti pieces: 4 seeds cycled, each 12 m panel = shared material per seed
  const pieces = ['SPREE', 'ODER', 'KIEZ', 'MAUER', 'ROT', 'WHY NOT'];
  const seeds = [11, 23, 37, 52];
  const panelW = height * 4;
  const n = Math.ceil(length / panelW);
  const geos: GB[] = seeds.map(() => new GB());
  for (let i = 0; i < n; i++) {
    const x0 = -length / 2 + i * panelW;
    const x1 = Math.min(length / 2, x0 + panelW);
    const frac = (x1 - x0) / panelW;
    geos[i % 4].white().quadUV([x0, 0.02, 0.19], [x1, 0.02, 0.19], [x1, height, 0.19], [x0, height, 0.19], 0, 0, frac, 1);
  }
  for (let s = 0; s < seeds.length; s++) {
    if (geos[s].empty) continue;
    ctx.addStatic(geos[s].build(), ctx.mat('graffiti', { seed: seeds[s], piece: pieces[s % pieces.length] }), ctx.matrixAt());
  }
}

function railBridge(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const depth = num(ctx, def, 'depth', 9);
  const half = 24;
  const top = 10;
  const brick = k.g('brick');
  const dark = k.g('flat');
  const metal = k.g('metal');
  const lit = k.g('neon');
  const glow = lightLevel(ctx);
  // arch holes
  const arch = (cx: number, hw: number, y0: number, rise: number): [number, number][] => {
    const pts: [number, number][] = [];
    const n = 14;
    pts.push([cx - hw, y0]);
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - (i / n) * Math.PI;
      pts.push([cx + Math.cos(a) * hw, y0 + (rise) * Math.sin(a)]);
    }
    pts.push([cx + hw, y0]);
    return pts;
  };
  const holes = [arch(0, 8.4, 0, 6.6), arch(-17, 3.0, 0.9, 3.6), arch(17, 3.0, 0.9, 3.6)];
  const outline: [number, number][] = [[-half, 0], [half, 0], [half, top], [-half, top]];
  brick.color(0xc98a73);
  brick.poly(outline, depth / 2, false, holes);
  brick.poly(outline, -depth / 2, true, holes);
  brick.prism(outline, -depth / 2, depth / 2, false, false);
  for (const h of holes) brick.prism(h, -depth / 2, depth / 2, false, false, true, true);
  // stone cornice and archivolt hint
  brick.color(0xd9c7a8).boxB(0, top, 0, 2 * half + 0.6, 0.35, depth + 0.6);
  // track bed, rails, catenary masts
  dark.color(0x403c38).boxB(0, top + 0.35, 0, 2 * half, 0.4, depth - 1.5);
  for (const rz of [-0.72, 0.72, 2.28 + 0.0, -2.28]) metal.color(0x8a8f94).boxB(0, top + 0.75, rz, 2 * half, 0.14, 0.12);
  for (let x = -half + 1; x < half; x += 1.1) dark.color(0x2c2a28).boxB(x, top + 0.75, 0, 0.35, 0.1, depth - 2);
  for (const mx of [-14, 0, 14]) {
    metal.color(0x555a5e).boxB(mx, top + 0.75, depth / 2 - 0.6, 0.18, 6.5, 0.18);
    metal.boxB(mx, top + 6.6, 0, 0.12, 0.12, depth - 0.8);
  }
  // an S-Bahn style train crossing: red/yellow, lit windows
  const trainZ = -1.5;
  const tx0 = -20;
  for (let c = 0; c < 3; c++) {
    const cx = tx0 + c * 12.6 + 6;
    dark.color(0xc9372c).boxB(cx, top + 0.95, trainZ, 12.2, 3.0, 2.8);
    dark.color(0xe3c14a).boxB(cx, top + 2.35, trainZ, 12.24, 0.3, 2.84);
    dark.color(0x30302e).boxB(cx, top + 3.95, trainZ, 11.6, 0.2, 2.4);
    for (let w = 0; w < 7; w++) {
      lit.color(0xfff0c0, glow * 0.8);
      const wx = cx - 5 + w * 1.65;
      for (const sz of [trainZ + 1.41, trainZ - 1.41]) lit.quad([wx - 0.6, top + 2.55, sz], [wx + 0.6, top + 2.55, sz], [wx + 0.6, top + 3.55, sz], [wx - 0.6, top + 3.55, sz]);
    }
  }
  k.flush();
}

const CLUB_NAMES = 4;
function clubSign(def: PropDef, ctx: PropContext): void {
  const v = Math.round(num(ctx, def, 'variant', 0)) % CLUB_NAMES;
  const k = new Kit(ctx);
  const post = k.g('metal');
  const board = k.g('signs');
  const neon = k.g('neon');
  const glow = lightLevel(ctx);
  const cols = [0xff2fa0, 0x28e0ff, 0xb2ff3c, 0xff9a1f];
  const c = cols[v];
  const c2 = cols[(v + 2) % 4];
  post.color(0x33373a).boxB(0, 0, 0, 0.2, 6.2, 0.2);
  post.boxB(0, 5.0, 0.3, 0.1, 0.1, 0.6);
  const s = SIGN_UV.h[(v * 2 + 1) % SIGN_UV.h.length];
  board.white().quadUV([-1.8, 4.3, 0.72], [1.8, 4.3, 0.72], [1.8, 5.45, 0.72], [-1.8, 5.45, 0.72], s[0], s[1], s[2], s[3]);
  post.color(0x1b1d20).boxB(0, 4.25, 0.68, 3.9, 1.3, 0.08);
  // neon frame + underline tubes + a star/ring
  const t = 0.07;
  neon.color(c, glow * 1.1);
  neon.boxB(0, 4.2, 0.74, 3.9, t, t).boxB(0, 5.5, 0.74, 3.9, t, t).boxB(-1.95, 4.2, 0.74, t, 1.37, t).boxB(1.95, 4.2, 0.74, t, 1.37, t);
  neon.color(c2, glow * 1.3);
  neon.boxB(0, 3.85, 0.74, 3.0, 0.1, 0.06);
  neon.boxB(0, 3.55, 0.74, 2.0, 0.08, 0.06);
  neon.sphere(-2.4, 4.9, 0.74, 0.3, 0.3, 0.05, 10, 6);
  k.flush();
}

function tvTower(def: PropDef, ctx: PropContext): void {
  const H = num(ctx, def, 'height', 170);
  const k = new Kit(ctx);
  const conc = k.g('flat');
  const metal = k.g('flat');
  const red = k.g('neon');
  const glow = lightLevel(ctx);
  // concrete shaft (thin, slightly conical) with a base flare
  conc.color(0x6f757a);
  conc.cyl(0, 0, 0, 9, 4.4, H * 0.12, 14, false);
  conc.cyl(0, H * 0.12, 0, 4.4, 2.6, H * 0.58, 14, false);
  // the sphere (reflective silver-grey, band of windows)
  const sy = H * 0.7;
  const R = H * 0.095;
  metal.color(0xb8bec4).sphere(0, sy, 0, R, R, R, 18, 12);
  metal.color(0x3a4046).cyl(0, sy - 0.12 * R, 0, R * 1.015, R * 1.015, R * 0.26, 18, false);
  // cabin ring + steel needle
  conc.color(0x6f757a).cyl(0, H * 0.7 + R * 0.9, 0, 2.6, 2.2, H * 0.1, 10, false);
  metal.color(0xd8d8d8).cyl(0, H * 0.8, 0, 1.4, 0.2, H * 0.2, 8, false);
  // red aircraft-warning lights: on the sphere equator, antenna tip, shaft
  red.color(0xff2a1a, glow * 1.5);
  for (const a of [0, 1, 2, 3]) {
    const an = (a / 4) * Math.PI * 2;
    red.sphere(Math.sin(an) * (R + 0.2), sy + R * 0.55, Math.cos(an) * (R + 0.2), 0.7, 0.7, 0.7, 5, 4);
  }
  red.sphere(0, H + 0.2, 0, 1.0, 1.0, 1.0, 6, 4);
  red.sphere(0, H * 0.9, 0, 0.8, 0.8, 0.8, 5, 4);
  red.sphere(0, H * 0.48, 3.0, 0.6, 0.6, 0.6, 5, 4);
  red.sphere(0, H * 0.3, 3.4, 0.6, 0.6, 0.6, 5, 4);
  // warm window band on the sphere
  const warm = k.g('neon');
  warm.color(0xffd9a0, glow * 0.7).cyl(0, sy - 0.1 * R, 0, R * 1.03, R * 1.03, R * 0.18, 18, false);
  k.flush();
}

/** Far skyline silhouette: a row of flat blocks facing local +Z. */
function skyline(def: PropDef, ctx: PropContext): void {
  const width = num(ctx, def, 'width', 240);
  const count = Math.round(num(ctx, def, 'count', 18));
  const minH = num(ctx, def, 'minH', 14);
  const maxH = num(ctx, def, 'maxH', 60);
  const lit = num(ctx, def, 'lit', 0) > 0;
  const tone = typeof def.params?.tone === 'number' ? def.params.tone : 0x6a7479;
  const rng = ctx.rng;
  const g = new GB();
  const n = new GB();
  const glow = lightLevel(ctx);
  const cw = width / count;
  for (let i = 0; i < count; i++) {
    const w = cw * range(rng, 0.8, 1.7);
    const x = -width / 2 + (i + 0.5) * cw;
    const h = range(rng, minH, maxH);
    const d = range(rng, 12, 30);
    const v0 = g.vertexCount;
    g.color(tone, range(rng, 0.85, 1.1)).boxB(x, -3, 0, w, h + 3, d, 'y');
    g.shadeBy(v0, (_x, y) => 0.65 + 0.35 * Math.min(1, Math.max(0, y / h)));
    if (lit) {
      const rows = Math.floor(h / 5);
      for (let r = 1; r < rows; r++) {
        for (let c = 0; c < 3; c++) {
          if (rng() < 0.5) continue;
          const wx = x - w / 2 + ((c + 0.5) / 3) * w;
          n.color(pick(rng, [0xffc873, 0xffe2a0, 0x9fd8ff]), glow * 0.5).quad([wx - 0.7, r * 5, d / 2 + 0.05], [wx + 0.7, r * 5, d / 2 + 0.05], [wx + 0.7, r * 5 + 1.6, d / 2 + 0.05], [wx - 0.7, r * 5 + 1.6, d / 2 + 0.05]);
        }
      }
    }
    // some blocks get a spire or a green copper steeple (church towers in Hamburg)
    if (!lit && rng() < 0.3) g.color(VERDIGRIS, 0.8).cyl(x, h, 0, w * 0.22, 0.0, h * 0.55, 6, false);
  }
  ctx.addStatic(g.build(), ctx.mat('flat', { roughness: 1 }), ctx.matrixAt());
  if (!n.empty) ctx.addStatic(n.build(), ctx.mat('neon'), ctx.matrixAt());
}

registerProp('germany.speicherRow', speicherRow);
registerProp('germany.footbridge', footbridge);
registerProp('germany.barge', barge);
registerProp('germany.lamp', lamp);
registerProp('germany.crates', crates);
registerProp('germany.hall', hall);
registerProp('germany.cranes', cranes);
registerProp('germany.skyline', skyline);
registerProp('germany.plattenbau', plattenbau);
registerProp('germany.muralWall', muralWall);
registerProp('germany.railBridge', railBridge);
registerProp('germany.clubSign', clubSign);
registerProp('germany.tvTower', tvTower);
