import { BRAND, HAIR_COLORS, SKIN_TONES } from '../../config';
import { getGear } from '../../data/gear';
import { l, t } from '../../i18n/i18n';
import type { RiderAppearance, SaveData, Stance } from '../../types';
import { unequip } from '../career';
import { riderAvatar } from '../components/avatar';
import { button, segmented, sfx, tabs, type Option } from '../components/basic';
import { caption, header, levelBadge } from '../components/game';
import type { UICtx } from '../context';
import { cx, h, hex, luma, type Child } from '../dom';
import { icon } from '../icons';
import { Screen, type NavDir } from '../screen';

type Tab = 'body' | 'hair' | 'head' | 'outfit';
type ColorKey = 'hairColor' | 'headwearColor' | 'vestColor' | 'bottomColor' | 'topColor';

/** Colours offered for headwear / vest / shorts / top. */
const PALETTE: readonly number[] = [BRAND.colors.red, BRAND.colors.dark, 0xffffff, 0x8a8f99, 0xffc531, 0xff7a1a, 0x19b5a5, 0x2a5fd0, 0x7b3fe4, 0xff5fa2, 0x2fd27a, 0xd9c7a0];
const HAIR_STYLES: readonly RiderAppearance['hair'][] = ['buzz', 'short', 'curly', 'long', 'bun', 'ponytail'];

/** Rider editor: looks are saved on every change and previewed live (3D turntable, or a flat mannequin). */
export class RiderScreen extends Screen {
  private tab: Tab = 'body';

  constructor(ctx: UICtx) {
    super(ctx, 'rider');
  }

  override onEnter(_dir: NavDir): void {
    this.preview();
  }

  private preview(): void {
    const { g, save, session } = this.ctx;
    const d = save.data;
    g.setBackdrop({ kind: 'rider', look: { appearance: d.appearance, gear: d.equipped, stance: d.settings.stance }, pose: 'idle', board: session.board });
    const slot = this.el.querySelector('.wn-rider__avatar');
    if (slot) {
      slot.textContent = '';
      slot.appendChild(riderAvatar(d.appearance, d.equipped));
    }
  }

  private change(fn: (d: SaveData) => void): void {
    this.mutate(fn);
    this.preview();
  }

  private set<K extends keyof RiderAppearance>(key: K, value: RiderAppearance[K]): void {
    this.change((d) => (d.appearance[key] = value));
  }

  private swatches(colors: readonly number[], current: number, aria: string, onPick: (c: number) => void): HTMLElement {
    const row = h('div', { class: 'wn-swatches', role: 'radiogroup', 'aria-label': aria });
    colors.forEach((c) => {
      const b = h(
        'button',
        { type: 'button', class: cx('wn-swatch', c === current && 'is-on', luma(c) > 0.7 && 'is-light'), role: 'radio', 'aria-checked': String(c === current), 'aria-label': hex(c), style: `--c:${hex(c)}` },
        icon('check'),
      );
      b.addEventListener('click', () => {
        for (const other of row.children) {
          other.classList.toggle('is-on', other === b);
          other.setAttribute('aria-checked', String(other === b));
        }
        sfx('ui.tap');
        onPick(c);
      });
      row.appendChild(b);
    });
    return row;
  }

  private colorGroup(label: string, key: ColorKey, colors: readonly number[] = PALETTE): HTMLElement {
    const a = this.ctx.save.data.appearance;
    // A colour that is not in the palette (old save / edited config) still shows up as the first swatch.
    const list = colors.includes(a[key]) ? colors : [a[key], ...colors];
    return h('div', { class: 'wn-opt' }, caption(label), this.swatches(list, a[key], label, (c) => this.set(key, c)));
  }

  private choice<T extends string>(label: string, options: readonly Option<T>[], value: T, onChange: (v: T) => void, cls?: string): HTMLElement {
    return h('div', { class: 'wn-opt' }, caption(label), segmented(options, value, onChange, cls).el);
  }

  /** Shop gear worn in a slot overrides the manual look — say so and offer to take it off. */
  private gearNote(slot: 'helmet' | 'vest' | 'apparel'): Child {
    const item = getGear(this.ctx.save.data.equipped[slot]);
    if (!item) return null;
    return h(
      'div',
      { class: 'wn-rider__gear' },
      icon('shop'),
      h('span', null, t('ui.rider.gearOn', { item: l(item.name) })),
      button({
        label: t('ui.shop.takeOff'),
        kind: 'ghost',
        size: 'sm',
        onClick: () => {
          this.ctx.save.update((d) => void unequip(d, slot));
          this.ctx.bus.emit('gear:equipped', { board: null });
          this.preview();
        },
      }),
    );
  }

