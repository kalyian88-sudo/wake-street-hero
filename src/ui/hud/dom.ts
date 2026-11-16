/** Tiny DOM helpers for the HUD (no framework, no per-frame allocations). */
import type { IInput, L10n } from '../../types';

/** What every HUD part needs from the outside world. */
export interface HudCtx {
  t(key: string, params?: Record<string, string | number>): string;
  l(text: L10n): string;
  input: IInput;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: Element | null, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** Persistent text node — update with `node.data = …` (no node churn). */
export function txt(parent: Element, value = ''): Text {
  const n = document.createTextNode(value);
  parent.appendChild(n);
  return n;
}

/** Static, trusted SVG markup (icons / rings defined in this module only). */
export function svg(markup: string, cls: string, parent: Element, viewBox = '0 0 24 24'): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="${viewBox}" aria-hidden="true">${markup}</svg>`;
  const node = tpl.content.firstChild as SVGSVGElement;
  parent.appendChild(node);
  return node;
}

const GROUP = /\B(?=(\d{3})+(?!\d))/g;

/** 12450 → "12 450" (non-breaking space as the thousands separator, same in RU and EN). */
export function fmtInt(n: number): string {
  const v = Math.round(n);
  const s = String(Math.abs(v));
  const body = s.length > 3 ? s.replace(GROUP, ' ') : s;
  return v < 0 ? '−' + body : body;
}

/**
 * (Re)start the CSS animation that class `cls` puts on `el` itself — without forcing a layout.
 * One-shot classes are removed again on `animationend` (see ONE_SHOT in Hud.ts), so the usual path is
 * simply "add the class"; an animation that is still running (or held by `fill-mode: both`) is rewound.
 */
export function restart(el: Element, cls: string): void {
  if (!el.classList.contains(cls)) {
    el.classList.add(cls);
    return;
  }
  let rewound = false;
  if (typeof el.getAnimations === 'function' && typeof CSSAnimation !== 'undefined') {
    const anims = el.getAnimations();
    for (let i = 0; i < anims.length; i++) {
      const a = anims[i];
      if (a instanceof CSSAnimation) {
        a.cancel();
        a.play();
        rewound = true;
      }
    }
  }
  if (rewound) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const ICON = {
  star: '<path d="M12 2.2l3 6.3 6.8.9-5 4.7 1.3 6.8L12 17.6l-6.1 3.3 1.3-6.8-5-4.7 6.8-.9z"/>',
  bolt: '<path d="M13.6 1.8 4.4 13.6h5.7L8.4 22.2 19.6 9.9h-6z"/>',
  camera:
    '<path d="M3 7.6A2.6 2.6 0 0 1 5.6 5h7.8A2.6 2.6 0 0 1 16 7.6v1.5l4.1-2.4a.6.6 0 0 1 .9.5v9.6a.6.6 0 0 1-.9.5L16 14.9v1.5a2.6 2.6 0 0 1-2.6 2.6H5.6A2.6 2.6 0 0 1 3 16.4z"/>',
  gap: '<path d="M3 18c2.3-7.8 5.7-11.2 9.3-11.2 3 0 5.3 2 6.9 5.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M22 8.6l-1.7 6-5-3.4z"/>',
  line: '<path d="M4.5 17.5l5-8 5.5 4.5 4.5-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4.5" cy="17.5" r="2.5"/><circle cx="9.5" cy="9.5" r="2.5"/><circle cx="15" cy="14" r="2.5"/><circle cx="19.5" cy="6" r="2.5"/>',
  handle:
    '<path d="M12 1.5v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 4.5 5.5 15h13z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="3.5" y="15" width="17" height="5" rx="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
} as const;

export type IconId = keyof typeof ICON;
