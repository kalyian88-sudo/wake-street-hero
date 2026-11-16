/**
 * Tiny procedural mesh kit for the rider: everything (limbs, torso, head, hair, boots, handle…) is a
 * LOFT — a stack of super-elliptic rings along local +Y — written into one merged, optionally skinned
 * BufferGeometry. One geometry + one atlas material = one draw call per rig part.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Matrix3, Matrix4, Quaternion, Uint16BufferAttribute, Vector3 } from 'three';
import { quatFromYZ } from './ik';

/** One cross-section of a loft: centre (ox, y, oz), half extents rx / rz, super-ellipse exponent n (2 = ellipse, >2 boxier). */
export interface Ring {
  y: number;
  rx: number;
  rz: number;
  ox?: number;
  oz?: number;
  n?: number;
}

export interface LoftOpts {
  /** Segments around (default 10). */
  radial?: number;
  /** Close the start with a fan whose tip sits at this local y. */
  capStart?: number;
  /** Close the end with a fan whose tip sits at this local y. */
  capEnd?: number;
  /**
   * Wrap UVs into an atlas rect [u0, v0, u1, v1]: u runs around the loft starting at local −X and going
   * −X → +Z → +X → −Z (so text reads correctly from outside), v runs along the rings by `vOf` (default: ring index).
   */
  wrap?: readonly [number, number, number, number];
  /** v coordinate 0..1 for a ring (wrap mode). Default = normalised ring index. */
  vOf?: (ring: Ring, index: number, count: number) => number;
  /** Custom UV from the LOCAL position (overrides wrap / swatch). */
  uvFn?: (local: Vector3, out: [number, number]) => void;
  /** Per-vertex colour override from the LOCAL position. */
  colorFn?: (local: Vector3, ringIndex: number, out: Color) => void;
}

const _v = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();
const _c = new Color();
const _uv: [number, number] = [0, 0];
const _nm = new Matrix3();
const _q = new Quaternion();
const _one = new Vector3(1, 1, 1);
const _skin: [number, number, number] = [0, 0, 1];

function spow(c: number, e: number): number {
  return c < 0 ? -Math.pow(-c, e) : Math.pow(c, e);
}

