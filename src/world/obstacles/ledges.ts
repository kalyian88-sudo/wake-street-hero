/**
 * Ledges: chamfered boxes with metal coping on the two grindable long edges (ledgeEdges()),
 * wax / scrape marks and a wet band when they stand in the water.
 */
import { DEG, ledgeBox } from '../../data/geometry';
import type { LedgeDef } from '../../types';
import { BRAND_UV } from '../decals';
import { ALGAE, algaeWeight, wetShade } from '../build';
import type { BuildCtx } from '../build';
import { GB } from '../geo';

interface LedgeLook {
  key: string;
  tint: number;
  chamfer: number;
  coping: boolean;
  cap: string | null;
}

function look(def: LedgeDef): LedgeLook {
  switch (def.style ?? 'concrete') {
    case 'granite':
      return { key: 'granite', tint: 0xffffff, chamfer: 0.035, coping: false, cap: null };
    case 'marble':
      return { key: 'marble', tint: 0xffffff, chamfer: 0.03, coping: false, cap: null };
    case 'wood':
      return { key: 'wood', tint: 0xffffff, chamfer: 0.012, coping: true, cap: null };
    case 'bamboo':
      return { key: 'bamboo', tint: 0xffffff, chamfer: 0.0, coping: false, cap: null };
    case 'brick':
      return { key: 'brick', tint: 0xffffff, chamfer: 0.0, coping: true, cap: 'concrete' };
    case 'planter':
      return { key: 'concrete', tint: 0xe9e4da, chamfer: 0.02, coping: true, cap: null };
    default:
      return { key: 'concrete', tint: 0xffffff, chamfer: 0.022, coping: true, cap: null };
  }
}

