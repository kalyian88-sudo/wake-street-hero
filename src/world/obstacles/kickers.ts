/**
 * Kickers. The riding surface is sampled from kickerProfile() — the same curve the collision world
 * uses — so the board sits exactly on what the player sees. Local frame: entry edge centre at the
 * origin, ramp rises along +Z, width along X.
 */
import { BRAND } from '../../config';
import { DEG, hashString, kickerProfile, kickerProfileSlope, seededRng } from '../../data/geometry';
import type { KickerDef } from '../../types';
import { BRAND_UV } from '../decals';
import type { UVRect } from '../decals';
import { ALGAE, algaeWeight, wetShade } from '../build';
import type { BuildCtx } from '../build';
import { GB } from '../geo';
import type { P3 } from '../geo';

const SEG = 14;

interface Profile {
  z: number[];
  y: number[];
  /** Arc length along the surface. */
  s: number[];
  ny: number[];
  nz: number[];
}

function sample(def: KickerDef): Profile {
  const curve = def.curve ?? 0.5;
  const p: Profile = { z: [], y: [], s: [], ny: [], nz: [] };
  let acc = 0;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const z = t * def.length;
    const y = def.height * kickerProfile(curve, t);
    if (i > 0) acc += Math.hypot(z - p.z[i - 1], y - p.y[i - 1]);
    const slope = (def.height / def.length) * kickerProfileSlope(curve, t);
    const nl = Math.hypot(1, slope);
    p.z.push(z);
    p.y.push(y);
    p.s.push(acc);
    p.ny.push(1 / nl);
    p.nz.push(-slope / nl);
  }
  return p;
}

/** Riding surface strip between x0..x1 (smooth shaded, metric UVs, V runs up the ramp). */
function surface(g: GB, p: Profile, x0: number, x1: number, lift = 0, apron = true): void {
  const base = g.vertexCount;
  if (apron) {
    // short apron diving under the water in front of the entry edge
    g.v(x0, -0.16 + lift, -0.3, 0, p.ny[0], p.nz[0], x0, -0.34);
    g.v(x1, -0.16 + lift, -0.3, 0, p.ny[0], p.nz[0], x1, -0.34);
  }
  for (let i = 0; i <= SEG; i++) {
    g.v(x0, p.y[i] + lift * p.ny[i], p.z[i] + lift * p.nz[i], 0, p.ny[i], p.nz[i], x0, p.s[i]);
    g.v(x1, p.y[i] + lift * p.ny[i], p.z[i] + lift * p.nz[i], 0, p.ny[i], p.nz[i], x1, p.s[i]);
  }
  const rows = SEG + (apron ? 1 : 0);
  for (let i = 0; i < rows; i++) {
    const a = base + i * 2;
    g.quad4(a, a + 2, a + 3, a + 1);
  }
}

/** Vertical side wall under the profile at x (outward = sign of `side`), down to yBottom. */
function sideWall(g: GB, p: Profile, x: number, side: number, yBottom: number, drop = 0, flare = 0): void {
  for (let i = 0; i < SEG; i++) {
    const a: P3 = [x + side * flare, yBottom, p.z[i]];
    const c: P3 = [x + side * flare, yBottom, p.z[i + 1]];
    if (p.y[i + 1] - drop <= yBottom + 1e-3) continue;
    const d: P3 = [x, p.y[i + 1] - drop, p.z[i + 1]];
    const e: P3 = [x, Math.max(yBottom, p.y[i] - drop), p.z[i]];
    if (side > 0) g.quad(c, a, e, d);
    else g.quad(a, c, d, e);
  }
}

function backWall(g: GB, def: KickerDef, yBottom: number, x0: number, x1: number, drop = 0): void {
  const L = def.length;
  g.quad([x0, yBottom, L], [x1, yBottom, L], [x1, def.height - drop, L], [x0, def.height - drop, L]);
}

