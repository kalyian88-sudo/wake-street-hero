/**
 * Engine: owns the WebGLRenderer, canvas sizing, context loss handling, the post chain and frame stats.
 * Knows nothing about gameplay — the Game hands it a scene + camera every frame.
 */
import {
  ACESFilmicToneMapping,
  Color,
  PCFShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
  type Camera,
} from 'three';
import type { FrameStats, QualityProfile } from '../types';
import { PostFx, type FxParams } from './PostFx';

/** Upper bound for the drawing buffer (pixels) per level — protects 4K desktops and tablets. */
const PIXEL_BUDGET: Record<QualityProfile['level'], number> = { low: 1.4e6, medium: 2.4e6, high: 4.2e6 };
/** Pixel budget of the one-off share image render. */
const STILL_BUDGET: Record<QualityProfile['level'], number> = { low: 1.3e6, medium: 2.2e6, high: 2.6e6 };

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly post: PostFx;
  readonly stats: FrameStats;
  profile: QualityProfile;
  /** CSS pixels. */
  width = 1;
  height = 1;
  dpr = 1;
  contextLost = false;
  /** Fired after the drawing buffer size changed. */
  onResize: ((width: number, height: number) => void) | null = null;
  onContextLost: (() => void) | null = null;
  onContextRestored: (() => void) | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly clearColor = new Color();
  private readonly idleScene = new Scene();
  private readonly idleCamera = new PerspectiveCamera();
  private readonly vignette: HTMLDivElement;
  private vignetteShown = -1;
  private sizeDirty = true;
  private sizePoll = 0;
  private frameStart = 0;
  private fpsDt = 1 / 60;
  private cpuMs = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly markDirty = (): void => {
    this.sizeDirty = true;
  };
  private readonly handleLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.onContextLost?.();
  };
  private readonly handleRestored = (): void => {
    this.contextLost = false;
    this.applyRendererProfile();
    this.sizeDirty = true;
    this.onContextRestored?.();
  };

  constructor(canvas: HTMLCanvasElement, profile: QualityProfile) {
    this.canvas = canvas;
    this.profile = profile;
    // MSAA on the default framebuffer only helps when we draw the scene straight into it.
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: !profile.post,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    const r = this.renderer;
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.info.autoReset = false;
    r.setClearColor(0x101114, 1);
    this.post = new PostFx(r);
    this.stats = { fps: 60, frameMs: 0, drawCalls: 0, triangles: 0, quality: profile.level, dpr: 1 };

    // Cheap slow-motion vignette for the no-post path (compositor-only opacity changes).
    this.vignette = document.createElement('div');
    this.vignette.style.cssText =
      'position:absolute;inset:0;pointer-events:none;opacity:0;will-change:opacity;display:none;' +
      'background:radial-gradient(ellipse at center,rgba(0,0,0,0) 42%,rgba(0,0,0,0.6) 100%)';
    canvas.insertAdjacentElement('afterend', this.vignette);

    canvas.addEventListener('webglcontextlost', this.handleLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleRestored, false);
    window.addEventListener('resize', this.markDirty);
    window.addEventListener('orientationchange', this.markDirty);
    window.visualViewport?.addEventListener('resize', this.markDirty);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.markDirty);
      this.resizeObserver.observe(canvas);
    }

    this.applyRendererProfile();
    this.post.setProfile(profile, this.idleScene, this.idleCamera);
    this.vignette.style.display = profile.post ? 'none' : 'block';
    this.syncSize();
  }

  get maxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  private applyRendererProfile(): void {
    const r = this.renderer;
    r.shadowMap.enabled = this.profile.shadows;
    // r187: PCFShadowMap is the soft-filtered variant (PCFSoftShadowMap was folded into it).
    r.shadowMap.type = PCFShadowMap;
  }

  /** Switch quality at runtime: DPR cap, shadows, composer on/off, bloom, AA. */
  applyProfile(profile: QualityProfile): void {
    this.profile = profile;
    this.stats.quality = profile.level;
    this.applyRendererProfile();
    this.post.setProfile(profile, this.idleScene, this.idleCamera);
    this.sizeDirty = true;
    this.syncSize();
    this.vignette.style.display = profile.post ? 'none' : 'block';
    this.vignetteShown = -1;
  }

  /** Re-read the canvas CSS size and resize the drawing buffer + composer when needed. */
  private syncSize(): void {
    this.sizeDirty = false;
    let w = this.canvas.clientWidth;
    let h = this.canvas.clientHeight;
    if (!w || !h) {
      w = window.innerWidth;
      h = window.innerHeight;
    }
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    const maxSide = Math.min(this.renderer.capabilities.maxTextureSize, 8192);
    let dpr = Math.min(window.devicePixelRatio || 1, this.profile.dprCap);
    dpr = Math.min(dpr, Math.sqrt(PIXEL_BUDGET[this.profile.level] / (w * h)), maxSide / Math.max(w, h));
    dpr = Math.max(0.5, Math.round(dpr * 100) / 100);
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.stats.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    this.onResize?.(w, h);
  }

  get aspect(): number {
    return this.width / this.height;
  }

  /** Start of a frame: pending resize, reset draw-call counters. */
  beginFrame(realDt: number): void {
    this.frameStart = performance.now();
    // Belt and braces: some mobile browsers skip resize events on rotation / URL-bar changes.
    this.sizePoll += realDt;
    if (this.sizePoll > 0.5) {
      this.sizePoll = 0;
      if (this.canvas.clientWidth !== this.width || this.canvas.clientHeight !== this.height) this.sizeDirty = true;
    }
    if (this.sizeDirty) this.syncSize();
    this.renderer.info.reset();
  }

  /** Render a scene to the canvas through the post chain (or directly when the profile has no post). */
  render(scene: Scene, camera: Camera, fx: FxParams, realDt: number): void {
    if (this.contextLost) return;
    if (!this.post.render(scene, camera, fx, realDt)) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      const v = Math.round(Math.max(fx.slowMo, fx.hero * 0.5) * 50) / 50;
      if (v !== this.vignetteShown) {
        this.vignetteShown = v;
        this.vignette.style.opacity = String(v);
      }
    }
  }

  /** No scene to show (menu without a 3D backdrop): plain dark frame. */
  clear(color: number): void {
    if (this.contextLost) return;
    this.clearColor.set(color);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(this.clearColor, 1);
    this.renderer.clear(true, true, false);
    if (this.vignetteShown !== 0) {
      this.vignetteShown = 0;
      this.vignette.style.opacity = '0';
    }
  }

  /** End of a frame: update FrameStats. `rawDt` = unclamped seconds since the previous frame. */
  endFrame(rawDt: number): number {
    const info = this.renderer.info.render;
    const cpu = performance.now() - this.frameStart;
    this.cpuMs += (cpu - this.cpuMs) * 0.1;
    if (rawDt > 0 && rawDt < 1) this.fpsDt += (rawDt - this.fpsDt) * 0.08;
    const s = this.stats;
    s.fps = 1 / this.fpsDt;
    s.frameMs = this.cpuMs;
    s.drawCalls = info.calls;
    s.triangles = info.triangles;
    return cpu;
  }

  /**
   * Render one frame with the full look into a 2D canvas of exactly w×h (share card background).
   * Uses an offscreen target — the live canvas, its size and the composer are untouched. When the GPU
   * cannot afford w×h it renders smaller and upscales.
   */
  renderStill(scene: Scene, camera: PerspectiveCamera, w: number, h: number, fx: FxParams): HTMLCanvasElement | null {
    if (this.contextLost || w < 2 || h < 2) return null;
    const maxSide = Math.min(this.renderer.capabilities.maxTextureSize, 4096);
    const scale = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(STILL_BUDGET[this.profile.level] / (w * h)));
    const iw = Math.max(2, Math.round(w * scale));
    const ih = Math.max(2, Math.round(h * scale));
    let pixels: Uint8Array;
    try {
      pixels = this.post.renderToPixels(scene, camera, iw, ih, fx);
    } catch (err) {
      console.warn('[engine] still render failed', err);
      return null;
    }
    const raw = document.createElement('canvas');
    raw.width = iw;
    raw.height = ih;
    const ctx = raw.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(iw, ih);
    const row = iw * 4;
    // GL rows are bottom-up; force opaque alpha while flipping.
    for (let y = 0; y < ih; y++) {
      const src = (ih - 1 - y) * row;
      img.data.set(pixels.subarray(src, src + row), y * row);
    }
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    ctx.putImageData(img, 0, 0);
    if (iw === w && ih === h) return raw;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d');
    if (!octx) return raw;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(raw, 0, 0, w, h);
    return out;
  }

  /** NDC (−1..1) of a client-space point on the canvas. */
  clientToNdc(clientX: number, clientY: number, out: { x: number; y: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    out.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    out.y = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    return out;
  }

  /** Client-space CSS px of an NDC point. */
  ndcToClient(ndcX: number, ndcY: number, out: { x: number; y: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    out.x = rect.left + (ndcX * 0.5 + 0.5) * rect.width;
    out.y = rect.top + (-ndcY * 0.5 + 0.5) * rect.height;
    return out;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored, false);
    window.removeEventListener('resize', this.markDirty);
    window.removeEventListener('orientationchange', this.markDirty);
    window.visualViewport?.removeEventListener('resize', this.markDirty);
    this.resizeObserver?.disconnect();
    this.vignette.remove();
    this.post.dispose();
    this.renderer.dispose();
  }
}
