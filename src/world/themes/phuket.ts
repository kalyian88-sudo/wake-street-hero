/**
 * Theme 'phuket' — Sino-Portuguese shophouses of Phuket Old Town.
 *   phuket.shophouseRow { bays=4, bayW=4.2, floors=2, depth=9, palette=0 }
 *       Row along local +X, facade faces local +Z. Ground floor = covered five-foot way with
 *       columns and segmental arches, upper floors with arched louvred windows (some open and lit),
 *       pediments, layered cornices, stucco reliefs, parapet name plates, tiled roof, Chinese-style
 *       shop boards, air-cons, drain pipes, sagging cables and weathering (rising damp, rain streaks,
 *       peeling plaster).
 *   phuket.lanternLine  { span=16, count=9, height=6.5 }  string of lanterns along local X (sags).
 *   phuket.hills        { width=220, height=38 }         distant green hills (backdrop silhouette).
 *   phuket.quay         { length=40, ladders=1, bollards=1 }  canal edge dressing along local Z:
 *       the wall face is the plane x = 0 facing −X (water side), the quay top is y = 0.9 at x > 0.
 *       Masonry facing, waterline algae, coping blocks, mooring bollards, iron ladders. Decor only —
 *       nothing reaches more than 7 cm into the water.
 *   phuket.cables       { span=25, height=8.5, wires=4 }  sagging overhead cables along local X.
 *   phuket.scooters     { count=4, spacing=0.9 }         parked scooters in a row along local X.
 *   phuket.stall        { }                              market umbrella + table with goods.
 *   phuket.trestles     { length=8 }                     two timber trestles for a hauled-out boat.
 */
import type { PropContext, PropDef } from '../../types';
import { wetShade } from '../build';
import { FACADE_UV, GRIME_UV, PHUKET_UV, SIGN_UV } from '../decals';
import type { UVRect } from '../decals';
import { GB } from '../geo';
import type { P3 } from '../geo';
import { registerProp } from '../props/registry';
import { Kit, lightLevel, num, pick, range, sharedGeo, tint } from '../props/common/util';

/** Pastel stucco palettes (wall, trim/mouldings). */
const PALETTES: readonly (readonly [number, number])[] = [
  [0xf2d27a, 0xfff6e0], // butter yellow
  [0xf3b3b0, 0xfff1ec], // salmon pink
  [0xa8dcc8, 0xf3fff8], // mint
  [0x9ec9e8, 0xf2f8ff], // sky blue
  [0xf6c48e, 0xfff3e2], // apricot
  [0xd9c2ec, 0xfbf5ff], // lilac
  [0xe9e4d6, 0xffffff], // old white
  [0x6cc3c0, 0xf4fffd], // turquoise
  [0xf0a868, 0xfff0dc], // deep apricot
  [0xe7d36a, 0xfffbe8], // mustard
];

/** Quad facing +Z in the plane z (x0..x1 × y0..y1) with an atlas rect. */
function faceUV(g: GB, x0: number, x1: number, y0: number, y1: number, z: number, r: UVRect): void {
  g.quadUV([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], r[0], r[1], r[2], r[3]);
}

/** Triangular pediment (hood) over a window: base width w, height h, depth d, sitting on y. */
function pediment(g: GB, cx: number, y: number, z: number, w: number, h: number, d: number): void {
  const l = cx - w / 2;
  const r = cx + w / 2;
  g.boxB(cx, y, z + d / 2, w + 0.06, 0.08, d, 'z');
  const y0 = y + 0.08;
  const zf = z + d;
  g.tri([l, y0, zf], [r, y0, zf], [cx, y0 + h, zf]);
  g.quad([cx, y0 + h, zf], [r, y0, zf], [r, y0, z], [cx, y0 + h, z]);
  g.quad([l, y0, z], [l, y0, zf], [cx, y0 + h, zf], [cx, y0 + h, z]);
}

/** Segmental hood (flat arc of n steps) over a window. */
function hood(g: GB, cx: number, y: number, z: number, w: number, rise: number, d: number, n = 5): void {
  g.boxB(cx, y, z + d / 2, w + 0.06, 0.07, d, 'z');
  const zf = z + d;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const x0 = cx - w / 2 + w * t0;
    const x1 = cx - w / 2 + w * t1;
    const y0 = y + 0.07 + rise * Math.sin(Math.PI * t0);
    const y1 = y + 0.07 + rise * Math.sin(Math.PI * t1);
    g.quad([x0, y + 0.07, zf], [x1, y + 0.07, zf], [x1, y1, zf], [x0, y0, zf]);
    g.quad([x0, y0, zf], [x1, y1, zf], [x1, y1, z], [x0, y0, z]);
  }
}

