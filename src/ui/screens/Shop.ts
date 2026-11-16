import { BRAND } from '../../config';
import { getGear } from '../../data/gear';
import { i18n, l, t } from '../../i18n/i18n';
import type { BoardKind, GearCategory, GearItem, GearStats } from '../../types';
import { GEAR_CATEGORIES, buyBlock, buyGear, equipGear, equippedId, gearByCategory, isOwned, levelForRep, unequip } from '../career';
import { button, tabs } from '../components/basic';
import { coinIcon, coins, header, statBar, tag } from '../components/game';
import { gearThumb } from '../components/gearThumb';
import type { UICtx } from '../context';
import { cx, fmt, h, type Child } from '../dom';
import { icon } from '../icons';
import { Screen, type NavDir } from '../screen';

const STAT_KEYS: readonly (keyof GearStats)[] = ['pop', 'spin', 'rail', 'landing', 'catch'];

function boardOf(cat: GearCategory): BoardKind | null {
  return cat === 'wakeskate' ? 'wakeskate' : cat === 'wakeboard' || cat === 'bindings' ? 'wakeboard' : null;
}

/** WHY NOT gear shop: buy with coins, equip, compare stats, jump to the real product page. */
export class ShopScreen extends Screen {
  private tab: GearCategory = 'wakeboard';

  constructor(ctx: UICtx) {
    super(ctx, 'shop');
  }

  override onEnter(_dir: NavDir): void {
    this.showRider();
  }

  private showRider(): void {
    const { g, save, session } = this.ctx;
    const d = save.data;
    const board = boardOf(this.tab) ?? session.board;
    g.setBackdrop({ kind: 'rider', look: { appearance: d.appearance, gear: d.equipped, stance: d.settings.stance }, pose: 'ride', board });
  }

  private afterGearChange(cat: GearCategory): void {
    this.ctx.bus.emit('gear:equipped', { board: boardOf(cat) });
    this.showRider();
  }

  private async buy(item: GearItem): Promise<void> {
    const { save, toast, sfx } = this.ctx;
    const answer = await this.ctx.modal({
      title: t('ui.shop.buyTitle'),
      body: h(
        'div',
        { class: 'wn-buy' },
        gearThumb(item),
        h('div', null, h('b', { class: 'wn-hd' }, l(item.name)), h('span', { class: 'wn-buy__price' }, coinIcon(), fmt(item.price, i18n.lang)), h('span', { class: 'wn-muted' }, t('ui.shop.buyLeft', { coins: fmt(save.data.coins - item.price, i18n.lang) }))),
      ),
      actions: [
        { value: 'buy', label: t('ui.shop.buyOk'), kind: 'primary' },
        { value: 'cancel', label: t('ui.common.cancel'), kind: 'ghost' },
      ],
    });
    if (answer !== 'buy') return;
    let ok = false;
    save.update((d) => {
      ok = buyGear(d, item.id);
      if (ok) equipGear(d, item.id);
    });
    if (!ok) {
      toast(t('ui.shop.buyFail'), 'bad');
      return;
    }
    sfx('ui.buy');
    toast(t('ui.shop.bought', { item: l(item.name) }), 'good');
    this.afterGearChange(item.category);
  }

  private equip(item: GearItem): void {
    const { save, sfx } = this.ctx;
    let ok = false;
    save.update((d) => (ok = equipGear(d, item.id)));
    if (!ok) return;
    sfx('ui.unlock');
    this.afterGearChange(item.category);
  }

  private takeOff(cat: GearCategory): void {
    this.ctx.save.update((d) => void unequip(d, cat));
    this.afterGearChange(cat);
  }

