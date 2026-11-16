/**
 * Theme 'phuket' — Sino-Portuguese shophouses of Phuket Old Town.
 *   phuket.shophouseRow { bays=4, bayW=4.2, floors=2, depth=9, palette=0 }
 *       Row along local +X, facade faces local +Z. Ground floor = covered five-foot way with
 *       columns, upper floors with arched louvred windows, cornices, tiled roof, signboards.
 *   phuket.lanternLine  { span=16, count=9, height=6.5 }  string of lanterns along local X (sags).
 *   phuket.hills        { width=220, height=38 }         distant green hills (backdrop silhouette).
 */
import type { PropContext, PropDef } from '../../types';
import { FACADE_UV, SIGN_UV } from '../decals';
import { GB } from '../geo';
import { registerProp } from '../props/registry';
import { Kit, lightLevel, num, pick, range } from '../props/common/util';

/** Pastel stucco palettes (wall, trim/mouldings). */
const PALETTES: readonly (readonly [number, number])[] = [
  [0xf2d27a, 0xfff6e0], // butter yellow
  [0xf3b3b0, 0xfff1ec], // salmon pink
  [0xa8dcc8, 0xf3fff8], // mint
  [0x9ec9e8, 0xf2f8ff], // sky blue
  [0xf6c48e, 0xfff3e2], // apricot
  [0xd9c2ec, 0xfbf5ff], // lilac
  [0xe9e4d6, 0xffffff], // old white
];

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

  const wall = k.g('plaster');
  const trimG = k.g('plaster');
  const roof = k.g('roofTile');
  const facade = k.g('facade');
  const signs = k.g('signs');
  const floorG = k.g('patternTile');
  const dark = k.g('flat');

  for (let b = 0; b < bays; b++) {
    const [wc, tc] = pick(rng, PALETTES);
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const fl = floors + (rng() < 0.25 ? 1 : 0);
    const h = groundH + fl * floorH;
    const shutter = Math.floor(rng() * 4);

    // Main block, set back behind the arcade at ground level.
    wall.color(wc);
    wall.boxB(cx, 0, -depth / 2, bayW, h, depth, 'yZ');
    // Upper facade overhangs the arcade.
    wall.boxB(cx, groundH, arcade / 2, bayW, h - groundH, arcade, 'yxX');
    // Ground floor back wall of the arcade (shop front plane at z = 0).
    wall.color(wc, 0.86).quad([bx, 0, 0.001], [bx + bayW, 0, 0.001], [bx + bayW, groundH, 0.001], [bx, groundH, 0.001]);
    // Arcade ceiling.
    wall.color(wc, 0.7).quad([bx, groundH - 0.01, arcade], [bx + bayW, groundH - 0.01, arcade], [bx + bayW, groundH - 0.01, 0], [bx, groundH - 0.01, 0]);
    // Arcade floor (encaustic tiles), slightly above the quay.
    floorG.white().boxB(cx, 0, arcade / 2, bayW, 0.12, arcade, 'y');

    // Columns at bay edges with plinth and capital.
    trimG.color(tc);
    for (const px of [bx + 0.22, bx + bayW - 0.22]) {
      trimG.boxB(px, 0, arcade - 0.22, 0.42, groundH, 0.42);
      trimG.boxB(px, 0, arcade - 0.22, 0.56, 0.35, 0.56);
      trimG.boxB(px, groundH - 0.3, arcade - 0.22, 0.56, 0.3, 0.56);
    }
    // Segmental arch hint: beam with a keystone between the columns.
    trimG.boxB(cx, groundH - 0.55, arcade - 0.05, bayW - 0.8, 0.55, 0.12);
    trimG.boxB(cx, groundH - 0.75, arcade - 0.03, 0.4, 0.5, 0.14);

    // Cornices between floors and at the top.
    for (let f = 0; f <= fl; f++) {
      const y = groundH + f * floorH;
      trimG.boxB(cx, y - 0.12, arcade + 0.08, bayW, 0.24, 0.18);
    }
    // Pilasters on the upper floors.
    for (const px of [bx + 0.18, bx + bayW - 0.18]) trimG.boxB(px, groundH, arcade + 0.03, 0.3, h - groundH, 0.08);

    // Shop front: roller shutter or glass with a door, centred.
    const shop = rng() < 0.5 ? FACADE_UV.shopRoller : FACADE_UV.shopGlass;
    facade.white().quadUV([cx - 1.5, 0.12, 0.02], [cx + 1.5, 0.12, 0.02], [cx + 1.5, 2.95, 0.02], [cx - 1.5, 2.95, 0.02], shop[0], shop[1], shop[2], shop[3]);

    // Upper windows: 2 arched louvred windows per bay with sills.
    const win = FACADE_UV.archLouvre[shutter];
    for (let f = 0; f < fl; f++) {
      const y = groundH + f * floorH + 0.55;
      for (const wx of [cx - bayW * 0.22, cx + bayW * 0.22]) {
        const w = 0.95;
        const wh = 1.95;
        facade.white().quadUV([wx - w / 2, y, arcade + 0.02], [wx + w / 2, y, arcade + 0.02], [wx + w / 2, y + wh, arcade + 0.02], [wx - w / 2, y + wh, arcade + 0.02], win[0], win[1], win[2], win[3]);
        trimG.color(tc).boxB(wx, y - 0.1, arcade + 0.06, w + 0.3, 0.1, 0.14);
        trimG.boxB(wx, y + wh, arcade + 0.04, w + 0.24, 0.14, 0.1);
      }
    }

    // Parapet + tiled roof sloping back.
    trimG.color(tc).boxB(cx, h, arcade - 0.05, bayW, 0.5, 0.25);
    const ry0 = h + 0.05;
    const ry1 = h + 2.2;
    roof.color(0xc8704a, range(rng, 0.85, 1.05));
    roof.quad([bx, ry0, arcade - 0.3], [bx + bayW, ry0, arcade - 0.3], [bx + bayW, ry1, -depth / 2], [bx, ry1, -depth / 2]);
    roof.quad([bx + bayW, ry0, -depth - 0.2], [bx, ry0, -depth - 0.2], [bx, ry1, -depth / 2], [bx + bayW, ry1, -depth / 2]);
    wall.color(wc, 0.8).tri([bx, ry0, arcade - 0.3], [bx, ry1, -depth / 2], [bx, ry0, -depth - 0.2]);
    wall.tri([bx + bayW, ry0, -depth - 0.2], [bx + bayW, ry1, -depth / 2], [bx + bayW, ry0, arcade - 0.3]);

    // Signboard above the arcade (made-up glyphs, no brands).
    if (rng() < 0.8) {
      const s = SIGN_UV.h[Math.floor(rng() * SIGN_UV.h.length)];
      const sy = groundH + 0.12;
      signs.white().quadUV([cx - 1.6, sy, arcade + 0.13], [cx + 1.6, sy, arcade + 0.13], [cx + 1.6, sy + 0.8, arcade + 0.13], [cx - 1.6, sy + 0.8, arcade + 0.13], s[0], s[1], s[2], s[3]);
    }
    // Vertical blade sign on some columns.
    if (rng() < 0.35) {
      const s = SIGN_UV.v[Math.floor(rng() * SIGN_UV.v.length)];
      const px = bx + 0.22;
      signs.white().quadUV([px, 1.4, arcade + 0.15], [px, 1.4, arcade + 1.0], [px, 3.4, arcade + 1.0], [px, 3.4, arcade + 0.15], s[0], s[1], s[2], s[3]);
      signs.quadUV([px, 1.4, arcade + 1.0], [px, 1.4, arcade + 0.15], [px, 3.4, arcade + 0.15], [px, 3.4, arcade + 1.0], s[0], s[1], s[2], s[3]);
    }
    // Air-con box on an upper floor.
    if (rng() < 0.4) dark.color(0xdedbd2).boxB(cx + range(rng, -1, 1), groundH + 0.3, arcade + 0.25, 0.8, 0.55, 0.3);
  }
  k.flush();
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

registerProp('phuket.shophouseRow', shophouseRow);
registerProp('phuket.lanternLine', lanternLine);
registerProp('phuket.hills', hills);
