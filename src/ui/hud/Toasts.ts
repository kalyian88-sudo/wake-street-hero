/** HUD toasts: gaps, goals (with a star), filmer clips, line progress, HERO ready. Pooled pills, newest on top. */
import { ICON, h, restart, txt, type HudCtx, type IconId } from './dom';

export type ToastKind = 'gap' | 'goal' | 'clip' | 'line' | 'hero' | 'letters';

const KIND_ICON: Record<ToastKind, IconId> = { gap: 'gap', goal: 'star', clip: 'camera', line: 'line', hero: 'bolt', letters: 'star' };
const TOAST_COUNT = 3;
const TOAST_TTL = 3;
const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">';

interface Toast {
  el: HTMLElement;
  inner: HTMLElement;
  icon: HTMLElement;
  title: Text;
  sub: Text;
  val: Text;
  kind: ToastKind | null;
  base: string;
  slot: number;
  ttl: number;
}

export class Toasts {
  private readonly items: Toast[] = [];

  constructor(root: HTMLElement, _ctx: HudCtx) {
    const box = h('div', 'wsh-toasts', root);
    for (let i = 0; i < TOAST_COUNT; i++) {
      const el = h('div', 'wsh-toast', box);
      const inner = h('div', 'wsh-toast-in', el);
      const icon = h('div', 'wsh-toast-icon', inner);
      const body = h('div', 'wsh-toast-body', inner);
      const title = txt(h('div', 'wsh-toast-title', body));
      const sub = txt(h('div', 'wsh-toast-sub', body));
      const val = txt(h('div', 'wsh-toast-val', inner));
      this.items.push({ el, inner, icon, title, sub, val, kind: null, base: 'wsh-toast', slot: 0, ttl: 0 });
    }
  }

  reset(): void {
    for (const t of this.items) {
      t.ttl = 0;
      t.el.className = 'wsh-toast';
    }
  }

  /** @param value optional right-hand figure, e.g. "+500". */
  push(kind: ToastKind, title: string, sub = '', value = ''): void {
    let pick: Toast | null = null;
    let oldest = this.items[0];
    for (const t of this.items) {
      if (t.ttl <= 0) pick = pick ?? t;
      else {
        t.slot++;
        t.el.className = t.base + ' s' + t.slot;
      }
      if (t.slot > oldest.slot) oldest = t;
    }
    const t = pick ?? oldest;
    if (t.kind !== kind) {
      t.kind = kind;
      t.icon.innerHTML = SVG_OPEN + ICON[KIND_ICON[kind]] + '</svg>';
    }
    t.title.data = title;
    t.sub.data = sub;
    t.val.data = value;
    t.slot = 0;
    t.ttl = TOAST_TTL;
    t.base = 'wsh-toast k-' + kind + (sub ? '' : ' no-sub') + (value ? '' : ' no-val');
    t.el.className = t.base + ' s0';
    restart(t.inner, 'is-in');
  }

  update(dt: number): void {
    for (let i = 0; i < TOAST_COUNT; i++) {
      const t = this.items[i];
      if (t.ttl > 0) {
        t.ttl -= dt;
        if (t.ttl <= 0) t.el.className = t.base + ' s' + t.slot + ' is-out';
      }
    }
  }
}
