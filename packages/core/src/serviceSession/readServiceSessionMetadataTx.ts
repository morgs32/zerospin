import { makeZerospinError, type IAnyError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { ITx } from '../drizzle/types.ts';

import { serviceSessionRepoDbConfig } from './serviceSessionRepoTables.ts';

type IServiceSessionMetadata =
  typeof serviceSessionRepoDbConfig.schema.serviceSessionMetadata.$inferSelect;

/** Require the session's sole checkpoint; initialization alone may begin without it. */
export function readServiceSessionMetadataTx(
  tx: ITx,
): Effect.Effect<IServiceSessionMetadata, IAnyError>;
export function readServiceSessionMetadataTx(
  tx: ITx,
  options: { allowMissing: true },
): Effect.Effect<IServiceSessionMetadata | undefined, IAnyError>;
export function readServiceSessionMetadataTx(
  tx: ITx,
  options?: { allowMissing: true },
): Effect.Effect<IServiceSessionMetadata | undefined, IAnyError> {
  return Effect.gen(function* () {
    const rows = tx
      .select()
      .from(serviceSessionRepoDbConfig.schema.serviceSessionMetadata)
      .limit(2)
      .all();
    if (rows.length > 1) {
      return yield* makeZerospinError('session-metadata-ambiguous');
    }
    const metadata = rows[0];
    if (metadata === undefined && options?.allowMissing !== true) {
      return yield* makeZerospinError('session-metadata-missing');
    }
    return metadata;
  });
}
