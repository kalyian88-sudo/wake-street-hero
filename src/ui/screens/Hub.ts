import { CITIES } from '../../data/cities';
import { l, t } from '../../i18n/i18n';
import type { CityDef } from '../../types';
import { cityStars, citySpots, isCityUnlocked, totalStars } from '../career';
import { sfx } from '../components/basic';
import { coins, levelBadge, starCount, tag } from '../components/game';
import { DotGlobe } from '../components/globe';
import { makePin, measurePins, placePin, type MapPin } from '../components/pins';
import type { UICtx } from '../context';
import { cx, h, hex, type Child } from '../dom';
import { icon, type IconName } from '../icons';
import { Screen, type NavDir } from '../screen';

/** World hub: the globe (3D backdrop when the game provides one, dotted canvas globe otherwise) + city cards. */
export class HubScreen extends Screen {
  private focusId: string = CITIES[0]?.id ?? '';
  private globe: DotGlobe | null = null;
  private stage: HTMLElement | null = null;
  private carousel: HTMLElement | null = null;
  private pins: MapPin[] = [];
  private raf = 0;
  private lastTime = 0;
  private scrollTimer = 0;
  private readonly tmp = { x: 0, y: 0, visible: false };

  constructor(ctx: UICtx) {
    super(ctx, 'hub');
  }

  override onEnter(_dir: NavDir): void {
    const { save, g, session } = this.ctx;
    const wanted = typeof this.params.cityId === 'string' ? this.params.cityId : (session.cityId ?? save.data.last.cityId);
    if (wanted && CITIES.some((c) => c.id === wanted)) this.focusId = wanted;
    g.setBackdrop({ kind: 'hub', focusCity: this.focusId });
    this.syncFocus(true);
    cancelAnimationFrame(this.raf);
    this.lastTime = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  override onExit(): void {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.scrollTimer);
  }

  override onResize(): void {
    this.globe?.resize();
    measurePins(this.pins);
  }

  /** Canvas tap resolved by the 3D backdrop (see UI.ts). */
  pick(cityId: string): void {
    this.open(cityId);
  }

  private open(cityId: string): void {
    const city = CITIES.find((c) => c.id === cityId);
    if (!city) return;
    const { save, nav, toast } = this.ctx;
    this.setFocus(cityId, true);
    if (!isCityUnlocked(save.data, city)) {
      const need = Math.max(1, city.unlockStars - totalStars(save.data));
      toast(t('ui.hub.lockedToast', { count: need, city: l(city.name) }), 'bad');
      this.shake(cityId);
      return;
    }
    if (citySpots(city).length === 0) {
      toast(t('ui.hub.soonToast', { city: l(city.name) }), 'info');
      this.shake(cityId);
      return;
    }
    sfx('ui.tap');
    this.ctx.session.cityId = cityId;
    nav.go('city', { cityId });
  }

  private shake(cityId: string): void {
    const card = this.el.querySelector<HTMLElement>(`.wn-citycard[data-id="${cityId}"]`);
    if (!card) return;
    card.classList.remove('is-shake');
    void card.offsetWidth;
    card.classList.add('is-shake');
  }

  private setFocus(cityId: string, scroll: boolean): void {
    if (cityId !== this.focusId) {
      this.focusId = cityId;
      this.ctx.g.setBackdrop({ kind: 'hub', focusCity: cityId });
    }
    this.syncFocus(scroll);
  }

