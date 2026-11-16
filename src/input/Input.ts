/**
 * INPUT — touch (multi-touch Pointer Events), mouse, keyboard and gamepad → one InputFrame per frame.
 *
 * Touch model (docs/PLAN.md §4.2):
 *  - A touch that starts on a bound button (hit-test by bounding rect + slop) owns that button until it
 *    lifts; sliding off does not release it. Any number of buttons can be held by different fingers.
 *  - A touch that starts anywhere else on the LEFT 60 % of the surface spawns the floating joystick.
 *  - Other touches are ignored.
 *
 * Notes for integrators:
 *  - attach(surface): pass an element that covers the play field and receives pointer events
 *    (the game canvas or #app). If it has `pointer-events: none` (e.g. #hud) it is switched to `auto`
 *    only while gameplay input is enabled. Elements inside #ui / real form controls are never intercepted.
 *  - poll() returns the SAME object every frame (no allocations) — copy it if you need to keep it.
 *  - `joystick.x / y` are the knob OFFSET from `originX / originY` in CSS px (|offset| ≤ STICK.radius).
 *  - Bound button elements get the class `is-down` while held (any source, incl. virtual input).
 *  - setVirtual(v) replaces the player's stick and buttons until setVirtual(null); omitted fields are
 *    neutral. The pause button always stays with the player.
 */
import type { ButtonId, ButtonState, IInput, InputFrame, VirtualInput } from '../types';
import { GamepadReader } from './gamepad';
import { BTN, BUTTON_IDS, DIR, isTypingTarget, keyAction } from './keyboard';
import { ButtonLatch } from './latch';
import { STICK, clampUnit, keyAxisStep, stickEnd, stickMove, stickOutput, stickStart, type StickState, type Vec2 } from './stick';

const up = (): ButtonState => ({ down: false, pressed: false, released: false });

export function neutralInputFrame(): InputFrame {
  return { steer: 0, pitch: 0, jump: up(), trick: up(), grab: up(), handlePressed: false, heroPressed: false, pausePressed: false };
}

function clearButton(b: ButtonState): void {
  b.down = false;
  b.pressed = false;
  b.released = false;
}

function writeNeutral(f: InputFrame): InputFrame {
  f.steer = 0;
  f.pitch = 0;
  clearButton(f.jump);
  clearButton(f.trick);
  clearButton(f.grab);
  f.handlePressed = false;
  f.heroPressed = false;
  f.pausePressed = false;
  return f;
}

/** Fraction of the surface width (from the left) where a free touch spawns the joystick. */
const STICK_ZONE = 0.6;
const MAX_POINTERS = 10;
const ROLE_STICK = -1;
const N_BUTTONS = BUTTON_IDS.length;
const FOREIGN_SELECTOR = 'button, a[href], input, select, textarea, label, summary, [role="button"], [contenteditable], [data-input-ignore]';
/** Inline styles forced on the surface while attached (previous values are restored on detach). */
const SURFACE_STYLE: readonly (readonly [string, string])[] = [
  ['touch-action', 'none'],
  ['user-select', 'none'],
  ['-webkit-user-select', 'none'],
  ['-webkit-touch-callout', 'none'],
  ['-webkit-tap-highlight-color', 'transparent'],
];

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false;
  } catch {
    // matchMedia unavailable → fall through to maxTouchPoints
  }
  return typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;
}

class Input implements IInput {
  readonly joystick: StickState = { active: false, originX: 0, originY: 0, x: 0, y: 0 };

  private surface: HTMLElement | null = null;
  private enabled = true;
  private touch = detectTouchDevice();
  private haptics = true;
  private invertY = false;
  private virtual: VirtualInput | null = null;

  private readonly frame = neutralInputFrame();
  private readonly aux: ButtonState[] = [up(), up(), up()];
  private readonly latches: ButtonLatch[] = [];
  private readonly els: (HTMLElement | null)[] = [];
  private readonly shown: boolean[] = [];
  private readonly touchCount: number[] = [];
  private readonly keyCount: number[] = [];
  private readonly padDown: boolean[] = [];
  private readonly dirCount: number[] = [0, 0, 0, 0];