function shophouseRow(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const bays = Math.max(1, Math.round(num(ctx, def, 'bays', 4)));
  const bayW = num(ctx, def, 'bayW', 4.2);
  const floors = Math.max(1, Math.round(num(ctx, def, 'floors', 2)));
  const depth = num(ctx, def, 'depth', 9);
  const rng = ctx.rng;
  const groundH = 3.6;
  const floorH = 3.3;
  const arcade = 2.2; // depth of the five-foot way
  const total = bays * bayW;
  const x0 = -total / 2;
  const glowLvl = lightLevel(ctx);

  const wall = k.g('plaster');
  const trimG = k.g('plaster');
  const roof = k.g('roofTile');
  const facade = k.g('facade');
  const signs = k.g('signs');
  const deco = k.g('phuketDecor');
  const glow = k.g('phuketGlow');
  const grime = k.g('grime');
  const floorG = k.g('patternTile');
  const dark = k.g('flat');
  const wood = k.g('wood');
  const lamp = k.g('neon', undefined, { intensity: 1 });

  const archRise = 0.62;
  const archSpring = groundH - 1.02;
  const archSegs = 8;

  for (let b = 0; b < bays; b++) {
    const [wc0, tc] = pick(rng, PALETTES);
    const fade = range(rng, 0.88, 1.04);
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const fl = floors + (rng() < 0.25 ? 1 : 0);
    const h = groundH + fl * floorH;
    const shutter = Math.floor(rng() * 4);
    const wc = wc0;

    // ── masses ──
    wall.color(wc, fade);
    let v0 = wall.vertexCount;
    // Main block, set back behind the arcade at ground level.
    wall.boxB(cx, 0, -depth / 2, bayW, h, depth, 'yZ');
    // Upper facade overhangs the arcade.
    wall.boxB(cx, groundH, arcade / 2, bayW, h - groundH, arcade, 'yxX');
    // darker towards the street (dirt + bounce shadow), sun-bleached towards the top
    wall.shadeBy(v0, (_x, y) => 0.8 + 0.2 * Math.min(1, y / (h * 0.8)));
    // Ground floor back wall of the arcade (shop front plane at z = 0).
    wall.color(wc, 0.8 * fade).quad([bx, 0, 0.001], [bx + bayW, 0, 0.001], [bx + bayW, groundH, 0.001], [bx, groundH, 0.001]);
    // Arcade ceiling (with a darker coffer band).
    wall.color(wc, 0.62).quad([bx, groundH - 0.01, arcade], [bx + bayW, groundH - 0.01, arcade], [bx + bayW, groundH - 0.01, 0], [bx, groundH - 0.01, 0]);
    // Arcade floor (encaustic tiles), slightly above the quay.
    floorG.white().boxB(cx, 0, arcade / 2, bayW, 0.12, arcade, 'y');

    // ── five-foot way: columns + segmental arch ──
    trimG.color(tc, fade);
    const colZ = arcade - 0.22;
    for (const px of [bx + 0.22, bx + bayW - 0.22]) {
      trimG.color(tc, fade).boxB(px, 0.42, colZ, 0.42, archSpring - 0.56, 0.42, 'yY');
      // plinth (darker, scuffed) with a bevelled top
      trimG.color(wc, 0.72).chamferBox(px, 0, colZ, 0.54, 0.46, 0.54, 0.04);
      // capital: two steps
      trimG.color(tc).boxB(px, archSpring - 0.14, colZ, 0.5, 0.14, 0.5, 'Y');
      trimG.boxB(px, archSpring, colZ, 0.58, 0.1, 0.58, 'Y');
      // rising damp on the column front
      faceUV(grime, px - 0.21, px + 0.21, 0, 1.3, colZ + 0.215, GRIME_UV.damp);
    }
    // arched spandrel wall between the column capitals
    {
      const ax0 = bx + 0.43;
      const ax1 = bx + bayW - 0.43;
      const zf = arcade;
      const zb = arcade - 0.34;
      const ay = (t: number): number => archSpring + 0.1 + archRise * Math.sin(Math.PI * t);
      wall.color(wc, fade * 0.95);
      for (let i = 0; i < archSegs; i++) {
        const t0 = i / archSegs;
        const t1 = (i + 1) / archSegs;
        const xa = ax0 + (ax1 - ax0) * t0;
        const xb = ax0 + (ax1 - ax0) * t1;
        wall.quad([xa, ay(t0), zf], [xb, ay(t1), zf], [xb, groundH, zf], [xa, groundH, zf]);
        // soffit
        wall.color(wc, 0.66).quad([xa, ay(t0), zb], [xb, ay(t1), zb], [xb, ay(t1), zf], [xa, ay(t0), zf]);
        wall.color(wc, fade * 0.95);
        // archivolt moulding just proud of the face
        trimG.color(tc).quad([xa, ay(t0), zf + 0.035], [xb, ay(t1), zf + 0.035], [xb, ay(t1) + 0.13, zf + 0.035], [xa, ay(t0) + 0.13, zf + 0.035]);
      }
      // spandrel above the column tops
      wall.color(wc, fade * 0.95);
      wall.quad([bx, archSpring + 0.1, zf], [ax0, archSpring + 0.1, zf], [ax0, groundH, zf], [bx, groundH, zf]);
      wall.quad([ax1, archSpring + 0.1, zf], [bx + bayW, archSpring + 0.1, zf], [bx + bayW, groundH, zf], [ax1, groundH, zf]);
      // keystone
      trimG.color(tc).boxB(cx, archSpring + 0.1 + archRise - 0.05, zf + 0.04, 0.26, 0.36, 0.1);
    }
    // a red lantern hanging under every other arch
    if (rng() < 0.6) {
      const ly = groundH - 1.15;
      dark.color(0x221a14).rod([cx, groundH - 0.01, arcade - 0.6], [cx, ly + 0.22, arcade - 0.6], 0.008, 3);
      lamp.color(rng() < 0.75 ? 0xe5251a : 0xff9a2e, glowLvl * 0.9).sphere(cx, ly, arcade - 0.6, 0.2, 0.25, 0.2, 6, 4);
      lamp.color(0xffd27a, glowLvl * 0.5).cyl(cx, ly - 0.36, arcade - 0.6, 0.025, 0.04, 0.12, 4);
      dark.color(0x1a1a1a).cyl(cx, ly + 0.2, arcade - 0.6, 0.08, 0.08, 0.08, 6);
    }

    // ── shop front ──
    const roll = rng();
    if (roll < 0.3) {
      // closed roller shutter
      faceUV(facade.white(), cx - 1.5, cx + 1.5, 0.12, 2.95, 0.02, FACADE_UV.shopRoller);
    } else if (roll < 0.45) {
      faceUV(facade.white(), cx - 1.5, cx + 1.5, 0.12, 2.95, 0.02, FACADE_UV.shopGlass);
    } else {
      // open, lamp-lit shop: interior glow + timber frame + half-raised shutter box
      const shopY = 0.12;
      const lit = PHUKET_UV.litShop[Math.floor(rng() * 2)];
      glow.rgb(glowLvl * 0.62, glowLvl * 0.58, glowLvl * 0.52);
      faceUV(glow, cx - 1.5, cx + 1.5, shopY, 2.7, 0.015, lit);
      wood.color(0x6a4a30);
      wood.boxB(cx - 1.53, 0.12, 0.06, 0.1, 2.83, 0.1);
      wood.boxB(cx + 1.53, 0.12, 0.06, 0.1, 2.83, 0.1);
      wood.boxB(cx, 2.7, 0.06, 3.16, 0.25, 0.12);
      wood.boxB(cx, 0.12, 0.08, 3.0, 0.5, 0.12);
      dark.color(0x9a9c9e).boxB(cx, 2.95, 0.1, 3.1, 0.3, 0.2);
      // goods on a low table in the five-foot way
      if (rng() < 0.5) {
        wood.color(0x7a5434).boxB(cx + range(rng, -0.6, 0.6), 0.12, 0.7, 1.2, 0.7, 0.55);
        for (let i = 0; i < 5; i++) dark.color(pick(rng, [0xd84a32, 0xf0c040, 0x4aa070, 0xf2ece0, 0x8a5ab0])).boxB(cx - 0.45 + i * 0.22 + range(rng, -0.3, 0.3), 0.82, 0.7, 0.16, range(rng, 0.1, 0.25), 0.3);
      }
    }
    // rising damp on the shop front wall
    faceUV(grime, bx, bx + bayW, 0, 1.0, 0.012, GRIME_UV.damp);

    // ── cornices (layered) + pilasters ──
    for (let f = 0; f <= fl; f++) {
      const y = groundH + f * floorH;
      const top = f === fl;
      trimG.color(tc, fade);
      trimG.boxB(cx, y - 0.14, arcade + 0.06, bayW, 0.14, 0.12, 'zY');
      trimG.boxB(cx, y, arcade + 0.12, bayW, 0.1, 0.24, 'z');
      if (top) trimG.boxB(cx, y + 0.1, arcade + 0.17, bayW + 0.04, 0.08, 0.34, 'z');
      // dentils on the top cornice
      if (top) for (let d = 0; d < 9; d++) trimG.color(tc, 0.9).boxB(bx + 0.25 + d * ((bayW - 0.5) / 8), y - 0.24, arcade + 0.06, 0.12, 0.1, 0.1, 'yzxX');
      // rain streaks hanging off the cornice
      if (f > 0 || rng() < 0.5) faceUV(grime, bx + range(rng, 0, 0.6), bx + bayW - range(rng, 0, 0.6), y - 0.14 - range(rng, 0.9, 1.6), y - 0.14, arcade + 0.004, GRIME_UV.streaks);
    }
    // frieze band under the top cornice
    faceUV(deco.white(), bx + 0.35, bx + bayW - 0.35, h - 0.72, h - 0.34, arcade + 0.012, PHUKET_UV.frieze);
    for (const px of [bx + 0.18, bx + bayW - 0.18]) trimG.color(tc, fade).boxB(px, groundH, arcade + 0.03, 0.3, h - groundH, 0.08, 'yYz');

    // ── upper windows ──
    const win = FACADE_UV.archLouvre[shutter];
    // air-con goes between the windows of one floor (replacing that floor's ornament)
    const acFloor = rng() < 0.55 ? Math.floor(rng() * fl) : -1;
    const hoodKind = Math.floor(rng() * 3);
    for (let f = 0; f < fl; f++) {
      const y = groundH + f * floorH + 0.55;
      for (const wx of [cx - bayW * 0.22, cx + bayW * 0.22]) {
        const w = 0.95;
        const wh = 1.95;
        const zf = arcade + 0.02;
        const open = rng() < 0.36;
        if (open) {
          // lamp-lit interior behind an empty stucco frame, shutter leaves folded back
          const it = PHUKET_UV.litInterior[Math.floor(rng() * 3)];
          glow.rgb(glowLvl * 0.7, glowLvl * 0.64, glowLvl * 0.55);
          faceUV(glow, wx - w / 2, wx + w / 2, y, y + wh, zf - 0.006, it);
          faceUV(deco.white(), wx - w / 2, wx + w / 2, y, y + wh, zf + 0.004, PHUKET_UV.archFrame);
          const leaf = FACADE_UV.leaf[shutter];
          const lw = w / 2;
          const a = 0.38;
          const dx = Math.cos(a) * lw;
          const dz = Math.sin(a) * lw;
          const ly0 = y + 0.12;
          const ly1 = y + wh * 0.72;
          const hr = wx + w / 2;
          const hl = wx - w / 2;
          facade.white().quadUV([hr, ly0, zf], [hr + dx, ly0, zf + dz], [hr + dx, ly1, zf + dz], [hr, ly1, zf], leaf[0], leaf[1], leaf[2], leaf[3]);
          facade.quadUV([hl - dx, ly0, zf + dz], [hl, ly0, zf], [hl, ly1, zf], [hl - dx, ly1, zf + dz], leaf[0], leaf[1], leaf[2], leaf[3]);
        } else {
          faceUV(facade.white(), wx - w / 2, wx + w / 2, y, y + wh, zf, win);
        }
        // sill on consoles + hood
        trimG.color(tc).boxB(wx, y - 0.1, arcade + 0.08, w + 0.3, 0.1, 0.18, 'z');
        if (hoodKind === 0) pediment(trimG, wx, y + wh + 0.02, arcade + 0.02, w + 0.32, 0.32, 0.12);
        else if (hoodKind === 1) hood(trimG, wx, y + wh + 0.02, arcade + 0.02, w + 0.3, 0.16, 0.12);
        else trimG.boxB(wx, y + wh, arcade + 0.04, w + 0.24, 0.14, 0.1, 'z');
        // streaks from the sill
        if (rng() < 0.6) faceUV(grime, wx - w / 2 - 0.05, wx + w / 2 + 0.05, y - 0.2 - range(rng, 0.6, 1.2), y - 0.2, arcade + 0.006, GRIME_UV.streaks);
      }
      // ornament between the windows
      const orn = f === acFloor ? 1 : rng();
      const my = groundH + f * floorH + 1.35;
      if (f === acFloor) {
        const ax = cx;
        const ay = groundH + f * floorH + 0.95;
        dark.color(0xdedbd2).boxB(ax, ay, arcade + 0.24, 0.8, 0.55, 0.32, 'Z');
        faceUV(facade.white(), ax - 0.4, ax + 0.4, ay, ay + 0.55, arcade + 0.4, FACADE_UV.aircon);
        dark.color(0x5a5650).beam([ax - 0.3, ay - 0.04, arcade + 0.02], [ax - 0.3, ay - 0.04, arcade + 0.4], 0.035);
        dark.beam([ax + 0.3, ay - 0.04, arcade + 0.02], [ax + 0.3, ay - 0.04, arcade + 0.4], 0.035);
        faceUV(grime, ax - 0.4, ax + 0.4, ay - 1.1, ay - 0.04, arcade + 0.006, GRIME_UV.drip);
        dark.color(0xe8e6e0).rod([ax + 0.42, ay + 0.1, arcade + 0.06], [ax + 0.42, ay - 0.9, arcade + 0.06], 0.018, 4);
      }
      if (orn < 0.35) faceUV(deco.white(), cx - 0.3, cx + 0.3, my, my + 0.6, arcade + 0.012, PHUKET_UV.medallion);
      else if (orn < 0.55) faceUV(deco.white(), cx - 0.3, cx + 0.3, my, my + 0.6, arcade + 0.012, PHUKET_UV.cartouche);
      else if (orn < 0.75) faceUV(deco.white(), cx - 0.34, cx + 0.34, my - 0.2, my + 0.48, arcade + 0.012, PHUKET_UV.peel[Math.floor(rng() * 4)]);
    }
    // peeling plaster patch near a corner
    if (rng() < 0.55) {
      const px = bx + range(rng, 0.4, bayW - 1.0);
      const py = groundH + range(rng, 0.1, 0.45);
      faceUV(deco.white(), px, px + range(rng, 0.45, 0.8), py, py + range(rng, 0.35, 0.55), arcade + 0.012, PHUKET_UV.peel[Math.floor(rng() * 4)]);
    }

    // ── parapet + roof ──
    const pType = rng();
    trimG.color(tc, fade).boxB(cx, h + 0.18, arcade - 0.05, bayW, 0.55, 0.25);
    // finials over the pilasters
    for (const px of [bx + 0.18, bx + bayW - 0.18]) {
      trimG.boxB(px, h + 0.18, arcade, 0.3, 0.72, 0.3);
      trimG.cyl(px, h + 0.9, arcade, 0.12, 0.05, 0.26, 5);
    }
    if (pType < 0.45) {
      // raised name plate with scrolls
      faceUV(deco.white(), cx - 1.3, cx + 1.3, h + 0.5, h + 1.8, arcade + 0.08, PHUKET_UV.gablePlate);
    } else if (pType < 0.8) {
      faceUV(deco.white(), cx - 1.4, cx + 1.4, h + 0.25, h + 0.66, arcade + 0.08, PHUKET_UV.breeze);
    }
    const ry0 = h + 0.05;
    const ry1 = h + 2.2;
    roof.color(0xc8704a, range(rng, 0.8, 1.05));
    roof.quad([bx, ry0, arcade - 0.3], [bx + bayW, ry0, arcade - 0.3], [bx + bayW, ry1, -depth / 2], [bx, ry1, -depth / 2]);
    roof.quad([bx + bayW, ry0, -depth - 0.2], [bx, ry0, -depth - 0.2], [bx, ry1, -depth / 2], [bx + bayW, ry1, -depth / 2]);
    roof.color(0x9a4a30).boxB(cx, ry1 - 0.04, -depth / 2, bayW, 0.14, 0.3, 'yxX');
    wall.color(wc, 0.8).tri([bx, ry0, arcade - 0.3], [bx, ry1, -depth / 2], [bx, ry0, -depth - 0.2]);
    wall.tri([bx + bayW, ry0, -depth - 0.2], [bx + bayW, ry1, -depth / 2], [bx + bayW, ry0, arcade - 0.3]);

    // ── signage (made-up glyphs, no brands) ──
    if (rng() < 0.85) {
      const sy = groundH + 0.16;
      const cn = rng() < 0.65;
      const s = cn ? PHUKET_UV.hSign[Math.floor(rng() * PHUKET_UV.hSign.length)] : SIGN_UV.h[Math.floor(rng() * SIGN_UV.h.length)];
      const sw = cn ? 1.75 : 1.6;
      const sh = cn ? 0.66 : 0.8;
      (cn ? deco : signs).white().quadUV([cx - sw, sy, arcade + 0.2], [cx + sw, sy, arcade + 0.2], [cx + sw, sy + sh, arcade + 0.2], [cx - sw, sy + sh, arcade + 0.2], s[0], s[1], s[2], s[3]);
      wood.color(0x3a2818).boxB(cx, sy - 0.04, arcade + 0.14, sw * 2 + 0.08, sh + 0.08, 0.05);
    }
    // vertical blade sign on a column (double-sided), on a bracket
    if (rng() < 0.45) {
      const cn = rng() < 0.6;
      const s = cn ? PHUKET_UV.vSign[Math.floor(rng() * PHUKET_UV.vSign.length)] : SIGN_UV.v[Math.floor(rng() * SIGN_UV.v.length)];
      const g = cn ? deco : signs;
      const px = bx + 0.22;
      const zs0 = arcade + 0.15;
      const zs1 = arcade + 0.62;
      const sy0 = 1.35;
      const sy1 = sy0 + (zs1 - zs0) * 5;
      g.white().quadUV([px, sy0, zs0], [px, sy0, zs1], [px, sy1, zs1], [px, sy1, zs0], s[0], s[1], s[2], s[3]);
      g.quadUV([px, sy0, zs1], [px, sy0, zs0], [px, sy1, zs0], [px, sy1, zs1], s[0], s[1], s[2], s[3]);
      dark.color(0x2a2622).beam([px, sy1 + 0.08, arcade - 0.02], [px, sy1 + 0.08, zs1 + 0.05], 0.03);
    }
    // drain pipe at the party wall
    if (rng() < 0.5) {
      const px = bx + 0.02;
      dark.color(0x8a8680).rod([px, 0.1, arcade + 0.14], [px, h - 0.1, arcade + 0.14], 0.055, 6);
      dark.cyl(px, h - 0.25, arcade + 0.14, 0.09, 0.12, 0.2, 6);
      faceUV(grime, px - 0.25, px + 0.25, groundH - 0.3, h - 0.3, arcade + 0.004, GRIME_UV.streaks);
    }
  }

  // ── sagging cables along the facade, bay to bay ──
  const cable = new GB();
  cable.color(0x1e1b19);
  for (let wi = 0; wi < 2; wi++) {
    const yc = groundH + 0.45 + wi * 0.22;
    const zc = arcade + 0.28 + wi * 0.06;
    for (let b = 0; b < bays; b++) {
      const xa = x0 + b * bayW + 0.18;
      const xb = xa + bayW;
      const sag = range(rng, 0.12, 0.35);
      const pts: P3[] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        pts.push([xa + (xb - xa) * t, yc - sag * 4 * t * (1 - t), zc]);
      }
      cable.tube(pts, 0.011, 3);
    }
  }
  // junction box on a pole-less bracket
  dark.color(0x6a6a64).boxB(x0 + bayW * 2, groundH + 0.25, arcade + 0.22, 0.32, 0.4, 0.16);
  k.flush();
  ctx.addStatic(cable.build(), ctx.mat('flat'), ctx.matrixAt());
}

