/**
 * Spectators: instanced low-poly figures in four baked poses. One draw call per pose; the shirt
 * colour comes from the instance colour through a per-vertex tint mask (skin / shorts keep their
 * own vertex colours). The crowd hops and wiggles for a moment when the rider lands a good trick.
 */
import { BufferAttribute, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { seededRng } from '../data/geometry';
import { GB } from './geo';
import type { P3 } from './geo';
import { HIP_Y, buildLegs, buildTorso, solveElbow } from './npc';
import type { FigureLook } from './npc';
import type { SpectatorSpec } from './props/context';

type Pose = NonNullable<SpectatorSpec['pose']>;
const POSES: Pose[] = ['stand', 'cheer', 'film', 'sit'];
const SHIRTS = [0xe30613, 0xffffff, 0x1c1d21, 0x2f8f8a, 0xf2c64b, 0x3e6fa8, 0xf08a5d, 0x7bbf6a, 0xd9d2c5, 0xb565a7];

/** Shirt parts are emitted in this sentinel colour and converted to the tint mask afterwards. */
const MASK: [number, number, number] = [1, 0, 1];

function arm(g: GB, look: FigureLook, s: P3, t: P3, pole: P3): void {
  const E = solveElbow(new Vector3(...s), new Vector3(...t), new Vector3(...pole), new Vector3());
  const e: P3 = [E.x, E.y, E.z];
  const mid: P3 = [s[0] + (e[0] - s[0]) * 0.5, s[1] + (e[1] - s[1]) * 0.5, s[2] + (e[2] - s[2]) * 0.5];
  g.rgb(...MASK);
  g.rod(s, mid, 0.055, 5, false, 0.05);
  g.color(look.skin);
  g.rod(mid, e, 0.044, 5, false, 0.039);
  g.rod(e, t, 0.038, 5, false, 0.03);
  g.sphere(t[0], t[1], t[2], 0.042, 0.042, 0.042, 5, 3);
}

function figure(pose: Pose, variant: number): BufferGeometry {
  const look: FigureLook = {
    skin: [0xd9a577, 0xb47a4e, 0xe9bd97, 0x8a5a36][variant % 4],
    shirt: 0xff00ff,
    shorts: [0x2a2b30, 0x55607a, 0x8a8468, 0x3d4a3a][variant % 4],
    hair: [0x1b1512, 0x2a1a12, 0x4a2f1c, 0x14110f][variant % 4],
    cap: pose === 'film' ? 0x1c1d21 : pose === 'stand' ? 0xe9e6dc : null,
    shoes: 0xe6e3da,
  };
  const g = new GB();
  let hip = HIP_Y;
  if (pose === 'sit') {
    // sitting on an edge at y = 0, legs dangling over +Z
    hip = 0.1;
    for (const sx of [-1, 1]) {
      const x = sx * 0.1;
      g.color(look.shorts);
      g.rod([x, 0.09, 0.0], [x, 0.07, 0.4], 0.085, 6, false, 0.06);
      g.color(look.skin);
      g.rod([x, 0.07, 0.4], [x, -0.36, 0.44], 0.055, 6, false, 0.04);
      g.color(look.shoes);
      g.box(x, -0.4, 0.5, 0.1, 0.07, 0.24);
    }
    g.color(look.shorts);
    g.sphere(0, hip, 0, 0.165, 0.12, 0.13, 8, 5);
  } else buildLegs(g, look, 0.1);
  g.push().translate(0, hip, 0);
  if (pose === 'sit') g.rotX(-0.14);
  const torso = new GB();
  buildTorso(torso, { ...look, shirt: 0xff00ff });
  // convert the placeholder shirt colour of the shared torso builder into the mask sentinel
  for (let i = 0; i < torso.col.length; i += 3) {
    if (torso.col[i] > 0.9 && torso.col[i + 1] < 0.1 && torso.col[i + 2] > 0.9) {
      torso.col[i] = MASK[0];
      torso.col[i + 1] = MASK[1];
      torso.col[i + 2] = MASK[2];
    }
  }
  g.append(torso);
  const sh = 0.5;
  if (pose === 'stand') {
    arm(g, look, [0.2, sh, 0], [0.27, 0.0, 0.06], [0.6, -0.5, -0.6]);
    arm(g, look, [-0.2, sh, 0], [-0.19, 0.03, 0.12], [-0.9, -0.2, -0.4]);
  } else if (pose === 'cheer') {
    arm(g, look, [0.2, sh, 0], [0.36, 0.98, 0.06], [0.9, -0.2, -0.2]);
    arm(g, look, [-0.2, sh, 0], [-0.3, 1.02, 0.04], [-0.9, -0.2, -0.2]);
  } else if (pose === 'film') {
    arm(g, look, [0.2, sh, 0], [0.1, 0.72, 0.36], [0.8, -0.6, -0.1]);
    arm(g, look, [-0.2, sh, 0], [-0.24, 0.0, 0.05], [-0.6, -0.5, -0.6]);
    g.color(0x15161a);
    g.box(0.1, 0.76, 0.39, 0.075, 0.15, 0.012);
  } else {
    arm(g, look, [0.2, sh, 0], [0.3, 0.0, -0.2], [0.8, -0.3, -0.6]);
    arm(g, look, [-0.2, sh, 0], [-0.3, 0.0, -0.2], [-0.8, -0.3, -0.6]);
  }
  g.pop();
  const geo = g.build();
  const col = geo.getAttribute('color');
  const mask = new Float32Array(col.count);
  for (let i = 0; i < col.count; i++) {
    if (col.getX(i) > 0.9 && col.getY(i) < 0.1 && col.getZ(i) > 0.9) {
      mask[i] = 1;
      col.setXYZ(i, 1, 1, 1);
    }
  }
  geo.setAttribute('tintMask', new BufferAttribute(mask, 1));
  return geo;
}

interface Entry {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  phase: number;
  pose: Pose;
  shirt: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _sc = new Vector3();
const _up = new Vector3(0, 1, 0);
const _c = new Color();

export class Crowd {
  private readonly entries: Entry[] = [];
  private readonly meshes: { mesh: InstancedMesh; list: Entry[]; pose: Pose }[] = [];
  private material: MeshStandardMaterial | null = null;
  private energy = 0;
  private settled = true;
  private readonly rnd = seededRng(20240611);

  get count(): number {
    return this.entries.length;
  }

  add(s: SpectatorSpec): void {
    const poses: Pose[] = ['stand', 'stand', 'cheer', 'film'];
    this.entries.push({
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
      scale: s.scale ?? 0.94 + this.rnd() * 0.12,
      phase: this.rnd() * 6.28,
      pose: s.pose ?? poses[Math.floor(this.rnd() * poses.length)],
      shirt: s.shirt ?? SHIRTS[Math.floor(this.rnd() * SHIRTS.length)],
    });
  }

  build(parent: Object3D, detail: number): void {
    if (!this.entries.length) return;
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute float tintMask;')
        .replace(
          '#include <color_vertex>',
          `vColor = vec4( 1.0 );
#ifdef USE_COLOR
  vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, tintMask );
#endif`,
        );
    };
    mat.customProgramCacheKey = () => 'crowd-tint';
    this.material = mat;
    // drop a share of the spectators on low detail (list order is the authoring order → thin evenly)
    const keep = detail >= 0.75 ? 1 : 0.6;
    POSES.forEach((pose, pi) => {
      const list = this.entries.filter((e, i) => e.pose === pose && (keep >= 1 || (i * 7919) % 100 < keep * 100));
      if (!list.length) return;
      const mesh = new InstancedMesh(figure(pose, pi), mat, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.name = `crowd:${pose}`;
      list.forEach((e, i) => mesh.setColorAt(i, _c.setHex(e.shirt)));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      parent.add(mesh);
      this.meshes.push({ mesh, list, pose });
    });
    this.write(0);
    for (const { mesh } of this.meshes) {
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.6;
    }
  }

  /** Crowd reaction 0..1 (trick tier based). */
  cheer(strength: number): void {
    this.energy = Math.max(this.energy, Math.min(1, strength));
    this.settled = false;
  }

  update(dt: number, time: number): void {
    if (this.settled) return;
    this.energy = Math.max(0, this.energy - dt * 0.45);
    this.write(time);
    if (this.energy <= 0) this.settled = true;
  }

  private write(time: number): void {
    const e = this.energy;
    for (const { mesh, list, pose } of this.meshes) {
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const hop = pose === 'sit' ? 0 : Math.abs(Math.sin(time * (6.5 + (s.phase % 2)) + s.phase)) * 0.22 * e;
        _q.setFromAxisAngle(_up, s.yaw + Math.sin(time * 5 + s.phase) * 0.12 * e);
        _p.set(s.x, s.y + hop * s.scale, s.z);
        _sc.setScalar(s.scale);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _sc));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const { mesh } of this.meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.material?.dispose();
    this.meshes.length = 0;
  }
}
