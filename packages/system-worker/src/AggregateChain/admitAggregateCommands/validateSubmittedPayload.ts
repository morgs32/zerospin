import type { IContractRelease } from '@zerospin/core/contracts/types';
import { mapParseError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

/** Validate the submitted version; its transformations never replace retained payload bytes. */
export function validateSubmittedPayload(
  contract: IContractRelease,
  payload: string,
) {
  return Schema.decodeUnknownEffect(
    Schema.fromJsonString(makeEffectSchema(contract.payload)),
  )(payload, {
    onExcessProperty: 'error',
    concurrency: 1,
  }).pipe(
    mapParseError({
      code: 'aggregate-chain-command-invalid',
      prefix: 'Invalid aggregate payload',
    }),
  );
}