/** Brand decal on a side wall (reads left → right from outside). */
function sideDecal(g: GB, x: number, side: number, zc: number, yc: number, w: number, h: number, uv: UVRect): void {
  const xx = x + side * 0.008;
  if (side > 0) g.quadUV([xx, yc - h / 2, zc + w / 2], [xx, yc - h / 2, zc - w / 2], [xx, yc + h / 2, zc - w / 2], [xx, yc + h / 2, zc + w / 2], uv[0], uv[1], uv[2], uv[3]);
  else g.quadUV([xx, yc - h / 2, zc - w / 2], [xx, yc - h / 2, zc + w / 2], [xx, yc + h / 2, zc + w / 2], [xx, yc + h / 2, zc - w / 2], uv[0], uv[1], uv[2], uv[3]);
}

/** Decal lying on the riding surface between profile fractions t0..t1, text upright for the approaching rider. */
function surfaceDecal(g: GB, p: Profile, t0: number, t1: number, halfW: number, uv: UVRect): void {
  const i0 = Math.round(t0 * SEG);
  const i1 = Math.round(t1 * SEG);
  for (let i = i0; i < i1; i++) {
    const f0 = (i - i0) / (i1 - i0);
    const f1 = (i + 1 - i0) / (i1 - i0);
    const lift = 0.006;
    const a: P3 = [halfW, p.y[i] + lift, p.z[i]];
    const c: P3 = [-halfW, p.y[i] + lift, p.z[i]];
    const d: P3 = [-halfW, p.y[i + 1] + lift, p.z[i + 1]];
    const e: P3 = [halfW, p.y[i + 1] + lift, p.z[i + 1]];
    // the rider looks along +Z: screen-left is +X → u0 at +X, v grows up the ramp
    g.quadUV(a, c, d, e, uv[0], uv[1] + (uv[3] - uv[1]) * f0, uv[2], uv[1] + (uv[3] - uv[1]) * f1);
  }
}

function pallet(g: GB, cx: number, y: number, cz: number, w: number, d: number, tint: number, mul: number): void {
  g.color(tint, mul);
  const bw = 0.1;
  // bottom boards, stringers, top deck
  for (const z of [-d / 2 + bw / 2, 0, d / 2 - bw / 2]) g.boxB(cx, y, cz + z, w, 0.022, bw, 'y');
  for (const x of [-w / 2 + 0.05, 0, w / 2 - 0.05]) g.boxB(cx + x, y + 0.022, cz, 0.09, 0.1, d, 'yY');
  const n = 5;
  for (let i = 0; i < n; i++) {
    const z = -d / 2 + bw / 2 + ((d - bw) * i) / (n - 1);
    g.boxB(cx, y + 0.122, cz + z, w, 0.022, bw, 'y');
  }
}

