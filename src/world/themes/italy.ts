/**
 * Theme 'italy' — Venice.
 *   italy.palazzoRow  { bays=3, bayW=5.6, floors=3, depth=9, palette=-1 }  Venetian palazzi: ochre / terracotta / pink plaster,
 *       gothic pointed windows with white stone frames, green shutters, balconies with flowers, water doors with steps.
 *       Row along local +X, facade faces local +Z (z = 0 is the facade plane).
 *   italy.arcadeRow  { bays=4, bayW=4.4, floors=2, depth=9 }   long white-stone arcades (Procuratie), warm lit arches.
 *   italy.gondola    { len=10.4 }   black gondola with gondolier, along local Z.
 *   italy.poleCluster { count=3 }   striped mooring poles (briccole).
 *   italy.footbridge { span=16.8, width=3.6 }  stone arched bridge across the canal (axis = local X, clearance 4.4 m).
 *   italy.campanile  { height=60, width=9 }    brick bell tower with a pointed green spire.
 *   italy.basilica   { width=50 }              San Marco style basilica: gold portals, five domes with lanterns.
 *   italy.lampPost   { height=4.6 }            cast lamp post with globes.
 *   italy.cafeSet    { tables=3, spacing=2.6 } café tables and chairs.
 *   italy.passerella { length=30, width=1.3, height=0.5 }  raised duckboard walkway on trestles (along local Z).
 *   italy.flagMasts  { count=3, span=32, height=16 }  tall flagpoles with red banners (along local X).
 */
import type { PropContext, PropDef } from '../../types';
import { FACADE_UV } from '../decals';
import { GB } from '../geo';
import { registerProp } from '../props/registry';
import { Kit, lightLevel, num, pick, range } from '../props/common/util';

type Pt = [number, number];

const PALETTES: readonly (readonly [number, number])[] = [
  [0xdba24c, 0xf6eedc], // ochre
  [0xc9653f, 0xf6eadb], // terracotta
  [0xe3a29b, 0xfff3ea], // pink
  [0xe9cf98, 0xfffaf0], // cream
  [0xb9553d, 0xf3e6d3], // rust red
  [0xe58f6e, 0xfff1e6], // salmon
  [0xd9b25e, 0xf8f0dd], // sand yellow
];

/** Round arch (or arched opening) outline, CCW. */
function archOutline(cx: number, y0: number, w: number, h: number, seg = 8): Pt[] {
  const r = w / 2;
  const cy = y0 + h - r;
  const out: Pt[] = [
    [cx - r, y0],
    [cx + r, y0],
  ];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Gothic pointed arch outline (apex is 0.866 w above the springing), CCW. */
function pointedOutline(cx: number, y0: number, w: number, h: number, seg = 4): Pt[] {
  const spring = y0 + h - 0.866 * w;
  const out: Pt[] = [
    [cx - w / 2, y0],
    [cx + w / 2, y0],
  ];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * (Math.PI / 3);
    out.push([cx - w / 2 + Math.cos(a) * w, spring + Math.sin(a) * w]);
  }
  for (let i = 1; i <= seg; i++) {
    const a = Math.PI * (2 / 3) + (i / seg) * (Math.PI / 3);
    out.push([cx + w / 2 + Math.cos(a) * w, spring + Math.sin(a) * w]);
  }
  return out;
}

// ─────────────────────────────────────────────────────────── palazzi ──

