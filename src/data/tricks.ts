// STUB — replaced by the rules/data agent. Keep the export names/signatures.
import type { TrickDef } from '../types';

export const TRICKS: TrickDef[] = [];

export function getTrick(id: string): TrickDef | undefined {
  return TRICKS.find((t) => t.id === id);
}
