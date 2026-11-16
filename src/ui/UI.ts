// STUB — replaced by the shell agent. Keep the export name/signature.
import type { IGame, IUI, ScreenId } from '../types';

export function createUI(_game: IGame): IUI {
  let current: ScreenId = 'none';
  return {
    start: () => undefined,
    show(s) {
      current = s;
    },
    get current() {
      return current;
    },
  };
}
