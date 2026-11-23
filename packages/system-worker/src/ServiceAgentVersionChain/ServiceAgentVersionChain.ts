import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { RpcTarget } from 'cloudflare:workers';
import config from 'config';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from 'partyserver';

import { makeAgentNodeFanout } from '../agentNodeFanout/makeAgentNodeFanout.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import { getServiceAgentNodeRepo } from '../ServiceAgentNodeRepo/getServiceAgentNodeRepo.js';

import { appendExposedCommands } from './appendExposedCommands.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';

import { disposeConnection, onConnect } from './connection.js';
import type { IServiceAgentConnectionState } from './connectionState.js';
import {
  readServiceAgentCommandPage,
  readServiceHistoryCheckpoint,
} from './readServiceAgentHistory.js';
import { serviceAgentVersionChainMigratableDORepoConfig } from './serviceAgentVersionChainMigratableDORepoConfig.js';
import { broadcastCommands, onMessage } from './socketDelivery.js';

/** Retain public Service Agent history independently of materialized resources. */
export class ServiceAgentVersionChain extends makeMigratableDORepo(
  Server<Cloudflare.Env>,
  {
    repoType: 'ServiceAgentVersionChain',
    system: config.system,
    managedRuntime: config.managedRuntime,
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'SERVICE_AGENT_VERSION_CHAIN',
    migratableDORepoConfig: serviceAgentVersionChainMigratableDORepoConfig,
  },
) {
  static options = { hibernate: true };

  readonly recoveryRegistry = makeRecoveryRegistry<unknown>({
    storage: this.ctx.storage,
  });
  readonly #nodeFanout = makeAgentNodeFanout({
    RpcTarget,
    managedRuntime: config.managedRuntime,
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    background: promise => this.ctx.waitUntil(promise),
    db: this.db,
    key: this.key,
    recoveryRegistry: this.recoveryRegistry,
    enabled: () => {
      const registry =
        config.system.serviceAgents[this.key.serviceName]?.[this.key.agentName];
      const agent = registry?.releases[registry.active];
      return (
        agent?.serviceVersion === this.key.serviceVersion &&
        agent.agentVersion === this.key.agentVersion
      );
    },
    readPage: page =>
      Effect.sync(() => {
        const checkpoint = readServiceHistoryCheckpoint(this.db);
        const rows = readServiceAgentCommandPage({
          db: this.db,
          afterServiceIndex: page.afterIndex,
          throughServiceIndex: Math.min(
            page.maxIndex ?? checkpoint.serviceIndex,
            checkpoint.serviceIndex,
          ),
        });
        return {
          rows: rows.map(row => ({ row, index: row.serviceIndex })),
          lastIndex: checkpoint.serviceIndex,
        };
      }),
    deliver: delivery =>
      Effect.gen({ self: this }, function* () {
        const repo = yield* getServiceAgentNodeRepo({
          key: {
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
            agentName: this.key.agentName,
          },
        });
        yield* Effect.acquireUseRelease(
          Effect.promise(() => repo.nodeFanoutSubscriber(this.key)),
          receiver =>
            Effect.promise(() => receiver.receive(delivery)).pipe(
              Effect.flatMap(readRpcEnvelope),
            ),
          receiver => Effect.sync(() => receiver[Symbol.dispose]()),
        );
      }),
  });

  get nodeFanout() {
    return this.#nodeFanout;
  }

  override onRepoStartup() {
    return this.#nodeFanout.wake();
  }

  override onAlarm(): Promise<void> {
    return config.managedRuntime.runPromise(
      runWorkerInvocation(this.recoveryRegistry.run()),
    );
  }

  appendExposedCommands(
    props: Omit<Parameters<typeof appendExposedCommands>[1], 'key'>,
  ) {
    return config.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.#nodeFanout.producerLease;
        return yield* appendExposedCommands(this.db, {
          ...props,
          key: this.key,
        });
      }).pipe(
        Effect.tap(publications =>
          broadcastCommands({
            key: this.key,
            publications,
            connections: () =>
              this.getConnections<IServiceAgentConnectionState>(),
          }).pipe(
            Effect.catchCause(cause =>
              Effect.logError('Service Agent broadcast failed', cause),
            ),
          ),
        ),
        Effect.asVoid,
        Effect.ensuring(this.#nodeFanout.wake().pipe(Effect.exit)),
        Effect.scoped,
        effect => makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  getCheckpoint(props: { serviceIndex?: number } = {}) {
    const { serviceIndex } = props;

    return config.managedRuntime.runPromise(
      Effect.sync(() =>
        readServiceHistoryCheckpoint(this.db, serviceIndex),
      ).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  getBrowserCommands(props: {
    afterServiceIndex: number;
    models: Readonly<Record<string, unknown>>;
  }) {
    return config.managedRuntime.runPromise(
      Effect.sync(() => {
        const checkpoint = readServiceHistoryCheckpoint(this.db);
        return {
          ...checkpoint,
          commands: readServiceAgentCommandPage({
            ...props,
            db: this.db,
            throughServiceIndex: checkpoint.serviceIndex,
          }),
        };
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  override onClose(connection: Connection<IServiceAgentConnectionState>) {
    disposeConnection({ connection });
  }

  override onError(
    connection: Connection<IServiceAgentConnectionState>,
    error: unknown,
  ) {
    return config.managedRuntime.runPromise(
      Effect.logError('Service Agent connection failed', error).pipe(
        Effect.ensuring(
          Effect.sync(() =>
            disposeConnection({
              connection,
              code: 1011,
              reason: 'service-agent-connection-error',
            }),
          ),
        ),
      ),
    );
  }

  override onConnect(
    connection: Connection<IServiceAgentConnectionState>,
    context: ConnectionContext,
  ) {
    return config.managedRuntime.runPromise(
      runWorkerInvocation(
        onConnect({ connection, request: context.request, key: this.key }).pipe(
          Effect.onExit(exit =>
            Exit.isFailure(exit)
              ? Effect.sync(() =>
                  disposeConnection({
                    connection,
                    code: 4004,
                    reason: 'service-agent-admission-invalid',
                  }),
                )
              : Effect.void,
          ),
          Effect.catchCause(() => Effect.void),
        ),
      ),
    );
  }

  override onMessage(
    connection: Connection<IServiceAgentConnectionState>,
    message: WSMessage,
  ) {
    return config.managedRuntime.runPromise(
      runWorkerInvocation(
        onMessage({ connection, message, db: this.db, key: this.key }).pipe(
          Effect.catchCause(cause =>
            Effect.logError(
              'Service Agent socket synchronization failed',
              cause,
            ).pipe(
              Effect.ensuring(
                Effect.sync(() =>
                  disposeConnection({
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
