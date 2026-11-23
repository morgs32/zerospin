import {
  AggregateChainedCommandSchema,
  RetainedAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import type { IAdmittedAggregateCommand } from '@zerospin/system-worker/AggregateChain/types';
import type { IEvaluatedAggregateCommand } from '@zerospin/system-worker/AggregateVersionChain/evaluatedAggregateCommand';
import { getCommandPayloadFailure } from '@zerospin/system-worker/getCommandPayloadFailure';
import { AggregateChains } from '@zerospin/system-worker/repoServices/AggregateChains';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

/** Use the admitted input when available; pushed replay and index-only reads must first consult the Chain. */
export const validateCommandIdentity = Effect.fn(
  'AggregateVersionRepo.validateCommandIdentity',
)(function* (
  admittedCommand: IAdmittedAggregateCommand | undefined,
  retained: IAdmittedAggregateCommand | IEvaluatedAggregateCommand,
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: number;
  },
) {
  const input =
    admittedCommand ??
    (yield* Effect.gen(function* () {
      const chain = yield* (yield* AggregateChains).getRepo({ key });
      return yield* Effect.promise(() =>
        chain.getAggregateCommand({ aggregateIndex: retained.aggregateIndex }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
    }));
  if (
    input === null ||
    (admittedCommand === undefined && input.outcome === null) ||
    input.aggregateIndex !== retained.aggregateIndex ||
    input.aggregateName !== key.aggregateName ||
    input.aggregateId !== key.aggregateId
  ) {
    return yield* makeZerospinError('aggregate-command-identity-mismatch');
  }
  yield* Schema.decodeUnknownEffect(
    Schema.toType(AggregateChainedCommandSchema),
  )({ ...(admittedCommand ?? retained), dispositionChainHash: null }).pipe(
    mapParseError({
      code: 'aggregate-command-row-invalid',
      prefix: 'Invalid delivered command',
    }),
  );
  const decodeInput = (
    command: IAdmittedAggregateCommand | IEvaluatedAggregateCommand,
  ) =>
    Schema.decodeUnknownEffect(Schema.toType(RetainedAggregateCommandSchema))(
      command,
    ).pipe(
      mapParseError({
        code: 'aggregate-command-identity-invalid',
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
    return yield* makeZerospinError('aggregate-command-identity-mismatch');
  }
  if (
    input.outcome !== null &&
    retained.outcome !== null &&
    !isEqual(input.outcome.finalizedAt, retained.outcome.finalizedAt)
  ) {
    return yield* makeZerospinError('aggregate-command-identity-mismatch');
  }
});
