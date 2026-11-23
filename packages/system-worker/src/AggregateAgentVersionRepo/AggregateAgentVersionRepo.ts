import type { IAggregateAgentSessionSnapshot } from '@zerospin/core/agent/AggregateAgentSessionSnapshotSchema';
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

import { applyEvaluatedCommands } from '../aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommands.js';
import { evaluatedCommandsFanoutSubscriber } from '../aggregateProjection/evaluatedCommandsFanoutSubscriber/evaluatedCommandsFanoutSubscriber.js';
import { getAgentSnapshot } from '../aggregateProjection/getSnapshot/getSnapshot.js';
import {
  makeExposedCommandOutbox,
  type IExposedCommandOutbox,
} from '../aggregateProjection/makeExposedCommandOutbox.js';
import type {
  IAggregateAgentProjectionSnapshotRequest,
  IAggregateProjectionSubscriber,
} from '../aggregateProjection/types.js';
import type { AggregateVersionChain } from '../AggregateVersionChain/AggregateVersionChain.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';
import { receiveProjectionPage } from '../projection/receiveProjectionPage.js';
import { RepoServicesLive } from '../repoServices/RepoServicesLive.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';

import { aggregateAgentVersionRepoMigratableDORepoConfig } from './aggregateAgentVersionRepoMigratableDORepoConfig.js';

/** Materialize the exact agent view and durably publish selected deltas to its history Chain. */
export class AggregateAgentVersionRepo extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    repoType: 'AggregateAgentVersionRepo',
    system: config.system,
    managedRuntime: config.managedRuntime,
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'AGGREGATE_AGENT_VERSION_REPO',
    migratableDORepoConfig: aggregateAgentVersionRepoMigratableDORepoConfig,
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
        this.agentVersionChainFanoutSubscriber(this.key).subscribe(),
      ).pipe(Effect.flatMap(readRpcEnvelope));
    }).pipe(
      Effect.ensuring(this.#exposedCommandOutbox.wake().pipe(Effect.exit)),
    );
  }

  agentVersionChainFanoutSubscriber(
    sourceKey: Parameters<typeof AggregateVersionChain.getRepo>[0]['key'],
  ): IAggregateProjectionSubscriber {
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
          this.agentVersionChainFanoutSubscriber(this.key).catchup(),
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
    requested: IAggregateAgentProjectionSnapshotRequest,
  ): Promise<IRpcEnvelope<IAggregateAgentSessionSnapshot, IZerospinErrorJson>> {
    return config.managedRuntime.runPromise(
      getAgentSnapshot({
        db: this.db,
        key: this.key,
        requested,
        publishExposedCommandsThrough: aggregateIndex =>
          this.#exposedCommandOutbox.drain(aggregateIndex),
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
