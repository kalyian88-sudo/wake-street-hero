/**
 * Score keeper — combo pot, multiplier, staleness, HERO meter. Headless; talks to the rest through the bus.
 * (resolveTrick lives in ./resolve and is re-exported here.)
 *
 * RULES (docs/PLAN.md §4.3, numbers in SCORE_RULES):
 *  - Every landed trick adds `points × staleness × landing × HERO` to the POT and restarts the combo window
 *    (GAME.comboWindow seconds of SIM time; the window does not run while `hold` is true — airborne / rail / wall).
 *  - MULTIPLIER = number of ELEMENTS in the combo, capped at ×12. A trick grows it by `trick.elements`
 *    (spin, invert, flip, each grab, rail stance, gap… max 4 per trick): "BS 360 Indy" is +2, "Mobe Indy" is +3.
 *    A trick that has gone stale to ×0.5 or worse still scores and keeps the combo alive but adds no elements.
 *    Fillers (`elements: 0` — plain air / ollie) only add their points: no multiplier, no window restart.
 *  - Window runs out → pot × multiplier is BANKED into the total. A bail burns the pot.
 *  - STALENESS: the same trick again scores ×0.7, ×0.5, ×0.35, then ×0.2. "Same trick" = the same set of
 *    elements (trickKey), so "360 Indy" and "360 Melon" are different tricks while a switch / gap / higher /
 *    longer version of one is not. Every other trick landed restores one step.
 *  - LANDING: perfect ×1.2, clean ×1, sketchy ×0.5.
 *  - HERO: clean / perfect landings fill the meter (more for higher tiers, ×1.5 for a trick not done yet in this
 *    run, less when stale, nothing for sketchy); a bail drains it. Full → 'hero:ready'; activateHero() gives
 *    GAME.heroDuration REAL seconds of ×2 points (timer runs on `realDt`), then the meter starts from zero.
 */
import { GAME } from '../config';
import type { EventBus } from '../core/events';
import { TRICK_WORDS, getTrick } from '../data/tricks';
import type { IScoreKeeper, L10n, LandingQuality, ResolvedTrick, ScoreState } from '../types';

export { resolveTrick } from './resolve';

export const SCORE_RULES = {
  multCap: 12,
  /** Points factor by how many times in a row (minus recoveries) the same trick was landed. */
  stale: [1, 0.7, 0.5, 0.35, 0.2],
  /** At or below this staleness factor a trick no longer grows the multiplier. */
  staleNoGrowth: 0.5,
  landing: { perfect: 1.2, clean: 1, sketchy: 0.5, bail: 0 } satisfies Record<LandingQuality, number>,
  heroPoints: 2,
  heroFillBase: 0.05,
  heroFillPerTier: 0.03,
  heroNewTrick: 1.5,
  heroPerfect: 1.3,
  heroBailDrain: 0.2,
  /** Flat bonus for a W-H-Y-N-O-T letter, and the extra for the sixth one (see letterBonus). */
  letterPoints: 100,
  lettersAllPoints: 500,
};

function freshState(): ScoreState {
  return {
    total: 0,
    comboPoints: 0,
    comboMult: 1,
    comboTimeLeft: 0,
    comboActive: false,
    comboCount: 0,
    bestCombo: 0,
    bestTrick: null,
    tricksLanded: 0,
    falls: 0,
    hero: { meter: 0, ready: false, active: false, timeLeft: 0 },
    trickCounts: {},
  };
}

/**
 * Staleness / variety key: what the trick is MADE of — the table rows among its parts that are not bonuses
 * (so "Mobe Indy" = indy|mobe; distance, height, switch, gap… do not make it a different trick).
 */
export function trickKey(trick: ResolvedTrick): string {
  const core: string[] = [];
  for (const part of trick.parts) {
    const def = getTrick(part.id);
    if (def && def.category !== 'bonus' && !core.includes(part.id)) core.push(part.id);
  }
  return core.length ? core.sort().join('|') : trick.id;
}

/**
 * Arguments for `score.addBonus(...)` when a letter is picked up: the score keeper cannot listen for
 * 'letter:collect' itself (it has no dispose), so whoever owns the run wires it:
 *   bus.on('letter:collect', (e) => { const b = letterBonus(e.index, e.count); sim.score.addBonus(b.id, b.name, b.points); });
 */
export function letterBonus(index: number, count: number): { id: string; name: L10n; points: number } {
  const letter = GAME.letters[index] ?? '';
  const all = count >= GAME.letters.length;
  return {
    id: 'letter',
    name: all ? TRICK_WORDS.lettersAll : { ru: `${TRICK_WORDS.letter.ru} ${letter}`, en: `${TRICK_WORDS.letter.en} ${letter}` },
    points: SCORE_RULES.letterPoints + (all ? SCORE_RULES.lettersAllPoints : 0),
  };
}