function lanternLine(def: PropDef, ctx: PropContext): void {
  const span = num(ctx, def, 'span', 16);
  const count = Math.max(2, Math.round(num(ctx, def, 'count', 9)));
  const height = num(ctx, def, 'height', 6.5);
  const sag = span * 0.06;
  const cable = new GB();
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push([-span / 2 + span * t, height - sag * 4 * t * (1 - t), 0]);
  }
  cable.color(0x2a2522).tube(pts, 0.012, 4);
  ctx.addStatic(cable.build(), ctx.mat('flat'), ctx.matrixAt());
  const lan = new GB();
  const glow = lightLevel(ctx);
  const colors = [0xe30613, 0xff9a2e, 0xe30613, 0xffd27a];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = -span / 2 + span * t;
    const y = height - sag * 4 * t * (1 - t) - 0.38;
    lan.color(colors[i % colors.length], glow).sphere(x, y, 0, 0.2, 0.26, 0.2, 8, 6);
    lan.color(0x1a1a1a).cyl(x, y + 0.22, 0, 0.08, 0.08, 0.1, 6);
    lan.color(0xffd27a, glow * 0.6).cyl(x, y - 0.36, 0, 0.03, 0.05, 0.12, 5);
  }
  ctx.addStatic(lan.build(), ctx.mat('neon', { intensity: 1 }), ctx.matrixAt());
}

