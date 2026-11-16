/** DOM map pins shared by the hub (cities) and the city map (spots). Positioned per frame by transform only. */
import { clamp, cx, h, hex, type Child } from '../dom';
import { icon } from '../icons';

export interface MapPin {
  id: string;
  el: HTMLButtonElement;
  label: HTMLElement;
  /** Cached label width (CSS px) for edge clamping; measured after render. */
  labelW: number;
  x: number;
  y: number;
  visible: boolean;
  shift: number;
}

export function makePin(o: { id: string; color: number; locked: boolean; name: string; dot?: Child; mini?: Child; sub?: Child; always?: boolean; onClick: () => void }): MapPin {
  const label = h('span', { class: 'wn-pin__label' }, h('b', null, o.name), o.sub);
  const el = h(
    'button',
    { type: 'button', class: cx('wn-pin', o.locked && 'is-locked', o.always && 'wn-pin--always'), style: `--c:${hex(o.color)}`, 'aria-label': o.name, onclick: o.onClick },
    h('span', { class: 'wn-pin__dot' }, o.locked ? icon('lock') : o.dot),
    o.mini ? h('span', { class: 'wn-pin__mini' }, o.mini) : null,
    label,
  );
  return { id: o.id, el, label, labelW: 0, x: -999, y: -999, visible: false, shift: 0 };
}

export function measurePins(pins: readonly MapPin[]): void {
  for (const p of pins) p.labelW = p.label.offsetWidth;
}

/** Move a pin to client coords (x, y); its label is nudged sideways to stay inside `rect`. */
export function placePin(p: MapPin, rect: DOMRect): void {
  const s = p.el.style;
  const lx = p.x - rect.left;
  s.transform = `translate3d(${lx.toFixed(1)}px,${(p.y - rect.top).toFixed(1)}px,0)`;
  s.opacity = p.visible ? '1' : '0';
  s.pointerEvents = p.visible ? 'auto' : 'none';
  const half = p.labelW / 2 + 8;
  const shift = rect.width > half * 2 ? clamp(lx, half, rect.width - half) - lx : 0;
  if (Math.abs(shift - p.shift) > 0.5) {
    p.shift = shift;
    p.label.style.setProperty('--shift', `${shift.toFixed(1)}px`);
  }
}