export function createScoreKeeper(bus: EventBus): IScoreKeeper {
  const state = freshState();
  const hero = state.hero;
  /** key → staleness level (index into SCORE_RULES.stale). */
  const staleLevel = new Map<string, number>();
  const usedKeys = new Set<string>();
  const R = SCORE_RULES;

  function openCombo(): void {
    if (state.comboActive) return;
    state.comboActive = true;
    state.comboCount = 0;
    state.comboMult = 1;
    state.comboPoints = 0;
    state.comboTimeLeft = GAME.comboWindow;
  }

  function closeCombo(): void {
    state.comboActive = false;
    state.comboPoints = 0;
    state.comboMult = 1;
    state.comboCount = 0;
    state.comboTimeLeft = 0;
  }

  function bank(): void {
    if (!state.comboActive) return;
    const points = state.comboPoints;
    const mult = state.comboMult;
    const count = state.comboCount;
    const banked = Math.round(points * mult);
    state.total += banked;
    if (banked > state.bestCombo) state.bestCombo = banked;
    closeCombo();
    bus.emit('score:bank', { points, mult, banked, total: state.total, count });
  }

  function endHero(): void {
    hero.active = false;
    hero.timeLeft = 0;
    hero.meter = 0;
    hero.ready = false;
    bus.emit('hero:end', {});
  }

  function feedHero(trick: ResolvedTrick, landing: LandingQuality, stale: number, isNew: boolean): void {
    if (hero.active || landing === 'sketchy' || hero.meter >= 1) return;
    let fill = R.heroFillBase + R.heroFillPerTier * Math.min(5, Math.max(1, trick.tier));
    fill *= stale;
    if (isNew) fill *= R.heroNewTrick;
    if (landing === 'perfect') fill *= R.heroPerfect;
    hero.meter = Math.min(1, hero.meter + fill);
    if (hero.meter >= 1 && !hero.ready) {
      hero.ready = true;
      bus.emit('hero:ready', {});
    }
  }

  return {
    state,

    reset(): void {
      const hadHero = hero.active;
      Object.assign(state, freshState(), { hero });
      hero.meter = 0;
      hero.ready = false;
      hero.active = false;
      hero.timeLeft = 0;
      staleLevel.clear();
      usedKeys.clear();
      if (hadHero) bus.emit('hero:end', {});
    },

    addTrick(trick: ResolvedTrick, landing: LandingQuality, time: number): number {
      if (landing === 'bail') return 0;
      const elements = Math.max(0, Math.floor(trick.elements ?? 1));
      const filler = elements === 0;
      const heroFactor = hero.active ? R.heroPoints : 1;

      let stale = 1;
      let isNew = false;
      if (!filler) {
        const key = trickKey(trick);
        const level = staleLevel.get(key) ?? 0;
        stale = R.stale[Math.min(level, R.stale.length - 1)] ?? 1;
        for (const [k, v] of staleLevel) {
          if (k === key) continue;
          if (v <= 1) staleLevel.delete(k);
          else staleLevel.set(k, v - 1);
        }
        staleLevel.set(key, Math.min(level + 1, R.stale.length - 1));
        isNew = !usedKeys.has(key);
        usedKeys.add(key);
      }

      const awarded = Math.round(trick.points * stale * R.landing[landing] * heroFactor);
      openCombo();
      state.comboPoints += awarded;
      if (!filler) {
        if (stale > R.staleNoGrowth) state.comboCount += elements;
        state.comboMult = Math.min(R.multCap, Math.max(1, state.comboCount));
        state.comboTimeLeft = GAME.comboWindow;
        state.tricksLanded++;
        const counts = (state.trickCounts ??= {});
        for (const id of trick.ids) counts[id] = (counts[id] ?? 0) + 1;
        if (!state.bestTrick || awarded > state.bestTrick.points) state.bestTrick = { name: trick.name, points: awarded, time };
        feedHero(trick, landing, stale, isNew);
      }
      bus.emit('score:trick', { trick, awarded, landing, stale, comboPoints: state.comboPoints, comboMult: state.comboMult, time });
      return awarded;
    },

    addBonus(id: string, name: L10n, points: number): void {
      const awarded = Math.round(points * (hero.active ? R.heroPoints : 1));
      openCombo();
      state.comboPoints += awarded;
      bus.emit('score:bonus', { id, name, points: awarded });
    },

    update(dt: number, hold: boolean, realDt: number = dt): void {
      if (state.comboActive && !hold) {
        state.comboTimeLeft -= dt;
        if (state.comboTimeLeft <= 0) bank();
      }
      if (hero.active) {
        hero.timeLeft -= realDt;
        if (hero.timeLeft <= 0) endHero();
        else hero.meter = hero.timeLeft / GAME.heroDuration;
      }
    },

    bail(): void {
      state.falls++;
      if (!hero.active) {
        hero.meter = Math.max(0, hero.meter - R.heroBailDrain);
        hero.ready = hero.meter >= 1;
      }
      if (!state.comboActive) return;
      const points = state.comboPoints;
      const mult = state.comboMult;
      closeCombo();
      bus.emit('score:lost', { points, mult });
    },

    activateHero(): boolean {
      if (!hero.ready || hero.active) return false;
      hero.active = true;
      hero.ready = false;
      hero.meter = 1;
      hero.timeLeft = GAME.heroDuration;
      bus.emit('hero:start', { duration: GAME.heroDuration });
      return true;
    },

    finish(): void {
      bank();
    },
  };
}