function palazzoRow(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const bays = Math.max(1, Math.round(num(ctx, def, 'bays', 3)));
  const bayW = num(ctx, def, 'bayW', 5.6);
  const baseFloors = Math.max(2, Math.round(num(ctx, def, 'floors', 3)));
  const depth = num(ctx, def, 'depth', 9);
  const forced = num(ctx, def, 'palette', -1);
  const rng = ctx.rng;
  const groundH = 3.4;
  const floorH = 3.5;
  const x0 = (-bays * bayW) / 2;

  const wall = k.g('plaster');
  const brick = k.g('brick');
  const roof = k.g('roofTile');
  const facade = k.g('facade');
  const dark = k.g('flat');
  const metal = k.g('paintedMetal');
  const stone = k.g('stone');

  for (let b = 0; b < bays; b++) {
    const [wc, tc] = forced >= 0 ? PALETTES[forced % PALETTES.length] : pick(rng, PALETTES);
    const bx = x0 + b * bayW;
    const cx = bx + bayW / 2;
    const fl = baseFloors + (rng() < 0.3 ? 1 : 0) - (rng() < 0.2 ? 1 : 0);
    const floors = Math.max(2, fl);
    const h = groundH + floors * floorH;
    const shut = rng() < 0.75 ? 3 : 1; // green or brown shutters

    // body
    wall.color(wc, range(rng, 0.94, 1.04));
    wall.boxB(cx, 0, -depth / 2, bayW, h, depth, 'y');
    // damp, algae-stained waterline band
    wall.color(0x55604a);
    wall.quad([bx, 0, 0.012], [bx + bayW, 0, 0.012], [bx + bayW, 0.75, 0.012], [bx, 0.75, 0.012]);
    wall.color(0x86795e);
    wall.quad([bx, 0.75, 0.012], [bx + bayW, 0.75, 0.012], [bx + bayW, 1.25, 0.012], [bx, 1.25, 0.012]);

    // peeling plaster: exposed brick patches
    const patches = 2 + Math.floor(rng() * 3);
    for (let p = 0; p < patches; p++) {
      const px = bx + range(rng, 0.5, bayW - 1.5);
      const py = range(rng, 1.3, h - 2.4);
      const pw = range(rng, 0.7, 1.3);
      const ph = range(rng, 0.6, 1.2);
      brick.color(0xc47a5c, range(rng, 0.8, 1.0));
      brick.quad(
        [px + range(rng, -0.1, 0.1), py, 0.014],
        [px + pw, py + range(rng, 0, 0.2), 0.014],
        [px + pw - range(rng, 0, 0.3), py + ph, 0.014],
        [px + range(rng, 0, 0.2), py + ph - range(rng, 0, 0.2), 0.014],
      );
    }

    // quoins + string courses + cornice (white Istrian stone)
    wall.color(tc);
    for (const qx of [bx + 0.15, bx + bayW - 0.15]) wall.boxB(qx, 0, 0.05, 0.3, h, 0.1);
    for (let f = 1; f <= floors; f++) wall.boxB(cx, groundH + (f - 1) * floorH - 0.1, 0.07, bayW, 0.14, 0.14);
    wall.boxB(cx, h - 0.35, 0.3, bayW, 0.4, 0.62);
    wall.boxB(cx, h + 0.05, 0.12, bayW, 0.14, 0.3);

    // water door: pointed stone frame + wooden door + steps down to the fondamenta
    const dw = 1.5;
    wall.color(tc).poly(pointedOutline(cx, 0.32, dw + 0.5, 3.0), 0.03);
    dark.color(0x24201b).poly(pointedOutline(cx, 0.32, dw, 2.7), 0.06);
    facade.white().quadUV([cx - dw / 2, 0.32, 0.08], [cx + dw / 2, 0.32, 0.08], [cx + dw / 2, 2.4, 0.08], [cx - dw / 2, 2.4, 0.08], ...FACADE_UV.doorWood);
    for (let s = 0; s < 3; s++) stone.color(0xd7cdb7).boxB(cx, 0, 0.18 + (2 - s) * 0.3 + 0.12, dw + 0.8 - s * 0.1, 0.1 + s * 0.1, 0.3);

    // ground floor: small barred windows with flower boxes
    for (const wx of [cx - 1.95, cx + 1.95]) {
      facade.white().quadUV([wx - 0.4, 1.4, 0.03], [wx + 0.4, 1.4, 0.03], [wx + 0.4, 2.9, 0.03], [wx - 0.4, 2.9, 0.03], ...FACADE_UV.rectShutter);
      wall.color(tc).boxB(wx, 1.28, 0.1, 1.1, 0.12, 0.26);
      dark.color(0x3f7a3a).boxB(wx, 1.4, 0.2, 0.9, 0.18, 0.22);
      dark.color(rng() < 0.5 ? 0xd8334a : 0xf27ca8).boxB(wx + range(rng, -0.2, 0.2), 1.58, 0.2, 0.6, 0.12, 0.18);
    }

    // upper floors
    for (let f = 0; f < floors; f++) {
      const y = groundH + f * floorH + 0.55;
      if (f === 1) {
        // piano nobile: triple pointed window (trifora) over a balcony
        const ww = 0.9;
        const wh = 2.3;
        for (const dx of [-1.25, 0, 1.25]) {
          wall.color(tc).poly(pointedOutline(cx + dx, y, ww + 0.34, wh + 0.2), 0.03);
          dark.color(0x24323a).poly(pointedOutline(cx + dx, y + 0.05, ww, wh), 0.06);
        }
        wall.color(tc);
        for (const dx of [-0.62, 0.62]) wall.boxB(cx + dx, y, 0.08, 0.12, wh - 0.6, 0.14);
        // balcony slab + balustrade + flower boxes
        wall.boxB(cx, y - 0.12, 0.45, 3.9, 0.14, 0.9);
        for (let i = 0; i <= 12; i++) wall.boxB(cx - 1.8 + (i * 3.6) / 12, y + 0.02, 0.85, 0.07, 0.75, 0.07);
        wall.boxB(cx, y + 0.77, 0.85, 3.9, 0.08, 0.14);
        dark.color(0x3a7a3a).boxB(cx - 0.8, y + 0.85, 0.85, 1.3, 0.2, 0.22);
        dark.color(0xe0384a).boxB(cx - 0.8, y + 1.03, 0.85, 1.1, 0.12, 0.18);
        dark.color(0x3a7a3a).boxB(cx + 0.9, y + 0.85, 0.85, 1.0, 0.2, 0.22);
        dark.color(0xf5c542).boxB(cx + 0.9, y + 1.03, 0.85, 0.8, 0.12, 0.18);
      } else {
        for (const wx of [cx - 1.4, cx + 1.4]) {
          const ww = 0.95;
          const wh = 2.2;
          wall.color(tc).poly(pointedOutline(wx, y, ww + 0.36, wh + 0.2), 0.03);
          dark.color(0x24323a).poly(pointedOutline(wx, y + 0.05, ww, wh), 0.06);
          wall.color(tc).boxB(wx, y - 0.1, 0.12, ww + 0.5, 0.12, 0.28);
          // open shutters on both sides
          const lf = FACADE_UV.leaf[shut];
          facade.white().quadUV([wx - ww / 2 - 0.5, y, 0.08], [wx - ww / 2 - 0.03, y, 0.08], [wx - ww / 2 - 0.03, y + 1.85, 0.08], [wx - ww / 2 - 0.5, y + 1.85, 0.08], ...lf);
          facade.quadUV([wx + ww / 2 + 0.03, y, 0.08], [wx + ww / 2 + 0.5, y, 0.08], [wx + ww / 2 + 0.5, y + 1.85, 0.08], [wx + ww / 2 + 0.03, y + 1.85, 0.08], ...lf);
          if (f === floors - 1 && rng() < 0.5) {
            // tiny railing + flowers
            metal.color(0x2b2f2a).boxB(wx, y - 0.05, 0.2, ww + 0.5, 0.06, 0.06);
            dark.color(0xe65a6d).boxB(wx, y + 0.02, 0.2, 0.7, 0.14, 0.18);
          }
        }
      }
    }

    // roof: terracotta, low pitch, with eaves; Venetian flared chimney
    const ry0 = h + 0.15;
    const ry1 = h + 1.7;
    roof.color(0xc2653f, range(rng, 0.85, 1.05));
    roof.quad([bx - 0.1, ry0 - 0.05, 0.5], [bx + bayW + 0.1, ry0 - 0.05, 0.5], [bx + bayW + 0.1, ry1, -depth / 2], [bx - 0.1, ry1, -depth / 2]);
    roof.quad([bx + bayW + 0.1, ry0 - 0.05, -depth - 0.2], [bx - 0.1, ry0 - 0.05, -depth - 0.2], [bx - 0.1, ry1, -depth / 2], [bx + bayW + 0.1, ry1, -depth / 2]);
    wall.color(wc, 0.8).tri([bx, ry0 - 0.05, 0.4], [bx, ry1, -depth / 2], [bx, ry0 - 0.05, -depth - 0.2]);
    wall.tri([bx + bayW, ry0 - 0.05, -depth - 0.2], [bx + bayW, ry1, -depth / 2], [bx + bayW, ry0 - 0.05, 0.4]);
    if (rng() < 0.7) {
      const chx = cx + range(rng, -1.5, 1.5);
      brick.color(0xd9d0bd).boxB(chx, ry1 - 0.4, -depth * 0.35, 0.5, 1.5, 0.5);
      brick.color(0xe6dcc6).cyl(chx, ry1 + 1.0, -depth * 0.35, 0.22, 0.5, 0.6, 8, true);
    }
    // wooden altana (rooftop terrace) on some
    if (rng() < 0.25) {
      dark.color(0x7a5a3a).boxB(cx - 1, ry1 - 0.2, -depth * 0.55, 2.4, 0.12, 2.0);
      for (const dx of [-1.1, 1.1]) for (const dz of [-0.9, 0.9]) dark.boxB(cx - 1 + dx, ry1 - 0.2, -depth * 0.55 + dz, 0.08, 2.0, 0.08);
      dark.color(0xb98a52).boxB(cx - 1, ry1 + 1.8, -depth * 0.55, 2.7, 0.1, 2.3);
    }
  }
  k.flush();
}

