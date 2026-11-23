import * as Schema from 'effect/Schema';

import type { IInferIdFromAbbreviation } from './types.ts';

export function makeAbbreviationIdSchema<ABBREVIATION extends string>(
  abbreviation: ABBREVIATION,
): Schema.Codec<
  IInferIdFromAbbreviation<ABBREVIATION>,
  IInferIdFromAbbreviation<ABBREVIATION>
> {
  return Schema.String.check(
    Schema.isStartingWith(`${abbreviation}_`),
  ).annotate({
    description: `Expected a unique identifier prefixed with "${abbreviation}_"`,
    examples: [`${abbreviation}_123e4567`],
  }) as Schema.Codec<
    IInferIdFromAbbreviation<ABBREVIATION>,
    IInferIdFromAbbreviation<ABBREVIATION>
  >;
}
