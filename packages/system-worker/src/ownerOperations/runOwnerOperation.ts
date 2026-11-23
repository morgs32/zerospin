import type { IOwnerRelease } from '@zerospin/core/system/ownerReleaseDeployment';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import type * as Schema from 'effect/Schema';

import { callOwnerRelease } from './callOwnerRelease.js';
import { getEmittingSystemSpec } from './getEmittingSystemSpec.js';
import type {
  CommandContinuationResponseSchema,
  ExternalContinuationResponseSchema,
  OwnerOperationRequestSchema,
} from './ownerOperationSchema.js';

type IOwnerOperationRequest = typeof OwnerOperationRequestSchema.Type;
type IOwnerOperationReply =
  | typeof CommandContinuationResponseSchema.Type
  | typeof ExternalContinuationResponseSchema.Type;

function matchesBranch(
  branch: { commandName: string; version: number } | undefined,
  reply: IOwnerOperationReply,
): boolean {
  if (branch === undefined) return reply === null;
  return (
    reply !== null &&
    reply.commandName === branch.commandName &&
    reply.contractVersion === branch.version
  );
}

function checkOwnerOperationReply(
  spec: ISystemSpec,
  release: IOwnerRelease,
  request: IOwnerOperationRequest,
  reply: IOwnerOperationReply,
): boolean {
  const version =
    'aggregateName' in release
      ? release.aggregateVersion
      : release.serviceVersion;
  const owner =
    'aggregateName' in release
      ? spec.aggregates[release.aggregateName]
      : spec.services[release.serviceName];
  const declaration = owner?.releases[version];
  if (owner === undefined || declaration === undefined) return false;
  if (reply !== null) {
    const contract =
      owner.contractVersions[reply.commandName]?.[reply.contractVersion];
    if (
      declaration.contracts[reply.commandName] !== reply.contractVersion ||
      contract === undefined ||
      contract.external !== undefined ||
      contract.claimsJsonSchema !== null
    ) {
      return false;
    }
  }

  if (request._tag === 'ExternalContinuation') {
    const { externalContractName, externalContractVersion, externalOutcome } =
      request;
    const external =
      owner.contractVersions[externalContractName]?.[externalContractVersion]
        ?.external;
    if (
      declaration.external[externalContractName] !== externalContractVersion ||
      external === undefined
    ) {
      return false;
    }
    return matchesBranch(
      externalOutcome._tag === 'Success'
        ? external.onSuccess
        : external.onFailure,
      reply,
    );
  }

  const { recorded, outcome } = request;
  const continuation = recorded.continuation;
  if (
    continuation === undefined ||
    continuation.ownerVersion !== version ||
    (reply !== null && (!('id' in reply) || reply.id !== continuation.id))
  ) {
    return false;
  }
  const { commandName, extension } = continuation.declaration;
  const sourceVersion = declaration.contracts[commandName];
  if (sourceVersion === undefined) return false;
  const operations = extension
    ? 'extensions' in declaration
      ? declaration.extensions?.[commandName]?.operations
      : undefined
    : owner.contractVersions[commandName]?.[sourceVersion]?.operations;
  const [destinationName, destinationVersion] =
    recorded.type === 'aggregate'
      ? [recorded.command.aggregateName, recorded.command.aggregateVersion]
      : [recorded.command.serviceName, recorded.command.serviceVersion];

  // The pinned emitting release resolves the native operation key. Verify its
  // selected branch against the portable source and exact destination facts.
  return (
    operations?.some(
      operation =>
        operation.operationName === 'command' &&
        operation.family === recorded.type &&
        operation.destinationName === destinationName &&
        operation.destinationVersion === destinationVersion &&
        operation.contractName === recorded.command.commandName &&
        operation.contractVersion === recorded.command.contractVersion &&
        matchesBranch(
          outcome.result._tag === 'Success'
            ? operation.onSuccess
            : operation.onFailure,
          reply,
        ),
    ) ?? false
  );
}

/** Run authored code on the pinned release and verify its follow-up against SystemSpec. */
export const runOwnerOperation = Effect.fn('runOwnerOperation')(function* <
  A extends IOwnerOperationReply,
  E,
  R,
>(props: {
  env: object;
  release: IOwnerRelease;
  request: IOwnerOperationRequest;
  executionBuildId?: string;
  local: Effect.Effect<A, E, R>;
  response: Schema.Codec<A, unknown>;
}) {
  const { release, request } = props;
  const spec = yield* getEmittingSystemSpec(release);
  const reply = yield* callOwnerRelease(props);
  if (!checkOwnerOperationReply(spec, release, request, reply)) {
    return yield* makeZerospinError('owner-operation-response-invalid');
  }
  return reply;
});
