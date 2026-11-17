// Rider rig sandbox: neutral studio + pose gallery driven by fabricated RiderSimState objects.
//   window.__rider.pose(name, opts)        one pose, one camera
//   window.__rider.sheet([names], opts)    contact sheet (tiles) with the same camera per tile
//   window.__rider.seq(name, t, opts)      scripted animated sequence stepped to time t (springs live)
// Dev-only page: labels are not localised on purpose.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { preloadBrandImages } from '../brand/images';
import { DEFAULT_APPEARANCE, QUALITY_PROFILES, STARTER_GEAR } from '../config';
import { createRiderSimState } from '../core/riderState';
import { createRiderRig } from '../rider/RiderRig';
import type { BoardKind, IRiderRig, QualityLevel, RiderLook, RiderSimState, Stance } from '../types';

interface PoseOpts {
  board?: BoardKind;
  stance?: Stance;
  look?: string;
  cam?: string;
  /** state.time (micro motion phase). */
  t?: number;
  /** 'sim' = exactly what src/physics/Rope.ts does, 'near' / 'far' stress the reach logic. */
  handle?: 'sim' | 'near' | 'far';
  /** Extra orbit of the camera about the rider (deg). */
  orbit?: number;
  preview?: 'idle' | 'ride' | 'grab' | 'stoked';
  quality?: QualityLevel;
}

await preloadBrandImages();
const qs = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const labels = document.getElementById('labels') as HTMLDivElement;
const ui = document.getElementById('ui') as HTMLDivElement;
if (qs.has('clean')) document.body.classList.add('clean');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4dc);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
const sun = new THREE.DirectionalLight(0xfff0dc, 3.0);
sun.position.set(-4.5, 7, 3.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -4;
sun.shadow.camera.right = sun.shadow.camera.top = 4;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 22;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xcfe6ff, 0x4a5a52, 0.55));

// "water": slightly see-through plane so the sitting / floating poses can be judged, floor below
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x5f9fae, roughness: 0.32, metalness: 0, transparent: true, opacity: 0.86 }),
);
water.rotation.x = -Math.PI / 2;
water.receiveShadow = true;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x2c5560, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.6;
scene.add(water, floor);

// props that give context to rail / wall / kicker poses
const propMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.45, metalness: 0.6 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 0.9 });
const railProp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 9, 12), propMat);
railProp.rotation.x = Math.PI / 2;
railProp.castShadow = true;
const wallProp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 9), stoneMat);
wallProp.receiveShadow = true;
const rampProp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 5), stoneMat);
rampProp.receiveShadow = true;
const groundProp = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 8), stoneMat);
groundProp.receiveShadow = true;
scene.add(railProp, wallProp, rampProp, groundProp);

const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);

// ─────────────────────────────────────────────────────────────── looks ──

const LOOKS: Record<string, (stance: Stance) => RiderLook> = {
  default: (stance) => ({ appearance: { ...DEFAULT_APPEARANCE }, gear: { ...STARTER_GEAR }, stance }),
  girl: (stance) => ({
    appearance: { ...DEFAULT_APPEARANCE, gender: 'female', skin: 2, hair: 'ponytail', hairColor: 0x8a5a2b, headwear: 'none', vest: true, vestColor: 0xffffff, bottom: 'wetsuit', bottomColor: 0x1c1d21 },
    gear: { ...STARTER_GEAR, vest: 'vest_comp', helmet: null, apparel: 'wetsuit_pro', wakeboard: 'wb_butter', bindings: 'bd_jib', wakeskate: 'ws_flick' },
    stance,
  }),
  cap: (stance) => ({
    appearance: { ...DEFAULT_APPEARANCE, skin: 4, hair: 'curly', hairColor: 0x1b1512, headwear: 'cap', headwearColor: 0xe30613, vest: false, bottomColor: 0x3a3c43, topColor: 0xffffff },
    gear: { ...STARTER_GEAR, vest: null, helmet: 'cap_crew', apparel: 'hoodie_street', wakeboard: 'wb_boost', bindings: 'bd_lock', wakeskate: 'ws_carbon' },
    stance,
  }),
  tee: (stance) => ({
    appearance: { ...DEFAULT_APPEARANCE, skin: 0, hair: 'long', hairColor: 0xc9a35a, headwear: 'none', vest: false, bottom: 'shorts', bottomColor: 0x19b5a5, topColor: 0xffffff },
    gear: { ...STARTER_GEAR, vest: null, helmet: null, apparel: 'tee_logo', wakeboard: 'wb_hero', bindings: 'bd_hero' },
    stance,
  }),
  camo: (stance) => ({
    appearance: { ...DEFAULT_APPEARANCE, gender: 'female', skin: 3, hair: 'bun', hairColor: 0x1b1512, headwear: 'helmet', headwearColor: 0xffffff, vest: true, bottom: 'shorts', bottomColor: 0xe30613, topColor: 0x1c1d21 },
    gear: { ...STARTER_GEAR, vest: 'vest_impact', helmet: 'helmet_pro', apparel: null },
    stance,
  }),
  raw: (stance) => ({
    appearance: { ...DEFAULT_APPEARANCE, skin: 5, hair: 'buzz', hairColor: 0x1b1512, headwear: 'none', vest: true, vestColor: 0x2a5fd0, bottom: 'shorts', bottomColor: 0xffc400, topColor: 0x1c1d21 },
    gear: { wakeboard: 'nope', bindings: 'nope', wakeskate: 'nope', vest: null, helmet: null, apparel: null },
    stance,
  }),
};

