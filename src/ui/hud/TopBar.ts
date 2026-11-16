/**
 * HUD top strip: banked score + live combo (top-left), W-H-Y-N-O-T letters + line progress (top-centre),
 * pause button + HERO meter ring (top-right).
 */
import { GAME } from '../../config';
import { KEY_LEGEND } from '../../input/keyboard';
import type { ObjectivesState, RiderSimState, ScoreState } from '../../types';
import { ICON, clamp01, fmtInt, h, restart, svg, txt, type HudCtx } from './dom';

const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R;
const RING_STEPS = 240;
const COMBO_STEPS = 200;
/** Seconds the score waits for the "bank fly" chip to arrive before it rolls up. */
const BANK_HOLD = 0.95;

export class TopBar {
  readonly pauseEl: HTMLElement;

  private readonly scoreEl: HTMLElement;
  private readonly scoreText: Text;
  private readonly heroTag: HTMLElement;
  private readonly heroTagText: Text;
  private readonly combo: HTMLElement;
  private readonly comboPtsText: Text;
  private readonly comboMultEl: HTMLElement;
  private readonly comboMultText: Text;
  private readonly comboFill: HTMLElement;
  private readonly comboBar: HTMLElement;
  private readonly mid: HTMLElement;
  private readonly letters: HTMLElement[] = [];
  private readonly lettersRow: HTMLElement;
  private readonly prog: HTMLElement;
  private readonly progFill: HTMLElement;
  private readonly progDot: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly ringArc: SVGCircleElement;
  private readonly ringSecs: Text;
  private readonly ringLabel: Text;

  private shown = 0;
  private shownInt = -1;
  private hold = 0;
  private sizeClass = 0;
  private comboOn = false;
  private comboPts = -1;
  private comboMult = -1;
  private comboQ = -1;
  private comboLow = false;
  private readonly letterOn: boolean[] = [false, false, false, false, false, false];
  private hasLetters = true;
  private progW = 132;
  private progQ = -1;
  private ringQ = -1;
  private heroState = 0;
  private heroSecs = -1;

  constructor(
    root: HTMLElement,
    private readonly ctx: HudCtx,
  ) {
    // ── top-left: score + combo
    const tl = h('div', 'wsh-tl', root);
    const scoreRow = h('div', 'wsh-score', tl);
    this.scoreEl = h('div', 'wsh-score-num wsh-x wsh-x--l', scoreRow);
    this.scoreText = txt(this.scoreEl, '0');
    this.combo = h('div', 'wsh-combo', tl);
    const row = h('div', 'wsh-combo-row wsh-x wsh-x--l', this.combo);
    this.comboPtsText = txt(h('span', 'wsh-combo-pts', row), '0');
    this.comboMultEl = h('span', 'wsh-combo-mult', row);
    this.comboMultText = txt(this.comboMultEl, '×1');
    this.comboBar = h('div', 'wsh-combo-bar', this.combo);
    this.comboFill = h('i', '', this.comboBar);
    this.heroTag = h('div', 'wsh-herotag wsh-x wsh-x--l', tl);
    this.heroTagText = txt(this.heroTag);

    // ── top-centre: letters + progress
    this.mid = h('div', 'wsh-mid', root);
    this.lettersRow = h('div', 'wsh-letters', this.mid);
    for (let i = 0; i < GAME.letters.length; i++) {
      const cell = h('div', 'wsh-letter', this.lettersRow);
      h('span', 'wsh-x', cell, GAME.letters[i]);
      this.letters.push(cell);
    }
    this.prog = h('div', 'wsh-prog', this.mid);
    this.progFill = h('div', 'wsh-prog-fill', this.prog);
    h('div', 'wsh-prog-end', this.prog);
    this.progDot = h('div', 'wsh-prog-dot', this.prog);

    // ── top-right: pause + HERO ring
    const tr = h('div', 'wsh-tr', root);
    this.pauseEl = h('div', 'wsh-pause', tr);
    h('i', '', this.pauseEl);
    h('i', '', this.pauseEl);
    h('span', 'wsh-key', this.pauseEl, KEY_LEGEND.pause);

    this.ring = h('div', 'wsh-ring', tr);
    const ringSvg = svg(
      `<circle class="wsh-ring-track" cx="24" cy="24" r="${RING_R}"/><circle class="wsh-ring-arc" cx="24" cy="24" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"/>`,
      'wsh-ring-svg',
      this.ring,
      '0 0 48 48',
    );
    this.ringArc = ringSvg.querySelector('.wsh-ring-arc') as SVGCircleElement;
    svg(ICON.bolt, 'wsh-ring-bolt', this.ring);
    this.ringSecs = txt(h('div', 'wsh-ring-secs', this.ring));
    this.ringLabel = txt(h('div', 'wsh-ring-label wsh-x', this.ring));
    this.relabel();
  }

  relabel(): void {
    this.heroTagText.data = this.ctx.t('hud.hero.x2');
    this.ringLabel.data = this.ctx.t('hud.hero.label');
  }

  /** Screen rect of the score figure (target of the bank fly). Layout read — call from layout() only. */
  scoreAnchor(): DOMRect {
    return this.scoreEl.getBoundingClientRect();
  }

  /** Called on show / resize. */
  layout(width: number, height: number): void {
    const landscape = width > height;
    const w = landscape ? Math.min(240, Math.round(width * 0.26)) : 132;
    if (w !== this.progW) {
      this.progW = w;
      this.progQ = -1;
    }
    this.prog.style.width = w + 'px';
  }

