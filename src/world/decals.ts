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
  ctx.fillStyle = '#4a443a';
  ctx.fillRect(x, y, w, h);
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
      const tone = 138 + Math.floor(rnd() * 58) - c * 10;
      const warm = Math.floor(rnd() * 22);
      const base = `rgb(${tone + warm},${Math.round(tone + warm * 0.55)},${tone - 10})`;
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
  g.addColorStop(0.55, 'rgba(30,34,24,0.06)');
  g.addColorStop(1, 'rgba(20,28,18,0.3)');
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
    ctx.fillStyle = '#000';
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
      ctx.fillStyle = `rgba(48,40,30,${0.08 + layer * 0.07})`;
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
    g.addColorStop(0.3, 'rgba(52,72,34,0.4)');
    g.addColorStop(0.7, 'rgba(38,56,26,0.8)');
    g.addColorStop(1, 'rgba(24,36,18,0.95)');
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

// ───────────────────────────────────────────────────────── klong atlas ──
// Bangkok klong detail for the 'thailand' theme: Thai-style boards (made-up looped glyphs), timber
// windows / doors, lit rooms, rusty sheet patches, laundry, tarps, plants, concrete quay facing and
// the wat (temple) roof / gable ornaments. Used by 'klongDecor' (lit, alpha-cut) and 'klongGlow' (unlit).

const KW = 1024;
const KH = 1024;
export const KLONG_UV = {
  /** Horizontal boards 256×80 (3.2 : 1). */
  hSign: [0, 1, 2, 3].map((i) => uvOf(i * 256, 0, 256, 80, KW, KH)),
  /** Vertical blade boards 64×256 (1 : 4). */
  vSign: [0, 1, 2, 3].map((i) => uvOf(i * 64, 80, 64, 256, KW, KH)),
  /** Closed timber shutters / glass louvres (square). */
  winShut: [0, 1].map((i) => uvOf(256 + i * 128, 80, 128, 128, KW, KH)),
  /** Timber frame with bars around an empty opening (in front of litRoom). */
  winFrame: uvOf(512, 80, 128, 128, KW, KH),
  /** Fluorescent-lit rooms (glow material). */
  litRoom: [0, 1].map((i) => uvOf(640 + i * 128, 80, 128, 128, KW, KH)),
  /** Lit corner shop shelves (glow material). */
  litShop: uvOf(896, 80, 128, 128, KW, KH),
  /** Doors 1 : 2 (plank door, open doorway with a bead curtain). */
  door: [0, 1].map((i) => uvOf(256 + i * 96, 208, 96, 192, KW, KH)),
  /** Rusty corrugated sheet patches. */
  rustSheet: [0, 1].map((i) => uvOf(448 + i * 128, 208, 128, 128, KW, KH)),
  /** Washing on a line (alpha cut, 2.5 : 1). */
  laundry: uvOf(704, 208, 320, 128, KW, KH),
  /** Food-cart menu board (4 : 1). */
  cartMenu: uvOf(0, 336, 256, 64, KW, KH),
  /** Vinyl banner (4.5 : 1) and a string of pennants (alpha cut). */
  banner: uvOf(448, 336, 288, 64, KW, KH),
  flags: uvOf(736, 336, 288, 64, KW, KH),
  /** Stained board-formed concrete quay wall (6.4 m × 1.6 m, tiles horizontally). */
  quay: uvOf(0, 400, 1024, 256, KW, KH, 0),
  /** Temple roof tiles: orange field, green borders left / right (V runs up the slope). */
  watRoof: uvOf(0, 656, 256, 256, KW, KH),
  /** Gilded gable pediment (triangle, alpha cut, 2 : 1). */
  watGable: uvOf(256, 656, 256, 128, KW, KH),
  watWindow: uvOf(256, 784, 64, 128, KW, KH),
  watDoor: uvOf(320, 784, 96, 128, KW, KH),
  /** Red / gold diamond panel. */
  watPanel: uvOf(416, 784, 96, 128, KW, KH),
  /** Pasted paper posters (alpha cut). */
  posters: uvOf(512, 656, 128, 128, KW, KH),
  /** Board of electricity meters. */
  meters: uvOf(640, 656, 128, 128, KW, KH),
  /** Striped plastic tarp (tiles). */
  tarp: uvOf(768, 656, 128, 128, KW, KH),
  /** Irregular rust patches for roofs (alpha cut). */
  rustBlot: uvOf(896, 656, 128, 128, KW, KH),
  /** Patchwork sheet wall of a rooftop shack (2 : 1). */
  shack: uvOf(512, 784, 256, 128, KW, KH),
  /** Big sun-faded billboard (2 : 1). */
  billboard: uvOf(768, 784, 256, 128, KW, KH),
  /** Food cart front: glass case over a steel body. */
  cartFront: uvOf(0, 912, 256, 112, KW, KH),
  /** Stacked drink crates (alpha cut). */
  crates: uvOf(256, 912, 128, 112, KW, KH),
  /** Striped awning fabric. */
  awning: uvOf(384, 912, 128, 112, KW, KH),
  /** Row of potted / hanging plants (alpha cut). */
  plants: uvOf(512, 912, 256, 112, KW, KH),
  /** Water jars, barrels, gas cylinders, stools (alpha cut). */
  jars: uvOf(768, 912, 256, 112, KW, KH),
} as const;

/** Random soft blotches (dirt / fading) inside a rect. */
function mottle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, n: number, dark = 'rgba(30,24,18,', light = 'rgba(255,250,235,', amp = 0.1): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = (rnd() < 0.6 ? dark : light) + (amp * (0.3 + rnd() * 0.7)).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(x + rnd() * w, y + rnd() * h, 3 + rnd() * w * 0.12, 2 + rnd() * h * 0.1, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Vertical corrugation shading over a rect. */
function corrugate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pitch: number): void {
  for (let px = x; px < x + w; px += pitch) {
    const g = ctx.createLinearGradient(px, 0, px + pitch, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(px, y, Math.min(pitch, x + w - px), h);
  }
}

function rustSpots(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, n: number, bias = 0.5): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < n; i++) {
    const py = y + h * Math.pow(rnd(), bias);
    const r = 1.5 + rnd() * 6;
    ctx.fillStyle = `rgba(${110 + Math.floor(rnd() * 50)},${50 + Math.floor(rnd() * 30)},${18 + Math.floor(rnd() * 16)},${0.25 + rnd() * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(x + rnd() * w, py, r, r * (0.6 + rnd() * 1.4), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const TH_BOARDS: readonly (readonly [string, string, string])[] = [
  ['#f2cf1d', '#c41e18', '#1d3f8a'],
  ['#1d4fa0', '#ffffff', '#f4d21f'],
  ['#f1eee2', '#c41e18', '#17743a'],
  ['#c41e18', '#fff3c0', '#f4d21f'],
  ['#17743a', '#fffbe6', '#f4d21f'],
  ['#f3f1ea', '#1d3f8a', '#c41e18'],
];

function thaiBoard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, pal: readonly [string, string, string]): void {
  ctx.fillStyle = pal[0];
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = pal[2];
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
  ctx.strokeStyle = pal[1];
  ctx.fillStyle = pal[1];
  if (h > w) {
    const s = w - 18;
    const n = Math.floor((h - 24) / (s + 6));
    const y0 = y + (h - n * (s + 6)) / 2;
    for (let i = 0; i < n; i++) loopGlyph(ctx, x + 9, y0 + i * (s + 6), s, s, rnd);
  } else {
    // pictogram disc + big glyph row + small sub line
    ctx.fillStyle = pal[2];
    ctx.beginPath();
    ctx.arc(x + h * 0.5, y + h * 0.5, h * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    ctx.arc(x + h * 0.5, y + h * 0.46, h * 0.17, 0, Math.PI);
    ctx.fill();
    const s = h * 0.56;
    const gw = s * 0.6;
    const n = Math.floor((w - h - 14) / gw);
    for (let i = 0; i < n; i++) loopGlyph(ctx, x + h + i * gw, y + 6, gw, s, rnd);
    ctx.strokeStyle = pal[2];
    const s2 = h * 0.2;
    const n2 = Math.floor((w - h - 30) / (s2 * 0.62));
    for (let i = 0; i < n2; i++) if (rnd() < 0.85) loopGlyph(ctx, x + h + i * s2 * 0.62, y + h * 0.7, s2 * 0.62, s2, rnd);
  }
  // sun fade + dirt drips from the top edge
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 7; i++) {
    const dx = x + rnd() * w;
    const dg = ctx.createLinearGradient(0, y, 0, y + h * (0.3 + rnd() * 0.6));
    dg.addColorStop(0, 'rgba(70,45,25,0.35)');
    dg.addColorStop(1, 'rgba(70,45,25,0)');
    ctx.fillStyle = dg;
    ctx.fillRect(dx, y, 2 + rnd() * 4, h);
  }
}

function planksV(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, rnd: () => number, pw = 12): void {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  for (let px = x; px < x + w; px += pw) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,240,210'},${0.05 + rnd() * 0.12})`;
    ctx.fillRect(px, y, pw - 1, h);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(px + pw - 1, y, 1, h);
  }
}

