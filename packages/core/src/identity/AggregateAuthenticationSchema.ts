import * as Schema from 'effect/Schema';

export const AggregateAuthenticationSchema = Schema.Struct({
  credentialsSchema: Schema.declare(
    (value: unknown): value is Schema.Codec<unknown, unknown> =>
      Schema.isSchema(value),
  ),
  authenticate: Schema.declare(
    (value: unknown): value is (...args: never[]) => unknown =>
      typeof value === 'function',
  ),
});
