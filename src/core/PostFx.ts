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
  varying vec2 vUv;

  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c) * 2.0; // 0 centre … 1 corner
    float fx = max(uSlowMo, uHero * 0.6);

    vec3 col;
    if (fx > 0.004) {
      // Faint chromatic fringe that only lives near the edges of the frame.
      vec2 d = c * (0.012 * fx * r2 * r2);
      col.r = texture2D(tDiffuse, vUv + d).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - d).b;
    } else {
      col = texture2D(tDiffuse, vUv).rgb;
    }

    col = ACESFilmicToneMapping(max(col, vec3(0.0)));

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

    vec4 outc = sRGBTransferOETF(vec4(clamp(col, 0.0, 1.0), 1.0));
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
        uVignette: { value: 0.2 },
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

/** UnrealBloomPass whose mip chain starts at a fraction of the frame size. */
class ScaledBloomPass extends UnrealBloomPass {
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
    bloomPass = new ScaledBloomPass(new Vector2(256, 256), 0.3, BLOOM_RADIUS, BLOOM_THRESHOLD);
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
      fxaa.render(renderer, out, chain.composer.readBuffer);
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
