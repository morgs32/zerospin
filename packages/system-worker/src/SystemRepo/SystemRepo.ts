/*
 * System-worker annotation:
 * Defines the static SystemRepo Durable Object shell and local storage wiring.
 * Public RPC methods delegate to same-named Effect functions in method folders.
 */
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import type { IAggregateId } from '@zerospin/core/models/types';
import { ServicePositiveIndexSchema } from '@zerospin/core/serviceSession/ServiceSocketProtocolSchema';
import { hashSystemSpec } from '@zerospin/core/system/hashSystemSpec';
import type { IOwnerReleaseIdentity } from '@zerospin/core/system/ownerReleaseDeployment';
import type {
  IRepoRegistration,
  IRepoType,
  ISystemSpec,
} from '@zerospin/core/system/types';
import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { DurableObject } from 'cloudflare:workers';
import { eq, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { IExpectedAgentInstallation } from '../agentNodeRepo/agentNodeRuntimeTypes.js';
import { aggregateAgentNodeRepoMigratableDORepoConfig } from '../AggregateAgentNodeRepo/aggregateAgentNodeRepoMigratableDORepoConfig.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import {
  getAggregateActorVersionChain,
  getAggregateAgentVersionChain,
} from '../ownerOperations/releaseRepoNamespaces.js';
import { AggregateActorVersionChains } from '../repoServices/AggregateActorVersionChains.js';

import './registerRepo/systemRepoNamespaces.js';
import { AggregateAgentVersionChains } from '../repoServices/AggregateAgentVersionChains.js';
import { ServiceChains } from '../repoServices/ServiceChains.js';
import { ServiceVersionRepos } from '../repoServices/ServiceVersionRepos.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import { serviceAgentNodeRepoMigratableDORepoConfig } from '../ServiceAgentNodeRepo/serviceAgentNodeRepoMigratableDORepoConfig.js';
import { ServiceChain } from '../ServiceChain/ServiceChain.js';
import { getServiceVersionRepo } from '../ServiceVersionRepo/getServiceVersionRepo.js';
import { requireWorkerVersion } from '../workerConfiguration/requireWorkerVersion.js';
import {
  frameworkWorkerRuntime,
  readExecutingSystemSpec,
  runWorkerPromise,
} from '../workerConfiguration/workerConfiguration.js';

import { getAcceptedSystemSpec } from './getAcceptedSystemSpec/getAcceptedSystemSpec.js';
import { getAggregateIds } from './getAggregateIds/getAggregateIds.js';
import { getRepoRegistrations } from './getRepoRegistrations/getRepoRegistrations.js';
import { handleFetch } from './handleFetch/handleFetch.js';
import { makeFetchFailureResponse } from './handleFetch/makeFetchFailureResponse.js';
import { hasAggregate } from './hasAggregate/hasAggregate.js';
import { initialize, initializeOwners } from './initialize/initialize.js';
import {
  preflightAcceptedSystemSpec,
  SYSTEM_REPO_PREFLIGHT_PREFIX,
} from './preflightAcceptedSystemSpec.js';
import { registerAggregate } from './registerAggregate/registerAggregate.js';
import { registerRepo } from './registerRepo/registerRepo.js';
import { registerSystemSpec } from './registerSystemSpec/registerSystemSpec.js';
import { hasAcceptedSystemSpec } from './requireAcceptedSystemSpec.js';
import { createSessionWebSocketTicket } from './sessionWebSocketTickets/createSessionWebSocketTicket.js';
import type { ISessionAdmission } from './sessionWebSocketTickets/SessionAdmissionSchema.js';
import { systemRepoDbConfig } from './systemRepoDbConfig.js';
import { systemRepoName } from './systemRepoName.js';

export const ARCHIVE_BACKED_AGGREGATE_HISTORY_KEY =
  'archive-backed-aggregate-history';
export const AGENT_INSTALLATION_STORAGE_KEY =
  'agent-version-bound-installation-storage';
export const ORDINARY_CONTINUATION_STORAGE_KEY =
  'ordinary-continuation-command-history';

