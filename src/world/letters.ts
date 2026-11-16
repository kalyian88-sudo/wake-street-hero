/**
 * W-H-Y-N-O-T pickups: chunky extruded block letters (hand-authored outlines, italic shear like the
 * wordmark) with a white-hot face and brand-red sides, a soft glow behind them, spin + bob, and a
 * pop-and-sparkle burst when collected.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, DynamicDrawUsage, Group, Mesh, Points, PointsMaterial } from 'three';
import type { BufferGeometry as Geo, Material } from 'three';
import { BRAND, GAME } from '../config';
import type { LetterDef } from '../types';
import { drawGlow } from './decals';
import { GB, linearRGB } from './geo';

type Outline = readonly (readonly [number, number])[];
interface Glyph {
  w: number;
  outline: Outline;
  holes?: Outline[];
}

const S = 0.24;
const GLYPHS: Record<string, Glyph> = {
  W: {
    w: 1.1,
    outline: [
      [0.18, 0],
      [0.38, 0],
      [0.55, 0.47],
      [0.72, 0],
      [0.92, 0],
      [1.1, 1],
      [0.86, 1],
      [0.78, 0.42],
      [0.66, 0.78],
      [0.44, 0.78],
      [0.32, 0.42],
      [0.24, 1],
      [0, 1],
    ],
  },
  H: {
    w: 0.8,
    outline: [
      [0, 0],
      [S, 0],
      [S, 0.38],
      [0.8 - S, 0.38],
      [0.8 - S, 0],
      [0.8, 0],
      [0.8, 1],
      [0.8 - S, 1],
      [0.8 - S, 0.62],
      [S, 0.62],
      [S, 1],
      [0, 1],
    ],
  },
  Y: {
    w: 0.86,
    outline: [
      [0.31, 0],
      [0.55, 0],
      [0.55, 0.42],
      [0.86, 1],
      [0.6, 1],
      [0.43, 0.64],
      [0.26, 1],
      [0, 1],
      [0.31, 0.42],
    ],
  },
  N: {
    w: 0.82,
    outline: [
      [0, 0],
      [S, 0],
      [S, 0.58],
      [0.82 - S, 0],
      [0.82, 0],
      [0.82, 1],
      [0.82 - S, 1],
      [0.82 - S, 0.42],
      [S, 1],
      [0, 1],
    ],
  },
  O: {
    w: 0.84,
    outline: [
      [0.2, 0],
      [0.64, 0],
      [0.84, 0.2],
      [0.84, 0.8],
      [0.64, 1],
      [0.2, 1],
      [0, 0.8],
      [0, 0.2],
    ],
    holes: [
      [
        [0.31, 0.25],
        [0.53, 0.25],
        [0.6, 0.32],
        [0.6, 0.68],
        [0.53, 0.75],
        [0.31, 0.75],
        [0.24, 0.68],
        [0.24, 0.32],
      ],
    ],
  },
  T: {
    w: 0.78,
    outline: [
      [0.39 - S / 2, 0],
      [0.39 + S / 2, 0],
      [0.39 + S / 2, 1 - S],
      [0.78, 1 - S],
      [0.78, 1],
      [0, 1],
      [0, 1 - S],
      [0.39 - S / 2, 1 - S],
    ],
  },
};

const HEIGHT = 1.15;
const DEPTH = 0.26;
const SHEAR = 0.16;

/** Extruded letter centred on the origin (exported for the unit tests / other uses). */
export function letterGeometry(ch: string): Geo {
  const gl = GLYPHS[ch] ?? GLYPHS.O;
  const map = (o: Outline): [number, number][] => o.map(([x, y]) => [(x - gl.w / 2 + (y - 0.5) * SHEAR) * HEIGHT, (y - 0.5) * HEIGHT]);
  const outline = map(gl.outline);
  const holes = (gl.holes ?? []).map(map);
  const g = new GB();
  const [rr, rg, rb] = linearRGB(BRAND.colors.red);
  // faces: white-hot (HDR → bloom), slightly warm
  g.rgb(1.9, 1.86, 1.8);
  g.poly(outline, DEPTH / 2, false, holes);
  g.poly(outline, -DEPTH / 2, true, holes);
  // sides: saturated brand red, brighter than albedo so they glow in the shade
  g.rgb(rr * 1.9, rg * 1.9 + 0.01, rb * 1.9 + 0.01);
  g.prism(outline, -DEPTH / 2, DEPTH / 2, false, false, true);
  for (const h of holes) g.prism(h, -DEPTH / 2, DEPTH / 2, false, false, true, true);
  // fake shading on the sides: undersides darker
  const geo = g.build();
  const nor = geo.getAttribute('normal');
  const col = geo.getAttribute('color');
  for (let i = 0; i < nor.count; i++) {
    if (Math.abs(nor.getZ(i)) > 0.9) continue;
    const k = 0.72 + 0.28 * (nor.getY(i) * 0.5 + 0.5) + 0.12 * nor.getX(i);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return geo;
}

export interface Letters {
  readonly group: Group;
  /** Show only letters of this line (or without a line). */
  setLine(winchId: string): void;
  setCollected(collected: boolean[]): void;
  update(dt: number, time: number): void;
  dispose(): void;
}

const BURST_N = 14;

export function createLetters(defs: readonly LetterDef[], neon: Material): Letters {
  const group = new Group();
  group.name = 'letters';
  const geos = new Map<string, Geo>();
  const items = defs.map((def) => {
    const ch = GAME.letters[def.index] ?? 'O';
    let geo = geos.get(ch);
    if (!geo) geos.set(ch, (geo = letterGeometry(ch)));
    const mesh = new Mesh(geo, neon);
    mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
    mesh.castShadow = false;
    group.add(mesh);
    return { def, mesh, collected: false, inLine: true, pop: -1 };
  });

  // one Points object = all glows
  const glowTex = new CanvasTexture(drawGlow(64));
  const gp = new Float32Array(items.length * 3);
  const glowGeo = new BufferGeometry();
  const gAttr = new BufferAttribute(gp, 3).setUsage(DynamicDrawUsage);
  glowGeo.setAttribute('position', gAttr);
  const glowMat = new PointsMaterial({ map: glowTex, color: 0xff3a30, size: 3.4, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending });
  const glow = new Points(glowGeo, glowMat);
  glow.frustumCulled = false;
  group.add(glow);

  // pickup sparkle burst (reused)
  const bp = new Float32Array(BURST_N * 3);
  const bv = new Float32Array(BURST_N * 3);
  const burstGeo = new BufferGeometry();
  const bAttr = new BufferAttribute(bp, 3).setUsage(DynamicDrawUsage);
  burstGeo.setAttribute('position', bAttr);
  const burstMat = new PointsMaterial({ map: glowTex, color: 0xffffff, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const burst = new Points(burstGeo, burstMat);
  burst.frustumCulled = false;
  burst.visible = false;
  group.add(burst);
  let burstT = -1;

  const startBurst = (x: number, y: number, z: number): void => {
    for (let i = 0; i < BURST_N; i++) {
      const a = (i / BURST_N) * Math.PI * 2;
      const up = 0.4 + ((i * 7) % 5) * 0.25;
      bp[i * 3] = x;
      bp[i * 3 + 1] = y;
      bp[i * 3 + 2] = z;
      bv[i * 3] = Math.cos(a) * (3 + (i % 3));
      bv[i * 3 + 1] = up * 3.4;
      bv[i * 3 + 2] = Math.sin(a) * (3 + ((i + 1) % 3));
    }
    burstT = 0;
    burst.visible = true;
  };

  return {
    group,
    setLine(winchId) {
      for (const it of items) {
        it.inLine = !it.def.line || it.def.line === winchId;
        it.mesh.visible = it.inLine && !it.collected;
      }
    },
    setCollected(collected) {
      for (const it of items) {
        const c = !!collected[it.def.index];
        if (c && !it.collected && it.inLine) {
          it.pop = 0;
          startBurst(it.mesh.position.x, it.mesh.position.y, it.mesh.position.z);
        }
        if (!c) {
          it.pop = -1;
          it.mesh.scale.setScalar(1);
        }
        it.collected = c;
        it.mesh.visible = it.inLine && (!c || it.pop >= 0);
      }
    },
    update(dt, time) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const d = it.def;
        let y = d.pos[1] + Math.sin(time * 2.1 + d.index * 1.3) * 0.12;
        let shown = it.mesh.visible;
        if (it.pop >= 0) {
          // collected: swell, spin up, vanish
          it.pop += dt;
          const t = it.pop;
          const s = t < 0.12 ? 1 + (t / 0.12) * 0.7 : Math.max(0, 1.7 * (1 - (t - 0.12) / 0.28));
          it.mesh.scale.setScalar(Math.max(0.001, s));
          it.mesh.rotation.y += dt * 22;
          y += t * 2.2;
          if (t > 0.4) {
            it.pop = -1;
            it.mesh.visible = false;
            shown = false;
          }
        } else if (shown) {
          it.mesh.rotation.y = time * 1.7 + d.index * 0.9;
        }
        it.mesh.position.y = y;
        gp[i * 3] = d.pos[0];
        gp[i * 3 + 1] = shown ? y : -9999;
        gp[i * 3 + 2] = d.pos[2];
      }
      gAttr.needsUpdate = true;
      glowMat.opacity = 0.5 + Math.sin(time * 3.3) * 0.08;
      if (burstT >= 0) {
        burstT += dt;
        for (let i = 0; i < BURST_N; i++) {
          bv[i * 3 + 1] -= 9 * dt;
          bp[i * 3] += bv[i * 3] * dt;
          bp[i * 3 + 1] += bv[i * 3 + 1] * dt;
          bp[i * 3 + 2] += bv[i * 3 + 2] * dt;
        }
        bAttr.needsUpdate = true;
        burstMat.opacity = Math.max(0, 1 - burstT / 0.6);
        if (burstT > 0.6) {
          burstT = -1;
          burst.visible = false;
        }
      }
    },
    dispose() {
      for (const g of geos.values()) g.dispose();
      glowGeo.dispose();
      burstGeo.dispose();
      glowMat.dispose();
      burstMat.dispose();
      glowTex.dispose();
    },
  };
}
