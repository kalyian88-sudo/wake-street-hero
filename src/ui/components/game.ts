/** Game-flavoured building blocks: wordmark, stars, currency, level badge, stat bars, headers, rows. */
import { i18n, t } from '../../i18n/i18n';
import type { SaveData } from '../../types';
import { levelForRep, levelTitleKey } from '../career';
import { clamp, cx, fmt, h, type Child } from '../dom';
import { icon, type IconName } from '../icons';
import { iconButton } from './basic';

/**
 * WHY NOT wordmark as SVG text. `textLength` squeezes the glyphs to a fixed width, so the mark keeps its
 * condensed italic silhouette whatever bold system font the device has.
 */
export function wordmark(cls?: string): HTMLElement {
  const svg =
    '<svg viewBox="0 0 400 96" role="img" aria-label="WHY NOT" preserveAspectRatio="xMidYMid meet">' +
    '<g transform="skewX(-12)" font-weight="900" font-size="104">' +
    '<text x="34" y="86" textLength="170" lengthAdjust="spacingAndGlyphs" class="wn-wm__a">WHY</text>' +
    '<text x="216" y="86" textLength="184" lengthAdjust="spacingAndGlyphs" class="wn-wm__b">NOT</text>' +
    '</g></svg>';
  return h('div', { class: cx('wn-wm', cls), html: svg });
}

/** Row of stars; `fresh` marks indexes that should pop in (results screen). */
export function stars(earned: number, total = 5, opts: { cls?: string; flags?: boolean[]; fresh?: number[] } = {}): HTMLElement {
  const el = h('div', { class: cx('wn-stars', opts.cls), role: 'img', 'aria-label': `${earned}/${total}` });
  for (let i = 0; i < total; i++) {
    const on = opts.flags ? opts.flags[i] === true : i < earned;
    el.appendChild(h('span', { class: cx('wn-star', on && 'is-on', opts.fresh?.includes(i) && 'is-fresh'), style: `--i:${i}` }, icon('star')));
  }
  return el;
}

/** "★ 3/15" counter. */
export function starCount(earned: number, total: number, cls?: string): HTMLElement {
  return h('div', { class: cx('wn-starcount', cls) }, icon('star'), h('b', null, String(earned)), h('span', null, `/${total}`));
}

export function coinIcon(): HTMLElement {
  return h('span', { class: 'wn-coin', 'aria-hidden': 'true' }, h('i', null, 'W'));
}

export function coins(amount: number, cls?: string): HTMLElement {
  return h('div', { class: cx('wn-coins', cls) }, coinIcon(), h('b', null, fmt(amount, i18n.lang)));
}

/** Level hexagon + title + progress bar towards the next level. */
export function levelBadge(save: SaveData, compact = false): HTMLElement {
  const info = levelForRep(save.rep);
  return h(
    'div',
    { class: cx('wn-level', compact && 'wn-level--compact') },
    h('div', { class: 'wn-level__num' }, h('span', null, String(info.level))),
    h(
      'div',
      { class: 'wn-level__body' },
      h('div', { class: 'wn-level__title' }, t(levelTitleKey(info.level))),
      h('div', { class: 'wn-level__bar' }, h('i', { style: `transform:scaleX(${info.progress.toFixed(3)})` })),
      compact ? null : h('div', { class: 'wn-level__rep' }, info.max ? t('ui.level.max') : t('ui.level.rep', { cur: fmt(save.rep, i18n.lang), next: fmt(info.next, i18n.lang) })),
    ),
  );
}

/** 0..10 stat bar with an optional delta against what is equipped now. */
export function statBar(label: string, value: number, delta = 0): HTMLElement {
  const v = clamp(value, 0, 10);
  const base = clamp(value - delta, 0, 10);
  const lo = Math.min(v, base);
  const hi = Math.max(v, base);
  return h(
    'div',
    { class: cx('wn-stat', delta > 0 && 'is-up', delta < 0 && 'is-down') },
    h('span', { class: 'wn-stat__label' }, label),
    h(
      'div',
      { class: 'wn-stat__bar' },
      h('i', { class: 'wn-stat__fill', style: `width:${lo * 10}%` }),
      delta !== 0 ? h('i', { class: 'wn-stat__delta', style: `left:${lo * 10}%;width:${(hi - lo) * 10}%` }) : null,
    ),
    h('span', { class: 'wn-stat__val' }, delta !== 0 ? `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1).replace(/\.0$/, '')}` : v.toFixed(1).replace(/\.0$/, '')),
  );
}

/** Difficulty pips ●●●○○. */
export function pips(value: number, total: number, cls?: string): HTMLElement {
  const el = h('span', { class: cx('wn-pips', cls), role: 'img', 'aria-label': `${value}/${total}` });
  for (let i = 0; i < total; i++) el.appendChild(h('i', { class: i < value ? 'is-on' : undefined }));
  return el;
}

/** Screen header: back button, title (+ optional kicker line above it) and a right-hand slot. */
export function header(opts: { title: string; kicker?: string; onBack?: () => void; right?: Child; cls?: string }): HTMLElement {
  return h(
    'header',
    { class: cx('wn-head', opts.cls) },
    opts.onBack ? iconButton('back', t('ui.common.back'), opts.onBack, { sfx: 'ui.back' }) : null,
    h('div', { class: 'wn-head__titles' }, opts.kicker ? h('div', { class: 'wn-kicker' }, opts.kicker) : null, h('h1', { class: 'wn-head__title' }, opts.title)),
    opts.right ? h('div', { class: 'wn-head__right' }, opts.right) : null,
  );
}

/** Small uppercase section caption. */
export function caption(text: string, extra?: Child): HTMLElement {
  return h('div', { class: 'wn-caption' }, h('span', null, text), extra);
}

/** Pill with an icon ("LOCKED", "NEW RECORD"…). */
export function tag(text: string, ico?: IconName, cls?: string): HTMLElement {
  return h('span', { class: cx('wn-tag', cls) }, ico ? icon(ico) : null, h('span', null, text));
}

/** Label + value tile used in stat grids. */
export function metric(label: string, value: Child, ico?: IconName, cls?: string): HTMLElement {
  return h('div', { class: cx('wn-metric', cls) }, ico ? icon(ico) : null, h('div', { class: 'wn-metric__val' }, value), h('div', { class: 'wn-metric__label' }, label));
}

/** Scrollable column that keeps its scroll position across re-renders. */
export function scroller(key: string, cls: string, ...children: Child[]): HTMLElement {
  return h('div', { class: cx('wn-scroll', cls), dataset: { scroll: key } }, ...children);
}
