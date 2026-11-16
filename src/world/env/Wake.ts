/**
 * The rider's wake: a ribbon laid along the last few seconds of the board's track. Every track sample
 * remembers where and when it was emitted; the vertex shader spreads it sideways with age (a V that opens
 * fast and then runs out of energy), the fragment shader paints churned white water behind the board,
 * foam crests on the diverging arms and the pale aerated water in between. One draw call, ~500 vertices.
 */
import {
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  ShaderMaterial,
  Sphere,
  UniformsLib,
  UniformsUtils,
  Uint16BufferAttribute,
  Vector3,
  type IUniform,
  type Texture,
} from 'three';
import type { WakeSource } from '../../types';
import { WAKE_FRAG, WAKE_VERT } from './waterShader';

/** Seconds a piece of wake stays visible. */
export const WAKE_LIFE = 5.2;
/** Initial sideways speed of the arms (m/s). */
export const WAKE_SPREAD = 1.75;
const CAPACITY = 176;
const STRIDE = 9;
/** Wake starts under the tail of the board, not under its centre (m). */
const TAIL_OFFSET = 0.45;
const MIN_SPEED = 1.2;

/** Pure track bookkeeping (headless, unit-tested). */
export class WakeTrack {
  readonly capacity: number;
  /** Per sample: x, y, z, rightX, rightZ, birth, strength, lean. */
  readonly data: Float32Array;
  first = 0;
  count = 0;
  /** A live head sample is following the board. */
  emitting = false;
  private dirX = 0;
  private dirZ = 1;

  constructor(capacity = CAPACITY) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * 2 * 8);
  }

  clear(): void {
    this.first = 0;
    this.count = 0;
    this.emitting = false;
  }

  /** Offset of live sample `i` (0 = oldest) in `data`. */
  at(i: number): number {
    return (this.first + i) * 8;
  }

  private push(x: number, y: number, z: number, rx: number, rz: number, birth: number, strength: number, lean: number): number {
    if (this.count >= this.capacity) {
      this.first++;
      this.count--;
    }
    if (this.first + this.count >= this.capacity * 2) {
      this.data.copyWithin(0, this.first * 8, (this.first + this.count) * 8);
      this.first = 0;
    }
    const o = (this.first + this.count) * 8;
    const d = this.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = rx;
    d[o + 4] = rz;
    d[o + 5] = birth;
    d[o + 6] = strength;
    d[o + 7] = lean;
    this.count++;
    return o;
  }

  /** Advance the track. `time` = water clock (scaled seconds). */
  update(time: number, src: WakeSource | null): void {
    const d = this.data;
    // forget what has faded out (keep one extra so the tail quad fades instead of popping)
    while (this.count > 1 && time - d[this.at(1) + 5] > WAKE_LIFE) {
      this.first++;
      this.count--;
    }
    if (this.count === 1 && !this.emitting && time - d[this.at(0) + 5] > WAKE_LIFE) this.clear();

    const on = src !== null && src.onWater && src.speed > MIN_SPEED;
    if (!on || !src) {
      if (this.emitting) {
        // close the strip: a zero-strength twin of the head, so nothing bridges the air gap
        const h = this.at(this.count - 1);
        this.push(d[h], d[h + 1], d[h + 2], d[h + 3], d[h + 4], d[h + 5], 0, d[h + 7]);
        this.emitting = false;
      }
      return;
    }

    const vx = src.vel.x;
    const vz = src.vel.z;
    const vl = Math.hypot(vx, vz);
    if (vl > 0.3) {
      this.dirX = vx / vl;
      this.dirZ = vz / vl;
    }
    const x = src.pos.x - this.dirX * TAIL_OFFSET;
    const z = src.pos.z - this.dirZ * TAIL_OFFSET;
    const y = src.pos.y;
    // right of travel (left = +X when heading +Z)
    const rx = -this.dirZ;
    const rz = this.dirX;
    const sp = (src.speed - MIN_SPEED) / 6.5;
    const strength = Math.min(1.35, (sp < 0 ? 0 : sp > 1 ? 1 : sp) * (0.82 + 0.5 * Math.abs(src.lean)));
    const lean = src.lean < -1 ? -1 : src.lean > 1 ? 1 : src.lean;

    if (!this.emitting) {
      // lead-in with zero strength, then the live head
      this.push(x, y, z, rx, rz, time, 0, lean);
      this.push(x, y, z, rx, rz, time, strength, lean);
      this.emitting = true;
      return;
    }
    let h = this.at(this.count - 1);
    const p = this.at(this.count - 2);
    const spacing = Math.max(0.32, src.speed * 0.036);
    const dx = x - d[p];
    const dz = z - d[p + 2];
    if (dx * dx + dz * dz >= spacing * spacing) {
      // commit the head where it is and start a new one
      h = this.push(x, y, z, rx, rz, time, strength, lean);
    }
    d[h] = x;
    d[h + 1] = y;
    d[h + 2] = z;
    d[h + 3] = rx;
    d[h + 4] = rz;
    d[h + 5] = time;
    d[h + 6] = strength;
    d[h + 7] = lean;
  }
}

