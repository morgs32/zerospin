import type { IAggregateSessionSnapshot } from '@zerospin/core/aggregateSession/types';
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

import { applyEvaluatedCommands } from '../aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommands.js';
import { evaluatedCommandsFanoutSubscriber } from '../aggregateProjection/evaluatedCommandsFanoutSubscriber/evaluatedCommandsFanoutSubscriber.js';
import { getSnapshot } from '../aggregateProjection/getSnapshot/getSnapshot.js';
import {
  makeExposedCommandOutbox,
  type IExposedCommandOutbox,
} from '../aggregateProjection/makeExposedCommandOutbox.js';
import type {
  IAggregateActorProjectionSnapshotRequest,
  IAggregateProjectionSubscriber,
} from '../aggregateProjection/types.js';
import type { AggregateVersionChain } from '../AggregateVersionChain/AggregateVersionChain.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import { receiveProjectionPage } from '../projection/receiveProjectionPage.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';
import { AggregateProjectionReposLive } from '../repoServices/AggregateProjectionReposLive.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import { authoredReleaseRepoRuntime } from '../workerConfiguration/workerConfiguration.js';

import { aggregateActorVersionRepoMigratableDORepoConfig } from './aggregateActorVersionRepoMigratableDORepoConfig.js';

/** Materialize the exact actor view and durably publish selected deltas to its history Chain. */
export class AggregateActorVersionRepo extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    repoType: 'AggregateActorVersionRepo',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'AGGREGATE_ACTOR_VERSION_REPO',
    migratableDORepoConfig: aggregateActorVersionRepoMigratableDORepoConfig,
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
    return this.db.select().from(table).get()?.aggregateIndex ?? 0;
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
        this.actorVersionChainFanoutSubscriber(this.key).subscribe(),
      ).pipe(Effect.flatMap(readRpcEnvelope));
    }).pipe(
      Effect.ensuring(this.#exposedCommandOutbox.wake().pipe(Effect.exit)),
    );
  }

  actorVersionChainFanoutSubscriber(
    sourceKey: Parameters<typeof AggregateVersionChain.getRepo>[0]['key'],
  ): IAggregateProjectionSubscriber {
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
      }).pipe(Effect.provide(AggregateProjectionReposLive)),
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
    requested: IAggregateActorProjectionSnapshotRequest,
  ): Promise<IRpcEnvelope<IAggregateSessionSnapshot, IZerospinErrorJson>> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      getSnapshot({
        db: this.db,
        key: this.key,
        requested,
        publishExposedCommandsThrough: aggregateIndex =>
          this.#exposedCommandOutbox.drain(aggregateIndex),
      }).pipe(Effect.provide(AggregateProjectionReposLive), effect =>
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
