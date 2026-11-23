import { makeAggregateExposedCommand } from '@zerospin/core/aggregateSession/aggregateExposedCommandsTable';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  ensureZerospinError,
  makeZerospinError,
  mapParseError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { RpcTarget } from 'cloudflare:workers';
import { asc, eq, lte, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { AggregateActorVersionArchive } from '../AggregateActorVersionArchive/AggregateActorVersionArchive.js';
import { genesisDispositionChainHash } from '../aggregateDispositionChainHash/aggregateDispositionChainHash.js';
import type { IAggregateProjectionKey } from '../aggregateProjection/resolveAggregateProjectionView.js';
import {
  AggregateExposedPublicationSchema,
  type IAggregateExposedPublication,
} from '../aggregateSessionChain/aggregateExposedPublication.js';
import { aggregateSessionChainDbConfig } from '../aggregateSessionChain/aggregateSessionChainDbConfig.js';
import {
  makeFanoutQueue,
  type IFanoutDelivery,
  type IFanoutQueue,
} from '../makeFanoutQueue/makeFanoutQueue.js';
import type { IRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';

import {
  appendLocalAggregateActorPublications,
  readLocalAggregateActorPage,
  readLocalAggregateActorPublication,
  readLocalAggregateResolutionSummary,
  type IAggregateActorHistoryKey,
  type IAggregateActorPage,
  type IAggregateResolutionRequest,
  type IAggregateResolutionSummary,
} from './aggregateActorHistoryStorage.js';

type IAggregateActorHistoryError = IZerospinError | IZerospinErrorJson;
const {
  historyHead,
  archives,
  archiveFanoutSubscribers,
  exposedCommands,
  commandResolutions,
} = aggregateSessionChainDbConfig.schema;

class AggregateActorArchiveSubscriber extends RpcTarget {
  constructor(
    readonly deliver: (
      delivery: IFanoutDelivery<IAggregateExposedPublication>,
    ) => Promise<IRpcEnvelope<void, IZerospinErrorJson>>,
  ) {
    super();
  }

  [Symbol.dispose]() {
    // This source-local RPC capability owns no external resources.
  }

  receive(delivery: IFanoutDelivery<IAggregateExposedPublication>) {
    return this.deliver(delivery);
  }
}

/** Actor history owns archival and fixed-prefix reads; sockets retain only admission state. */
export class AggregateActorHistory {
  readonly db: IDb;
  readonly key: IAggregateActorHistoryKey;
  readonly archiveFanout: IFanoutQueue<
    'archiveFanout',
    IAggregateActorHistoryKey & { singletonId: number },
    IAggregateExposedPublication,
    IAggregateActorHistoryError
  >;

  constructor(props: {
    db: IDb;
    key: IAggregateActorHistoryKey;
    recoveryRegistry: IRecoveryRegistry;
    managedRuntime: ManagedRuntime.ManagedRuntime<never, unknown>;
    background: (promise: Promise<unknown>) => void;
  }) {
    this.db = props.db;
    this.key = props.key;
    this.archiveFanout = makeFanoutQueue({
      RpcTarget,
      managedRuntime: props.managedRuntime,
      runInvocation: runWorkerInvocation,
      encodeRpcOutcome: makeWorkerRpcEnvelope,
      background: props.background,
      name: 'archiveFanout',
      concurrency: 1,
      db: this.db,
      key: this.key,
      recoveryRegistry: props.recoveryRegistry,
      subscriberTable: archiveFanoutSubscribers,
      subscriberIdentityColumns: {
        singletonId: archiveFanoutSubscribers.singletonId,
      },
      subscriberIndexColumn:
        archiveFanoutSubscribers.acknowledgedAggregateIndex,
      subscriberIdentityFromKey: () => Effect.succeed({ singletonId: 1 }),
      subscriberKeyFromIdentity: () =>
        Effect.succeed({ ...this.key, singletonId: 1 }),
      subscriberKeySchema: Schema.Struct({
        systemId: Schema.String,
        aggregateId: Schema.String,
        aggregateName: Schema.String,
        aggregateVersion: Schema.Number,
        actorName: Schema.String,
        actorVersion: Schema.Number,
        actorPath: Schema.String,
        singletonId: Schema.Number,
      }),
      readPage: page =>
        Effect.sync(() => {
          const head = this.readHead().aggregateIndex;
          if (page.afterIndex >= head || page.maxIndex === 0) {
            return { rows: [], lastIndex: head };
          }
          const range = this.#range(page.afterIndex + 1);
          const result = readLocalAggregateActorPage(
            this.db,
            {
              afterAggregateIndex: page.afterIndex,
              afterScannedIndex: page.afterIndex,
            },
            Math.min(head, page.maxIndex ?? head, range.lastAggregateIndex),
          );
          if (result.commands.length === 0) {
            throw makeZerospinError('projection-history-command-missing');
          }
          return {
            rows: result.commands.map(row => ({
              row,
              index: row.aggregateIndex,
            })),
            lastIndex: head,
          };
        }),
      acknowledge: (tx, _identity, through) => {
        tx.delete(commandResolutions)
          .where(lte(commandResolutions.aggregateIndex, through))
          .run();
        tx.delete(exposedCommands)
          .where(lte(exposedCommands.aggregateIndex, through))
          .run();
      },
      getRepo: () =>
        Effect.succeed({
          archiveFanoutSubscriber: (sourceKey: IAggregateActorHistoryKey) => {
            if (!isEqual(sourceKey, this.key)) {
              throw makeZerospinError('projection-history-source-mismatch');
            }
            return Promise.resolve(
              new AggregateActorArchiveSubscriber(delivery =>
                props.managedRuntime.runPromise(
                  this.#deliver(delivery).pipe(effect =>
                    makeWorkerRpcEnvelope(effect),
                  ),
                ),
              ),
            );
          },
        }),
    });
  }

  activate() {
    return Effect.gen({ self: this }, function* () {
      this.db.transaction(tx => {
        tx.insert(historyHead)
          .values({
            singletonId: 1,
            aggregateIndex: 0,
            dispositionChainHash: genesisDispositionChainHash(),
          })
          .onConflictDoNothing()
          .run();
        tx.insert(archives)
          .values({ firstAggregateIndex: 1 })
          .onConflictDoNothing()
          .run();
        tx.insert(archiveFanoutSubscribers)
          .values({ singletonId: 1, acknowledgedAggregateIndex: 0 })
          .onConflictDoNothing()
          .run();
      });
      yield* this.archiveFanout.wake();
    });
  }

  readHead() {
    const head = this.db
      .select()
      .from(historyHead)
      .where(eq(historyHead.singletonId, 1))
      .get();
    return {
      aggregateIndex: head?.aggregateIndex ?? 0,
      dispositionChainHash:
        head?.dispositionChainHash ?? genesisDispositionChainHash(),
    };
  }

  #archivedThrough() {
    return (
      this.db
        .select()
        .from(archiveFanoutSubscribers)
        .where(eq(archiveFanoutSubscribers.singletonId, 1))
        .get()?.acknowledgedAggregateIndex ?? 0
    );
  }

  #ranges() {
    const entries = this.db
      .select()
      .from(archives)
      .orderBy(asc(archives.firstAggregateIndex))
      .all();
    return entries.map((entry, index) => ({
      firstAggregateIndex: entry.firstAggregateIndex,
      lastAggregateIndex:
        entries[index + 1] === undefined
          ? Number.MAX_SAFE_INTEGER
          : entries[index + 1]!.firstAggregateIndex - 1,
    }));
  }

  #range(aggregateIndex: number) {
    const range = this.#ranges().find(
      entry =>
        entry.firstAggregateIndex <= aggregateIndex &&
        entry.lastAggregateIndex >= aggregateIndex,
    );
    if (range === undefined) {
      throw makeZerospinError('aggregate-actor-archive-directory-missing');
    }
    return range;
  }

  #archive(
    firstAggregateIndex: number,
  ): Effect.Effect<
    Pick<
      AggregateActorVersionArchive,
      | 'appendExposedCommands'
      | 'getExposedCommand'
      | 'getPage'
      | 'getResolutionSummary'
    >,
    Effect.Error<ReturnType<typeof AggregateActorVersionArchive.getRepo>>
  > {
    return AggregateActorVersionArchive.getRepo({
      key: { ...this.key, firstAggregateIndex },
    });
  }

  #deliver(
    delivery: IFanoutDelivery<IAggregateExposedPublication>,
  ): Effect.Effect<void, IAggregateActorHistoryError> {
    return Effect.gen({ self: this }, function* () {
      if (delivery.rows.length === 0) {
        return yield* makeZerospinError(
          'aggregate-actor-archive-delivery-empty',
        );
      }
      let remaining = delivery.rows;
      while (remaining.length > 0) {
        const first = remaining[0]!;
        const range = this.#range(first.aggregateIndex);
        const commands = remaining.filter(
          command => command.aggregateIndex <= range.lastAggregateIndex,
        );
        const archive = yield* this.#archive(range.firstAggregateIndex);
        const reply = yield* Effect.promise(() =>
          archive.appendExposedCommands({ sourceKey: this.key, commands }),
        );
        const result = yield* readRpcEnvelope(reply).pipe(Effect.result);
        if (result._tag === 'Failure') {
          if (result.failure.code !== 'aggregate-actor-version-archive-full') {
            return yield* Effect.fail(result.failure);
          }
          const { lastAggregateIndex } = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              lastAggregateIndex: Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
              ),
            }),
          )(result.failure.extra).pipe(
            mapParseError({
              code: 'aggregate-actor-archive-capacity-invalid',
              prefix: 'Invalid full Archive head',
            }),
          );
          if (
            lastAggregateIndex < range.firstAggregateIndex ||
            lastAggregateIndex < first.aggregateIndex - 1 ||
            lastAggregateIndex >= Number.MAX_SAFE_INTEGER
          ) {
            return yield* makeZerospinError(
              'aggregate-actor-archive-capacity-unavailable',
            );
          }
          this.db.transaction(tx =>
            tx
              .insert(archives)
              .values({ firstAggregateIndex: lastAggregateIndex + 1 })
              .onConflictDoNothing()
              .run(),
          );
          continue;
        }
        remaining = remaining.slice(commands.length);
      }
    });
  }

  readPublication(
    aggregateIndex: number,
  ): Effect.Effect<
    IAggregateExposedPublication | null,
    IAggregateActorHistoryError
  > {
    return Effect.gen({ self: this }, function* () {
      if (aggregateIndex > this.readHead().aggregateIndex) return null;
      const local = readLocalAggregateActorPublication(this.db, aggregateIndex);
      if (local !== null) return local;
      if (aggregateIndex > this.#archivedThrough()) {
        return yield* makeZerospinError('projection-history-command-missing');
      }
      const range = this.#range(aggregateIndex);
      const archive = yield* this.#archive(range.firstAggregateIndex);
      const result = yield* Effect.promise(() =>
        archive.getExposedCommand({ aggregateIndex }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      if (result === null || result.aggregateIndex !== aggregateIndex) {
        return yield* makeZerospinError('projection-history-command-missing');
      }
      return result;
    });
  }

  getCheckpoint(aggregateIndex: number) {
    return Effect.gen({ self: this }, function* () {
      if (!Number.isSafeInteger(aggregateIndex) || aggregateIndex < 0) {
        return yield* makeZerospinError(
          'projection-history-checkpoint-invalid',
        );
      }
      if (aggregateIndex === 0) {
        return {
          aggregateIndex: 0,
          dispositionChainHash: genesisDispositionChainHash(),
        };
      }
      const command = yield* this.readPublication(aggregateIndex);
      if (command === null) {
        return yield* makeZerospinError(
          'projection-history-checkpoint-missing',
        );
      }
      return {
        aggregateIndex,
        dispositionChainHash: command.dispositionChainHash,
      };
    });
  }

  /** Capture local rows before awaiting Archives so pruning cannot move rows between both halves. */
  readExposedCommands(
    props: IAggregateActorPage,
  ): Effect.Effect<
    IAggregateExposedPublication[],
    IAggregateActorHistoryError
  > {
    return Effect.gen({ self: this }, function* () {
      const { maximum, archivedThrough, ranges, local } = yield* Effect.try({
        try: () => {
          const head = this.readHead().aggregateIndex;
          const maximum = Math.min(props.throughAggregateIndex ?? head, head);
          const archivedThrough = this.#archivedThrough();
          const ranges = this.#ranges();
          const local = readLocalAggregateActorPage(
            this.db,
            {
              ...props,
              afterScannedIndex: Math.max(
                props.afterScannedIndex ?? 0,
                archivedThrough,
              ),
            },
            maximum,
          );
          return { maximum, archivedThrough, ranges, local };
        },
        catch: error =>
          ensureZerospinError({
            code: 'projection-history-read-failed',
            error,
          }),
      });
      const commands: IAggregateExposedPublication[] = [];
      let bytes = 0;
      const append = (rows: readonly IAggregateExposedPublication[]) => {
        for (const command of rows) {
          const size = new TextEncoder().encode(
            JSON.stringify(command),
          ).byteLength;
          if (
            commands.length >= Math.min(props.limit ?? 64, 64) ||
            (commands.length > 0 && bytes + size > 1024 * 1024)
          ) {
            return false;
          }
          commands.push(command);
          bytes += size;
        }
        return true;
      };
      let scannedThrough = Math.max(
        props.afterScannedIndex ?? 0,
        props.nodeId === undefined ? (props.afterAggregateIndex ?? 0) : 0,
      );
      for (const range of ranges) {
        const bound = Math.min(
          maximum,
          archivedThrough,
          range.lastAggregateIndex,
        );
        if (bound < range.firstAggregateIndex || scannedThrough >= bound) {
          continue;
        }
        scannedThrough = Math.max(
          scannedThrough,
          range.firstAggregateIndex - 1,
        );
        const archive = yield* this.#archive(range.firstAggregateIndex);
        while (scannedThrough < bound) {
          const page = yield* Effect.promise(() =>
            archive.getPage({
              afterAggregateIndex: props.afterAggregateIndex ?? 0,
              afterScannedIndex: scannedThrough,
              throughAggregateIndex: bound,
              limit: props.limit ?? 64,
              ...(props.nodeId === undefined ? {} : { nodeId: props.nodeId }),
              ...(props.afterPushIndex === undefined
                ? {}
                : { afterPushIndex: props.afterPushIndex }),
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          if (
            page.scannedThrough <= scannedThrough ||
            page.scannedThrough > bound
          ) {
            return yield* makeZerospinError('session-replay-gap');
          }
          if (!append(page.commands)) return commands;
          scannedThrough = page.scannedThrough;
          if (commands.length >= Math.min(props.limit ?? 64, 64)) {
            return commands;
          }
        }
      }
      append(local.commands);
      return commands;
    });
  }

  getResolvedThrough(
    props: IAggregateResolutionRequest & {
      actorName: string;
      actorVersion: number;
    },
  ): Effect.Effect<number, IAggregateActorHistoryError> {
    return Effect.gen({ self: this }, function* () {
      if (
        !Number.isSafeInteger(props.throughAggregateIndex) ||
        props.throughAggregateIndex < 0
      ) {
        return yield* makeZerospinError('node-recovery-checkpoint-invalid');
      }
      if (
        props.actorName !== this.key.actorName ||
        props.actorVersion !== this.key.actorVersion
      ) {
        return yield* makeZerospinError('node-recovery-caller-mismatch');
      }
      const archivedThrough = this.#archivedThrough();
      const ranges = this.#ranges();
      const local = readLocalAggregateResolutionSummary(
        this.db,
        props,
        archivedThrough,
      );
      const fragments: IAggregateResolutionSummary[] = [];
      for (const range of ranges) {
        const bound = Math.min(
          props.throughAggregateIndex,
          archivedThrough,
          range.lastAggregateIndex,
        );
        if (bound < range.firstAggregateIndex) continue;
        const archive = yield* this.#archive(range.firstAggregateIndex);
        fragments.push(
          yield* Effect.promise(() =>
            archive.getResolutionSummary({
              nodeId: props.nodeId,
              sessionName: props.sessionName,
              claims: props.claims,
              throughAggregateIndex: bound,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope)),
        );
      }
      fragments.push(local);
      if (fragments.some(fragment => fragment.mismatches > 0)) {
        return yield* makeZerospinError('node-recovery-caller-mismatch');
      }
      let resolvedThrough = 0;
      for (const fragment of fragments) {
        if (fragment.count === 0) continue;
        if (
          fragment.count !== fragment.distinctCount ||
          fragment.minPushIndex !== resolvedThrough + 1 ||
          fragment.maxPushIndex - fragment.minPushIndex + 1 !== fragment.count
        ) {
          return yield* makeZerospinError('node-outcome-gap');
        }
        resolvedThrough = fragment.maxPushIndex;
      }
      return resolvedThrough;
    });
  }

  appendExposedCommands(props: {
    sourceKey: IAggregateProjectionKey;
    commands: readonly unknown[];
  }) {
    return Effect.gen({ self: this }, function* () {
      if (!isEqual(props.sourceKey, this.key)) {
        return yield* makeZerospinError('projection-history-source-mismatch');
      }
      const commands = yield* Schema.decodeUnknownEffect(
        Schema.Array(Schema.toType(AggregateExposedPublicationSchema)),
      )(props.commands, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'exposed-command-invalid',
          prefix: 'Invalid Actor publication',
        }),
      );
      let previous = 0;
      for (const command of commands) {
        if (command.aggregateIndex <= previous) {
          return yield* makeZerospinError('exposed-command-index-gap');
        }
        previous = command.aggregateIndex;
      }
      yield* this.archiveFanout.producerLease;
      const fresh = yield* Effect.try({
        try: () =>
          this.db.transaction(tx => {
            const head =
              tx
                .select()
                .from(historyHead)
                .where(eq(historyHead.singletonId, 1))
                .get()?.aggregateIndex ?? 0;
            // The bound projection Repo freezes publications; the logical head proves covered positions.
            const fresh = commands.filter(
              command => command.aggregateIndex > head,
            );
            if (fresh.length > 64) {
              throw makeZerospinError('exposed-command-batch-too-large');
            }
            const count =
              tx
                .select({ count: sql<number>`COUNT(*)` })
                .from(exposedCommands)
                .get()?.count ?? 0;
            if (count + fresh.length > 64) {
              throw makeZerospinError('exposed-command-archive-backlog-full');
            }
            appendLocalAggregateActorPublications(tx, fresh, head);
            const last = fresh.at(-1);
            if (last !== undefined) {
              tx.update(historyHead)
                .set({
                  aggregateIndex: last.aggregateIndex,
                  dispositionChainHash: last.dispositionChainHash,
                })
                .where(eq(historyHead.singletonId, 1))
                .run();
            }
            return fresh;
          }),
        catch: error =>
          ensureZerospinError({ code: 'exposed-command-append-failed', error }),
      });
      return fresh.map(publication => ({
        output: makeAggregateExposedCommand({
          ...publication,
          failure: publication.commandResolution?.failure ?? null,
        }),
        commandResolution: publication.commandResolution,
      }));
    }).pipe(
      Effect.scoped,
      Effect.ensuring(this.archiveFanout.wake().pipe(Effect.exit)),
    );
  }
}
