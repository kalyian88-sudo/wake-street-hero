/**
 * The crew's camp around the winch — moves with the active winch point: two WHY NOT feather flags,
 * a FINISH barrier, a cooler box and a folding chair. Camp frame = winch frame (+Z looks at the rider).
 */
import { Mesh } from 'three';
import type { Group } from 'three';
import { BRAND } from '../config';
import { BRAND_UV } from './decals';
import type { BuildCtx } from './build';
import { GB } from './geo';
import type { P3 } from './geo';

function featherFlag(metal: GB, cloth: GB, decal: GB, x: number, z: number, yaw: number, tint: number, uv: readonly [number, number, number, number]): void {
  for (const g of [metal, cloth, decal]) g.push().translate(x, 0, z).rotY(yaw);
  // cross base + bowed pole
  metal.color(0x2a2b30);
  metal.box(0, 0.015, 0, 0.7, 0.03, 0.06);
  metal.box(0, 0.015, 0, 0.06, 0.03, 0.7);
  metal.color(0xd8dade);
  const pole: P3[] = [];
  const H = 3.3;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pole.push([Math.pow(t, 3) * 0.55, t * H - Math.pow(t, 4) * 0.25, 0]);
  }
  metal.tube(pole, 0.014, 5, { caps: 'flat' });
  // blade: follows the pole on its leading edge, straight trailing edge
  const y0 = 0.55;
  const n = 8;
  const edge = (t: number): P3 => {
    const tt = (y0 + t * (H - 0.35 - y0)) / H;
    return [Math.pow(tt, 3) * 0.55 + 0.012, tt * H - Math.pow(tt, 4) * 0.25, 0];
  };
  const trail = (t: number): P3 => {
    const e = edge(t);
    const w = 0.66 * Math.pow(Math.sin(Math.min(1, t * 1.15 + 0.12) * Math.PI * 0.5), 0.5) * (1 - Math.pow(t, 3) * 0.75);
    return [e[0] + w, e[1] - 0.04 * t, 0];
  };
  cloth.color(tint);
  for (let i = 0; i < n; i++) {
    const a = edge(i / n);
    const b2 = trail(i / n);
    const c = trail((i + 1) / n);
    const d = edge((i + 1) / n);
    cloth.quad(a, b2, c, d);
  }
  // vertical wordmark, reading bottom → top, on both faces
  const a = trail(0.14);
  const b2 = trail(0.74);
  const c = edge(0.74);
  const d = edge(0.14);
  const inset = (p: P3, q: P3, k: number, dz: number): P3 => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, dz];
  decal.quadUV(inset(a, d, 0.16, 0.006), inset(b2, c, 0.16, 0.006), inset(c, b2, 0.14, 0.006), inset(d, a, 0.14, 0.006), uv[0], uv[1], uv[2], uv[3]);
  decal.quadUV(inset(d, a, 0.14, -0.006), inset(c, b2, 0.14, -0.006), inset(b2, c, 0.16, -0.006), inset(a, d, 0.16, -0.006), uv[0], uv[1], uv[2], uv[3]);
  for (const g of [metal, cloth, decal]) g.pop();
}

export function buildWinchCamp(b: BuildCtx, camp: Group): void {
  const metal = new GB();
  const cloth = new GB();
  const decal = new GB();
  const red = BRAND.colors.red;
  featherFlag(metal, cloth, decal, 1.75, -0.45, -Math.PI / 2 + 0.35, red, BRAND_UV.wmWhite);
  featherFlag(metal, cloth, decal, -1.75, -0.45, -Math.PI / 2 - 0.35, 0xf4f4f0, BRAND_UV.wmRed);

  // crowd barrier carrying the FINISH plate
  metal.push().translate(2.5, 0, -1.25).rotY(-0.5);
  metal.color(0xcfd2d6);
  const bw = 1.9;
  metal.tube(
    [
      [-bw / 2, 0.03, 0],
      [-bw / 2, 1.05, 0],
      [bw / 2, 1.05, 0],
      [bw / 2, 0.03, 0],
    ],
    0.018,
    6,
    { caps: 'flat', fillet: 0.08 },
  );
  metal.rod([-bw / 2, 0.22, 0], [bw / 2, 0.22, 0], 0.014, 5);
  for (let i = 1; i < 9; i++) {
    const x = -bw / 2 + (bw * i) / 9;
    if (Math.abs(x) < 0.52) continue;
    metal.rod([x, 0.22, 0], [x, 1.05, 0], 0.008, 4);
  }
  for (const sx of [-1, 1]) metal.box(sx * bw * 0.5, 0.012, 0, 0.05, 0.024, 0.5);
  metal.color(0x1c1d21);
  metal.box(0, 0.64, 0, 1.06, 0.56, 0.012);
  metal.pop();
  decal.push().translate(2.5, 0, -1.25).rotY(-0.5);
  const fu = BRAND_UV.finish;
  decal.quadUV([-0.5, 0.39, 0.012], [0.5, 0.39, 0.012], [0.5, 0.89, 0.012], [-0.5, 0.89, 0.012], fu[0], fu[1], fu[2], fu[3]);
  const pu = BRAND_UV.plateRed;
  decal.quadUV([0.5, 0.515, -0.012], [-0.5, 0.515, -0.012], [-0.5, 0.765, -0.012], [0.5, 0.765, -0.012], pu[0], pu[1], pu[2], pu[3]);
  decal.pop();

  // cooler box
  metal.color(0x2f6f8f);
  metal.chamferBox(-1.25, 0, -1.55, 0.6, 0.34, 0.36, 0.03);
  metal.color(0xf4f4f0);
  metal.chamferBox(-1.25, 0.34, -1.55, 0.62, 0.07, 0.38, 0.02, '');
  // folding chair
  metal.push().translate(1.2, 0, -2.05).rotY(2.6);
  metal.color(0x2a2b30);
  for (const sx of [-1, 1]) {
    metal.rod([sx * 0.24, 0, 0.22], [sx * 0.24, 0.84, -0.26], 0.012, 5);
    metal.rod([sx * 0.24, 0, -0.22], [sx * 0.24, 0.46, 0.24], 0.012, 5);
  }
  metal.pop();
  cloth.push().translate(1.2, 0, -2.05).rotY(2.6);
  cloth.color(red);
  cloth.quad([-0.24, 0.45, 0.22], [0.24, 0.45, 0.22], [0.24, 0.43, -0.14], [-0.24, 0.43, -0.14]);
  cloth.quad([-0.24, 0.52, -0.16], [0.24, 0.52, -0.16], [0.24, 0.84, -0.26], [-0.24, 0.84, -0.26]);
  cloth.pop();

  const mk = (g: GB, key: string, cast: boolean): void => {
    if (g.empty) return;
    const m = new Mesh(g.build(), b.mat(key));
    m.castShadow = cast;
    m.receiveShadow = true;
    camp.add(m);
  };
  mk(metal, 'paintedMetal', true);
  mk(cloth, 'fabric', true);
  mk(decal, 'brand', false);
}
