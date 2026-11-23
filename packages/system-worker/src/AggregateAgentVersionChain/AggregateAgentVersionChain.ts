import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { RpcTarget } from 'cloudflare:workers';
import config from 'config';
import { desc } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import { Server } from 'partyserver';

import { makeAgentNodeFanout } from '../agentNodeFanout/makeAgentNodeFanout.js';
import { getAggregateAgentNodeRepo } from '../AggregateAgentNodeRepo/getAggregateAgentNodeRepo.js';
import { AggregateSessionChain } from '../aggregateSessionChain/AggregateSessionChain.js';
import { aggregateAgentSessionChainDbConfig } from '../aggregateSessionChain/aggregateSessionChainDbConfig.js';
import { getExecutionBrowserCommands } from '../aggregateSessionChain/getBrowserCommands/getBrowserCommands.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';

import { aggregateAgentVersionChainMigratableDORepoConfig } from './aggregateAgentVersionChainMigratableDORepoConfig.js';

export class AggregateAgentVersionChain extends makeMigratableDORepo(
  Server<Cloudflare.Env>,
  {
    repoType: 'AggregateAgentVersionChain',
    system: config.system,
    managedRuntime: config.managedRuntime,
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'AGGREGATE_AGENT_VERSION_CHAIN',
    migratableDORepoConfig: aggregateAgentVersionChainMigratableDORepoConfig,
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
        config.system.aggregateAgents[this.key.aggregateName]?.[
          this.key.agentName
        ];
      const agent = registry?.releases[registry.active];
      return (
        agent?.aggregateVersion === this.key.aggregateVersion &&
        agent.agentVersion === this.key.agentVersion
      );
    },
    readPage: page =>
      getExecutionBrowserCommands({
        db: this.db,
        key: this.key,
        afterAggregateIndex: page.afterIndex,
        ...(page.maxIndex === undefined
          ? {}
          : { throughAggregateIndex: page.maxIndex }),
      }).pipe(
        Effect.map(result => ({
          rows: result.commands.map(row => ({
            row,
            index: row.aggregateIndex,
          })),
          lastIndex:
            this.db
              .select({
                index:
                  aggregateAgentSessionChainDbConfig.schema.exposedCommands
                    .aggregateIndex,
              })
              .from(aggregateAgentSessionChainDbConfig.schema.exposedCommands)
              .orderBy(
                desc(
                  aggregateAgentSessionChainDbConfig.schema.exposedCommands
                    .aggregateIndex,
                ),
              )
              .get()?.index ?? 0,
        })),
      ),
    deliver: delivery =>
      Effect.gen({ self: this }, function* () {
        const repo = yield* getAggregateAgentNodeRepo({
          key: {
            systemId: this.key.systemId,
            aggregateName: this.key.aggregateName,
            aggregateId: this.key.aggregateId,
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
  readonly #session = new AggregateSessionChain({
    db: this.db,
    key: this.key,
    system: config.system,
    getConnections: <T>() => this.getConnections<T>(),
  });

  getBrowserCommands(
    ...args: Parameters<AggregateSessionChain['getBrowserCommands']>
  ) {
    return config.managedRuntime.runPromise(
      this.#session
        .getBrowserCommands(...args)
        .pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  override onConnect(...args: Parameters<AggregateSessionChain['onConnect']>) {
    return config.managedRuntime.runPromise(
      runWorkerInvocation(this.#session.onConnect(...args)),
    );
  }

  override onClose(
    ...args: Parameters<AggregateSessionChain['onClose']>
  ): ReturnType<AggregateSessionChain['onClose']> {
    return this.#session.onClose(...args);
  }

  override onMessage(...args: Parameters<AggregateSessionChain['onMessage']>) {
    return config.managedRuntime.runPromise(
      runWorkerInvocation(this.#session.onMessage(...args)),
    );
  }

  override onError(...args: Parameters<AggregateSessionChain['onError']>) {
    return config.managedRuntime.runPromise(this.#session.onError(...args));
  }

  appendExposedCommands(
    props: Parameters<AggregateSessionChain['appendExposedCommands']>[0],
  ) {
    return config.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.#nodeFanout.producerLease;
        yield* this.#session.appendExposedCommands(props);
      }).pipe(
        Effect.ensuring(this.#nodeFanout.wake().pipe(Effect.exit)),
        Effect.scoped,
        effect => makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  getCheckpoint(props: Parameters<AggregateSessionChain['getCheckpoint']>[0]) {
    return config.managedRuntime.runPromise(
      this.#session
        .getCheckpoint(props)
        .pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }
}
