import * as Schema from 'effect/Schema';

const modelIdentity = Symbol.for('@zerospin/core/Model');
export class Model {
  readonly [modelIdentity] = true;
}
export function defineModel<
  const NAME extends string,
  const ABBREVIATION extends string,
>(props: { name: NAME; abbreviation: ABBREVIATION }) {
  const { name, abbreviation } = props;
  Schema.decodeUnknownSync(
    Schema.Struct({
      name: Schema.NonEmptyString,
      abbreviation: Schema.NonEmptyString,
    }),
    {
      onExcessProperty: 'error',
    },
  )(props);
  return { name, abbreviation };
}