function hills(def: PropDef, ctx: PropContext): void {
  const width = num(ctx, def, 'width', 220);
  const height = num(ctx, def, 'height', 38);
  const g = new GB();
  const n = 48;
  const rng = ctx.rng;
  const ph = [rng() * 6, rng() * 6, rng() * 6];
  const prof: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = height * (0.55 + 0.25 * Math.sin(t * 7 + ph[0]) + 0.14 * Math.sin(t * 17 + ph[1]) + 0.06 * Math.sin(t * 41 + ph[2])) * (0.35 + 0.65 * Math.sin(Math.PI * t));
    prof.push(Math.max(2, y));
  }
  for (let i = 0; i < n; i++) {
    const xa = -width / 2 + (width * i) / n;
    const xb = -width / 2 + (width * (i + 1)) / n;
    const za = Math.sin(i * 0.9) * 6;
    const zb = Math.sin((i + 1) * 0.9) * 6;
    const v0 = g.vertexCount;
    g.color(0x2f5a3c).quad([xa, -2, za], [xb, -2, zb], [xb, prof[i + 1], zb], [xa, prof[i], za]);
    g.shadeBy(v0, (_x, y) => 0.55 + 0.45 * Math.min(1, y / height));
  }
  ctx.addStatic(g.build(), ctx.mat('flat', { roughness: 1 }), ctx.matrixAt());
}

