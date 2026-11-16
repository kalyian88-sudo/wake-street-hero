/**
 * Wallride walls. The rideable face starts on the line a → b and recedes by tan(lean) per metre of
 * height — the same plane the collision world tests (see wallNormal()).
 */
import { BRAND } from '../../config';
import { DEG, hashString, wallNormal } from '../../data/geometry';
import type { WallDef } from '../../types';
import { BRAND_UV } from '../decals';
import { ALGAE, algaeWeight, wetShade } from '../build';
import type { BuildCtx } from '../build';
import { GB } from '../geo';
import type { P3 } from '../geo';

const CONTAINER_TINTS = [0xc8452e, 0x2f6f8f, 0xd9a520, 0x3c7a4a, BRAND.colors.red];
const PLASTER_TINTS = [0xf2d98a, 0xf0b9a8, 0xbfe0c8, 0xb9d4ea];

export function buildWall(b: BuildCtx, def: WallDef): void {
  const [nx, nz] = wallNormal(def);
  const dx = def.b[0] - def.a[0];
  const dz = def.b[2] - def.a[2];
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const H = def.height;
  const back = Math.tan((def.lean ?? 0) * DEG) * H;
  const style = def.style ?? 'canal';
  const hash = hashString(def.id);
  const mx = (def.a[0] + def.b[0]) / 2 + nx * 0.4;
  const mz = (def.a[2] + def.b[2]) / 2 + nz * 0.4;
  const inWater = b.terrain.isOpenWater(mx, mz);
  const level = inWater ? b.terrain.heightAt(mx, mz) : def.a[1];
  const y0 = def.a[1] - (inWater ? 1.0 : 0);
  const yTop = def.a[1] + H;
  const thick = style === 'container' ? 2.44 : 0.36;

  let key = 'concrete';
  let tint = 0xffffff;
  if (style === 'canal') key = 'stone';
  else if (style === 'brick') key = 'brick';
  else if (style === 'granite') key = 'granite';
  else if (style === 'container') {
    key = 'corrugated';
    tint = CONTAINER_TINTS[hash % CONTAINER_TINTS.length];
  } else if (style === 'plaster') {
    key = 'plaster';
    tint = PLASTER_TINTS[hash % PLASTER_TINTS.length];
  }

  // point on the wall: s = metres along a→b, f = 0 front face … 1 back face, y absolute
  const pt = (s: number, y: number, f: number): P3 => {
    const rec = ((y - def.a[1]) / H) * back;
    const off = f === 0 ? -Math.max(0, rec) : -(back + thick);
    return [def.a[0] + ux * s + nx * off, y, def.a[2] + uz * s + nz * off];
  };

  const g = new GB();
  g.color(tint);
  const n = Math.max(1, Math.round(len / 4));
  const rows = inWater ? [y0, level - 0.25, level + 0.06, level + 0.45, yTop].filter((y, i, a) => i === 0 || y > a[i - 1] + 1e-3) : [y0, yTop];
  for (let i = 0; i < n; i++) {
    const s0 = (len * i) / n;
    const s1 = (len * (i + 1)) / n;
    for (let k = 0; k < rows.length - 1; k++) {
      // front (rideable) face: left of a→b
      g.quad(pt(s1, rows[k], 0), pt(s0, rows[k], 0), pt(s0, rows[k + 1], 0), pt(s1, rows[k + 1], 0));
    }
    // back face
    g.quad(pt(s0, Math.max(y0, def.a[1] - 0.1), 1), pt(s1, Math.max(y0, def.a[1] - 0.1), 1), pt(s1, yTop, 1), pt(s0, yTop, 1));
    // top
    if (style === 'container') g.quad(pt(s0, yTop, 0), pt(s0, yTop, 1), pt(s1, yTop, 1), pt(s1, yTop, 0));
  }
  // ends
  g.quad(pt(0, y0, 0), pt(0, y0, 1), pt(0, yTop, 1), pt(0, yTop, 0));
  g.quad(pt(len, y0, 1), pt(len, y0, 0), pt(len, yTop, 0), pt(len, yTop, 1));
  if (inWater) {
    g.shadeBy(0, (_x, y) => wetShade(y, level));
    g.tintBy(0, ALGAE, (_x, y) => algaeWeight(y, level));
  }
  // grime towards the top edge
  g.shadeBy(0, (_x, y) => 1 - Math.max(0, (y - (yTop - 0.5)) / 0.5) * 0.12);
  b.statics.add(g.build(), b.mat(key), null, { cast: true });

  // cap
  if (style !== 'container') {
    const cap = new GB();
    cap.color(style === 'plaster' ? 0xf4f0e6 : 0xffffff, 1.04);
    const yaw = Math.atan2(ux, uz);
    cap
      .translate(def.a[0] + ux * (len / 2) - nx * (back + thick / 2), 0, def.a[2] + uz * (len / 2) - nz * (back + thick / 2))
      .rotY(yaw)
      .chamferBox(0, yTop, 0, thick + 0.1, 0.09, len + 0.08, 0.02, '');
    b.statics.add(cap.build(), b.mat(style === 'brick' || style === 'plaster' ? 'concrete' : key === 'stone' ? 'granite' : key), null, { cast: true });
    // buttresses behind
    const butt = new GB();
    butt.color(tint, 0.96);
    const k = Math.max(2, Math.round(len / 5));
    for (let i = 0; i <= k; i++) {
      const s = 0.3 + ((len - 0.6) * i) / k;
      const c = pt(s, 0, 1);
      butt.push().translate(c[0] - nx * 0.2, 0, c[2] - nz * 0.2).rotY(yaw).boxB(0, def.a[1] - 0.1, 0, 0.4, H * 0.8 + 0.1, 0.3, 'y');
      butt.pop();
    }
    b.statics.add(butt.build(), b.mat(key), null, { cast: true });
  }

  // graffiti piece: transparent decal over the upper part of the face
  if (style === 'graffiti') {
    const d = new GB();
    const lift = 0.012;
    const yA = Math.max(def.a[1] + 0.12, level + 0.3);
    const yB = yTop - 0.06;
    const lp = (s: number, y: number): P3 => {
      const p = pt(s, y, 0);
      return [p[0] + nx * lift, p[1], p[2] + nz * lift];
    };
    // seen from the front, a→b runs right → left, so u = 0 sits at b
    const cols = Math.max(1, Math.round(len / 4));
    for (let i = 0; i < cols; i++) {
      const s0 = len * (1 - i / cols);
      const s1 = len * (1 - (i + 1) / cols);
      d.quadUV(lp(s0, yA), lp(s1, yA), lp(s1, yB), lp(s0, yB), i / cols, 0, (i + 1) / cols, 1);
    }
    b.statics.add(d.build(), b.mat('graffiti', { seed: (hash % 97) + 3 }), null, { cast: false, noChunk: true });
  }
  if (style === 'plaster' || style === 'brick') {
    // modest brand paste-up
    const d = new GB();
    const p0 = pt(len * 0.5 + 1.2, def.a[1] + H * 0.45, 0);
    const p1 = pt(len * 0.5 - 1.2, def.a[1] + H * 0.45, 0);
    const p2 = pt(len * 0.5 - 1.2, def.a[1] + H * 0.45 + 0.6, 0);
    const p3 = pt(len * 0.5 + 1.2, def.a[1] + H * 0.45 + 0.6, 0);
    const o = (p: P3): P3 => [p[0] + nx * 0.01, p[1], p[2] + nz * 0.01];
    const uv = BRAND_UV.wmRed;
    d.quadUV(o(p0), o(p1), o(p2), o(p3), uv[0], uv[1], uv[2], uv[3]);
    b.statics.add(d.build(), b.mat('brand'), null, { cast: false });
  }

  if (inWater) {
    const a0 = pt(0, level, 0);
    const b0 = pt(len, level, 0);
    b.foam.push({
      level,
      points: [
        [a0[0], a0[2]],
        [b0[0], b0[2]],
        [b0[0] - nx * thick, b0[2] - nz * thick],
        [a0[0] - nx * thick, a0[2] - nz * thick],
      ],
    });
  }
}
