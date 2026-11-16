/**
 * Debug fly camera (?debug → "free camera").
 * Desktop: WASD move, Q/E down/up, Shift = fast, mouse drag = look, wheel = dolly.
 * Touch: one finger = look, two fingers = pinch to dolly + drag to strafe / lift.
 */
import { Vector3, type PerspectiveCamera } from 'three';

const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'] as const;
type Key = (typeof KEYS)[number];

export class FreeCam {
  active = false;
  private yaw = 0;
  private pitch = 0;
  private readonly pos = new Vector3();
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  private readonly held = new Set<Key>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private dolly = 0;
  private strafeX = 0;
  private strafeY = 0;
  private el: HTMLElement | null = null;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if ((KEYS as readonly string[]).includes(e.code)) {
      this.held.add(e.code as Key);
      e.stopPropagation();
    }
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code as Key);
  };
  private readonly onDown = (e: PointerEvent): void => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) this.pinch = this.pinchDistance();
    e.stopPropagation();
  };
  private readonly onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      this.yaw += dx * 0.005;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * 0.005));
    } else if (this.pointers.size === 2) {
      const d = this.pinchDistance();
      this.dolly += (d - this.pinch) * 0.04;
      this.pinch = d;
      this.strafeX -= dx * 0.01;
      this.strafeY += dy * 0.01;
    }
    e.stopPropagation();
  };
  private readonly onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
  };
  private readonly onWheel = (e: WheelEvent): void => {
    this.dolly -= e.deltaY * 0.01;
    e.preventDefault();
  };

  private pinchDistance(): number {
    const it = this.pointers.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Start flying from the camera's current pose. Pointer events are taken from `surface` (capture phase). */
  enable(camera: PerspectiveCamera, surface: HTMLElement): void {
    if (this.active) return;
    this.active = true;
    this.el = surface;
    this.pos.copy(camera.position);
    camera.getWorldDirection(this.fwd);
    this.yaw = Math.atan2(this.fwd.x, this.fwd.z);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, this.fwd.y)));
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    surface.addEventListener('pointerdown', this.onDown, true);
    surface.addEventListener('pointermove', this.onMove, true);
    surface.addEventListener('pointerup', this.onUp, true);
    surface.addEventListener('pointercancel', this.onUp, true);
    surface.addEventListener('wheel', this.onWheel, { passive: false });
  }

  disable(): void {
    if (!this.active) return;
    this.active = false;
    this.held.clear();
    this.pointers.clear();
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    const el = this.el;
    if (el) {
      el.removeEventListener('pointerdown', this.onDown, true);
      el.removeEventListener('pointermove', this.onMove, true);
      el.removeEventListener('pointerup', this.onUp, true);
      el.removeEventListener('pointercancel', this.onUp, true);
      el.removeEventListener('wheel', this.onWheel);
    }
    this.el = null;
  }

  update(realDt: number, camera: PerspectiveCamera): void {
    const cp = Math.cos(this.pitch);
    this.fwd.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // Screen-right for a camera looking along `fwd` with Y up.
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const fast = this.held.has('ShiftLeft') || this.held.has('ShiftRight');
    const v = (fast ? 30 : 9) * realDt;
    let f = 0;
    let r = 0;
    let u = 0;
    if (this.held.has('KeyW')) f += 1;
    if (this.held.has('KeyS')) f -= 1;
    if (this.held.has('KeyD')) r += 1;
    if (this.held.has('KeyA')) r -= 1;
    if (this.held.has('KeyE')) u += 1;
    if (this.held.has('KeyQ')) u -= 1;
    this.pos.addScaledVector(this.fwd, f * v + this.dolly);
    this.pos.addScaledVector(this.right, r * v + this.strafeX);
    this.pos.y += u * v + this.strafeY;
    this.dolly = 0;
    this.strafeX = 0;
    this.strafeY = 0;
    camera.position.copy(this.pos);
    this.fwd.add(this.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.fwd);
  }
}
