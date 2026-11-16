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
 * (Re)start the CSS animation that class `cls` puts on `el` — without forcing a layout.
 * Animations restarted this way must use `animation-fill-mode: both`.
 */
export function restart(el: Element, cls: string): void {
  if (!el.classList.contains(cls)) {
    el.classList.add(cls);
    return;
  }
  if (typeof el.getAnimations === 'function') {
    const anims = el.getAnimations();
    for (let i = 0; i < anims.length; i++) {
      anims[i].cancel();
      anims[i].play();
    }
    if (anims.length > 0) return;
  }
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const ICON = {
  star: '<path d="M12 2.2l3 6.3 6.8.9-5 4.7 1.3 6.8L12 17.6l-6.1 3.3 1.3-6.8-5-4.7 6.800-.9z"/>',
  bolt: '<path d="M13.6 1.8 4.4 13.6h5.7L8.4 22.2 19.6 9.9h-6z"/>',
  camera:
    '<path d="M3 7.6A2.6 2.6 0 0 1 5.6 5h7.8A2.6 2.6 0 0 1 16 7.600v1.500l4.100-2.400a.6.6 0 0 1 .9.500v9.600a.6.6 0 0 1-.9.500L16 14.900v1.500a2.600 2.600 0 0 1-2.600 2.600H5.600A2.600 2.600 0 0 1 3 16.400z"/>',
  gap: '<path d="M3 18c2.300-7.800 5.700-11.200 9.300-11.200 3 0 5.300 2 6.900 5.800" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round"/><path d="M22 8.600l-1.700 6-5-3.400z"/>',
  line: '<path d="M4.500 17.500l5-8 5.500 4.500 4.500-8" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4.500" cy="17.500" r="2.500"/><circle cx="9.500" cy="9.500" r="2.500"/><circle cx="15" cy="14" r="2.500"/><circle cx="19.500" cy="6" r="2.500"/>',
  handle:
    '<path d="M12 1.500v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 4.500 5.500 15h13z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="3.500" y="15" width="17" height="5" rx="2.500"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
} as const;

export type IconId = keyof typeof ICON;
