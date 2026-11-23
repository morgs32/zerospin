import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  ZerospinErrorJsonSchema,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  NodeFailureSchema,
  NodeStorageUpgradeFailureSchema,
} from './NodeErrors.ts';

/** Only existing public error fields cross a worker RPC boundary. */
export function publicRpcError(error: Error): Error {
  if (!isZerospinError(error)) {
    const defect = new Error('Worker RPC failed');
    delete defect.stack;
    return defect;
  }
  const publicFields = Effect.runSync(encodeError(error));
  const retained = Object.assign(new Error(publicFields.message), publicFields);
  delete retained.stack;
  return retained;
}
export function restoreRpcError(error: unknown): never {
  const known = Schema.decodeUnknownOption(NodeFailureSchema, {
    onExcessProperty: 'error',
  })(error);
  if (known._tag === 'Some') throw known.value;
  const upgrade = Schema.decodeUnknownOption(NodeStorageUpgradeFailureSchema, {
    onExcessProperty: 'error',
  })(error);
  if (upgrade._tag === 'Some') throw makeZerospinError(upgrade.value);
  const decoded = Schema.decodeUnknownOption(ZerospinErrorJsonSchema, {
    onExcessProperty: 'error',
  })(error);
  if (decoded._tag === 'Some') {
    throw makeZerospinError(decoded.value);
  }
  throw error;
}
