import {
  RetainedServiceCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { getCommandPayloadFailure } from '@zerospin/system-worker/getCommandPayloadFailure';
import { ServiceChains } from '@zerospin/system-worker/repoServices/ServiceChains';
import type { IServiceCommandOccurrence } from '@zerospin/system-worker/ServiceChain/types';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

/** Use the admitted input when available; pushed replay and index-only reads must first consult the Chain. */
export const validateCommandIdentity = Effect.fn(
  'ServiceVersionRepo.validateCommandIdentity',
)(function* (
  admittedCommand: IServiceCommandOccurrence | undefined,
  retained: IServiceCommandOccurrence,
  key: {
    systemId: string;
    serviceName: string;
    serviceVersion: number;
  },
) {
  const issuer = env.ZEROSPIN_HOSTED_RELEASE_RPC;
  const input =
    admittedCommand ??
    (yield* Effect.gen(function* () {
      const afterIndex = retained.serviceIndex - 1;
      const maxIndex = retained.serviceIndex;
      const page =
        issuer !== undefined
          ? yield* Effect.promise(async () => {
              using rpc = await issuer.getReleaseRpc();
              return await rpc.readReplayPage(afterIndex, maxIndex);
            }).pipe(Effect.flatMap(readRpcEnvelope))
          : yield* Effect.gen(function* () {
              const chain = yield* (yield* ServiceChains).getRepo({ key });
              return yield* Effect.promise(async () => {
                using queue = await chain.replayCommandsFanout;
                return await queue.getPage({ afterIndex, maxIndex });
              }).pipe(Effect.flatMap(readRpcEnvelope));
            });
      return page.rows[0] ?? null;
    }));
  if (
    input === null ||
    input.serviceIndex !== retained.serviceIndex ||
    input.serviceName !== key.serviceName
  ) {
    return yield* makeZerospinError('service-command-identity-mismatch');
  }
  yield* Schema.decodeUnknownEffect(Schema.toType(ServiceChainedCommandSchema))(
    { ...(admittedCommand ?? retained), dispositionChainHash: null },
  ).pipe(
    mapParseError({
      code: 'service-command-row-invalid',
      prefix: 'Invalid delivered occurrence',
    }),
  );
  const decodeInput = (command: IServiceCommandOccurrence) =>
    Schema.decodeUnknownEffect(Schema.toType(RetainedServiceCommandSchema))(
      command,
    ).pipe(
      mapParseError({
        code: 'service-command-identity-invalid',
        prefix: 'Invalid admitted command',
      }),
    );
  if (
    !isEqual(yield* decodeInput(retained), yield* decodeInput(input)) ||
    !isEqual(
      getCommandPayloadFailure(retained),
      getCommandPayloadFailure(input),
    )
  ) {
    return yield* makeZerospinError('service-command-identity-mismatch');
  }
  if (
    input.outcome !== null &&
    retained.outcome !== null &&
    input.outcome.finalizedAt.getTime() !==
      retained.outcome.finalizedAt.getTime()
  ) {
    return yield* makeZerospinError('service-command-identity-mismatch');
  }
});
