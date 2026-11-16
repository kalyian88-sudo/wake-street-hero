/**
 * Fallback hub "globe": a dotted orthographic world drawn on a 2D canvas (used until the 3D menu
 * backdrop exists — see Hub.ts). Drag to rotate, focus(id) eases a city to the front.
 * All per-frame work is allocation-free (typed arrays + scalars).
 */
import { clamp, h, hex } from '../dom';
import { LAND, WATER } from './landmass';

export interface GlobePin {
  id: string;
  lat: number;
  lon: number;
  color: number;
  /** Route leg INTO this pin is open (drawn in brand red instead of grey). */
  open: boolean;
}

const DEG = Math.PI / 180;
const DOT_STEP = 2.6; // degrees between dots
const ARC_SEGMENTS = 36;

function inRing(ring: readonly (readonly [number, number])[], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

let landCache: Float32Array | null = null;

/** Unit vectors (x, y, z triples) of evenly spread dots that fall on land. */
function landPoints(): Float32Array {
  if (landCache) return landCache;
  const boxes = LAND.map((ring) => {
    let x0 = 999, x1 = -999, y0 = 999, y1 = -999;
    for (const [x, y] of ring) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return [x0, x1, y0, y1] as const;
  });
  const out: number[] = [];
  for (let lat = -84; lat <= 84; lat += DOT_STEP) {
    const count = Math.max(1, Math.round((360 * Math.cos(lat * DEG)) / DOT_STEP));
    for (let i = 0; i < count; i++) {
      const lon = -180 + ((i + (Math.round(lat / DOT_STEP) % 2 ? 0.5 : 0)) * 360) / count;
      let land = false;
      for (let r = 0; r < LAND.length && !land; r++) {
        const b = boxes[r];
        if (lon >= b[0] && lon <= b[1] && lat >= b[2] && lat <= b[3] && inRing(LAND[r], lon, lat)) land = true;
      }
      if (!land) continue;
      if (WATER.some((ring) => inRing(ring, lon, lat))) continue;
      const c = Math.cos(lat * DEG);
      out.push(c * Math.sin(lon * DEG), Math.sin(lat * DEG), c * Math.cos(lon * DEG));
    }
  }
  landCache = new Float32Array(out);
  return landCache;
}

export class DotGlobe {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly land = landPoints();
  /** Per land dot: index of the pin whose "home turf" it is, or 255. */
  private readonly owner: Uint8Array;
  private pins: GlobePin[] = [];
  private pinVec = new Float32Array(0);
  /** Projected pins: x, y (CSS px inside el), z (> 0 = facing us). */
  private pinScreen = new Float32Array(0);
  private pinColor: string[] = [];
  private halo: CanvasGradient | null = null;
  private body: CanvasGradient | null = null;
  private lon = 55;
  private lat = 28;
  private targetLon = 55;
  private targetLat = 28;
  private velLon = 0;
  private velLat = 0;
  private dragging = false;
  private settling = true;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private radius = 100;
  private cx = 0;
  private cy = 0;
  private lastX = 0;
  private lastY = 0;
  private moved = 0;
  private focusId: string | null = null;
  /** Called when the user taps the globe near a pin. */
  onPick: ((id: string) => void) | null = null;

  constructor() {
    this.canvas = h('canvas', { class: 'wn-globe__canvas' });
    this.ctx = this.canvas.getContext('2d');
    this.el = h('div', { class: 'wn-globe wn-panel' }, this.canvas);
    this.owner = new Uint8Array(this.land.length / 3).fill(255);
    this.el.addEventListener('pointerdown', this.onDown);
    this.el.addEventListener('pointermove', this.onMove);
    this.el.addEventListener('pointerup', this.onUp);
    this.el.addEventListener('pointercancel', this.onUp);
  }

  setPins(pins: GlobePin[]): void {
    this.pins = pins;
    this.pinVec = new Float32Array(pins.length * 3);
    this.pinScreen = new Float32Array(pins.length * 3);
    this.pinColor = pins.map((p) => hex(p.color));
    pins.forEach((p, i) => {
      const c = Math.cos(p.lat * DEG);
      this.pinVec[i * 3] = c * Math.sin(p.lon * DEG);
      this.pinVec[i * 3 + 1] = Math.sin(p.lat * DEG);
      this.pinVec[i * 3 + 2] = c * Math.cos(p.lon * DEG);
    });
    // Tint the land within ~9° of each pin with the city colour.
    const near = Math.cos(9 * DEG);
    for (let d = 0; d < this.owner.length; d++) {
      let best = 255;
      let bestDot = near;
      for (let i = 0; i < pins.length; i++) {
        const dot = this.land[d * 3] * this.pinVec[i * 3] + this.land[d * 3 + 1] * this.pinVec[i * 3 + 1] + this.land[d * 3 + 2] * this.pinVec[i * 3 + 2];
        if (dot > bestDot) {
          bestDot = dot;
          best = i;
        }
      }
      this.owner[d] = best;
    }
    if (pins.length && this.focusId === null) this.focus(pins[0].id, true);
  }

  /** Ease the view so the pin sits a little off-centre, keeping the neighbours in sight. */
  focus(id: string, snap = false): void {
    const pin = this.pins.find((p) => p.id === id);
    if (!pin) return;
    this.focusId = id;
    let avgLon = 0;
    for (const p of this.pins) avgLon += p.lon;
    avgLon /= this.pins.length || 1;
    this.targetLon = pin.lon * 0.62 + avgLon * 0.38;
    this.targetLat = clamp(pin.lat * 0.55 + 14, -40, 60);
    this.settling = true;
    this.velLon = this.velLat = 0;
    if (snap) {
      this.lon = this.targetLon;
      this.lat = this.targetLat;
    }
  }

  resize(): void {
    const w = this.el.clientWidth;
    const hgt = this.el.clientHeight;
    if (!w || !hgt) return;
    this.w = w;
    this.h = hgt;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(hgt * this.dpr);
    this.radius = Math.min(Math.min(w, hgt) * 0.47, 330);
    this.cx = w / 2;
    this.cy = hgt / 2;
    const ctx = this.ctx;
    if (!ctx) return;
    const R = this.radius;
    this.halo = ctx.createRadialGradient(this.cx, this.cy, R * 0.9, this.cx, this.cy, R * 1.22);
    this.halo.addColorStop(0, 'rgba(227,6,19,0.20)');
    this.halo.addColorStop(0.45, 'rgba(227,6,19,0.07)');
    this.halo.addColorStop(1, 'rgba(227,6,19,0)');
    this.body = ctx.createRadialGradient(this.cx - R * 0.35, this.cy - R * 0.42, R * 0.05, this.cx, this.cy, R);
    this.body.addColorStop(0, '#2c2f37');
    this.body.addColorStop(0.55, '#17191d');
    this.body.addColorStop(1, '#0b0c0e');
  }

  /** Position of a pin in client (viewport) coordinates. Returns false when the pin is unknown. */
  project(id: string, out: { x: number; y: number; visible: boolean }): boolean {
    const i = this.pins.findIndex((p) => p.id === id);
    if (i < 0) return false;
    const rect = this.el.getBoundingClientRect();
    out.x = rect.left + this.pinScreen[i * 3];
    out.y = rect.top + this.pinScreen[i * 3 + 1];
    out.visible = this.pinScreen[i * 3 + 2] > 0.08;
    return true;
  }

  private readonly onDown = (ev: PointerEvent): void => {
    this.dragging = true;
    this.settling = false;
    this.moved = 0;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    this.velLon = this.velLat = 0;
    try {
      this.el.setPointerCapture(ev.pointerId);
    } catch {
      /* synthetic pointer */
    }
  };

  private readonly onMove = (ev: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = ev.clientX - this.lastX;
    const dy = ev.clientY - this.lastY;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    this.moved += Math.abs(dx) + Math.abs(dy);
    const k = 1 / (this.radius * DEG);
    this.velLon = -dx * k;
    this.velLat = dy * k;
    this.lon += this.velLon;
    this.lat = clamp(this.lat + this.velLat, -55, 72);
  };

  private readonly onUp = (ev: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.moved < 8 && this.onPick) {
      // A tap: pick the nearest visible pin within a thumb's reach.
      const rect = this.el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      let best = -1;
      let bestD = 44 * 44;
      for (let i = 0; i < this.pins.length; i++) {
        if (this.pinScreen[i * 3 + 2] <= 0.08) continue;
        const d = (this.pinScreen[i * 3] - x) ** 2 + (this.pinScreen[i * 3 + 1] - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) this.onPick(this.pins[best].id);
    }
  };

  /** Advance + draw. `time` in seconds. */
  frame(dt: number, time: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.w) return;

    if (this.settling) {
      const k = 1 - Math.exp(-dt * 4.5);
      let dLon = this.targetLon - this.lon;
      dLon = ((((dLon + 180) % 360) + 360) % 360) - 180;
      this.lon += dLon * k;
      this.lat += (this.targetLat - this.lat) * k;
    } else if (!this.dragging) {
      const damp = Math.exp(-dt * 3);
      this.velLon *= damp;
      this.velLat *= damp;
      this.lon += this.velLon * dt * 60;
      this.lat = clamp(this.lat + this.velLat * dt * 60, -55, 72);
    }
    // A slow breathing sway keeps the idle globe alive.
    const lon0 = (this.lon + (this.dragging ? 0 : Math.sin(time * 0.35) * 2.2)) * DEG;
    const lat0 = (this.lat + (this.dragging ? 0 : Math.cos(time * 0.27) * 1.2)) * DEG;
    const sl = Math.sin(lon0);
    const cl = Math.cos(lon0);
    const sp = Math.sin(lat0);
    const cp = Math.cos(lat0);

    const R = this.radius;
    const cx = this.cx;
    const cy = this.cy;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    // Atmosphere + body
    if (this.halo) {
      ctx.fillStyle = this.halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = this.body ?? '#131418';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();

    // Land dots, bucketed by depth (3 alpha levels) + one bucket per pin colour
    const land = this.land;
    const size = Math.max(1.5, R * 0.0125);
    for (let pass = 0; pass < 3 + this.pins.length; pass++) {
      ctx.beginPath();
      for (let d = 0, n = land.length / 3; d < n; d++) {
        const own = this.owner[d];
        const x = land[d * 3];
        const y = land[d * 3 + 1];
        const z = land[d * 3 + 2];
        const z1 = z * cl + x * sl;
        const z2 = y * sp + z1 * cp;
        if (z2 <= 0.03) continue;
        const bucket = own !== 255 ? 3 + own : z2 > 0.66 ? 2 : z2 > 0.33 ? 1 : 0;
        if (bucket !== pass) continue;
        const x1 = x * cl - z * sl;
        const y2 = y * cp - z1 * sp;
        const s = size * (0.55 + 0.6 * z2);
        ctx.rect(cx + x1 * R - s / 2, cy - y2 * R - s / 2, s, s);
      }
      if (pass < 3) ctx.fillStyle = pass === 2 ? 'rgba(255,255,255,0.62)' : pass === 1 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)';
      else ctx.fillStyle = this.pinColor[pass - 3];
      ctx.fill();
    }

    // Pins → screen
    const pv = this.pinVec;
    const ps = this.pinScreen;
    for (let i = 0; i < this.pins.length; i++) {
      const x = pv[i * 3];
      const y = pv[i * 3 + 1];
      const z = pv[i * 3 + 2];
      const z1 = z * cl + x * sl;
      ps[i * 3] = cx + (x * cl - z * sl) * R;
      ps[i * 3 + 1] = cy - (y * cp - z1 * sp) * R;
      ps[i * 3 + 2] = y * sp + z1 * cp;
    }

    // Tour route: lifted great-circle arcs between consecutive pins
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 1; i < this.pins.length; i++) {
      const ax = pv[(i - 1) * 3], ay = pv[(i - 1) * 3 + 1], az = pv[(i - 1) * 3 + 2];
      const bx = pv[i * 3], by = pv[i * 3 + 1], bz = pv[i * 3 + 2];
      const omega = Math.acos(clamp(ax * bx + ay * by + az * bz, -1, 1));
      const so = Math.sin(omega) || 1;
      const open = this.pins[i].open;
      ctx.strokeStyle = open ? 'rgba(255,58,69,0.95)' : 'rgba(255,255,255,0.28)';
      ctx.setLineDash(open ? [] : [3, 7]);
      ctx.beginPath();
      let pen = false;
      const comet = (time * 0.22 + i * 0.37) % 1;
      let cometX = 0, cometY = 0, cometOn = false;
      for (let sgm = 0; sgm <= ARC_SEGMENTS; sgm++) {
        const tt = sgm / ARC_SEGMENTS;
        const ka = Math.sin((1 - tt) * omega) / so;
        const kb = Math.sin(tt * omega) / so;
        const lift = 1 + 0.16 * Math.sin(Math.PI * tt);
        const x = (ax * ka + bx * kb) * lift;
        const y = (ay * ka + by * kb) * lift;
        const z = (az * ka + bz * kb) * lift;
        const z1 = z * cl + x * sl;
        const z2 = y * sp + z1 * cp;
        const sx = cx + (x * cl - z * sl) * R;
        const sy = cy - (y * cp - z1 * sp) * R;
        if (z2 <= 0) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
        pen = true;
        if (open && Math.abs(tt - comet) < 0.5 / ARC_SEGMENTS) {
          cometX = sx;
          cometY = sy;
          cometOn = true;
        }
      }
      ctx.stroke();
      if (cometOn) {
        ctx.setLineDash([]);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cometX, cometY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.setLineDash([]);

    // Pulse rings under the DOM pins
    for (let i = 0; i < this.pins.length; i++) {
      if (ps[i * 3 + 2] <= 0.08) continue;
      const phase = (time * 0.7 + i * 0.33) % 1;
      const focused = this.pins[i].id === this.focusId;
      ctx.strokeStyle = this.pinColor[i];
      ctx.globalAlpha = (1 - phase) * (focused ? 0.9 : 0.5);
      ctx.lineWidth = focused ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(ps[i * 3], ps[i * 3 + 1], 8 + phase * (focused ? 26 : 16), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
