/**
 * Theme 'netherlands' — Amsterdam canal houses and the Rotterdam harbour.
 *   netherlands.canalHouses { count=6, depth=9, seed-driven }  row of tall narrow brick houses along local +X,
 *                           facade faces local +Z (step / neck / bell / spout gables, hoisting beams, flower boxes).
 *   netherlands.bikes       { count=10, spacing=0.62, rail=1 }  parked bicycles in a row (+ a black railing), instanced.
 *   netherlands.bridge      { }                              low arched brick bridge across local X (clearance 4 m), bikes on parapets.
 *   netherlands.barge       { kind='house'|'cargo'|'tug', len, wid }  moored vessel, bow towards local +Z.
 *   netherlands.bollards    { count=6, spacing=4, kind='amsterdam'|'dock' }  bollards in a row along local X.
 *   netherlands.churchTower { height=80 }                    far-away brick church tower with a copper spire (Amsterdam landmark).
 *   netherlands.containerStack { cols=4, rows=2, maxTier=4 } shipping containers (long axis local X).
 *   netherlands.crane       { reach=14, height=28 }          quay gantry crane, boom towards local +Z (the water).
 *   netherlands.cubeHouses  { count=3 }                      yellow tilted cube houses on hexagonal poles, row along local X.
 *   netherlands.officeRow   { count=3, style='glass'|'shed' } modern waterfront blocks, facade towards local +Z.
 *   netherlands.pipeStack   { length=12 }                    stacked steel pipes.
 *   netherlands.lamps       { count=5, spacing=14 }          dock flood-light poles (neon heads).
 *   netherlands.cableBridge { }                              white cable-stayed bridge with one tall bent pylon (Rotterdam landmark).
 *   netherlands.skyline     { count=12, spread=240, maxH=120 } glass skyscrapers.
 */
import { Matrix4 } from 'three';
import type { PropContext, PropDef } from '../../types';
import { FACADE_UV, SIGN_UV } from '../decals';
import { GB } from '../geo';
import type { P3 } from '../geo';
import { registerProp } from '../props/registry';
import { Kit, lightLevel, num, pick, range, sharedGeo, str, tint } from '../props/common/util';

const PI = Math.PI;
const BRICKS = [0x7d3a2b, 0x6b3326, 0x8e4b36, 0x5a2d27, 0x4f3b38, 0x9a5a40, 0x74362c];
const PAINTED = [0xd9cfb4, 0xc9d3cf, 0xe3d6c0];
const BOX_COLS = [0xe8c14a, 0xd8a030, 0xe5733a, 0xf0b9c8, 0xa8d070, 0xf2ece0];

// ════════════════════════════════════════════════════════════ canal houses ══

type Gable = 'step' | 'neck' | 'bell' | 'spout';

/** Right half profile [dx, dy] ascending from the eaves (dy=0, dx=hw) to the top; the cap closes it. */
function gableProfile(kind: Gable, hw: number, gh: number): [number, number][] {
  const p: [number, number][] = [];
  if (kind === 'step') {
    const n = Math.max(3, Math.round(gh / 0.55));
    const sh = gh / n;
    for (let s = 0; s < n; s++) {
      const dx = hw - (hw - 0.3) * (s / n);
      p.push([dx, s * sh], [dx, (s + 1) * sh]);
    }
    p.push([0.3, gh]);
  } else if (kind === 'neck') {
    p.push([hw, 0], [hw, 0.35], [hw * 0.8, 0.7], [hw * 0.55, 1.1], [hw * 0.46, 1.5], [hw * 0.46, gh - 0.5], [hw * 0.58, gh - 0.3], [hw * 0.5, gh]);
  } else if (kind === 'bell') {
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      p.push([hw * (0.26 + 0.74 * Math.pow(1 - t, 1.6) + 0.16 * Math.sin(t * PI)), gh * t]);
    }
    p.push([hw * 0.26, gh]);
  } else {
    p.push([hw, 0], [hw, 0.2], [hw * 0.15, gh * 0.9]);
  }
  p.push([0, p[p.length - 1][1] + (kind === 'spout' ? 0.15 : 0.1)]);
  return p;
}