export function buildKicker(b: BuildCtx, def: KickerDef): void {
  const p = sample(def);
  const W = def.width;
  const L = def.length;
  const H = def.height;
  const hw = W / 2;
  const rot = (def.rot ?? 0) * DEG;
  const rnd = seededRng(hashString(def.id));
  const cx = def.pos[0] + Math.sin(rot) * L * 0.5;
  const cz = def.pos[2] + Math.cos(rot) * L * 0.5;
  const inWater = b.terrain.isOpenWater(cx, cz);
  const level = inWater ? b.terrain.heightAt(cx, cz) : def.pos[1];
  const yB = inWater ? -0.9 : 0;
  const place = (g: GB): GB => g.reset().translate(def.pos[0], def.pos[1], def.pos[2]).rotY(rot);
  const wet = (g: GB, from = 0): void => {
    if (!inWater) return;
    g.shadeBy(from, (_x, y) => wetShade(y, level));
    g.tintBy(from, ALGAE, (_x, y) => algaeWeight(y, level) * 0.7);
  };
  const add = (g: GB, key: string, cast = true, opts: Record<string, unknown> = {}): void => {
    if (!g.empty) b.statics.add(g.build(), b.mat(key, opts), null, { cast });
  };
  const decals = place(new GB());

  switch (def.style) {
    case 'wood': {
      const top = place(new GB());
      top.color(0xffffff, 1.02);
      top.uvSwap = true;
      surface(top, p, -hw, hw);
      wet(top);
      add(top, 'plywood');
      // side panels (inset) + back panel
      const panel = place(new GB());
      panel.color(0xd9c9a8, 0.82);
      sideWall(panel, p, hw - 0.05, 1, yB, 0.02);
      sideWall(panel, p, -hw + 0.05, -1, yB, 0.02);
      backWall(panel, def, yB, -hw + 0.05, hw - 0.05, 0.02);
      wet(panel);
      add(panel, 'plywood');
      // timber frame: studs, stringers along the curve, back posts and cross bracing
      const fr = place(new GB());
      fr.color(0xffffff, 0.92);
      const studs = Math.max(2, Math.round(L / 0.75));
      for (const sx of [-1, 1]) {
        for (let i = 1; i <= studs; i++) {
          const t = i / studs;
          const k = Math.min(SEG, Math.round(t * SEG));
          const z = Math.min(L - 0.045, p.z[k]);
          const yTop = p.y[k] - 0.035;
          if (yTop - yB > 0.12) fr.boxB(sx * (hw - 0.02), yB, z, 0.07, yTop - yB, 0.09, 'y');
        }
        for (let i = 0; i < SEG; i++) {
          fr.beam([sx * (hw - 0.02), p.y[i] - 0.06, p.z[i]], [sx * (hw - 0.02), p.y[i + 1] - 0.06, p.z[i + 1]], 0.075, 0.09, 'zZ');
        }
      }
      // back frame
      fr.beam([-hw, H - 0.07, L - 0.02], [hw, H - 0.07, L - 0.02], 0.09, 0.09);
      fr.beam([-hw, yB + 0.25 + (inWater ? 0.9 : 0), L - 0.02], [hw, yB + 0.25 + (inWater ? 0.9 : 0), L - 0.02], 0.07, 0.09);
      fr.beam([-hw + 0.06, 0.1, L + 0.02], [hw - 0.06, H - 0.12, L + 0.02], 0.045, 0.09);
      fr.beam([hw - 0.06, 0.1, L + 0.02], [-hw + 0.06, H - 0.12, L + 0.02], 0.045, 0.09);
      wet(fr);
      add(fr, 'wood');
      // steel lip coping
      const lip = place(new GB());
      lip.color(0xd0d2d6);
      lip.box(0, H + 0.004, L - 0.03, W, 0.01, 0.07);
      lip.box(0, H - 0.03, L + 0.004, W, 0.07, 0.01);
      add(lip, 'metal', false);
      sideDecal(decals, hw - 0.05, 1, L * 0.62, H * 0.3, Math.min(1.5, L * 0.36), Math.min(0.38, H * 0.3), BRAND_UV.plateRed);
      sideDecal(decals, -hw + 0.05, -1, L * 0.62, H * 0.3, Math.min(1.5, L * 0.36), Math.min(0.38, H * 0.3), BRAND_UV.plateRed);
      surfaceDecal(decals, p, 0.18, 0.5, Math.min(1, hw * 0.8), BRAND_UV.wmRed);
      break;
    }
    case 'pallet': {
      const top = place(new GB());
      top.color(0xffffff, 0.96);
      top.uvSwap = true;
      surface(top, p, -hw - 0.04, hw + 0.04);
      // sheet thickness
      top.color(0xb89b6a, 0.7);
      sideWall(top, p, hw + 0.04, 1, -0.02, 0, 0);
      wet(top);
      const pal = place(new GB());
      const nAcross = Math.max(1, Math.round(W / 1.15));
      const pw = W / nAcross;
      const rows = Math.max(1, Math.round(L / 0.82));
      const pd = L / rows;
      const tints = [0xffffff, 0xe6dcc8, 0xcfc4b0, 0xf2e6cc];
      for (let r = 0; r < rows; r++) {
        const z0 = r * pd;
        const curve = def.curve ?? 0.5;
        const yStart = H * kickerProfile(curve, z0 / L);
        const yEnd = H * kickerProfile(curve, (z0 + pd) / L);
        const count = Math.floor((yStart - 0.03) / 0.146);
        for (let a = 0; a < nAcross; a++) {
          const x = -hw + pw * (a + 0.5);
          // pallets standing in the water under the first row
          const lowCount = inWater ? 3 : 0;
          for (let k = -lowCount; k < count; k++) {
            const special = rnd() < 0.14;
            const tint = special ? (rnd() < 0.6 ? BRAND.colors.red : 0x3e6fa8) : tints[Math.floor(rnd() * tints.length)];
            pallet(pal, x + (rnd() - 0.5) * 0.03, k * 0.146, z0 + pd / 2 + (rnd() - 0.5) * 0.03, pw - 0.03, pd - 0.03, tint, special ? 0.8 : 0.85 + rnd() * 0.25);
          }
          // wedge timbers from the stack to the sheet
          pal.color(0xffffff, 0.9);
          const base = Math.max(0, count) * 0.146;
          for (const sx of [-0.36, 0.36]) {
            const xx = x + sx * pw;
            if (yEnd - base > 0.06) pal.boxB(xx, base, z0 + pd - 0.06, 0.09, yEnd - base - 0.02, 0.09, 'y');
            if (yStart - base > 0.06) pal.boxB(xx, base, z0 + 0.06, 0.09, yStart - base - 0.02, 0.09, 'y');
            pal.beam([xx, yStart - 0.05, z0], [xx, yEnd - 0.05, z0 + pd], 0.07, 0.07);
          }
        }
      }
      wet(pal);
      add(top, 'plywood');
      add(pal, 'pallet');
      surfaceDecal(decals, p, 0.2, 0.62, Math.min(0.85, hw * 0.8), BRAND_UV.wmDark);
      sideDecal(decals, hw + 0.045, 1, L * 0.5, 0.2, 0.3, 0.3, BRAND_UV.stickerRound);
      break;
    }
    case 'plastic': {
      // glossy moulded float kicker: red deck, white edge stripes, dark bumper rails and pontoons
      const top = place(new GB());
      const stripe = Math.min(0.16, W * 0.07);
      top.color(0xffffff);
      surface(top, p, -hw, -hw + stripe);
      surface(top, p, hw - stripe, hw);
      top.color(BRAND.colors.red);
      surface(top, p, -hw + stripe, hw - stripe);
      sideWall(top, p, hw, 1, 0.12, 0.02);
      sideWall(top, p, -hw, -1, 0.12, 0.02);
      backWall(top, def, 0.12, -hw, hw, 0.02);
      add(top, 'plasticGloss');
      const dark = place(new GB());
      dark.color(0x2a2b30);
      for (const sx of [-1, 1]) {
        const rail: P3[] = [];
        for (let i = 0; i <= SEG; i++) rail.push([sx * hw, p.y[i] + 0.005, p.z[i]]);
        dark.tube(rail, 0.045, 7, { caps: 'round' });
        // pontoons at the waterline
        dark.tube(
          [
            [sx * (hw + 0.1), 0.02, -0.25],
            [sx * (hw + 0.1), 0.02, L + 0.2],
          ],
          0.2,
          10,
          { caps: 'round' },
        );
      }
      dark.tube(
        [
          [-hw, 0.02, L + 0.18],
          [hw, 0.02, L + 0.18],
        ],
        0.2,
        10,
        { caps: 'round' },
      );
      // lip bumper
      dark.tube(
        [
          [-hw, H + 0.005, L],
          [hw, H + 0.005, L],
        ],
        0.045,
        7,
        { caps: 'round' },
      );
      dark.color(0x1c1d21);
      dark.boxB(0, -0.5, L / 2, W - 0.1, 0.62, L - 0.1, 'yY');
      add(dark, 'plastic');
      const dw = Math.min(2.2, L * 0.5);
      sideDecal(decals, hw, 1, L * 0.66, H * 0.42, dw, dw / 4, BRAND_UV.wmWhite);
      sideDecal(decals, -hw, -1, L * 0.66, H * 0.42, dw, dw / 4, BRAND_UV.wmWhite);
      surfaceDecal(decals, p, 0.14, 0.57, Math.min(0.95, hw * 0.78), BRAND_UV.wmWhite);
      break;
    }
    default: {
      // concrete / bank / stone: solid cast or built ramps
      const key = def.style === 'stone' ? 'stone' : 'concrete';
      const body = place(new GB());
      const flare = def.style === 'bank' ? 1 : 0;
      body.color(0xffffff, def.style === 'stone' ? 1 : 1.06);
      surface(body, p, -hw, hw);
      body.color(0xffffff, 0.94);
      if (flare) {
        // sloping skirts instead of vertical walls
        for (let i = 0; i < SEG; i++) {
          for (const sx of [-1, 1]) {
            const a: P3 = [sx * (hw + p.y[i] - yB), yB, p.z[i]];
            const c: P3 = [sx * (hw + p.y[i + 1] - yB), yB, p.z[i + 1]];
            const d: P3 = [sx * hw, p.y[i + 1], p.z[i + 1]];
            const e: P3 = [sx * hw, p.y[i], p.z[i]];
            if (sx > 0) body.quad(c, a, e, d);
            else body.quad(a, c, d, e);
          }
        }
        body.quad([-hw - H + yB, yB, L], [hw + H - yB, yB, L], [hw, H, L], [-hw, H, L]);
      } else {
        sideWall(body, p, hw, 1, yB);
        sideWall(body, p, -hw, -1, yB);
        backWall(body, def, yB, -hw, hw);
      }
      wet(body);
      add(body, key);
      const lip = place(new GB());
      lip.color(0xd0d2d6);
      lip.box(0, H + 0.004, L - 0.035, W, 0.01, 0.08);
      lip.box(0, H - 0.035, L + 0.004, W, 0.08, 0.01);
      add(lip, 'metal', false);
      if (!flare) {
        const dw = Math.min(1.7, L * 0.4);
        sideDecal(decals, hw, 1, L * 0.64, H * 0.36, dw, dw / 4, BRAND_UV.wmDark);
        sideDecal(decals, -hw, -1, L * 0.64, H * 0.36, dw, dw / 4, BRAND_UV.wmRed);
        sideDecal(decals, hw, 1, L * 0.9, H * 0.25, 0.26, 0.26, BRAND_UV.stickerStack);
      }
      // painted take-off line near the lip
      const paint = place(new GB());
      paint.color(BRAND.colors.red);
      const k0 = SEG - 2;
      for (let i = k0; i < SEG - 1; i++) {
        paint.quad([-hw, p.y[i] + 0.004, p.z[i]], [hw, p.y[i] + 0.004, p.z[i]], [hw, p.y[i + 1] + 0.004, p.z[i + 1]], [-hw, p.y[i + 1] + 0.004, p.z[i + 1]]);
      }
      add(paint, 'paint', false);
      break;
    }
  }
  add(decals, 'brand', false);

  if (inWater) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const pt = (lx: number, lz: number): [number, number] => [def.pos[0] + lx * c + lz * s, def.pos[2] - lx * s + lz * c];
    b.foam.push({ level, points: [pt(-hw, 0), pt(hw, 0), pt(hw, L), pt(-hw, L)] });
  }
}
