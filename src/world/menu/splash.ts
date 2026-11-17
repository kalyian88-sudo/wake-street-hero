/**
 * Title-screen key art in 3D: a wakeboarder boosting an indy and a wakeskater mid-kickflip, frozen
 * in a golden-hour "bullet time" over a city canal. Backlit by a low sun (rim light + bloom), the
 * water mirrors the sky, spray hangs in the air and the camera drifts slowly — the poster of the game.
 *
 * Layout: the camera looks +X, so +Z is screen-right (the direction of travel, towards the winch).
 * The riders sit in the upper ~60% of the frame; the title UI covers the lower part.
 */
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import { DEFAULT_APPEARANCE, STARTER_GEAR } from '../../config';
import { createRiderSimState } from '../../core/riderState';
import { createRiderRig } from '../../rider/RiderRig';
import type { IBackdropScene, IRiderRig, MenuBackdrop, RiderLook, RiderSimState, WorldBuildContext } from '../../types';

const SUN_DIR = new Vector3(1, 0.13, -0.32).normalize();
const ANCHOR = new Vector3(14, 4.2, 48);
const TAU = Math.PI * 2;

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;
const SKY_FS = /* glsl */ `
uniform vec3 uSun;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.05, 0.09, 0.2);
  vec3 mid = vec3(0.42, 0.24, 0.3);
  vec3 horizon = vec3(1.0, 0.52, 0.24);
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
  c = mix(c, zenith, smoothstep(0.16, 0.7, h));
  float s = max(dot(d, uSun), 0.0);
  // warm haze round the sun, the disc itself well above 1 so bloom catches it
  c += vec3(1.0, 0.55, 0.25) * pow(s, 8.0) * 0.9;
  c += vec3(1.0, 0.75, 0.45) * pow(s, 90.0) * 2.5;
  c += vec3(1.0, 0.92, 0.75) * smoothstep(0.9993, 0.9997, s) * 14.0;
  // below the horizon: dark water haze (only seen by the reflection probe)
  c = mix(c, vec3(0.12, 0.1, 0.12), smoothstep(0.0, -0.08, h));
  gl_FragColor = vec4(c, 1.0);
}`;

function teamLook(): RiderLook {
  return {
    appearance: { ...DEFAULT_APPEARANCE },
    gear: { ...STARTER_GEAR },
    stance: 'regular',
  };
}

function skaterLook(): RiderLook {
  return {
    appearance: {
      ...DEFAULT_APPEARANCE,
      skin: 3,
      hair: 'curly',
      hairColor: 0x1b1512,
      headwear: 'cap',
      headwearColor: 0x111214,
      vest: false,
      bottom: 'shorts',
      bottomColor: 0x23262c,
      topColor: 0x15161a,
    },
    gear: {
      ...STARTER_GEAR,
      vest: null,
      helmet: 'cap_crew',
      apparel: 'tee_logo',
      wakeskate: 'ws_carbon',
    },
    stance: 'goofy',
  };
}

function airState(board: 'wakeboard' | 'wakeskate', stance: 'regular' | 'goofy', pos: Vector3): RiderSimState {
  const st = createRiderSimState(board, stance);
  st.mode = 'air';
  st.surface = 'air';
  st.time = 3;
  st.speed = 10;
  st.vel.set(0, 0.4, 10);
  st.pos.copy(pos);
  st.air.time = 0.55;
  st.air.timeToLand = 0.5;
  st.air.height = pos.y;
  st.air.peak = pos.y;
  st.air.takeoff = 'kicker';
  const r = st.rope;
  r.holding = true;
  r.taut = true;
  r.tension = 0.35;
  r.dir.copy(ANCHOR).sub(pos).setY(0).normalize();
  r.anchorPos.copy(ANCHOR);
  r.length = ANCHOR.distanceTo(pos);
  return st;
}

function placeHandle(st: RiderSimState): void {
  const r = st.rope;
  r.handlePos.set(st.pos.x + r.dir.x * 0.55, st.pos.y + 1.02 - 0.36 * st.crouch, st.pos.z + r.dir.z * 0.55);
}