// ═══════════════════════════════════════════════════════════════ quay ══

const QUAY_TOP = 0.9;
const QUAY_BOTTOM = -0.75;

function quay(def: PropDef, ctx: PropContext): void {
  const len = num(ctx, def, 'length', 40);
  const ladders = num(ctx, def, 'ladders', 1);
  const bollards = num(ctx, def, 'bollards', 1) > 0;
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const deco = k.g('phuketDecor');
  const grime = k.g('grime');
  const cope = k.g('stone', { cast: false });
  const iron = k.g('flat');
  const z0 = -len / 2;
  const z1 = len / 2;

  // masonry facing on the wall face (x = 0, facing −X), split at the wet-shade breaks
  const tileL = 6.4;
  const st = PHUKET_UV.quayStone;
  const ys = [QUAY_BOTTOM, -0.28, 0.06, 0.42, QUAY_TOP];
  const vAt = (y: number): number => st[1] + ((y - QUAY_BOTTOM) / (QUAY_TOP - QUAY_BOTTOM)) * (st[3] - st[1]);
  const xf = -0.006;
  for (let z = z0; z < z1 - 1e-3; z += tileL) {
    const za = z;
    const zb = Math.min(z1, z + tileL);
    const u0 = st[0];
    const u1 = st[0] + ((zb - za) / tileL) * (st[2] - st[0]);
    for (let i = 0; i < ys.length - 1; i++) {
      const ya = ys[i];
      const yb = ys[i + 1];
      const v = deco.vertexCount;
      deco.white().quadUV([xf, ya, za], [xf, ya, zb], [xf, yb, zb], [xf, yb, za], u0, vAt(ya), u1, vAt(yb));
      const sa = wetShade(ya, 0);
      const sb = wetShade(yb, 0);
      deco.shade(v, sa);
      deco.shade(v + 1, sa);
      deco.shade(v + 2, sb);
      deco.shade(v + 3, sb);
    }
  }
  // waterline algae + streaks from the coping
  const al = GRIME_UV.algae;
  for (let z = z0; z < z1 - 1e-3; z += 3.2) {
    const zb = Math.min(z1, z + 3.2);
    const u1 = al[0] + ((zb - z) / 3.2) * (al[2] - al[0]);
    grime.white().quadUV([xf - 0.006, -0.02, z], [xf - 0.006, -0.02, zb], [xf - 0.006, 0.5, zb], [xf - 0.006, 0.5, z], al[0], al[1], u1, al[3]);
  }
  for (let z = z0 + range(rng, 0.5, 3); z < z1 - 1.5; z += range(rng, 2.5, 6)) {
    const w = range(rng, 0.6, 1.6);
    const s = GRIME_UV.streaks;
    grime.quadUV([xf - 0.008, range(rng, 0, 0.4), z], [xf - 0.008, 0.2, z + w], [xf - 0.008, QUAY_TOP, z + w], [xf - 0.008, QUAY_TOP, z], s[0], s[1], s[2], s[3]);
  }

  // coping: individual bevelled granite blocks with colour variation (covers the kerb)
  for (let z = z0; z < z1 - 0.05; ) {
    const l = Math.min(z1 - z, range(rng, 1.1, 1.9));
    cope.color(pick(rng, [0xb9b2a6, 0xa8a196, 0xc4bdb0, 0x9e978c, 0xb2a998]), range(rng, 0.88, 1.06));
    cope.chamferBox(0.22, QUAY_TOP, z + l / 2, 0.44, 0.17, l - 0.012, 0.035);
    z += l;
  }

  // mooring bollards (cast iron, instanced)
  if (bollards) {
    const geo = sharedGeo(ctx, 'phuket.bollard', () => new GB().white().cyl(0, 0, 0, 0.13, 0.1, 0.5, 8).cyl(0, 0.36, 0, 0.15, 0.15, 0.06, 8).sphere(0, 0.5, 0, 0.17, 0.09, 0.17, 8, 3, 0.5, 1).build());
    for (let z = z0 + 4; z < z1 - 2; z += range(rng, 8, 11)) {
      ctx.addInstance('phuket.bollard', geo, ctx.mat('flat'), ctx.matrixAt([0.75, QUAY_TOP, z]), tint(0x2a2e30));
    }
  }

  // iron ladders (stiles 4–7 cm off the wall, grab handles over the coping)
  const zs = def.params?.ladderAt;
  const ladderZ: number[] = Array.isArray(zs) ? (zs as number[]) : ladders > 0 ? [range(rng, z0 + 4, z1 - 4)] : [];
  for (const lz of ladderZ) {
    iron.color(0x2f4a44);
    for (const dz of [-0.24, 0.24]) {
      iron.boxB(-0.05, -1.0, lz + dz, 0.035, QUAY_TOP + 1.0, 0.04);
      iron.rod([-0.05, QUAY_TOP, lz + dz], [-0.05, QUAY_TOP + 0.55, lz + dz], 0.02, 5);
      iron.rod([-0.05, QUAY_TOP + 0.55, lz + dz], [0.55, QUAY_TOP + 0.55, lz + dz], 0.02, 5);
      iron.rod([0.55, QUAY_TOP + 0.55, lz + dz], [0.55, QUAY_TOP + 0.17, lz + dz], 0.02, 5);
    }
    for (let y = -0.7; y < QUAY_TOP; y += 0.3) iron.rod([-0.05, y, lz - 0.24], [-0.05, y, lz + 0.24], 0.016, 4);
    faceUV2(grime, lz - 0.45, lz + 0.45, -0.3, QUAY_TOP, xf - 0.01, GRIME_UV.drip);
  }
  k.flush();
}

