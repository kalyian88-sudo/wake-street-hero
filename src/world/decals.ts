/**
 * Canvas-drawn decal textures: the WHY NOT wordmark in its variants, stickers, banners, made-up
 * shop signs (pseudo Thai / Chinese glyph blocks — no real writing, no real brands), the facade
 * atlas (windows, shutters, doors, shopfronts) and the procedural graffiti generator.
 *
 * Atlases are addressed through the *_UV tables: [u0, v0, u1, v1] with v up (three.js convention).
 */
import { BRAND } from '../config';
import { seededRng } from '../data/geometry';

export type UVRect = readonly [number, number, number, number];

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

/** Pixel rect (top-left origin) → uv rect (bottom-left origin), inset by half a texel against bleeding. */
function uvOf(x: number, y: number, w: number, h: number, W: number, H: number, inset = 1): UVRect {
  return [(x + inset) / W, 1 - (y + h - inset) / H, (x + w - inset) / W, 1 - (y + inset) / H];
}

const WORDMARK_FONT = 'italic 900 100px "Arial Narrow", "Helvetica Neue", "Roboto Condensed", Impact, "DejaVu Sans Condensed", Arial, sans-serif';

/**
 * The brand wordmark: bold condensed italic, fitted into the box (x, y, w, h). Exported so other
 * modules (share card, UI canvases) can draw the same logo.
 */
export function drawWordmark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, text: string = BRAND.name): void {
  ctx.save();
  ctx.font = WORDMARK_FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent || 72;
  const desc = m.actualBoundingBoxDescent || 0;
  const tw = (m.actualBoundingBoxRight || m.width) + (m.actualBoundingBoxLeft || 0);
  const th = asc + desc;
  const shear = -0.14;
  const sy = h / th;
  const sx = (w - Math.abs(shear) * h) / tw;
  ctx.translate(x + Math.abs(shear) * h * 0.5, y + h);
  ctx.transform(sx, 0, shear * sy, sy, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, m.actualBoundingBoxLeft || 0, -desc);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ───────────────────────────────────────────────────────────── brand atlas ──

const BW = 1024;
const BH = 512;
export const BRAND_UV = {
  /** Red wordmark, transparent background. */
  wmRed: uvOf(0, 0, 512, 128, BW, BH),
  wmWhite: uvOf(512, 0, 512, 128, BW, BH),
  wmDark: uvOf(512, 256, 512, 128, BW, BH),
  /** White wordmark on a red plate. */
  plateRed: uvOf(0, 128, 512, 128, BW, BH),
  plateDark: uvOf(512, 128, 512, 128, BW, BH),
  plateWhite: uvOf(0, 256, 512, 128, BW, BH),
  stickerRound: uvOf(0, 384, 128, 128, BW, BH),
  stickerStack: uvOf(128, 384, 128, 128, BW, BH),
  stickerQ: uvOf(256, 384, 128, 128, BW, BH),
  rec: uvOf(384, 384, 128, 128, BW, BH),
  start: uvOf(512, 384, 256, 128, BW, BH),
  finish: uvOf(768, 384, 256, 128, BW, BH),
} as const;
export type BrandDecal = keyof typeof BRAND_UV;

export function drawBrandAtlas(labels: { start: string; finish: string; rec: string }): HTMLCanvasElement {
  const [c, ctx] = canvas(BW, BH);
  const { red, dark, white } = BRAND.css;
  drawWordmark(ctx, 14, 14, 484, 100, red);
  drawWordmark(ctx, 526, 14, 484, 100, white);
  drawWordmark(ctx, 526, 270, 484, 100, dark);
  // plates
  ctx.fillStyle = red;
  roundRect(ctx, 4, 132, 504, 120, 14);
  ctx.fill();
  drawWordmark(ctx, 34, 154, 444, 76, white);
  ctx.fillStyle = dark;
  roundRect(ctx, 516, 132, 504, 120, 14);
  ctx.fill();
  drawWordmark(ctx, 546, 150, 444, 70, white);
  ctx.fillStyle = red;
  ctx.fillRect(546, 230, 444, 8);
  ctx.fillStyle = white;
  roundRect(ctx, 4, 260, 504, 120, 14);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 6;
  roundRect(ctx, 9, 265, 494, 110, 10);
  ctx.stroke();
  drawWordmark(ctx, 36, 284, 440, 72, red);
  // stickers
  ctx.fillStyle = red;
  ctx.beginPath();
  ctx.arc(64, 448, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = white;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 448, 52, 0, Math.PI * 2);
  ctx.stroke();
  drawWordmark(ctx, 20, 418, 88, 28, white, 'WHY');
  drawWordmark(ctx, 20, 452, 88, 28, white, 'NOT');
  ctx.fillStyle = dark;
  roundRect(ctx, 132, 388, 120, 120, 12);
  ctx.fill();
  drawWordmark(ctx, 144, 400, 96, 44, white, 'WHY');
  drawWordmark(ctx, 144, 452, 96, 44, red, 'NOT');
  ctx.fillStyle = white;
  roundRect(ctx, 260, 388, 120, 120, 60);
  ctx.fill();
  drawWordmark(ctx, 292, 404, 56, 88, red, '?!');
  // REC marker
  ctx.fillStyle = 'rgba(16,17,20,0.82)';
  roundRect(ctx, 388, 420, 120, 56, 12);
  ctx.fill();
  ctx.fillStyle = red;
  ctx.beginPath();
  ctx.arc(410, 448, 11, 0, Math.PI * 2);
  ctx.fill();
  drawWordmark(ctx, 428, 432, 70, 32, white, labels.rec);
  // start / finish plates
  ctx.fillStyle = white;
  roundRect(ctx, 516, 392, 248, 112, 10);
  ctx.fill();
  drawWordmark(ctx, 532, 412, 216, 72, dark, labels.start);
  ctx.fillStyle = red;
  roundRect(ctx, 772, 392, 248, 112, 10);
  ctx.fill();
  drawWordmark(ctx, 788, 412, 216, 72, white, labels.finish);
  return c;
}

// ─────────────────────────────────────────────────────────────── glyph signs ──

/** A made-up logogram: brush-like strokes on a square grid (reads as "Chinese-ish", means nothing). */
function hanGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const g = (v: number): number => Math.round(v * 4) / 4;
  const n = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const kind = rnd();
    ctx.lineWidth = s * (0.07 + rnd() * 0.05);
    ctx.beginPath();
    if (kind < 0.34) {
      const yy = y + s * (0.15 + g(rnd()) * 0.7);
      const a = 0.1 + rnd() * 0.2;
      ctx.moveTo(x + s * a, yy);
      ctx.lineTo(x + s * (1 - a * rnd()), yy - s * 0.03);
    } else if (kind < 0.62) {
      const xx = x + s * (0.2 + g(rnd()) * 0.6);
      ctx.moveTo(xx, y + s * (0.1 + rnd() * 0.2));
      ctx.lineTo(xx, y + s * (0.75 + rnd() * 0.17));
    } else if (kind < 0.8) {
      const dir = rnd() < 0.5 ? 1 : -1;
      ctx.moveTo(x + s * 0.5, y + s * (0.2 + rnd() * 0.3));
      ctx.quadraticCurveTo(x + s * (0.5 + dir * 0.15), y + s * 0.7, x + s * (0.5 + dir * 0.38), y + s * 0.9);
    } else if (kind < 0.92) {
      const bx = x + s * (0.2 + rnd() * 0.3);
      const by = y + s * (0.2 + rnd() * 0.35);
      const bs = s * (0.22 + rnd() * 0.14);
      ctx.rect(bx, by, bs, bs * 0.9);
    } else {
      const dx = x + s * (0.2 + rnd() * 0.6);
      const dy = y + s * (0.12 + rnd() * 0.2);
      ctx.moveTo(dx, dy);
      ctx.lineTo(dx + s * 0.06, dy + s * 0.08);
    }
    ctx.stroke();
  }
}

