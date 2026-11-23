import { buildCommandContinuation } from '@zerospin/core/contracts/buildCommandContinuation';
import {
  DirectSystemAggregateCommandSchema,
  EncodedAgentAggregateCommandSchema,
  EncodedSystemAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import {
  getOwnerReleaseBindingName,
  PREPARE_AGGREGATE_REPLAY_PATH,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { type IRpcEnvelope } from '@zerospin/logger';
import { deserialize, serialize } from 'capnweb';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import { asc, eq } from 'drizzle-orm';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import { readActiveProducerPosition } from '../agentNodeProducer/agentNodeProducerPosition.js';
import {
  AgentNodeGenerationSchema,
  transitionAgentNodeProducerTx,
  type IAgentNodeProducerTransition,
} from '../agentNodeProducer/transitionAgentNodeProducerTx.js';
import type { IAggregateReplayAdapterRequest } from '../aggregateReplayAdapter/AggregateReplayAdapterRequestSchema.js';
import {
  dispatchAggregateReplayAdapter,
  type ICallAggregateReplaySourceAdapter,
} from '../aggregateReplayAdapter/dispatchAggregateReplayAdapter.js';
import type { AggregateVersionChain } from '../AggregateVersionChain/AggregateVersionChain.js';
import type { IEvaluatedAggregateCommand } from '../AggregateVersionChain/evaluatedAggregateCommand.js';
import type { aggregateVersionRepoNameUtils } from '../AggregateVersionRepo/aggregateVersionRepoName.js';
import { getAggregateVersionRepo } from '../AggregateVersionRepo/getAggregateVersionRepo.js';
import type {
  IAggregateOriginalCommandSubscriber,
  IAggregateVersionRepo,
} from '../AggregateVersionRepo/types.js';
import type { IPreparedAggregateReplayPayload } from '../AggregateVersionRepo/utils/resolveAggregateExecution.js';
import { admitRecordedCommandFromAggregateChain } from '../commandOperations/admitRecordedCommand.js';
import { makeCommandDeliveryQueue } from '../commandOperations/makeCommandDeliveryQueue.js';
import { makeExternalOperationQueue } from '../externalOperations/makeExternalOperationQueue.js';
import {
  runExternalContinuation,
  requestExternalObservation,
} from '../externalOperations/runExternalOperation.js';
import {
  makeFanoutQueue,
  type IFanoutQueue,
  type IFanoutRepo,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import {
  makeOutboxQueue,
  type IWorkerOutboxQueue,
} from '../makeOutboxQueue/makeOutboxQueue.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import {
  CommandContinuationResponseSchema,
  ExternalContinuationResponseSchema,
} from '../ownerOperations/ownerOperationSchema.js';
import { getAggregateVersionChain } from '../ownerOperations/releaseRepoNamespaces.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';
import { runOwnerOperation } from '../ownerOperations/runOwnerOperation.js';
import { validateReleaseAdmission } from '../ownerOperations/validateReleaseAdmission.js';
import { AggregateVersionChains } from '../repoServices/AggregateVersionChains.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import {
  frameworkWorkerRuntime,
  readAuthoredWorkerConfig,
  readExecutingSystemSpec,
  runWorkerPromise,
} from '../workerConfiguration/workerConfiguration.js';

import { admitAggregateAgentCommandTx } from './admitAggregateAgentCommandTx.js';
import { admitAggregateCommands } from './admitAggregateCommands/admitAggregateCommands.js';
import { admitCommandContinuation } from './admitCommandContinuation.js';
import { admitDirectSystemAggregateCommandTx } from './admitDirectSystemAggregateCommandTx.js';
import {
  admitFromAggregateChainTx,
  admitFromServiceChainTx,
} from './admitRecordedAggregateCommandTx.js';
import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';
import { aggregateChainMigratableDORepoConfig } from './aggregateChainMigratableDORepoConfig.js';
import { compactAggregateHistory } from './compactAggregateHistory.js';
import { executeCommandsThrough } from './executeCommandsThrough/executeCommandsThrough.js';
import { initializeAgentNodes } from './initializeAgentNodes.js';
import { onRepoStartup } from './onRepoStartup/onRepoStartup.js';
import { readAdmittedAggregateCommand } from './readAdmittedAggregateCommand.js';
import { readAggregateCommand } from './readAggregateCommand.js';
import { readPendingAggregateCommand } from './readPendingAggregateCommand.js';
import { readReplayPage } from './readReplayPage.js';
import { recordExternalOutcomeAndAdmitCommandTx } from './recordExternalOutcomeAndAdmitCommandTx.js';
import { recordOriginalCommandOutcomeTx } from './recordOriginalCommandOutcomeTx.js';
import { registerAggregateNodeTx } from './registerAggregateNodeTx.js';
import type { IAdmittedAggregateCommand } from './types.js';

const deliveryPositionSchema = Schema.Struct({
  sourceIndex: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  operationIndex: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  ),
});

