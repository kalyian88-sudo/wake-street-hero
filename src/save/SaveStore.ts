// STUB — replaced by the shell agent. Keep the export name/signature.
import type { EventBus } from '../core/events';
import type { ISaveStore } from '../types';
import { defaultSave } from './migrations';

export function createSaveStore(bus: EventBus): ISaveStore {
  let data = defaultSave();
  return {
    get data() {
      return data;
    },
    update(m) {
      m(data);
      bus.emit('save:changed', {});
    },
    flush: () => undefined,
    reset() {
      data = defaultSave();
    },
    persistent: false,
  };
}
