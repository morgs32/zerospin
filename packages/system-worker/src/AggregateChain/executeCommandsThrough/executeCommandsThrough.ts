import type { IDb } from '@zerospin/core/drizzle/types';
import {
  makeZerospinError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { eq } from 'drizzle-orm';
import type { Effect } from 'effect';

import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';
import { readPendingAggregateCommand } from '../readPendingAggregateCommand.js';

/** Progress the retained earliest incomplete original until the captured prefix is finalized. */
export const executeCommandsThrough = makeFn(
  'AggregateChain.executeCommandsThrough',
)(function* (props: {
  db: IDb;
  aggregateIndex?: number | undefined;
  finalizeCommandOutbox: {
    drain(
      throughIndex?: number,
    ): Effect.Effect<void, IZerospinError | IZerospinErrorJson>;
  };
}) {
  const { aggregateIndex, db, finalizeCommandOutbox } = props;
  const progress = db
    .select()
    .from(aggregateChainDbConfig.schema.commandProgress)
    .where(eq(aggregateChainDbConfig.schema.commandProgress.singleton, 1))
    .get();
  if (progress === undefined) {
    return yield* makeZerospinError('aggregate-command-progress-missing');
  }
  const admittedTip = progress.admittedThroughIndex;
  const throughIndex = aggregateIndex ?? admittedTip;
  if (!Number.isSafeInteger(throughIndex) || throughIndex < 0) {
    return yield* makeZerospinError('aggregate-execution-index-invalid');
  }
  if (throughIndex > admittedTip) {
    return yield* makeZerospinError('aggregate-execution-index-unavailable');
  }
  yield* finalizeCommandOutbox.drain(throughIndex);
  const pending = readPendingAggregateCommand(db, throughIndex);
  if (pending !== undefined) {
    return yield* makeZerospinError('aggregate-original-outcome-pending');
  }
});
