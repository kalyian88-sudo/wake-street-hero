/**
 * Water: one merged mesh for every region of the spot + the rider's wake ribbon (2 draw calls).
 * Shader: src/world/env/waterShader.ts. Shore foam mask: foamMask.ts. Wake: Wake.ts.
 */
import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  RedFormat,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector3,
  Vector4,
  type Camera,
  type IUniform,
  type Texture,
} from 'three';
import type { FoamShape, IEnvironment, IWater, QualityProfile, WakeSource, WaterRegionDef, WorldBuildContext } from '../../types';
import { buildShoreMask, regionShoreSegments, regionsBounds, shapeSegments } from './foamMask';
import { getLighting } from './internal';
import { getWaveTexture, getWhiteTexture } from './textures';
import { Wake } from './Wake';
import { buildWaterGeometry } from './waterGeometry';
import { WATER_FRAG, WATER_VERT } from './waterShader';

const MAX_RIPPLES = 8;

interface Ripple {
  x: number;
  z: number;
  age: number;
  life: number;
  strength: number;
  active: boolean;
}

const _c = new Color();

class Water implements IWater {
  readonly object = new Group();
  private readonly env: IEnvironment;
  private readonly regions: WaterRegionDef[];
  private profile: QualityProfile;
  private readonly maxAnisotropy: number;
  private readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly uniforms: Record<string, IUniform>;
  private readonly wake: Wake;
  private readonly ripples: Ripple[] = [];
  private readonly rippleData = new Float32Array(MAX_RIPPLES * 4);
  private readonly rippleFoam = new Float32Array(MAX_RIPPLES);
  private rippleCursor = 0;
  private shoreTex: DataTexture | null = null;
  private clock = 0;
  private lightingVersion = -1;
  private readonly lightRight = new Vector3();
  private readonly lightUp = new Vector3();
  private readonly shallowAvg = new Color();

  constructor(regions: WaterRegionDef[], env: IEnvironment, ctx: WorldBuildContext) {
    this.env = env;
    this.regions = regions;
    this.profile = ctx.profile;
    this.maxAnisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    this.object.name = 'water';
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push({ x: 0, z: 0, age: 0, life: 1, strength: 0, active: false });

    const def = env.def;
    const built = buildWaterGeometry(regions, def);
    const waves = this.waveTexture();
    const waveScale = def.waveScale ?? 0.4;

    this.uniforms = {
      ...UniformsUtils.merge([UniformsLib.lights, UniformsLib.fog]),
      uTime: { value: 0 },
      uSwell: { value: 0.012 + 0.05 * waveScale },
      tWaves: { value: waves },
      tShore: { value: getWhiteTexture() as Texture },
      uShoreRect: { value: new Vector4(0, 0, 1, 1) },
      tSky: { value: null },
      uSkyLod: { value: 1.6 },
      uSkyZenith: { value: new Color() },
      uSkyHorizon: { value: new Color() },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunLight: { value: new Color() },
      uAmbient: { value: new Color() },
      uWaveStrength: { value: 0.04 + 0.56 * waveScale },
      uSunSpec: { value: 1 },
      uRipples: { value: this.rippleData },
      uRippleFoam: { value: this.rippleFoam },
      uRippleCount: { value: 0 },
      uShadowCenter: { value: new Vector3() },
      uLightRight: { value: new Vector3(1, 0, 0) },
      uLightUp: { value: new Vector3(0, 0, 1) },
      uShadowRange: { value: ctx.profile.shadowRange },
    };
    const defines: Record<string, number | string> = { WATER_DETAIL: ctx.profile.waterDetail, MAX_RIPPLES };
    if (built.blend) defines.WATER_BLEND = '';
    if (built.bottom) defines.WATER_BOTTOM = '';
    this.material = new ShaderMaterial({
      name: 'WshWater',
      uniforms: this.uniforms,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      defines,
      lights: true,
      fog: true,
      transparent: built.blend,
    });
    this.mesh = new Mesh(built.geometry, this.material);
    this.mesh.name = 'water.surface';
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = built.blend ? -5 : 0;
    this.object.add(this.mesh);

    this.wake = new Wake(waves, ctx.profile.waterDetail);
    this.wake.uniforms.uSwell.value = this.uniforms.uSwell.value;
    this.object.add(this.wake.mesh);

    // average shallow colour of the spot → tint of the aerated water in the wake
    this.shallowAvg.set(def.waterShallow);

    this.setFoamShapes([]);
    this.syncLighting();
  }

  update(dt: number, _time: number, _camera: Camera, wake: WakeSource | null): void {
    // Own clock driven by the (scaled) dt: slow motion slows the water, pause freezes it.
    this.clock += dt;
    this.uniforms.uTime.value = this.clock;
    this.syncLighting();
    this.syncShadowFade();

    let n = 0;
    for (const r of this.ripples) {
      if (!r.active) continue;
      r.age += dt;
      if (r.age >= r.life) {
        r.active = false;
        continue;
      }
      const k = r.age / r.life;
      const o = n * 4;
      this.rippleData[o] = r.x;
      this.rippleData[o + 1] = r.z;
      this.rippleData[o + 2] = 0.12 + 2.3 * Math.pow(r.age, 0.8);
      this.rippleData[o + 3] = r.strength * (1 - k) * (1 - k) * Math.min(1, r.age * 14) * 0.62;
      this.rippleFoam[n] = r.strength * Math.max(0, 1 - k / 0.5) * Math.min(1, r.age * 10) * 0.95;
      n++;
    }
    this.uniforms.uRippleCount.value = n;

    this.wake.update(this.clock, wake);
  }

