import { mapValues } from 'es-toolkit';

/* Native platform bindings. JavaScript owns session semantics; Swift owns devices and IO. */
(() => {
  const call = request => {
    const reply = JSON.parse(
      globalThis.__zerospinHost(JSON.stringify(request)),
    );
    if (reply.error !== undefined) throw new Error(reply.error);
    return reply.value;
  };
  let sequence = 0;
  const pending = new Map();
  const sockets = new Map();
  const timers = new Map();
  globalThis.__zerospinComplete = (id, success, json) => {
    const continuation = pending.get(id);
    if (!continuation) return;
    pending.delete(id);
    const value = JSON.parse(json);
    if (success) continuation.resolve(value);
    else continuation.reject(new TypeError(value.message));
  };
  globalThis.__zerospinTimer = id => {
    const timer = timers.get(id);
    if (!timer) return;
    if (!timer.repeat) timers.delete(id);
    timer.callback();
  };
  globalThis.__zerospinSocket = (id, type, value) =>
    sockets.get(id)?.dispatchEvent({ type, ...value });
  globalThis.console = Object.fromEntries(
    ['log', 'info', 'warn', 'error', 'debug'].map(level => [
      level,
      (...values) =>
        call({ kind: 'log', level, message: values.map(String).join(' ') }),
    ]),
  );
  globalThis.performance = { now: () => call({ kind: 'clock' }) };
  const makeTimer = (callback, delay, repeat, args) => {
    const id = ++sequence;
    timers.set(id, { callback: () => callback(...args), repeat });
    call({ kind: 'timer', id, delay: Number(delay ?? 0), repeat });
    return id;
  };
  globalThis.setTimeout = (callback, delay, ...args) =>
    makeTimer(callback, delay, false, args);
  globalThis.setInterval = (callback, delay, ...args) =>
    makeTimer(callback, delay, true, args);
  globalThis.clearTimeout = globalThis.clearInterval = id => {
    timers.delete(id);
    call({ kind: 'cancelTimer', id });
  };
  globalThis.queueMicrotask = callback => Promise.resolve().then(callback);
  // Session, Node and transport owners require this Promise capability on every supported host.
  Promise.withResolvers = function () {
    let resolve;
    let reject;
    const promise = new this((completed, failed) => {
      resolve = completed;
      reject = failed;
    });
    return { promise, resolve, reject };
  };
  globalThis.TextEncoder = class {
    encoding = 'utf-8';

    encode(value = '') {
      return new Uint8Array(call({ kind: 'encode', value: String(value) }));
    }

    encodeInto(value, destination) {
      const bytes = this.encode(value);
      let length = Math.min(bytes.length, destination.length);
      while (
        length < bytes.length &&
        length > 0 &&
        (bytes[length] & 192) === 128
      ) {
        length--;
      }
      destination.set(bytes.subarray(0, length));
      return {
        read: new TextDecoder().decode(bytes.subarray(0, length)).length,
        written: length,
      };
    }
  };
  globalThis.TextDecoder = class {
    constructor(encoding = 'utf-8', options = {}) {
      if (
        !['utf-8', 'utf8'].includes(encoding.toLowerCase()) ||
        options.fatal ||
        options.ignoreBOM
      ) {
        throw new Error('Only default UTF-8 decoding is supported');
      }
      this.encoding = 'utf-8';
    }

    decode(value = new Uint8Array(), options = {}) {
      if (options.stream) {
        throw new Error('Streaming UTF-8 decoding is not supported');
      }
      return call({
        kind: 'decode',
        bytes: Array.from(
          value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
        ),
      });
    }
  };
  globalThis.crypto = {
    randomUUID: () => call({ kind: 'uuid' }),
    getRandomValues: array => {
      if (
        !ArrayBuffer.isView(array) ||
        array instanceof DataView ||
        array instanceof Float32Array ||
        array instanceof Float64Array
      ) {
        throw new TypeError('Expected an integer typed array');
      }
      if (array.byteLength > 65536) {
        throw new Error('Random byte quota exceeded');
      }
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(
        call({ kind: 'random', length: array.byteLength }),
      );
      return array;
    },
    subtle: {
      digest: (algorithm, bytes) => {
        if (
          (typeof algorithm === 'string'
            ? algorithm
            : algorithm.name
          ).toUpperCase() !== 'SHA-256'
        ) {
          return Promise.reject(new Error('Only SHA-256 is supported'));
        }
        return Promise.resolve(
          new Uint8Array(
            call({
              kind: 'digest',
              bytes: Array.from(
                bytes instanceof ArrayBuffer
                  ? new Uint8Array(bytes)
                  : new Uint8Array(
                      bytes.buffer,
                      bytes.byteOffset,
                      bytes.byteLength,
                    ),
              ),
            }),
          ).buffer,
        );
      },
    },
  };
  globalThis.structuredClone = value => {
    const seen = new Map();
    const clone = item => {
      if (item === null || typeof item !== 'object') {
        if (typeof item === 'function' || typeof item === 'symbol') {
          throw new TypeError('Value cannot be cloned');
        }
        return item;
      }
      if (seen.has(item)) return seen.get(item);
      if (item instanceof Date) return new Date(item.getTime());
      if (item instanceof ArrayBuffer) return item.slice(0);
      if (ArrayBuffer.isView(item)) {
        return item instanceof DataView
          ? new DataView(
              item.buffer.slice(
                item.byteOffset,
                item.byteOffset + item.byteLength,
              ),
            )
          : new item.constructor(item);
      }
      const result = Array.isArray(item)
        ? []
        : item instanceof Map
          ? new Map()
          : item instanceof Set
            ? new Set()
            : {};
      seen.set(item, result);
      if (item instanceof Map) {
        for (const [key, value] of item) result.set(clone(key), clone(value));
      } else if (item instanceof Set) {
        for (const value of item) result.add(clone(value));
      } else {
        mapValues(item, (value, key) => {
          result[key] = clone(value);
        });
      }
      return result;
    };
    return clone(value);
  };
  globalThis.EventTarget = class {
    listeners = new Map();

    addEventListener(type, callback, options = {}) {
      const values = this.listeners.get(type) ?? [];
      if (!values.some(value => value.callback === callback)) {
        values.push({ callback, once: options.once === true });
      }
      this.listeners.set(type, values);
    }

    removeEventListener(type, callback) {
      this.listeners.set(
        type,
        (this.listeners.get(type) ?? []).filter(
          value => value.callback !== callback,
        ),
      );
    }

    dispatchEvent(event) {
      for (const value of [...(this.listeners.get(event.type) ?? [])]) {
        if (value.once) this.removeEventListener(event.type, value.callback);
        value.callback.call(this, event);
      }
      this['on' + event.type]?.(event);
      return true;
    }
  };
  globalThis.AbortSignal = class extends EventTarget {
    aborted = false;
    reason = undefined;

    throwIfAborted() {
      if (this.aborted) throw this.reason;
    }
  };
  globalThis.AbortController = class {
    signal = new AbortSignal();

    abort(reason = new Error('Operation aborted')) {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      this.signal.reason = reason;
      this.signal.dispatchEvent({ type: 'abort' });
    }
  };
  globalThis.Headers = class {
    values = new Map();

    constructor(input = {}) {
      if (input instanceof Headers || Array.isArray(input)) {
        const pairs = input instanceof Headers ? input.entries() : input;
        for (const [key, value] of pairs) this.append(key, value);
      } else {
        mapValues(input, (value, key) => this.append(key, value));
      }
    }

    set(key, value) {
      this.values.set(String(key).toLowerCase(), String(value));
    }

    append(key, value) {
      const name = String(key).toLowerCase();
      this.set(name, this.has(name) ? this.get(name) + ', ' + value : value);
    }

    get(key) {
      return this.values.get(String(key).toLowerCase()) ?? null;
    }

    has(key) {
      return this.values.has(String(key).toLowerCase());
    }

    entries() {
      return this.values.entries();
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  };
  globalThis.Response = class {
    constructor(body = '', options = {}) {
      this.bodyText = body;
      this.status = options.status ?? 200;
      this.statusText = options.statusText ?? '';
      this.headers = new Headers(options.headers);
      this.ok = this.status >= 200 && this.status < 300;
      this.bodyUsed = false;
    }

    async text() {
      if (this.bodyUsed) throw new TypeError('Body already read');
      this.bodyUsed = true;
      return this.bodyText;
    }

    async json() {
      return JSON.parse(await this.text());
    }

    async arrayBuffer() {
      return new TextEncoder().encode(await this.text()).buffer;
    }
  };
  globalThis.fetch = async (url, options = {}) => {
    if (options.signal?.aborted) throw options.signal.reason;
    const id = ++sequence;
    let abort;
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      abort = () => {
        call({ kind: 'cancelFetch', id });
        pending.delete(id);
        reject(options.signal.reason);
      };
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        call({
          kind: 'fetch',
          id,
          url: String(url),
          method: options.method ?? 'GET',
          headers: Object.fromEntries(new Headers(options.headers)),
          body: options.body ?? null,
        });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
    try {
      const reply = await promise;
      return new Response(reply.body, {
        status: reply.status,
        headers: reply.headers,
      });
    } finally {
      options.signal?.removeEventListener('abort', abort);
    }
  };
  globalThis.URL = class {
    constructor(value, base) {
      this.parts = call({
        kind: 'url',
        value: String(value),
        base: base == null ? null : String(base),
      });
      this.searchParams = new URLSearchParams(this.parts.search);
    }

    get protocol() {
      return this.parts.protocol;
    }

    set protocol(value) {
      this.parts.protocol = value;
    }

    get pathname() {
      return this.parts.pathname;
    }

    set pathname(value) {
      this.parts.pathname = value;
    }

    get search() {
      const value = this.searchParams.toString();
      return value ? '?' + value : '';
    }

    set search(value) {
      this.searchParams = new URLSearchParams(value);
    }

    get origin() {
      return this.parts.protocol + '//' + this.parts.host;
    }

    get href() {
      return this.origin + this.pathname + this.search + this.parts.hash;
    }

    toString() {
      return this.href;
    }
  };
  globalThis.URLSearchParams = class {
    constructor(value = '') {
      this.values = call({
        kind: 'query',
        value: String(value).replace(/^\?/, ''),
      });
    }

    set(key, value) {
      this.values = this.values.filter(pair => pair[0] !== key);
      this.values.push([String(key), String(value)]);
    }

    get(key) {
      return this.values.find(pair => pair[0] === key)?.[1] ?? null;
    }

    toString() {
      return call({ kind: 'encodeQuery', values: this.values });
    }
  };
  globalThis.WebSocket = class extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 0;

    constructor(url) {
      super();
      this.id = ++sequence;
      sockets.set(this.id, this);
      this.addEventListener('open', () => (this.readyState = 1));
      this.addEventListener('close', () => {
        this.readyState = 3;
        sockets.delete(this.id);
      });
      call({ kind: 'socket', id: this.id, url: String(url) });
    }

    send(data) {
      if (this.readyState !== 1) throw new Error('WebSocket is not open');
      call({ kind: 'socketSend', id: this.id, data: String(data) });
    }

    close(code = 1000, reason = '') {
      if (this.readyState >= 2) return;
      this.readyState = 2;
      call({ kind: 'socketClose', id: this.id, code, reason });
    }
  };
  globalThis.__zerospinSQLite = request => call({ kind: 'sqlite', ...request });
})();