function canalHouses(def: PropDef, ctx: PropContext): void {
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const count = Math.max(1, Math.round(num(ctx, def, 'count', 6)));
  const depth = num(ctx, def, 'depth', 9);
  const groundH = 3.3;
  const floorH = 3.1;
  const widths: number[] = [];
  for (let i = 0; i < count; i++) widths.push(range(rng, 3.2, 4.7));
  const total = widths.reduce((a, b) => a + b, 0);
  let bx = -total / 2;

  const wall = k.g('brick');
  const paint = k.g('plaster');
  const trim = k.g('plaster');
  const glass = k.g('glass');
  const roof = k.g('roofTile');
  const wood = k.g('wood');
  const flat = k.g('flat');
  const facade = k.g('facade');
  const signs = k.g('signs');
  const stone = k.g('granite');

  for (let i = 0; i < count; i++) {
    const w = widths[i];
    const cx = bx + w / 2;
    const hw = w / 2;
    const floors = 3 + (rng() < 0.4 ? 1 : 0);
    const h = groundH + floors * floorH;
    const kind = pick<Gable>(rng, ['step', 'neck', 'bell', 'spout', 'neck', 'step']);
    const gh = kind === 'spout' ? range(rng, 1.8, 2.4) : range(rng, 2.4, 3.6);
    const painted = rng() < 0.14;
    const brick = painted ? pick(rng, PAINTED) : pick(rng, BRICKS);
    const shade = range(rng, 0.88, 1.08);
    const surf = painted ? paint : wall;
    surf.color(brick, shade);
    // body + gable (same material so the facade reads as one wall)
    surf.boxB(cx, -3, -depth / 2, w, h + 3, depth, 'y');
    const prof = gableProfile(kind, hw, gh);
    const outline: [number, number][] = [[cx - hw, h], [cx + hw, h]];
    for (const [dx, dy] of prof) outline.push([cx + dx, h + dy]);
    for (let j = prof.length - 1; j >= 0; j--) outline.push([cx - prof[j][0], h + prof[j][1]]);
    // drop duplicates produced by the closing cap
    const clean = outline.filter((p, idx) => idx === 0 || Math.hypot(p[0] - outline[idx - 1][0], p[1] - outline[idx - 1][1]) > 1e-3);
    surf.color(brick, shade * 0.96).prism(clean, -0.5, 0, true, false, true);
    // gable coping + eave cornice
    const cop: P3[] = [];
    for (const p of clean) cop.push([p[0], p[1] + 0.03, 0.04]);
    trim.white().tube(cop.slice(1, cop.length - 1), 0.07, 4, { caps: 'none' });
    trim.boxB(cx, h - 0.2, 0.1, w + 0.1, 0.28, 0.3);
    trim.boxB(cx, groundH - 0.06, 0.07, w + 0.05, 0.14, 0.2);
    // pitched roof behind the gable
    roof.color(0x4d4a48, range(rng, 0.8, 1.1));
    roof.quad([cx - hw, h, -0.4], [cx, h + 2.2, -0.4], [cx, h + 2.2, -depth], [cx - hw, h, -depth]);
    roof.quad([cx, h + 2.2, -0.4], [cx + hw, h, -0.4], [cx + hw, h, -depth], [cx, h + 2.2, -depth]);
    // hoisting beam with pulley + hook at the apex
    const ay = h + gh;
    wood.color(0x2e241d).boxB(cx, ay - 0.1, 0.45, 0.14, 0.14, 1.2);
    wood.boxB(cx, ay - 0.1, 0.0, 0.2, 0.3, 0.2);
    flat.color(0x222222).boxB(cx, ay - 0.65, 1.0, 0.04, 0.55, 0.04);

    // windows
    const nWin = w > 3.9 ? 2 : 2;
    const ww = w * 0.27;
    for (let f = 0; f < floors; f++) {
      const wy = groundH + f * floorH + 0.45;
      const wh = 2.15 - f * 0.15;
      for (let s = 0; s < nWin; s++) {
        const wx = cx + (s === 0 ? -1 : 1) * w * 0.24;
        trim.white().quad([wx - ww / 2 - 0.1, wy - 0.08, 0.03], [wx + ww / 2 + 0.1, wy - 0.08, 0.03], [wx + ww / 2 + 0.1, wy + wh + 0.1, 0.03], [wx - ww / 2 - 0.1, wy + wh + 0.1, 0.03]);
        glass.color(0x2c3a46, range(rng, 0.8, 1.3)).quad([wx - ww / 2, wy, 0.045], [wx + ww / 2, wy, 0.045], [wx + ww / 2, wy + wh, 0.045], [wx - ww / 2, wy + wh, 0.045]);
        trim.white().quad([wx - 0.025, wy, 0.06], [wx + 0.025, wy, 0.06], [wx + 0.025, wy + wh, 0.06], [wx - 0.025, wy + wh, 0.06]);
        trim.quad([wx - ww / 2, wy + wh * 0.58, 0.06], [wx + ww / 2, wy + wh * 0.58, 0.06], [wx + ww / 2, wy + wh * 0.58 + 0.05, 0.06], [wx - ww / 2, wy + wh * 0.58 + 0.05, 0.06]);
        trim.boxB(wx, wy - 0.16, 0.1, ww + 0.3, 0.1, 0.22, 'xXzy');
        trim.boxB(wx, wy + wh + 0.08, 0.08, ww + 0.26, 0.14, 0.16, 'xXzy');
        // flower box on some windows
        if (rng() < 0.4) {
          wood.color(0x3b2a20).boxB(wx, wy - 0.02, 0.22, ww * 0.92, 0.2, 0.22);
          flat.color(0x4a8a3a, range(rng, 0.8, 1.2)).boxB(wx, wy + 0.17, 0.22, ww * 0.9, 0.12, 0.2);
          for (let d = 0; d < 3; d++) {
            flat.color(pick(rng, [0xe63a5a, 0xf2c43a, 0xf08ab0, 0xf2f0e6, 0xe86a2a])).boxB(wx - ww * 0.3 + d * ww * 0.3, wy + 0.27, 0.22, 0.16, 0.16, 0.16);
          }
        }
      }
    }
    // ground floor: front door (atlas) with stoep + big window + basement slit
    const doorSide = rng() < 0.5 ? -1 : 1;
    const dx = cx + doorSide * w * 0.24;
    facade.white().quadUV([dx - 0.55, 0.6, 0.05], [dx + 0.55, 0.6, 0.05], [dx + 0.55, 2.9, 0.05], [dx - 0.55, 2.9, 0.05], ...FACADE_UV.doorWood);
    stone.color(0xb8b2a6).boxB(dx, 0, 0.55, 1.5, 0.6, 1.1, 'y');
    stone.boxB(dx, 0, 1.25, 1.1, 0.3, 0.5, 'y');
    const gx = cx - doorSide * w * 0.24;
    trim.white().quad([gx - ww / 2 - 0.1, 1.05, 0.03], [gx + ww / 2 + 0.1, 1.05, 0.03], [gx + ww / 2 + 0.1, 3.0, 0.03], [gx - ww / 2 - 0.1, 3.0, 0.03]);
    glass.color(0x24313c).quad([gx - ww / 2, 1.15, 0.045], [gx + ww / 2, 1.15, 0.045], [gx + ww / 2, 2.9, 0.045], [gx - ww / 2, 2.9, 0.045]);
    glass.color(0x1c262e).quad([gx - ww / 2, 0.1, 0.045], [gx + ww / 2, 0.1, 0.045], [gx + ww / 2, 0.45, 0.045], [gx - ww / 2, 0.45, 0.045]);
    // iron anchors (muurankers) between floors
    for (let f = 1; f <= floors; f++) flat.color(0x1a1a1a).boxB(cx, groundH + f * floorH - 0.5, 0.04, 0.5, 0.1, 0.03);
    // occasional café board
    if (rng() < 0.3) {
      const s = SIGN_UV.h[Math.floor(rng() * SIGN_UV.h.length)];
      signs.white().quadUV([gx - 0.7, 3.15, 0.1], [gx + 0.7, 3.15, 0.1], [gx + 0.7, 3.5, 0.1], [gx - 0.7, 3.5, 0.1], s[0], s[1], s[2], s[3]);
    }
    bx += w;
  }
  k.flush();
}

