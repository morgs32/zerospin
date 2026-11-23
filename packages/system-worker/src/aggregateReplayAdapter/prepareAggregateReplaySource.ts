import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { adaptPayload } from '@zerospin/core/contracts/decodeAndAdaptPayload/adaptPayload/adaptPayload';
import { decodeAndAdaptPayload } from '@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload';
import { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { isOrdinaryContract } from '@zerospin/core/contracts/make/constructContractRelease';
import { prepareContractClaims } from '@zerospin/core/contracts/prepare/prepareContractClaims';
import { resolveContractVersion } from '@zerospin/core/contracts/resolveContractVersion';
import { withCommandEvaluationClock } from '@zerospin/core/contracts/withCommandEvaluationClock';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { makeZerospinError } from '@zerospin/error';
import { runSynchronousExit } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { decodeAndValidateActorClaims } from '../AggregateVersionRepo/utils/decodeAndValidateActorClaims.js';
import type { IPreparedAggregateReplayPayload } from '../AggregateVersionRepo/utils/resolveAggregateExecution.js';

export const AggregateReplaySourceRequestSchema = Schema.Struct({
  command: EncodedAggregateCommandSchema,
  receivingContractVersion: Schema.NullOr(VersionSchema),
  finalizedAt: Schema.Date,
});
export type IAggregateReplaySourceRequest =
  typeof AggregateReplaySourceRequestSchema.Type;

/** Verify the original grant and actor claims before preparing input for replay. */
export function prepareAggregateReplaySource(
  release: IAnyAggregateRelease,
  request: IAggregateReplaySourceRequest,
) {
  const { command, finalizedAt, receivingContractVersion } = request;
  const preparation = Effect.gen(function* () {
    const actor =
      command.kind === 'actor' ? release.actors[command.actorName] : undefined;
    // The stable AggregateChain already validated the Agent grant at admission.
    const contract =
      command.kind === 'actor'
        ? actor?.version === command.actorVersion
          ? actor.contracts[command.commandName]
          : undefined
        : release.contracts[command.commandName];
    if (
      command.aggregateName !== release.name ||
      command.aggregateVersion !== release.version ||
      contract === undefined ||
      !isOrdinaryContract(contract) ||
      (command.kind !== 'actor' && contract.claims !== undefined) ||
      contract.version !== command.contractVersion
    ) {
      return yield* makeZerospinError(
        'aggregate-replay-adapter-source-invalid',
      );
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
        return { _tag: 'Refused' } as const;
      }
      const payload = yield* adaptPayload(contract, {
        fromVersion: command.contractVersion,
        toVersion: receivingContractVersion,
        payload: sourcePayload,
      });
      adaptedPayload = yield* encodePayload(contract, {
        version: receivingContractVersion,
        payload,
      });
    }
    return {
      _tag: 'Prepared',
      sourcePayload,
      adaptedPayload,
      actorClaims: actorClaims ?? null,
      sourceHasExtension: release.extensions[command.commandName] !== undefined,
    } satisfies IPreparedAggregateReplayPayload;
  }).pipe(
    Effect.catchIf(
      failure => failure === DownAdapterRefused,
      () => Effect.succeed({ _tag: 'Refused' } as const),
    ),
  );
  return runSynchronousExit(
    withCommandEvaluationClock(preparation, finalizedAt),
    Effect.runSyncExit,
  );
}