const serviceBuildRelease = Schema.Struct({
  serviceName: Schema.NonEmptyString,
  serviceVersion: VersionSchema,
});
const serviceBuildAcceptance = Schema.Struct({
  ...serviceBuildRelease.fields,
  specHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  buildId: Schema.NonEmptyString,
  previousBuildId: Schema.NullOr(Schema.NonEmptyString),
});
const serviceExecution = Schema.Struct({
  ...serviceBuildRelease.fields,
  serviceIndex: ServicePositiveIndexSchema,
});

function hasRetainedCatalogRows(
  db: Parameters<typeof preflightAcceptedSystemSpec>[0]['db'],
) {
  const tables = db.all<{ name: string }>(sql`
    SELECT name FROM sqlite_master WHERE type = 'table'
      AND name IN ('repos', 'acceptedSystemSpecs')
  `);
  return tables.some(
    ({ name }) =>
      db.all(sql`SELECT 1 FROM ${sql.identifier(name)} LIMIT 1`).length > 0,
  );
}

const preflightRecordedCommandStorage = Effect.fn(
  'SystemRepo.preflightRecordedCommandStorage',
)(function* (props: {
  db: Parameters<typeof preflightAcceptedSystemSpec>[0]['db'];
  storage: DurableObjectStorage;
}) {
  const { db, storage } = props;
  if (storage.kv.get(ORDINARY_CONTINUATION_STORAGE_KEY) === true) return;

  const hasRows = hasRetainedCatalogRows(db);
  if (hasRows) {
    return yield* makeZerospinError({
      code: 'recorded-command-storage-reset-required',
      message:
        'Ordinary continuations require fresh command history storage. This SystemRepo retains an earlier catalog.',
    });
  }
});

const preflightAggregateHistoryStorage = Effect.fn(
  'SystemRepo.preflightAggregateHistoryStorage',
)(function* (props: {
  db: Parameters<typeof preflightAcceptedSystemSpec>[0]['db'];
  storage: DurableObjectStorage;
}) {
  const { db, storage } = props;
  if (storage.kv.get(ARCHIVE_BACKED_AGGREGATE_HISTORY_KEY) === true) return;

  // An incumbent with an accepted catalog could register an old AVC after an
  // empty registration check. Only a fresh catalog may establish this layout.
  const hasRows = hasRetainedCatalogRows(db);
  if (hasRows) {
    return yield* makeZerospinError({
      code: 'aggregate-history-storage-incompatible',
      message:
        'Archive-backed Aggregate history requires fresh storage. This SystemRepo retains a catalog from before adoption.',
    });
  }
});

const SystemRepoBase: ReturnType<
  typeof makeMigratableDORepo<
    typeof DurableObject<Cloudflare.Env>,
    { systemId: string },
    typeof systemRepoDbConfig,
    'SYSTEM_REPO',
    ManagedRuntime.ManagedRuntime.Services<typeof frameworkWorkerRuntime>
  >
> = makeMigratableDORepo(DurableObject<Cloudflare.Env>, {
  repoType: 'SystemRepo',
  managedRuntime: frameworkWorkerRuntime,
  runInvocation: runWorkerInvocation,
  encodeRpcOutcome: makeWorkerRpcEnvelope,
  namespaceBinding: 'SYSTEM_REPO',
  deferActivation: workerEnv =>
    workerEnv.ZEROSPIN_DEPLOYMENT_BOOTSTRAP === true,
  preflight: ({ db, storage }) =>
    preflightRecordedCommandStorage({ db, storage }).pipe(
      Effect.andThen(preflightAggregateHistoryStorage({ db, storage })),
      Effect.andThen(
        preflightAcceptedSystemSpec({
          db,
          candidate: readExecutingSystemSpec,
          hasVersionBoundAgentStorage:
            storage.kv.get(AGENT_INSTALLATION_STORAGE_KEY) === true,
        }),
      ),
      Effect.asVoid,
      // The native RPC boundary retains the Error message across isolates.
      Effect.catch(error =>
        Effect.die(
          new Error(
            `${SYSTEM_REPO_PREFLIGHT_PREFIX}${error.code}: ${error.message}`,
          ),
        ),
      ),
    ),
  migratableDORepoConfig: makeMigratableDORepoConfig({
    migrations: [],
    ...systemRepoName,
    abbreviation: null,
    dbConfig: systemRepoDbConfig,
  }),
});