/** A made-up looped letter ("Thai-ish"): head loop, stem, arched top, optional tail / top mark. */
function loopGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = h * 0.085;
  const base = y + h * 0.86;
  const top = y + h * 0.34;
  const r = h * 0.07;
  const left = x + w * 0.2;
  const right = x + w * 0.8;
  const headLeft = rnd() < 0.6;
  ctx.beginPath();
  const hx = headLeft ? left : right;
  const hy = rnd() < 0.5 ? base - r : top + r * 1.4;
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hx, hy - r * (hy > (base + top) / 2 ? 1 : -1));
  ctx.lineTo(hx, hy > (base + top) / 2 ? top + h * 0.1 : base);
  if (hy > (base + top) / 2) {
    ctx.quadraticCurveTo(hx, top - h * 0.04, (left + right) / 2, top - h * 0.02);
    ctx.quadraticCurveTo(headLeft ? right : left, top, headLeft ? right : left, top + h * 0.16);
    ctx.lineTo(headLeft ? right : left, base);
  } else {
    ctx.quadraticCurveTo((left + right) / 2, base + h * 0.02, headLeft ? right : left, base - h * 0.1);
    ctx.lineTo(headLeft ? right : left, top);
  }
  if (rnd() < 0.4) ctx.lineTo((headLeft ? right : left) + w * 0.12 * (headLeft ? 1 : -1), base - h * (0.7 + rnd() * 0.2));
  ctx.stroke();
  if (rnd() < 0.45) {
    ctx.beginPath();
    const mx = x + w * (0.3 + rnd() * 0.4);
    ctx.moveTo(mx, y + h * 0.2);
    ctx.quadraticCurveTo(mx + w * 0.2, y + h * 0.06, mx + w * 0.34, y + h * 0.17);
    ctx.stroke();
  }
}

const SIGN_PALETTES: readonly (readonly [string, string, string])[] = [
  ['#8e1b16', '#f2c64b', '#f2c64b'],
  ['#15161a', '#e8c35a', '#b8862e'],
  ['#1f5f4a', '#f4efe2', '#d8b25a'],
  ['#efe4c8', '#b3221b', '#7a1a14'],
  ['#1d4d7a', '#f4f1e6', '#f4f1e6'],
  ['#3d2a1c', '#f0d48a', '#c79b3c'],
  ['#c9302a', '#fff4d6', '#ffd75a'],
  ['#e9e2d0', '#1c1d21', '#1c1d21'],
];

function drawBoard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, pal: readonly [string, string, string]): void {
  ctx.fillStyle = pal[0];
  ctx.fillRect(x, y, w, h);
  const vertical = h > w;
  ctx.strokeStyle = pal[2];
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.strokeStyle = pal[1];
  ctx.fillStyle = pal[1];
  const han = rnd() < 0.55;
  if (vertical) {
    const s = w - 20;
    const n = Math.floor((h - 20) / (s + 4));
    const y0 = y + (h - n * (s + 4)) / 2;
    for (let i = 0; i < n; i++) {
      if (han) hanGlyph(ctx, x + 10, y0 + i * (s + 4), s, rnd);
      else loopGlyph(ctx, x + 10, y0 + i * (s + 4), s, s, rnd);
    }
  } else {
    const s = h - 22;
    if (han) {
      const n = Math.max(2, Math.floor((w - 24) / (s + 6)) - Math.floor(rnd() * 2));
      const x0 = x + (w - n * (s + 6)) / 2;
      for (let i = 0; i < n; i++) hanGlyph(ctx, x0 + i * (s + 6) + 3, y + 11, s, rnd);
    } else {
      const gw = s * 0.62;
      const n = Math.floor((w - 28) / gw);
      const x0 = x + (w - n * gw) / 2;
      for (let i = 0; i < n; i++) loopGlyph(ctx, x0 + i * gw, y + 8, gw, s + 4, rnd);
    }
  }
  // sun-bleach / grime
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

const SW = 512;
const SH = 512;
/** Horizontal boards 4:1, vertical boards 1:4, square signs. */
export const SIGN_UV = {
  h: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => uvOf((i >> 2) * 256, (i & 3) * 64, 256, 64, SW, SH)),
  v: [0, 1, 2, 3].map((i) => uvOf(i * 64, 256, 64, 256, SW, SH)),
  sq: [0, 1, 2, 3].map((i) => uvOf(256 + (i & 1) * 128, 256 + (i >> 1) * 128, 128, 128, SW, SH)),
} as const;

export function drawSignAtlas(seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(SW, SH);
  const rnd = seededRng(seed);
  for (let i = 0; i < 8; i++) drawBoard(ctx, (i >> 2) * 256, (i & 3) * 64, 256, 64, rnd, SIGN_PALETTES[i % SIGN_PALETTES.length]);
  for (let i = 0; i < 4; i++) drawBoard(ctx, i * 64, 256, 64, 256, rnd, SIGN_PALETTES[(i * 3 + 1) % SIGN_PALETTES.length]);
  // generic street signs (no real symbols of brands)
  const sq = (i: number): [number, number] => [256 + (i & 1) * 128 + 64, 256 + (i >> 1) * 128 + 64];
  let [cx, cy] = sq(0);
  ctx.fillStyle = '#1d5fa8';
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + 34);
  ctx.lineTo(cx, cy - 30);
  ctx.moveTo(cx - 24, cy - 8);
  ctx.lineTo(cx, cy - 34);
  ctx.lineTo(cx + 24, cy - 8);
  ctx.stroke();
  [cx, cy] = sq(1);
  ctx.fillStyle = '#f0c020';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 60);
  ctx.lineTo(cx + 60, cy);
  ctx.lineTo(cx, cy + 60);
  ctx.lineTo(cx - 60, cy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1c1d21';
  ctx.lineWidth = 7;
  for (let k = -1; k <= 1; k++) {
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy + k * 16);
    ctx.bezierCurveTo(cx - 15, cy + k * 16 - 12, cx - 5, cy + k * 16 + 12, cx + 6, cy + k * 16);
    ctx.bezierCurveTo(cx + 14, cy + k * 16 - 10, cx + 22, cy + k * 16 + 10, cx + 30, cy + k * 16);
    ctx.stroke();
  }
  [cx, cy] = sq(2);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9211e';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, 50, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#1c1d21';
  drawWordmark(ctx, cx - 30, cy - 22, 60, 44, '#1c1d21', '20');
  [cx, cy] = sq(3);
  ctx.fillStyle = '#2b2118';
  ctx.fillRect(cx - 60, cy - 60, 120, 120);
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 6;
  ctx.strokeRect(cx - 57, cy - 57, 114, 114);
  ctx.strokeStyle = '#efe6cf';
  ctx.lineWidth = 3;
  for (let k = 0; k < 6; k++) {
    ctx.beginPath();
    ctx.moveTo(cx - 44, cy - 38 + k * 15);
    ctx.lineTo(cx - 44 + 40 + rnd() * 46, cy - 38 + k * 15);
    ctx.stroke();
  }
  return c;
}

