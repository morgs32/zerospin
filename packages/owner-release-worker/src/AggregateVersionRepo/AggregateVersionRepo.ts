import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { IReadQuery } from '@zerospin/core/models/reads/ReadQuerySchema';
import { OWNER_RELEASE_BINDING_PREFIX } from '@zerospin/core/system/ownerReleaseDeployment';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  mapParseError,
  type IErrorJson,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { type IRpcEnvelope } from '@zerospin/logger';
import { aggregateChainNameUtils } from '@zerospin/system-worker/AggregateChain/aggregateChainName';
import type { IAdmittedAggregateCommand } from '@zerospin/system-worker/AggregateChain/types';
import {
  decodeAggregateEvaluatedCommandRow,
  type IEvaluatedAggregateCommand,
} from '@zerospin/system-worker/AggregateVersionChain/evaluatedAggregateCommand';
import { aggregateVersionRepoDbConfig } from '@zerospin/system-worker/AggregateVersionRepo/aggregateVersionRepoDbConfig';
import { aggregateVersionRepoName } from '@zerospin/system-worker/AggregateVersionRepo/aggregateVersionRepoName';
import { getAggregateVersionRepo } from '@zerospin/system-worker/AggregateVersionRepo/getAggregateVersionRepo';
import { readAggregateMaterializationHead } from '@zerospin/system-worker/AggregateVersionRepo/readAggregateMaterializationHead';
import type { IAggregateVersionRepo } from '@zerospin/system-worker/AggregateVersionRepo/types';
import { executeDirectSystemAggregateCommand } from '@zerospin/system-worker/executeDirectSystemAggregateCommand/executeDirectSystemAggregateCommand';
import { bindRepoNamespace } from '@zerospin/system-worker/makeDORepo/bindRepoNamespace';
import {
  type IFanoutDelivery,
  type IFanoutEnrollmentError,
  type IFanoutSubscriberRepo,
} from '@zerospin/system-worker/makeFanoutQueue/makeFanoutQueue';
import type { IFanoutSubscriberCapability } from '@zerospin/system-worker/makeFanoutSubscriber/makeFanoutSubscriber';
import { makeMigratableDORepo } from '@zerospin/system-worker/makeMigratableDORepo/makeMigratableDORepo';
import { makeMigratableDORepoConfig } from '@zerospin/system-worker/makeMigratableDORepo/makeMigratableDORepoConfig';
import {
  makeOutboxQueue,
  type IWorkerOutboxQueue,
} from '@zerospin/system-worker/makeOutboxQueue/makeOutboxQueue';
import {
  makeOutboxSubscriber,
  type IOutboxSubscriberCapability,
} from '@zerospin/system-worker/makeOutboxSubscriber/makeOutboxSubscriber';
import { makeRecoveryRegistry } from '@zerospin/system-worker/makeRecoveryRegistry/makeRecoveryRegistry';
import { getAggregateVersionChain } from '@zerospin/system-worker/ownerOperations/releaseRepoNamespaces';
import '@zerospin/system-worker/SystemRepo/registerRepo/systemRepoNamespaces';
import { AggregateChains } from '@zerospin/system-worker/repoServices/AggregateChains';
import { AggregateVersionChains } from '@zerospin/system-worker/repoServices/AggregateVersionChains';
import { AggregateVersionRepos } from '@zerospin/system-worker/repoServices/AggregateVersionRepos';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '@zerospin/system-worker/runWorkerInvocation/runWorkerInvocation';
import {
  authoredReleaseRepoRuntime,
  requireAuthoredWorkerConfig,
} from '@zerospin/system-worker/workerConfiguration/workerConfiguration';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import { asc } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Semaphore from 'effect/Semaphore';

import { authorizeAggregateSession } from './authorizeAggregateSession/authorizeAggregateSession.js';
import { awaitCommandResult } from './awaitCommandResult/awaitCommandResult.js';
import { catchupMaterialization } from './catchupMaterialization/catchupMaterialization.js';
import { executeAggregateQuery } from './executeAggregateQuery/executeAggregateQuery.js';
import { finalizeCommandRows } from './finalizeCommand/finalizeCommandRows.js';
import { initializeAggregatePredecessor } from './initializeAggregatePredecessor.js';
import type { replayCommand } from './replayCommands/replayCommand.js';
import { replayCommands } from './replayCommands/replayCommands.js';
import { replayCommandsFanoutSubscriber } from './replayCommandsFanoutSubscriber/replayCommandsFanoutSubscriber.js';