export class SystemRepo extends SystemRepoBase {
  readonly recoveryRegistry = makeRecoveryRegistry<unknown>({
    storage: this.ctx.storage,
  });

  /** Require the configured singleton identity before common Repo initialization. */
  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);
    this.recoveryRegistry.register(
      'initializeOwners',
      this.#initializeOwners.pipe(
        Effect.mapError(error =>
          makeZerospinError({
            code: 'owner-initialization-failed',
            cause: String(error),
          }),
        ),
      ),
    );
  }

  /** Mark the storage layouts established by this runtime. */
  override onRepoStartup(): Effect.Effect<
    void,
    IAnyError | IZerospinErrorJson
  > {
    return Effect.sync(() => {
      if (this.ctx.storage.kv.get(AGENT_INSTALLATION_STORAGE_KEY) !== true) {
        this.ctx.storage.kv.put(AGENT_INSTALLATION_STORAGE_KEY, true);
      }
      if (
        this.ctx.storage.kv.get(ARCHIVE_BACKED_AGGREGATE_HISTORY_KEY) !== true
      ) {
        this.ctx.storage.kv.put(ARCHIVE_BACKED_AGGREGATE_HISTORY_KEY, true);
      }
      if (this.ctx.storage.kv.get(ORDINARY_CONTINUATION_STORAGE_KEY) !== true) {
        this.ctx.storage.kv.put(ORDINARY_CONTINUATION_STORAGE_KEY, true);
      }
    });
  }

  /** Run native WebSocket admission once with this Repo's durable ownership. */
  override fetch(request: Request): Promise<Response> {
    return runWorkerPromise(
      runWorkerInvocation(
        handleFetch({
          request,
          db: this.db,
          systemId: this.key.systemId,
          env: this.env,
        }).pipe(
          Effect.provideService(AggregateActorVersionChains, {
            getRepo: getAggregateActorVersionChain,
          }),
          Effect.provideService(AggregateAgentVersionChains, {
            getRepo: getAggregateAgentVersionChain,
          }),
        ),
      ),
      { signal: request.signal },
    ).catch(makeFetchFailureResponse);
  }

  /*
   * Explicit initialization awaits Service owners and all registered backend Agents.
   *
   * 1. Run the bound domain operation.
   */
  readonly #initializeOwners = initializeOwners({
    recoveryRegistry: this.recoveryRegistry,
    systemId: this.key.systemId,
    db: this.db,
  }).pipe(
    Effect.provideService(ServiceChains, { getRepo: ServiceChain.getRepo }),
    Effect.provideService(ServiceVersionRepos, {
      getRepo: getServiceVersionRepo,
    }),
  );

  initialize(expectedVersionId?: string) {
    return runWorkerPromise(
      requireWorkerVersion(
        expectedVersionId,
        this.env.ZEROSPIN_VERSION_METADATA?.id,
      ).pipe(
        Effect.andThen(
          initialize({
            systemId: this.key.systemId,
            db: this.db,
            recoveryRegistry: this.recoveryRegistry,
          }),
        ),
        Effect.provideService(ServiceChains, { getRepo: ServiceChain.getRepo }),
        Effect.provideService(ServiceVersionRepos, {
          getRepo: getServiceVersionRepo,
        }),
        makeWorkerRpcEnvelope,
      ),
    );
  }

  /** Retain one validated admission tuple; disclose its one-use secret only after commit. */
  createSessionWebSocketTicket(props: { admission: ISessionAdmission }) {
    const { admission } = props;

    return runWorkerPromise(
      createSessionWebSocketTicket({
        db: this.db,
        admission,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Register the candidate declaration and verified owner pins together. */
  async registerSystemSpec(props: {
    spec: ISystemSpec;
    ownerReleases?: readonly IOwnerReleaseIdentity[];
  }) {
    if (this.env.ZEROSPIN_DEPLOYMENT_BOOTSTRAP === true) await this.awaitStartup();
    const { spec, ownerReleases = [] } = props;
    return runWorkerPromise(
      registerSystemSpec({
        db: this.db,
        systemId: this.key.systemId,
        spec,
        ownerReleases,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Publish a verified hosted build under a previously accepted Service declaration. */
  acceptServiceBuild(props: typeof serviceBuildAcceptance.Type) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        if (!Schema.is(serviceBuildAcceptance)(props)) {
          return yield* makeZerospinError('service-build-input-invalid');
        }
        const {
          serviceName,
          serviceVersion,
          specHash,
          buildId,
          previousBuildId,
        } = props;
        const table = this.schema.acceptedSystemSpecs;
        const row = this.db
          .select()
          .from(table)
          .where(eq(table.hash, specHash))
          .get();
        if (row === undefined)
          return yield* makeZerospinError('system-spec-not-accepted');
        const { spec } =
          yield* systemRepoDbConfig.tables.acceptedSystemSpecs.decodeRow(row);
        const declaration =
          spec.services[serviceName]?.releases?.[serviceVersion];
        if (declaration === undefined) {
          return yield* makeZerospinError('service-build-release-not-accepted');
        }
        if (Object.keys(declaration.external).length !== 0) {
          return yield* makeZerospinError(
            'service-build-external-operations-unsupported',
          );
        }
        const storage = this.ctx.storage;
        const key = JSON.stringify([
          'acceptedServiceBuild',
          serviceName,
          serviceVersion,
        ]);
        return yield* storage.transactionSync(() => {
          const accepted = storage.kv.get<string>(key) ?? null;
          if (accepted === buildId) return Effect.succeed(buildId);
          if (accepted !== previousBuildId)
            return Effect.fail(
              makeZerospinError('service-build-acceptance-conflict'),
            );
          storage.kv.put(key, buildId);
          return Effect.succeed(buildId);
        });
      }).pipe(makeWorkerRpcEnvelope),
    );
  }

  readAcceptedServiceBuild(props: typeof serviceBuildRelease.Type) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        if (!Schema.is(serviceBuildRelease)(props))
          return yield* makeZerospinError('service-build-input-invalid');
        const key = JSON.stringify([
          'acceptedServiceBuild',
          props.serviceName,
          props.serviceVersion,
        ]);
        return this.ctx.storage.kv.get<string>(key) ?? null;
      }).pipe(makeWorkerRpcEnvelope),
    );
  }

  /** Bind the Chain occurrence at its first execution, before authored code can run. */
  startServiceExecution(props: typeof serviceExecution.Type) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        if (!Schema.is(serviceExecution)(props))
          return yield* makeZerospinError('service-build-input-invalid');
        const { serviceName, serviceVersion, serviceIndex } = props;
        const storage = this.ctx.storage;
        const key = JSON.stringify([
          'serviceExecutionBuild',
          serviceName,
          serviceIndex,
        ]);
        return yield* storage.transactionSync(() => {
          const started = storage.kv.get<{
            serviceVersion: number;
            buildId: string;
          }>(key);
          if (started !== undefined) {
            return started.serviceVersion === serviceVersion
              ? Effect.succeed(started.buildId)
              : Effect.fail(
                  makeZerospinError('service-execution-release-mismatch'),
                );
          }
          const buildId = storage.kv.get<string>(
            JSON.stringify([
              'acceptedServiceBuild',
              serviceName,
              serviceVersion,
            ]),
          );
          if (buildId === undefined)
            return Effect.fail(makeZerospinError('service-build-not-accepted'));
          storage.kv.put(key, { serviceVersion, buildId });
          return Effect.succeed(buildId);
        });
      }).pipe(makeWorkerRpcEnvelope),
    );
  }

  /** Resolve the emitting command's build for a reply without starting any work. */
  getServiceExecutionBuild(props: typeof serviceExecution.Type) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        if (!Schema.is(serviceExecution)(props))
          return yield* makeZerospinError('service-build-input-invalid');
        const { serviceName, serviceVersion, serviceIndex } = props;
        const key = JSON.stringify([
          'serviceExecutionBuild',
          serviceName,
          serviceIndex,
        ]);
        const started = this.ctx.storage.kv.get<{
          serviceVersion: number;
          buildId: string;
        }>(key);
        if (started === undefined) return null;
        if (started.serviceVersion !== serviceVersion)
          return yield* makeZerospinError('service-execution-release-mismatch');
        return started.buildId;
      }).pipe(makeWorkerRpcEnvelope),
    );
  }

  /** Compare the proposed SystemSpec to serving storage without accepting it. */
  preflightDeployment(spec: ISystemSpec) {
    const { db, ctx } = this;
    return runWorkerPromise(
      Effect.gen(function* () {
        if (hashSystemSpec(spec) !== spec.hash) {
          return yield* makeZerospinError({
            code: 'system-spec-invalid',
            message:
              'The candidate SystemSpec hash does not match its content.',
          });
        }
        if (!hasRetainedCatalogRows(db)) return [];

        const { kv } = ctx.storage;
        if (kv.get(ORDINARY_CONTINUATION_STORAGE_KEY) !== true) {
          return yield* makeZerospinError({
            code: 'recorded-command-storage-reset-required',
            message:
              'The serving SystemRepo lacks ordinary-continuation command history storage.',
          });
        }
        if (kv.get(ARCHIVE_BACKED_AGGREGATE_HISTORY_KEY) !== true) {
          return yield* makeZerospinError({
            code: 'aggregate-history-storage-incompatible',
            message:
              'The serving SystemRepo lacks archive-backed Aggregate history storage.',
          });
        }
        if (kv.get(AGENT_INSTALLATION_STORAGE_KEY) !== true) {
          return yield* makeZerospinError({
            code: 'agent-wake-storage-incompatible',
            message:
              'The serving SystemRepo lacks version-bound Agent installation storage.',
          });
        }
        return yield* preflightAcceptedSystemSpec({
          db,
          candidate: () => spec,
          hasVersionBoundAgentStorage: true,
        });
      }).pipe(makeWorkerRpcEnvelope),
    );
  }

  /** Read the accepted spec before admission tries to activate any dependent Repos. */
  async hasAcceptedSystemSpec(hash: string): Promise<boolean> {
    return hasAcceptedSystemSpec(this.db, hash);
  }

  /** Attest the serving catalog before a staged Worker accepts its SystemSpec. */
  async hasArchiveBackedAggregateHistory(): Promise<boolean> {
    return (
      this.ctx.storage.kv.get(ARCHIVE_BACKED_AGGREGATE_HISTORY_KEY) === true
    );
  }

  /** Attest the serving catalog's ordinary-continuation command history layout. */
  async hasOrdinaryContinuationStorage(): Promise<boolean> {
    // Cloudflare can route candidate acceptance into the serving bootstrap Repo.
    if (this.env.ZEROSPIN_DEPLOYMENT_BOOTSTRAP === true) await this.awaitStartup();
    return this.ctx.storage.kv.get(ORDINARY_CONTINUATION_STORAGE_KEY) === true;
  }

  async hasVersionBoundAgentInstallationStorage(): Promise<boolean> {
    return this.ctx.storage.kv.get(AGENT_INSTALLATION_STORAGE_KEY) === true;
  }

  /** Newly created Aggregates resolve automatic Agents from the serving SystemRepo. */
  async getSelectedAggregateAgentInstallations(aggregateName: string) {
    return Object.entries(
      readExecutingSystemSpec().aggregateAgents[aggregateName] ?? {},
    ).map(([agentName, installation]) => ({ agentName, ...installation }));
  }

  /** Read by hash, or read the most recent registration addressing the requested Service. */
  getAcceptedSystemSpec(
    selection?: string | { serviceName: string; serviceVersion: number },
  ) {
    return runWorkerPromise(
      getAcceptedSystemSpec({ db: this.db, selection }).pipe(effect =>
        makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  /** Observe the Worker that actually executes this addressed Durable Object. */
  getExecutingWorkerVersion() {
    return runWorkerPromise(
      Effect.succeed(this.env.ZEROSPIN_VERSION_METADATA?.id ?? null).pipe(
        effect => makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  /*
   * Repo startup requires its accepted SystemSpec hash before recording its physical instance and table names in SystemRepo.
   * A repeated registration updates table metadata for the same repoType/repoName.
   *
   * 1. Run the bound domain operation.
   */
  registerRepo(props: {
    registration: IRepoRegistration;
    systemSpecHash: string;
    agentInstallation?: IExpectedAgentInstallation;
  }) {
    const { registration, systemSpecHash } = props;

    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        // A Node opening after the deployment scan must match its own serving release.
        if (
          registration.repoType === 'AggregateAgentNodeRepo' ||
          registration.repoType === 'ServiceAgentNodeRepo'
        ) {
          const installation =
            registration.repoType === 'AggregateAgentNodeRepo'
              ? yield* aggregateAgentNodeRepoMigratableDORepoConfig.nameUtils
                  .parseName(registration.repoName)
                  .pipe(
                    Effect.map(
                      ({ aggregateName, agentName }) =>
                        readExecutingSystemSpec().aggregateAgents[
                          aggregateName
                        ]?.[agentName] ?? null,
                    ),
                  )
              : yield* serviceAgentNodeRepoMigratableDORepoConfig.nameUtils
                  .parseName(registration.repoName)
                  .pipe(
                    Effect.map(
                      ({ serviceName, agentName }) =>
                        readExecutingSystemSpec().serviceAgents[serviceName]?.[
                          agentName
                        ] ?? null,
                    ),
                  );
          if (
            systemSpecHash !== readExecutingSystemSpec().hash ||
            !isEqual(props.agentInstallation, installation)
          ) {
            return yield* makeZerospinError('agent-node-deployment-pending');
          }
        }
        yield* registerRepo({ systemSpecHash, db: this.db, registration });
      }).pipe(makeWorkerRpcEnvelope),
    );
  }

  /** Register Aggregate catalogue membership independently of physical Repo metadata. */
  registerAggregate(props: {
    aggregateName: string;
    aggregateId: IAggregateId;
  }) {
    return runWorkerPromise(
      Effect.gen({ self: this }, function* () {
        const { aggregateName, aggregateId } =
          yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              aggregateName: Schema.String,
              aggregateId: Schema.String,
            }),
          )(props).pipe(
            mapParseError({
              code: 'aggregate-registration-invalid',
              prefix: 'SystemRepo received an invalid Aggregate identity',
            }),
          );
        yield* registerAggregate(this.db, { aggregateName, aggregateId });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** List registered aggregate IDs without decoding physical Repo addresses. */
  getAggregateIds(props: { aggregateName: string }) {
    const { aggregateName } = props;
    return runWorkerPromise(
      getAggregateIds({
        db: this.db,
        aggregateName,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Check registration for the exact aggregate name and ID in this system. */
  hasAggregate(props: { aggregateName: string; aggregateId: IAggregateId }) {
    const { aggregateName, aggregateId } = props;
    return runWorkerPromise(
      hasAggregate({
        db: this.db,
        aggregateName,
        aggregateId,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /*
   * Secret-key inspection describes this addressed singleton directly, or reads
   * one concrete child Repo kind from its catalog. Child registration rows and
   * stored table-name arrays are validated before returning them.
   *
   * 1. Run the bound domain operation.
   */
  getRepoRegistrations(props: { repoType: IRepoType }) {
    const { repoType } = props;

    // 1 — run getRepoRegistrations with the instance-bound dependencies and encode its RPC outcome
    return runWorkerPromise(
      getRepoRegistrations({
        db: this.db,
        repoTable: systemRepoDbConfig.schema.repos,
        repoType,
        systemId: this.key.systemId,
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  override onAlarm(): Promise<void> {
    return runWorkerPromise(runWorkerInvocation(this.recoveryRegistry.run()));
  }
}
