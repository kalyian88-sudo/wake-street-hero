/**
 * Floating joystick + analog axis maths (pure, headless, allocation free).
 * Screen space: +x = right, +y = DOWN (CSS px). Output space: x = steer (+ right), y = pitch (+ UP).
 */

export interface StickConfig {
  /** Travel of the knob from the base centre, CSS px. */
  radius: number;
  /** Radial dead zone as a fraction of the radius. */
  deadZone: number;
  /** Response exponent (> 1 = finer control near the centre). */
  curve: number;
}

export const STICK: Readonly<StickConfig> = { radius: 56, deadZone: 0.16, curve: 1.25 };

/** Mutable joystick state. `x`/`y` are the knob OFFSET from the origin in px (|offset| ≤ radius). */
export interface StickState {
  active: boolean;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export function stickStart(s: StickState, px: number, py: number): void {
  s.active = true;
  s.originX = px;
  s.originY = py;
  s.x = 0;
  s.y = 0;
}

/**
 * Finger moved to (px, py). When it is dragged past the rim the base follows, so the knob always
 * sits exactly on the rim under the finger and reversing direction responds immediately.
 */
export function stickMove(s: StickState, px: number, py: number, radius: number): void {
  let dx = px - s.originX;
  let dy = py - s.originY;
  const d = Math.hypot(dx, dy);
  if (d > radius) {
    const k = (d - radius) / d;
    s.originX += dx * k;
    s.originY += dy * k;
    dx = px - s.originX;
    dy = py - s.originY;
  }
  s.x = dx;
  s.y = dy;
}

export function stickEnd(s: StickState): void {
  s.active = false;
  s.x = 0;
  s.y = 0;
}

/** Magnitude shaping shared by the stick and gamepad axes: dead zone → rescale to 0..1 → curve. */
export function shapeMagnitude(m: number, deadZone: number, curve: number): number {
  if (m <= deadZone) return 0;
  const n = Math.min(1, (m - deadZone) / (1 - deadZone));
  return Math.pow(n, curve);
}

/**
 * Knob offset (px, screen space) → normalised output: x = steer −1..1 (+ right), y = pitch −1..1 (+ up).
 * Radial dead zone keeps the direction exact; the result never leaves the unit circle.
 */
export function stickOutput(dx: number, dy: number, cfg: Readonly<StickConfig>, out: Vec2): Vec2 {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const m = shapeMagnitude(Math.min(1, d / cfg.radius), cfg.deadZone, cfg.curve);
  out.x = (dx / d) * m;
  out.y = (-dy / d) * m;
  return out;
}

/** Gamepad style input: both axes already −1..1, +y = DOWN as reported by the Gamepad API. */
export function axesOutput(ax: number, ay: number, deadZone: number, curve: number, out: Vec2): Vec2 {
  const d = Math.hypot(ax, ay);
  if (d < 1e-6) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const m = shapeMagnitude(Math.min(1, d), deadZone, curve);
  out.x = (ax / d) * m;
  out.y = (-ay / d) * m;
  return out;
}

/**
 * Digital key pair → analog axis with a short ramp.
 * A fresh press jumps straight to `KEY_AXIS.step` (so "TRICK + ←" pressed in the same frame already
 * reads as a clear direction) and then eases to full lock; releasing eases back to 0.
 */
export const KEY_AXIS = { step: 0.55, rise: 0.09, fall: 0.06 } as const;

export function keyAxisStep(value: number, target: number, dt: number): number {
  if (target === 0) {
    const d = dt / KEY_AXIS.fall;
    if (value > 0) return Math.max(0, value - d);
    return Math.min(0, value + d);
  }
  // Opposite direction or fresh press: snap to the step level on the target side.
  if (value * target < KEY_AXIS.step) value = target * KEY_AXIS.step;
  const d = ((1 - KEY_AXIS.step) * dt) / KEY_AXIS.rise;
  return target > 0 ? Math.min(1, value + d) : Math.max(-1, value - d);
}

export function clampUnit(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