/** Quad on the quay wall plane x (facing −X), z0..z1 × y0..y1. */
function faceUV2(g: GB, z0: number, z1: number, y0: number, y1: number, x: number, r: UVRect): void {
  g.white().quadUV([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], r[0], r[1], r[2], r[3]);
}

// ═══════════════════════════════════════════════════════ small life ══

function cables(def: PropDef, ctx: PropContext): void {
  const span = num(ctx, def, 'span', 25);
  const height = num(ctx, def, 'height', 8.5);
  const wires = Math.max(1, Math.round(num(ctx, def, 'wires', 4)));
  const rng = ctx.rng;
  const g = new GB();
  g.color(0x1c1a18);
  for (let w = 0; w < wires; w++) {
    const ya = height + range(rng, -0.6, 0.8);
    const yb = height + range(rng, -0.6, 0.8);
    const za = range(rng, -0.5, 0.5);
    const zb = za + range(rng, -1.2, 1.2);
    const sag = range(rng, 0.6, 1.5);
    const pts: P3[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push([-span / 2 + span * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), za + (zb - za) * t]);
    }
    g.tube(pts, range(rng, 0.01, 0.018), 3);
  }
  // a small tangle hanging off one end
  const ex = span / 2 - range(rng, 0.6, 2.2);
  const loop: P3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    loop.push([ex + (t - 0.5) * 1.4, height - 0.2 - 0.7 * Math.sin(Math.PI * t), (t - 0.5) * 0.3]);
  }
  g.tube(loop, 0.012, 3);
  ctx.addStatic(g.build(), ctx.mat('flat'), ctx.matrixAt());
}