export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uvs: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];

  /** Transform applied to everything added next (rotation + translation + uniform-ish scale). */
  readonly matrix = new Matrix4();
  private readonly tint = new Color(1, 1, 1);
  private uvConst: [number, number] = [0, 0];
  private boneIndex = 0;
  /** Optional two-bone weighting from the final (bind-space) position: writes [boneA, boneB, weightA]. */
  skinFn: ((p: Vector3, out: [number, number, number]) => void) | null = null;

  constructor(private readonly skinned: boolean) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  /** sRGB hex colour for the following primitives. */
  color(hex: number): this {
    this.tint.setHex(hex);
    return this;
  }

  bone(index: number): this {
    this.boneIndex = index;
    this.skinFn = null;
    return this;
  }

  /** Constant UV (atlas swatch) for the following primitives. */
  uv(u: number, v: number): this {
    this.uvConst = [u, v];
    return this;
  }

  identity(): this {
    this.matrix.identity();
    return this;
  }

  /** Local +Y runs a → b, local +Z faces `front` as far as possible. Origin at `a`. */
  segment(a: Vector3, b: Vector3, front: Vector3): this {
    _v.subVectors(b, a);
    quatFromYZ(_q, _v, front);
    this.matrix.compose(a, _q, _one);
    return this;
  }

  at(x: number, y: number, z: number): this {
    this.matrix.makeTranslation(x, y, z);
    return this;
  }

  private push(local: Vector3, normalLocal: Vector3, u: number, v: number, c: Color): number {
    const i = this.pos.length / 3;
    _a.copy(local).applyMatrix4(this.matrix);
    _b.copy(normalLocal).applyMatrix3(_nm).normalize();
    this.pos.push(_a.x, _a.y, _a.z);
    this.nor.push(_b.x, _b.y, _b.z);
    this.uvs.push(u, v);
    this.col.push(c.r, c.g, c.b);
    if (this.skinned) {
      if (this.skinFn) {
        this.skinFn(_a, _skin);
        this.si.push(_skin[0], _skin[1], 0, 0);
        this.sw.push(_skin[2], 1 - _skin[2], 0, 0);
      } else {
        this.si.push(this.boneIndex, 0, 0, 0);
        this.sw.push(1, 0, 0, 0);
      }
    }
    return i;
  }

  /** Stack of rings (increasing y) skinned into a closed / open tube. */
  loft(rings: readonly Ring[], opts: LoftOpts = {}): this {
    const radial = opts.radial ?? 10;
    const wrap = opts.wrap;
    const dup = !!wrap || !!opts.uvFn; // duplicate the seam column when UVs vary around
    const cols = dup ? radial + 1 : radial;
    const nR = rings.length;
    _nm.getNormalMatrix(this.matrix);

    // local grid
    const grid = new Float32Array(nR * radial * 3);
    for (let i = 0; i < nR; i++) {
      const r = rings[i];
      const e = 2 / (r.n ?? 2);
      for (let j = 0; j < radial; j++) {
        // start at −X and run towards +Z so wrapped text reads left→right from outside
        const phi = Math.PI - (j / radial) * Math.PI * 2;
        const o = (i * radial + j) * 3;
        grid[o] = (r.ox ?? 0) + r.rx * spow(Math.cos(phi), e);
        grid[o + 1] = r.y;
        grid[o + 2] = (r.oz ?? 0) + r.rz * spow(Math.sin(phi), e);
      }
    }
    const P = (i: number, j: number, out: Vector3): Vector3 => {
      const o = (i * radial + (((j % radial) + radial) % radial)) * 3;
      return out.set(grid[o], grid[o + 1], grid[o + 2]);
    };

    const base = this.vertexCount;
    for (let i = 0; i < nR; i++) {
      const r = rings[i];
      const v01 = opts.vOf ? opts.vOf(r, i, nR) : nR > 1 ? i / (nR - 1) : 0;
      for (let j = 0; j < cols; j++) {
        P(i, j, _v);
        // numeric normal from wrapped neighbours (identical on both seam columns)
        P(i, j + 1, _a).sub(P(i, j - 1, _b));
        const tu = _a;
        P(Math.min(i + 1, nR - 1), j, _b).sub(P(Math.max(i - 1, 0), j, _n));
        _n.crossVectors(tu, _b);
        if (_n.lengthSq() < 1e-12) {
          _n.set(_v.x - (r.ox ?? 0), 0, _v.z - (r.oz ?? 0));
          if (_n.lengthSq() < 1e-12) _n.set(0, i === 0 ? -1 : 1, 0);
        }
        _n.normalize();
        let u = this.uvConst[0];
        let vv = this.uvConst[1];
        if (opts.uvFn) {
          opts.uvFn(_v, _uv);
          u = _uv[0];
          vv = _uv[1];
        } else if (wrap) {
          u = wrap[0] + (wrap[2] - wrap[0]) * (j / radial);
          vv = wrap[1] + (wrap[3] - wrap[1]) * v01;
        }
        _c.copy(this.tint);
        if (opts.colorFn) opts.colorFn(_v, i, _c);
        this.push(_v, _n, u, vv, _c);
      }
    }
    for (let i = 0; i < nR - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const j1 = dup ? j + 1 : (j + 1) % radial;
        const a = base + i * cols + j;
        const b = base + i * cols + j1;
        const c = base + (i + 1) * cols + j;
        const d = base + (i + 1) * cols + j1;
        this.idx.push(a, b, c, b, d, c);
      }
    }
    const cap = (ringIndex: number, tipY: number, start: boolean): void => {
      const r = rings[ringIndex];
      _v.set(r.ox ?? 0, tipY, r.oz ?? 0);
      _n.set(0, start ? -1 : 1, 0);
      let u = this.uvConst[0];
      let vv = this.uvConst[1];
      if (opts.uvFn) {
        opts.uvFn(_v, _uv);
        u = _uv[0];
        vv = _uv[1];
      } else if (wrap) {
        u = (wrap[0] + wrap[2]) / 2;
        vv = start ? wrap[1] : wrap[3];
      }
      _c.copy(this.tint);
      if (opts.colorFn) opts.colorFn(_v, ringIndex, _c);
      const tip = this.push(_v, _n, u, vv, _c);
      for (let j = 0; j < radial; j++) {
        const j1 = dup ? j + 1 : (j + 1) % radial;
        const a = base + ringIndex * cols + j;
        const b = base + ringIndex * cols + j1;
        if (start) this.idx.push(tip, b, a);
        else this.idx.push(tip, a, b);
      }
    };
    if (opts.capStart !== undefined) cap(0, opts.capStart, true);
    if (opts.capEnd !== undefined) cap(nR - 1, opts.capEnd, false);
    return this;
  }

  /** Tapered capsule along local +Y from 0 to `len` with radii r0 → r1 (rounded ends), optional flattening. */
  capsule(len: number, r0: number, r1: number, opts: LoftOpts & { sx?: number; sz?: number; capSeg?: number; mid?: readonly [number, number][] } = {}): this {
    return this.loft(capsuleRings(len, r0, r1, opts.sx ?? 1, opts.sz ?? 1, opts.capSeg ?? 2, opts.mid), {
      ...opts,
      capStart: -r0,
      capEnd: len + r1,
    });
  }

  /** Ellipsoid centred on the local origin. */
  ellipsoid(rx: number, ry: number, rz: number, opts: LoftOpts & { rings?: number } = {}): this {
    const n = opts.rings ?? 6;
    const rings: Ring[] = [];
    for (let i = 1; i < n; i++) {
      const th = -Math.PI / 2 + (i / n) * Math.PI;
      rings.push({ y: ry * Math.sin(th), rx: rx * Math.cos(th), rz: rz * Math.cos(th) });
    }
    return this.loft(rings, { ...opts, capStart: -ry, capEnd: ry });
  }

  /** Rounded box centred on the local origin (super-elliptic section, rounded along Y). */
  roundBox(hx: number, hy: number, hz: number, opts: LoftOpts & { round?: number; n?: number } = {}): this {
    const rr = Math.min(opts.round ?? Math.min(hx, hy, hz) * 0.5, hy);
    const n = opts.n ?? 4;
    const k = 0.7071;
    const inset = rr * (1 - k);
    const rings: Ring[] = [
      { y: -hy + inset * 0.6, rx: hx - inset, rz: hz - inset, n },
      { y: -hy + rr, rx: hx, rz: hz, n },
      { y: hy - rr, rx: hx, rz: hz, n },
      { y: hy - inset * 0.6, rx: hx - inset, rz: hz - inset, n },
    ];
    return this.loft(rings, { ...opts, capStart: -hy, capEnd: hy });
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    if (this.skinned) {
      g.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
      g.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    }
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Rings of a tapered capsule (without the two pole tips). `mid` = extra [t 0..1, radius] control points along the body. */
export function capsuleRings(
  len: number,
  r0: number,
  r1: number,
  sx = 1,
  sz = 1,
  capSeg = 2,
  mid?: readonly [number, number][],
): Ring[] {
  const rings: Ring[] = [];
  for (let i = 1; i <= capSeg; i++) {
    const th = (1 - i / capSeg) * (Math.PI / 2);
    rings.push({ y: -r0 * Math.sin(th), rx: r0 * Math.cos(th) * sx, rz: r0 * Math.cos(th) * sz });
  }
  if (mid) for (const [t, r] of mid) rings.push({ y: len * t, rx: r * sx, rz: r * sz });
  for (let i = 0; i < capSeg; i++) {
    const th = (i / capSeg) * (Math.PI / 2);
    rings.push({ y: len + r1 * Math.sin(th), rx: r1 * Math.cos(th) * sx, rz: r1 * Math.cos(th) * sz });
  }
  return rings;
}

/** Convenience: rings from rows of [y, rx, rz, oz?, n?, ox?]. */
export function ringsOf(rows: readonly (readonly number[])[]): Ring[] {
  return rows.map((r) => ({ y: r[0], rx: r[1], rz: r[2], oz: r[3] ?? 0, n: r[4] ?? 2, ox: r[5] ?? 0 }));
}
