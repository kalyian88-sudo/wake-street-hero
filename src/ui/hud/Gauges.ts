/**
 * HUD gauges and screen effects: rail balance bar, speed readout with the rope (slack / tension) line,
 * slow-motion vignette + letterbox + speed lines, HERO edge glow and the tutorial coach banner.
 */
import { GAME } from '../../config';
import type { RiderSimState, ScoreState } from '../../types';
import { clamp01, h, restart, svg, txt, type HudCtx } from './dom';

/** Half travel of the balance marker in px (bar is 2 × this + padding wide, see hud.css). */
const BALANCE_HALF = 96;
const BALANCE_DANGER = 0.66;
const FX_STEPS = 48;
const ROPE_W = 64;
const ROPE_SAG_MAX = 9;

export class Gauges {
  private readonly fx: HTMLElement;
  private readonly glow: HTMLElement;
  private readonly balance: HTMLElement;
  private readonly marker: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly speedText: Text;
  private readonly unitText: Text;
  private readonly switchEl: HTMLElement;
  private readonly switchText: Text;
  private readonly ropePath: SVGPathElement;
  private readonly ropeEl: SVGSVGElement;
  private readonly coach: HTMLElement;
  private readonly coachTag: Text;
  private readonly coachText: Text;

  private fxQ = 0;
  private heroOn = false;
  private railOn = false;
  private balQ = 9999;
  private danger = 0;
  private kmh = -1;
  private speedSmooth = 0;
  private isSwitch = false;
  private ropeState = -1;
  private sagQ = -1;
  private coachOn = false;

  constructor(
    root: HTMLElement,
    private readonly ctx: HudCtx,
  ) {
    // full-screen effects sit under every other HUD element
    this.fx = h('div', 'wsh-fx', root);
    h('div', 'wsh-fx-lines', this.fx);
    h('div', 'wsh-fx-vig', this.fx);
    h('div', 'wsh-fx-bar wsh-fx-bar--t', this.fx);
    h('div', 'wsh-fx-bar wsh-fx-bar--b', this.fx);
    this.glow = h('div', 'wsh-heroglow', root);

    this.balance = h('div', 'wsh-balance', root);
    const track = h('div', 'wsh-balance-track', this.balance);
    h('i', 'wsh-balance-mid', track);
    this.marker = h('div', 'wsh-balance-marker', this.balance);

    this.speedEl = h('div', 'wsh-speed', root);
    this.switchEl = h('div', 'wsh-switch', this.speedEl);
    this.switchText = txt(h('span', 'wsh-x', this.switchEl));
    const row = h('div', 'wsh-speed-row wsh-x', this.speedEl);
    this.speedText = txt(h('span', 'wsh-speed-num', row), '0');
    this.unitText = txt(h('span', 'wsh-speed-unit', row));
    this.ropeEl = svg(`<path d="M2 3 Q ${ROPE_W / 2} 3 ${ROPE_W - 2} 3"/>`, 'wsh-rope', this.speedEl, `0 0 ${ROPE_W} 14`);
    this.ropePath = this.ropeEl.querySelector('path') as SVGPathElement;

    this.coach = h('div', 'wsh-coach', root);
    const tag = h('div', 'wsh-coach-tag', this.coach);
    this.coachTag = txt(h('span', 'wsh-x', tag));
    this.coachText = txt(h('div', 'wsh-coach-text', this.coach));
    this.relabel();
  }

  relabel(): void {
    this.unitText.data = this.ctx.t('hud.speed.unit');
    this.switchText.data = this.ctx.t('hud.switch');
    this.coachTag.data = this.ctx.t('hud.coach');
  }

  reset(): void {
    this.fxQ = 0;
    this.fx.style.opacity = '0';
    this.fx.classList.remove('is-on');
    this.heroOn = false;
    this.glow.classList.remove('is-on');
    this.railOn = false;
    this.balance.classList.remove('is-on', 'is-danger', 'is-warn');
    this.danger = 0;
    this.balQ = 9999;
    this.kmh = -1;
    this.speedSmooth = 0;
    this.ropeState = -1;
    this.sagQ = -1;
  }

