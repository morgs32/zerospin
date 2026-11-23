import type { EncodedActorAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';

import { checkAdmissionGrant } from '../../ownerOperations/admissionGrant.js';
import { readExecutingSystemSpec } from '../../workerConfiguration/workerConfiguration.js';
import { type aggregateChainDbConfig } from '../aggregateChainDbConfig.js';
import type { IAdmittedAggregateCommands } from '../types.js';

import { appendAggregateCommand } from './appendAggregateCommand.js';
import { validateAggregateNodeContinuation } from './validateAggregateNodeContinuation.js';

export const admitAggregateCommandsTx = makeTx(
  'AggregateChain.admitAggregateCommandsTx',
)(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  props: {
    commands: readonly (typeof EncodedActorAggregateCommandSchema.Type)[];
    key: { systemId: string; aggregateId: string; aggregateName: string };
  },
) {
  const { commands: submittedCommands, key } = props;
  const admitted: Array<IAdmittedAggregateCommands[number]> = [];
  for (const command of submittedCommands) {
    if (
      command.aggregateName !== key.aggregateName ||
      command.aggregateId !== key.aggregateId
    ) {
      return yield* makeZerospinError('aggregate-command-scope-mismatch');
    }
    yield* validateAggregateNodeContinuation(tx, command);
    yield* checkAdmissionGrant(command, readExecutingSystemSpec());
    const admittedCommand = yield* appendAggregateCommand(tx, command);
    admitted.push(admittedCommand);
  }
  return admitted;
});