// ═════════════════════════════════════════════════════════════ bicycles ══

function bikeGeo(): ReturnType<GB['build']> {
  const g = new GB();
  const circle = (cx: number): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * PI * 2;
      pts.push([cx + Math.cos(a) * 0.34, 0.34 + Math.sin(a) * 0.34, 0]);
    }
    return pts;
  };
  g.color(0x161616);
  g.tube(circle(-0.52), 0.034, 3, { caps: 'none' });
  g.tube(circle(0.52), 0.034, 3, { caps: 'none' });
  g.white();
  g.rod([-0.52, 0.34, 0], [-0.1, 0.3, 0], 0.022, 3);
  g.rod([-0.1, 0.3, 0], [-0.2, 0.88, 0], 0.022, 3);
  g.rod([-0.1, 0.3, 0], [0.4, 0.78, 0], 0.022, 3);
  g.rod([-0.2, 0.86, 0], [0.4, 0.8, 0], 0.022, 3);
  g.rod([0.4, 0.74, 0], [0.52, 0.34, 0], 0.022, 3);
  g.rod([-0.52, 0.34, 0], [-0.2, 0.84, 0], 0.018, 3);
  g.rod([0.36, 0.82, -0.24], [0.36, 0.82, 0.24], 0.02, 3);
  g.color(0x2a2a2a).boxB(-0.22, 0.88, 0, 0.26, 0.06, 0.1);
  g.color(0x2a2a2a).boxB(-0.55, 0.62, 0, 0.34, 0.04, 0.16);
  return g.build();
}

const BIKE_COLS = [0x1c1c1e, 0x1c1c1e, 0x26262a, 0x3a3d44, 0x1c1c1e, 0x6d1f1f, 0x2d3f55, 0x8d9096, 0x1c1c1e, 0x2f5a3a];
const _bm = new Matrix4();
const _bt = new Matrix4();

/** One bicycle: parked perpendicular to the row (long axis local Z). */
function parkBike(ctx: PropContext, x: number, y: number, z: number, yawLocal: number, lean: number, slope = 0): void {
  const geo = sharedGeo(ctx, 'nl.bike', bikeGeo);
  const m = ctx.matrixAt([x, y, z], 0);
  _bt.makeTranslation(0, 0, 0);
  m.multiply(_bm.makeRotationZ(slope));
  m.multiply(_bt.makeRotationY(yawLocal));
  m.multiply(_bm.makeRotationX(lean));
  ctx.addInstance('nl.bike', geo, ctx.mat('flat'), m, tint(pick(ctx.rng, BIKE_COLS), range(ctx.rng, 0.9, 1.25)));
}

function bikes(def: PropDef, ctx: PropContext): void {
  const count = Math.round(num(ctx, def, 'count', 10));
  const spacing = num(ctx, def, 'spacing', 0.62);
  const rail = num(ctx, def, 'rail', 1) > 0;
  const rng = ctx.rng;
  const total = count * spacing;
  for (let i = 0; i < count; i++) {
    const x = -total / 2 + i * spacing + spacing / 2;
    const row = i % 2;
    const lean = (rng() - 0.5) * 0.5 + (row ? 0.28 : -0.28);
    parkBike(ctx, x, 0, row ? 0.18 : -0.1, (row ? -1 : 1) * (PI / 2) + (rng() - 0.5) * 0.18, lean);
  }
  if (rail) {
    const k = new Kit(ctx);
    const g = k.g('metal');
    g.color(0x1b1b1d);
    g.rod([-total / 2, 0.95, 0.75], [total / 2, 0.95, 0.75], 0.035, 5);
    g.rod([-total / 2, 0.5, 0.75], [total / 2, 0.5, 0.75], 0.03, 5);
    for (let x = -total / 2; x <= total / 2 + 0.01; x += 2.2) g.rod([x, 0, 0.75], [x, 0.98, 0.75], 0.04, 5);
    k.flush();
  }
}

// ═══════════════════════════════════════════════════════════════ bridge ══

function bridge(def: PropDef, ctx: PropContext): void {
  void def;
  const k = new Kit(ctx);
  const brick = k.g('brick');
  const stone = k.g('granite');
  const L = 14;
  const topAt = (x: number): number => 1.1 + 3.8 * (1 - (x / L) * (x / L));
  const outline: [number, number][] = [[-L, -1.2], [-7, -1.2]];
  for (let i = 0; i <= 14; i++) {
    const a = PI - (i / 14) * PI;
    outline.push([Math.cos(a) * 7, Math.sin(a) * 4.0]);
  }
  outline.push([7, -1.2], [L, -1.2], [L, 1.1]);
  for (let x = L - 2; x >= -L + 0.1; x -= 2) outline.push([x, topAt(x)]);
  outline.push([-L, 1.1]);
  brick.color(0x82432f).prism(outline, -2.4, 2.4, true, true, true);
  // arch ring + parapets
  for (const z of [-2.4, 2.4]) {
    for (let x = -L; x < L - 0.01; x += 2) {
      const x1 = Math.min(L, x + 2);
      stone.color(0xcfc9bd).beam([x, topAt(x) + 0.28, z], [x1, topAt(x1) + 0.28, z], 0.5, 0.56);
    }
  }
  // arch voussoirs in light stone
  stone.color(0xb9b2a4);
  const arch: P3[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = PI - (i / 14) * PI;
    arch.push([Math.cos(a) * 7.05, Math.sin(a) * 4.05, 2.43]);
  }
  stone.tube(arch, 0.22, 4, { caps: 'none' });
  const back = arch.map((p): P3 => [p[0], p[1], -2.43]);
  stone.tube(back, 0.22, 4, { caps: 'none' });
  k.flush();
  // bikes leaning on both parapets
  for (const z of [-2.0, 2.0]) {
    for (let x = -L + 2.3; x <= L - 2.2; x += 0.78) {
      if (Math.abs(x) < 3.2 && ctx.rng() < 0.5) continue;
      const slope = Math.atan2(topAt(x + 0.1) - topAt(x - 0.1), 0.2);
      parkBike(ctx, x, topAt(x) + 0.05, z * 0.97, (z < 0 ? -1 : 1) * (PI / 2), (z < 0 ? 0.3 : -0.3) + (ctx.rng() - 0.5) * 0.2, slope);
    }
  }
}

