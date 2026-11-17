import { findSpot } from '../../data/spots';
import { i18n, l, t } from '../../i18n/i18n';
import type { RunResult } from '../../types';
import { levelForRep, levelTitleKey } from '../career';
import { button } from '../components/basic';
import { coinIcon, metric, tag } from '../components/game';
import type { UICtx } from '../context';
import { cx, fmt, h, prefersReducedMotion, type Child } from '../dom';
import { goalText } from '../goals';
import { icon, type IconName } from '../icons';
import { Screen, type NavDir } from '../screen';

const SCORE_AT = 250;
const SCORE_MS = 1100;
const STARS_AT = 1500;
const STAR_STEP = 190;

/** End-of-run summary: score count-up, stars, goals, rewards, replay / share / again. */
export class ResultsScreen extends Screen {
  override readonly kind = 'overlay' as const;
  private timers: number[] = [];
  private raf = 0;

  constructor(ctx: UICtx) {
    super(ctx, 'results');
  }

  private get instant(): boolean {
    return this.params.instant === true || prefersReducedMotion();
  }

  override onEnter(_dir: NavDir): void {
    this.clearTimers();
    const r = this.ctx.g.lastResult;
    if (!r) return;
    const scoreEl = this.el.querySelector<HTMLElement>('.wn-results__score b');
    if (this.instant || !scoreEl) return;

    // Score count-up
    const start = performance.now() + SCORE_AT;
    const step = (now: number): void => {
      const k = Math.min(1, Math.max(0, (now - start) / SCORE_MS));
      const eased = 1 - Math.pow(1 - k, 3);
      scoreEl.textContent = fmt(r.score * eased, i18n.lang);
      if (k < 1 && this.mounted) this.raf = requestAnimationFrame(step);
      else scoreEl.classList.add('is-done');
    };
    scoreEl.textContent = '0';
    this.raf = requestAnimationFrame(step);

    // Star sounds in step with the CSS pops; then the rewards land.
    const fresh = this.freshStars(r);
    fresh.forEach((_, n) => this.later(STARS_AT + n * STAR_STEP, () => this.ctx.sfx('ui.star')));
    const rewardsAt = STARS_AT + fresh.length * STAR_STEP + 250;
    this.later(rewardsAt, () => {
      this.el.querySelector('.wn-results__rewards')?.classList.add('is-in');
      this.el.querySelector('.wn-results__level')?.classList.add('is-in');
    });
    if (this.leveledUp(r)) this.later(rewardsAt + 600, () => this.ctx.sfx('ui.unlock'));
    if (r.newRecord) this.later(SCORE_AT + SCORE_MS, () => this.ctx.sfx('goal'));
  }

  override onExit(): void {
    this.clearTimers();
  }

  /** Results are a snapshot of the finished run — later save writes must not restart the show. */
  override onSave(): void {}

  override onLang(): void {
    this.params = { ...this.params, instant: true };
    this.render();
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
    cancelAnimationFrame(this.raf);
  }

  private freshStars(r: RunResult): number[] {
    return r.config.mode === 'free' ? [] : (r.newGoals ?? []).filter((i) => r.goals?.[i]);
  }

  private repBefore(r: RunResult): number {
    const { session, save } = this.ctx;
    return session.before ? session.before.rep : Math.max(0, save.data.rep - (r.rep || 0));
  }

  private leveledUp(r: RunResult): boolean {
    const before = this.repBefore(r);
    return levelForRep(before + (r.rep || 0)).level > levelForRep(before).level;
  }

  private async share(btn: HTMLButtonElement, r: RunResult): Promise<void> {
    const { toast, g } = this.ctx;
    btn.classList.add('is-busy');
    try {
      const mod = await import('../../share/share');
      const blob = await mod.createShareCard(g.raw, r);
      if (!blob) {
        toast(t('ui.results.shareFail'), 'bad');
        return;
      }
      const how = await mod.shareOrDownload(blob, r);
      if (how === 'shared') toast(t('ui.results.shared'), 'good');
      else if (how === 'downloaded') toast(t('ui.results.saved'), 'good');
    } catch (err) {
      console.error('[ui] share failed', err);
      toast(t('ui.results.shareFail'), 'bad');
    } finally {
      btn.classList.remove('is-busy');
    }
  }

