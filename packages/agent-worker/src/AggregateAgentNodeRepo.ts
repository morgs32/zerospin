import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { getAggregateAgentInstallation } from '@zerospin/system-worker/agentNodeRepo/agentInstallation';
import { readAgentMaterializedTables } from '@zerospin/system-worker/agentNodeRepo/agentMaterializedTables';
import {
  agentNodeOperation,
  type IAgentNodeSubscriber,
  type IExpectedAgentInstallation,
} from '@zerospin/system-worker/agentNodeRepo/agentNodeRuntimeTypes';
import { aggregateAgentNodeRepoMigratableDORepoConfig } from '@zerospin/system-worker/AggregateAgentNodeRepo/aggregateAgentNodeRepoMigratableDORepoConfig';
import { aggregateAgentVersionChainNameUtils } from '@zerospin/system-worker/AggregateAgentVersionChain/aggregateAgentVersionChainName';
import { aggregateAgentVersionRepoNameUtils } from '@zerospin/system-worker/AggregateAgentVersionRepo/aggregateAgentVersionRepoName';
import { aggregateChainNameUtils } from '@zerospin/system-worker/AggregateChain/aggregateChainName';
import { bindRepoNamespace } from '@zerospin/system-worker/makeDORepo/bindRepoNamespace';
import { makeFanoutSubscriber } from '@zerospin/system-worker/makeFanoutSubscriber/makeFanoutSubscriber';
import { makeMigratableDORepo } from '@zerospin/system-worker/makeMigratableDORepo/makeMigratableDORepo';
import { makeWakeRegistry } from '@zerospin/system-worker/makeWakeRegistry/makeWakeRegistry';
import type { AggregateAgentVersionRepos } from '@zerospin/system-worker/repoServices/AggregateAgentVersionRepos';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '@zerospin/system-worker/runWorkerInvocation/runWorkerInvocation';
import type {} from '@zerospin/system-worker/SystemRepo/registerRepo/systemRepoNamespaces';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import config from 'config';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Struct from 'effect/Struct';

import { makeAggregateAgentNodeRuntime } from './runtime/makeAggregateAgentNodeRuntime.js';

const getSnapshotRepo: Context.Service.Shape<
  typeof AggregateAgentVersionRepos
>['getRepo'] = bindRepoNamespace(
  aggregateAgentVersionRepoNameUtils,
  'AGGREGATE_AGENT_VERSION_REPO',
);
const getHistoryChain = bindRepoNamespace(
  aggregateAgentVersionChainNameUtils,
  'AGGREGATE_AGENT_VERSION_CHAIN',
);
const getChain = bindRepoNamespace(aggregateChainNameUtils, 'AGGREGATE_CHAIN');

