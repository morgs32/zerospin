import * as Context from 'effect/Context';
import type { Redacted } from 'effect/Redacted';

/** Administrative RPC credentials remain redacted until capability selection. */
export class SecretKey extends Context.Service<SecretKey, Redacted<string>>()(
  'SecretKey',
) {}
