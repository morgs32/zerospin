import type { IDb } from '@zerospin/core/drizzle/types';
import { filterServiceBrowserCommand } from '@zerospin/core/serviceSession/filterServiceBrowserCommand';
import { makeServiceExposedCommand } from '@zerospin/core/serviceSession/makeServiceExposedCommand';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { RpcTarget } from 'cloudflare:workers';
import { asc, eq, lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

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
  readServiceActorPublication,
  readServiceActorPublicationPage,
  readServiceActorResolutionSummary,
  type IServiceActorResolutionSummary,
} from '../ServiceActorVersionArchive/serviceActorArchiveStorage.js';
import { ServiceActorVersionArchive } from '../ServiceActorVersionArchive/ServiceActorVersionArchive.js';
import { genesisDispositionChainHash } from '../serviceDispositionChainHash/serviceDispositionChainHash.js';
import type { IServiceProjectionKey } from '../serviceProjection/resolveServiceActorView.js';
import {
  serviceProjectionDbConfig,
  type IServiceExposedPublication,
} from '../serviceProjection/serviceProjectionDbConfig.js';

import { appendExposedCommands } from './appendExposedCommands.js';
import type { IServiceOutcomeOwner } from './serviceActorOutcomeOwner.js';
import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';
import { serviceActorVersionChainName } from './serviceActorVersionChainName.js';

type IServiceActorHistoryError = IZerospinError | IZerospinErrorJson;

/** One logical immutable publication history, with asynchronous physical relocation. */
export class ServiceActorHistory {
  readonly archiveFanout: IFanoutQueue<
    'archiveFanout',
    IServiceProjectionKey,
    IServiceExposedPublication,
    IServiceActorHistoryError
  >;

