import type { IDb } from '@zerospin/core/drizzle/types';
import { filterServiceBrowserCommand } from '@zerospin/core/serviceSession/filterServiceBrowserCommand';
import { System } from '@zerospin/core/system/System';
import * as Effect from 'effect/Effect';
import type { Connection } from 'partyserver';

import type { appendExposedCommands } from '../ServiceActorVersionChain/appendExposedCommands.js';
import type { IServiceConnectionState } from '../ServiceActorVersionChain/connectionState.js';
import { disposeConnection } from '../ServiceActorVersionChain/disposeConnection.js';
import { readServiceConnectionCapabilities } from '../ServiceActorVersionChain/readServiceConnectionCapabilities.js';

import type { IServiceProjectionKey } from './resolveServiceActorView.js';

/** Isolate every bound-capability read, socket send and disposal from durable append acknowledgement. */
export const broadcastServiceCommands = Effect.fn(
  'ServiceProjection.broadcastCommands',
)(function* (props: {
  db: IDb;
  key: IServiceProjectionKey;
  broadcasts: Effect.Success<ReturnType<typeof appendExposedCommands>>;
  connections: () => Iterable<Connection<IServiceConnectionState>>;
}) {
  const { db, key, broadcasts, connections } = props;
  const system = yield* System;
  for (const { output, owner } of broadcasts) {
    for (const connection of connections()) {
      yield* Effect.sync(() => {
        const admitted = readServiceConnectionCapabilities({
          db,
          key,
          system,
          connection,
        });
        if (admitted === null) {
          disposeConnection({
            db,
            connection,
            code: 4003,
            reason: 'state-required',
            message: {
              type: 'state-required',
              reason: 'connection-state-invalid',
            },
          });
          return;
        }
        if (admitted.state.phase !== 'live') return;
        connection.send(
          JSON.stringify({
            type: 'commands',
            commands: [
              filterServiceBrowserCommand(
                output,
                admitted.models,
                admitted.state,
                owner,
              ),
            ],
          }),
        );
      }).pipe(
        Effect.catchCause(() =>
          Effect.sync(() => {
            try {
              disposeConnection({
                db,
                connection,
                code: 1011,
                reason: 'service-session-output-send-failed',
              });
            } catch {
              /* Socket cleanup cannot reject a committed history append. */
            }
          }),
        ),
      );
    }
  }
});
