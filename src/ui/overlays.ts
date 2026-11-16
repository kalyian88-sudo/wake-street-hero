/** Layers above the screens: toasts, modal sheets / dialogs, the replay "skip" bar. */
import { t } from '../i18n/i18n';
import { button, sfx } from './components/basic';
import { animate, cx, h, prefersReducedMotion, type Child } from './dom';
import { icon, type IconName } from './icons';

export interface ModalAction<T extends string> {
  value: T;
  label: string;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
}

export interface ModalOptions<T extends string> {
  title: string;
  text?: string;
  /** Extra content between the text and the buttons. */
  body?: Child;
  icon?: IconName;
  actions: ModalAction<T>[];
  /** Tap outside / Back closes it (resolves null). Default true. */
  dismissible?: boolean;
  cls?: string;
}

interface OpenModal {
  el: HTMLElement;
  dismissible: boolean;
  close(value: string | null): void;
}

const EASE = 'cubic-bezier(.2,.8,.2,1)';

export class Overlays {
  private readonly toasts: HTMLElement;
  private readonly modals: HTMLElement;
  private readonly replay: HTMLElement;
  private readonly open: OpenModal[] = [];
  private replaySkip: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.modals = h('div', { class: 'wn-modals' });
    this.replay = h('div', { class: 'wn-replay', hidden: true });
    this.toasts = h('div', { class: 'wn-toasts', 'aria-live': 'polite' });
    root.append(this.replay, this.modals, this.toasts);
  }

  // ─────────────────────────────────────────────────────────── toasts ──

  toast(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    if (!text) return;
    // The same message twice in a row just restarts its timer.
    const twin = [...this.toasts.children].find((c) => c.textContent === text) as HTMLElement | undefined;
    twin?.remove();
    const el = h('div', { class: `wn-toast wn-toast--${kind}`, role: 'status' }, icon(kind === 'good' ? 'check' : kind === 'bad' ? 'close' : 'info'), h('span', null, text));
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    void animate(el, [{ opacity: 0, transform: 'translate3d(0,-14px,0) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE });
    window.setTimeout(() => {
      if (!el.isConnected) return;
      void animate(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(0,-10px,0)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).then(() => el.remove());
    }, 2600);
  }

  // ─────────────────────────────────────────────────────────── modals ──

  get hasModal(): boolean {
    return this.open.length > 0;
  }

  /** Back / Esc: close the top modal if it allows it. Returns true when a modal consumed the event. */
  dismissTop(): boolean {
    const top = this.open[this.open.length - 1];
    if (!top) return false;
    if (top.dismissible) {
      sfx('ui.back');
      top.close(null);
    }
    return true;
  }

  closeAll(): void {
    for (const m of [...this.open]) m.close(null);
  }

  modal<T extends string>(opts: ModalOptions<T>): Promise<T | null> {
    return new Promise((resolve) => {
      const dismissible = opts.dismissible !== false;
      const card = h(
        'div',
        { class: cx('wn-modal__card', opts.cls), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
        h('div', { class: 'wn-modal__grip' }),
        opts.icon ? h('div', { class: 'wn-modal__icon' }, icon(opts.icon)) : null,
        h('h2', { class: 'wn-modal__title' }, opts.title),
        opts.text ? h('p', { class: 'wn-modal__text' }, opts.text) : null,
        opts.body ? h('div', { class: 'wn-modal__body' }, opts.body) : null,
        h(
          'div',
          { class: 'wn-modal__actions' },
          opts.actions.map((a) =>
            button({ label: a.label, icon: a.icon, kind: a.kind ?? 'secondary', size: 'lg', block: true, sfx: a.kind === 'primary' || a.kind === 'danger' ? 'ui.tap' : 'ui.back', onClick: () => entry.close(a.value) }),
          ),
        ),
      );
      const el = h('div', { class: 'wn-modal' }, h('div', { class: 'wn-modal__dim' }), card);
      let closed = false;
      const entry: OpenModal = {
        el,
        dismissible,
        close: (value) => {
          if (closed) return;
          closed = true;
          const i = this.open.indexOf(entry);
          if (i >= 0) this.open.splice(i, 1);
          el.classList.add('is-leaving');
          resolve(value as T | null);
          if (prefersReducedMotion()) {
            el.remove();
            return;
          }
          void animate(card, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(0,24px,0)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
          void animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).then(() => el.remove());
        },
      };
      el.addEventListener('click', (ev) => {
        if (dismissible && (ev.target as HTMLElement).classList.contains('wn-modal__dim')) {
          sfx('ui.back');
          entry.close(null);
        }
      });
      this.open.push(entry);
      this.modals.appendChild(el);
      if (!prefersReducedMotion()) {
        void animate(el.firstElementChild as Element, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
        void animate(card, [{ opacity: 0, transform: 'translate3d(0,40px,0)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE });
      }
    });
  }

  // ─────────────────────────────────────────────────────── replay bar ──

  showReplay(onSkip: () => void): void {
    this.replaySkip = onSkip;
    this.replay.textContent = '';
    this.replay.append(
      h('div', { class: 'wn-replay__tag' }, h('i'), h('span', null, t('ui.replay.tag'))),
      button({ label: t('ui.replay.skip'), iconEnd: 'skip', kind: 'light', size: 'md', cls: 'wn-replay__skip', onClick: () => this.replaySkip?.() }),
    );
    this.replay.hidden = false;
    void animate(this.replay, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
  }

  hideReplay(): void {
    this.replaySkip = null;
    this.replay.hidden = true;
    this.replay.textContent = '';
  }

  get replayVisible(): boolean {
    return !this.replay.hidden;
  }
}
