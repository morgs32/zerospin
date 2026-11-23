import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import { asc, desc, eq, gt, lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as Semaphore from 'effect/Semaphore';
import { isEqual } from 'es-toolkit';

import {
  makeFanoutQueue,
  type IFanoutDelivery,
  type IFanoutQueue,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import {
  getServiceActorVersionRepo,
  getServiceAgentVersionRepo,
  getServiceVersionArchive,
} from '../ownerOperations/releaseRepoNamespaces.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import { genesisDispositionChainHash } from '../serviceDispositionChainHash/serviceDispositionChainHash.js';
import {
  authoredReleaseRepoRuntime,
  requireAuthoredWorkerConfig,
} from '../workerConfiguration/workerConfiguration.js';

import { appendEvaluatedCommandsTx } from './appendEvaluatedCommandsTx.js';
import {
  EvaluatedServiceCommandSchema,
  type IEvaluatedServiceCommand,
  type IServiceCommandCheckpoint,
} from './evaluatedServiceCommand.js';
import {
  decodeServiceHistoryCommand,
  readServiceCommandPage,
} from './readServiceCommandPage.js';
import { serviceVersionChainDbConfig } from './serviceVersionChainDbConfig.js';
import { serviceVersionChainName } from './serviceVersionChainName.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';

const migratableDORepoConfig = makeMigratableDORepoConfig({
  migrations: [],
  ...serviceVersionChainName,
  dbConfig: serviceVersionChainDbConfig,
});
const { commands } = serviceVersionChainDbConfig.schema;
type IServiceHistoryError = IZerospinError | IZerospinErrorJson;
const readTip = (db: IDb) =>
  db
    .select({
      index: serviceVersionChainDbConfig.schema.historyHead.serviceIndex,
    })
    .from(serviceVersionChainDbConfig.schema.historyHead)
    .where(eq(serviceVersionChainDbConfig.schema.historyHead.singletonId, 1))
    .get()?.index ?? 0;

/** Immutable release command output and projection delivery from retained commands. */
export class ServiceVersionChain extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    repoType: 'ServiceVersionChain',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'SERVICE_VERSION_CHAIN',
    migratableDORepoConfig,
  },
) {
  readonly recoveryRegistry = makeRecoveryRegistry<unknown>({
    storage: this.ctx.storage,
  });

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    const notifier = env.ZEROSPIN_SERVICE_AGENT_NOTIFY;
    if (notifier) {
      this.recoveryRegistry.register(
        'hosted-service-agent',
        Effect.gen({ self: this }, function* () {
          const acknowledged =
            ctx.storage.kv.get<number>('hosted-service-agent') ?? 0;
          const tip = readTip(this.db);
          if (tip > acknowledged) {
            yield* this.recoveryRegistry.hold('hosted-service-agent');
            yield* Effect.tryPromise(() =>
              notifier.serviceHistoryAdvanced(tip),
            );
            ctx.storage.kv.put(
              'hosted-service-agent',
              Math.max(
                tip,
                ctx.storage.kv.get<number>('hosted-service-agent') ?? 0,
              ),
            );
          }
          // Keep the alarm while a newer publication is committing or awaits delivery.
          yield* Effect.gen({ self: this }, function* () {
            if (
              readTip(this.db) <=
              (ctx.storage.kv.get<number>('hosted-service-agent') ?? 0)
            ) {
              yield* this.recoveryRegistry.release('hosted-service-agent');
            }
          }).pipe(this.#appendSemaphore.withPermits(1));
        }),
      );
    }
  }

  #resolveFanoutActor(actorName: string) {
    return Effect.gen({ self: this }, function* () {
      const serviceRelease =
        requireAuthoredWorkerConfig().system.services[this.key.serviceName]
          ?.releases[this.key.serviceVersion];
      if (serviceRelease === undefined) {
        return yield* makeZerospinError('service-version-unsupported');
      }
      const actor = serviceRelease.actors[actorName];
      if (actor === undefined) {
        return yield* makeZerospinError({
          code: 'actor-version-unsupported',
          message: `Unsupported actor ${actorName} in ${this.key.serviceName}@${this.key.serviceVersion}`,
        });
      }
      return actor;
    });
  }

  readonly #actorVersionRepoFanout: IFanoutQueue<
    'actorVersionRepoFanout',
    {
      systemId: string;
      serviceName: string;
      serviceVersion: number;
      actorName: string;
      actorVersion: number;
      actorPath: string;
    },
    IEvaluatedServiceCommand,
    IServiceHistoryError
  > = makeFanoutQueue({
    RpcTarget,
    managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    concurrency: 100,
    name: 'actorVersionRepoFanout',
    db: this.db,
    key: this.key,
    recoveryRegistry: this.recoveryRegistry,
    subscriberTable: this.schema.actorVersionRepoFanoutSubscribers,
    subscriberIdentityColumns: {
      actorName: this.schema.actorVersionRepoFanoutSubscribers.actorName,
      actorPath: this.schema.actorVersionRepoFanoutSubscribers.actorPath,
    },
    subscriberIndexColumn:
      this.schema.actorVersionRepoFanoutSubscribers.acknowledgedServiceIndex,
    subscriberIdentityFromKey: ({ actorName, actorVersion, actorPath }) =>
      Effect.gen({ self: this }, function* () {
        const actor = yield* this.#resolveFanoutActor(actorName);
        if (actor.version !== actorVersion) {
          return yield* makeZerospinError({
            code: 'actor-version-unsupported',
            message: `Unsupported actor ${actorName}@${actorVersion} in ${this.key.serviceName}@${this.key.serviceVersion}`,
          });
        }
        return { actorName, actorPath };
      }),
    subscriberKeyFromIdentity: identity =>
      this.#resolveFanoutActor(identity.actorName).pipe(
        Effect.map(actor => ({
          ...this.key,
          ...identity,
          actorVersion: actor.version,
        })),
      ),
    subscriberKeySchema: Schema.Struct({
      systemId: Schema.String,
      serviceName: Schema.String,
      serviceVersion: VersionSchema,
      actorName: Schema.String,
      actorVersion: VersionSchema,
      actorPath: Schema.String,
    }),
    readPage: page => this.#readPage(page),
    getRepo: getServiceActorVersionRepo,
  });

  get actorVersionRepoFanout(): IFanoutQueue<
    'actorVersionRepoFanout',
    {
      systemId: string;
      serviceName: string;
      serviceVersion: number;
      actorName: string;
      actorVersion: number;
      actorPath: string;
    },
    IEvaluatedServiceCommand,
    IServiceHistoryError
  > {
    return this.#actorVersionRepoFanout;
  }

  readonly #agentVersionRepoFanout: IFanoutQueue<
    'agentVersionRepoFanout',
    {
      systemId: string;
      serviceName: string;
      serviceVersion: number;
      agentName: string;
      agentVersion: number;
    },
    IEvaluatedServiceCommand,
    IServiceHistoryError
  > = makeFanoutQueue({
    RpcTarget,
    managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    concurrency: 100,
    name: 'agentVersionRepoFanout',
    db: this.db,
    key: this.key,
    recoveryRegistry: this.recoveryRegistry,
    subscriberTable: this.schema.agentVersionRepoFanoutSubscribers,
    subscriberIdentityColumns: {
      agentName: this.schema.agentVersionRepoFanoutSubscribers.agentName,
      agentVersion: this.schema.agentVersionRepoFanoutSubscribers.agentVersion,
    },
    subscriberIndexColumn:
      this.schema.agentVersionRepoFanoutSubscribers.acknowledgedServiceIndex,
    subscriberIdentityFromKey: ({ agentName, agentVersion }) =>
      Effect.succeed({ agentName, agentVersion }),
    subscriberKeyFromIdentity: identity =>
      Effect.succeed({ ...this.key, ...identity }),
    subscriberKeySchema: Schema.Struct({
      systemId: Schema.String,
      serviceName: Schema.String,
      serviceVersion: VersionSchema,
      agentName: Schema.String,
      agentVersion: VersionSchema,
    }),
    readPage: page => this.#readPage(page),
    getRepo: getServiceAgentVersionRepo,
  });

  get agentVersionRepoFanout(): IFanoutQueue<
    'agentVersionRepoFanout',
    {
      systemId: string;
      serviceName: string;
      serviceVersion: number;
      agentName: string;
      agentVersion: number;
    },
    IEvaluatedServiceCommand,
    IServiceHistoryError
  > {
    return this.#agentVersionRepoFanout;
  }

  readonly #appendSemaphore = Semaphore.makeUnsafe(1);

  readonly #archiveFanout: IFanoutQueue<
    'archiveFanout',
    { systemId: string; serviceName: string; serviceVersion: number },
    IEvaluatedServiceCommand,
    IServiceHistoryError
  > = makeFanoutQueue({
    RpcTarget,
    managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    background: promise => this.ctx.waitUntil(promise),
    name: 'archiveFanout',
    concurrency: 1,
    db: this.db,
    key: this.key,
    recoveryRegistry: this.recoveryRegistry,
    subscriberTable: this.schema.archiveFanoutSubscribers,
    subscriberIdentityColumns: {
      singletonId: this.schema.archiveFanoutSubscribers.singletonId,
    },
    subscriberIndexColumn:
      this.schema.archiveFanoutSubscribers.acknowledgedServiceIndex,
    subscriberIdentityFromKey: () => Effect.succeed({ singletonId: 1 }),
    subscriberKeyFromIdentity: () => Effect.succeed(this.key),
    subscriberKeySchema: Schema.Struct({
      systemId: Schema.String,
      serviceName: Schema.String,
      serviceVersion: VersionSchema,
    }),
    readPage: page => {
      if (page.maxIndex === 0) {
        return Effect.succeed({ rows: [], lastIndex: readTip(this.db) });
      }
      const range = this.#archiveRange(page.afterIndex + 1);
      return this.#readPage({
        ...page,
        maxIndex: Math.min(
          page.maxIndex ?? readTip(this.db),
          range.lastServiceIndex,
        ),
      });
    },
    acknowledge: (tx, _identity, throughIndex) => {
      tx.delete(this.schema.commands)
        .where(lte(this.schema.commands.serviceIndex, throughIndex))
        .run();
    },
    getRepo: () =>
      Effect.succeed({
        archiveFanoutSubscriber: () =>
          Promise.resolve({
            receive: (delivery: IFanoutDelivery<IEvaluatedServiceCommand>) =>
              authoredReleaseRepoRuntime.managedRuntime.runPromise(
                this.#deliverArchivePage(delivery.rows).pipe(effect =>
                  makeWorkerRpcEnvelope(effect),
                ),
              ),
            [Symbol.dispose]: () => {},
          }),
      }),
  });

  get archiveFanout() {
    return this.#archiveFanout;
  }

  override onRepoStartup() {
    return Effect.gen({ self: this }, function* () {
      this.db.transaction(tx => {
        tx.insert(this.schema.historyHead)
          .values({
            singletonId: 1,
            serviceIndex: 0,
            commandId: null,
            dispositionChainHash: genesisDispositionChainHash(),
          })
          .onConflictDoNothing()
          .run();
        tx.insert(this.schema.archives)
          .values({ firstServiceIndex: 1 })
          .onConflictDoNothing()
          .run();
        tx.insert(this.schema.archiveFanoutSubscribers)
          .values({ singletonId: 1, acknowledgedServiceIndex: 0 })
          .onConflictDoNothing()
          .run();
      });
      if (
        this.env.ZEROSPIN_SERVICE_AGENT_NOTIFY &&
        readTip(this.db) >
          (this.ctx.storage.kv.get<number>('hosted-service-agent') ?? 0)
      ) {
        yield* this.recoveryRegistry.hold('hosted-service-agent');
      }
      // A caught-up Archive must not clear the shared alarm before projection recovery is armed.
      yield* this.recoveryRegistry.hold(this.#actorVersionRepoFanout.name);
      yield* this.recoveryRegistry.hold(this.#agentVersionRepoFanout.name);
      yield* this.#archiveFanout.wake();
    });
  }

  #archivedThrough() {
    return (
      this.db
        .select()
        .from(this.schema.archiveFanoutSubscribers)
        .where(eq(this.schema.archiveFanoutSubscribers.singletonId, 1))
        .get()?.acknowledgedServiceIndex ?? 0
    );
  }

  #archiveRange(serviceIndex: number) {
    const archive = this.db
      .select()
      .from(this.schema.archives)
      .where(lte(this.schema.archives.firstServiceIndex, serviceIndex))
      .orderBy(desc(this.schema.archives.firstServiceIndex))
      .limit(1)
      .get();
    if (archive === undefined) {
      throw makeZerospinError('service-version-archive-directory-missing');
    }
    const next = this.db
      .select()
      .from(this.schema.archives)
      .where(
        gt(this.schema.archives.firstServiceIndex, archive.firstServiceIndex),
      )
      .orderBy(asc(this.schema.archives.firstServiceIndex))
      .limit(1)
      .get();
    return {
      firstServiceIndex: archive.firstServiceIndex,
      lastServiceIndex:
        next === undefined
          ? Number.MAX_SAFE_INTEGER
          : next.firstServiceIndex - 1,
    };
  }

  #deliverArchivePage(
    rows: readonly IEvaluatedServiceCommand[],
  ): Effect.Effect<void, IServiceHistoryError> {
    return Effect.gen({ self: this }, function* () {
      let offset = 0;
      while (offset < rows.length) {
        const first = rows[offset]!;
        const range = this.#archiveRange(first.serviceIndex);
        const chunk = rows
          .slice(offset)
          .filter(command => command.serviceIndex <= range.lastServiceIndex);
        const archive = yield* getServiceVersionArchive({
          key: { ...this.key, firstServiceIndex: range.firstServiceIndex },
        });
        const reply = yield* Effect.promise(() =>
          archive.appendEvaluatedCommands({ commands: chunk }),
        );
        const result = yield* readRpcEnvelope(reply).pipe(
          Effect.match({
            onSuccess: () => ({ _tag: 'Success' as const }),
            onFailure: error => ({ _tag: 'Failure' as const, error }),
          }),
        );
        if (
          result._tag === 'Failure' &&
          result.error.code === 'service-version-archive-full'
        ) {
          const error = result.error;
          const { lastServiceIndex } = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              lastServiceIndex: Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
              ),
            }),
          )(error.extra).pipe(
            mapParseError({
              code: 'service-version-archive-head-invalid',
              prefix: 'Invalid full Archive head',
            }),
          );
          if (
            lastServiceIndex < range.firstServiceIndex ||
            lastServiceIndex >= range.lastServiceIndex
          ) {
            return yield* Effect.fail(error);
          }
          this.db.transaction(tx => {
            tx.insert(this.schema.archives)
              .values({ firstServiceIndex: lastServiceIndex + 1 })
              .onConflictDoNothing()
              .run();
          });
          continue;
        }
        if (result._tag === 'Failure') return yield* Effect.fail(result.error);
        offset += chunk.length;
      }
    });
  }

  #readEvaluatedCommand(
    serviceIndex: number,
  ): Effect.Effect<IEvaluatedServiceCommand | null, IServiceHistoryError> {
    return Effect.gen({ self: this }, function* () {
      if (serviceIndex > readTip(this.db)) return null;
      const stored = this.db
        .select()
        .from(commands)
        .where(eq(commands.serviceIndex, serviceIndex))
        .get();
      if (stored !== undefined) {
        return decodeServiceHistoryCommand(serviceVersionChainDbConfig, stored);
      }
      if (serviceIndex > this.#archivedThrough()) {
        return yield* makeZerospinError(
          'service-version-archive-history-missing',
        );
      }
      const range = this.#archiveRange(serviceIndex);
      const archive = yield* getServiceVersionArchive({
        key: { ...this.key, firstServiceIndex: range.firstServiceIndex },
      });
      const command = yield* Effect.promise(() =>
        archive.getEvaluatedCommand({ serviceIndex }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      if (command === null || command.serviceIndex !== serviceIndex) {
        return yield* makeZerospinError(
          'service-version-archive-history-missing',
        );
      }
      return command;
    });
  }

  #readPage(page: { afterIndex: number; maxIndex?: number }): Effect.Effect<
    {
      rows: readonly { row: IEvaluatedServiceCommand; index: number }[];
      lastIndex: number;
    },
    IServiceHistoryError
  > {
    return Effect.gen({ self: this }, function* () {
      const lastIndex = readTip(this.db);
      const maxIndex = Math.min(lastIndex, page.maxIndex ?? lastIndex);
      if (page.afterIndex >= maxIndex) return { rows: [], lastIndex };
      const archivedThrough = this.#archivedThrough();
      if (page.afterIndex < archivedThrough) {
        const range = this.#archiveRange(page.afterIndex + 1);
        const archive = yield* getServiceVersionArchive({
          key: { ...this.key, firstServiceIndex: range.firstServiceIndex },
        });
        const archived = yield* Effect.promise(() =>
          archive.getPage({
            afterIndex: page.afterIndex,
            maxIndex: Math.min(
              maxIndex,
              archivedThrough,
              range.lastServiceIndex,
            ),
          }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        if (archived.rows[0]?.serviceIndex !== page.afterIndex + 1) {
          return yield* makeZerospinError(
            'service-version-archive-history-missing',
          );
        }
        return {
          rows: archived.rows.map(row => ({ row, index: row.serviceIndex })),
          lastIndex,
        };
      }
      const rows = readServiceCommandPage({
        db: this.db,
        dbConfig: serviceVersionChainDbConfig,
        afterIndex: page.afterIndex,
        maxIndex,
      });
      if (rows[0]?.index !== page.afterIndex + 1) {
        return yield* makeZerospinError(
          'service-version-archive-history-missing',
        );
      }
      return { rows, lastIndex };
    });
  }

  async appendEvaluatedCommands(props: {
    commands: readonly IEvaluatedServiceCommand[];
  }): Promise<IRpcEnvelope<void, IZerospinErrorJson>> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { commands } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            commands: Schema.Array(
              Schema.toType(EvaluatedServiceCommandSchema),
            ),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'service-evaluated-command-invalid',
            prefix: 'Invalid evaluated command',
          }),
        );
        if (
          commands.some(command => command.serviceName !== this.key.serviceName)
        ) {
          return yield* makeZerospinError(
            'service-evaluated-command-owner-mismatch',
          );
        }
        for (let index = 1; index < commands.length; index += 1) {
          if (
            commands[index]!.serviceIndex <= commands[index - 1]!.serviceIndex
          ) {
            return yield* makeZerospinError(
              'service-evaluated-command-order-invalid',
            );
          }
        }
        yield* this.#actorVersionRepoFanout.producerLease;
        yield* this.#agentVersionRepoFanout.producerLease;
        yield* this.#archiveFanout.producerLease;
        yield* Effect.gen({ self: this }, function* () {
          const tip = readTip(this.db);
          for (const command of commands) {
            if (command.serviceIndex > tip) break;
            const retained = yield* this.#readEvaluatedCommand(
              command.serviceIndex,
            );
            if (!isEqual(retained, command)) {
              return yield* makeZerospinError(
                'service-evaluated-command-mismatch',
              );
            }
          }
          if (
            this.env.ZEROSPIN_SERVICE_AGENT_NOTIFY &&
            (commands.at(-1)?.serviceIndex ?? 0) > tip
          ) {
            yield* this.recoveryRegistry.hold('hosted-service-agent');
          }
          yield* appendEvaluatedCommandsTx(this.db, {
            commands: commands.filter(command => command.serviceIndex > tip),
            serviceRelease:
              requireAuthoredWorkerConfig().system.services[
                this.key.serviceName
              ]?.releases[this.key.serviceVersion],
          });
        }).pipe(
          this.#appendSemaphore.withPermits(1),
          Effect.ensuring(
            Effect.gen({ self: this }, function* () {
              yield* this.#actorVersionRepoFanout.wake().pipe(Effect.exit);
              yield* this.#agentVersionRepoFanout.wake().pipe(Effect.exit);
              yield* this.#archiveFanout.wake().pipe(Effect.exit);
            }),
          ),
        );
      }).pipe(Effect.scoped, effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Read retained evaluated history without publication, execution, or source callbacks. */
  async getEvaluatedCommandPage(props: {
    afterIndex: number;
    maxIndex?: number;
  }) {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const page = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            afterIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThanOrEqualTo(0),
              Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
            ),
            maxIndex: Schema.optionalKey(
              Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
                Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
              ),
            ),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'service-history-page-invalid',
            prefix: 'Invalid Service history page',
          }),
        );
        const result = yield* this.#readPage(page);
        return {
          rows: result.rows.map(entry => entry.row),
          lastIndex: result.lastIndex,
        };
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getEvaluatedCommand(props: {
    serviceIndex: number;
  }): Promise<
    IRpcEnvelope<IEvaluatedServiceCommand | null, IZerospinErrorJson>
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { serviceIndex } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            serviceIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThan(0),
            ),
          }),
        )(props).pipe(
          mapParseError({
            code: 'service-result-cursor-invalid',
            prefix: 'Invalid result cursor',
          }),
        );
        return yield* this.#readEvaluatedCommand(serviceIndex);
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getInputCheckpoint(
    props: { serviceIndex?: number } = {},
  ): Promise<
    IRpcEnvelope<IServiceCommandCheckpoint | null, IZerospinErrorJson>
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { serviceIndex } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            serviceIndex: Schema.optional(
              Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
              ),
            ),
          }),
        )(props).pipe(
          mapParseError({
            code: 'service-result-cursor-invalid',
            prefix: 'Invalid checkpoint cursor',
          }),
        );
        const index = serviceIndex ?? readTip(this.db);
        if (index === 0) {
          return {
            serviceIndex: 0,
            id: null,
            dispositionChainHash: genesisDispositionChainHash(),
          };
        }
        const row = yield* this.#readEvaluatedCommand(index);
        if (row === null) return null;
        return {
          serviceIndex: row.serviceIndex,
          id: row.id,
          dispositionChainHash: row.dispositionChainHash,
        };
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  override onAlarm(): Promise<void> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      runWorkerInvocation(this.recoveryRegistry.run()),
    );
  }
}