  reset(total: number, withLetters: boolean): void {
    this.shown = total;
    this.shownInt = -1;
    this.hold = 0;
    this.comboOn = false;
    this.comboPts = -1;
    this.comboMult = -1;
    this.comboQ = -1;
    this.combo.classList.remove('is-on', 'is-lost', 'is-bank', 'is-low');
    this.comboLow = false;
    this.scoreEl.classList.remove('is-bump');
    for (let i = 0; i < this.letters.length; i++) {
      this.letterOn[i] = false;
      this.letters[i].classList.remove('is-on', 'is-pop');
    }
    this.lettersRow.classList.remove('is-all');
    this.setHasLetters(withLetters);
    this.progQ = -1;
    this.ringQ = -1;
    this.heroState = -1;
    this.heroSecs = -1;
  }

  private setHasLetters(on: boolean): void {
    if (on === this.hasLetters) return;
    this.hasLetters = on;
    this.mid.classList.toggle('no-letters', !on);
  }

  /** 'score:bank' — the fly chip is on its way: hold the roll-up, then bump. */
  onBank(): void {
    this.hold = BANK_HOLD;
    this.combo.classList.remove('is-lost');
    restart(this.combo, 'is-bank');
  }

  /** 'score:lost' — the running combo burns. */
  onLost(): void {
    this.combo.classList.remove('is-bank');
    restart(this.combo, 'is-lost');
  }

  onLetter(index: number): void {
    const cell = this.letters[index];
    if (!cell) return;
    this.letterOn[index] = true;
    cell.classList.add('is-on');
    restart(cell, 'is-pop');
    this.checkAllLetters();
  }

  private checkAllLetters(): void {
    let all = true;
    for (let i = 0; i < this.letterOn.length; i++) all = all && this.letterOn[i];
    this.lettersRow.classList.toggle('is-all', all);
  }

  update(score: ScoreState, state: RiderSimState, obj: ObjectivesState | null, dt: number): void {
    // ── banked score (rolls up; waits for the bank chip to land)
    const total = score.total;
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) restart(this.scoreEl, 'is-bump');
    } else if (this.shown !== total) {
      const d = total - this.shown;
      this.shown = Math.abs(d) < 1.5 ? total : this.shown + d * Math.min(1, dt * 9);
    }
    const si = Math.round(this.shown);
    if (si !== this.shownInt) {
      this.shownInt = si;
      this.scoreText.data = fmtInt(si);
      const size = si >= 1000000 ? 2 : si >= 100000 ? 1 : 0;
      if (size !== this.sizeClass) {
        this.sizeClass = size;
        this.scoreEl.classList.toggle('is-long', size === 1);
        this.scoreEl.classList.toggle('is-xlong', size === 2);
      }
    }

    // ── live combo "1 250 × 4" + shrinking window bar
    const active = score.comboActive;
    if (active !== this.comboOn) {
      this.comboOn = active;
      if (active) {
        this.combo.classList.remove('is-lost', 'is-bank');
        this.combo.classList.add('is-on');
      } else this.combo.classList.remove('is-on');
    }
    if (active) {
      const pts = Math.round(score.comboPoints);
      if (pts !== this.comboPts) {
        this.comboPts = pts;
        this.comboPtsText.data = fmtInt(pts);
      }
      const mult = score.comboMult;
      if (mult !== this.comboMult) {
        const grew = mult > this.comboMult && this.comboMult > 0;
        this.comboMult = mult;
        this.comboMultText.data = '×' + (Number.isInteger(mult) ? mult : mult.toFixed(1));
        if (grew) restart(this.comboMultEl, 'is-bump');
      }
      const q = Math.round(clamp01(score.comboTimeLeft / GAME.comboWindow) * COMBO_STEPS);
      if (q !== this.comboQ) {
        this.comboQ = q;
        this.comboFill.style.transform = 'scaleX(' + q / COMBO_STEPS + ')';
        const low = q < COMBO_STEPS * 0.3;
        if (low !== this.comboLow) {
          this.comboLow = low;
          this.combo.classList.toggle('is-low', low);
        }
      }
    }

    // ── letters
    this.setHasLetters(obj !== null);
    if (obj) {
      let changed = false;
      for (let i = 0; i < this.letters.length; i++) {
        const on = obj.letters[i] === true;
        if (on !== this.letterOn[i]) {
          this.letterOn[i] = on;
          this.letters[i].classList.toggle('is-on', on);
          changed = true;
        }
      }
      if (changed) this.checkAllLetters();
    }

    // ── line progress start → winch
    const pq = Math.round(clamp01(state.progress) * this.progW * 2);
    if (pq !== this.progQ) {
      this.progQ = pq;
      const px = pq / 2;
      this.progFill.style.transform = 'scaleX(' + px / this.progW + ')';
      this.progDot.style.transform = 'translate3d(' + px + 'px,0,0)';
    }

    // ── HERO ring: meter → ready → active countdown
    const hero = score.hero;
    const hs = hero.active ? 2 : hero.ready ? 1 : 0;
    if (hs !== this.heroState) {
      this.heroState = hs;
      this.ring.classList.toggle('is-ready', hs === 1);
      this.ring.classList.toggle('is-active', hs === 2);
      this.heroTag.classList.toggle('is-on', hs === 2);
      if (hs !== 2) this.heroSecs = -1;
    }
    const frac = hs === 2 ? hero.timeLeft / GAME.heroDuration : hs === 1 ? 1 : hero.meter;
    const rq = Math.round(clamp01(frac) * RING_STEPS);
    if (rq !== this.ringQ) {
      this.ringQ = rq;
      this.ringArc.style.strokeDashoffset = (RING_C * (1 - rq / RING_STEPS)).toFixed(2);
    }
    if (hs === 2) {
      const secs = Math.ceil(hero.timeLeft);
      if (secs !== this.heroSecs) {
        this.heroSecs = secs;
        this.ringSecs.data = String(secs);
      }
    }
  }
}
