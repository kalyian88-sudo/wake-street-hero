/**
 * HUD centre column: live trick ticker ("BACKROLL + 360 + INDY"), resolved trick pops (size / colour by tier,
 * landing tag, stale tricks greyed), bank fly chip, burnt combo, bail message, HERO flash and the countdown.
 * Everything is pooled; animations are CSS (transform / opacity only).
 */
import type { GameEvents } from '../../core/events';
import type { BailReason, FlipId, GrabId, InvertId, L10n, LandingQuality, RiderSimState } from '../../types';
import { fmtInt, h, restart, txt, type HudCtx } from './dom';

const LIVE_MAX = 6;
const POP_COUNT = 4;
const POP_TTL = 2.7;
const POP_MAX_SLOT = 1;

interface LiveEl {
  el: HTMLElement;
  text: Text;
  key: string;
}

interface Pop {
  el: HTMLElement;
  inner: HTMLElement;
  name: Text;
  pts: Text;
  tag: Text;
  stale: Text;
  base: string;
  slot: number;
  ttl: number;
}

export class Feed {
  private readonly live: HTMLElement;
  private readonly liveEls: LiveEl[] = [];
  private liveN = 0;
  private readonly pops: Pop[] = [];
  private readonly bankEl: HTMLElement;
  private readonly bankText: Text;
  private readonly bankLabel: Text;
  private readonly bailEl: HTMLElement;
  private readonly bailTitle: Text;
  private readonly bailSub: Text;
  private readonly lostEl: HTMLElement;
  private readonly lostText: Text;
  private readonly countEl: HTMLElement;
  private readonly countText: Text;
  private readonly flashEl: HTMLElement;
  private readonly flashTitle: Text;
  private readonly flashSub: Text;

  private lastStance: string | null = null;
  private onWall = false;
  private lastCount = -1;
  private goAt = -10;
  private clock = 0;

  constructor(
    root: HTMLElement,
    private readonly ctx: HudCtx,
  ) {
    const feed = h('div', 'wsh-feed', root);
    const popsBox = h('div', 'wsh-pops', feed);
    for (let i = 0; i < POP_COUNT; i++) {
      const el = h('div', 'wsh-pop', popsBox);
      const inner = h('div', 'wsh-pop-in wsh-x', el);
      const name = txt(h('div', 'wsh-pop-name', inner));
      const meta = h('div', 'wsh-pop-meta', inner);
      const pts = txt(h('span', 'wsh-pop-pts', meta));
      const tag = txt(h('span', 'wsh-pop-tag', meta));
      const stale = txt(h('span', 'wsh-pop-stale', meta));
      this.pops.push({ el, inner, name, pts, tag, stale, base: 'wsh-pop', slot: 0, ttl: 0 });
    }
    this.live = h('div', 'wsh-live wsh-x', feed);
    for (let i = 0; i < LIVE_MAX; i++) {
      const el = h('span', 'wsh-live-el', this.live);
      this.liveEls.push({ el, text: txt(el), key: '' });
    }

    this.bankEl = h('div', 'wsh-bankfly', root);
    const bankIn = h('div', 'wsh-x', this.bankEl);
    this.bankLabel = txt(h('span', 'wsh-bankfly-label', bankIn));
    this.bankText = txt(h('span', 'wsh-bankfly-num', bankIn));

    const center = h('div', 'wsh-center', root);
    this.bailEl = h('div', 'wsh-bail', center);
    this.bailTitle = txt(h('div', 'wsh-bail-title wsh-x', this.bailEl));
    this.bailSub = txt(h('div', 'wsh-bail-sub', this.bailEl));
    this.lostEl = h('div', 'wsh-lost', center);
    this.lostText = txt(h('span', 'wsh-x', this.lostEl));

    this.flashEl = h('div', 'wsh-heroflash', root);
    this.flashTitle = txt(h('div', 'wsh-heroflash-title wsh-x', this.flashEl));
    this.flashSub = txt(h('div', 'wsh-heroflash-sub wsh-x', this.flashEl));

    this.countEl = h('div', 'wsh-count', root);
    this.countText = txt(h('span', 'wsh-x', this.countEl));
  }

