import { CommandOutcomeSchema } from '@zerospin/core/contracts/CommandOutcomeSchema';
import type { DirectSystemAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { AggregateChains } from '../repoServices/AggregateChains.js';
import { AggregateVersionRepos } from '../repoServices/AggregateVersionRepos.js';

/** Admit a fresh invocation and await only its allocated position. */
export const executeDirectSystemAggregateCommand = Effect.fn(
  'executeDirectSystemAggregateCommand',
)(function* (props: {
  systemId: string;
  command: typeof DirectSystemAggregateCommandSchema.Type;
}) {
  const { command, systemId } = props;
  const chain = yield* (yield* AggregateChains).getRepo({
    key: {
      systemId,
      aggregateName: command.aggregateName,
      aggregateId: command.aggregateId,
    },
  });
  const admittedCommand = yield* Effect.promise(() =>
    chain.admitDirectSystemCommand({ command }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  const { id: _id, aggregateIndex: _position, ...immutable } = admittedCommand;
  if (
    !isEqual(immutable, command) ||
    !Number.isSafeInteger(admittedCommand.aggregateIndex) ||
    admittedCommand.aggregateIndex < 1
  ) {
    return yield* makeZerospinError('aggregate-admission-receipt-invalid');
  }
  const repo = yield* (yield* AggregateVersionRepos).getRepo({
    key: {
      systemId,
      aggregateId: command.aggregateId,
      aggregateName: admittedCommand.aggregateName,
      aggregateVersion: admittedCommand.aggregateVersion,
    },
  });
  const evaluatedCommand = yield* Effect.promise(() =>
    repo.awaitCommandResult({ aggregateIndex: admittedCommand.aggregateIndex }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  return yield* Schema.decodeUnknownEffect(Schema.toType(CommandOutcomeSchema))(
    evaluatedCommand.outcome,
  );
});
