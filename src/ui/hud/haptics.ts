/** Haptic feedback: bus events → short vibration patterns (input.vibrate is a no-op when unsupported / disabled). */
import type { EventBus } from '../../core/events';
import type { IInput } from '../../types';

export const HAPTIC = {
  pop: 12,
  landPerfect: [10, 30, 12],
  landClean: 16,
  landSketchy: [26, 36, 26],
  bail: [70, 40, 120],
  letter: [8, 26, 8],
  railLock: 20,
  heroStart: [30, 40, 30, 40, 90],
  catch: 10,
  catchMiss: [40, 30, 40],
  bank: 14,
  count: 8,
  go: 28,
} as const satisfies Record<string, number | readonly number[]>;

/** @returns unsubscribe function. `active()` gates everything (HUD hidden → silent). */
export function bindHaptics(bus: EventBus, input: IInput, active: () => boolean): () => void {
  const buzz = (p: number | readonly number[]): void => {
    if (active()) input.vibrate(p as number | number[]);
  };
  const offs = [
    bus.on('sim:pop', () => buzz(HAPTIC.pop)),
    bus.on('sim:land', (e) => buzz(e.quality === 'perfect' ? HAPTIC.landPerfect : e.quality === 'sketchy' ? HAPTIC.landSketchy : HAPTIC.landClean)),
    bus.on('sim:bail', () => buzz(HAPTIC.bail)),
    bus.on('letter:collect', () => buzz(HAPTIC.letter)),
    bus.on('sim:railEnter', () => buzz(HAPTIC.railLock)),
    bus.on('hero:start', () => buzz(HAPTIC.heroStart)),
    bus.on('trick:catch', (e) => buzz(e.ok ? HAPTIC.catch : HAPTIC.catchMiss)),
    bus.on('score:bank', () => buzz(HAPTIC.bank)),
    bus.on('run:countdown', () => buzz(HAPTIC.count)),
    bus.on('run:go', () => buzz(HAPTIC.go)),
  ];
  return () => {
    for (const off of offs) off();
  };
}