// ───────────────────────────────────────────────────────────── facade atlas ──

const FW = 1024;
const FH = 512;
export const FACADE_UV = {
  /** Arched louvred windows (frame baked in), 4 shutter colours. */
  archLouvre: [0, 1, 2, 3].map((i) => uvOf(i * 128, 0, 128, 256, FW, FH)),
  archGlass: uvOf(512, 0, 128, 256, FW, FH),
  rectShutter: uvOf(640, 0, 128, 256, FW, FH),
  doorWood: uvOf(768, 0, 128, 256, FW, FH),
  doorGlass: uvOf(896, 0, 128, 256, FW, FH),
  shopRoller: uvOf(0, 256, 256, 256, FW, FH),
  shopGlass: uvOf(256, 256, 256, 256, FW, FH),
  /** Loose shutter leaves (for open shutters), same 4 colours. */
  leaf: [0, 1, 2, 3].map((i) => uvOf(512 + i * 64, 256, 64, 256, FW, FH)),
  rectGlass: uvOf(768, 256, 128, 128, FW, FH),
  rectGlassDark: uvOf(896, 256, 128, 128, FW, FH),
  vent: uvOf(768, 384, 128, 128, FW, FH),
  aircon: uvOf(896, 384, 128, 128, FW, FH),
} as const;

export const SHUTTER_COLORS: readonly string[] = ['#2f8f8a', '#6b4630', '#e9e6dc', '#2f5d3f'];

function louvres(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  const n = Math.max(4, Math.round(h / 7));
  for (let i = 0; i < n; i++) {
    const yy = y + (i / n) * h;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(x + 3, yy + (h / n) * 0.55, w - 6, (h / n) * 0.45);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x + 3, yy, w - 6, 1.2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function archPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function archWindow(ctx: CanvasRenderingContext2D, x: number, y: number, shutter: string | null): void {
  // white stucco surround
  ctx.fillStyle = '#f3efe6';
  archPath(ctx, x + 4, y + 4, 120, 250);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  archPath(ctx, x + 13, y + 13, 102, 230);
  ctx.fill();
  // opening
  ctx.save();
  archPath(ctx, x + 17, y + 17, 94, 222);
  ctx.clip();
  if (shutter) {
    louvres(ctx, x + 17, y + 68, 47, 172, shutter);
    louvres(ctx, x + 64, y + 68, 47, 172, shutter);
    // fanlight with radial bars
    ctx.fillStyle = '#16242c';
    ctx.fillRect(x + 17, y + 17, 94, 50);
    ctx.strokeStyle = shutter;
    ctx.lineWidth = 4;
    for (let k = 1; k < 5; k++) {
      const a = Math.PI + (k / 5) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x + 64, y + 66);
      ctx.lineTo(x + 64 + Math.cos(a) * 50, y + 66 + Math.sin(a) * 50);
      ctx.stroke();
    }
    ctx.fillStyle = shutter;
    ctx.fillRect(x + 17, y + 62, 94, 7);
  } else {
    const g = ctx.createLinearGradient(x, y, x + 128, y + 256);
    g.addColorStop(0, '#31515e');
    g.addColorStop(0.5, '#15252d');
    g.addColorStop(1, '#263c44');
    ctx.fillStyle = g;
    ctx.fillRect(x + 17, y + 17, 94, 222);
    ctx.strokeStyle = '#ece8dd';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 64, y + 17);
    ctx.lineTo(x + 64, y + 240);
    for (let k = 0; k < 3; k++) {
      ctx.moveTo(x + 17, y + 66 + k * 58);
      ctx.lineTo(x + 111, y + 66 + k * 58);
    }
    ctx.stroke();
  }
  ctx.restore();
  // sill
  ctx.fillStyle = '#e4dfd2';
  ctx.fillRect(x + 2, y + 240, 124, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 2, y + 251, 124, 3);
}

