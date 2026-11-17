import { version } from '../../../package.json';
import { BRAND } from '../../config';
import { i18n, t } from '../../i18n/i18n';
import type { Lang, QualitySetting, SaveData, Stance } from '../../types';
import { LANGS } from '../../i18n/langs';
import { button, segmented, select, slider, toggle } from '../components/basic';
import { caption, header } from '../components/game';
import type { UICtx } from '../context';
import { h, type Child } from '../dom';
import { icon } from '../icons';
import { Screen } from '../screen';

/** Settings: every change is saved at once and pushed to the game (applySettings). */
export class SettingsScreen extends Screen {
  constructor(ctx: UICtx) {
    super(ctx, 'settings');
  }

  private change(fn: (d: SaveData) => void): void {
    this.mutate(fn);
    this.ctx.g.applySettings();
    this.ctx.bus.emit('settings:changed', {});
  }

  private row(label: string, hint: string | null, control: Child, cls = ''): HTMLElement {
    return h('div', { class: `wn-set ${cls}` }, h('div', { class: 'wn-set__text' }, h('b', null, label), hint ? h('span', null, hint) : null), h('div', { class: 'wn-set__ctl' }, control));
  }

  private async reset(): Promise<void> {
    const { save, g, bus, toast } = this.ctx;
    const ok = await this.ctx.confirm({ title: t('ui.settings.resetTitle'), text: t('ui.settings.resetText'), ok: t('ui.settings.resetOk'), danger: true });
    if (!ok) return;
    // "Progress" = career, coins, gear, records. Device preferences stay as they are.
    const settings = { ...save.data.settings };
    save.reset();
    save.update((d) => (d.settings = settings));
    save.flush();
    g.applySettings();
    bus.emit('settings:changed', {});
    toast(t('ui.settings.resetDone'), 'good');
  }

  protected build(): Child {
    const { save, g } = this.ctx;
    const s = save.data.settings;

    const quality = segmented<QualitySetting>(
      [
        { value: 'auto', label: t('ui.settings.q.auto') },
        { value: 'low', label: t('ui.settings.q.low') },
        { value: 'medium', label: t('ui.settings.q.medium') },
        { value: 'high', label: t('ui.settings.q.high') },
      ],
      s.quality,
      (v) => this.change((d) => (d.settings.quality = v)),
      'wn-seg--tight',
    );

    const volume = (key: 'musicVolume' | 'sfxVolume', aria: string): HTMLElement => {
      const out = h('span', { class: 'wn-set__num' }, `${Math.round(s[key] * 100)}`);
      const ctl = slider({
        min: 0,
        max: 100,
        step: 5,
        value: Math.round(s[key] * 100),
        aria,
        onInput: (v) => {
          out.textContent = String(v);
          this.change((d) => (d.settings[key] = v / 100));
        },
        onChange: () => {
          if (key === 'sfxVolume') g.sfx('ui.tap');
        },
      });
      return h('div', { class: 'wn-set__slider' }, ctl.el, out);
    };

    const lang = select<Lang>(
      LANGS.map((x) => ({ value: x.id, label: x.label })),
      i18n.lang,
      (v) => this.ctx.setLang(v),
      undefined,
      'Language',
    );

    const stance = segmented<Stance>(
      [
        { value: 'regular', label: t('ui.stance.regular') },
        { value: 'goofy', label: t('ui.stance.goofy') },
      ],
      s.stance,
      (v) => {
        this.change((d) => (d.settings.stance = v));
        const hint = this.el.querySelector('.wn-set--stance .wn-set__text span');
        if (hint) hint.textContent = t(`ui.stance.${v}.hint`);
      },
    );

    const flag = (key: 'haptics' | 'invertY' | 'showFps', aria: string): HTMLElement =>
      toggle(s[key], aria, (v) => {
        this.change((d) => (d.settings[key] = v));
        if (key === 'haptics' && v) g.vibrate(30);
      }).el;

    return h(
      'div',
      { class: 'wn-settings wn-scrim wn-scrim--solid' },
      header({ title: t('ui.settings.title'), onBack: () => this.ctx.back() }),
      h(
        'div',
        { class: 'wn-settings__scroll wn-scroll', dataset: { scroll: 'settings' } },
        h(
          'div',
          { class: 'wn-settings__col' },
          h(
            'section',
            { class: 'wn-setgroup' },
            caption(t('ui.settings.graphics')),
            this.row(t('ui.settings.quality'), t('ui.settings.qualityHint'), quality.el, 'wn-set--stack'),
            this.row(t('ui.settings.fps'), null, flag('showFps', t('ui.settings.fps'))),
          ),
          h(
            'section',
            { class: 'wn-setgroup' },
            caption(t('ui.settings.sound')),
            this.row(t('ui.settings.music'), null, volume('musicVolume', t('ui.settings.music')), 'wn-set--stack'),
            this.row(t('ui.settings.sfx'), null, volume('sfxVolume', t('ui.settings.sfx')), 'wn-set--stack'),
          ),
          h('section', { class: 'wn-setgroup' }, caption(t('ui.settings.language')), this.row(t('ui.settings.language'), null, lang.el, 'wn-set--stack wn-set--nolabel')),
        ),
        h(
          'div',
          { class: 'wn-settings__col' },
          h(
            'section',
            { class: 'wn-setgroup' },
            caption(t('ui.settings.controls')),
            this.row(
              t('ui.settings.controlScheme'),
              t('ui.settings.controlSchemeHint'),
              segmented<'swipe' | 'classic'>(
                [
                  { value: 'swipe', label: t('ui.settings.controlSwipe') },
                  { value: 'classic', label: t('ui.settings.controlClassic') },
                ],
                s.controls,
                (v) => this.change((d) => (d.settings.controls = v)),
              ).el,
              'wn-set--stack',
            ),
            this.row(t('ui.settings.stance'), t(`ui.stance.${s.stance}.hint`), stance.el, 'wn-set--stack wn-set--stance'),
            this.row(t('ui.settings.haptics'), t('ui.settings.hapticsHint'), flag('haptics', t('ui.settings.haptics'))),
            this.row(t('ui.settings.invertY'), t('ui.settings.invertYHint'), flag('invertY', t('ui.settings.invertY'))),
          ),
          h(
            'section',
            { class: 'wn-setgroup' },
            caption(t('ui.settings.data')),
            save.persistent ? null : h('p', { class: 'wn-settings__warn' }, icon('info'), h('span', null, t('ui.settings.noStorage'))),
            this.row(t('ui.settings.reset'), t('ui.settings.resetHint'), button({ label: t('ui.settings.resetBtn'), kind: 'danger', size: 'sm', onClick: () => void this.reset() })),
          ),
          h(
            'footer',
            { class: 'wn-settings__foot' },
            h('a', { class: 'wn-link', href: BRAND.siteUrl, target: '_blank', rel: 'noopener noreferrer' }, h('span', null, BRAND.siteUrl.replace(/^https?:\/\//, '')), icon('external')),
            h('span', null, `${BRAND.gameTitle} · v${version}`),
            h('span', null, BRAND.handle),
          ),
        ),
      ),
    );
  }
}
