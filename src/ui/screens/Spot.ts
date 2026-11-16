import { WINCH_SPEED } from '../../config';
import { CITIES } from '../../data/cities';
import { findSpot } from '../../data/spots';
import { getTrick } from '../../data/tricks';
import { i18n, l, t } from '../../i18n/i18n';
import type { BoardKind, GoalDef, PowerLevel, RunConfig, SpotDef } from '../../types';
import { spotStars } from '../career';
import { button, segmented, slider, sfx, type Option } from '../components/basic';
import { caption, header, pips, stars } from '../components/game';
import type { UICtx } from '../context';
import { cx, fmt, h, type Child } from '../dom';
import { goalText } from '../goals';
import { icon } from '../icons';
import { Screen, type NavDir } from '../screen';

const POWERS: readonly PowerLevel[] = ['slow', 'medium', 'fast'];
type Mode = RunConfig['mode'];

/** Spot card: goals, record, board / winch point / power / mode, and the RIDE button over the 3D preview. */
export class SpotScreen extends Screen {
  private spot: SpotDef | null = null;
  private board: BoardKind = 'wakeboard';
  private winchId = '';
  private power: PowerLevel = 'medium';
  private mode: Mode = 'career';
  private collapsed = false;
  private starting = false;
  private previewed = '';

  constructor(ctx: UICtx) {
    super(ctx, 'spot');
  }

  private isFirstSpot(spot: SpotDef): boolean {
    return CITIES[0]?.spots[0] === spot.id;
  }

  /** Pull the choices for this spot from the save / session. */
  private adopt(spot: SpotDef): void {
    const { save, session } = this.ctx;
    const last = save.data.last;
    this.board = last.board;
    this.power = last.power;
    const lineGoal = spot.goals.find((x): x is Extract<GoalDef, { type: 'line' }> => x.type === 'line');
    const remembered = session.winch.get(spot.id);
    this.winchId = spot.winchPoints.find((w) => w.id === remembered)?.id ?? spot.winchPoints.find((w) => w.id === lineGoal?.winch)?.id ?? spot.winchPoints[0]?.id ?? '';
    const tutorial = this.isFirstSpot(spot) && !save.data.career.tutorialDone;
    this.mode = session.mode.get(spot.id) ?? (tutorial ? 'tutorial' : 'career');
    if (this.mode === 'tutorial' && !this.isFirstSpot(spot)) this.mode = 'career';
  }

  override onEnter(dir: NavDir): void {
    const spot = this.spot;
    if (!spot) return;
    const { g, save, session } = this.ctx;
    this.starting = false;
    session.cityId = spot.cityId;
    if (save.data.last.spotId !== spot.id || save.data.last.cityId !== spot.cityId) {
      this.mutate((d) => {
        d.last.spotId = spot.id;
        d.last.cityId = spot.cityId;
      });
    }
    if (dir !== 'fade' || this.previewed !== spot.id) {
      this.previewed = spot.id;
      void g.previewSpot(spot.id, this.winchId);
    }
  }

  override onBack(): boolean {
    this.previewed = '';
    return false;
  }

  private setCollapsed(on: boolean): void {
    this.collapsed = on;
    this.el.querySelector('.wn-spot__sheet')?.classList.toggle('is-collapsed', on);
  }

  private ride(btn: HTMLButtonElement): void {
    const spot = this.spot;
    if (!spot || this.starting) return;
    this.starting = true;
    const { g, save, session } = this.ctx;
    session.winch.set(spot.id, this.winchId);
    session.mode.set(spot.id, this.mode);
    session.board = this.board;
    save.update((d) => {
      d.last.board = this.board;
      d.last.power = this.power;
      d.last.spotId = spot.id;
      d.last.cityId = spot.cityId;
    });
    save.flush();
    btn.classList.add('is-busy');
    const cfg: RunConfig = { spotId: spot.id, winchId: this.winchId, power: this.power, board: this.board, mode: this.mode };
    void g.startRun(cfg).then(() => {
      // With a real game the menus are hidden by now; with a stub nothing happened — unlock the button.
      this.starting = false;
      btn.classList.remove('is-busy');
    });
  }