// ─────────────────────────────────────────────────────────── arcades ──

function arcadeRow(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const bays = Math.max(1, Math.round(num(ctx, def, 'bays', 4)));
  const bayW = num(ctx, def, 'bayW', 4.4);
  const upper = Math.max(1, Math.round(num(ctx, def, 'floors', 2)));
  const depth = num(ctx, def, 'depth', 9);
  const groundH = 5.4;
  const floorH = 3.5;
  const h = groundH + upper * floorH;
  const total = bays * bayW;
  const x0 = -total / 2;
  const x1 = total / 2;
  const openW = bayW - 1.2;
  const openH = 4.3;

  const wall = k.g('plaster');
  const stone = k.g('stone');
  const dark = k.g('flat');
  const facade = k.g('facade');
  const rng = ctx.rng;
  const stoneCol = 0xf1e7d0;
  const trim = 0xfbf6ea;

  // front wall with arched openings
  const holes: Pt[][] = [];
  for (let b = 0; b < bays; b++) holes.push(archOutline(x0 + bayW * (b + 0.5), 0, openW, openH, 8));
  wall.color(stoneCol);
  wall.poly(
    [
      [x0, 0],
      [x1, 0],
      [x1, h],
      [x0, h],
    ],
    0,
    false,
    holes,
  );
  // reveals + dark interior
  for (let b = 0; b < bays; b++) {
    const cx = x0 + bayW * (b + 0.5);
    wall.color(trim, 0.92).prism(archOutline(cx, 0, openW, openH, 8), -0.9, 0, false, false, true, true);
    dark.color(0x2b2420);
    dark.poly(archOutline(cx, 0, openW, openH, 8), -0.9, false);
    // arch moulding
    const r = openW / 2 + 0.22;
    const cy = openH - openW / 2;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.1]);
    }
    wall.color(trim).tube(pts, 0.13, 5, { caps: 'none' });
    // column pilasters on piers
    wall.color(trim);
    wall.boxB(x0 + bayW * b, 0, 0.12, 0.34, openH - openW / 2 + 0.4, 0.24);
  }
  wall.boxB(x1, 0, 0.12, 0.34, openH, 0.24);
  // warm lit shop interiors
  const g = lightLevel(ctx);
  const glow = new GB();
  for (let b = 0; b < bays; b++) {
    const cx = x0 + bayW * (b + 0.5);
    glow.color(rng() < 0.5 ? 0xffb868 : 0xffd9a0, g * 0.28).poly(archOutline(cx, 0.2, openW * 0.8, openH * 0.7, 6), -0.85, false);
  }
  ctx.addStatic(glow.build(), ctx.mat('neon', { intensity: 1 }), ctx.matrixAt());

  // body, cornices, balustrade
  wall.color(stoneCol, 0.9).boxB((x0 + x1) / 2, 0, -depth / 2, total, h, depth, 'yZ');
  wall.color(trim);
  wall.boxB((x0 + x1) / 2, groundH - 0.2, 0.2, total, 0.5, 0.5);
  for (let f = 1; f < upper; f++) wall.boxB((x0 + x1) / 2, groundH + f * floorH - 0.1, 0.1, total, 0.16, 0.2);
  wall.boxB((x0 + x1) / 2, h - 0.2, 0.3, total, 0.4, 0.6);
  wall.boxB((x0 + x1) / 2, h + 0.2, 0.05, total, 0.7, 0.3);
  for (let i = 0; i <= bays * 3; i++) wall.boxB(x0 + (i * total) / (bays * 3), h + 0.2, 0.12, 0.34, 1.4, 0.34);

  // upper windows
  for (let f = 0; f < upper; f++) {
    const y = groundH + f * floorH + 0.45;
    for (let b = 0; b < bays; b++) {
      const cx = x0 + bayW * (b + 0.5);
      const w = 1.15;
      const wh = 2.3;
      wall.color(trim).poly(archOutline(cx, y - 0.12, w + 0.4, wh + 0.2, 6), 0.03);
      facade.white().quadUV([cx - w / 2, y, 0.06], [cx + w / 2, y, 0.06], [cx + w / 2, y + wh, 0.06], [cx - w / 2, y + wh, 0.06], ...FACADE_UV.archGlass);
      wall.color(trim).boxB(cx, y - 0.2, 0.15, w + 0.6, 0.12, 0.3);
    }
  }
  k.flush();
}

