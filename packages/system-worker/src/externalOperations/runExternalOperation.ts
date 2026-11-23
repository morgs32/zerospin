import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { buildExternalContinuation } from '@zerospin/core/contracts/externalExecution/buildExternalContinuation';
import { executeExternalRequest } from '@zerospin/core/contracts/externalExecution/executeExternalRequest';
import { makeExternalOutcome } from '@zerospin/core/contracts/externalExecution/makeExternalOutcome';
import { ExternalOutcomeSchema } from '@zerospin/core/contracts/ExternalOutcomeSchema';
import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import {
  RUN_OWNER_OPERATION_PATH,
  type IOwnerRelease,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { decodeSync, makeShapeCodecs } from '@zerospin/shapes';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';

import { callOwnerRelease } from '../ownerOperations/callOwnerRelease.js';
import { getEmittingSystemSpec } from '../ownerOperations/getEmittingSystemSpec.js';
import type { OwnerExternalContinuationSchema } from '../ownerOperations/ownerOperationSchema.js';
import { readAuthoredWorkerConfig } from '../workerConfiguration/workerConfiguration.js';

import type { IPreparedExternalOperation } from './externalOperation.js';
import { resolveWorkContract } from './resolveWorkContract.js';

export const runExternalRequest = Effect.fn('runExternalRequest')(function* (
  release: IAnyAggregateRelease | IAnyServiceRelease | undefined,
  input: Pick<
    IPreparedExternalOperation,
    'externalContractName' | 'externalContractVersion' | 'payload'
  >,
) {
  if (release === undefined) {
    return yield* makeZerospinError('external-operation-owner-unavailable');
  }
  const contract = yield* resolveWorkContract(release, input);
  if (contract.external === undefined) {
    return yield* makeZerospinError(
      'external-operation-definition-unavailable',
    );
  }
  const payload = yield* decodeSync(
    makeShapeCodecs(contract.payload).portableCompleteCodec,
    input.payload,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'external-payload-invalid',
      prefix: 'Invalid frozen external payload',
    }),
  );
  const exit = yield* provideReleaseLayer(
    release,
    Effect.exit(
      executeExternalRequest({ external: contract.external, payload }),
    ),
  );
  const now = yield* Clock.currentTimeMillis;
  return makeExternalOutcome(exit, new Date(now));
});

export const runExternalContinuation = Effect.fn('runExternalContinuation')(
  function* (
    release: IAnyAggregateRelease | IAnyServiceRelease | undefined,
    input: typeof OwnerExternalContinuationSchema.Type,
  ) {
    if (release === undefined) {
      return yield* makeZerospinError('external-operation-owner-unavailable');
    }
    return yield* provideReleaseLayer(
      release,
      buildExternalContinuation(release, input),
    );
  },
);

/** Route a recorded request to its pinned executable before retaining any observation. */
export const requestExternalObservation = Effect.fn(
  'requestExternalObservation',
)(function* (
  env: object,
  release: IOwnerRelease,
  operation: Pick<
    IPreparedExternalOperation,
    'externalContractName' | 'externalContractVersion' | 'payload'
  >,
) {
  const spec = yield* getEmittingSystemSpec(release);
  const { externalContractName, externalContractVersion, payload } = operation;
  const aggregate = 'aggregateName' in release;
  const owner = aggregate
    ? spec.aggregates[release.aggregateName]
    : spec.services[release.serviceName];
  const version = aggregate ? release.aggregateVersion : release.serviceVersion;
  const contract =
    owner?.contractVersions[externalContractName]?.[externalContractVersion];
  if (
    owner?.releases[version]?.external[externalContractName] !==
      externalContractVersion ||
    !contract?.external
  ) {
    return yield* makeZerospinError(
      'external-operation-definition-unavailable',
    );
  }
  return yield* callOwnerRelease({
    env,
    release,
    request: { externalContractName, externalContractVersion, payload },
    local: Effect.suspend(() => {
      const system = readAuthoredWorkerConfig()?.system;
      const authored = aggregate
        ? system?.aggregates[release.aggregateName]?.releases[version]
        : system?.services[release.serviceName]?.releases[version];
      return runExternalRequest(authored, operation);
    }),
    path: RUN_OWNER_OPERATION_PATH + '/request',
    response: ExternalOutcomeSchema,
    timeout: contract.external.timeoutMs + 30_000,
  });
});
