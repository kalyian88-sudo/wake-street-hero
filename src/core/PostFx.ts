/**
 * Post-processing chain (one EffectComposer, HalfFloat buffers):
 *
 *   RenderPass → UnrealBloomPass (reduced resolution, high threshold) → GradePass → FXAA | SMAA
 *
 * GradePass is the single custom "final" shader. It also does what three's OutputPass does (ACES tone
 * mapping + sRGB encode, same shader chunks) so the anti-aliasing pass that follows works on display
 * values — FXAA/SMAA are designed for that — and mobile pays for one full-screen pass less.
 */
import {
  ACESFilmicToneMapping,
  HalfFloatType,
  NoBlending,
  RawShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { QualityProfile } from '../types';

/** Per-frame look parameters. */
export interface FxParams {
  /** 0..1 trick slow-motion amount. */
  slowMo: number;
  /** 0..1 HERO mode amount. */
  hero: number;
  /** Bloom strength of the spot (EnvDef.bloom, 0..1.5). */
  bloom: number;
  /** Seconds (real) for the animated grain / hero pulse. */
  time: number;
  /** 0..1 water drops on the lens (splashes near the camera), fades by itself. */
  drops?: number;
  /** 0..1 rider speed feel (edge speed blur). */
  speed?: number;
}

/**
 * Bloom threshold in DISPLAY units (after exposure): only things brighter than "paper white" glow —
 * neon tubes, sun glints on water, sparks. Converted to scene-linear with the current exposure.
 */
const BLOOM_THRESHOLD = 1.05;
const BLOOM_RADIUS = 0.55;
/** Extra downscale of the bloom chain relative to the frame (UnrealBloomPass halves once more itself). */
const BLOOM_SCALE = 0.5;

const GRADE_VERT = /* glsl */ `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const GRADE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform float uSlowMo;
  uniform float uHero;
  uniform float uTime;
  uniform float uVignette;
  uniform float uDrops;
  uniform float uSpeed;
  uniform float uSeed;
  varying vec2 vUv;

  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Water drops on the lens: a sparse grid of round drops, each refracts (shifts) what is behind it.
  vec2 dropOffset(vec2 uv, float amount) {
    vec2 g = uv * vec2(9.0, 16.0);
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash12(cell + uSeed);
    if (h > 0.34) return vec2(0.0);
    vec2 jitter = (vec2(hash12(cell + 7.1 + uSeed), hash12(cell + 3.7 + uSeed)) - 0.5) * 0.5;
    vec2 d = f - jitter;
    float r = 0.18 + 0.22 * hash12(cell + 11.3);
    float k = 1.0 - smoothstep(r * 0.55, r, length(d));
    return -d * k * 0.06 * amount;
  }

  void main() {
    // Action-cam lens: a little barrel distortion, strongest in the corners.
    vec2 c0 = vUv - 0.5;
    float rr = dot(c0, c0);
    vec2 uv = 0.5 + c0 * (1.0 - 0.06 * rr) / (1.0 - 0.06 * 0.5);
    if (uDrops > 0.01) uv += dropOffset(vUv, uDrops);
    vec2 c = uv - 0.5;
    float r2 = dot(c, c) * 2.0; // 0 centre … 1 corner
    float fx = max(uSlowMo, uHero * 0.6);

    // Chromatic fringe at the edges: always a hint (real lenses), stronger in slow motion.
    vec2 d = c * ((0.0028 + 0.012 * fx) * r2 * r2 + 0.004 * uDrops);
    vec3 col;
    col.r = texture2D(tDiffuse, uv + d).r;
    col.g = texture2D(tDiffuse, uv).g;
    col.b = texture2D(tDiffuse, uv - d).b;
    // Speed: a short radial smear towards the edges.
    if (uSpeed > 0.02) {
      vec2 dir = c * 0.022 * uSpeed * smoothstep(0.15, 1.0, r2);
      col += texture2D(tDiffuse, uv - dir).rgb + texture2D(tDiffuse, uv - dir * 2.0).rgb;
      col /= 3.0;
    }

    col = ACESFilmicToneMapping(max(col, vec3(0.0)));

    // "Edited footage" grade: teal shadows, warm highlights, a bit more punch, soft lifted blacks.
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(lum), col, 1.1);
    vec3 shadowTint = vec3(-0.012, 0.006, 0.02);
    vec3 highTint = vec3(0.03, 0.012, -0.022);
    col += shadowTint * (1.0 - smoothstep(0.0, 0.45, lum)) + highTint * smoothstep(0.45, 1.0, lum);
    col = max(vec3(0.0), (col - 0.18) * 1.06 + 0.18);
    col = col * 0.97 + 0.018;

    // Slow-motion grade: a touch less colour, a touch more contrast (display-linear, pivot = mid grey).
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(luma), 0.2 * uSlowMo);
    col = max(vec3(0.0), (col - 0.18) * (1.0 + 0.14 * uSlowMo + 0.08 * uHero) + 0.18);

    // HERO: warm the picture and let WHY NOT red creep in from the edges, breathing slowly.
    float pulse = 0.85 + 0.15 * sin(uTime * 5.0);
    col *= mix(vec3(1.0), vec3(1.07, 0.98, 0.9), uHero);
    col += vec3(0.89, 0.024, 0.075) * (uHero * pulse * 0.2 * smoothstep(0.3, 1.0, r2));

    // Cinematic vignette: always mild, deeper while time is slowed.
    float vig = uVignette + 0.26 * uSlowMo + 0.12 * uHero;
    col *= 1.0 - vig * smoothstep(0.12, 1.05, r2);

    // Drops catch the light: a faint bright rim on the wet lens.
    if (uDrops > 0.01) col += vec3(length(dropOffset(vUv, uDrops)) * 2.2);
    vec4 outc = sRGBTransferOETF(vec4(clamp(col, 0.0, 1.0), 1.0));
    // Film grain (luma), finer than a pixel block, stronger in the dark.
    float grain = hash12(gl_FragCoord.xy * 0.73 + fract(uTime * 7.3) * 113.0) - 0.5;
    outc.rgb += grain * (0.028 * (1.0 - 0.6 * dot(outc.rgb, vec3(0.333))));
    // ±½ LSB of noise hides banding in sky gradients on 8-bit phone panels.
    outc.rgb += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
    gl_FragColor = outc;
  }
`;

/** Tone mapping + sRGB + vignette + slow-mo / HERO grade in one full-screen draw. */
class GradePass extends Pass {
  readonly material: RawShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor() {
    super();
    this.material = new RawShaderMaterial({
      name: 'WSHGrade',
      uniforms: {
        tDiffuse: { value: null },
        toneMappingExposure: { value: 1 },
        uSlowMo: { value: 0 },
        uHero: { value: 0 },
        uTime: { value: 0 },
        uVignette: { value: 0.24 },
        uDrops: { value: 0 },
        uSpeed: { value: 0 },
        uSeed: { value: 0 },
      },
      vertexShader: GRADE_VERT,
      fragmentShader: GRADE_FRAG,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  set(p: FxParams): void {
    const u = this.material.uniforms;
    u.uSlowMo.value = p.slowMo;
    u.uHero.value = p.hero;
    u.uTime.value = p.time % 1000;
    const drops = p.drops ?? 0;
    // a new drop pattern for each splash
    if (drops > u.uDrops.value + 0.2) u.uSeed.value = Math.floor(Math.random() * 97);
    u.uDrops.value = drops;
    u.uSpeed.value = p.speed ?? 0;
  }

  override render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.toneMappingExposure.value = renderer.toneMappingExposure;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}

/**
 * UnrealBloomPass whose mip chain starts at a fraction of the frame size. The bright-pass is patched
 * with a soft knee and a ceiling: a HalfFloat sun disc can reach Inf, which the blur would smear
 * into black squares.
 */
class ScaledBloomPass extends UnrealBloomPass {
  constructor(strength: number, radius: number, threshold: number) {
    super(new Vector2(256, 256), strength, radius, threshold);
    const mat = this.materialHighPassFilter;
    mat.fragmentShader = mat.fragmentShader.replace(
      'vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = min( texture2D( tDiffuse, vUv ), vec4( 32.0 ) );',
    );
    mat.uniforms.smoothWidth.value = 0.35;
    mat.needsUpdate = true;
  }

  override setSize(width: number, height: number): void {
    super.setSize(Math.max(2, Math.round(width * BLOOM_SCALE)), Math.max(2, Math.round(height * BLOOM_SCALE)));
  }
}

interface Chain {
  composer: EffectComposer;
  render: RenderPass;
  bloom: ScaledBloomPass | null;
  grade: GradePass;
  aa: FXAAPass | SMAAPass | null;
}

function buildChain(renderer: WebGLRenderer, target: WebGLRenderTarget | undefined, bloom: boolean, aa: QualityProfile['aa'], scene: Scene, camera: Camera): Chain {
  const composer = new EffectComposer(renderer, target);
  if (target) composer.setPixelRatio(1);
  const render = new RenderPass(scene, camera);
  composer.addPass(render);
  let bloomPass: ScaledBloomPass | null = null;
  if (bloom) {
    bloomPass = new ScaledBloomPass(0.3, BLOOM_RADIUS, BLOOM_THRESHOLD);
    composer.addPass(bloomPass);
  }
  const grade = new GradePass();
  composer.addPass(grade);
  let aaPass: FXAAPass | SMAAPass | null = null;
  if (aa === 'fxaa') aaPass = new FXAAPass();
  else if (aa === 'smaa') aaPass = new SMAAPass();
  if (aaPass) composer.addPass(aaPass);
  return { composer, render, bloom: bloomPass, grade, aa: aaPass };
}

function disposeChain(c: Chain): void {
  c.bloom?.dispose();
  c.grade.dispose();
  c.aa?.dispose();
  c.composer.dispose();
}

function driveChain(c: Chain, renderer: WebGLRenderer, scene: Scene, camera: Camera, p: FxParams): void {
  c.render.scene = scene;
  c.render.camera = camera;
  if (c.bloom) {
    const strength = Math.max(0, p.bloom) * (1 + 0.35 * p.hero);
    c.bloom.enabled = strength > 0.01;
    c.bloom.strength = strength;
    c.bloom.threshold = BLOOM_THRESHOLD / Math.max(0.05, renderer.toneMappingExposure);
  }
  c.grade.set(p);
}

export class PostFx {
  private chain: Chain | null = null;
  private profile: QualityProfile | null = null;
  private width = 1;
  private height = 1;
  private dpr = 1;

  constructor(private readonly renderer: WebGLRenderer) {}

  get active(): boolean {
    return this.chain !== null;
  }

  /** (Re)build or tear down the chain for a quality profile. Cheap when nothing relevant changed. */
  setProfile(profile: QualityProfile, scene: Scene, camera: Camera): void {
    const prev = this.profile;
    this.profile = profile;
    if (!profile.post) {
      if (this.chain) disposeChain(this.chain);
      this.chain = null;
      return;
    }
    if (this.chain && prev && prev.post && prev.bloom === profile.bloom && prev.aa === profile.aa) return;
    if (this.chain) disposeChain(this.chain);
    this.chain = buildChain(this.renderer, undefined, profile.bloom, profile.aa, scene, camera);
    this.chain.composer.setPixelRatio(this.dpr);
    this.chain.composer.setSize(this.width, this.height);
  }

  /** CSS size + pixel ratio of the canvas. */
  setSize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    if (this.chain) {
      this.chain.composer.setPixelRatio(dpr);
      this.chain.composer.setSize(width, height);
    }
  }

  /** Render through the chain to the canvas. Returns false when post is off (caller renders directly). */
  render(scene: Scene, camera: Camera, p: FxParams, realDt: number): boolean {
    const c = this.chain;
    if (!c) return false;
    driveChain(c, this.renderer, scene, camera, p);
    c.composer.render(realDt);
    return true;
  }

  /**
   * One-off render of the full look (bloom, grade, FXAA) into an RGBA8 target of w×h and read it back.
   * Rows come out bottom-up (GL convention). Independent of the canvas size and of the live chain.
   */
  renderToPixels(scene: Scene, camera: Camera, w: number, h: number, p: FxParams): Uint8Array {
    const renderer = this.renderer;
    const hdr = new WebGLRenderTarget(w, h, { type: HalfFloatType, depthBuffer: true });
    const out = new WebGLRenderTarget(w, h, { type: UnsignedByteType, depthBuffer: false });
    const chain = buildChain(renderer, hdr, true, 'fxaa', scene, camera);
    const fxaa = chain.aa as FXAAPass;
    const pixels = new Uint8Array(w * h * 4);
    const prevTarget = renderer.getRenderTarget();
    try {
      // The composer runs everything up to the grade; FXAA then resolves straight into the 8-bit target.
      chain.composer.renderToScreen = false;
      chain.composer.removePass(fxaa);
      driveChain(chain, renderer, scene, camera, p);
      chain.composer.render(0);
      fxaa.setSize(w, h);
      fxaa.renderToScreen = false;
      fxaa.render(renderer, out, chain.composer.readBuffer, 0, false);
      renderer.readRenderTargetPixels(out, 0, 0, w, h, pixels);
    } finally {
      renderer.setRenderTarget(prevTarget);
      disposeChain(chain);
      out.dispose();
    }
    return pixels;
  }

  dispose(): void {
    if (this.chain) disposeChain(this.chain);
    this.chain = null;
  }
}

/** Renderer settings every path (direct or composer) relies on. */
export function configureOutput(renderer: WebGLRenderer): void {
  renderer.toneMapping = ACESFilmicToneMapping;
}
