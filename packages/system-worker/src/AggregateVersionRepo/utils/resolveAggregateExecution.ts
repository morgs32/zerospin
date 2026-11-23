import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import type { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { decodeAndAdaptPayload } from '@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload';
import { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
import {
  isAggregateContract,
  isOrdinaryContract,
} from '@zerospin/core/contracts/make/constructContractRelease';
import { prepareAggregateInvocation } from '@zerospin/core/contracts/prepare/prepareAggregateInvocation';
import { prepareContractClaims } from '@zerospin/core/contracts/prepare/prepareContractClaims';
import { resolveContractVersion } from '@zerospin/core/contracts/resolveContractVersion';
import { System } from '@zerospin/core/system/System';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { decodeAndValidateActorClaims } from './decodeAndValidateActorClaims.js';
import { findExecutionContract } from './findExecutionContract.js';
import { resolveSupportedAggregateContract } from './resolveSupportedAggregateContract.js';

export const PreparedAggregateReplayPayloadSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Prepared'),
    sourcePayload: Schema.Record(Schema.String, Schema.Unknown),
    adaptedPayload: Schema.String,
    actorClaims: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
    sourceHasExtension: Schema.Boolean,
  }),
  Schema.Struct({ _tag: Schema.Literal('Refused') }),
]);
export type IPreparedAggregateReplayPayload =
  typeof PreparedAggregateReplayPayloadSchema.Type;

/** Resolve and prepare an ordinary command invocation. */
export const resolveAggregateExecution = makeFn(
  'AggregateVersionRepo.resolveAggregateExecution',
)(function* (
  command: Exclude<
    typeof AggregateChainedCommandSchema.Type,
    { payload: null }
  >,
  executionAggregateRelease: IAnyAggregateRelease,
  preparedReplayPayload?: IPreparedAggregateReplayPayload,
) {
  const executionContract = findExecutionContract(
    executionAggregateRelease,
    command,
  );
  const actorName = command.kind === 'actor' ? command.actorName : undefined;
  if (preparedReplayPayload !== undefined) {
    if (preparedReplayPayload._tag === 'Refused') {
      if (
        executionContract === undefined ||
        command.contractVersion <= executionContract.version
      ) {
        return yield* makeZerospinError(
          'aggregate-replay-prepared-payload-invalid',
        );
      }
      return yield* Effect.fail(DownAdapterRefused);
    }
    const actorClaims = preparedReplayPayload.actorClaims ?? undefined;
    if (
      (command.kind === 'actor' &&
        actorClaims?.aggregateId !== command.aggregateId) ||
      (command.kind !== 'actor' && actorClaims !== undefined)
    ) {
      return yield* makeZerospinError(
        'aggregate-replay-prepared-payload-invalid',
      );
    }
    if (executionContract === undefined) {
      return yield* makeZerospinError('aggregate-contract-unsupported');
    }
    if (
      command.contractVersion < executionContract.version &&
      resolveContractVersion(executionContract, command.contractVersion) ===
        undefined
    ) {
      return yield* makeZerospinError('aggregate-contract-unsupported');
    }
    const payload = yield* decodeAndAdaptPayload(executionContract, {
      command: {
        commandName: command.commandName,
        contractVersion: Math.min(
          command.contractVersion,
          executionContract.version,
        ),
        payload: preparedReplayPayload.adaptedPayload,
      },
    });
    const claims = yield* prepareContractClaims(executionContract, actorClaims);
    return {
      executionContract,
      actorName,
      actorClaims,
      invocation: {
        contract: executionContract,
        command: { ...command, payload: preparedReplayPayload.sourcePayload },
        payload,
        claims,
        aggregateId: command.aggregateId,
      },
    };
  }
  const system = yield* System;
  const aggregateRegistry =
    system.aggregates[command.aggregateName]?.releases ?? {};
  const sourceContract = resolveSupportedAggregateContract(
    aggregateRegistry,
    command,
  );
  if (sourceContract === undefined) {
    return yield* makeZerospinError('actor-contract-lineage-unsupported');
  }
  const actor =
    command.kind === 'actor'
      ? yield* resolveAggregateActorVersion(aggregateRegistry, {
          actorName: command.actorName,
          actorVersion: command.actorVersion,
        })
      : undefined;
  const actorClaims = yield* decodeAndValidateActorClaims(command, actor);
  const validateSourceCommand = Effect.gen(function* () {
    if (
      !isAggregateContract(sourceContract) ||
      !isOrdinaryContract(sourceContract)
    ) {
      return yield* makeZerospinError('external-contract-kind-mismatch');
    }
    const actorContract = actor?.contracts[command.commandName];
    if (
      actor !== undefined &&
      (actorContract === undefined ||
        resolveContractVersion(actorContract, command.contractVersion) ===
          undefined)
    ) {
      return yield* makeZerospinError('actor-contract-lineage-unsupported');
    }
    const payload = yield* decodeAndAdaptPayload(sourceContract, {
      command,
    });
    yield* prepareAggregateInvocation({
      contract: sourceContract,
      command: { ...command, payload },
      claims: actorClaims,
    });
  });
  const validateDownAdapterRefusal = (failure: unknown) =>
    failure === DownAdapterRefused ? validateSourceCommand : Effect.void;
  if (executionContract === undefined) {
    yield* validateSourceCommand;
    return yield* makeZerospinError('aggregate-contract-unsupported');
  }
  if (
    resolveContractVersion(executionContract, command.contractVersion) ===
    undefined
  ) {
    yield* validateSourceCommand;
    return yield* makeZerospinError('aggregate-contract-unsupported');
  }
  const decodedPayload = yield* decodeAndAdaptPayload(sourceContract, {
    command,
  });
  const invocation = yield* prepareAggregateInvocation({
    contract: executionContract,
    command: { ...command, payload: decodedPayload },
    claims: actorClaims,
  }).pipe(Effect.tapError(validateDownAdapterRefusal));
  return { executionContract, actorName, actorClaims, invocation };
});