function door(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, glassTop: boolean): void {
  ctx.fillStyle = '#efeadf';
  ctx.fillRect(x + 2, y + 2, 124, 254);
  ctx.fillStyle = color;
  ctx.fillRect(x + 12, y + 12, 104, 244);
  for (let leaf = 0; leaf < 2; leaf++) {
    const lx = x + 14 + leaf * 51;
    for (let p = 0; p < 3; p++) {
      const py = y + 18 + p * 79;
      if (glassTop && p === 0) {
        ctx.fillStyle = '#1a2a33';
        ctx.fillRect(lx + 5, py, 39, 68);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(lx + 5, py, 19.5, 34);
        ctx.strokeRect(lx + 24.5, py + 34, 19.5, 34);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(lx + 5, py, 39, 68);
        ctx.fillStyle = color;
        ctx.fillRect(lx + 9, py + 4, 31, 60);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(lx + 9, py + 4, 31, 3);
      }
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x + 63, y + 12, 2, 244);
  ctx.fillStyle = '#c9a44a';
  ctx.beginPath();
  ctx.arc(x + 58, y + 140, 3.5, 0, Math.PI * 2);
  ctx.arc(x + 70, y + 140, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFacadeAtlas(seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(FW, FH);
  const rnd = seededRng(seed);
  for (let i = 0; i < 4; i++) archWindow(ctx, i * 128, 0, SHUTTER_COLORS[i]);
  archWindow(ctx, 512, 0, null);
  // rect shuttered window
  ctx.fillStyle = '#f0ece2';
  ctx.fillRect(644, 16, 120, 236);
  louvres(ctx, 656, 28, 48, 204, '#5d7f93');
  louvres(ctx, 704, 28, 48, 204, '#5d7f93');
  ctx.fillStyle = '#e2ddd0';
  ctx.fillRect(642, 238, 124, 14);
  door(ctx, 768, 0, '#5a3a26', false);
  door(ctx, 896, 0, '#2c7f7a', true);
  // roller shutter
  ctx.fillStyle = '#b9bcc0';
  ctx.fillRect(0, 256, 256, 256);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.10)';
    ctx.fillRect(6, 262 + i * 9.4, 244, 4.6);
  }
  ctx.fillStyle = 'rgba(60,40,20,0.25)';
  for (let i = 0; i < 9; i++) ctx.fillRect(10 + rnd() * 230, 262, 2 + rnd() * 5, 60 + rnd() * 180);
  ctx.strokeStyle = '#6c6f74';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 260, 248, 248);
  // glass shopfront: timber frame, dim interior, warm bulbs, shelves
  const g = ctx.createLinearGradient(256, 256, 256, 512);
  g.addColorStop(0, '#2a2018');
  g.addColorStop(1, '#0f0c0a');
  ctx.fillStyle = g;
  ctx.fillRect(256, 256, 256, 256);
  for (let s = 0; s < 3; s++) {
    ctx.fillStyle = '#4a3622';
    ctx.fillRect(272, 330 + s * 48, 224, 5);
    for (let k = 0; k < 9; k++) {
      ctx.fillStyle = ['#b84a32', '#d9b25a', '#4d8a80', '#e6dfcf', '#7a4a8a'][Math.floor(rnd() * 5)];
      const bw = 10 + rnd() * 12;
      const bh = 12 + rnd() * 22;
      ctx.fillRect(278 + k * 24 + rnd() * 4, 330 + s * 48 - bh, bw, bh);
    }
  }
  for (let k = 0; k < 4; k++) {
    const bx = 296 + k * 58;
    const rg = ctx.createRadialGradient(bx, 292, 1, bx, 292, 30);
    rg.addColorStop(0, 'rgba(255,214,140,0.95)');
    rg.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(bx - 30, 262, 60, 60);
  }
  ctx.strokeStyle = '#5c4630';
  ctx.lineWidth = 10;
  ctx.strokeRect(261, 261, 246, 246);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(384, 256);
  ctx.lineTo(384, 512);
  ctx.stroke();
  // loose shutter leaves
  for (let i = 0; i < 4; i++) louvres(ctx, 512 + i * 64 + 2, 258, 60, 252, SHUTTER_COLORS[i]);
  // small rect windows
  for (let i = 0; i < 2; i++) {
    const x = 768 + i * 128;
    ctx.fillStyle = '#eeeadf';
    ctx.fillRect(x + 4, 260, 120, 120);
    const gg = ctx.createLinearGradient(x, 256, x + 128, 384);
    gg.addColorStop(0, i ? '#1b262c' : '#3d6170');
    gg.addColorStop(1, i ? '#0d1418' : '#1a2e36');
    ctx.fillStyle = gg;
    ctx.fillRect(x + 16, 272, 96, 96);
    ctx.strokeStyle = '#eeeadf';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 64, 272);
    ctx.lineTo(x + 64, 368);
    ctx.moveTo(x + 16, 320);
    ctx.lineTo(x + 112, 320);
    ctx.stroke();
  }
  // vent grille + air-con box
  ctx.fillStyle = '#cfcbc0';
  ctx.fillRect(788, 404, 88, 88);
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(794, 410 + i * 9, 76, 4);
  }
  ctx.fillStyle = '#dcdcd6';
  ctx.fillRect(900, 396, 120, 104);
  ctx.fillStyle = '#9a9c98';
  ctx.beginPath();
  ctx.arc(946, 448, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5c5e5c';
  ctx.lineWidth = 3;
  for (let k = 0; k < 8; k++) {
    ctx.beginPath();
    ctx.moveTo(946, 448);
    ctx.lineTo(946 + Math.cos(k * 0.785) * 36, 448 + Math.sin(k * 0.785) * 36);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 7; i++) ctx.fillRect(992, 404 + i * 13, 22, 6);
  return c;
}

// ──────────────────────────────────────────────────────────────── graffiti ──

const SPRAY = ['#e30613', '#ffffff', '#19c2c9', '#ffd22e', '#ff6f1e', '#7c3aed', '#31d17c', '#ff4fa3', '#1c1d21'];

function tag(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.09;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let px = x;
  let py = y;
  ctx.moveTo(px, py);
  const n = 5 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const nx = px + s * (0.25 + rnd() * 0.35);
    const ny = y + (rnd() - 0.5) * s;
    ctx.bezierCurveTo(px + s * 0.3, py - s * (rnd() - 0.2), nx - s * 0.3, ny + s * (rnd() - 0.5), nx, ny);
    px = nx;
    py = ny;
  }
  ctx.stroke();
  // underline swoosh + drip
  ctx.beginPath();
  ctx.moveTo(x - s * 0.1, y + s * 0.62);
  ctx.quadraticCurveTo((x + px) / 2, y + s * 0.9, px + s * 0.2, y + s * 0.5);
  ctx.stroke();
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  const dx = x + (px - x) * rnd();
  ctx.moveTo(dx, y + s * 0.7);
  ctx.lineTo(dx, y + s * (1 + rnd() * 0.8));
  ctx.stroke();
}

/**
 * A spray-painted wall piece on a transparent background. `piece` is the big word (bubble letters
 * with outline, 3D block shadow, shine and drips); smaller throw-ups and tags fill the rest.
 */
