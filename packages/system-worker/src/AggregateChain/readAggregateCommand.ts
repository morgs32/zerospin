import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';
import { getPublishedAggregateHistory } from './getPublishedAggregateHistory.js';
import { readAdmittedAggregateCommand } from './readAdmittedAggregateCommand.js';
import type { IAdmittedAggregateCommand } from './types.js';

/** Read retained input from published history or the newer local admission suffix. */
export const readAggregateCommand = Effect.fn(
  'AggregateChain.readAggregateCommand',
)(function* (props: {
  db: IDb;
  key: { systemId: string; aggregateId: string; aggregateName: string };
  aggregateIndex: number;
}) {
  const { db, key, aggregateIndex } = props;
  const { commandProgress, commands } = aggregateChainDbConfig.schema;
  const progress = db
    .select()
    .from(commandProgress)
    .where(eq(commandProgress.singleton, 1))
    .get();
  if (progress === undefined) {
    return yield* makeZerospinError('aggregate-command-progress-missing');
  }
  if (aggregateIndex <= progress.compactedThroughIndex) {
    const history = yield* getPublishedAggregateHistory({
      db,
      key,
      throughIndex: aggregateIndex,
    });
    const evaluated = yield* Effect.promise(() =>
      history.getEvaluatedCommand({ aggregateIndex }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    if (evaluated === null) {
      return yield* makeZerospinError('aggregate-history-missing');
    }
    const {
      operations: _operations,
      dispositionChainHash: _dispositionChainHash,
      ...admitted
    } = evaluated;
    return admitted satisfies IAdmittedAggregateCommand;
  }
  const row = db
    .select()
    .from(commands)
    .where(eq(commands.aggregateIndex, aggregateIndex))
    .get();
  if (row !== undefined) return readAdmittedAggregateCommand(row, key);
  if (aggregateIndex <= progress.admittedThroughIndex) {
    return yield* makeZerospinError('aggregate-history-missing');
  }
  return null;
});
