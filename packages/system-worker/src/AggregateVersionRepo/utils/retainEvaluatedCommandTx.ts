import { mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';

import {
  encodeAggregateCommandProvenance,
  type IEvaluatedAggregateCommand,
} from '../../AggregateVersionChain/evaluatedAggregateCommand.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';

import type { readAggregateCommandTx } from './readAggregateCommandTx.js';

/** Resource progress and complete pending messages commit with the business transaction. */
export const retainEvaluatedCommandTx = makeFn(
  'AggregateVersionRepo.retainEvaluatedCommandTx',
)(function* (
  tx: Parameters<typeof readAggregateCommandTx>[0],
  command: IEvaluatedAggregateCommand,
) {
  const row =
    yield* aggregateVersionRepoDbConfig.tables.aggregateVersionChainOutbox
      .encodeRow({ ...command, ...encodeAggregateCommandProvenance(command) })
      .pipe(
        mapParseError({
          code: 'aggregate-final-encode-failed',
          prefix: 'Invalid evaluated command',
        }),
      );
  tx.insert(aggregateVersionRepoDbConfig.schema.aggregateVersionChainOutbox)
    .values(row)
    .run();
  const materializationHead = {
    singletonId: 1,
    aggregateIndex: command.aggregateIndex,
    dispositionChainHash: command.dispositionChainHash,
  };
  tx.insert(aggregateVersionRepoDbConfig.schema.materializationHead)
    .values(materializationHead)
    .onConflictDoUpdate({
      target:
        aggregateVersionRepoDbConfig.schema.materializationHead.singletonId,
      set: materializationHead,
    })
    .run();
  return command;
});