// ────────────────────────────────────────────────────── fabricated states ──

type Builder = (st: RiderSimState, o: PoseOpts) => void;
const TAU = Math.PI * 2;

function base(board: BoardKind, stance: Stance, t: number): RiderSimState {
  const st = createRiderSimState(board, stance);
  st.mode = 'water';
  st.time = t;
  st.speed = 9;
  st.vel.set(0, 0, 9);
  st.rope.holding = true;
  st.rope.taut = true;
  st.rope.tension = 0.55;
  st.rope.dir.set(0, 0, 1);
  st.rope.anchorPos.set(0, 1.8, 45);
  st.rope.length = 44;
  return st;
}

function air(st: RiderSimState, y: number, time = 0.5, ttl = 0.5): void {
  st.mode = 'air';
  st.surface = 'air';
  st.pos.y = y;
  st.air.time = time;
  st.air.timeToLand = ttl;
  st.air.height = y;
  st.air.peak = y;
  st.air.takeoff = 'kicker';
  st.rope.tension = 0.3;
}

function bailAt(st: RiderSimState, t: number, surface: 'water' | 'concrete' = 'water', lost = false): void {
  st.mode = 'bail';
  st.bail = { reason: lost ? 'boardLost' : 'underRotated', time: t, surface, intensity: 0.85, boardLost: lost, respawnIn: Math.max(0, 2 - t) };
  st.rope.holding = false;
  st.rope.taut = false;
  st.rope.tension = 0;
  st.speed = Math.max(0, 6 - 6 * t);
  st.pos.z = 6 * t - 3 * t * t * (t < 1 ? 1 : 0) - (t >= 1 ? 3 : 0);
}

const m = (st: RiderSimState): number => (st.stance === 'goofy' ? -1 : 1);

