import type { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { decodeAndAdaptPayload } from '@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload';
import { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
import {
  isOrdinaryContract,
  isServiceContract,
} from '@zerospin/core/contracts/make/constructContractRelease';
import { prepareContractClaims } from '@zerospin/core/contracts/prepare/prepareContractClaims';
import { prepareServiceInvocation } from '@zerospin/core/contracts/prepare/prepareServiceInvocation';
import { resolveContractVersion } from '@zerospin/core/contracts/resolveContractVersion';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { resolveServiceActorVersion } from '@zerospin/core/serviceActor/getServiceActorVersion';
import { System } from '@zerospin/core/system/System';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { IPreparedServiceReplayInput } from '@zerospin/system-worker/serviceReplayAdapter/prepareServiceReplaySource';
import { decodeAndValidateActorClaims } from '@zerospin/system-worker/ServiceVersionRepo/utils/decodeAndValidateActorClaims';
import { findServiceExecutionContract } from '@zerospin/system-worker/ServiceVersionRepo/utils/findServiceExecutionContract';
import * as Effect from 'effect/Effect';

import { resolveSupportedServiceContract } from './resolveSupportedServiceContract.js';

/** Resolve and prepare an ordinary command invocation. */
export const resolveServiceExecution = makeFn(
  'ServiceVersionRepo.resolveServiceExecution',
)(function* (
  command: Exclude<typeof ServiceChainedCommandSchema.Type, { payload: null }>,
  executionRelease: IAnyServiceRelease,
  preparedReplayInput?: IPreparedServiceReplayInput,
) {
  if (executionRelease.name !== command.serviceName) {
    return yield* makeZerospinError('service-version-unsupported');
  }
  const executionContract = findServiceExecutionContract(
    executionRelease,
    command,
  );
  if (preparedReplayInput !== undefined) {
    if (preparedReplayInput._tag === 'Unsupported') {
      if (
        executionContract === undefined ||
        command.contractVersion <= executionContract.version
      ) {
        return yield* makeZerospinError(
          'service-replay-prepared-input-invalid',
        );
      }
      return yield* makeZerospinError('service-contract-unsupported');
    }
    const actorClaims = preparedReplayInput.actorClaims ?? undefined;
    if ((command.kind === 'actor') !== (actorClaims !== undefined)) {
      return yield* makeZerospinError('service-replay-prepared-input-invalid');
    }
    if (executionContract === undefined) {
      return yield* makeZerospinError('service-contract-unsupported');
    }
    if (command.kind === 'agent' && executionContract.claims !== undefined) {
      return yield* makeZerospinError('service-command-agent-forbidden');
    }
    if (
      command.contractVersion < executionContract.version &&
      resolveContractVersion(executionContract, command.contractVersion) ===
        undefined
    ) {
      return yield* makeZerospinError('service-contract-unsupported');
    }
    const payload = yield* decodeAndAdaptPayload(executionContract, {
      command: {
        commandName: command.commandName,
        contractVersion: Math.min(
          command.contractVersion,
          executionContract.version,
        ),
        payload: preparedReplayInput.adaptedPayload,
      },
    });
    const claims = yield* prepareContractClaims(executionContract, actorClaims);
    return {
      executionContract,
      actorClaims,
      invocation: {
        contract: executionContract,
        command: { ...command, payload: preparedReplayInput.sourcePayload },
        payload,
        claims,
      },
    };
  }
  const system = yield* System;
  const serviceRegistry = system.services[command.serviceName]?.releases ?? {};
  const sourceContract = resolveSupportedServiceContract(
    serviceRegistry,
    command,
  );
  if (sourceContract === undefined) {
    return yield* makeZerospinError('service-contract-version-unsupported');
  }
  if (sourceContract.external !== undefined) {
    return yield* makeZerospinError('external-contract-kind-mismatch');
  }
  const actor =
    command.kind === 'actor'
      ? yield* resolveServiceActorVersion(serviceRegistry, {
          actorName: command.actorName,
          actorVersion: command.actorVersion,
        })
      : undefined;
  const actorClaims = yield* decodeAndValidateActorClaims(command, actor);
  const validateSourceCommand = Effect.gen(function* () {
    if (
      !isServiceContract(sourceContract) ||
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
      return yield* makeZerospinError('service-contract-lineage-unsupported');
    }
    const payload = yield* decodeAndAdaptPayload(sourceContract, {
      command,
    });
    yield* prepareServiceInvocation({
      contract: sourceContract,
      command: { ...command, payload },
      claims: actorClaims,
    });
  });
  const validateDownAdapterRefusal = (failure: unknown) =>
    failure === DownAdapterRefused ? validateSourceCommand : Effect.void;
  if (executionContract === undefined) {
    yield* validateSourceCommand;
    return yield* makeZerospinError('service-contract-unsupported');
  }
  if (command.kind === 'agent' && executionContract.claims !== undefined) {
    return yield* makeZerospinError('service-command-agent-forbidden');
  }
  if (
    resolveContractVersion(executionContract, command.contractVersion) ===
    undefined
  ) {
    yield* validateSourceCommand;
    return yield* makeZerospinError('service-contract-unsupported');
  }
  const decodedPayload = yield* decodeAndAdaptPayload(sourceContract, {
    command,
  });
  const invocation = yield* prepareServiceInvocation({
    contract: executionContract,
    command: { ...command, payload: decodedPayload },
    claims: actorClaims,
  }).pipe(Effect.tapError(validateDownAdapterRefusal));
  return { executionContract, actorClaims, invocation };
});