// ═══════════════════════════════════════════════════════════════ vessels ══

function barge(def: PropDef, ctx: PropContext): void {
  const kind = str(def, 'kind', 'house');
  const k = new Kit(ctx);
  const rng = ctx.rng;
  const len = num(ctx, def, 'len', kind === 'cargo' ? 26 : kind === 'tug' ? 11 : 14);
  const wid = num(ctx, def, 'wid', kind === 'cargo' ? 5.2 : kind === 'tug' ? 3.6 : 3.4);
  const hull = k.g('paintedMetal');
  const deck = k.g('wood');
  const flat = k.g('flat');
  const glass = k.g('glass');
  const white = k.g('plaster');
  const hullCol = kind === 'house' ? pick(rng, [0x24313a, 0x1f2b2a, 0x35302c]) : kind === 'tug' ? 0x1f2a36 : pick(rng, [0x1c2a3d, 0x3a2a2a, 0x2a3b2f]);
  const freeboard = kind === 'cargo' ? 0.9 : 0.55;
  hull.color(hullCol).boxB(0, -0.7, 0, wid, 0.7 + freeboard, len - 1.6, 'y');
  // pointed bow & squared stern
  hull.tri([-wid / 2, freeboard, len / 2 - 0.8], [wid / 2, freeboard, len / 2 - 0.8], [0, freeboard, len / 2 + 0.8]);
  hull.color(hullCol, 0.8).quad([-wid / 2, -0.7, len / 2 - 0.8], [-wid / 2, freeboard, len / 2 - 0.8], [0, freeboard, len / 2 + 0.8], [0, -0.7, len / 2 + 0.8]);
  hull.quad([0, -0.7, len / 2 + 0.8], [0, freeboard, len / 2 + 0.8], [wid / 2, freeboard, len / 2 - 0.8], [wid / 2, -0.7, len / 2 - 0.8]);
  hull.color(0x8a2a22).boxB(0, 0.05, 0, wid + 0.03, 0.14, len - 1.6, 'yY');
  deck.color(0x8d7a5e).boxB(0, freeboard - 0.02, 0, wid - 0.3, 0.05, len - 1.8);
  if (kind === 'house') {
    const cw = wid - 0.7;
    const cl = len - 4.5;
    const ch = 2.3;
    const cab = pick(rng, [0xe7dfcf, 0xcfd9c8, 0xd9c8b0, 0xb9c8d4]);
    white.color(cab).boxB(0, freeboard, -0.3, cw, ch, cl, 'y');
    flat.color(0x3c4a3a).boxB(0, freeboard + ch, -0.3, cw + 0.2, 0.18, cl + 0.2);
    for (let z = -cl / 2 + 1.0; z < cl / 2 - 0.5; z += 1.9) {
      for (const sx of [-1, 1]) {
        glass.color(0x28343e).quad([sx * (cw / 2 + 0.02), freeboard + 0.7, -0.3 + z + (sx > 0 ? 0.55 : -0.55)], [sx * (cw / 2 + 0.02), freeboard + 0.7, -0.3 + z + (sx > 0 ? -0.55 : 0.55)], [sx * (cw / 2 + 0.02), freeboard + 1.8, -0.3 + z + (sx > 0 ? -0.55 : 0.55)], [sx * (cw / 2 + 0.02), freeboard + 1.8, -0.3 + z + (sx > 0 ? 0.55 : -0.55)]);
      }
    }
    // roof garden: planters, chairs, a little tree
    for (let i = 0; i < 4; i++) {
      flat.color(0x5a9a45, range(rng, 0.8, 1.2)).boxB(range(rng, -cw / 2 + 0.5, cw / 2 - 0.5), freeboard + ch + 0.18, range(rng, -cl / 2, cl / 2) - 0.3, 0.7, 0.45, 0.5);
      flat.color(pick(rng, [0xe63a5a, 0xf2c43a, 0xf08ab0])).boxB(range(rng, -cw / 2 + 0.5, cw / 2 - 0.5), freeboard + ch + 0.6, range(rng, -cl / 2, cl / 2) - 0.3, 0.3, 0.25, 0.3);
    }
    flat.color(0x2b2b2b).boxB(0.5, freeboard + ch + 0.18, 0.8, 0.25, 0.7, 0.25);
  } else if (kind === 'tug') {
    white.color(0xe9e6dc).boxB(0, freeboard, -1.2, wid - 0.8, 1.7, 3.6, 'y');
    white.color(0xe9e6dc).boxB(0, freeboard + 1.7, -1.0, wid - 1.4, 1.2, 2.6, 'y');
    flat.color(0xc8321e).cyl(0, freeboard + 2.9, -2.0, 0.38, 0.32, 1.2, 8);
    flat.color(0x111111).cyl(0, freeboard + 4.05, -2.0, 0.34, 0.34, 0.2, 8);
    glass.color(0x24313c).quad([-1.0, freeboard + 2.0, -0.28], [1.0, freeboard + 2.0, -0.28], [1.0, freeboard + 2.7, -0.28], [-1.0, freeboard + 2.7, -0.28]);
  } else {
    // cargo barge: wheelhouse at the stern + stack of containers in the hold
    white.color(0xe9e6dc).boxB(0, freeboard, -len / 2 + 2.2, wid - 1.2, 3.0, 3.2, 'y');
    glass.color(0x24313c).quad([-1.4, freeboard + 1.5, -len / 2 + 3.82], [1.4, freeboard + 1.5, -len / 2 + 3.82], [1.4, freeboard + 2.5, -len / 2 + 3.82], [-1.4, freeboard + 2.5, -len / 2 + 3.82]);
    const cont = k.g('corrugated');
    for (let i = 0; i < 3; i++) {
      for (let t = 0; t < 2 + Math.floor(rng() * 2); t++) {
        cont.color(pick(rng, [0xb8322a, 0x1e5aa8, 0xd9a21b, 0x2f7d4f, 0x8d9aa5, 0xc4651e])).boxB(0, freeboard + t * 2.6, 1.0 + i * 6.2 - 1.5, 2.4, 2.55, 6.0);
      }
    }
  }
  k.flush();
}

