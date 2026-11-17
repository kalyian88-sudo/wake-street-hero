/**
 * MATERIAL LIBRARY — cached PBR materials with generated, tileable, world-scale textures.
 * Prop builders reach it through `ctx.mat(key, opts)`.
 *
 * All textured materials are VERTEX-COLOURED: geometry must carry a `color` attribute (GB always does;
 * the batchers add white where it is missing). Tint through vertex colours whenever you can — one
 * shared material = one draw call. `opts.color` creates a separate (cached) material instance.
 *
 * KEYS (UVs are in metres; tile size in brackets)
 *   Mineral   concrete [3] · wetConcrete [3] (dark, glossy puddles) · stone [2.4] (quay pavers) ·
 *             granite [2] · marble [2] · brick [1.92] · plaster [4] (near white → tint it) ·
 *             asphalt [4] · sand [3] · tile [1.2] (glossy, tintable) · patternTile [0.8] (encaustic)
 *   Wood      wood [1.6×2.4 planks] · plywood [2.44×1.22] · pallet [1] (weathered) · bamboo [0.4×1.2] ·
 *             bark [1] · palmBark [0.6]
 *   Metal     metal [1] (bare brushed steel) · paintedMetal [2] (near white → tint; chips) · rust [1.5] ·
 *             corrugated [1] (container / roofing sheet, tintable)
 *   Synthetic rubber [0.5] · plastic [1] (tintable; brand red = tint 0xE30613) · plasticGloss (clear-coated) ·
 *             glass (cheap dark reflective, untextured) · fabric [0.25] (double sided, tintable)
 *   Organic   grass [3] · foliage (atlas: u<0.5 opaque leaf mass, u>0.5 alpha clump) · frond (palm leaf, alpha)
 *   Roofing   roofTile [1.2] (terracotta pan tiles; V runs up the slope)
 *   Special   flat (untextured matte, vertex colour only) · neon (unlit, HDR: vertex colour × intensity → bloom) ·
 *             brand (WHY NOT decal atlas, see BRAND_UV) · signs (glyph sign atlas, SIGN_UV) ·
 *             facade (windows / doors atlas, FACADE_UV) · graffiti {seed, piece} (transparent wall piece) ·
 *             scrapes (grind wear decal) · paint (flat markings on top of surfaces, polygon-offset) ·
 *             waterFilm (thin running water) · rope
 *
 * OPTS (all optional): color, emissive, emissiveIntensity, roughness, metalness, opacity, transparent,
 *   side: 'double' | 'front' | 'back', repeat: [metresU, metresV] (override the tile size),
 *   intensity (neon), seed / piece (graffiti), cast / receive (shadow flags used by the batchers).
 */
import {
  BackSide,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
} from 'three';
import type { Material, Side, Texture } from 'three';
import type { QualityProfile, SurfaceKind } from '../types';
import { drawBrandAtlas, drawFacadeAtlas, drawGraffiti, drawScrapes, drawSignAtlas } from './decals';
import { SURFACES } from './surfaces';
import { dataTexture, normalPixels, ormPixels } from './textures';

interface Spec {
  surface?: string;
  color?: number;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  env?: number;
  cast?: boolean;
  receive?: boolean;
  side?: 'double';
  alphaTest?: number;
  physical?: boolean;
  /** Surface has a metalness channel. */
  metalMap?: boolean;
}