export function buildLedge(b: BuildCtx, def: LedgeDef): void {
  const box = ledgeBox(def);
  const [w, h, l] = def.size;
  const lk = look(def);
  const rot = box.rot * DEG;
  const inWater = b.terrain.isOpenWater(def.pos[0], def.pos[2]);
  const level = inWater ? b.terrain.heightAt(def.pos[0], def.pos[2]) : def.pos[1];
  const sink = inWater ? 1.0 : 0;
  const y0 = def.pos[1] - sink;
  const top = def.pos[1] + h;

  const body = new GB();
  body.translate(def.pos[0], 0, def.pos[2]).rotY(rot);
  body.color(lk.tint);
  const capH = lk.cap ? 0.07 : 0;
  // body in ≤ 3 m sections so the texture offset varies and the wet shading has vertices to live on
  const n = Math.max(1, Math.round(l / 3));
  const rows = inWater ? [y0, level - 0.25, level + 0.06, level + 0.4, top - capH].filter((y, i, a) => i === 0 || y > a[i - 1] + 1e-3) : [y0, top - capH];
  const v0 = body.vertexCount;
  for (let i = 0; i < n; i++) {
    const z0 = -l / 2 + (l * i) / n;
    const z1 = -l / 2 + (l * (i + 1)) / n;
    for (let k = 0; k < rows.length - 1; k++) {
      const ya = rows[k];
      const yb = rows[k + 1];
      const last = k === rows.length - 2;
      if (last && !lk.cap) {
        body.chamferBox(0, ya, (z0 + z1) / 2, w, yb - ya, z1 - z0, lk.chamfer, 'y' + (i > 0 ? 'z' : '') + (i < n - 1 ? 'Z' : ''));
      } else {
        body.boxB(0, ya, (z0 + z1) / 2, w, yb - ya, z1 - z0, 'yY' + (i > 0 ? 'z' : '') + (i < n - 1 ? 'Z' : ''));
      }
    }
  }
  if (inWater) {
    body.shadeBy(v0, (_x, y) => wetShade(y, level));
    body.tintBy(v0, ALGAE, (_x, y) => algaeWeight(y, level));
  }
  b.statics.add(body.build(), b.mat(lk.key), null, { cast: true });

  if (lk.cap) {
    const cap = new GB();
    cap.translate(def.pos[0], 0, def.pos[2]).rotY(rot);
    cap.color(0xffffff, 1.05);
    cap.chamferBox(0, top - capH, 0, w + 0.04, capH, l + 0.04, 0.015, '');
    b.statics.add(cap.build(), b.mat(lk.cap), null, { cast: true });
  }

  // ── metal coping (angle iron) on both grind edges ──
  if (lk.coping) {
    const m = new GB();
    m.translate(def.pos[0], 0, def.pos[2]).rotY(rot);
    m.color(0xd4d6da);
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 + (lk.cap ? 0.02 : 0));
      m.box(x - sx * 0.03, top + 0.003, 0, 0.065, 0.008, l + 0.01, 'y');
      m.box(x + sx * 0.003, top - 0.03, 0, 0.008, 0.066, l + 0.01);
    }
    b.statics.add(m.build(), b.mat('metal'), null, { cast: false });
  }
  if (def.style === 'bamboo') {
    // lashed culms as the grind edges
    const m = new GB();
    m.translate(def.pos[0], 0, def.pos[2]).rotY(rot);
    m.color(0xe2d59a);
    for (const sx of [-1, 1]) {
      m.tube(
        [
          [sx * (w / 2 - 0.02), top - 0.02, -l / 2 - 0.06],
          [sx * (w / 2 - 0.02), top - 0.02, l / 2 + 0.06],
        ],
        0.055,
        8,
        { caps: 'flat' },
      );
    }
    b.statics.add(m.build(), b.mat('bamboo', { repeat: [Math.PI * 2 * 0.055 * 4, 1.2] }), null, { cast: true });
  }

  // ── scrape / wax marks along the grind edges (transparent decal strips) ──
  if (def.style !== 'bamboo' && def.style !== 'planter') {
    const s = new GB();
    s.translate(def.pos[0], 0, def.pos[2]).rotY(rot);
    const sw = Math.min(0.3, w * 0.42);
    const u1 = l / 2.2;
    const yy = top + 0.004 + (lk.cap ? 0 : 0);
    // v = 0 at the edge (dark wax), fading inwards
    s.quadUV([w / 2, yy, l / 2], [w / 2, yy, -l / 2], [w / 2 - sw, yy, -l / 2], [w / 2 - sw, yy, l / 2], 0, 1, u1, 0);
    s.quadUV([-w / 2, yy, -l / 2], [-w / 2, yy, l / 2], [-w / 2 + sw, yy, l / 2], [-w / 2 + sw, yy, -l / 2], 0.37, 1, u1 + 0.37, 0);
    // and down the outer faces
    const sh = Math.min(0.16, h * 0.4);
    s.quadUV([w / 2 + 0.004, top - sh, l / 2], [w / 2 + 0.004, top - sh, -l / 2], [w / 2 + 0.004, top, -l / 2], [w / 2 + 0.004, top, l / 2], 0.2, 0.35, u1 + 0.2, 1);
    s.quadUV([-w / 2 - 0.004, top - sh, -l / 2], [-w / 2 - 0.004, top - sh, l / 2], [-w / 2 - 0.004, top, l / 2], [-w / 2 - 0.004, top, -l / 2], 0.6, 0.35, u1 + 0.6, 1);
    b.statics.add(s.build(), b.mat('scrapes'), null, { cast: false, receive: true });
  }

  // ── planter: soil + low greenery down the middle ──
  if (def.style === 'planter' && w >= 0.9) {
    const soil = new GB();
    soil.translate(def.pos[0], 0, def.pos[2]).rotY(rot);
    soil.color(0x3a2c22);
    soil.box(0, top + 0.012, 0, w - 0.44, 0.02, l - 0.44, 'y');
    b.statics.add(soil.build(), b.mat('flat'), null, { cast: false });
    const leaf = new GB();
    leaf.translate(def.pos[0], 0, def.pos[2]).rotY(rot);
    const k = Math.max(2, Math.round(l / 0.7));
    for (let i = 0; i < k; i++) {
      const z = -l / 2 + 0.4 + ((l - 0.8) * i) / Math.max(1, k - 1);
      leaf.color(i % 2 ? 0x8fbf6a : 0xa9d47c, 0.9);
      leaf.sphere(((i * 37) % 10) * 0.012 - 0.06, top + 0.1, z, (w - 0.5) * 0.42, 0.16, 0.3, 7, 4);
    }
    // remap UVs into the opaque half of the foliage atlas
    for (let i = 0; i < leaf.uv.length; i += 2) {
      leaf.uv[i] = 0.05 + (Math.abs(leaf.uv[i]) % 0.4);
      leaf.uv[i + 1] = 0.05 + (Math.abs(leaf.uv[i + 1]) % 0.9);
    }
    b.statics.add(leaf.build(), b.mat('foliage'), null, { cast: false });
  }

  // ── brand stickers on the long faces ──
  const st = new GB();
  st.translate(def.pos[0], 0, def.pos[2]).rotY(rot);
  const sy = top - Math.min(0.28, h * 0.5) - 0.04;
  const sh2 = Math.min(0.22, h * 0.42);
  const place = (sx: number, z: number, uv: readonly [number, number, number, number], ww: number): void => {
    const x = sx * (w / 2 + 0.006);
    if (sx > 0) st.quadUV([x, sy, z + ww / 2], [x, sy, z - ww / 2], [x, sy + sh2, z - ww / 2], [x, sy + sh2, z + ww / 2], uv[0], uv[1], uv[2], uv[3]);
    else st.quadUV([x, sy, z - ww / 2], [x, sy, z + ww / 2], [x, sy + sh2, z + ww / 2], [x, sy + sh2, z - ww / 2], uv[0], uv[1], uv[2], uv[3]);
  };
  if (h >= 0.3 && def.style !== 'bamboo') {
    place(1, -l * 0.22, BRAND_UV.plateRed, sh2 * 4);
    place(-1, l * 0.18, BRAND_UV.plateDark, sh2 * 4);
    place(-1, -l * 0.3, BRAND_UV.stickerRound, sh2);
    place(1, l * 0.31, BRAND_UV.stickerStack, sh2);
    b.statics.add(st.build(), b.mat('brand'), null, { cast: false });
  }

  if (inWater) {
    const c = Math.cos(rot);
    const s2 = Math.sin(rot);
    const pt = (lx: number, lz: number): [number, number] => [def.pos[0] + lx * c + lz * s2, def.pos[2] - lx * s2 + lz * c];
    b.foam.push({ level, points: [pt(-w / 2, -l / 2), pt(w / 2, -l / 2), pt(w / 2, l / 2), pt(-w / 2, l / 2)] });
  }
}
