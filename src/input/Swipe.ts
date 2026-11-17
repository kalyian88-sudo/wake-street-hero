/**
 * SIMPLE (swipe) CONTROLS — one finger anywhere on the screen, no joystick and no buttons.
 *
 *   on the water   swipe ←/→  step one lane (3.5 m) left / right — the board carves there by itself
 *                  swipe ↑    pop (instant, full; off a kicker it is a perfect lip release)
 *                  tap        small hop          swipe ↓  surface 180
 *   in the air     swipe ←/→  spin 180 more      swipe ↑ backroll   swipe ↓ frontroll
 *                  hold       grab (wakeboard)   tap  flip / catch the board (wakeskate)
 *   on a rail      swipe ←/→  boardslide / lipslide   swipe ↑/↓ nose / tail press (latched)
 *                  the same swipe again              nose / tail blunt (←/→), nose / tail slide (↑/↓)
 *                  tap        pop off
 *
 * The controller turns gestures into the same InputFrame the sim already understands (it edits the
 * polled frame in place), so physics, tricks and scoring are shared with the classic controls.
 */
import type { InputFrame, RiderSimState } from '../types';

type Gesture = 'left' | 'right' | 'up' | 'down' | 'tap';

const LANE = 3.5;
/** Lanes reach at most this far from the centre lane (m). */
const LANE_SPAN = 3.5;
const SWIPE_PX = 26;
const SWIPE_MS = 420;
const TAP_PX = 14;
const TAP_MS = 260;
const HOLD_MS = 200;

export interface SwipeHint {
  /** Lane offset the board is steering to (−1 left … +1 right, in lanes). */
  lane: number;
}

export class SwipeControls {
  private surface: HTMLElement | null = null;
  private enabled = false;
  private readonly queue: Gesture[] = [];
  private pointer = -1;
  private sx = 0;
  private sy = 0;
  private st = 0;
  private fired = false;
  private holding = false;
  // lane steering, in the frame of the rope direction at the start of the run
  private laneCenter = 0;
  private laneTarget = 0;
  private haveLane = false;
  private lastMode = '';
  // latched rail stance
  private railSteer = 0;
  private railPitch = 0;
  private railLast: Gesture | null = null;

  readonly hint: SwipeHint = { lane: 0 };

  attach(surface: HTMLElement): void {
    this.surface = surface;
    // capture phase on window: the classic joystick never sees these touches while swipe mode is on
    window.addEventListener('pointerdown', this.onDown, { capture: true, passive: false });
    window.addEventListener('pointermove', this.onMove, { capture: true, passive: false });
    window.addEventListener('pointerup', this.onUp, { capture: true, passive: false });
    window.addEventListener('pointercancel', this.onUp, { capture: true, passive: false });
  }

  detach(): void {
    window.removeEventListener('pointerdown', this.onDown, { capture: true });
    window.removeEventListener('pointermove', this.onMove, { capture: true });
    window.removeEventListener('pointerup', this.onUp, { capture: true });
    window.removeEventListener('pointercancel', this.onUp, { capture: true });
    this.surface = null;
  }