const POSES: Record<string, Builder> = {
  ride: () => undefined,
  slack: (st) => {
    st.rope.taut = false;
    st.rope.tension = 0;
  },
  released: (st) => {
    st.rope.holding = false;
    st.rope.tension = 0;
  },
  charge: (st) => {
    st.crouch = 1;
    st.rope.tension = 0.9;
  },
  carveToe: (st) => {
    st.lean = 1 * m(st);
    st.heading = st.boardYaw = -0.5 * m(st);
    st.rope.tension = 0.85;
  },
  carveHeel: (st) => {
    st.lean = -1 * m(st);
    st.heading = st.boardYaw = 0.5 * m(st);
    st.rope.tension = 0.85;
  },
  switch: (st) => {
    st.boardYaw = Math.PI;
    st.switch = true;
  },
  pop: (st) => {
    air(st, 0.22, 0.05, 0.9);
    st.air.takeoff = 'pop';
    st.vel.y = 4.5;
  },
  tuck: (st) => air(st, 1.3, 0.5, 0.5),
  landing: (st) => air(st, 0.25, 0.9, 0.06),
  indy: (st) => grab(st, 'indy'),
  melon: (st) => grab(st, 'melon'),
  mute: (st) => grab(st, 'mute'),
  stalefish: (st) => grab(st, 'stalefish'),
  nose: (st) => grab(st, 'nose'),
  tail: (st) => grab(st, 'tail'),
  indyFresh: (st) => {
    grab(st, 'indy');
    st.air.grabTime = 0;
  },
  spin90: (st) => spin(st, 0.25),
  spin360: (st) => spin(st, 0.5),
  spin270: (st) => spin(st, 0.75),
  backroll: (st) => {
    air(st, 1.7);
    st.air.invert = 'backroll';
    st.air.takeoff = 'pop';
    st.air.rollTarget = TAU;
    st.air.roll = Math.PI;
  },
  backrollEarly: (st) => {
    air(st, 1.2, 0.3, 0.7);
    st.air.invert = 'backroll';
    st.air.takeoff = 'pop';
    st.air.rollTarget = TAU;
    st.air.roll = Math.PI * 0.5;
  },
  frontroll: (st) => {
    air(st, 1.7);
    st.air.invert = 'frontroll';
    st.air.rollTarget = -TAU;
    st.air.roll = -Math.PI;
  },
  tantrum: (st) => {
    air(st, 1.3, 0.25, 0.8);
    st.air.invert = 'tantrum';
    st.air.rollTarget = TAU;
    st.air.roll = TAU * 0.2;
  },
  raley: (st) => {
    air(st, 1.2, 0.45, 0.6);
    st.air.takeoff = 'pop';
    st.air.invert = 'raley';
    st.air.raley = 1;
    st.rope.tension = 1;
  },
  raleyHalf: (st) => {
    air(st, 0.9, 0.25, 0.8);
    st.air.takeoff = 'pop';
    st.air.invert = 'raley';
    st.air.raley = 0.5;
  },
  shifty: (st) => {
    air(st, 1.1);
    st.air.shifty = 1;
  },
  rail5050: (st) => rail(st, 'fifty', 0.35),
  boardslide: (st) => rail(st, 'boardslide', -0.2),
  lipslide: (st) => rail(st, 'lipslide', 0.2),
  noseslide: (st) => rail(st, 'noseslide', 0.1),
  noseblunt: (st) => rail(st, 'noseblunt', 0.05),
  tailblunt: (st) => rail(st, 'tailblunt', -0.05),
  tailslide: (st) => rail(st, 'tailslide', -0.1),
  nosepress: (st) => rail(st, 'nosepress', 0.1),
  tailpress: (st) => rail(st, 'tailpress', -0.1),
  wallride: (st) => {
    st.mode = 'wall';
    st.surface = 'wall';
    st.pos.set(0, 0.95, 0);
    st.wall = { obstacleId: 'w', normal: new THREE.Vector3(-1, 0, 0), time: 0.3 };
    st.surfaceNormal.set(-1, 0, 0);
  },
  slide: (st) => {
    st.mode = 'slide';
    st.surface = 'concrete';
    st.pos.y = 0.5;
    st.surfaceNormal.set(0, Math.cos(0.36), -Math.sin(0.36));
  },
  bail0: (st) => bailAt(st, 0.1),
  bail1: (st) => bailAt(st, 0.28),
  bail2: (st) => bailAt(st, 0.5),
  bail3: (st) => bailAt(st, 0.85),
  bail4: (st) => bailAt(st, 1.9),
  bailGround: (st) => bailAt(st, 1.9, 'concrete'),
  boardLost: (st) => bailAt(st, 0.35, 'water', true),
  waiting: (st) => {
    st.mode = 'waiting';
    st.speed = 0;
    st.vel.set(0, 0, 0);
    st.rope.taut = false;
    st.rope.tension = 0;
  },
  pullUp: (st) => {
    st.speed = 3.2;
    st.rope.tension = 1;
  },
  finished: (st) => {
    st.mode = 'finished';
    st.speed = 6.5;
    st.rope.holding = false;
    st.rope.tension = 0;
  },
  kickflip: (st) => flip(st, 'kickflip', 0.42),
  heelflip: (st) => flip(st, 'heelflip', 0.6),
  shuvit: (st) => flip(st, 'shuvit', 0.5),
  treflip: (st) => flip(st, 'treflip', 0.45),
  impossible: (st) => flip(st, 'impossible', 0.4),
  caught: (st) => {
    flip(st, 'kickflip', 1);
    st.air.flip.caught = true;
    st.air.timeToLand = 0.12;
    st.pos.y = 0.3;
  },
};

