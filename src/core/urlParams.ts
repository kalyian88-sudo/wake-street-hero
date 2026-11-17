/**
 * URL parameters understood by the game (docs/PLAN.md §3):
 *   ?debug                      debug overlay
 *   ?quality=auto|low|medium|high   overrides the saved quality setting
 *   ?lang=ru|en                 overrides the saved language
 *   ?spot=<id>&winch=<id>&board=wakeboard|wakeskate&power=slow|medium|fast&mode=career|free|tutorial&autostart
 */
import { LANG_IDS } from '../i18n/langs';
import type { BoardKind, Lang, PowerLevel, QualitySetting, RunConfig } from '../types';

export interface UrlParams {
  debug: boolean;
  quality: QualitySetting | null;
  lang: Lang | null;
  spot: string | null;
  winch: string | null;
  board: BoardKind | null;
  power: PowerLevel | null;
  mode: RunConfig['mode'] | null;
  autostart: boolean;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function readUrlParams(search: string = typeof location !== 'undefined' ? location.search : ''): UrlParams {
  const q = new URLSearchParams(search);
  return {
    debug: q.has('debug') && q.get('debug') !== '0',
    quality: oneOf(q.get('quality'), ['auto', 'low', 'medium', 'high'] as const),
    lang: oneOf(q.get('lang'), LANG_IDS),
    spot: q.get('spot'),
    winch: q.get('winch'),
    board: oneOf(q.get('board'), ['wakeboard', 'wakeskate'] as const),
    power: oneOf(q.get('power'), ['slow', 'medium', 'fast'] as const),
    mode: oneOf(q.get('mode'), ['career', 'free', 'tutorial'] as const),
    autostart: q.has('autostart') && q.get('autostart') !== '0',
  };
}
