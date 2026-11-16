/**
 * TEMPORARY scaffolding helper. Returns an object that satisfies interface T: properties given in
 * `impl` are used, every other property access yields a no-op function. Lets the app boot while a
 * module is still being written. Real modules must NOT use this.
 */
export function makeStub<T extends object>(impl: Partial<T> = {}): T {
  const noop = (): undefined => undefined;
  return new Proxy(impl as T, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      return noop;
    },
  });
}
