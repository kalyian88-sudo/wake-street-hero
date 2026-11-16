/**
 * Line preview (spot card): an animated ribbon of chevrons from the start to the winch draped over
 * water / quay, plus pulsing rings and bobbing diamonds on the obstacles the line passes.
 */
import { CanvasTexture, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three';
import { BRAND } from '../config';
import type { SpotDef, WinchPointDef } from '../types';
import { drawChevrons } from './decals';
import { GB, linearRGB } from './geo';
import { obstacleFocus } from './obstacles';
import type { Terrain } from './terrain';

export interface LinePreview {
  readonly group: Group;
  setLine(wp: WinchPointDef): void;
  setVisible(v: boolean): void;
  update(dt: number, time: number): void;
  dispose(): void;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

export function createLinePreview(spot: SpotDef, terrain: Terrain): LinePreview {
  const group = new Group();
  group.name = 'linePreview';
  group.visible = false;
  const tex = new CanvasTexture(drawChevrons());
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  const [r, g, b] = linearRGB(BRAND.colors.red);
  const ribbonMat = new MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  ribbonMat.color.setRGB(1.6, 1.6, 1.6);
  const bandMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, vertexColors: true });
  const markMat = new MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  let ribbon: Mesh | null = null;
  let band: Mesh | null = null;
  let diamonds: InstancedMesh | null = null;
  const marks: { x: number; y: number; z: number }[] = [];

  const dg = new GB();
  dg.rgb(r * 2.4, g * 2.4 + 0.04, b * 2.4 + 0.04);
  // downward pointing diamond
  const top: [number, number, number] = [0, 0.34, 0];
  const bot: [number, number, number] = [0, -0.46, 0];
  const ring: [number, number, number][] = [
    [0.24, 0, 0],
    [0, 0, 0.24],
    [-0.24, 0, 0],
    [0, 0, -0.24],
  ];
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const c = ring[(i + 1) % 4];
    dg.rgb(r * 2.4, g * 2.4 + 0.04, b * 2.4 + 0.04);
    dg.tri(top, c, a);
    dg.rgb(2, 2, 2);
    dg.tri(bot, a, c);
  }
  const diamondGeo = dg.build();

  const clear = (): void => {
    for (const m of [ribbon, band]) {
      if (m) {
        group.remove(m);
        m.geometry.dispose();
      }
    }
    if (diamonds) {
      group.remove(diamonds);
      diamonds.dispose();
    }
    ribbon = band = diamonds = null;
    marks.length = 0;
  };

  return {
    group,
    setLine(wp) {
      clear();
      const sx = wp.start[0];
      const sz = wp.start[2];
      const ex = wp.pos[0];
      const ez = wp.pos[2];
      const len = Math.hypot(ex - sx, ez - sz) || 1;
      const dx = (ex - sx) / len;
      const dz = (ez - sz) / len;
      const nx = dz;
      const nz = -dx;
      const hw = 0.55;
      const n = Math.max(2, Math.ceil(len / 1.5));
      const rg = new GB();
      const bg = new GB();
      bg.rgb(r * 1.4, g * 1.4, b * 1.4);
      let prevY = terrain.heightAt(sx, sz);
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const x0 = sx + dx * len * t0;
        const z0 = sz + dz * len * t0;
        const x1 = sx + dx * len * t1;
        const z1 = sz + dz * len * t1;
        const y0 = prevY + 0.07;
        const yEnd = terrain.heightAt(x1, z1);
        const y1 = yEnd + 0.07;
        prevY = yEnd;
        const v0 = (len * t0) / 2.2;
        const v1 = (len * t1) / 2.2;
        rg.quadUV([x0 + nx * hw, y0, z0 + nz * hw], [x0 - nx * hw, y0, z0 - nz * hw], [x1 - nx * hw, y1, z1 - nz * hw], [x1 + nx * hw, y1, z1 + nz * hw], 0, v0, 1, v1);
        // rails of the lane
        for (const s of [-1, 1]) {
          const o = s * (hw + 0.1);
          const w = s * 0.07;
          bg.quad([x0 + nx * (o + w), y0, z0 + nz * (o + w)], [x0 + nx * (o - w), y0, z0 + nz * (o - w)], [x1 + nx * (o - w), y1, z1 + nz * (o - w)], [x1 + nx * (o + w), y1, z1 + nz * (o + w)]);
        }
      }
      // rings + markers on obstacles near the line
      for (const o of spot.obstacles) {
        if (o.kind === 'gap') continue;
        const f = obstacleFocus(o);
        const along = (f.x - sx) * dx + (f.z - sz) * dz;
        const side = Math.abs((f.x - sx) * nx + (f.z - sz) * nz);
        if (along < -2 || along > len + 2 || side > f.r * 0.5 + 3.2) continue;
        marks.push({ x: f.x, y: f.y + Math.min(2.2, f.r * 0.35) + 1.5, z: f.z });
        const rad = Math.min(f.r + 0.5, 4.5);
        const segs = 28;
        const yb = terrain.heightAt(f.x, f.z) + 0.09;
        bg.rgb(2, 2, 2);
        for (let i = 0; i < segs; i += 2) {
          const a0 = (i / segs) * Math.PI * 2;
          const a1 = ((i + 1.2) / segs) * Math.PI * 2;
          bg.quad(
            [f.x + Math.cos(a0) * (rad + 0.12), yb, f.z + Math.sin(a0) * (rad + 0.12)],
            [f.x + Math.cos(a0) * rad, yb, f.z + Math.sin(a0) * rad],
            [f.x + Math.cos(a1) * rad, yb, f.z + Math.sin(a1) * rad],
            [f.x + Math.cos(a1) * (rad + 0.12), yb, f.z + Math.sin(a1) * (rad + 0.12)],
          );
        }
      }
      ribbon = new Mesh(rg.build(), ribbonMat);
      band = new Mesh(bg.build(), bandMat);
      ribbon.renderOrder = 3;
      band.renderOrder = 2;
      ribbon.frustumCulled = band.frustumCulled = false;
      group.add(ribbon, band);
      if (marks.length) {
        diamonds = new InstancedMesh(diamondGeo, markMat, marks.length);
        diamonds.frustumCulled = false;
        group.add(diamonds);
      }
    },
    setVisible(v) {
      group.visible = v;
    },
    update(dt, time) {
      if (!group.visible) return;
      tex.offset.y = (tex.offset.y - dt * 0.9) % 1;
      bandMat.opacity = 0.42 + Math.sin(time * 4) * 0.16;
      if (diamonds) {
        for (let i = 0; i < marks.length; i++) {
          const mk = marks[i];
          _q.setFromAxisAngle(_up, time * 2.2 + i);
          _p.set(mk.x, mk.y + Math.sin(time * 3 + i * 1.7) * 0.14, mk.z);
          _s.setScalar(1);
          diamonds.setMatrixAt(i, _m.compose(_p, _q, _s));
        }
        diamonds.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      clear();
      diamondGeo.dispose();
      tex.dispose();
      ribbonMat.dispose();
      bandMat.dispose();
      markMat.dispose();
    },
  };
}
