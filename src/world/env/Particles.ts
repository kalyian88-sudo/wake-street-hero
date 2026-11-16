/**
 * Particles: splashes, edge spray, drips, grind sparks, dust / water-film mist.
 * Two draw calls in total: one alpha-blended pool (droplets + soft puffs), one additive pool (sparks).
 * Everything is advanced with the SCALED dt it is given, so slow motion just works.
 */
import { Color, Group, Vector3, type Camera } from 'three';
import type { IEnvironment, IParticles, QualityProfile, SplashKind, WorldBuildContext } from '../../types';
import { getLighting } from './internal';
import { ParticlePool } from './particlePool';

const SOFT_CAPACITY = 2600;
const SPARK_CAPACITY = 420;
const TAU = Math.PI * 2;

/** Uniform random in [a, b). */
function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

class Particles implements IParticles {
  readonly object = new Group();
  private readonly env: IEnvironment;
  private soft: ParticlePool;
  private sparkPool: ParticlePool;
  /** Budget multiplier (profile.particles). */
  private budget: number;
  private clock = 0;
  private lastDt = 1 / 60;
  private lightingVersion = -1;
  // fractional emission carried between frames (rate × dt rarely lands on an integer)
  private accSpray = 0;
  private accMist = 0;
  private accDrip = 0;
  private accSpark = 0;
  private accDust = 0;
  private accWet = 0;

  constructor(env: IEnvironment, ctx: WorldBuildContext) {
    this.env = env;
    this.budget = ctx.profile.particles;
    this.object.name = 'particles';
    this.soft = new ParticlePool(SOFT_CAPACITY * this.budget, false);
    this.sparkPool = new ParticlePool(SPARK_CAPACITY * this.budget, true);
    this.object.add(this.soft.mesh, this.sparkPool.mesh);
    this.syncLighting();
  }

  // ─────────────────────────────────────────────────────────── primitives ──

  /** Ballistic water droplet. */
  private drop(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, floor: number): void {
    // a few of them catch the sun → HDR glints for the bloom
    const glint = Math.random() < 0.12 ? rnd(2.2, 4.5) : rnd(0.85, 1.25);
    this.soft.emit(this.clock, x, y, z, vx, vy, vz, life, size, size * 0.55, 1, 0.35, rnd(0.75, 0.95), 0.013, 0, 0, floor, glint);
  }

