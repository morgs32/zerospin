import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { and, asc, gt, lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { getServiceVersionChain } from '../ownerOperations/releaseRepoNamespaces.js';

import { serviceHistoryInput } from './readServiceCommand.js';
import { readServiceCommandOccurrence } from './readServiceCommandOccurrence.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';
import type { IServiceCommandOccurrence } from './types.js';

/** Read one fixed finalized prefix through adopted history or the local suffix without executing originals. */
export const readReplayCommandsPage = Effect.fn(
  'ServiceChain.readReplayCommandsPage',
)(function* (
  db: IDb<typeof serviceChainDbConfig>,
  key: { systemId: string; serviceName: string },
  page: { afterIndex: number; maxIndex?: number },
) {
  const { commands, canonicalHistory, finalizedPosition } =
    serviceChainDbConfig.schema;
  const lastIndex = db.select().from(finalizedPosition).get()?.lastIndex ?? 0;
  const adopted = db.select().from(canonicalHistory).get();
  const maxIndex = Math.min(lastIndex, page.maxIndex ?? lastIndex);
  if (page.afterIndex >= maxIndex) return { lastIndex, rows: [] };
  if (adopted !== undefined && page.afterIndex < adopted.serviceIndex) {
    const history = yield* getServiceVersionChain({
      key: { ...key, serviceVersion: adopted.serviceVersion },
    });
    const delivery = yield* Effect.promise(() =>
      history.getEvaluatedCommandPage({
        afterIndex: page.afterIndex,
        maxIndex: Math.min(maxIndex, adopted.serviceIndex),
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    if (delivery.rows[0]?.serviceIndex !== page.afterIndex + 1) {
      return yield* makeZerospinError('service-canonical-history-missing');
    }
    return {
      lastIndex,
      rows: delivery.rows.map(row => ({
        row: serviceHistoryInput(row),
        index: row.serviceIndex,
      })),
    };
  }
  const rows: { row: IServiceCommandOccurrence; index: number }[] = [];
  let afterIndex = page.afterIndex;
  let bytes = 0;
  while (rows.length < 64 && afterIndex < maxIndex) {
    const stored = db
      .select()
      .from(commands)
      .where(
        and(
          gt(commands.serviceIndex, afterIndex),
          lte(commands.serviceIndex, maxIndex),
        ),
      )
      .orderBy(asc(commands.serviceIndex))
      .limit(1)
      .get();
    if (
      stored === undefined ||
      stored.serviceIndex !== afterIndex + 1 ||
      stored.outcome === null
    ) {
      return yield* makeZerospinError('service-finalized-history-missing');
    }
    const row = readServiceCommandOccurrence(stored, key);
    const rowBytes = new TextEncoder().encode(JSON.stringify(row)).byteLength;
    if (rows.length > 0 && bytes + rowBytes > 1_048_576) break;
    rows.push({ row, index: row.serviceIndex });
    bytes += rowBytes;
    afterIndex = row.serviceIndex;
  }
  return { lastIndex, rows };
});
