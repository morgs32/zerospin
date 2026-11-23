import * as Schema from 'effect/Schema';

function schema<
  const CODE extends string,
  DATA extends Schema.Codec<unknown, unknown>,
>(definition: { code: CODE; data: DATA }) {
  return Schema.Struct({
    _tag: Schema.tag('ZerospinSuccess'),
    code: Schema.tag(definition.code),
    data: definition.data,
  });
}

export const ZerospinSuccess = { schema };