function grab(st: RiderSimState, id: NonNullable<RiderSimState['air']['grab']>): void {
  air(st, 1.5, 0.6, 0.55);
  st.air.grab = id;
  st.air.grabBlend = 1;
  st.air.grabTime = 0.9;
}

function spin(st: RiderSimState, frac: number): void {
  air(st, 1.4, 0.5, 0.5);
  st.air.takeoff = 'pop';
  st.air.spinTarget = TAU * m(st);
  st.air.spin = TAU * frac * m(st);
  st.boardYaw = st.air.takeoffYaw + st.air.spin;
  const phase = frac;
  st.air.handlePass = Math.max(0, Math.min(1, (0.5 - Math.abs(phase - 0.5)) * 4 - 0.5));
}

function rail(st: RiderSimState, stance: NonNullable<RiderSimState['rail']>['stance'], balance: number): void {
  st.mode = 'rail';
  st.surface = 'rail';
  st.pos.set(0, 0.62, 0);
  st.speed = 7;
  const yaw = stance === 'boardslide' || stance === 'noseslide' || stance === 'noseblunt' ? Math.PI / 2 : stance === 'lipslide' || stance === 'tailslide' || stance === 'tailblunt' ? -Math.PI / 2 : 0;
  st.boardYaw = yaw; // the sim turns the board itself (src/physics/modes/rail.ts)
  st.rail = { obstacleId: 'r', kind: 'rail', stance, balance, time: 0.5, tangent: new THREE.Vector3(0, 0, 1) };
}

function flip(st: RiderSimState, id: NonNullable<RiderSimState['air']['flip']['id']>, p: number): void {
  air(st, 0.75, 0.35, 0.4);
  st.air.takeoff = 'pop';
  const spec: Record<string, [number, number, number]> = {
    kickflip: [TAU, 0, 0],
    heelflip: [-TAU, 0, 0],
    shuvit: [0, -Math.PI, 0],
    fsShuvit: [0, Math.PI, 0],
    treflip: [TAU, -TAU, 0],
    impossible: [0, 0, TAU],
    bigspin: [0, -TAU, 0],
  };
  const s = spec[id];
  const f = st.air.flip;
  f.id = id;
  f.progress = p;
  f.caught = false;
  f.roll = s[0] * p;
  f.yaw = s[1] * p;
  f.pitch = s[2] * p;
  f.catchWindow = p > 0.7 ? 0.8 : 0;
}

const SKATE_POSES = new Set(['kickflip', 'heelflip', 'shuvit', 'treflip', 'impossible', 'caught', 'boardLost']);

/** Same handle model as the sim (src/physics/Rope.ts placeHandle), plus stress variants. */
function placeHandle(st: RiderSimState, mode: PoseOpts['handle']): void {
  const r = st.rope;
  const reach = mode === 'near' ? 0.4 : mode === 'far' ? 0.85 : 0.6;
  const h = mode === 'near' ? 0.92 : mode === 'far' ? 1.15 : 1.02;
  r.handlePos.set(st.pos.x + r.dir.x * reach, st.pos.y + h - 0.36 * st.crouch, st.pos.z + r.dir.z * reach);
  if (!r.holding) {
    r.handlePos.x += r.dir.x * 3;
    r.handlePos.z += r.dir.z * 3;
    r.handlePos.y = st.pos.y + 0.06;
    if (st.mode === 'bail') r.handlePos.y = 0.06;
  }
}

function buildState(name: string, o: PoseOpts): RiderSimState {
  const board = o.board ?? (SKATE_POSES.has(name) ? 'wakeskate' : 'wakeboard');
  const st = base(board, o.stance ?? 'regular', o.t ?? 0.4);
  (POSES[name] ?? POSES.ride)(st, o);
  placeHandle(st, o.handle);
  return st;
}

