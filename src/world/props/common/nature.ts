/**
 * Vegetation and birds.
 *   common.palm      { height=7, lean=0.12 }                 coconut palm (instanced, 3 variants)
 *   common.tree      { height=7, crown=2.6, tint=0xRRGGBB }   broadleaf street tree (instanced, 3 variants)
 *   common.bush      { size=1 }                              low shrub
 *   common.potPlant  { kind='palm'|'bush'|'flower', count=1, spacing=1.2 }  potted plants in a row along local X
 *   common.planter   { length=3, width=0.7 }                 long planter box with greenery
 *   common.birds     { count=7, radius=14, height=16 }       circling flock (animated)
 */
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { seededRng } from '../../../data/geometry';
import type { PropContext, PropDef } from '../../../types';
import { GB } from '../../geo';
import type { P3 } from '../../geo';
import { registerProp } from '../registry';
import { Kit, num, pick, range, sharedGeo, str, tint } from './util';

const tri = (x: number): number => Math.abs((((x % 2) + 2) % 2) - 1);

/** Lumpy canopy blob mapped into the opaque half of the foliage atlas, darker underneath. */
export function leafBlob(g: GB, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seed: number, seg = 8): void {
  const v0 = g.vertexCount;
  g.sphere(cx, cy, cz, rx, ry, rz, seg, Math.max(4, seg - 3));
  g.displace(v0, (x, y, z, o) => {
    const k = 1 + 0.16 * Math.sin(x * 2.3 + seed) * Math.sin(y * 2.9 + seed * 1.7) * Math.sin(z * 2.1 + seed * 0.6) + 0.07 * Math.sin(x * 5.1 + z * 4.3 + seed);
    o[0] = cx + (x - cx) * k;
    o[1] = cy + (y - cy) * k;
    o[2] = cz + (z - cz) * k;
  });
  g.remapUV(v0, (u, v, o) => {
    o[0] = 0.03 + tri(u * 0.45 + seed) * 0.44;
    o[1] = 0.03 + tri(v * 0.45 + seed * 0.3) * 0.94;
  });
  g.shadeBy(v0, (_x, y) => 0.5 + 0.6 * Math.min(1, Math.max(0, (y - (cy - ry)) / (2 * ry))));
}

/** Alpha-tested leaf clump card (right half of the foliage atlas). */
export function leafCard(g: GB, x: number, y: number, z: number, size: number, yaw: number, tilt: number): void {
  g.push().translate(x, y, z).rotY(yaw).rotX(tilt);
  const h = size / 2;
  g.quadUV([-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0], 0.51, 0.01, 0.99, 0.99);
  g.pop();
}

/** Unit-height trunk centre line with an S-curve (instances scale it). */
function palmPath(variant: number): P3[] {
  const bend = (seededRng(900 + variant * 31)() - 0.5) * 0.22;
  const pts: P3[] = [];
  for (let i = 0; i <= 7; i++) {
    const k = i / 7;
    pts.push([Math.sin(k * 1.9) * bend + k * k * 0.1, k, Math.sin(k * 2.6 + variant) * 0.03]);
  }
  return pts;
}

/** Trunk in unit space; crown centred on the origin (placed on the trunk top per instance). */
function palmGeo(variant: number, detail: number): { trunk: BufferGeometry; crown: BufferGeometry } {
  const rnd = seededRng(977 + variant * 31);
  const t = new GB();
  const pts = palmPath(variant);
  t.white();
  t.tube(pts, 0.02, detail >= 0.75 ? 7 : 5, { caps: 'none', radiusAt: (i, n) => 1.45 - (i / (n - 1)) * 0.6 + (i === 0 ? 0.5 : 0), vScale: 7 });
  const topP: P3 = [0, 0, 0];
  const c = new GB();
  const n = detail >= 0.75 ? 11 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const elev = 0.15 + rnd() * 0.75;
    const L = 0.36 + rnd() * 0.1;
    const droop = 0.75 + rnd() * 0.5;
    const w = 0.06 + rnd() * 0.02;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const segs = 5;
    const base = c.vertexCount;
    const lum = 0.8 + rnd() * 0.35;
    c.rgb(lum, lum, lum);
    for (let s = 0; s <= segs; s++) {
      const k = s / segs;
      const r = L * k * Math.cos(elev * (1 - k * 0.4));
      const y = L * (Math.sin(elev) * k - droop * k * k * 0.75);
      const px = topP[0] + dx * r;
      const py = topP[1] + y;
      const pz = topP[2] + dz * r;
      // V-shaped cross section: leaflets hang down from the rachis
      const sag = w * 0.45;
      c.v(px - dz * w, py - sag, pz + dx * w, 0, 1, 0, k, 0);
      c.v(px, py, pz, 0, 1, 0, k, 0.5);
      c.v(px + dz * w, py - sag, pz - dx * w, 0, 1, 0, k, 1);
    }
    for (let s = 0; s < segs; s++) {
      const q = base + s * 3;
      c.quad4(q, q + 1, q + 4, q + 3);
      c.quad4(q + 1, q + 2, q + 5, q + 4);
    }
  }
  c.normalsFrom(0, topP[0], topP[1] - 0.25, topP[2], 0.2);
  return { trunk: t.build(), crown: c.build() };
}

