/**
 * Theme 'france' — Paris. Props:
 *   france.haussmannRow { bays=4, bayW=4.4, floors=6, depth=12, palette=0 }  cream limestone row, balconies, zinc mansard.
 *   france.montmartreRow { bays=4, floors=4, palette=0 }                     narrow old houses, lit windows, shutters.
 *   france.cafe { width=9, awning=0 }                                        striped awning, terrace tables, bulbs.
 *   france.cabaret { width=15 }                                              windmill-style cabaret, red neon (made-up).
 *   france.bouquinistes { length=14 }                                        green bookstall boxes on a parapet.
 *   france.lampPost { glow=0.6 }                                             ornate green cast-iron lamp.
 *   france.stringLights { span=16, count=16, height=7 }                      festoon along local X.
 *   france.easels { count=2 }                                                street painters' easels along local X.
 *   france.barge { length=18, hull=0x2d3f55 }                                moored peniche (local Z = length).
 *   france.bridge { span=12.2, deckY=8.6 }                                   stone arch bridge across local X.
 *   france.tower { height=200 }                                              stylised iron lattice tower (landmark).
 *   france.basilica { scale=1 }                                              floodlit white-domed basilica on a hill.
 */
import type { PropContext, PropDef } from '../../types';
import { FACADE_UV, SIGN_UV } from '../decals';
import { GB } from '../geo';
import type { P3 } from '../geo';
import { registerProp } from '../props/registry';
import { Kit, lightLevel, num, pick, range } from '../props/common/util';

const STONES = [0xe9dcc0, 0xe2d4b5, 0xf0e6cf, 0xdccfb2, 0xe6d8bc, 0xd8c9a8];
const OLD = [0xe3c48a, 0xefe3c8, 0xd9a191, 0xa9bfcf, 0xb7c4a0, 0xcc8a66, 0xe9e0cf];
const ZINC = 0x606b7a;
const IRON = 0x1b1d20;
const AWN: readonly (readonly [number, number])[] = [
  [0xb3202a, 0xf2e8d4],
  [0x1f5a3c, 0xf2e8d4],
  [0x1e2f5c, 0xf2e8d4],
];
const PAINT = [0xd9483b, 0xf2b134, 0x3b7ddd, 0x3aa17e, 0xe9e1cf, 0x8e4cb8];

// ─────────────────────────────────────────────────── Haussmann row ──

