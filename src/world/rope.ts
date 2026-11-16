/**
 * The tow rope: a camera-facing lit ribbon from the winch fairlead to the handle.
 * Slack → parabolic sag (≈ catenary) that rests on water / ground; tension → straight and humming.
 * Buffers are preallocated; update() allocates nothing.
 */
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, Vector3 } from 'three';
import type { Camera, Material } from 'three';
import type { Terrain } from './terrain';

export const ROPE_SEGMENTS = 24;

/**
 * Sag (m) at mid-span of a rope spanning `dist` with `slack` metres of extra length.
 * Parabola arc length ≈ d + 8 s² / (3 d)  →  s = sqrt(3 d · slack / 8).
 */
export function ropeSag(dist: number, slack: number, tension: number): number {
  const s = Math.sqrt(Math.max(0, 0.375 * dist * Math.max(0, slack)));
  const rest = (1 - Math.min(1, Math.max(0, tension))) * 0.004 * dist;
  return Math.min(dist * 0.6, s + rest);
}

/**
 * Centre line of the rope. Writes (ROPE_SEGMENTS + 1) xyz triples into `out`.
 * `floor(x, z)` returns the height the rope may rest on.
 */
export function ropeCurve(
  out: Float32Array,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  slack: number,
  tension: number,
  time: number,
  floor: ((x: number, z: number) => number) | null,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  const sag = ropeSag(dist, slack, tension);
  const hl = Math.hypot(dx, dz) || 1;
  // horizontal side vector for the vibration
  const sx = dz / hl;
  const sz = -dx / hl;
  const amp = tension > 0.25 ? 0.012 * (tension - 0.25) : 0;
  for (let i = 0; i <= ROPE_SEGMENTS; i++) {
    const t = i / ROPE_SEGMENTS;
    const bell = 4 * t * (1 - t);
    let x = ax + dx * t;
    let y = ay + dy * t - sag * bell;
    let z = az + dz * t;
    if (amp > 0) {
      const wv = Math.sin(time * 47 + i * 1.31) * amp * bell;
      x += sx * wv;
      z += sz * wv;
      y += Math.sin(time * 61 + i * 0.93) * amp * bell;
    }
    if (floor && i > 0 && i < ROPE_SEGMENTS) {
      const h = floor(x, z) + 0.012;
      if (y < h) y = h;
    }
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
}

export interface Rope {
  readonly mesh: Mesh;
  update(anchor: Vector3, handle: Vector3, slack: number, tension: number, time: number, camera: Camera): void;
  dispose(): void;
}

export function createRope(material: Material, terrain: Terrain): Rope {
  const n = ROPE_SEGMENTS + 1;
  const pos = new Float32Array(n * 2 * 3);
  const nor = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const col = new Float32Array(n * 2 * 3).fill(1);
  const idx = new Uint16Array(ROPE_SEGMENTS * 6);
  for (let i = 0; i < ROPE_SEGMENTS; i++) {
    const a = i * 2;
    idx.set([a, a + 1, a + 3, a, a + 3, a + 2], i * 6);
  }
  const geo = new BufferGeometry();
  const pa = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
  const na = new BufferAttribute(nor, 3).setUsage(DynamicDrawUsage);
  const ua = new BufferAttribute(uv, 2).setUsage(DynamicDrawUsage);
  geo.setAttribute('position', pa);
  geo.setAttribute('normal', na);
  geo.setAttribute('uv', ua);
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = 'rope';
  const line = new Float32Array(n * 3);
  const cam = new Vector3();
  const floor = (x: number, z: number): number => terrain.heightAt(x, z);

  return {
    mesh,
    update(anchor, handle, slack, tension, time, camera) {
      ropeCurve(line, anchor.x, anchor.y, anchor.z, handle.x, handle.y, handle.z, slack, tension, time, floor);
      camera.getWorldPosition(cam);
      let along = 0;
      for (let i = 0; i < n; i++) {
        const x = line[i * 3];
        const y = line[i * 3 + 1];
        const z = line[i * 3 + 2];
        const i0 = Math.max(0, i - 1) * 3;
        const i1 = Math.min(n - 1, i + 1) * 3;
        let tx = line[i1] - line[i0];
        let ty = line[i1 + 1] - line[i0 + 1];
        let tz = line[i1 + 2] - line[i0 + 2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        let vx = cam.x - x;
        let vy = cam.y - y;
        let vz = cam.z - z;
        const vl = Math.hypot(vx, vy, vz) || 1;
        vx /= vl;
        vy /= vl;
        vz /= vl;
        // side = tangent × view
        let px = ty * vz - tz * vy;
        let py = tz * vx - tx * vz;
        let pz = tx * vy - ty * vx;
        const pl = Math.hypot(px, py, pz) || 1;
        // keep the rope at least ~1.3 px wide at any distance
        const w = Math.max(0.011, vl * 0.0021) / pl;
        px *= w;
        py *= w;
        pz *= w;
        if (i > 0) along += Math.hypot(x - line[i * 3 - 3], y - line[i * 3 - 2], z - line[i * 3 - 1]);
        const o = i * 6;
        pos[o] = x - px;
        pos[o + 1] = y - py;
        pos[o + 2] = z - pz;
        pos[o + 3] = x + px;
        pos[o + 4] = y + py;
        pos[o + 5] = z + pz;
        // lit like a round rope seen from the camera: normal = towards the eye, biased up
        const nl = Math.hypot(vx, vy + 0.6, vz) || 1;
        nor[o] = nor[o + 3] = vx / nl;
        nor[o + 1] = nor[o + 4] = (vy + 0.6) / nl;
        nor[o + 2] = nor[o + 5] = vz / nl;
        const u = i * 4;
        uv[u] = along;
        uv[u + 1] = 0;
        uv[u + 2] = along;
        uv[u + 3] = 0.05;
      }
      pa.needsUpdate = true;
      na.needsUpdate = true;
      ua.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
    },
  };
}
