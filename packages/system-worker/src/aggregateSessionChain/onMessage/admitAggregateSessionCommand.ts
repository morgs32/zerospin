import { EncodedActorAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { System } from '@zerospin/core/system/System';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { IAggregateProjectionKey } from '../../aggregateProjection/resolveAggregateProjectionView.js';
import { AggregateChains } from '../../repoServices/AggregateChains.js';
import type { IAggregateConnectionCapabilities } from '../connectionCapabilities.js';
import type { IAggregateActorSessionConnectionState } from '../connectionState.js';

/** Admit the original input and verify its retained command before acknowledging the socket. */
export const admitAggregateSessionCommand = makeFn(
  'AggregateSessionChain.admitAggregateSessionCommand',
)(function* (props: {
  command: typeof EncodedActorAggregateCommandSchema.Type;
  admission: Extract<IAggregateActorSessionConnectionState, { phase: 'live' }>;
  capabilities: IAggregateConnectionCapabilities;
  key: Extract<IAggregateProjectionKey, { actorName: string }>;
}) {
  const { command, admission, capabilities, key } = props;
  const system = yield* System;
  if (
    !Object.hasOwn(
      system.aggregates[admission.aggregateName]?.releases ?? {},
      admission.aggregateVersion,
    )
  ) {
    return yield* makeZerospinError('aggregate-version-unavailable');
  }
  if (
    command.aggregateId !== admission.aggregateId ||
    command.aggregateName !== admission.aggregateName ||
    command.aggregateVersion !== admission.aggregateVersion ||
    command.kind !== 'actor' ||
    command.actorName !== key.actorName ||
    command.actorVersion !== key.actorVersion ||
    !isEqual(command.claims, admission.claims) ||
    command.sessionName !== admission.sessionName ||
    command.nodeId !== admission.nodeId ||
    (admission.issuedNodeId !== null &&
      command.nodeId !== admission.issuedNodeId)
  ) {
    return yield* makeZerospinError(
      'aggregate-session-command-identity-mismatch',
    );
  }
  if (
    !Object.hasOwn(capabilities.contractVersions, command.commandName) ||
    capabilities.contractVersions[command.commandName] !==
      command.contractVersion
  ) {
    return yield* makeZerospinError(
      'aggregate-session-command-contract-unavailable',
    );
  }
  const submitted = command;
  const chains = yield* AggregateChains;
  const chain = yield* chains.getRepo({ key });
  const admittedCommands = yield* Effect.promise(() =>
    chain.admitAggregateCommands({ commands: [submitted] }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  const admittedCommand = admittedCommands[0];
  if (
    admittedCommands.length !== 1 ||
    admittedCommand === undefined ||
    !Number.isSafeInteger(admittedCommand.aggregateIndex) ||
    admittedCommand.aggregateIndex < 1 ||
    !Schema.is(EncodedActorAggregateCommandSchema)(admittedCommand) ||
    !isEqual(admittedCommand, {
      ...submitted,
      aggregateIndex: admittedCommand.aggregateIndex,
    })
  ) {
    return yield* makeZerospinError('aggregate-admission-receipt-invalid');
  }
  return admittedCommand;
});
