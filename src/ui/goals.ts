/** Human-readable goal descriptions generated from the spot data (GoalDef). */
import { GAME } from '../config';
import { getTrick } from '../data/tricks';
import { i18n, l, t } from '../i18n/i18n';
import type { GoalDef, ObstacleDef, SpotDef } from '../types';
import { fmt } from './dom';
import type { IconName } from './icons';

export interface GoalText {
  icon: IconName;
  title: string;
  /** Second line: how / where. */
  detail?: string;
}

export function obstacleName(o: ObstacleDef): string {
  return o.name ? l(o.name) : t(`ui.obstacle.${o.kind}`);
}

export function trickName(id: string): string {
  const def = getTrick(id);
  return def ? l(def.name) : id;
}

export function goalText(spot: SpotDef, goal: GoalDef): GoalText {
  switch (goal.type) {
    case 'score':
      return { icon: 'target', title: t('ui.goal.score', { points: fmt(goal.target, i18n.lang) }) };
    case 'trick': {
      const def = getTrick(goal.trickId);
      const board = goal.board ?? (def && def.boards.length === 1 ? def.boards[0] : null);
      const parts: string[] = [];
      if (board) parts.push(t(`ui.goal.on.${board}`));
      if (def) parts.push(l(def.input));
      return { icon: 'tricks', title: t('ui.goal.trick', { trick: trickName(goal.trickId) }), detail: parts.join(' · ') || undefined };
    }
    case 'letters':
      return { icon: 'letters', title: t('ui.goal.letters', { word: GAME.letters.join('-') }), detail: t('ui.goal.lettersHint') };
    case 'line': {
      const names = goal.obstacles.map((id) => {
        const o = spot.obstacles.find((x) => x.id === id);
        return o ? obstacleName(o) : id;
      });
      const winch = goal.winch ? spot.winchPoints.find((w) => w.id === goal.winch) : undefined;
      const detail = names.join(' → ') + (winch ? ` · ${t('ui.goal.lineWinch', { winch: l(winch.name) })}` : '');
      return { icon: 'route', title: t('ui.goal.line'), detail };
    }
    case 'clip': {
      const parts: string[] = [];
      if (goal.trickId) parts.push(t('ui.goal.clipTrick', { trick: trickName(goal.trickId) }));
      else parts.push(t('ui.goal.clipAny'));
      if (goal.minPoints) parts.push(t('ui.goal.clipPoints', { points: fmt(goal.minPoints, i18n.lang) }));
      return { icon: 'camera', title: t('ui.goal.clip'), detail: parts.join(' · ') };
    }
    default:
      return { icon: 'target', title: '' };
  }
}