// ───────────────────────────────────────────────────────── gondola ──

function gondola(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const len = num(ctx, def, 'len', 10.4);
  const L = len / 2;
  const hull = k.g('plasticGloss', undefined, { side: 'double' });
  const flat = k.g('flat');
  const metal = k.g('metal');
  const fabric = k.g('fabric');
  const N = 22;
  const sec: { z: number; hw: number; yt: number; yb: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    const at = Math.abs(t);
    sec.push({ z: t * L, hw: 0.04 + 0.66 * (1 - 0.88 * Math.pow(at, 3.2)), yt: 0.34 + 0.95 * Math.pow(at, 5) + (t > 0 ? 0.1 * Math.pow(at, 5) : 0), yb: -0.2 + 0.55 * Math.pow(at, 3) });
  }
  hull.color(0x121214);
  for (let i = 0; i < N; i++) {
    const a = sec[i];
    const b = sec[i + 1];
    hull.quad([0, a.yb, a.z], [a.hw, a.yt, a.z], [b.hw, b.yt, b.z], [0, b.yb, b.z]);
    hull.quad([0, a.yb, a.z], [0, b.yb, b.z], [-b.hw, b.yt, b.z], [-a.hw, a.yt, a.z]);
    // gold gunwale line
    flat.color(0xc9a13a);
    flat.quad([a.hw - 0.01, a.yt + 0.02, a.z], [a.hw + 0.02, a.yt + 0.02, a.z], [b.hw + 0.02, b.yt + 0.02, b.z], [b.hw - 0.01, b.yt + 0.02, b.z]);
    flat.quad([-a.hw - 0.02, a.yt + 0.02, a.z], [-a.hw + 0.01, a.yt + 0.02, a.z], [-b.hw + 0.01, b.yt + 0.02, b.z], [-b.hw - 0.02, b.yt + 0.02, b.z]);
  }
  // floor boards
  flat.color(0x3a2a20).boxB(0, 0.1, 0, 0.9, 0.05, len * 0.7);
  // red velvet seat
  fabric.color(0x8c1522);
  fabric.boxB(0, 0.18, 0.5, 0.95, 0.3, 0.7);
  fabric.boxB(0, 0.4, 0.9, 0.95, 0.55, 0.16);
  flat.color(0xc9a13a).boxB(0, 0.95, 0.9, 0.9, 0.06, 0.18);
  // iron ferro (prow comb) and stern post
  const bow = sec[N];
  metal.color(0xd8d8d0);
  metal.boxB(0, bow.yt + 0.05, bow.z - 0.12, 0.05, 0.85, 0.3);
  for (let i = 0; i < 5; i++) metal.boxB(0, bow.yt + 0.1 + i * 0.16, bow.z + 0.05, 0.05, 0.1, 0.12);
  metal.boxB(0, sec[0].yt, sec[0].z + 0.1, 0.06, 0.5, 0.12);
  // gondolier
  const gz = -L * 0.72;
  const gy = 0.5;
  flat.color(0x1b1b1f);
  flat.cyl(-0.1, gy, gz, 0.07, 0.08, 0.85, 6);
  flat.cyl(0.1, gy, gz, 0.07, 0.08, 0.85, 6);
  flat.color(0xf2f2f2).cyl(0, gy + 0.85, gz, 0.17, 0.17, 0.5, 8);
  flat.color(0x1f3d8a).cyl(0, gy + 0.98, gz, 0.175, 0.175, 0.09, 8, false);
  flat.cyl(0, gy + 1.2, gz, 0.175, 0.175, 0.09, 8, false);
  flat.color(0xe8b894).sphere(0, gy + 1.52, gz, 0.1, 0.12, 0.1, 8, 5);
  flat.color(0xe2c27a).cyl(0, gy + 1.6, gz, 0.26, 0.24, 0.04, 10);
  flat.color(0xc92b2b).cyl(0, gy + 1.62, gz, 0.11, 0.11, 0.08, 8);
  // oar through the forcola
  flat.color(0x6b4a2e);
  flat.rod([0.5, gy + 0.9, gz - 0.25], [1.3, -0.5, gz + 1.8], 0.03, 5);
  flat.boxR(1.32, -0.45, gz + 1.9, 0.18, 0.05, 0.7, 0.3);
  flat.boxB(0.5, 0.5, gz, 0.12, 0.5, 0.1);
  k.flush();
}