  /** Soft growing puff of mist (tint 0) or dust (tint 1). */
  private puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size0: number, size1: number, life: number, alpha: number, tint: number): void {
    this.soft.emit(this.clock, x, y, z, vx, vy, vz, life, size0, size1, tint > 0.5 ? -0.015 : 0.06, 2.4, alpha, 0, 1, tint, -1e6, 1);
  }

  private count(n: number): number {
    const f = n * this.budget;
    const i = Math.floor(f);
    return i + (Math.random() < f - i ? 1 : 0);
  }

  // ───────────────────────────────────────────────────────────── emitters ──

  splash(pos: Vector3, strength: number, kind: SplashKind): void {
    const s = Math.min(1.5, Math.max(0.05, strength));
    const { x, y, z } = pos;
    const floor = y - 0.03;
    switch (kind) {
      case 'pop': {
        // short flick of water off the tail
        for (let i = this.count(8 + 12 * s); i > 0; i--) {
          const a = rnd(0, TAU);
          const sp = rnd(0.8, 2.6) * (0.6 + 0.6 * s);
          this.drop(x + Math.cos(a) * 0.2, y + 0.03, z + Math.sin(a) * 0.2, Math.cos(a) * sp, rnd(1.8, 4.2) * (0.6 + 0.5 * s), Math.sin(a) * sp, rnd(0.022, 0.05), rnd(0.4, 0.75), floor);
        }
        for (let i = this.count(2); i > 0; i--) this.puff(x, y + 0.12, z, rnd(-0.4, 0.4), rnd(0.5, 1.1), rnd(-0.4, 0.4), 0.22, rnd(0.6, 0.85), rnd(0.45, 0.7), 0.16 * s + 0.06, 0);
        break;
      }
      case 'land': {
        // crown: a ring of droplets thrown outwards …
        for (let i = this.count(26 + 44 * s); i > 0; i--) {
          const a = rnd(0, TAU);
          const out = rnd(2.2, 4.8) * (0.55 + 0.6 * s);
          const r = rnd(0.25, 0.5);
          this.drop(x + Math.cos(a) * r, y + 0.03, z + Math.sin(a) * r, Math.cos(a) * out, rnd(2.4, 5.4) * (0.5 + 0.65 * s), Math.sin(a) * out, rnd(0.024, 0.06), rnd(0.55, 1.0), floor);
        }
        // … a column punched up in the middle …
        for (let i = this.count(6 + 16 * s); i > 0; i--) {
          this.drop(x + rnd(-0.14, 0.14), y + 0.05, z + rnd(-0.14, 0.14), rnd(-0.5, 0.5), rnd(3.5, 7.5) * (0.5 + 0.6 * s), rnd(-0.5, 0.5), rnd(0.03, 0.075), rnd(0.6, 1.05), floor);
        }
        // … and a low skirt of mist rolling out
        for (let i = this.count(4 + 5 * s); i > 0; i--) {
          const a = rnd(0, TAU);
          const out = rnd(1.0, 2.4) * (0.6 + 0.5 * s);
          this.puff(x + Math.cos(a) * 0.3, y + 0.15, z + Math.sin(a) * 0.3, Math.cos(a) * out, rnd(0.5, 1.5), Math.sin(a) * out, 0.35, rnd(1.0, 1.7) * (0.7 + 0.4 * s), rnd(0.7, 1.2), 0.2, 0);
        }
        break;
      }
      case 'bail': {
        // big and messy: no symmetry, heavy blobs, lots of mist
        for (let i = this.count(60 + 70 * s); i > 0; i--) {
          const a = rnd(0, TAU);
          const out = rnd(0.6, 6.5) * (0.6 + 0.5 * s);
          const r = rnd(0, 0.7);
          this.drop(x + Math.cos(a) * r, y + 0.04, z + Math.sin(a) * r, Math.cos(a) * out, rnd(1.5, 8.0) * (0.55 + 0.5 * s), Math.sin(a) * out, rnd(0.025, 0.09), rnd(0.6, 1.25), floor);
        }
        for (let i = this.count(8 + 6 * s); i > 0; i--) {
          const a = rnd(0, TAU);
          const out = rnd(0.5, 3.0);
          this.puff(x + Math.cos(a) * 0.4, y + rnd(0.1, 0.5), z + Math.sin(a) * 0.4, Math.cos(a) * out, rnd(0.8, 2.6), Math.sin(a) * out, 0.45, rnd(1.4, 2.4), rnd(0.9, 1.5), 0.24, 0);
        }
        break;
      }
      case 'carve': {
        // slash: a low wide fan
        for (let i = this.count(14 + 26 * s); i > 0; i--) {
          const a = rnd(0, TAU);
          const out = rnd(2.5, 6.0) * (0.6 + 0.5 * s);
          this.drop(x + Math.cos(a) * 0.2, y + 0.03, z + Math.sin(a) * 0.2, Math.cos(a) * out, rnd(0.9, 2.8), Math.sin(a) * out, rnd(0.02, 0.05), rnd(0.4, 0.75), floor);
        }
        for (let i = this.count(3); i > 0; i--) this.puff(x, y + 0.1, z, rnd(-1.2, 1.2), rnd(0.4, 1.0), rnd(-1.2, 1.2), 0.3, rnd(0.8, 1.2), rnd(0.5, 0.8), 0.15, 0);
        break;
      }
      case 'drop': {
        // something small fell in: tight ring + one fat rebound drop
        for (let i = this.count(8 + 12 * s); i > 0; i--) {
          const a = rnd(0, TAU);
          const out = rnd(0.7, 1.9) * (0.6 + 0.6 * s);
          this.drop(x + Math.cos(a) * 0.08, y + 0.02, z + Math.sin(a) * 0.08, Math.cos(a) * out, rnd(1.4, 3.0) * (0.6 + 0.5 * s), Math.sin(a) * out, rnd(0.018, 0.04), rnd(0.35, 0.6), floor);
        }
        this.drop(x, y + 0.03, z, 0, 3.4 * (0.6 + 0.5 * s), 0, 0.06, 0.7, floor);
        if (this.budget > 0.5) this.puff(x, y + 0.08, z, 0, 0.5, 0, 0.15, 0.5, 0.45, 0.14, 0);
        break;
      }
    }
  }

  spray(pos: Vector3, dir: Vector3, amount: number): void {
    const a = Math.min(1, Math.max(0, amount));
    if (a <= 0.01) return;
    const dt = this.lastDt;
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const dx = dir.x / dl;
    const dy = dir.y / dl;
    const dz = dir.z / dl;
    // horizontal axis across the sheet
    const px = -dz;
    const pz = dx;
    const floor = pos.y - 0.04;
    this.accSpray += 400 * a * this.budget * dt;
    while (this.accSpray >= 1) {
      this.accSpray -= 1;
      const sp = (3.6 + 5.2 * a) * rnd(0.5, 1.15);
      const side = rnd(-1.3, 1.3);
      // spawn spread along the path covered this frame so the sheet has no gaps at low fps
      const back = rnd(0, 0.35);
      this.drop(
        pos.x + px * side * 0.12 - dx * back,
        pos.y + 0.04,
        pos.z + pz * side * 0.12 - dz * back,
        dx * sp + px * side,
        dy * sp + rnd(0.7, 2.6) + 2.2 * a * Math.random(),
        dz * sp + pz * side,
        rnd(0.018, 0.048),
        rnd(0.4, 0.85),
        floor,
      );
    }
    this.accMist += 46 * a * this.budget * dt;
    while (this.accMist >= 1) {
      this.accMist -= 1;
      const sp = rnd(1.4, 3.4) * (0.6 + 0.6 * a);
      this.puff(pos.x, pos.y + 0.12, pos.z, dx * sp + rnd(-0.5, 0.5), dy * sp + rnd(0.7, 1.7), dz * sp + rnd(-0.5, 0.5), 0.22, rnd(0.8, 1.35), rnd(0.55, 0.95), 0.1 + 0.1 * a, 0);
    }
  }

  drips(pos: Vector3, vel: Vector3, amount: number): void {
    const a = Math.min(1, Math.max(0, amount));
    if (a <= 0.01) return;
    this.accDrip += 70 * a * this.budget * this.lastDt;
    while (this.accDrip >= 1) {
      this.accDrip -= 1;
      this.drop(pos.x + rnd(-0.35, 0.35), pos.y + rnd(-0.05, 0.1), pos.z + rnd(-0.35, 0.35), vel.x * 0.85 + rnd(-0.5, 0.5), vel.y * 0.5 + rnd(-0.6, 0.4), vel.z * 0.85 + rnd(-0.5, 0.5), rnd(0.014, 0.034), rnd(0.5, 0.9), pos.y - 6);
    }
  }

  sparks(pos: Vector3, dir: Vector3, amount: number): void {
    const a = Math.min(1, Math.max(0, amount));
    if (a <= 0.01) return;
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
    this.accSpark += 230 * a * this.budget * this.lastDt;
    while (this.accSpark >= 1) {
      this.accSpark -= 1;
      const sp = rnd(2.5, 8.0) * (0.55 + 0.6 * a);
      this.sparkPool.emit(
        this.clock,
        pos.x + rnd(-0.05, 0.05),
        pos.y + rnd(0, 0.04),
        pos.z + rnd(-0.05, 0.05),
        (dir.x / dl) * sp + rnd(-1.8, 1.8),
        (dir.y / dl) * sp + rnd(0.4, 3.2),
        (dir.z / dl) * sp + rnd(-1.8, 1.8),
        rnd(0.18, 0.6),
        rnd(0.011, 0.02),
        0.006,
        1,
        1.1,
        1,
        0.03,
        0,
        0,
        pos.y - 2.5,
        rnd(5, 14),
      );
    }
  }

  dust(pos: Vector3, amount: number, wet: boolean): void {
    const a = Math.min(1, Math.max(0, amount));
    if (a <= 0.01) return;
    const dt = this.lastDt;
    if (wet) {
      // a low film of water kicked up from wet concrete: fine mist + a few flat droplets
      this.accWet += 30 * a * this.budget * dt;
      while (this.accWet >= 1) {
        this.accWet -= 1;
        this.puff(pos.x + rnd(-0.3, 0.3), pos.y + 0.05, pos.z + rnd(-0.3, 0.3), rnd(-0.7, 0.7), rnd(0.15, 0.5), rnd(-0.7, 0.7), 0.18, rnd(0.5, 0.85), rnd(0.4, 0.7), 0.13, 0);
        const ang = rnd(0, TAU);
        const out = rnd(1.0, 2.6);
        this.drop(pos.x, pos.y + 0.02, pos.z, Math.cos(ang) * out, rnd(0.5, 1.5), Math.sin(ang) * out, rnd(0.014, 0.03), rnd(0.25, 0.5), pos.y - 0.02);
      }
    } else {
      this.accDust += 26 * a * this.budget * dt;
      while (this.accDust >= 1) {
        this.accDust -= 1;
        this.puff(pos.x + rnd(-0.25, 0.25), pos.y + 0.06, pos.z + rnd(-0.25, 0.25), rnd(-0.6, 0.6), rnd(0.25, 0.8), rnd(-0.6, 0.6), 0.2, rnd(0.7, 1.15), rnd(0.8, 1.4), 0.17, 1);
      }
    }
  }

  update(dt: number, _camera: Camera): void {
    this.clock += dt;
    this.lastDt = dt;
    this.syncLighting();
    this.soft.flush(this.clock);
    this.sparkPool.flush(this.clock);
  }

  setProfile(profile: QualityProfile): void {
    if (profile.particles === this.budget) return;
    this.budget = profile.particles;
    this.object.remove(this.soft.mesh, this.sparkPool.mesh);
    this.soft.dispose();
    this.sparkPool.dispose();
    this.soft = new ParticlePool(SOFT_CAPACITY * this.budget, false);
    this.sparkPool = new ParticlePool(SPARK_CAPACITY * this.budget, true);
    this.object.add(this.soft.mesh, this.sparkPool.mesh);
    this.lightingVersion = -1;
    this.syncLighting();
  }

  dispose(): void {
    this.object.removeFromParent();
    this.soft.dispose();
    this.sparkPool.dispose();
  }

  private syncLighting(): void {
    const l = getLighting(this.env);
    if (l.version === this.lightingVersion) return;
    this.lightingVersion = l.version;
    const u = this.soft.uniforms;
    (u.uSunDir.value as Vector3).copy(this.env.sunDirection);
    // droplets scatter far less than a lit surface; night spots keep a readable floor
    (u.uSunLight.value as Color).copy(l.sunLight).multiplyScalar(0.3 * l.sunSpecular + 0.06);
    (u.uAmbient.value as Color).copy(l.ambient);
  }
}

export function createParticles(env: IEnvironment, ctx: WorldBuildContext): IParticles {
  return new Particles(env, ctx);
}