  private readonly ptrId: number[] = [];
  private readonly ptrRole: number[] = [];
  private stickPointer = -1;

  private readonly pad = new GamepadReader();
  private readonly tmp: Vec2 = { x: 0, y: 0 };
  private keyX = 0;
  private keyY = 0;
  private lastPoll = now();

  private savedStyle: string[] | null = null;
  private savedPointerEvents: string | null = null;
  private savedOverscroll: [string, string] | null = null;

  constructor() {
    for (let i = 0; i < N_BUTTONS; i++) {
      this.latches.push(new ButtonLatch());
      this.els.push(null);
      this.shown.push(false);
      this.touchCount.push(0);
      this.keyCount.push(0);
      this.padDown.push(false);
    }
  }

  get touchMode(): boolean {
    return this.touch;
  }

  // ─────────────────────────────────────────────────────────── lifecycle ──

  attach(surface: HTMLElement): void {
    if (this.surface === surface) return;
    if (this.surface) this.detach();
    this.surface = surface;
    this.savedStyle = SURFACE_STYLE.map(([prop]) => surface.style.getPropertyValue(prop));
    for (const [prop, value] of SURFACE_STYLE) surface.style.setProperty(prop, value);

    const active: AddEventListenerOptions = { passive: false };
    surface.addEventListener('pointerdown', this.onPointerDown, active);
    surface.addEventListener('touchstart', this.onTouchGuard, active);
    surface.addEventListener('touchmove', this.onTouchGuard, active);
    surface.addEventListener('touchend', this.onTouchGuard, active);
    surface.addEventListener('contextmenu', this.onSurfaceGuard);
    surface.addEventListener('dblclick', this.onSurfaceGuard);
    surface.addEventListener('selectstart', this.onSurfaceGuard);
    surface.addEventListener('dragstart', this.onSurfaceGuard);

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('wheel', this.onWheel, active);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('gesturestart', this.onGesture, active);
    document.addEventListener('gesturechange', this.onGesture, active);
    document.addEventListener('gestureend', this.onGesture, active);
    this.pad.attach();
    this.applySurfaceMode();
  }

  detach(): void {
    const surface = this.surface;
    if (!surface) return;
    this.releaseAll(true);
    surface.removeEventListener('pointerdown', this.onPointerDown);
    surface.removeEventListener('touchstart', this.onTouchGuard);
    surface.removeEventListener('touchmove', this.onTouchGuard);
    surface.removeEventListener('touchend', this.onTouchGuard);
    surface.removeEventListener('contextmenu', this.onSurfaceGuard);
    surface.removeEventListener('dblclick', this.onSurfaceGuard);
    surface.removeEventListener('selectstart', this.onSurfaceGuard);
    surface.removeEventListener('dragstart', this.onSurfaceGuard);

    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('gesturestart', this.onGesture);
    document.removeEventListener('gesturechange', this.onGesture);
    document.removeEventListener('gestureend', this.onGesture);
    this.pad.detach();

    this.surface = null;
    this.applySurfaceMode(surface);
    if (this.savedStyle) {
      SURFACE_STYLE.forEach(([prop], i) => {
        const prev = this.savedStyle?.[i] ?? '';
        if (prev) surface.style.setProperty(prop, prev);
        else surface.style.removeProperty(prop);
      });
      this.savedStyle = null;
    }
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.releaseAll(true);
    this.lastPoll = now();
    this.applySurfaceMode();
  }

