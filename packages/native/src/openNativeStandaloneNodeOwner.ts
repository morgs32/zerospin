import { encodeStandaloneClaims } from '@zerospin/browser/StandaloneNode/standaloneIdentity';
import { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { hasAggregateNodeCheckpoint } from '@zerospin/core/AggregateNode/hasAggregateNodeCheckpoint';
import { makeAggregateNodeOptimisticView } from '@zerospin/core/AggregateNode/makeAggregateNodeOptimisticView';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import {
  GENESIS_EXECUTED_PREIMAGE,
  hashDispositionChain,
} from '@zerospin/core/contracts/dispositionChainHash';
import { makeAsyncContractReadDb } from '@zerospin/core/contracts/make/makeContractReadDb';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { hashNodeValue, sessionKey } from '@zerospin/core/Node/sessionKey';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { makeNativeNodeDb } from './makeNativeNodeDb.ts';
import { openNativeSqlite } from './openNativeSqlite.ts';

/** Open the only local owner in the directory already leased by Swift. */
export const openNativeStandaloneNodeOwner = Effect.fn(
  'openNativeStandaloneNodeOwner',
)(function* (props: {
  sessionDefinition: IAggregateSessionDefinition;
  aggregateId: string;
}) {
  const { sessionDefinition, aggregateId } = props;
  const { claims, encoded } = encodeStandaloneClaims(sessionDefinition, {
    aggregateId,
  });
  const { aggregateSessionLock: lock } =
    makeAggregateSessionSpec(sessionDefinition);
  const definition = {
    identity: {
      apiUrl: '',
      publishableKey: '',
      systemName: sessionDefinition.systemName,
      aggregateName: sessionDefinition.aggregateName,
      aggregateVersion: sessionDefinition.aggregateVersion,
      aggregateId,
      actorName: sessionDefinition.actorName,
      actorVersion: sessionDefinition.actorVersion,
      sessionName: sessionDefinition.sessionName,
      claims: encoded,
      definitionHash: yield* Effect.promise(() => hashNodeValue(lock)),
    },
    lock,
  };
  const key = yield* Effect.promise(() => sessionKey(definition.identity));
  // The file name stays fixed so a changed binding meets the retained identity check.
  const client = yield* Effect.acquireRelease(
    Effect.sync(() => openNativeSqlite('standalone_node')),
    owned => Effect.sync(() => owned.sqlite3.close(owned.db)),
  );
  const { db, withRelations } = makeNativeNodeDb(client);
  const context = yield* Effect.context<unknown>();
  const view = yield* Effect.acquireRelease(
    Effect.promise(() =>
      makeAggregateNodeOptimisticView({
        sessionDefinition,
        openMemory: async () => openNativeSqlite(':memory:'),
        runSync: program => Effect.runSyncWith(context)(program),
      }),
    ),
    owned => Effect.sync(() => owned.close()),
  );
  const node = new AggregateNode(db, definition, view, sessionDefinition, {
    storageKey: key,
    validate: async command => {
      const submitted = Schema.decodeUnknownSync(
        sessionDefinition.claimsSchema,
      )(command.claims);
      if (!isEqual(submitted, claims)) {
        throw makeZerospinError('node-command-identity-mismatch');
      }
    },
  });
  yield* Effect.addFinalizer(() => Effect.promise(() => node.close()));
  yield* Effect.promise(() => node.initialize());
  yield* Effect.promise(() => node.assertStandaloneRetainedCommands());
  const initial = yield* Effect.promise(() =>
    node.snapshot({ authoritative: true }),
  );
  if (!hasAggregateNodeCheckpoint(initial.metadata)) {
    const dispositionChainHash = yield* Effect.promise(() =>
      hashDispositionChain(GENESIS_EXECUTED_PREIMAGE),
    );
    yield* Effect.promise(() =>
      node.initializeBaseline({
        resources: [],
        aggregateIndex: 0,
        dispositionChainHash,
        resolvedThrough: 0,
      }),
    );
  }
  const models = sessionDefinition.models;
  const resources = withRelations(makeResourceDbConfig({ models }).relations);
  const readDb = makeAsyncContractReadDb({ query: resources.query, models });
  return {
    db,
    readDb,
    node,
    key,
    claims,
    definition,
    nodeId: initial.metadata.nodeId,
  };
});