const SPECS: Record<string, Spec> = {
  concrete: { surface: 'concrete' },
  wetConcrete: { surface: 'wetConcrete', env: 1.25 },
  stone: { surface: 'stone' },
  granite: { surface: 'granite' },
  marble: { surface: 'marble' },
  brick: { surface: 'brick' },
  plaster: { surface: 'plaster' },
  asphalt: { surface: 'asphalt' },
  sand: { surface: 'sand', cast: false },
  tile: { surface: 'tile' },
  patternTile: { surface: 'patternTile', cast: false },
  wood: { surface: 'wood' },
  plywood: { surface: 'plywood' },
  pallet: { surface: 'pallet' },
  bamboo: { surface: 'bamboo' },
  bark: { surface: 'bark' },
  palmBark: { surface: 'palmBark' },
  metal: { surface: 'metal', metalMap: true, env: 1.1 },
  paintedMetal: { surface: 'paintedMetal', metalMap: true },
  rust: { surface: 'rust', metalMap: true },
  corrugated: { surface: 'corrugated', metalMap: true },
  rubber: { surface: 'rubber' },
  plastic: { surface: 'plastic' },
  plasticGloss: { surface: 'plastic', physical: true, env: 1.2 },
  fabric: { surface: 'fabric', side: 'double' },
  grass: { surface: 'grass', cast: false },
  foliage: { surface: 'foliage', side: 'double', alphaTest: 0.5, normalScale: 0.6 },
  frond: { surface: 'frond', side: 'double', alphaTest: 0.5, normalScale: 0.5 },
  roofTile: { surface: 'roofTile' },
  rope: { surface: 'rope', cast: false },
  glass: { color: 0x22323b, roughness: 0.08, metalness: 0.0, env: 1.8, cast: false },
  flat: { roughness: 0.82 },
};

/** Material key used for a ground / obstacle SurfaceKind. */
export function surfaceKey(kind: SurfaceKind): string {
  switch (kind) {
    case 'metal':
      return 'paintedMetal';
    case 'water':
      return 'concrete';
    default:
      return kind;
  }
}

export interface LibraryLabels {
  start: string;
  finish: string;
  rec: string;
}

interface SurfaceTex {
  map: Texture;
  normal: Texture | null;
  orm: Texture | null;
  meanRough: number;
  tile: [number, number];
}

export class MaterialLibrary {
  private readonly mats = new Map<string, Material>();
  private readonly surfaces = new Map<string, SurfaceTex>();
  private readonly canvases = new Map<string, Texture>();
  private readonly extraTex: Texture[] = [];
  private useMaps: boolean;

  constructor(
    private profile: QualityProfile,
    private readonly labels: LibraryLabels = { start: 'START', finish: 'FINISH', rec: 'REC' },
    private readonly waterTint = 0x3f9c95,
  ) {
    this.useMaps = profile.level !== 'low';
  }

  /** Generated texture set of a surface (lazy). */
  private surface(name: string): SurfaceTex {
    let s = this.surfaces.get(name);
    if (s) return s;
    const def = SURFACES[name];
    if (!def) throw new Error(`[world] unknown surface "${name}"`);
    const size = this.profile.level === 'low' ? Math.max(128, def.size >> 1) : def.size;
    const maps = def.gen(size, 1337 + name.length * 131 + name.charCodeAt(0));
    const aniso = this.profile.anisotropy;
    const map = dataTexture(maps.albedo, size, true, maps.tile, aniso);
    let mean = 0;
    for (let i = 0; i < maps.rough.length; i += 16) mean += maps.rough[i];
    mean /= maps.rough.length / 16;
    const tiling = name !== 'foliage' && name !== 'frond';
    const normal = this.useMaps ? dataTexture(normalPixels(maps), size, false, maps.tile, aniso) : null;
    const orm = this.useMaps ? dataTexture(ormPixels(maps), size, false, maps.tile, aniso) : null;
    if (!tiling) {
      for (const t of [map, normal, orm]) {
        if (!t) continue;
        t.wrapS = t.wrapT = ClampToEdgeWrapping;
        t.repeat.set(1, 1);
      }
    }
    s = { map, normal, orm, meanRough: mean, tile: maps.tile };
    this.surfaces.set(name, s);
    return s;
  }

  private canvasTex(key: string, draw: () => HTMLCanvasElement, repeat = false): Texture {
    let t = this.canvases.get(key);
    if (t) return t;
    t = new CanvasTexture(draw());
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = this.profile.anisotropy;
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
    this.canvases.set(key, t);
    return t;
  }

