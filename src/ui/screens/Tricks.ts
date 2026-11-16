import { TRICKS } from '../../data/tricks';
import { i18n, l, t } from '../../i18n/i18n';
import type { BoardKind, TrickCategory, TrickDef } from '../../types';
import { segmented, sfx, tabs } from '../components/basic';
import { caption, header, pips } from '../components/game';
import type { UICtx } from '../context';
import { cx, fmt, h, type Child } from '../dom';
import { icon } from '../icons';
import { Screen } from '../screen';

type Tab = BoardKind | 'controls';
type Device = 'touch' | 'keys';

const CATEGORY_ORDER: readonly TrickCategory[] = ['surface', 'spin', 'grab', 'invert', 'flip', 'rail', 'special', 'bonus'];

/** A token of the controls cheat-sheet: a button, a stick direction or glue ("+", "hold"). */
type Key = 'jump' | 'trick' | 'grab' | 'flip' | 'handle' | 'hero' | 'lr' | 'ud' | 'stick' | 'pause';

interface Combo {
  /** Keys pressed together; `hold` marks the first one as held. */
  keys: Key[];
  hold?: boolean;
  /** i18n key of the result. */
  text: string;
  board?: BoardKind;
  /** Only shown for this device. */
  only?: Device;
}

/** PLAN §4.2 — the control mapping, grouped by where the rider is. */
const SHEET: { title: string; rows: Combo[] }[] = [
  {
    title: 'ui.controls.sec.water',
    rows: [
      { keys: ['jump'], hold: true, text: 'ui.controls.charge' },
      { keys: ['trick', 'lr'], text: 'ui.controls.surface180' },
      { keys: ['flip', 'jump'], hold: true, text: 'ui.controls.boneless', board: 'wakeskate' },
    ],
  },
  {
    title: 'ui.controls.sec.air',
    rows: [
      { keys: ['lr'], hold: true, text: 'ui.controls.spin' },
      { keys: ['trick', 'ud'], text: 'ui.controls.invert', board: 'wakeboard' },
      { keys: ['trick'], text: 'ui.controls.shifty' },
      { keys: ['grab', 'stick'], hold: true, text: 'ui.controls.grabs', board: 'wakeboard' },
      { keys: ['flip', 'stick'], text: 'ui.controls.flips', board: 'wakeskate' },
      { keys: ['flip'], text: 'ui.controls.catch', board: 'wakeskate' },
    ],
  },
  {
    title: 'ui.controls.sec.rail',
    rows: [
      { keys: ['lr'], text: 'ui.controls.balance' },
      { keys: ['trick', 'lr'], text: 'ui.controls.boardslide' },
      { keys: ['grab', 'ud'], hold: true, text: 'ui.controls.press' },
      { keys: ['jump'], text: 'ui.controls.popOff' },
    ],
  },
  {
    title: 'ui.controls.sec.any',
    rows: [
      { keys: ['hero'], text: 'ui.controls.hero' },
      { keys: ['pause'], text: 'ui.controls.pause', only: 'keys' },
    ],
  },
];

const KEYCAP: Record<Key, string> = { jump: 'Space', trick: 'X', grab: 'C', flip: 'C', handle: 'V', hero: 'Shift', lr: '← →', ud: '↑ ↓', stick: '← ↑ ↓ →', pause: 'Esc / P' };

/** Trick list (per board, grouped by category) + the controls cheat-sheet. */
export class TricksScreen extends Screen {
  private tab: Tab = 'wakeboard';
  private device: Device = 'touch';
  private openId: string | null = null;

  constructor(ctx: UICtx) {
    super(ctx, 'tricks');
    try {
      this.device = window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys';
    } catch {
      this.device = 'touch';
    }
  }

  private keyChip(key: Key): HTMLElement {
    if (this.device === 'keys') return h('kbd', { class: cx('wn-key', (key === 'jump' || key === 'hero' || key === 'pause') && 'wn-key--wide') }, KEYCAP[key]);
    if (key === 'lr' || key === 'ud' || key === 'stick') return h('span', { class: `wn-pad wn-pad--${key}` }, h('i'), h('span', null, key === 'lr' ? '← →' : key === 'ud' ? '↑ ↓' : '✛'));
    return h('span', { class: `wn-pbtn wn-pbtn--${key}` }, t(`ui.btn.${key}`));
  }

  private comboRow(c: Combo): HTMLElement {
    const keys = h('div', { class: 'wn-combo__keys' });
    c.keys.forEach((k, i) => {
      if (i > 0) keys.appendChild(h('span', { class: 'wn-combo__plus' }, '+'));
      if (i === 0 && c.hold) keys.appendChild(h('span', { class: 'wn-combo__hold' }, t('ui.controls.hold')));
      keys.appendChild(this.keyChip(k));
    });
    return h(
      'div',
      { class: 'wn-combo' },
      keys,
      h('p', { class: 'wn-combo__text' }, c.board ? h('span', { class: `wn-boardtag wn-boardtag--${c.board}` }, t(`ui.board.${c.board}.short`)) : null, t(c.text)),
    );
  }