  constructor(
    private readonly props: {
      db: IDb;
      key: IServiceProjectionKey;
      recoveryRegistry: IRecoveryRegistry;
      managedRuntime: ManagedRuntime.ManagedRuntime<never, unknown>;
      background: (promise: Promise<unknown>) => void;
    },
  ) {
    const { db, key, recoveryRegistry, managedRuntime, background } = props;
    const { archiveFanoutSubscribers, commandResolutions, exposedCommands } =
      serviceActorVersionChainDbConfig.schema;
    this.archiveFanout = makeFanoutQueue({
      RpcTarget,
      managedRuntime,
      runInvocation: runWorkerInvocation,
      encodeRpcOutcome: makeWorkerRpcEnvelope,
      background,
      name: 'archiveFanout',
      concurrency: 1,
      db,
      key,
      recoveryRegistry,
      subscriberTable: archiveFanoutSubscribers,
      subscriberIdentityColumns: {
        singletonId: archiveFanoutSubscribers.singletonId,
      },
      subscriberIndexColumn: archiveFanoutSubscribers.acknowledgedServiceIndex,
      subscriberIdentityFromKey: () => Effect.succeed({ singletonId: 1 }),
      subscriberKeyFromIdentity: () => Effect.succeed(key),
      subscriberKeySchema: Schema.toType(serviceActorVersionChainName.keyCodec),
      readPage: page => {
        const head = this.readHead();
        if (page.maxIndex === 0 || page.afterIndex >= head.serviceIndex) {
          return Effect.succeed({ rows: [], lastIndex: head.serviceIndex });
        }
        const range = this.#range(page.afterIndex + 1);
        return this.readPage({
          ...page,
          maxIndex: Math.min(
            page.maxIndex ?? head.serviceIndex,
            range.lastServiceIndex,
          ),
        }).pipe(
          Effect.map(result => ({
            rows: result.rows.map(row => ({ row, index: row.serviceIndex })),
            lastIndex: result.lastIndex,
          })),
        );
      },
      acknowledge: (tx, _identity, throughIndex) => {
        tx.delete(commandResolutions)
          .where(lte(commandResolutions.serviceIndex, throughIndex))
          .run();
        tx.delete(exposedCommands)
          .where(lte(exposedCommands.serviceIndex, throughIndex))
          .run();
      },
      getRepo: () =>
        Effect.succeed({
          archiveFanoutSubscriber: () =>
            Promise.resolve({
              receive: (
                delivery: IFanoutDelivery<IServiceExposedPublication>,
              ) =>
                managedRuntime.runPromise(
                  this.#deliverArchivePage(delivery.rows).pipe(effect =>
                    makeWorkerRpcEnvelope(effect),
                  ),
                ),
              [Symbol.dispose]: () => {},
            }),
        }),
    });
  }

  initialize() {
    return Effect.gen({ self: this }, function* () {
      const { historyHead, archives, archiveFanoutSubscribers } =
        serviceActorVersionChainDbConfig.schema;
      this.props.db.transaction(tx => {
        tx.insert(historyHead)
          .values({
            singletonId: 1,
            serviceIndex: 0,
            dispositionChainHash: genesisDispositionChainHash(),
          })
          .onConflictDoNothing()
          .run();
        tx.insert(archives)
          .values({ firstServiceIndex: 1 })
          .onConflictDoNothing()
          .run();
        tx.insert(archiveFanoutSubscribers)
          .values({ singletonId: 1, acknowledgedServiceIndex: 0 })
          .onConflictDoNothing()
          .run();
      });
      yield* this.archiveFanout.wake();
    });
  }

  readHead() {
    const table = serviceActorVersionChainDbConfig.schema.historyHead;
    const row = this.props.db
      .select()
      .from(table)
      .where(eq(table.singletonId, 1))
      .get();
    return {
      serviceIndex: row?.serviceIndex ?? 0,
      dispositionChainHash:
        row?.dispositionChainHash ?? genesisDispositionChainHash(),
    };
  }

  #capture() {
    const { archives, archiveFanoutSubscribers } =
      serviceActorVersionChainDbConfig.schema;
    return {
      head: this.readHead(),
      archivedThrough:
        this.props.db
          .select()
          .from(archiveFanoutSubscribers)
          .where(eq(archiveFanoutSubscribers.singletonId, 1))
          .get()?.acknowledgedServiceIndex ?? 0,
      ranges: this.props.db
        .select()
        .from(archives)
        .orderBy(asc(archives.firstServiceIndex))
        .all(),
    };
  }

  #range(serviceIndex: number, ranges = this.#capture().ranges) {
    const position = ranges.findLastIndex(
      range => range.firstServiceIndex <= serviceIndex,
    );
    const range = ranges[position];
    if (range === undefined) {
      throw makeZerospinError('service-actor-archive-directory-missing');
    }
    return {
      firstServiceIndex: range.firstServiceIndex,
      lastServiceIndex:
        ranges[position + 1] === undefined
          ? Number.MAX_SAFE_INTEGER
          : ranges[position + 1]!.firstServiceIndex - 1,
    };
  }

  #archive(
    firstServiceIndex: number,
  ): Effect.Effect<
    Pick<
      ServiceActorVersionArchive,
      | 'appendExposedCommands'
      | 'getExposedCommand'
      | 'getPage'
      | 'getResolutionSummary'
    >,
    Effect.Error<ReturnType<typeof ServiceActorVersionArchive.getRepo>>
  > {
    return ServiceActorVersionArchive.getRepo({
      key: { ...this.props.key, firstServiceIndex },
    });
  }

  #deliverArchivePage(
    rows: readonly IServiceExposedPublication[],
  ): Effect.Effect<void, IServiceActorHistoryError> {
    return Effect.gen({ self: this }, function* () {
      let offset = 0;
      while (offset < rows.length) {
        const first = rows[offset]!;
        const range = this.#range(first.serviceIndex);
        const commands = rows
          .slice(offset)
          .filter(row => row.serviceIndex <= range.lastServiceIndex);
        const archive = yield* this.#archive(range.firstServiceIndex);
        const reply = yield* Effect.promise(() =>
          archive.appendExposedCommands({
            sourceKey: this.props.key,
            commands,
          }),
        );
        const result = yield* readRpcEnvelope(reply).pipe(
          Effect.match({
            onSuccess: () => ({ _tag: 'Success' as const }),
            onFailure: error => ({ _tag: 'Failure' as const, error }),
          }),
        );
        if (
          result._tag === 'Failure' &&
          result.error.code === 'service-actor-version-archive-full'
        ) {
          const { lastServiceIndex } = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              lastServiceIndex: Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
              ),
            }),
          )(result.error.extra).pipe(
            mapParseError({
              code: 'service-actor-archive-head-invalid',
              prefix: 'Invalid full Actor Archive head',
            }),
          );
          if (
            lastServiceIndex < range.firstServiceIndex ||
            lastServiceIndex >= range.lastServiceIndex
          ) {
            return yield* Effect.fail(result.error);
          }
          const table = serviceActorVersionChainDbConfig.schema.archives;
          this.props.db.transaction(tx =>
            tx
              .insert(table)
              .values({ firstServiceIndex: lastServiceIndex + 1 })
              .onConflictDoNothing()
              .run(),
          );
          continue;
        }
        if (result._tag === 'Failure') return yield* Effect.fail(result.error);
        offset += commands.length;
      }
    });
  }

  readCommand(
    serviceIndex: number,
  ): Effect.Effect<
    IServiceExposedPublication | null,
    IServiceActorHistoryError
  > {
    return Effect.gen({ self: this }, function* () {
      const captured = this.#capture();
      if (serviceIndex > captured.head.serviceIndex || serviceIndex < 1) {
        return null;
      }
      const local = readServiceActorPublication(this.props.db, serviceIndex);
      if (local !== null) return local;
      if (serviceIndex > captured.archivedThrough) {
        return yield* makeZerospinError(
          'service-actor-archive-history-missing',
        );
      }
      const range = this.#range(serviceIndex, captured.ranges);
      const archive = yield* this.#archive(range.firstServiceIndex);
      const command = yield* Effect.promise(() =>
        archive.getExposedCommand({ serviceIndex }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      if (command === null || command.serviceIndex !== serviceIndex) {
        return yield* makeZerospinError(
          'service-actor-archive-history-missing',
        );
      }
      return command;
    });
  }

  readPage(page: {
    afterIndex: number;
    maxIndex?: number;
  }): Effect.Effect<
    { rows: readonly IServiceExposedPublication[]; lastIndex: number },
    IServiceActorHistoryError
  > {
    return Effect.gen({ self: this }, function* () {
      const captured = this.#capture();
      const maximum = Math.min(
        captured.head.serviceIndex,
        page.maxIndex ?? captured.head.serviceIndex,
      );
      if (
        !Number.isSafeInteger(page.afterIndex) ||
        page.afterIndex < 0 ||
        !Number.isSafeInteger(maximum) ||
        maximum < page.afterIndex
      ) {
        return yield* makeZerospinError('session-replay-cursor-invalid');
      }
      if (page.afterIndex === maximum) {
        return { rows: [], lastIndex: captured.head.serviceIndex };
      }
      if (page.afterIndex >= captured.archivedThrough) {
        return readServiceActorPublicationPage(
          this.props.db,
          { ...page, maxIndex: maximum },
          captured.head.serviceIndex,
        );
      }
      const range = this.#range(page.afterIndex + 1, captured.ranges);
      const archive = yield* this.#archive(range.firstServiceIndex);
      const result = yield* Effect.promise(() =>
        archive.getPage({
          afterIndex: page.afterIndex,
          maxIndex: Math.min(
            maximum,
            captured.archivedThrough,
            range.lastServiceIndex,
          ),
        }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      if (result.rows[0]?.serviceIndex !== page.afterIndex + 1) {
        return yield* makeZerospinError(
          'service-actor-archive-history-missing',
        );
      }
      return { rows: result.rows, lastIndex: captured.head.serviceIndex };
    });
  }

  getCheckpoint(serviceIndex?: number) {
    return Effect.gen({ self: this }, function* () {
      if (serviceIndex === undefined) return this.readHead();
      if (!Number.isSafeInteger(serviceIndex) || serviceIndex < 0) {
        return yield* makeZerospinError(
          'service-projection-checkpoint-invalid',
        );
      }
      if (serviceIndex === 0) {
        return {
          serviceIndex: 0,
          dispositionChainHash: genesisDispositionChainHash(),
        };
      }
      const command = yield* this.readCommand(serviceIndex);
      if (command === null) {
        return yield* makeZerospinError(
          'service-projection-checkpoint-invalid',
        );
      }
      return {
        serviceIndex,
        dispositionChainHash: command.dispositionChainHash,
      };
    });
  }

  append(props: {
    sourceKey: IServiceProjectionKey;
    commands: readonly IServiceExposedPublication[];
  }) {
    return Effect.gen({ self: this }, function* () {
      if (!isEqual(props.sourceKey, this.props.key)) {
        return yield* makeZerospinError('projection-history-source-mismatch');
      }
      const commands = yield* Schema.decodeUnknownEffect(
        Schema.Array(
          Schema.toType(
            serviceProjectionDbConfig.tables.exposedCommandOutbox.codec,
          ),
        ),
      )(props.commands, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'exposed-command-invalid',
          prefix: 'Invalid exposed Service command',
        }),
      );
      for (let index = 1; index < commands.length; index += 1) {
        if (
          commands[index]!.serviceIndex <= commands[index - 1]!.serviceIndex
        ) {
          return yield* makeZerospinError('exposed-command-index-gap');
        }
      }
      yield* this.archiveFanout.producerLease;
      return yield* appendExposedCommands(this.props.db, {
        ...props,
        key: this.props.key,
        commands,
      });
    }).pipe(
      Effect.ensuring(this.archiveFanout.wake().pipe(Effect.exit)),
      Effect.scoped,
    );
  }

  getResolvedThrough(props: {
    owner: IServiceOutcomeOwner;
    afterOutcomeIndex: number;
    throughServiceIndex: number;
  }): Effect.Effect<number, IServiceActorHistoryError> {
    return Effect.gen({ self: this }, function* () {
      const { afterOutcomeIndex, throughServiceIndex } = props;
      const owner: IServiceOutcomeOwner = {
        actorName: props.owner.actorName,
        actorVersion: props.owner.actorVersion,
        sessionName: props.owner.sessionName,
        claims: props.owner.claims,
        nodeId: props.owner.nodeId,
      };
      if (
        owner.actorName !== this.props.key.actorName ||
        owner.actorVersion !== this.props.key.actorVersion
      ) {
        return yield* makeZerospinError('node-recovery-caller-mismatch');
      }
      if (
        !Number.isSafeInteger(afterOutcomeIndex) ||
        afterOutcomeIndex < 0 ||
        !Number.isSafeInteger(throughServiceIndex) ||
        throughServiceIndex < 0
      ) {
        return yield* makeZerospinError('node-recovery-checkpoint-invalid');
      }
      if (owner.nodeId === null) {
        if (afterOutcomeIndex !== 0) {
          return yield* makeZerospinError('node-recovery-checkpoint-invalid');
        }
        return 0;
      }
      const captured = this.#capture();
      const local = readServiceActorResolutionSummary(this.props.db, {
        owner,
        throughServiceIndex,
        afterServiceIndex: captured.archivedThrough,
      });
      const summaries: IServiceActorResolutionSummary[] = [];
      const maximum = Math.min(throughServiceIndex, captured.archivedThrough);
      for (const entry of captured.ranges) {
        if (entry.firstServiceIndex > maximum) break;
        const range = this.#range(entry.firstServiceIndex, captured.ranges);
        const archive = yield* this.#archive(range.firstServiceIndex);
        summaries.push(
          yield* Effect.promise(() =>
            archive.getResolutionSummary({
              owner,
              throughServiceIndex: Math.min(maximum, range.lastServiceIndex),
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope)),
        );
      }
      summaries.push(local);
      let resolvedThrough = 0;
      for (const summary of summaries) {
        if (summary.mismatches > 0) {
          return yield* makeZerospinError('node-recovery-caller-mismatch');
        }
        if (summary.count === 0) continue;
        if (
          summary.count !== summary.distinctCount ||
          summary.minPushIndex !== resolvedThrough + 1 ||
          summary.maxPushIndex - resolvedThrough !== summary.count
        ) {
          return yield* makeZerospinError('node-outcome-gap');
        }
        resolvedThrough = summary.maxPushIndex;
      }
      if (afterOutcomeIndex > resolvedThrough) {
        return yield* makeZerospinError('node-recovery-checkpoint-invalid');
      }
      return resolvedThrough;
    });
  }

  #filter(
    publication: IServiceExposedPublication,
    models: Readonly<Record<string, unknown>>,
    owner?: IServiceOutcomeOwner,
  ) {
    const resolution = publication.commandResolution;
    const retained =
      resolution === null
        ? undefined
        : {
            kind: 'actor' as const,
            actorName: this.props.key.actorName,
            actorVersion: this.props.key.actorVersion,
            ...resolution,
          };
    return filterServiceBrowserCommand(
      makeServiceExposedCommand(publication),
      models,
      owner,
      retained,
    );
  }

  readBrowserPage(props: {
    afterServiceIndex: number;
    throughServiceIndex: number;
    models: Readonly<Record<string, unknown>>;
    owner?: IServiceOutcomeOwner;
  }) {
    return this.readPage({
      afterIndex: props.afterServiceIndex,
      maxIndex: props.throughServiceIndex,
    }).pipe(
      Effect.map(page =>
        page.rows.map(row => this.#filter(row, props.models, props.owner)),
      ),
    );
  }

  readNodeOutcomes(props: {
    owner: IServiceOutcomeOwner;
    afterOutcomeIndex: number;
    throughServiceIndex: number;
    models: Readonly<Record<string, unknown>>;
  }) {
    return Effect.gen({ self: this }, function* () {
      const resolvedThrough = yield* this.getResolvedThrough(props);
      if (
        props.owner.nodeId === null ||
        props.afterOutcomeIndex === resolvedThrough
      ) {
        return {
          commands: [],
          resolvedThrough,
          outcomeThrough: props.afterOutcomeIndex,
        };
      }
      const captured = this.#capture();
      const local = readServiceActorPublicationPage(
        this.props.db,
        {
          afterIndex: captured.archivedThrough,
          maxIndex: props.throughServiceIndex,
          nodeId: props.owner.nodeId,
          afterPushIndex: props.afterOutcomeIndex,
        },
        captured.head.serviceIndex,
      ).rows;
      let rows: readonly IServiceExposedPublication[] = [];
      const maximum = Math.min(
        props.throughServiceIndex,
        captured.archivedThrough,
      );
      for (const entry of captured.ranges) {
        if (entry.firstServiceIndex > maximum) break;
        const range = this.#range(entry.firstServiceIndex, captured.ranges);
        const archive = yield* this.#archive(range.firstServiceIndex);
        const page = yield* Effect.promise(() =>
          archive.getPage({
            afterIndex: range.firstServiceIndex - 1,
            maxIndex: Math.min(maximum, range.lastServiceIndex),
            nodeId: props.owner.nodeId!,
            afterPushIndex: props.afterOutcomeIndex,
          }),
        ).pipe(Effect.flatMap(readRpcEnvelope));
        if (page.rows.length > 0) {
          rows = page.rows;
          break;
        }
      }
      if (rows.length === 0) rows = local;
      if (rows.length === 0) {
        return yield* makeZerospinError('node-outcome-gap');
      }
      const commands = rows.map((row, index) => {
        const resolution = row.commandResolution;
        if (
          resolution === null ||
          resolution.nodeId !== props.owner.nodeId ||
          resolution.pushIndex !== props.afterOutcomeIndex + index + 1 ||
          resolution.sessionName !== props.owner.sessionName ||
          !isEqual(resolution.claims, props.owner.claims)
        ) {
          throw makeZerospinError('node-recovery-caller-mismatch');
        }
        return this.#filter(row, props.models, props.owner);
      });
      return {
        commands,
        resolvedThrough,
        outcomeThrough: props.afterOutcomeIndex + commands.length,
      };
    });
  }
}