export interface WakeColors {
  foamLit: Color;
  foamShade: Color;
  aerLit: Color;
  aerShade: Color;
  crest: Color;
}

export class Wake {
  readonly mesh: Mesh;
  readonly track = new WakeTrack();
  readonly uniforms: Record<string, IUniform>;
  private readonly geometry: BufferGeometry;
  private readonly buffer: InterleavedBuffer;
  private readonly material: ShaderMaterial;

  constructor(waves: Texture, detail: number) {
    const array = new Float32Array(CAPACITY * 3 * STRIDE);
    this.buffer = new InterleavedBuffer(array, STRIDE);
    this.buffer.setUsage(DynamicDrawUsage);
    const g = (this.geometry = new BufferGeometry());
    g.setAttribute('aA', new InterleavedBufferAttribute(this.buffer, 4, 0));
    g.setAttribute('aB', new InterleavedBufferAttribute(this.buffer, 4, 4));
    g.setAttribute('aLean', new InterleavedBufferAttribute(this.buffer, 1, 8));
    const idx = new Uint16Array((CAPACITY - 1) * 12);
    for (let s = 0; s < CAPACITY - 1; s++) {
      const a = s * 3;
      const b = a + 3;
      idx.set([a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2], s * 12);
    }
    g.setIndex(new Uint16BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    g.boundingSphere = new Sphere(new Vector3(), 1e6);

    this.uniforms = {
      ...UniformsUtils.merge([UniformsLib.lights, UniformsLib.fog]),
      uTime: { value: 0 },
      uSwell: { value: 0 },
      tWaves: { value: waves },
      uFoamLit: { value: new Color(1, 1, 1) },
      uFoamShade: { value: new Color(0.5, 0.5, 0.5) },
      uAerLit: { value: new Color(0.5, 0.8, 0.8) },
      uAerShade: { value: new Color(0.3, 0.5, 0.5) },
      uCrest: { value: new Color(1, 1, 1) },
      uShadowCenter: { value: new Vector3() },
      uLightRight: { value: new Vector3(1, 0, 0) },
      uLightUp: { value: new Vector3(0, 0, 1) },
      uShadowRange: { value: 20 },
    };
    this.material = new ShaderMaterial({
      name: 'WshWake',
      uniforms: this.uniforms,
      vertexShader: WAKE_VERT,
      fragmentShader: WAKE_FRAG,
      defines: { WATER_DETAIL: detail, WAKE_LIFE: WAKE_LIFE.toFixed(2), WAKE_SPREAD: WAKE_SPREAD.toFixed(2) },
      lights: true,
      fog: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.name = 'water.wake';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = -4;
    this.mesh.visible = false;
  }

  setDetail(detail: number, waves: Texture): void {
    this.uniforms.tWaves.value = waves;
    if (this.material.defines.WATER_DETAIL !== detail) {
      this.material.defines.WATER_DETAIL = detail;
      this.material.needsUpdate = true;
    }
  }

  update(time: number, src: WakeSource | null): void {
    const track = this.track;
    track.update(time, src);
    this.uniforms.uTime.value = time;
    const n = track.count;
    if (n < 2) {
      this.mesh.visible = false;
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const out = this.buffer.array as Float32Array;
    const d = track.data;
    let o = 0;
    for (let i = 0; i < n; i++) {
      const s = track.at(i);
      for (let side = -1; side <= 1; side++) {
        out[o] = d[s];
        out[o + 1] = d[s + 1] + 0.012;
        out[o + 2] = d[s + 2];
        out[o + 3] = d[s + 5];
        out[o + 4] = d[s + 3];
        out[o + 5] = d[s + 4];
        out[o + 6] = side;
        out[o + 7] = d[s + 6];
        out[o + 8] = d[s + 7];
        o += STRIDE;
      }
    }
    this.buffer.clearUpdateRanges();
    this.buffer.needsUpdate = true;
    this.geometry.setDrawRange(0, (n - 1) * 12);
    this.mesh.visible = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