  setHint(text: string | null): void {
    const on = text !== null && text !== '';
    if (on) {
      const changed = this.coachText.data !== text;
      this.coachText.data = text as string;
      if (changed || !this.coachOn) restart(this.coach, 'is-on');
    } else this.coach.classList.remove('is-on');
    this.coachOn = on;
  }

  update(state: RiderSimState, score: ScoreState, timeScale: number, dt: number): void {
    // ── slow-motion look: vignette + letterbox + speed lines fade in as the time scale drops to 0.35
    const k = clamp01((1 - timeScale) / (1 - GAME.slowMoScale));
    const fq = Math.round(k * FX_STEPS);
    if (fq !== this.fxQ) {
      if (fq > 0 !== this.fxQ > 0) this.fx.classList.toggle('is-on', fq > 0);
      this.fxQ = fq;
      this.fx.style.opacity = (fq / FX_STEPS).toFixed(3);
    }

    // ── HERO: red edge glow while active
    const hero = score.hero.active || state.hero;
    if (hero !== this.heroOn) {
      this.heroOn = hero;
      this.glow.classList.toggle('is-on', hero);
    }

    // ── rail balance
    const rail = state.rail;
    const railOn = rail !== null && state.mode === 'rail';
    if (railOn !== this.railOn) {
      this.railOn = railOn;
      this.balance.classList.toggle('is-on', railOn);
    }
    if (rail && railOn) {
      const b = rail.balance < -1 ? -1 : rail.balance > 1 ? 1 : rail.balance;
      const bq = Math.round(b * BALANCE_HALF * 2);
      if (bq !== this.balQ) {
        this.balQ = bq;
        this.marker.style.transform = 'translate3d(' + bq / 2 + 'px,0,0)';
        const a = Math.abs(b);
        const danger = a >= BALANCE_DANGER ? 2 : a >= 0.4 ? 1 : 0;
        if (danger !== this.danger) {
          this.danger = danger;
          this.balance.classList.toggle('is-warn', danger === 1);
          this.balance.classList.toggle('is-danger', danger === 2);
        }
      }
    }

    // ── speed (km/h, lightly smoothed so the digits do not flicker)
    this.speedSmooth += (state.speed * 3.6 - this.speedSmooth) * Math.min(1, dt * 6);
    const kmh = Math.round(this.speedSmooth);
    if (kmh !== this.kmh) {
      this.kmh = kmh;
      this.speedText.data = String(kmh);
    }
    if (state.switch !== this.isSwitch) {
      this.isSwitch = state.switch;
      this.switchEl.classList.toggle('is-on', state.switch);
    }

    // ── rope: straight and bright when it pulls, sagging when slack, dashed when the handle is released
    const rope = state.rope;
    const rs = !rope.holding ? 3 : !rope.taut ? 2 : rope.tension > 0.82 ? 1 : 0;
    if (rs !== this.ropeState) {
      this.ropeState = rs;
      const cls = this.ropeEl.classList;
      cls.toggle('is-hot', rs === 1);
      cls.toggle('is-slack', rs === 2);
      cls.toggle('is-off', rs === 3);
    }
    const sag = rs === 3 ? ROPE_SAG_MAX : rope.taut ? 0 : Math.min(1, rope.slack / 2.5) * ROPE_SAG_MAX;
    const sq = Math.round(sag * 2);
    if (sq !== this.sagQ) {
      this.sagQ = sq;
      // control point at 2× the sag puts the curve's belly at 1× the sag
      this.ropePath.setAttribute('d', 'M2 3 Q ' + ROPE_W / 2 + ' ' + (3 + sq) + ' ' + (ROPE_W - 2) + ' 3');
    }
  }
}
