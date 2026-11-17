/**
 * Interactive tutorial (first run on the first spot, mode 'tutorial'): one big instruction at a time
 * with an animated finger showing the gesture (swipe scheme) or the control to use (classic scheme).
 * Each step completes on the real in-game event, so the player learns by doing:
 *   lane / steer → pop → spin in the air → hop onto a rail → slide on it → done.
 */
import type { EventBus } from '../../core/events';
import type { RiderSimState } from '../../types';
import { h, txt, type HudCtx } from './dom';

type Step = 'lane' | 'pop' | 'spin' | 'rail' | 'slide' | 'done';
const ORDER: Step[] = ['lane', 'pop', 'spin', 'rail', 'slide', 'done'];
type Dir = 'left' | 'right' | 'up' | 'down' | 'tap' | 'none';

export class Tutorial {
  private readonly el: HTMLElement;
  private readonly text: Text;
  private readonly step$: Text;
  private readonly hand: HTMLElement;
  private step: Step | null = null;
  private swipe = true;
  private startX = 0;
  private doneT = 0;
  private readonly offs: (() => void)[] = [];

  /** An instruction is on screen (the HUD hides the move card meanwhile). */
  get active(): boolean {
    return this.step !== null;
  }

  constructor(
    root: HTMLElement,
    private readonly ctx: HudCtx,
    bus: EventBus,
  ) {
    this.el = h('div', 'wsh-tut', root);
    const card = h('div', 'wsh-tut-card', this.el);
    this.step$ = txt(h('div', 'wsh-tut-step wsh-x', card));
    this.text = txt(h('div', 'wsh-tut-text', card));
    this.hand = h('div', 'wsh-tut-hand', this.el);
    h('i', 'wsh-tut-trail', this.hand);
    h('b', 'wsh-tut-finger', this.hand);
    this.offs.push(
      bus.on('sim:pop', () => this.complete('pop')),
      bus.on('trick:spin', () => this.complete('spin')),
      bus.on('sim:railEnter', () => {
        // landing on a rail early also teaches the jump / rail steps
        if (this.step === 'pop' || this.step === 'spin' || this.step === 'rail') this.go('slide');
      }),
      bus.on('sim:railStance', (e) => {
        if (e.stance !== 'fifty') this.complete('slide');
      }),
    );
  }

  start(swipe: boolean, s: RiderSimState): void {
    this.swipe = swipe;
    this.startX = s.pos.x;
    this.go('lane');
  }

  setSwipe(swipe: boolean): void {
    if (swipe === this.swipe) return;
    this.swipe = swipe;
    if (this.step) this.go(this.step);
  }

  stop(): void {
    this.step = null;
    this.el.classList.remove('is-on');
  }

  update(s: RiderSimState, dt: number): void {
    if (!this.step) return;
    if (this.step === 'lane' && Math.abs(s.pos.x - this.startX) > 2.2) this.complete('lane');
    if (this.step === 'done') {
      this.doneT -= dt;
      if (this.doneT <= 0) this.stop();
    }
  }

  private complete(step: Step): void {
    if (this.step !== step) return;
    this.go(ORDER[ORDER.indexOf(step) + 1]);
  }

  private go(step: Step): void {
    this.step = step;
    const t = this.ctx.t;
    const n = ORDER.indexOf(step) + 1;
    this.step$.data = step === 'done' ? t('hud.tut.doneTitle') : t('hud.tut.stepOf', { n, total: ORDER.length - 1 });
    const scheme = this.swipe ? 'swipe' : 'classic';
    this.text.data = t(`hud.tut.${step}.${step === 'done' ? 'all' : scheme}`);
    const dir: Dir = !this.swipe ? 'none' : step === 'lane' ? 'right' : step === 'pop' ? 'up' : step === 'spin' ? 'left' : step === 'rail' ? 'up' : step === 'slide' ? 'left' : 'none';
    this.hand.className = `wsh-tut-hand wsh-tut-hand--${dir}`;
    this.el.classList.add('is-on');
    this.el.classList.toggle('is-done', step === 'done');
    // re-trigger the card pop
    this.el.classList.remove('is-pop');
    void this.el.offsetWidth;
    this.el.classList.add('is-pop');
    if (step === 'done') this.doneT = 4;
  }

  dispose(): void {
    for (const off of this.offs) off();
  }
}
