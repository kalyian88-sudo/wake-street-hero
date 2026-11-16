/**
 * Rails and pipes. `path` is the CENTRE line of the tube; the board rides on path + radius, exactly
 * like the grind line of the collision world.
 */
import { BRAND } from '../../config';
import type { RailDef, V3 } from '../../types';
import { wetShade } from '../build';
import type { BuildCtx } from '../build';
import { GB } from '../geo';
import type { P3 } from '../geo';

export interface RailOpts {
  /** Height of the solid under a post (defaults to the terrain). */
  floor?: (x: number, z: number) => number | null;
}

interface RailLook {
  key: string;
  tint: number;
  mul: number;
  postKey: string;
  postTint: number;
}

function look(def: RailDef): RailLook {
  switch (def.material ?? (def.style === 'bamboo' ? 'bamboo' : 'steel')) {
    case 'brandRed':
      return { key: 'paintedMetal', tint: BRAND.colors.red, mul: 1, postKey: 'paintedMetal', postTint: 0x2a2b30 };
    case 'bamboo':
      return { key: 'bamboo', tint: 0xffffff, mul: 1, postKey: 'bamboo', postTint: 0xe6d9a8 };
    case 'stone':
      return { key: 'granite', tint: 0xffffff, mul: 1, postKey: 'granite', postTint: 0xffffff };
    case 'pvc':
      return { key: 'plastic', tint: 0xe9ecef, mul: 1, postKey: 'paintedMetal', postTint: 0x8a8f96 };
    case 'concrete':
      return { key: 'concrete', tint: 0xffffff, mul: 1.05, postKey: 'concrete', postTint: 0xffffff };
    case 'rust':
      return { key: 'rust', tint: 0xffffff, mul: 1, postKey: 'rust', postTint: 0xffffff };
    case 'neon':
      return { key: 'neon', tint: 0xff2d6f, mul: 3.2, postKey: 'paintedMetal', postTint: 0x24252a };
    default:
      return { key: 'metal', tint: 0xffffff, mul: 1, postKey: 'metal', postTint: 0xd8dade };
  }
}

