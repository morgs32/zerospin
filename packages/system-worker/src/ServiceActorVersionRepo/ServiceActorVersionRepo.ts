import type { IServiceSessionSnapshot } from '@zerospin/core/serviceSession/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  ensureZerospinError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import { receiveProjectionPage } from '../projection/receiveProjectionPage.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';
import { ServiceProjectionReposLive } from '../repoServices/ServiceProjectionReposLive.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import { applyEvaluatedCommands } from '../serviceProjection/applyEvaluatedCommands.js';
import {
  captureServiceSnapshot,
  type IServiceSnapshotRequest,
} from '../serviceProjection/captureServiceSnapshot.js';
import { evaluatedCommandsFanoutSubscriber } from '../serviceProjection/evaluatedCommandsFanoutSubscriber.js';
import {
  makeExposedCommandOutbox,
  type IExposedCommandOutbox,
} from '../serviceProjection/makeExposedCommandOutbox.js';
import type { IServiceProjectionSubscriber } from '../serviceProjection/types.js';
import type { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';
import { authoredReleaseRepoRuntime } from '../workerConfiguration/workerConfiguration.js';

import { serviceActorVersionRepoMigratableDORepoConfig } from './serviceActorVersionRepoMigratableDORepoConfig.js';

/** Own one service actor's resources, projection checkpoint and complete pending selected publication. */
export class ServiceActorVersionRepo extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    repoType: 'ServiceActorVersionRepo',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'SERVICE_ACTOR_VERSION_REPO',
    migratableDORepoConfig: serviceActorVersionRepoMigratableDORepoConfig,
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
      managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
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
        this.actorVersionRepoFanoutSubscriber(this.key).subscribe(),
      ).pipe(Effect.flatMap(readRpcEnvelope));
    }).pipe(
      Effect.ensuring(this.#exposedCommandOutbox.wake().pipe(Effect.exit)),
    );
  }

  actorVersionRepoFanoutSubscriber(
    sourceKey: Parameters<typeof ServiceVersionChain.getRepo>[0]['key'],
  ): IServiceProjectionSubscriber {
    const exit = Effect.runSyncExit(
      evaluatedCommandsFanoutSubscriber({
        db: this.db,
        key: this.key,
        sourceKey,
        RpcTarget,
        managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
        encodeRpcOutcome: makeWorkerRpcEnvelope,
        receive: ({ rows }) =>
          receiveProjectionPage({
            apply: applyEvaluatedCommands({ rows, db: this.db, key: this.key }),
            outbox: this.#exposedCommandOutbox,
            currentIndex: () => this.#materializedIndex(),
          }),
      }).pipe(Effect.provide(ServiceProjectionReposLive)),
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

  getSnapshot(
    request: IServiceSnapshotRequest,
  ): Promise<IRpcEnvelope<IServiceSessionSnapshot, IZerospinErrorJson>> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      captureServiceSnapshot({
        db: this.db,
        key: this.key,
        request,
        publishThrough: serviceIndex =>
          this.#exposedCommandOutbox.drain(serviceIndex),
      }).pipe(Effect.provide(ServiceProjectionReposLive), effect =>
        makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  override onAlarm(): Promise<void> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      runWorkerInvocation(this.recoveryRegistry.run()),
    );
  }
}
