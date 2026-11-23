import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from 'partyserver';

import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';
import { broadcastServiceCommands } from '../serviceProjection/broadcastServiceCommands.js';
import { authoredReleaseRepoRuntime } from '../workerConfiguration/workerConfiguration.js';

import { type appendExposedCommands } from './appendExposedCommands.js';
import type { IServiceConnectionState } from './connectionState.js';
import { disposeConnection } from './disposeConnection.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { reconcileConnectionLocks } from './reconcileConnectionLocks.js';
import { ServiceActorHistory } from './ServiceActorHistory.js';
import type { IServiceOutcomeOwner } from './serviceActorOutcomeOwner.js';
import { serviceActorVersionChainMigratableDORepoConfig } from './serviceActorVersionChainMigratableDORepoConfig.js';

export class ServiceActorVersionChain extends makeMigratableDORepo(
  Server<Cloudflare.Env>,
  {
    repoType: 'ServiceActorVersionChain',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'SERVICE_ACTOR_VERSION_CHAIN',
    migratableDORepoConfig: serviceActorVersionChainMigratableDORepoConfig,
  },
) {
  static options = { hibernate: true };
  readonly recoveryRegistry = makeRecoveryRegistry({
    storage: this.ctx.storage,
  });
  readonly #history = new ServiceActorHistory({
    db: this.db,
    key: this.key,
    recoveryRegistry: this.recoveryRegistry,
    managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
    background: promise => this.ctx.waitUntil(promise),
  });

  get archiveFanout() {
    return this.#history.archiveFanout;
  }

  override onRepoStartup() {
    return reconcileConnectionLocks(this.db, <T>() =>
      this.getConnections<T>(),
    ).pipe(Effect.andThen(this.#history.initialize()));
  }

  override onAlarm(): Promise<void> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      runWorkerInvocation(this.recoveryRegistry.run()),
    );
  }

  /** Commit complete selected history before acknowledgement; sockets follow that durable append. */
  async appendExposedCommands(
    props: Omit<Parameters<typeof appendExposedCommands>[1], 'key'>,
  ) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      this.#history.append(props).pipe(
        Effect.tap(broadcasts =>
          broadcastServiceCommands({
            db: this.db,
            key: this.key,
            broadcasts,
            connections: () => this.getConnections<IServiceConnectionState>(),
          }),
        ),
        Effect.asVoid,
        effect => makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  async getCheckpoint(props: { serviceIndex?: number } = {}) {
    const { serviceIndex } = props;

    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      this.#history
        .getCheckpoint(serviceIndex)
        .pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Prove private progress through the captured Service position without decoding public commands. */
  async getResolvedThrough(props: {
    owner: IServiceOutcomeOwner;
    afterOutcomeIndex: number;
    throughServiceIndex: number;
  }) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      this.#history
        .getResolvedThrough(props)
        .pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getBrowserCommands(props: {
    afterServiceIndex: number;
    models: Readonly<Record<string, unknown>>;
  }) {
    const { afterServiceIndex, models } = props;

    // 1 — run getBrowserCommands with the instance-bound dependencies and encode its RPC outcome
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const checkpoint = this.#history.readHead();
        const commands = yield* this.#history.readBrowserPage({
          afterServiceIndex,
          models,
          throughServiceIndex: checkpoint.serviceIndex,
        });
        return { ...checkpoint, commands };
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  override onClose(connection: Connection<IServiceConnectionState>) {
    disposeConnection({ db: this.db, connection });
  }

  override onError(
    connection: Connection<IServiceConnectionState>,
    error: unknown,
  ) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.logError('Service connection failed', error).pipe(
        Effect.ensuring(
          Effect.sync(() =>
            disposeConnection({
              db: this.db,
              connection,
              code: 1011,
              reason: 'service-session-connection-error',
            }),
          ),
        ),
      ),
    );
  }

  /** Validate the trusted admission and install its selected connection capabilities. */
  override async onConnect(
    connection: Connection<IServiceConnectionState>,
    context: ConnectionContext,
  ): Promise<void> {
    // 1 — run onConnect with the instance-bound dependencies
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      runWorkerInvocation(
        onConnect({
          connection,
          request: context.request,
          key: this.key,
          db: this.db,
        }).pipe(
          Effect.onExit(exit =>
            Exit.isFailure(exit)
              ? Effect.sync(() =>
                  disposeConnection({
                    db: this.db,
                    connection,
                    code: 4004,
                    reason: 'service-session-admission-invalid',
                  }),
                )
              : Effect.void,
          ),
          Effect.catchCause(() => Effect.void),
        ),
      ),
    );
  }

  /** Replay retained Service actor commands before live delivery; dispose failed synchronization. */
  override async onMessage(
    connection: Connection<IServiceConnectionState>,
    message: WSMessage,
  ): Promise<void> {
    // 1 — run onMessage with the instance-bound dependencies
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      runWorkerInvocation(
        onMessage({
          connection,
          message,
          db: this.db,
          key: this.key,
          history: this.#history,
        }).pipe(
          Effect.catchCause(cause =>
            Effect.logError(
              'Service socket synchronization failed',
              cause,
            ).pipe(
              Effect.ensuring(
                Effect.sync(() =>
                  disposeConnection({
                    db: this.db,
                    connection,
                    code: 4003,
                    reason: 'state-required',
                    message: {
                      type: 'state-required',
                      reason: 'server-failure',
                    },
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
