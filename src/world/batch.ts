/**
 * Draw-call budget tools.
 *  - StaticBatcher: merges every static piece into ONE mesh per material (and per z-chunk when the
 *    material carries a lot of triangles, so frustum culling can drop what is behind the camera).
 *  - InstanceBatcher: one InstancedMesh per key, optional per-instance colour.
 * All merged geometry has position / normal / uv / color (white where the source had none) because
 * the shared materials are vertex-coloured.
 */
import { BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix3, Matrix4, Mesh, Object3D, Vector3 } from 'three';
import type { Material } from 'three';
import { ensureColor } from './geo';

export interface BatchFlags {
  /** Casts shadows. Default: material.userData.cast ?? true. */
  cast?: boolean;
  /** Receives shadows. Default: material.userData.receive ?? true. */
  receive?: boolean;
  /** Never split into z-chunks. */
  noChunk?: boolean;
}

interface Item {
  geo: BufferGeometry;
  matrix: Matrix4 | null;
  chunk: number;
}

interface Bucket {
  material: Material;
  cast: boolean;
  receive: boolean;
  noChunk: boolean;
  items: Item[];
  tris: number;
}

const _v = new Vector3();
const _nm = new Matrix3();

function triCount(geo: BufferGeometry): number {
  const idx = geo.getIndex();
  return (idx ? idx.count : geo.getAttribute('position').count) / 3;
}

/** Split a (transformed) geometry into z-chunks triangle by triangle. Returns world-space, non-indexed pieces. */
function splitByZ(geo: BufferGeometry, matrix: Matrix4 | null, chunkSize: number): Map<number, BufferGeometry> {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const col = geo.getAttribute('color');
  const index = geo.getIndex();
  const n = index ? index.count : pos.count;
  if (matrix) _nm.getNormalMatrix(matrix);
  const acc = new Map<number, { p: number[]; n: number[]; u: number[]; c: number[] }>();
  const wp = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const wn = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let t = 0; t < n; t += 3) {
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      const i = index ? index.getX(t + k) : t + k;
      _v.fromBufferAttribute(pos, i);
      if (matrix) _v.applyMatrix4(matrix);
      wp[k * 3] = _v.x;
      wp[k * 3 + 1] = _v.y;
      wp[k * 3 + 2] = _v.z;
      cz += _v.z;
      if (nor) {
        _v.fromBufferAttribute(nor, i);
        if (matrix) _v.applyMatrix3(_nm).normalize();
      } else _v.set(0, 1, 0);
      wn[k * 3] = _v.x;
      wn[k * 3 + 1] = _v.y;
      wn[k * 3 + 2] = _v.z;
    }
    const chunk = Math.floor(cz / 3 / chunkSize);
    let a = acc.get(chunk);
    if (!a) {
      a = { p: [], n: [], u: [], c: [] };
      acc.set(chunk, a);
    }
    for (let k = 0; k < 3; k++) {
      const i = index ? index.getX(t + k) : t + k;
      a.p.push(wp[k * 3], wp[k * 3 + 1], wp[k * 3 + 2]);
      a.n.push(wn[k * 3], wn[k * 3 + 1], wn[k * 3 + 2]);
      a.u.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      if (col) a.c.push(col.getX(i), col.getY(i), col.getZ(i));
      else a.c.push(1, 1, 1);
    }
  }
  const out = new Map<number, BufferGeometry>();
  for (const [chunk, a] of acc) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(a.p), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(a.n), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(a.u), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(a.c), 3));
    out.set(chunk, g);
  }
  return out;
}

export interface BatchStats {
  meshes: number;
  triangles: number;
}

export class StaticBatcher {
  private readonly buckets = new Map<string, Bucket>();
  /** Materials with fewer triangles than this are never chunked (a chunk costs a draw call). */
  minChunkTris = 4000;

  constructor(readonly chunkSize = 40) {}

