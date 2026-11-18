import { version } from '../../../package.json';
import { BRAND } from '../../config';
import { i18n, t } from '../../i18n/i18n';
import type { Lang } from '../../types';
import { LANGS } from '../../i18n/langs';
import { select } from '../components/basic';
import type { UICtx } from '../context';
import { h, type Child } from '../dom';
import { KeyArt } from '../keyart/KeyArt';
import { Screen, type NavDir } from '../screen';

/**
 * Title screen: the living key art (bullet-time poster) with the crisp, static title, logo and START
 * button on top. The first tap unlocks audio and opens the hub.
 */
export class SplashScreen extends Screen {
  override readonly kind = 'overlay' as const;
  private leaving = false;
  /** One canvas for the screen's lifetime: rebuilding the DOM (language switch) keeps it running. */
  private art: KeyArt | null = null;

  constructor(ctx: UICtx) {
    super(ctx, 'splash');
  }

  override onEnter(_dir: NavDir): void {
    this.leaving = false;
    // the poster is its own canvas: nothing 3D behind it
    this.ctx.g.setBackdrop({ kind: 'none' });
    this.art?.start();
  }

  override onExit(): void {
    this.art?.stop();
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
    this.art ??= new KeyArt();
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
        class: 'wn-splash wn-splash--art wn-panel',
        role: 'button',
        tabindex: '0',
        'aria-label': t('ui.splash.tap'),
        onclick: () => this.start(),
        onkeydown: (ev: KeyboardEvent) => {
          if (ev.key === 'Enter' || ev.key === ' ') this.start();
        },
      },
      h('div', { class: 'wn-splash__bg', 'aria-hidden': 'true' }, this.art.canvas, h('div', { class: 'wn-splash__glow' })),
      h(
        'div',
        { class: 'wn-splash__brand' },
        h('div', { class: 'wn-splash__badge', 'aria-label': 'WHY NOT' }, h('span', null, 'WHY'), h('span', null, 'NOT')),
        h(
          'h1',
          { class: 'wn-splash__hero', 'aria-label': 'Wake Street Hero' },
          h('span', { class: 'wn-splash__w1' }, 'WAKE'),
          h('span', { class: 'wn-splash__w2' }, 'STREET'),
          h('span', { class: 'wn-splash__w3' }, 'HERO?!'),
        ),
        h('p', { class: 'wn-splash__motto' }, t('ui.splash.motto')),
        h('span', { class: 'wn-splash__start' }, h('b', null, t('ui.splash.start'))),
      ),
      h('footer', { class: 'wn-splash__foot' }, h('span', null, `v${version}`), h('span', { class: 'wn-splash__handle' }, BRAND.handle), lang.el),
    );
  }
}