function haussmannRow(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const bays = Math.max(1, Math.round(num(ctx, def, 'bays', 4)));
  const bayW = num(ctx, def, 'bayW', 4.4);
  const floors = Math.max(3, Math.round(num(ctx, def, 'floors', 6)));
  const depth = num(ctx, def, 'depth', 12);
  const pal = Math.round(num(ctx, def, 'palette', 0));
  const rng = ctx.rng;
  const groundH = 3.8;
  const floorH = 3.1;
  const total = bays * bayW;
  const x0 = -total / 2;
  const h = groundH + (floors - 1) * floorH;

  const wall = k.g('plaster');
  const trim = k.g('plaster');
  const zinc = k.g('metal');
  const iron = k.g('paintedMetal');
  const facade = k.g('facade');
  const signs = k.g('signs');
  const brick = k.g('brick');
  const dark = k.g('flat');

  const stone = STONES[((pal % STONES.length) + STONES.length) % STONES.length];
  wall.color(stone);
  trim.color(stone, 1.08);
  // main block (floor-to-roof, one piece) with a rusticated ground floor band
  wall.boxB(0, 0, -depth / 2, total, h, depth, 'y');
  trim.boxB(0, 0, 0.06, total + 0.2, groundH - 0.2, 0.12);
  trim.boxB(0, groundH - 0.25, 0.1, total + 0.3, 0.28, 0.22);
  for (let f = 1; f < floors; f++) {
    const y = groundH + (f - 1) * floorH;
    trim.boxB(0, y - 0.07, 0.07, total + 0.1, 0.14, 0.14);
  }
  // heavy cornice below the mansard
  trim.boxB(0, h - 0.35, 0.18, total + 0.5, 0.35, 0.45);
  trim.boxB(0, h - 0.05, 0.28, total + 0.6, 0.18, 0.6);
  // corner quoins
  for (const qx of [x0 - 0.04, x0 + total + 0.04 - 0.4]) trim.boxB(qx + 0.2, groundH, 0.06, 0.4, h - groundH - 0.4, 0.1);

  for (let b = 0; b < bays; b++) {
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    // shop front with a dark fascia sign
    const shop = rng() < 0.55 ? FACADE_UV.shopGlass : FACADE_UV.doorWood;
    if (shop === FACADE_UV.shopGlass) {
      facade.white().quadUV([cx - 1.6, 0.1, 0.14], [cx + 1.6, 0.1, 0.14], [cx + 1.6, 2.9, 0.14], [cx - 1.6, 2.9, 0.14], shop[0], shop[1], shop[2], shop[3]);
    } else {
      facade.white().quadUV([cx - 0.7, 0.1, 0.14], [cx + 0.7, 0.1, 0.14], [cx + 0.7, 2.9, 0.14], [cx - 0.7, 2.9, 0.14], shop[0], shop[1], shop[2], shop[3]);
    }
    dark.color(rng() < 0.5 ? 0x1f3a2d : 0x2a2420).boxB(cx, 2.95, 0.16, bayW - 0.6, 0.6, 0.1);
    if (rng() < 0.7) {
      const s = SIGN_UV.h[Math.floor(rng() * SIGN_UV.h.length)];
      signs.white().quadUV([cx - 1.5, 3.0, 0.222], [cx + 1.5, 3.0, 0.222], [cx + 1.5, 3.5, 0.222], [cx - 1.5, 3.5, 0.222], s[0], s[1], s[2], s[3]);
    }
    // tall French windows, two per bay
    for (let f = 1; f < floors; f++) {
      const y = groundH + (f - 1) * floorH + 0.45;
      const tall = f === 2 || f === floors - 1 ? 2.35 : 2.0;
      for (const wx of [cx - bayW * 0.26, cx + bayW * 0.26]) {
        const u = FACADE_UV.rectShutter;
        facade.white().quadUV([wx - 0.58, y, 0.05], [wx + 0.58, y, 0.05], [wx + 0.58, y + tall, 0.05], [wx - 0.58, y + tall, 0.05], u[0], u[1], u[2], u[3]);
        // pediment / lintel
        trim.boxB(wx, y + tall, 0.09, 1.4, 0.16, 0.18);
        if (f === 2 || f === floors - 1) {
          // wrought-iron balcony: slab, rails, balusters
          const by = groundH + (f - 1) * floorH + 0.1;
          trim.boxB(wx, by - 0.1, 0.4, 1.5, 0.1, 0.7);
          iron.color(IRON);
          iron.boxB(wx, by + 0.95, 0.74, 1.5, 0.05, 0.05);
          iron.boxB(wx, by, 0.74, 1.5, 0.04, 0.04);
          for (const sx of [-0.73, 0.73]) iron.boxB(wx + sx, by, 0.4, 0.04, 0.99, 0.7);
          for (let i = 0; i < 7; i++) iron.boxB(wx - 0.6 + i * 0.2, by, 0.74, 0.025, 0.95, 0.025, 'yY');
        }
      }
    }
  }
  // long continuous balcony rails between windows on balcony floors
  for (const f of [2, floors - 1]) {
    const by = groundH + (f - 1) * floorH + 0.1;
    iron.color(IRON);
    iron.boxB(0, by + 0.95, 0.74, total, 0.04, 0.04);
  }

  // mansard: steep lower pitch + flat upper, extruded along the row
  const top = h + 3.4;
  const prof: [number, number][] = [
    [-0.45, h],
    [0.95, h + 2.7],
    [depth - 1.3, top],
    [depth, h + 2.4],
    [depth, h],
  ];
  zinc.color(ZINC, range(rng, 0.9, 1.1));
  zinc.push().translate(x0, 0, 0).rotY(Math.PI / 2).prism(prof, 0, total, true, true);
  zinc.pop();
  // zinc ribs on the steep slope
  for (let i = 0; i <= bays * 3; i++) {
    const rx = x0 + (i / (bays * 3)) * total;
    zinc.color(0x45505e).beam([rx, h + 0.1, -0.42], [rx, h + 2.7, 0.9], 0.05, 0.05);
  }
  // dormers: one per bay, pedimented
  for (let b = 0; b < bays; b++) {
    const cx = x0 + b * bayW + bayW / 2;
    const dy = h + 0.2;
    wall.color(stone, 0.96).boxB(cx, dy, -0.35, 1.2, 1.55, 1.3, 'y');
    const u = FACADE_UV.rectGlassDark;
    facade.white().quadUV([cx - 0.42, dy + 0.2, 0.31], [cx + 0.42, dy + 0.2, 0.31], [cx + 0.42, dy + 1.35, 0.31], [cx - 0.42, dy + 1.35, 0.31], u[0], u[1], u[2], u[3]);
    zinc.color(0x586270);
    const ty = dy + 1.55;
    zinc.quad([cx - 0.7, ty, 0.35], [cx, ty + 0.55, 0.35], [cx, ty + 0.55, -1.0], [cx - 0.7, ty, -1.0]);
    zinc.quad([cx, ty + 0.55, 0.35], [cx + 0.7, ty, 0.35], [cx + 0.7, ty, -1.0], [cx, ty + 0.55, -1.0]);
    wall.color(stone).tri([cx - 0.6, ty, 0.34], [cx + 0.6, ty, 0.34], [cx, ty + 0.5, 0.34]);
  }
  // chimney stacks with pots
  const stacks = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < stacks; i++) {
    const cx = x0 + ((i + 0.5 + rng() * 0.3) / stacks) * total;
    const cz = -depth + 2.6;
    brick.color(0xb77a5a).boxB(cx, top - 0.1, cz, 1.7, 2.4, 0.8);
    dark.color(0x6a4a3a).boxB(cx, top + 2.3, cz, 1.9, 0.18, 1.0);
    for (let p = 0; p < 4; p++) dark.color(0xb8683f).cyl(cx - 0.6 + p * 0.4, top + 2.4, cz, 0.13, 0.1, 0.55, 6);
  }
  k.flush();
}

// ───────────────────────────────────────────────── Montmartre row ──

