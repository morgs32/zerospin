import type { IServiceAgentSessionSnapshot } from '@zerospin/core/serviceAgentSession/ServiceAgentSessionSnapshotSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  ensureZerospinError,
  makeZerospinError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import config from 'config';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import { receiveProjectionPage } from '../projection/receiveProjectionPage.js';
import { RepoServicesLive } from '../repoServices/RepoServicesLive.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import { applyEvaluatedCommands } from '../serviceAgentProjection/applyEvaluatedCommands.js';
import {
  captureServiceAgentSnapshot,
  type IServiceAgentSnapshotRequest,
} from '../serviceAgentProjection/captureServiceAgentSnapshot.js';
import { evaluatedCommandsFanoutSubscriber } from '../serviceAgentProjection/evaluatedCommandsFanoutSubscriber.js';
import {
  makeExposedCommandOutbox,
  type IExposedCommandOutbox,
} from '../serviceAgentProjection/makeExposedCommandOutbox.js';
import type { IServiceAgentProjectionSubscriber } from '../serviceAgentProjection/types.js';
import type { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';

import { serviceAgentVersionRepoMigratableDORepoConfig } from './serviceAgentVersionRepoMigratableDORepoConfig.js';

/** Own one Service Agent's resources, projection checkpoint and complete pending selected publication. */
export class ServiceAgentVersionRepo extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    repoType: 'ServiceAgentVersionRepo',
    system: config.system,
    managedRuntime: config.managedRuntime,
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'SERVICE_AGENT_VERSION_REPO',
    migratableDORepoConfig: serviceAgentVersionRepoMigratableDORepoConfig,
  },
) {
  readonly recoveryRegistry = makeRecoveryRegistry<unknown>({
    storage: this.ctx.storage,
  });

  readonly #exposedCommandOutbox: IExposedCommandOutbox =
    makeExposedCommandOutbox({
      db: this.db,
      key: this.key,
      RpcTarget,
      managedRuntime: config.managedRuntime,
      recoveryRegistry: this.recoveryRegistry,
      runInvocation: runWorkerInvocation,
      background: promise => this.ctx.waitUntil(promise),
    });

  #materializedIndex() {
    const table = this.schema.materializationHead;
    return this.db.select().from(table).get()?.serviceIndex ?? 0;
  }

  override onRepoStartup(): Effect.Effect<
    void,
    IZerospinError | IZerospinErrorJson
  > {
    return Effect.gen({ self: this }, function* () {
      yield* this.#exposedCommandOutbox.drain(this.#materializedIndex()).pipe(
        Effect.mapError(error =>
          ensureZerospinError({
            code: 'projection-history-publication-failed',
            error,
          }),
        ),
      );
      yield* Effect.promise(() =>
        this.agentVersionRepoFanoutSubscriber(this.key).subscribe(),
      ).pipe(Effect.flatMap(readRpcEnvelope));
    }).pipe(
      Effect.ensuring(this.#exposedCommandOutbox.wake().pipe(Effect.exit)),
    );
  }

  agentVersionRepoFanoutSubscriber(
    sourceKey: Parameters<typeof ServiceVersionChain.getRepo>[0]['key'],
  ): IServiceAgentProjectionSubscriber {
    const exit = Effect.runSyncExit(
      evaluatedCommandsFanoutSubscriber({
        db: this.db,
        key: this.key,
        sourceKey,
        RpcTarget,
        managedRuntime: config.managedRuntime,
        encodeRpcOutcome: makeWorkerRpcEnvelope,
        receive: ({ rows }) =>
          receiveProjectionPage({
            apply: applyEvaluatedCommands({ rows, db: this.db, key: this.key }),
            outbox: this.#exposedCommandOutbox,
            currentIndex: () => this.#materializedIndex(),
          }),
      }).pipe(Effect.provide(RepoServicesLive)),
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

  /** Capture a bounded owner-history prefix, replay its model operations and publish that prefix. */
  synchronizeSelectedHistory(): Promise<
    IRpcEnvelope<number, IZerospinErrorJson>
  > {
    return config.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        yield* Effect.promise(() =>
          this.agentVersionRepoFanoutSubscriber(this.key).catchup(),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        const through = this.#materializedIndex();
        yield* this.#exposedCommandOutbox.drain(through);
        return through;
      }).pipe(
        Effect.mapError(error =>
          makeZerospinError({
            code: 'agent-selected-history-failed',
            cause: String(error),
          }),
        ),
        effect => makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  getSnapshot(
    request: IServiceAgentSnapshotRequest,
  ): Promise<IRpcEnvelope<IServiceAgentSessionSnapshot, IZerospinErrorJson>> {
    return config.managedRuntime.runPromise(
      captureServiceAgentSnapshot({
        db: this.db,
        key: this.key,
        request,
        publishThrough: serviceIndex =>
          this.#exposedCommandOutbox.drain(serviceIndex),
      }).pipe(Effect.provide(RepoServicesLive), effect =>
        makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  override onAlarm(): Promise<void> {
    return config.managedRuntime.runPromise(
      runWorkerInvocation(this.recoveryRegistry.run()),
    );
  }
}
