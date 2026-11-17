import { version } from '../../../package.json';
import { BRAND } from '../../config';
import { i18n, t } from '../../i18n/i18n';
import type { Lang } from '../../types';
import { brandImageUrl } from '../../brand/images';
import { LANGS } from '../../i18n/langs';
import { select } from '../components/basic';
import type { UICtx } from '../context';
import { h, type Child } from '../dom';
import { Screen, type NavDir } from '../screen';

/** Title screen. The first tap unlocks audio and opens the hub. */
export class SplashScreen extends Screen {
  override readonly kind = 'overlay' as const;
  private leaving = false;

  constructor(ctx: UICtx) {
    super(ctx, 'splash');
  }

  override onEnter(_dir: NavDir): void {
    this.leaving = false;
    this.ctx.g.setBackdrop({ kind: 'splash' });
  }

  private start(): void {
    if (this.leaving) return;
    this.leaving = true;
    const { g, nav } = this.ctx;
    g.unlockAudio();
    g.startMusic();
    g.sfx('ui.tap');
    nav.reset([{ id: 'hub', params: {} }], 'fade');
  }

  protected build(): Child {
    const lang = select<Lang>(
      LANGS.map((x) => ({ value: x.id, label: x.label })),
      i18n.lang,
      (v) => this.ctx.setLang(v),
      'wn-select--quiet wn-splash__lang',
      'Language',
    );
    // Language switch must not start the game.
    lang.el.addEventListener('click', (ev) => ev.stopPropagation());

    return h(
      'div',
      {
        class: 'wn-splash wn-splash--3d wn-panel',
        role: 'button',
        tabindex: '0',
        'aria-label': t('ui.splash.tap'),
        onclick: () => this.start(),
        onkeydown: (ev: KeyboardEvent) => {
          if (ev.key === 'Enter' || ev.key === ' ') this.start();
        },
      },
      h('div', { class: 'wn-splash__bg', 'aria-hidden': 'true' }, h('div', { class: 'wn-splash__glow' })),
      h(
        'div',
        { class: 'wn-splash__brand' },
        h(
          'div',
          { class: 'wn-splash__top' },
          h('img', {
            class: 'wn-splash__logo',
            src: brandImageUrl('whynot'),
            alt: 'WHY NOT',
            draggable: 'false',
          }),
          h('div', { class: 'wn-splash__kicker wn-kicker' }, t('ui.splash.kicker')),
        ),
        h(
          'h1',
          { class: 'wn-splash__hero', 'aria-label': 'Wake Street Hero' },
          h('span', { class: 'wn-splash__w1' }, 'WAKE'),
          h('span', { class: 'wn-splash__w2' }, 'STREET'),
          h(
            'span',
            { class: 'wn-splash__w3' },
            h('img', {
              class: 'wn-splash__mark',
              src: brandImageUrl('mark'),
              alt: '',
              'aria-hidden': 'true',
              draggable: 'false',
            }),
            'HERO',
          ),
        ),
        h('p', { class: 'wn-splash__tagline' }, t('ui.splash.tagline')),
      ),
      h('div', { class: 'wn-splash__cta' }, h('span', { class: 'wn-splash__ring' }), h('span', { class: 'wn-hd' }, t('ui.splash.tap'))),
      h('footer', { class: 'wn-splash__foot' }, h('span', null, `v${version}`), h('span', { class: 'wn-splash__handle' }, BRAND.handle), lang.el),
    );
  }
}