  ripple(pos: Vector3, strength: number): void {
    let slot: Ripple | undefined;
    for (const r of this.ripples) {
      if (!r.active) {
        slot = r;
        break;
      }
    }
    if (!slot) {
      // pool exhausted: recycle the one closest to its end
      let best = -1;
      for (const r of this.ripples) {
        const k = r.age / r.life;
        if (k > best) {
          best = k;
          slot = r;
        }
      }
    }
    if (!slot) slot = this.ripples[this.rippleCursor++ % MAX_RIPPLES];
    const s = Math.min(1.5, Math.max(0.05, strength));
    slot.x = pos.x;
    slot.z = pos.z;
    slot.age = 0;
    slot.strength = s;
    slot.life = 1.5 + 1.5 * Math.min(1, s);
    slot.active = true;
  }

  setFoamShapes(shapes: FoamShape[]): void {
    const segments = regionShoreSegments(this.regions);
    shapeSegments(shapes, segments);
    const mask = buildShoreMask(regionsBounds(this.regions), segments);
    const tex = new DataTexture(mask.data, mask.width, mask.height, RedFormat, UnsignedByteType);
    tex.unpackAlignment = 1;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.name = 'water.shoreMask';
    tex.needsUpdate = true;
    this.shoreTex?.dispose();
    this.shoreTex = tex;
    this.uniforms.tShore.value = tex;
    (this.uniforms.uShoreRect.value as Vector4).set(mask.minX, mask.minZ, 1 / mask.sizeX, 1 / mask.sizeZ);
  }

  setProfile(profile: QualityProfile): void {
    const prev = this.profile;
    this.profile = profile;
    const waves = this.waveTexture();
    this.uniforms.tWaves.value = waves;
    if (prev.waterDetail !== profile.waterDetail) this.lightingVersion = -1; // re-evaluates the shader detail
    this.wake.setDetail(profile.waterDetail, waves);
    this.syncLighting();
  }

  dispose(): void {
    this.object.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.wake.dispose();
    this.shoreTex?.dispose();
    this.shoreTex = null;
  }

  // ───────────────────────────────────────────────────────────── internals ──

  private waveTexture(): Texture {
    const p = this.profile;
    return getWaveTexture(p.waterDetail === 0 ? 256 : 512, Math.max(1, Math.min(p.anisotropy, this.maxAnisotropy)));
  }

  /** Pull sun / sky colours from the environment whenever its bake changed. */
  private syncLighting(): void {
    const l = getLighting(this.env);
    if (l.version === this.lightingVersion) return;
    this.lightingVersion = l.version;
    const u = this.uniforms;
    const sunDir = this.env.sunDirection;
    (u.uSunDir.value as Vector3).copy(sunDir);
    (u.uSunLight.value as Color).copy(l.sunLight);
    (u.uAmbient.value as Color).copy(l.ambient);
    (u.uSkyZenith.value as Color).copy(l.zenith);
    (u.uSkyHorizon.value as Color).copy(l.horizon);
    u.uSunSpec.value = l.sunSpecular;
    u.tSky.value = l.skyCube;
    // no sky cube available (foreign / stub environment) → analytic sky, whatever the profile says
    const detail = l.skyCube ? this.profile.waterDetail : 0;
    if (this.material.defines.WATER_DETAIL !== detail) {
      this.material.defines.WATER_DETAIL = detail;
      this.material.needsUpdate = true;
    }

    // same basis as the shadow camera (see Environment)
    this.lightRight.set(0, 1, 0).cross(sunDir);
    if (this.lightRight.lengthSq() < 1e-6) this.lightRight.set(1, 0, 0);
    this.lightRight.normalize();
    this.lightUp.crossVectors(sunDir, this.lightRight).normalize();
    (u.uLightRight.value as Vector3).copy(this.lightRight);
    (u.uLightUp.value as Vector3).copy(this.lightUp);

    // wake colours: foam = white under sky + sun; aerated water = brightened shallow tint
    const sunUp = Math.max(0, sunDir.y);
    const w = this.wake.uniforms;
    const foamShade = (w.uFoamShade.value as Color).copy(l.ambient).multiplyScalar(1.2);
    (w.uFoamLit.value as Color).copy(l.sunLight).multiplyScalar(sunUp * 0.4).add(foamShade);
    const aerShade = (w.uAerShade.value as Color).copy(this.shallowAvg).lerp(_c.setRGB(1, 1, 1), 0.35).multiply(l.ambient).multiplyScalar(1.15);
    (w.uAerLit.value as Color)
      .copy(this.shallowAvg)
      .lerp(_c.setRGB(1, 1, 1), 0.35)
      .multiply(_c.copy(l.sunLight).multiplyScalar(sunUp * 0.36))
      .add(aerShade);
    (w.uCrest.value as Color).copy(l.horizon).lerp(l.zenith, 0.3).multiplyScalar(1.1).add(_c.copy(l.sunLight).multiplyScalar(0.06 * l.sunSpecular));
    (w.uLightRight.value as Vector3).copy(this.lightRight);
    (w.uLightUp.value as Vector3).copy(this.lightUp);
  }

  private syncShadowFade(): void {
    const sun = this.env.sun;
    const range = sun.shadow.camera.right;
    this.uniforms.uShadowRange.value = range;
    (this.uniforms.uShadowCenter.value as Vector3).copy(sun.target.position);
    const w = this.wake.uniforms;
    w.uShadowRange.value = range;
    (w.uShadowCenter.value as Vector3).copy(sun.target.position);
  }
}

export function createWater(regions: WaterRegionDef[], env: IEnvironment, ctx: WorldBuildContext): IWater {
  return new Water(regions, env, ctx);
}