function montmartreRow(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const bays = Math.max(1, Math.round(num(ctx, def, 'bays', 4)));
  const floors = Math.max(3, Math.round(num(ctx, def, 'floors', 4)));
  const pal = Math.round(num(ctx, def, 'palette', 0));
  const depth = 8;
  const rng = ctx.rng;
  const groundH = 3.4;
  const floorH = 3.0;
  const glow = lightLevel(ctx);

  const wall = k.g('plaster');
  const trim = k.g('plaster');
  const roof = k.g('metal');
  const facade = k.g('facade');
  const signs = k.g('signs');
  const brick = k.g('brick');
  const dark = k.g('flat');
  const neon = k.g('neon', undefined, { intensity: 1 });

  const widths: number[] = [];
  let total = 0;
  for (let i = 0; i < bays; i++) {
    const w = 3.0 + Math.floor(rng() * 4) * 0.35;
    widths.push(w);
    total += w;
  }
  let bx = -total / 2;
  for (let b = 0; b < bays; b++) {
    const w = widths[b];
    const cx = bx + w / 2;
    const fl = Math.max(3, floors + (rng() < 0.3 ? -1 : rng() < 0.2 ? 1 : 0));
    const h = groundH + fl * floorH;
    const stone = OLD[(((pal + b * 3) % OLD.length) + OLD.length) % OLD.length];
    wall.color(stone, range(rng, 0.9, 1.05));
    wall.boxB(cx, 0, -depth / 2, w, h, depth, 'y');
    trim.color(stone, 1.12);
    for (let f = 0; f <= fl; f++) trim.boxB(cx, groundH + f * floorH - 0.1, 0.06, w + 0.04, 0.18, 0.12);
    // ground floor: warm shop window or door
    if (rng() < 0.7) {
      const u = FACADE_UV.shopGlass;
      facade.white().quadUV([cx - w * 0.38, 0.1, 0.03], [cx + w * 0.38, 0.1, 0.03], [cx + w * 0.38, 2.7, 0.03], [cx - w * 0.38, 2.7, 0.03], u[0], u[1], u[2], u[3]);
    } else {
      const u = FACADE_UV.doorWood;
      facade.white().quadUV([cx - 0.65, 0.1, 0.03], [cx + 0.65, 0.1, 0.03], [cx + 0.65, 2.7, 0.03], [cx - 0.65, 2.7, 0.03], u[0], u[1], u[2], u[3]);
    }
    if (rng() < 0.75) {
      const s = SIGN_UV.h[Math.floor(rng() * SIGN_UV.h.length)];
      signs.white().quadUV([cx - w * 0.4, 2.8, 0.1], [cx + w * 0.4, 2.8, 0.1], [cx + w * 0.4, 3.3, 0.1], [cx - w * 0.4, 3.3, 0.1], s[0], s[1], s[2], s[3]);
    }
    // windows: lit panes with open shutters, or closed shutters
    const nwin = w > 3.5 ? 2 : 1;
    const shut = Math.floor(rng() * 4);
    for (let f = 0; f < fl; f++) {
      const y = groundH + f * floorH + 0.55;
      for (let i = 0; i < nwin; i++) {
        const wx = nwin === 1 ? cx : cx + (i === 0 ? -1 : 1) * w * 0.26;
        const lit = rng() < 0.62;
        if (lit) {
          const warm = pick(rng, [0xffc46a, 0xffb457, 0xffd58a, 0xff9f5a]);
          neon.color(warm, 1.1).quad([wx - 0.42, y, 0.04], [wx + 0.42, y, 0.04], [wx + 0.42, y + 1.55, 0.04], [wx - 0.42, y + 1.55, 0.04]);
          dark.color(0x2a1f18);
          dark.boxB(wx, y + 0.72, 0.06, 0.84, 0.05, 0.03);
          dark.boxB(wx, y, 0.06, 0.05, 1.55, 0.03);
          const lf = FACADE_UV.leaf[shut];
          for (const sx of [-1, 1]) {
            facade.white().quadUV([wx + sx * 0.44 - 0.2, y, 0.07], [wx + sx * 0.44 + 0.2, y, 0.07], [wx + sx * 0.44 + 0.2, y + 1.55, 0.07], [wx + sx * 0.44 - 0.2, y + 1.55, 0.07], lf[0], lf[1], lf[2], lf[3]);
          }
          trim.color(stone, 0.9).boxB(wx, y - 0.1, 0.1, 1.2, 0.1, 0.2);
          if (rng() < 0.35) {
            dark.color(0x4a3524).boxB(wx, y - 0.2, 0.26, 1.0, 0.22, 0.26);
            dark.color(0x3f7a3a).boxB(wx, y + 0.02, 0.26, 0.92, 0.18, 0.22);
            dark.color(0xd9483b).boxB(wx - 0.25, y + 0.18, 0.26, 0.18, 0.1, 0.14);
            dark.color(0xf2b134).boxB(wx + 0.2, y + 0.18, 0.26, 0.18, 0.1, 0.14);
          }
        } else {
          const u = FACADE_UV.rectShutter;
          facade.white().quadUV([wx - 0.5, y - 0.05, 0.04], [wx + 0.5, y - 0.05, 0.04], [wx + 0.5, y + 1.95, 0.04], [wx - 0.5, y + 1.95, 0.04], u[0], u[1], u[2], u[3]);
        }
      }
    }
    // pitched slate roof sloping back, gabled side walls
    const ry = h + 0.05;
    const peak = h + range(rng, 1.8, 2.8);
    roof.color(0x58626f, range(rng, 0.85, 1.05));
    roof.quad([bx, ry, 0.35], [bx + w, ry, 0.35], [bx + w, peak, -depth * 0.45], [bx, peak, -depth * 0.45]);
    roof.quad([bx + w, ry, -depth - 0.2], [bx, ry, -depth - 0.2], [bx, peak, -depth * 0.45], [bx + w, peak, -depth * 0.45]);
    wall.color(stone, 0.85).tri([bx, ry, 0.35], [bx, peak, -depth * 0.45], [bx, ry, -depth - 0.2]);
    wall.tri([bx + w, ry, -depth - 0.2], [bx + w, peak, -depth * 0.45], [bx + w, ry, 0.35]);
    trim.color(stone, 1.0).boxB(cx, h, 0.05, w, 0.4, 0.32);
    if (rng() < 0.55) {
      const chx = cx + range(rng, -w * 0.25, w * 0.25);
      brick.color(0xa8694a).boxB(chx, peak - 1.0, -depth * 0.5, 0.7, 2.0, 0.6);
      dark.color(0xb8683f).cyl(chx, peak + 0.95, -depth * 0.5, 0.2, 0.16, 0.5, 6);
    }
    bx += w;
  }
  void glow;
  k.flush();
}

// ───────────────────────────────────────────────────────────── Café ──

