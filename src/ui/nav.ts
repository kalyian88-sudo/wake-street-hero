/**
 * Screen manager: a back stack of { id, params } with enter/exit transitions (transform + opacity only).
 *
 *  go(id, params)  — push; if `id` is already in the stack, pop back to it (and update its params)
 *  back()          — pop (the visible screen may veto via onBack)
 *  hide() / show() — take every menu off screen while a run is on (the stack is kept)
 *  reset(entries)  — replace the whole stack
 */
import type { ScreenId } from '../types';
import type { Params } from './context';
import { animate, prefersReducedMotion } from './dom';
import type { NavDir, Screen } from './screen';

export interface Entry {
  id: ScreenId;
  params: Params;
  /** The menus were hidden (a run was on) when this entry was pushed — popping it hides them again. */
  overHidden?: boolean;
}

const EASE_OUT = 'cubic-bezier(.2,.8,.2,1)';
const EASE_IN = 'cubic-bezier(.5,0,.9,.4)';

export class Nav {
  private readonly factories = new Map<ScreenId, () => Screen>();
  private readonly screens = new Map<ScreenId, Screen>();
  private stack: Entry[] = [];
  private visible: Screen | null = null;
  private hidden = false;
  /** Called after every navigation with the id now on screen ('none' when hidden). */
  onChange: ((id: ScreenId) => void) | null = null;

  constructor(private readonly layer: HTMLElement) {}

  register(id: ScreenId, factory: () => Screen): void {
    this.factories.set(id, factory);
  }

  get current(): ScreenId {
    return this.visible && !this.hidden ? this.visible.id : 'none';
  }

  get top(): Entry | null {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  get depth(): number {
    return this.stack.length;
  }

  has(id: ScreenId): boolean {
    return this.stack.some((e) => e.id === id);
  }

  /** The screen object that is on screen right now. */
  get screen(): Screen | null {
    return this.hidden ? null : this.visible;
  }

  go(id: ScreenId, params: Params = {}): void {
    if (id === 'none') {
      this.hide();
      return;
    }
    if (!this.factories.has(id)) return;
    const index = this.stack.findIndex((e) => e.id === id);
    if (index >= 0) {
      const wasTop = index === this.stack.length - 1;
      this.stack.length = index + 1;
      this.stack[index].params = params;
      if (wasTop && this.visible?.id === id && !this.hidden) {
        // Same screen, new params: rebuild in place.
        this.visible.params = params;
        this.visible.render();
        this.visible.onEnter('fade');
        this.onChange?.(this.current);
        return;
      }
      this.present(wasTop ? 'fade' : 'back');
      return;
    }
    this.stack.push({ id, params, overHidden: this.hidden && this.stack.length > 0 });
    this.present('forward');
  }

  /** Swap the top entry for another screen (no way back to the replaced one). */
  replace(id: ScreenId, params: Params = {}): void {
    if (!this.factories.has(id)) return;
    this.stack.pop();
    this.stack = this.stack.filter((e) => e.id !== id);
    this.stack.push({ id, params });
    this.present('forward');
  }

  /** @returns false when there is nowhere to go back to. */
  back(): boolean {
    if (this.hidden) return false;
    if (this.visible?.onBack()) return true;
    return this.pop();
  }

  /** Pop the top entry without asking the screen. */
  pop(): boolean {
    if (this.stack.length <= 1) return false;
    const gone = this.stack.pop();
    if (gone?.overHidden) this.hide();
    else this.present('back');
    return true;
  }

  reset(entries: Entry[], dir: NavDir = 'back'): void {
    this.stack = entries.filter((e) => this.factories.has(e.id));
    this.present(dir);
  }

  /** Drop the given screens (and everything stacked above the first of them) without animating. */
  prune(ids: readonly ScreenId[]): void {
    const index = this.stack.findIndex((e) => ids.includes(e.id));
    if (index >= 0) this.stack.length = index;
  }

  hide(): void {
    if (this.hidden) return;
    this.hidden = true;
    this.leave(this.visible, 'fade');
    this.visible = null;
    this.onChange?.('none');
  }

  /** Bring the top of the stack back after hide(). */
  show(dir: NavDir = 'fade'): void {
    this.present(dir);
  }

  refresh(reason: 'save' | 'lang' | 'resize'): void {
    const s = this.screen;
    if (!s || !s.mounted) return;
    if (reason === 'save') s.onSave();
    else if (reason === 'lang') s.onLang();
    else s.onResize();
  }

  private instance(id: ScreenId): Screen | null {
    let s = this.screens.get(id);
    if (!s) {
      const make = this.factories.get(id);
      if (!make) return null;
      s = make();
      this.screens.set(id, s);
    }
    return s;
  }

  private present(dir: NavDir): void {
    this.hidden = false;
    const entry = this.top;
    const next = entry ? this.instance(entry.id) : null;
    const prev = this.visible;
    if (prev && prev !== next) this.leave(prev, next?.kind === 'overlay' || prev.kind === 'overlay' ? 'fade' : dir);
    this.visible = next;
    if (next && entry) {
      const reenter = prev === next;
      next.params = entry.params;
      next.token++;
      next.mounted = true;
      next.el.classList.remove('is-leaving');
      if (next.el.parentElement !== this.layer) this.layer.appendChild(next.el);
      else if (!reenter) this.layer.appendChild(next.el); // move to the top
      try {
        next.render();
        next.onEnter(dir);
      } catch (err) {
        console.error(`[ui] screen "${next.id}" failed to render`, err);
      }
      if (!reenter) this.enter(next, next.kind === 'overlay' || prev?.kind === 'overlay' ? 'fade' : dir);
    }
    this.onChange?.(this.current);
  }

  private enter(s: Screen, dir: NavDir): void {
    const el = s.el;
    for (const a of el.getAnimations?.() ?? []) a.cancel();
    el.classList.add('is-fresh');
    const token = s.token;
    window.setTimeout(() => {
      if (s.token === token) el.classList.remove('is-fresh');
    }, 900);
    if (prefersReducedMotion()) return;
    const dx = dir === 'forward' ? 36 : dir === 'back' ? -36 : 0;
    const from: Keyframe = dx ? { opacity: 0, transform: `translate3d(${dx}px,0,0)` } : { opacity: 0, transform: 'scale(1.03)' };
    void animate(el, [from, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE_OUT, fill: 'backwards' });
  }

  private leave(s: Screen | null, dir: NavDir): void {
    if (!s || !s.mounted) return;
    s.mounted = false;
    const token = ++s.token;
    try {
      s.onExit();
    } catch (err) {
      console.error(`[ui] screen "${s.id}" failed in onExit`, err);
    }
    const el = s.el;
    el.classList.add('is-leaving');
    el.classList.remove('is-fresh');
    const done = (): void => {
      if (s.token !== token) return; // re-entered meanwhile
      el.remove();
      el.classList.remove('is-leaving');
    };
    if (prefersReducedMotion()) {
      done();
      return;
    }
    const dx = dir === 'forward' ? -36 : dir === 'back' ? 36 : 0;
    const to: Keyframe = dx ? { opacity: 0, transform: `translate3d(${dx}px,0,0)` } : { opacity: 0, transform: 'scale(.985)' };
    void animate(el, [{ opacity: 1, transform: 'none' }, to], { duration: 200, easing: EASE_IN, fill: 'forwards' }).then(done);
  }
}