export class AggregateChain
  extends makeMigratableDORepo(DurableObject<Cloudflare.Env>, {
    repoType: 'AggregateChain',
    getSystemSpecHash: () => readExecutingSystemSpec().hash,
    managedRuntime: frameworkWorkerRuntime,
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'AGGREGATE_CHAIN',
    migratableDORepoConfig: aggregateChainMigratableDORepoConfig,
  })
  implements IFanoutRepo<'replayCommandsFanout', IAggregateVersionRepo>
{
  readonly recoveryRegistry = makeRecoveryRegistry<unknown>({
    storage: this.ctx.storage,
  });

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);
    this.recoveryRegistry.register(
      'initializeAgentNodes',
      this.#initializeAgentNodes,
    );
  }

  protected readonly callAggregateReplaySourceAdapter: ICallAggregateReplaySourceAdapter =
    async (request, signal) => {
      const { aggregateName, aggregateVersion } = request.command;
      const name = getOwnerReleaseBindingName({
        aggregateName,
        aggregateVersion,
      });
      const service: unknown = Reflect.get(this.env, name);
      if (
        typeof service !== 'object' ||
        service === null ||
        !('fetch' in service) ||
        typeof service.fetch !== 'function'
      ) {
        throw makeZerospinError({
          code: 'aggregate-replay-adapter-source-unavailable',
          message: `No registered release binding for ${aggregateName}@${aggregateVersion}`,
        });
      }
      const response: Response = await service.fetch(
        new URL(
          PREPARE_AGGREGATE_REPLAY_PATH,
          'https://owner-release.internal',
        ),
        { method: 'POST', body: serialize(request), signal },
      );
      if (!response.ok) {
        throw makeZerospinError({
          code: 'aggregate-replay-adapter-source-failed',
          message: `Adapter Worker for ${aggregateName}@${aggregateVersion} returned ${response.status}`,
        });
      }
      return deserialize(await response.text());
    };

  #scheduledAgentsInitialized = false;

  readonly #initializeAgentNodes = Effect.gen({ self: this }, function* () {
    if (this.#scheduledAgentsInitialized) {
      return;
    }
    yield* initializeAgentNodes({
      key: this.key,
      recoveryRegistry: this.recoveryRegistry,
    });
    this.#scheduledAgentsInitialized = true;
  });

  readonly #replayAggregateVersions = Object.values(
    readExecutingSystemSpec().aggregates[this.key.aggregateName]?.releases ??
      {},
  ).map(release => release.version);

  /**
   * Fanout: AggregateChain → AggregateVersionRepo.
   *
   * WHO: replaySubscribers whose aggregate release is currently authored.
   * LOG: the contiguous finalized command prefix in aggregateIndex order.
   * DELIVER: VAR subscriber.receive(delivery); acknowledgement follows its durable commit.
   * ENROLL: Activation fixes each child's predecessor prefix before admitting more commands.
   */
  readonly #replayCommandsFanout: IFanoutQueue<
    'replayCommandsFanout',
    {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: number;
    },
    IAdmittedAggregateCommand,
    IZerospinError | IZerospinErrorJson
  > = makeFanoutQueue({
    RpcTarget,
    managedRuntime: frameworkWorkerRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    concurrency: 100,
    name: 'replayCommandsFanout',
    recoveryRegistry: this.recoveryRegistry,
    db: this.db,
    readPage: page =>
      readReplayPage(this.db, page, this.key).pipe(
        Effect.provideService(AggregateVersionChains, {
          getRepo: acquisition => getAggregateVersionChain(acquisition),
        }),
      ),
    acknowledge: tx =>
      compactAggregateHistory(tx, this.#replayAggregateVersions),
    subscriberTable: this.schema.replaySubscribers,
    subscriberIdentityColumns: {
      aggregateVersion: this.schema.replaySubscribers.aggregateVersion,
    },
    subscriberIndexColumn:
      this.schema.replaySubscribers.acknowledgedAggregateIndex,
    subscriberPrefixColumn:
      this.schema.replaySubscribers.initializationThroughIndex,
    subscriberIdentityFromKey: key =>
      Effect.succeed({ aggregateVersion: key.aggregateVersion }),
    subscriberKeyFromIdentity: identity =>
      Effect.succeed({ ...this.key, ...identity }),
    availableSubscriberIdentities: this.#replayAggregateVersions.map(
      aggregateVersion => ({ aggregateVersion }),
    ),
    subscriberKeySchema: Schema.Struct({
      systemId: Schema.String,
      aggregateId: Schema.String,
      aggregateName: Schema.String,
      aggregateVersion: VersionSchema,
    }),
    key: this.key,
    getRepo: getAggregateVersionRepo,
  });

  get replayCommandsFanout(): IFanoutQueue<
    'replayCommandsFanout',
    {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: number;
    },
    IAdmittedAggregateCommand,
    IZerospinError | IZerospinErrorJson
  > {
    return this.#replayCommandsFanout;
  }

  #finalizationAdvanced = Deferred.makeUnsafe<void>();

  readonly #finalizeCommandOutbox: IWorkerOutboxQueue<
    'finalizeCommandOutbox',
    IAdmittedAggregateCommand,
    readonly IEvaluatedAggregateCommand[],
    IZerospinError | IZerospinErrorJson
  > = makeOutboxQueue({
    RpcTarget,
    managedRuntime: frameworkWorkerRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    name: 'finalizeCommandOutbox',
    pageSize: 1,
    db: this.db,
    recoveryRegistry: this.recoveryRegistry,
    outboxTable: this.schema.commands,
    indexColumnName: 'aggregateIndex',
    storage: {
      hasPending: () => readPendingAggregateCommand(this.db) !== undefined,
      readPage: (throughIndex?: number) => {
        const row = readPendingAggregateCommand(this.db, throughIndex);
        return row === undefined
          ? []
          : [
              {
                row: readAdmittedAggregateCommand(row, this.key),
                index: row.aggregateIndex,
              },
            ];
      },
      acknowledge: (
        indices: readonly number[],
        evaluatedCommands: readonly IEvaluatedAggregateCommand[],
      ) =>
        recordOriginalCommandOutcomeTx(
          this.db,
          indices,
          evaluatedCommands,
          this.key,
        ),
    },
    subscriber: (
      rows,
    ): Effect.Effect<
      Disposable & Pick<IAggregateOriginalCommandSubscriber, 'receive'>,
      Effect.Error<ReturnType<typeof aggregateVersionRepoNameUtils.makeName>>,
      never
    > =>
      Effect.gen({ self: this }, function* () {
        const command = rows[0];
        if (rows.length !== 1 || command === undefined) {
          return yield* Effect.die(
            new Error('Original outbox delivery must contain its selected row'),
          );
        }
        const repo = yield* getAggregateVersionRepo({
          key: { ...this.key, aggregateVersion: command.aggregateVersion },
        });
        return yield* Effect.promise(() => repo.finalizeCommandSubscriber);
      }),
    // Original delivery keeps recovery until replay owns its own durable wake.
    afterAcknowledge: () =>
      Effect.gen({ self: this }, function* () {
        const advanced = this.#finalizationAdvanced;
        this.#finalizationAdvanced = Deferred.makeUnsafe<void>();
        yield* Deferred.succeed(advanced, undefined);
        yield* this.#replayCommandsFanout.producerLease;
        yield* this.#commandOperationQueue.producerLease;
        yield* this.#externalOperationQueue
          .wake()
          .pipe(
            Effect.ensuring(
              this.#replayCommandsFanout.wake().pipe(Effect.exit),
            ),
            Effect.ensuring(
              this.#commandOperationQueue.wake().pipe(Effect.exit),
            ),
          );
      }).pipe(Effect.scoped),
  });

  get finalizeCommandOutbox(): IWorkerOutboxQueue<
    'finalizeCommandOutbox',
    IAdmittedAggregateCommand,
    readonly IEvaluatedAggregateCommand[],
    IZerospinError | IZerospinErrorJson
  > {
    return this.#finalizeCommandOutbox;
  }

  readonly #commandOperationQueue = makeCommandDeliveryQueue({
    managedRuntime: frameworkWorkerRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    db: this.db,
    source: this.key,
    admit: delivery =>
      admitRecordedCommandFromAggregateChain({ source: this.key, delivery }),
    recoveryRegistry: this.recoveryRegistry,
    outboxTable: this.schema.commandOperationOutbox,
    indexColumnName: 'aggregateIndex',
    readPending: () => {
      const rows = this.db
        .select()
        .from(this.schema.commandOperationOutbox)
        .orderBy(
          asc(this.schema.commandOperationOutbox.aggregateIndex),
          asc(this.schema.commandOperationOutbox.operationIndex),
        )
        .all();
      return rows.map(row => {
        const {
          aggregateIndex: sourceIndex,
          continuationFailure,
          ...delivery
        } = Schema.decodeUnknownSync(
          aggregateChainDbConfig.tables.commandOperationOutbox.codec,
        )(row);
        return {
          ...delivery,
          sourceIndex,
          ...(continuationFailure === null ? {} : { continuationFailure }),
        };
      });
    },
    acknowledge: (delivery, outcome) =>
      Effect.gen({ self: this }, function* () {
        const recorded = delivery.command;
        const prepared = recorded.continuation;
        const continuation =
          prepared === undefined
            ? null
            : delivery.continuationFailure !== undefined
              ? { ...delivery.continuationFailure, id: prepared.id }
              : yield* runOwnerOperation({
                  env: this.env,
                  release: {
                    aggregateName: this.key.aggregateName,
                    aggregateVersion: prepared.ownerVersion,
                  },
                  request: {
                    _tag: 'CommandContinuation',
                    recorded,
                    outcome,
                  },
                  local: Effect.gen({ self: this }, function* () {
                    const config = readAuthoredWorkerConfig();
                    const release =
                      config?.system.aggregates[this.key.aggregateName]
                        ?.releases[prepared.ownerVersion];
                    if (config === undefined || release === undefined) {
                      return yield* makeZerospinError(
                        'command-continuation-owner-unavailable',
                      );
                    }
                    const context = yield* config.managedRuntime.contextEffect;
                    return yield* provideReleaseLayer(
                      release,
                      buildCommandContinuation(release, { recorded, outcome }),
                    ).pipe(Effect.provideContext(context));
                  }),
                  response: CommandContinuationResponseSchema,
                });
        if (continuation !== null && continuation.id !== prepared?.id) {
          return yield* makeZerospinError('command-continuation-id-mismatch');
        }
        yield* admitCommandContinuation(this.db, {
          continuation,
          delivery,
          key: this.key,
          producerLease: this.#finalizeCommandOutbox.producerLease,
        }).pipe(
          Effect.ensuring(this.#finalizeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped),
  });

  readonly #externalOperationQueue = makeExternalOperationQueue({
    recoveryRegistry: this.recoveryRegistry,
    db: this.db,
    outboxTable: this.schema.externalOperationOutbox,
    operationCodec: aggregateChainDbConfig.tables.externalOperationOutbox.codec,
    recordExternalOutcomeAndAdmitCommand: (operation, externalOutcome) =>
      Effect.gen({ self: this }, function* () {
        return yield* recordExternalOutcomeAndAdmitCommandTx(this.db, {
          externalCommandId: operation.externalCommandId,
          externalOutcome,
          key: this.key,
          producerLease: this.#finalizeCommandOutbox.producerLease,
          build: (aggregateVersion, input) => {
            const { aggregateName } = this.key;
            const release =
              readAuthoredWorkerConfig()?.system.aggregates[aggregateName]
                ?.releases[aggregateVersion];
            return runOwnerOperation({
              env: this.env,
              release: { aggregateName, aggregateVersion },
              request: input,
              local: runExternalContinuation(release, input),
              response: ExternalContinuationResponseSchema,
            });
          },
        }).pipe(
          Effect.ensuring(this.#finalizeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped),
    request: operation =>
      requestExternalObservation(
        this.env,
        {
          aggregateName: this.key.aggregateName,
          aggregateVersion: operation.aggregateVersion,
        },
        operation,
      ),
    run: program => runWorkerPromise(runWorkerInvocation(program)),
    background: promise => this.ctx.waitUntil(promise),
  });

  async getAggregateCommand(props: {
    aggregateIndex: number;
  }): Promise<
    IRpcEnvelope<IAdmittedAggregateCommand | null, IZerospinErrorJson>
  > {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const { aggregateIndex } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            aggregateIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThan(0),
            ),
          }),
        )(props).pipe(
          mapParseError({
            code: 'aggregate-input-cursor-invalid',
            prefix: 'Invalid admitted input cursor',
          }),
        );
        return yield* readAggregateCommand({
          db: this.db,
          key: this.key,
          aggregateIndex,
        });
      }).pipe(
        Effect.provideService(AggregateVersionChains, {
          getRepo: acquisition => getAggregateVersionChain(acquisition),
        }),
        effect => makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  readonly #readAggregatePredecessor = (props: { aggregateVersion: number }) =>
    Effect.gen({ self: this }, function* () {
      const { aggregateVersion } = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ aggregateVersion: VersionSchema }),
      )(props).pipe(
        mapParseError({
          code: 'aggregate-predecessor-release-invalid',
          prefix: 'Invalid Aggregate predecessor request',
        }),
      );
      const release =
        readExecutingSystemSpec().aggregates[this.key.aggregateName]?.releases[
          aggregateVersion
        ];
      const predecessor = release?.branchFrom ?? release?.rebuildFrom;
      if (predecessor === undefined) {
        return yield* makeZerospinError('aggregate-predecessor-unavailable');
      }
      const { replaySubscribers } = this.schema;
      const subscriber = this.db
        .select()
        .from(replaySubscribers)
        .where(eq(replaySubscribers.aggregateVersion, aggregateVersion))
        .get();
      if (subscriber === undefined) {
        return yield* makeZerospinError(
          'aggregate-predecessor-watermark-missing',
        );
      }
      return {
        aggregateVersion: predecessor,
        aggregateIndex: subscriber.initializationThroughIndex,
      };
    });

  /** Return the named predecessor and the watermark saved at enrollment. */
  async prepareAggregatePredecessor(props: {
    aggregateVersion: number;
  }): Promise<
    IRpcEnvelope<
      { aggregateVersion: number; aggregateIndex: number },
      IZerospinErrorJson
    >
  > {
    return runWorkerPromise(
      this.#readAggregatePredecessor(props).pipe(makeWorkerRpcEnvelope),
    );
  }

  /** Wait for the prefix commit while the original outbox continues delivering. */
  readonly #awaitFinalizedPrefix = (aggregateIndex: number) =>
    Effect.gen({ self: this }, function* () {
      const readProgress = () =>
        this.db.select().from(this.schema.commandProgress).get();
      let progress = readProgress();
      if (progress === undefined) {
        return yield* makeZerospinError('aggregate-command-progress-missing');
      }
      if (progress.finalizedThroughIndex >= aggregateIndex) return;
      yield* this.#finalizeCommandOutbox.wake();
      for (;;) {
        const advanced = this.#finalizationAdvanced;
        progress = readProgress();
        if (progress === undefined) {
          return yield* makeZerospinError('aggregate-command-progress-missing');
        }
        if (progress.finalizedThroughIndex >= aggregateIndex) return;
        yield* Deferred.await(advanced);
      }
    }).pipe(
      Effect.timeoutOrElse({
        duration: '5 seconds',
        orElse: () =>
          Effect.fail(
            makeZerospinError({
              code: 'aggregate-predecessor-finalization-pending',
              extra: { retryable: true },
            }),
          ),
      }),
    );

  /** Complete the named predecessor's publication through the enrolled watermark. */
  async catchupAggregatePredecessor(props: {
    aggregateVersion: number;
  }): Promise<IRpcEnvelope<void, IZerospinErrorJson>> {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const point = yield* this.#readAggregatePredecessor(props);
        if (point.aggregateIndex === 0) return;
        yield* this.#awaitFinalizedPrefix(point.aggregateIndex);
        const key = { ...this.key, aggregateVersion: point.aggregateVersion };
        const history = yield* getAggregateVersionChain({ key });
        const publishedThrough = () =>
          Effect.promise(() =>
            history.getEvaluatedCommandPage({ afterIndex: 0, maxIndex: 0 }),
          ).pipe(
            Effect.flatMap(readRpcEnvelope),
            Effect.map(page => page.lastIndex),
          );
        if ((yield* publishedThrough()) >= point.aggregateIndex) return;
        const catchup = yield* getAggregateVersionRepo({ key }).pipe(
          Effect.flatMap(repo =>
            Effect.promise(async () => {
              using subscriber = await repo.replayCommandsFanoutSubscriber(
                this.key,
              );
              return await subscriber.catchup(point.aggregateIndex);
            }),
          ),
          Effect.flatMap(readRpcEnvelope),
          Effect.exit,
        );
        // A cold predecessor can publish the prefix before a later replay fails.
        if (
          Exit.isFailure(catchup) &&
          (yield* publishedThrough()) < point.aggregateIndex
        ) {
          return yield* Effect.failCause(catchup.cause);
        }
      }).pipe(makeWorkerRpcEnvelope),
    );
  }

  /** Prepare input for an older release using the exact finalized entry retained by this Chain. */
  async prepareAggregateReplayAdapter(
    request: IAggregateReplayAdapterRequest,
  ): Promise<
    IRpcEnvelope<IPreparedAggregateReplayPayload, IZerospinErrorJson>
  > {
    return runWorkerPromise(
      dispatchAggregateReplayAdapter({
        request,
        key: this.key,
        system: readExecutingSystemSpec(),
        readFinalizedCommand: aggregateIndex =>
          readReplayPage(
            this.db,
            { afterIndex: aggregateIndex - 1, maxIndex: aggregateIndex },
            this.key,
          ).pipe(
            Effect.map(page => page.rows[0]?.row ?? null),
            Effect.provideService(AggregateVersionChains, {
              getRepo: acquisition => getAggregateVersionChain(acquisition),
            }),
          ),
        callSourceAdapter: this.callAggregateReplaySourceAdapter,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Capture admission once and request original progress through that bounded position. */
  async executeCommandsThrough(
    aggregateIndex?: number,
  ): Promise<IRpcEnvelope<void, IZerospinErrorJson>> {
    return runWorkerPromise(
      executeCommandsThrough({
        db: this.db,
        aggregateIndex,
        finalizeCommandOutbox: this.#finalizeCommandOutbox,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Register Aggregate membership, enroll authored releases and retain recovery before admitting events. */

  override onRepoStartup() {
    return Effect.gen({ self: this }, function* () {
      const systemRepo = this.env.SYSTEM_REPO.getByName(this.key.systemId);
      yield* Effect.promise(() =>
        systemRepo.registerAggregate({
          aggregateName: this.key.aggregateName,
          aggregateId: this.key.aggregateId,
        }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      // SystemRepo resolves the serving selection even during a Worker code update.
      yield* this.recoveryRegistry.hold('initializeAgentNodes');
      yield* onRepoStartup({
        db: this.db,
        key: this.key,
        recoveryRegistry: this.recoveryRegistry,
      });
      yield* this.#externalOperationQueue.wake();
      yield* this.#commandOperationQueue.wake();
    });
  }

  /*
   * AggregateChain durably orders complete aggregate inputs and returns
   * the admitted commands. Each Node batch commits atomically and original
   * delivery routes each command to its retained aggregateVersion.
   *
   * 1. Hold original-delivery recovery.
   * 2. Commit the admitted commands.
   * 3. Start original delivery after admission; the scheduled wake-up recovers interruption.
   */
  async admitAggregateCommands(props: {
    commands: readonly IEncodedCommand<IAggregateCommand>[];
  }) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const { commands } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            commands: Schema.Array(Schema.Unknown),
          }),
        )(props).pipe(
          mapParseError({
            code: 'aggregate-chain-command-invalid',
            prefix: 'Invalid aggregate input',
          }),
        );
        yield* this.#finalizeCommandOutbox.producerLease;
        return yield* admitAggregateCommands({
          commands,
          db: this.db,
          key: this.key,
        }).pipe(
          Effect.ensuring(this.#finalizeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Establish or verify the authenticated Node's producer binding. */
  async registerNode(props: {
    nodeId: string;
    aggregateVersion: number;
    sessionName: string;
    actorName: string;
    actorVersion: number;
    claims: Readonly<Record<string, unknown>>;
    create: boolean;
  }) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const registration = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            nodeId: Schema.NonEmptyString,
            aggregateVersion: VersionSchema,
            sessionName: Schema.NonEmptyString,
            actorName: Schema.NonEmptyString,
            actorVersion: VersionSchema,
            claims: Schema.Record(Schema.String, Schema.Unknown),
            create: Schema.Boolean,
          }),
        )(props, { onExcessProperty: 'error' });
        return yield* registerAggregateNodeTx(this.db, registration);
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  #validateUnrecordedCommand(
    command: typeof EncodedSystemAggregateCommandSchema.Type,
  ) {
    const table = this.schema.recordedCommandAdmissions;
    return this.db
      .select()
      .from(table)
      .where(eq(table.commandId, command.id))
      .get() === undefined
      ? validateReleaseAdmission(command)
      : Effect.void;
  }

  async admitFromAggregateChain(props: {
    source: { systemId: string; aggregateName: string; aggregateId: string };
    position: { sourceIndex: number; operationIndex: number };
    command: typeof EncodedSystemAggregateCommandSchema.Type;
  }) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            source: Schema.Struct({
              systemId: Schema.NonEmptyString,
              aggregateName: Schema.NonEmptyString,
              aggregateId: Schema.NonEmptyString,
            }),
            position: deliveryPositionSchema,
            command: EncodedSystemAggregateCommandSchema,
          }),
        )(props, { onExcessProperty: 'error' });
        yield* this.#finalizeCommandOutbox.producerLease;
        yield* this.#validateUnrecordedCommand(decoded.command);
        return yield* admitFromAggregateChainTx(this.db, {
          ...decoded,
          key: this.key,
        }).pipe(
          Effect.ensuring(this.#finalizeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async admitFromServiceChain(props: {
    source: { systemId: string; serviceName: string };
    position: { sourceIndex: number; operationIndex: number };
    command: typeof EncodedSystemAggregateCommandSchema.Type;
  }) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            source: Schema.Struct({
              systemId: Schema.NonEmptyString,
              serviceName: Schema.NonEmptyString,
            }),
            position: deliveryPositionSchema,
            command: EncodedSystemAggregateCommandSchema,
          }),
        )(props, { onExcessProperty: 'error' });
        yield* this.#finalizeCommandOutbox.producerLease;
        yield* this.#validateUnrecordedCommand(decoded.command);
        return yield* admitFromServiceChainTx(this.db, {
          ...decoded,
          key: this.key,
        }).pipe(
          Effect.ensuring(this.#finalizeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  transitionAgentNodeProducer(props: IAgentNodeProducerTransition) {
    return runWorkerPromise(
      transitionAgentNodeProducerTx(this.db, props).pipe(effect =>
        makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  async admitFromAggregateAgentNode(props: {
    source: {
      systemId: string;
      aggregateName: string;
      aggregateId: string;
      agentName: string;
    };
    generation: number;
    producerIndex: number;
    command: typeof EncodedAgentAggregateCommandSchema.Type;
  }) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            source: Schema.Struct({
              systemId: Schema.NonEmptyString,
              aggregateName: Schema.NonEmptyString,
              aggregateId: Schema.NonEmptyString,
              agentName: Schema.NonEmptyString,
            }),
            generation: AgentNodeGenerationSchema,
            producerIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isBetween({
                minimum: 1,
                maximum: Number.MAX_SAFE_INTEGER,
              }),
            ),
            command: EncodedAgentAggregateCommandSchema,
          }),
        )(props, { onExcessProperty: 'error' });
        yield* this.#finalizeCommandOutbox.producerLease;
        const lastProducerIndex = yield* readActiveProducerPosition(
          this.db,
          decoded.source.agentName,
          decoded.generation,
        );
        if (decoded.producerIndex === lastProducerIndex + 1) {
          yield* validateReleaseAdmission(decoded.command);
        }
        return yield* admitAggregateAgentCommandTx(this.db, {
          ...decoded,
          key: this.key,
        }).pipe(
          Effect.ensuring(this.#finalizeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Allocate one fresh System invocation under the original-delivery lease. */
  async admitDirectSystemCommand(props: {
    command: typeof DirectSystemAggregateCommandSchema.Type;
  }) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.#finalizeCommandOutbox.producerLease;
        const command = yield* Schema.decodeUnknownEffect(
          DirectSystemAggregateCommandSchema,
        )(props.command, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'system-command-input-invalid',
            prefix: 'Invalid direct System input',
          }),
        );
        yield* validateReleaseAdmission(command);
        return yield* admitDirectSystemAggregateCommandTx(this.db, {
          command,
          key: this.key,
          systemSpec: readExecutingSystemSpec(),
        }).pipe(
          Effect.ensuring(this.#finalizeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  override onAlarm(): Promise<void> {
    return runWorkerPromise(runWorkerInvocation(this.recoveryRegistry.run()));
  }
}
