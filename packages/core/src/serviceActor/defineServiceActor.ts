import * as Schema from 'effect/Schema';

/** Stable name shared by the versions of an admitted service view. */
export function defineServiceActor<const NAME extends string>(props: {
  name: NAME;
}) {
  Schema.decodeUnknownSync(Schema.Struct({ name: Schema.NonEmptyString }), {
    onExcessProperty: 'error',
  })(props);
  const { name } = props;

  return { name };
}
