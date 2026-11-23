import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { systemRepoDbConfig } from './systemRepoDbConfig.js';

export function hasAcceptedSystemSpec(
  db: IDb<typeof systemRepoDbConfig>,
  hash: string,
) {
  const table = systemRepoDbConfig.schema.acceptedSystemSpecs;
  return (
    db
      .select({ hash: table.hash })
      .from(table)
      .where(eq(table.hash, hash))
      .get() !== undefined
  );
}

/** Require one previously accepted whole SystemSpec without comparing its parts. */
export const requireAcceptedSystemSpec = Effect.fn(
  'SystemRepo.requireAcceptedSystemSpec',
)(function* (db: IDb<typeof systemRepoDbConfig>, input: string) {
  const hash = yield* Schema.decodeUnknownEffect(
    Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  )(input).pipe(
    mapParseError({
      code: 'system-spec-invalid',
      prefix: 'Invalid SystemSpec hash',
    }),
  );
  if (!hasAcceptedSystemSpec(db, hash)) {
    return yield* makeZerospinError({
      code: 'system-spec-not-accepted',
      message: `SystemSpec ${hash} has not been accepted`,
    });
  }
});
