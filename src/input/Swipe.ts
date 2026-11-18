/**
 * SIMPLE (swipe) CONTROLS — one finger anywhere on the screen, no joystick and no buttons.
 *
 *   on the water   hold + drag ←/→  steer like a wheel: the further from where the finger went
 *                             down, the harder the carve; let go and the board straightens up
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
/** Drag steering: finger offset (CSS px) for full lock, and the dead zone round the touch point. */
const STEER_PX = 90;
const STEER_DEAD = 8;
/** Steering response time (s): the board eases into a carve instead of snapping. */
const STEER_TAU = 0.16;

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
  private downX = 0;
  private downY = 0;
  // drag steering (water): live finger x, smoothed steer, last apply() time
  private curX = 0;
  private steerOut = 0;
  private lastApply = 0;
  private touchEl: HTMLDivElement | null = null;
  private touchDot: HTMLDivElement | null = null;
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
    // finger feedback: a ring where the finger went down and a dot that follows it (steering)
    const ring = document.createElement('div');
    ring.style.cssText =
      'position:fixed;left:0;top:0;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;border:2px solid rgba(255,255,255,.55);' +
      'box-shadow:0 0 12px rgba(0,0,0,.35);pointer-events:none;opacity:0;transition:opacity .15s;z-index:5';
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;left:0;top:0;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgba(255,255,255,.85);' +
      'box-shadow:0 0 10px rgba(227,6,19,.6);pointer-events:none;opacity:0;transition:opacity .15s;z-index:5';
    document.body.append(ring, dot);
    this.touchEl = ring;
    this.touchDot = dot;
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
    this.touchEl?.remove();
    this.touchDot?.remove();
    this.touchEl = this.touchDot = null;
    this.surface = null;
  }

  /** On during a run in swipe mode; off in menus / pause / classic mode. */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.queue.length = 0;
    this.pointer = -1;
    this.holding = false;
    this.showTouch(false);
  }

  private showTouch(on: boolean): void {
    if (this.touchEl) this.touchEl.style.opacity = on ? '1' : '0';
    if (this.touchDot) this.touchDot.style.opacity = on ? '1' : '0';
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
    this.downX = this.curX = e.clientX;
    this.downY = e.clientY;
    if (this.touchEl && this.touchDot) {
      this.touchEl.style.transform = this.touchDot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }
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
    this.curX = e.clientX;
    if (this.touchDot) {
      const off = Math.max(-STEER_PX, Math.min(STEER_PX, e.clientX - this.downX));
      this.touchDot.style.transform = `translate(${this.downX + off}px, ${this.downY}px)`;
      if (Math.abs(e.clientX - this.downX) > STEER_DEAD) this.showTouch(true);
    }
    if (this.fired) return;
    // sliding window: after a slow steering drag, a quick flick (↑ = pop) is still recognised
    if (performance.now() - this.st > SWIPE_MS) {
      this.sx = e.clientX;
      this.sy = e.clientY;
      this.st = performance.now();
      this.holding = false;
      return;
    }
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
    else if (!this.fired && dt <= SWIPE_MS && dist >= SWIPE_PX) {
      // a fast flick whose moves arrived coalesced with the release
      const dx = e.clientX - this.sx;
      const dy = e.clientY - this.sy;
      this.queue.push(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
    }
    this.pointer = -1;
    this.holding = false;
    this.showTouch(false);
  };

  /** Edit the polled frame for this sim state (call once per frame before sim.step). */
  apply(f: InputFrame, s: RiderSimState): void {
    f.popNow = 0;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - (this.lastApply || now)) / 1000));
    this.lastApply = now;
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
        if (g === 'up') f.popNow = 1;
        else if (g === 'tap') f.popNow = 0.45;
        else if (g === 'down') {
          f.trick.down = f.trick.pressed = true;
          f.steer = 1;
          break;
        }
        // steering wheel: finger offset from where it went down → carve; no finger → straighten up
        const lineYaw = Math.atan2(dx, dz);
        let rel = s.heading - lineYaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        let target: number;
        if (this.pointer !== -1) {
          const off = this.curX - this.downX;
          const k = Math.max(0, Math.abs(off) - STEER_DEAD) / (STEER_PX - STEER_DEAD);
          target = Math.sign(off) * Math.min(1, k) ** 1.3;
          // never carve past ~55° off the rope line
          if (Math.abs(rel) > 0.95 && Math.sign(target) === Math.sign(-rel)) target *= 0.3;
        } else target = Math.max(-0.6, Math.min(0.6, rel * 1.1));
        const a = 1 - Math.exp(-dt / STEER_TAU);
        this.steerOut += (target - this.steerOut) * a;
        f.steer = this.steerOut;
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
        this.steerOut = 0;
        this.railSteer = this.railPitch = 0;
        this.railLast = null;
    }
    this.hint.lane = Math.round((this.laneTarget - this.laneCenter) / LANE);
  }
}