  private options(): Child {
    const { save, g, bus } = this.ctx;
    const a = save.data.appearance;
    switch (this.tab) {
      case 'body':
        return [
          this.choice<RiderAppearance['gender']>(
            t('ui.rider.gender'),
            [
              { value: 'male', label: t('ui.rider.male') },
              { value: 'female', label: t('ui.rider.female') },
            ],
            a.gender,
            (v) => this.set('gender', v),
          ),
          h(
            'div',
            { class: 'wn-opt' },
            caption(t('ui.rider.skin')),
            this.swatches(
              SKIN_TONES,
              SKIN_TONES[a.skin] ?? SKIN_TONES[0],
              t('ui.rider.skin'),
              (c) => this.set('skin', Math.max(0, SKIN_TONES.indexOf(c))),
            ),
          ),
          this.choice<Stance>(
            t('ui.settings.stance'),
            [
              { value: 'regular', label: t('ui.stance.regular') },
              { value: 'goofy', label: t('ui.stance.goofy') },
            ],
            save.data.settings.stance,
            (v) => {
              this.change((d) => (d.settings.stance = v));
              g.applySettings();
              bus.emit('settings:changed', {});
              const hint = this.el.querySelector('.wn-rider__stancehint');
              if (hint) hint.textContent = t(`ui.stance.${v}.hint`);
            },
          ),
          h('p', { class: 'wn-rider__stancehint wn-muted' }, t(`ui.stance.${save.data.settings.stance}.hint`)),
        ];
      case 'hair':
        return [
          h(
            'div',
            { class: 'wn-opt' },
            caption(t('ui.rider.hairStyle')),
            h(
              'div',
              { class: 'wn-chips', role: 'radiogroup' },
              HAIR_STYLES.map((s) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: cx('wn-chip', a.hair === s && 'is-on'),
                    role: 'radio',
                    'aria-checked': String(a.hair === s),
                    onclick: (ev: MouseEvent) => {
                      const me = ev.currentTarget as HTMLElement;
                      for (const el of me.parentElement?.children ?? []) el.classList.toggle('is-on', el === me);
                      sfx('ui.tap');
                      this.set('hair', s);
                    },
                  },
                  t(`ui.rider.hair.${s}`),
                ),
              ),
            ),
          ),
          this.colorGroup(t('ui.rider.hairColor'), 'hairColor', HAIR_COLORS),
          a.headwear === 'helmet' || getGear(save.data.equipped.helmet) ? h('p', { class: 'wn-rider__note wn-muted' }, icon('info'), h('span', null, t('ui.rider.hairHidden'))) : null,
        ];
      case 'head':
        return [
          this.gearNote('helmet'),
          this.choice<RiderAppearance['headwear']>(
            t('ui.rider.headwear'),
            [
              { value: 'none', label: t('ui.rider.head.none') },
              { value: 'helmet', label: t('ui.rider.head.helmet') },
              { value: 'cap', label: t('ui.rider.head.cap') },
            ],
            a.headwear,
            (v) => this.set('headwear', v),
          ),
          this.colorGroup(t('ui.rider.headColor'), 'headwearColor'),
        ];
      default:
        return [
          this.gearNote('vest'),
          this.choice<'on' | 'off'>(
            t('ui.rider.vest'),
            [
              { value: 'on', label: t('ui.rider.vest.on') },
              { value: 'off', label: t('ui.rider.vest.off') },
            ],
            a.vest ? 'on' : 'off',
            (v) => this.set('vest', v === 'on'),
          ),
          this.colorGroup(t('ui.rider.vestColor'), 'vestColor'),
          this.gearNote('apparel'),
          this.choice<RiderAppearance['bottom']>(
            t('ui.rider.bottom'),
            [
              { value: 'shorts', label: t('ui.rider.bottom.shorts') },
              { value: 'wetsuit', label: t('ui.rider.bottom.wetsuit') },
            ],
            a.bottom,
            (v) => this.set('bottom', v),
          ),
          this.colorGroup(t('ui.rider.bottomColor'), 'bottomColor'),
          this.colorGroup(t('ui.rider.topColor'), 'topColor'),
        ];
    }
  }

  protected build(): Child {
    const { save, session, nav } = this.ctx;
    const stored = typeof this.params.tab === 'string' ? this.params.tab : session.riderTab;
    this.tab = stored === 'hair' || stored === 'head' || stored === 'outfit' ? stored : 'body';
    const tabCtl = tabs<Tab>(
      [
        { value: 'body', label: t('ui.rider.tab.body') },
        { value: 'hair', label: t('ui.rider.tab.hair') },
        { value: 'head', label: t('ui.rider.tab.head') },
        { value: 'outfit', label: t('ui.rider.tab.outfit') },
      ],
      this.tab,
      (v) => {
        session.riderTab = v;
        this.params = {};
        this.render();
        this.el.querySelector('.wn-rider__scroll')?.scrollTo({ top: 0 });
      },
    );
    return h(
      'div',
      { class: cx('wn-rider', session.backdrop3D && 'is-3d') },
      header({ title: t('ui.rider.title'), onBack: () => this.ctx.back(), right: button({ label: t('ui.nav.shop'), icon: 'shop', kind: 'secondary', size: 'sm', onClick: () => nav.go('shop') }) }),
      h('div', { class: 'wn-rider__stage' }, h('div', { class: 'wn-rider__plate' }, h('div', { class: 'wn-rider__avatar' }), h('div', { class: 'wn-rider__me' }, levelBadge(save.data)))),
      h('section', { class: 'wn-rider__sheet wn-sheet' }, tabCtl.el, h('div', { class: 'wn-rider__scroll wn-scroll', dataset: { scroll: `rider-${this.tab}` } }, this.options())),
    );
  }

  protected override afterRender(): void {
    const slot = this.el.querySelector('.wn-rider__avatar');
    const d = this.ctx.save.data;
    if (slot) slot.appendChild(riderAvatar(d.appearance, d.equipped));
  }
}
