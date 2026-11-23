import { CommandOutcomeSchema } from '@zerospin/core/contracts/CommandOutcomeSchema';
import type { DirectSystemServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { ServiceChains } from '../repoServices/ServiceChains.js';
import { ServiceVersionRepos } from '../repoServices/ServiceVersionRepos.js';

/** Admit a fresh invocation and await only its allocated position. */
export const executeDirectServiceCommand = Effect.fn(
  'executeDirectServiceCommand',
)(function* (props: {
  systemId: string;
  command: typeof DirectSystemServiceCommandSchema.Type;
}) {
  const { command, systemId } = props;
  const chain = yield* (yield* ServiceChains).getRepo({
    key: { systemId, serviceName: command.serviceName },
  });
  const admittedCommand = yield* Effect.promise(() =>
    chain.admitDirectSystemCommand({ command }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  const { id: _id, serviceIndex: _position, ...immutable } = admittedCommand;
  if (
    !isEqual(immutable, command) ||
    !Number.isSafeInteger(admittedCommand.serviceIndex) ||
    admittedCommand.serviceIndex < 1
  ) {
    return yield* makeZerospinError('service-admission-receipt-invalid');
  }
  const repo = yield* (yield* ServiceVersionRepos).getRepo({
    key: {
      systemId,
      serviceName: admittedCommand.serviceName,
      serviceVersion: admittedCommand.serviceVersion,
    },
  });
  const evaluatedCommand = yield* Effect.promise(() =>
    repo.awaitCommandResult({ serviceIndex: admittedCommand.serviceIndex }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  return yield* Schema.decodeUnknownEffect(Schema.toType(CommandOutcomeSchema))(
    evaluatedCommand.outcome,
  );
});
