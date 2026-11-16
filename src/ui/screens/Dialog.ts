import { i18n, l, t } from '../../i18n/i18n';
import type { L10n } from '../../types';
import { portrait, ROLE_COLOR, type SpeakerRole } from '../components/avatar';
import { button } from '../components/basic';
import { coinIcon } from '../components/game';
import type { UICtx } from '../context';
import { fmt, h, hex, prefersReducedMotion, type Child } from '../dom';
import { icon } from '../icons';
import { Screen, type NavDir } from '../screen';

/**
 * One card of a story dialogue. Open with
 *   ui.show('dialog', { cards: [...], onDone: (r) => … })
 */
export interface DialogCard {
  /** Who is talking — decides the portrait and the accent colour. */
  speaker: SpeakerRole;
  /** Display name; defaults to the role name ("Winch operator"…). */
  name?: L10n | string;
  /** Optional headline above the text (e.g. a sponsor offer). */
  title?: L10n | string;
  text: L10n | string;
  /** Label of the main button. Default: "Next" / on the last card "Let's go". */
  accept?: L10n | string;
  /** When set, a second button is shown; pressing it ends the dialogue with accepted = false. */
  decline?: L10n | string;
  /** Reward teaser shown on the card (purely visual — the caller grants it). */
  reward?: { coins?: number; rep?: number };
}

export interface DialogResult {
  /** False when the player pressed a `decline` button or skipped with Back. */
  accepted: boolean;
  /** Index of the card the dialogue ended on. */
  index: number;
}

export interface DialogParams {
  cards: DialogCard[];
  onDone?: (result: DialogResult) => void;
}

const CHARS_PER_SECOND = 55;

function text(v: L10n | string | undefined): string {
  if (v === undefined) return '';
  return typeof v === 'string' ? v : l(v);
}

function isCard(v: unknown): v is DialogCard {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as DialogCard;
  return (typeof c.text === 'string' || (typeof c.text === 'object' && c.text !== null)) && typeof c.speaker === 'string';
}

/** Story / dialogue cards from the crew: text types itself out, tap to finish the line, then next. */
export class DialogScreen extends Screen {
  override readonly kind = 'overlay' as const;
  private cards: DialogCard[] = [];
  private index = 0;
  private typed = 0;
  private full = '';
  private raf = 0;
  private last = 0;
  private finished = false;
  private source: unknown = null;

  constructor(ctx: UICtx) {
    super(ctx, 'dialog');
  }

  override onEnter(_dir: NavDir): void {
    this.startTyping();
  }

  override onExit(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Dialogue content does not depend on the save. */
  override onSave(): void {}

  override onLang(): void {
    this.render();
    this.typed = this.full.length;
    this.paint();
  }

  /** Back = skip the whole dialogue (counts as not accepted). */
  override onBack(): boolean {
    this.finish(false);
    return true;
  }

  private finish(accepted: boolean): void {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.raf);
    const onDone = (this.params as Partial<DialogParams>).onDone;
    const result: DialogResult = { accepted, index: this.index };
    const { nav } = this.ctx;
    // Leave first, then report — the callback may navigate somewhere itself.
    if (nav.current === 'dialog' && !nav.pop()) nav.hide();
    try {
      if (typeof onDone === 'function') onDone(result);
    } catch (err) {
      console.error('[ui] dialog onDone threw', err);
    }
  }

  private startTyping(): void {
    cancelAnimationFrame(this.raf);
    this.typed = prefersReducedMotion() ? this.full.length : 0;
    this.last = 0;
    this.paint();
    const step = (now: number): void => {
      if (!this.mounted) return;
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      this.last = now;
      this.typed = Math.min(this.full.length, this.typed + dt * CHARS_PER_SECOND);
      this.paint();
      if (this.typed < this.full.length) this.raf = requestAnimationFrame(step);
    };
    if (this.typed < this.full.length) this.raf = requestAnimationFrame(step);
  }

  private paint(): void {
    const shown = this.el.querySelector<HTMLElement>('.wn-dialog__typed');
    const rest = this.el.querySelector<HTMLElement>('.wn-dialog__rest');
    if (!shown || !rest) return;
    const n = Math.floor(this.typed);
    // The untyped remainder stays in the layout (invisible) so the card never changes height.
    shown.textContent = this.full.slice(0, n);
    rest.textContent = this.full.slice(n);
    this.el.querySelector('.wn-dialog__card')?.classList.toggle('is-typed', n >= this.full.length);
  }

  private advance(accepted: boolean): void {
    if (this.typed < this.full.length) {
      // First tap completes the line.
      this.typed = this.full.length;
      cancelAnimationFrame(this.raf);
      this.paint();
      return;
    }
    if (!accepted || this.index >= this.cards.length - 1) {
      this.finish(accepted);
      return;
    }
    this.index++;
    this.render();
    this.startTyping();
  }

  protected build(): Child {
    const p = this.params as Partial<DialogParams>;
    if (p.cards !== this.source) {
      this.source = p.cards;
      this.cards = Array.isArray(p.cards) ? p.cards.filter(isCard) : [];
      this.index = 0;
      this.finished = false;
    }
    const card = this.cards[this.index];
    if (!card) {
      // Nothing to say: close right after mounting.
      window.setTimeout(() => this.finish(true), 0);
      return h('div', { class: 'wn-dialog' });
    }
    const role: SpeakerRole = card.speaker in ROLE_COLOR ? card.speaker : 'rider';
    this.full = text(card.text);
    const last = this.index >= this.cards.length - 1;
    const acceptLabel = text(card.accept) || (last ? t('ui.dialog.ok') : t('ui.dialog.next'));
    const lang = i18n.lang;

    return h(
      'div',
      { class: 'wn-dialog wn-panel', style: `--c:${hex(ROLE_COLOR[role])}`, onclick: () => this.advance(true) },
      h(
        'div',
        { class: 'wn-dialog__card wn-rise', style: '--i:0' },
        h(
          'div',
          { class: 'wn-dialog__who' },
          portrait(role),
          h('div', null, h('div', { class: 'wn-kicker' }, t(`ui.dialog.role.${role}`)), h('div', { class: 'wn-dialog__name wn-hd' }, text(card.name) || t(`ui.dialog.name.${role}`))),
          this.cards.length > 1 ? h('span', { class: 'wn-dialog__count' }, `${this.index + 1}/${this.cards.length}`) : null,
        ),
        card.title ? h('h2', { class: 'wn-dialog__title wn-hd' }, text(card.title)) : null,
        h('p', { class: 'wn-dialog__text', 'aria-label': this.full }, h('span', { class: 'wn-dialog__typed' }), h('span', { class: 'wn-dialog__rest', 'aria-hidden': 'true' })),
        card.reward && (card.reward.coins || card.reward.rep)
          ? h(
              'div',
              { class: 'wn-dialog__reward' },
              h('span', null, t('ui.dialog.reward')),
              card.reward.coins ? h('b', null, coinIcon(), `+${fmt(card.reward.coins, lang)}`) : null,
              card.reward.rep ? h('b', null, icon('bolt'), `+${fmt(card.reward.rep, lang)}`) : null,
            )
          : null,
        h(
          'div',
          { class: 'wn-dialog__actions', onclick: (ev: Event) => ev.stopPropagation() },
          card.decline ? button({ label: text(card.decline), kind: 'ghost', size: 'lg', sfx: 'ui.back', onClick: () => this.advance(false) }) : null,
          button({ label: acceptLabel, iconEnd: last ? undefined : 'next', kind: 'primary', size: 'lg', onClick: () => this.advance(true) }),
        ),
      ),
    );
  }
}
