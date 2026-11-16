import type { ScreenId } from '../types';
import type { Params, UICtx } from './context';
import { h, mount, type Child } from './dom';

export type NavDir = 'forward' | 'back' | 'fade';

/**
 * A menu screen. The manager (nav.ts) mounts `el`, calls render() + onEnter(), and on the way out
 * onExit() and removes `el` after the exit transition.
 *  - `build()` returns the whole DOM for the current params / save / language (screens are small, so a
 *    full rebuild on 'save:changed' / 'lang:changed' is the default and scroll positions are preserved).
 *  - Screens with live controls (sliders…) override onSave() to patch instead of rebuilding.
 */
export abstract class Screen {
  readonly el: HTMLElement;
  params: Params = {};
  mounted = false;
  /** 'page' slides sideways, 'overlay' fades over whatever is behind. */
  readonly kind: 'page' | 'overlay' = 'page';
  /** Bumped on every mount/unmount so stale exit animations do not remove a re-entered screen. */
  token = 0;

  constructor(
    protected readonly ctx: UICtx,
    readonly id: ScreenId,
  ) {
    this.el = h('div', { class: `wn-screen wn-screen--${id}` });
  }

  protected abstract build(): Child;

  render(): void {
    // Remember scroll offsets of marked containers across a rebuild.
    const scroll = new Map<string, number>();
    for (const node of this.el.querySelectorAll<HTMLElement>('[data-scroll]')) {
      scroll.set(node.dataset.scroll ?? '', node.dataset.axis === 'x' ? node.scrollLeft : node.scrollTop);
    }
    mount(this.el, this.build());
    for (const node of this.el.querySelectorAll<HTMLElement>('[data-scroll]')) {
      const v = scroll.get(node.dataset.scroll ?? '');
      if (v === undefined) continue;
      if (node.dataset.axis === 'x') node.scrollLeft = v;
      else node.scrollTop = v;
    }
    this.afterRender();
  }

  /** Hook after every (re)build — wire things that need the DOM to be attached. */
  protected afterRender(): void {}

  /** Screen became visible (after the first render). */
  onEnter(_dir: NavDir): void {}
  /** Screen is leaving (exit transition starts). Stop loops / timers here. */
  onExit(): void {}
  /** Save data changed. */
  onSave(): void {
    this.render();
  }
  /** Language changed. */
  onLang(): void {
    this.render();
  }
  /** Back pressed. Return true if the screen handled it itself (e.g. closed an inner sheet). */
  onBack(): boolean {
    return false;
  }
  /** Viewport changed (rotation / resize). */
  onResize(): void {}
}
