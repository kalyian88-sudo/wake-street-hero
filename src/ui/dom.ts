/** Tiny DOM helpers for the menu UI (no framework). */
import { isLang, localeOf } from '../i18n/langs';

export type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  class?: string;
  /** Inline style text, e.g. `--i:2;color:red`. */
  style?: string;
  /** Trusted markup only (static SVG strings from icons.ts). */
  html?: string;
  dataset?: Record<string, string>;
  [key: string]: unknown;
}

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(parent, c);
    return;
  }
  parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
}

/**
 * Create an element: `h('button', { class: 'x', onclick: fn, disabled: true }, 'Label')`.
 * `on*` function props become listeners, booleans toggle attributes, everything else is an attribute.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = String(value);
      else if (key === 'style') el.style.cssText = String(value);
      else if (key === 'html') el.innerHTML = String(value);
      else if (key === 'dataset') Object.assign(el.dataset, value as Record<string, string>);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }
  for (const c of children) append(el, c);
  return el;
}

/** Replace all children. */
export function mount(parent: Element, ...children: Child[]): void {
  parent.textContent = '';
  for (const c of children) append(parent, c);
}

/** Space-joined class list from truthy parts. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** `0xRRGGBB` → `#rrggbb`. */
export function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Perceived brightness 0..1 of a 0xRRGGBB colour (to pick a contrasting tick / outline). */
export function luma(color: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Mix a colour towards black (amount < 0) or white (amount > 0), amount −1..1. */
export function shade(color: number, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  const ch = (shift: number): number => Math.round(((color >> shift) & 255) * (1 - k) + target * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const numberFormats: Record<string, Intl.NumberFormat> = {};

/** 12345 → "12 345" (ru) / "12,345" (en). */
export function fmt(n: number, lang: string): string {
  let f = numberFormats[lang];
  if (!f) {
    try {
      f = new Intl.NumberFormat(isLang(lang) ? localeOf(lang) : 'en-US', { maximumFractionDigits: 0 });
    } catch {
      f = new Intl.NumberFormat();
    }
    numberFormats[lang] = f;
  }
  // ru-RU groups with a narrow no-break space that some condensed system fonts lack → use a thin regular one.
  return f.format(Math.round(n)).replace(/[  ]/g, ' ');
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Web Animations wrapper that never throws and resolves when the animation ends (or is unsupported). */
export function animate(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
  try {
    if (typeof el.animate !== 'function') return Promise.resolve();
    const anim = el.animate(keyframes, options);
    return anim.finished.then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}

export const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
