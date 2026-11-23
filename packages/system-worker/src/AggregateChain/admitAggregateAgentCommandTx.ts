import { EncodedAgentAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

import {
  acknowledgeAgentNodeCommand,
  readActiveProducerPosition,
} from '../agentNodeProducer/agentNodeProducerPosition.js';
import { checkAdmissionGrant } from '../ownerOperations/admissionGrant.js';
import { readExecutingSystemSpec } from '../workerConfiguration/workerConfiguration.js';

import { appendAggregateCommand } from './admitAggregateCommands/appendAggregateCommand.js';
import type { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

/** Fence every admission and duplicate acknowledgement to its active installation. */
export const admitAggregateAgentCommandTx = makeTx(
  'AggregateChain.admitAggregateAgentCommandTx',
)(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  props: {
    source: {
      systemId: string;
      aggregateName: string;
      aggregateId: string;
      agentName: string;
    };
    generation: number;
    producerIndex: number;
    command: unknown;
    key: { systemId: string; aggregateName: string; aggregateId: string };
  },
) {
  const { source, producerIndex, command, key } = props;
  if (
    source.systemId !== key.systemId ||
    source.aggregateName !== key.aggregateName ||
    source.aggregateId !== key.aggregateId
  ) {
    return yield* makeZerospinError('aggregate-producer-binding-invalid');
  }
  const { generation } = props;
  const lastProducerIndex = yield* readActiveProducerPosition(
    tx,
    source.agentName,
    generation,
  );
  if (producerIndex <= lastProducerIndex) {
    return { generation, acknowledgedProducerIndex: lastProducerIndex };
  }
  if (producerIndex !== lastProducerIndex + 1) {
    return yield* makeZerospinError('aggregate-agent-producer-index-invalid');
  }
  const decoded = yield* Schema.decodeUnknownEffect(
    EncodedAgentAggregateCommandSchema,
  )(command, { onExcessProperty: 'error' });
  if (
    decoded.agentName !== source.agentName ||
    decoded.aggregateName !== key.aggregateName ||
    decoded.aggregateId !== key.aggregateId
  ) {
    return yield* makeZerospinError('aggregate-producer-binding-invalid');
  }
  yield* checkAdmissionGrant(decoded, readExecutingSystemSpec());
  yield* appendAggregateCommand(tx, decoded);
  acknowledgeAgentNodeCommand(tx, source.agentName, producerIndex);
  return { generation, acknowledgedProducerIndex: producerIndex };
});
