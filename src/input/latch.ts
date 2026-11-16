/**
 * Edge-safe button latch (pure, headless).
 *
 * Raw transitions are fed in at EVENT time (`set`), `poll` converts them into per-frame edges.
 * Guarantees:
 *  - a tap that goes down and up between two polls is reported as `pressed` (+ `down`) on the next
 *    poll and `released` on the one after — the press is never lost;
 *  - an up-then-down between two polls while held is reported as `released`, then `pressed`;
 *  - `pressed` and `released` are never both true in the same frame, and `down` always matches the
 *    edge history a consumer has seen.
 */
import type { ButtonState } from '../types';

export class ButtonLatch {
  private raw = false;
  private reported = false;
  private pendingPress = false;
  private pendingRelease = false;

  /** Physical state right now (after the latest event). */
  get isDown(): boolean {
    return this.raw;
  }

  set(down: boolean): void {
    if (down === this.raw) return;
    this.raw = down;
    if (down) {
      if (!this.reported) this.pendingPress = true;
    } else if (this.reported) {
      this.pendingRelease = true;
    }
  }

  poll(out: ButtonState): ButtonState {
    out.pressed = false;
    out.released = false;
    if (!this.reported) {
      if (this.pendingPress || this.raw) {
        this.reported = true;
        out.pressed = true;
      }
    } else if (this.pendingRelease || !this.raw) {
      this.reported = false;
      out.released = true;
    }
    this.pendingPress = false;
    this.pendingRelease = false;
    out.down = this.reported;
    return out;
  }

  /** Forget everything without producing edges (input disabled / run reset). */
  reset(): void {
    this.raw = false;
    this.reported = false;
    this.pendingPress = false;
    this.pendingRelease = false;
  }
}