export function drawKlongAtlas(seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(KW, KH);
  const rnd = seededRng(seed);

  // ── boards ──
  for (let i = 0; i < 4; i++) thaiBoard(ctx, i * 256, 0, 256, 80, rnd, TH_BOARDS[i]);
  for (let i = 0; i < 4; i++) thaiBoard(ctx, i * 64, 80, 64, 256, rnd, TH_BOARDS[(i + 2) % TH_BOARDS.length]);

  // ── closed windows ──
  {
    // 0: plank shutters in a timber frame
    const x = 256;
    const y = 80;
    ctx.fillStyle = '#4a3524';
    ctx.fillRect(x, y, 128, 128);
    planksV(ctx, x + 10, y + 10, 52, 108, '#3f8f8a', rnd, 9);
    planksV(ctx, x + 66, y + 10, 52, 108, '#3f8f8a', rnd, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + 62, y + 10, 4, 108);
    ctx.fillStyle = '#35281c';
    for (const yy of [y + 28, y + 96]) ctx.fillRect(x + 10, yy, 108, 5);
    mottle(ctx, x, y, 128, 128, rnd, 30, 'rgba(30,24,18,', 'rgba(255,250,235,', 0.16);
    // 1: glass louvres behind bars
    const x1 = 384;
    ctx.fillStyle = '#d8d2c2';
    ctx.fillRect(x1, y, 128, 128);
    ctx.fillStyle = '#1e2a30';
    ctx.fillRect(x1 + 9, y + 9, 110, 110);
    for (let k = 0; k < 9; k++) {
      const yy = y + 11 + k * 12;
      const g = ctx.createLinearGradient(0, yy, 0, yy + 11);
      g.addColorStop(0, 'rgba(170,200,205,0.75)');
      g.addColorStop(1, 'rgba(40,60,70,0.6)');
      ctx.fillStyle = g;
      ctx.fillRect(x1 + 11, yy, 106, 9);
    }
    ctx.fillStyle = '#d8d2c2';
    ctx.fillRect(x1 + 61, y + 9, 6, 110);
    ctx.fillStyle = 'rgba(20,20,20,0.75)';
    for (let k = 1; k < 8; k++) ctx.fillRect(x1 + 9 + k * 13.5, y + 9, 2, 110);
    mottle(ctx, x1, y, 128, 128, rnd, 24, 'rgba(40,30,18,', 'rgba(255,250,235,', 0.14);
  }
  // ── open frame (hole) ──
  {
    const x = 512;
    const y = 80;
    ctx.fillStyle = '#4a3524';
    ctx.fillRect(x, y, 128, 128);
    ctx.fillStyle = '#6a4c32';
    ctx.fillRect(x + 3, y + 3, 122, 5);
    ctx.clearRect(x + 12, y + 12, 104, 100);
    // folded shutter leaves at the sides + thin bars
    planksV(ctx, x + 12, y + 12, 14, 100, '#3f8f8a', rnd, 7);
    planksV(ctx, x + 102, y + 12, 14, 100, '#3f8f8a', rnd, 7);
    ctx.fillStyle = 'rgba(25,22,20,0.95)';
    for (let k = 1; k < 5; k++) ctx.fillRect(x + 26 + k * 15.2 - 1, y + 12, 2, 100);
    ctx.fillRect(x + 26, y + 60, 76, 2);
    ctx.fillStyle = '#5a4230';
    ctx.fillRect(x, y + 112, 128, 16);
  }
  // ── lit rooms (fluorescent) ──
  for (let v = 0; v < 2; v++) {
    const x = 640 + v * 128;
    const y = 80;
    const g = ctx.createLinearGradient(x, y, x, y + 128);
    g.addColorStop(0, v ? '#f4ffe6' : '#fff6d8');
    g.addColorStop(0.5, v ? '#b6d8b4' : '#e8c890');
    g.addColorStop(1, v ? '#3a5a4a' : '#6a4a2a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 128, 128);
    // tube lamp
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 28, y + 14, 72, 5);
    if (v === 0) {
      // calendar, shelf with pots, hanging shirts
      ctx.fillStyle = '#c8201a';
      ctx.fillRect(x + 20, y + 34, 22, 8);
      ctx.fillStyle = '#f8f4e8';
      ctx.fillRect(x + 20, y + 42, 22, 22);
      ctx.fillStyle = 'rgba(50,30,16,0.75)';
      ctx.fillRect(x + 52, y + 74, 76, 4);
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = ['#b8bcc0', '#d8b040', '#8a9aa8', '#c8ccd0'][k];
        ctx.fillRect(x + 58 + k * 17, y + 62, 12, 12);
      }
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = ['#e85a8a', '#3fa0d8', '#f2f2e8'][k];
        ctx.fillRect(x + 62 + k * 20, y + 26, 15, 24);
      }
    } else {
      // TV glow + fan + a sitting figure
      ctx.fillStyle = '#2a3238';
      ctx.fillRect(x + 66, y + 58, 44, 30);
      ctx.fillStyle = '#9fd0ff';
      ctx.fillRect(x + 69, y + 61, 38, 24);
      ctx.fillStyle = 'rgba(30,30,26,0.7)';
      ctx.beginPath();
      ctx.arc(x + 34, y + 76, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + 22, y + 85, 26, 43);
      ctx.strokeStyle = 'rgba(40,40,40,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 96, y + 36, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // ── lit shop ──
  {
    const x = 896;
    const y = 80;
    const g = ctx.createLinearGradient(x, y, x, y + 128);
    g.addColorStop(0, '#fff8e0');
    g.addColorStop(1, '#c89858');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 128, 128);
    const cols = ['#e23a2e', '#f2c21e', '#2f7fc8', '#3fa85a', '#f08a2a', '#f4f0e4', '#8a4ab0', '#e85a9a'];
    for (let r = 0; r < 4; r++) {
      const yy = y + 14 + r * 26;
      ctx.fillStyle = 'rgba(70,45,25,0.8)';
      ctx.fillRect(x, yy + 20, 128, 4);
      for (let k = 0; k < 13; k++) {
        ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
        const hh = 9 + rnd() * 10;
        ctx.fillRect(x + 3 + k * 9.6, yy + 20 - hh, 8, hh);
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 20, y + 4, 88, 4);
    // hanging snack strips
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = cols[k];
      ctx.fillRect(x + 8 + k * 21, y + 6, 7, 22 + rnd() * 16);
    }
  }
  // ── doors ──
  {
    const y = 208;
    // 0: plank door, mesh panel on top
    planksV(ctx, 256, y, 96, 192, '#7a5a3c', rnd, 12);
    ctx.fillStyle = '#4a3524';
    ctx.fillRect(256, y, 96, 6);
    ctx.fillRect(256, y, 6, 192);
    ctx.fillRect(346, y, 6, 192);
    ctx.fillStyle = '#20262a';
    ctx.fillRect(268, y + 14, 72, 44);
    ctx.strokeStyle = 'rgba(160,170,170,0.5)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 9; k++) {
      ctx.beginPath();
      ctx.moveTo(268 + k * 9, y + 14);
      ctx.lineTo(268 + k * 9, y + 58);
      ctx.stroke();
    }
    ctx.fillStyle = '#c9b060';
    ctx.fillRect(334, y + 104, 6, 10);
    mottle(ctx, 256, y + 120, 96, 72, rnd, 20, 'rgba(30,24,18,', 'rgba(255,250,235,', 0.2);
    // 1: open doorway, dark inside, bead curtain, shoes on the sill
    ctx.fillStyle = '#4a3524';
    ctx.fillRect(352, y, 96, 192);
    const g = ctx.createLinearGradient(0, y, 0, y + 192);
    g.addColorStop(0, '#1a1410');
    g.addColorStop(1, '#3a2c20');
    ctx.fillStyle = g;
    ctx.fillRect(360, y + 8, 80, 184);
    const beads = ['#e85a8a', '#f0c030', '#3fa0d8', '#6cc070', '#f2f2e8'];
    for (let k = 0; k < 13; k++) {
      const len = 90 + rnd() * 50;
      for (let yy = y + 10; yy < y + 10 + len; yy += 5) {
        ctx.fillStyle = beads[(k + Math.floor(yy / 15)) % beads.length];
        ctx.fillRect(362 + k * 6, yy, 3, 3);
      }
    }
    ctx.fillStyle = '#2f6fc0';
    ctx.fillRect(366, y + 184, 14, 6);
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(386, y + 185, 13, 5);
  }
  // ── rusty sheets ──
  for (let v = 0; v < 2; v++) {
    const x = 448 + v * 128;
    const y = 208;
    ctx.fillStyle = v ? '#5f86a0' : '#9aa0a0';
    ctx.fillRect(x, y, 128, 128);
    corrugate(ctx, x, y, 128, 128, 10);
    rustSpots(ctx, x, y, 128, 128, rnd, 60, v ? 0.35 : 2.2);
    ctx.fillStyle = 'rgba(20,16,12,0.6)';
    ctx.fillRect(x, y + 62, 128, 2);
    for (let k = 0; k < 6; k++) ctx.fillRect(x + 8 + k * 22, y + 5, 3, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, 126, 126);
  }
  // ── laundry on a line ──
  {
    const x = 704;
    const y = 208;
    ctx.strokeStyle = '#2a2622';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.quadraticCurveTo(x + 160, y + 14, x + 320, y + 5);
    ctx.stroke();
    const cols = ['#e85a8a', '#3fa0d8', '#f2f2e8', '#f0c030', '#6cc070', '#e8762a', '#8a6ad0', '#d8d0b8', '#c8302a'];
    let px = x + 8;
    while (px < x + 290) {
      const kind = rnd();
      const col = cols[Math.floor(rnd() * cols.length)];
      const top = y + 8 + Math.sin(((px - x) / 320) * Math.PI) * 6;
      ctx.fillStyle = col;
      if (kind < 0.4) {
        // T-shirt
        ctx.fillRect(px + 6, top, 26, 46);
        ctx.fillRect(px, top, 38, 13);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(px + 15, top, 8, 4);
        px += 44;
      } else if (kind < 0.62) {
        // trousers
        ctx.fillRect(px, top, 24, 22);
        ctx.fillRect(px, top + 20, 10, 56);
        ctx.fillRect(px + 14, top + 20, 10, 56);
        px += 30;
      } else if (kind < 0.85) {
        // patterned sarong / towel
        const w = 30 + rnd() * 16;
        const h = 60 + rnd() * 44;
        ctx.fillRect(px, top, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let k = 8; k < h; k += 12) ctx.fillRect(px, top + k, w, 3);
        px += w + 6;
      } else {
        // small things
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
          ctx.fillRect(px + k * 12, top, 9, 14 + rnd() * 10);
        }
        px += 40;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(px - 20, top + 4, 5, 40);
    }
  }
  // ── cart menu, banner, pennants ──
  {
    ctx.fillStyle = '#f6d92a';
    ctx.fillRect(0, 336, 256, 64);
    ctx.strokeStyle = '#c41e18';
    ctx.fillStyle = '#c41e18';
    for (let i = 0; i < 6; i++) loopGlyph(ctx, 8 + i * 22, 340, 22, 34, rnd);
    for (let i = 0; i < 3; i++) {
      const bx = 160 + i * 32;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bx, 356, 13, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = ['#e8762a', '#3fa85a', '#c8302a'][i];
      ctx.beginPath();
      ctx.ellipse(bx, 355, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#1d3f8a';
    for (let i = 0; i < 16; i++) if (rnd() < 0.8) loopGlyph(ctx, 8 + i * 15, 376, 13, 18, rnd);
    mottle(ctx, 0, 336, 256, 64, rnd, 18);
    // banner
    const bg = ctx.createLinearGradient(448, 0, 736, 0);
    bg.addColorStop(0, '#f4f2ea');
    bg.addColorStop(1, '#bfe0f0');
    ctx.fillStyle = bg;
    ctx.fillRect(448, 336, 288, 64);
    ctx.fillStyle = '#e8762a';
    ctx.beginPath();
    ctx.arc(482, 368, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#17458a';
    for (let i = 0; i < 8; i++) loopGlyph(ctx, 514 + i * 26, 342, 26, 40, rnd);
    ctx.strokeStyle = '#c41e18';
    for (let i = 0; i < 14; i++) loopGlyph(ctx, 516 + i * 15, 382, 13, 15, rnd);
    ctx.fillStyle = 'rgba(40,40,40,0.8)';
    for (const [ex, ey] of [[452, 340], [730, 340], [452, 394], [730, 394]] as const) ctx.fillRect(ex, ey, 3, 3);
    mottle(ctx, 448, 336, 288, 64, rnd, 16);
    // pennants
    ctx.fillStyle = '#2a2622';
    ctx.fillRect(736, 337, 288, 2);
    const fc = ['#f4d21f', '#c41e18', '#1d4fa0', '#f2f0e6', '#e8762a', '#17743a'];
    for (let i = 0; i < 12; i++) {
      const fx = 738 + i * 24;
      ctx.fillStyle = fc[i % fc.length];
      ctx.beginPath();
      ctx.moveTo(fx, 339);
      ctx.lineTo(fx + 20, 339);
      ctx.lineTo(fx + 10 + (rnd() - 0.5) * 6, 339 + 44 + rnd() * 12);
      ctx.closePath();
      ctx.fill();
    }
  }
  // ── quay concrete (periodic in x) ──
  {
    const x = 0;
    const y = 400;
    const w = 1024;
    const h = 256;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#96938a';
    ctx.fillRect(x, y, w, h);
    const wrap = (fn: (ox: number) => void): void => {
      for (const o of [0, -w, w]) fn(o);
    };
    for (let i = 0; i < 260; i++) {
      const px = rnd() * w;
      const py = y + rnd() * h;
      const rw = 8 + rnd() * 70;
      const rh = 4 + rnd() * 26;
      const col = rnd() < 0.55 ? `rgba(40,36,28,${0.03 + rnd() * 0.08})` : `rgba(235,230,215,${0.03 + rnd() * 0.07})`;
      wrap((o) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(px + o, py, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // form-board lines + pour joints
    for (let yy = y + 30; yy < y + h; yy += 30 + Math.floor(rnd() * 5)) {
      ctx.fillStyle = 'rgba(30,26,20,0.22)';
      ctx.fillRect(x, yy, w, 1.5);
      ctx.fillStyle = 'rgba(255,255,245,0.1)';
      ctx.fillRect(x, yy + 1.5, w, 1.5);
    }
    for (let k = 0; k < 4; k++) {
      const jx = 100 + k * 256;
      ctx.fillStyle = 'rgba(25,22,18,0.4)';
      ctx.fillRect(jx, y, 2.5, h);
      const g = ctx.createLinearGradient(jx - 14, 0, jx + 16, 0);
      g.addColorStop(0, 'rgba(40,34,24,0)');
      g.addColorStop(0.5, 'rgba(40,34,24,0.22)');
      g.addColorStop(1, 'rgba(40,34,24,0)');
      ctx.fillStyle = g;
      ctx.fillRect(jx - 14, y, 30, h);
    }
    // cement patches
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? '190,186,172' : '110,106,98'},0.5)`;
      ctx.fillRect(40 + rnd() * 900, y + 20 + rnd() * 120, 30 + rnd() * 60, 20 + rnd() * 40);
    }
    // cracks
    ctx.strokeStyle = 'rgba(20,18,14,0.55)';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 7; k++) {
      let px = 30 + rnd() * 960;
      let py = y + rnd() * 60;
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let s = 0; s < 8; s++) {
        px += (rnd() - 0.5) * 22;
        py += 8 + rnd() * 20;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // drain outlets with long stains
    for (const [dx, dy] of [[190, 96], [560, 118], [860, 84]] as const) {
      const g = ctx.createLinearGradient(0, y + dy, 0, y + h);
      g.addColorStop(0, 'rgba(34,44,24,0.75)');
      g.addColorStop(1, 'rgba(34,44,24,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(dx - 9, y + dy);
      ctx.lineTo(dx + 9, y + dy);
      ctx.lineTo(dx + 22 + rnd() * 10, y + h);
      ctx.lineTo(dx - 20 - rnd() * 10, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5a5850';
      ctx.beginPath();
      ctx.arc(dx, y + dy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c0d0a';
      ctx.beginPath();
      ctx.arc(dx, y + dy + 1, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // blue PVC pipe run with brackets
    ctx.fillStyle = '#3f78b8';
    ctx.fillRect(x, y + 40, w, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, y + 41, w, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + 47, w, 3);
    ctx.fillStyle = '#6a6a64';
    for (let k = 0; k < 8; k++) ctx.fillRect(60 + k * 128, y + 37, 5, 13);
    // rust streaks from rebar
    for (let k = 0; k < 16; k++) {
      const px = rnd() * w;
      const py = y + 10 + rnd() * 110;
      const l = 30 + rnd() * 80;
      const g = ctx.createLinearGradient(0, py, 0, py + l);
      g.addColorStop(0, 'rgba(130,68,30,0.55)');
      g.addColorStop(1, 'rgba(130,68,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, 2 + rnd() * 5, l);
    }
    // faded paint remnants + stencil glyphs
    ctx.fillStyle = 'rgba(200,60,40,0.22)';
    ctx.fillRect(300, y + 60, 150, 44);
    ctx.strokeStyle = 'rgba(240,236,220,0.5)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) loopGlyph(ctx, 312 + i * 26, y + 62, 24, 38, rnd);
    // dusty top, dark damp bottom
    const tg = ctx.createLinearGradient(0, y, 0, y + h);
    tg.addColorStop(0, 'rgba(230,224,205,0.22)');
    tg.addColorStop(0.2, 'rgba(230,224,205,0)');
    tg.addColorStop(0.55, 'rgba(36,40,26,0.05)');
    tg.addColorStop(0.8, 'rgba(36,40,26,0.45)');
    tg.addColorStop(1, 'rgba(22,28,16,0.75)');
    ctx.fillStyle = tg;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  // ── wat roof tiles ──
  {
    const x = 0;
    const y = 656;
    ctx.fillStyle = '#d2601c';
    ctx.fillRect(x, y, 256, 256);
    ctx.fillStyle = '#1d6a3a';
    ctx.fillRect(x, y, 40, 256);
    ctx.fillRect(x + 216, y, 40, 256);
    ctx.fillStyle = '#e8b424';
    ctx.fillRect(x + 40, y, 7, 256);
    ctx.fillRect(x + 209, y, 7, 256);
    for (let r = 0; r < 16; r++) {
      const yy = y + r * 16;
      const g = ctx.createLinearGradient(0, yy, 0, yy + 16);
      g.addColorStop(0, 'rgba(0,0,0,0.3)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0.05)');
      ctx.fillStyle = g;
      ctx.fillRect(x, yy, 256, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let k = 0; k < 17; k++) ctx.fillRect(x + k * 16 + (r & 1) * 8, yy, 1.5, 16);
    }
    mottle(ctx, x, y, 256, 256, rnd, 60, 'rgba(30,24,18,', 'rgba(255,250,235,', 0.12);
  }
  // ── wat gable ──
  {
    const x = 256;
    const y = 656;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y + 128);
    ctx.lineTo(x + 128, y);
    ctx.lineTo(x + 256, y + 128);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#8a1512';
    ctx.fillRect(x, y, 256, 128);
    ctx.strokeStyle = '#e9b72e';
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      // symmetric flame curls
      const px = rnd() * 110;
      const py = y + 40 + rnd() * 80;
      const r = 5 + rnd() * 11;
      ctx.lineWidth = 2 + rnd() * 2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(x + 128 + s * px, py, r, s > 0 ? 0.4 : Math.PI - 0.4 - 4.4, s > 0 ? 4.8 : Math.PI - 0.4);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#e9b72e';
    ctx.beginPath();
    ctx.arc(x + 128, y + 84, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a1512';
    ctx.beginPath();
    ctx.arc(x + 128, y + 84, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(x, y + 128);
    ctx.lineTo(x + 128, y);
    ctx.lineTo(x + 256, y + 128);
    ctx.stroke();
    ctx.fillRect(x, y + 118, 256, 10);
    ctx.fillStyle = '#e9b72e';
    ctx.fillRect(x, y + 120, 256, 8);
    ctx.restore();
  }
  // ── wat window / door / panel ──
  {
    const pointed = (x: number, y: number, w: number, h: number): void => {
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + h * 0.3);
      ctx.quadraticCurveTo(x + w * 0.1, y + h * 0.12, x + w * 0.5, y);
      ctx.quadraticCurveTo(x + w * 0.9, y + h * 0.12, x + w, y + h * 0.3);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
    };
    for (const [x, w] of [[256, 64], [320, 96]] as const) {
      const y = 784;
      ctx.fillStyle = '#e9b72e';
      pointed(x + 1, y + 1, w - 2, 126);
      ctx.fill();
      ctx.fillStyle = '#b8862a';
      pointed(x + 6, y + 14, w - 12, 114);
      ctx.fill();
      ctx.fillStyle = '#6a1210';
      ctx.fillRect(x + 10, y + 44, w - 20, 84);
      ctx.fillStyle = '#e9b72e';
      ctx.fillRect(x + w / 2 - 1.5, y + 44, 3, 84);
      for (let r = 0; r < 5; r++) for (let k = 0; k < Math.floor((w - 24) / 10); k++) ctx.fillRect(x + 14 + k * 10, y + 54 + r * 15, 3, 3);
    }
    const x = 416;
    const y = 784;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 96, 128);
    ctx.clip();
    ctx.fillStyle = '#7a1412';
    ctx.fillRect(x, y, 96, 128);
    ctx.strokeStyle = '#e9b72e';
    ctx.lineWidth = 2;
    for (let i = -8; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 24, y);
      ctx.lineTo(x + i * 24 + 128, y + 128);
      ctx.moveTo(x + i * 24 + 128, y);
      ctx.lineTo(x + i * 24, y + 128);
      ctx.stroke();
    }
    ctx.fillStyle = '#e9b72e';
    ctx.fillRect(x, y, 96, 7);
    ctx.fillRect(x, y + 121, 96, 7);
    ctx.restore();
  }
  // ── posters (alpha) ──
  {
    const x = 512;
    const y = 656;
    for (let i = 0; i < 6; i++) {
      const pw = 34 + rnd() * 26;
      const ph = 40 + rnd() * 30;
      const px = x + 4 + rnd() * (120 - pw);
      const py = y + 4 + rnd() * (120 - ph);
      ctx.fillStyle = ['#f4f0e2', '#f6e27a', '#f4c0c8', '#cfe6f2', '#f2f2f2'][Math.floor(rnd() * 5)];
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = ['#c41e18', '#1d3f8a', '#17743a', '#e8762a'][Math.floor(rnd() * 4)];
      ctx.fillRect(px + 4, py + 4, pw - 8, ph * 0.3);
      ctx.strokeStyle = 'rgba(30,30,30,0.8)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < Math.floor((pw - 8) / 9); k++) loopGlyph(ctx, px + 4 + k * 9, py + ph * 0.42, 9, 13, rnd);
      ctx.fillStyle = 'rgba(40,40,40,0.5)';
      for (let k = 0; k < 3; k++) ctx.fillRect(px + 4, py + ph * 0.7 + k * 5, pw - 8 - rnd() * 10, 1.5);
      // torn corner
      ctx.clearRect(px + pw - 8, py + ph - 6 - rnd() * 6, 8, 12);
    }
  }
  // ── meter board ──
  {
    const x = 640;
    const y = 656;
    ctx.fillStyle = '#6f6a5e';
    ctx.fillRect(x, y, 128, 128);
    ctx.fillStyle = '#857f70';
    ctx.fillRect(x + 4, y + 4, 120, 120);
    for (let i = 0; i < 6; i++) {
      const mx = x + 24 + (i % 3) * 40;
      const my = y + 34 + Math.floor(i / 3) * 52;
      ctx.fillStyle = '#2a2c2e';
      ctx.fillRect(mx - 14, my - 18, 28, 40);
      ctx.fillStyle = '#c9d4d8';
      ctx.beginPath();
      ctx.arc(mx, my - 4, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4f2e8';
      ctx.fillRect(mx - 7, my - 7, 14, 5);
      ctx.fillStyle = '#1c1a18';
      ctx.fillRect(mx - 2, my + 22, 4, 30);
    }
    ctx.fillStyle = '#1c1a18';
    ctx.fillRect(x, y + 120, 128, 4);
    mottle(ctx, x, y, 128, 128, rnd, 20, 'rgba(30,24,18,', 'rgba(255,250,235,', 0.15);
  }
  // ── tarp ──
  {
    const x = 768;
    const y = 656;
    const cols = ['#2f66b8', '#f2f0ea', '#c8342c', '#f2f0ea'];
    for (let k = 0; k < 16; k++) {
      ctx.fillStyle = cols[k % 4];
      ctx.fillRect(x + k * 8, y, 8, 128);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let yy = y; yy < y + 128; yy += 3) ctx.fillRect(x, yy, 128, 1);
    mottle(ctx, x, y, 128, 128, rnd, 26, 'rgba(60,50,30,', 'rgba(255,255,255,', 0.16);
  }
  // ── rust blots (alpha) ──
  {
    const x = 896;
    const y = 656;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 128, 128);
    ctx.clip();
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.pow(rnd(), 0.7) * 50;
      const r = 3 + rnd() * 10;
      ctx.fillStyle = `rgb(${96 + Math.floor(rnd() * 60)},${44 + Math.floor(rnd() * 30)},${16 + Math.floor(rnd() * 14)})`;
      ctx.beginPath();
      ctx.ellipse(x + 64 + Math.cos(a) * d, y + 64 + Math.sin(a) * d * 0.9, r, r * (0.6 + rnd()), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // ── shack wall ──
  {
    const x = 512;
    const y = 784;
    const cols = ['#8f9496', '#5f86a0', '#7a8a6a', '#a8a49a', '#9a6a4a'];
    let px = x;
    while (px < x + 256) {
      const w = Math.min(x + 256 - px, 38 + Math.floor(rnd() * 40));
      ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
      ctx.fillRect(px, y, w, 128);
      corrugate(ctx, px, y, w, 128, 8);
      rustSpots(ctx, px, y, w, 128, rnd, 14, rnd() < 0.5 ? 0.4 : 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px + w - 2, y, 2, 128);
      px += w;
    }
    ctx.fillStyle = '#1e2428';
    ctx.fillRect(x + 150, y + 36, 46, 40);
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(x + 146, y + 32, 54, 5);
    ctx.fillRect(x + 146, y + 76, 54, 5);
  }
  // ── billboard ──
  {
    const x = 768;
    const y = 784;
    const g = ctx.createLinearGradient(x, y, x + 256, y + 128);
    g.addColorStop(0, '#2aa0a8');
    g.addColorStop(1, '#f2d24a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 256, 128);
    ctx.fillStyle = '#f6f2e2';
    ctx.beginPath();
    ctx.arc(x + 200, y + 70, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8562a';
    ctx.beginPath();
    ctx.arc(x + 200, y + 70, 30, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    for (let i = 0; i < 4; i++) loopGlyph(ctx, x + 12 + i * 34, y + 14, 34, 62, rnd);
    ctx.strokeStyle = '#7a1a14';
    for (let i = 0; i < 9; i++) loopGlyph(ctx, x + 12 + i * 15, y + 90, 14, 22, rnd);
    // peeled strips + fading
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = 'rgba(214,210,196,0.85)';
      ctx.fillRect(x + rnd() * 240, y + rnd() * 100, 6 + rnd() * 18, 20 + rnd() * 50);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, 256, 128);
    ctx.strokeStyle = '#3a3a38';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, 252, 124);
  }
  // ── cart front ──
  {
    const x = 0;
    const y = 912;
    const g = ctx.createLinearGradient(x, 0, x + 256, 0);
    g.addColorStop(0, '#aeb4b8');
    g.addColorStop(0.3, '#e4e8ea');
    g.addColorStop(0.55, '#9aa0a6');
    g.addColorStop(1, '#c8ccd0');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 256, 112);
    // glass case
    ctx.fillStyle = '#d8ecec';
    ctx.fillRect(x + 8, y + 6, 240, 48);
    const food = ['#e8a23a', '#c8522a', '#f0d87a', '#6aa84a', '#e8e0c8', '#a8482a', '#f2b8a0'];
    for (let k = 0; k < 20; k++) {
      ctx.fillStyle = food[Math.floor(rnd() * food.length)];
      ctx.beginPath();
      ctx.ellipse(x + 18 + rnd() * 220, y + 34 + rnd() * 14, 5 + rnd() * 8, 4 + rnd() * 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(x + 30, y + 6);
    ctx.lineTo(x + 70, y + 6);
    ctx.lineTo(x + 40, y + 54);
    ctx.lineTo(x + 10, y + 54);
    ctx.fill();
    ctx.fillStyle = '#6a7074';
    ctx.fillRect(x + 6, y + 4, 244, 3);
    ctx.fillRect(x + 6, y + 53, 244, 4);
    ctx.fillRect(x + 126, y + 6, 3, 48);
    ctx.fillStyle = '#c41e18';
    ctx.fillRect(x + 14, y + 66, 228, 30);
    ctx.strokeStyle = '#fff3c0';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 10; i++) loopGlyph(ctx, x + 22 + i * 21, y + 68, 20, 26, rnd);
    mottle(ctx, x, y + 60, 256, 52, rnd, 24, 'rgba(40,30,18,', 'rgba(255,250,235,', 0.2);
  }
  // ── crates (alpha) ──
  {
    const x = 256;
    const y = 912;
    const cols = ['#c8302a', '#e8b820', '#2f66b8', '#2a8a4a'];
    for (let col = 0; col < 3; col++) {
      const n = 2 + Math.floor(rnd() * 3);
      for (let r = 0; r < n; r++) {
        const cx0 = x + 3 + col * 42;
        const cy0 = y + 112 - (r + 1) * 26;
        ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
        ctx.fillRect(cx0, cy0, 39, 25);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        for (let k = 0; k < 4; k++) ctx.fillRect(cx0 + 4 + k * 9, cy0 + 6, 5, 13);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(cx0, cy0, 39, 3);
      }
    }
  }
  // ── awning stripes ──
  {
    const x = 384;
    const y = 912;
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = k % 2 ? '#f2eee2' : '#2a8a5a';
      ctx.fillRect(x + k * 16, y, 16, 112);
    }
    const g = ctx.createLinearGradient(0, y, 0, y + 112);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(60,45,25,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 128, 112);
    mottle(ctx, x, y, 128, 112, rnd, 22, 'rgba(60,50,30,', 'rgba(255,255,255,', 0.16);
  }
  // ── plants (alpha) ──
  {
    const x = 512;
    const y = 912;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 256, 112);
    ctx.clip();
    let px = x + 6;
    while (px < x + 240) {
      const pw = 20 + rnd() * 16;
      const ph = 16 + rnd() * 14;
      const hang = rnd() < 0.2;
      const baseY = hang ? y + 58 : y + 112;
      // foliage
      const gh = 34 + rnd() * 44;
      for (let k = 0; k < 26; k++) {
        const a = rnd() * Math.PI * 2;
        const lx = px + pw / 2 + Math.cos(a) * pw * (0.3 + rnd() * 0.7);
        const ly = hang ? baseY - 6 + rnd() * gh * 0.9 : baseY - ph - rnd() * gh;
        ctx.fillStyle = `rgb(${36 + Math.floor(rnd() * 50)},${96 + Math.floor(rnd() * 70)},${36 + Math.floor(rnd() * 30)})`;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 4 + rnd() * 7, 2.5 + rnd() * 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
      if (rnd() < 0.5) {
        const fc = ['#f25a9a', '#f6d23a', '#f2f2f2', '#e8402a', '#b46ae0'][Math.floor(rnd() * 5)];
        for (let k = 0; k < 7; k++) {
          ctx.fillStyle = fc;
          ctx.beginPath();
          ctx.arc(px + rnd() * pw, baseY - ph - rnd() * gh * 0.9, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // pot
      ctx.fillStyle = ['#b8623a', '#a8502c', '#d8d4c8', '#3f78b8', '#8a8a82'][Math.floor(rnd() * 5)];
      ctx.beginPath();
      ctx.moveTo(px, baseY - ph);
      ctx.lineTo(px + pw, baseY - ph);
      ctx.lineTo(px + pw * 0.82, baseY);
      ctx.lineTo(px + pw * 0.18, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(px + pw * 0.6, baseY - ph, pw * 0.3, ph);
      px += pw + 4 + rnd() * 10;
    }
    ctx.restore();
  }
  // ── jars / barrels / cylinders / stools (alpha) ──
  {
    const x = 768;
    const y = 912;
    const base = y + 112;
    // big glazed water jar
    const jar = (cx: number, r: number, h: number): void => {
      ctx.fillStyle = '#6a3e22';
      ctx.beginPath();
      ctx.ellipse(cx, base - h / 2, r, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - r * 0.55, base - h - 3, r * 1.1, 8);
      ctx.strokeStyle = '#d8b25a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(cx, base - h * 0.55, r * 0.96, h * 0.12, 0, 0, Math.PI);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.4, base - h * 0.6, r * 0.2, h * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    jar(x + 34, 30, 74);
    jar(x + 150, 22, 54);
    // blue barrel
    ctx.fillStyle = '#2f66b8';
    ctx.fillRect(x + 70, base - 78, 44, 78);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 70, base - 56, 44, 3);
    ctx.fillRect(x + 70, base - 26, 44, 3);
    ctx.fillRect(x + 102, base - 78, 12, 78);
    // gas cylinders
    for (const [gx, col] of [[182, '#3a8a4a'], [206, '#e8762a']] as const) {
      ctx.fillStyle = col;
      ctx.fillRect(x + gx, base - 52, 20, 52);
      ctx.beginPath();
      ctx.arc(x + gx + 10, base - 52, 10, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x + gx + 6, base - 70, 8, 9);
    }
    // stacked stools
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k % 2 ? '#d8342a' : '#e8463a';
      ctx.beginPath();
      ctx.moveTo(x + 232, base - 30 - k * 9);
      ctx.lineTo(x + 252, base - 30 - k * 9);
      ctx.lineTo(x + 256, base - k * 9);
      ctx.lineTo(x + 228, base - k * 9);
      ctx.closePath();
      ctx.fill();
    }
  }
  return c;
}

// ─────────────────────────────────────────────────────────── usa atlas ──
// Shared by Miami Wynwood and Brooklyn Docks ('usaDecor' lit alpha-cut, 'usaGlow' unlit): original
// abstract murals, roll-up doors, steel-sash windows, lit windows, quay facings, chain-link, dock clutter.

const UW = 1024;
const UH = 1024;
export const USA_UV = {
  /** Abstract murals 512×192 (≈ 2.67 : 1). */
  mural: [0, 1, 2, 3].map((i) => uvOf((i & 1) * 512, (i >> 1) * 192, 512, 192, UW, UH)),
  /** Roll-up doors: plain grey, painted pastel, rusty. */
  rollDoor: [0, 1, 2].map((i) => uvOf(i * 128, 384, 128, 128, UW, UH)),
  /** Steel-sash factory windows: dark, lit (glow material), boarded. */
  indWin: uvOf(384, 384, 128, 128, UW, UH),
  indWinLit: uvOf(512, 384, 128, 128, UW, UH),
  indWinBoard: uvOf(640, 384, 128, 128, UW, UH),
  /** Loading-dock doors with bumpers. */
  dockDoor: [0, 1].map((i) => uvOf(768 + i * 128, 384, 128, 128, UW, UH)),
  /** Lit arched warehouse windows (alpha-cut arch, glow material, 3 : 5). */
  archLit: [0, 1, 2].map((i) => uvOf(i * 96, 512, 96, 160, UW, UH)),
  /** Art-deco windows, lit (glow material, 4 : 5). */
  decoWin: [0, 1].map((i) => uvOf(288 + i * 128, 512, 128, 160, UW, UH)),
  decoDoor: uvOf(544, 512, 96, 160, UW, UH),
  /** Plaster sunburst relief (near white → tint with the wall colour). */
  decoRelief: uvOf(640, 512, 160, 160, UW, UH),
  /** Worn painted wall lettering (alpha cut, generic words). */
  ghostSign: uvOf(800, 512, 224, 160, UW, UH),
  /** Concrete seawall facing (8 m × 1.65 m, tiles horizontally). */
  quayMiami: uvOf(0, 672, 1024, 128, UW, UH, 0),
  /** Granite dock wall with timber fenders and iron rings (8 m × 1.75 m, tiles horizontally). */
  quayDock: uvOf(0, 800, 1024, 128, UW, UH, 0),
  /** Chain-link mesh (tiles both ways; turns into a dark sheet in the distance). */
  chainLink: uvOf(0, 928, 96, 96, UW, UH, 0),
  containerDoor: uvOf(96, 928, 96, 96, UW, UH),
  acGrille: uvOf(192, 928, 96, 96, UW, UH),
  /** Yellow / black hazard stripes (tiles horizontally). */
  hazard: uvOf(288, 928, 128, 96, UW, UH),
  posters: uvOf(416, 928, 128, 96, UW, UH),
  /** Spray scribbles (alpha cut). */
  tags: uvOf(544, 928, 256, 96, UW, UH),
  /** Neon tube sign (alpha cut, glow material). */
  neon: uvOf(800, 928, 224, 96, UW, UH),
} as const;

const MURAL_PALS: readonly (readonly string[])[] = [
  ['#ff5a8a', '#19c2c9', '#ffd22e', '#1d2a5a', '#fff4e0', '#ff8a3a'],
  ['#ff7a5a', '#0e8a6a', '#ffe9a8', '#143a3a', '#f25aa0', '#7ad8c0'],
  ['#2a3a9a', '#ff6fa8', '#ffb23a', '#5ad0e8', '#fdf2e0', '#8a3ad0'],
  ['#e8402a', '#ffd22e', '#31b8a0', '#2a6ad8', '#f08ac0', '#1c1d21'],
];

function mural(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, kind: number): void {
  const pal = MURAL_PALS[kind % MURAL_PALS.length];
  const col = (): string => pal[Math.floor(rnd() * pal.length)];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = pal[4];
  ctx.fillRect(x, y, w, h);
  if (kind === 0) {
    // big overlapping discs, quarter arcs and stripe fields
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = col();
      const r = 40 + rnd() * 90;
      ctx.beginPath();
      ctx.arc(x + rnd() * w, y + rnd() * h, r, 0, Math.PI * (rnd() < 0.5 ? 2 : 1), rnd() < 0.5);
      ctx.fill();
    }
    for (let i = 0; i < 4; i++) {
      const sx = x + rnd() * w;
      ctx.save();
      ctx.translate(sx, y + h / 2);
      ctx.rotate((rnd() - 0.5) * 1.2);
      const c0 = col();
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = k % 2 ? c0 : pal[4];
        ctx.fillRect(-36 + k * 12, -h, 12, h * 2);
      }
      ctx.restore();
    }
    ctx.strokeStyle = pal[3];
    ctx.lineWidth = 7;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(x + rnd() * w, y + rnd() * h, 30 + rnd() * 60, rnd() * 6, rnd() * 6 + 2.5);
      ctx.stroke();
    }
  } else if (kind === 1) {
    // jungle: sun disc + big leaves
    ctx.fillStyle = pal[0];
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = pal[2];
    ctx.beginPath();
    ctx.arc(x + w * 0.68, y + h * 0.42, h * 0.36, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 26; i++) {
      const lx = x + rnd() * w;
      const ly = y + h * (0.35 + rnd() * 0.75);
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
      const L = 60 + rnd() * 90;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(a);
      ctx.fillStyle = [pal[1], pal[3], pal[5], pal[1]][Math.floor(rnd() * 4)];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(L * 0.5, -L * 0.3, L, 0);
      ctx.quadraticCurveTo(L * 0.5, L * 0.3, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(L - 6, 0);
      ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = pal[4];
      ctx.beginPath();
      ctx.arc(x + rnd() * w, y + rnd() * h * 0.5, 4 + rnd() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 2) {
    // flowing wave bands
    const bands = 9;
    for (let b = 0; b < bands; b++) {
      ctx.fillStyle = pal[b % pal.length];
      const ph = rnd() * 6;
      const amp = 14 + rnd() * 22;
      const fr = 0.008 + rnd() * 0.012;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      for (let px = 0; px <= w; px += 8) ctx.lineTo(x + px, y + (h * b) / bands + Math.sin(px * fr + ph) * amp - 10);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = pal[4];
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(x + rnd() * w, y + rnd() * h, 1.5 + rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // a big eye-like oval (no real artwork)
    ctx.fillStyle = pal[4];
    ctx.beginPath();
    ctx.ellipse(x + w * 0.3, y + h * 0.45, 70, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    ctx.arc(x + w * 0.3, y + h * 0.45, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1d21';
    ctx.beginPath();
    ctx.arc(x + w * 0.3, y + h * 0.45, 14, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // faceted triangles with dark outlines
    const s = 48;
    ctx.lineWidth = 3;
    ctx.strokeStyle = pal[5];
    for (let r = -1; r < h / (s * 0.866) + 1; r++) {
      for (let k = -1; k < (w / s) * 2 + 2; k++) {
        const px = x + (k * s) / 2;
        const py = y + r * s * 0.866;
        const up = (k + r) % 2 === 0;
        ctx.fillStyle = pal[Math.floor(rnd() * 5)];
        ctx.beginPath();
        if (up) {
          ctx.moveTo(px, py + s * 0.866);
          ctx.lineTo(px + s / 2, py);
          ctx.lineTo(px + s, py + s * 0.866);
        } else {
          ctx.moveTo(px, py);
          ctx.lineTo(px + s, py);
          ctx.lineTo(px + s / 2, py + s * 0.866);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  // paint is on a wall: sun fade towards the top, splash-back dirt at the bottom, a few drips
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(255,250,235,0.16)');
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(50,40,28,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(40,32,24,${0.1 + rnd() * 0.14})`;
    ctx.fillRect(x + rnd() * w, y, 2 + rnd() * 5, h * (0.3 + rnd() * 0.7));
  }
  ctx.restore();
}

function slatDoor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, rnd: () => number, rust: number): void {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  for (let yy = y; yy < y + h; yy += 8) {
    const g = ctx.createLinearGradient(0, yy, 0, yy + 8);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(x, yy, w, 8);
  }
  if (rust > 0) rustSpots(ctx, x, y, w, h, rnd, rust, 0.45);
  ctx.fillStyle = 'rgba(20,20,22,0.85)';
  ctx.fillRect(x, y, 5, h);
  ctx.fillRect(x + w - 5, y, 5, h);
  ctx.fillRect(x, y, w, 7);
  ctx.fillStyle = '#3a3c40';
  ctx.fillRect(x + 5, y + h - 9, w - 10, 9);
  ctx.fillStyle = '#c8c8c0';
  ctx.fillRect(x + w / 2 - 8, y + h - 20, 16, 5);
  const dg = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h);
  dg.addColorStop(0, 'rgba(40,32,24,0)');
  dg.addColorStop(1, 'rgba(40,32,24,0.45)');
  ctx.fillStyle = dg;
  ctx.fillRect(x, y + h * 0.55, w, h * 0.45);
}

function scribble(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, color: string, lw: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let px = x;
  let py = y + h * (0.3 + rnd() * 0.5);
  ctx.moveTo(px, py);
  const n = 7 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const nx = x + (w * (i + 1)) / n;
    const ny = y + h * (0.1 + rnd() * 0.8);
    ctx.quadraticCurveTo(px + (rnd() - 0.2) * w * 0.12, y + h * rnd(), nx, ny);
    px = nx;
    py = ny;
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y + h * 0.92);
  ctx.lineTo(x + w * 0.9, y + h * (0.84 + rnd() * 0.1));
  ctx.stroke();
}

function sashWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, mode: 0 | 1 | 2): void {
  ctx.fillStyle = mode === 1 ? '#2a2420' : '#23292c';
  ctx.fillRect(x, y, w, h);
  const cols = 4;
  const rows = 5;
  const pw = (w - 10) / cols;
  const ph = (h - 10) / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const px = x + 5 + k * pw + 1.5;
      const py = y + 5 + r * ph + 1.5;
      const t = rnd();
      if (mode === 1) {
        ctx.fillStyle = t < 0.12 ? '#3a2c1c' : ['#ffe2a0', '#ffd27a', '#fff0c8', '#f6c060'][Math.floor(rnd() * 4)];
      } else if (mode === 2 && t < 0.55) {
        ctx.fillStyle = ['#a88458', '#8a6a44', '#b89868'][Math.floor(rnd() * 3)];
      } else {
        ctx.fillStyle = t < 0.1 ? '#0c0e10' : t < 0.25 ? '#8a9aa0' : t < 0.4 ? '#56707a' : '#34464e';
      }
      ctx.fillRect(px, py, pw - 3, ph - 3);
      if (mode !== 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(px, py, pw - 3, 2);
      }
    }
  }
  if (mode === 1) {
    // silhouettes of shelving / a lamp shade inside
    ctx.fillStyle = 'rgba(60,34,14,0.45)';
    ctx.fillRect(x + 8, y + h * 0.62, w * 0.5, h * 0.3);
    ctx.fillRect(x + w * 0.68, y + h * 0.3, w * 0.2, h * 0.62);
  }
}

