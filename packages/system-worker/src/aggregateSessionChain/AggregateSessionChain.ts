import type { IDb } from '@zerospin/core/drizzle/types';
import { System } from '@zerospin/core/system/System';
import type { ISystem } from '@zerospin/core/system/types';
import { makeZerospinError, type IErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';
import {
  type Connection,
  type ConnectionContext,
  type Server,
  type WSMessage,
} from 'partyserver';

import type { AggregateActorHistory } from '../AggregateActorVersionChain/AggregateActorHistory.js';
import type { IAggregateProjectionKey } from '../aggregateProjection/resolveAggregateProjectionView.js';
import type { IAggregateProjectionBroadcast } from '../aggregateProjection/types.js';
import { filterAggregateBrowserCommand } from '../filterAggregateBrowserCommand/filterAggregateBrowserCommand.js';
import { AggregateProjectionReposLive } from '../repoServices/AggregateProjectionReposLive.js';

import type {
  IAggregateAgentExposedPublication,
  IAggregateExposedPublication,
} from './aggregateExposedPublication.js';
import { appendExposedCommands } from './appendExposedCommands.js';
import type { IAggregateSessionConnectionState } from './connectionState.js';
import { disposeConnection } from './disposeConnection.js';
import {
  getBrowserCommands,
  type getExecutionBrowserCommands,
  type IAggregateExecutionReplayProps,
} from './getBrowserCommands/getBrowserCommands.js';
import { getCheckpoint } from './getCheckpoint.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { readAggregateConnectionCapabilities } from './readAggregateConnectionCapabilities.js';

export type IExecutionBrowserCommandsRpc = IRpcEnvelope<
  Effect.Success<ReturnType<typeof getExecutionBrowserCommands>>,
  IErrorJson<Effect.Error<ReturnType<typeof getExecutionBrowserCommands>>>
>;
export type IBrowserCommandsRpc = IRpcEnvelope<
  Effect.Success<ReturnType<typeof getBrowserCommands>>,
  IErrorJson<Effect.Error<ReturnType<typeof getBrowserCommands>>>
>;

export class AggregateSessionChain {
  readonly db: IDb;
  readonly actorHistory: AggregateActorHistory | undefined;
  readonly key: IAggregateProjectionKey;
  readonly system: ISystem;
  readonly getConnections: Server['getConnections'];

  constructor(props: {
    actorHistory?: AggregateActorHistory;
    db: IDb;
    key: IAggregateProjectionKey;
    system: ISystem;
    getConnections: Server['getConnections'];
  }) {
    const { db, key, system, getConnections } = props;

    this.db = db;
    this.actorHistory = props.actorHistory;
    this.key = key;
    this.system = system;
    this.getConnections = getConnections;
  }

  /** Publish only committed output. A failed send affects its connection, never the retained acknowledgement. */
  broadcast(rows: readonly IAggregateProjectionBroadcast[]): void {
    for (const { output, commandResolution } of rows) {
      for (const connection of this.getConnections<IAggregateSessionConnectionState>()) {
        try {
          const state = connection.state;
          if (state === null) continue;
          const capabilities = Effect.runSync(
            readAggregateConnectionCapabilities({
              db: this.db,
              key: this.key,
              connectionId: connection.id,
              admission: state,
            }).pipe(Effect.provideService(System, this.system)),
          );
          if (capabilities === null) {
            try {
              connection.send(
                JSON.stringify({
                  type: 'state-required',
                  reason: 'connection-state-invalid',
                }),
              );
            } finally {
              disposeConnection({
                db: this.db,
                key: this.key,
                connection,
                code: 4003,
                reason: 'state-required',
              });
            }
            continue;
          }
          if (state?.phase !== 'live') continue;
          const ownsCompletion =
            'actorName' in this.key &&
            'claims' in state &&
            commandResolution !== null &&
            isEqual(commandResolution.claims, state.claims) &&
            commandResolution.sessionName === state.sessionName &&
            commandResolution.nodeId === state.nodeId;
          const delivered = Effect.runSync(
            filterAggregateBrowserCommand({
              modelNames: capabilities.modelNames,
              output: {
                ...output,
                failure: ownsCompletion ? output.failure : null,
              },
            }),
          );
          connection.send(
            JSON.stringify({ type: 'commands', commands: [delivered] }),
          );
        } catch {
          try {
            disposeConnection({
              db: this.db,
              key: this.key,
              connection,
              code: 1011,
              reason: 'aggregate-session-command-send-failed',
            });
          } catch {
            /* Connection disposal is already outside business commit. */
          }
        }
      }
    }
  }

  appendExposedCommands(props: {
    sourceKey: IAggregateProjectionKey;
    commands: readonly (
      | IAggregateExposedPublication
      | IAggregateAgentExposedPublication
    )[];
  }) {
    return Effect.gen({ self: this }, function* () {
      if (this.actorHistory === undefined) {
        const rows = yield* appendExposedCommands(this.db, {
          ...props,
          key: this.key,
        });
        this.broadcast(rows);
        return;
      }
      const rows = yield* this.actorHistory.appendExposedCommands(props);
      this.broadcast(rows);
    });
  }

  getCheckpoint(
    props: Omit<Parameters<typeof getCheckpoint>[0], 'db' | 'key' | 'history'>,
  ) {
    return getCheckpoint({
      ...props,
      db: this.db,
      key: this.key,
      history: this.actorHistory,
    });
  }

  getResolvedThrough(
    props: Parameters<AggregateActorHistory['getResolvedThrough']>[0],
  ) {
    if (this.actorHistory === undefined) {
      return Effect.fail(makeZerospinError('aggregate-actor-history-required'));
    }
    return this.actorHistory.getResolvedThrough({
      nodeId: props.nodeId,
      sessionName: props.sessionName,
      actorName: props.actorName,
      actorVersion: props.actorVersion,
      claims: props.claims,
      throughAggregateIndex: props.throughAggregateIndex,
    });
  }

  /*
   * Session reconnects and snapshot publication checks read the retained ActorVAC
   * log. This reader returns a bounded ordered union of missing executions and
   * owned results, with independent cursors, plus the current publication tip.
   *
   * 1. Run the bound domain operation.
   */
  getBrowserCommands(
    props: Omit<IAggregateExecutionReplayProps, 'db' | 'key' | 'history'>,
  ): ReturnType<typeof getExecutionBrowserCommands>;

  getBrowserCommands(
    props: Omit<
      Parameters<typeof getBrowserCommands>[0],
      'db' | 'key' | 'history'
    >,
  ): ReturnType<typeof getBrowserCommands>;

  getBrowserCommands(
    props: Omit<
      Parameters<typeof getBrowserCommands>[0],
      'db' | 'key' | 'history'
    >,
  ) {
    // 1 — read the bounded log with the instance-bound database
    return getBrowserCommands({
      ...props,
      db: this.db,
      key: this.key,
      history: this.actorHistory,
    });
  }

  /*
   * The aggregate definition log accepts SystemRepo-forwarded upgrade context.
   * It checks the lock's actor against its bound key and initializes a
   * connection awaiting the client resume cursor.
   *
   * 1. Run the bound domain operation.
   */
  onConnect(
    connection: Connection<IAggregateSessionConnectionState>,
    context: ConnectionContext,
  ) {
    // 1 — run onConnect with the instance-bound dependencies
    return onConnect({
      connection,
      request: context.request,
      key: this.key,
      db: this.db,
    });
  }

  onClose(connection: Connection): void {
    disposeConnection({ db: this.db, key: this.key, connection });
  }

  onError(connection: Connection, error: unknown) {
    return Effect.logError('Aggregate socket failed', error).pipe(
      Effect.ensuring(
        Effect.sync(() =>
          disposeConnection({
            db: this.db,
            key: this.key,
            connection,
            code: 1011,
            reason: 'aggregate-session-socket-error',
          }),
        ),
      ),
    );
  }

  /*
   * The aggregate definition log admits unchanged commands only on its validated live
   * socket and returns admission receipts alongside selected delivery.
   * It handles the initial resume message by replaying missing executions and
   * owned results in one ordered stream before marking the connection live.
   * Invalid state or an unavailable cursor requests a fresh snapshot and closes
   * the socket.
   *
   * 1. Run the bound domain operation.
   */
  onMessage(
    connection: Connection<IAggregateSessionConnectionState>,
    message: WSMessage,
  ): Effect.Effect<void, never, never> {
    // 1 — run onMessage with the instance-bound dependencies
    return onMessage({
      connection,
      message,
      db: this.db,
      key: this.key,
      history: this.actorHistory,
    }).pipe(
      Effect.provideService(System, this.system),
      Effect.provide(AggregateProjectionReposLive),
      Effect.catchCause(cause =>
        Effect.logError('Aggregate socket synchronization failed', cause).pipe(
          Effect.andThen(
            Effect.sync(() => {
              try {
                connection.send(
                  JSON.stringify({
                    type: 'state-required',
                    reason: 'server-failure',
                  }),
                );
              } finally {
                disposeConnection({
                  db: this.db,
                  key: this.key,
                  connection,
                  code: 4003,
                  reason: 'state-required',
                });
              }
            }),
          ),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          if (connection.readyState !== 1) {
            this.onClose(connection);
          }
        }),
      ),
    );
  }
}
