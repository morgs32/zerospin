import {
  makeAbbreviationIdSchema,
  type IInferIdFromAbbreviation,
} from '@zerospin/shapes';
import type { Schema } from 'effect';

export function makeIdSchema<const ABBREVIATION extends string>(
  model: Readonly<{ abbreviation: ABBREVIATION }>,
): Schema.Codec<
  IInferIdFromAbbreviation<ABBREVIATION>,
  IInferIdFromAbbreviation<ABBREVIATION>
> {
  const { abbreviation } = model;

  return makeAbbreviationIdSchema(abbreviation);
}