export function drawGraffiti(seed: number, w = 1024, h = 256, piece: string = BRAND.name): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  const rnd = seededRng(seed);
  // background colour clouds
  for (let i = 0; i < 16; i++) {
    const cx = w * (0.18 + rnd() * 0.64);
    const cy = h * (0.3 + rnd() * 0.45);
    const r = h * (0.22 + rnd() * 0.25);
    const col = SPRAY[2 + Math.floor(rnd() * 3)];
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, col + 'cc');
    g.addColorStop(0.75, col + '88');
    g.addColorStop(1, col + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // the piece: letters drawn one by one with jitter
  const letters = piece.split('');
  const pw = w * 0.62;
  const x0 = w * 0.19;
  const lh = h * 0.6;
  const baseY = h * 0.8;
  ctx.font = `italic 900 ${lh}px "Arial Narrow", "Helvetica Neue", Impact, "DejaVu Sans Condensed", Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  const total = letters.reduce((s, ch) => s + (ch === ' ' ? lh * 0.25 : ctx.measureText(ch).width), 0);
  const sx = pw / total;
  const pass = (fn: (ch: string, cx: number, cy: number, rot: number, i: number) => void): void => {
    const r2 = seededRng(seed + 77);
    let x = x0;
    letters.forEach((ch, i) => {
      const cw = (ch === ' ' ? lh * 0.25 : ctx.measureText(ch).width) * sx;
      const rot = (r2() - 0.5) * 0.16;
      const cy = baseY + (r2() - 0.5) * h * 0.1;
      if (ch !== ' ') fn(ch, x + cw / 2, cy, rot, i);
      x += cw;
    });
  };
  const draw = (ch: string, cx: number, cy: number, rot: number, f: () => void): void => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(sx * 1.12, 1);
    f();
    ctx.restore();
    void ch;
  };
  // 3D block shadow
  pass((ch, cx, cy, rot) => {
    for (let k = 10; k >= 1; k--) {
      draw(ch, cx + k * 1.6, cy + k * 1.4, rot, () => {
        ctx.fillStyle = '#1c1d21';
        ctx.strokeStyle = '#1c1d21';
        ctx.lineWidth = 16;
        ctx.strokeText(ch, 0, 0);
      });
    }
  });
  // fat dark outline, white inner outline, gradient fill
  pass((ch, cx, cy, rot) =>
    draw(ch, cx, cy, rot, () => {
      ctx.strokeStyle = '#101114';
      ctx.lineWidth = 22;
      ctx.strokeText(ch, 0, 0);
    }),
  );
  pass((ch, cx, cy, rot) =>
    draw(ch, cx, cy, rot, () => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 11;
      ctx.strokeText(ch, 0, 0);
    }),
  );
  pass((ch, cx, cy, rot, i) =>
    draw(ch, cx, cy, rot, () => {
      const g = ctx.createLinearGradient(0, -lh * 0.8, 0, 0);
      g.addColorStop(0, i % 2 ? '#ff5a3c' : '#ff2a2a');
      g.addColorStop(0.55, '#e30613');
      g.addColorStop(1, '#8f0410');
      ctx.fillStyle = g;
      ctx.fillText(ch, 0, 0);
      // shine
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(-lh * 0.12, -lh * 0.62, lh * 0.2, lh * 0.05, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }),
  );
  // drips from the piece
  for (let i = 0; i < 9; i++) {
    const dx = x0 + rnd() * pw;
    const len = h * (0.05 + rnd() * 0.16);
    ctx.strokeStyle = rnd() < 0.5 ? '#101114' : '#e30613';
    ctx.lineWidth = 2.5 + rnd() * 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(dx, baseY - 2);
    ctx.lineTo(dx, Math.min(h - 3, baseY + len));
    ctx.stroke();
  }
  // stars / sparkles
  for (let i = 0; i < 7; i++) {
    const sx2 = w * (0.15 + rnd() * 0.7);
    const sy2 = h * (0.08 + rnd() * 0.25);
    const sr = h * (0.03 + rnd() * 0.04);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rr = k % 2 ? sr * 0.35 : sr;
      ctx.lineTo(sx2 + Math.cos(a) * rr, sy2 + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  // side tags and small throw-ups
  for (let i = 0; i < 7; i++) {
    const left = i % 2 === 0;
    const tx = left ? w * (0.01 + rnd() * 0.1) : w * (0.84 + rnd() * 0.06);
    const ty = h * (0.2 + rnd() * 0.6);
    tag(ctx, tx, ty, h * (0.1 + rnd() * 0.1), rnd, SPRAY[Math.floor(rnd() * SPRAY.length)]);
  }
  ctx.font = `italic 900 ${h * 0.16}px "Arial Narrow", Impact, Arial, sans-serif`;
  ctx.fillStyle = '#ffd22e';
  ctx.strokeStyle = '#101114';
  ctx.lineWidth = 5;
  ctx.save();
  ctx.translate(w * 0.09, h * 0.2);
  ctx.rotate(-0.12);
  ctx.strokeText('?!', 0, 0);
  ctx.fillText('?!', 0, 0);
  ctx.restore();
  return c;
}

/** Scrape / wax streaks along a grind edge (transparent, tiles along U). */
export function drawScrapes(seed: number, w = 256, h = 64): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  const rnd = seededRng(seed);
  for (let i = 0; i < 90; i++) {
    const y = Math.pow(rnd(), 2.2) * h;
    const x = rnd() * w;
    const len = 20 + rnd() * 120;
    const dark = rnd() < 0.7;
    ctx.strokeStyle = dark ? `rgba(20,20,22,${0.1 + rnd() * 0.3})` : `rgba(235,235,225,${0.08 + rnd() * 0.2})`;
    ctx.lineWidth = 0.6 + rnd() * 2.4;
    for (const off of [-w, 0, w]) {
      ctx.beginPath();
      ctx.moveTo(x + off, y);
      ctx.lineTo(x + off + len, y + (rnd() - 0.5) * 2);
      ctx.stroke();
    }
  }
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(30,30,34,0.5)');
  g.addColorStop(0.35, 'rgba(30,30,34,0.14)');
  g.addColorStop(1, 'rgba(30,30,34,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/** Chevron arrows for the line preview ribbon (tiles along V, arrows point to +V). */
export function drawChevrons(w = 64, h = 128): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const off of [0, h]) {
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(10, off - h * 0.28 + h);
    ctx.lineTo(w / 2, off - h * 0.52 + h);
    ctx.lineTo(w - 10, off - h * 0.28 + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, off - h * 0.28);
    ctx.lineTo(w / 2, off - h * 0.52);
    ctx.lineTo(w - 10, off - h * 0.28);
    ctx.stroke();
  }
  return c;
}

/** Soft round glow sprite. */
export function drawGlow(size = 64): HTMLCanvasElement {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

// ──────────────────────────────────────────────────── Phuket Old Town atlas ──
// Sino-Portuguese detail for the 'phuket' theme: Chinese-style shop boards, lit window interiors,
// stucco window frames / reliefs / cartouches, quay masonry and peeling plaster patches.
// Used by the 'phuketDecor' (lit, alpha-cut) and 'phuketGlow' (unlit HDR, alpha-cut) materials.

const PW = 1024;
const PH = 1024;
export const PHUKET_UV = {
  /** Horizontal shop boards 512×96 (≈ 5.3 : 1). */
  hSign: [0, 1, 2, 3].map((i) => uvOf((i & 1) * 512, (i >> 1) * 96, 512, 96, PW, PH)),
  /** Vertical blade boards 64×320 (1 : 5). */
  vSign: [0, 1, 2, 3, 4, 5].map((i) => uvOf(i * 64, 192, 64, 320, PW, PH)),
  /** Warm interiors behind an arched opening — same framing as FACADE_UV.archLouvre (glow material). */
  litInterior: [0, 1, 2].map((i) => uvOf(384 + i * 128, 192, 128, 256, PW, PH)),
  /** Stucco arch surround with an empty opening (sits in front of litInterior). */
  archFrame: uvOf(768, 192, 128, 256, PW, PH),
  /** Round stucco medallion and a framed cartouche. */
  medallion: uvOf(896, 192, 128, 128, PW, PH),
  cartouche: uvOf(896, 320, 128, 128, PW, PH),
  /** Floral stucco frieze band (8 : 1). */
  frieze: uvOf(384, 448, 512, 64, PW, PH),
  /** Quay masonry: bevelled granite blocks, weathered (6 m × 1.5 m, tiles horizontally). */
  quayStone: uvOf(0, 512, 1024, 256, PW, PH, 0),
  /** Peeling plaster patches exposing brick (irregular, alpha cut). */
  peel: [0, 1, 2, 3].map((i) => uvOf(i * 128, 768, 128, 128, PW, PH)),
  /** Parapet name plate with scrolls (2 : 1). */
  gablePlate: uvOf(512, 768, 256, 128, PW, PH),
  /** Ventilation grille block (2 : 1). */
  breeze: uvOf(768, 768, 256, 128, PW, PH),
  /** Lit shop interiors (2 : 1, glow material). */
  litShop: [0, 1].map((i) => uvOf(i * 256, 896, 256, 128, PW, PH)),
  /** Red / gold paper lantern side view (glow material). */
  lantern: uvOf(512, 896, 128, 128, PW, PH),
} as const;

const CN_BOARDS: readonly (readonly [string, string, string])[] = [
  ['#8e1b16', '#f2c64b', '#e0a83a'],
  ['#15161a', '#e8c35a', '#b8862e'],
  ['#1f4f3e', '#f0d48a', '#d8b25a'],
  ['#efe4c8', '#9e1d17', '#7a1a14'],
  ['#5a1d12', '#f6dc90', '#d8a440'],
  ['#1d3d62', '#f4e7c2', '#d8b25a'],
];

function cnBoard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, pal: readonly [string, string, string]): void {
  // lacquered board: bevelled border, gilt inner line, glyph row, weathered varnish
  ctx.fillStyle = pal[0];
  ctx.fillRect(x, y, w, h);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 5;
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  ctx.strokeStyle = pal[2];
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
  // corner ornaments
  ctx.fillStyle = pal[2];
  for (const [cx, cy] of [[x + 8, y + 8], [x + w - 8, y + 8], [x + 8, y + h - 8], [x + w - 8, y + h - 8]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = pal[1];
  ctx.fillStyle = pal[1];
  const vertical = h > w;
  if (vertical) {
    const s = w - 24;
    const n = Math.floor((h - 30) / (s + 6));
    const y0 = y + (h - n * (s + 6)) / 2;
    for (let i = 0; i < n; i++) hanGlyph(ctx, x + 12, y0 + i * (s + 6), s, rnd);
  } else {
    const s = h - 34;
    const thai = rnd() < 0.3;
    if (thai) {
      const gw = s * 0.62;
      const n = Math.floor((w - 60) / gw);
      const x0 = x + (w - n * gw) / 2;
      for (let i = 0; i < n; i++) loopGlyph(ctx, x0 + i * gw, y + 14, gw, s + 4, rnd);
    } else {
      const n = 3 + Math.floor(rnd() * 3);
      const gap = (w - 70 - n * s) / Math.max(1, n - 1);
      for (let i = 0; i < n; i++) hanGlyph(ctx, x + 35 + i * (s + gap), y + 17, s, rnd);
      // small latin-free sub line of tiny glyph dashes
    }
  }
  // sun-faded / chipped varnish
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,240,210,0.10)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 10, 1 + rnd() * 3);
  }
}

function interior(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, variant: number): void {
  // warm lamp-lit room: back wall gradient, ceiling lamp, furniture silhouettes, curtain
  const g = ctx.createRadialGradient(x + w * 0.5, y + h * 0.3, 2, x + w * 0.5, y + h * 0.45, h * 0.75);
  const warm = [['#fff1c4', '#f2a64a', '#5a2a12'], ['#ffe2a8', '#e88a3a', '#4a2010'], ['#fff6dc', '#f0b860', '#6a3a1a']][variant % 3];
  g.addColorStop(0, warm[0]);
  g.addColorStop(0.45, warm[1]);
  g.addColorStop(1, warm[2]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(40,18,8,0.55)';
  if (variant === 0) {
    // shelf with jars
    ctx.fillRect(x, y + h * 0.62, w, h * 0.05);
    for (let k = 0; k < 5; k++) ctx.fillRect(x + 6 + k * (w / 5), y + h * 0.53, w / 9, h * 0.09);
  } else if (variant === 1) {
    // a person silhouette + chair
    ctx.beginPath();
    ctx.arc(x + w * 0.62, y + h * 0.5, w * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + w * 0.52, y + h * 0.56, w * 0.2, h * 0.3);
  } else {
    // ceiling fan + hanging plant
    ctx.fillRect(x + w * 0.2, y + h * 0.22, w * 0.6, 3);
    ctx.fillRect(x + w * 0.49, y + h * 0.15, 3, h * 0.08);
  }
  // pendant lamp
  ctx.fillStyle = 'rgba(255,255,240,0.95)';
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.32, w * 0.06, 0, Math.PI * 2);
  ctx.fill();
  // curtain on one side
  ctx.fillStyle = ['rgba(190,40,30,0.75)', 'rgba(240,220,180,0.7)', 'rgba(60,110,90,0.7)'][Math.floor(rnd() * 3)];
  const left = rnd() < 0.5;
  ctx.beginPath();
  const cx0 = left ? x : x + w;
  const cx1 = left ? x + w * 0.32 : x + w * 0.68;
  ctx.moveTo(cx0, y);
  ctx.lineTo(cx1, y);
  ctx.quadraticCurveTo(left ? x + w * 0.12 : x + w * 0.88, y + h * 0.55, cx1 - (left ? 6 : -6), y + h);
  ctx.lineTo(cx0, y + h);
  ctx.closePath();
  ctx.fill();
}

function arch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = w / 2;
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function stoneQuay(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number): void {
  // 4 courses of bevelled granite blocks; horizontally periodic (joints never cross the seam)
  const courses = 4;
  const ch = h / courses;
  for (let c = 0; c < courses; c++) {
    const cy = y + c * ch;
    let bx = x;
    const off = (c % 2) * 0.5;
    const n = 7 + (c % 2);
    const widths: number[] = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = 0.75 + rnd() * 0.5;
      widths.push(v);
      sum += v;
    }
    bx = x - off * (w / n);
    for (let i = 0; i <= n; i++) {
      const bw = (widths[i % n] / sum) * w;
      const tone = 128 + Math.floor(rnd() * 44) - c * 6;
      const warm = Math.floor(rnd() * 14);
      const base = `rgb(${tone + warm},${tone + warm * 0.5},${tone - 8})`;
      for (const sx of [0, w]) {
        const px = bx - sx;
        if (px > x + w || px + bw < x) continue;
        ctx.fillStyle = base;
        ctx.fillRect(px + 3, cy + 3, bw - 6, ch - 6);
        // bevels: light top/left, dark bottom/right
        ctx.fillStyle = 'rgba(255,248,230,0.32)';
        ctx.fillRect(px + 3, cy + 3, bw - 6, 5);
        ctx.fillRect(px + 3, cy + 3, 4, ch - 6);
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(px + 3, cy + ch - 9, bw - 6, 6);
        ctx.fillRect(px + bw - 8, cy + 3, 5, ch - 6);
        // pitting / lichen specks
        for (let k = 0; k < 40; k++) {
          ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.08)';
          ctx.fillRect(px + 6 + rnd() * (bw - 12), cy + 8 + rnd() * (ch - 18), 1 + rnd() * 3, 1 + rnd() * 2);
        }
        if (rnd() < 0.3) {
          ctx.fillStyle = 'rgba(90,100,60,0.25)';
          ctx.beginPath();
          ctx.ellipse(px + bw * (0.2 + rnd() * 0.6), cy + ch * (0.3 + rnd() * 0.5), 6 + rnd() * 16, 3 + rnd() * 8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      bx += bw;
    }
    // mortar line
    ctx.fillStyle = 'rgba(40,36,30,0.85)';
    ctx.fillRect(x, cy, w, 3);
  }
  // water staining increasing towards the bottom
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(30,34,24,0.12)');
  g.addColorStop(1, 'rgba(20,28,18,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 60; i++) {
    const sx = x + rnd() * w;
    const sw = 2 + rnd() * 7;
    const sl = h * (0.2 + rnd() * 0.6);
    const sg = ctx.createLinearGradient(sx, y, sx, y + sl);
    sg.addColorStop(0, 'rgba(25,22,16,0.22)');
    sg.addColorStop(1, 'rgba(25,22,16,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx, y, sw, sl);
  }
}

export function drawPhuketAtlas(seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(PW, PH);
  const rnd = seededRng(seed);
  for (let i = 0; i < 4; i++) cnBoard(ctx, (i & 1) * 512, (i >> 1) * 96, 512, 96, rnd, CN_BOARDS[i]);
  for (let i = 0; i < 6; i++) cnBoard(ctx, i * 64, 192, 64, 320, rnd, CN_BOARDS[(i + 2) % CN_BOARDS.length]);
  // lit interiors, clipped to the arch opening used by FACADE_UV.archLouvre (17..111 × 17..239)
  for (let i = 0; i < 3; i++) {
    const x = 384 + i * 128;
    ctx.save();
    ctx.beginPath();
    arch(ctx, x + 14, 192 + 14, 100, 228);
    ctx.clip();
    interior(ctx, x + 14, 192 + 14, 100, 228, rnd, i);
    // window bars + glazing bars
    ctx.strokeStyle = 'rgba(60,40,24,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 64, 192 + 14);
    ctx.lineTo(x + 64, 192 + 242);
    ctx.moveTo(x + 14, 192 + 66);
    ctx.lineTo(x + 114, 192 + 66);
    ctx.stroke();
    ctx.restore();
  }
  // stucco arch surround with keystone, empty opening
  {
    const x = 768;
    const y = 192;
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath();
    arch(ctx, x + 2, y + 2, 124, 252);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.beginPath();
    arch(ctx, x + 10, y + 10, 108, 236);
    ctx.fill();
    ctx.fillStyle = '#ebe5d8';
    ctx.beginPath();
    arch(ctx, x + 13, y + 13, 102, 232);
    ctx.fill();
    // keystone
    ctx.fillStyle = '#fbf7ee';
    ctx.beginPath();
    ctx.moveTo(x + 54, y + 2);
    ctx.lineTo(x + 74, y + 2);
    ctx.lineTo(x + 70, y + 24);
    ctx.lineTo(x + 58, y + 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x + 58, y + 22, 12, 2);
    // cut the opening
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    arch(ctx, x + 17, y + 17, 94, 222);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#e4dfd2';
    ctx.fillRect(x + 2, y + 240, 124, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 2, y + 251, 124, 3);
  }
  // medallion
  {
    const cx = 960;
    const cy = 256;
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 50, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ctx.fillStyle = k % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28, 14, 7, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#c9a44a';
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  // cartouche with a glyph pair
  {
    const x = 896;
    const y = 320;
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath();
    ctx.ellipse(x + 64, y + 64, 60, 56, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c6a5a';
    ctx.beginPath();
    ctx.ellipse(x + 64, y + 64, 46, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e8c35a';
    ctx.fillStyle = '#e8c35a';
    hanGlyph(ctx, x + 28, y + 40, 34, rnd);
    hanGlyph(ctx, x + 66, y + 40, 34, rnd);
  }
  // floral frieze (tiles horizontally)
  {
    const x = 384;
    const y = 448;
    ctx.fillStyle = '#f1ece0';
    ctx.fillRect(x, y, 512, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(x, y + 6, 512, 3);
    ctx.fillRect(x, y + 55, 512, 3);
    for (let k = 0; k < 8; k++) {
      const cx = x + 32 + k * 64;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 32, y + 32);
      ctx.bezierCurveTo(cx - 16, y + 12, cx - 8, y + 52, cx, y + 32);
      ctx.bezierCurveTo(cx + 8, y + 12, cx + 16, y + 52, cx + 32, y + 32);
      ctx.stroke();
      ctx.fillStyle = k % 2 ? '#c9564a' : '#3f8f7a';
      ctx.beginPath();
      ctx.arc(cx, y + 32, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(cx - 2, y + 30, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // breeze / vent tiles (Phuket ceramic grille) beside: 896..1024 × 448..512 left empty
  stoneQuay(ctx, 0, 512, 1024, 256, rnd);
  // peeling plaster patches showing brick
  for (let i = 0; i < 4; i++) {
    const x = i * 128;
    const y = 768;
    ctx.save();
    ctx.beginPath();
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = 34 + rnd() * 26;
      const px = x + 64 + Math.cos(a) * r;
      const py = y + 64 + Math.sin(a) * r * 0.8;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#d9d2c2';
    ctx.fill();
    ctx.clip();
    // brick courses
    for (let r = 0; r < 10; r++) {
      for (let b = -1; b < 6; b++) {
        const bx = x + b * 26 + (r % 2) * 13;
        const tone = 140 + Math.floor(rnd() * 40);
        ctx.fillStyle = `rgb(${tone + 40},${tone - 30},${tone - 60})`;
        ctx.fillRect(bx + 1, y + r * 13 + 1, 24, 11);
      }
    }
    ctx.restore();
    // ragged plaster edge (lighter rim + shadow)
    ctx.strokeStyle = 'rgba(250,246,236,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  // parapet name plate with scrolls
  {
    const x = 512;
    const y = 768;
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 120);
    ctx.lineTo(x + 8, y + 50);
    ctx.quadraticCurveTo(x + 40, y + 50, x + 60, y + 24);
    ctx.quadraticCurveTo(x + 128, y - 6, x + 196, y + 24);
    ctx.quadraticCurveTo(x + 216, y + 50, x + 248, y + 50);
    ctx.lineTo(x + 248, y + 120);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#9e2a22';
    ctx.fillRect(x + 50, y + 52, 156, 52);
    ctx.strokeStyle = '#e8c35a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 54, y + 56, 148, 44);
    ctx.fillStyle = '#e8c35a';
    ctx.strokeStyle = '#e8c35a';
    for (let k = 0; k < 4; k++) hanGlyph(ctx, x + 62 + k * 36, y + 60, 32, rnd);
    for (const sx of [x + 28, x + 228]) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, y + 84, 12, 0, Math.PI * 1.6);
      ctx.stroke();
    }
  }
  // ceramic breeze-block grille
  {
    const x = 768;
    const y = 768;
    ctx.fillStyle = '#e9e3d3';
    ctx.fillRect(x, y, 256, 128);
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 8; k++) {
        const cx = x + 16 + k * 32;
        const cy = y + 16 + r * 32;
        ctx.fillStyle = '#2a2420';
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e9e3d3';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 11);
        ctx.lineTo(cx + 3, cy);
        ctx.lineTo(cx, cy + 11);
        ctx.lineTo(cx - 3, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  // lit shop interiors
  for (let i = 0; i < 2; i++) {
    const x = i * 256;
    const y = 896;
    const g = ctx.createLinearGradient(x, y, x, y + 128);
    g.addColorStop(0, '#ffe7b0');
    g.addColorStop(0.5, '#e8a050');
    g.addColorStop(1, '#6a3818');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 256, 128);
    for (let s = 0; s < 3; s++) {
      ctx.fillStyle = 'rgba(70,36,14,0.8)';
      ctx.fillRect(x + 8, y + 40 + s * 30, 240, 4);
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = ['#c84a32', '#e9c25a', '#3d8a7a', '#f2ecdc', '#8a4a9a', '#d8702a'][Math.floor(rnd() * 6)];
        const bh = 8 + rnd() * 16;
        ctx.fillRect(x + 12 + k * 17, y + 40 + s * 30 - bh, 9 + rnd() * 5, bh);
      }
    }
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = 'rgba(255,255,236,1)';
      ctx.beginPath();
      ctx.arc(x + 48 + k * 80, y + 14, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (i === 1) {
      // shopkeeper silhouette at the counter
      ctx.fillStyle = 'rgba(30,14,6,0.8)';
      ctx.beginPath();
      ctx.arc(x + 170, y + 62, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + 158, y + 72, 24, 40);
      ctx.fillRect(x + 110, y + 100, 120, 28);
    }
  }
  // paper lantern
  {
    const cx = 576;
    const cy = 960;
    const g = ctx.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, 56);
    g.addColorStop(0, '#ffd27a');
    g.addColorStop(0.5, '#f0401c');
    g.addColorStop(1, '#9a1208');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 52, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,20,6,0.6)';
    ctx.lineWidth = 2;
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(k) * 15 + 2, 44, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8c35a';
    ctx.fillRect(cx - 22, cy - 50, 44, 8);
    ctx.fillRect(cx - 22, cy + 42, 44, 8);
  }
  return c;
}

// ───────────────────────────────────────────────────────── grime atlas ──
// Soft, transparent dirt for the 'grime' material: rain streaks, damp bottom band, waterline algae,
// soot blots and rust drips. Multiplies nothing — it is plain alpha-blended dark paint.

const GW = 512;
const GH = 512;
export const GRIME_UV = {
  /** Streaks hanging down from the top edge (under cornices / sills). */
  streaks: uvOf(0, 0, 256, 256, GW, GH),
  /** Rising damp: dark at the bottom, ragged edge fading upwards. */
  damp: uvOf(256, 0, 256, 256, GW, GH),
  /** Waterline algae band (tiles horizontally): dark green at the bottom, fading up. */
  algae: uvOf(0, 256, 512, 128, GW, GH, 0),
  /** Round soft soot blot. */
  blot: uvOf(0, 384, 256, 128, GW, GH),
  /** Rust drip trails (under air-cons / brackets). */
  drip: uvOf(256, 384, 256, 128, GW, GH),
} as const;

export function drawGrimeAtlas(seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(GW, GH);
  const rnd = seededRng(seed);
  // streaks
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 250;
    const w = 3 + rnd() * 16;
    const l = 40 + rnd() * 210;
    const a = 0.1 + rnd() * 0.25;
    const g = ctx.createLinearGradient(0, 0, 0, l);
    g.addColorStop(0, `rgba(42,36,28,${a})`);
    g.addColorStop(1, 'rgba(42,36,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, l);
  }
  {
    const g = ctx.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, 'rgba(36,30,24,0.4)');
    g.addColorStop(1, 'rgba(36,30,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 40);
  }
  // rising damp
  {
    ctx.save();
    ctx.beginPath();
    ctx.rect(256, 0, 256, 256);
    ctx.clip();
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      ctx.moveTo(256, 256);
      const base = 120 + layer * 40;
      for (let x = 0; x <= 256; x += 8) {
        const y = base + Math.sin(x * 0.05 + layer * 2 + rnd()) * 14 + rnd() * 18;
        ctx.lineTo(256 + x, y);
      }
      ctx.lineTo(512, 256);
      ctx.closePath();
      ctx.fillStyle = `rgba(48,40,30,${0.12 + layer * 0.1})`;
      ctx.fill();
    }
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = 'rgba(48,40,30,0.12)';
      ctx.beginPath();
      ctx.ellipse(256 + rnd() * 256, 150 + rnd() * 100, 8 + rnd() * 30, 4 + rnd() * 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // algae band (periodic in x)
  {
    const y0 = 256;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + 128);
    g.addColorStop(0, 'rgba(40,58,30,0)');
    g.addColorStop(0.45, 'rgba(46,64,32,0.35)');
    g.addColorStop(0.8, 'rgba(34,48,24,0.75)');
    g.addColorStop(1, 'rgba(24,34,18,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, 512, 128);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * 512;
      const w = 4 + rnd() * 14;
      const top = y0 + 20 + rnd() * 50;
      const sg = ctx.createLinearGradient(0, top, 0, y0 + 128);
      sg.addColorStop(0, 'rgba(30,46,22,0)');
      sg.addColorStop(1, 'rgba(30,46,22,0.45)');
      ctx.fillStyle = sg;
      for (const off of [0, -512, 512]) ctx.fillRect(x + off, top, w, y0 + 128 - top);
    }
    // bright wet line
    ctx.fillStyle = 'rgba(200,220,200,0.12)';
    ctx.fillRect(0, y0 + 118, 512, 3);
  }
  // soot blot
  {
    const g = ctx.createRadialGradient(128, 448, 4, 128, 448, 62);
    g.addColorStop(0, 'rgba(30,26,22,0.55)');
    g.addColorStop(1, 'rgba(30,26,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 384, 256, 128);
  }
  // rust drips
  for (let i = 0; i < 9; i++) {
    const x = 270 + rnd() * 228;
    const l = 40 + rnd() * 84;
    const g = ctx.createLinearGradient(0, 384, 0, 384 + l);
    g.addColorStop(0, 'rgba(120,62,28,0.55)');
    g.addColorStop(1, 'rgba(120,62,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 384, 3 + rnd() * 6, l);
  }
  return c;
}
