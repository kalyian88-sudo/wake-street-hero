/**
 * Boards + handle. Board local frame: nose = +Z, deck up = +Y, origin = centre of the BASE.
 * Wakeboard: twin-tip with continuous rocker, thin rails, fins, canvas top sheet / base, binding chassis.
 * Wakeskate: wooden concave deck with kick nose / tail and a grip top.
 * Textures are painted once per look and cached.
 */
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRAND } from '../config';
import type { BoardKind, GearLook } from '../types';
import { MeshBuilder } from './geo';
import { brandWords, contrast, css, drawWordmark, luma, mix, paintGraphic, paintWood, rgba, rng, shade, type Ctx } from './paint';
import { lookKey } from './rigDef';

export interface BoardSpec {
  kind: BoardKind;
  length: number;
  width: number;
  /** Height of the sole of the rider's foot above the board origin at the stance position. */
  footY: number;
  /** Toe-out angle of the front / rear foot (rad). */
  duckFront: number;
  duckRear: number;
}

export const WAKEBOARD: BoardSpec = { kind: 'wakeboard', length: 1.4, width: 0.43, footY: 0.062, duckFront: 0.21, duckRear: 0.21 };
export const WAKESKATE: BoardSpec = { kind: 'wakeskate', length: 1.06, width: 0.4, footY: 0.024, duckFront: 0.3, duckRear: 0.06 };

export function boardSpec(kind: BoardKind): BoardSpec {
  return kind === 'wakeboard' ? WAKEBOARD : WAKESKATE;
}

const TEX_W = 1024;
const TEX_H = 512;
const TOP_H = 248;
/** v range of the white swatch strip at the bottom of the board texture. */
const STRIP_V = 1 - (TOP_H * 2 + 8) / TEX_H;

// ───────────────────────────────────────────────────────── board shape ──

function wbHalfWidth(t: number, w: number): number {
  const a = Math.abs(t);
  return (w / 2) * (1 - 0.3 * Math.pow(a, 2.2)) * Math.pow(Math.max(0, 1 - Math.pow(a, 14)), 1 / 3);
}
function wbRocker(t: number): number {
  return 0.072 * Math.pow(Math.abs(t), 2.3);
}
function wsHalfWidth(t: number, w: number): number {
  const a = Math.abs(t);
  return (w / 2) * (1 - 0.1 * Math.pow(a, 2.4)) * Math.sqrt(Math.max(0, 1 - Math.pow(a, 7)));
}
function wsKick(t: number): number {
  const k = Math.max(0, (Math.abs(t) - 0.7) / 0.3);
  return 0.058 * k * k * (3 - 2 * k);
}

/** Height of the deck surface above the board origin at local z (used to seat feet / chassis). */
export function deckHeight(spec: BoardSpec, z: number): number {
  const t = Math.max(-1, Math.min(1, z / (spec.length / 2)));
  return spec.kind === 'wakeboard' ? wbRocker(t) + 0.022 - 0.008 * Math.abs(t) : wsKick(t) + 0.018;
}

