// STUB — replaced by the shell agent. Keep the export names/signatures.
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS, SAVE_VERSION, STARTER_GEAR } from '../config';
import type { SaveData } from '../types';

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    appearance: { ...DEFAULT_APPEARANCE },
    coins: 0,
    rep: 0,
    ownedGear: Object.values(STARTER_GEAR),
    equipped: { ...STARTER_GEAR },
    spots: {},
    career: { dialogsSeen: [], sponsors: {}, tutorialDone: false },
    stats: { totalRuns: 0, totalScore: 0, totalFalls: 0, bestCombo: 0, tricksLanded: {} },
    last: { board: 'wakeboard', power: 'medium', cityId: null, spotId: null },
  };
}

/** Upgrade any previously stored JSON (or garbage) to the current SaveData. Never throws. */
export function migrate(_raw: unknown): SaveData {
  return defaultSave();
}