function bollards(def: PropDef, ctx: PropContext): void {
  const count = Math.round(num(ctx, def, 'count', 6));
  const spacing = num(ctx, def, 'spacing', 4);
  const dock = str(def, 'kind', 'amsterdam') === 'dock';
  const geo = sharedGeo(ctx, dock ? 'nl.bitt' : 'nl.bollard', () => {
    const g = new GB().white();
    if (dock) {
      g.cyl(0, 0, 0, 0.3, 0.26, 0.5, 8).cyl(0, 0.5, 0, 0.42, 0.3, 0.22, 8, true);
    } else {
      g.cyl(0, 0, 0, 0.11, 0.09, 0.62, 8).sphere(0, 0.62, 0, 0.11, 0.1, 0.11, 8, 4, 0.5, 1);
      g.cyl(0, 0.46, 0, 0.125, 0.125, 0.05, 8);
    }
    return g.build();
  });
  for (let i = 0; i < count; i++) {
    const x = -((count - 1) * spacing) / 2 + i * spacing;
    ctx.addInstance(dock ? 'nl.bitt' : 'nl.bollard', geo, ctx.mat('flat'), ctx.matrixAt([x, 0, 0]), tint(dock ? pick(ctx.rng, [0x2a2d30, 0xd8b020]) : 0x1b1b1d, 1));
  }
}

// ═══════════════════════════════════════════════════════ church tower ══

function churchTower(def: PropDef, ctx: PropContext): void {
  const H = num(ctx, def, 'height', 80);
  const k = new Kit(ctx);
  const brick = k.g('brick');
  const stone = k.g('granite');
  const cop = k.g('flat');
  const dark = k.g('flat');
  const roof = k.g('roofTile');
  const S = H * 0.125; // tower side
  const bodyH = H * 0.46;
  brick.color(0x7a3c2e).boxB(0, 0, 0, S, bodyH, S, 'y');
  // corner buttresses + string courses
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) stone.color(0xcfc6b4).boxB(sx * S * 0.5, 0, sz * S * 0.5, S * 0.14, bodyH + 1, S * 0.14);
  for (const y of [bodyH * 0.35, bodyH * 0.7, bodyH]) stone.boxB(0, y - 0.3, 0, S + 0.8, 0.8, S + 0.8);
  // tall blind arches (dark) on the shaft
  for (const sgn of [-1, 1]) {
    for (let a = 0; a < 2; a++) {
      const y = bodyH * (0.12 + a * 0.35);
      dark.color(0x20242a).quad([-S * 0.15, y, sgn * (S / 2 + 0.05)], [S * 0.15, y, sgn * (S / 2 + 0.05)], [S * 0.15, y + bodyH * 0.2, sgn * (S / 2 + 0.05)], [-S * 0.15, y + bodyH * 0.2, sgn * (S / 2 + 0.05)]);
    }
  }
  // belfry stage
  const b0 = bodyH;
  const bh = H * 0.16;
  const bs = S * 0.92;
  brick.color(0x86463a).boxB(0, b0, 0, bs, bh, bs, 'y');
  for (let f = 0; f < 4; f++) {
    const a = (f * PI) / 2;
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const tx = nz;
    const tz = -nx;
    for (const off of [-0.22, 0.22]) {
      const cxp = nx * (bs / 2 + 0.04) + tx * off * bs;
      const czp = nz * (bs / 2 + 0.04) + tz * off * bs;
      const hw = bs * 0.1;
      dark.color(0x16181c).quad(
        [cxp - tx * hw, b0 + bh * 0.2, czp - tz * hw],
        [cxp + tx * hw, b0 + bh * 0.2, czp + tz * hw],
        [cxp + tx * hw, b0 + bh * 0.82, czp + tz * hw],
        [cxp - tx * hw, b0 + bh * 0.82, czp - tz * hw],
      );
    }
    // clock face
    if (f === 0 || f === 2) {
      const cy = b0 + bh * 0.5;
      cop.color(0xf2efe0).quad([-bs * 0.2, cy - bs * 0.2, nz * (bs / 2 + 0.09)], [bs * 0.2, cy - bs * 0.2, nz * (bs / 2 + 0.09)], [bs * 0.2, cy + bs * 0.2, nz * (bs / 2 + 0.09)], [-bs * 0.2, cy + bs * 0.2, nz * (bs / 2 + 0.09)]);
    }
  }
  stone.color(0xcfc6b4).boxB(0, b0 + bh, 0, bs + 1, 0.7, bs + 1);
  // octagonal lantern stages
  const o0 = b0 + bh + 0.7;
  const r1 = bs * 0.5;
  cop.color(0x4f8f80).cyl(0, o0, 0, r1, r1 * 0.86, H * 0.08, 8);
  cop.color(0xe6dfcb).cyl(0, o0 + H * 0.08, 0, r1 * 1.1, r1 * 1.1, 0.5, 8);
  const o1 = o0 + H * 0.08 + 0.5;
  cop.color(0x4f8f80).cyl(0, o1, 0, r1 * 0.72, r1 * 0.55, H * 0.07, 8);
  // slender copper spire
  const s0 = o1 + H * 0.07;
  cop.color(0x5aa592).cyl(0, s0, 0, r1 * 0.55, 0.12, H - s0 - 3, 8);
  cop.color(0xd8b23a).sphere(0, H - 3.6, 0, 0.5, 0.5, 0.5, 6, 4);
  cop.color(0xd8b23a).cyl(0, H - 3.4, 0, 0.1, 0.04, 3.3, 4);
  // nave behind (slate roof)
  const nl = H * 0.7;
  const nw = S * 1.5;
  brick.color(0x7a3c2e).boxB(0, 0, -S / 2 - nl / 2, nw, H * 0.17, nl, 'y');
  roof.color(0x4a4d52);
  const rb = H * 0.17;
  roof.quad([-nw / 2 - 0.5, rb, -S / 2 + 0.5], [0, rb + nw * 0.45, -S / 2 + 0.5], [0, rb + nw * 0.45, -S / 2 - nl - 0.5], [-nw / 2 - 0.5, rb, -S / 2 - nl - 0.5]);
  roof.quad([0, rb + nw * 0.45, -S / 2 + 0.5], [nw / 2 + 0.5, rb, -S / 2 + 0.5], [nw / 2 + 0.5, rb, -S / 2 - nl - 0.5], [0, rb + nw * 0.45, -S / 2 - nl - 0.5]);
  k.flush();
}