// ──────────────────────────────────────────────────────────────── rig ──

let rig: IRiderRig | null = null;
let rigKey = '';

function ensureRig(o: PoseOpts, board: BoardKind): IRiderRig {
  const stance = o.stance ?? 'regular';
  const lookName = o.look ?? 'default';
  const quality = o.quality ?? 'medium';
  const look = (LOOKS[lookName] ?? LOOKS.default)(stance);
  const key = quality;
  if (!rig || rigKey !== key) {
    if (rig) {
      scene.remove(rig.root);
      rig.dispose();
    }
    rig = createRiderRig(look, board, QUALITY_PROFILES[quality]);
    scene.add(rig.root);
    rigKey = key;
  } else {
    rig.setLook(look);
    rig.setBoard(board);
  }
  return rig;
}

const CAMS: Record<string, { pos: [number, number, number]; look: [number, number, number]; fov?: number }> = {
  three: { pos: [-3.3, 1.55, 3.0], look: [0, 0.85, 0] },
  threeB: { pos: [3.3, 1.7, -3.0], look: [0, 0.85, 0] },
  back: { pos: [0.5, 2.3, -5.8], look: [0, 0.9, 1.2], fov: 42 },
  backNear: { pos: [0.4, 1.7, -3.6], look: [0, 0.9, 0.5] },
  side: { pos: [-4.4, 1.1, 0.0], look: [0, 0.85, 0] },
  heel: { pos: [4.4, 1.2, 0.0], look: [0, 0.85, 0] },
  front: { pos: [0.3, 1.2, 4.4], look: [0, 0.85, 0] },
  top: { pos: [0.01, 5.2, 0.2], look: [0, 0.4, 0] },
  low: { pos: [-2.6, 0.25, 2.6], look: [0, 0.9, 0] },
  face: { pos: [-1.05, 1.52, 0.5], look: [0, 1.42, 0.05], fov: 24 },
  portrait: { pos: [-1.5, 1.6, 0.45], look: [0, 1.5, 0], fov: 22 },
  bust: { pos: [-2.1, 1.45, 0.7], look: [0, 1.25, 0], fov: 26 },
  wide: { pos: [-5.2, 2.2, 4.6], look: [0, 0.8, 0] },
};

const head = new THREE.Vector3();
const chest = new THREE.Vector3();
const tmp = new THREE.Vector3();

function frame(state: RiderSimState, o: PoseOpts, name: string): void {
  const cam = CAMS[o.cam ?? 'three'] ?? CAMS.three;
  const r = rig as IRiderRig;
  r.getChestWorldPosition(chest);
  r.getHeadWorldPosition(head);
  // camera rig is relative to the rider's board position; framing follows the body
  const focus = tmp.set(state.pos.x, state.pos.y, state.pos.z);
  if (o.cam === 'face') focus.copy(head).sub(new THREE.Vector3(0, 1.42, 0.05));
  const orbit = ((o.orbit ?? 0) * Math.PI) / 180;
  const c = Math.cos(orbit);
  const s = Math.sin(orbit);
  const px = cam.pos[0] * c + cam.pos[2] * s;
  const pz = -cam.pos[0] * s + cam.pos[2] * c;
  camera.position.set(focus.x + px, focus.y + cam.pos[1], focus.z + pz);
  camera.fov = cam.fov ?? 36;
  const bodyY = (chest.y - state.pos.y) * 0.5 + cam.look[1] * 0.5;
  const fixed = o.cam === 'portrait' || o.cam === 'bust' || o.cam === 'face';
  camera.lookAt(focus.x + cam.look[0], focus.y + (fixed ? cam.look[1] : Math.max(0.35, bodyY) - (state.pos.y > 0.3 ? 0.25 : 0)), focus.z + cam.look[2]);
  sun.target.position.copy(focus);
  sun.position.set(focus.x - 4.5, focus.y + 7, focus.z + 3.5);
  // props
  railProp.visible = state.mode === 'rail';
  railProp.position.set(state.pos.x, state.pos.y - 0.045, state.pos.z);
  wallProp.visible = state.mode === 'wall';
  wallProp.position.set(state.pos.x + 0.2, 1.2, state.pos.z);
  rampProp.visible = name === 'slide';
  rampProp.position.set(state.pos.x, state.pos.y - 0.05, state.pos.z);
  rampProp.rotation.x = -0.36;
  const onGround = state.bail?.surface === 'concrete' || o.preview === 'idle';
  groundProp.visible = onGround;
  groundProp.position.set(state.pos.x, state.pos.y - 0.1, state.pos.z);
  water.visible = !onGround;
}

