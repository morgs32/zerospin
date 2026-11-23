import * as Schema from 'effect/Schema';

import { IdentitySchema } from '../identity/make/makeActorIdentity/IdentitySchema/IdentitySchema.ts';
import type { IActorIdentity } from '../identity/make/makeActorIdentity/makeActorIdentity.ts';

/** The actor boundary requires complete identity codecs, route, and SQL capability. */
export const ActorIdentitySchema = Schema.Struct({
  ...IdentitySchema.fields,
  sql: Schema.declare(
    (value): value is IActorIdentity['sql'] =>
      typeof value === 'object' &&
      value !== null &&
      'placeholder' in value &&
      typeof value.placeholder === 'function',
  ),
}).check(
  Schema.makeFilter(
    value =>
      Schema.is(IdentitySchema)({
        claimsSchema: value.claimsSchema,
        identitySchema: value.identitySchema,
        pattern: value.pattern,
      }) || 'Invalid actor identity declaration',
  ),
);