function lerp3(a: V3, b: V3, t: number): P3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function buildRail(b: BuildCtx, def: RailDef, opts: RailOpts = {}): void {
  const r = def.radius ?? 0.04;
  if (def.path.length < 2) return;
  if (def.style === 'pipe' && r >= 0.15) {
    buildFatPipe(b, def, r);
    return;
  }
  const lk = look(def);
  const g = new GB();
  const posts = new GB();
  const seg = b.profile.detail >= 0.75 ? 10 : 7;
  const path = def.path as readonly P3[];
  g.color(lk.tint, lk.mul);

  if (def.style === 'flat' || def.style === 'edge') {
    const w = def.style === 'flat' ? r * 3.4 : r * 2;
    for (let i = 0; i < path.length - 1; i++) g.beam(path[i], path[i + 1], w, r * 2);
  } else {
    g.tube(path, r, seg, { caps: 'round', fillet: def.style === 'kink' ? 0 : r * 2.5 });
    if (def.style === 'kink') {
      // welded knuckles at the kinks
      for (let i = 1; i < path.length - 1; i++) g.sphere(path[i][0], path[i][1], path[i][2], r * 1.3, r * 1.3, r * 1.3, 8, 5);
    }
    if (def.style === 'bamboo') {
      g.color(0x8a7a48);
      for (let i = 0; i < path.length - 1; i++) {
        const len = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1], path[i + 1][2] - path[i][2]);
        const n = Math.max(1, Math.round(len / 0.42));
        for (let k = 1; k < n; k++) {
          const p0 = lerp3(path[i], path[i + 1], k / n - 0.012 / len);
          const p1 = lerp3(path[i], path[i + 1], k / n + 0.012 / len);
          g.rod(p0, p1, r * 1.13, seg, false);
        }
      }
    }
  }

  // ── supports ──
  const supports = def.supports ?? 'posts';
  if (supports !== 'none') {
    const stations: P3[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const c = path[i + 1];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      const inset = Math.min(0.3, len * 0.2) / len;
      const n = Math.max(1, Math.ceil(len / 3.2));
      for (let k = 0; k <= n; k++) {
        // skip duplicates at shared vertices: only the first segment emits its start
        if (k === 0 && i > 0) continue;
        let t = k / n;
        if (i === 0 && k === 0) t = inset;
        if (i === path.length - 2 && k === n) t = 1 - inset;
        stations.push(lerp3(a, c, t));
      }
    }
    let wallSide = 0;
    if (supports === 'wall') wallSide = findWallSide(b, path, r);
    posts.color(lk.postTint);
    for (const s of stations) {
      const floorY = opts.floor ? opts.floor(s[0], s[2]) : null;
      if (supports === 'wall' && wallSide !== 0) {
        const dx = path[path.length - 1][0] - path[0][0];
        const dz = path[path.length - 1][2] - path[0][2];
        const l = Math.hypot(dx, dz) || 1;
        const nx = (dz / l) * wallSide;
        const nz = (-dx / l) * wallSide;
        // L-bracket: out from the wall, then up into the rail
        const reach = 0.7;
        const elbow: P3 = [s[0], s[1] - r - 0.1, s[2]];
        posts.rod([s[0] + nx * reach, elbow[1], s[2] + nz * reach], elbow, r * 0.8, 6, false);
        posts.rod(elbow, [s[0], s[1], s[2]], r * 0.8, 6, false);
        posts.push().translate(s[0] + nx * reach, elbow[1], s[2] + nz * reach).rotY(Math.atan2(nx, nz)).box(0, 0, 0, 0.14, 0.14, 0.02);
        posts.pop();
        continue;
      }
      const water = b.terrain.isOpenWater(s[0], s[2]);
      const ground = floorY ?? b.terrain.heightAt(s[0], s[2]);
      if (def.style === 'bamboo') {
        // crossed bamboo legs lashed under the rail
        const dx = path[path.length - 1][0] - path[0][0];
        const dz = path[path.length - 1][2] - path[0][2];
        const l = Math.hypot(dx, dz) || 1;
        const nx = dz / l;
        const nz = -dx / l;
        const base = water && floorY === null ? ground - 0.9 : ground;
        const spread = Math.max(0.18, (s[1] - ground) * 0.45);
        posts.rod([s[0] - nx * spread, base, s[2] - nz * spread], [s[0] + nx * 0.07, s[1] + 0.12, s[2] + nz * 0.07], r * 0.85, 6, true);
        posts.rod([s[0] + nx * spread, base, s[2] + nz * spread], [s[0] - nx * 0.07, s[1] + 0.12, s[2] - nz * 0.07], r * 0.85, 6, true);
        continue;
      }
      const baseY = water && floorY === null ? ground - 1.0 : ground;
      const topY = s[1] - r * 0.5;
      if (topY - baseY < 0.03) continue;
      const v0 = posts.vertexCount;
      if (def.style === 'flat' || def.style === 'edge') posts.boxB(s[0], baseY, s[2], r * 1.6, topY - baseY, r * 1.6, 'yY');
      else posts.cyl(s[0], baseY, s[2], r * 0.85, r * 0.85, topY - baseY, 7, false);
      if (water && floorY === null) {
        posts.shadeBy(v0, (_x, y) => wetShade(y, ground));
        b.foam.push({ points: square(s[0], s[2], r + 0.08), level: ground });
      } else if (def.style === 'handrail' || !water) {
        // base plate on solid ground
        posts.cyl(s[0], baseY, s[2], r * 2.4, r * 2.4, 0.012, 8, true);
      }
    }
  }

  if (!g.empty) b.statics.add(g.build(), b.mat(lk.key, lk.key === 'bamboo' ? { repeat: [Math.PI * 2 * r * 4, 1.2] } : {}), null, { cast: true });
  if (!posts.empty) b.statics.add(posts.build(), b.mat(lk.postKey, lk.postKey === 'bamboo' ? { repeat: [Math.PI * 2 * r * 4, 1.2] } : {}), null, { cast: true });
}

function square(x: number, z: number, h: number): [number, number][] {
  return [
    [x - h, z - h],
    [x + h, z - h],
    [x + h, z + h],
    [x - h, z + h],
  ];
}

/** +1 / −1 = side (left / right of the path direction) on which solid ground rises to the rail, 0 = none. */
function findWallSide(b: BuildCtx, path: readonly P3[], r: number): number {
  const a = path[0];
  const c = path[path.length - 1];
  const dx = c[0] - a[0];
  const dz = c[2] - a[2];
  const l = Math.hypot(dx, dz) || 1;
  const nx = dz / l;
  const nz = -dx / l;
  const mx = (a[0] + c[0]) / 2;
  const mz = (a[2] + c[2]) / 2;
  const y = (a[1] + c[1]) / 2 - r - 0.3;
  for (const d of [0.5, 0.9, 1.4]) {
    if (b.terrain.heightAt(mx + nx * d, mz + nz * d) >= y) return 1;
    if (b.terrain.heightAt(mx - nx * d, mz - nz * d) >= y) return -1;
  }
  return 0;
}

