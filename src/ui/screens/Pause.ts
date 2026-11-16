import { findSpot } from '../../data/spots';
import { l, t } from '../../i18n/i18n';
import { button } from '../components/basic';
import type { UICtx } from '../context';
import { h, type Child } from '../dom';
import { Screen } from '../screen';

/** Pause menu over the frozen run. */
export class PauseScreen extends Screen {
  override readonly kind = 'overlay' as const;

  constructor(ctx: UICtx) {
    super(ctx, 'pause');
  }

  private async quit(): Promise<void> {
    const ok = await this.ctx.confirm({ title: t('ui.pause.quitTitle'), text: t('ui.pause.quitText'), ok: t('ui.pause.quitOk'), cancel: t('ui.pause.quitCancel'), danger: true });
    if (ok) this.ctx.quit();
  }

  protected build(): Child {
    const { nav, save, session } = this.ctx;
    const spot = findSpot(save.data.last.spotId ?? '');
    return h(
      'div',
      { class: 'wn-pause wn-panel' },
      h(
        'div',
        { class: 'wn-pause__card' },
        h('div', { class: 'wn-kicker wn-rise', style: '--i:0' }, spot ? `${l(spot.name)} · ${t(`ui.board.${session.board ?? save.data.last.board}`)}` : t('ui.pause.kicker')),
        h('h1', { class: 'wn-pause__title wn-hd wn-rise', style: '--i:0' }, t('ui.pause.title')),
        h(
          'div',
          { class: 'wn-pause__list' },
          h('div', { class: 'wn-rise', style: '--i:1' }, button({ label: t('ui.pause.resume'), icon: 'play', kind: 'primary', size: 'xl', block: true, onClick: () => this.ctx.resume() })),
          h('div', { class: 'wn-rise', style: '--i:2' }, button({ label: t('ui.pause.restart'), icon: 'restart', size: 'lg', block: true, onClick: () => this.ctx.restart() })),
          h(
            'div',
            { class: 'wn-pause__pair wn-rise', style: '--i:3' },
            button({ label: t('ui.nav.tricks'), icon: 'tricks', size: 'lg', onClick: () => nav.go('tricks') }),
            button({ label: t('ui.nav.settings'), icon: 'settings', size: 'lg', onClick: () => nav.go('settings') }),
          ),
          h('div', { class: 'wn-rise', style: '--i:4' }, button({ label: t('ui.pause.quit'), icon: 'city', kind: 'ghost', size: 'lg', block: true, sfx: 'ui.back', onClick: () => void this.quit() })),
        ),
      ),
    );
  }
}
