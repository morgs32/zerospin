import { mapParseError } from '@zerospin/error';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IContractRelease } from '../types.ts';

export function prepareContractClaims<CONTRACT extends IContractRelease>(
  contract: CONTRACT,
  claims: Readonly<Record<string, unknown>> | null | undefined,
): Effect.Effect<
  [NonNullable<CONTRACT['claims']>] extends [never]
    ? Readonly<Record<string, unknown>> | null
    : NonNullable<CONTRACT['claims']>['Type'],
  Effect.Error<ReturnType<typeof prepareClaims>>
>;
export function prepareContractClaims(
  contract: IContractRelease,
  claims: Readonly<Record<string, unknown>> | null | undefined,
) {
  return prepareClaims(contract, claims);
}

function prepareClaims(
  contract: IContractRelease,
  claims: Readonly<Record<string, unknown>> | null | undefined,
) {
  return contract.claims === undefined
    ? Effect.succeed(claims ?? null)
    : Schema.decodeUnknownEffect(Schema.toType(contract.claims))(claims).pipe(
        Effect.updateContext<never, never>(() => Context.empty()),
        mapParseError({
          code: 'contract-claims-invalid',
          prefix: 'Invalid contract claims',
        }),
      );
}