  private controls(): Child {
    const dev = segmented<Device>(
      [
        { value: 'touch', label: t('ui.controls.touch') },
        { value: 'keys', label: t('ui.controls.keys') },
      ],
      this.device,
      (v) => {
        this.device = v;
        this.render();
      },
      'wn-seg--quiet',
    );
    const diagram =
      this.device === 'touch'
        ? h(
            'div',
            { class: 'wn-diagram', 'aria-hidden': 'true' },
            h('div', { class: 'wn-diagram__stick' }, h('i'), h('span', null, t('ui.controls.stickHint'))),
            h(
              'div',
              { class: 'wn-diagram__btns' },
              h('span', { class: 'wn-pbtn wn-pbtn--hero' }, t('ui.btn.hero')),
              h('span', { class: 'wn-pbtn wn-pbtn--handle' }, t('ui.btn.handle')),
              h('span', { class: 'wn-pbtn wn-pbtn--trick' }, t('ui.btn.trick')),
              h('span', { class: 'wn-pbtn wn-pbtn--grab' }, t('ui.btn.grabflip')),
              h('span', { class: 'wn-pbtn wn-pbtn--jump' }, t('ui.btn.jump')),
            ),
          )
        : h(
            'div',
            { class: 'wn-diagram wn-diagram--keys', 'aria-hidden': 'true' },
            (['stick', 'jump', 'trick', 'grab', 'hero'] as const).map((k) =>
              h('div', { class: 'wn-diagram__key' }, h('kbd', { class: cx('wn-key', (k === 'jump' || k === 'hero') && 'wn-key--wide') }, k === 'stick' ? '← ↑ ↓ →' : KEYCAP[k]), h('span', null, t(k === 'stick' ? 'ui.btn.stick' : k === 'grab' ? 'ui.btn.grabflip' : `ui.btn.${k}`))),
            ),
          );
    return [
      h('div', { class: 'wn-tricks__device' }, dev.el),
      diagram,
      SHEET.map((sec) => h('section', { class: 'wn-tricks__group' }, caption(t(sec.title)), sec.rows.filter((r) => !r.only || r.only === this.device).map((r) => this.comboRow(r)))),
      h('p', { class: 'wn-tricks__note' }, icon('info'), h('span', null, t('ui.controls.slowmo'))),
    ];
  }

  private trickRow(def: TrickDef): HTMLElement {
    const landed = this.ctx.save.data.stats.tricksLanded[def.id] ?? 0;
    const open = this.openId === def.id;
    return h(
      'button',
      {
        type: 'button',
        class: cx('wn-trick', landed > 0 && 'is-landed', open && 'is-open'),
        'aria-expanded': String(open),
        onclick: () => {
          sfx('ui.tap');
          this.openId = open ? null : def.id;
          this.render();
        },
      },
      h('span', { class: 'wn-trick__check' }, landed > 0 ? icon('check') : null),
      h(
        'span',
        { class: 'wn-trick__body' },
        h('span', { class: 'wn-trick__name' }, h('b', { class: 'wn-hd' }, l(def.name)), pips(def.difficulty, 5)),
        h('span', { class: 'wn-trick__input' }, l(def.input)),
        open && def.tip ? h('span', { class: 'wn-trick__tip' }, l(def.tip)) : null,
        open ? h('span', { class: 'wn-trick__count' }, landed > 0 ? t('ui.tricks.landed', { count: landed }) : t('ui.tricks.notYet')) : null,
      ),
      h('span', { class: 'wn-trick__pts' }, h('b', { class: 'wn-hd' }, fmt(def.points, i18n.lang)), landed > 0 ? h('span', null, `×${landed}`) : null),
    );
  }

  private list(board: BoardKind): Child {
    const mine = TRICKS.filter((d) => d.boards.includes(board));
    if (mine.length === 0) return h('div', { class: 'wn-empty' }, icon('tricks'), h('b', null, t('ui.tricks.empty')), h('span', null, t('ui.tricks.emptyHint')));
    const landedMap = this.ctx.save.data.stats.tricksLanded;
    const done = mine.filter((d) => (landedMap[d.id] ?? 0) > 0).length;
    const groups: Child[] = [
      h(
        'div',
        { class: 'wn-tricks__progress' },
        h('span', null, t('ui.tricks.progress', { done, total: mine.length })),
        h('div', { class: 'wn-bar' }, h('i', { style: `transform:scaleX(${(done / mine.length).toFixed(3)})` })),
      ),
    ];
    const cats = [...CATEGORY_ORDER, ...mine.map((d) => d.category).filter((c) => !CATEGORY_ORDER.includes(c))];
    for (const cat of new Set(cats)) {
      const rows = mine.filter((d) => d.category === cat).sort((a, b) => a.difficulty - b.difficulty || a.points - b.points);
      if (rows.length === 0) continue;
      groups.push(h('section', { class: 'wn-tricks__group' }, caption(t(`ui.tricks.cat.${cat}`), h('span', { class: 'wn-muted' }, String(rows.length))), rows.map((d) => this.trickRow(d))));
    }
    return groups;
  }

  protected build(): Child {
    const { session, save } = this.ctx;
    const stored = typeof this.params.tab === 'string' ? this.params.tab : session.tricksTab;
    this.tab = stored === 'wakeboard' || stored === 'wakeskate' || stored === 'controls' ? stored : save.data.last.board;
    const tabCtl = tabs<Tab>(
      [
        { value: 'wakeboard', label: t('ui.board.wakeboard') },
        { value: 'wakeskate', label: t('ui.board.wakeskate') },
        { value: 'controls', label: t('ui.tricks.controls') },
      ],
      this.tab,
      (v) => {
        session.tricksTab = v;
        this.params = {};
        this.openId = null;
        this.render();
        this.el.querySelector('.wn-tricks__scroll')?.scrollTo({ top: 0 });
      },
    );
    return h(
      'div',
      { class: 'wn-tricks wn-scrim wn-scrim--solid' },
      header({ title: t('ui.tricks.title'), onBack: () => this.ctx.back() }),
      tabCtl.el,
      h('div', { class: 'wn-tricks__scroll wn-scroll', dataset: { scroll: `tricks-${this.tab}` } }, h('div', { class: 'wn-tricks__inner' }, this.tab === 'controls' ? this.controls() : this.list(this.tab))),
    );
  }
}
