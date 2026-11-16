/**
 * Gamepad (standard mapping) — bonus input device. Polled once per frame, only after a pad connected.
 * Left stick / d-pad = stick, A = JUMP, X = TRICK, B = GRAB/FLIP, Y / LB = HANDLE, RB / RT = HERO, Start = pause.
 */
import { BTN } from './keyboard';
import { axesOutput, type Vec2 } from './stick';

const PAD_DEAD_ZONE = 0.18;
const PAD_CURVE = 1.25;

/** Standard-mapping button index → game button index (several pad buttons may share one). */
const PAD_BUTTONS: readonly (readonly [number, number])[] = [
  [0, BTN.jump],
  [2, BTN.trick],
  [1, BTN.grab],
  [3, BTN.handle],
  [4, BTN.handle],
  [5, BTN.hero],
  [7, BTN.hero],
  [9, BTN.pause],
];

function held(buttons: readonly GamepadButton[], i: number): boolean {
  const b = buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
}

export class GamepadReader {
  /** Shaped stick: x = steer (+ right), y = pitch (+ up). */
  readonly stick: Vec2 = { x: 0, y: 0 };
  /** D-pad as digital directions −1 / 0 / 1 (x + right, y + up). */
  readonly dpad: Vec2 = { x: 0, y: 0 };
  /** Per game button (index = BTN.*). */
  readonly down: boolean[] = [false, false, false, false, false, false];
  /** Any control was touched during the last read. */
  active = false;
  private connected = 0;
  private readonly onConnect = (): void => {
    this.connected++;
  };
  private readonly onDisconnect = (): void => {
    this.connected = Math.max(0, this.connected - 1);
    if (this.connected === 0) this.clear();
  };

  attach(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', this.onConnect);
    window.addEventListener('gamepaddisconnected', this.onDisconnect);
  }

  detach(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('gamepadconnected', this.onConnect);
    window.removeEventListener('gamepaddisconnected', this.onDisconnect);
    this.connected = 0;
    this.clear();
  }

  clear(): void {
    this.stick.x = this.stick.y = 0;
    this.dpad.x = this.dpad.y = 0;
    this.down.fill(false);
    this.active = false;
  }

  /** Refresh the state fields. Cheap no-op while no pad is connected. */
  read(): void {
    if (this.connected === 0) return;
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    let pad: Gamepad | null = null;
    try {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (p && p.connected && (p.mapping === 'standard' || p.buttons.length >= 10)) {
          pad = p;
          break;
        }
      }
    } catch {
      pad = null;
    }
    if (!pad) {
      this.clear();
      return;
    }
    axesOutput(pad.axes[0] ?? 0, pad.axes[1] ?? 0, PAD_DEAD_ZONE, PAD_CURVE, this.stick);
    const b = pad.buttons;
    this.dpad.x = (held(b, 15) ? 1 : 0) - (held(b, 14) ? 1 : 0);
    this.dpad.y = (held(b, 12) ? 1 : 0) - (held(b, 13) ? 1 : 0);
    this.down.fill(false);
    let any = this.stick.x !== 0 || this.stick.y !== 0 || this.dpad.x !== 0 || this.dpad.y !== 0;
    for (let i = 0; i < PAD_BUTTONS.length; i++) {
      const m = PAD_BUTTONS[i];
      if (held(b, m[0])) {
        this.down[m[1]] = true;
        any = true;
      }
    }
    this.active = any;
  }
}
