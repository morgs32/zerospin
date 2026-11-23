import { makeAggregatePendingReader } from '@zerospin/browser/sessionReplica/makeAggregatePendingReader';
import { hasAggregateNodeCheckpoint } from '@zerospin/core/AggregateNode/hasAggregateNodeCheckpoint';
import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type { IAnyAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeSqliteDrizzle } from '@zerospin/core/drizzle/make/makeSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { makeZerospinError } from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  makeIdFromAbbreviation,
} from '@zerospin/shapes';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { IAggregateNativeNodeOwner } from './openAggregateNativeNodeOwner.ts';
import { openNativeSqlite } from './openNativeSqlite.ts';

/** Bind the initialized Node before opening its exact-key fixed replica storage. */
export const openPersistentAggregateReplica = Effect.fn(
  'openPersistentAggregateReplica',
)(function* (props: {
  sessionDefinition: IAnyAggregateSessionDefinition;
  claims: Readonly<Record<string, unknown>>;
  owner: Pick<IAggregateNativeNodeOwner, 'node' | 'definition' | 'key'>;
  signal: AbortSignal;
}) {
  const { sessionDefinition, claims, owner, signal } = props;
  const models = sessionDefinition.models;
  const lock = makeAggregateSessionSpec(sessionDefinition).aggregateSessionLock;
  const snapshot = yield* Effect.promise(() => owner.node.snapshot());
  const identity = snapshot.identity;
  if (
    !hasAggregateNodeCheckpoint(snapshot.metadata) ||
    snapshot.metadata.aggregateId !== identity.aggregateId ||
    !isEqual(identity, owner.definition.identity) ||
    !isEqual(owner.definition.lock, lock) ||
    identity.systemName !== sessionDefinition.systemName ||
    identity.aggregateName !== sessionDefinition.aggregateName ||
    identity.aggregateVersion !== sessionDefinition.aggregateVersion ||
    identity.sessionName !== sessionDefinition.sessionName ||
    identity.actorName !== sessionDefinition.actorName ||
    identity.actorVersion !== sessionDefinition.actorVersion ||
    claims.aggregateId !== identity.aggregateId ||
    (yield* Effect.promise(() => sessionKey(identity))) !== owner.key
  ) {
    return yield* Effect.fail(
      makeZerospinError('native-session-identity-mismatch'),
    );
  }
  assertSessionClaims(claims, identity.claims);
  const dbConfig = makeResourceDbConfig({
    models,
    otherTables: aggregateSessionRepoDbConfig.tables,
  });
  const client = yield* Effect.acquireRelease(
    Effect.sync(() => openNativeSqlite(`session_${owner.key}`)),
    owned => Effect.sync(() => owned.sqlite3.close(owned.db)),
  );
  if (signal.aborted) return yield* Effect.interrupt;
  const db = makeSqliteDrizzle(client, dbConfig);
  const version = db.values<[number]>(sql`PRAGMA user_version`)[0]?.[0] ?? 0;
  const tables = db.values<[string]>(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
  );
  if (tables.length > 0 && version !== 11) {
    return yield* Effect.fail(
      makeZerospinError('native-session-storage-reset-required'),
    );
  }
  const metadataRows =
    tables.length === 0
      ? []
      : db.select().from(dbConfig.schema.sessionMetadata).all();
  if (metadataRows.length > 1) {
    return yield* makeZerospinError('session-metadata-ambiguous');
  }
  const storedMetadata = metadataRows[0];
  const retained =
    storedMetadata === undefined
      ? undefined
      : yield* aggregateSessionRepoDbConfig.tables.sessionMetadata.decodeRow(
          storedMetadata,
        );
  if (tables.length > 0 && retained === undefined) {
    return yield* Effect.fail(
      makeZerospinError('native-session-storage-reset-required'),
    );
  }
  const sessionId =
    retained === undefined
      ? yield* makeIdFromAbbreviation({ abbreviation: 'sesn' })
      : yield* Schema.decodeUnknownEffect(makeAbbreviationIdSchema('sesn'))(
          retained.sessionId,
        );
  yield* provisionDb({ db, definition: dbConfig.definition });
  if (tables.length === 0) {
    db.run(sql`PRAGMA user_version = 11`);
  }
  const readPending = makeAggregatePendingReader({ db });
  return {
    definition: sessionDefinition,
    models,
    lock,
    dbConfig,
    db,
    client,
    sessionId,
    readPending,
  };
});