// ───────────────────────────────────────────────────── mooring poles ──

function poleCluster(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const count = Math.max(1, Math.round(num(ctx, def, 'count', 3)));
  const g = k.g('flat');
  const rng = ctx.rng;
  const pal: [number, number][] = [
    [0x1f4f9a, 0xf4f1e6],
    [0xb81f2d, 0xf4f1e6],
    [0x1d6b45, 0xe9d9a8],
  ];
  for (let i = 0; i < count; i++) {
    const [c1, c2] = pick(rng, pal);
    const ox = (i - (count - 1) / 2) * 0.55;
    const lean = range(rng, -0.05, 0.05);
    const top = 2.5 + range(rng, 0, 0.4);
    const segs = 7;
    g.push().translate(ox, 0, 0).rotZ(lean);
    for (let s = 0; s < segs; s++) {
      const y0 = -1.2 + (s * (top + 1.2)) / segs;
      g.color(s % 2 ? c2 : c1).cyl(0, y0, 0, 0.13, 0.13, (top + 1.2) / segs + 0.005, 8, false);
    }
    g.color(0xc9a13a).cyl(0, top, 0, 0.14, 0.1, 0.08, 8, true);
    g.sphere(0, top + 0.12, 0, 0.1, 0.1, 0.1, 8, 4);
    g.pop();
  }
  // tying rope + iron ring hint
  if (count > 1) {
    g.color(0xb8a27a).rod([-(count - 1) * 0.275, 1.3, 0], [(count - 1) * 0.275, 1.25, 0], 0.035, 5);
  }
  k.flush();
}

// ──────────────────────────────────────────────────────── footbridge ──

function footbridge(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const span = num(ctx, def, 'span', 16.8);
  const width = num(ctx, def, 'width', 3.6);
  const L = span / 2;
  const stone = k.g('stone');
  const plaster = k.g('plaster');
  const wallG = k.g('brick');
  // profile in (x, y): water level = 0, quay top = 0.9, clearance 4.4 m at the middle
  const top = (x: number): number => 1.3 + 3.9 * (1 - Math.pow(x / L, 2));
  const arcR = 7.0;
  const arcBase = 0.6;
  const arcTop = 4.4;
  const pts: Pt[] = [[-L, 0.4]];
  const n = 18;
  pts.push([-arcR, 0.4]);
  for (let i = 0; i <= n; i++) {
    const x = -arcR + (2 * arcR * i) / n;
    pts.push([x, arcBase + (arcTop - arcBase) * Math.sqrt(Math.max(0, 1 - Math.pow(x / arcR, 2)))]);
  }
  pts.push([arcR, 0.4], [L, 0.4]);
  for (let i = 12; i >= 0; i--) {
    const x = -L + (2 * L * i) / 12;
    pts.push([x, top(x)]);
  }
  // CCW outline needed: bottom left→right then top right→left (as built, i went 12..0 = right→left)
  stone.color(0xe5dcc6).prism(pts, -width / 2, width / 2, true, true, true, false);
  // parapets along the curve
  for (const zz of [-width / 2 + 0.14, width / 2 - 0.14]) {
    const par: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = -L + (2 * L * i) / 12;
      par.push([x, top(x) + 0.02]);
    }
    for (let i = 12; i >= 0; i--) {
      const x = -L + (2 * L * i) / 12;
      par.push([x, top(x) + 0.6]);
    }
    plaster.color(0xf3ecdc).prism(par.slice(0, 13).concat(par.slice(13)), zz - 0.14, zz + 0.14, true, true, true, false);
  }
  // treads: thin white stone strips across the deck
  for (let i = 1; i < 12; i++) {
    const x = -L + (2 * L * i) / 12;
    const xb = -L + (2 * L * (i + 0.12)) / 12;
    wallG.color(0xf4efe2).quad([x, top(x) + 0.02, -width / 2 + 0.3], [x, top(x) + 0.02, width / 2 - 0.3], [xb, top(xb) + 0.02, width / 2 - 0.3], [xb, top(xb) + 0.02, -width / 2 + 0.3]);
  }
  // keystone
  plaster.color(0xfaf5e8).boxB(0, arcTop - 0.1, 0, 0.6, 0.45, width + 0.1);
  k.flush();
}

// ──────────────────────────────────────────────────────── campanile ──

