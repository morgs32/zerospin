import { SystemServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import {
  getOwnerReleaseBindingName,
  PREPARE_SERVICE_REPLAY_PATH,
} from '@zerospin/core/system/ownerReleaseDeployment';
import {
  ensureZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import { deserialize, serialize } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { getSystemSpec } from '../getSystemSpec/getSystemSpec.js';
import { readServiceCommand } from '../ServiceChain/readServiceCommand.js';
import { serviceChainName } from '../ServiceChain/serviceChainName.js';

import {
  PreparedServiceReplayInputSchema,
  type ServiceReplaySourceRequestSchema,
} from './prepareServiceReplaySource.js';

const ServiceReplayRequestSchema = Schema.Struct({
  ...serviceChainName.keyCodec.fields,
  serviceIndex: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  commandId: SystemServiceCommandSchema.fields.id,
  receivingServiceVersion: VersionSchema,
});
export type IServiceReplayRequest = typeof ServiceReplayRequestSchema.Type;

/** Read finalized provenance on the stable Chain before invoking its registered source Worker. */
export const prepareServiceReplayInput = Effect.fn(
  'ServiceChain.prepareServiceReplayInput',
)(function* (props: {
  request: IServiceReplayRequest;
  key: { systemId: string; serviceName: string };
  db: Parameters<typeof readServiceCommand>[0];
  env: object;
}) {
  const { key, db, env } = props;
  const request = yield* Schema.decodeUnknownEffect(ServiceReplayRequestSchema)(
    props.request,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'service-replay-adapter-request-invalid',
      prefix: 'Invalid Service replay adapter request',
    }),
  );
  if (
    request.systemId !== key.systemId ||
    request.serviceName !== key.serviceName
  ) {
    return yield* makeZerospinError('service-command-identity-mismatch');
  }
  const command = yield* readServiceCommand(db, key, request.serviceIndex);
  if (
    command === null ||
    command.outcome === null ||
    command.payload === null ||
    command.serviceIndex !== request.serviceIndex ||
    command.id !== request.commandId ||
    command.serviceName !== key.serviceName
  ) {
    return yield* makeZerospinError('service-replay-adapter-source-invalid');
  }
  const spec = yield* getSystemSpec(key.systemId, {
    serviceName: key.serviceName,
    serviceVersion: request.receivingServiceVersion,
  });
  const owner = spec.services[key.serviceName];
  const receivingRelease = owner?.releases[request.receivingServiceVersion];
  if (
    receivingRelease === undefined ||
    receivingRelease.version === command.serviceVersion
  ) {
    return yield* makeZerospinError('service-replay-adapter-binding-invalid');
  }
  const receivingContractVersion =
    command.kind === 'actor'
      ? owner?.actorVersions[command.actorName]?.[
          receivingRelease.actors[command.actorName] ?? 0
        ]?.contracts[command.commandName]
      : receivingRelease.contracts[command.commandName];
  const receivingContract =
    receivingContractVersion === undefined
      ? undefined
      : owner?.contractVersions[command.commandName]?.[
          receivingContractVersion
        ];
  const hosted: unknown = Reflect.get(env, 'ZEROSPIN_HOSTED_SERVICE_DISPATCH');
  const binding: unknown =
    hosted ?? Reflect.get(env, getOwnerReleaseBindingName(command));
  if (
    typeof binding !== 'object' ||
    binding === null ||
    !('fetch' in binding) ||
    typeof binding.fetch !== 'function'
  ) {
    return yield* makeZerospinError(
      'service-replay-adapter-source-unavailable',
    );
  }
  const {
    serviceIndex: _serviceIndex,
    outcome,
    payloadFailure: _payloadFailure,
    ...input
  } = command;
  const sourceRequest = {
    command: { ...input, payload: command.payload },
    receivingContractVersion:
      receivingContract !== undefined &&
      receivingContract.external === undefined
        ? receivingContract.version
        : null,
    finalizedAt: outcome.finalizedAt,
  } satisfies typeof ServiceReplaySourceRequestSchema.Type;
  const fetch = binding.fetch.bind(binding);
  const result = yield* Effect.tryPromise({
    try: async signal => {
      const response: Response = await fetch(
        new URL(PREPARE_SERVICE_REPLAY_PATH, 'https://owner-release.internal'),
        {
          method: 'POST',
          body: serialize(sourceRequest),
          signal,
          ...(hosted
            ? {
                headers: {
                  'X-Zerospin-Service-Name': command.serviceName,
                  'X-Zerospin-Service-Version': String(command.serviceVersion),
                },
              }
            : {}),
        },
      );
      if (!response.ok) {
        throw new Error('Service replay source returned ' + response.status);
      }
      return deserialize(await response.text());
    },
    catch: error =>
      ensureZerospinError({
        code: 'service-replay-adapter-source-failed',
        error,
      }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: '3 seconds',
      orElse: () =>
        Effect.fail(makeZerospinError('service-replay-adapter-source-timeout')),
    }),
  );
  return yield* Schema.decodeUnknownEffect(PreparedServiceReplayInputSchema)(
    result,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'service-replay-adapter-output-invalid',
      prefix: 'Invalid Service replay adapter output',
    }),
  );
});
