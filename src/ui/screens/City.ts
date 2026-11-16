import { CITIES } from '../../data/cities';
import { i18n, l, t } from '../../i18n/i18n';
import type { CityDef, SpotDef } from '../../types';
import { cityStars, citySpots, isSpotUnlocked, spotStars, totalStars } from '../career';
import { sfx } from '../components/basic';
import { CityMap } from '../components/citymap';
import { header, starCount, stars, tag } from '../components/game';
import type { UICtx } from '../context';
import { cx, fmt, h, hex, type Child } from '../dom';
import { icon } from '../icons';
import { Screen, type NavDir } from '../screen';

interface Pin {
  spot: SpotDef;
  el: HTMLButtonElement;
}

/** City map: the spots of one city (3D map backdrop when available, drawn map otherwise) + spot list. */
export class CityScreen extends Screen {
  private city: CityDef | null = null;
  private map: CityMap | null = null;
  private stage: HTMLElement | null = null;
  private pins: Pin[] = [];
  private raf = 0;
  private readonly tmp = { x: 0, y: 0, visible: false };

  constructor(ctx: UICtx) {
    super(ctx, 'city');
  }

  private resolveCity(): CityDef | null {
    const id = typeof this.params.cityId === 'string' ? this.params.cityId : (this.ctx.session.cityId ?? this.ctx.save.data.last.cityId);
    return CITIES.find((c) => c.id === id) ?? CITIES[0] ?? null;
  }