const getAggregateChain = bindRepoNamespace(
  aggregateChainNameUtils,
  'AGGREGATE_CHAIN',
);

const aggregateVersionRepoMigratableDORepoConfig = makeMigratableDORepoConfig({
  migrations: [],
  ...aggregateVersionRepoName,
  /*
   * 1. Resolve the authored aggregate by DO name key.
   * 2. Select the listed aggregateVersion definition.
   * 3. Build the resolved DB config from that version's models.
   */
  dbConfig: Effect.fn('AggregateVersionRepo.dbConfig')(function* ({ key }) {
    // 1 — system.aggregates[key.aggregateName] or throw
    const aggregateRegistry = yield* getByKeyOrThrow({
      record: requireAuthoredWorkerConfig().system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    // 2 — select the listed version; fail if it is unsupported
    const aggregateRelease = yield* getByKeyOrThrow({
      record: aggregateRegistry.releases,
      key: key.aggregateVersion,
      recordKind: 'listed versions',
    });
    // 3 — combine the selected models with the Repo-owned metadata tables
    return makeResourceDbConfig({
      otherTables: aggregateVersionRepoDbConfig.tables,
      models: aggregateRelease.models,
    });
  }),
});
type IOriginalCommandSubscriber = IOutboxSubscriberCapability<
  'finalizeCommand',
  Parameters<typeof finalizeCommandRows>[0]['rows'][number],
  Effect.Success<ReturnType<typeof finalizeCommandRows>>,
  Effect.Error<ReturnType<typeof finalizeCommandRows>>
>;
type IOriginalCommandProgram = Effect.Effect<
  Effect.Success<ReturnType<typeof finalizeCommandRows>>,
  Effect.Error<ReturnType<typeof finalizeCommandRows>>,
  Exclude<
    Effect.Services<ReturnType<typeof finalizeCommandRows>>,
    AggregateChains | AggregateVersionChains
  >
>;

export class AggregateVersionRepo
  extends makeMigratableDORepo(DurableObject<Cloudflare.Env>, {
    repoType: 'AggregateVersionRepo',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'AGGREGATE_VERSION_REPO',
    migratableDORepoConfig: aggregateVersionRepoMigratableDORepoConfig,
  })
  implements
    IAggregateVersionRepo,
    IFanoutSubscriberRepo<{
      readonly name: 'replayCommandsFanout';
    }>
{
  readonly recoveryRegistry = makeRecoveryRegistry<unknown>({
    storage: this.ctx.storage,
  });

  protected readonly prepareReplayPayload: Parameters<
    typeof replayCommand
  >[0]['prepareReplayPayload'] =
    'ZEROSPIN_OWNER_RELEASE' in this.env ||
    Object.keys(this.env).some(name =>
      name.startsWith(OWNER_RELEASE_BINDING_PREFIX),
    )
      ? async (request, signal) => {
          const name = Effect.runSync(
            aggregateChainNameUtils.makeName(request),
          );
          const chain = this.env.AGGREGATE_CHAIN.getByName(name);
          signal.throwIfAborted();
          return Effect.runPromise(
            readRpcEnvelope(await chain.prepareAggregateReplayAdapter(request)),
          );
        }
      : undefined;

  readonly #execution = Effect.runSync(Semaphore.make(1));
  readonly #aggregateVersionChainOutbox: IWorkerOutboxQueue<
    'aggregateVersionChainOutbox',
    IEvaluatedAggregateCommand,
    void,
    IZerospinError | IZerospinErrorJson
  > = makeOutboxQueue({
    RpcTarget,
    managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    name: 'aggregateVersionChainOutbox',
    db: this.db,
    recoveryRegistry: this.recoveryRegistry,
    outboxTable: this.schema.aggregateVersionChainOutbox,
    indexColumnName: 'aggregateIndex',
    prepare: rows =>
      Effect.forEach(rows, row =>
        aggregateVersionRepoDbConfig.tables.aggregateVersionChainOutbox
          .decodeRow(row)
          .pipe(
            Effect.flatMap(decodeAggregateEvaluatedCommandRow),
            mapParseError({
              code: 'aggregate-evaluated-command-invalid',
              prefix: 'Invalid pending evaluated command',
            }),
          ),
      ),
    subscriber: () =>
      Effect.succeed({
        receive: (
          commands: readonly IEvaluatedAggregateCommand[],
        ): Promise<IRpcEnvelope<void, IZerospinErrorJson>> =>
          authoredReleaseRepoRuntime.managedRuntime.runPromise(
            Effect.gen({ self: this }, function* () {
              const chain = yield* getAggregateVersionChain({
                key: this.key,
              });
              return yield* Effect.promise(() =>
                chain.appendEvaluatedCommands({ commands }),
              ).pipe(Effect.flatMap(readRpcEnvelope));
            }).pipe(effect => makeWorkerRpcEnvelope(effect)),
          ),
      }),
  });

  /** Receive admitted rows through a source-bound fanout subscriber capability. */
  replayCommandsFanoutSubscriber(sourceKey: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
  }): IFanoutSubscriberCapability<
    'replayCommandsFanout',
    IAdmittedAggregateCommand,
    Effect.Error<ReturnType<typeof replayCommand>>,
    IZerospinError<'repo-key-encode-failed'>,
    IErrorJson<IZerospinError<'fanout-page-invalid'>>,
    IErrorJson<IFanoutEnrollmentError>
  > {
    const exit = Effect.runSyncExit(
      replayCommandsFanoutSubscriber({
        getCurrentIndex: () => {
          const materialized = readAggregateMaterializationHead(
            this.db,
          ).aggregateIndex;
          const pending = this.db
            .select({
              aggregateIndex:
                this.schema.aggregateVersionChainOutbox.aggregateIndex,
            })
            .from(this.schema.aggregateVersionChainOutbox)
            .orderBy(
              asc(this.schema.aggregateVersionChainOutbox.aggregateIndex),
            )
            .limit(1)
            .get();
          return pending === undefined
            ? materialized
            : Math.min(materialized, pending.aggregateIndex - 1);
        },
        RpcTarget,
        managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
        encodeRpcOutcome: makeWorkerRpcEnvelope,
        sourceKey,
        key: this.key,
        receive: (
          { rows }: IFanoutDelivery<IAdmittedAggregateCommand>,
          source,
        ) =>
          Effect.gen({ self: this }, function* () {
            yield* this.#aggregateVersionChainOutbox.producerLease;
            yield* replayCommands({
              source,
              rows,
              db: this.db,
              key: this.key,
              execution: this.#execution,
              prepareReplayPayload: this.prepareReplayPayload,
            }).pipe(
              Effect.provideService(AggregateChains, {
                getRepo: getAggregateChain,
              }),
              Effect.provideService(AggregateVersionChains, {
                getRepo: getAggregateVersionChain,
              }),
              Effect.ensuring(
                this.#aggregateVersionChainOutbox.wake().pipe(Effect.exit),
              ),
            );
            const throughIndex = rows.at(-1)?.aggregateIndex;
            // AggregateChain compacts only after replay has reached the VersionChain.
            if (throughIndex !== undefined) {
              yield* this.#aggregateVersionChainOutbox.drain(throughIndex);
            }
          }).pipe(Effect.scoped),
      }).pipe(
        Effect.provideService(AggregateChains, {
          getRepo: getAggregateChain,
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

  /** Arm retained output recovery and commit the captured finalized prefix before opening. */
  override onRepoStartup() {
    return Effect.gen({ self: this }, function* () {
      const aggregateRelease =
        requireAuthoredWorkerConfig().system.aggregates[this.key.aggregateName]
          ?.releases[this.key.aggregateVersion];
      if (
        aggregateRelease?.branchFrom !== undefined ||
        aggregateRelease?.rebuildFrom !== undefined
      ) {
        yield* this.#aggregateVersionChainOutbox.producerLease;
        yield* initializeAggregatePredecessor({
          db: this.db,
          key: this.key,
          aggregateRelease,
          execution: this.#execution,
          prepareReplayPayload: this.prepareReplayPayload,
          publishThrough: index =>
            this.#aggregateVersionChainOutbox.drain(index),
        }).pipe(
          Effect.provideService(AggregateChains, {
            getRepo: getAggregateChain,
          }),
          Effect.provideService(AggregateVersionChains, {
            getRepo: getAggregateVersionChain,
          }),
        );
      }
      yield* catchupMaterialization({ repo: this, key: this.key });
    }).pipe(
      Effect.scoped,
      Effect.ensuring(
        this.#aggregateVersionChainOutbox.wake().pipe(Effect.exit),
      ),
    );
  }

  readonly #finalizeCommandSubscriber: IOriginalCommandSubscriber =
    makeOutboxSubscriber({
      RpcTarget,
      managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
      encodeRpcOutcome: makeWorkerRpcEnvelope,
      name: 'finalizeCommand',
      receive: (
        rows: Parameters<typeof finalizeCommandRows>[0]['rows'],
      ): IOriginalCommandProgram =>
        Effect.gen({ self: this }, function* () {
          yield* this.#aggregateVersionChainOutbox.producerLease;
          return yield* finalizeCommandRows({
            rows,
            db: this.db,
            key: this.key,
            execution: this.#execution,
            replayThrough: index =>
              this.replayCommandsFanoutSubscriber(this.key).catchup(index),
          }).pipe(
            Effect.provideService(AggregateChains, {
              getRepo: getAggregateChain,
            }),
            Effect.provideService(AggregateVersionChains, {
              getRepo: acquisition => getAggregateVersionChain(acquisition),
            }),
            Effect.ensuring(
              this.#aggregateVersionChainOutbox.wake().pipe(Effect.exit),
            ),
          );
        }).pipe(Effect.scoped),
    });

  get finalizeCommandSubscriber(): IOriginalCommandSubscriber {
    return this.#finalizeCommandSubscriber;
  }

  /** Request bounded originals, then recover this version's replayed result. */
  async awaitCommandResult(props: {
    aggregateIndex: number;
  }): Promise<IRpcEnvelope<IEvaluatedAggregateCommand, IZerospinErrorJson>> {
    const { aggregateIndex } = props;
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      awaitCommandResult({
        aggregateIndex,
        db: this.db,
        key: this.key,
        replayThrough: index =>
          this.replayCommandsFanoutSubscriber(this.key).catchup(index),
      }).pipe(
        Effect.provideService(AggregateVersionChains, {
          getRepo: getAggregateVersionChain,
        }),
        Effect.provideService(AggregateChains, {
          getRepo: getAggregateChain,
        }),
        effect => makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  /** Read the declared models from this version's current committed materialization. */
  async executeAggregateQuery(query: IReadQuery) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      executeAggregateQuery({
        query,
        db: this.db,
        key: this.key,
        execution: this.#execution,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /*
   * 1. Bind this DO's aggregate identity and release into the authorize props.
   * 2. Run AggregateVersionRepo.authorizeAggregateSession on this db.
   * 3. makeWorkerRpcEnvelope the Effect result at the Durable Object boundary.
   */
  async authorizeAggregateSession(props: {
    sessionName: string;
    claims: Readonly<Record<string, unknown>>;
    aggregateSessionLock: IAggregateSessionLock;
  }): Promise<
    IRpcEnvelope<
      Effect.Success<ReturnType<typeof authorizeAggregateSession>>,
      IErrorJson<Effect.Error<ReturnType<typeof authorizeAggregateSession>>>
    >
  > {
    const { sessionName, claims, aggregateSessionLock } = props;
    // 1 — retain only session input; aggregate identity comes from this Repo
    // 2 — authorizeAggregateSession(...)
    // 3 — authoredReleaseRepoRuntime.managedRuntime.runPromise(...pipe(makeWorkerRpcEnvelope))
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      authorizeAggregateSession({
        executeDirectSystemAggregateCommand,
        sessionName,
        claims,
        aggregateSessionLock,
        db: this.db,
        systemId: this.key.systemId,
        aggregateId: this.key.aggregateId,
        aggregateName: this.key.aggregateName,
        aggregateVersion: this.key.aggregateVersion,
      }).pipe(
        Effect.provideService(AggregateVersionChains, {
          getRepo: getAggregateVersionChain,
        }),
        Effect.provideService(AggregateChains, {
          getRepo: getAggregateChain,
        }),
        Effect.provideService(AggregateVersionRepos, {
          getRepo: getAggregateVersionRepo,
        }),
        effect => makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  override onAlarm(): Promise<void> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      runWorkerInvocation(this.recoveryRegistry.run()),
    );
  }
}