function cafe(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const width = num(ctx, def, 'width', 9);
  const style = Math.round(num(ctx, def, 'awning', 0));
  const [c1, c2] = AWN[((style % AWN.length) + AWN.length) % AWN.length];
  const rng = ctx.rng;
  const glow = lightLevel(ctx);
  const fab = k.g('fabric');
  const iron = k.g('paintedMetal');
  const dark = k.g('flat');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const wood = k.g('wood');

  const x0 = -width / 2;
  const stripes = Math.round(width / 0.5);
  const sw = width / stripes;
  const yTop = 3.3;
  const yLow = 2.55;
  const zOut = 2.3;
  for (let i = 0; i < stripes; i++) {
    fab.color(i % 2 ? c2 : c1, 1);
    const xa = x0 + i * sw;
    const xb = xa + sw;
    fab.quad([xa, yTop, 0.08], [xb, yTop, 0.08], [xb, yLow, zOut], [xa, yLow, zOut]);
    fab.quad([xa, yLow, zOut], [xb, yLow, zOut], [xb, yLow - 0.3, zOut + 0.05], [xa, yLow - 0.3, zOut + 0.05]);
    fab.quad([xb, yTop, 0.08], [xa, yTop, 0.08], [xa, yLow, zOut], [xb, yLow, zOut]);
  }
  for (const px of [x0 + 0.1, x0 + width - 0.1]) iron.color(IRON).rod([px, 0, zOut], [px, yLow - 0.1, zOut], 0.04, 5);
  // festoon of warm bulbs under the front edge
  const nb = Math.round(width / 0.55);
  for (let i = 0; i < nb; i++) {
    const t = (i + 0.5) / nb;
    neon.color(0xffd9a0, glow * 0.45).sphere(x0 + t * width, yLow - 0.34 - Math.sin(t * Math.PI) * 0.05, zOut + 0.06, 0.07, 0.07, 0.07, 5, 3);
  }
  // tables and chairs (bistro set)
  const tables = Math.max(2, Math.round(width / 2.4));
  for (let i = 0; i < tables; i++) {
    const tx = x0 + ((i + 0.5) / tables) * width;
    const tz = 1.2 + (i % 2) * 0.4;
    iron.color(0x2a2d31);
    iron.cyl(tx, 0, tz, 0.17, 0.05, 0.05, 6);
    iron.rod([tx, 0, tz], [tx, 0.72, tz], 0.03, 5);
    wood.color(pick(rng, [0xcdb28a, 0xe9e1cf, 0x9c6a43]));
    wood.cyl(tx, 0.72, tz, 0.36, 0.36, 0.04, 10);
    for (const sx of [-0.6, 0.6]) {
      const cx = tx + sx;
      iron.color(0x3a2a22);
      iron.boxB(cx, 0.43, tz, 0.4, 0.04, 0.4);
      for (const lx of [-0.17, 0.17]) for (const lz of [-0.17, 0.17]) iron.rod([cx + lx, 0, tz + lz], [cx + lx, 0.43, tz + lz], 0.015, 4);
      iron.boxB(cx, 0.46, tz + 0.2, 0.4, 0.4, 0.03);
    }
  }
  // planter box fence
  dark.color(0x3b2b1f).boxB(0, 0, zOut + 0.25, width - 0.4, 0.38, 0.3);
  dark.color(0x2f6a35);
  for (let i = 0; i < Math.round(width / 0.7); i++) dark.boxB(x0 + 0.4 + i * 0.7, 0.38, zOut + 0.25, 0.55, 0.45 + rng() * 0.25, 0.26);
  k.flush();
}

// ─────────────────────────────────────────────────────────── Cabaret ──

function cabaret(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const width = num(ctx, def, 'width', 15);
  const depth = 10;
  const h = 11;
  const glow = lightLevel(ctx);
  const wall = k.g('plaster');
  const dark = k.g('flat');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const signs = k.g('signs');
  const facade = k.g('facade');
  const iron = k.g('paintedMetal');

  wall.color(0x8e1c24);
  wall.boxB(0, 0, -depth / 2, width, h, depth, 'y');
  wall.color(0xa5262e).boxB(0, 0, 0.1, width + 0.4, 0.9, 0.2);
  wall.color(0xa5262e).boxB(0, h - 0.5, 0.2, width + 0.6, 0.5, 0.4);
  // windmill tower
  wall.color(0x7d161d).boxB(0, h, -3.2, 5.4, 3.4, 4.6, 'y');
  wall.color(0x7d161d);
  wall.quad([-2.7, h + 3.4, -0.9], [2.7, h + 3.4, -0.9], [1.7, h + 4.9, -2.0], [-1.7, h + 4.9, -2.0]);
  wall.quad([2.7, h + 3.4, -5.5], [-2.7, h + 3.4, -5.5], [-1.7, h + 4.9, -4.4], [1.7, h + 4.9, -4.4]);
  wall.color(0x6c1218).quad([-1.7, h + 4.9, -2.0], [1.7, h + 4.9, -2.0], [1.7, h + 4.9, -4.4], [-1.7, h + 4.9, -4.4]);
  // blades: neon-outlined lattices, hub on the front of the tower
  const hubY = h + 3.7;
  const hubZ = -0.55;
  dark.color(0x2a0c0f).cyl(0, hubY - 0.35, hubZ - 0.1, 0.35, 0.35, 0.5, 8);
  for (let a = 0; a < 4; a++) {
    const ang = Math.PI / 4 + (a * Math.PI) / 2;
    neon.push().translate(0, hubY, hubZ).rotZ(ang);
    const len = 6.6;
    const bw = 0.65;
    neon.color(0xff1f3a, 1.7);
    for (const sx of [-bw, bw]) neon.rod([sx, 0.6, 0], [sx, len, 0], 0.06, 4);
    neon.rod([-bw, len, 0], [bw, len, 0], 0.06, 4);
    neon.rod([-bw, 0.6, 0], [bw, 0.6, 0], 0.06, 4);
    for (let i = 1; i < 6; i++) neon.rod([-bw, 0.6 + ((len - 0.6) * i) / 6, 0], [bw, 0.6 + ((len - 0.6) * i) / 6, 0], 0.035, 4);
    neon.pop();
    dark.push().translate(0, hubY, hubZ - 0.12).rotZ(ang).boxB(0, 0.6, 0, 1.3, len - 0.6, 0.05).pop();
  }
  // facade: neon outline, big made-up marquee, entrance canopy, bulbs
  neon.color(0xff2a45, 1.5);
  neon.rod([-width / 2 + 0.2, 0.9, 0.3], [-width / 2 + 0.2, h - 0.5, 0.3], 0.07, 4);
  neon.rod([width / 2 - 0.2, 0.9, 0.3], [width / 2 - 0.2, h - 0.5, 0.3], 0.07, 4);
  neon.rod([-width / 2 + 0.2, h - 0.6, 0.45], [width / 2 - 0.2, h - 0.6, 0.45], 0.07, 4);
  // windows (warm) upstairs
  for (let i = 0; i < 5; i++) {
    const wx = -width / 2 + 1.8 + (i * (width - 3.6)) / 4;
    neon.color(0xffa24a, 0.9).quad([wx - 0.45, 6.0, 0.05], [wx + 0.45, 6.0, 0.05], [wx + 0.45, 8.3, 0.05], [wx - 0.45, 8.3, 0.05]);
    dark.color(0x2a0c0f).boxB(wx, 6.0, 0.07, 0.07, 2.3, 0.03);
    const u = FACADE_UV.archLouvre[0];
    void u;
  }
  // marquee board (made-up glyph sign) with neon frame
  const s = SIGN_UV.h[2];
  signs.white().quadUV([-width / 2 + 2.2, 2.9, 0.12], [width / 2 - 2.2, 2.9, 0.12], [width / 2 - 2.2, 5.1, 0.12], [-width / 2 + 2.2, 5.1, 0.12], s[0], s[1], s[2], s[3]);
  neon.color(0xff3050, 1.6);
  neon.rod([-width / 2 + 2.1, 2.8, 0.2], [width / 2 - 2.1, 2.8, 0.2], 0.05, 4);
  neon.rod([-width / 2 + 2.1, 5.2, 0.2], [width / 2 - 2.1, 5.2, 0.2], 0.05, 4);
  neon.rod([-width / 2 + 2.1, 2.8, 0.2], [-width / 2 + 2.1, 5.2, 0.2], 0.05, 4);
  neon.rod([width / 2 - 2.1, 2.8, 0.2], [width / 2 - 2.1, 5.2, 0.2], 0.05, 4);
  // entrance canopy
  dark.color(0x1a0a0c).boxB(0, 0.1, 0.12, 2.6, 2.4, 0.05);
  iron.color(0x3a0c12).boxB(0, 2.5, 0.8, 3.4, 0.2, 1.6);
  neon.color(0xff3050, 1.7).rod([-1.7, 2.5, 1.6], [1.7, 2.5, 1.6], 0.06, 4);
  for (let i = 0; i < 12; i++) neon.color(0xffe08a, glow * 0.4).sphere(-1.6 + i * 0.29, 2.42, 1.62, 0.07, 0.07, 0.07, 5, 3);
  // bulb string along the roof edge
  for (let i = 0; i < 28; i++) neon.color(0xffe08a, glow * 0.4).sphere(-width / 2 + 0.3 + (i * (width - 0.6)) / 27, h + 0.1, 0.5, 0.08, 0.08, 0.08, 5, 3);
  facade.white();
  k.flush();
}

