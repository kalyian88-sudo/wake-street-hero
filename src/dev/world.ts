/**
 * WORLD sandbox — builds a spot through buildSpotWorld with a real renderer and offers fixed cameras.
 *
 *   ?spot=phuket_oldtown  ?winch=main|left|right  ?quality=low|medium|high  ?lang=ru|en
 *   ?cam=chase&z=40          in-game viewpoint: 6 m behind / 3 m above the line point at z, FOV 70
 *   ?cam=orbit[&z=..&a=deg&r=..&h=..]   ?cam=top   ?cam=winch[&a=deg]
 *   ?cam=obstacle&id=<obstacleId>[&a=deg&d=dist]   ?cam=letter&i=0..5
 *   ?cam=free&pos=x,y,z&look=x,y,z[&fov=..]
 *   ?debug=1      hitbox overlay generated from the shared geometry helpers (not from the sim)
 *   ?preview=1    line preview on        ?rider=0   hide the placeholder rider + rope
 *   ?slack=<m>&tension=<0..1>  rope state     ?t=<s>  freeze the animation time
 * window.__stats = { calls, triangles, … } (renderer.info of the last frame), window.__world = ISpotWorld.
 */
import * as THREE from 'three';
import { QUALITY_PROFILES } from '../config';
import { EventBus } from '../core/events';
import { createRiderSimState } from '../core/riderState';
import { footprintOutline, kickerProfile, ledgeBox, ledgeEdges, lineInfo, stairsLayout, wallNormal, winchAnchor, DEG } from '../data/geometry';
import { SPOTS, getSpot } from '../data/spots';
import type { CollisionDebugShape, QualityLevel, SpotDef } from '../types';
import { buildSpotWorld } from '../world/SpotWorld';
import { obstacleFocus } from '../world/obstacles';
import { listPropTypes } from '../world/props/registry';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => (q.has(k) ? Number(q.get(k)) : d);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const info = document.getElementById('info') as HTMLDivElement;
const W = window as unknown as Record<string, unknown>;

const quality = (q.get('quality') ?? 'medium') as QualityLevel;
const profile = QUALITY_PROFILES[quality] ?? QUALITY_PROFILES.medium;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.dprCap));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = profile.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, profile.drawDistance + 400);
const bus = new EventBus();
const spot: SpotDef = q.get('spot') ? getSpot(q.get('spot') as string) : SPOTS[0];

/** Hitbox outlines straight from src/data/geometry.ts — lets us compare the picture with the shared helpers. */
function helperShapes(s: SpotDef): CollisionDebugShape[] {
  const out: CollisionDebugShape[] = [];
  for (const o of s.obstacles) {
    if (o.kind === 'kicker') {
      const pts: number[] = [];
      const c = Math.cos((o.rot ?? 0) * DEG);
      const sn = Math.sin((o.rot ?? 0) * DEG);
      const at = (lx: number, t: number): void => {
        const lz = t * o.length;
        pts.push(o.pos[0] + lx * c + lz * sn, o.pos[1] + o.height * kickerProfile(o.curve ?? 0.5, t), o.pos[2] - lx * sn + lz * c);
      };
      for (let i = 0; i <= 10; i++) at(-o.width / 2, i / 10);
      for (let i = 10; i >= 0; i--) at(o.width / 2, i / 10);
      out.push({ kind: 'ramp', color: 0x7ad957, points: pts, label: o.id });
    } else if (o.kind === 'ledge') {
      const e = ledgeEdges(o);
      const bx = ledgeBox(o);
      for (const k of ['left', 'right'] as const) out.push({ kind: 'line', color: 0xffb300, points: [...e[k][0], ...e[k][1]], label: o.id });
      const fp = footprintOutline({ kind: 'rect', center: [bx.center[0], bx.center[2]], size: [bx.size[0], bx.size[2]], rot: bx.rot });
      out.push({ kind: 'box', color: 0xffb300, points: fp.flatMap(([x, z]) => [x, bx.top, z]), label: o.id });
    } else if (o.kind === 'rail') {
      const r = o.radius ?? 0.04;
      out.push({ kind: 'line', color: 0xe30613, points: o.path.flatMap((p) => [p[0], p[1] + r, p[2]]), label: o.id });
    } else if (o.kind === 'wall') {
      const [nx, nz] = wallNormal(o);
      const back = Math.tan((o.lean ?? 0) * DEG) * o.height;
      out.push({ kind: 'wall', color: 0xb967ff, points: [...o.a, ...o.b, o.b[0] - nx * back, o.b[1] + o.height, o.b[2] - nz * back, o.a[0] - nx * back, o.a[1] + o.height, o.a[2] - nz * back], label: o.id });
    } else if (o.kind === 'stairs') {
      const l = stairsLayout(o);
      for (const st of l.steps) {
        const fp = footprintOutline({ kind: 'rect', center: st.center, size: st.size, rot: st.rot });
        out.push({ kind: 'box', color: 0xc9a35a, points: fp.flatMap(([x, z]) => [x, st.top, z]), label: o.id });
      }
      for (const rail of l.rails) out.push({ kind: 'line', color: 0xe30613, points: rail.flatMap((p) => [p[0], p[1] + 0.03, p[2]]), label: o.id });
    } else if (o.kind === 'gap') {
      out.push({ kind: 'poly', color: 0xffe14d, points: footprintOutline(o.shape).flatMap(([x, z]) => [x, 0.3, z]), label: o.id });
    }
  }
  for (const g of s.ground) {
    const fp = footprintOutline({ kind: 'rect', center: g.center, size: g.size, rot: g.rot });
    out.push({ kind: 'box', color: 0x9aa3ad, points: fp.flatMap(([x, z]) => [x, g.top, z]), label: g.id });
  }
  for (const w of s.winchPoints) {
    const a = winchAnchor(w);
    out.push({ kind: 'line', color: 0xffffff, points: [...w.start, ...a], label: w.id });
  }
  return out;
}

