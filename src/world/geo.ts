/**
 * GB — tiny immediate-mode geometry builder used by the whole world module.
 *
 * Everything it emits has position / normal / uv / color, so any two pieces can be merged by the
 * StaticBatcher (src/world/batch.ts). UVs are METRIC ("world-scale"): one UV unit = one metre along
 * the face, so tiling textures never stretch on big boxes — the texture's `repeat` decides how many
 * metres a tile covers. Vertex colours are linear and multiply the albedo (tints, baked AO, wet bands).
 *
 * Winding is CCW = front. Face letters for box(): x/X = −X/+X face, y/Y = bottom/top, z/Z = −Z/+Z.
 */
import { BufferAttribute, BufferGeometry, Color, Matrix3, Matrix4, ShapeUtils, Vector2, Vector3 } from 'three';

const _col = new Color();
const _v = new Vector3();
const _n = new Vector3();
const _m = new Matrix4();
const _m2 = new Matrix4();

export type P3 = readonly [number, number, number];

export interface TubeOpts {
  /** 'flat' disc, 'round' dome or no caps. */
  caps?: 'flat' | 'round' | 'none';
  /** Radius of the fillet inserted at interior corners (0 = sharp mitre). */
  fillet?: number;
  /** Metres of texture V per metre of tube (default 1). */
  vScale?: number;
  /** U along the path, V around (for textures drawn along U, e.g. rope). */
  swapUV?: boolean;
  /** Per-point radius multiplier. */
  radiusAt?: (i: number, n: number) => number;
}

export class GB {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly idx: number[] = [];
  private count = 0;
  private readonly m = new Matrix4();
  private readonly nm = new Matrix3();
  private readonly stack: Matrix4[] = [];
  private ident = true;
  private cr = 1;
  private cg = 1;
  private cb = 1;
  /** Extra UV offset (decorrelates identical pieces). */
  uOff = 0;
  vOff = 0;
  /** Swap U and V of auto-mapped faces (plank direction). */
  uvSwap = false;

  get vertexCount(): number {
    return this.count;
  }
  get triangleCount(): number {
    return this.idx.length / 3;
  }

  // ── colour ──
  /** sRGB hex tint, optionally brightened / darkened by `mul`. */
  color(hex: number, mul = 1): this {
    _col.setHex(hex);
    this.cr = _col.r * mul;
    this.cg = _col.g * mul;
    this.cb = _col.b * mul;
    return this;
  }
  /** Linear rgb (values > 1 allowed → HDR for neon). */
  rgb(r: number, g: number, b: number): this {
    this.cr = r;
    this.cg = g;
    this.cb = b;
    return this;
  }
  white(): this {
    return this.rgb(1, 1, 1);
  }
  getRGB(): [number, number, number] {
    return [this.cr, this.cg, this.cb];
  }

  // ── transform stack ──
  push(): this {
    this.stack.push(this.m.clone());
    return this;
  }
  pop(): this {
    const m = this.stack.pop();
    if (m) this.m.copy(m);
    this.sync();
    return this;
  }
  reset(): this {
    this.m.identity();
    this.stack.length = 0;
    this.ident = true;
    return this;
  }
  mul(m: Matrix4): this {
    this.m.multiply(m);
    return this.sync();
  }
  translate(x: number, y: number, z: number): this {
    this.m.multiply(_m.makeTranslation(x, y, z));
    return this.sync();
  }
  rotY(a: number): this {
    this.m.multiply(_m.makeRotationY(a));
    return this.sync();
  }
  rotX(a: number): this {
    this.m.multiply(_m.makeRotationX(a));
    return this.sync();
  }
  rotZ(a: number): this {
    this.m.multiply(_m.makeRotationZ(a));
    return this.sync();
  }
  scale(x: number, y = x, z = x): this {
    this.m.multiply(_m.makeScale(x, y, z));
    return this.sync();
  }
  private sync(): this {
    this.ident = false;
    this.nm.getNormalMatrix(this.m);
    return this;
  }