function renderTile(x: number, y: number, w: number, h: number): void {
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  renderer.setScissorTest(true);
  renderer.clear();
  renderer.render(scene, camera);
}

function label(text: string, x: number, y: number): void {
  const el = document.createElement('span');
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  labels.appendChild(el);
}

let current = { name: 'ride', opts: {} as PoseOpts };
const previewState = createRiderSimState();

function poseOne(name: string, o: PoseOpts): RiderSimState {
  if (o.preview) {
    const r = ensureRig(o, o.board ?? 'wakeboard');
    r.root.position.set(0, 0, 0);
    r.root.quaternion.identity();
    r.setPreviewPose(o.preview, o.t ?? 0.5);
    previewState.pos.set(0, o.preview === 'grab' ? 1.2 : 0, 0);
    r.root.position.copy(previewState.pos);
    previewState.mode = 'water';
    previewState.bail = null;
    return previewState;
  }
  const st = buildState(name, o);
  const r = ensureRig(o, st.board);
  r.update(st, 0);
  return st;
}

function pose(name: string, opts: PoseOpts = {}): { draws: number; tris: number } {
  current = { name, opts };
  labels.innerHTML = '';
  const st = poseOne(name, opts);
  frame(st, opts, name);
  renderer.info.reset();
  renderTile(0, 0, innerWidth, innerHeight);
  label(`${opts.preview ? 'preview:' + opts.preview : name} · ${opts.look ?? 'default'} · ${opts.stance ?? 'regular'} · ${opts.cam ?? 'three'}`, 8, 8);
  return { draws: renderer.info.render.calls, tris: renderer.info.render.triangles };
}

/** Contact sheet: every entry is "pose" or "pose@cam" (optionally with per-tile opts). */
function sheet(names: (string | [string, PoseOpts])[], opts: PoseOpts & { cols?: number } = {}): void {
  labels.innerHTML = '';
  const cols = opts.cols ?? Math.ceil(Math.sqrt(names.length));
  const rows = Math.ceil(names.length / cols);
  const w = Math.floor(innerWidth / cols);
  const h = Math.floor(innerHeight / rows);
  renderer.setScissorTest(false);
  renderer.clear();
  names.forEach((entry, i) => {
    const [raw, extra] = typeof entry === 'string' ? [entry, {}] : entry;
    const [name, cam] = raw.split('@');
    const o: PoseOpts = { ...opts, ...extra };
    if (cam) o.cam = cam;
    const st = poseOne(name, o);
    frame(st, o, name);
    const cx = (i % cols) * w;
    const cy = Math.floor(i / cols) * h;
    renderTile(cx, innerHeight - cy - h, w, h);
    label((o.preview ? 'preview:' + o.preview : name) + (o.stance === 'goofy' ? ' · goofy' : '') + (extra.look ? ' · ' + extra.look : ''), cx + 6, cy + 6);
  });
}

// ───────────────────────────────────────────────────────── sequences ──

type Script = (st: RiderSimState, t: number) => void;
const smooth = (a: number, b: number, x: number): number => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** charge → pop → 360 with handle pass → land → ride away. */
const popSpin: Script = (st, t) => {
  const tPop = 0.7;
  const airT = 1.15;
  st.pos.z = 9 * t;
  if (t < tPop) {
    st.crouch = smooth(0, 0.6, t);
    st.rope.tension = 0.5 + 0.4 * st.crouch;
  } else if (t < tPop + airT) {
    const a = t - tPop;
    air(st, Math.max(0, 5.6 * a - 4.9 * a * a), a, airT - a);
    st.air.takeoff = 'pop';
    st.vel.y = 5.6 - 9.8 * a;
    st.air.spinTarget = TAU;
    st.air.spin = TAU * smooth(0.08, 0.92, a / airT);
    st.boardYaw = st.air.spin;
    const phase = st.air.spin / TAU;
    st.air.handlePass = Math.max(0, Math.min(1, (0.5 - Math.abs(phase - 0.5)) * 4 - 0.5));
  } else {
    st.rope.tension = 0.6;
  }
};