/** Fat pipe: section joints, flanged open ends, concrete saddles standing in the water. */
function buildFatPipe(b: BuildCtx, def: RailDef, r: number): void {
  const material = def.material ?? 'concrete';
  const key = material === 'steel' ? 'metal' : material === 'pvc' ? 'plastic' : material === 'rust' ? 'rust' : 'concrete';
  const tint = material === 'pvc' ? 0xd9763a : material === 'steel' ? 0xc9ccd2 : 0xffffff;
  const g = new GB();
  const dark = new GB();
  const saddles = new GB();
  const path = def.path as readonly P3[];
  const seg = b.profile.detail >= 0.75 ? 18 : 12;
  g.color(tint, material === 'concrete' ? 1.08 : 1);
  g.tube(path, r, seg, { caps: 'none' });
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const c = path[i + 1];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const dir: P3 = [(c[0] - a[0]) / len, (c[1] - a[1]) / len, (c[2] - a[2]) / len];
    // section joints (bell ends) every ~2.4 m and at both ends
    const n = Math.max(1, Math.round(len / 2.4));
    g.color(tint, material === 'concrete' ? 0.96 : 0.9);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const w = k === 0 || k === n ? 0.14 : 0.09;
      const off = k === 0 ? 0 : k === n ? -w : -w / 2;
      const p0: P3 = [a[0] + dir[0] * (len * t + off), a[1] + dir[1] * (len * t + off), a[2] + dir[2] * (len * t + off)];
      const p1: P3 = [p0[0] + dir[0] * w, p0[1] + dir[1] * w, p0[2] + dir[2] * w];
      g.rod(p0, p1, r * 1.09, seg, true);
    }
    // dark bore at the open ends
    if (i === 0) boreCap(dark, a, [-dir[0], -dir[1], -dir[2]], r);
    if (i === path.length - 2) boreCap(dark, c, dir, r);
    // saddles
    if ((def.supports ?? 'posts') !== 'wall') {
      const yaw = Math.atan2(dir[0], dir[2]);
      for (const t of len > 6 ? [0.14, 0.5, 0.86] : [0.2, 0.8]) {
        const p = lerp3(a, c, t);
        const ground = b.terrain.heightAt(p[0], p[2]);
        const water = b.terrain.isOpenWater(p[0], p[2]);
        const y0 = water ? ground - 1.0 : ground;
        const top = p[1] - r * 0.35;
        if (top - y0 < 0.04) continue;
        const v0 = saddles.vertexCount;
        saddles.color(0xffffff, 0.95);
        saddles.push().translate(p[0], 0, p[2]).rotY(yaw).chamferBox(0, y0, 0, r * 2.7, top - y0, 0.42, 0.04);
        saddles.pop();
        if (water) saddles.shadeBy(v0, (_x, y) => wetShade(y, ground));
      }
    }
    // foam outline when the pipe lies in the water
    const lvl = b.terrain.waterLevelNear((a[0] + c[0]) / 2, (a[2] + c[2]) / 2);
    if (lvl !== null && Math.min(a[1], c[1]) - r < lvl + 0.25) {
      const nx = dir[2];
      const nz = -dir[0];
      b.foam.push({
        level: lvl,
        points: [
          [a[0] - nx * r, a[2] - nz * r],
          [c[0] - nx * r, c[2] - nz * r],
          [c[0] + nx * r, c[2] + nz * r],
          [a[0] + nx * r, a[2] + nz * r],
        ],
      });
    }
  }
  b.statics.add(g.build(), b.mat(key), null, { cast: true });
  if (!dark.empty) b.statics.add(dark.build(), b.mat('flat'), null, { cast: false });
  if (!saddles.empty) b.statics.add(saddles.build(), b.mat('concrete'), null, { cast: true });
}

/** Recessed dark disc + wall-thickness ring at a pipe mouth. `dir` points out of the pipe. */
function boreCap(g: GB, p: P3, dir: P3, r: number): void {
  const yaw = Math.atan2(dir[0], dir[2]);
  const pitch = Math.acos(Math.max(-1, Math.min(1, dir[1])));
  g.push().translate(p[0], p[1], p[2]).rotY(yaw).rotX(pitch);
  g.color(0x0c0d0f);
  g.disc(0, -0.002, 0, r * 0.86, 14, 1);
  // wall thickness ring
  g.color(0x8f8d86);
  g.lathe(
    0,
    0,
    [
      [r * 1.09, 0],
      [r * 0.84, 0],
    ],
    14,
  );
  g.pop();
}