const SCOOTER_COLORS = [0xe23a2e, 0x2f7fc8, 0xf2f0ea, 0x1d1e22, 0x46b0a0, 0xf0c040, 0x9ab0c0];

function scooters(def: PropDef, ctx: PropContext): void {
  const count = Math.max(1, Math.round(num(ctx, def, 'count', 4)));
  const spacing = num(ctx, def, 'spacing', 0.9);
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const body = k.g('flat');
  const flat = body;
  const metal = body;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * spacing;
    const yaw = range(rng, -0.25, 0.25);
    const col = pick(rng, SCOOTER_COLORS);
    body.push().translate(x, 0, 0).rotY(yaw);
    // local: scooter points along +Z, wheelbase 1.25 m
    for (const wz of [-0.62, 0.62]) {
      flat.color(0x18181a).rod([-0.05, 0.24, wz], [0.05, 0.24, wz], 0.24, 8, true);
      metal.color(0xb0b4b8).rod([-0.06, 0.24, wz], [0.06, 0.24, wz], 0.1, 5, true);
    }
    body.color(col);
    body.chamferBox(0, 0.3, -0.25, 0.36, 0.42, 0.85, 0.08); // rear body
    flat.color(0x1c1c1e).chamferBox(0, 0.72, -0.28, 0.3, 0.1, 0.7, 0.04); // seat
    flat.color(0x2a2a2c).boxB(0, 0.18, 0.15, 0.3, 0.1, 0.55); // floorboard
    body.beam([0, 0.3, 0.42], [0, 0.95, 0.55], 0.32, 0.1); // leg shield
    metal.color(0x8a8e92).rod([0, 0.3, 0.62], [0, 1.02, 0.5], 0.025, 5); // fork / column
    flat.color(0x1c1c1e).rod([-0.34, 1.02, 0.5], [0.34, 1.02, 0.5], 0.022, 5); // handlebar
    body.chamferBox(0, 0.95, 0.5, 0.26, 0.16, 0.2, 0.04); // headset
    flat.color(0xfff2d0).boxB(0, 0.98, 0.61, 0.12, 0.07, 0.02); // headlight
    flat.color(0xd02a1a).boxB(0, 0.6, -0.69, 0.16, 0.05, 0.02); // tail light
    if (rng() < 0.35) flat.color(pick(rng, [0x1c1c1e, 0xf2f0ea, 0xe23a2e])).sphere(0.05, 0.86, -0.2, 0.13, 0.12, 0.15, 7, 4); // helmet
    body.pop();
  }
  k.flush();
}

