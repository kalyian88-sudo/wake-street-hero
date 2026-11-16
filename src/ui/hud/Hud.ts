// STUB — replaced by the HUD agent. Keep the export name/signature.
import { makeStub } from '../../dev/stub';
import type { EventBus } from '../../core/events';
import type { IHud, II18n, IInput } from '../../types';

export interface HudDeps {
  bus: EventBus;
  input: IInput;
  i18n: II18n;
}

export function createHud(_deps: HudDeps): IHud {
  return makeStub<IHud>();
}