  /** Anchor points of the bank fly (root-local px): from the feed to the score. */
  layout(width: number, height: number, scoreX: number, scoreY: number): void {
    const s = this.bankEl.style;
    s.setProperty('--bx', Math.round(width / 2) + 'px');
    s.setProperty('--by', Math.round(height * (width > height ? 0.36 : 0.3)) + 'px');
    s.setProperty('--sx', Math.round(scoreX) + 'px');
    s.setProperty('--sy', Math.round(scoreY) + 'px');
  }

  reset(): void {
    this.clearLive();
    for (const p of this.pops) {
      p.ttl = 0;
      p.el.className = 'wsh-pop';
    }
    this.bankEl.classList.remove('is-fly');
    this.bailEl.classList.remove('is-show');
    this.lostEl.classList.remove('is-show');
    this.countEl.classList.remove('is-show', 'is-go');
    this.flashEl.classList.remove('is-show');
    this.lastStance = null;
    this.onWall = false;
    this.lastCount = -1;
    this.goAt = -10;
  }

  // ───────────────────────────────────────────────────── live ticker ──

  clearLive(): void {
    for (let i = 0; i < this.liveN; i++) {
      this.liveEls[i].el.classList.remove('is-on', 'is-in');
      this.liveEls[i].key = '';
    }
    this.liveN = 0;
    // rail stance / wallride are re-added from the state on the next update while they last
    this.lastStance = null;
    this.onWall = false;
  }

  /** Add an element to the running line, or update it in place when `key` is already shown. */
  private liveSet(key: string, text: string): void {
    for (let i = 0; i < this.liveN; i++) {
      const e = this.liveEls[i];
      if (e.key !== key) continue;
      if (e.text.data !== text) {
        e.text.data = text;
        restart(e.el, 'is-in');
      }
      return;
    }
    if (this.liveN >= LIVE_MAX) return;
    const e = this.liveEls[this.liveN++];
    e.key = key;
    e.text.data = text;
    e.el.classList.add('is-on');
    restart(e.el, 'is-in');
  }

  spin(deg: number): void {
    const d = Math.round(Math.abs(deg) / 180) * 180;
    if (d > 0) this.liveSet('spin', this.ctx.t('hud.el.spin', { deg: d }));
  }

  invert(id: InvertId, count: number): void {
    const name = this.ctx.t('hud.el.' + id);
    const text = count >= 3 ? this.ctx.t('hud.el.triple', { name }) : count === 2 ? this.ctx.t('hud.el.double', { name }) : name;
    this.liveSet('invert:' + id, text);
  }

  grab(id: GrabId): void {
    this.liveSet('grab:' + id, this.ctx.t('hud.el.' + id));
  }

  flip(id: FlipId): void {
    this.liveSet('flip:' + id, this.ctx.t('hud.el.' + id));
  }

  shifty(): void {
    this.liveSet('shifty', this.ctx.t('hud.el.shifty'));
  }

  // ───────────────────────────────────────────────────────── results ──

  private takePop(): Pop {
    let free: Pop | null = null;
    let oldest = this.pops[0];
    for (const p of this.pops) {
      if (p.ttl <= 0) free = free ?? p;
      else {
        p.slot++;
        if (p.slot > POP_MAX_SLOT) {
          // pushed off the top: fade where it is
          p.slot = POP_MAX_SLOT;
          p.ttl = 0;
          p.el.className = p.base + ' s' + p.slot + ' is-out';
          free = free ?? p;
        } else p.el.className = p.base + ' s' + p.slot;
      }
      if (p.slot > oldest.slot) oldest = p;
    }
    return free ?? oldest;
  }

