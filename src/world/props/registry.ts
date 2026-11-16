import type { PropBuilder } from '../../types';

/**
 * Prop (decor) registry. Themes register builders at import time:
 *   registerProp('phuket.shophouseRow', (def, ctx) => { ... })
 * Spots reference them from `SpotDef.props[].type`. Unknown types are skipped with a warning.
 */
const builders = new Map<string, PropBuilder>();

export function registerProp(type: string, builder: PropBuilder): void {
  builders.set(type, builder);
}

export function getPropBuilder(type: string): PropBuilder | undefined {
  return builders.get(type);
}

export function listPropTypes(): string[] {
  return [...builders.keys()].sort();
}