  /**
   * Roughness map for the facade atlas: window glass (dark, bluish pixels) is glossy so it mirrors the
   * sky; frames, shutters and plaster stay matte. Derived from the colour atlas once.
   */
  private facadeRoughness(): Texture {
    let t = this.canvases.get('facade.rough');
    if (t) return t;
    const src = this.texture('facade').image as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.drawImage(src, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255;
        const g = d[i + 1] / 255;
        const b = d[i + 2] / 255;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const glass = lum < 0.32 && b >= r - 0.02 ? 1 : 0;
        const v = Math.round((glass ? 0.08 : 0.78) * 255);
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
    }
    t = new CanvasTexture(c);
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    this.canvases.set('facade.rough', t);
    return t;
  }

  /** Shared decal textures for modules that build their own materials (letters, preview…). */
  texture(key: 'brand' | 'signs' | 'facade'): Texture {
    if (key === 'brand') return this.canvasTex('brand', () => drawBrandAtlas(this.labels));
    if (key === 'signs') return this.canvasTex('signs', () => drawSignAtlas(4242));
    return this.canvasTex('facade', () => drawFacadeAtlas(99));
  }

  get(key: string, opts: Record<string, unknown> = {}): Material {
    const ck = Object.keys(opts).length ? key + '|' + JSON.stringify(opts, Object.keys(opts).sort()) : key;
    let m = this.mats.get(ck);
    if (m) return m;
    m = this.create(key, opts);
    m.name = ck;
    if (typeof opts.cast === 'boolean') m.userData.cast = opts.cast;
    if (typeof opts.receive === 'boolean') m.userData.receive = opts.receive;
    this.mats.set(ck, m);
    return m;
  }

