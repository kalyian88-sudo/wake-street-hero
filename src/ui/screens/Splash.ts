import { version } from '../../../package.json';
import { BRAND } from '../../config';
import { i18n, t } from '../../i18n/i18n';
import type { Lang } from '../../types';
import { segmented } from '../components/basic';
import { wordmark } from '../components/game';
import type { UICtx } from '../context';
import { h, type Child } from '../dom';
import { Screen, type NavDir } from '../screen';

/** Title screen. The first tap unlocks audio and opens the hub. */
export class SplashScreen extends Screen {
  override readonly kind = 'overlay' as const;
  private leaving = false;

  constructor(
    ctx: UICtx,
    private readonly setLang: (lang: Lang) => void,
  ) {
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
    const lang = segmented<Lang>(
      [
        { value: 'ru', label: 'RU' },
        { value: 'en', label: 'EN' },
      ],
      i18n.lang,
      (v) => this.setLang(v),
      'wn-seg--quiet wn-splash__lang',
    );
    // Language switch must not start the game.
    lang.el.addEventListener('click', (ev) => ev.stopPropagation());

    const row = 'WHY NOT · WAKE STREET HERO · ';
    const marquee = h('div', { class: 'wn-splash__marquee', 'aria-hidden': 'true' });
    for (let i = 0; i < 9; i++) marquee.appendChild(h('span', { style: `--r:${i}` }, row.repeat(4)));

    return h(
      'div',
      {
        class: 'wn-splash wn-panel',
        role: 'button',
        tabindex: '0',
        'aria-label': t('ui.splash.tap'),
        onclick: () => this.start(),
        onkeydown: (ev: KeyboardEvent) => {
          if (ev.key === 'Enter' || ev.key === ' ') this.start();
        },
      },
      h('div', { class: 'wn-splash__bg', 'aria-hidden': 'true' }, marquee, h('div', { class: 'wn-splash__slash' }), h('div', { class: 'wn-splash__glow' })),
      h(
        'div',
        { class: 'wn-splash__brand' },
        h('div', { class: 'wn-splash__kicker wn-kicker' }, t('ui.splash.kicker')),
        wordmark('wn-splash__wm'),
        h('div', { class: 'wn-splash__title' }, h('i'), h('span', { class: 'wn-hd' }, 'Wake Street Hero'), h('i')),
        h('p', { class: 'wn-splash__tagline' }, t('ui.splash.tagline')),
      ),
      h('div', { class: 'wn-splash__cta' }, h('span', { class: 'wn-splash__ring' }), h('span', { class: 'wn-hd' }, t('ui.splash.tap'))),
      h('footer', { class: 'wn-splash__foot' }, h('span', null, `v${version}`), h('span', { class: 'wn-splash__handle' }, BRAND.handle), lang.el),
    );
  }
}