  /**
   * While gameplay input is on: make sure the surface receives pointers (it may be a
   * `pointer-events: none` overlay) and the page cannot overscroll / pull-to-refresh.
   */
  private applySurfaceMode(detached?: HTMLElement): void {
    if (typeof document === 'undefined') return;
    const surface = this.surface;
    const on = this.enabled && surface !== null;
    const el = surface ?? detached;
    if (el) {
      if (on && this.savedPointerEvents === null) {
        if (getComputedStyle(el).pointerEvents === 'none') {
          this.savedPointerEvents = el.style.pointerEvents;
          el.style.pointerEvents = 'auto';
        }
      } else if (!on && this.savedPointerEvents !== null) {
        el.style.pointerEvents = this.savedPointerEvents;
        this.savedPointerEvents = null;
      }
    }
    const html = document.documentElement;
    const body = document.body;
    if (on && !this.savedOverscroll) {
      this.savedOverscroll = [html.style.overscrollBehavior, body ? body.style.overscrollBehavior : ''];
      html.style.overscrollBehavior = 'none';
      if (body) body.style.overscrollBehavior = 'none';
    } else if (!on && this.savedOverscroll) {
      html.style.overscrollBehavior = this.savedOverscroll[0];
      if (body) body.style.overscrollBehavior = this.savedOverscroll[1];
      this.savedOverscroll = null;
    }
  }

  // ─────────────────────────────────────────────────────────── buttons ──

  bindButton(id: ButtonId, el: HTMLElement | null): void {
    const i = BTN[id];
    const prev = this.els[i];
    if (prev === el) return;
    if (prev) {
      prev.removeEventListener('pointerdown', this.onPointerDown);
      prev.classList.remove('is-down');
    }
    this.els[i] = el;
    if (el) {
      // Also listen on the element itself: it may live outside the surface and accept pointers.
      el.addEventListener('pointerdown', this.onPointerDown, { passive: false });
      el.classList.toggle('is-down', this.shown[i]);
    }
  }

  /** Recompute the effective state of button `i` from every source and feed the latch. */
  private refresh(i: number): void {
    let down = this.touchCount[i] > 0 || this.keyCount[i] > 0 || this.padDown[i];
    const v = this.virtual;
    if (v && i !== BTN.pause) {
      down = i === BTN.jump ? v.jump : i === BTN.trick ? v.trick : i === BTN.grab ? v.grab : i === BTN.handle ? v.handle : v.hero;
    }
    if (!this.enabled) down = false;
    this.latches[i].set(down);
    if (down !== this.shown[i]) {
      this.shown[i] = down;
      const el = this.els[i];
      if (el) el.classList.toggle('is-down', down);
    }
  }

  private refreshAll(): void {
    for (let i = 0; i < N_BUTTONS; i++) this.refresh(i);
  }

  /** Drop every held pointer / key. `silent` = no release edges (used when input is switched off). */
  private releaseAll(silent: boolean): void {
    const surface = this.surface;
    for (let p = 0; p < this.ptrId.length; p++) {
      if (surface) {
        try {
          surface.releasePointerCapture(this.ptrId[p]);
        } catch {
          // pointer already gone
        }
      }
    }
    this.ptrId.length = 0;
    this.ptrRole.length = 0;
    this.stickPointer = -1;
    stickEnd(this.joystick);
    this.touchCount.fill(0);
    this.keyCount.fill(0);
    this.padDown.fill(false);
    this.dirCount.fill(0);
    this.keyX = 0;
    this.keyY = 0;
    if (silent) for (let i = 0; i < N_BUTTONS; i++) this.latches[i].reset();
    this.refreshAll();
  }

  // ─────────────────────────────────────────────────────────── pointers ──

  /** Events on menu UI (#ui), form controls or outside the surface are not ours. */
  private isForeign(target: EventTarget | null): boolean {
    const surface = this.surface;
    if (!surface || !target || typeof (target as Element).closest !== 'function') return true;
    const el = target as Element;
    if (el === surface) return false;
    for (let i = 0; i < N_BUTTONS; i++) {
      const b = this.els[i];
      if (b && (b === el || b.contains(el))) return false;
    }
    if (!surface.contains(el)) return true;
    let node: Element | null = el;
    while (node && node !== surface) {
      if (node.id === 'ui' || node.matches(FOREIGN_SELECTOR)) return true;
      node = node.parentElement;
    }
    return false;
  }

