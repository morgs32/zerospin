import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeServiceAgentSessionLock } from '@zerospin/core/serviceAgentSession/makeServiceAgentSessionLock';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { getServiceAgentInstallation } from '@zerospin/system-worker/agentNodeRepo/agentInstallation';
import { readAgentMaterializedTables } from '@zerospin/system-worker/agentNodeRepo/agentMaterializedTables';
import {
  agentNodeOperation,
  type IAgentNodeSubscriber,
  type IExpectedAgentInstallation,
} from '@zerospin/system-worker/agentNodeRepo/agentNodeRuntimeTypes';
import { bindRepoNamespace } from '@zerospin/system-worker/makeDORepo/bindRepoNamespace';
import { makeFanoutSubscriber } from '@zerospin/system-worker/makeFanoutSubscriber/makeFanoutSubscriber';
import { makeMigratableDORepo } from '@zerospin/system-worker/makeMigratableDORepo/makeMigratableDORepo';
import { makeWakeRegistry } from '@zerospin/system-worker/makeWakeRegistry/makeWakeRegistry';
import type { ServiceAgentVersionRepos } from '@zerospin/system-worker/repoServices/ServiceAgentVersionRepos';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '@zerospin/system-worker/runWorkerInvocation/runWorkerInvocation';
import { serviceAgentNodeRepoMigratableDORepoConfig } from '@zerospin/system-worker/ServiceAgentNodeRepo/serviceAgentNodeRepoMigratableDORepoConfig';
import { serviceAgentVersionChainNameUtils } from '@zerospin/system-worker/ServiceAgentVersionChain/serviceAgentVersionChainName';
import { serviceAgentVersionRepoNameUtils } from '@zerospin/system-worker/ServiceAgentVersionRepo/serviceAgentVersionRepoName';
import { serviceChainNameUtils } from '@zerospin/system-worker/ServiceChain/serviceChainName';
import type {} from '@zerospin/system-worker/SystemRepo/registerRepo/systemRepoNamespaces';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import config from 'config';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Struct from 'effect/Struct';

import { makeServiceAgentNodeRuntime } from './runtime/makeServiceAgentNodeRuntime.js';

const getSnapshotRepo: Context.Service.Shape<
  typeof ServiceAgentVersionRepos
>['getRepo'] = bindRepoNamespace(
  serviceAgentVersionRepoNameUtils,
  'SERVICE_AGENT_VERSION_REPO',
);
const getHistoryChain = bindRepoNamespace(
  serviceAgentVersionChainNameUtils,
  'SERVICE_AGENT_VERSION_CHAIN',
);
const getChain = bindRepoNamespace(serviceChainNameUtils, 'SERVICE_CHAIN');

/** Own one named Agent's selected materialization, one-shot wakes and exact pending command delivery. */
export class ServiceAgentNodeRepo extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    readMaterializedTables: readAgentMaterializedTables,
    getAgentInstallation: getServiceAgentInstallation,
    repoType: 'ServiceAgentNodeRepo',
    get system() {
      return config.system;
    },
    managedRuntime: config.managedRuntime,
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'SERVICE_AGENT_NODE_REPO',
    migratableDORepoConfig: serviceAgentNodeRepoMigratableDORepoConfig,
  },
) {
  readonly wakeRegistry = makeWakeRegistry<unknown>({
    storage: this.ctx.storage,
  });
  readonly #registry =
    config.system.serviceAgents[this.key.serviceName]?.[this.key.agentName];
  readonly #agentRelease = this.#registry?.releases[this.#registry.active];
  readonly #release =
    this.#agentRelease === undefined
      ? undefined
      : config.system.services[this.#agentRelease.serviceName]?.releases[
          this.#agentRelease.serviceVersion
        ];

  get #sourceKey() {
    const release = this.#release;
    const agent = this.#agentRelease;
    if (release === undefined || agent === undefined) {
      throw makeZerospinError('agent-owner-unavailable');
    }
    return {
      ...this.key,
      serviceVersion: release.version,
      agentVersion: agent.agentVersion,
    };
  }
  readonly #runtime = makeServiceAgentNodeRuntime({
    db: this.db,
    agentRelease: this.#agentRelease,
    installation: Effect.runSync(getServiceAgentInstallation(this.key)),
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
              serviceAgentSessionLock: makeServiceAgentSessionLock(agent),
              sessionName: agent.sessionName,
              nodeId: null,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          if (
            snapshot.agentName !== this.key.agentName ||
            snapshot.agentVersion !== agent.agentVersion ||
            snapshot.serviceName !== this.key.serviceName ||
            snapshot.serviceVersion !== release.version
          ) {
            return yield* makeZerospinError(
              'agent-node-source-version-mismatch',
            );
          }
          return {
            agentVersion: agent.agentVersion,
            serviceVersion: release.version,
            serviceIndex: snapshot.serviceIndex,
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
              serviceName: this.key.serviceName,
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
          const command: IEncodedCommand<IServiceCommand> = {
            ...Struct.omit(delivery, [
              'agentVersion',
              'producerIndex',
              'generation',
            ]),
            serviceName: this.key.serviceName,
            kind: 'agent',
            agentName: this.key.agentName,
            agentVersion: delivery.agentVersion,
          };
          const chain = yield* getChain({
            key: {
              systemId: this.key.systemId,
              serviceName: this.key.serviceName,
            },
          });
          const progress = yield* Effect.promise(() =>
            chain.admitFromServiceAgentNode({
              source: {
                systemId: this.key.systemId,
                serviceName: this.key.serviceName,
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
    sourceKey: Parameters<typeof serviceAgentVersionChainNameUtils.makeName>[0],
  ): IAgentNodeSubscriber {
    if (
      Object.keys(this.#sourceKey).some(
        field =>
          Reflect.get(sourceKey, field) !== Reflect.get(this.#sourceKey, field),
      )
    ) {
      throw makeZerospinError('fanout-source-key-mismatch');
    }
    const { agentVersion, serviceVersion } = sourceKey;
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
            { agentVersion, serviceVersion },
            generation,
            delivery,
          ),
        ),
    });
  }
}