/** approach → pop → backroll → land. */
const backroll: Script = (st, t) => {
  const tPop = 0.5;
  const airT = 1.2;
  st.pos.z = 9 * t;
  if (t < tPop) st.crouch = smooth(0, 0.45, t);
  else if (t < tPop + airT) {
    const a = t - tPop;
    air(st, Math.max(0, 5.9 * a - 4.9 * a * a), a, airT - a);
    st.air.takeoff = 'pop';
    st.vel.y = 5.9 - 9.8 * a;
    st.air.rollTarget = TAU;
    st.air.roll = TAU * smooth(0.05, 0.9, a / airT);
    st.air.invert = st.air.roll < TAU - 0.05 ? 'backroll' : null;
  }
};

/** deep-water start: waiting → pulled up → riding. */
const start: Script = (st, t) => {
  if (t < 0.4) {
    st.mode = 'waiting';
    st.speed = 0;
    st.rope.tension = 0;
  } else {
    const a = t - 0.4;
    st.speed = 9 * smooth(0, 1.6, a);
    st.pos.z = 4.5 * a * smooth(0, 1.6, a);
    st.rope.tension = 1 - 0.4 * smooth(1, 2, a);
  }
  st.vel.set(0, 0, st.speed);
};

/** bail from a spin: tumble, splash, float, respawn pull-up. */
const bailSeq: Script = (st, t) => {
  if (t < 2) bailAt(st, t);
  else {
    st.speed = 2.2 + 6 * smooth(0, 1.4, t - 2);
    st.rope.tension = 1;
    st.pos.z = 3 + (t - 2) * st.speed * 0.5;
  }
};

/** wakeskate kickflip: pop, flip, catch, land. */
const kickflip: Script = (st, t) => {
  const tPop = 0.4;
  const airT = 0.75;
  st.pos.z = 8 * t;
  if (t < tPop) st.crouch = smooth(0, 0.35, t);
  else if (t < tPop + airT) {
    const a = t - tPop;
    air(st, Math.max(0, 3.7 * a - 4.9 * a * a), a, airT - a);
    st.air.takeoff = 'pop';
    st.vel.y = 3.7 - 9.8 * a;
    const p = Math.min(1, Math.max(0, (a - 0.08) / 0.45));
    const f = st.air.flip;
    f.id = 'kickflip';
    f.progress = p;
    f.roll = p >= 1 ? 0 : TAU * p;
    f.caught = p >= 1;
    if (p <= 0) f.id = null;
  }
};

const SEQS: Record<string, { script: Script; board: BoardKind }> = {
  popSpin: { script: popSpin, board: 'wakeboard' },
  backroll: { script: backroll, board: 'wakeboard' },
  start: { script: start, board: 'wakeboard' },
  bail: { script: bailSeq, board: 'wakeboard' },
  kickflip: { script: kickflip, board: 'wakeskate' },
};

/** Run a sequence from 0 to `t` with live springs (dt = 1/60) and render the last frame. */
function seq(name: string, t: number, opts: PoseOpts = {}): void {
  const def = SEQS[name];
  if (!def) return;
  labels.innerHTML = '';
  const r = ensureRig(opts, opts.board ?? def.board);
  const dt = 1 / 60;
  let st = base(opts.board ?? def.board, opts.stance ?? 'regular', 0);
  for (let time = 0; time <= t + 1e-6; time += dt) {
    st = base(opts.board ?? def.board, opts.stance ?? 'regular', time);
    def.script(st, time);
    placeHandle(st, opts.handle);
    r.update(st, time === 0 ? 0 : dt);
  }
  frame(st, opts, name);
  renderTile(0, 0, innerWidth, innerHeight);
  label(`${name} t=${t.toFixed(2)}`, 8, 8);
}