// ────────────────────────────────────────────────────── Street props ──

function bouquinistes(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const length = num(ctx, def, 'length', 14);
  const rng = ctx.rng;
  const green = k.g('paintedMetal');
  const dark = k.g('flat');
  const n = Math.max(1, Math.floor(length / 2.3));
  const start = -(n * 2.3) / 2;
  for (let i = 0; i < n; i++) {
    const cx = start + i * 2.3 + 1.15;
    green.color(0x24573f);
    green.boxB(cx, 0, -0.35, 2.05, 0.62, 0.7);
    // open lid propped up at the back
    green.quad([cx - 1.02, 0.62, -0.05], [cx + 1.02, 0.62, -0.05], [cx + 1.02, 1.3, -0.5], [cx - 1.02, 1.3, -0.5]);
    green.quad([cx + 1.02, 0.62, -0.05], [cx - 1.02, 0.62, -0.05], [cx - 1.02, 1.3, -0.5], [cx + 1.02, 1.3, -0.5]);
    // front flap
    green.quad([cx - 1.0, 0.62, 0.02], [cx + 1.0, 0.62, 0.02], [cx + 1.0, 0.1, 0.1], [cx - 1.0, 0.1, 0.1]);
    // books, prints and postcards
    for (let b = 0; b < 12; b++) {
      dark.color(pick(rng, PAINT), 0.9);
      dark.boxB(cx - 0.9 + b * 0.16, 0.62, -0.3, 0.12, 0.2 + rng() * 0.12, 0.34);
    }
  }
  // continuous dark-green back rail along the parapet
  green.color(0x1e4633).boxB(0, 0, -0.8, n * 2.3, 0.9, 0.1);
  k.flush();
}

function lampPost(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const glow = lightLevel(ctx) * num(ctx, def, 'glow', 0.7);
  const iron = k.g('paintedMetal');
  const neon = k.g('neon', undefined, { intensity: 1 });
  iron.color(0x1f3a2f);
  iron.lathe(0, 0, [[0.28, 0], [0.26, 0.2], [0.17, 0.4], [0.13, 0.9], [0.1, 1.0]], 8);
  iron.cyl(0, 1.0, 0, 0.09, 0.06, 3.6, 8);
  iron.cyl(0, 3.55, 0, 0.14, 0.14, 0.1, 8);
  // curled arms with a pair of globes
  for (const sx of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push([sx * 0.55 * Math.sin(t * 1.5), 3.5 + 0.45 * Math.sin(t * 2.4), 0]);
    }
    iron.tube(pts, 0.025, 4);
    iron.cyl(sx * 0.55, 3.9, 0, 0.12, 0.1, 0.1, 8);
    neon.color(0xffd9a0, glow).sphere(sx * 0.55, 4.1, 0, 0.19, 0.22, 0.19, 8, 6);
  }
  iron.rod([0, 4.6, 0], [0, 4.5, 0], 0.01, 3);
  neon.color(0xffd9a0, glow).sphere(0, 4.25, 0, 0.24, 0.28, 0.24, 8, 6);
  iron.cyl(0, 4.5, 0, 0.14, 0.02, 0.28, 8);
  k.flush();
}

