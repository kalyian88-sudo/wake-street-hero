/**
 * Persistent player data: localStorage under SAVE_KEY, schema-versioned (see migrations.ts).
 * Every storage access is guarded — when storage is missing / blocked / full the store keeps
 * working in memory and reports `persistent === false`.
 */
import { SAVE_KEY, SAVE_VERSION } from '../config';
import type { EventBus } from '../core/events';
import type { ISaveStore, SaveData } from '../types';
import { defaultSave, migrate, readVersion } from './migrations';

/** The subset of the Web Storage API the store needs (injectable for tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveStoreOptions {
  /** Storage backend. Default: `globalThis.localStorage` (if reachable). Pass null to force memory-only. */
  storage?: StorageLike | null;
  /** Delay between update() and the write. Default 300 ms. */
  debounceMs?: number;
  /** Storage key. Default SAVE_KEY. */
  key?: string;
}

function resolveStorage(opts: SaveStoreOptions): StorageLike | null {
  if (opts.storage !== undefined) return opts.storage;
  try {
    // Accessing the property itself can throw (Safari private mode, sandboxed iframes, disabled cookies).
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export function createSaveStore(bus: EventBus, opts: SaveStoreOptions = {}): ISaveStore {
  const key = opts.key ?? SAVE_KEY;
  const debounceMs = opts.debounceMs ?? 300;
  const storage = resolveStorage(opts);
  let persistent = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  // Probe: some browsers expose localStorage but throw on every write.
  if (storage) {
    try {
      const probe = `${key}.probe`;
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      persistent = true;
    } catch {
      persistent = false;
    }
  }

  /** Keep a copy of a blob we are about to overwrite but could not fully understand. */
  function backup(text: string): void {
    if (!storage) return;
    try {
      storage.setItem(`${key}.backup`, text);
    } catch {
      /* no room for a backup — nothing else we can do */
    }
  }

  function load(): SaveData {
    if (!storage) return defaultSave();
    let text: string | null = null;
    try {
      text = storage.getItem(key);
    } catch {
      persistent = false;
      return defaultSave();
    }
    if (text === null || text === '') return defaultSave();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      backup(text);
      dirty = true;
      return defaultSave();
    }
    const version = readVersion(raw);
    if (version === null || version > SAVE_VERSION) backup(text);
    if (version !== SAVE_VERSION) dirty = true;
    return migrate(raw);
  }

  function write(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    dirty = false;
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(data));
      persistent = true;
    } catch {
      // Quota exceeded / storage revoked mid-session: keep playing from memory.
      persistent = false;
    }
  }

  function schedule(): void {
    dirty = true;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(write, debounceMs);
  }

  const data = load();
  // A migrated / repaired save is written back right away so the upgrade happens only once.
  if (dirty) write();

  const store: ISaveStore = {
    get data() {
      return data;
    },
    update(mutator) {
      try {
        mutator(data);
      } finally {
        schedule();
        bus.emit('save:changed', {});
      }
    },
    flush() {
      if (dirty || timer !== null) write();
    },
    reset() {
      // Mutate in place: other modules may hold a reference to `data`.
      const fresh = defaultSave();
      const target = data as unknown as Record<string, unknown>;
      for (const k of Object.keys(target)) delete target[k];
      Object.assign(target, fresh);
      write();
      bus.emit('save:changed', {});
    },
    get persistent() {
      return persistent;
    },
  };

  // Last-chance write when the tab goes away (mobile browsers kill background tabs without unload).
  try {
    type Listenable = { addEventListener?: (type: string, fn: () => void) => void };
    const g = globalThis as Listenable & { document?: Listenable & { visibilityState?: string } };
    if (typeof g.addEventListener === 'function') g.addEventListener('pagehide', () => store.flush());
    const doc = g.document;
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'hidden') store.flush();
      });
    }
  } catch {
    /* headless environment */
  }

  return store;
}
