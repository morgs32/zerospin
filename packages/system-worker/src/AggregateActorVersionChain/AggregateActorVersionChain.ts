import * as Effect from 'effect/Effect';
import { Server } from 'partyserver';

import {
  AggregateSessionChain,
  type IBrowserCommandsRpc,
  type IExecutionBrowserCommandsRpc,
} from '../aggregateSessionChain/AggregateSessionChain.js';
import type { IAggregateExecutionReplayProps } from '../aggregateSessionChain/getBrowserCommands/getBrowserCommands.js';
import { reconcileConnectionLocks } from '../aggregateSessionChain/reconcileConnectionLocks.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import {
  authoredReleaseRepoRuntime,
  requireAuthoredWorkerConfig,
} from '../workerConfiguration/workerConfiguration.js';

import { AggregateActorHistory } from './AggregateActorHistory.js';
import { aggregateActorVersionChainMigratableDORepoConfig } from './aggregateActorVersionChainMigratableDORepoConfig.js';

export class AggregateActorVersionChain extends makeMigratableDORepo(
  Server<Cloudflare.Env>,
  {
    repoType: 'AggregateActorVersionChain',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'AGGREGATE_ACTOR_VERSION_CHAIN',
    migratableDORepoConfig: aggregateActorVersionChainMigratableDORepoConfig,
  },
) {
  static options = { hibernate: true };
  readonly recoveryRegistry = makeRecoveryRegistry<unknown>({
    storage: this.ctx.storage,
  });
  readonly #history = new AggregateActorHistory({
    db: this.db,
    key: this.key,
    recoveryRegistry: this.recoveryRegistry,
    managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
    background: promise => this.ctx.waitUntil(promise),
  });

  get archiveFanout() {
    return this.#history.archiveFanout;
  }
  readonly #session = new AggregateSessionChain({
    actorHistory: this.#history,
    db: this.db,
    key: this.key,
    system: requireAuthoredWorkerConfig().system,
    getConnections: <T>() => this.getConnections<T>(),
  });

  override onRepoStartup() {
    return Effect.gen({ self: this }, function* () {
      yield* reconcileConnectionLocks(this.db, <T>() =>
        this.getConnections<T>(),
      );
      yield* this.#history.activate();
    });
  }

  override onAlarm(): Promise<void> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      runWorkerInvocation(this.recoveryRegistry.run()),
    );
  }

  getResolvedThrough(
    ...args: Parameters<AggregateSessionChain['getResolvedThrough']>
  ) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      this.#session
        .getResolvedThrough(...args)
        .pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  getBrowserCommands(
    props: Omit<IAggregateExecutionReplayProps, 'db' | 'history'>,
  ): Promise<IExecutionBrowserCommandsRpc>;

  getBrowserCommands(
    ...args: Parameters<AggregateSessionChain['getBrowserCommands']>
  ): Promise<IBrowserCommandsRpc>;

  getBrowserCommands(
    ...args: Parameters<AggregateSessionChain['getBrowserCommands']>
  ) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      this.#session
        .getBrowserCommands(...args)
        .pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  override onConnect(...args: Parameters<AggregateSessionChain['onConnect']>) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      runWorkerInvocation(this.#session.onConnect(...args)),
    );
  }

  override onClose(
    ...args: Parameters<AggregateSessionChain['onClose']>
  ): ReturnType<AggregateSessionChain['onClose']> {
    return this.#session.onClose(...args);
  }

  override onError(...args: Parameters<AggregateSessionChain['onError']>) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      this.#session.onError(...args),
    );
  }

  override onMessage(
    ...args: Parameters<AggregateSessionChain['onMessage']>
  ): Promise<void> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      runWorkerInvocation(this.#session.onMessage(...args)),
    );
  }

  appendExposedCommands(
    props: Parameters<AggregateSessionChain['appendExposedCommands']>[0],
  ) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      this.#session
        .appendExposedCommands(props)
        .pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  getCheckpoint(props: Parameters<AggregateSessionChain['getCheckpoint']>[0]) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      this.#session
        .getCheckpoint(props)
        .pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }
}