function stringLights(def: PropDef, ctx: PropContext): void {
  const span = num(ctx, def, 'span', 16);
  const count = Math.max(2, Math.round(num(ctx, def, 'count', 16)));
  const height = num(ctx, def, 'height', 7);
  const glow = lightLevel(ctx);
  const sag = span * 0.05;
  const cable = new GB();
  const pts: P3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push([-span / 2 + span * t, height - sag * 4 * t * (1 - t), 0]);
  }
  cable.color(0x1a1a1a).tube(pts, 0.012, 4);
  ctx.addStatic(cable.build(), ctx.mat('flat'), ctx.matrixAt());
  const b = new GB();
  const cols = [0xffd9a0, 0xffc46a, 0xfff0d0, 0xffb457];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    b.color(cols[i % cols.length], glow * 0.55).sphere(-span / 2 + span * t, height - sag * 4 * t * (1 - t) - 0.14, 0, 0.1, 0.12, 0.1, 6, 4);
  }
  ctx.addStatic(b.build(), ctx.mat('neon', { intensity: 1 }), ctx.matrixAt());
}

function easels(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const count = Math.max(1, Math.round(num(ctx, def, 'count', 2)));
  const rng = ctx.rng;
  const wood = k.g('wood');
  const dark = k.g('flat');
  for (let i = 0; i < count; i++) {
    const x = i * 1.9 + range(rng, -0.2, 0.2);
    wood.color(0x9a7449);
    for (const [lx, lz] of [[-0.35, -0.2], [0.35, -0.2], [0, 0.4]] as const) wood.rod([x + lx * 0.3, 1.75, 0], [x + lx, 0, lz], 0.025, 4);
    wood.boxB(x, 0.7, 0.02, 0.62, 0.04, 0.05);
    // canvas: frame + colourful paint blocks facing +Z
    dark.color(0xf2ecdc).boxB(x, 0.85, 0.02, 0.58, 0.78, 0.03);
    for (let b = 0; b < 6; b++) {
      dark.color(pick(rng, PAINT)).boxB(x - 0.2 + (b % 3) * 0.2, 1.0 + Math.floor(b / 3) * 0.28, 0.045, 0.17, 0.22, 0.01);
    }
    // stool + painter's crate
    dark.color(0x4a3a2b).cyl(x + 0.8, 0.46, 0.5, 0.17, 0.17, 0.05, 8);
    wood.color(0x8a6a44);
    for (const [lx, lz] of [[-0.1, -0.1], [0.1, 0.1], [-0.1, 0.1], [0.1, -0.1]] as const) wood.rod([x + 0.8 + lx, 0, 0.5 + lz], [x + 0.8 + lx * 1.4, 0.46, 0.5 + lz * 1.4], 0.015, 4);
  }
  k.flush();
}

// ───────────────────────────────────────────────────────────── Barge ──

function barge(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const L = num(ctx, def, 'length', 18);
  const hull = num(ctx, def, 'hull', 0x2d3f55);
  const rng = ctx.rng;
  const paint = k.g('paintedMetal');
  const wood = k.g('wood');
  const dark = k.g('flat');
  const facade = k.g('facade');
  const W = 3.4;
  paint.color(hull);
  paint.chamferBox(0, -0.5, 0, W, 1.55, L, 0.3);
  // sharp bow
  paint.quad([-W / 2, 0.05, L / 2], [W / 2, 0.05, L / 2], [W / 2 - 0.5, 0.05, L / 2 + 1.1], [-W / 2 + 0.5, 0.05, L / 2 + 1.1]);
  paint.quad([-W / 2 + 0.5, -0.45, L / 2 + 1.1], [W / 2 - 0.5, -0.45, L / 2 + 1.1], [W / 2, -0.45, L / 2], [-W / 2, -0.45, L / 2]);
  paint.quad([W / 2, -0.45, L / 2], [W / 2 - 0.5, -0.45, L / 2 + 1.1], [W / 2 - 0.5, 0.05, L / 2 + 1.1], [W / 2, 0.05, L / 2]);
  paint.quad([-W / 2 + 0.5, -0.45, L / 2 + 1.1], [-W / 2, -0.45, L / 2], [-W / 2, 0.05, L / 2], [-W / 2 + 0.5, 0.05, L / 2 + 1.1]);
  // white waterline stripe + red rubbing strake
  dark.color(0xe9e6dc).boxB(0, -0.02, 0, W + 0.02, 0.1, L - 0.4, 'yY');
  // deck
  wood.color(0xb79d78).boxB(0, 0.99, 0, W - 0.2, 0.05, L - 0.2, 'y');
  // hold coaming
  dark.color(0x20242a).boxB(0, 1.0, L * 0.12, 2.5, 0.55, L * 0.42);
  dark.color(0x3a3d44).boxB(0, 1.52, L * 0.12, 2.35, 0.06, L * 0.42 - 0.15);
  // wheelhouse at the stern
  const sz = -L / 2 + 3.2;
  paint.color(0xf1ede1).boxB(0, 1.0, sz, 2.9, 2.0, 5.0, 'y');
  dark.color(0x2c3038).boxB(0, 3.0, sz, 3.1, 0.12, 5.2);
  const u = FACADE_UV.rectGlassDark;
  facade.white();
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = sz - 1.6 + i * 1.6;
      const x = sx * 1.452;
      if (sx > 0) facade.quadUV([x, 1.6, z + 0.5], [x, 1.6, z - 0.5], [x, 2.6, z - 0.5], [x, 2.6, z + 0.5], u[0], u[1], u[2], u[3]);
      else facade.quadUV([x, 1.6, z - 0.5], [x, 1.6, z + 0.5], [x, 2.6, z + 0.5], [x, 2.6, z - 0.5], u[0], u[1], u[2], u[3]);
    }
  }
  // roof garden: pots and a chair
  for (let i = 0; i < 4; i++) {
    dark.color(0xb8683f).cyl(-0.9 + i * 0.6, 3.1, sz + range(rng, -1.5, 1.5), 0.17, 0.13, 0.28, 6);
    dark.color(0x3f7a3a).sphere(-0.9 + i * 0.6, 3.5, sz, 0.22, 0.2, 0.22, 6, 4);
  }
  // bow bollard + mooring ropes
  dark.color(0x15171a).cyl(0, 1.02, L / 2 - 0.5, 0.12, 0.1, 0.4, 6);
  dark.color(0x6a5a46).beam([0, 1.3, L / 2 - 0.5], [W / 2 + 0.6, 0.95, L / 2 - 1.4], 0.04, 0.04);
  // cargo: sand pile
  dark.color(0xc2a874).cyl(0, 1.5, L * 0.12, 1.0, 0.1, 0.8, 8);
  k.flush();
}

