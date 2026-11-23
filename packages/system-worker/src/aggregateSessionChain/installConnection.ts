import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type { Connection } from 'partyserver';

import type { IAggregateProjectionKey } from '../aggregateProjection/resolveAggregateProjectionView.js';

import { aggregateSessionChainDbConfig } from './aggregateSessionChainDbConfig.js';
import { makeConnectionCapabilities } from './connectionCapabilities.js';
import type { IAggregateSessionConnectionState } from './connectionState.js';
import { disposeConnection } from './disposeConnection.js';

/** Retain Actor capabilities, install attachment state, and dispose every failed installation. */
export const installConnection = Effect.fn(
  'AggregateSessionChain.installConnection',
)(function* (props: {
  db: IDb;
  key: IAggregateProjectionKey;
  connection: Connection<IAggregateSessionConnectionState>;
  lock: IAggregateSessionLock;
  admission: Extract<
    IAggregateSessionConnectionState,
    { phase: 'awaiting-resume' }
  >;
}) {
  const { db, key, connection, lock, admission } = props;
  yield* Effect.gen(function* () {
    if ('actorName' in key) {
      const row =
        yield* aggregateSessionChainDbConfig.tables.connectionLocks.encodeRow({
          connectionId: connection.id,
          ...makeConnectionCapabilities(lock),
        });
      db.insert(aggregateSessionChainDbConfig.schema.connectionLocks)
        .values(row)
        .run();
    }
    // No yield separates Actor SQL insertion from attachment installation.
    connection.setState(admission);
  }).pipe(
    Effect.onExit(exit =>
      Exit.isFailure(exit)
        ? Effect.sync(() =>
            disposeConnection({
              db,
              key,
              connection,
              code: 1011,
              reason: 'aggregate-session-installation-failed',
            }),
          )
        : Effect.void,
    ),
  );
});