function treeGeo(variant: number, detail: number): { trunk: BufferGeometry; crown: BufferGeometry } {
  const rnd = seededRng(400 + variant * 17);
  const t = new GB();
  t.white();
  // unit tree: height 1, crown radius ~0.38
  const lean = (rnd() - 0.5) * 0.08;
  t.tube(
    [
      [0, 0, 0],
      [lean * 0.4, 0.22, 0],
      [lean, 0.46, 0.01],
    ],
    0.018,
    6,
    { caps: 'none', radiusAt: (i) => 1.5 - i * 0.3, vScale: 6 },
  );
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rnd();
    t.tube(
      [
        [lean, 0.44, 0.01],
        [lean + Math.sin(a) * 0.12, 0.58, Math.cos(a) * 0.12],
        [lean + Math.sin(a) * 0.22, 0.7, Math.cos(a) * 0.22],
      ],
      0.01,
      5,
      { caps: 'none', radiusAt: (k) => 1.2 - k * 0.3, vScale: 6 },
    );
  }
  const c = new GB();
  c.white();
  const blobs = detail >= 0.75 ? 6 : 4;
  const cy = 0.72;
  leafBlob(c, lean, cy, 0, 0.3, 0.24, 0.3, variant * 3.1, detail >= 0.75 ? 9 : 7);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rnd() * 0.6;
    const r = 0.18 + rnd() * 0.1;
    const s = 0.17 + rnd() * 0.08;
    leafBlob(c, lean + Math.sin(a) * r, cy - 0.06 + rnd() * 0.16, Math.cos(a) * r, s, s * 0.8, s, i * 1.7 + variant, 7);
  }
  const v0 = c.vertexCount;
  const cards = detail >= 0.75 ? 16 : 8;
  for (let i = 0; i < cards; i++) {
    const a = rnd() * Math.PI * 2;
    const el = (rnd() - 0.35) * 1.6;
    const r = 0.36 + rnd() * 0.06;
    const lum = 0.75 + rnd() * 0.4;
    c.rgb(lum, lum, lum);
    leafCard(c, lean + Math.sin(a) * Math.cos(el) * r, cy + Math.sin(el) * r * 0.75, Math.cos(a) * Math.cos(el) * r, 0.2 + rnd() * 0.1, a + (rnd() - 0.5), (rnd() - 0.5) * 1.2);
  }
  c.normalsFrom(v0, lean, cy - 0.1, 0);
  return { trunk: t.build(), crown: c.build() };
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _y = new Vector3(0, 1, 0);

/** Compose prop matrix × local TRS for an instance. */
function inst(ctx: PropContext, x: number, y: number, z: number, yaw: number, sx: number, sy = sx, sz = sx): Matrix4 {
  _q.setFromAxisAngle(_y, yaw);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  return ctx.matrixAt().multiply(_m);
}
export { inst as instanceMatrix };

function palm(def: PropDef, ctx: PropContext): void {
  const h = num(ctx, def, 'height', 7) * range(ctx.rng, 0.88, 1.15);
  const variant = Math.floor(ctx.rng() * 3);
  const d = ctx.profile.detail;
  const trunk = sharedGeo(ctx, `palm:t${variant}`, () => palmGeo(variant, d).trunk);
  const crown = sharedGeo(ctx, `palm:c${variant}`, () => palmGeo(variant, d).crown);
  const yaw = ctx.rng() * Math.PI * 2;
  // trunk: stretch in height only a little less than in girth so tall palms stay slender
  const girth = h * 0.82 + 1.2;
  const mt = inst(ctx, 0, 0, 0, yaw, girth, h, girth);
  ctx.addInstance(`palm:t${variant}`, trunk, ctx.mat('palmBark'), mt, tint(0xffffff, range(ctx.rng, 0.85, 1.05)));
  // crown: uniform scale, sitting on the (leaning) trunk top
  const cs = 7.2 * range(ctx.rng, 0.9, 1.1);
  const top = palmPath(variant)[7];
  const tx = top[0] * girth;
  const tz = top[2] * girth;
  const mc = inst(ctx, tx * Math.cos(yaw) + tz * Math.sin(yaw), h - 0.05, -tx * Math.sin(yaw) + tz * Math.cos(yaw), yaw, cs);
  ctx.addInstance(`palm:c${variant}`, crown, ctx.mat('frond'), mc, tint(pick(ctx.rng, [0xcfe8a8, 0xbfe09a, 0xd8e8a0, 0xb4d890]), range(ctx.rng, 0.85, 1.05)));
}

