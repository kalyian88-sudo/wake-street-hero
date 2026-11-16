/**
 * Builds InputFrames from "held" button states — edges (pressed / released) are derived, exactly as
 * the real input module does. Used by the autopilot, the tests and the sandbox.
 */
import type { InputFrame } from '../types';
import { neutralInput } from './SimCore';

export interface Held {
  steer?: number;
  pitch?: number;
  jump?: boolean;
  trick?: boolean;
  grab?: boolean;
  handle?: boolean;
  hero?: boolean;
}

/** Turns held states into InputFrames with correct pressed / released edges. */
export class InputScript {
  readonly frame: InputFrame = neutralInput();
  private handleWas = false;
  private heroWas = false;

  set(h: Held): InputFrame {
    const f = this.frame;
    f.steer = h.steer ?? 0;
    f.pitch = h.pitch ?? 0;
    edge(f.jump, h.jump ?? false);
    edge(f.trick, h.trick ?? false);
    edge(f.grab, h.grab ?? false);
    const handle = h.handle ?? false;
    f.handlePressed = handle && !this.handleWas;
    this.handleWas = handle;
    const hero = h.hero ?? false;
    f.heroPressed = hero && !this.heroWas;
    this.heroWas = hero;
    return f;
  }
}

function edge(b: InputFrame['jump'], down: boolean): void {
  b.pressed = down && !b.down;
  b.released = !down && b.down;
  b.down = down;
}
