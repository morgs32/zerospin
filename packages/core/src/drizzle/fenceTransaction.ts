const queryMethods = [
  'getSQL',
  'prepare',
  'prepareQuery',
  'findFirst',
  'findMany',
  'run',
  'get',
  'all',
  'sync',
  'execute',
  'exec',
  'step',
  'values',
  'set',
  'from',
  'where',
  'returning',
  'as',
];

/** Restrict transaction-owned query builders to the native SQL callback's lifetime. */
export function fenceTransaction<TX extends object>(transaction: TX) {
  let open = true;
  const proxies = new WeakMap<object, object>();
  const wrap = (value: unknown, queryRecord = false): unknown => {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      value instanceof Date
    ) {
      return value;
    }
    if (
      !queryRecord &&
      !queryMethods.some(name => typeof Reflect.get(value, name) === 'function')
    ) {
      return value;
    }
    const retained = proxies.get(value);
    if (retained !== undefined) return retained;
    const proxy = new Proxy(value, handler);
    proxies.set(value, proxy);
    return proxy;
  };
  const handler: ProxyHandler<object> = {
    get(source, key) {
      const member: unknown = Reflect.get(source, key, source);
      if (typeof member !== 'function') return wrap(member, key === 'query');
      return (...args: unknown[]) => {
        if (!open) throw new Error('transaction-handle-closed');
        if (key === 'transaction' && typeof args[0] === 'function') {
          const callback = args[0];
          args[0] = (nested: unknown) =>
            Reflect.apply(callback, undefined, [wrap(nested)]);
        }
        return wrap(Reflect.apply(member, source, args));
      };
    },
  };
  const tx = new Proxy<TX>(transaction, handler);
  proxies.set(transaction, tx);
  return {
    tx,
    close() {
      open = false;
    },
  };
}
