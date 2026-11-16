/** Generic controls: buttons, tabs, segmented control, slider, toggle. */
import type { SfxId } from '../../types';
import { cx, h, type Child } from '../dom';
import { icon, type IconName } from '../icons';

let playSfx: (id: SfxId) => void = () => undefined;

/** The UI root wires the click sounds once (keeps components free of the game object). */
export function bindSfx(fn: (id: SfxId) => void): void {
  playSfx = fn;
}

export function sfx(id: SfxId): void {
  playSfx(id);
}

export interface Control<T> {
  el: HTMLElement;
  set(value: T): void;
}

export interface ButtonOpts {
  label?: string;
  /** Small second line under the label. */
  sub?: string;
  icon?: IconName;
  /** Icon after the label. */
  iconEnd?: IconName;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';
  size?: 'xl' | 'lg' | 'md' | 'sm';
  /** Stretch to the container width. */
  block?: boolean;
  disabled?: boolean;
  cls?: string;
  /** Click sound; null = silent. Default 'ui.tap'. */
  sfx?: SfxId | null;
  aria?: string;
  onClick?: (ev: MouseEvent) => void;
  extra?: Child;
}

export function button(o: ButtonOpts): HTMLButtonElement {
  const el = h(
    'button',
    {
      type: 'button',
      class: cx('wn-btn', `wn-btn--${o.kind ?? 'secondary'}`, `wn-btn--${o.size ?? 'md'}`, o.block && 'wn-btn--block', !o.label && 'wn-btn--icon', o.cls),
      'aria-label': o.aria ?? (o.label ? undefined : o.icon),
      disabled: o.disabled === true,
    },
    o.icon ? icon(o.icon) : null,
    o.label ? h('span', { class: 'wn-btn__text' }, h('span', { class: 'wn-btn__label' }, o.label), o.sub ? h('span', { class: 'wn-btn__sub' }, o.sub) : null) : null,
    o.iconEnd ? icon(o.iconEnd) : null,
    o.extra,
  );
  el.addEventListener('click', (ev) => {
    if (el.disabled) return;
    if (o.sfx !== null) playSfx(o.sfx ?? 'ui.tap');
    o.onClick?.(ev);
  });
  return el;
}

/** Square 48 px icon button (back, close…). */
export function iconButton(name: IconName, aria: string, onClick: () => void, opts: { sfx?: SfxId | null; cls?: string } = {}): HTMLButtonElement {
  const el = h('button', { type: 'button', class: cx('wn-ibtn', opts.cls), 'aria-label': aria }, icon(name));
  el.addEventListener('click', () => {
    if (opts.sfx !== null) playSfx(opts.sfx ?? 'ui.tap');
    onClick();
  });
  return el;
}

export interface Option<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  /** Small counter / marker after the label. */
  badge?: string;
  disabled?: boolean;
}

function optionGroup<T extends string>(
  cls: string,
  itemCls: string,
  items: readonly Option<T>[],
  value: T,
  onChange: (value: T) => void,
  role: 'tablist' | 'radiogroup',
): Control<T> {
  let current = value;
  const buttons = new Map<T, HTMLButtonElement>();
  const el = h('div', { class: cls, role });
  const sync = (): void => {
    for (const [v, b] of buttons) {
      const on = v === current;
      b.classList.toggle('is-on', on);
      b.setAttribute(role === 'tablist' ? 'aria-selected' : 'aria-checked', String(on));
    }
  };
  for (const it of items) {
    const b = h(
      'button',
      { type: 'button', class: itemCls, role: role === 'tablist' ? 'tab' : 'radio', disabled: it.disabled === true },
      it.icon ? icon(it.icon) : null,
      h('span', null, it.label),
      it.badge ? h('i', { class: 'wn-badge' }, it.badge) : null,
    );
    b.addEventListener('click', () => {
      if (it.value === current) return;
      current = it.value;
      sync();
      playSfx('ui.tap');
      if (role === 'tablist') b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      onChange(it.value);
    });
    buttons.set(it.value, b);
    el.appendChild(b);
  }
  sync();
  return {
    el,
    set(v) {
      current = v;
      sync();
    },
  };
}

/** Pill-shaped exclusive choice (2–4 options). */
export function segmented<T extends string>(items: readonly Option<T>[], value: T, onChange: (value: T) => void, cls?: string): Control<T> {
  return optionGroup(cx('wn-seg', cls), 'wn-seg__item', items, value, onChange, 'radiogroup');
}

/** Horizontally scrollable tab strip. */
export function tabs<T extends string>(items: readonly Option<T>[], value: T, onChange: (value: T) => void, cls?: string): Control<T> {
  const c = optionGroup(cx('wn-tabs', cls), 'wn-tabs__item', items, value, onChange, 'tablist');
  c.el.dataset.scroll = 'tabs';
  c.el.dataset.axis = 'x';
  return c;
}

export interface SliderOpts {
  min: number;
  max: number;
  step: number;
  value: number;
  aria: string;
  /** Fires continuously while dragging. */
  onInput?: (value: number) => void;
  /** Fires when the thumb is released. */
  onChange?: (value: number) => void;
  /** Labels under the track (one per stop) — makes it a stepped slider. */
  stops?: string[];
}

export function slider(o: SliderOpts): Control<number> {
  const input = h('input', { type: 'range', class: 'wn-slider__input', min: o.min, max: o.max, step: o.step, 'aria-label': o.aria });
  input.value = String(o.value);
  const stopEls = (o.stops ?? []).map((s) => h('span', null, s));
  const el = h(
    'div',
    { class: cx('wn-slider', o.stops && 'wn-slider--stops') },
    h('div', { class: 'wn-slider__track' }, h('div', { class: 'wn-slider__fill' }), o.stops ? o.stops.map((_, i) => h('i', { style: `left:${(i / (o.stops!.length - 1)) * 100}%` })) : null),
    input,
    o.stops ? h('div', { class: 'wn-slider__stops' }, stopEls) : null,
  );
  const paint = (): void => {
    const v = Number(input.value);
    el.style.setProperty('--p', String((v - o.min) / (o.max - o.min || 1)));
    stopEls.forEach((s, i) => s.classList.toggle('is-on', Math.round(((v - o.min) / (o.max - o.min || 1)) * (stopEls.length - 1)) === i));
  };
  let last = o.value;
  input.addEventListener('input', () => {
    paint();
    const v = Number(input.value);
    if (o.stops && v !== last) playSfx('ui.tap');
    last = v;
    o.onInput?.(v);
  });
  input.addEventListener('change', () => o.onChange?.(Number(input.value)));
  paint();
  return {
    el,
    set(v) {
      input.value = String(v);
      last = v;
      paint();
    },
  };
}

export function toggle(value: boolean, aria: string, onChange: (value: boolean) => void): Control<boolean> {
  let on = value;
  const el = h('button', { type: 'button', class: 'wn-toggle', role: 'switch', 'aria-label': aria }, h('i'));
  const sync = (): void => {
    el.classList.toggle('is-on', on);
    el.setAttribute('aria-checked', String(on));
  };
  el.addEventListener('click', () => {
    on = !on;
    sync();
    playSfx('ui.tap');
    onChange(on);
  });
  sync();
  return {
    el,
    set(v) {
      on = v;
      sync();
    },
  };
}
