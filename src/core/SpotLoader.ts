/**
 * Builds spot worlds and keeps the LAST one alive, so preview → run → retry → preview of the same
 * spot never rebuilds it. Each world lives in its own Scene.
 */
import { Scene, type Material, type Mesh, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { findSpot } from '../data/spots';
import type { ISpotWorld, QualityProfile, SpotDef } from '../types';
import { buildSpotWorld } from '../world/SpotWorld';
import type { EventBus } from './events';

export interface LoadedSpot {
  spot: SpotDef;
  scene: Scene;
  world: ISpotWorld;
}

export class SpotLoader {
  current: LoadedSpot | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly camera: PerspectiveCamera,
    private readonly bus: EventBus,
    private readonly getProfile: () => QualityProfile,
  ) {}

  /** Resolve with the world of `spotId`, building it (and dropping the previous one) when needed. */
  load(spotId: string): Promise<LoadedSpot> {
    const run = async (): Promise<LoadedSpot> => {
      if (this.current && this.current.spot.id === spotId) return this.current;
      const spot = findSpot(spotId);
      if (!spot) throw new Error(`Unknown spot "${spotId}"`);
      this.unload();
      const scene = new Scene();
      scene.name = `spot:${spotId}`;
      const profile = this.getProfile();
      const world = await buildSpotWorld(spot, { renderer: this.renderer, scene, camera: this.camera, profile, bus: this.bus });
      const loaded: LoadedSpot = { spot, scene, world };
      this.current = loaded;
      // The quality may have changed while the world was being built.
      if (this.getProfile() !== profile) this.applyProfile(this.getProfile(), true);
      return loaded;
    };
    // Loads are serialised: a second request waits for the first build to finish.
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Push a quality profile into the cached world (and its env / water / particles). */
  applyProfile(profile: QualityProfile, shadowsChanged: boolean): void {
    const cur = this.current;
    if (!cur) return;
    const w = cur.world;
    w.setProfile(profile);
    w.env.setProfile(profile);
    w.water.setProfile(profile);
    w.particles.setProfile(profile);
    // Shadow maps on/off changes the lighting shader variant: three only notices on material update.
    if (shadowsChanged) markMaterialsDirty(cur.scene);
  }

  unload(): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    try {
      cur.world.dispose();
    } catch (err) {
      console.warn('[core] world dispose failed', err);
    }
    cur.scene.clear();
  }
}

export function markMaterialsDirty(scene: Scene): void {
  scene.traverse((o) => {
    const m = (o as Mesh).material as Material | Material[] | undefined;
    if (!m) return;
    if (Array.isArray(m)) for (const x of m) x.needsUpdate = true;
    else m.needsUpdate = true;
  });
}