/** Filmstrip of a sequence: tiles at the given times (springs keep running between tiles). */
function strip(name: string, times: number[], opts: PoseOpts & { cols?: number } = {}): void {
  const def = SEQS[name];
  if (!def) return;
  labels.innerHTML = '';
  const cols = opts.cols ?? times.length;
  const rows = Math.ceil(times.length / cols);
  const w = Math.floor(innerWidth / cols);
  const h = Math.floor(innerHeight / rows);
  const r = ensureRig(opts, opts.board ?? def.board);
  renderer.setScissorTest(false);
  renderer.clear();
  const dt = 1 / 60;
  let time = 0;
  let first = true;
  times.forEach((target, i) => {
    let st = base(opts.board ?? def.board, opts.stance ?? 'regular', time);
    for (; time <= target + 1e-6; time += dt) {
      st = base(opts.board ?? def.board, opts.stance ?? 'regular', time);
      def.script(st, time);
      placeHandle(st, opts.handle);
      r.update(st, first ? 0 : dt);
      first = false;
    }
    frame(st, opts, name);
    const cx = (i % cols) * w;
    const cy = Math.floor(i / cols) * h;
    renderTile(cx, innerHeight - cy - h, w, h);
    label(`${name} ${target.toFixed(2)}s`, cx + 6, cy + 6);
  });
}

// live playback for manual inspection on a real device
let playing: { name: string; t: number; opts: PoseOpts } | null = null;
let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) {
    const def = SEQS[playing.name];
    const o = playing.opts;
    const r = ensureRig(o, o.board ?? def.board);
    const st = base(o.board ?? def.board, o.stance ?? 'regular', playing.t);
    def.script(st, playing.t);
    placeHandle(st, o.handle);
    r.update(st, playing.t === 0 ? 0 : dt * 0.5);
    playing.t += dt * 0.5;
    if (playing.t > 3.4) playing.t = 0;
    frame(st, o, playing.name);
    renderTile(0, 0, innerWidth, innerHeight);
  }
  requestAnimationFrame(loop);
}

function stats(): Record<string, unknown> {
  const r = rig as unknown as { stats: Record<string, number> } | null;
  renderer.info.reset();
  renderTile(0, 0, innerWidth, innerHeight);
  return { tris: r?.stats, draws: renderer.info.render.calls, sceneTris: renderer.info.render.triangles };
}

const api = {
  pose,
  sheet,
  seq,
  strip,
  stats,
  play: (name: string, opts: PoseOpts = {}) => {
    playing = { name, t: 0, opts };
  },
  stop: () => {
    playing = null;
  },
  names: Object.keys(POSES),
  looks: Object.keys(LOOKS),
  cams: Object.keys(CAMS),
  ready: false,
};
(window as unknown as { __rider: typeof api }).__rider = api;

// simple touch UI for a real phone
function button(text: string, fn: () => void): void {
  const b = document.createElement('button');
  b.textContent = text;
  b.onclick = () => {
    playing = null;
    fn();
  };
  ui.appendChild(b);
}
for (const name of Object.keys(POSES)) button(name, () => pose(name, { ...current.opts, preview: undefined }));
for (const p of ['idle', 'ride', 'grab', 'stoked'] as const) button('menu:' + p, () => pose(p, { ...current.opts, preview: p }));
for (const c of Object.keys(CAMS)) button('cam:' + c, () => pose(current.name, { ...current.opts, cam: c }));
for (const l of Object.keys(LOOKS)) button('look:' + l, () => pose(current.name, { ...current.opts, look: l }));
button('goofy/regular', () => pose(current.name, { ...current.opts, stance: current.opts.stance === 'goofy' ? 'regular' : 'goofy' }));
button('board', () => pose(current.name, { ...current.opts, board: current.opts.board === 'wakeskate' ? 'wakeboard' : 'wakeskate' }));
for (const s of Object.keys(SEQS)) button('▶ ' + s, () => api.play(s, current.opts));

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  pose(current.name, current.opts);
});

pose(qs.get('pose') ?? 'ride', {
  cam: qs.get('cam') ?? undefined,
  look: qs.get('look') ?? undefined,
  stance: (qs.get('stance') as Stance | null) ?? undefined,
  board: (qs.get('board') as BoardKind | null) ?? undefined,
});
api.ready = true;
requestAnimationFrame(loop);
