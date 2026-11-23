import type {
  IDb,
  IDbConfig,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import type {
  IRepoTableData,
  IRepoType,
  ISystem,
} from '@zerospin/core/system/types';
import {
  ensureZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
  type IErrorJson,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { runSynchronousExit } from '@zerospin/shapes';
import { env, type DurableObject } from 'cloudflare:workers';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import invariant from 'tiny-invariant';

import type { IExpectedAgentInstallation } from '../agentNodeRepo/agentNodeRuntimeTypes.js';
import { reportWorkerFailure } from '../reportWorkerFailure/reportWorkerFailure.js';
import type {
  IWorkerInvocationRunner,
  IWorkerRpcEncoder,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import { registerRepoWithSystem } from '../SystemRepo/registerRepo/registerRepoWithSystem.js';
import { validateRepoSystemId } from '../SystemRepo/registerRepo/validateRepoSystemId.js';

import { bindRepoNamespace } from './bindRepoNamespace.js';
import { getRepoTableRows } from './getRepoTableRows/getRepoTableRows.js';
import { makeDurableDb } from './makeDurableDb.js';
import type { IRepoNameUtils } from './makeRepoNameUtils.js';
import { awaitStartup } from './awaitStartup/awaitStartup.js';
import type { IDORepoConfig } from './types.js';

/** Repo factories and consumers augment their own namespace bindings. */
declare global {
  namespace Cloudflare {
    interface IDORepoNamespaces {}
  }
}

const IS_BOOTSTRAPPED_KV_KEY = '_isBootstrapped';

/** Shared path-named Durable Object Repo construction and bootstrap lifecycle. */
export type IDORepoBase = abstract new (
  ctx: DurableObjectState,
  env: Cloudflare.Env,
) => DurableObject<Cloudflare.Env, unknown> & Rpc.DurableObjectBranded;

type IDORepoInstance<KEY extends object, CONFIG extends IDbConfig, SERVICES> = {
  readonly key: KEY;
  readonly name: string;
  readonly db: IDb<CONFIG>;
  readonly dbConfig: CONFIG;
  readonly schema: IDbConfigSchema<CONFIG>;
  alarm(): Promise<void>;
  onAlarm(): Promise<void>;
  onRepoStartup(): Effect.Effect<
    void,
    IAnyError | IZerospinErrorJson,
    SERVICES
  >;
  awaitStartup(): Promise<IRpcEnvelope<void, never>>;
  getRepoTableRows(props: {
    tableName: string;
  }): Promise<
    IRpcEnvelope<
      IRepoTableData,
      IErrorJson<Effect.Error<ReturnType<typeof getRepoTableRows>>>
    >
  >;
};

export type IDORepoClass<
  BASE extends IDORepoBase,
  KEY extends object,
  CONFIG extends IDbConfig,
  BINDING extends keyof Cloudflare.IDORepoNamespaces,
  SERVICES,
> = {
  readonly getRepo: (props: {
    key: Parameters<IRepoNameUtils<KEY>['makeName']>[0];
  }) => Effect.Effect<
    ReturnType<Cloudflare.IDORepoNamespaces[BINDING]['getByName']>,
    Effect.Error<ReturnType<IRepoNameUtils<KEY>['makeName']>>
  >;
  new (
    ctx: DurableObjectState,
    env: Cloudflare.Env,
  ): IDORepoInstance<KEY, CONFIG, SERVICES> & InstanceType<BASE>;
};

export type IDORepoProps<
  KEY extends object,
  CONFIG extends IDbConfig,
  BINDING extends keyof Cloudflare.IDORepoNamespaces,
  SERVICES,
> = {
  namespaceBinding: BINDING;
  runInvocation: IWorkerInvocationRunner;
  encodeRpcOutcome: IWorkerRpcEncoder;
  managedRuntime: ManagedRuntime.ManagedRuntime<SERVICES, IAnyError>;
  getConfiguredSystemId?: () => string;
} & (
  | {
      repoType: 'AggregateAgentNodeRepo' | 'ServiceAgentNodeRepo';
      system: ISystem;
      getAgentInstallation(
        key: KEY,
      ): Effect.Effect<IExpectedAgentInstallation, IAnyError>;
    }
  | ({
      repoType: Exclude<
        IRepoType,
        'SystemRepo' | 'AggregateAgentNodeRepo' | 'ServiceAgentNodeRepo'
      >;
    } & ({ system: ISystem } | { getSystemSpecHash: () => string }))
  | {
      repoType: 'SystemRepo';
      deferActivation?: (workerEnv: Cloudflare.Env) => boolean;
      preflight: (props: {
        key: KEY;
        db: IDb<CONFIG>;
        storage: DurableObjectStorage;
      }) => Effect.Effect<void, IAnyError, SERVICES>;
    }
  | {
      repoType?: undefined;
      system?: undefined;
    }
);

type ISchemaActivation<CONFIG extends IDbConfig> = {
  ctx: DurableObjectState;
  db: IDb<CONFIG>;
  dbConfig: CONFIG;
  isBootstrapped: boolean;
};

/** Own path identity, registration, bootstrap and activation for both schema lifecycles. */
export function makeDORepo<
  BASE extends IDORepoBase,
  KEY extends object,
  CONFIG extends IDbConfig,
  BINDING extends keyof Cloudflare.IDORepoNamespaces,
  SERVICES,
>(
  BaseClass: BASE,
  props: IDORepoProps<KEY, CONFIG, BINDING, SERVICES>,
  config: IDORepoConfig<KEY, CONFIG, SERVICES>,
  initializeSchema: (
    activation: ISchemaActivation<CONFIG>,
  ) => Effect.Effect<void, IAnyError>,
  preflightSchema?: (
    activation: ISchemaActivation<CONFIG>,
  ) => Effect.Effect<void, IAnyError>,
): IDORepoClass<BASE, KEY, CONFIG, BINDING, SERVICES>;
export function makeDORepo<
  KEY extends object,
  CONFIG extends IDbConfig,
  BINDING extends keyof Cloudflare.IDORepoNamespaces,
  SERVICES,
>(
  BaseClass: IDORepoBase,
  props: IDORepoProps<KEY, CONFIG, BINDING, SERVICES>,
  config: IDORepoConfig<KEY, CONFIG, SERVICES>,
  initializeSchema: (
    activation: ISchemaActivation<CONFIG>,
  ) => Effect.Effect<void, IAnyError>,
  preflightSchema?: (
    activation: ISchemaActivation<CONFIG>,
  ) => Effect.Effect<void, IAnyError>,
): unknown {
  const { namespaceBinding, runInvocation, encodeRpcOutcome, repoType } = props;
  const { bootstrap, dbConfig: dbConfigFn, nameUtils } = config;
  const preflight =
    props.repoType === 'SystemRepo' ? props.preflight : undefined;

  const getAgentInstallation =
    'getAgentInstallation' in props ? props.getAgentInstallation : undefined;

  // Validate the physical identity before resolving the owner database.
  const initialize = Effect.fn('DORepo.initialize')(function* (input: {
    ctx: DurableObjectState;
    deferActivation: boolean;
  }) {
    const { ctx, deferActivation } = input;
    const name = ctx.id.name;
    invariant(name, 'DORepo must be accessed via getByName');

    const key = yield* nameUtils.parseName(name);
    if (repoType !== undefined) {
      const configuredSystemId =
        props.getConfiguredSystemId?.() ?? env.ZEROSPIN_SYSTEM_ID;
      if (configuredSystemId !== env.ZEROSPIN_SYSTEM_ID) {
        return yield* makeZerospinError({
          code: 'repo-system-id-mismatch',
          message: 'Release executable must belong to the configured System',
        });
      }
      yield* validateRepoSystemId({
        key,
        configuredSystemId,
      });
    }
    const agentInstallation =
      getAgentInstallation === undefined
        ? undefined
        : yield* getAgentInstallation(key);
    const resolvedDbConfig = yield* dbConfigFn({ key });
    const db = makeDurableDb({
      storage: ctx.storage,
      dbConfig: resolvedDbConfig,
    });
    if (preflight !== undefined && !deferActivation) {
      yield* preflight({ key, db, storage: ctx.storage });
    }

    return {
      agentInstallation,
      db,
      dbConfig: resolvedDbConfig,
      key,
      name,
      schema: resolvedDbConfig.schema,
    };
  });

  // Bind the owner surface to its selected base class and namespace.
  abstract class DORepo extends BaseClass {
    /** Resolve a stub lazily; activation and authorization belong to the receiver. */
    static readonly getRepo = bindRepoNamespace(nameUtils, namespaceBinding);

    // oxlint-disable-next-line no-undef -- Cloudflare supplies the ambient Rpc namespace; this declare field is erased.
    declare [Rpc.__DURABLE_OBJECT_BRAND]: never;
    declare protected readonly ctx: DurableObjectState;
    declare protected readonly env: Cloudflare.Env;

    readonly key: KEY;
    readonly name: string;
    readonly db: IDb<CONFIG>;
    readonly dbConfig: CONFIG;
    readonly schema: IDbConfigSchema<CONFIG>;
    readonly #activate: () => Promise<void>;

    constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
      super(ctx, env);
      // Resolve the identity and owner database synchronously.
      const deferActivation =
        props.repoType === 'SystemRepo' &&
        props.deferActivation?.(env) === true;
      const exit = runSynchronousExit(
        initialize({ ctx, deferActivation }),
        props.managedRuntime.runSyncExit,
      );
      if (Exit.isFailure(exit)) {
        reportWorkerFailure({
          boundary: `${namespaceBinding}.initialize`,
          cause: exit.cause,
        });
      }
      const { agentInstallation, db, dbConfig, key, name, schema } =
        Effect.runSync(exit);
      this.key = key;
      this.name = name;
      this.db = db;
      this.dbConfig = dbConfig;
      this.schema = schema;

      const start = async () => {
        // A base constructor runs before derived field initializers. Defer all
        // asynchronous startup so overrides may safely access those fields.
        await Promise.resolve();

        const startup = Effect.gen({ self: this }, function* () {
          if (preflight !== undefined && deferActivation) {
            yield* preflight({ key, db, storage: ctx.storage });
          }
          const isBootstrapped =
            ctx.storage.kv.get(IS_BOOTSTRAPPED_KV_KEY) === 'true';
          const activation = { ctx, db, dbConfig, isBootstrapped };
          if (preflightSchema !== undefined) {
            yield* preflightSchema(activation);
          }
          // Require this executable SystemSpec before any child local SQL.
          if (repoType !== undefined && repoType !== 'SystemRepo') {
            yield* registerRepoWithSystem({
              name,
              schema,
              repoType,
              systemSpecHash:
                'getSystemSpecHash' in props
                  ? props.getSystemSpecHash()
                  : makeSystemSpec({ system: props.system }).hash,
              ...(agentInstallation === undefined ? {} : { agentInstallation }),
            });
          }

          ctx.storage.sql.exec('PRAGMA foreign_keys = ON;');

          yield* initializeSchema(activation);

          if (bootstrap !== null && !isBootstrapped) {
            yield* bootstrap({ ctx, db, dbConfig, key, name, schema });
            ctx.storage.kv.put(IS_BOOTSTRAPPED_KV_KEY, 'true');
            yield* Effect.tryPromise({
              try: () => ctx.storage.sync(),
              catch: error =>
                ensureZerospinError({
                  code: 'migratable-do-repo-durability-failed',
                  message: 'Failed to confirm bootstrap writes',
                  error,
                }),
            });
          }

          // Schema and bootstrap are durable before fallible owner activation.
          yield* this.onRepoStartup();
        });
        const exit = await props.managedRuntime.runPromiseExit(
          runInvocation(startup),
        );
        if (Exit.isFailure(exit)) {
          // Workerd discards non-Error rejections as #<Object>, including
          // encoded failures propagated from another Repo during activation.
          const reason = exit.cause.reasons[0];
          if (
            exit.cause.reasons.length === 1 &&
            reason !== undefined &&
            Cause.isFailReason(reason) &&
            reason.error.code === 'agent-node-deployment-pending'
          ) {
            throw new Error(reason.error.code);
          }
          throw new Error(prettyUnknownFailure(exit.cause));
        }
      };

      // A bootstrap SystemRepo can inspect its catalog before enabling writes.
      let activation: Promise<void> | undefined;
      this.#activate = () => (activation ??= ctx.blockConcurrencyWhile(start));
      if (!deferActivation) void this.#activate();
    }

    onRepoStartup(): Effect.Effect<
      void,
      IAnyError | IZerospinErrorJson,
      SERVICES
    > {
      return Effect.void;
    }

    onAlarm(): Promise<void> {
      return Promise.resolve();
    }

    /** Preserve superclass initialization before its native-compatible alarm hook. */
    override async alarm(): Promise<void> {
      const inheritedAlarm = BaseClass.prototype.alarm;
      if (inheritedAlarm !== undefined) {
        await inheritedAlarm.call(this);
        return;
      }
      await this.onAlarm();
    }

    async awaitStartup() {
      await this.#activate();
      return props.managedRuntime.runPromise(encodeRpcOutcome(awaitStartup()));
    }

    getRepoTableRows({ tableName }: { tableName: string }) {
      // Encode table inspection at the RPC boundary.
      return props.managedRuntime.runPromise(
        getRepoTableRows({
          db: this.db,
          schema: this.schema,
          tableName,
        }).pipe(encodeRpcOutcome),
      );
    }
  }
  return DORepo;
}
