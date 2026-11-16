/**
 * Keyboard mapping (by physical key = KeyboardEvent.code, so it works on any layout, incl. ЙЦУКЕН).
 * Arrows / WASD = stick, Space = JUMP, X = TRICK, C = GRAB/FLIP, V = HANDLE, Shift = HERO, Esc / P = pause.
 */
import type { ButtonId } from '../types';

export const BUTTON_IDS: readonly ButtonId[] = ['jump', 'trick', 'grab', 'handle', 'hero', 'pause'];
export const BTN = { jump: 0, trick: 1, grab: 2, handle: 3, hero: 4, pause: 5 } as const;

export const DIR = { left: 0, right: 1, up: 2, down: 3 } as const;

export type KeyAction = { kind: 'button'; index: number } | { kind: 'dir'; index: number };

const KEYMAP: Record<string, KeyAction> = {
  ArrowLeft: { kind: 'dir', index: DIR.left },
  ArrowRight: { kind: 'dir', index: DIR.right },
  ArrowUp: { kind: 'dir', index: DIR.up },
  ArrowDown: { kind: 'dir', index: DIR.down },
  KeyA: { kind: 'dir', index: DIR.left },
  KeyD: { kind: 'dir', index: DIR.right },
  KeyW: { kind: 'dir', index: DIR.up },
  KeyS: { kind: 'dir', index: DIR.down },
  Space: { kind: 'button', index: BTN.jump },
  KeyX: { kind: 'button', index: BTN.trick },
  KeyC: { kind: 'button', index: BTN.grab },
  KeyV: { kind: 'button', index: BTN.handle },
  ShiftLeft: { kind: 'button', index: BTN.hero },
  ShiftRight: { kind: 'button', index: BTN.hero },
  Escape: { kind: 'button', index: BTN.pause },
  KeyP: { kind: 'button', index: BTN.pause },
};

export function keyAction(code: string): KeyAction | undefined {
  return KEYMAP[code];
}

/** Key cap text shown on the HUD buttons in keyboard mode. */
export const KEY_LEGEND: Record<ButtonId, string> = {
  jump: 'SPACE',
  trick: 'X',
  grab: 'C',
  handle: 'V',
  hero: 'SHIFT',
  pause: 'ESC',
};

/** True when the event target is a text field (never steal typing). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}
