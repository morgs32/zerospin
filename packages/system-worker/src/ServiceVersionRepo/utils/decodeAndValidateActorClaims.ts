import type { RetainedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IAnyServiceActorRelease } from '@zerospin/core/serviceActor/types';
import { mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Schema from 'effect/Schema';

/** Validate all retained claims with the exact historical Service actor schema. */
export const decodeAndValidateActorClaims = makeFn(
  'ServiceVersionRepo.decodeAndValidateActorClaims',
)(function* (
  command: typeof RetainedServiceCommandSchema.Type,
  actor: IAnyServiceActorRelease | undefined,
) {
  if (actor === undefined || command.kind !== 'actor') return undefined;
  return yield* Schema.decodeUnknownEffect(actor.identity.claimsSchema)(
    command.claims,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'service-command-claims-invalid',
      prefix: 'Invalid retained actor Origin',
    }),
  );
});
