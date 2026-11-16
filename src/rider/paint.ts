/**
 * Canvas 2D drawing helpers shared by the rider / board texture painters: colour maths, the WHY NOT
 * wordmark and the procedural "graphic" styles of GearLook.
 */
import { BRAND } from '../config';
import type { GearLook } from '../types';

export type Ctx = CanvasRenderingContext2D;

export function css(c: number): string {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

export function rgba(c: number, a: number): string {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

/** Mix two 0xRRGGBB colours (sRGB space, good enough for paint). */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bl = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** k < 0 darkens towards black, k > 0 lightens towards white. */
export function shade(c: number, k: number): number {
  return k < 0 ? mix(c, 0x000000, -k) : mix(c, 0xffffff, k);
}

export function luma(c: number): number {
  return (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;
}

/** A colour that reads on top of `bg`: `pref` if it has enough contrast, else white / brand dark. */
export function contrast(bg: number, pref: number): number {
  if (Math.abs(luma(bg) - luma(pref)) > 0.28 || colorDist(bg, pref) > 150) return pref;
  return luma(bg) > 0.5 ? BRAND.colors.dark : BRAND.colors.white;
}

function colorDist(a: number, b: number): number {
  return Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255));
}

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export interface WordmarkOpts {
  /** Horizontal squeeze (condensed look). */
  squeeze?: number;
  /** Italic shear. */
  skew?: number;
  /** Rotation in radians. */
  rot?: number;
  stroke?: string;
  strokeW?: number;
  alpha?: number;
}

/**
 * Brand wordmark: heavy condensed italic built from whatever bold system face exists (condensing and
 * the italic shear are done with the canvas transform so it looks the same on every device).
 * (cx, cy) = centre, `h` = cap height in px. Returns the drawn width.
 */
export function drawWordmark(ctx: Ctx, text: string, cx: number, cy: number, h: number, fill: string, o: WordmarkOpts = {}): number {
  const squeeze = o.squeeze ?? 0.8;
  ctx.save();
  ctx.translate(cx, cy);
  if (o.rot) ctx.rotate(o.rot);
  ctx.transform(squeeze, 0, -(o.skew ?? 0.2), 1, 0, 0);
  ctx.font = `900 ${Math.round(h * 1.38)}px "Arial Black", "Helvetica Neue", "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = o.alpha ?? 1;
  const w = ctx.measureText(text).width * squeeze;
  if (o.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.strokeW ?? h * 0.16;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(text, 0, h * 0.5);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, h * 0.5);
  // a hair of same-colour stroke fattens thin fallback fonts
  ctx.lineWidth = h * 0.035;
  ctx.strokeStyle = fill;
  ctx.strokeText(text, 0, h * 0.5);
  ctx.restore();
  return w;
}

export function brandWords(): [string, string] {
  const parts = BRAND.name.split(' ');
  return [parts[0] ?? BRAND.name, parts.slice(1).join(' ') || ''];
}

/**
 * Procedural pattern of a GearLook painted inside (x, y, w, h); the rect is assumed to be already
 * filled with look.primary. Long axis = x.
 */
export function paintGraphic(ctx: Ctx, x: number, y: number, w: number, h: number, look: GearLook, seed = 7): void {
  const r = rng(seed * 977 + look.primary);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  switch (look.graphic) {
    case 'stripe': {
      ctx.fillStyle = css(look.secondary);
      ctx.transform(1, 0, -0.55, 1, 0, 0);
      const bx = x + w * 0.56 + (y + h) * 0.55;
      ctx.fillRect(bx, y, w * 0.11, h);
      ctx.fillStyle = css(look.accent);
      ctx.fillRect(bx + w * 0.125, y, w * 0.035, h);
      ctx.fillRect(bx - w * 0.05, y, w * 0.02, h);
      break;
    }
    case 'split': {
      ctx.fillStyle = css(look.secondary);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.42, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w * 0.58, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = css(look.accent);
      ctx.lineWidth = Math.max(2, h * 0.03);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.42, y);
      ctx.lineTo(x + w * 0.58, y + h);
      ctx.stroke();
      break;
    }
    case 'camo': {
      const tones = [shade(look.primary, -0.32), mix(look.primary, look.secondary, 0.55), shade(look.primary, 0.16)];
      const n = Math.round((w * h) / 2600);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = css(tones[i % 3]);
        const bx = x + r() * w;
        const by = y + r() * h;
        const rad = (0.5 + r()) * Math.min(w, h) * 0.13;
        ctx.beginPath();
        for (let k = 0; k <= 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const rr = rad * (0.55 + r() * 0.75);
          const px = bx + Math.cos(a) * rr * 1.5;
          const py = by + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.quadraticCurveTo(bx + Math.cos(a - 0.45) * rr * 2.1, by + Math.sin(a - 0.45) * rr * 1.4, px, py);
        }
        ctx.fill();
      }
      break;
    }
    case 'wood': {
      paintWood(ctx, x, y, w, h, look.primary, seed);
      break;
    }
    case 'fade': {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, rgba(look.secondary, 0));
      g.addColorStop(0.45, rgba(look.secondary, 0.15));
      g.addColorStop(1, rgba(look.secondary, 1));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      break;
    }
    case 'checker': {
      const cell = h / 4;
      const cols = Math.ceil((w * 0.2) / cell);
      for (let side = 0; side < 2; side++) {
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < 4; j++) {
            if ((i + j) % 2) continue;
            ctx.fillStyle = css(i % 3 === 2 ? look.accent : look.secondary);
            const cx = side ? x + w - (i + 1) * cell : x + i * cell;
            ctx.fillRect(cx, y + j * cell, cell + 0.5, cell + 0.5);
          }
        }
      }
      break;
    }
    case 'flames': {
      for (let side = 0; side < 2; side++) {
        const dir = side ? -1 : 1;
        const ox = side ? x + w : x;
        const g = ctx.createLinearGradient(ox, 0, ox + dir * w * 0.36, 0);
        g.addColorStop(0, css(look.secondary));
        g.addColorStop(1, css(look.accent));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ox, y);
        const n = 5;
        for (let i = 0; i < n; i++) {
          const y0 = y + (i / n) * h;
          const y1 = y + ((i + 1) / n) * h;
          const len = w * (0.16 + r() * 0.2);
          ctx.bezierCurveTo(ox + dir * len * 0.5, y0 + (y1 - y0) * 0.1, ox + dir * len * 0.7, y0 + (y1 - y0) * 0.75, ox + dir * len, y0 + (y1 - y0) * 0.55);
          ctx.bezierCurveTo(ox + dir * len * 0.55, y0 + (y1 - y0) * 0.8, ox + dir * len * 0.3, y0 + (y1 - y0) * 0.7, ox + dir * w * 0.05, y1);
        }
        ctx.lineTo(ox, y + h);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'tape': {
      ctx.translate(x + w * 0.5, y + h * 0.5);
      ctx.rotate(-0.2);
      const bh = h * 0.3;
      ctx.fillStyle = css(look.accent);
      ctx.fillRect(-w, -bh / 2, w * 2, bh);
      ctx.fillStyle = css(look.secondary);
      const step = bh * 0.9;
      for (let sx = -w; sx < w; sx += step) {
        ctx.beginPath();
        ctx.moveTo(sx, -bh / 2);
        ctx.lineTo(sx + step * 0.5, -bh / 2);
        ctx.lineTo(sx + step * 0.5 - bh * 0.6, bh / 2);
        ctx.lineTo(sx - bh * 0.6, bh / 2);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'logo': {
      // tone-on-tone speed band so plain "logo" items are not flat
      ctx.fillStyle = rgba(shade(look.primary, luma(look.primary) > 0.25 ? -0.5 : 0.5), 0.16);
      ctx.transform(1, 0, -0.5, 1, 0, 0);
      ctx.fillRect(x + w * 0.62 + (y + h) * 0.5, y, w * 0.16, h);
      ctx.fillRect(x + w * 0.83 + (y + h) * 0.5, y, w * 0.04, h);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** Wood veneer: base tone with long wavy grain lines. */
export function paintWood(ctx: Ctx, x: number, y: number, w: number, h: number, tone: number, seed: number): void {
  const r = rng(seed * 131 + 5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(shade(tone, 0.08)));
  g.addColorStop(0.5, css(tone));
  g.addColorStop(1, css(shade(tone, -0.1)));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const lines = Math.round(h / 5);
  for (let i = 0; i < lines; i++) {
    const ly = y + (i + r()) * (h / lines);
    ctx.strokeStyle = rgba(shade(tone, -0.45), 0.1 + r() * 0.22);
    ctx.lineWidth = 0.6 + r() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, ly);
    const amp = 2 + r() * 5;
    const ph = r() * 6;
    for (let px = 0; px <= w; px += w / 12) ctx.lineTo(x + px, ly + Math.sin(px * 0.012 + ph) * amp);
    ctx.stroke();
  }
  ctx.restore();
}

/** Soft dark vignette on the edges of a rect — cheap fake ambient occlusion for wrapped garments. */
export function softShade(ctx: Ctx, x: number, y: number, w: number, h: number, alpha: number, vertical = false): void {
  const g = vertical ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}