export function drawUsaAtlas(seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(UW, UH);
  const rnd = seededRng(seed);
  for (let i = 0; i < 4; i++) mural(ctx, (i & 1) * 512, (i >> 1) * 192, 512, 192, rnd, i);

  // ── roll-up doors ──
  slatDoor(ctx, 0, 384, 128, 128, '#9a9ea0', rnd, 10);
  slatDoor(ctx, 128, 384, 128, 128, '#6ad0c4', rnd, 6);
  scribble(ctx, 146, 420, 92, 60, rnd, '#ff4fa3', 5);
  scribble(ctx, 150, 440, 80, 50, rnd, '#1c1d21', 3);
  slatDoor(ctx, 256, 384, 128, 128, '#7a5a48', rnd, 70);
  scribble(ctx, 276, 430, 88, 50, rnd, '#e8e4d8', 3);

  // ── steel-sash windows ──
  sashWindow(ctx, 384, 384, 128, 128, rnd, 0);
  sashWindow(ctx, 512, 384, 128, 128, rnd, 1);
  sashWindow(ctx, 640, 384, 128, 128, rnd, 2);

  // ── dock doors ──
  for (let v = 0; v < 2; v++) {
    const x = 768 + v * 128;
    const y = 384;
    ctx.fillStyle = '#2a2c30';
    ctx.fillRect(x, y, 128, 128);
    slatDoor(ctx, x + 10, y + 10, 108, 118, v ? '#3a5a78' : '#c8c4b8', rnd, v ? 30 : 8);
    // hazard jambs + number plate
    for (let k = 0; k < 16; k++) {
      ctx.fillStyle = k % 2 ? '#e8c020' : '#1c1d21';
      ctx.fillRect(x, y + k * 8, 10, 8);
      ctx.fillRect(x + 118, y + k * 8, 10, 8);
    }
    ctx.fillStyle = '#f2f0e6';
    ctx.fillRect(x + 50, y + 16, 28, 22);
    ctx.fillStyle = '#1c1d21';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(3 + v * 4), x + 64, y + 28);
  }

  // ── lit arched windows (alpha) ──
  for (let v = 0; v < 3; v++) {
    const x = v * 96;
    const y = 512;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 160);
    ctx.lineTo(x + 2, y + 46);
    ctx.arc(x + 48, y + 46, 46, Math.PI, 0);
    ctx.lineTo(x + 94, y + 160);
    ctx.closePath();
    ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + 160);
    if (v === 2) {
      g.addColorStop(0, '#9ac0e8');
      g.addColorStop(1, '#3a4a6a');
    } else {
      g.addColorStop(0, '#fff0c0');
      g.addColorStop(0.6, v ? '#ffb85a' : '#ffd88a');
      g.addColorStop(1, '#b8682a');
    }
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 96, 160);
    if (v === 1) {
      // half-drawn blind
      ctx.fillStyle = '#e8d8b0';
      ctx.fillRect(x, y, 96, 70);
      ctx.fillStyle = 'rgba(120,90,50,0.3)';
      for (let yy = y + 6; yy < y + 70; yy += 7) ctx.fillRect(x, yy, 96, 2);
    } else if (v === 0) {
      ctx.fillStyle = 'rgba(70,40,16,0.5)';
      ctx.fillRect(x + 12, y + 104, 40, 56);
      ctx.beginPath();
      ctx.arc(x + 68, y + 96, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + 59, y + 104, 19, 56);
    }
    // sash bars
    ctx.fillStyle = '#1c1612';
    ctx.fillRect(x + 46, y, 4, 160);
    for (const yy of [46, 84, 122]) ctx.fillRect(x, y + yy, 96, 3.5);
    ctx.fillRect(x + 23, y + 46, 2.5, 114);
    ctx.fillRect(x + 71, y + 46, 2.5, 114);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1c1612';
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 160);
    ctx.lineTo(x + 2, y + 46);
    ctx.arc(x + 48, y + 46, 46, Math.PI, 0);
    ctx.lineTo(x + 94, y + 160);
    ctx.stroke();
    ctx.restore();
  }

  // ── deco windows (lit) ──
  {
    const y = 512;
    // 0: curtained room behind horizontal mullions
    let x = 288;
    const g = ctx.createLinearGradient(0, y, 0, y + 160);
    g.addColorStop(0, '#fff2cc');
    g.addColorStop(1, '#f0a05a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 128, 160);
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 44, y);
    ctx.quadraticCurveTo(x + 14, y + 80, x + 30, y + 160);
    ctx.lineTo(x, y + 160);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 128, y);
    ctx.lineTo(x + 84, y);
    ctx.quadraticCurveTo(x + 114, y + 80, x + 98, y + 160);
    ctx.lineTo(x + 128, y + 160);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,30,20,0.5)';
    ctx.fillRect(x + 52, y + 96, 26, 64);
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(x, y, 128, 6);
    ctx.fillRect(x, y + 154, 128, 6);
    ctx.fillRect(x, y, 6, 160);
    ctx.fillRect(x + 122, y, 6, 160);
    ctx.fillRect(x + 62, y, 4, 160);
    for (const yy of [40, 80, 120]) ctx.fillRect(x, y + yy, 128, 3);
    // 1: glass-block panel
    x = 416;
    ctx.fillStyle = '#e8f4f0';
    ctx.fillRect(x, y, 128, 160);
    for (let r = 0; r < 10; r++) {
      for (let k = 0; k < 8; k++) {
        const bg = ctx.createRadialGradient(x + k * 16 + 8, y + r * 16 + 8, 1, x + k * 16 + 8, y + r * 16 + 8, 10);
        bg.addColorStop(0, rnd() < 0.3 ? '#fff6d0' : '#c8f4ec');
        bg.addColorStop(1, '#5ac0b4');
        ctx.fillStyle = bg;
        ctx.fillRect(x + k * 16 + 1.5, y + r * 16 + 1.5, 13, 13);
      }
    }
  }
  // ── deco door ──
  {
    const x = 544;
    const y = 512;
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(x, y, 96, 160);
    ctx.fillStyle = '#2aa8a4';
    ctx.fillRect(x + 8, y + 8, 80, 152);
    ctx.fillStyle = '#16282e';
    ctx.beginPath();
    ctx.arc(x + 48, y + 52, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d8dcdc';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(x + 42, y + 46, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8dcdc';
    for (const yy of [96, 108, 120]) ctx.fillRect(x + 8, y + yy, 80, 4);
    ctx.fillRect(x + 76, y + 80, 5, 22);
    const dg = ctx.createLinearGradient(0, y + 110, 0, y + 160);
    dg.addColorStop(0, 'rgba(40,32,24,0)');
    dg.addColorStop(1, 'rgba(40,32,24,0.4)');
    ctx.fillStyle = dg;
    ctx.fillRect(x, y + 110, 96, 50);
  }
  // ── sunburst relief ──
  {
    const x = 640;
    const y = 512;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 160, 160);
    ctx.clip();
    ctx.fillStyle = '#f2efe8';
    ctx.fillRect(x, y, 160, 160);
    for (let i = 0; i < 11; i++) {
      const a0 = Math.PI + (i / 11) * Math.PI;
      const a1 = Math.PI + ((i + 1) / 11) * Math.PI;
      ctx.fillStyle = i % 2 ? '#d6d2c8' : '#fdfcf8';
      ctx.beginPath();
      ctx.moveTo(x + 80, y + 150);
      ctx.arc(x + 80, y + 150, 132, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#c8c4ba';
    ctx.beginPath();
    ctx.arc(x + 80, y + 150, 44, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#fbfaf4';
    ctx.beginPath();
    ctx.arc(x + 80, y + 150, 36, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#bcb8ae';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 2.5, y + 2.5, 155, 155);
    ctx.fillStyle = '#d0ccc2';
    ctx.fillRect(x, y + 150, 160, 10);
    ctx.restore();
  }
  // ── ghost sign (alpha, worn) ──
  {
    const x = 800;
    const y = 512;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 224, 160);
    ctx.clip();
    ctx.fillStyle = '#e8e2d2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 44px Impact, "Arial Narrow", "DejaVu Sans Condensed", Arial, sans-serif';
    ctx.fillText('STORAGE', x + 112, y + 34);
    ctx.font = '900 30px Impact, "Arial Narrow", "DejaVu Sans Condensed", Arial, sans-serif';
    ctx.fillText('& SUPPLY Co.', x + 112, y + 80);
    ctx.fillRect(x + 10, y + 104, 204, 5);
    ctx.font = '900 34px Impact, "Arial Narrow", "DejaVu Sans Condensed", Arial, sans-serif';
    ctx.fillText('PIER 7', x + 112, y + 134);
    // wear: punch thousands of small holes
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 1300; i++) {
      ctx.fillStyle = 'rgba(0,0,0,1)';
      const s = 1 + rnd() * 3.5;
      ctx.fillRect(x + rnd() * 224, y + rnd() * 160, s, s * (0.6 + rnd() * 2));
    }
    ctx.restore();
  }
  // ── quay facings (periodic in x) ──
  const wrapX = (fn: (ox: number) => void): void => {
    for (const o of [0, -UW, UW]) fn(o);
  };
  {
    // Miami: precast concrete seawall panels
    const y = 672;
    const h = 128;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, UW, h);
    ctx.clip();
    ctx.fillStyle = '#b4b0a4';
    ctx.fillRect(0, y, UW, h);
    for (let i = 0; i < 220; i++) {
      const px = rnd() * UW;
      const py = y + rnd() * h;
      const rw = 8 + rnd() * 60;
      const rh = 3 + rnd() * 14;
      const col = rnd() < 0.55 ? `rgba(50,44,34,${0.03 + rnd() * 0.08})` : `rgba(245,240,225,${0.03 + rnd() * 0.08})`;
      wrapX((o) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(px + o, py, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    for (let k = 0; k < 8; k++) {
      const jx = 40 + k * 128;
      ctx.fillStyle = 'rgba(30,26,20,0.5)';
      ctx.fillRect(jx, y, 2, h);
      ctx.fillStyle = 'rgba(255,255,245,0.14)';
      ctx.fillRect(jx + 2, y, 2, h);
      // weep hole with a rust / algae streak
      const wy = y + 44 + rnd() * 10;
      const sg = ctx.createLinearGradient(0, wy, 0, y + h);
      sg.addColorStop(0, k % 3 ? 'rgba(126,70,30,0.7)' : 'rgba(40,56,30,0.7)');
      sg.addColorStop(1, 'rgba(60,50,30,0.1)');
      ctx.fillStyle = sg;
      ctx.fillRect(jx + 58, wy, 7 + rnd() * 5, y + h - wy);
      ctx.fillStyle = '#14140f';
      ctx.beginPath();
      ctx.arc(jx + 62, wy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // cap shadow, tie-rod plates, painted depth marks
    const cg = ctx.createLinearGradient(0, y, 0, y + 22);
    cg.addColorStop(0, 'rgba(20,18,14,0.5)');
    cg.addColorStop(1, 'rgba(20,18,14,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, y, UW, 22);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(100 + k * 256, y + 30, 12, 12);
      ctx.fillStyle = 'rgba(126,70,30,0.45)';
      ctx.fillRect(103 + k * 256, y + 42, 6, 40);
    }
    scribble(ctx, 600, y + 24, 90, 40, rnd, 'rgba(255,80,160,0.75)', 4);
    scribble(ctx, 180, y + 30, 70, 34, rnd, 'rgba(30,200,200,0.7)', 3);
    const tg = ctx.createLinearGradient(0, y, 0, y + h);
    tg.addColorStop(0.45, 'rgba(30,44,36,0)');
    tg.addColorStop(0.75, 'rgba(30,44,36,0.4)');
    tg.addColorStop(1, 'rgba(18,30,24,0.8)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, y, UW, h);
    // barnacle line
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(220,215,195,${0.2 + rnd() * 0.4})`;
      ctx.fillRect(rnd() * UW, y + 82 + rnd() * 16, 1.5 + rnd() * 2.5, 1.5 + rnd() * 2);
    }
    ctx.restore();
  }
  {
    // Brooklyn: granite ashlar, timber fenders, iron rings
    const y = 800;
    const h = 128;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, UW, h);
    ctx.clip();
    ctx.fillStyle = '#3a3630';
    ctx.fillRect(0, y, UW, h);
    const courses = 4;
    const ch = h / courses;
    for (let r = 0; r < courses; r++) {
      let px = r % 2 ? -40 : 0;
      while (px < UW) {
        let bw = 70 + Math.floor(rnd() * 70);
        if (UW - (px + bw) < 60) bw = UW - px;
        const tone = 96 + Math.floor(rnd() * 46);
        const col = `rgb(${tone + 8},${tone + 2},${tone - 8})`;
        const bx = px;
        wrapX((o) => {
          ctx.fillStyle = col;
          ctx.fillRect(bx + o + 1.5, y + r * ch + 1.5, bw - 3, ch - 3);
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          ctx.fillRect(bx + o + 1.5, y + r * ch + 1.5, bw - 3, 2.5);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(bx + o + 1.5, y + (r + 1) * ch - 5, bw - 3, 3.5);
        });
        px += bw;
      }
    }
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rnd() < 0.5 ? `rgba(20,18,14,${0.05 + rnd() * 0.12})` : `rgba(240,235,220,${0.04 + rnd() * 0.08})`;
      ctx.fillRect(rnd() * UW, y + rnd() * h, 2 + rnd() * 9, 1 + rnd() * 4);
    }
    // timber fenders (vertical baulks with bolts) every 2 m, two walers
    for (let k = 0; k < 4; k++) {
      const fx = 60 + k * 256;
      const g = ctx.createLinearGradient(fx, 0, fx + 30, 0);
      g.addColorStop(0, '#2a2018');
      g.addColorStop(0.3, '#5a4632');
      g.addColorStop(0.75, '#463626');
      g.addColorStop(1, '#1c1610');
      ctx.fillStyle = g;
      ctx.fillRect(fx, y, 30, h);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let s = 0; s < 6; s++) ctx.fillRect(fx + 3 + rnd() * 24, y + rnd() * h, 1.2, 14 + rnd() * 40);
      ctx.fillStyle = '#16120e';
      for (const by of [16, 70]) {
        ctx.beginPath();
        ctx.arc(fx + 15, y + by, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(126,70,30,0.5)';
      ctx.fillRect(fx + 13, y + 20, 4, 30);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(fx + 30, y, 7, h);
    }
    // iron mooring rings with rust trails
    for (const rx of [190, 700]) {
      const sg = ctx.createLinearGradient(0, y + 34, 0, y + h);
      sg.addColorStop(0, 'rgba(140,72,30,0.75)');
      sg.addColorStop(1, 'rgba(140,72,30,0.05)');
      ctx.fillStyle = sg;
      ctx.fillRect(rx - 8, y + 34, 16, h - 34);
      ctx.fillStyle = '#1e1a16';
      ctx.fillRect(rx - 6, y + 22, 12, 10);
      ctx.strokeStyle = '#2a2420';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(rx, y + 44, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    const tg = ctx.createLinearGradient(0, y, 0, y + h);
    tg.addColorStop(0, 'rgba(10,8,6,0.3)');
    tg.addColorStop(0.15, 'rgba(10,8,6,0)');
    tg.addColorStop(0.5, 'rgba(20,30,22,0)');
    tg.addColorStop(0.78, 'rgba(20,30,22,0.5)');
    tg.addColorStop(1, 'rgba(10,18,14,0.85)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, y, UW, h);
    ctx.restore();
  }
  // ── chain-link (tiles; faint dark veil so far mips stay above the alpha cut) ──
  {
    const x = 0;
    const y = 928;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 96, 96);
    ctx.clip();
    ctx.fillStyle = 'rgba(70,76,80,0.3)';
    ctx.fillRect(x, y, 96, 96);
    ctx.strokeStyle = '#aab0b4';
    ctx.lineWidth = 2.6;
    for (let k = -6; k <= 6; k++) {
      ctx.beginPath();
      ctx.moveTo(x + k * 16, y);
      ctx.lineTo(x + k * 16 + 96, y + 96);
      ctx.moveTo(x + k * 16 + 96, y);
      ctx.lineTo(x + k * 16, y + 96);
      ctx.stroke();
    }
    ctx.restore();
  }
  // ── container door end ──
  {
    const x = 96;
    const y = 928;
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(x, y, 96, 96);
    corrugate(ctx, x, y, 96, 96, 12);
    ctx.fillStyle = 'rgba(20,20,20,0.7)';
    ctx.fillRect(x + 47, y, 2.5, 96);
    ctx.strokeStyle = 'rgba(20,20,20,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, 93, 93);
    ctx.fillStyle = '#c8ccce';
    for (const bx of [16, 34, 60, 78]) ctx.fillRect(x + bx, y + 4, 3, 88);
    ctx.fillStyle = '#2a2c2e';
    for (const bx of [14, 32, 58, 76]) ctx.fillRect(x + bx, y + 52, 8, 5);
    ctx.fillStyle = 'rgba(20,20,20,0.75)';
    for (let r = 0; r < 3; r++) ctx.fillRect(x + 56, y + 12 + r * 7, 30 - r * 6, 3);
    rustSpots(ctx, x, y, 96, 96, rnd, 26, 0.5);
  }
  // ── AC grille ──
  {
    const x = 192;
    const y = 928;
    ctx.fillStyle = '#d6d6ce';
    ctx.fillRect(x, y, 96, 96);
    ctx.fillStyle = '#23262a';
    ctx.beginPath();
    ctx.arc(x + 48, y + 48, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a9094';
    ctx.lineWidth = 1.6;
    for (let r = 8; r < 38; r += 6) {
      ctx.beginPath();
      ctx.arc(x + 48, y + 48, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.translate(x + 48, y + 48);
      ctx.rotate((k * Math.PI) / 4);
      ctx.fillStyle = 'rgba(138,144,148,0.8)';
      ctx.fillRect(-38, -1, 76, 2);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(126,70,30,0.4)';
    ctx.fillRect(x + 6, y + 80, 84, 16);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, 94, 94);
  }
  // ── hazard stripes ──
  {
    const x = 288;
    const y = 928;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 128, 96);
    ctx.clip();
    ctx.fillStyle = '#e8c020';
    ctx.fillRect(x, y, 128, 96);
    ctx.fillStyle = '#1c1d21';
    for (let k = -4; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(x + k * 32, y + 96);
      ctx.lineTo(x + k * 32 + 16, y + 96);
      ctx.lineTo(x + k * 32 + 112, y);
      ctx.lineTo(x + k * 32 + 96, y);
      ctx.closePath();
      ctx.fill();
    }
    mottle(ctx, x, y, 128, 96, rnd, 30, 'rgba(40,30,20,', 'rgba(255,255,255,', 0.22);
    ctx.restore();
  }
  // ── posters (alpha) ──
  {
    const x = 416;
    const y = 928;
    for (let i = 0; i < 6; i++) {
      const pw = 30 + rnd() * 20;
      const ph = 40 + rnd() * 24;
      const px = x + 3 + rnd() * (122 - pw);
      const py = y + 3 + rnd() * (90 - ph);
      ctx.fillStyle = ['#f4f0e2', '#ff5a8a', '#ffd22e', '#19c2c9', '#1c1d21', '#f2f2f2'][Math.floor(rnd() * 6)];
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = ['#1c1d21', '#ffffff', '#e8402a', '#2a3a9a'][Math.floor(rnd() * 4)];
      ctx.beginPath();
      ctx.arc(px + pw / 2, py + ph * 0.38, pw * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px + 4, py + ph * 0.72, pw - 8, 3);
      ctx.fillRect(px + 4, py + ph * 0.84, pw * 0.5, 2);
      ctx.clearRect(px + pw - 7, py - 1, 8, 6 + rnd() * 8);
    }
  }
  // ── tags (alpha) ──
  {
    const x = 544;
    const y = 928;
    const cols = ['#ff4fa3', '#1c1d21', '#19c2c9', '#ffffff', '#ffd22e'];
    for (let i = 0; i < 5; i++) scribble(ctx, x + 6 + rnd() * 120, y + 4 + rnd() * 40, 80 + rnd() * 50, 30 + rnd() * 26, rnd, cols[i], 3 + rnd() * 3);
  }
  // ── neon sign (alpha) ──
  {
    const x = 800;
    const y = 928;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3af0ff';
    ctx.lineWidth = 5;
    roundRect(ctx, x + 6, y + 6, 212, 84, 18);
    ctx.stroke();
    ctx.font = '900 56px "Arial Rounded MT Bold", "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ff5ab0';
    ctx.strokeText('OPEN', x + 112, y + 50);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText('OPEN', x + 112, y + 50);
  }
  return c;
}