async function main(): Promise<void> {
  const t0 = performance.now();
  const world = await buildSpotWorld(spot, { renderer, scene, camera, profile, bus });
  const buildMs = performance.now() - t0;
  W.__world = world;
  W.__bus = bus;
  W.__scene = scene;
  W.__props = listPropTypes();

  const winchId = q.get('winch') ?? spot.winchPoints[0].id;
  world.setWinchPoint(winchId);
  const wp = spot.winchPoints.find((w) => w.id === winchId) ?? spot.winchPoints[0];
  const li = lineInfo(wp);
  if (q.get('debug')) world.setDebug(true, helperShapes(spot));
  if (q.get('preview')) world.setLinePreview(true);
  if (q.get('letters')) world.setLetters(q.get('letters')!.split('').map((c) => c === '1'));

  // point on the line at world z (or by fraction when the line does not advance in z)
  const linePoint = (z: number, out: THREE.Vector3): THREE.Vector3 => {
    const dz = wp.pos[2] - wp.start[2];
    const t = Math.abs(dz) > 1e-3 ? (z - wp.start[2]) / dz : 0;
    return out.set(wp.start[0] + (wp.pos[0] - wp.start[0]) * t, wp.start[1], wp.start[2] + dz * t);
  };

  // placeholder rider so the rope, the wake and the scale can be judged
  const state = createRiderSimState();
  const showRider = q.get('rider') !== '0';
  const dummy = new THREE.Group();
  if (showRider) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.15, 4, 10), new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 0.7 }));
    body.position.y = 0.95;
    body.castShadow = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 1.38), new THREE.MeshStandardMaterial({ color: 0xe30613, roughness: 0.4 }));
    board.position.y = 0.03;
    board.castShadow = true;
    dummy.add(body, board);
    scene.add(dummy);
  }

  const cam = q.get('cam') ?? 'chase';
  const P = new THREE.Vector3();
  const look = new THREE.Vector3();
  let active: THREE.Camera = camera;
  const z = num('z', 20);
  linePoint(z, P);
  state.pos.copy(P);
  state.mode = 'water';
  state.surface = 'water';
  state.heading = li.yaw;
  state.boardYaw = li.yaw;
  state.speed = num('speed', 9.5);
  state.vel.set(li.dx * state.speed, 0, li.dz * state.speed);
  state.lean = num('lean', 0);
  state.rope.holding = true;
  state.rope.tension = num('tension', 0.6);
  state.rope.taut = state.rope.tension > 0.1;
  state.rope.slack = num('slack', 0);
  state.rope.reelSpeed = state.speed;
  state.rope.handlePos.set(P.x + li.dx * 0.75, P.y + 1.05, P.z + li.dz * 0.75);
  const a = winchAnchor(wp);
  state.rope.anchorPos.set(a[0], a[1], a[2]);
  dummy.position.copy(P);
  dummy.rotation.y = li.yaw;

  const ang = num('a', 35) * DEG;
  if (cam === 'chase') {
    camera.fov = num('fov', 70);
    camera.position.set(P.x - li.dx * 6, P.y + 3, P.z - li.dz * 6);
    look.set(P.x + li.dx * 9, P.y + 1.3, P.z + li.dz * 9);
  } else if (cam === 'orbit') {
    const r = num('r', 46);
    camera.fov = num('fov', 50);
    camera.position.set(P.x + Math.sin(ang) * r, num('h', 20), P.z - Math.cos(ang) * r);
    look.set(P.x, 1, P.z);
  } else if (cam === 'top') {
    const b = spot.bounds;
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[1] + b.max[1]) / 2;
    const hw = (b.max[0] - b.min[0]) / 2 + 14;
    const hh = (b.max[1] - b.min[1]) / 2 + 8;
    // fit the spot into the viewport, long axis vertical
    const aspect = innerWidth / innerHeight;
    const half = Math.max(hh, hw / aspect);
    const oc = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 1, 500);
    oc.position.set(cx, 200, cz);
    oc.up.set(0, 0, 1);
    oc.lookAt(cx, 0, cz);
    active = oc;
  } else if (cam === 'winch') {
    const d = num('d', 4.2);
    camera.fov = num('fov', 45);
    const yaw = li.yaw + Math.PI + ang;
    camera.position.set(wp.pos[0] + Math.sin(yaw) * d, wp.pos[1] + num('h', 1.7), wp.pos[2] + Math.cos(yaw) * d);
    look.set(wp.pos[0] - li.dx * 0.5, wp.pos[1] + 0.85, wp.pos[2] - li.dz * 0.5);
  } else if (cam === 'obstacle') {
    const o = spot.obstacles.find((x) => x.id === q.get('id')) ?? spot.obstacles[0];
    const f = obstacleFocus(o);
    const d = num('d', f.r * 1.5 + 2.6);
    camera.fov = num('fov', 50);
    camera.position.set(f.x + Math.sin(ang) * d, f.y + num('h', f.r * 0.45 + 1.3), f.z - Math.cos(ang) * d);
    look.set(f.x, f.y, f.z);
  } else if (cam === 'letter') {
    const l = spot.letters[num('i', 0)] ?? spot.letters[0];
    camera.fov = num('fov', 50);
    camera.position.set(l.pos[0] + 1.6, l.pos[1] + 0.9, l.pos[2] - 4.2);
    look.set(l.pos[0], l.pos[1], l.pos[2]);
  } else {
    const p = (q.get('pos') ?? '0,6,-10').split(',').map(Number);
    const l = (q.get('look') ?? '0,1,20').split(',').map(Number);
    camera.fov = num('fov', 60);
    camera.position.set(p[0], p[1], p[2]);
    look.set(l[0], l[1], l[2]);
  }
  if (active === camera) {
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }

  const onResize = (): void => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', onResize);

  const frozen = q.has('t') ? num('t', 0) : null;
  let last = performance.now();
  let time = frozen ?? 0;
  let frames = 0;
  renderer.info.autoReset = false;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (frozen === null) time += dt;
    world.update(frozen === null ? dt : 0.016, time, { rider: showRider ? state : null, camera });
    renderer.info.reset();
    renderer.render(scene, active);
    frames++;
    const r = renderer.info.render;
    const stats = { calls: r.calls, triangles: r.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, frames, buildMs: Math.round(buildMs) };
    W.__stats = stats;
    if (frames % 10 === 1) info.textContent = `${spot.id} · ${winchId} · ${cam} z=${z} · ${quality}\ncalls ${r.calls} · tris ${(r.triangles / 1000).toFixed(1)}k · build ${stats.buildMs} ms`;
  });
  W.__ready = true;
}

main().catch((e) => {
  console.error(e);
  info.textContent = String(e);
});