/** Own one named Agent's selected materialization, one-shot wakes and exact pending command delivery. */
export class AggregateAgentNodeRepo extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    readMaterializedTables: readAgentMaterializedTables,
    getAgentInstallation: getAggregateAgentInstallation,
    repoType: 'AggregateAgentNodeRepo',
    get system() {
      return config.system;
    },
    managedRuntime: config.managedRuntime,
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'AGGREGATE_AGENT_NODE_REPO',
    migratableDORepoConfig: aggregateAgentNodeRepoMigratableDORepoConfig,
  },
) {
  readonly wakeRegistry = makeWakeRegistry<unknown>({
    storage: this.ctx.storage,
  });
  readonly #registry =
    config.system.aggregateAgents[this.key.aggregateName]?.[this.key.agentName];
  readonly #agentRelease = this.#registry?.releases[this.#registry.active];
  readonly #release =
    this.#agentRelease === undefined
      ? undefined
      : config.system.aggregates[this.#agentRelease.aggregateName]?.releases[
          this.#agentRelease.aggregateVersion
        ];

  get #sourceKey() {
    const release = this.#release;
    const agent = this.#agentRelease;
    if (release === undefined || agent === undefined) {
      throw makeZerospinError('agent-owner-unavailable');
    }
    return {
      ...this.key,
      aggregateVersion: release.version,
      agentVersion: agent.agentVersion,
    };
  }
  readonly #runtime = makeAggregateAgentNodeRuntime({
    aggregateId: this.key.aggregateId,
    db: this.db,
    agentRelease: this.#agentRelease,
    installation: Effect.runSync(getAggregateAgentInstallation(this.key)),
    ownerRelease: this.#release,
    wakeRegistry: this.wakeRegistry,
    captureSnapshot: () =>
      agentNodeOperation(
        Effect.gen({ self: this }, function* () {
          const agent = this.#agentRelease;
          const release = this.#release;
          if (agent === undefined || release === undefined) {
            return yield* makeZerospinError('agent-owner-unavailable');
          }
          const repo = yield* getSnapshotRepo({ key: this.#sourceKey });
          yield* Effect.promise(() => repo.synchronizeSelectedHistory()).pipe(
            Effect.flatMap(readRpcEnvelope),
          );
          const snapshot = yield* Effect.promise(() =>
            repo.getSnapshot({
              aggregateId: this.key.aggregateId,
              aggregateName: this.key.aggregateName,
              origin: {
                kind: 'agent',
                agentName: this.key.agentName,
                agentVersion: agent.agentVersion,
              },
              sessionName: agent.sessionName,
              nodeId: null,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          if (
            snapshot.origin.kind !== 'agent' ||
            snapshot.origin.agentName !== this.key.agentName ||
            snapshot.origin.agentVersion !== agent.agentVersion ||
            snapshot.aggregateName !== this.key.aggregateName ||
            snapshot.aggregateId !== this.key.aggregateId ||
            snapshot.aggregateVersion !== release.version
          ) {
            return yield* makeZerospinError(
              'agent-node-source-version-mismatch',
            );
          }
          return {
            agentVersion: agent.agentVersion,
            aggregateVersion: release.version,
            aggregateIndex: snapshot.aggregateIndex,
            dispositionChainHash: snapshot.dispositionChainHash,
            resources: snapshot.resources,
          };
        }),
      ),
    subscribe: () =>
      agentNodeOperation(
        Effect.gen({ self: this }, function* () {
          const projection = yield* getSnapshotRepo({ key: this.#sourceKey });
          const through = yield* Effect.promise(() =>
            projection.synchronizeSelectedHistory(),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          yield* Effect.promise(() =>
            this.nodeFanoutSubscriber(this.#sourceKey).subscribe(through),
          ).pipe(Effect.flatMap(readRpcEnvelope));
        }),
      ),
    catchup: () =>
      agentNodeOperation(
        Effect.gen({ self: this }, function* () {
          const projection = yield* getSnapshotRepo({ key: this.#sourceKey });
          const through = yield* Effect.promise(() =>
            projection.synchronizeSelectedHistory(),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          yield* Effect.promise(() =>
            this.nodeFanoutSubscriber(this.#sourceKey).catchup(through),
          ).pipe(Effect.flatMap(readRpcEnvelope));
        }),
      ),
    transitionProducer: (generation, active) =>
      agentNodeOperation(
        Effect.gen({ self: this }, function* () {
          const chain = yield* getChain({
            key: {
              systemId: this.key.systemId,
              aggregateName: this.key.aggregateName,
              aggregateId: this.key.aggregateId,
            },
          });
          yield* Effect.promise(() =>
            chain.transitionAgentNodeProducer({
              agentName: this.key.agentName,
              generation,
              active,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
        }),
      ),
    admit: delivery =>
      agentNodeOperation(
        Effect.gen({ self: this }, function* () {
          const command: IEncodedCommand<IAggregateCommand> = {
            ...Struct.omit(delivery, [
              'agentVersion',
              'producerIndex',
              'generation',
            ]),
            aggregateId: this.key.aggregateId,
            aggregateName: this.key.aggregateName,
            kind: 'agent',
            agentName: this.key.agentName,
            agentVersion: delivery.agentVersion,
          };
          const chain = yield* getChain({
            key: {
              systemId: this.key.systemId,
              aggregateName: this.key.aggregateName,
              aggregateId: this.key.aggregateId,
            },
          });
          const progress = yield* Effect.promise(() =>
            chain.admitFromAggregateAgentNode({
              source: {
                systemId: this.key.systemId,
                aggregateName: this.key.aggregateName,
                aggregateId: this.key.aggregateId,
                agentName: this.key.agentName,
              },
              generation: delivery.generation,
              producerIndex: delivery.producerIndex,
              command,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          if (
            progress.generation !== delivery.generation ||
            !Number.isSafeInteger(progress.acknowledgedProducerIndex) ||
            progress.acknowledgedProducerIndex < delivery.producerIndex
          ) {
            return yield* makeZerospinError(
              'command-delivery-checkpoint-invalid',
            );
          }
        }),
      ),
  });

  override onAlarm(): Promise<void> {
    return config.managedRuntime.runPromise(
      runWorkerInvocation(this.wakeRegistry.run()),
    );
  }

  override onRepoStartup() {
    return agentNodeOperation(this.wakeRegistry.reconcile());
  }

  initialize(
    retryFailed = false,
    expectedBinding?: IExpectedAgentInstallation,
  ) {
    return config.managedRuntime.runPromise(
      agentNodeOperation(
        this.#runtime.initialize(retryFailed, expectedBinding),
      ).pipe(makeWorkerRpcEnvelope),
    );
  }

  nodeFanoutSubscriber(
    sourceKey: Parameters<
      typeof aggregateAgentVersionChainNameUtils.makeName
    >[0],
  ): IAgentNodeSubscriber {
    if (
      Object.keys(this.#sourceKey).some(
        field =>
          Reflect.get(sourceKey, field) !== Reflect.get(this.#sourceKey, field),
      )
    ) {
      throw makeZerospinError('fanout-source-key-mismatch');
    }
    const { agentVersion, aggregateVersion } = sourceKey;
    const generation = this.#runtime.getReadyGeneration();
    return makeFanoutSubscriber({
      RpcTarget,
      managedRuntime: config.managedRuntime,
      encodeRpcOutcome: makeWorkerRpcEnvelope,
      name: 'nodeFanout',
      sourceKey,
      key: this.#sourceKey,
      getRepo: getHistoryChain,
      getCurrentIndex: this.#runtime.getCurrentIndex,
      receive: delivery =>
        agentNodeOperation(
          this.#runtime.receive(
            { agentVersion, aggregateVersion },
            generation,
            delivery,
          ),
        ),
    });
  }
}
