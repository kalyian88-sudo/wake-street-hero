/**
 * Small animated markers: the start gate (two bobbing buoys with WHY NOT flags), the filmer zone
 * ring with its REC tag, and the debug hitbox overlay.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial } from 'three';
import type { Camera, Material } from 'three';
import { BRAND } from '../config';
import type { CollisionDebugShape, FilmerZoneDef, WinchPointDef } from '../types';
import { BRAND_UV } from './decals';
import type { BuildCtx } from './build';
import { GB, linearRGB } from './geo';
import type { Terrain } from './terrain';

export interface StartMarker {
  readonly group: Group;
  place(wp: WinchPointDef, waterLevel: number): void;
  update(dt: number, time: number): void;
  dispose(): void;
}

export function createStartMarker(b: BuildCtx): StartMarker {
  const group = new Group();
  group.name = 'startMarker';
  const buoys: Group[] = [];
  const body = new GB();
  // float: red cone with a white band, weighted below the waterline
  body.color(BRAND.colors.red);
  body.lathe(
    0,
    0,
    [
      [0.08, -0.45],
      [0.3, -0.12],
      [0.33, 0.06],
      [0.27, 0.2],
    ],
    12,
  );
  body.color(0xf4f4f0);
  body.lathe(
    0,
    0,
    [
      [0.27, 0.2],
      [0.21, 0.36],
    ],
    12,
  );
  body.color(BRAND.colors.red);
  body.lathe(
    0,
    0,
    [
      [0.21, 0.36],
      [0.09, 0.66],
      [0.0, 0.7],
    ],
    12,
  );
  body.color(0xe9e9e6);
  body.cyl(0, 0.66, 0, 0.014, 0.012, 1.25, 6, true);
  const bodyGeo = body.build();
  const flag = new GB();
  // two-sided flag so the wordmark reads from both sides
  const uv = BRAND_UV.plateRed;
  flag.quadUV([0.02, 1.52, 0], [0.74, 1.5, 0], [0.74, 1.7, 0], [0.02, 1.9, 0], uv[0], uv[1], uv[2], uv[3]);
  flag.quadUV([0.74, 1.5, -0.002], [0.02, 1.52, -0.002], [0.02, 1.9, -0.002], [0.74, 1.7, -0.002], uv[2], uv[1], uv[0], uv[3]);
  const flagGeo = flag.build();
  const plastic = b.mat('plastic');
  const brand = b.mat('brand');
  for (const sx of [-1, 1]) {
    const g = new Group();
    const m = new Mesh(bodyGeo, plastic);
    m.castShadow = true;
    const f = new Mesh(flagGeo, brand);
    g.add(m, f);
    g.userData.side = sx;
    group.add(g);
    buoys.push(g);
  }
  let yaw = 0;
  let level = 0;
  return {
    group,
    place(wp, waterLevel) {
      const dx = wp.pos[0] - wp.start[0];
      const dz = wp.pos[2] - wp.start[2];
      const l = Math.hypot(dx, dz) || 1;
      yaw = Math.atan2(dx, dz);
      level = waterLevel;
      for (const g of buoys) {
        const s = g.userData.side as number;
        // gate: ±2.1 m either side of the start, a little ahead
        g.position.set(wp.start[0] + (dz / l) * 2.1 * s + (dx / l) * 1.2, level, wp.start[2] - (dx / l) * 2.1 * s + (dz / l) * 1.2);
        g.rotation.y = yaw + Math.PI / 2;
      }
    },
    update(_dt, time) {
      for (let i = 0; i < buoys.length; i++) {
        const g = buoys[i];
        g.position.y = level + Math.sin(time * 1.7 + i * 2.1) * 0.035;
        g.rotation.x = Math.sin(time * 1.3 + i) * 0.07;
        g.rotation.z = Math.sin(time * 1.1 + i * 1.7) * 0.06;
      }
    },
    dispose() {
      bodyGeo.dispose();
      flagGeo.dispose();
    },
  };
}

export interface ZoneMarker {
  readonly group: Group;
  update(dt: number, time: number, camera: Camera, active: boolean): void;
  dispose(): void;
}

/** Dashed ring on the ground / water around a filmer zone + a camera-facing "● REC" tag above the filmer. */
export function createZoneMarker(zone: FilmerZoneDef, terrain: Terrain, brand: Material): ZoneMarker {
  const group = new Group();
  group.name = `zone:${zone.id}`;
  const g = new GB();
  const [r, gg, bb] = linearRGB(BRAND.colors.red);
  const n = 72;
  for (let i = 0; i < n; i += 2) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1.1) / n) * Math.PI * 2;
    const p = (a: number, rad: number): [number, number, number] => {
      const x = zone.center[0] + Math.cos(a) * rad;
      const z = zone.center[1] + Math.sin(a) * rad;
      return [x, terrain.heightAt(x, z) + 0.05, z];
    };
    g.rgb(i % 4 === 0 ? 1.5 : r * 1.6, i % 4 === 0 ? 1.5 : gg * 1.6, i % 4 === 0 ? 1.5 : bb * 1.6);
    g.quad(p(a0, zone.radius + 0.09), p(a0, zone.radius - 0.09), p(a1, zone.radius - 0.09), p(a1, zone.radius + 0.09));
  }
  const ringMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const ring = new Mesh(g.build(), ringMat);
  ring.renderOrder = 1;
  group.add(ring);
  const t = new GB();
  const uv = BRAND_UV.rec;
  t.quadUV([-0.3, -0.3, 0], [0.3, -0.3, 0], [0.3, 0.3, 0], [-0.3, 0.3, 0], uv[0], uv[1], uv[2], uv[3]);
  const tag = new Mesh(t.build(), brand);
  tag.position.set(zone.pos[0], zone.pos[1] + 2.25, zone.pos[2]);
  group.add(tag);
  return {
    group,
    update(_dt, time, camera, active) {
      tag.quaternion.copy(camera.quaternion);
      // blink like a recording light; brighter ring while the rider is in frame
      const blink = active ? (Math.sin(time * 9) > 0 ? 1 : 0.55) : 1;
      tag.scale.setScalar(blink * (active ? 1.25 : 1));
      ringMat.opacity = active ? 0.6 + Math.sin(time * 8) * 0.2 : 0.26;
    },
    dispose() {
      ring.geometry.dispose();
      tag.geometry.dispose();
      ringMat.dispose();
    },
  };
}

