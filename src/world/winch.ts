/**
 * The winch: tube frame on skids + barrow wheels, engine with cooling fins, tank, exhaust, a rope
 * drum with flanges, fairlead, throttle lever and WHY NOT plates.
 *
 * Local frame: +Z points at the rider's start. The rope leaves through the fairlead at
 * (0, GAME.winchAnchorHeight, 0) — exactly winchAnchor(wp) once the group sits on wp.pos.
 */
import { Group, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import { BRAND, GAME } from '../config';
import { BRAND_UV } from './decals';
import type { UVRect } from './decals';
import type { BuildCtx } from './build';
import { GB } from './geo';
import type { P3 } from './geo';

export interface WinchModel {
  readonly group: Group;
  /** Hand targets for the operator, in winch-local space. */
  readonly throttleHand: Vector3;
  readonly restHand: Vector3;
  /** Where the operator stands (local) . */
  readonly operatorPos: Vector3;
  /** reelSpeed m/s, tension 0..1, running = engine on. */
  update(dt: number, time: number, reelSpeed: number, tension: number, running: boolean): void;
}

const AH = GAME.winchAnchorHeight;
const DRUM_Y = 0.6;
const DRUM_Z = -0.4;
const COIL_R = 0.19;

function plate(g: GB, x: number, side: number, zc: number, yc: number, w: number, h: number, uv: UVRect): void {
  const xx = x + side * 0.004;
  if (side > 0) g.quadUV([xx, yc - h / 2, zc + w / 2], [xx, yc - h / 2, zc - w / 2], [xx, yc + h / 2, zc - w / 2], [xx, yc + h / 2, zc + w / 2], uv[0], uv[1], uv[2], uv[3]);
  else g.quadUV([xx, yc - h / 2, zc - w / 2], [xx, yc - h / 2, zc + w / 2], [xx, yc + h / 2, zc + w / 2], [xx, yc + h / 2, zc - w / 2], uv[0], uv[1], uv[2], uv[3]);
}

export function createWinch(b: BuildCtx, override: Object3D | null = null): WinchModel {
  const group = new Group();
  group.name = 'winch';
  const throttleHand = new Vector3(0.24, 1.03, -1.22);
  const restHand = new Vector3(-0.2, 1.0, -1.26);
  const operatorPos = new Vector3(0.12, 0, -1.56);

  if (override) {
    // GLB override: use it as is; a child named "drum" still spins.
    group.add(override);
    const drum = override.getObjectByName('drum') ?? null;
    return {
      group,
      throttleHand,
      restHand,
      operatorPos,
      update(dt, _time, reelSpeed) {
        if (drum) drum.rotation.x -= (reelSpeed / COIL_R) * dt;
      },
    };
  }

  const red = BRAND.colors.red;
  const T = 0.022;
  const seg = b.profile.detail >= 0.75 ? 8 : 6;

  // ── frame (painted) ──
  const f = new GB();
  f.color(red);
  const tube = (pts: P3[], r = T): void => {
    f.tube(pts, r, seg, { caps: 'round', fillet: 0.05 });
  };
  for (const sx of [-1, 1]) {
    const x = sx * 0.35;
    // skid runner with an upturned nose, continuing into the rear handle
    tube([
      [x, 0.2, 0.2],
      [x, 0.03, 0.08],
      [x, 0.03, -1.0],
      [x, 0.62, -1.0],
      [x * 0.75, 1.0, -1.26],
    ]);
    // cage: front upright + top rail
    tube([
      [x, 0.03, -0.08],
      [x, 0.62, -0.08],
      [x, 0.62, -1.0],
    ]);
    // tower up to the fairlead
    tube([
      [x, 0.62, -0.08],
      [sx * 0.13, AH + 0.08, 0],
    ]);
    tube([
      [x, 0.62, -0.62],
      [sx * 0.13, AH + 0.08, 0],
    ]);
    // diagonal brace
    tube(
      [
        [x, 0.05, -0.1],
        [x, 0.6, -0.55],
      ],
      T * 0.8,
    );
  }
  for (const [y, z] of [
    [0.03, 0.06],
    [0.03, -0.55],
    [0.03, -1.0],
    [0.62, -1.0],
    [0.62, -0.08],
  ] as const) {
    tube([
      [-0.35, y, z],
      [0.35, y, z],
    ]);
  }
  // handle cross bar with grips
  tube([
    [-0.26, 1.0, -1.26],
    [0.26, 1.0, -1.26],
  ]);
  f.color(0x1c1d21);
  for (const sx of [-1, 1]) f.rod([sx * 0.16, 1.0, -1.26], [sx * 0.3, 1.0, -1.26], 0.03, seg, true);
  // fairlead frame
  f.color(0x2a2b30);
  f.box(0, AH + 0.085, 0, 0.3, 0.03, 0.05);
  f.box(0, AH - 0.085, 0, 0.3, 0.03, 0.05);
  f.box(-0.14, AH, 0, 0.03, 0.2, 0.05);
  f.box(0.14, AH, 0, 0.03, 0.2, 0.05);
  // engine deck + drum bearing blocks
  f.color(0x2a2b30);
  f.box(0, 0.19, -0.82, 0.66, 0.02, 0.4);
  for (const sx of [-1, 1]) f.boxB(sx * 0.27, DRUM_Y - 0.07, DRUM_Z, 0.07, 0.14, 0.12);
  for (const sx of [-1, 1]) f.beam([sx * 0.27, 0.62, -0.08], [sx * 0.27, DRUM_Y, DRUM_Z], 0.04, 0.04);
  // belt guard on the −X side (engine shaft → drum axle)
  f.color(0x1c1d21);
  f.beam([-0.31, 0.36, -0.86], [-0.31, DRUM_Y, DRUM_Z], 0.05, 0.17);
  f.push().translate(-0.31, DRUM_Y, DRUM_Z).rotZ(Math.PI / 2).cyl(0, -0.025, 0, 0.1, 0.1, 0.05, 12, true, true);
  f.pop();
  f.push().translate(-0.31, 0.36, -0.86).rotZ(Math.PI / 2).cyl(0, -0.025, 0, 0.085, 0.085, 0.05, 12, true, true);
  f.pop();
  // fuel tank: glossy dark, sits over the engine
  f.color(0x1c1d21);
  f.sphere(0.02, 0.66, -0.86, 0.19, 0.085, 0.15, 12, 6);
  f.color(0xd0d2d6);
  f.cyl(0.08, 0.735, -0.86, 0.03, 0.03, 0.03, 8, true);
  // barrow wheels
  for (const sx of [-1, 1]) {
    f.push().translate(sx * 0.44, 0.15, -1.0).rotZ(Math.PI / 2);
    f.color(0x1a1a1c);
    f.lathe(
      0,
      0,
      [
        [0.085, -0.04],
        [0.14, -0.045],
        [0.15, -0.02],
        [0.15, 0.02],
        [0.14, 0.045],
        [0.085, 0.04],
      ],
      14,
    );
    f.color(0xe9e9e6);
    f.cyl(0, -0.035, 0, 0.086, 0.086, 0.07, 12, true, true);
    f.pop();
    f.color(0x2a2b30);
    f.rod([sx * 0.35, 0.15, -1.0], [sx * 0.47, 0.15, -1.0], 0.014, 6, true);
  }
  // ground straps + stakes
  f.color(0x24252a);
  for (const sx of [-1, 1]) {
    f.rod([sx * 0.35, 0.6, -0.08], [sx * 0.95, 0.05, 0.5], 0.008, 4, false);
    f.color(0xb9bcc2);
    f.cyl(sx * 0.95, 0, 0.5, 0.012, 0.012, 0.16, 5, true);
    f.color(0x24252a);
  }
  // jerrycan + toolbox beside the winch
  f.color(red, 0.9);
  f.chamferBox(0.72, 0, -0.75, 0.16, 0.42, 0.32, 0.03);
  f.color(0x1c1d21);
  f.box(0.72, 0.45, -0.75, 0.05, 0.05, 0.16);
  f.color(0x3a3c43);
  f.chamferBox(-0.74, 0, -0.5, 0.24, 0.2, 0.46, 0.02);
  const frame = new Mesh(f.build(), b.mat('paintedMetal'));
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  // ── brand plates ──
  const d = new GB();
  plate(d, 0.372, 1, -0.54, 0.36, 0.84, 0.21, BRAND_UV.plateRed);
  plate(d, -0.372, -1, -0.38, 0.2, 0.52, 0.13, BRAND_UV.plateRed);
  plate(d, -0.335, -1, -0.63, 0.48, 0.4, 0.1, BRAND_UV.wmWhite);
  // tank logo (flat on top is unreadable → both flanks)
  plate(d, 0.2, 1, -0.86, 0.66, 0.24, 0.06, BRAND_UV.wmWhite);
  plate(d, 0.8, 1, -0.75, 0.24, 0.2, 0.2, BRAND_UV.stickerRound);
  // side panels behind the plates
  const panel = new GB();
  panel.color(0x1c1d21);
  panel.box(0.366, 0.36, -0.54, 0.008, 0.26, 0.9);
  panel.box(-0.366, 0.2, -0.38, 0.008, 0.17, 0.56);
  frame.geometry.dispose();
  const f2 = new GB().append(f).append(panel);
  frame.geometry = f2.build();
  const decals = new Mesh(d.build(), b.mat('brand'));
  decals.receiveShadow = true;
  group.add(decals);

  // ── engine (shakes) ──
  const engine = new Group();
  engine.position.set(0.02, 0.2, -0.82);
  const e = new GB();
  e.color(0x8f9399);
  e.chamferBox(0, 0, 0, 0.3, 0.2, 0.3, 0.025);
  // cylinder with cooling fins
  e.color(0xb9bdc4);
  e.cyl(0.02, 0.2, 0.02, 0.07, 0.07, 0.2, 10, true);
  for (let i = 0; i < 8; i++) e.box(0.02, 0.215 + i * 0.022, 0.02, 0.22, 0.007, 0.2);
  e.color(0x6d7178);
  e.box(0.02, 0.405, 0.02, 0.16, 0.03, 0.14);
  // recoil starter housing + air filter
  e.color(0x1c1d21);
  e.push().translate(0.16, 0.11, 0).rotZ(-Math.PI / 2).cyl(0, 0, 0, 0.115, 0.1, 0.06, 14, true);
  e.pop();
  e.color(red);
  e.push().translate(0.222, 0.11, 0).rotZ(-Math.PI / 2).cyl(0, 0, 0, 0.05, 0.05, 0.008, 10, true);
  e.pop();
  e.color(0x24252a);
  e.chamferBox(-0.02, 0.2, -0.16, 0.16, 0.12, 0.1, 0.02);
  // exhaust: header pipe + muffler
  e.color(0x7a6a5a);
  e.tube(
    [
      [0.02, 0.32, 0.1],
      [0.02, 0.34, 0.2],
      [-0.12, 0.3, 0.22],
    ],
    0.02,
    6,
    { caps: 'none', fillet: 0.04 },
  );
  e.color(0x5c5048);
  e.rod([-0.12, 0.3, 0.22], [-0.3, 0.3, 0.22], 0.055, 10, true);
  e.color(0x16161a);
  e.rod([-0.3, 0.3, 0.22], [-0.335, 0.3, 0.22], 0.018, 6, true);
  const engineMesh = new Mesh(e.build(), b.mat('metal'));
  engineMesh.castShadow = true;
  engine.add(engineMesh);
  group.add(engine);

  // ── drum (spins about X) ──
  const drum = new Group();
  drum.name = 'drum';
  drum.position.set(0, DRUM_Y, DRUM_Z);
  const dr = new GB();
  dr.push().rotZ(-Math.PI / 2);
  dr.color(0xc4c7cc);
  for (const sx of [-1, 1]) {
    dr.cyl(0, sx * 0.165 - 0.008, 0, 0.26, 0.26, 0.016, 20, true, true);
    // lightening holes + hub so the rotation reads
    dr.color(0x15161a);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      dr.disc(Math.sin(a) * 0.165, sx * 0.165 + sx * 0.0085, Math.cos(a) * 0.165, 0.042, 8, sx);
    }
    dr.color(0xe30613);
    dr.cyl(0, sx * 0.165 + (sx > 0 ? 0.008 : -0.03), 0, 0.055, 0.055, 0.022, 10, true, true);
    dr.color(0xc4c7cc);
  }
  dr.color(0x55585e);
  dr.cyl(0, -0.27, 0, 0.022, 0.022, 0.54, 8, true, true);
  dr.pop();
  const drumMesh = new Mesh(dr.build(), b.mat('metal'));
  drumMesh.castShadow = true;
  drum.add(drumMesh);
  const coil = new GB();
  coil.push().rotZ(-Math.PI / 2);
  coil.white();
  // slightly barrelled coil of rope; U runs around → texture strands read as windings
  const prof: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push([COIL_R * (0.9 + 0.1 * Math.sin(t * Math.PI)), -0.155 + t * 0.31]);
  }
  coil.lathe(0, 0, prof, 18);
  coil.pop();
  // lathe maps U around the circumference and V along the axis; the rope texture wants U along the rope
  const coilMesh = new Mesh(coil.build(), b.mat('rope', { repeat: [0.16, 0.022] }));
  coilMesh.castShadow = true;
  drum.add(coilMesh);
  group.add(drum);

  // rope stub: drum top → fairlead, and fairlead rollers
  const s = new GB();
  s.white();
  s.uvSwap = false;
  s.tube(
    [
      [0, DRUM_Y + COIL_R - 0.01, DRUM_Z + 0.02],
      [0, AH, 0],
    ],
    0.011,
    5,
    { caps: 'none', swapUV: true },
  );
  const stub = new Mesh(s.build(), b.mat('rope', { repeat: [0.16, 0.07] }));
  group.add(stub);
  const r = new GB();
  r.color(0xd8dade);
  for (const sx of [-1, 1]) r.cyl(sx * 0.045, AH - 0.07, 0, 0.022, 0.022, 0.14, 8, true, true);
  r.rod([-0.125, AH + 0.05, 0], [0.125, AH + 0.05, 0], 0.02, 8, true);
  r.rod([-0.125, AH - 0.05, 0], [0.125, AH - 0.05, 0], 0.02, 8, true);
  const rollers = new Mesh(r.build(), b.mat('metal'));
  group.add(rollers);

  // ── throttle lever (pivot on the handle bar) ──
  const lever = new Group();
  lever.position.set(0.24, 1.0, -1.26);
  const l = new GB();
  l.color(0x2a2b30);
  l.box(0, 0.02, 0, 0.03, 0.04, 0.05);
  l.color(0xd8dade);
  l.rod([0, 0.03, 0], [0, 0.05, 0.13], 0.008, 5, true);
  l.color(red);
  l.sphere(0, 0.052, 0.14, 0.02, 0.02, 0.02, 7, 5);
  const leverMesh = new Mesh(l.build(), b.mat('paintedMetal'));
  lever.add(leverMesh);
  group.add(lever);

  let throttle = 0;
  return {
    group,
    throttleHand,
    restHand,
    operatorPos,
    update(dt, time, reelSpeed, tension, running) {
      drum.rotation.x -= (reelSpeed / COIL_R) * dt;
      const target = running ? Math.min(1, 0.15 + reelSpeed / 12) : 0;
      throttle += (target - throttle) * Math.min(1, dt * 6);
      lever.rotation.x = -0.15 - throttle * 0.6;
      // engine vibration: idle rattle + load
      const amp = running ? 0.0016 + tension * 0.0035 + throttle * 0.0015 : 0;
      engine.position.set(0.02 + Math.sin(time * 71) * amp, 0.2 + Math.sin(time * 93 + 1.3) * amp * 1.4, -0.82 + Math.sin(time * 57 + 0.4) * amp * 0.6);
      engine.rotation.z = Math.sin(time * 83) * amp * 2.2;
    },
  };
}