function tree(def: PropDef, ctx: PropContext): void {
  const h = num(ctx, def, 'height', 7) * range(ctx.rng, 0.9, 1.12);
  const crownR = num(ctx, def, 'crown', h * 0.38);
  const variant = Math.floor(ctx.rng() * 3);
  const d = ctx.profile.detail;
  const trunk = sharedGeo(ctx, `tree:t${variant}`, () => treeGeo(variant, d).trunk);
  const crown = sharedGeo(ctx, `tree:c${variant}`, () => treeGeo(variant, d).crown);
  const yaw = ctx.rng() * Math.PI * 2;
  const w = crownR / 0.38;
  const m = inst(ctx, 0, 0, 0, yaw, w, h, w);
  ctx.addInstance(`tree:t${variant}`, trunk, ctx.mat('bark'), m);
  const base = num(ctx, def, 'tint', pick(ctx.rng, [0x9ccf7a, 0x8cc46e, 0xa8d67e, 0x86b866, 0xb4d67a]));
  ctx.addInstance(`tree:c${variant}`, crown, ctx.mat('foliage'), m.clone(), tint(base, range(ctx.rng, 0.82, 1.08)));
}

function bush(def: PropDef, ctx: PropContext): void {
  const s = num(ctx, def, 'size', 1) * range(ctx.rng, 0.85, 1.2);
  const geo = sharedGeo(ctx, 'bush', () => {
    const g = new GB();
    g.white();
    leafBlob(g, 0, 0.32, 0, 0.5, 0.36, 0.46, 2.2, 8);
    leafBlob(g, 0.34, 0.26, 0.1, 0.34, 0.28, 0.32, 5.1, 7);
    leafBlob(g, -0.3, 0.24, -0.14, 0.32, 0.26, 0.34, 8.4, 7);
    return g.build();
  });
  ctx.addInstance('bush', geo, ctx.mat('foliage'), inst(ctx, 0, 0, 0, ctx.rng() * 6.28, s), tint(pick(ctx.rng, [0x9ccf7a, 0x86b866, 0xa8d67e]), range(ctx.rng, 0.8, 1.05)));
}

function potGeo(): BufferGeometry {
  const g = new GB();
  g.color(0xb9673f);
  g.lathe(
    0,
    0,
    [
      [0.13, 0],
      [0.17, 0.02],
      [0.23, 0.36],
      [0.25, 0.38],
      [0.25, 0.43],
      [0.21, 0.43],
    ],
    10,
  );
  g.color(0x3a2c22);
  g.disc(0, 0.41, 0, 0.21, 10, 1);
  return g.build();
}

function potPlant(def: PropDef, ctx: PropContext): void {
  const count = Math.max(1, Math.round(num(ctx, def, 'count', 1)));
  const spacing = num(ctx, def, 'spacing', 1.2);
  const kindParam = str(def, 'kind', 'mix');
  const pot = sharedGeo(ctx, 'pot', potGeo);
  const palmTop = sharedGeo(ctx, 'pot:palm', () => {
    const c = new GB();
    c.white();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.283 + i * 0.4;
      const L = 0.62 + (i % 3) * 0.08;
      const elev = 0.5 + (i % 2) * 0.45;
      const base = c.vertexCount;
      for (let s = 0; s <= 3; s++) {
        const k = s / 3;
        const r = L * k * Math.cos(elev * (1 - k * 0.5));
        const y = 0.45 + L * (Math.sin(elev) * k - 0.55 * k * k);
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        const w = 0.14;
        c.v(dx * r - dz * w, y - 0.03, dz * r + dx * w, 0, 1, 0, k, 0);
        c.v(dx * r + dz * w, y - 0.03, dz * r - dx * w, 0, 1, 0, k, 1);
      }
      for (let s = 0; s < 3; s++) c.quad4(base + s * 2, base + s * 2 + 1, base + s * 2 + 3, base + s * 2 + 2);
    }
    c.normalsFrom(0, 0, 0.3, 0, 0.3);
    return c.build();
  });
  const bushTop = sharedGeo(ctx, 'pot:bush', () => {
    const c = new GB();
    c.white();
    leafBlob(c, 0, 0.72, 0, 0.3, 0.3, 0.3, 1.3, 7);
    leafBlob(c, 0.1, 0.56, 0.06, 0.24, 0.2, 0.24, 4.3, 6);
    return c.build();
  });
  for (let i = 0; i < count; i++) {
    const kind = kindParam === 'mix' ? pick(ctx.rng, ['palm', 'bush', 'palm', 'flower']) : kindParam;
    const s = range(ctx.rng, 0.85, 1.3);
    const x = (i - (count - 1) / 2) * spacing + (ctx.rng() - 0.5) * 0.15;
    const m = inst(ctx, x, 0, (ctx.rng() - 0.5) * 0.12, ctx.rng() * 6.28, s);
    ctx.addInstance('pot', pot, ctx.mat('plaster'), m, tint(pick(ctx.rng, [0xffffff, 0xe8d8c8, 0xd8e4ea, 0xf0c8b0]), 1));
    if (kind === 'palm') ctx.addInstance('pot:palm', palmTop, ctx.mat('frond'), m.clone(), tint(0xc8e4a0, range(ctx.rng, 0.85, 1.05)));
    else ctx.addInstance('pot:bush', bushTop, ctx.mat('foliage'), m.clone(), tint(kind === 'flower' ? pick(ctx.rng, [0xf2a0b8, 0xf4d070, 0xf08a6a]) : 0x9ccf7a, range(ctx.rng, 0.85, 1.05)));
  }
}

