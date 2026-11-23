import type { IAnyAggregateActorRelease } from '@zerospin/core/aggregateActor/types';
import type { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Schema from 'effect/Schema';

/** Decode claims with the recorded actor's schema and enforce aggregate identity. */
export const decodeAndValidateActorClaims = makeFn(
  'AggregateVersionRepo.decodeAndValidateActorClaims',
)(function* (
  command: typeof EncodedAggregateCommandSchema.Type,
  actor: IAnyAggregateActorRelease | undefined,
) {
  if (actor === undefined || command.kind !== 'actor') return undefined;
  const claims = yield* Schema.decodeUnknownEffect(actor.identity.claimsSchema)(
    command.claims,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'command-claims-unsupported',
      prefix: 'Invalid retained actor identity',
    }),
  );
  if (claims.aggregateId !== command.aggregateId) {
    return yield* makeZerospinError('aggregate-command-scope-mismatch');
  }
  return claims;
});