function campanile(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const H = num(ctx, def, 'height', 60);
  const W = num(ctx, def, 'width', 9);
  const brick = k.g('brick');
  const stone = k.g('plaster');
  const dark = k.g('flat');
  const green = k.g('flat');
  const gold = k.g('flat', undefined, { emissive: 0x6a4a10, emissiveIntensity: 0.6 });
  const shaftH = H * 0.7;
  const bel0 = shaftH;
  const belH = H * 0.1;
  const attic = H * 0.045;
  const spireH = H * 0.155;
  const hw = W / 2;
  // brick shaft with vertical pilaster strips + a few white bands
  brick.color(0xb5573c).boxB(0, 0, 0, W, shaftH, W);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) brick.color(0xa24a33).boxB(sx * (hw - 0.2), 0, sz * (hw - 0.2), 0.7, shaftH, 0.7);
  for (let i = 1; i <= 3; i++) stone.color(0xf0e8d6).boxB(0, (shaftH * i) / 4, 0, W + 0.3, 0.5, W + 0.3);
  // narrow slit windows
  dark.color(0x2a2018);
  for (const side of [0, 1, 2, 3]) {
    dark.push().rotY((side * Math.PI) / 2);
    for (const y of [shaftH * 0.2, shaftH * 0.45, shaftH * 0.62]) dark.boxB(0, y, hw + 0.03, 0.7, 2.2, 0.06);
    dark.pop();
  }
  // belfry: dark interior, four stone piers per face, arch openings
  stone.color(0xf0e8d6).boxB(0, bel0, 0, W + 0.6, 0.5, W + 0.6);
  dark.color(0x2b2218).boxB(0, bel0 + 0.5, 0, W - 0.8, belH, W - 0.8);
  stone.color(0xf4eddb);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) stone.boxB(sx * (hw - 0.3), bel0 + 0.5, sz * (hw - 0.3), 0.9, belH, 0.9);
  for (const t of [-0.33, 0.33]) {
    for (const sg of [-1, 1]) {
      stone.boxB(t * W, bel0 + 0.5, sg * (hw - 0.2), 0.5, belH, 0.4);
      stone.boxB(sg * (hw - 0.2), bel0 + 0.5, t * W, 0.4, belH, 0.5);
    }
  }
  // lintel course above openings
  stone.boxB(0, bel0 + 0.5 + belH * 0.72, 0, W + 0.2, belH * 0.28, W + 0.2);
  // attic with a gold-framed lion panel hint
  const ay = bel0 + 0.5 + belH;
  stone.color(0xf2ead8).boxB(0, ay, 0, W - 0.5, attic, W - 0.5);
  stone.color(0xf6efdf).boxB(0, ay + attic, 0, W + 0.4, 0.4, W + 0.4);
  gold.color(0xe0b040);
  for (const side of [0, 1, 2, 3]) {
    gold.push().rotY((side * Math.PI) / 2);
    gold.boxB(0, ay + 0.35, hw - 0.2, 1.6, attic * 0.55, 0.08);
    gold.pop();
  }
  // pointed green pyramid spire
  const sy = ay + attic + 0.4;
  green.color(0x4f9f8c);
  green.push().rotY(Math.PI / 4);
  green.cyl(0, sy, 0, hw * 1.28, 0.05, spireH, 4, false, true);
  green.pop();
  // golden angel on the tip
  gold.color(0xf0c04a);
  gold.cyl(0, sy + spireH, 0, 0.35, 0.05, 1.4, 6, false);
  gold.sphere(0, sy + spireH + 1.7, 0, 0.35, 0.55, 0.3, 6, 4);
  gold.boxB(0, sy + spireH + 1.2, 0, 2.2, 0.08, 0.12);
  k.flush();
}

// ───────────────────────────────────────────────────────── basilica ──

