/**
 * HUD controls: JUMP (charge ring), TRICK, GRAB / FLIP (catch timing ring), HANDLE, HERO and the floating
 * joystick visual. Elements are purely visual (`pointer-events: none`): the Input module hit-tests their
 * rects (input.bindButton) and toggles `is-down` on them.
 */
import { KEY_LEGEND } from '../../input/keyboard';
import type { BoardKind, ButtonId, RiderSimState, ScoreState } from '../../types';
import { ICON, clamp01, h, restart, svg, txt, type HudCtx } from './dom';

const CHARGE_R = 53;
const CHARGE_C = 2 * Math.PI * CHARGE_R;
const CHARGE_STEPS = 100;
const CATCH_STEPS = 40;
/** catchWindow above this = "press now". */
const CATCH_HOT = 0.62;

interface Btn {
  el: HTMLElement;
  face: HTMLElement;
  label: Text;
}

export class Controls {
  private readonly pad: HTMLElement;
  private readonly jump: Btn;
  private readonly trick: Btn;
  private readonly grab: Btn;
  private readonly handle: Btn;
  private readonly hero: Btn;
  private readonly chargeArc: SVGCircleElement;
  private readonly catchRing: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly keysLabel: Text;

  private board: BoardKind = 'wakeboard';
  private bound = false;
  private heroOn = false;
  private chargeQ = -1;
  private catching = false;
  private catchQ = -1;
  private catchHot = false;
  private holding = true;
  private stickOn = false;
  private sx = 0;
  private sy = 0;
  private kx = 0;
  private ky = 0;
  private restX = 0;
  private restY = 0;
  private rootLeft = 0;
  private rootTop = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly ctx: HudCtx,
  ) {
    // joystick (ghost at rest, jumps under the finger when active)
    this.stick = h('div', 'wsh-stick', root);
    const base = h('div', 'wsh-stick-base', this.stick);
    h('i', 'wsh-stick-tick wsh-stick-tick--u', base);
    h('i', 'wsh-stick-tick wsh-stick-tick--r', base);
    h('i', 'wsh-stick-tick wsh-stick-tick--d', base);
    h('i', 'wsh-stick-tick wsh-stick-tick--l', base);
    this.knob = h('div', 'wsh-stick-knob', this.stick);

    // keyboard legend that replaces the joystick on desktop
    const keys = h('div', 'wsh-keys', root);
    const caps = h('div', 'wsh-keys-caps', keys);
    h('span', 'wsh-cap wsh-cap--u', caps, '↑');
    h('span', 'wsh-cap wsh-cap--l', caps, '←');
    h('span', 'wsh-cap wsh-cap--d', caps, '↓');
    h('span', 'wsh-cap wsh-cap--r', caps, '→');
    this.keysLabel = txt(h('div', 'wsh-keys-label wsh-x', keys));

    this.pad = h('div', 'wsh-pad', root);
    this.jump = this.makeButton('jump');
    const chargeSvg = svg(
      `<circle class="wsh-charge-track" cx="58" cy="58" r="${CHARGE_R}"/><circle class="wsh-charge-arc" cx="58" cy="58" r="${CHARGE_R}" stroke-dasharray="${CHARGE_C.toFixed(1)}" stroke-dashoffset="${CHARGE_C.toFixed(1)}"/>`,
      'wsh-charge',
      this.jump.el,
      '0 0 116 116',
    );
    this.chargeArc = chargeSvg.querySelector('.wsh-charge-arc') as SVGCircleElement;
    this.trick = this.makeButton('trick');
    this.grab = this.makeButton('grab');
    this.catchRing = h('div', 'wsh-catch', this.grab.el);
    this.handle = this.makeButton('handle', ICON.handle);
    this.hero = this.makeButton('hero', ICON.bolt);
    this.relabel();
  }

  private makeButton(id: ButtonId, icon?: string): Btn {
    const el = h('div', 'wsh-btn wsh-btn--' + id, this.pad);
    const face = h('div', 'wsh-btn-face', el);
    if (icon) svg(icon, 'wsh-btn-icon', face);
    const label = txt(h('span', 'wsh-btn-label wsh-x', face));
    h('span', 'wsh-key', el, KEY_LEGEND[id]);
    return { el, face, label };
  }

  element(id: ButtonId): HTMLElement | null {
    switch (id) {
      case 'jump':
        return this.jump.el;
      case 'trick':
        return this.trick.el;
      case 'grab':
        return this.grab.el;
      case 'handle':
        return this.handle.el;
      case 'hero':
        return this.hero.el;
      default:
        return null;
    }
  }

  relabel(): void {
    const t = this.ctx.t;
    this.jump.label.data = t('hud.btn.jump');
    this.trick.label.data = t('hud.btn.trick');
    this.grab.label.data = t(this.catching ? 'hud.btn.catch' : this.board === 'wakeskate' ? 'hud.btn.flip' : 'hud.btn.grab');
    this.handle.label.data = t(this.holding ? 'hud.btn.handle' : 'hud.btn.regrab');
    this.hero.label.data = t('hud.btn.hero');
    this.keysLabel.data = t('hud.keys.move');
  }

  /** Register / unregister the on-screen buttons with the input module. */
  bind(on: boolean): void {
    if (on === this.bound) return;
    this.bound = on;
    const input = this.ctx.input;
    input.bindButton('jump', on ? this.jump.el : null);
    input.bindButton('trick', on ? this.trick.el : null);
    input.bindButton('grab', on ? this.grab.el : null);
    input.bindButton('handle', on ? this.handle.el : null);
    input.bindButton('hero', on && this.heroOn ? this.hero.el : null);
  }

  reset(board: BoardKind): void {
    this.board = board;
    this.catching = false;
    this.catchQ = -1;
    this.catchHot = false;
    this.holding = true;
    this.chargeQ = -1;
    this.grab.el.classList.remove('is-catching', 'is-hot', 'is-caught', 'is-missed');
    this.grab.el.classList.toggle('is-flip', board === 'wakeskate');
    this.handle.el.classList.remove('is-released');
    this.jump.el.classList.remove('is-charging', 'is-full');
    this.setHero(false);
    this.relabel();
  }

  /** Root rect + joystick rest position. Called on show / resize only (the only layout reads). */
  layout(rootLeft: number, rootTop: number): void {
    this.rootLeft = rootLeft;
    this.rootTop = rootTop;
    this.restX = this.stick.offsetLeft + this.stick.offsetWidth / 2;
    this.restY = this.stick.offsetTop + this.stick.offsetHeight / 2;
  }

  /** 'trick:catch' — flash the FLIP button. */
  onCatch(ok: boolean): void {
    this.grab.el.classList.remove(ok ? 'is-missed' : 'is-caught');
    restart(this.grab.el, ok ? 'is-caught' : 'is-missed');
  }

  private setHero(on: boolean): void {
    if (on === this.heroOn) return;
    this.heroOn = on;
    this.hero.el.classList.toggle('is-on', on);
    if (this.bound) this.ctx.input.bindButton('hero', on ? this.hero.el : null);
  }

  update(state: RiderSimState, score: ScoreState): void {
    // ── JUMP charge ring (rope load)
    const cq = Math.round(clamp01(state.crouch) * CHARGE_STEPS);
    if (cq !== this.chargeQ) {
      const cls = this.jump.el.classList;
      if (cq > 0 !== this.chargeQ > 0) cls.toggle('is-charging', cq > 0);
      if (cq >= CHARGE_STEPS !== this.chargeQ >= CHARGE_STEPS) cls.toggle('is-full', cq >= CHARGE_STEPS);
      this.chargeQ = cq;
      this.chargeArc.style.strokeDashoffset = (CHARGE_C * (1 - cq / CHARGE_STEPS)).toFixed(1);
    }

    // ── FLIP catch timing ring (wakeskate)
    const flip = state.air.flip;
    const catching = state.board === 'wakeskate' && state.mode === 'air' && flip.id !== null && !flip.caught;
    if (catching !== this.catching) {
      this.catching = catching;
      this.grab.el.classList.toggle('is-catching', catching);
      this.grab.label.data = this.ctx.t(catching ? 'hud.btn.catch' : this.board === 'wakeskate' ? 'hud.btn.flip' : 'hud.btn.grab');
      if (!catching) {
        this.catchQ = -1;
        if (this.catchHot) {
          this.catchHot = false;
          this.grab.el.classList.remove('is-hot');
        }
      }
    }
    if (catching) {
      const w = clamp01(flip.catchWindow);
      const q = Math.round(w * CATCH_STEPS);
      if (q !== this.catchQ) {
        this.catchQ = q;
        // the ring closes onto the button rim as the window opens
        this.catchRing.style.transform = 'scale(' + (1.78 - 0.78 * (q / CATCH_STEPS)).toFixed(3) + ')';
        const hot = w >= CATCH_HOT;
        if (hot !== this.catchHot) {
          this.catchHot = hot;
          this.grab.el.classList.toggle('is-hot', hot);
        }
      }
    }

    // ── HANDLE held / released
    const holding = state.rope.holding;
    if (holding !== this.holding) {
      this.holding = holding;
      this.handle.el.classList.toggle('is-released', !holding);
      this.handle.label.data = this.ctx.t(holding ? 'hud.btn.handle' : 'hud.btn.regrab');
    }

    // ── HERO button appears when the meter is full
    this.setHero(score.hero.ready && !score.hero.active);

    // ── joystick visual
    const js = this.ctx.input.joystick;
    if (js.active) {
      if (!this.stickOn) {
        this.stickOn = true;
        this.stick.classList.add('is-active');
      }
      const ox = Math.round(js.originX - this.rootLeft - this.restX);
      const oy = Math.round(js.originY - this.rootTop - this.restY);
      if (ox !== this.sx || oy !== this.sy) {
        this.sx = ox;
        this.sy = oy;
        this.stick.style.transform = 'translate3d(' + ox + 'px,' + oy + 'px,0)';
      }
      const kx = Math.round(js.x);
      const ky = Math.round(js.y);
      if (kx !== this.kx || ky !== this.ky) {
        this.kx = kx;
        this.ky = ky;
        this.knob.style.transform = 'translate3d(' + kx + 'px,' + ky + 'px,0)';
      }
    } else if (this.stickOn) {
      this.stickOn = false;
      this.stick.classList.remove('is-active');
      this.stick.style.transform = '';
      this.knob.style.transform = '';
      this.sx = this.sy = this.kx = this.ky = 0;
    }
  }
}
