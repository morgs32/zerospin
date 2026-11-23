import type { IDb } from '@zerospin/core/drizzle/types';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type { Connection } from 'partyserver';

import { makeConnectionCapabilities } from './connectionCapabilities.js';
import type { IServiceConnectionState } from './connectionState.js';
import { disposeConnection } from './disposeConnection.js';
import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';

/** Install the admitted selection and attachment together in one turn, compensating every failed installation. */
export const installConnection = Effect.fn(
  'ServiceActorVersionChain.installConnection',
)(function* (props: {
  db: IDb;
  connection: Connection<IServiceConnectionState>;
  lock: IServiceSessionLock;
  admission: Extract<IServiceConnectionState, { phase: 'awaiting-resume' }>;
}) {
  const { db, connection, lock, admission } = props;
  yield* Effect.gen(function* () {
    const row =
      yield* serviceActorVersionChainDbConfig.tables.connectionLocks.encodeRow({
        connectionId: connection.id,
        ...makeConnectionCapabilities(lock),
      });
    db.insert(serviceActorVersionChainDbConfig.schema.connectionLocks)
      .values(row)
      .run();
    // No yield separates SQL insertion from attachment installation.
    connection.setState(admission);
  }).pipe(
    Effect.onExit(exit =>
      Exit.isFailure(exit)
        ? Effect.sync(() =>
            disposeConnection({
              db,
              connection,
              code: 1011,
              reason: 'service-session-installation-failed',
            }),
          )
        : Effect.void,
    ),
  );
});