  // ── raw ──
  /** Vertex with explicit normal + uv (transformed by the current matrix). Returns its index. */
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    if (!this.ident) {
      _v.set(x, y, z).applyMatrix4(this.m);
      _n.set(nx, ny, nz).applyMatrix3(this.nm).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
    } else {
      this.pos.push(x, y, z);
      this.nor.push(nx, ny, nz);
    }
    this.uv.push(u + this.uOff, v + this.vOff);
    this.col.push(this.cr, this.cg, this.cb);
    return this.count++;
  }

  /** Vertex whose UV is derived from its (transformed) position and face normal — metric mapping. */
  private va(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    let px = x;
    let py = y;
    let pz = z;
    let ax = nx;
    let ay = ny;
    let az = nz;
    if (!this.ident) {
      _v.set(x, y, z).applyMatrix4(this.m);
      _n.set(nx, ny, nz).applyMatrix3(this.nm).normalize();
      px = _v.x;
      py = _v.y;
      pz = _v.z;
      ax = _n.x;
      ay = _n.y;
      az = _n.z;
    }
    let u: number;
    let v: number;
    const len = Math.hypot(ax, az);
    if (len < 0.04) {
      u = px;
      v = pz;
    } else {
      const tx = az / len;
      const tz = -ax / len;
      u = px * tx + pz * tz;
      // b = n × t
      v = px * (ay * tz) + py * (az * tx - ax * tz) + pz * (-ay * tx);
    }
    this.pos.push(px, py, pz);
    this.nor.push(ax, ay, az);
    if (this.uvSwap) this.uv.push(v + this.uOff, u + this.vOff);
    else this.uv.push(u + this.uOff, v + this.vOff);
    this.col.push(this.cr, this.cg, this.cb);
    return this.count++;
  }

  tri3(a: number, b: number, c: number): this {
    this.idx.push(a, b, c);
    return this;
  }
  quad4(a: number, b: number, c: number, d: number): this {
    this.idx.push(a, b, c, a, c, d);
    return this;
  }
  /** Override the colour of an already emitted vertex (linear multiplier of the current tint). */
  shade(i: number, mul: number): void {
    this.col[i * 3] *= mul;
    this.col[i * 3 + 1] *= mul;
    this.col[i * 3 + 2] *= mul;
  }

  // ── flat primitives (auto metric UV) ──
  /** Flat quad a→b→c→d (CCW seen from the front). */
  quad(a: P3, b: P3, c: P3, d: P3): this {
    const nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
    const ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    const nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1;
    const i = this.va(a[0], a[1], a[2], nx / l, ny / l, nz / l);
    this.va(b[0], b[1], b[2], nx / l, ny / l, nz / l);
    this.va(c[0], c[1], c[2], nx / l, ny / l, nz / l);
    this.va(d[0], d[1], d[2], nx / l, ny / l, nz / l);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return this;
  }
  /** Flat quad with explicit UV rectangle: a=(u0,v0) b=(u1,v0) c=(u1,v1) d=(u0,v1). For decals / atlases. */
  quadUV(a: P3, b: P3, c: P3, d: P3, u0: number, v0: number, u1: number, v1: number): this {
    const nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
    const ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    const nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1;
    const uo = this.uOff;
    const vo = this.vOff;
    this.uOff = this.vOff = 0;
    const i = this.v(a[0], a[1], a[2], nx / l, ny / l, nz / l, u0, v0);
    this.v(b[0], b[1], b[2], nx / l, ny / l, nz / l, u1, v0);
    this.v(c[0], c[1], c[2], nx / l, ny / l, nz / l, u1, v1);
    this.v(d[0], d[1], d[2], nx / l, ny / l, nz / l, u0, v1);
    this.uOff = uo;
    this.vOff = vo;
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return this;
  }
  tri(a: P3, b: P3, c: P3): this {
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1;
    const i = this.va(a[0], a[1], a[2], nx / l, ny / l, nz / l);
    this.va(b[0], b[1], b[2], nx / l, ny / l, nz / l);
    this.va(c[0], c[1], c[2], nx / l, ny / l, nz / l);
    this.idx.push(i, i + 1, i + 2);
    return this;
  }

  /** Axis-aligned box centred at (cx,cy,cz). `skip` lists faces to omit, e.g. 'y' = no bottom. */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, skip = ''): this {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const y0 = cy - h / 2;
    const y1 = cy + h / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    if (!skip.includes('X')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    if (!skip.includes('x')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (!skip.includes('Y')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    if (!skip.includes('y')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (!skip.includes('Z')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    if (!skip.includes('z')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    return this;
  }
  /** Box standing on y = y0. */
  boxB(cx: number, y0: number, cz: number, w: number, h: number, d: number, skip = ''): this {
    return this.box(cx, y0 + h / 2, cz, w, h, d, skip);
  }
  /** Box rotated about Y (radians) around its own centre. */
  boxR(cx: number, cy: number, cz: number, w: number, h: number, d: number, rotY: number, skip = ''): this {
    this.push().translate(cx, cy, cz).rotY(rotY).box(0, 0, 0, w, h, d, skip);
    return this.pop();
  }
  /** Box between two points (a beam): square/rect section w×h, running a → b. */
  beam(a: P3, b: P3, w: number, h = w, skip = ''): this {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return this;
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    this.push()
      .translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
      .rotY(yaw)
      .rotX(pitch)
      .box(0, 0, 0, w, h, len, skip);
    return this.pop();
  }

  /**
   * Box with its 4 top edges bevelled by `c` (sits on y0). Good highlight catcher for ledges, kerbs, blocks.
   */
  chamferBox(cx: number, y0: number, cz: number, w: number, h: number, d: number, c: number, skip = 'y'): this {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const y1 = y0 + h;
    const ys = y1 - c;
    const cc = Math.min(c, w / 2 - 1e-3, d / 2 - 1e-3);
    if (!skip.includes('X')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, ys, z0], [x1, ys, z1]);
    if (!skip.includes('x')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, ys, z1], [x0, ys, z0]);
    if (!skip.includes('Z')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, ys, z1], [x0, ys, z1]);
    if (!skip.includes('z')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, ys, z0], [x1, ys, z0]);
    if (!skip.includes('y')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    // top
    this.quad([x0 + cc, y1, z1 - cc], [x1 - cc, y1, z1 - cc], [x1 - cc, y1, z0 + cc], [x0 + cc, y1, z0 + cc]);
    // bevels
    this.quad([x1, ys, z1], [x1, ys, z0], [x1 - cc, y1, z0 + cc], [x1 - cc, y1, z1 - cc]);
    this.quad([x0, ys, z0], [x0, ys, z1], [x0 + cc, y1, z1 - cc], [x0 + cc, y1, z0 + cc]);
    this.quad([x0, ys, z1], [x1, ys, z1], [x1 - cc, y1, z1 - cc], [x0 + cc, y1, z1 - cc]);
    this.quad([x1, ys, z0], [x0, ys, z0], [x0 + cc, y1, z0 + cc], [x1 - cc, y1, z0 + cc]);
    return this;
  }

  // ── round primitives (explicit UV) ──
  /** Vertical (Y axis) cylinder / cone standing on y0. Smooth shaded. */
  cyl(cx: number, y0: number, cz: number, rBot: number, rTop: number, h: number, seg = 10, capTop = true, capBot = false): this {
    const slope = (rBot - rTop) / (h || 1);
    const nl = Math.hypot(1, slope);
    const circ = Math.PI * (rBot + rTop);
    const base = this.count;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const u = (i / seg) * circ;
      this.v(cx + s * rBot, y0, cz + c * rBot, s / nl, slope / nl, c / nl, u, 0);
      this.v(cx + s * rTop, y0 + h, cz + c * rTop, s / nl, slope / nl, c / nl, u, h);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
    if (capTop && rTop > 1e-4) this.disc(cx, y0 + h, cz, rTop, seg, 1);
    if (capBot && rBot > 1e-4) this.disc(cx, y0, cz, rBot, seg, -1);
    return this;
  }
  /** Horizontal disc (dir = +1 faces up, −1 faces down). */
  disc(cx: number, y: number, cz: number, r: number, seg = 10, dir = 1): this {
    const c0 = this.v(cx, y, cz, 0, dir, 0, cx, cz);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = cx + Math.sin(a) * r;
      const z = cz + Math.cos(a) * r;
      this.v(x, y, z, 0, dir, 0, x, z);
    }
    for (let i = 0; i < seg; i++) {
      if (dir > 0) this.idx.push(c0, c0 + 1 + i, c0 + 2 + i);
      else this.idx.push(c0, c0 + 2 + i, c0 + 1 + i);
    }
    return this;
  }
  /** Cylinder between two arbitrary points. */
  rod(a: P3, b: P3, r: number, seg = 8, caps = false, r2 = r): this {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return this;
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
    this.push().translate(a[0], a[1], a[2]).rotY(yaw).rotX(pitch).cyl(0, 0, 0, r, r2, len, seg, caps, caps);
    return this.pop();
  }
  /** Ellipsoid. `yFrom`/`yTo` in 0..1 allow domes (0 = bottom pole, 1 = top pole). */
  sphere(cx: number, cy: number, cz: number, rx: number, ry = rx, rz = rx, wSeg = 10, hSeg = 6, yFrom = 0, yTo = 1): this {
    const base = this.count;
    for (let j = 0; j <= hSeg; j++) {
      const t = yFrom + ((yTo - yFrom) * j) / hSeg;
      const phi = (t - 0.5) * Math.PI;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      for (let i = 0; i <= wSeg; i++) {
        const a = (i / wSeg) * Math.PI * 2;
        const sx = Math.sin(a) * cp;
        const sz = Math.cos(a) * cp;
        // ellipsoid normal ∝ (x/rx², y/ry², z/rz²)
        const nx = sx / rx;
        const ny = sp / ry;
        const nz = sz / rz;
        const nl = Math.hypot(nx, ny, nz) || 1;
        this.v(cx + sx * rx, cy + sp * ry, cz + sz * rz, nx / nl, ny / nl, nz / nl, (i / wSeg) * Math.PI * 2 * rx, t * Math.PI * ry);
      }
    }
    const row = wSeg + 1;
    for (let j = 0; j < hSeg; j++) {
      for (let i = 0; i < wSeg; i++) {
        const a = base + j * row + i;
        this.idx.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
      }
    }
    return this;
  }
  /** Surface of revolution about Y at (cx, cz). profile = [radius, y] pairs from bottom to top. */
  lathe(cx: number, cz: number, profile: readonly (readonly [number, number])[], seg = 10): this {
    const base = this.count;
    const n = profile.length;
    let vAcc = 0;
    for (let j = 0; j < n; j++) {
      const p = profile[j];
      const pa = profile[Math.max(0, j - 1)];
      const pb = profile[Math.min(n - 1, j + 1)];
      if (j > 0) vAcc += Math.hypot(p[0] - pa[0], p[1] - pa[1]);
      // outward normal of the profile tangent (dr, dy) → (dy, −dr)
      let nr = pb[1] - pa[1];
      let ny = -(pb[0] - pa[0]);
      const nl = Math.hypot(nr, ny) || 1;
      nr /= nl;
      ny /= nl;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const s = Math.sin(a);
        const c = Math.cos(a);
        this.v(cx + s * p[0], p[1], cz + c * p[0], s * nr, ny, c * nr, (i / seg) * Math.PI * 2 * Math.max(p[0], 0.05), vAcc);
      }
    }
    const row = seg + 1;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < seg; i++) {
        const a = base + j * row + i;
        this.idx.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
      }
    }
    return this;
  }

  /**
   * Tube along a polyline (parallel-transport frames, mitred or filleted corners).
   * Texture: U around the circumference (metres), V along the path (metres × vScale).
   */
  tube(points: readonly P3[], radius: number, seg = 8, opts: TubeOpts = {}): this {
    const pts = opts.fillet ? filletPath(points, opts.fillet) : points;
    const n = pts.length;
    if (n < 2) return this;
    const base = this.count;
    const circ = Math.PI * 2 * radius;
    const vScale = opts.vScale ?? 1;
    const tan = new Vector3();
    const prevTan = new Vector3();
    const nrm = new Vector3();
    const bin = new Vector3();
    const tmp = new Vector3();
    let along = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      // tangent = bisector of the adjacent segment directions
      const inD = tmp.set(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
      const inL = inD.length();
      if (inL > 1e-6) inD.multiplyScalar(1 / inL);
      tan.set(b[0] - p[0], b[1] - p[1], b[2] - p[2]);
      const outL = tan.length();
      if (outL > 1e-6) tan.multiplyScalar(1 / outL);
      if (i > 0 && i < n - 1) tan.add(inD).normalize();
      else if (i === n - 1) tan.copy(inD);
      if (i === 0) {
        nrm.set(0, 1, 0);
        if (Math.abs(tan.y) > 0.95) nrm.set(1, 0, 0);
        bin.crossVectors(tan, nrm).normalize();
        nrm.crossVectors(bin, tan).normalize();
      } else {
        // parallel transport
        tmp.crossVectors(prevTan, tan);
        const s = tmp.length();
        if (s > 1e-6) {
          tmp.multiplyScalar(1 / s);
          const ang = Math.asin(Math.min(1, s));
          nrm.applyAxisAngle(tmp, ang);
        }
        bin.crossVectors(tan, nrm).normalize();
        nrm.crossVectors(bin, tan).normalize();
        along += inL;
      }
      prevTan.copy(tan);
      const r = radius * (opts.radiusAt ? opts.radiusAt(i, n) : 1);
      for (let k = 0; k <= seg; k++) {
        const ang = (k / seg) * Math.PI * 2;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        const nx = nrm.x * cs + bin.x * sn;
        const ny = nrm.y * cs + bin.y * sn;
        const nz = nrm.z * cs + bin.z * sn;
        if (opts.swapUV) this.v(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r, nx, ny, nz, along * vScale, (k / seg) * circ);
        else this.v(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r, nx, ny, nz, (k / seg) * circ, along * vScale);
      }
    }
    const row = seg + 1;
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const a = base + i * row + k;
        this.idx.push(a, a + row + 1, a + row, a, a + 1, a + row + 1);
      }
    }
    const caps = opts.caps ?? 'flat';
    if (caps !== 'none') {
      this.tubeCap(pts[0], pts[1], radius * (opts.radiusAt ? opts.radiusAt(0, n) : 1), seg, caps === 'round');
      this.tubeCap(pts[n - 1], pts[n - 2], radius * (opts.radiusAt ? opts.radiusAt(n - 1, n) : 1), seg, caps === 'round');
    }
    return this;
  }
  /** Cap at `p` facing away from `from`. */
  private tubeCap(p: P3, from: P3, r: number, seg: number, round: boolean): void {
    const dx = p[0] - from[0];
    const dy = p[1] - from[1];
    const dz = p[2] - from[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
    this.push().translate(p[0], p[1], p[2]).rotY(yaw).rotX(pitch);
    if (round) this.sphere(0, 0, 0, r, r, r, seg, 3, 0.5, 1);
    else this.disc(0, 0, 0, r, seg, 1);
    this.pop();
  }

  /** Flat polygon in the plane z = const of the current transform (XY outline, CCW = faces +Z). */
  poly(outline: readonly (readonly [number, number])[], z = 0, flip = false, holes: readonly (readonly (readonly [number, number])[])[] = []): this {
    const contour = outline.map((p) => new Vector2(p[0], p[1]));
    const hs = holes.map((h) => h.map((p) => new Vector2(p[0], p[1])));
    const faces = ShapeUtils.triangulateShape(contour, hs);
    const all = [...outline, ...holes.flat()];
    const base = this.count;
    const nz = flip ? -1 : 1;
    for (const p of all) this.va(p[0], p[1], z, 0, 0, nz);
    for (const f of faces) {
      const a = all[f[0]];
      const b = all[f[1]];
      const c = all[f[2]];
      // earcut's winding is not guaranteed → orient every triangle explicitly
      const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]) > 0;
      if (ccw !== flip) this.idx.push(base + f[0], base + f[1], base + f[2]);
      else this.idx.push(base + f[0], base + f[2], base + f[1]);
    }
    return this;
  }
  /** Extrude an XY outline (CCW) from z0 to z1: side walls + optional end faces. */
  prism(src: readonly (readonly [number, number])[], z0: number, z1: number, front = true, back = true, closed = true, inward = false): this {
    let area = 0;
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    // CCW outline → walls face outwards; `inward` flips them (walls of a hole)
    const outline = (area < 0) !== inward && closed ? src.slice().reverse() : src;
    const n = outline.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % n];
      this.quad([a[0], a[1], z1], [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1]);
    }
    if (front) this.poly(outline, z1, false);
    if (back) this.poly(outline, z0, true);
    return this;
  }

  /** Append an existing geometry (position/normal/uv, optional index) with a transform and the current tint. */
  merge(geo: BufferGeometry, matrix?: Matrix4): this {
    const p = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    const base = this.count;
    this.push();
    if (matrix) this.mul(matrix);
    for (let i = 0; i < p.count; i++) {
      this.v(p.getX(i), p.getY(i), p.getZ(i), nrm ? nrm.getX(i) : 0, nrm ? nrm.getY(i) : 1, nrm ? nrm.getZ(i) : 0, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    this.pop();
    const index = geo.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }
  /** Append another builder's content, transformed by this builder's current matrix. */
  append(o: GB): this {
    const base = this.count;
    const uo = this.uOff;
    const vo = this.vOff;
    this.uOff = this.vOff = 0;
    const [r, g, b] = [this.cr, this.cg, this.cb];
    for (let i = 0; i < o.count; i++) {
      this.cr = o.col[i * 3];
      this.cg = o.col[i * 3 + 1];
      this.cb = o.col[i * 3 + 2];
      this.v(o.pos[i * 3], o.pos[i * 3 + 1], o.pos[i * 3 + 2], o.nor[i * 3], o.nor[i * 3 + 1], o.nor[i * 3 + 2], o.uv[i * 2], o.uv[i * 2 + 1]);
    }
    this.cr = r;
    this.cg = g;
    this.cb = b;
    this.uOff = uo;
    this.vOff = vo;
    for (let i = 0; i < o.idx.length; i++) this.idx.push(base + o.idx[i]);
    return this;
  }

  /** Multiply the colour of every vertex emitted since `fromVertex` by a function of its position. */
  shadeBy(fromVertex: number, fn: (x: number, y: number, z: number) => number): this {
    for (let i = fromVertex; i < this.count; i++) {
      const k = fn(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.col[i * 3] *= k;
      this.col[i * 3 + 1] *= k;
      this.col[i * 3 + 2] *= k;
    }
    return this;
  }
  /** Blend the colour of vertices since `fromVertex` towards a linear rgb by a weight function. */
  tintBy(fromVertex: number, hex: number, fn: (x: number, y: number, z: number) => number): this {
    _col.setHex(hex);
    for (let i = fromVertex; i < this.count; i++) {
      const k = Math.max(0, Math.min(1, fn(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2])));
      this.col[i * 3] += (_col.r - this.col[i * 3]) * k;
      this.col[i * 3 + 1] += (_col.g - this.col[i * 3 + 1]) * k;
      this.col[i * 3 + 2] += (_col.b - this.col[i * 3 + 2]) * k;
    }
    return this;
  }

  /** Point the normals of vertices since `fromVertex` away from a centre (soft canopy shading). */
  normalsFrom(fromVertex: number, cx: number, cy: number, cz: number, upBias = 0): this {
    for (let i = fromVertex; i < this.count; i++) {
      const x = this.pos[i * 3] - cx;
      const y = this.pos[i * 3 + 1] - cy + upBias;
      const z = this.pos[i * 3 + 2] - cz;
      const l = Math.hypot(x, y, z) || 1;
      this.nor[i * 3] = x / l;
      this.nor[i * 3 + 1] = y / l;
      this.nor[i * 3 + 2] = z / l;
    }
    return this;
  }
  /** Rewrite the UVs of vertices since `fromVertex`. */
  remapUV(fromVertex: number, fn: (u: number, v: number, out: [number, number]) => void): this {
    const o: [number, number] = [0, 0];
    for (let i = fromVertex; i < this.count; i++) {
      fn(this.uv[i * 2], this.uv[i * 2 + 1], o);
      this.uv[i * 2] = o[0];
      this.uv[i * 2 + 1] = o[1];
    }
    return this;
  }
  /** Move vertices since `fromVertex` (positions are already in builder space). */
  displace(fromVertex: number, fn: (x: number, y: number, z: number, out: [number, number, number]) => void): this {
    const o: [number, number, number] = [0, 0, 0];
    for (let i = fromVertex; i < this.count; i++) {
      fn(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], o);
      this.pos[i * 3] = o[0];
      this.pos[i * 3 + 1] = o[1];
      this.pos[i * 3 + 2] = o[2];
    }
    return this;
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setIndex(new BufferAttribute(this.count > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** Replace interior corners of a polyline by short 3-step fillets of the given radius. */
export function filletPath(points: readonly P3[], radius: number): P3[] {
  const n = points.length;
  if (n < 3 || radius <= 0) return points.slice();
  const out: P3[] = [points[0]];
  for (let i = 1; i < n - 1; i++) {
    const p = points[i];
    const a = points[i - 1];
    const b = points[i + 1];
    const la = Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1], b[2] - p[2]);
    const r = Math.min(radius, la * 0.4, lb * 0.4);
    const ta = r / la;
    const tb = r / lb;
    const s: P3 = [p[0] + (a[0] - p[0]) * ta, p[1] + (a[1] - p[1]) * ta, p[2] + (a[2] - p[2]) * ta];
    const e: P3 = [p[0] + (b[0] - p[0]) * tb, p[1] + (b[1] - p[1]) * tb, p[2] + (b[2] - p[2]) * tb];
    for (let k = 0; k <= 3; k++) {
      const t = k / 3;
      const w0 = (1 - t) * (1 - t);
      const w1 = 2 * t * (1 - t);
      const w2 = t * t;
      out.push([s[0] * w0 + p[0] * w1 + e[0] * w2, s[1] * w0 + p[1] * w1 + e[1] * w2, s[2] * w0 + p[2] * w1 + e[2] * w2]);
    }
  }
  out.push(points[n - 1]);
  return out;
}

/** Give any geometry a per-vertex colour (needed by the shared vertex-coloured materials). */
export function tintGeometry(geo: BufferGeometry, hex = 0xffffff, mul = 1): BufferGeometry {
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  _col.setHex(hex);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _col.r * mul;
    arr[i * 3 + 1] = _col.g * mul;
    arr[i * 3 + 2] = _col.b * mul;
  }
  geo.setAttribute('color', new BufferAttribute(arr, 3));
  return geo;
}

/** Make sure a geometry can be drawn with a vertex-coloured material (adds white if missing). */
export function ensureColor(geo: BufferGeometry): BufferGeometry {
  if (!geo.getAttribute('color')) tintGeometry(geo);
  return geo;
}

/** TRS matrix helper (rotation about Y in radians). */
export function trs(x: number, y: number, z: number, rotY = 0, sx = 1, sy = sx, sz = sx, out = new Matrix4()): Matrix4 {
  out.makeRotationY(rotY);
  _m2.makeScale(sx, sy, sz);
  out.multiply(_m2);
  out.setPosition(x, y, z);
  return out;
}

/** sRGB hex → linear rgb triple. */
export function linearRGB(hex: number): [number, number, number] {
  _col.setHex(hex);
  return [_col.r, _col.g, _col.b];
}

/** Mix two sRGB hex colours (in sRGB space) → hex. */
export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