  private itemCard(item: GearItem, index: number): HTMLElement {
    const data = this.ctx.save.data;
    const owned = isOwned(data, item.id);
    const equipped = equippedId(data.equipped, item.category) === item.id;
    const block = buyBlock(data, item);
    const current = getGear(equippedId(data.equipped, item.category));
    const lang = i18n.lang;

    // Stats: this item's value (5 = neutral) and the change against what is equipped now.
    const bars: Child[] = [];
    for (const key of STAT_KEYS) {
      const mine = item.stats[key] ?? 0;
      const theirs = current && current.id !== item.id ? (current.stats[key] ?? 0) : mine;
      if (mine === 0 && theirs === 0) continue;
      bars.push(statBar(t(`ui.stat.${key}`), 5 + mine, equipped ? 0 : mine - theirs));
    }

    let action: Child;
    if (equipped) {
      const optional = item.category === 'vest' || item.category === 'helmet' || item.category === 'apparel';
      action = optional ? button({ label: t('ui.shop.takeOff'), kind: 'ghost', size: 'sm', onClick: () => this.takeOff(item.category) }) : h('span', { class: 'wn-item__on' }, icon('check'), t('ui.shop.equipped'));
    } else if (owned) {
      action = button({ label: t('ui.shop.equip'), kind: 'light', size: 'sm', onClick: () => this.equip(item) });
    } else if (block === 'level') {
      action = h('span', { class: 'wn-item__lock' }, icon('lock'), t('ui.shop.needLevel', { level: item.unlockLevel ?? 1 }));
    } else {
      action = button({
        label: t('ui.shop.buy'),
        kind: 'primary',
        size: 'sm',
        disabled: block === 'coins',
        onClick: () => void this.buy(item),
      });
    }

    return h(
      'article',
      { class: cx('wn-item wn-card wn-rise', equipped && 'is-equipped', owned && 'is-owned', block === 'level' && 'is-locked'), style: `--i:${Math.min(index, 6)}` },
      h(
        'div',
        { class: 'wn-item__head' },
        gearThumb(item),
        h(
          'div',
          { class: 'wn-item__titles' },
          h('div', { class: 'wn-item__tags' }, equipped ? tag(t('ui.shop.equipped'), 'check', 'wn-tag--red') : owned ? tag(t('ui.shop.owned'), undefined, 'wn-tag--dark') : null, item.unlockLevel && !owned ? tag(t('ui.shop.level', { level: item.unlockLevel }), block === 'level' ? 'lock' : undefined, 'wn-tag--dark') : null),
          h('h3', { class: 'wn-item__name wn-hd' }, l(item.name)),
          l(item.desc) ? h('p', { class: 'wn-item__desc' }, l(item.desc)) : null,
        ),
      ),
      bars.length ? h('div', { class: 'wn-item__stats' }, bars) : h('p', { class: 'wn-item__nostats' }, t('ui.shop.noStats')),
      h(
        'div',
        { class: 'wn-item__foot' },
        h('a', { class: 'wn-link', href: item.url ?? BRAND.siteUrl, target: '_blank', rel: 'noopener noreferrer', onclick: () => this.ctx.sfx('ui.tap') }, h('span', null, t('ui.shop.site')), icon('external')),
        h(
          'div',
          { class: 'wn-item__buy' },
          owned ? null : h('span', { class: cx('wn-item__price', block === 'coins' && 'is-short') }, coinIcon(), h('b', { class: 'wn-hd' }, item.price > 0 ? fmt(item.price, lang) : t('ui.shop.free'))),
          action,
        ),
      ),
    );
  }

  protected build(): Child {
    const { save, session } = this.ctx;
    const data = save.data;
    const requested = typeof this.params.category === 'string' ? this.params.category : session.shopTab;
    this.tab = GEAR_CATEGORIES.find((c) => c === requested) ?? (data.last.board === 'wakeskate' ? 'wakeskate' : 'wakeboard');
    session.shopTab = this.tab;
    const items = gearByCategory(this.tab);
    const level = levelForRep(data.rep).level;

    const tabCtl = tabs<GearCategory>(
      GEAR_CATEGORIES.map((c) => ({ value: c, label: t(`ui.shop.cat.${c}`) })),
      this.tab,
      (v) => {
        session.shopTab = v;
        this.params = { ...this.params, category: v };
        this.render();
        this.el.querySelector('.wn-shop__scroll')?.scrollTo({ top: 0 });
        this.showRider();
      },
    );

    return h(
      'div',
      { class: 'wn-shop wn-scrim wn-scrim--solid' },
      header({ title: t('ui.shop.title'), kicker: 'WHY NOT', onBack: () => this.ctx.back(), right: [h('span', { class: 'wn-shop__level' }, t('ui.shop.myLevel', { level })), coins(data.coins, 'wn-coins--pill')] }),
      tabCtl.el,
      h(
        'div',
        { class: 'wn-shop__scroll wn-scroll', dataset: { scroll: `shop-${this.tab}` } },
        h('div', { class: 'wn-shop__grid' }, items.length ? items.map((it, i) => this.itemCard(it, i)) : h('div', { class: 'wn-empty' }, icon('shop'), h('b', null, t('ui.shop.empty')))),
      ),
    );
  }
}