  override onEnter(_dir: NavDir): void {
    const city = this.city;
    if (!city) return;
    const { g, save, session } = this.ctx;
    session.cityId = city.id;
    if (save.data.last.cityId !== city.id) save.update((d) => (d.last.cityId = city.id));
    g.setBackdrop({ kind: 'city', cityId: city.id });
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  override onExit(): void {
    cancelAnimationFrame(this.raf);
  }

  override onResize(): void {
    this.map?.draw();
  }

  /** Canvas tap resolved by the 3D backdrop. */
  pick(id: string, type: 'city' | 'spot'): void {
    if (type === 'spot') this.open(id);
  }

  private open(spotId: string): void {
    const spot = this.pins.find((p) => p.spot.id === spotId)?.spot;
    if (!spot) return;
    const { save, nav, toast } = this.ctx;
    if (!isSpotUnlocked(save.data, spot)) {
      const need = Math.max(1, spot.unlockStars - totalStars(save.data));
      toast(t('ui.city.lockedToast', { count: need }), 'bad');
      const card = this.el.querySelector<HTMLElement>(`.wn-spotcard[data-id="${spotId}"]`);
      if (card) {
        card.classList.remove('is-shake');
        void card.offsetWidth;
        card.classList.add('is-shake');
      }
      return;
    }
    sfx('ui.tap');
    nav.go('spot', { spotId });
  }

  private readonly tick = (): void => {
    if (!this.mounted) return;
    this.raf = requestAnimationFrame(this.tick);
    const { g, session } = this.ctx;
    const stage = this.stage;
    if (!stage || this.pins.length === 0) return;
    const rect = stage.getBoundingClientRect();
    for (const p of this.pins) {
      let x = -999;
      let y = -999;
      let visible = false;
      const m = g.projectMarker('spot', p.spot.id);
      if (m) {
        if (!session.backdrop3D) {
          session.backdrop3D = true;
          this.el.classList.add('is-3d');
        }
        x = m.x;
        y = m.y;
        visible = m.visible;
      } else if (!session.backdrop3D && this.map?.project(p.spot.id, this.tmp)) {
        x = this.tmp.x;
        y = this.tmp.y;
        visible = this.tmp.visible;
      }
      const s = p.el.style;
      s.transform = `translate3d(${(x - rect.left).toFixed(1)}px,${(y - rect.top).toFixed(1)}px,0)`;
      s.opacity = visible ? '1' : '0';
      s.pointerEvents = visible ? 'auto' : 'none';
      const side = x > rect.left + rect.width * 0.6 ? 'l' : 'r';
      if (p.el.dataset.side !== side) p.el.dataset.side = side;
    }
  };

  protected override afterRender(): void {
    this.map?.draw();
  }

  private spotCard(spot: SpotDef, index: number): HTMLElement {
    const data = this.ctx.save.data;
    const unlocked = isSpotUnlocked(data, spot);
    const progress = data.spots[spot.id];
    const earned = spotStars(data, spot.id);
    return h(
      'button',
      {
        type: 'button',
        class: cx('wn-spotcard wn-card wn-rise', !unlocked && 'is-locked'),
        style: `--i:${index + 1}`,
        dataset: { id: spot.id },
        onclick: () => this.open(spot.id),
      },
      h('span', { class: 'wn-spotcard__num wn-hd' }, String(index + 1).padStart(2, '0')),
      h(
        'span',
        { class: 'wn-spotcard__body' },
        h('span', { class: 'wn-spotcard__name wn-hd' }, l(spot.name)),
        unlocked
          ? h(
              'span',
              { class: 'wn-spotcard__meta' },
              stars(earned, 5, { flags: progress?.goals }),
              progress && progress.bestScore > 0 ? h('span', { class: 'wn-spotcard__best' }, icon('trophy'), fmt(progress.bestScore, i18n.lang)) : h('span', { class: 'wn-spotcard__new' }, t('ui.city.fresh')),
            )
          : h('span', { class: 'wn-spotcard__meta' }, tag(t('ui.common.locked'), 'lock', 'wn-tag--dark'), h('span', { class: 'wn-spotcard__need' }, t('ui.city.need', { count: spot.unlockStars }))),
      ),
      h('span', { class: 'wn-spotcard__go' }, icon(unlocked ? 'next' : 'lock')),
    );
  }

  protected build(): Child {
    const { save, session } = this.ctx;
    const city = (this.city = this.resolveCity());
    if (!city) return h('div', { class: 'wn-empty' }, icon('city'), h('b', null, t('ui.city.empty')));
    const data = save.data;
    const spots = citySpots(city);
    const { earned, total } = cityStars(data, city);

    if (!this.map) this.map = new CityMap();
    this.map.set(
      city.id,
      city.color,
      spots.map((s) => ({ id: s.id, x: s.mapPos[0], y: s.mapPos[1], open: isSpotUnlocked(data, s) })),
    );
    this.pins = spots.map((spot, i) => {
      const unlocked = isSpotUnlocked(data, spot);
      const el = h(
        'button',
        { type: 'button', class: cx('wn-pin wn-pin--spot', !unlocked && 'is-locked'), style: `--c:${hex(city.color)}`, 'aria-label': l(spot.name), onclick: () => this.open(spot.id) },
        h('span', { class: 'wn-pin__dot' }, unlocked ? h('b', null, String(i + 1)) : icon('lock')),
        h('span', { class: 'wn-pin__label' }, h('b', null, l(spot.name)), unlocked ? stars(spotStars(data, spot.id), 5, { flags: data.spots[spot.id]?.goals }) : h('span', { class: 'wn-pin__need' }, icon('star'), String(spot.unlockStars))),
      );
      return { spot, el };
    });
    this.stage = h('div', { class: 'wn-city__stage' }, this.map.el, h('div', { class: 'wn-hub__pins' }, this.pins.map((p) => p.el)));

    return h(
      'div',
      { class: cx('wn-city wn-scrim', session.backdrop3D && 'is-3d'), style: `--c:${hex(city.color)}` },
      header({ title: l(city.name), kicker: l(city.country), onBack: () => this.ctx.back(), right: total > 0 ? starCount(earned, total) : undefined }),
      h('p', { class: 'wn-city__blurb wn-rise', style: '--i:0' }, l(city.blurb)),
      this.stage,
      h(
        'div',
        { class: 'wn-city__list wn-scroll', dataset: { scroll: 'spots' } },
        h('div', { class: 'wn-caption wn-rise', style: '--i:0' }, h('span', null, t('ui.city.spots')), h('span', { class: 'wn-muted' }, t('ui.hub.spots', { count: spots.length }))),
        spots.length ? spots.map((s, i) => this.spotCard(s, i)) : h('div', { class: 'wn-empty' }, icon('city'), h('b', null, t('ui.hub.soon'))),
      ),
    );
  }
}
