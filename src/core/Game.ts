// STUB — replaced by the core agent. Keep the export name/signature.
import { makeStub } from '../dev/stub';
import type { IGame } from '../types';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  /** Layer for the in-run HUD. */
  hudRoot: HTMLElement;
}

export function createGame(_opts: GameOptions): IGame {
  return makeStub<IGame>({ state: 'boot', debug: false, lastResult: null });
}