export interface DebugOverlay {
  readonly group: Group;
  set(on: boolean, shapes?: CollisionDebugShape[]): void;
  dispose(): void;
}

/** CollisionDebugShape outlines as coloured line segments ('line' = open polyline, everything else closed). */
export function createDebugOverlay(): DebugOverlay {
  const group = new Group();
  group.name = 'debug';
  group.visible = false;
  const mat = new LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false });
  let lines: LineSegments | null = null;
  const clear = (): void => {
    if (lines) {
      group.remove(lines);
      lines.geometry.dispose();
      lines = null;
    }
  };
  return {
    group,
    set(on, shapes) {
      group.visible = on;
      if (!on && !shapes) return;
      if (shapes) {
        clear();
        const pos: number[] = [];
        const col: number[] = [];
        for (const s of shapes) {
          const n = s.points.length / 3;
          if (n < 2) continue;
          const cr = ((s.color >> 16) & 255) / 255;
          const cg = ((s.color >> 8) & 255) / 255;
          const cb = (s.color & 255) / 255;
          const last = s.kind === 'line' ? n - 1 : n;
          for (let i = 0; i < last; i++) {
            const j = (i + 1) % n;
            pos.push(s.points[i * 3], s.points[i * 3 + 1], s.points[i * 3 + 2], s.points[j * 3], s.points[j * 3 + 1], s.points[j * 3 + 2]);
            col.push(cr, cg, cb, cr, cg, cb);
          }
        }
        const geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
        geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
        lines = new LineSegments(geo, mat);
        lines.frustumCulled = false;
        lines.renderOrder = 999;
        group.add(lines);
      }
    },
    dispose() {
      clear();
      mat.dispose();
    },
  };
}
