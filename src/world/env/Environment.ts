/**
 * Environment: procedural sky, image based lighting baked from it, sun with a rider-following
 * texel-snapped shadow frustum, hemisphere fill and fog.
 */
import type { Lensflare } from 'three/examples/jsm/objects/Lensflare.js';
import { createSunFlare } from './lensflare';
import {
  Color,
  CubeCamera,
  DataUtils,
  DirectionalLight,
  Fog,
  Group,
  HalfFloatType,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  PMREMGenerator,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderTarget,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { DEG } from '../../data/geometry';
import type { EnvDef, IEnvironment, QualityProfile, WorldBuildContext } from '../../types';
import { createLighting, updateAmbient, type EnvLighting } from './internal';
import { createSkyDome, type SkyDome } from './sky';

/** Distance of the sun light from the shadow focus (m) — far enough for long evening shadows of tall facades. */
const SUN_DISTANCE = 140;
/** IBL gain on top of EnvDef.ambientIntensity (the hemisphere light adds the rest of the fill). */
const IBL_GAIN = 1.0;
const HEMI_GAIN = 0.25;

const _v = new Vector3();
const _fwd = new Vector3();

function cubeSize(profile: QualityProfile): number {
  return profile.level === 'low' ? 128 : 256;
}

class Environment implements IEnvironment {
  readonly object = new Group();
  readonly sun: DirectionalLight;
  readonly sunDirection = new Vector3();
  readonly def: EnvDef;
  readonly lighting: EnvLighting;

  private readonly renderer: WebGLRenderer;
  private profile: QualityProfile;
  private readonly dome: SkyDome;
  private readonly hemi: HemisphereLight;
  private readonly fog: Fog;
  private readonly background: Color;
  private cubeRT: WebGLCubeRenderTarget | null = null;
  private pmremRT: WebGLRenderTarget | null = null;
  private bakedSize = 0;
  private scene: Scene | null = null;
  private time = 0;
  /** Shadow camera basis (constant: the sun does not move). */
  private readonly lightRight = new Vector3();
  private readonly lightUp = new Vector3();
  private disposed = false;

  private readonly flare: Lensflare | null;

  constructor(def: EnvDef, ctx: WorldBuildContext) {
    this.def = def;
    this.renderer = ctx.renderer;
    this.profile = ctx.profile;
    this.object.name = 'env';

    const el = def.sunElevation * DEG;
    const az = def.sunAzimuth * DEG;
    this.sunDirection.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    // same basis three's LightShadow builds with lookAt (up = +Y)
    this.lightRight.set(0, 1, 0).cross(this.sunDirection);
    if (this.lightRight.lengthSq() < 1e-6) this.lightRight.set(1, 0, 0);
    this.lightRight.normalize();
    this.lightUp.crossVectors(this.sunDirection, this.lightRight).normalize();

    this.lighting = createLighting(def);

    this.dome = createSkyDome(def, this.sunDirection);
    this.object.add(this.dome.mesh);

    this.sun = new DirectionalLight(def.sunColor, def.sunIntensity);
    this.sun.name = 'env.sun';
    this.sun.position.copy(this.sunDirection).multiplyScalar(SUN_DISTANCE);
    this.object.add(this.sun, this.sun.target);
    this.flare = createSunFlare(def);
    if (this.flare) {
      this.flare.visible = ctx.profile.post;
      this.object.add(this.flare);
    }

    this.hemi = new HemisphereLight(0xffffff, 0x444444, 1);
    this.hemi.name = 'env.hemi';
    this.object.add(this.hemi);

    this.background = new Color(def.fogColor);
    this.fog = new Fog(def.fogColor, def.fogNear, def.fogFar);

    this.applyShadowProfile();
    this.applyFogProfile();
    this.bake();
  }

  get envMap(): Texture | null {
    return this.pmremRT ? this.pmremRT.texture : null;
  }

  attach(scene: Scene, renderer: WebGLRenderer): void {
    this.scene = scene;
    scene.background = this.background;
    scene.fog = this.fog;
    scene.environment = this.envMap;
    scene.environmentIntensity = this.def.ambientIntensity * IBL_GAIN;
    renderer.toneMappingExposure = this.def.exposure;
  }

  update(dt: number, focus: Vector3, camera: Camera): void {
    this.time += dt;
    this.dome.setTime(this.time);
    // The dome rides with the camera so the horizon always sits at eye level.
    camera.getWorldPosition(this.dome.mesh.position);
    // the flare source sits far out along the sun direction, riding with the camera like the sky
    if (this.flare) this.flare.position.copy(this.dome.mesh.position).addScaledVector(this.sunDirection, 800);

    if (!this.sun.castShadow) return;
    // Centre the frustum a little ahead of the focus along the view direction: more of what the
    // camera actually sees gets shadows, the rider stays well inside.
    const range = this.profile.shadowRange;
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    const len = _fwd.length();
    _v.copy(focus);
    if (len > 1e-3) _v.addScaledVector(_fwd, (range * 0.4) / len);
    // Snap to shadow-map texels in light space → no crawling edges while the rider moves.
    const texel = (range * 2) / this.sun.shadow.mapSize.x;
    const x = Math.round(_v.dot(this.lightRight) / texel) * texel;
    const y = Math.round(_v.dot(this.lightUp) / texel) * texel;
    const z = _v.dot(this.sunDirection);
    const t = this.sun.target.position;
    t.set(0, 0, 0).addScaledVector(this.lightRight, x).addScaledVector(this.lightUp, y).addScaledVector(this.sunDirection, z);
    this.sun.position.copy(t).addScaledVector(this.sunDirection, SUN_DISTANCE);
  }

  setProfile(profile: QualityProfile): void {
    if (this.flare) this.flare.visible = profile.post;
    const prev = this.profile;
    this.profile = profile;
    if (prev.shadows !== profile.shadows || prev.shadowMapSize !== profile.shadowMapSize || prev.shadowRange !== profile.shadowRange) {
      this.applyShadowProfile();
    }
    this.applyFogProfile();
    if (cubeSize(profile) !== this.bakedSize) {
      this.bake();
      if (this.scene) this.scene.environment = this.envMap;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const scene = this.scene;
    if (scene) {
      if (scene.fog === this.fog) scene.fog = null;
      if (scene.background === this.background) scene.background = null;
      if (this.pmremRT && scene.environment === this.pmremRT.texture) scene.environment = null;
    }
    this.object.removeFromParent();
    this.dome.dispose();
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.sun.dispose();
    this.hemi.dispose();
    this.cubeRT?.dispose();
    this.pmremRT?.dispose();
    this.cubeRT = null;
    this.pmremRT = null;
    this.lighting.skyCube = null;
    this.lighting.version++;
  }

  // ───────────────────────────────────────────────────────────── internals ──

  private applyFogProfile(): void {
    const far = Math.min(this.def.fogFar, this.profile.drawDistance * 0.98);
    this.fog.far = far;
    this.fog.near = Math.min(this.def.fogNear, far * 0.6);
  }

  private applyShadowProfile(): void {
    const p = this.profile;
    const sun = this.sun;
    const shadow = sun.shadow;
    sun.castShadow = p.shadows;
    if (shadow.mapSize.x !== p.shadowMapSize) {
      shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      shadow.map?.dispose();
      shadow.map = null;
    }
    if (!p.shadows) {
      shadow.map?.dispose();
      shadow.map = null;
    }
    const cam = shadow.camera;
    cam.left = -p.shadowRange;
    cam.right = p.shadowRange;
    cam.top = p.shadowRange;
    cam.bottom = -p.shadowRange;
    cam.near = 1;
    cam.far = SUN_DISTANCE + 70;
    cam.updateProjectionMatrix();
    const texel = (p.shadowRange * 2) / p.shadowMapSize;
    // Depth bias in normalised units of the (near..far) range + a normal offset of about a texel:
    // enough to kill acne on lit slopes without detaching contact shadows.
    shadow.bias = -0.00012;
    shadow.normalBias = texel * 1.25;
    shadow.radius = 1.6;
    const tod = this.def.timeOfDay;
    shadow.intensity = tod === 'overcast' ? 0.42 : tod === 'night' ? 0.7 : 1;
  }

  /** Render the sky once into a cube map → water reflections + PMREM for scene.environment. */
  private bake(): void {
    const r = this.renderer;
    const size = cubeSize(this.profile);
    const dome = this.dome;
    const mesh = dome.mesh;
    const parent = mesh.parent;

    const bakeScene = new Scene();
    bakeScene.fog = new Fog(this.def.fogColor, 1, 2);
    bakeScene.add(mesh);
    mesh.position.set(0, 0, 0);
    mesh.updateMatrixWorld(true);

    const autoClear = r.autoClear;
    r.autoClear = true;

    const oldCube = this.cubeRT;
    const oldPmrem = this.pmremRT;
    const cubeRT = new WebGLCubeRenderTarget(size, {
      type: HalfFloatType,
      format: RGBAFormat,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    });
    cubeRT.texture.name = 'env.skyCube';
    dome.setTime(this.time);
    dome.setBake(true);
    const cubeCam = new CubeCamera(0.1, 10, cubeRT);
    cubeCam.update(r, bakeScene);

    const pmrem = new PMREMGenerator(r);
    this.pmremRT = pmrem.fromCubemap(cubeRT.texture);
    this.pmremRT.texture.name = 'env.pmrem';
    pmrem.dispose();

    // Sky colour probes (live look, no disc): zenith + four azimuths just above the horizon.
    dome.setBake(false);
    dome.setDisc(false);
    this.probe(bakeScene);
    dome.setDisc(true);

    r.autoClear = autoClear;
    bakeScene.remove(mesh);
    if (parent) parent.add(mesh);
    else this.object.add(mesh);

    oldCube?.dispose();
    oldPmrem?.dispose();
    this.cubeRT = cubeRT;
    this.bakedSize = size;

    const l = this.lighting;
    l.skyCube = cubeRT.texture;
    updateAmbient(l, this.def);
    l.version++;

    // Hemisphere fill in the same radiometric units as the IBL (irradiance = π × radiance).
    const k = Math.PI * HEMI_GAIN * this.def.ambientIntensity;
    this.hemi.color.copy(l.zenith).lerp(l.horizon, 0.5).multiplyScalar(k);
    this.hemi.groundColor.copy(l.sunLight).multiplyScalar(0.05 * Math.max(0.1, this.sunDirection.y)).add(_c.copy(l.horizon).multiplyScalar(0.18)).multiplyScalar(k);
    this.hemi.intensity = 1;
  }

  private probe(bakeScene: Scene): void {
    const r = this.renderer;
    if (!r.capabilities.textureTypeReadable(HalfFloatType)) return;
    const rt = new WebGLRenderTarget(4, 4, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false });
    const cam = new PerspectiveCamera(12, 1, 0.1, 10);
    const buf = new Uint16Array(4 * 16);
    const prevRT = r.getRenderTarget();
    const read = (dir: Vector3, out: Color): boolean => {
      cam.up.set(0, Math.abs(dir.y) > 0.99 ? 0 : 1, Math.abs(dir.y) > 0.99 ? 1 : 0);
      cam.lookAt(dir);
      cam.updateMatrixWorld(true);
      r.setRenderTarget(rt);
      r.render(bakeScene, cam);
      r.readRenderTargetPixels(rt, 0, 0, 4, 4, buf);
      let cr = 0;
      let cg = 0;
      let cb = 0;
      for (let i = 0; i < 16; i++) {
        cr += DataUtils.fromHalfFloat(buf[i * 4]);
        cg += DataUtils.fromHalfFloat(buf[i * 4 + 1]);
        cb += DataUtils.fromHalfFloat(buf[i * 4 + 2]);
      }
      if (!Number.isFinite(cr + cg + cb) || cr + cg + cb <= 0) return false;
      out.setRGB(cr / 16, cg / 16, cb / 16);
      return true;
    };
    const zen = new Color(0, 0, 0);
    const hor = new Color(0, 0, 0);
    const sample = new Color(0, 0, 0);
    let ok = read(_v.set(0, 1, 0), zen);
    let n = 0;
    const sunAz = Math.atan2(this.sunDirection.x, this.sunDirection.z);
    for (let i = 0; i < 4 && ok; i++) {
      const a = sunAz + Math.PI * (0.25 + 0.5 * i);
      const e = 9 * DEG;
      ok = read(_v.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)), sample);
      if (ok) {
        hor.add(sample);
        n++;
      }
    }
    r.setRenderTarget(prevRT);
    rt.dispose();
    if (ok && n === 4) {
      this.lighting.zenith.copy(zen);
      this.lighting.horizon.copy(hor.multiplyScalar(0.25));
    }
  }
}

const _c = new Color();

export function createEnvironment(def: EnvDef, ctx: WorldBuildContext): IEnvironment {
  return new Environment(def, ctx);
}