/** Soft round sprite for the spray. */
function dropTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Tiling ripple normal map (sum of sines, seamless). */
function rippleNormals(): Texture {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(N, N);
  const waves: [number, number, number, number][] = [];
  let seed = 7;
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) waves.push([Math.round(1 + rnd() * 9) * (rnd() < 0.5 ? -1 : 1), Math.round(2 + rnd() * 12), rnd() * TAU, 1 / (1 + i * 0.35)]);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, ph, a] of waves) {
        const arg = ((kx * x + ky * y) / N) * TAU + ph;
        const cs = Math.cos(arg) * a;
        dx += cs * kx;
        dy += cs * ky;
      }
      const o = (y * N + x) * 4;
      img.data[o] = 128 + Math.max(-127, Math.min(127, -dx * 2.2));
      img.data[o + 1] = 128 + Math.max(-127, Math.min(127, -dy * 2.2));
      img.data[o + 2] = 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Facade texture with warm lit windows for the skyline silhouettes. */
function windowsTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#1a1419';
  g.fillRect(0, 0, 128, 256);
  let seed = 3;
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 6; y < 256; y += 14) {
    for (let x = 6; x < 128; x += 12) {
      const r = rnd();
      g.fillStyle = r < 0.22 ? `rgba(255,${170 + ((r * 300) | 0)},90,0.95)` : 'rgba(40,30,40,1)';
      g.fillRect(x, y, 6, 8);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

class SplashBackdrop implements IBackdropScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.1, 900);
  private readonly riders: {
    rig: IRiderRig;
    state: RiderSimState;
    base: Vector3;
    phase: number;
  }[] = [];
  private readonly ropes: Mesh[] = [];
  private readonly spray: Points;
  private readonly sprayBase: Float32Array;
  private readonly waterNormal: Texture;
  private readonly env: WebGLRenderTarget | null;
  private aspect = 1;
  private orbit = 0;
  private readonly look = new Vector3();
  private readonly tmp = new Vector3();
  private readonly m = new Matrix4();

  constructor(ctx: WorldBuildContext) {
    const { renderer, profile } = ctx;
    const sc = this.scene;
    renderer.toneMappingExposure = 1.05;

    // sky (also baked into the environment map so the water and the riders pick it up)
    const skyMat = new ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      uniforms: { uSun: { value: SUN_DIR } },
      side: BackSide,
      depthWrite: false,
    });
    const sky = new Mesh(new SphereGeometry(500, 48, 24), skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    sc.add(sky);
    const pmrem = new PMREMGenerator(renderer);
    const probe = new Scene();
    probe.add(new Mesh(new SphereGeometry(500, 48, 24), skyMat));
    this.env = pmrem.fromScene(probe, 0.02);
    pmrem.dispose();
    sc.environment = this.env.texture;
    sc.environmentIntensity = 0.85;
    sc.fog = new Fog(new Color(0.5, 0.3, 0.27), 70, 340);

    // lights: warm sun from behind (rim), cool fill from the camera side, sky / water bounce
    const sun = new DirectionalLight(0xffb27a, 4.2);
    sun.position.copy(SUN_DIR).multiplyScalar(30);
    sc.add(sun, sun.target);
    const fill = new DirectionalLight(0x9cbcff, 1.1);
    fill.position.set(-20, 10, -6);
    sc.add(fill);
    const kick = new DirectionalLight(0xffd2b0, 1.6);
    kick.position.set(-8, 14, 16);
    sc.add(kick);
    sc.add(new HemisphereLight(0x7f8fb8, 0x35302e, 0.55));

    // water
    this.waterNormal = rippleNormals();
    this.waterNormal.repeat.set(36, 36);
    const water = new Mesh(
      new PlaneGeometry(900, 900),
      new MeshStandardMaterial({
        color: 0x0d1c22,
        roughness: 0.06,
        metalness: 0.0,
        normalMap: this.waterNormal,
        envMapIntensity: 1.25,
      }),
    );
    (water.material as MeshStandardMaterial).normalScale.set(0.35, 0.35);
    water.rotation.x = -Math.PI / 2;
    sc.add(water);

    // canal quays + skyline silhouettes into the sun
    const stone = new MeshStandardMaterial({
      color: 0x3a3236,
      roughness: 0.85,
    });
    const quayL = new Mesh(new BoxGeometry(400, 1.2, 4), stone);
    quayL.position.set(150, 0.3, -13);
    const quayR = new Mesh(new BoxGeometry(400, 1.2, 4), stone);
    quayR.position.set(150, 0.3, 17);
    sc.add(quayL, quayR);
    const win = windowsTexture();
    const facade = new MeshStandardMaterial({
      map: win,
      emissiveMap: win,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      color: 0x3b3038,
      roughness: 0.9,
    });
    const box = new BoxGeometry(1, 1, 1);
    let seed = 11;
    const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const count = 70;
    const houses = new InstancedMesh(box, facade, count);
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = 18 + i * 3.6 + rnd() * 2;
      const w = 6 + rnd() * 7;
      const hgt = 7 + rnd() * 16 + (rnd() < 0.12 ? 18 : 0);
      const d = 8 + rnd() * 4;
      const z = side < 0 ? -20 - d / 2 - rnd() * 3 : 24 + d / 2 + rnd() * 3;
      this.m.makeScale(w, hgt, d).setPosition(x, hgt / 2, z);
      houses.setMatrixAt(i, this.m);
    }
    sc.add(houses);

    // riders
    const board = createRiderRig(teamLook(), 'wakeboard', profile);
    const bState = airState('wakeboard', 'regular', new Vector3(0, 1.95, -0.45));
    bState.air.grab = 'indy';
    bState.air.grabBlend = 1;
    bState.air.grabTime = 0.9;
    bState.air.spin = -0.35;
    bState.boardYaw = bState.air.takeoffYaw + bState.air.spin;
    const skate = createRiderRig(skaterLook(), 'wakeskate', profile);
    const sState = airState('wakeskate', 'goofy', new Vector3(1.1, 0.95, 1.05));
    sState.air.takeoff = 'pop';
    const f = sState.air.flip;
    f.id = 'kickflip';
    f.progress = 0.68;
    f.roll = TAU * 0.68;
    f.yaw = 0;
    f.pitch = 0;
    f.caught = false;
    for (const [rig, state] of [
      [board, bState],
      [skate, sState],
    ] as const) {
      placeHandle(state);
      sc.add(rig.root);
      this.riders.push({
        rig,
        state,
        base: state.pos.clone(),
        phase: this.riders.length * 1.7,
      });
      // a few settle steps so the rig's springs reach the pose
      for (let k = 0; k < 40; k++) rig.update(state, 1 / 30);
      const rope = new Mesh(new CylinderGeometry(0.007, 0.007, 1, 5, 1, true), new MeshBasicMaterial({ color: 0x2a2224, fog: true }));
      sc.add(rope);
      this.ropes.push(rope);
    }

    // spray: a curtain off the wake behind each rider and droplets falling off the boards
    const tex = dropTexture();
    const N = profile.post ? 1400 : 600;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const who = i % 3 === 0 ? 1 : 0;
      const r = this.riders[who].base;
      const u = Math.random();
      if (Math.random() < 0.72) {
        // wake curtain: from the water behind the take-off up towards the rider
        const back = 2.6 + u * 4.5;
        const t = Math.random();
        pos[i * 3] = r.x + (Math.random() - 0.5) * (0.6 + t * 1.6);
        pos[i * 3 + 1] = Math.max(0.02, (1 - t) * 0.05 + t * t * r.y * 0.55 * (1 - u * 0.6) + Math.random() * 0.25);
        pos[i * 3 + 2] = r.z - back * (1 - t * 0.45);
      } else {
        // droplets shed by the board
        pos[i * 3] = r.x + (Math.random() - 0.5) * 0.9;
        pos[i * 3 + 1] = Math.max(0.03, r.y - 0.1 - Math.random() * r.y);
        pos[i * 3 + 2] = r.z - 0.3 - Math.random() * 1.6;
      }
    }
    this.sprayBase = pos.slice();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    this.spray = new Points(
      geo,
      new PointsMaterial({
        size: 0.055,
        map: tex,
        color: 0xffe2c4,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.spray.frustumCulled = false;
    sc.add(this.spray);
  }

  set(_b: MenuBackdrop): void {}

  update(realDt: number, time: number): void {
    const dt = Math.min(0.05, realDt);
    for (const r of this.riders) {
      // bullet time: the riders hang and breathe a little
      r.state.pos.copy(r.base);
      r.state.pos.y += Math.sin(time * 0.7 + r.phase) * 0.05;
      r.state.pos.z += Math.sin(time * 0.45 + r.phase) * 0.04;
      placeHandle(r.state);
      r.rig.update(r.state, dt);
    }
    // ropes: handle → winch
    for (let i = 0; i < this.ropes.length; i++) {
      const h = this.riders[i].state.rope.handlePos;
      const rope = this.ropes[i];
      this.tmp.copy(ANCHOR).sub(h);
      const len = this.tmp.length();
      rope.scale.set(1, len, 1);
      rope.position.copy(h).addScaledVector(this.tmp, 0.5);
      rope.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), this.tmp.normalize());
    }
    // spray drifts and sparkles
    const p = this.spray.geometry.getAttribute('position') as BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      const k = i * 0.37;
      a[i] = this.sprayBase[i] + Math.sin(time * 0.6 + k) * 0.03;
      a[i + 1] = this.sprayBase[i + 1] + Math.sin(time * 0.5 + k * 1.3) * 0.025;
      a[i + 2] = this.sprayBase[i + 2] + Math.cos(time * 0.4 + k) * 0.03;
    }
    p.needsUpdate = true;
    this.waterNormal.offset.set(time * 0.006, time * 0.011);
    // slow cinematic drift round the riders
    this.orbit = Math.sin(time * 0.12) * 0.09;
    this.place();
  }

  private place(): void {
    const cam = this.camera;
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    const portrait = this.aspect < 1;
    // the riders' bounding box (m) and the part of the screen it should fill (NDC centre + size fraction)
    const W = 2.8;
    const H = 3.5;
    const cx = 0.5;
    const cy = 1.9;
    const cz = 0.25;
    const [rx, ry, fw, fh] = portrait ? [0, 0.4, 1.0, 0.56] : [0.42, 0.02, 0.5, 0.9];
    const visH = Math.max(H / fh, W / fw / this.aspect);
    const visW = visH * this.aspect;
    const dist = visH / (2 * tanH);
    const ang = Math.PI + 0.12 + this.orbit; // camera on −X looking +X
    cam.position.set(cx + Math.cos(ang) * dist, 0.5, cz + Math.sin(ang) * dist);
    // screen-right is +Z (rotated by the orbit); shift the aim so the box lands in its region
    // (camera right = (sin a, 0, −cos a))
    const sx = (rx * visW) / 2;
    this.look.set(cx - Math.sin(ang) * sx, cy - (ry * visH) / 2, cz + Math.cos(ang) * sx);
    cam.lookAt(this.look);
  }

  resize(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    this.camera.aspect = this.aspect;
    this.camera.fov = this.aspect < 1 ? 40 : 30;
    this.camera.updateProjectionMatrix();
    this.place();
  }

  pick(): null {
    return null;
  }

  markerPosition(): boolean {
    return false;
  }

  drag(dx: number): void {
    this.orbit += dx * 0.001;
  }

  dispose(): void {
    for (const r of this.riders) r.rig.dispose();
    this.env?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as { dispose?: () => void } | undefined;
      mat?.dispose?.();
    });
  }
}

export function createSplashBackdrop(ctx: WorldBuildContext): IBackdropScene {
  return new SplashBackdrop(ctx);
}