// ═════════════════════════════════════════════════════════ containers ══

function containerStack(def: PropDef, ctx: PropContext): void {
  const cols = Math.round(num(ctx, def, 'cols', 4));
  const rows = Math.round(num(ctx, def, 'rows', 2));
  const maxTier = Math.round(num(ctx, def, 'maxTier', 4));
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const c = k.g('corrugated');
  const L = 6.06;
  const W = 2.44;
  const H = 2.59;
  const palette = [0xb8322a, 0x1e5aa8, 0x2f7d4f, 0xd9a21b, 0x8d9aa5, 0xc4651e, 0x20406e, 0xe8e8e0, 0x7b2d26, 0x3b6a5a];
  for (let i = 0; i < cols; i++) {
    const tiers = 1 + Math.floor(rng() * maxTier);
    for (let j = 0; j < rows; j++) {
      const t2 = Math.max(1, tiers - (rng() < 0.3 ? 1 : 0));
      for (let t = 0; t < t2; t++) {
        c.color(pick(rng, palette), range(rng, 0.8, 1.1)).boxB((i - (cols - 1) / 2) * (L + 0.1), t * H, (j - (rows - 1) / 2) * (W + 0.08), L, H - 0.03, W, t === 0 ? 'y' : '');
      }
    }
  }
  k.flush();
}

function pipeStack(def: PropDef, ctx: PropContext): void {
  const len = num(ctx, def, 'length', 12);
  const k = new Kit(ctx);
  const m = k.g('metal');
  const r = 0.55;
  const col = pick(ctx.rng, [0x7d8890, 0x9a7b4a, 0x6f7b86]);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 3 - row; i++) {
      const x = (i - (2 - row) / 2) * (r * 2.05);
      m.color(col, range(ctx.rng, 0.85, 1.1)).rod([-len / 2, r + row * r * 1.78, x], [len / 2, r + row * r * 1.78, x], r, 10, true);
    }
  }
  k.flush();
}

function crane(def: PropDef, ctx: PropContext): void {
  const reach = num(ctx, def, 'reach', 14);
  const H = num(ctx, def, 'height', 28);
  const k = new Kit(ctx);
  const m = k.g('paintedMetal');
  const dark = k.g('flat');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const body = 0xaebfce;
  const acc = 0xd8d4c8;
  const G = 12; // gauge along the quay
  const D = 13; // depth water-leg → land-leg
  m.color(body);
  for (const sx of [-1, 1]) {
    for (const z of [0, -D]) {
      m.boxB(sx * G / 2, 0, z, 1.4, H, 1.4);
    }
    // top portal beams (box girders)
    m.boxB(sx * G / 2, H, -D / 2, 1.5, 1.4, D + 1.5);
    // diagonal braces
    m.beam([sx * G / 2, 1, 0], [sx * G / 2, H - 1, -D], 0.5);
    m.beam([sx * G / 2, 1, -D], [sx * G / 2, H - 1, 0], 0.5);
  }
  m.beam([-G / 2, H * 0.5, 0], [G / 2, H * 0.5, 0], 0.7);
  m.beam([-G / 2, H * 0.5, -D], [G / 2, H * 0.5, -D], 0.7);
  m.beam([-G / 2, H, 0], [G / 2, H, 0], 1.0);
  m.beam([-G / 2, H, -D], [G / 2, H, -D], 1.0);
  // boom: box girders over the water + back reach
  m.color(acc);
  for (const sx of [-2.2, 2.2]) m.boxB(sx, H + 1.0, reach / 2 - 4, 1.0, 1.6, reach + 8);
  m.beam([-2.2, H + 1.8, reach + 4], [2.2, H + 1.8, reach + 4], 0.6);
  // A-frame + stay lines
  m.color(body);
  m.beam([-2.2, H + 1.8, 0], [0, H + 13, -1], 0.7);
  m.beam([2.2, H + 1.8, 0], [0, H + 13, -1], 0.7);
  dark.color(0x30343a);
  dark.rod([0, H + 13, -1], [0, H + 1.8, reach + 4], 0.12, 4);
  dark.rod([0, H + 13, -1], [0, H + 1.8, -D - 3], 0.12, 4);
  // machinery house, trolley, spreader + hanging container
  m.color(0x8a97a2).boxB(0, H + 1.8, -D / 2 - 1.5, 5, 2.6, 6);
  m.color(0x6b7782).boxB(0, H - 0.3, reach * 0.62, 3.0, 1.2, 3.2);
  dark.rod([-1.1, H - 0.3, reach * 0.62], [-1.1, 6.3, reach * 0.62 - 0.2], 0.06, 3);
  dark.rod([1.1, H - 0.3, reach * 0.62], [1.1, 6.3, reach * 0.62 - 0.2], 0.06, 3);
  m.color(0x555d66).boxB(0, 6.0, reach * 0.62 - 0.2, 2.8, 0.35, 6.4);
  const cc = k.g('corrugated');
  cc.color(pick(ctx.rng, [0xb8322a, 0x1e5aa8, 0xd9a21b])).boxB(0, 3.35, reach * 0.62 - 0.2, 2.44, 2.59, 6.06);
  // aircraft-warning lights
  const glow = lightLevel(ctx);
  neon.rgb(1.0 * glow, 0.12 * glow, 0.08 * glow).boxB(0, H + 13, -1, 0.5, 0.5, 0.5);
  neon.boxB(0, H + 1.8, reach + 4.2, 0.5, 0.5, 0.5);
  k.flush();
}

// ═════════════════════════════════════════════════════════ cube houses ══

