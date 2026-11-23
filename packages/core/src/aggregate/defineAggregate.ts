import * as Schema from 'effect/Schema';

declare const definitionBrand: unique symbol;
export interface IAggregateDefinition<NAME extends string = string> {
  readonly name: NAME;
  readonly [definitionBrand]: true;
}
const definitions = new WeakSet<object>();

export function isAggregateDefinition(
  value: unknown,
): value is IAggregateDefinition {
  return typeof value === 'object' && value !== null && definitions.has(value);
}

export function defineAggregate<const NAME extends string>(props: {
  name: NAME;
}): IAggregateDefinition<NAME> {
  Schema.decodeUnknownSync(Schema.Struct({ name: Schema.NonEmptyString }), {
    onExcessProperty: 'error',
  })(props);
  const { name } = props;

  const definition = { name };
  definitions.add(definition);
  return Schema.decodeUnknownSync(
    Schema.declare<IAggregateDefinition<NAME>>(
      (value): value is IAggregateDefinition<NAME> => value === definition,
    ),
  )(definition);
}