function basilica(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const W = num(ctx, def, 'width', 50);
  const D = 16;
  const baseH = 12;
  const upperY = baseH;
  const upperH = 9;
  const stone = k.g('plaster');
  const marble = k.g('marble');
  const gold = k.g('flat', undefined, { emissive: 0x7a5410, emissiveIntensity: 0.7 });
  const dark = k.g('flat');
  const lead = k.g('flat');
  const arches = k.g('flat');
  const cream = 0xeadfc6;
  const white = 0xf6eedc;

  // lower storey and upper (set back) storey
  stone.color(cream).boxB(0, 0, -D / 2, W, baseH, D, 'y');
  stone.color(0xe2d6ba).boxB(0, upperY, -D / 2 - 1.2, W - 1.2, upperH, D - 2.4, 'y');
  // terrace parapet + cornice
  marble.color(white);
  marble.boxB(0, baseH - 0.5, 0.35, W + 0.4, 0.6, 0.9);
  marble.boxB(0, baseH + 0.1, 0.2, W + 0.4, 0.6, 0.5);

  // five portals: marble arch + gold mosaic + dark doors
  const xs = [-W * 0.38, -W * 0.19, 0, W * 0.19, W * 0.38];
  for (let i = 0; i < 5; i++) {
    const cx = xs[i];
    const big = i === 2;
    const w = big ? 8.4 : 5.8;
    const hh = big ? 9.6 : 7.6;
    marble.color(white).poly(archOutline(cx, 0, w + 1.4, hh + 0.7, 10), 0.12);
    gold.color(0xe3b040).poly(archOutline(cx, 0, w + 0.6, hh, 10), 0.3);
    dark.color(0x2c2218).poly(archOutline(cx, 0, w * 0.62, hh * 0.55, 8), 0.5);
    // mosaic hints (darker gold bands) above the door
    gold.color(0xb98a26);
    const cyArc = hh - (w + 0.6) / 2;
    const pts: [number, number, number][] = [];
    for (let s = 0; s <= 10; s++) {
      const a = (s / 10) * Math.PI;
      pts.push([cx + Math.cos(a) * (w * 0.5 - 0.1), cyArc + Math.sin(a) * (w * 0.5 - 0.1), 0.4]);
    }
    gold.tube(pts, 0.1, 4, { caps: 'none' });
    // columns flanking the portal
    marble.color(0xd9d0e0);
    for (const sx of [-1, 1]) marble.cyl(cx + sx * (w / 2 + 0.25), 0, 0.5, 0.26, 0.26, hh * 0.55, 8, true);
  }
  // upper tier: five gilded lunettes with ogee gables and pinnacles
  for (let i = 0; i < 5; i++) {
    const cx = xs[i];
    const big = i === 2;
    const w = big ? 8.4 : 5.8;
    const hh = big ? 8.2 : 6.4;
    const zf = -1.2 + 0.1;
    marble.color(white).poly(archOutline(cx, upperY + 0.6, w + 1.2, hh + 0.6, 10), zf + 0.05);
    gold.color(0xe3b040).poly(archOutline(cx, upperY + 0.6, w + 0.4, hh, 10), zf + 0.25);
    // gable above the arch
    const gy = upperY + 0.6 + hh + 0.3;
    marble.color(white).tri([cx - w / 2 - 0.9, gy - 0.6, zf + 0.12], [cx + w / 2 + 0.9, gy - 0.6, zf + 0.12], [cx, gy + (big ? 4.6 : 3.2), zf + 0.12]);
    gold.color(0xd9a53a).tri([cx - w / 2 - 0.2, gy - 0.4, zf + 0.3], [cx + w / 2 + 0.2, gy - 0.4, zf + 0.3], [cx, gy + (big ? 3.6 : 2.4), zf + 0.3]);
    // pinnacle with finial
    marble.color(white).cyl(cx, gy + (big ? 4.4 : 3.0), zf + 0.15, 0.45, 0.0, big ? 3.2 : 2.4, 6, false);
    // statue silhouette
    marble.boxB(cx - w / 2 - 1.0, gy - 0.6, zf + 0.2, 0.7, 2.4, 0.7);
    marble.boxB(cx + w / 2 + 1.0, gy - 0.6, zf + 0.2, 0.7, 2.4, 0.7);
  }
  // gilded horses hint over the central portal
  gold.color(0xe6b844);
  for (const dx of [-1.8, -0.6, 0.6, 1.8]) {
    gold.boxB(dx, baseH + 0.7, 0.45, 0.8, 1.2, 0.35);
    gold.sphere(dx + 0.25, baseH + 2.0, 0.45, 0.22, 0.32, 0.2, 6, 4);
  }

  // domes (lead-grey, ribbed profile) on drums with lantern tops
  const domes: [number, number, number, number][] = [
    [0, -9.5, 7.2, 13], // centre
    [-W * 0.27, -9.5, 5.4, 9.5],
    [W * 0.27, -9.5, 5.4, 9.5],
    [0, -3.6, 4.4, 7.2],
    [0, -17.5, 5.6, 10],
  ];
  for (const [dx, dz, R, DH] of domes) {
    const y0 = dz > -5 ? upperY + upperH - 1.2 : upperY + upperH;
    stone.color(0xe8dec4).cyl(dx, y0, dz, R * 0.98, R * 0.98, 3.2, 14, false, false);
    // drum windows
    dark.color(0x3a2e22);
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      dark.push().translate(dx + Math.sin(ang) * R * 0.985, y0 + 0.9, dz + Math.cos(ang) * R * 0.985).rotY(ang).boxB(0, 0, 0, 0.8, 1.6, 0.12).pop();
    }
    marble.color(white).cyl(dx, y0 + 3.2, dz, R * 1.04, R * 1.04, 0.35, 14, true);
    const yb = y0 + 3.55;
    const prof: Pt[] = [
      [R * 0.98, 0],
      [R * 1.02, DH * 0.2],
      [R * 0.94, DH * 0.45],
      [R * 0.72, DH * 0.7],
      [R * 0.38, DH * 0.88],
      [R * 0.12, DH * 0.97],
      [0.02, DH],
    ];
    lead.color(0xaeb8b0).lathe(
      dx,
      dz,
      prof.map(([r, y]) => [r, yb + y] as [number, number]),
      16,
    );
    // lantern
    const ly = yb + DH * 0.96;
    marble.color(white).cyl(dx, ly, dz, R * 0.16, R * 0.16, 2.0, 8, true);
    gold.color(0xe3b040).sphere(dx, ly + 2.4, dz, R * 0.17, R * 0.22, R * 0.17, 8, 5);
    gold.boxB(dx, ly + 2.5, dz, 0.12, 1.6, 0.12);
    gold.boxB(dx, ly + 3.2, dz, 0.8, 0.12, 0.12);
  }
  k.flush();
}

// ─────────────────────────────────────────────────────── street props ──

function lampPost(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const H = num(ctx, def, 'height', 4.6);
  const g = k.g('flat');
  g.color(0x23362d);
  g.cyl(0, 0, 0, 0.3, 0.2, 0.5, 8, true);
  g.cyl(0, 0.5, 0, 0.1, 0.07, H - 0.5, 8, true);
  g.cyl(0, H * 0.45, 0, 0.16, 0.16, 0.12, 8, true);
  g.cyl(0, H, 0, 0.18, 0.1, 0.15, 8, true);
  for (const dx of [-0.55, 0, 0.55]) {
    if (dx !== 0) g.rod([0, H - 0.05, 0], [dx, H + 0.2, 0], 0.03, 5);
    g.cyl(dx, dx === 0 ? H + 0.1 : H + 0.2, 0, 0.12, 0.12, 0.1, 8, true);
  }
  k.flush();
  const glow = new GB();
  const lv = lightLevel(ctx);
  glow.color(0xffd9a0, lv * 0.9);
  for (const dx of [-0.55, 0, 0.55]) glow.sphere(dx, (dx === 0 ? H + 0.1 : H + 0.2) + 0.28, 0, 0.2, 0.24, 0.2, 8, 6);
  ctx.addStatic(glow.build(), ctx.mat('neon', { intensity: 1 }), ctx.matrixAt());
}