function cubeHouses(def: PropDef, ctx: PropContext): void {
  const count = Math.round(num(ctx, def, 'count', 3));
  const k = new Kit(ctx);
  const yellow = k.g('plaster');
  const pole = k.g('concrete');
  const glass = k.g('glass');
  const frame = k.g('paintedMetal');
  const E = 6.3;
  const hw = E / 2;
  const diag = E * Math.sqrt(3) / 2;
  const poleH = 6.5;
  const spacing = E * Math.SQRT2 * 0.98;
  for (let i = 0; i < count; i++) {
    const cx = (i - (count - 1) / 2) * spacing;
    // hexagonal pole(s) with a landing
    pole.color(0x8e9094);
    pole.cyl(cx, 0, 0, 1.7, 1.45, poleH, 6);
    pole.color(0xa9aaa8).cyl(cx, 0, 0, 2.3, 2.0, 0.6, 6);
    // the cube: corner down
    const cy = poleH + diag - 1.0;
    for (const g of [yellow, glass, frame]) {
      g.push().translate(cx, cy, 0).rotX(-0.6155).rotZ(PI / 4);
    }
    yellow.color(i % 2 ? 0xf2c230 : 0xefb91f).box(0, 0, 0, E, E, E);
    const s = hw * 0.66;
    const fs = hw * 0.72;
    const o = hw + 0.02;
    const faces: [P3, P3, P3, P3][] = [
      [[o, -1, 1], [o, -1, -1], [o, 1, -1], [o, 1, 1]],
      [[-o, -1, -1], [-o, -1, 1], [-o, 1, 1], [-o, 1, -1]],
      [[-1, o, 1], [1, o, 1], [1, o, -1], [-1, o, -1]],
      [[-1, -o, -1], [1, -o, -1], [1, -o, 1], [-1, -o, 1]],
      [[-1, -1, o], [1, -1, o], [1, 1, o], [-1, 1, o]],
      [[1, -1, -o], [-1, -1, -o], [-1, 1, -o], [1, 1, -o]],
    ];
    for (const f of faces) {
      const sc = (p: P3, q: number): P3 => [p[0] === 1 || p[0] === -1 ? p[0] * q : p[0], p[1] === 1 || p[1] === -1 ? p[1] * q : p[1], p[2] === 1 || p[2] === -1 ? p[2] * q : p[2]];
      frame.color(0x4a4036).quad(sc(f[0], fs), sc(f[1], fs), sc(f[2], fs), sc(f[3], fs));
      glass.color(0x2a3a48, 1.2).quad(sc(f[0], s), sc(f[1], s), sc(f[2], s), sc(f[3], s));
    }
    for (const g of [yellow, glass, frame]) g.pop();
  }
  k.flush();
}

// ═══════════════════════════════════════════════════════ modern blocks ══

function officeRow(def: PropDef, ctx: PropContext): void {
  const count = Math.round(num(ctx, def, 'count', 3));
  const style = str(def, 'style', 'glass');
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const glass = k.g('glass');
  const con = k.g('concrete');
  const metal = k.g('paintedMetal');
  const shed = k.g('corrugated');
  const facade = k.g('facade');
  const neon = k.g('neon', undefined, { intensity: 0.5 });
  const glow = lightLevel(ctx);
  const widths: number[] = [];
  for (let i = 0; i < count; i++) widths.push(range(rng, 12, 20));
  let x = -widths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < count; i++) {
    const w = widths[i];
    const cx = x + w / 2;
    const depth = 12;
    const kindShed = style === 'shed' || (style === 'mix' && i % 2 === 1);
    if (kindShed) {
      const h = range(rng, 8, 11);
      shed.color(pick(rng, [0xcfd3d6, 0x9fb3c2, 0xe0dccf, 0x5f7f96]), range(rng, 0.9, 1.1)).boxB(cx, -3, -depth / 2, w, h + 3, depth, 'y');
      con.color(0x9a9a98).boxB(cx, h, -depth / 2, w + 0.4, 0.5, depth + 0.4);
      // ribbon of windows + big roller door
      for (let wx = cx - w / 2 + 1.2; wx < cx + w / 2 - 2.4; wx += 3.2) {
        facade.white().quadUV([wx, h - 3.6, 0.03], [wx + 2.6, h - 3.6, 0.03], [wx + 2.6, h - 1.6, 0.03], [wx, h - 1.6, 0.03], ...FACADE_UV.rectGlassDark);
      }
      facade.quadUV([cx - 2.4, 0.0, 0.04], [cx + 2.4, 0.0, 0.04], [cx + 2.4, 4.6, 0.04], [cx - 2.4, 4.6, 0.04], ...FACADE_UV.shopRoller);
    } else {
      const floors = 4 + Math.floor(rng() * 6);
      const fh = 3.4;
      const h = floors * fh;
      glass.color(pick(rng, [0x35566e, 0x3d6073, 0x2d4658, 0x4a6b7d]), range(rng, 0.9, 1.2)).boxB(cx, -3, -depth / 2, w, h + 3, depth, 'y');
      con.color(0xb4b6b6);
      for (let f = 0; f <= floors; f++) con.boxB(cx, f * fh - 0.1, -0.1, w + 0.3, 0.4, 0.6, 'yz');
      for (let vx = cx - w / 2; vx <= cx + w / 2 + 0.1; vx += w / Math.max(2, Math.round(w / 3.4))) metal.color(0xe8eaec).boxB(vx, 0, 0.0, 0.16, h, 0.35);
      con.color(0x9c9e9e).boxB(cx, h, -depth / 2, w + 0.2, 0.7, depth + 0.2);
      // a few lit floors at dusk
      for (let f = 1; f < floors; f++) {
        if (rng() < 0.28) neon.rgb(1.0 * glow * 0.8, 0.72 * glow * 0.8, 0.38 * glow * 0.8).quad([cx - w / 2 + 0.3, f * fh + 0.5, 0.2], [cx + w / 2 - 0.3, f * fh + 0.5, 0.2], [cx + w / 2 - 0.3, f * fh + 2.3, 0.2], [cx - w / 2 + 0.3, f * fh + 2.3, 0.2]);
      }
    }
    x += w;
  }
  k.flush();
}

