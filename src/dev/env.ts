/**
 * Sandbox for the environment / water / particles module.
 *
 *   /dev/env.html?env=golden|day|sunset|night|overcast &q=low|medium|high &cam=chase|low|top|side
 *                &t=<seconds to pre-simulate> &freeze (stop time after the pre-sim → deterministic shots)
 *                &slow=<time scale> &style=canal|pool|flood|river|paddy|fountain &info
 *
 * Reference canal: 14 m of water between quays at +0.9 m, a few things standing in the water, a dummy
 * rider weaving down the canal at ~9 m/s with periodic hops, splashes, ripples, sparks and dust.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { QUALITY_PROFILES } from '../config';
import { EventBus } from '../core/events';
import { seededRng } from '../data/geometry';
import { phuketOldTown } from '../data/spots/phuket_oldtown';
import type { EnvDef, FoamShape, QualityLevel, WakeSource, WaterRegionDef, WorldBuildContext } from '../types';
import { createEnvironment } from '../world/env/Environment';
import { createParticles } from '../world/env/Particles';
import { createWater } from '../world/env/Water';
import { ENV_PRESETS } from '../world/env/presets';
import { getCloudTexture, getWaveTexture } from '../world/env/textures';

const params = new URLSearchParams(location.search);
const envName = (params.get('env') ?? 'golden') as EnvDef['timeOfDay'];
const quality = (params.get('q') ?? 'medium') as QualityLevel;
const camMode = params.get('cam') ?? 'chase';
const preSim = Number(params.get('t') ?? 6);
const freeze = params.has('freeze');
const timeScale = Number(params.get('slow') ?? 1);
const style = (params.get('style') ?? 'canal') as NonNullable<WaterRegionDef['style']>;

const def: EnvDef = envName === 'golden' ? phuketOldTown.env : (ENV_PRESETS[envName] ?? ENV_PRESETS.golden);
const profile = QUALITY_PROFILES[quality] ?? QUALITY_PROFILES.medium;
const night = def.timeOfDay === 'night';

// ───────────────────────────────────────────────────────────── renderer ──
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !profile.post, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = profile.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.dprCap));
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, profile.drawDistance);
const ctx: WorldBuildContext = { renderer, scene, camera, profile, bus: new EventBus() };

// ───────────────────────────────────────────────────── env / water / fx ──
const env = createEnvironment(def, ctx);
env.attach(scene, renderer);
scene.add(env.object);

const regions: WaterRegionDef[] = [{ id: 'canal', shape: { kind: 'rect', center: [0, 80], size: [14, 190] }, level: 0, depth: 1.6, style }];
const water = createWater(regions, env, ctx);
scene.add(water.object);
const particles = createParticles(env, ctx);
scene.add(particles.object);

// ─────────────────────────────────────────────────────────── test scene ──
const rng = seededRng(7);
const std = (color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const shadowed = <T extends THREE.Mesh>(m: T, cast = true): T => {
  m.castShadow = cast;
  m.receiveShadow = true;
  scene.add(m);
  return m;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, cast = true): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return shadowed(m, cast);
};

const stone = std(0x9c968a, 0.9);
const kerb = std(0xc9c3b6, 0.8);
const foamShapes: FoamShape[] = [];
const rectShape = (cx: number, cz: number, w: number, d: number): FoamShape => ({
  points: [
    [cx - w / 2, cz - d / 2],
    [cx + w / 2, cz - d / 2],
    [cx + w / 2, cz + d / 2],
    [cx - w / 2, cz + d / 2],
  ],
  level: 0,
});

// quays (top at +0.9) + canal bed
for (const side of [-1, 1]) {
  box(15, 3, 190, side * 14.5, -0.6, 80, stone);
  box(0.5, 0.14, 190, side * 7.25, 0.97, 80, kerb);
  foamShapes.push(rectShape(side * 14.5, 80, 15, 190));
}
box(44, 3, 14, 0, -0.6, 182, stone);
box(44, 3, 10, 0, -0.6, -20, stone);
foamShapes.push(rectShape(0, 182, 44, 14), rectShape(0, -20, 44, 10));
box(60, 0.2, 230, 0, -1.7, 80, std(0x3b4038, 1), false);

// shophouse-ish rows on both quays: pastel bodies, terracotta roofs, dark arcades, window grid
const pastel = [0xf0d9a2, 0xe9b9a9, 0xc2dccb, 0xf2ecdb, 0xadc9de, 0xe4a970, 0xd9c7e4];
const windowMat = new THREE.MeshStandardMaterial({ color: 0x1d2630, roughness: 0.25, metalness: 0.2, emissive: night ? 0xffb36b : 0x000000, emissiveIntensity: night ? 1.6 : 0 });
const roofMat = std(0xa4583c, 0.8);
const arcadeMat = std(0x4a4038, 0.9);
const neonColors = [0xff1744, 0x18d8ff, 0xff7a18, 0xe30613, 0xb04bff];
for (const side of [-1, 1]) {
  let z = -18;
  while (z < 186) {
    const w = 6 + rng() * 4;
    const h = 7 + rng() * 5.5;
    const x = side * (17.6 + rng() * 0.8);
    const body = std(pastel[Math.floor(rng() * pastel.length)], 0.92);
    box(8, h, w - 0.15, x, 0.9 + h / 2, z + w / 2, body);
    box(8.8, 0.5, w + 0.2, x, 0.9 + h + 0.25, z + w / 2, roofMat);
    box(0.3, 2.6, w - 0.8, x - side * 3.95, 0.9 + 1.3, z + w / 2, arcadeMat, false);
    const floors = Math.floor((h - 3.2) / 2.6);
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < 3; k++) {
        if (night && rng() < 0.45) continue;
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.9), windowMat);
        win.position.set(x - side * 4.02, 0.9 + 4.2 + f * 2.6, z + w * (0.22 + 0.28 * k));
        scene.add(win);
      }
    }
    if (night && rng() < 0.75) {
      // neon tube over the arcade — emissive only, the bloom does the rest
      const neon = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.16, w * 0.7),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: neonColors[Math.floor(rng() * neonColors.length)], emissiveIntensity: 9 }),
      );
      neon.position.set(x - side * 4.1, 0.9 + 3.0 + rng() * 0.6, z + w / 2);
      scene.add(neon);
    }
    z += w;
  }
}

// things standing in the water
const concrete = std(0x8f9296, 0.75);
const steel = std(0xb9bec6, 0.35, 0.9);
const red = std(0xe30613, 0.4, 0.3);
const rails: { x: number; z0: number; z1: number }[] = [];
for (let i = 0; i < 6; i++) {
  const z = 18 + i * 27;
  const s = i % 2 ? 1 : -1;
  // ledge block near one bank
  box(1.2, 1.4, 7, s * 5.2, -0.15, z, concrete);
  foamShapes.push(rectShape(s * 5.2, z, 1.2, 7));
  // two posts + a rail on the other side
  for (const dz of [-4, 4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2, 14), concrete);
    post.position.set(-s * 4.4, -0.4, z + dz);
    shadowed(post);
    const pts: [number, number][] = [];
    for (let k = 0; k < 12; k++) pts.push([-s * 4.4 + Math.cos((k / 12) * Math.PI * 2) * 0.22, z + dz + Math.sin((k / 12) * Math.PI * 2) * 0.22]);
    foamShapes.push({ points: pts, level: 0 });
  }
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 8.6, 10), i % 2 ? red : steel);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(-s * 4.4, 0.62, z);
  shadowed(rail);
  rails.push({ x: -s * 4.4, z0: z - 4.3, z1: z + 4.3 });
  // a kicker wedge in the middle, every other bay
  if (i % 2 === 0) {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(4.4, 0), new THREE.Vector2(4.4, 1.2), new THREE.Vector2(0, -0.1)]);
    const wedge = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false }), std(0xb98a55, 0.8));
    wedge.rotation.y = -Math.PI / 2;
    wedge.position.set(1.2, 0, z + 9);
    shadowed(wedge);
    foamShapes.push(rectShape(0, z + 11.2, 2.4, 4.4));
  }
}
water.setFoamShapes(foamShapes);

// dummy rider: board + body, enough to cast a shadow and give scale
const rider = new THREE.Group();
const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 1.38), red);
board.position.y = 0.03;
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.95, 4, 10), std(0x1c1d21, 0.7));
body.position.y = 0.95;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), std(0xe9bd97, 0.6));
head.position.y = 1.72;
for (const m of [board, body, head]) {
  m.castShadow = true;
  m.receiveShadow = true;
  rider.add(m);
}
scene.add(rider);

// ───────────────────────────────────────────────────────────────── sim ──
const SPEED = 9.2;
const LOOP = 150;
const pos = new THREE.Vector3();
const vel = new THREE.Vector3();
const wake: WakeSource = { pos, vel, speed: SPEED, onWater: true, lean: 0 };
const tmp = new THREE.Vector3();
const dir = new THREE.Vector3();
const focus = new THREE.Vector3();
let simTime = 0;
let wasAir = false;
let lastDrop = 0;
let lapBreak = false;

function riderAt(t: number): void {
  const z = -2 + ((t * SPEED) % LOOP);
  const w = 0.75;
  pos.set(3.3 * Math.sin(w * t), 0, z);
  vel.set(3.3 * w * Math.cos(w * t), 0, SPEED);
  wake.speed = Math.hypot(vel.x, vel.z);
  // lean > 0 = towards the rider's right (−X): opposite to the lateral acceleration towards +X
  wake.lean = THREE.MathUtils.clamp((3.3 * w * w * Math.sin(w * t)) / 1.7, -1, 1);
  // a hop every 5.5 s
  const ht = (t + 1.2) % 5.5;
  const air = ht < 0.86;
  pos.y = air ? Math.max(0, 4.2 * ht - 4.905 * ht * ht) : 0;
  vel.y = air ? 4.2 - 9.81 * ht : 0;
  wake.onWater = !air;
}

function step(dt: number): void {
  const prevZ = pos.z;
  simTime += dt;
  riderAt(simTime);
  lapBreak = pos.z < prevZ - 10;
  rider.position.copy(pos);
  rider.rotation.set(0, Math.atan2(vel.x, vel.z), -wake.lean * 0.42);

  if (dt > 0) {
    const air = !wake.onWater;
    if (air && !wasAir) particles.splash(pos, 0.7, 'pop');
    if (!air && wasAir) {
      particles.splash(pos, 0.9, 'land');
      water.ripple(pos, 0.9);
    }
    wasAir = air;
    if (air) particles.drips(tmp.copy(pos).setY(pos.y + 0.1), vel, 0.8);

    // edge spray: thrown to the outside of the turn (opposite to the lean)
    const carve = Math.abs(wake.lean);
    if (!air && carve > 0.25) {
      const sideSign = wake.lean > 0 ? 1 : -1; // +X = rider's left
      dir.set(sideSign * 0.85, 0.3, -0.45);
      particles.spray(tmp.set(pos.x + sideSign * 0.22, 0.02, pos.z - 0.35), dir, (carve - 0.25) / 0.75);
    }
    // rooster tail at speed
    if (!air) particles.spray(tmp.set(pos.x, 0.02, pos.z - 0.75), dir.set(0, 0.5, -0.6), 0.22);

    // sparks while passing a rail, dust on the kerb next to it
    for (const r of rails) {
      if (pos.z > r.z0 && pos.z < r.z1) {
        particles.sparks(tmp.set(r.x, 0.68, pos.z), dir.set(0, 0.25, 1), 0.8);
        particles.dust(tmp.set(Math.sign(r.x) * 7.6, 0.95, pos.z), 0.8, (Math.floor(r.z0) & 1) === 0);
      }
    }
    // something drops into the water ahead every now and then
    if (simTime - lastDrop > 1.6) {
      lastDrop = simTime;
      tmp.set(pos.x + (rng() - 0.5) * 7, 0, pos.z + 6 + rng() * 9);
      particles.splash(tmp, 0.5 + rng() * 0.5, 'drop');
      water.ripple(tmp, 0.5 + rng() * 0.4);
    }
    if (Math.floor(simTime / 9) !== Math.floor((simTime - dt) / 9)) {
      tmp.set(pos.x - 3, 0, pos.z + 14);
      particles.splash(tmp, 1, 'bail');
      water.ripple(tmp, 1.2);
    }
  }

  placeCamera();
  focus.copy(pos).setY(0);
  env.update(dt, focus, camera);
  // teleport at the end of the lap: one frame without a wake source breaks the ribbon cleanly
  water.update(dt, simTime, camera, lapBreak ? null : wake);
  particles.update(dt, camera);
}

let camX = 0;
function placeCamera(): void {
  camX += (pos.x - camX) * 0.08;
  switch (camMode) {
    case 'low':
      camera.position.set(pos.x + 4.6, 0.75, pos.z + 2.2);
      camera.lookAt(pos.x - 0.5, 0.55, pos.z - 3.2);
      break;
    case 'top':
      camera.position.set(pos.x * 0.3, 17, pos.z - 7);
      camera.lookAt(pos.x * 0.3, 0, pos.z - 6.5);
      break;
    case 'side':
      camera.position.set(9.5, 3.1, pos.z + 7);
      camera.lookAt(pos.x * 0.5 - 1, 0.4, pos.z - 3);
      break;
    case 'front':
      camera.position.set(camX * 0.6, 1.6, pos.z + 7);
      camera.lookAt(pos.x, 0.8, pos.z - 6);
      break;
    default:
      camera.position.set(camX * 0.85, 3, pos.z - 6);
      camera.lookAt(camX * 0.6 + pos.x * 0.25, 0.9, pos.z + 5);
  }
  camera.updateMatrixWorld();
}

// ──────────────────────────────────────────────────────────────── post ──
let composer: EffectComposer | null = null;
if (profile.post) {
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 0 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  if (profile.bloom && def.bloom > 0) {
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), def.bloom, 0.55, 1.05 / def.exposure);
    const hp = bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = min( texture2D( tDiffuse, vUv ), vec4( 32.0 ) );');
    hp.uniforms.smoothWidth.value = 0.35;
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  if (profile.aa !== 'none') composer.addPass(new FXAAPass());
}

// ──────────────────────────────────────────────────────────────── loop ──
riderAt(0);
const fixed = 1 / 60;
for (let i = 0; i < Math.round(preSim / fixed); i++) step(fixed);
step(0);

const info = document.getElementById('info') as HTMLDivElement;
let frames = 0;
let last = performance.now();
let fpsAcc = 0;
let fpsN = 0;
renderer.info.autoReset = false;
renderer.setAnimationLoop((now: number) => {
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(freeze ? 0 : real * timeScale);
  renderer.info.reset();
  if (composer) composer.render();
  else renderer.render(scene, camera);
  frames++;
  fpsAcc += real;
  fpsN++;
  if (params.has('info') && fpsN >= 20) {
    info.textContent = `${envName} ${quality} ${camMode}  ${(fpsN / fpsAcc).toFixed(0)} fps\ncalls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}`;
    fpsAcc = 0;
    fpsN = 0;
  }
  if (frames === 3) (window as unknown as { __ready: boolean }).__ready = true;
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  composer?.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ?dbg=cube : look at the baked sky cube (what the water reflects) instead of the scene
if (params.get('dbg') === 'cube') {
  const lighting = (env as unknown as { lighting: { skyCube: THREE.CubeTexture | null } }).lighting;
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.visible = false;
  });
  scene.background = lighting.skyCube;
  scene.fog = null;
}

// ?tex=waves|clouds : dump the channels of a procedural texture (R G / B A) instead of the 3D view
const texMode = params.get('tex');
if (texMode) {
  const src = texMode === 'clouds' ? getCloudTexture() : getWaveTexture(quality === 'low' ? 256 : 512);
  const img = src.image as { data: Uint8Array; width: number; height: number };
  const n = img.width;
  const cv = document.createElement('canvas');
  cv.width = n * 2;
  cv.height = n * 2;
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vw;z-index:5';
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  const out = g.createImageData(n * 2, n * 2);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      for (let c = 0; c < 4; c++) {
        const o = ((y + (c >> 1) * n) * n * 2 + x + (c & 1) * n) * 4;
        out.data[o] = out.data[o + 1] = out.data[o + 2] = img.data[i + c];
        out.data[o + 3] = 255;
      }
    }
  }
  g.putImageData(out, 0, 0);
  document.body.appendChild(cv);
}

Object.assign(window as unknown as Record<string, unknown>, {
  __env: { env, water, particles, renderer, scene, camera, step, stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, frames, simTime }) },
});
