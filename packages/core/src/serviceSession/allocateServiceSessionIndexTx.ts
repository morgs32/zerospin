import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { ITx } from '../drizzle/types.ts';

import { serviceSessionRepoDbConfig } from './serviceSessionRepoTables.ts';

/** Allocate from durable Session progress inside the same transaction as insertion. */
export const allocateServiceSessionIndexTx = Effect.fn(
  'allocateServiceSessionIndexTx',
)(function* (tx: ITx) {
  const metadata = serviceSessionRepoDbConfig.schema.serviceSessionMetadata;
  const rows = tx.select().from(metadata).all();
  if (rows.length !== 1) {
    return yield* makeZerospinError('session-metadata-missing');
  }
  const sessionIndex = rows[0]!.lastSessionIndex + 1;
  if (
    !Number.isSafeInteger(sessionIndex) ||
    sessionIndex < 1 ||
    sessionIndex >= Number.MAX_SAFE_INTEGER
  ) {
    return yield* makeZerospinError({
      code: 'session-index-invalid',
      message: 'The next retained session index is invalid',
      extra: { sessionIndex: String(sessionIndex) },
    });
  }
  tx.update(metadata).set({ lastSessionIndex: sessionIndex }).run();
  return sessionIndex;
});
