import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { adaptPayload } from '@zerospin/core/contracts/decodeAndAdaptPayload/adaptPayload/adaptPayload';
import { decodeAndAdaptPayload } from '@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload';
import { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { isOrdinaryContract } from '@zerospin/core/contracts/make/constructContractRelease';
import { prepareContractClaims } from '@zerospin/core/contracts/prepare/prepareContractClaims';
import { resolveContractVersion } from '@zerospin/core/contracts/resolveContractVersion';
import { withCommandEvaluationClock } from '@zerospin/core/contracts/withCommandEvaluationClock';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { makeZerospinError } from '@zerospin/error';
import { runSynchronousExit } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { decodeAndValidateActorClaims } from '../ServiceVersionRepo/utils/decodeAndValidateActorClaims.js';

export const ServiceReplaySourceRequestSchema = Schema.Struct({
  command: EncodedServiceCommandSchema,
  receivingContractVersion: Schema.NullOr(VersionSchema),
  finalizedAt: Schema.Date,
});

export const PreparedServiceReplayInputSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Prepared'),
    sourceHasExtension: Schema.Boolean,
    sourcePayload: Schema.Record(Schema.String, Schema.Unknown),
    adaptedPayload: Schema.String,
    actorClaims: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  }),
  Schema.Struct({ _tag: Schema.Literal('Unsupported') }),
]);

export type IPreparedServiceReplayInput =
  typeof PreparedServiceReplayInputSchema.Type;

/** Verify the exact source grant and prepare the encoded payload for the receiving release. */
export function prepareServiceReplaySource(
  release: IAnyServiceRelease,
  request: typeof ServiceReplaySourceRequestSchema.Type,
) {
  const { command, receivingContractVersion, finalizedAt } = request;
  const preparation = Effect.gen(function* () {
    const actor =
      command.kind === 'actor' ? release.actors[command.actorName] : undefined;
    // The stable ServiceChain already validated the Agent grant at admission.
    const contract =
      command.kind === 'actor'
        ? actor?.version === command.actorVersion
          ? actor.contracts[command.commandName]
          : undefined
        : release.contracts[command.commandName];
    if (
      command.serviceName !== release.name ||
      command.serviceVersion !== release.version ||
      contract === undefined ||
      !isOrdinaryContract(contract) ||
      (command.kind !== 'actor' && contract.claims !== undefined) ||
      contract.version !== command.contractVersion
    ) {
      return yield* makeZerospinError('service-replay-adapter-source-invalid');
    }
    const actorClaims = yield* decodeAndValidateActorClaims(command, actor);
    yield* prepareContractClaims(contract, actorClaims);
    const sourcePayload = yield* decodeAndAdaptPayload(contract, { command });
    let adaptedPayload = command.payload;
    if (
      receivingContractVersion !== null &&
      receivingContractVersion < command.contractVersion
    ) {
      if (
        resolveContractVersion(contract, receivingContractVersion) === undefined
      ) {
        return { _tag: 'Unsupported' } as const;
      }
      const adapted = yield* adaptPayload(contract, {
        fromVersion: command.contractVersion,
        toVersion: receivingContractVersion,
        payload: sourcePayload,
      });
      adaptedPayload = yield* encodePayload(contract, {
        version: receivingContractVersion,
        payload: adapted,
      });
    }
    return {
      _tag: 'Prepared',
      sourceHasExtension: release.extensions[command.commandName] !== undefined,
      sourcePayload,
      adaptedPayload,
      actorClaims: actorClaims ?? null,
    } satisfies IPreparedServiceReplayInput;
  }).pipe(
    Effect.catchIf(
      failure => failure === DownAdapterRefused,
      () => Effect.succeed({ _tag: 'Unsupported' } as const),
    ),
  );
  return runSynchronousExit(
    withCommandEvaluationClock(preparation, finalizedAt),
    Effect.runSyncExit,
  );
}