  /** On during a run in swipe mode; off in menus / pause / classic mode. */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.queue.length = 0;
    this.pointer = -1;
    this.holding = false;
  }

  /** New run / respawn: the current position becomes the centre lane. */
  reset(): void {
    this.haveLane = false;
    this.queue.length = 0;
    this.railSteer = this.railPitch = 0;
    this.railLast = null;
    this.lastMode = '';
  }

  private ignore(e: PointerEvent): boolean {
    if (!this.enabled || !this.surface) return true;
    // a desktop mouse click is not a gesture (desktop players use the keyboard)
    if (e.pointerType === 'mouse') return true;
    const t = e.target as Element | null;
    // menus, the pause button and anything that is a real button keep working normally
    return !!t && !!t.closest('#ui, button, .wsh-tr, .wsh-pause, [data-ui]');
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (this.ignore(e)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (this.pointer !== -1) return;
    this.pointer = e.pointerId;
    this.sx = e.clientX;
    this.sy = e.clientY;
    this.st = performance.now();
    this.fired = false;
    this.holding = false;
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.enabled || e.pointerId !== this.pointer) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (this.fired) return;
    const dx = e.clientX - this.sx;
    const dy = e.clientY - this.sy;
    const dist = Math.hypot(dx, dy);
    if (dist >= SWIPE_PX && performance.now() - this.st <= SWIPE_MS) {
      this.fired = true;
      this.holding = false;
      this.queue.push(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
      // a long drag can chain a second swipe: start measuring again from here
      this.sx = e.clientX;
      this.sy = e.clientY;
      this.st = performance.now();
      this.fired = false;
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.enabled || e.pointerId !== this.pointer) return;
    e.stopImmediatePropagation();
    const dt = performance.now() - this.st;
    const dist = Math.hypot(e.clientX - this.sx, e.clientY - this.sy);
    if (!this.fired && !this.holding && dt <= TAP_MS && dist <= TAP_PX) this.queue.push('tap');
    this.pointer = -1;
    this.holding = false;
  };

  /** Edit the polled frame for this sim state (call once per frame before sim.step). */
  apply(f: InputFrame, s: RiderSimState): void {
    f.popNow = 0;
    if (!this.enabled) return;
    if (this.pointer !== -1 && !this.fired && performance.now() - this.st >= HOLD_MS) this.holding = true;

    const dx = s.rope.dir.x;
    const dz = s.rope.dir.z;
    // right-of-travel axis for a line running along the rope
    const rx = -dz;
    const rz = dx;
    const lateral = s.pos.x * rx + s.pos.z * rz;
    if (!this.haveLane || (this.lastMode === 'bail' && s.mode !== 'bail') || s.mode === 'waiting') {
      this.haveLane = true;
      this.laneCenter = lateral;
      this.laneTarget = lateral;
    }
    this.lastMode = s.mode;
    const g = this.queue.shift() ?? null;

    f.steer = 0;
    f.pitch = 0;
    const skate = s.board === 'wakeskate';
    switch (s.mode) {
      case 'water':
      case 'slide': {
        this.railLast = null;
        if (g === 'left' || g === 'right') {
          const step = g === 'right' ? LANE : -LANE;
          this.laneTarget = Math.max(this.laneCenter - LANE_SPAN, Math.min(this.laneCenter + LANE_SPAN, this.laneTarget + step));
        } else if (g === 'up') f.popNow = 1;
        else if (g === 'tap') f.popNow = 0.45;
        else if (g === 'down') {
          f.trick.down = f.trick.pressed = true;
          f.steer = 1;
          break;
        }
        // carve towards the lane: proportional on the offset, damped by the heading relative to the rope
        const lineYaw = Math.atan2(dx, dz);
        let rel = s.heading - lineYaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        const err = this.laneTarget - lateral;
        f.steer = Math.max(-1, Math.min(1, err * 0.55 + rel * 1.6));
        break;
      }
      case 'air': {
        if (g === 'left' || g === 'right') {
          f.trick.down = f.trick.pressed = true;
          f.steer = g === 'left' ? -1 : 1;
        } else if (g === 'up' || g === 'down') {
          if (skate) {
            f.grab.down = f.grab.pressed = true;
            f.steer = g === 'up' ? -1 : 1; // kickflip / heelflip
          } else {
            f.trick.down = f.trick.pressed = true;
            f.pitch = g === 'up' ? 1 : -1;
          }
        } else if (g === 'tap') {
          f.grab.down = f.grab.pressed = true; // wakeskate: shuvit or catch; wakeboard: a quick indy
        }
        if (this.holding && !skate) f.grab.down = true;
        break;
      }
      case 'rail': {
        if (g === 'tap') {
          f.popNow = 0.8;
          this.railSteer = this.railPitch = 0;
          this.railLast = null;
        } else if (g) {
          if (g === this.railLast) {
            // the same swipe twice: TRICK + that direction (blunts on ←/→, nose / tail slide on ↑/↓)
            f.trick.down = f.trick.pressed = true;
            f.steer = g === 'left' ? -1 : g === 'right' ? 1 : 0;
            f.pitch = g === 'up' ? 1 : g === 'down' ? -1 : 0;
            this.railLast = null;
            break;
          }
          this.railLast = g;
          this.railSteer = g === 'left' ? -1 : g === 'right' ? 1 : 0;
          this.railPitch = g === 'up' ? 1 : g === 'down' ? -1 : 0;
        }
        f.steer = this.railSteer;
        f.pitch = this.railPitch;
        break;
      }
      default:
        this.railSteer = this.railPitch = 0;
        this.railLast = null;
    }
    this.hint.lane = Math.round((this.laneTarget - this.laneCenter) / LANE);
  }
}