function cafeSet(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const tables = Math.max(1, Math.round(num(ctx, def, 'tables', 3)));
  const spacing = num(ctx, def, 'spacing', 2.6);
  const rng = ctx.rng;
  const wood = k.g('flat');
  const metal = k.g('flat');
  for (let t = 0; t < tables; t++) {
    const tx = (t - (tables - 1) / 2) * spacing;
    const tz = range(rng, -0.4, 0.4);
    metal.color(0x2b2b2e);
    metal.cyl(tx, 0, tz, 0.3, 0.3, 0.04, 8, true);
    metal.cyl(tx, 0, tz, 0.04, 0.04, 0.7, 6, false);
    wood.color(0xf1ece0).cyl(tx, 0.7, tz, 0.48, 0.48, 0.04, 10, true);
    const nCh = 2 + (rng() < 0.5 ? 1 : 0);
    for (let c = 0; c < nCh; c++) {
      const a = rng() * Math.PI * 2 + c * 2.1;
      const cx = tx + Math.sin(a) * 0.75;
      const cz = tz + Math.cos(a) * 0.75;
      const tilt = range(rng, -0.12, 0.12);
      wood.push().translate(cx, 0, cz).rotY(a + Math.PI).rotX(tilt);
      wood.color(0x5a3b24);
      wood.boxB(0, 0.42, 0, 0.42, 0.05, 0.42);
      wood.boxB(0, 0.46, -0.2, 0.42, 0.45, 0.05);
      for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) wood.boxB(lx, 0, lz, 0.04, 0.42, 0.04);
      wood.pop();
    }
    // red umbrella on some tables
    if (rng() < 0.5) {
      metal.color(0xd8d8d0).cyl(tx, 0.7, tz, 0.025, 0.025, 1.9, 5, false);
      wood.color(rng() < 0.5 ? 0xb52a2a : 0x1f4f9a).cyl(tx, 2.35, tz, 1.1, 0.05, 0.28, 8, false);
    }
  }
  k.flush();
}

function passerella(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const length = num(ctx, def, 'length', 30);
  const width = num(ctx, def, 'width', 1.3);
  const height = num(ctx, def, 'height', 0.5);
  const wood = k.g('wood');
  const metal = k.g('paintedMetal');
  const z0 = -length / 2;
  wood.color(0xb89466).boxB(0, height - 0.08, 0, width, 0.08, length);
  // planks hint: dark gaps every 0.6 m via thin boxes
  wood.color(0x6a4d30);
  for (let z = z0 + 0.6; z < length / 2; z += 0.6) wood.boxB(0, height - 0.075, z, width + 0.02, 0.005, 0.03);
  wood.color(0x8a6a46);
  for (const sx of [-1, 1]) wood.boxB(sx * (width / 2 - 0.04), height - 0.2, 0, 0.08, 0.12, length);
  metal.color(0x3a3a3c);
  const n = Math.max(2, Math.round(length / 3));
  for (let i = 0; i <= n; i++) {
    const z = z0 + (i * length) / n;
    for (const sx of [-1, 1]) {
      metal.rod([sx * (width / 2 - 0.05), height - 0.2, z], [sx * (width / 2 + 0.25), -0.5, z - 0.12], 0.04, 5);
      metal.rod([sx * (width / 2 - 0.05), height - 0.2, z], [sx * (width / 2 + 0.25), -0.5, z + 0.12], 0.04, 5);
    }
    metal.boxB(0, height - 0.3, z, width, 0.07, 0.07);
  }
  k.flush();
}

function flagMasts(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const count = Math.max(1, Math.round(num(ctx, def, 'count', 3)));
  const span = num(ctx, def, 'span', 32);
  const H = num(ctx, def, 'height', 16);
  const g = k.g('flat');
  const cloth = k.g('fabric', undefined, { side: 'double' });
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : -span / 2 + (span * i) / (count - 1);
    g.color(0x6b2b1f).cyl(x, 0, 0, 0.6, 0.5, 1.8, 8, true);
    g.color(0x7a2a22).cyl(x, 1.8, 0, 0.5, 0.35, 1.3, 8, true);
    g.color(0x5a2f20).cyl(x, 3.1, 0, 0.3, 0.2, H - 3.1, 8, true);
    g.color(0xe0b040).sphere(x, H + 0.2, 0, 0.22, 0.22, 0.22, 6, 4);
    cloth.color(0xc41e2a).quad([x + 0.2, H - 3.2, 0], [x + 3.4, H - 3.0, 0.2], [x + 3.4, H - 0.6, 0.2], [x + 0.2, H - 0.4, 0]);
    cloth.color(0xe0b040).quad([x + 1.0, H - 2.0, 0.02], [x + 2.6, H - 1.95, 0.1], [x + 2.6, H - 1.6, 0.1], [x + 1.0, H - 1.65, 0.02]);
  }
  k.flush();
}

registerProp('italy.palazzoRow', palazzoRow);
registerProp('italy.arcadeRow', arcadeRow);
registerProp('italy.gondola', gondola);
registerProp('italy.poleCluster', poleCluster);
registerProp('italy.footbridge', footbridge);
registerProp('italy.campanile', campanile);
registerProp('italy.basilica', basilica);
registerProp('italy.lampPost', lampPost);
registerProp('italy.cafeSet', cafeSet);
registerProp('italy.passerella', passerella);
registerProp('italy.flagMasts', flagMasts);
