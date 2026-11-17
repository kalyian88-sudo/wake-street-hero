/**
 * In-run HUD — DOM overlay over the game canvas (see hud.css for the layout).
 *
 * Integration notes:
 *  - All HUD elements are `pointer-events: none`. Touches land on the element the Input module is
 *    attached to (canvas / #app); Input hit-tests the button rects registered here via bindButton().
 *  - update() never reads layout and writes to the DOM only when a displayed value changes.
 *  - Strings come from src/i18n/parts/hud.{ru,en}.json (namespace `hud.*`), registered in createHud().
 */
import './hud.css';
import './hud-feed.css';
import './hud-controls.css';
import type { EventBus } from '../../core/events';
import { getTrick } from '../../data/tricks';
import enPart from '../../i18n/parts/hud.en.json';
import ruPart from '../../i18n/parts/hud.ru.json';
import type { ButtonId, HudView, IHud, II18n, IInput, RunConfig, SpotDef } from '../../types';
import { Controls } from './Controls';
import { fmtInt, h, type HudCtx } from './dom';
import { Feed } from './Feed';
import { lacksCondensedFont, makeStreakTexture } from './fxTexture';
import { Gauges } from './Gauges';
import { MoveCard } from './MoveCard';
import { bindHaptics } from './haptics';
import { Toasts } from './Toasts';
import { TopBar } from './TopBar';

export interface HudDeps {
  bus: EventBus;
  input: IInput;
  i18n: II18n;
}

/** animation-name → class that started it; the class is dropped when the one-shot animation ends. */
const ONE_SHOT: Record<string, string> = {
  'wsh-bump': 'is-bump',
  'wsh-multbump': 'is-bump',
  'wsh-letter-pop': 'is-pop',
  'wsh-live-in': 'is-in',
  'wsh-pop-in': 'is-in',
  'wsh-toast-in': 'is-in',
  'wsh-caught': 'is-caught',
  'wsh-missed': 'is-missed',
  'wsh-bankfly': 'is-fly',
  'wsh-bail': 'is-show',
  'wsh-lost': 'is-show',
  'wsh-heroflash': 'is-show',
  'wsh-count': 'is-show',
  'wsh-combo-bank': 'is-bank',
  'wsh-combo-lost': 'is-lost',
};

class Hud implements IHud {
  private readonly root: HTMLElement;
  private readonly ctx: HudCtx;
  private readonly top: TopBar;
  private readonly feed: Feed;
  private readonly toasts: Toasts;
  private readonly controls: Controls;
  private readonly gauges: Gauges;
  private readonly moves: MoveCard;