  private syncFocus(scroll: boolean): void {
    this.globe?.focus(this.focusId);
    for (const card of this.el.querySelectorAll<HTMLElement>('.wn-citycard')) {
      const on = card.dataset.id === this.focusId;
      card.classList.toggle('is-focus', on);
      if (on && scroll) card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: this.el.classList.contains('is-fresh') ? 'auto' : 'smooth' });
    }
    for (const p of this.pins) p.el.classList.toggle('is-focus', p.id === this.focusId);
  }

  /** After the carousel settles, the card nearest to its centre becomes the focused city. */
  private onCarouselScroll(): void {
    window.clearTimeout(this.scrollTimer);
    this.scrollTimer = window.setTimeout(() => {
      const box = this.carousel;
      if (!box || !this.mounted) return;
      const horizontal = box.scrollWidth > box.clientWidth + 4;
      if (!horizontal) return;
      const mid = box.getBoundingClientRect().left + box.clientWidth / 2;
      let best: string | null = null;
      let bestD = Infinity;
      for (const card of box.querySelectorAll<HTMLElement>('.wn-citycard')) {
        const r = card.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < bestD) {
          bestD = d;
          best = card.dataset.id ?? null;
        }
      }
      if (best && best !== this.focusId) this.setFocus(best, false);
    }, 130);
  }

  private readonly tick = (now: number): void => {
    if (!this.mounted) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = this.lastTime ? Math.min(0.1, (now - this.lastTime) / 1000) : 0.016;
    this.lastTime = now;
    const { g, session } = this.ctx;
    const stage = this.stage;
    if (!stage) return;

    // The real 3D backdrop announces itself by answering projectMarker().
    let any3D = false;
    for (const p of this.pins) {
      const m = g.projectMarker('city', p.id);
      if (m) {
        any3D = true;
        p.x = m.x;
        p.y = m.y;
        p.visible = m.visible;
      } else if (session.backdrop3D) p.visible = false;
    }
    if (any3D && !session.backdrop3D) {
      session.backdrop3D = true;
      this.el.querySelector('.wn-hub')?.classList.add('is-3d');
    }
    if (!session.backdrop3D && this.globe) {
      this.globe.frame(dt, now / 1000);
      for (const p of this.pins) {
        if (this.globe.project(p.id, this.tmp)) {
          p.x = this.tmp.x;
          p.y = this.tmp.y;
          p.visible = this.tmp.visible;
        }
      }
    }
    const rect = stage.getBoundingClientRect();
    for (const p of this.pins) placePin(p, rect);
  };

  protected override afterRender(): void {
    this.globe?.resize();
    measurePins(this.pins);
    this.syncFocus(false);
  }

  private cityCard(city: CityDef, index: number): HTMLElement {
    const { save } = this.ctx;
    const unlocked = isCityUnlocked(save.data, city);
    const spots = citySpots(city);
    const soon = spots.length === 0;
    const { earned, total } = cityStars(save.data, city);
    const have = totalStars(save.data);
    const progress = city.unlockStars > 0 ? Math.min(1, have / city.unlockStars) : 1;

    let foot: Child;
    if (!unlocked) {
      foot = h(
        'div',
        { class: 'wn-citycard__lock' },
        h('div', { class: 'wn-citycard__lockrow' }, h('span', null, t('ui.hub.need', { count: city.unlockStars })), h('b', null, `${have}/${city.unlockStars}`)),
        h('div', { class: 'wn-bar' }, h('i', { style: `transform:scaleX(${progress.toFixed(3)})` })),
      );
    } else if (soon) {
      foot = h('div', { class: 'wn-citycard__foot' }, h('span', { class: 'wn-muted' }, t('ui.hub.soon')));
    } else {
      foot = h(
        'div',
        { class: 'wn-citycard__foot' },
        starCount(earned, total),
        h('span', { class: 'wn-citycard__spots' }, t('ui.hub.spots', { count: spots.length })),
        h('span', { class: 'wn-citycard__go' }, h('span', null, t('ui.hub.go')), icon('next')),
      );
    }

    return h(
      'button',
      {
        type: 'button',
        class: cx('wn-citycard wn-card wn-rise', !unlocked && 'is-locked', soon && unlocked && 'is-soon', city.id === this.focusId && 'is-focus'),
        style: `--c:${hex(city.color)};--i:${index + 2}`,
        dataset: { id: city.id },
        onclick: () => this.open(city.id),
      },
      h(
        'div',
        { class: 'wn-citycard__top' },
        h('span', { class: 'wn-kicker' }, l(city.country)),
        !unlocked ? tag(t('ui.common.locked'), 'lock', 'wn-tag--dark') : soon ? tag(t('ui.hub.soonTag'), undefined, 'wn-tag--dark') : earned >= total && total > 0 ? tag(t('ui.hub.done'), 'check', 'wn-tag--gold') : null,
      ),
      h('div', { class: 'wn-citycard__name wn-hd' }, l(city.name)),
      h('p', { class: 'wn-citycard__blurb' }, l(city.blurb)),
      foot,
    );
  }

  private navButton(ico: IconName, label: string, target: 'shop' | 'rider' | 'tricks' | 'settings', index: number): HTMLElement {
    return h(
      'button',
      {
        type: 'button',
        class: 'wn-navbtn wn-rise',
        style: `--i:${index + 5}`,
        onclick: () => {
          sfx('ui.tap');
          this.ctx.nav.go(target);
        },
      },
      icon(ico),
      h('span', null, label),
    );
  }

  protected build(): Child {
    const { save, session, nav } = this.ctx;
    const data = save.data;
    const have = totalStars(data);
    let allStars = 0;
    for (const c of CITIES) allStars += cityStars(data, c).total;

    // Stage: fallback globe + pins (pins are reused for the 3D backdrop).
    if (!this.globe) {
      this.globe = new DotGlobe();
      this.globe.onPick = (id) => this.open(id);
    }
    this.globe.setPins(CITIES.map((c, i) => ({ id: c.id, lat: c.globe.lat, lon: c.globe.lon, color: c.color, open: i > 0 && isCityUnlocked(data, c) })));
    this.pins = CITIES.map((city) => {
      const unlocked = isCityUnlocked(data, city);
      const { earned, total } = cityStars(data, city);
      return makePin({
        id: city.id,
        color: city.color,
        locked: !unlocked,
        name: l(city.name),
        mini: unlocked ? (total > 0 ? `${earned}/${total}` : null) : [icon('star'), String(city.unlockStars)],
        sub: h('span', { class: 'wn-pin__sub' }, l(city.country)),
        onClick: () => this.open(city.id),
      });
    });
    this.stage = h('div', { class: 'wn-hub__stage' }, this.globe.el, h('div', { class: 'wn-hub__pins' }, this.pins.map((p) => p.el)));

    this.carousel = h('div', { class: 'wn-hub__cities wn-hscroll', dataset: { scroll: 'cities', axis: 'x' }, onscroll: () => this.onCarouselScroll() }, CITIES.map((c, i) => this.cityCard(c, i)));

    return h(
      'div',
      { class: cx('wn-hub wn-scrim', session.backdrop3D && 'is-3d') },
      h(
        'div',
        { class: 'wn-hub__top wn-rise', style: '--i:0' },
        h('button', { type: 'button', class: 'wn-hub__me', 'aria-label': t('ui.nav.rider'), onclick: () => (sfx('ui.tap'), nav.go('rider')) }, levelBadge(data, true)),
        h('button', { type: 'button', class: 'wn-hub__coins', 'aria-label': t('ui.nav.shop'), onclick: () => (sfx('ui.tap'), nav.go('shop')) }, coins(data.coins, 'wn-coins--pill')),
      ),
      h(
        'div',
        { class: 'wn-hub__title wn-rise', style: '--i:1' },
        h('div', null, h('div', { class: 'wn-kicker' }, t('ui.hub.kicker')), h('h1', { class: 'wn-hd' }, t('ui.hub.title'))),
        starCount(have, allStars, 'wn-hub__stars'),
      ),
      this.stage,
      this.carousel,
      h(
        'nav',
        { class: 'wn-hub__nav' },
        this.navButton('shop', t('ui.nav.shop'), 'shop', 0),
        this.navButton('rider', t('ui.nav.rider'), 'rider', 1),
        this.navButton('tricks', t('ui.nav.tricks'), 'tricks', 2),
        this.navButton('settings', t('ui.nav.settings'), 'settings', 3),
      ),
    );
  }
}
