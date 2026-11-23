import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { eq } from 'drizzle-orm';

import type { AggregateActorHistory } from '../AggregateActorVersionChain/AggregateActorHistory.js';
import { genesisDispositionChainHash } from '../aggregateDispositionChainHash/aggregateDispositionChainHash.js';
import type { IAggregateProjectionKey } from '../aggregateProjection/resolveAggregateProjectionView.js';

import { aggregateAgentSessionChainDbConfig } from './aggregateSessionChainDbConfig.js';

/** Read the captured publication position exactly, even when newer output is retained. */
export const getCheckpoint = makeFn('AggregateSessionChain.getCheckpoint')(
  function* (props: {
    history?: AggregateActorHistory | undefined;
    db: IDb;
    key: IAggregateProjectionKey;
    aggregateIndex: number;
  }) {
    const { aggregateIndex, key, db } = props;
    if ('actorName' in key) {
      if (props.history === undefined) {
        return yield* makeZerospinError('aggregate-actor-history-required');
      }
      return yield* props.history.getCheckpoint(aggregateIndex);
    }

    if (!Number.isSafeInteger(aggregateIndex) || aggregateIndex < 0) {
      return yield* makeZerospinError('projection-history-checkpoint-invalid');
    }
    if (aggregateIndex === 0) {
      return {
        aggregateIndex: 0,
        dispositionChainHash: genesisDispositionChainHash(),
      };
    }
    const table = aggregateAgentSessionChainDbConfig.schema.exposedCommands;
    const checkpoint = db
      .select({
        aggregateIndex: table.aggregateIndex,
        dispositionChainHash: table.dispositionChainHash,
      })
      .from(table)
      .where(eq(table.aggregateIndex, aggregateIndex))
      .get();
    if (checkpoint === undefined) {
      return yield* makeZerospinError('projection-history-checkpoint-missing');
    }
    return checkpoint;
  },
);
