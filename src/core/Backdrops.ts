/**
 * Menu backdrops (hub globe, city map, rider turntable, splash). The 3D scenes come from
 * createBackdrop() in src/world/menu; this keeps one instance per "family" alive and reuses it through
 * IBackdropScene.set() (hub ⇄ city fly-in, new rider look), forwards resizes and canvas drags, and
 * converts picking / marker projection between CSS pixels and NDC.
 */
import { Scene, Vector3, type PerspectiveCamera } from 'three';
import type { IBackdropScene, MenuBackdrop, QualityProfile } from '../types';
import { createBackdrop } from '../world/menu/backdrops';
import type { Engine } from './Engine';
import type { EventBus } from './events';
import { markMaterialsDirty } from './SpotLoader';

type Family = 'map' | 'rider' | 'splash';

export interface BackdropEntry {
  scene: IBackdropScene;
  /** Tone-mapping exposure the backdrop wants (captured right after it was created). */
  exposure: number;
}

function family(b: MenuBackdrop): Family | null {
  if (b.kind === 'hub' || b.kind === 'city') return 'map';
  if (b.kind === 'rider') return 'rider';
  if (b.kind === 'splash') return 'splash';
  return null;
}

export class Backdrops {
  /** What is shown behind the menus right now (null → plain dark clear). */
  current: BackdropEntry | null = null;
  private readonly entries = new Map<Family, BackdropEntry>();
  private readonly ctxScene = new Scene();
  private readonly ndc = { x: 0, y: 0 };
  private readonly v = new Vector3();
  private readonly v2 = new Vector3();
  private dragId = -1;
  private dragX = 0;
  private dragY = 0;

  constructor(
    private readonly engine: Engine,
    private readonly camera: PerspectiveCamera,
    private readonly bus: EventBus,
    private readonly getProfile: () => QualityProfile,
    /** Drags are only forwarded while this returns true (menu state). */
    private readonly interactive: () => boolean,
    canvas: HTMLCanvasElement,
  ) {
    // Drags on the bare canvas rotate the globe / pan the map / spin the rider.
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.current || !this.interactive() || this.dragId !== -1) return;
      this.dragId = e.pointerId;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.dragId) return;
      const dx = e.clientX - this.dragX;
      const dy = e.clientY - this.dragY;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      if (this.current && this.interactive() && (dx || dy)) this.current.scene.drag(dx, dy);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.dragId) this.dragId = -1;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Show a backdrop. Returns false for `{ kind: 'none' }` (nothing 3D behind the menu). */
  set(b: MenuBackdrop): boolean {
    const fam = family(b);
    if (!fam) {
      this.current = null;
      return false;
    }
    let entry = this.entries.get(fam) ?? null;
    if (entry) entry.scene.set(b);
    else {
      const r = this.engine.renderer;
      // A backdrop may set its own exposure while it builds; do not let the last spot's value leak in.
      const keep = r.toneMappingExposure;
      r.toneMappingExposure = 1;
      let scene: IBackdropScene | null = null;
      try {
        // Backdrops own their scene + camera; the context only carries the renderer, profile and bus.
        scene = createBackdrop(b, { renderer: r, scene: this.ctxScene, camera: this.camera, profile: this.getProfile(), bus: this.bus });
      } catch (err) {
        console.error('[core] backdrop failed', err);
      }
      if (scene) {
        entry = { scene, exposure: r.toneMappingExposure };
        scene.resize(this.engine.width, this.engine.height);
        this.entries.set(fam, entry);
      }
      r.toneMappingExposure = keep;
    }
    this.current = entry;
    return true;
  }

  resize(width: number, height: number): void {
    for (const e of this.entries.values()) e.scene.resize(width, height);
  }

  /** Shadow maps were switched on/off: lit materials need a new shader variant. */
  markDirty(): void {
    for (const e of this.entries.values()) markMaterialsDirty(e.scene.scene);
  }

  pick(clientX: number, clientY: number): { type: 'city' | 'spot'; id: string } | null {
    if (!this.current) return null;
    const n = this.engine.clientToNdc(clientX, clientY, this.ndc);
    if (Math.abs(n.x) > 1 || Math.abs(n.y) > 1) return null;
    return this.current.scene.pick(n.x, n.y);
  }

  /** Client-space CSS px of a marker, or null when the backdrop does not know it. */
  project(type: 'city' | 'spot', id: string): { x: number; y: number; visible: boolean } | null {
    const b = this.current;
    if (!b || !b.scene.markerPosition(type, id, this.v)) return null;
    const cam = b.scene.camera;
    cam.updateMatrixWorld();
    // Behind the camera project() mirrors the point — treat it as hidden.
    const behind = this.v2.copy(this.v).applyMatrix4(cam.matrixWorldInverse).z > 0;
    this.v.project(cam);
    const visible = !behind && Math.abs(this.v.x) <= 1 && Math.abs(this.v.y) <= 1 && this.v.z >= -1 && this.v.z <= 1;
    const p = this.engine.ndcToClient(this.v.x, this.v.y, this.ndc);
    return { x: p.x, y: p.y, visible };
  }

  dispose(): void {
    for (const e of this.entries.values()) e.scene.dispose();
    this.entries.clear();
    this.current = null;
  }
}