  private on = false;
  private touch = true;
  private needLayout = true;
  private spot: SpotDef | null = null;
  private hintIds: ButtonId[] = [];
  /** Start-of-run tip: seconds left on screen (0 = none shown by us). */
  private tipLeft = 0;
  private tipText = '';
  private runCount = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly deps: HudDeps) {
    deps.i18n.extend('ru', ruPart as Record<string, string>);
    deps.i18n.extend('en', enPart as Record<string, string>);
    this.ctx = {
      t: (key, params) => deps.i18n.t(key, params),
      l: (text) => deps.i18n.l(text),
      input: deps.input,
    };

    const root = (this.root = h('div', 'wsh-hud'));
    if (lacksCondensedFont()) root.classList.add('is-squeeze');
    const streaks = makeStreakTexture();
    if (streaks) root.style.setProperty('--streaks', `url("${streaks}")`);

    // build order = paint order (screen effects first, controls last)
    this.gauges = new Gauges(root, this.ctx);
    this.moves = new MoveCard(root, this.ctx);
    this.top = new TopBar(root, this.ctx);
    this.feed = new Feed(root, this.ctx);
    this.toasts = new Toasts(root, this.ctx);
    this.controls = new Controls(root, this.ctx);

    this.touch = deps.input.touchMode;
    root.classList.toggle('is-keys', !this.touch);
    root.addEventListener('animationend', this.onAnimationEnd);
    deps.i18n.onChange(() => this.relabel());
    this.subscribe(deps.bus);
    bindHaptics(deps.bus, deps.input, () => this.on);
  }

  // ───────────────────────────────────────────────────────────── IHud ──

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.needLayout = true;
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    if (typeof ResizeObserver !== 'undefined' && !this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(this.root);
    }
  }

  show(cfg: RunConfig, spot: SpotDef): void {
    this.spot = spot;
    this.root.classList.toggle('is-skate', cfg.board === 'wakeskate');
    this.top.reset(0, cfg.mode !== 'free');
    this.feed.reset();
    this.toasts.reset();
    this.controls.reset(cfg.board);
    this.moves.reset(spot, cfg.board);
    this.gauges.reset();
    this.on = true;
    this.needLayout = true;
    this.root.classList.add('is-on');
    this.controls.bind(true);
    this.deps.input.bindButton('pause', this.top.pauseEl);
    this.applyHighlights();
    if (cfg.mode !== 'tutorial') this.showStartTip(spot);
  }

  /** A short "how to" tip at the start of each run: the spot's trick goal every other run, otherwise a rotating general tip. */
  private showStartTip(spot: SpotDef): void {
    const t = this.ctx.t;
    const l = this.ctx.l;
    this.runCount++;
    let text = '';
    const goal = spot.goals.find((g) => g.type === 'trick');
    if (goal && goal.type === 'trick' && this.runCount % 2 === 1) {
      const def = getTrick(goal.trickId);
      if (def) text = `${l(def.name)} — ${l(def.input)}`;
    }
    if (!text) {
      const n = 12;
      const i = ((this.runCount * 7 + Math.floor(Math.random() * n)) % n) + 1;
      text = t(`hud.tip.${i}`);
    }
    this.tipText = text;
    this.tipLeft = 7;
    this.setHint(this.tipText);
  }

  hide(): void {
    if (!this.on) return;
    this.on = false;
    this.root.classList.remove('is-on');
    this.controls.bind(false);
    this.deps.input.bindButton('pause', null);
    this.setHint(null);
  }

  update(view: HudView, realDt: number): void {
    if (!this.on) return;
    if (this.needLayout) this.layout();
    const touch = this.deps.input.touchMode;
    if (touch !== this.touch) {
      this.touch = touch;
      this.root.classList.toggle('is-keys', !touch);
    }
    const state = view.state;
    const score = view.score;
    this.gauges.update(state, score, view.timeScale, realDt);
    this.moves.update(state, realDt);
    this.top.update(score, state, view.objectives, realDt);
    this.feed.update(state, view.countdown, realDt);
    this.toasts.update(realDt);
    this.controls.update(state, score);
    if (this.tipLeft > 0) {
      // the tip stays through the countdown and fades a few seconds into the run
      if (view.countdown === null) this.tipLeft -= realDt;
      if (this.tipLeft <= 0) {
        this.tipLeft = 0;
        if (this.gaugesHint === this.tipText) this.setHint(null);
      }
    }
  }

  private gaugesHint: string | null = null;

  private endlessEl: HTMLElement | null = null;
  private endlessText: Text | null = null;
  private endlessLives = -1;

  setEndless(info: { stage: number; lives: number } | null): void {
    if (!this.endlessEl) {
      this.endlessEl = h('div', 'wsh-endless wsh-x', this.root);
      this.endlessText = document.createTextNode('');
      this.endlessEl.appendChild(this.endlessText);
    }
    this.endlessEl.classList.toggle('is-on', !!info);
    if (!info || !this.endlessText) return;
    const hearts = '♥'.repeat(info.lives) + '♡'.repeat(Math.max(0, 3 - info.lives));
    this.endlessText.data = `${this.ctx.t('hud.endless.stage', { n: info.stage + 1 })}  ${hearts}`;
    if (this.endlessLives !== -1 && info.lives < this.endlessLives) {
      this.endlessEl.classList.remove('is-hit');
      void this.endlessEl.offsetWidth;
      this.endlessEl.classList.add('is-hit');
    }
    this.endlessLives = info.lives;
  }

  setScheme(scheme: 'swipe' | 'classic'): void {
    this.root.classList.toggle('is-swipe', scheme === 'swipe');
    this.moves.setSwipe(scheme === 'swipe');
    if (scheme === 'swipe' && this.tipLeft > 0) {
      // the stick / button tips do not apply: explain the gestures instead
      this.tipText = this.ctx.t('hud.tip.swipe');
      this.setHint(this.tipText);
      this.tipLeft = 7;
    }
  }

  setHint(text: string | null, highlight?: ButtonId[]): void {
    this.gaugesHint = text;
    if (text !== this.tipText) this.tipLeft = 0;
    this.gauges.setHint(text);
    this.clearHighlights();
    this.hintIds = text !== null && highlight ? highlight.slice() : [];
    this.applyHighlights();
  }

  // ─────────────────────────────────────────────────────────── helpers ──

  private buttonEl(id: ButtonId): HTMLElement | null {
    return id === 'pause' ? this.top.pauseEl : this.controls.element(id);
  }

  private clearHighlights(): void {
    for (const id of this.hintIds) this.buttonEl(id)?.classList.remove('is-hint');
  }

  private applyHighlights(): void {
    for (const id of this.hintIds) this.buttonEl(id)?.classList.add('is-hint');
  }

  private relabel(): void {
    this.top.relabel();
    this.controls.relabel();
    this.gauges.relabel();
    this.moves.relabel();
  }

  private readonly onResize = (): void => {
    this.needLayout = true;
  };

  private readonly onAnimationEnd = (e: AnimationEvent): void => {
    const cls = ONE_SHOT[e.animationName];
    if (cls && e.target instanceof Element && !e.pseudoElement) e.target.classList.remove(cls);
  };

  /** The only place that reads layout: once after show() and after each resize. */
  private layout(): void {
    this.needLayout = false;
    const r = this.root.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) {
      this.needLayout = true;
      return;
    }
    this.top.layout(r.width, r.height);
    this.controls.layout(r.left, r.top);
    const s = this.top.scoreAnchor();
    this.feed.layout(r.width, r.height, s.left + s.width / 2 - r.left, s.top + s.height / 2 - r.top);
  }

  private goalText(index: number): string {
    const goal = this.spot?.goals[index];
    if (!goal) return '';
    const t = this.ctx.t;
    switch (goal.type) {
      case 'score':
        return t('hud.goal.score', { n: fmtInt(goal.target) });
      case 'trick': {
        const def = getTrick(goal.trickId);
        return def ? t('hud.goal.trick', { name: this.ctx.l(def.name) }) : t('hud.goal.trickAny');
      }
      case 'letters':
        return t('hud.goal.letters');
      case 'line':
        return t('hud.goal.line');
      case 'clip':
        return t('hud.goal.clip');
      default:
        return '';
    }
  }

  // ─────────────────────────────────────────────────────── bus events ──

  private subscribe(bus: EventBus): void {
    const { feed, top, toasts, controls } = this;
    const t = this.ctx.t;
    const l = this.ctx.l;
    /** Wrap a handler so it only runs while the HUD is shown. */
    const live = <P>(fn: (payload: P) => void) => {
      return (payload: P): void => {
        if (this.on) fn(payload);
      };
    };

    bus.on('run:countdown', live((e) => feed.count(e.n)));
    bus.on('run:go', live(() => feed.go()));

    // live ticker: elements as they start
    bus.on('sim:takeoff', live(() => feed.clearLive()));
    bus.on('sim:railEnter', live(() => feed.clearLive()));
    bus.on('sim:land', live(() => feed.clearLive()));
    bus.on('sim:respawn', live(() => feed.clearLive()));
    bus.on('trick:spin', live((e) => feed.spin(e.deg)));
    bus.on('trick:invert', live((e) => feed.invert(e.id, e.count)));
    bus.on('trick:grab', live((e) => feed.grab(e.id)));
    bus.on('trick:flip', live((e) => feed.flip(e.id)));
    bus.on('trick:shifty', live(() => feed.shifty()));
    bus.on('trick:catch', live((e) => controls.onCatch(e.ok)));

    // results
    bus.on('score:trick', live((e) => feed.trick(e)));
    bus.on('score:bonus', live((e) => feed.bonus(e.name, e.points)));
    bus.on(
      'score:bank',
      live((e) => {
        if (!(e.banked > 0)) return;
        feed.bank(e.banked);
        top.onBank();
      }),
    );
    bus.on(
      'score:lost',
      live((e) => {
        const value = e.points * e.mult;
        if (!(value > 0)) return;
        feed.lost(value);
        top.onLost();
      }),
    );
    bus.on('sim:bail', live((e) => feed.bail(e.reason)));
    bus.on('hero:ready', live(() => toasts.push('hero', t('hud.toast.heroReady'), t('hud.toast.heroReadySub'))));
    bus.on('hero:start', live(() => feed.heroFlash()));

    // objectives
    bus.on('sim:gap', live((e) => toasts.push('gap', l(e.name), '', '+' + fmtInt(e.points))));
    bus.on(
      'letter:collect',
      live((e) => {
        top.onLetter(e.index);
        if (e.count >= 6) toasts.push('letters', t('hud.toast.letters'), t('hud.toast.lettersSub'));
      }),
    );
    bus.on('goal:complete', live((e) => toasts.push('goal', t(e.first ? 'hud.toast.goalNew' : 'hud.toast.goal'), this.goalText(e.index))));
    bus.on('clip:captured', live((e) => toasts.push('clip', t('hud.toast.clip'), t('hud.toast.clipSub', { name: l(e.trick.name) }))));
    bus.on(
      'line:progress',
      live((e) => {
        const n = e.chain.length;
        if (n < 1 || e.total < 1) return;
        if (n >= e.total) toasts.push('line', t('hud.toast.lineDone'), t('hud.toast.lineDoneSub'));
        else toasts.push('line', t('hud.toast.line', { n, total: e.total }), t('hud.toast.lineSub'));
      }),
    );
  }
}

export function createHud(deps: HudDeps): IHud {
  return new Hud(deps);
}