function slab(spec: BoardSpec, railColor: number): BufferGeometry {
  const wb = spec.kind === 'wakeboard';
  const NZ = 30;
  const NX = 8;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const L = spec.length;
  const rail = [((railColor >> 16) & 255) / 255, ((railColor >> 8) & 255) / 255, (railColor & 255) / 255].map((c) => Math.pow(c, 2.2));
  const vTop0 = 1 - TOP_H / TEX_H;
  const vBase0 = 1 - (TOP_H * 2) / TEX_H;
  const stripV = STRIP_V / 2;

  const station = (k: number): { z: number; hw: number; y0: number; th: number; t: number } => {
    // cosine spacing puts more stations into the rounded tips
    const t = Math.sin((Math.PI / 2) * (-1 + (2 * k) / NZ));
    const hw = Math.max(0.0015, wb ? wbHalfWidth(t, spec.width) : wsHalfWidth(t, spec.width));
    const y0 = wb ? wbRocker(t) : wsKick(t);
    const th = wb ? 0.022 - 0.008 * Math.abs(t) : 0.018;
    return { z: (t * L) / 2, hw, y0, th, t };
  };

  // top (deck) grid, then base grid, then the two rails as separate strips (hard edge)
  const topStart = 0;
  for (let k = 0; k <= NZ; k++) {
    const s = station(k);
    for (let i = 0; i <= NX; i++) {
      const u = -1 + (2 * i) / NX;
      const edge = wb ? s.th * 0.4 : s.th * 0.85;
      const crown = wb ? (s.th - edge) * (1 - Math.pow(Math.abs(u), 3)) : (s.th - edge) * 1;
      const concave = wb ? 0 : 0.012 * u * u;
      pos.push(u * s.hw, s.y0 + edge + crown + concave, s.z);
      // canvas x → length, canvas top row = heel edge (+X) so the print reads from the toe side
      uv.push((s.t + 1) / 2, vTop0 + ((u + 1) / 2) * (TOP_H / TEX_H));
      col.push(1, 1, 1);
    }
  }
  const baseStart = pos.length / 3;
  for (let k = 0; k <= NZ; k++) {
    const s = station(k);
    for (let i = 0; i <= NX; i++) {
      const u = -1 + (2 * i) / NX;
      const bevel = (wb ? s.th * 0.22 : s.th * 0.12) * Math.pow(Math.abs(u), 6);
      const concave = wb ? 0 : 0.012 * u * u;
      pos.push(u * s.hw, s.y0 + bevel + concave, s.z);
      // seen from below: canvas top row = toe edge (−X)
      uv.push((s.t + 1) / 2, vBase0 + (1 - (u + 1) / 2) * (TOP_H / TEX_H));
      col.push(1, 1, 1);
    }
  }
  const row = NX + 1;
  for (let k = 0; k < NZ; k++) {
    for (let i = 0; i < NX; i++) {
      const a = topStart + k * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
      const e = baseStart + k * row + i;
      const f = e + 1;
      const g = e + row;
      const h = g + 1;
      idx.push(e, f, g, f, h, g);
    }
  }
  for (const side of [0, NX]) {
    const start = pos.length / 3;
    for (let k = 0; k <= NZ; k++) {
      for (const src of [topStart, baseStart]) {
        const o = (src + k * row + side) * 3;
        pos.push(pos[o], pos[o + 1], pos[o + 2]);
        uv.push(0.5, stripV);
        col.push(rail[0], rail[1], rail[2]);
      }
    }
    for (let k = 0; k < NZ; k++) {
      const a = start + k * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (side === 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface BoardBuild {
  geometry: BufferGeometry;
  triangles: number;
}

const _a = new Vector3();
const _b = new Vector3();
const UP = new Vector3(0, 1, 0);

/** `stance` = half distance between the feet (binding chassis positions on the wakeboard). */
export function buildBoard(spec: BoardSpec, look: GearLook, bindings: GearLook | null, stance: number): BoardBuild {
  const wb = spec.kind === 'wakeboard';
  const railColor = wb ? shade(look.secondary, luma(look.secondary) > 0.5 ? -0.25 : 0.1) : shade(look.primary, -0.18);
  const parts: BufferGeometry[] = [slab(spec, railColor)];
  const b = new MeshBuilder(false);
  b.uv(0.5, STRIP_V / 2);
  const L = spec.length;

  // fins: two per end, toed-in molded blades
  const finZ = L * (wb ? 0.4 : 0.36);
  const finH = wb ? 0.026 : 0.016;
  b.color(wb ? 0x141518 : shade(look.primary, -0.45));
  for (const sz of [1, -1]) {
    for (const sx of [1, -1]) {
      const z = sz * finZ;
      const x = sx * spec.width * (wb ? 0.27 : 0.24);
      const y = (wb ? wbRocker(z / (L / 2)) : wsKick(z / (L / 2))) + 0.004;
      _a.set(x, y, z - 0.05);
      _b.set(x, y, z + 0.05);
      b.segment(_a, _b, UP).loft(
        [
          { y: 0, rx: 0.002, rz: 0.002, oz: -0.002 },
          { y: 0.03, rx: 0.004, rz: finH * 0.5, oz: -finH * 0.5 },
          { y: 0.07, rx: 0.004, rz: finH * 0.5, oz: -finH * 0.5 },
          { y: 0.1, rx: 0.002, rz: 0.002, oz: -0.002 },
        ],
        { radial: 4, capStart: -0.002, capEnd: 0.102 },
      );
    }
  }

  if (wb && bindings) {
    // binding chassis: base plate, side rails, heel hoop, mounting bolts
    for (const side of [1, -1]) {
      const z = side * stance;
      const y = deckHeight(spec, z);
      const duck = side > 0 ? spec.duckFront : -spec.duckRear;
      // local frame of the binding: +Y′ runs heel → toe (towards −X of the board, rotated by the duck angle)
      const fx = -Math.cos(duck);
      const fz = Math.sin(duck);
      const cx = 0.006;
      b.color(shade(bindings.secondary, -0.2));
      _a.set(cx - fx * 0.155, y + 0.006, z - fz * 0.155);
      _b.set(cx + fx * 0.15, y + 0.006, z + fz * 0.15);
      b.segment(_a, _b, UP).loft(
        [
          { y: 0, rx: 0.05, rz: 0.006, n: 3 },
          { y: 0.03, rx: 0.066, rz: 0.007, n: 4 },
          { y: 0.27, rx: 0.07, rz: 0.007, n: 4 },
          { y: 0.305, rx: 0.058, rz: 0.006, n: 3 },
        ],
        { radial: 8, capStart: -0.006, capEnd: 0.31 },
      );
      // side rails
      b.color(contrast(bindings.primary, bindings.secondary));
      for (const sr of [1, -1]) {
        const ox = -fz * sr * 0.068;
        const oz = fx * sr * 0.068;
        _a.set(cx - fx * 0.13 + ox, y + 0.02, z - fz * 0.13 + oz);
        _b.set(cx + fx * 0.07 + ox, y + 0.02, z + fz * 0.07 + oz);
        b.segment(_a, _b, UP).capsule(0.2, 0.009, 0.007, { radial: 5, capSeg: 1, sz: 1.8 });
      }
      // bolts
      b.color(0xb9bec6);
      for (const [dl, dw] of [
        [-0.12, 0.05],
        [-0.12, -0.05],
        [0.12, 0.05],
        [0.12, -0.05],
      ]) {
        b.at(cx + fx * dl - fz * dw, y + 0.014, z + fz * dl + fx * dw).ellipsoid(0.007, 0.004, 0.007, { radial: 5, rings: 2 });
      }
    }
  }
  parts.push(b.build());
  const geometry = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  geometry.computeBoundingSphere();
  return { geometry, triangles: (geometry.index?.count ?? 0) / 3 };
}

// ────────────────────────────────────────────────────────────── handle ──

/** Handle local frame: +X = bar axis, +Z = towards the winch (V-bridle apex), origin = bar centre. */
export const HANDLE = { barHalf: 0.19, grip: 0.105, radius: 0.0155, bridle: 0.3 };

export function buildHandle(): BoardBuild {
  const b = new MeshBuilder(false);
  const front = new Vector3(0, 0, 1);
  // EVA grip with a lighter centre band
  b.color(0x1a1b1e);
  _a.set(-HANDLE.barHalf, 0, 0);
  _b.set(HANDLE.barHalf, 0, 0);
  b.segment(_a, _b, front).capsule(HANDLE.barHalf * 2, HANDLE.radius, HANDLE.radius, { radial: 8, capSeg: 1 });
  b.color(BRAND.colors.red);
  for (const s of [1, -1]) {
    _a.set(s * (HANDLE.barHalf - 0.004), 0, 0);
    _b.set(s * (HANDLE.barHalf + 0.018), 0, 0);
    b.segment(_a, _b, front).capsule(0.022, 0.021, 0.021, { radial: 8, capSeg: 1 });
  }
  b.color(0x3a3c43);
  _a.set(-0.03, 0, 0);
  _b.set(0.03, 0, 0);
  b.segment(_a, _b, front).capsule(0.06, HANDLE.radius + 0.0015, HANDLE.radius + 0.0015, { radial: 8, capSeg: 1 });
  // V-bridle + apex knot
  b.color(0xf1efe8);
  for (const s of [1, -1]) {
    _a.set(s * HANDLE.barHalf, 0, 0);
    _b.set(0, 0, HANDLE.bridle);
    b.segment(_a, _b, UP).capsule(_a.distanceTo(_b), 0.0045, 0.0045, { radial: 5, capSeg: 1 });
  }
  b.color(BRAND.colors.red);
  b.at(0, 0, HANDLE.bridle).ellipsoid(0.012, 0.012, 0.02, { radial: 6, rings: 3 });
  const geometry = b.build();
  return { geometry, triangles: b.triangleCount };
}

// ──────────────────────────────────────────────────────────── textures ──

export interface BoardTextures {
  map: Texture;
  rough: Texture;
}
const texCache = new Map<string, { tex: BoardTextures; refs: number }>();

export function boardTextureKey(kind: BoardKind, look: GearLook): string {
  return kind + ':' + lookKey(look);
}

export function acquireBoardTextures(kind: BoardKind, look: GearLook, anisotropy: number): BoardTextures {
  const key = boardTextureKey(kind, look);
  let e = texCache.get(key);
  if (!e) {
    e = { tex: paintBoard(kind, look, anisotropy), refs: 0 };
    texCache.set(key, e);
  }
  e.refs++;
  return e.tex;
}

export function releaseBoardTextures(kind: BoardKind, look: GearLook): void {
  const key = boardTextureKey(kind, look);
  const e = texCache.get(key);
  if (!e) return;
  if (--e.refs <= 0) {
    e.tex.map.dispose();
    e.tex.rough.dispose();
    texCache.delete(key);
  }
}

function paintBoard(kind: BoardKind, look: GearLook, anisotropy: number): BoardTextures {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d') as Ctx;
  const rc = document.createElement('canvas');
  rc.width = TEX_W / 4;
  rc.height = TEX_H / 4;
  const rctx = rc.getContext('2d') as Ctx;
  rctx.scale(0.25, 0.25);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  const g = (v: number): string => `rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)})`;
  rctx.fillStyle = g(0.45);
  rctx.fillRect(0, 0, TEX_W, TEX_H);
  if (kind === 'wakeboard') {
    rctx.fillStyle = g(0.3);
    rctx.fillRect(0, 0, TEX_W, TOP_H);
    rctx.fillStyle = g(0.4);
    rctx.fillRect(0, TOP_H, TEX_W, TOP_H);
    paintWakeboardTop(ctx, look);
    ctx.save();
    ctx.translate(0, TOP_H);
    paintWakeboardBase(ctx, look);
    ctx.restore();
  } else {
    rctx.fillStyle = g(0.96);
    rctx.fillRect(0, 0, TEX_W, TOP_H);
    rctx.fillStyle = g(0.42);
    rctx.fillRect(0, TOP_H, TEX_W, TOP_H);
    paintWakeskateTop(ctx, look);
    ctx.save();
    ctx.translate(0, TOP_H);
    paintWakeskateBase(ctx, look);
    ctx.restore();
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, TOP_H * 2, TEX_W, TEX_H - TOP_H * 2);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = anisotropy;
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = LinearFilter;
  const rough = new CanvasTexture(rc);
  rough.colorSpace = NoColorSpace;
  return { map, rough };
}

function clipTop(ctx: Ctx): void {
  ctx.beginPath();
  ctx.rect(0, 0, TEX_W, TOP_H);
  ctx.clip();
}

function paintWakeboardTop(ctx: Ctx, look: GearLook): void {
  const [w1, w2] = brandWords();
  ctx.save();
  clipTop(ctx);
  ctx.fillStyle = css(look.primary);
  ctx.fillRect(0, 0, TEX_W, TOP_H);
  if (look.graphic === 'wood') paintWood(ctx, 0, 0, TEX_W, TOP_H, look.primary, 3);
  else paintGraphic(ctx, 0, 0, TEX_W, TOP_H, look, 2);
  const ink = contrast(look.primary, look.accent);
  const dark = contrast(look.primary, look.secondary);
  // tip blocks + pin lines
  if (look.graphic === 'logo' || look.graphic === 'plain' || look.graphic === 'wood') {
    ctx.fillStyle = css(dark);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(150, 0);
    ctx.lineTo(96, TOP_H);
    ctx.lineTo(0, TOP_H);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(TEX_W, 0);
    ctx.lineTo(TEX_W - 96, 0);
    ctx.lineTo(TEX_W - 150, TOP_H);
    ctx.lineTo(TEX_W, TOP_H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = css(ink);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(164, 0);
    ctx.lineTo(110, TOP_H);
    ctx.moveTo(TEX_W - 110, 0);
    ctx.lineTo(TEX_W - 164, TOP_H);
    ctx.stroke();
  }
  // centre wordmark between the bindings + tip hits
  drawWordmark(ctx, BRAND.name, TEX_W / 2, TOP_H / 2, 74, css(ink), { stroke: rgba(0x000000, 0.28), strokeW: 6 });
  drawWordmark(ctx, w1.slice(0, 1) + (w2.slice(0, 1) || ''), 56, TOP_H / 2, 44, css(contrast(dark, look.accent)), { rot: -Math.PI / 2 });
  drawWordmark(ctx, w1.slice(0, 1) + (w2.slice(0, 1) || ''), TEX_W - 56, TOP_H / 2, 44, css(contrast(dark, look.accent)), { rot: Math.PI / 2 });
  // thin stringer
  ctx.fillStyle = rgba(ink, 0.5);
  ctx.fillRect(170, TOP_H - 26, TEX_W - 340, 3);
  // gloss sweep
  const gl = ctx.createLinearGradient(0, 0, 0, TOP_H);
  gl.addColorStop(0, 'rgba(255,255,255,0.1)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  gl.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, TEX_W, TOP_H);
  ctx.restore();
}

function paintWakeboardBase(ctx: Ctx, look: GearLook): void {
  ctx.save();
  clipTop(ctx);
  const bg = look.secondary;
  ctx.fillStyle = css(bg);
  ctx.fillRect(0, 0, TEX_W, TOP_H);
  paintGraphic(ctx, 0, 0, TEX_W, TOP_H, { primary: bg, secondary: look.primary, accent: look.accent, graphic: look.graphic === 'wood' || look.graphic === 'logo' ? 'plain' : look.graphic }, 9);
  // giant wordmark down the whole base — the money shot of every invert / grab
  const main = contrast(bg, look.primary);
  drawWordmark(ctx, BRAND.name, TEX_W / 2, TOP_H / 2 + 4, 150, css(main), { stroke: css(contrast(main, look.accent)), strokeW: 7, squeeze: 0.86 });
  // channels at the tips + centre line
  ctx.strokeStyle = rgba(0x000000, 0.35);
  ctx.lineWidth = 5;
  for (const x0 of [14, TEX_W - 14]) {
    const dir = x0 < 100 ? 1 : -1;
    for (const y of [62, 124, 186]) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + dir * 150, y);
      ctx.stroke();
    }
  }
  ctx.fillStyle = css(contrast(bg, look.accent));
  ctx.font = '700 17px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(BRAND.handle, TEX_W / 2, TOP_H - 18);
  ctx.restore();
}

function paintWakeskateTop(ctx: Ctx, look: GearLook): void {
  ctx.save();
  clipTop(ctx);
  // EVA grip: charcoal with speckle + diamond grooves, logo cut through to the deck colour
  ctx.fillStyle = '#1d1e21';
  ctx.fillRect(0, 0, TEX_W, TOP_H);
  const r = rng(41);
  for (let i = 0; i < 5200; i++) {
    const v = 20 + Math.floor(r() * 46);
    ctx.fillStyle = `rgb(${v},${v},${v + 2})`;
    ctx.fillRect(r() * TEX_W, r() * TOP_H, 1.6, 1.6);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  for (let x = -TOP_H; x < TEX_W + TOP_H; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + TOP_H, TOP_H);
    ctx.moveTo(x + TOP_H, 0);
    ctx.lineTo(x, TOP_H);
    ctx.stroke();
  }
  const cut = look.graphic === 'wood' ? mix(look.primary, 0xffffff, 0.1) : look.primary;
  drawWordmark(ctx, BRAND.name, TEX_W / 2, TOP_H / 2, 62, css(cut), { stroke: 'rgba(0,0,0,0.6)', strokeW: 5 });
  ctx.fillStyle = css(contrast(0x1d1e21, look.accent));
  ctx.fillRect(TEX_W / 2 - 150, TOP_H / 2 + 52, 300, 5);
  // kick markers
  ctx.fillStyle = rgba(contrast(0x1d1e21, look.accent), 0.9);
  ctx.fillRect(128, 30, 6, TOP_H - 60);
  ctx.fillRect(TEX_W - 134, 30, 6, TOP_H - 60);
  ctx.restore();
}

function paintWakeskateBase(ctx: Ctx, look: GearLook): void {
  ctx.save();
  clipTop(ctx);
  const wood = look.graphic === 'wood';
  if (wood) paintWood(ctx, 0, 0, TEX_W, TOP_H, look.primary, 12);
  else {
    ctx.fillStyle = css(look.primary);
    ctx.fillRect(0, 0, TEX_W, TOP_H);
    paintGraphic(ctx, 0, 0, TEX_W, TOP_H, look, 6);
  }
  const ink = wood ? shade(look.primary, -0.72) : contrast(look.primary, look.accent);
  drawWordmark(ctx, BRAND.name, TEX_W / 2, TOP_H / 2, 120, css(ink), { squeeze: 0.86, stroke: wood ? undefined : rgba(0x000000, 0.3), strokeW: 6 });
  // brand-colour bands near the kicks
  ctx.fillStyle = css(wood ? look.accent : contrast(look.primary, look.secondary));
  ctx.fillRect(96, 0, 22, TOP_H);
  ctx.fillRect(TEX_W - 118, 0, 22, TOP_H);
  ctx.fillStyle = css(wood ? look.secondary : contrast(look.primary, look.accent));
  ctx.fillRect(124, 0, 7, TOP_H);
  ctx.fillRect(TEX_W - 131, 0, 7, TOP_H);
  ctx.restore();
}