  private create(key: string, o: Record<string, unknown>): Material {
    const side: Side | undefined = o.side === 'double' ? DoubleSide : o.side === 'back' ? BackSide : o.side === 'front' ? FrontSide : undefined;
    if (key === 'neon') {
      const m = new MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
      const k = typeof o.intensity === 'number' ? o.intensity : 1;
      if (typeof o.color === 'number') m.color.setHex(o.color);
      m.color.multiplyScalar(k);
      if (side !== undefined) m.side = side;
      if (o.transparent) {
        m.transparent = true;
        m.opacity = typeof o.opacity === 'number' ? o.opacity : 1;
        m.depthWrite = false;
      }
      m.userData.cast = false;
      m.userData.receive = false;
      return m;
    }
    if (key === 'brand' || key === 'signs' || key === 'facade') {
      const m = new MeshStandardMaterial({
        map: this.texture(key),
        vertexColors: true,
        alphaTest: key === 'facade' ? 0.5 : 0.4,
        roughness: key === 'signs' ? 0.55 : 0.7,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      if (key === 'facade') {
        // glossy glass + a bit more sky in the windows: the street reads as real buildings
        m.roughness = 1;
        m.roughnessMap = this.facadeRoughness();
        m.envMapIntensity = 1.6;
      }
      if (side !== undefined) m.side = side;
      m.userData.cast = false;
      return m;
    }
    if (key === 'graffiti') {
      const seed = typeof o.seed === 'number' ? o.seed : 7;
      const piece = typeof o.piece === 'string' ? o.piece : undefined;
      const tex = this.canvasTex(`graffiti:${seed}:${piece ?? ''}`, () => drawGraffiti(seed, 1024, 256, piece));
      const m = new MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, vertexColors: true });
      m.userData.cast = false;
      return m;
    }
    if (key === 'scrapes') {
      const tex = this.canvasTex('scrapes', () => drawScrapes(31), true);
      const m = new MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.4, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, vertexColors: true });
      m.userData.cast = false;
      return m;
    }
    if (key === 'paint') {
      // flat painted markings lying on other surfaces (lines, stencils)
      const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      if (side !== undefined) m.side = side;
      m.userData.cast = false;
      return m;
    }
    if (key === 'waterFilm') {
      const s = this.surface('film');
      const m = new MeshStandardMaterial({ color: new Color(this.waterTint).lerp(new Color(0xffffff), 0.5), transparent: true, opacity: 0.38, roughness: 0.04, metalness: 0, depthWrite: false, vertexColors: true, envMapIntensity: 1.6 });
      if (s.normal) {
        const n = s.normal.clone();
        n.needsUpdate = true;
        this.extraTex.push(n);
        m.normalMap = n;
        m.normalScale = new Vector2(0.7, 0.7);
      }
      m.userData.cast = false;
      return m;
    }
    const spec = SPECS[key];
    if (!spec) {
      console.warn(`[world] unknown material key "${key}" → flat`);
      return this.create('flat', o);
    }
    const params = {
      vertexColors: true,
      color: typeof o.color === 'number' ? o.color : (spec.color ?? 0xffffff),
      roughness: typeof o.roughness === 'number' ? o.roughness : (spec.roughness ?? 1),
      metalness: typeof o.metalness === 'number' ? o.metalness : (spec.metalness ?? 0),
    };
    const m = spec.physical ? new MeshPhysicalMaterial({ ...params, clearcoat: 0.8, clearcoatRoughness: 0.18 }) : new MeshStandardMaterial(params);
    if (spec.surface) {
      const s = this.surface(spec.surface);
      let map = s.map;
      let normal = s.normal;
      let orm = s.orm;
      if (Array.isArray(o.repeat) && o.repeat.length === 2) {
        const [ru, rv] = o.repeat as [number, number];
        const cl = (t: Texture | null): Texture | null => {
          if (!t) return null;
          const c = t.clone();
          c.repeat.set(1 / ru, 1 / rv);
          c.needsUpdate = true;
          this.extraTex.push(c);
          return c;
        };
        map = cl(map) as Texture;
        normal = cl(normal);
        orm = cl(orm);
      }
      m.map = map;
      if (normal && orm) {
        m.normalMap = normal;
        const ns = spec.normalScale ?? 1;
        m.normalScale = new Vector2(ns, ns);
        m.roughnessMap = orm;
        m.aoMap = orm;
        m.aoMapIntensity = 0.9;
        if (spec.metalMap) {
          m.metalnessMap = orm;
          if (typeof o.metalness !== 'number') m.metalness = 1;
        }
      } else if (typeof o.roughness !== 'number') {
        m.roughness = s.meanRough;
        if (spec.metalMap && typeof o.metalness !== 'number') m.metalness = key === 'metal' ? 1 : 0.1;
      }
    }
    if (spec.env) m.envMapIntensity = spec.env;
    if (spec.alphaTest) m.alphaTest = spec.alphaTest;
    if (spec.side === 'double') m.side = DoubleSide;
    if (side !== undefined) m.side = side;
    if (typeof o.emissive === 'number') {
      m.emissive.setHex(o.emissive);
      m.emissiveIntensity = typeof o.emissiveIntensity === 'number' ? o.emissiveIntensity : 1;
    }
    if (o.transparent || typeof o.opacity === 'number') {
      m.transparent = true;
      m.opacity = typeof o.opacity === 'number' ? o.opacity : 1;
      m.depthWrite = false;
    }
    if (spec.cast === false) m.userData.cast = false;
    if (spec.receive === false) m.userData.receive = false;
    return m;
  }

  /** Runtime quality change: anisotropy only (map sets are decided at build time). */
  setProfile(profile: QualityProfile): void {
    this.profile = profile;
    const apply = (t: Texture | null): void => {
      if (t && t.anisotropy !== profile.anisotropy) {
        t.anisotropy = profile.anisotropy;
        t.needsUpdate = true;
      }
    };
    for (const s of this.surfaces.values()) {
      apply(s.map);
      apply(s.normal);
      apply(s.orm);
    }
    for (const t of this.canvases.values()) apply(t);
    for (const t of this.extraTex) apply(t);
  }

  get materialCount(): number {
    return this.mats.size;
  }

  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
    for (const s of this.surfaces.values()) {
      s.map.dispose();
      s.normal?.dispose();
      s.orm?.dispose();
    }
    for (const t of this.canvases.values()) t.dispose();
    for (const t of this.extraTex) t.dispose();
    this.mats.clear();
    this.surfaces.clear();
    this.canvases.clear();
    this.extraTex.length = 0;
  }
}
