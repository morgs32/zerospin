import * as Context from 'effect/Context';

/** Base URL for Zerospin HTTP RPC (no trailing slash required by callers). */
export class ZerospinApiUrl extends Context.Service<ZerospinApiUrl, string>()(
  'ZerospinApiUrl',
) {}
