import { buildCommandContinuation } from '@zerospin/core/contracts/buildCommandContinuation';
import {
  DirectSystemServiceCommandSchema,
  EncodedAgentServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  type IErrorJson,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { type IRpcEnvelope } from '@zerospin/logger';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import { asc, eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as References from 'effect/References';
import * as Schema from 'effect/Schema';

import { readActiveProducerPosition } from '../agentNodeProducer/agentNodeProducerPosition.js';
import {
  transitionAgentNodeProducerTx,
  type IAgentNodeProducerTransition,
} from '../agentNodeProducer/transitionAgentNodeProducerTx.js';
import { admitRecordedCommandFromServiceChain } from '../commandOperations/admitRecordedCommand.js';
import { makeCommandDeliveryQueue } from '../commandOperations/makeCommandDeliveryQueue.js';
import { makeExternalOperationQueue } from '../externalOperations/makeExternalOperationQueue.js';
import {
  runExternalContinuation,
  requestExternalObservation,
} from '../externalOperations/runExternalOperation.js';
import { getSystemSpec } from '../getSystemSpec/getSystemSpec.js';
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
import { checkAdmissionGrant } from '../ownerOperations/admissionGrant.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';
import { bindReleaseRepo } from '../ownerOperations/bindReleaseRepoNamespace.js';
import {
  CommandContinuationResponseSchema,
  ExternalContinuationResponseSchema,
} from '../ownerOperations/ownerOperationSchema.js';
import { getServiceVersionChain } from '../ownerOperations/releaseRepoNamespaces.js';
import { runOwnerOperation } from '../ownerOperations/runOwnerOperation.js';
import { validateReleaseAdmission } from '../ownerOperations/validateReleaseAdmission.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import {
  prepareServiceReplayInput,
  type IServiceReplayRequest,
} from '../serviceReplayAdapter/prepareServiceReplayInput.js';
import type { IEvaluatedServiceCommand } from '../ServiceVersionChain/evaluatedServiceCommand.js';
import type { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';
import { getServiceVersionRepo } from '../ServiceVersionRepo/getServiceVersionRepo.js';
import { serviceVersionRepoNameUtils } from '../ServiceVersionRepo/serviceVersionRepoName.js';
import type {
  IServiceOriginalCommandReceiver,
  IServiceOriginalCommandSubscriber,
  IServiceVersionRepo,
} from '../ServiceVersionRepo/types.js';
import {
  frameworkWorkerRuntime,
  readAuthoredWorkerConfig,
  readExecutingSystemSpec,
  runWorkerPromise,
} from '../workerConfiguration/workerConfiguration.js';

import { admitCommandContinuation } from './admitCommandContinuation.js';
import { admitDirectSystemServiceCommandTx } from './admitDirectSystemServiceCommandTx.js';
import {
  admitFromAggregateChainTx,
  admitFromServiceChainTx,
} from './admitRecordedServiceCommandTx.js';
import {
  admitHostedServiceAgentCommandTx,
  admitServiceAgentCommandTx,
} from './admitServiceAgentCommandTx.js';
import { admitServiceCommands } from './admitServiceCommands/admitServiceCommands.js';
import { adoptCanonicalServiceHistory } from './adoptCanonicalServiceHistory.js';
import { executeCommandsThrough } from './executeCommandsThrough/executeCommandsThrough.js';
import {
  enrollRegisteredServiceReleases,
  onRepoStartup,
} from './onRepoStartup/onRepoStartup.js';
import { readPendingServiceCommand } from './readPendingServiceCommand.js';
import { readReplayCommandsPage } from './readReplayCommandsPage.js';
import { readServiceCommand } from './readServiceCommand.js';
import { readServiceCommandOccurrence } from './readServiceCommandOccurrence.js';
import { recordExternalOutcomeAndAdmitCommandTx } from './recordExternalOutcomeAndAdmitCommandTx.js';
import { recordOriginalCommandOutcomeTx } from './recordOriginalCommandOutcomeTx.js';
import { registerServiceNodeTx } from './registerServiceNodeTx.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';
import { serviceChainMigratableDORepoConfig } from './serviceChainMigratableDORepoConfig.js';
import type { IServiceCommandOccurrence } from './types.js';

type IOriginalDeliveryNamespace = DurableObjectNamespace<
  Rpc.DurableObjectBranded & IServiceOriginalCommandReceiver
>;

interface IOriginalDeliveryWorker {
  getServiceVersionRepo(
    key: Parameters<typeof serviceVersionRepoNameUtils.makeName>[0],
  ): Promise<ReturnType<IOriginalDeliveryNamespace['getByName']>>;
}

export class ServiceChain
  extends makeMigratableDORepo(DurableObject<Cloudflare.Env>, {
    repoType: 'ServiceChain',
    getSystemSpecHash: () => readExecutingSystemSpec().hash,
    managedRuntime: frameworkWorkerRuntime,
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'SERVICE_CHAIN',
    migratableDORepoConfig: serviceChainMigratableDORepoConfig,
  })
  implements IFanoutRepo<'replayCommandsFanout', IServiceVersionRepo>
{
  readonly #getOriginalCommandReceiver;

  async prepareServiceReplayInput(request: IServiceReplayRequest) {
    return runWorkerPromise(
      makeWorkerRpcEnvelope(
        prepareServiceReplayInput({
          request,
          key: this.key,
          db: this.db,
          env: this.env,
        }),
      ),
    );
  }

  readonly recoveryRegistry = makeRecoveryRegistry<unknown>({
    storage: this.ctx.storage,
  });

  constructor(
    ctx: DurableObjectState,
    env: {
      SERVICE_VERSION_REPO: IOriginalDeliveryNamespace;
      ZEROSPIN_HOSTED_SERVICE_DISPATCH?: IOriginalDeliveryWorker;
      [binding: `ZEROSPIN_RELEASE_${string}`]:
        | IOriginalDeliveryWorker
        | undefined;
    } & Cloudflare.Env,
  ) {
    super(ctx, env);
    // Grant only the original-command outbox access to the release's receiver.
    this.#getOriginalCommandReceiver = bindReleaseRepo(
      'SERVICE_VERSION_REPO',
      ({ key }: Parameters<typeof getServiceVersionRepo>[0]) =>
        serviceVersionRepoNameUtils
          .makeName(key)
          .pipe(Effect.map(name => env.SERVICE_VERSION_REPO.getByName(name))),
      (bindingName, key) => env[bindingName]?.getServiceVersionRepo(key),
      key => env.ZEROSPIN_HOSTED_SERVICE_DISPATCH?.getServiceVersionRepo(key),
    );
    this.recoveryRegistry.register(
      'canonicalHistory',
      Effect.gen({ self: this }, function* () {
        const finalizedThrough =
          this.db.select().from(this.schema.finalizedPosition).get()
            ?.lastIndex ?? 0;
        const serviceVersion = (yield* getSystemSpec(this.key.systemId))
          .services[this.key.serviceName]?.canonical;
        const adopted = this.db
          .select()
          .from(this.schema.canonicalHistory)
          .get();
        if (
          serviceVersion === undefined ||
          finalizedThrough === 0 ||
          (adopted?.serviceVersion === serviceVersion &&
            adopted.serviceIndex === finalizedThrough)
        ) {
          yield* this.recoveryRegistry.release('canonicalHistory');
          return;
        }
        const history = yield* getServiceVersionChain({
          key: { ...this.key, serviceVersion },
        });
        const { lastIndex: publishedThrough } = yield* Effect.promise(() =>
          history.getEvaluatedCommandPage({ afterIndex: 0, maxIndex: 0 }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        const caughtUp = this.db.transaction(tx =>
          adoptCanonicalServiceHistory(tx, {
            serviceVersion,
            publishedThrough,
          }),
        );
        if (caughtUp) yield* this.recoveryRegistry.release('canonicalHistory');
      }).pipe(Effect.provideService(References.PreventSchedulerYield, true)),
    );
  }

  readonly #replayCommandsFanout: IFanoutQueue<
    'replayCommandsFanout',
    { systemId: string; serviceName: string; serviceVersion: number },
    IServiceCommandOccurrence,
    IZerospinError | IZerospinErrorJson
  > = makeFanoutQueue({
    RpcTarget,
    managedRuntime: frameworkWorkerRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    concurrency: 100,
    name: 'replayCommandsFanout',
    db: this.db,
    key: this.key,
    recoveryRegistry: this.recoveryRegistry,
    subscriberTable: this.schema.replaySubscribers,
    subscriberIdentityColumns: {
      serviceVersion: this.schema.replaySubscribers.serviceVersion,
    },
    subscriberIndexColumn:
      this.schema.replaySubscribers.acknowledgedServiceIndex,
    subscriberIdentityFromKey: key =>
      Effect.gen({ self: this }, function* () {
        if (this.env.ZEROSPIN_HOSTED_SERVICE_DISPATCH) {
          yield* getSystemSpec(key.systemId, {
            serviceName: key.serviceName,
            serviceVersion: key.serviceVersion,
          }).pipe(
            Effect.mapError(() =>
              makeZerospinError('service-version-unsupported'),
            ),
          );
        }
        return { serviceVersion: key.serviceVersion };
      }),
    subscriberKeyFromIdentity: identity =>
      Effect.succeed({ ...this.key, ...identity }),
    ...(this.env.ZEROSPIN_HOSTED_SERVICE_DISPATCH
      ? {}
      : {
          availableSubscriberIdentities: Object.values(
            readExecutingSystemSpec().services[this.key.serviceName]
              ?.releases ?? {},
          ).map(release => ({ serviceVersion: release.version })),
        }),
    subscriberKeySchema: Schema.Struct({
      systemId: Schema.String,
      serviceName: Schema.String,
      serviceVersion: VersionSchema,
    }),
    readPage: page => readReplayCommandsPage(this.db, this.key, page),
    getRepo: getServiceVersionRepo,
  });

  get replayCommandsFanout(): IFanoutQueue<
    'replayCommandsFanout',
    { systemId: string; serviceName: string; serviceVersion: number },
    IServiceCommandOccurrence,
    IZerospinError | IZerospinErrorJson
  > {
    return this.#replayCommandsFanout;
  }

  readonly #executeCommandOutbox: IWorkerOutboxQueue<
    'executeCommandOutbox',
    IServiceCommandOccurrence,
    readonly IEvaluatedServiceCommand[],
    IZerospinError | IZerospinErrorJson
  > = makeOutboxQueue({
    RpcTarget,
    managedRuntime: frameworkWorkerRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    name: 'executeCommandOutbox',
    db: this.db,
    recoveryRegistry: this.recoveryRegistry,
    outboxTable: serviceChainDbConfig.schema.commands,
    indexColumnName: 'serviceIndex',
    pageSize: 1,
    storage: {
      readPage: throughIndex => {
        const row = readPendingServiceCommand(this.db, throughIndex);
        return row === undefined
          ? []
          : [
              {
                row: readServiceCommandOccurrence(row, this.key),
                index: row.serviceIndex,
              },
            ];
      },
      hasPending: () => readPendingServiceCommand(this.db) !== undefined,
      acknowledge: (
        indices,
        finalizations: readonly IEvaluatedServiceCommand[],
      ) =>
        recordOriginalCommandOutcomeTx(
          this.db,
          indices,
          finalizations,
          this.key,
        ),
    },
    subscriber: (
      rows,
    ): Effect.Effect<
      Disposable & Pick<IServiceOriginalCommandSubscriber, 'receive'>,
      | Effect.Error<ReturnType<typeof serviceVersionRepoNameUtils.makeName>>
      | IZerospinError<'service-original-delivery-invalid'>,
      never
    > =>
      Effect.gen({ self: this }, function* () {
        const row = rows[0];
        if (rows.length !== 1 || row === undefined) {
          return yield* makeZerospinError('service-original-delivery-invalid');
        }
        const repo = yield* this.#getOriginalCommandReceiver({
          key: {
            ...this.key,
            serviceVersion: row.serviceVersion,
          },
        });
        return yield* Effect.promise(() => repo.executeCommandSubscriber);
      }),
    afterAcknowledge: () =>
      Effect.gen({ self: this }, function* () {
        if (this.env.ZEROSPIN_HOSTED_SERVICE_DISPATCH) {
          yield* enrollRegisteredServiceReleases(this.db, this.key);
        }
        yield* this.recoveryRegistry.hold('canonicalHistory');
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

  get executeCommandOutbox(): IWorkerOutboxQueue<
    'executeCommandOutbox',
    IServiceCommandOccurrence,
    readonly IEvaluatedServiceCommand[],
    IZerospinError | IZerospinErrorJson
  > {
    return this.#executeCommandOutbox;
  }

  readonly #commandOperationQueue = makeCommandDeliveryQueue({
    managedRuntime: frameworkWorkerRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    db: this.db,
    source: this.key,
    admit: delivery =>
      admitRecordedCommandFromServiceChain({ source: this.key, delivery }),
    recoveryRegistry: this.recoveryRegistry,
    outboxTable: this.schema.commandOperationOutbox,
    indexColumnName: 'serviceIndex',
    readPending: () => {
      const rows = this.db
        .select()
        .from(this.schema.commandOperationOutbox)
        .orderBy(
          asc(this.schema.commandOperationOutbox.serviceIndex),
          asc(this.schema.commandOperationOutbox.operationIndex),
        )
        .all();
      return rows.map(row => {
        const {
          serviceIndex: sourceIndex,
          continuationFailure,
          ...delivery
        } = Schema.decodeUnknownSync(
          serviceChainDbConfig.tables.commandOperationOutbox.codec,
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
        // The emitting command's first execution fixes its mapper across patches.
        let executionBuildId: string | undefined;
        if (
          prepared !== undefined &&
          delivery.continuationFailure === undefined &&
          Reflect.get(this.env, 'ZEROSPIN_HOSTED_SERVICE_BUILDS') === true
        ) {
          const catalog = this.env.SYSTEM_REPO.getByName(this.key.systemId);
          const release = {
            serviceName: this.key.serviceName,
            serviceVersion: prepared.ownerVersion,
          };
          const assigned = yield* Effect.promise(() =>
            catalog.getServiceExecutionBuild({
              ...release,
              serviceIndex: delivery.sourceIndex,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          if (assigned === null) {
            const accepted = yield* Effect.promise(() =>
              catalog.readAcceptedServiceBuild(release),
            ).pipe(Effect.flatMap(readRpcEnvelope));
            if (accepted !== null) {
              return yield* makeZerospinError(
                'service-execution-build-unassigned',
              );
            }
          } else {
            executionBuildId = assigned;
          }
        }
        const continuation =
          prepared === undefined
            ? null
            : delivery.continuationFailure !== undefined
              ? { ...delivery.continuationFailure, id: prepared.id }
              : yield* runOwnerOperation({
                  env: this.env,
                  ...(executionBuildId === undefined
                    ? {}
                    : { executionBuildId }),
                  release: {
                    serviceName: this.key.serviceName,
                    serviceVersion: prepared.ownerVersion,
                  },
                  request: {
                    _tag: 'CommandContinuation',
                    recorded,
                    outcome,
                  },
                  local: Effect.gen({ self: this }, function* () {
                    const config = readAuthoredWorkerConfig();
                    const release =
                      config?.system.services[this.key.serviceName]?.releases[
                        prepared.ownerVersion
                      ];
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
          producerLease: this.#executeCommandOutbox.producerLease,
        }).pipe(
          Effect.ensuring(this.#executeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped),
  });

  readonly #externalOperationQueue = makeExternalOperationQueue({
    recoveryRegistry: this.recoveryRegistry,
    db: this.db,
    outboxTable: this.schema.externalOperationOutbox,
    operationCodec: serviceChainDbConfig.tables.externalOperationOutbox.codec,
    recordExternalOutcomeAndAdmitCommand: (operation, externalOutcome) =>
      Effect.gen({ self: this }, function* () {
        return yield* recordExternalOutcomeAndAdmitCommandTx(this.db, {
          externalCommandId: operation.externalCommandId,
          externalOutcome,
          key: this.key,
          producerLease: this.#executeCommandOutbox.producerLease,
          build: (serviceVersion, input) => {
            const { serviceName } = this.key;
            const release =
              readAuthoredWorkerConfig()?.system.services[serviceName]
                ?.releases[serviceVersion];
            return runOwnerOperation({
              env: this.env,
              release: { serviceName, serviceVersion },
              request: input,
              local: runExternalContinuation(release, input),
              response: ExternalContinuationResponseSchema,
            });
          },
        }).pipe(
          Effect.ensuring(this.#executeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped),
    request: operation =>
      requestExternalObservation(
        this.env,
        {
          serviceName: this.key.serviceName,
          serviceVersion: operation.serviceVersion,
        },
        operation,
      ),
    run: program => runWorkerPromise(runWorkerInvocation(program)),
    background: promise => this.ctx.waitUntil(promise),
  });

  async getServiceCommand(props: {
    serviceIndex: number;
  }): Promise<
    IRpcEnvelope<IServiceCommandOccurrence | null, IZerospinErrorJson>
  > {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const { serviceIndex } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            serviceIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThan(0),
              Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
            ),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'service-input-cursor-invalid',
            prefix: 'Invalid admitted input cursor',
          }),
        );
        return yield* readServiceCommand(this.db, this.key, serviceIndex);
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Execute originals only through the fixed admitted checkpoint captured by this call. */
  async executeCommandsThrough(
    serviceIndex?: number,
  ): Promise<
    IRpcEnvelope<
      Effect.Success<ReturnType<typeof executeCommandsThrough>>,
      IErrorJson<Effect.Error<ReturnType<typeof executeCommandsThrough>>>
    >
  > {
    return runWorkerPromise(
      executeCommandsThrough({
        db: this.db,
        serviceIndex,
        executeCommandOutbox: this.#executeCommandOutbox,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Establish the base and authored materializer before serving this activation. */
  override onRepoStartup() {
    return Effect.gen({ self: this }, function* () {
      yield* onRepoStartup({
        db: this.db,
        key: this.key,
        recoveryRegistry: this.recoveryRegistry,
      });
      yield* this.#externalOperationQueue.wake();
      yield* this.#commandOperationQueue.wake();
    });
  }

  async admitServiceCommands(props: {
    commands: readonly unknown[];
  }): Promise<
    IRpcEnvelope<
      Effect.Success<ReturnType<typeof admitServiceCommands>>,
      IErrorJson<
        | Effect.Error<ReturnType<typeof admitServiceCommands>>
        | IZerospinError<'service-admission-encode-failed'>
      >
    >
  > {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const { commands } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            commands: Schema.Array(Schema.Unknown),
          }),
        )(props).pipe(
          mapParseError({
            code: 'service-admission-encode-failed',
            prefix: 'Invalid service admission',
          }),
        );
        if (commands.length === 0) {
          return [];
        }
        yield* this.#executeCommandOutbox.producerLease;
        return yield* admitServiceCommands({
          commands,
          db: this.db,
          key: this.key,
        }).pipe(
          Effect.ensuring(this.#executeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Establish or verify the authenticated Node's producer binding. */
  async registerNode(props: {
    nodeId: string;
    serviceVersion: number;
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
            serviceVersion: VersionSchema,
            sessionName: Schema.NonEmptyString,
            actorName: Schema.NonEmptyString,
            actorVersion: VersionSchema,
            claims: Schema.Record(Schema.String, Schema.Unknown),
            create: Schema.Boolean,
          }),
        )(props, { onExcessProperty: 'error' });
        return yield* registerServiceNodeTx(this.db, registration);
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  #validateUnrecordedCommand(
    command: Parameters<typeof admitFromAggregateChainTx>[1]['command'],
  ) {
    const table = this.schema.recordedCommandAdmissions;
    const admitted = this.db
      .select()
      .from(table)
      .where(eq(table.commandId, command.id))
      .get();
    if (admitted !== undefined) return Effect.succeed(undefined);
    if (command.serviceName !== this.key.serviceName) {
      return Effect.fail(makeZerospinError('service-command-scope-mismatch'));
    }
    return validateReleaseAdmission(command);
  }

  async admitFromAggregateChain(
    props: Omit<Parameters<typeof admitFromAggregateChainTx>[1], 'key'>,
  ) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.#executeCommandOutbox.producerLease;
        const registered = yield* this.#validateUnrecordedCommand(
          props.command,
        );
        return yield* admitFromAggregateChainTx(
          this.db,
          {
            ...props,
            key: this.key,
          },
          registered,
        ).pipe(
          Effect.ensuring(this.#executeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async admitFromServiceChain(
    props: Omit<Parameters<typeof admitFromServiceChainTx>[1], 'key'>,
  ) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.#executeCommandOutbox.producerLease;
        const registered = yield* this.#validateUnrecordedCommand(
          props.command,
        );
        return yield* admitFromServiceChainTx(
          this.db,
          {
            ...props,
            key: this.key,
          },
          registered,
        ).pipe(
          Effect.ensuring(this.#executeCommandOutbox.wake().pipe(Effect.exit)),
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

  async admitFromServiceAgentNode(
    props: Omit<Parameters<typeof admitServiceAgentCommandTx>[1], 'key'>,
  ) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.#executeCommandOutbox.producerLease;
        const lastProducerIndex = yield* readActiveProducerPosition(
          this.db,
          props.source.agentName,
          props.generation,
        );
        if (props.producerIndex > lastProducerIndex + 1) {
          return yield* makeZerospinError(
            'service-agent-producer-index-mismatch',
          );
        }
        const registered =
          props.producerIndex === lastProducerIndex + 1
            ? yield* validateReleaseAdmission(props.command)
            : undefined;
        return yield* admitServiceAgentCommandTx(
          this.db,
          {
            ...props,
            key: this.key,
          },
          registered,
        ).pipe(
          Effect.ensuring(this.#executeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Admit a frozen command from the private hosted Service Agent binding. */
  admitAgentCommand(
    scope: {
      systemId: string;
      serviceName: string;
      serviceVersion: number;
      agentName: string;
      agentVersion: number;
    },
    input: unknown,
    checkCurrentBuild: () => Promise<boolean>,
  ) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const command = yield* Schema.decodeUnknownEffect(
          EncodedAgentServiceCommandSchema,
        )(input, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'service-produced-command-invalid',
            prefix: 'Invalid Agent Service command',
          }),
        );
        if (
          scope.systemId !== this.key.systemId ||
          scope.serviceName !== this.key.serviceName ||
          scope.serviceName !== command.serviceName ||
          scope.serviceVersion !== command.serviceVersion ||
          scope.agentName !== command.agentName ||
          scope.agentVersion !== command.agentVersion
        ) {
          return yield* makeZerospinError('service-command-producer-mismatch');
        }
        const receipt = yield* admitHostedServiceAgentCommandTx(
          this.db,
          command,
          false,
        );
        if (receipt !== null) return receipt;
        if (!(yield* Effect.promise(() => checkCurrentBuild()))) {
          return yield* makeZerospinError('service-agent-build-ineligible');
        }
        const registered = yield* validateReleaseAdmission(command);
        yield* checkAdmissionGrant(
          command,
          registered ?? readExecutingSystemSpec(),
        );
        yield* this.#executeCommandOutbox.producerLease;
        return yield* admitHostedServiceAgentCommandTx(
          this.db,
          command,
          true,
        ).pipe(
          Effect.ensuring(this.#executeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Allocate one fresh System invocation under the original-delivery lease. */
  async admitDirectSystemCommand(props: {
    command: typeof DirectSystemServiceCommandSchema.Type;
  }) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        yield* this.#executeCommandOutbox.producerLease;
        const command = yield* Schema.decodeUnknownEffect(
          DirectSystemServiceCommandSchema,
        )(props.command, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'system-command-input-invalid',
            prefix: 'Invalid direct System input',
          }),
        );
        const registered = yield* validateReleaseAdmission(command);
        return yield* admitDirectSystemServiceCommandTx(
          this.db,
          {
            command,
            key: this.key,
          },
          registered,
        ).pipe(
          Effect.ensuring(this.#executeCommandOutbox.wake().pipe(Effect.exit)),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  override onAlarm(): Promise<void> {
    return runWorkerPromise(runWorkerInvocation(this.recoveryRegistry.run()));
  }
}