  /** Goals that cannot be completed with the current board / line get a warning mark. */
  private goalBlocked(goal: GoalDef): string | null {
    if (goal.type === 'line' && goal.winch && goal.winch !== this.winchId) {
      const w = this.spot?.winchPoints.find((x) => x.id === goal.winch);
      return w ? t('ui.spot.needWinch', { winch: l(w.name) }) : null;
    }
    if (goal.type === 'trick' || (goal.type === 'clip' && goal.trickId)) {
      const def = getTrick(goal.trickId ?? '');
      const boards = goal.type === 'trick' && goal.board ? [goal.board] : (def?.boards ?? []);
      if (boards.length && !boards.includes(this.board)) return t(`ui.spot.needBoard.${boards[0]}`);
    }
    return null;
  }

  private goalsBlock(spot: SpotDef): HTMLElement {
    const done = this.ctx.save.data.spots[spot.id]?.goals ?? [];
    const free = this.mode === 'free';
    const list = h('div', { class: cx('wn-goals', free && 'is-off') });
    spot.goals.forEach((goal, i) => {
      const text = goalText(spot, goal);
      const blocked = !done[i] && !free ? this.goalBlocked(goal) : null;
      list.appendChild(
        h(
          'div',
          { class: cx('wn-goal', done[i] && 'is-done', blocked && 'is-warn') },
          h('span', { class: 'wn-goal__check' }, done[i] ? icon('check') : icon(text.icon)),
          h('span', { class: 'wn-goal__body' }, h('b', null, text.title), text.detail ? h('span', null, text.detail) : null, blocked ? h('em', null, blocked) : null),
          h('span', { class: 'wn-goal__star' }, icon('star')),
        ),
      );
    });
    return list;
  }

  /** Rebuild only the parts that depend on the current choices. */
  protected override patch(): void {
    const spot = this.spot;
    if (!spot) return;
    const goals = this.el.querySelector('.wn-spot__goals');
    if (goals) {
      goals.textContent = '';
      goals.append(
        caption(t('ui.spot.goals'), this.mode === 'free' ? h('span', { class: 'wn-muted' }, t('ui.spot.freeNote')) : stars(spotStars(this.ctx.save.data, spot.id), 5, { flags: this.ctx.save.data.spots[spot.id]?.goals })),
        this.goalsBlock(spot),
      );
    }
    const desc = this.el.querySelector('.wn-spot__boarddesc');
    if (desc) desc.textContent = t(`ui.board.${this.board}.desc`);
    const speed = this.el.querySelector('.wn-spot__speed');
    if (speed) speed.textContent = t('ui.spot.speed', { kmh: Math.round(WINCH_SPEED[this.power] * 3.6) });
    for (const row of this.el.querySelectorAll<HTMLElement>('.wn-winch')) {
      const on = row.dataset.id === this.winchId;
      row.classList.toggle('is-on', on);
      row.setAttribute('aria-checked', String(on));
    }
  }

