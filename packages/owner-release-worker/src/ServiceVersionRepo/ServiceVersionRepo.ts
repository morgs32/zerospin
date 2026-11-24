import type { IReadQuery } from '@zerospin/core/models/reads/ReadQuerySchema';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  mapParseError,
  type IErrorJson,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { type IRpcEnvelope } from '@zerospin/logger';
import { bindRepoNamespace } from '@zerospin/system-worker/makeDORepo/bindRepoNamespace';
import {
  type IFanoutDelivery,
  type IFanoutEnrollmentError,
  type IFanoutSubscriberRepo,
} from '@zerospin/system-worker/makeFanoutQueue/makeFanoutQueue';
import type { IFanoutSubscriberCapability } from '@zerospin/system-worker/makeFanoutSubscriber/makeFanoutSubscriber';
import { makeMigratableDORepo } from '@zerospin/system-worker/makeMigratableDORepo/makeMigratableDORepo';
import {
  makeOutboxQueue,
  type IWorkerOutboxQueue,
} from '@zerospin/system-worker/makeOutboxQueue/makeOutboxQueue';
import {
  makeOutboxSubscriber,
  type IOutboxSubscriberCapability,
} from '@zerospin/system-worker/makeOutboxSubscriber/makeOutboxSubscriber';
import { makeRecoveryRegistry } from '@zerospin/system-worker/makeRecoveryRegistry/makeRecoveryRegistry';
import { getServiceVersionChain } from '@zerospin/system-worker/ownerOperations/releaseRepoNamespaces';
import { ServiceChains } from '@zerospin/system-worker/repoServices/ServiceChains';
import { ServiceVersionChains } from '@zerospin/system-worker/repoServices/ServiceVersionChains';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '@zerospin/system-worker/runWorkerInvocation/runWorkerInvocation';
import '@zerospin/system-worker/SystemRepo/registerRepo/systemRepoNamespaces';
import { serviceChainNameUtils } from '@zerospin/system-worker/ServiceChain/serviceChainName';
import type { IServiceCommandOccurrence } from '@zerospin/system-worker/ServiceChain/types';
import {
  decodeServiceEvaluatedCommandRow,
  type IEvaluatedServiceCommand,
} from '@zerospin/system-worker/ServiceVersionChain/evaluatedServiceCommand';
import type {
  IServiceOriginalCommandReceiver,
  IServiceVersionRepo,
} from '@zerospin/system-worker/ServiceVersionRepo/types';
import { authoredReleaseRepoRuntime } from '@zerospin/system-worker/workerConfiguration/workerConfiguration';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Semaphore from 'effect/Semaphore';

import { authorizeServiceSession } from './authorizeServiceSession/authorizeServiceSession.js';
import { awaitCommandResult } from './awaitCommandResult/awaitCommandResult.js';
import { catchupMaterialization } from './catchupMaterialization/catchupMaterialization.js';
import { executeCommandRows } from './executeCommand/executeCommandRows.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { readServiceMaterializationHead } from './readServiceMaterializationHead.js';
import { replayCommands } from './replayCommands/replayCommands.js';
import { replayCommandsFanoutSubscriber } from './replayCommandsFanoutSubscriber/replayCommandsFanoutSubscriber.js';
import { serviceVersionRepoDbConfig } from './serviceVersionRepoDbConfig.js';
import { serviceVersionRepoMigratableDORepoConfig } from './serviceVersionRepoMigratableDORepoConfig.js';

const getServiceChain = bindRepoNamespace(
  serviceChainNameUtils,
  'SERVICE_CHAIN',
);

type IOriginalCommandSubscriber = IOutboxSubscriberCapability<
  'executeCommand',
  Parameters<typeof executeCommandRows>[0]['rows'][number],
  Effect.Success<ReturnType<typeof executeCommandRows>>,
  Effect.Error<ReturnType<typeof executeCommandRows>>
>;
type IOriginalCommandProgram = Effect.Effect<
  Effect.Success<ReturnType<typeof executeCommandRows>>,
  Effect.Error<ReturnType<typeof executeCommandRows>>,
  Exclude<
    Effect.Services<ReturnType<typeof executeCommandRows>>,
    ServiceChains | ServiceVersionChains
  >