  /** Index of the bound button under the point (rect + slop, nearest wins), or −1. */
  private hitButton(x: number, y: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < N_BUTTONS; i++) {
      const el = this.els[i];
      if (!el || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const slop = Math.min(22, Math.max(10, Math.min(r.width, r.height) * 0.22));
      if (x < r.left - slop || x > r.right + slop || y < r.top - slop || y > r.bottom + slop) continue;
      const hw = r.width / 2 + slop;
      const hh = r.height / 2 + slop;
      const d = Math.hypot((x - (r.left + r.width / 2)) / hw, (y - (r.top + r.height / 2)) / hh);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const surface = this.surface;
    if (!this.enabled || !surface) return;
    if (this.ptrId.indexOf(e.pointerId) >= 0) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.isForeign(e.target)) return;
    if (e.cancelable) e.preventDefault();

    let role: number;
    const hit = this.hitButton(e.clientX, e.clientY);
    if (hit >= 0) {
      role = hit;
    } else if (this.stickPointer < 0 && this.inStickZone(e.clientX)) {
      role = ROLE_STICK;
    } else {
      if (e.pointerType !== 'mouse') this.touch = true;
      return;
    }
    if (this.ptrId.length >= MAX_POINTERS) return;
    this.ptrId.push(e.pointerId);
    this.ptrRole.push(role);
    try {
      surface.setPointerCapture(e.pointerId);
    } catch {
      // capture is a nicety (window listeners still see the pointer)
    }
    if (role === ROLE_STICK) {
      this.touch = true;
      this.stickPointer = e.pointerId;
      stickStart(this.joystick, e.clientX, e.clientY);
    } else {
      if (e.pointerType !== 'mouse') this.touch = true;
      this.touchCount[role]++;
      this.refresh(role);
    }
  };