  add(geo: BufferGeometry, material: Material, matrix?: Matrix4 | null, flags: BatchFlags = {}): void {
    const pos = geo.getAttribute('position');
    if (!pos || pos.count === 0) return;
    const ud = material.userData as { cast?: boolean; receive?: boolean; noChunk?: boolean };
    const cast = flags.cast ?? ud.cast ?? true;
    const receive = flags.receive ?? ud.receive ?? true;
    const noChunk = flags.noChunk ?? ud.noChunk ?? false;
    const key = `${material.uuid}|${cast ? 1 : 0}${receive ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { material, cast, receive, noChunk, items: [], tris: 0 };
      this.buckets.set(key, b);
    }
    b.tris += triCount(geo);
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    let minZ = Infinity;
    let maxZ = -Infinity;
    if (bb) {
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
        if (matrix) _v.applyMatrix4(matrix);
        if (_v.z < minZ) minZ = _v.z;
        if (_v.z > maxZ) maxZ = _v.z;
      }
    }
    if (!noChunk && maxZ - minZ > this.chunkSize * 1.2) {
      for (const [chunk, g] of splitByZ(geo, matrix ?? null, this.chunkSize)) b.items.push({ geo: g, matrix: null, chunk });
    } else {
      b.items.push({ geo, matrix: matrix ? matrix.clone() : null, chunk: Math.floor((minZ + maxZ) / 2 / this.chunkSize) });
    }
  }

  /** Create the merged meshes under `parent`. The batcher is empty afterwards. */
  build(parent: Object3D): Mesh[] {
    const out: Mesh[] = [];
    for (const b of this.buckets.values()) {
      const chunked = !b.noChunk && b.tris >= this.minChunkTris;
      const groups = new Map<number, Item[]>();
      for (const it of b.items) {
        const k = chunked ? it.chunk : 0;
        let g = groups.get(k);
        if (!g) groups.set(k, (g = []));
        g.push(it);
      }
      for (const [chunk, items] of groups) {
        const geo = mergeItems(items);
        const mesh = new Mesh(geo, b.material);
        mesh.castShadow = b.cast;
        mesh.receiveShadow = b.receive;
        mesh.matrixAutoUpdate = false;
        mesh.name = `static:${b.material.name || 'mat'}${chunked ? '@' + chunk : ''}`;
        mesh.userData.cast = b.cast;
        mesh.userData.receive = b.receive;
        parent.add(mesh);
        out.push(mesh);
      }
    }
    this.buckets.clear();
    return out;
  }
}

function mergeItems(items: Item[]): BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const it of items) {
    const p = it.geo.getAttribute('position');
    const idx = it.geo.getIndex();
    vCount += p.count;
    iCount += idx ? idx.count : p.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const index = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0;
  let io = 0;
  for (const it of items) {
    const g = it.geo;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    const c = g.getAttribute('color');
    const m = it.matrix;
    if (m) _nm.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      if (m) _v.applyMatrix4(m);
      const o = (vo + i) * 3;
      pos[o] = _v.x;
      pos[o + 1] = _v.y;
      pos[o + 2] = _v.z;
      if (n) {
        _v.fromBufferAttribute(n, i);
        if (m) _v.applyMatrix3(_nm).normalize();
        nor[o] = _v.x;
        nor[o + 1] = _v.y;
        nor[o + 2] = _v.z;
      } else nor[o + 1] = 1;
      if (u) {
        uv[(vo + i) * 2] = u.getX(i);
        uv[(vo + i) * 2 + 1] = u.getY(i);
      }
      if (c) {
        col[o] = c.getX(i);
        col[o + 1] = c.getY(i);
        col[o + 2] = c.getZ(i);
      } else {
        col[o] = col[o + 1] = col[o + 2] = 1;
      }
    }
    const idx = g.getIndex();
    // a mirrored transform flips the winding → restore it
    const flip = m ? m.determinant() < 0 : false;
    const cnt = idx ? idx.count : p.count;
    for (let i = 0; i < cnt; i += 3) {
      const a = (idx ? idx.getX(i) : i) + vo;
      const b = (idx ? idx.getX(i + 1) : i + 1) + vo;
      const cc = (idx ? idx.getX(i + 2) : i + 2) + vo;
      index[io++] = a;
      index[io++] = flip ? cc : b;
      index[io++] = flip ? b : cc;
    }
    vo += p.count;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.setAttribute('color', new BufferAttribute(col, 3));
  out.setIndex(new BufferAttribute(index, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

interface InstBucket {
  geo: BufferGeometry;
  material: Material;
  matrices: number[];
  colors: number[];
  hasColor: boolean;
  cast: boolean;
  receive: boolean;
}

export class InstanceBatcher {
  private readonly buckets = new Map<string, InstBucket>();
  /** z-chunk size for heavy instance sets. */
  constructor(readonly chunkSize = 80) {}

  add(key: string, geo: BufferGeometry, material: Material, matrix: Matrix4, color?: Color, flags: BatchFlags = {}): void {
    let b = this.buckets.get(key);
    if (!b) {
      const ud = material.userData as { cast?: boolean; receive?: boolean };
      b = {
        geo,
        material,
        matrices: [],
        colors: [],
        hasColor: false,
        cast: flags.cast ?? ud.cast ?? true,
        receive: flags.receive ?? ud.receive ?? true,
      };
      this.buckets.set(key, b);
    }
    const e = matrix.elements;
    for (let i = 0; i < 16; i++) b.matrices.push(e[i]);
    if (color) {
      b.hasColor = true;
      b.colors.push(color.r, color.g, color.b);
    } else b.colors.push(1, 1, 1);
  }

  build(parent: Object3D): InstancedMesh[] {
    const out: InstancedMesh[] = [];
    const m = new Matrix4();
    const c = new Color();
    for (const [key, b] of this.buckets) {
      const total = b.matrices.length / 16;
      const tris = triCount(b.geo);
      // heavy sets are split along z so the part behind the camera is culled
      const chunked = total * tris > 24000 && total >= 12;
      const groups = new Map<number, number[]>();
      for (let i = 0; i < total; i++) {
        const k = chunked ? Math.floor(b.matrices[i * 16 + 14] / this.chunkSize) : 0;
        let g = groups.get(k);
        if (!g) groups.set(k, (g = []));
        g.push(i);
      }
      if ((b.material as Material & { vertexColors?: boolean }).vertexColors) ensureColor(b.geo);
      for (const [chunk, ids] of groups) {
        const mesh = new InstancedMesh(b.geo, b.material, ids.length);
        for (let j = 0; j < ids.length; j++) {
          const i = ids[j];
          m.fromArray(b.matrices, i * 16);
          mesh.setMatrixAt(j, m);
          if (b.hasColor) mesh.setColorAt(j, c.setRGB(b.colors[i * 3], b.colors[i * 3 + 1], b.colors[i * 3 + 2]));
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = b.cast;
        mesh.receiveShadow = b.receive;
        mesh.userData.cast = b.cast;
        mesh.userData.receive = b.receive;
        mesh.userData.fullCount = ids.length;
        mesh.name = `inst:${key}${chunked ? '@' + chunk : ''}`;
        mesh.matrixAutoUpdate = false;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        parent.add(mesh);
        out.push(mesh);
      }
    }
    this.buckets.clear();
    return out;
  }
}

/** Triangles of a list of meshes (instances counted). */
export function countTriangles(meshes: readonly Mesh[]): number {
  let t = 0;
  for (const m of meshes) {
    const n = triCount(m.geometry);
    t += m instanceof InstancedMesh ? n * m.count : n;
  }
  return t;
}