function planter(def: PropDef, ctx: PropContext): void {
  const L = num(ctx, def, 'length', 3);
  const Wd = num(ctx, def, 'width', 0.7);
  const kit = new Kit(ctx);
  const c = kit.g('concrete');
  c.color(0xe9e4da);
  c.chamferBox(0, 0, 0, L, 0.5, Wd, 0.03);
  const f = kit.g('foliage', { cast: false });
  f.white();
  const n = Math.max(2, Math.round(L / 0.6));
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.3 + ((L - 0.6) * i) / Math.max(1, n - 1);
    f.color(pick(ctx.rng, [0x9ccf7a, 0x86b866, 0xa8d67e, 0xf2a0b8]), range(ctx.rng, 0.85, 1.05));
    leafBlob(f, x, 0.66 + ctx.rng() * 0.08, (ctx.rng() - 0.5) * 0.1, 0.36, 0.26, Wd * 0.5, i * 2.1, 7);
  }
  kit.flush();
}

/** A few birds wheeling overhead: one InstancedMesh, wings flap by flipping the instance's Y scale. */
function birds(def: PropDef, ctx: PropContext): void {
  const count = Math.max(1, Math.round(num(ctx, def, 'count', 7) * (ctx.profile.detail >= 0.75 ? 1 : 0.6)));
  const radius = num(ctx, def, 'radius', 14);
  const height = num(ctx, def, 'height', 16);
  const g = new GB();
  g.color(0x2a2b30);
  // body + two swept wings whose tips sit at y = +1 (scaled per frame)
  g.tri([0, 0, 0.5], [0.09, 0, -0.3], [-0.09, 0, -0.3]);
  g.tri([0, 0, 0.5], [-0.09, 0, -0.3], [0.09, 0, -0.3]);
  for (const sx of [-1, 1]) {
    g.tri([0, 0, 0.22], [sx * 0.95, 0.5, -0.12], [0, 0, -0.16]);
    g.tri([0, 0, 0.22], [0, 0, -0.16], [sx * 0.95, 0.5, -0.12]);
  }
  const mesh = new InstancedMesh(g.build(), ctx.mat('flat'), count);
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.name = 'birds';
  const base = ctx.matrixAt();
  const origin = new Vector3().setFromMatrixPosition(base);
  const birdsData = Array.from({ length: count }, () => ({ r: radius * range(ctx.rng, 0.45, 1.1), h: height + range(ctx.rng, -3, 3), sp: range(ctx.rng, 0.22, 0.4) * (ctx.rng() < 0.5 ? 1 : -1), ph: ctx.rng() * 6.28, fl: range(ctx.rng, 5, 8) }));
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  ctx.addObject(mesh);
  ctx.onUpdate((_dt, time) => {
    for (let i = 0; i < count; i++) {
      const b = birdsData[i];
      const a = b.ph + time * b.sp;
      p.set(origin.x + Math.sin(a) * b.r, origin.y + b.h + Math.sin(time * 0.4 + b.ph) * 1.2, origin.z + Math.cos(a) * b.r * 1.6);
      q.setFromAxisAngle(_y, a + (b.sp > 0 ? Math.PI / 2 : -Math.PI / 2));
      // glide most of the time, flap in bursts
      const flap = Math.sin(time * b.fl + b.ph);
      const burst = Math.sin(time * 0.7 + b.ph * 2) > 0.2 ? 1 : 0.25;
      s.set(0.55, 0.55 * (0.25 + flap * 0.75 * burst), 0.55);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

registerProp('common.palm', palm);
registerProp('common.tree', tree);
registerProp('common.bush', bush);
registerProp('common.potPlant', potPlant);
registerProp('common.planter', planter);
registerProp('common.birds', birds);