>;

export class ServiceVersionRepo
  extends makeMigratableDORepo(DurableObject<Cloudflare.Env>, {
    repoType: 'ServiceVersionRepo',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'SERVICE_VERSION_REPO',
    migratableDORepoConfig: serviceVersionRepoMigratableDORepoConfig,
  })
  implements
    IServiceVersionRepo,
    IServiceOriginalCommandReceiver,
    IFanoutSubscriberRepo<{
      name: 'replayCommandsFanout';
    }>
{
  protected readonly builds:
    | ReadonlyMap<string, IAnyServiceRelease>
    | undefined;

  readonly recoveryRegistry = makeRecoveryRegistry<unknown>({
    storage: this.ctx.storage,
  });

  readonly #execution = Semaphore.makeUnsafe(1);

  override onRepoStartup() {
    return catchupMaterialization({ repo: this, key: this.key }).pipe(
      Effect.ensuring(this.#serviceVersionChainOutbox.wake().pipe(Effect.exit)),
    );
  }
  readonly #serviceVersionChainOutbox: IWorkerOutboxQueue<
    'serviceVersionChainOutbox',
    IEvaluatedServiceCommand,
    void,
    IZerospinError | IZerospinErrorJson
  > = makeOutboxQueue({
    RpcTarget,
    managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    name: 'serviceVersionChainOutbox',
    db: this.db,
    recoveryRegistry: this.recoveryRegistry,
    outboxTable: this.schema.serviceVersionChainOutbox,
    indexColumnName: 'serviceIndex',
    prepare: rows =>
      Effect.forEach(rows, row =>
        serviceVersionRepoDbConfig.tables.serviceVersionChainOutbox
          .decodeRow(row)
          .pipe(
            Effect.flatMap(decodeServiceEvaluatedCommandRow),
            mapParseError({
              code: 'service-evaluated-command-invalid',
              prefix: 'Invalid pending evaluated Service command',
            }),
          ),
      ),
    subscriber: () =>
      Effect.succeed({
        receive: (
          commands: readonly IEvaluatedServiceCommand[],
        ): Promise<IRpcEnvelope<void, IZerospinErrorJson>> =>
          authoredReleaseRepoRuntime.managedRuntime.runPromise(
            Effect.gen({ self: this }, function* () {
              const chain = yield* getServiceVersionChain({
                key: this.key,
              });
              return yield* Effect.promise(() =>
                chain.appendEvaluatedCommands({ commands }),
              ).pipe(Effect.flatMap(readRpcEnvelope));
            }).pipe(effect => makeWorkerRpcEnvelope(effect)),
          ),
      }),
  });

  readonly #executeCommandSubscriber: IOriginalCommandSubscriber =
    makeOutboxSubscriber({
      RpcTarget,
      managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
      encodeRpcOutcome: makeWorkerRpcEnvelope,
      name: 'executeCommand',
      receive: (
        rows: Parameters<typeof executeCommandRows>[0]['rows'],
      ): IOriginalCommandProgram =>
        Effect.gen({ self: this }, function* () {
          yield* this.#serviceVersionChainOutbox.producerLease;
          return yield* executeCommandRows({
            rows,
            db: this.db,
            builds: this.builds,
            key: this.key,
            execution: this.#execution,
            replayThrough: index =>
              this.replayCommandsFanoutSubscriber(this.key).catchup(index),
          }).pipe(
            Effect.provideService(ServiceChains, {
              getRepo: getServiceChain,
            }),
            Effect.provideService(ServiceVersionChains, {
              getRepo: getServiceVersionChain,
            }),
            Effect.ensuring(
              this.#serviceVersionChainOutbox.wake().pipe(Effect.exit),
            ),
          );
        }).pipe(Effect.scoped),
    });

  get executeCommandSubscriber(): IOriginalCommandSubscriber {
    return this.#executeCommandSubscriber;
  }

  replayCommandsFanoutSubscriber(sourceKey: {
    systemId: string;
    serviceName: string;
  }): IFanoutSubscriberCapability<
    'replayCommandsFanout',
    IServiceCommandOccurrence,
    Effect.Error<ReturnType<typeof replayCommands>>,
    IZerospinError<'repo-key-encode-failed'>,
    IErrorJson<IZerospinError<'fanout-page-invalid'>>,
    IErrorJson<IFanoutEnrollmentError>
  > {
    const exit = Effect.runSyncExit(
      replayCommandsFanoutSubscriber({
        getCurrentIndex: () =>
          readServiceMaterializationHead(this.db).serviceIndex,
        RpcTarget,
        managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
        encodeRpcOutcome: makeWorkerRpcEnvelope,
        sourceKey,
        key: this.key,
        receive: (
          {
            rows,
          }: IFanoutDelivery<
            Parameters<typeof replayCommands>[0]['rows'][number]
          >,
          source,
        ) =>
          Effect.gen({ self: this }, function* () {
            yield* this.#serviceVersionChainOutbox.producerLease;
            const first = rows[0];
            if (
              source === 'push' &&
              first !== undefined &&
              readServiceMaterializationHead(this.db).serviceIndex <
                first.serviceIndex - 1
            ) {
              yield* Effect.promise(() =>
                this.replayCommandsFanoutSubscriber(sourceKey).catchup(
                  first.serviceIndex - 1,
                ),
              ).pipe(Effect.flatMap(readRpcEnvelope));
            }
            yield* replayCommands({
              source,
              db: this.db,
              key: this.key,
              execution: this.#execution,
              rows,
            }).pipe(
              Effect.provideService(ServiceChains, {
                getRepo: getServiceChain,
              }),
              Effect.provideService(ServiceVersionChains, {
                getRepo: getServiceVersionChain,
              }),
              Effect.ensuring(
                this.#serviceVersionChainOutbox.wake().pipe(Effect.exit),
              ),
            );
            const throughIndex = rows.at(-1)?.serviceIndex;
            if (source === 'push' && throughIndex !== undefined) {
              yield* this.#serviceVersionChainOutbox.drain(throughIndex);
            }
          }).pipe(Effect.scoped),
      }).pipe(
        Effect.provideService(ServiceChains, {
          getRepo: getServiceChain,
        }),
      ),
    );
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    for (const reason of exit.cause.reasons) {
      if (Cause.isFailReason(reason)) {
        throw reason.error;
      }
    }
    return Effect.runSync(Effect.failCause(exit.cause));
  }

  async awaitCommandResult(props: {
    serviceIndex: number;
  }): Promise<
    IRpcEnvelope<
      Effect.Success<ReturnType<typeof awaitCommandResult>>,
      IErrorJson<Effect.Error<ReturnType<typeof awaitCommandResult>>>
    >
  > {
    const { serviceIndex } = props;
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      awaitCommandResult({
        serviceIndex,
        db: this.db,
        key: this.key,
        replayThrough: index =>
          this.replayCommandsFanoutSubscriber({
            systemId: this.key.systemId,
            serviceName: this.key.serviceName,
          }).catchup(index),
      }).pipe(
        Effect.provideService(ServiceChains, {
          getRepo: getServiceChain,
        }),
        Effect.provideService(ServiceVersionChains, {
          getRepo: getServiceVersionChain,
        }),
        effect => makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  /** Read the declared models from this version's current committed materialization. */
  async executeServiceQuery(query: IReadQuery) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      executeServiceQuery({
        query,
        db: this.db,
        key: this.key,
        execution: this.#execution,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async authorizeServiceSession(
    props: Omit<
      Parameters<typeof authorizeServiceSession>[0],
      'db' | 'serviceName' | 'serviceVersion' | 'execution'
    >,
  ): Promise<
    IRpcEnvelope<
      Effect.Success<ReturnType<typeof authorizeServiceSession>>,
      IErrorJson<Effect.Error<ReturnType<typeof authorizeServiceSession>>>
    >
  > {
    const { serviceSessionLock, sessionName, claims } = props;
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      authorizeServiceSession({
        serviceSessionLock,
        sessionName,
        claims,
        serviceName: this.key.serviceName,
        serviceVersion: this.key.serviceVersion,
        db: this.db,
        execution: this.#execution,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  override onAlarm(): Promise<void> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      runWorkerInvocation(this.recoveryRegistry.run()),
    );
  }
}
