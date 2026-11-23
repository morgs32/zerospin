import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
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

import { genesisDispositionChainHash } from '../aggregateDispositionChainHash/aggregateDispositionChainHash.js';
import {
  makeFanoutQueue,
  type IFanoutQueue,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import { makeRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import {
  getAggregateActorVersionRepo,
  getAggregateAgentVersionRepo,
  getAggregateVersionArchive,
} from '../ownerOperations/releaseRepoNamespaces.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import {
  authoredReleaseRepoRuntime,
  requireAuthoredWorkerConfig,
} from '../workerConfiguration/workerConfiguration.js';

import { aggregateVersionChainDbConfig } from './aggregateVersionChainDbConfig.js';
import { aggregateVersionChainName } from './aggregateVersionChainName.js';
import {
  EvaluatedAggregateCommandSchema,
  type IEvaluatedAggregateCommand,
} from './evaluatedAggregateCommand.js';
import { validateEvaluatedCommandPublication } from './validateEvaluatedCommandPublication.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';

const migratableDORepoConfig = makeMigratableDORepoConfig({
  migrations: [],
  ...aggregateVersionChainName,
  dbConfig: aggregateVersionChainDbConfig,
});
const { historyHead, archives } = aggregateVersionChainDbConfig.schema;

type IAggregateHistoryError = IZerospinError | IZerospinErrorJson;

/** Immutable evaluated commands supply actor and agent fanout delivery. */
export class AggregateVersionChain extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    repoType: 'AggregateVersionChain',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'AGGREGATE_VERSION_CHAIN',
    migratableDORepoConfig,
  },
) {
  readonly recoveryRegistry = makeRecoveryRegistry<unknown>({
    storage: this.ctx.storage,
  });

  #resolveFanoutActor(actorName: string) {
    return Effect.gen({ self: this }, function* () {
      const aggregateRelease =
        requireAuthoredWorkerConfig().system.aggregates[this.key.aggregateName]
          ?.releases[this.key.aggregateVersion];
      if (aggregateRelease === undefined) {
        return yield* makeZerospinError('aggregate-version-unsupported');
      }
      const actor = aggregateRelease.actors[actorName];
      if (actor === undefined) {
        return yield* makeZerospinError({
          code: 'actor-version-unsupported',
          message: `Unsupported actor ${actorName} in ${this.key.aggregateName}@${this.key.aggregateVersion}`,
        });
      }
      return actor;
    });
  }

  readonly #actorVersionChainFanout: IFanoutQueue<
    'actorVersionChainFanout',
    {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: number;
      actorName: string;
      actorVersion: number;
      actorPath: string;
    },
    IEvaluatedAggregateCommand,
    IAggregateHistoryError
  > = makeFanoutQueue({
    RpcTarget,
    managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    concurrency: 100,
    name: 'actorVersionChainFanout',
    db: this.db,
    key: this.key,
    recoveryRegistry: this.recoveryRegistry,
    subscriberTable: this.schema.actorVersionChainFanoutSubscribers,
    subscriberIdentityColumns: {
      actorName: this.schema.actorVersionChainFanoutSubscribers.actorName,
      actorPath: this.schema.actorVersionChainFanoutSubscribers.actorPath,
    },
    subscriberIndexColumn:
      this.schema.actorVersionChainFanoutSubscribers.acknowledgedAggregateIndex,
    subscriberIdentityFromKey: ({ actorName, actorVersion, actorPath }) =>
      Effect.gen({ self: this }, function* () {
        const actor = yield* this.#resolveFanoutActor(actorName);
        if (actor.version !== actorVersion) {
          return yield* makeZerospinError({
            code: 'actor-version-unsupported',
            message: `Unsupported actor ${actorName}@${actorVersion} in ${this.key.aggregateName}@${this.key.aggregateVersion}`,
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
      aggregateId: Schema.String,
      aggregateName: Schema.String,
      aggregateVersion: VersionSchema,
      actorName: Schema.String,
      actorVersion: VersionSchema,
      actorPath: Schema.String,
    }),
    readPage: page => this.#readPage(page),
    getRepo: getAggregateActorVersionRepo,
  });

  get actorVersionChainFanout(): IFanoutQueue<
    'actorVersionChainFanout',
    {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: number;
      actorName: string;
      actorVersion: number;
      actorPath: string;
    },
    IEvaluatedAggregateCommand,
    IAggregateHistoryError
  > {
    return this.#actorVersionChainFanout;
  }

  readonly #agentVersionChainFanout: IFanoutQueue<
    'agentVersionChainFanout',
    {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: number;
      agentName: string;
      agentVersion: number;
    },
    IEvaluatedAggregateCommand,
    IAggregateHistoryError
  > = makeFanoutQueue({
    RpcTarget,
    managedRuntime: authoredReleaseRepoRuntime.managedRuntime,
    runInvocation: runWorkerInvocation,
    background: promise => this.ctx.waitUntil(promise),
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    concurrency: 100,
    name: 'agentVersionChainFanout',
    db: this.db,
    key: this.key,
    recoveryRegistry: this.recoveryRegistry,
    subscriberTable: this.schema.agentVersionChainFanoutSubscribers,
    subscriberIdentityColumns: {
      agentName: this.schema.agentVersionChainFanoutSubscribers.agentName,
      agentVersion: this.schema.agentVersionChainFanoutSubscribers.agentVersion,
    },
    subscriberIndexColumn:
      this.schema.agentVersionChainFanoutSubscribers.acknowledgedAggregateIndex,
    subscriberIdentityFromKey: ({ agentName, agentVersion }) =>
      Effect.succeed({ agentName, agentVersion }),
    subscriberKeyFromIdentity: identity =>
      Effect.succeed({ ...this.key, ...identity }),
    subscriberKeySchema: Schema.Struct({
      systemId: Schema.String,
      aggregateId: Schema.String,
      aggregateName: Schema.String,
      aggregateVersion: VersionSchema,
      agentName: Schema.String,
      agentVersion: VersionSchema,
    }),
    readPage: page => this.#readPage(page),
    getRepo: getAggregateAgentVersionRepo,
  });

  get agentVersionChainFanout(): IFanoutQueue<
    'agentVersionChainFanout',
    {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: number;
      agentName: string;
      agentVersion: number;
    },
    IEvaluatedAggregateCommand,
    IAggregateHistoryError
  > {
    return this.#agentVersionChainFanout;
  }

  readonly #append = Semaphore.makeUnsafe(1);

  #readHead() {
    return this.db
      .select()
      .from(historyHead)
      .where(eq(historyHead.singletonId, 1))
      .get();
  }

  #archiveRange(aggregateIndex: number) {
    const range = this.db
      .select()
      .from(archives)
      .where(lte(archives.firstAggregateIndex, aggregateIndex))
      .orderBy(desc(archives.firstAggregateIndex))
      .limit(1)
      .get();
    if (range === undefined) {
      throw makeZerospinError('aggregate-archive-directory-missing');
    }
    const next = this.db
      .select()
      .from(archives)
      .where(gt(archives.firstAggregateIndex, range.firstAggregateIndex))
      .orderBy(asc(archives.firstAggregateIndex))
      .limit(1)
      .get();
    return {
      firstAggregateIndex: range.firstAggregateIndex,
      lastAggregateIndex:
        next === undefined
          ? Number.MAX_SAFE_INTEGER
          : next.firstAggregateIndex - 1,
    };
  }

  #archiveRepo(firstAggregateIndex: number) {
    return getAggregateVersionArchive({
      key: { ...this.key, firstAggregateIndex },
    });
  }

  #readCommand(
    aggregateIndex: number,
  ): Effect.Effect<IEvaluatedAggregateCommand | null, IAggregateHistoryError> {
    return Effect.gen({ self: this }, function* () {
      const head = this.#readHead()?.aggregateIndex ?? 0;
      if (aggregateIndex > head) return null;
      const range = this.#archiveRange(aggregateIndex);
      const archive = yield* this.#archiveRepo(range.firstAggregateIndex);
      const command = yield* Effect.promise(() =>
        archive.getEvaluatedCommand({ aggregateIndex }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      if (command === null || command.aggregateIndex !== aggregateIndex) {
        return yield* makeZerospinError('aggregate-history-missing');
      }
      return command;
    });
  }

  #readPage(page: { afterIndex: number; maxIndex?: number }): Effect.Effect<
    {
      rows: readonly { row: IEvaluatedAggregateCommand; index: number }[];
      lastIndex: number;
    },
    IAggregateHistoryError
  > {
    return Effect.gen({ self: this }, function* () {
      const lastIndex = this.#readHead()?.aggregateIndex ?? 0;
      const maximum = Math.min(lastIndex, page.maxIndex ?? lastIndex);
      if (page.afterIndex >= maximum) return { rows: [], lastIndex };
      const range = this.#archiveRange(page.afterIndex + 1);
      const archive = yield* this.#archiveRepo(range.firstAggregateIndex);
      const maxIndex = Math.min(maximum, range.lastAggregateIndex);
      const result = yield* Effect.promise(() =>
        archive.getPage({
          afterIndex: page.afterIndex,
          maxIndex,
        }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      let expected = page.afterIndex + 1;
      if (result.rows.length === 0) {
        return yield* makeZerospinError('aggregate-history-missing');
      }
      for (const command of result.rows) {
        if (
          command.aggregateIndex !== expected++ ||
          command.aggregateIndex > maxIndex
        ) {
          return yield* makeZerospinError('aggregate-history-missing');
        }
      }
      return {
        rows: result.rows.map(row => ({ row, index: row.aggregateIndex })),
        lastIndex,
      };
    });
  }

  #appendToArchives(fresh: readonly IEvaluatedAggregateCommand[]) {
    return Effect.gen({ self: this }, function* () {
      let remaining = fresh;
      while (remaining.length > 0) {
        const first = remaining[0]!;
        const range = this.#archiveRange(first.aggregateIndex);
        const commands = remaining.filter(
          command => command.aggregateIndex <= range.lastAggregateIndex,
        );
        const archive = yield* this.#archiveRepo(range.firstAggregateIndex);
        const envelope = yield* Effect.tryPromise({
          try: () => archive.appendEvaluatedCommands({ commands }),
          catch: cause =>
            makeZerospinError({
              code: 'aggregate-archive-transport-failed',
              cause: prettyUnknownFailure(cause),
            }),
        });
        const result = yield* readRpcEnvelope(envelope).pipe(
          Effect.match({
            onSuccess: () => ({ _tag: 'Success' as const }),
            onFailure: error => ({ _tag: 'Failure' as const, error }),
          }),
        );
        if (
          result._tag === 'Failure' &&
          result.error.code === 'aggregate-version-archive-full'
        ) {
          const { lastAggregateIndex } = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              lastAggregateIndex: Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
              ),
            }),
          )(result.error.extra).pipe(
            mapParseError({
              code: 'aggregate-archive-capacity-invalid',
              prefix: 'Invalid Archive capacity response',
            }),
          );
          if (
            range.lastAggregateIndex !== Number.MAX_SAFE_INTEGER ||
            lastAggregateIndex < range.firstAggregateIndex ||
            lastAggregateIndex < first.aggregateIndex - 1 ||
            lastAggregateIndex >= commands.at(-1)!.aggregateIndex
          ) {
            return yield* makeZerospinError(
              'aggregate-archive-capacity-unavailable',
            );
          }
          this.db.transaction(tx => {
            tx.insert(archives)
              .values({ firstAggregateIndex: lastAggregateIndex + 1 })
              .onConflictDoNothing()
              .run();
          });
          continue;
        }
        if (result._tag === 'Failure') return yield* Effect.fail(result.error);
        remaining = remaining.slice(commands.length);
      }
    });
  }

  override onRepoStartup() {
    return Effect.gen({ self: this }, function* () {
      this.db.transaction(tx => {
        tx.insert(historyHead)
          .values({
            singletonId: 1,
            aggregateIndex: 0,
            commandId: null,
            dispositionChainHash: genesisDispositionChainHash(),
          })
          .onConflictDoNothing()
          .run();
        tx.insert(archives)
          .values({ firstAggregateIndex: 1 })
          .onConflictDoNothing()
          .run();
      });
      yield* this.recoveryRegistry.hold(this.#actorVersionChainFanout.name);
      yield* this.recoveryRegistry.hold(this.#agentVersionChainFanout.name);
    });
  }

  async appendEvaluatedCommands(props: {
    commands: readonly IEvaluatedAggregateCommand[];
  }): Promise<IRpcEnvelope<void, IZerospinErrorJson>> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { commands } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            commands: Schema.Array(
              Schema.toType(EvaluatedAggregateCommandSchema),
            ),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'aggregate-evaluated-command-invalid',
            prefix: 'Invalid evaluated command',
          }),
        );
        if (
          commands.some(
            command =>
              command.aggregateId !== this.key.aggregateId ||
              command.aggregateName !== this.key.aggregateName,
          )
        ) {
          return yield* makeZerospinError('aggregate-command-owner-mismatch');
        }
        yield* this.#actorVersionChainFanout.producerLease;
        yield* this.#agentVersionChainFanout.producerLease;
        const head = this.#readHead()?.aggregateIndex ?? 0;
        let previousIndex = 0;
        for (const command of commands) {
          if (command.aggregateIndex <= previousIndex) {
            return yield* makeZerospinError(
              'aggregate-evaluated-command-order-invalid',
            );
          }
          previousIndex = command.aggregateIndex;
          if (command.aggregateIndex <= head) {
            const retained = yield* this.#readCommand(command.aggregateIndex);
            if (!isEqual(retained, command)) {
              return yield* makeZerospinError(
                'aggregate-evaluated-command-mismatch',
              );
            }
          }
        }
        const fresh = commands.filter(command => command.aggregateIndex > head);
        const last = fresh.at(-1);
        if (last === undefined) return;
        yield* validateEvaluatedCommandPublication({
          commands: fresh,
          publishedThrough: head,
          aggregateRelease:
            requireAuthoredWorkerConfig().system.aggregates[
              this.key.aggregateName
            ]?.releases[this.key.aggregateVersion],
        });
        yield* this.#appendToArchives(fresh);
        const published = this.db.transaction(tx =>
          tx
            .update(historyHead)
            .set({
              aggregateIndex: last.aggregateIndex,
              commandId: last.id,
              dispositionChainHash: last.dispositionChainHash,
            })
            .where(eq(historyHead.singletonId, 1))
            .returning({ aggregateIndex: historyHead.aggregateIndex })
            .get(),
        );
        if (published === undefined) {
          return yield* makeZerospinError('aggregate-history-missing');
        }
        yield* this.#actorVersionChainFanout.wake().pipe(Effect.exit);
        yield* this.#agentVersionChainFanout.wake().pipe(Effect.exit);
      }).pipe(Effect.scoped, this.#append.withPermits(1), effect =>
        makeWorkerRpcEnvelope(effect),
      ),
    );
  }

  async getEvaluatedCommand(props: {
    aggregateIndex: number;
  }): Promise<
    IRpcEnvelope<IEvaluatedAggregateCommand | null, IZerospinErrorJson>
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
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
            code: 'aggregate-result-cursor-invalid',
            prefix: 'Invalid result cursor',
          }),
        );
        return yield* this.#readCommand(aggregateIndex);
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  /** Pure bounded evaluated history, independent of current authored release availability. */
  async getEvaluatedCommandPage(props: {
    afterIndex: number;
    maxIndex?: number;
  }): Promise<
    IRpcEnvelope<
      { rows: readonly IEvaluatedAggregateCommand[]; lastIndex: number },
      IZerospinErrorJson
    >
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const page = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            afterIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isBetween({
                minimum: 0,
                maximum: Number.MAX_SAFE_INTEGER,
              }),
            ),
            maxIndex: Schema.optionalKey(
              Schema.Number.check(
                Schema.isInt(),
                Schema.isBetween({
                  minimum: 0,
                  maximum: Number.MAX_SAFE_INTEGER,
                }),
              ),
            ),
          }),
        )(props, { onExcessProperty: 'error' });
        const retained = yield* this.#readPage(page);
        return {
          rows: retained.rows.map(entry => entry.row),
          lastIndex: retained.lastIndex,
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
