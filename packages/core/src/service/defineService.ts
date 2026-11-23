import * as Schema from 'effect/Schema';

declare const definitionBrand: unique symbol;
export interface IServiceDefinition<NAME extends string = string> {
  readonly name: NAME;
  readonly [definitionBrand]: true;
}
const definitions = new WeakSet<object>();

export function isServiceDefinition(
  value: unknown,
): value is IServiceDefinition {
  return typeof value === 'object' && value !== null && definitions.has(value);
}

export function defineService<const NAME extends string>(props: {
  name: NAME;
}): IServiceDefinition<NAME> {
  Schema.decodeUnknownSync(Schema.Struct({ name: Schema.NonEmptyString }), {
    onExcessProperty: 'error',
  })(props);
  const { name } = props;

  const definition = { name };
  definitions.add(definition);
  return Schema.decodeUnknownSync(
    Schema.declare<IServiceDefinition<NAME>>(
      (value): value is IServiceDefinition<NAME> => value === definition,
    ),
  )(definition);
}