  private showPop(name: string, points: number, tier: number, landing: LandingQuality | null, staleFactor: number): void {
    const p = this.takePop();
    p.slot = 0;
    p.ttl = POP_TTL + Math.min(5, tier) * 0.12;
    p.name.data = name;
    p.pts.data = '+' + fmtInt(points);
    p.tag.data = landing ? this.ctx.t('hud.land.' + landing) : '';
    const stale = staleFactor < 1;
    p.stale.data = stale ? this.ctx.t('hud.stale') + ' ×' + staleFactor.toFixed(2).replace(/0$/, '') : '';
    p.base = 'wsh-pop t' + tier + (landing ? ' q-' + landing : ' q-none') + (stale ? ' is-stale' : '');
    p.el.className = p.base + ' s0';
    restart(p.inner, 'is-in');
  }

  /** 'score:trick' — the landed trick replaces the live line. */
  trick(e: GameEvents['score:trick']): void {
    this.clearLive();
    const tier = Math.max(1, Math.min(5, Math.round(e.trick.tier)));
    this.showPop(this.ctx.l(e.trick.name), e.awarded, tier, e.landing === 'bail' ? null : e.landing, staleFactor(e.stale));
  }

  bonus(name: L10n, points: number): void {
    this.showPop(this.ctx.l(name), points, 0, null, 1);
  }

  bank(banked: number): void {
    if (!(banked > 0)) return;
    this.bankLabel.data = this.ctx.t('hud.bank');
    this.bankText.data = '+' + fmtInt(banked);
    restart(this.bankEl, 'is-fly');
  }

  lost(value: number): void {
    if (!(value > 0)) return;
    this.lostText.data = this.ctx.t('hud.combo.lost') + '  −' + fmtInt(value);
    restart(this.lostEl, 'is-show');
  }

  bail(reason: BailReason): void {
    this.clearLive();
    this.bailTitle.data = this.ctx.t('hud.bail.' + reason + '.title');
    this.bailSub.data = this.ctx.t('hud.bail.' + reason + '.sub');
    restart(this.bailEl, 'is-show');
  }

  heroFlash(): void {
    this.flashTitle.data = this.ctx.t('hud.hero.flash');
    this.flashSub.data = this.ctx.t('hud.hero.flashSub');
    restart(this.flashEl, 'is-show');
  }

  // ─────────────────────────────────────────────────────── countdown ──

  count(n: number): void {
    const v = Math.ceil(n);
    if (v <= 0 || v === this.lastCount) return;
    this.lastCount = v;
    this.countEl.classList.remove('is-go');
    this.countText.data = String(v);
    restart(this.countEl, 'is-show');
  }

  go(): void {
    if (this.clock - this.goAt < 1.5) return;
    this.goAt = this.clock;
    this.lastCount = -1;
    this.countEl.classList.add('is-go');
    this.countText.data = this.ctx.t('hud.go');
    restart(this.countEl, 'is-show');
  }

  // ───────────────────────────────────────────────────────── per frame ──

  update(state: RiderSimState, countdown: number | null, dt: number): void {
    this.clock += dt;
    for (let i = 0; i < POP_COUNT; i++) {
      const p = this.pops[i];
      if (p.ttl > 0) {
        p.ttl -= dt;
        if (p.ttl <= 0) p.el.className = p.base + ' s' + p.slot + ' is-out';
      }
    }

    // countdown from the view (the 'run:countdown' event drives the same code path — deduplicated)
    if (countdown !== null && countdown > 0) this.count(countdown);
    else if (countdown === null && this.lastCount > 0) this.go();

    // rail stance / wallride join the live line from the state (no event carries the entry stance)
    const stance = state.rail ? state.rail.stance : null;
    if (stance !== this.lastStance) {
      this.lastStance = stance;
      if (stance) this.liveSet('rail', this.ctx.t('hud.el.' + stance));
    }
    const wall = state.wall !== null;
    if (wall !== this.onWall) {
      this.onWall = wall;
      if (wall) this.liveSet('wall', this.ctx.t('hud.el.wallride'));
    }
  }
}

/** `stale` of 'score:trick' is the staleness points factor: 1 = fresh, 0.7 / 0.5 / 0.35 / 0.2 = repeated. */
export function staleFactor(stale: number): number {
  return Number.isFinite(stale) && stale > 0 && stale < 1 ? stale : 1;
}