  private inStickZone(clientX: number): boolean {
    const surface = this.surface;
    if (!surface) return false;
    const r = surface.getBoundingClientRect();
    const w = r.width > 0 ? r.width : window.innerWidth;
    return clientX - r.left <= w * STICK_ZONE;
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointer) return;
    stickMove(this.joystick, e.clientX, e.clientY, STICK.radius);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const p = this.ptrId.indexOf(e.pointerId);
    if (p < 0) return;
    const role = this.ptrRole[p];
    this.ptrId.splice(p, 1);
    this.ptrRole.splice(p, 1);
    if (role === ROLE_STICK) {
      this.stickPointer = -1;
      stickEnd(this.joystick);
    } else {
      this.touchCount[role] = Math.max(0, this.touchCount[role] - 1);
      this.refresh(role);
    }
  };

  // ───────────────────────────────────────────── browser gesture guards ──

  /** touchstart / touchmove / touchend on the surface: no scroll, no zoom, no synthetic mouse events. */
  private readonly onTouchGuard = (e: TouchEvent): void => {
    if (this.enabled && e.cancelable && !this.isForeign(e.target)) e.preventDefault();
  };

  private readonly onSurfaceGuard = (e: Event): void => {
    if (this.enabled && !this.isForeign(e.target)) e.preventDefault();
  };

  /** Safari pinch gestures. */
  private readonly onGesture = (e: Event): void => {
    if (this.enabled && e.cancelable) e.preventDefault();
  };

  /** Ctrl / ⌘ + wheel = browser zoom (also trackpad pinch). */
  private readonly onWheel = (e: WheelEvent): void => {
    if (this.enabled && (e.ctrlKey || e.metaKey) && e.cancelable) e.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.releaseAll(false);
  };

  private readonly onVisibility = (): void => {
    if (document.hidden) this.releaseAll(false);
  };

  // ─────────────────────────────────────────────────────────── keyboard ──

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
    const action = keyAction(e.code);
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    this.touch = false;
    if (action.kind === 'dir') this.dirCount[action.index]++;
    else {
      this.keyCount[action.index]++;
      this.refresh(action.index);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = keyAction(e.code);
    if (!action) return;
    if (action.kind === 'dir') this.dirCount[action.index] = Math.max(0, this.dirCount[action.index] - 1);
    else {
      this.keyCount[action.index] = Math.max(0, this.keyCount[action.index] - 1);
      this.refresh(action.index);
    }
  };

  // ───────────────────────────────────────────────────────────── poll ──

  poll(): InputFrame {
    const f = this.frame;
    const t = now();
    let dt = (t - this.lastPoll) / 1000;
    this.lastPoll = t;
    if (!(dt > 0)) dt = 0;
    else if (dt > 0.05) dt = 0.05;

    if (!this.enabled) return writeNeutral(f);

    const pad = this.pad;
    pad.read();
    for (let i = 0; i < N_BUTTONS; i++) {
      if (pad.down[i] !== this.padDown[i]) {
        this.padDown[i] = pad.down[i];
        this.refresh(i);
      }
    }
    if (pad.active) this.touch = false;

    const latches = this.latches;
    latches[BTN.jump].poll(f.jump);
    latches[BTN.trick].poll(f.trick);
    latches[BTN.grab].poll(f.grab);
    f.handlePressed = latches[BTN.handle].poll(this.aux[0]).pressed;
    f.heroPressed = latches[BTN.hero].poll(this.aux[1]).pressed;
    f.pausePressed = latches[BTN.pause].poll(this.aux[2]).pressed;

    const v = this.virtual;
    if (v) {
      this.keyX = 0;
      this.keyY = 0;
      f.steer = clampUnit(v.steer);
      f.pitch = clampUnit(v.pitch);
      return f;
    }

    const js = this.joystick;
    const tmp = this.tmp;
    if (js.active) stickOutput(js.x, js.y, STICK, tmp);
    else tmp.x = tmp.y = 0;
    const inv = this.invertY ? -1 : 1;
    const dir = this.dirCount;
    const tx = clampUnit((dir[DIR.right] > 0 ? 1 : 0) - (dir[DIR.left] > 0 ? 1 : 0) + pad.dpad.x);
    const ty = clampUnit((dir[DIR.up] > 0 ? 1 : 0) - (dir[DIR.down] > 0 ? 1 : 0) + pad.dpad.y);
    this.keyX = keyAxisStep(this.keyX, tx, dt);
    this.keyY = keyAxisStep(this.keyY, ty, dt);
    f.steer = clampUnit(tmp.x + pad.stick.x + this.keyX);
    f.pitch = clampUnit((tmp.y + pad.stick.y) * inv + this.keyY);
    return f;
  }

  // ───────────────────────────────────────────────────────── settings ──

  setVirtual(v: Partial<VirtualInput> | null): void {
    if (v === null) {
      this.virtual = null;
    } else {
      const cur = this.virtual ?? (this.virtual = { steer: 0, pitch: 0, jump: false, trick: false, grab: false, handle: false, hero: false });
      cur.steer = Number.isFinite(v.steer) ? (v.steer as number) : 0;
      cur.pitch = Number.isFinite(v.pitch) ? (v.pitch as number) : 0;
      cur.jump = v.jump === true;
      cur.trick = v.trick === true;
      cur.grab = v.grab === true;
      cur.handle = v.handle === true;
      cur.hero = v.hero === true;
    }
    this.refreshAll();
  }

  setInvertY(on: boolean): void {
    this.invertY = on;
  }

  setHaptics(on: boolean): void {
    this.haptics = on;
    if (!on) this.rawVibrate(0);
  }

  vibrate(pattern: number | number[]): void {
    if (this.haptics) this.rawVibrate(pattern);
  }

  private rawVibrate(pattern: number | number[]): void {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // blocked before the first user gesture / unsupported — haptics are optional
    }
  }
}

export function createInput(): IInput {
  return new Input();
}