  protected build(): Child {
    const { g } = this.ctx;
    const r = g.lastResult;
    if (!r) {
      return h(
        'div',
        { class: 'wn-results wn-scrim wn-scrim--solid' },
        h('div', { class: 'wn-empty' }, icon('trophy'), h('b', null, t('ui.results.none'))),
        h('div', { class: 'wn-results__actions' }, button({ label: t('ui.results.toCity'), kind: 'ghost', size: 'lg', block: true, sfx: 'ui.back', onClick: () => this.ctx.quit() })),
      );
    }
    const spot = findSpot(r.config.spotId);
    const endless = r.config.mode === 'endless';
    const free = r.config.mode === 'free' || endless;
    const fresh = this.freshStars(r);
    const flags = [0, 1, 2, 3, 4].map((i) => r.goals?.[i] === true);
    const lang = i18n.lang;

    // Stars: already-owned ones are simply lit; new ones pop one after another.
    const starRow = h('div', { class: 'wn-results__stars' });
    flags.forEach((on, i) => {
      const order = fresh.indexOf(i);
      // Grey base star + a gold one on top that pops in when it was earned in this run.
      starRow.appendChild(h('span', { class: cx('wn-bigstar', on && 'is-on', order >= 0 && 'is-fresh'), style: order >= 0 ? `animation-delay:${STARS_AT + order * STAR_STEP}ms` : undefined }, icon('star'), on ? icon('star') : null));
    });

    const goals =
      spot && !free
        ? h(
            'div',
            { class: 'wn-results__goals' },
            spot.goals.map((goal, i) =>
              h(
                'div',
                { class: cx('wn-rgoal', flags[i] && 'is-done', fresh.includes(i) && 'is-fresh') },
                h('span', { class: 'wn-rgoal__check' }, flags[i] ? icon('check') : null),
                h('span', { class: 'wn-rgoal__text' }, goalText(spot, goal).title),
                fresh.includes(i) ? tag(t('ui.results.new'), 'star', 'wn-tag--gold') : null,
              ),
            ),
          )
        : null;

    // Rewards + reputation level
    const before = this.repBefore(r);
    const lvBefore = levelForRep(before);
    const lvAfter = levelForRep(before + (r.rep || 0));
    const up = lvAfter.level > lvBefore.level;
    const rewards = endless
      ? h('div', { class: 'wn-results__rewards is-in' }, h('div', { class: 'wn-reward' }, coinIcon(), h('b', { class: 'wn-hd' }, `+${fmt(r.coins || 0, lang)}`), h('span', null, t('ui.results.coins'))))
      : free
      ? null
      : h(
          'div',
          { class: cx('wn-results__rewards', this.instant && 'is-in') },
          h('div', { class: 'wn-reward' }, coinIcon(), h('b', { class: 'wn-hd' }, `+${fmt(r.coins || 0, lang)}`), h('span', null, t('ui.results.coins'))),
          h('div', { class: 'wn-reward' }, h('span', { class: 'wn-reward__rep' }, icon('bolt')), h('b', { class: 'wn-hd' }, `+${fmt(r.rep || 0, lang)}`), h('span', null, t('ui.results.rep'))),
        );
    const level = endless
      ? h('p', { class: 'wn-results__free' }, t('ui.endless.resultNote', { stage: String((r.endless?.stage ?? 0) + 1), metres: fmt(r.endless?.distance ?? 0, lang) }))
      : free
      ? h('p', { class: 'wn-results__free' }, t('ui.results.freeNote'))
      : h(
          'div',
          { class: cx('wn-results__level', this.instant && 'is-in', up && 'is-levelup') },
          h('div', { class: 'wn-results__lv' }, h('span', { class: 'wn-hd' }, t('ui.results.level', { level: lvAfter.level })), h('span', { class: 'wn-muted' }, t(levelTitleKey(lvAfter.level)))),
          h('div', { class: 'wn-bar' }, h('i', { style: `--from:${up ? 0 : lvBefore.progress.toFixed(3)};--to:${lvAfter.progress.toFixed(3)}` })),
          up ? tag(t('ui.results.levelUp'), 'crown', 'wn-tag--red wn-results__up') : null,
        );

    const tile = (ico: IconName, label: string, onClick: (el: HTMLButtonElement) => void, opts: { disabled?: boolean; back?: boolean } = {}): HTMLButtonElement => {
      const el = h('button', { type: 'button', class: 'wn-navbtn', disabled: opts.disabled === true }, icon(ico), h('span', null, label));
      el.addEventListener('click', () => {
        this.ctx.sfx(opts.back ? 'ui.back' : 'ui.tap');
        onClick(el);
      });
      return el;
    };

    return h(
      'div',
      { class: cx('wn-results wn-scrim wn-scrim--solid', this.instant && 'is-instant') },
      h(
        'div',
        { class: 'wn-results__scroll wn-scroll', dataset: { scroll: 'results' } },
        h(
          'div',
          { class: 'wn-results__main' },
          h('div', { class: 'wn-kicker' }, [endless ? t('ui.endless.title') : spot ? l(spot.name) : '', endless ? '' : t(`ui.mode.${r.config.mode}`), t(`ui.board.${r.config.board}`)].filter(Boolean).join(' · ')),
          h('h1', { class: 'wn-results__title wn-hd' }, r.falls === 0 && r.score > 0 ? t('ui.results.titleClean') : t('ui.results.title')),
          h(
            'div',
            { class: 'wn-results__score' },
            h('b', { class: 'wn-hd' }, fmt(r.score, lang)),
            h('span', null, t('ui.results.points')),
            r.newRecord ? tag(t('ui.results.record'), 'trophy', 'wn-tag--red wn-results__record') : null,
          ),
          free ? null : starRow,
          rewards,
        ),
        h(
          'div',
          { class: 'wn-results__side' },
          goals,
          h(
            'div',
            { class: 'wn-results__metrics' },
            metric(t('ui.results.bestTrick'), r.bestTrick ? [l(r.bestTrick.name), h('small', null, ` ${fmt(r.bestTrick.points, lang)}`)] : '—', 'tricks', 'wn-metric--wide'),
            metric(t('ui.results.bestCombo'), fmt(r.bestCombo || 0, lang), 'flame'),
            metric(t('ui.results.falls'), String(r.falls || 0), 'drop'),
            metric(t('ui.results.tricks'), String(r.tricksLanded || 0), 'check'),
          ),
          level,
        ),
      ),
      h(
        'div',
        { class: 'wn-results__actions' },
        h(
          'div',
          { class: 'wn-results__tiles' },
          tile('replay', t('ui.results.replay'), () => this.ctx.replay(), { disabled: !r.bestTrick }),
          tile('share', t('ui.results.share'), (el) => void this.share(el, r)),
          tile('city', t('ui.results.toCity'), () => this.ctx.quit(), { back: true }),
        ),
        button({ label: t('ui.results.again'), icon: 'restart', kind: 'primary', size: 'lg', block: true, onClick: () => this.ctx.restart() }),
      ),
    );
  }
}