// ──────────────────────────────────────────────────────────── Bridge ──

function bridge(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const a = num(ctx, def, 'span', 12.2);
  const deckY = num(ctx, def, 'deckY', 8.6);
  const D = 9;
  const spring = 2.4;
  const apex = 6.8;
  const wallX = 26;
  const wall = k.g('plaster');
  const stone = k.g('stone');
  const road = k.g('asphalt');
  const iron = k.g('paintedMetal');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const dark = k.g('flat');
  const glow = lightLevel(ctx);
  const cream = 0xe0d2b4;

  const arc: [number, number][] = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const t = Math.PI - (i / N) * Math.PI; // from -a to +a
    arc.push([Math.cos(t) * a, spring + Math.sin(t) * (apex - spring)]);
  }
  // hole polygon: bottom edge + arc (clockwise handled by triangulation)
  const hole: [number, number][] = [[-a, 0.5], [a, 0.5], ...arc.slice().reverse()];
  const outline: [number, number][] = [[-wallX, 0.5], [wallX, 0.5], [wallX, deckY], [-wallX, deckY]];
  wall.color(cream);
  wall.poly(outline, D / 2, false, [hole]);
  wall.poly(outline, -D / 2, true, [hole]);
  // intrados (underside of the arch), vertical jambs
  stone.color(0xcdbd9b);
  for (let i = 0; i < N; i++) {
    const p = arc[i];
    const q = arc[i + 1];
    stone.quad([p[0], p[1], -D / 2], [q[0], q[1], -D / 2], [q[0], q[1], D / 2], [p[0], p[1], D / 2]);
  }
  stone.quad([-a, 0.5, D / 2], [-a, 0.5, -D / 2], [-a, spring, -D / 2], [-a, spring, D / 2]);
  stone.quad([a, 0.5, -D / 2], [a, 0.5, D / 2], [a, spring, D / 2], [a, spring, -D / 2]);
  // voussoir ring proud of the faces
  const band = 0.7;
  wall.color(0xf0e4c8);
  for (let i = 0; i < N; i++) {
    const p = arc[i];
    const q = arc[i + 1];
    const po: [number, number] = [p[0] * (1 + band / a), spring + (p[1] - spring) * (1 + band / (apex - spring))];
    const qo: [number, number] = [q[0] * (1 + band / a), spring + (q[1] - spring) * (1 + band / (apex - spring))];
    for (const [z, sgn] of [[D / 2 + 0.07, 1], [-D / 2 - 0.07, -1]] as const) {
      if (sgn > 0) wall.quad([p[0], p[1], z], [q[0], q[1], z], [qo[0], qo[1], z], [po[0], po[1], z]);
      else wall.quad([q[0], q[1], z], [p[0], p[1], z], [po[0], po[1], z], [qo[0], qo[1], z]);
    }
  }
  // string course, deck, parapets
  wall.color(0xf0e4c8).boxB(0, deckY - 0.5, 0, wallX * 2 + 0.2, 0.5, D + 0.5);
  road.color(0x55575c).boxB(0, deckY, 0, wallX * 2, 0.1, D - 0.2, 'y');
  stone.color(0xe0d2b4);
  for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) stone.boxB(0, deckY + 0.05, z, wallX * 2, 0.95, 0.4);
  // lamps on the parapet
  for (let i = -3; i <= 3; i++) {
    const x = i * 7.5;
    for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) {
      iron.color(0x1f3a2f).cyl(x, deckY + 1.0, z, 0.09, 0.06, 3.0, 6);
      neon.color(0xffd9a0, glow).sphere(x, deckY + 4.2, z, 0.28, 0.3, 0.28, 8, 6);
    }
  }
  // dark stains under the arch
  dark.color(0x3d3a34, 0.6).boxB(0, spring + (apex - spring) + 0.01, 0, 0.01, 0.01, 0.01);
  k.flush();
}

// ───────────────────────────────────────────────────────────── Tower ──

function tower(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const H = num(ctx, def, 'height', 200);
  const g = k.g('flat');
  const W0 = H * 0.2;
  const nLev = 16;
  const half = (t: number): number => 1.2 + (W0 - 1.2) * Math.pow(1 - t, 2.4);
  const levels: number[] = [];
  for (let i = 0; i <= nLev; i++) levels.push(i / nLev);
  const col = (t: number): number => (t < 0.5 ? 0x7a6247 : 0x86694c);
  const corners = (t: number): P3[] => {
    const w = half(t);
    const y = t * H;
    return [
      [-w, y, -w],
      [w, y, -w],
      [w, y, w],
      [-w, y, w],
    ];
  };
  for (let i = 0; i < nLev; i++) {
    const t0 = levels[i];
    const t1 = levels[i + 1];
    const c0 = corners(t0);
    const c1 = corners(t1);
    const r = H * 0.0055 * (1.4 - t0);
    g.color(col(t0));
    for (let c = 0; c < 4; c++) g.rod(c0[c], c1[c], r * 1.5, 4);
    for (let c = 0; c < 4; c++) {
      const n = (c + 1) % 4;
      // horizontal at the top of this section and X braces across the face
      g.rod(c1[c], c1[n], r * 0.8, 4);
      g.rod(c0[c], c1[n], r * 0.55, 4);
      g.rod(c0[n], c1[c], r * 0.55, 4);
    }
  }
  // platforms
  for (const t of [0.26, 0.56, 0.82]) {
    const w = half(t) + 0.6;
    g.color(0x5b4833).boxB(0, t * H - 0.4, 0, w * 2, H * 0.012, w * 2);
    g.color(0x8f7352).boxB(0, t * H - 0.4 + H * 0.012, 0, w * 2 - 0.4, 0.2, w * 2 - 0.4, 'y');
  }
  // great arches between the legs
  for (let c = 0; c < 4; c++) {
    const yaw = (c * Math.PI) / 2;
    const w0 = half(0);
    const w1 = half(0.26);
    g.push().rotY(yaw);
    const pts: P3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const ang = t * Math.PI;
      pts.push([-w0 * 0.8 * Math.cos(ang) * 1, H * 0.01 + Math.sin(ang) * (H * 0.155), w0 + (w1 - w0) * (H * 0.01 + Math.sin(ang) * H * 0.155) / (0.26 * H)]);
    }
    g.color(0x7a6247).tube(pts, H * 0.0045, 4);
    g.pop();
  }
  // spire
  g.color(0x86694c).cyl(0, H, 0, 1.0, 0.1, H * 0.06, 6);
  g.color(0xffe0a0).sphere(0, H * 1.06, 0, 0.5, 0.5, 0.5, 5, 3);
  k.flush();
}

