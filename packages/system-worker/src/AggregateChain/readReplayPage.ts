import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { and, asc, eq, gt, lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';
import { getPublishedAggregateHistory } from './getPublishedAggregateHistory.js';
import { readAdmittedAggregateCommand } from './readAdmittedAggregateCommand.js';
import type { IAdmittedAggregateCommand } from './types.js';

/** Read one bounded portion of the finalized logical history without progressing original execution. */
export const readReplayPage = Effect.fn('AggregateChain.readReplayPage')(
  function* (
    db: IDb,
    page: { afterIndex: number; maxIndex?: number },
    key: { systemId: string; aggregateId: string; aggregateName: string },
  ) {
    const { commandProgress, commands } = aggregateChainDbConfig.schema;
    const progress = db
      .select()
      .from(commandProgress)
      .where(eq(commandProgress.singleton, 1))
      .get();
    if (progress === undefined) {
      return yield* makeZerospinError('aggregate-command-progress-missing');
    }
    const lastIndex = progress.finalizedThroughIndex;
    const maximum = Math.min(lastIndex, page.maxIndex ?? lastIndex);
    if (page.afterIndex >= maximum) return { rows: [], lastIndex };
    if (page.afterIndex < progress.compactedThroughIndex) {
      const throughIndex = Math.min(maximum, progress.compactedThroughIndex);
      const history = yield* getPublishedAggregateHistory({
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
        retained.rows[0]?.aggregateIndex !== page.afterIndex + 1
      ) {
        return yield* makeZerospinError('aggregate-history-missing');
      }
      return {
        lastIndex,
        rows: retained.rows.map<{
          row: IAdmittedAggregateCommand;
          index: number;
        }>(evaluated => {
          const {
            operations: _operations,
            dispositionChainHash: _dispositionChainHash,
            ...admitted
          } = evaluated;
          return { row: admitted, index: admitted.aggregateIndex };
        }),
      };
    }
    const rows: { row: IAdmittedAggregateCommand; index: number }[] = [];
    let afterIndex = page.afterIndex;
    let bytes = 0;
    while (rows.length < 64 && afterIndex < maximum) {
      const row = db
        .select()
        .from(commands)
        .where(
          and(
            gt(commands.aggregateIndex, afterIndex),
            lte(commands.aggregateIndex, maximum),
          ),
        )
        .orderBy(asc(commands.aggregateIndex))
        .limit(1)
        .get();
      if (
        row === undefined ||
        row.aggregateIndex !== afterIndex + 1 ||
        row.outcome === null
      ) {
        return yield* makeZerospinError('aggregate-history-missing');
      }
      const admitted = readAdmittedAggregateCommand(row, key);
      const commandBytes = new TextEncoder().encode(
        JSON.stringify(admitted),
      ).byteLength;
      if (rows.length > 0 && bytes + commandBytes > 1024 * 1024) break;
      rows.push({ row: admitted, index: admitted.aggregateIndex });
      bytes += commandBytes;
      afterIndex = admitted.aggregateIndex;
    }
    return { rows, lastIndex };
  },
);
