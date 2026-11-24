import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { and, asc, eq, gt, lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { getPublishedServiceHistory } from './getPublishedServiceHistory.js';
import { readServiceCommandOccurrence } from './readServiceCommandOccurrence.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';
import type { IServiceCommandOccurrence } from './types.js';

/** Read a finalized replay page from published history or the local suffix. */
export const readReplayCommandsPage = Effect.fn(
  'ServiceChain.readReplayCommandsPage',
)(function* (
  db: IDb<typeof serviceChainDbConfig>,
  key: { systemId: string; serviceName: string },
  page: { afterIndex: number; maxIndex?: number },
) {
  const { commands, finalizedPosition } = serviceChainDbConfig.schema;
  const progress = db
    .select()
    .from(finalizedPosition)
    .where(eq(finalizedPosition.singleton, 1))
    .get();
  const lastIndex = progress?.lastIndex ?? 0;
  const compactedThroughIndex = progress?.compactedThroughIndex ?? 0;
  const maxIndex = Math.min(lastIndex, page.maxIndex ?? lastIndex);
  if (page.afterIndex >= maxIndex) return { lastIndex, rows: [] };
  if (page.afterIndex < compactedThroughIndex) {
    const throughIndex = Math.min(maxIndex, compactedThroughIndex);
    const history = yield* getPublishedServiceHistory({
      db,
      key,
      throughIndex,
    });
    const retained = yield* Effect.promise(() =>
      history.getEvaluatedCommandPage({
        afterIndex: page.afterIndex,
        maxIndex: throughIndex,
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    if (
      retained.rows.length === 0 ||
      retained.rows[0]?.serviceIndex !== page.afterIndex + 1
    ) {
      return yield* makeZerospinError('service-finalized-history-missing');
    }
    const rows: { row: IServiceCommandOccurrence; index: number }[] = [];
    for (const evaluated of retained.rows) {
      const {
        operations: _operations,
        dispositionChainHash: _dispositionChainHash,
        outcome,
        ...command
      } = evaluated;
      if (outcome === null) {
        return yield* makeZerospinError('service-finalized-history-missing');
      }
      rows.push({
        row: { ...command, outcome },
        index: command.serviceIndex,
      });
    }
    return { lastIndex, rows };
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
