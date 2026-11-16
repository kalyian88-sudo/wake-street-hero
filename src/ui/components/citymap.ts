/**
 * Fallback city map (used until the 3D city backdrop exists): an abstract top-down district drawn on a
 * canvas — street grid, a waterway through the spots in career order, the ride route — as a static picture.
 */
import { clamp, h, shade } from '../dom';

export interface MapSpot {
  id: string;
  /** 0..1 position on the map. */
  x: number;
  y: number;
  open: boolean;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(text: string): number {
  let x = 2166136261;
  for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619);
  return x >>> 0;
}

/** Smooth curve through points (Catmull-Rom → Béziers). */
function curve(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}

export class CityMap {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private cityId = '';
  private color = 0xffffff;
  private spots: MapSpot[] = [];

  constructor() {
    this.canvas = h('canvas', { class: 'wn-citymap__canvas' });
    this.el = h('div', { class: 'wn-citymap' }, this.canvas);
  }

  set(cityId: string, color: number, spots: MapSpot[]): void {
    this.cityId = cityId;
    this.color = color;
    this.spots = spots;
  }

  /** Where a spot sits, in client (viewport) coordinates. */
  project(id: string, out: { x: number; y: number; visible: boolean }): boolean {
    const s = this.spots.find((x) => x.id === id);
    if (!s) return false;
    const r = this.el.getBoundingClientRect();
    out.x = r.left + this.px(s.x) * r.width;
    out.y = r.top + this.py(s.y) * r.height;
    out.visible = r.width > 0;
    return true;
  }

  // Keep pins away from the panel edges so their labels fit.
  private px(x: number): number {
    return 0.16 + clamp(x, 0, 1) * 0.68;
  }
  private py(y: number): number {
    return 0.2 + clamp(y, 0, 1) * 0.62;
  }

  draw(): void {
    const w = this.el.clientWidth;
    const hgt = this.el.clientHeight;
    const ctx = this.canvas.getContext('2d');
    if (!ctx || !w || !hgt) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rand = rng(hash(this.cityId));

    ctx.fillStyle = '#131418';
    ctx.fillRect(0, 0, w, hgt);

    // City blocks on a rotated grid
    const cell = clamp(Math.min(w, hgt) / 7.5, 30, 56);
    const span = Math.hypot(w, hgt);
    ctx.save();
    ctx.translate(w / 2, hgt / 2);
    ctx.rotate(-0.32 + rand() * 0.2);
    for (let gy = -span / 2; gy < span / 2; gy += cell) {
      let gx = -span / 2;
      while (gx < span / 2) {
        const bw = cell * (rand() < 0.3 ? 2 : 1) - 5;
        const r = rand();
        if (r > 0.1) {
          ctx.fillStyle = r > 0.93 ? 'rgba(47,210,122,0.10)' : `rgba(255,255,255,${(0.035 + rand() * 0.06).toFixed(3)})`;
          ctx.beginPath();
          ctx.roundRect(gx, gy, bw, cell - 5, 3);
          ctx.fill();
        }
        gx += bw + 5;
      }
    }
    ctx.restore();

    // Waterway through the spots, entering and leaving off-panel
    const pts: [number, number][] = this.spots.map((s) => [this.px(s.x) * w, this.py(s.y) * hgt]);
    if (pts.length === 0) pts.push([w * 0.5, hgt * 0.5]);
    const first = pts[0];
    const last = pts[pts.length - 1];
    const dirX = pts.length > 1 ? Math.sign(last[0] - first[0]) || 1 : 1;
    const path: [number, number][] = [[first[0] - dirX * w * 0.75, first[1] - hgt * (0.18 + rand() * 0.2)], [first[0] - dirX * w * 0.3, first[1] - hgt * 0.04], ...pts, [last[0] + dirX * w * 0.32, last[1] + hgt * 0.06], [last[0] + dirX * w * 0.8, last[1] + hgt * (0.1 + rand() * 0.25)]];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    curve(ctx, path);
    ctx.strokeStyle = '#131418';
    ctx.lineWidth = cell * 1.05;
    ctx.stroke();
    curve(ctx, path);
    ctx.strokeStyle = shade(this.color, -0.62);
    ctx.lineWidth = cell * 0.8;
    ctx.stroke();
    curve(ctx, path);
    ctx.strokeStyle = shade(this.color, -0.35);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 9]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Career route between the spots
    for (let i = 1; i < pts.length; i++) {
      ctx.beginPath();
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = this.spots[i].open ? 'rgba(255,58,69,0.95)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash(this.spots[i].open ? [] : [3, 8]);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Glow under every spot + soft vignette
    this.spots.forEach((s, i) => {
      const g = ctx.createRadialGradient(pts[i][0], pts[i][1], 0, pts[i][0], pts[i][1], cell * 1.5);
      g.addColorStop(0, s.open ? shade(this.color, 0.1).replace('rgb', 'rgba').replace(')', ',0.5)') : 'rgba(255,255,255,0.14)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(pts[i][0] - cell * 1.5, pts[i][1] - cell * 1.5, cell * 3, cell * 3);
    });
    const v = ctx.createRadialGradient(w / 2, hgt / 2, Math.min(w, hgt) * 0.3, w / 2, hgt / 2, span * 0.62);
    v.addColorStop(0, 'rgba(10,11,13,0)');
    v.addColorStop(1, 'rgba(10,11,13,0.88)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, hgt);
  }
}