  protected build(): Child {
    const { save } = this.ctx;
    const spotId = typeof this.params.spotId === 'string' ? this.params.spotId : (save.data.last.spotId ?? '');
    const spot = findSpot(spotId) ?? null;
    if (spot && spot !== this.spot) this.adopt(spot);
    this.spot = spot;
    if (!spot) {
      return h('div', { class: 'wn-spot wn-scrim' }, header({ title: t('ui.city.empty'), onBack: () => this.ctx.back() }));
    }
    const data = save.data;
    const progress = data.spots[spot.id];
    const city = CITIES.find((c) => c.id === spot.cityId);

    const modes: Option<Mode>[] = [
      { value: 'career', label: t('ui.mode.career') },
      { value: 'free', label: t('ui.mode.free') },
    ];
    if (this.isFirstSpot(spot)) modes.unshift({ value: 'tutorial', label: t('ui.mode.tutorial') });
    const modeCtl = segmented<Mode>(modes, this.mode, (v) => {
      this.mode = v;
      this.ctx.session.mode.set(spot.id, v);
      this.patch();
    });

    const boardCtl = segmented<BoardKind>(
      [
        { value: 'wakeboard', label: t('ui.board.wakeboard') },
        { value: 'wakeskate', label: t('ui.board.wakeskate') },
      ],
      this.board,
      (v) => {
        this.board = v;
        this.ctx.session.board = v;
        this.mutate((d) => (d.last.board = v));
        this.patch();
      },
    );

    const winches = h(
      'div',
      { class: 'wn-winches', role: 'radiogroup', 'aria-label': t('ui.spot.winch') },
      spot.winchPoints.map((w, i) =>
        h(
          'button',
          {
            type: 'button',
            class: cx('wn-winch', w.id === this.winchId && 'is-on'),
            role: 'radio',
            'aria-checked': String(w.id === this.winchId),
            dataset: { id: w.id },
            onclick: () => {
              if (this.winchId === w.id) return;
              this.winchId = w.id;
              this.ctx.session.winch.set(spot.id, w.id);
              sfx('ui.tap');
              this.ctx.g.setPreviewLine(w.id);
              this.patch();
            },
          },
          h('span', { class: 'wn-winch__mark wn-hd' }, String.fromCharCode(65 + i)),
          h('span', { class: 'wn-winch__body' }, h('b', null, l(w.name)), w.hint ? h('span', null, l(w.hint)) : null),
          h('span', { class: 'wn-winch__diff' }, pips(w.difficulty, 3), h('span', null, t(`ui.diff.${Math.min(3, Math.max(1, Math.round(w.difficulty)))}`))),
        ),
      ),
    );

    const powerCtl = slider({
      min: 0,
      max: 2,
      step: 1,
      value: POWERS.indexOf(this.power),
      aria: t('ui.spot.power'),
      stops: POWERS.map((p) => t(`ui.power.${p}`)),
      onInput: (v) => {
        this.power = POWERS[Math.round(v)] ?? 'medium';
        this.patch();
      },
      onChange: () => this.mutate((d) => (d.last.power = this.power)),
    });

    const ride = button({ label: t('ui.spot.ride'), icon: 'play', kind: 'primary', size: 'xl', block: true, cls: 'wn-spot__ride', onClick: () => this.ride(ride) });

    return h(
      'div',
      { class: 'wn-spot' },
      header({ title: l(spot.name), kicker: city ? l(city.name) : undefined, onBack: () => this.ctx.back(), cls: 'wn-spot__head' }),
      h(
        'section',
        { class: cx('wn-spot__sheet wn-sheet', this.collapsed && 'is-collapsed') },
        h('button', { type: 'button', class: 'wn-spot__grip', 'aria-label': t('ui.spot.toggle'), onclick: () => (sfx('ui.tap'), this.setCollapsed(!this.collapsed)) }, h('i')),
        h(
          'div',
          { class: 'wn-spot__scroll wn-scroll', dataset: { scroll: 'spot' } },
          h(
            'div',
            { class: 'wn-spot__intro' },
            h('p', { class: 'wn-spot__blurb' }, l(spot.blurb)),
            h(
              'div',
              { class: 'wn-spot__best' },
              h('span', null, t('ui.spot.best')),
              h('b', { class: 'wn-hd' }, progress && progress.bestScore > 0 ? fmt(progress.bestScore, i18n.lang) : '—'),
            ),
          ),
          modeCtl.el,
          h('div', { class: 'wn-spot__goals' }),
          h('div', { class: 'wn-spot__group' }, caption(t('ui.spot.board')), boardCtl.el, h('p', { class: 'wn-spot__boarddesc wn-muted' })),
          h('div', { class: 'wn-spot__group' }, caption(t('ui.spot.winch')), winches),
          h('div', { class: 'wn-spot__group' }, caption(t('ui.spot.power'), h('span', { class: 'wn-spot__speed' })), powerCtl.el),
        ),
        h('div', { class: 'wn-spot__cta' }, ride),
      ),
    );
  }

  protected override afterRender(): void {
    this.patch();
  }
}
