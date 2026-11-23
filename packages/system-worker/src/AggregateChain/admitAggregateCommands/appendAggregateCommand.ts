import type { RetainedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError, type PublicFailureSchema } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { eq } from 'drizzle-orm';

import { encodeAggregateCommandProvenance } from '../../AggregateVersionChain/evaluatedAggregateCommand.js';
import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

export const appendAggregateCommand = makeFn('appendAggregateCommand')(
  function* <COMMAND extends typeof RetainedAggregateCommandSchema.Type>(
    tx: ITx<typeof aggregateChainDbConfig>,
    command: COMMAND,
    payloadFailure: typeof PublicFailureSchema.Type | null = null,
  ) {
    if ((command.payload === null) !== (payloadFailure !== null)) {
      return yield* makeZerospinError(
        'aggregate-command-payload-failure-invalid',
      );
    }
    const progress = tx
      .select()
      .from(aggregateChainDbConfig.schema.commandProgress)
      .where(eq(aggregateChainDbConfig.schema.commandProgress.singleton, 1))
      .get();
    if (progress === undefined) {
      return yield* makeZerospinError('aggregate-command-progress-missing');
    }
    const aggregateIndex = progress.admittedThroughIndex + 1;
    if (aggregateIndex - progress.compactedThroughIndex > 64) {
      return yield* makeZerospinError({
        code: 'aggregate-admission-backlog-full',
        extra: { retryable: true },
      });
    }
    if (!Number.isSafeInteger(aggregateIndex)) {
      return yield* makeZerospinError('aggregate-input-index-exhausted');
    }
    const admittedCommand = {
      ...command,
      aggregateIndex,
    };
    const {
      aggregateId: _aggregateId,
      aggregateName: _aggregateName,
      ...stored
    } = admittedCommand;
    const row = yield* aggregateChainDbConfig.tables.commands.encodeRow({
      ...stored,
      ...encodeAggregateCommandProvenance(command),
      outcome: null,
      payloadFailure,
    });
    tx.insert(aggregateChainDbConfig.schema.commands).values(row).run();
    tx.update(aggregateChainDbConfig.schema.commandProgress)
      .set({ admittedThroughIndex: aggregateIndex })
      .where(eq(aggregateChainDbConfig.schema.commandProgress.singleton, 1))
      .run();
    return admittedCommand;
  },
);