// ─────────────────────────────────────────────────────────── Basilica ──

function basilica(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const sc = num(ctx, def, 'scale', 1);
  const rng = ctx.rng;
  const hill = k.g('flat');
  const lit = k.g('neon', undefined, { intensity: 0.8 });
  const litDim = k.g('neon', undefined, { intensity: 0.5 });
  const glowG = k.g('neon', undefined, { intensity: 1 });
  const dark = k.g('flat');
  void sc;
  // hill: wide hemisphere under the building, with lit windows of houses on the slope
  const hy = 42;
  const hv = hill.vertexCount;
  hill.color(0x1c3524).sphere(0, -hy, 0, 120, hy, 70, 18, 7, 0.5, 1);
  hill.shadeBy(hv, (_x, y) => 0.3 + 0.7 * Math.min(1, (y + hy) / hy));
  dark.color(0x6c6a66).boxB(0, -7, -4, 76, 7, 40);
  dark.color(0x8d8a82).boxB(0, -0.4, -8, 70, 0.4, 32);
  for (let i = 0; i < 70; i++) {
    const ang = range(rng, -1.3, 1.3);
    const rr = range(rng, 0.35, 0.95);
    const x = Math.sin(ang) * 120 * rr;
    const z = -Math.cos(ang) * 70 * rr - 6;
    const y = hy * Math.sqrt(Math.max(0, 1 - (x / 120) ** 2 - (z / 70) ** 2)) - hy;
    if (y < -hy + 6 || y > -8) continue;
    (rng() < 0.5 ? litDim : glowG).color(pick(rng, [0xffc46a, 0xffb457, 0xffd58a]), 1).boxB(x, y, z, 1.4, 1.0, 0.1);
  }
  // main hall and front portico
  const white = 0xf2ecdc;
  const body = (cx: number, cz: number, w: number, d: number, h: number, c = white): void => {
    const v = lit.vertexCount;
    lit.color(c).boxB(cx, 0, cz, w, h, d, 'y');
    lit.shadeBy(v, (_x, y) => 0.7 + 0.3 * Math.min(1, y / h));
  };
  body(0, 0, 46, 34, 17);
  body(0, -19, 22, 8, 12);
  // arches in the front (dark openings)
  dark.color(0x2c2a2a);
  for (const x of [-8, 0, 8]) dark.boxB(x, 0.2, -23.05, 4.4, 7.5, 0.1);
  for (const x of [-8, 0, 8]) dark.sphere(x, 7.7, -23.05, 2.2, 1.6, 0.1, 8, 4, 0.5, 1);
  for (let i = -9; i <= 9; i++) dark.color(0x9a948a).boxB(i * 2.2, 0, -23.2, 0.5, 13, 0.4);
  // domes: ovoid profile, lantern on top
  const dome = (cx: number, cz: number, r: number, h: number, base: number, drumH: number, seg: number): void => {
    litDim.color(white, 0.95).cyl(cx, base, cz, r * 1.04, r * 1.04, drumH, seg);
    const prof: [number, number][] = [
      [r * 1.04, base + drumH],
      [r * 1.0, base + drumH + h * 0.12],
      [r * 0.86, base + drumH + h * 0.4],
      [r * 0.6, base + drumH + h * 0.72],
      [r * 0.3, base + drumH + h * 0.93],
      [r * 0.12, base + drumH + h * 1.0],
    ];
    lit.color(white, 1.05).lathe(cx, cz, prof, seg);
    // lantern
    const ly = base + drumH + h * 1.0;
    litDim.color(white, 0.95).cyl(cx, ly, cz, r * 0.2, r * 0.17, r * 0.55, 8);
    lit.color(white).lathe(cx, cz, [[r * 0.2, ly + r * 0.55], [r * 0.16, ly + r * 0.8], [r * 0.06, ly + r * 1.05], [0, ly + r * 1.2]], 8);
    dark.color(0x3a3834);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      dark.boxB(cx + Math.sin(a) * r * 1.06, base + 0.5, cz + Math.cos(a) * r * 1.06, 0.7, drumH - 1.2, 0.5, '');
    }
  };
  dome(0, 0, 11, 21, 17, 8, 20);
  dome(-17, -8, 4.6, 9, 17, 4, 12);
  dome(17, -8, 4.6, 9, 17, 4, 12);
  dome(-17, 9, 4.6, 9, 17, 4, 12);
  dome(17, 9, 4.6, 9, 17, 4, 12);
  dome(0, -19, 5.2, 10, 12, 4, 12);
  // campanile behind
  body(-22, 20, 7, 7, 32, white);
  dome(-22, 20, 3.4, 6, 32, 3, 10);
  // base glow so the whole group blooms softly
  void rng;
  k.flush(ctx.matrixAt());
}

registerProp('france.haussmannRow', haussmannRow);
registerProp('france.montmartreRow', montmartreRow);
registerProp('france.cafe', cafe);
registerProp('france.cabaret', cabaret);
registerProp('france.bouquinistes', bouquinistes);
registerProp('france.lampPost', lampPost);
registerProp('france.stringLights', stringLights);
registerProp('france.easels', easels);
registerProp('france.barge', barge);
registerProp('france.bridge', bridge);
registerProp('france.tower', tower);
registerProp('france.basilica', basilica);