function lamps(def: PropDef, ctx: PropContext): void {
  const count = Math.round(num(ctx, def, 'count', 5));
  const spacing = num(ctx, def, 'spacing', 14);
  const k = new Kit(ctx);
  const m = k.g('metal');
  const neon = k.g('neon', undefined, { intensity: 1 });
  const glow = lightLevel(ctx);
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * spacing;
    m.color(0x40454a).cyl(x, 0, 0, 0.16, 0.1, 9.5, 6);
    m.beam([x, 9.4, 0], [x, 9.7, 1.4], 0.12);
    m.color(0x2b2f33).boxB(x, 9.55, 1.4, 0.9, 0.18, 0.5);
    neon.rgb(1.0 * glow, 0.78 * glow, 0.5 * glow).boxB(x, 9.38, 1.4, 0.8, 0.06, 0.4);
  }
  k.flush();
}

// ═════════════════════════════════════════════════ rotterdam landmarks ══

function cableBridge(def: PropDef, ctx: PropContext): void {
  void def;
  const k = new Kit(ctx);
  const white = k.g('paintedMetal');
  const con = k.g('concrete');
  const dark = k.g('flat');
  const deckY = 16;
  const x0 = -90;
  const x1 = 400;
  white.color(0xf4f6f6);
  white.boxB((x0 + x1) / 2, deckY - 1.4, 0, x1 - x0, 2.4, 26);
  con.color(0xaaaaa6).boxB((x0 + x1) / 2, deckY - 2.0, 0, x1 - x0, 0.8, 22);
  dark.color(0x30363c).boxB((x0 + x1) / 2, deckY + 1.0, -11.5, x1 - x0, 0.7, 0.3);
  dark.boxB((x0 + x1) / 2, deckY + 1.0, 11.5, x1 - x0, 0.7, 0.3);
  // piers
  for (let x = x0 + 30; x < x1; x += 70) con.color(0x9c9c98).boxB(x, -3, 0, 4, deckY - 1, 8);
  // bent pylon: vertical foot, then bending back away from the span
  const pylon: P3[] = [[0, 2, 0], [0, 34, 0], [-3, 62, 0], [-10, 92, 0], [-20, 118, 0], [-28, 136, 0]];
  white.color(0xf7f8f8).tube(pylon, 3.2, 6, { caps: 'flat', radiusAt: (i, n) => 1.5 - 0.62 * (i / (n - 1)) });
  con.color(0xaaaaa6).boxB(0, -3, 0, 14, deckY - 0.5, 12);
  const at = (y: number): number => {
    for (let i = 0; i < pylon.length - 1; i++) {
      const a = pylon[i];
      const b = pylon[i + 1];
      if (y >= a[1] && y <= b[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
    }
    return pylon[pylon.length - 1][0];
  };
  // fan of stays to the span (+X) and short back-stays (-X)
  white.color(0xeef0f0);
  for (let i = 0; i < 17; i++) {
    const y = 74 + i * 3.4;
    const dx = 20 + i * 8.5;
    white.rod([at(y), y, 0], [dx, deckY + 0.5, 0], 0.17, 3);
  }
  for (let i = 0; i < 4; i++) {
    const y = 80 + i * 10;
    white.rod([at(y), y, 0], [-14 - i * 12, deckY + 0.5, 0], 0.26, 3);
  }
  k.flush();
}

function skyline(def: PropDef, ctx: PropContext): void {
  const count = Math.round(num(ctx, def, 'count', 12));
  const spread = num(ctx, def, 'spread', 240);
  const maxH = num(ctx, def, 'maxH', 120);
  const rng = ctx.rng;
  const k = new Kit(ctx);
  const glass = k.g('glass');
  const con = k.g('concrete');
  const neon = k.g('neon', undefined, { intensity: 0.7 });
  const glow = lightLevel(ctx);
  const cols = [0x35566e, 0x2d4658, 0x4a6b7d, 0x56707f, 0x3b4f63, 0x6b8794];
  for (let i = 0; i < count; i++) {
    const x = -spread / 2 + (spread * (i + rng() * 0.6)) / count;
    const z = range(rng, -18, 18);
    const w = range(rng, 14, 26);
    const d = range(rng, 14, 24);
    const h = maxH * range(rng, 0.35, 1) * (1 - Math.abs(x) / spread * 0.6);
    const v0 = glass.vertexCount;
    glass.color(pick(rng, cols), range(rng, 0.9, 1.3));
    if (rng() < 0.3) glass.cyl(x, -3, z, w * 0.5, w * 0.46, h + 3, 12);
    else glass.boxB(x, -3, z, w, h + 3, d, 'y');
    glass.shadeBy(v0, (_x, y) => 0.55 + 0.5 * Math.min(1, Math.max(0, y / maxH)));
    con.color(0x9a9ea0).boxB(x, h, z, w * 0.7, 2.2, d * 0.7);
    if (rng() < 0.5) con.cyl(x, h + 2.2, z, 0.5, 0.2, h * 0.14, 4);
    // lit window bands
    for (let b = 0; b < 4; b++) {
      if (rng() < 0.6) {
        const y = 6 + rng() * (h - 12);
        neon.rgb(1.0 * glow * 0.7, 0.72 * glow * 0.7, 0.36 * glow * 0.7).quad([x - w * 0.4, y, z + d / 2 + 0.2], [x + w * 0.4, y, z + d / 2 + 0.2], [x + w * 0.4, y + 2.4, z + d / 2 + 0.2], [x - w * 0.4, y + 2.4, z + d / 2 + 0.2]);
      }
    }
  }
  k.flush();
}

registerProp('netherlands.canalHouses', canalHouses);
registerProp('netherlands.bikes', bikes);
registerProp('netherlands.bridge', bridge);
registerProp('netherlands.barge', barge);
registerProp('netherlands.bollards', bollards);
registerProp('netherlands.churchTower', churchTower);
registerProp('netherlands.containerStack', containerStack);
registerProp('netherlands.pipeStack', pipeStack);
registerProp('netherlands.crane', crane);
registerProp('netherlands.cubeHouses', cubeHouses);
registerProp('netherlands.officeRow', officeRow);
registerProp('netherlands.lamps', lamps);
registerProp('netherlands.cableBridge', cableBridge);
registerProp('netherlands.skyline', skyline);
