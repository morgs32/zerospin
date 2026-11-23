import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Clock from 'effect/Clock';
import * as Schema from 'effect/Schema';

import type { IAdmittedAggregateCommand } from '../../AggregateChain/types.js';
import { getCommandPayloadFailure } from '../../getCommandPayloadFailure.js';
import { type aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';
import { readAggregateMaterializationHead } from '../readAggregateMaterializationHead.js';

/** Validate command authority and contiguous progress before reading admitted input. */
export const readAggregateCommandTx = makeFn(
  'AggregateVersionRepo.readAggregateCommandTx',
)(function* (
  tx: ITx<
    IResourceDbConfig<IAnyModels, typeof aggregateVersionRepoDbConfig.tables>
  >,
  row: IAdmittedAggregateCommand,
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: number;
  },
  mode: 'original' | 'replay',
) {
  if (
    row.aggregateName !== key.aggregateName ||
    row.aggregateId !== key.aggregateId
  ) {
    return yield* makeZerospinError('aggregate-command-owner-mismatch');
  }
  if (mode === 'original' && row.aggregateVersion !== key.aggregateVersion) {
    return yield* makeZerospinError('aggregate-original-version-mismatch');
  }
  if (mode === 'replay' && row.outcome === null) {
    return yield* makeZerospinError('aggregate-replay-command-pending');
  }
  const materializationHead = readAggregateMaterializationHead(tx);
  const cursor = materializationHead.aggregateIndex;
  if (!Number.isSafeInteger(row.aggregateIndex) || row.aggregateIndex < 1) {
    return yield* makeZerospinError('aggregate-execution-gap');
  }
  if (row.aggregateIndex <= cursor) return;
  if (row.aggregateIndex !== cursor + 1) {
    return yield* makeZerospinError({
      code: 'aggregate-execution-gap',
      message: 'Admitted history is not contiguous',
    });
  }
  const decodedSourceCommand = yield* Schema.decodeUnknownEffect(
    Schema.toType(AggregateChainedCommandSchema),
  )({ ...row, dispositionChainHash: null }).pipe(
    mapParseError({
      code: 'aggregate-admitted-input-invalid',
      prefix: 'Invalid admitted input',
    }),
  );
  const finalizedAt =
    mode === 'original'
      ? new Date(yield* Clock.currentTimeMillis)
      : decodedSourceCommand.outcome?.finalizedAt;
  if (finalizedAt === undefined) {
    return yield* makeZerospinError('aggregate-replay-command-pending');
  }
  const { payloadFailure: _payloadFailure, ...sourceCommand } =
    decodedSourceCommand;
  return {
    command: { ...sourceCommand, outcome: null },
    materializationHead,
    finalizedAt,
    payloadFailure: getCommandPayloadFailure(decodedSourceCommand),
  };
});