const UMBRELLA_COLORS = [0xe0342a, 0x2f8fd0, 0xf0c030, 0x36a85a, 0xf2f2e6, 0xf07a2a];

function stall(def: PropDef, ctx: PropContext): void {
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const flat = k.g('flat');
  const fab = flat;
  const wood = k.g('wood');
  const bam = flat;
  const uc = def.params && typeof def.params.color === 'number' ? (def.params.color as number) : pick(rng, UMBRELLA_COLORS);
  // umbrella: pole + 8-panel canopy (alternating shade panels read as ribs)
  flat.color(0x6a5a48).cyl(0, 0, 0, 0.03, 0.03, 2.35, 5);
  const R = 1.35;
  const seg = 8;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const c = i % 2 ? 0xf6f2e8 : uc;
    const p0: P3 = [Math.sin(a0) * R, 2.15, Math.cos(a0) * R];
    const p1: P3 = [Math.sin(a1) * R, 2.15, Math.cos(a1) * R];
    const q0: P3 = [p0[0], 2.0, p0[2]];
    const q1: P3 = [p1[0], 2.0, p1[2]];
    void am;
    // canopy panel + valance flap, both windings (lit from above, seen from below)
    fab.color(c).tri([0, 2.6, 0], p1, p0);
    fab.quad(p0, p1, q1, q0);
    fab.color(c, 0.72).tri([0, 2.6, 0], p0, p1);
    fab.quad(q0, q1, p1, p0);
  }
  // table with goods (fruit / bowls / bottles)
  wood.color(0x8a6040).boxB(0, 0, 0.35, 1.3, 0.78, 0.7, 'y');
  flat.color(0xf2ece0).boxB(0, 0.78, 0.35, 1.36, 0.02, 0.76);
  for (let i = 0; i < 4; i++) {
    const bx = -0.45 + i * 0.3;
    bam.color(0xcaa860).cyl(bx, 0.8, 0.35, 0.13, 0.15, 0.1, 7);
    const fc = pick(rng, [0xf08a1e, 0xe8c22e, 0x3f9a3a, 0xd8323a, 0xf0a0a0, 0x7a3a8a]);
    for (let j = 0; j < 3; j++) flat.color(fc, range(rng, 0.85, 1.1)).sphere(bx + range(rng, -0.06, 0.06), 0.93, 0.35 + range(rng, -0.06, 0.06), 0.06, 0.06, 0.06, 4, 3);
  }
  // cool box + stools
  flat.color(pick(rng, [0x2f7fc8, 0xe23a2e, 0xf2f2e6])).chamferBox(0.85, 0, -0.2, 0.5, 0.42, 0.36, 0.04, '');
  for (const [sx, sz] of [[-0.7, -0.5], [0.15, -0.75]] as const) {
    flat.color(pick(rng, [0xe0342a, 0x2f8fd0, 0x36a85a])).cyl(sx, 0, sz, 0.17, 0.15, 0.42, 7);
  }
  k.flush();
}

function trestles(def: PropDef, ctx: PropContext): void {
  const len = num(ctx, def, 'length', 8);
  const k = new Kit(ctx);
  const wood = k.g('wood');
  const flat = k.g('flat');
  const H = 0.6;
  for (const tz of [-len * 0.28, len * 0.28]) {
    wood.color(0x7a5a3a);
    wood.boxB(0, H - 0.12, tz, 1.5, 0.12, 0.16);
    for (const sx of [-0.6, 0.6]) {
      wood.beam([sx * 0.8, H - 0.1, tz], [sx * 1.1, 0, tz - 0.25], 0.08);
      wood.beam([sx * 0.8, H - 0.1, tz], [sx * 1.1, 0, tz + 0.25], 0.08);
    }
  }
  // tarp + a paint tin and a coil of rope beside the hull
  flat.color(0x2f6fa8, 0.85).quad([1.2, 0.01, -1.4], [2.2, 0.01, -1.2], [2.0, 0.01, 0.4], [1.1, 0.01, 0.2]);
  flat.color(0xd8d4c8).cyl(1.5, 0, -0.6, 0.12, 0.12, 0.18, 7);
  flat.color(0xc8b080).cyl(1.6, 0, 0.0, 0.25, 0.25, 0.08, 9);
  k.flush();
}

registerProp('phuket.shophouseRow', shophouseRow);
registerProp('phuket.lanternLine', lanternLine);
registerProp('phuket.hills', hills);
registerProp('phuket.quay', quay);
registerProp('phuket.cables', cables);
registerProp('phuket.scooters', scooters);
registerProp('phuket.stall', stall);
registerProp('phuket.trestles', trestles);
