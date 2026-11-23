import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { and, asc, gt, lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import type { AggregateActorHistory } from '../AggregateActorVersionChain/AggregateActorHistory.js';
import type { IAggregateProjectionKey } from '../aggregateProjection/resolveAggregateProjectionView.js';

import { aggregateAgentSessionChainDbConfig } from './aggregateSessionChainDbConfig.js';

/** Actor reads use logical archived history; only Agent history stays in this database. */
export function readExposedCommands(props: {
  history?: AggregateActorHistory | undefined;
  db: IDb;
  key: IAggregateProjectionKey;
  afterAggregateIndex?: number;
  afterScannedIndex?: number;
  throughAggregateIndex?: number;
  nodeId?: string;
  afterPushIndex?: number;
  limit?: number;
}) {
  const { db, key } = props;
  return Effect.gen(function* () {
    if ('actorName' in key) {
      const history = props.history;
      if (history === undefined) {
        return yield* makeZerospinError('aggregate-actor-history-required');
      }
      return yield* history.readExposedCommands({
        afterAggregateIndex: props.afterAggregateIndex ?? 0,
        afterScannedIndex: props.afterScannedIndex ?? 0,
        throughAggregateIndex:
          props.throughAggregateIndex ?? history.readHead().aggregateIndex,
        limit: props.limit ?? 64,
        ...(props.nodeId === undefined ? {} : { nodeId: props.nodeId }),
        ...(props.afterPushIndex === undefined
          ? {}
          : { afterPushIndex: props.afterPushIndex }),
      });
    }
    const table = aggregateAgentSessionChainDbConfig.schema.exposedCommands;
    const rows = db
      .select()
      .from(table)
      .where(
        and(
          gt(
            table.aggregateIndex,
            Math.max(
              props.afterAggregateIndex ?? 0,
              props.afterScannedIndex ?? 0,
            ),
          ),
          props.throughAggregateIndex === undefined
            ? undefined
            : lte(table.aggregateIndex, props.throughAggregateIndex),
        ),
      )
      .orderBy(asc(table.aggregateIndex))
      .limit(props.limit ?? Number.MAX_SAFE_INTEGER)
      .all();
    return yield* Effect.forEach(rows, row =>
      aggregateAgentSessionChainDbConfig.tables.exposedCommands
        .decodeRow(row)
        .pipe(Effect.map(command => ({ ...command, commandResolution: null }))),
    );
  });
}
