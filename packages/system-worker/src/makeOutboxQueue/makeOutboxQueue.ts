import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import type { IOutboxQueue } from '@zerospin/core/outbox/IOutboxQueue';
import type { IOutboxSubscriber } from '@zerospin/core/outbox/IOutboxSubscriber';
import {
  makeOutboxDelivery,
  type IOutboxDeliveryFailure,
} from '@zerospin/core/outbox/makeOutboxDelivery';
import {
  encodeError,
  ensureZerospinError,
  PublicFailureSchema,
  type IAnyError,
} from '@zerospin/error';
import type { RpcTarget } from 'cloudflare:workers';
import {
  and,
  asc,
  getTableColumns,
  inArray,
  isNotNull,
  lte,
  type InferSelectModel,
  type SQL,
} from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import * as References from 'effect/References';
import * as Schema from 'effect/Schema';
import type * as Scope from 'effect/Scope';

import type { IRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import type { IWorkerInvocationRunner } from '../runWorkerInvocation/runWorkerInvocation.js';

export type IOutboxQueueRuntime<R = never, INITIALIZATION_ERROR = unknown> = {
  RpcTarget: typeof RpcTarget;
  managedRuntime: ManagedRuntime.ManagedRuntime<
    NoInfer<R>,
    INITIALIZATION_ERROR
  >;
  runInvocation: IWorkerInvocationRunner;
  background?: (promise: Promise<unknown>) => void;
};

export type IWorkerOutboxQueue<
  NAME extends string,
  ROW,
  RECEIPT,
  E,
  R = never,
> = RpcTarget &
  IOutboxQueue<NAME, ROW, RECEIPT, E, R> & {
    /** Arm recovery and start queue-owned delivery without awaiting acknowledgement. */
    readonly wake: () => Effect.Effect<void>;
    /** Hold durable recovery across pending-row production. */
    readonly producerLease: Effect.Effect<void, never, Scope.Scope>;
  };

/** Registers lazy recovery; wake schedules delivery and drain awaits acknowledgement. */
export const makeOutboxQueue = <
  NAME extends string,
  INDEX extends string,
  TABLE extends SQLiteTable &
    Record<INDEX, AnySQLiteColumn<{ data: number; notNull: boolean }>>,
  ROW,
  RECEIPT,
  PREPARE_ERROR = never,
  SUBSCRIBER_ERROR = never,
  RECEIVE_ERROR = never,
  COMPLETION_ERROR = never,
  R = never,
  INITIALIZATION_ERROR = unknown,
>(
  props: IOutboxQueueRuntime<Exclude<R, never>, INITIALIZATION_ERROR> & {
    name: NAME;
    pageSize?: number;
    where?: SQL;
    db: IDb;
    outboxTable: TABLE;
    indexColumnName: INDEX;
    recoveryRegistry: IRecoveryRegistry;
    /** Complete acknowledgement side effects before releasing delivery recovery. */
    afterAcknowledge?(): Effect.Effect<void, COMPLETION_ERROR, R>;
    subscriber(
      rows: readonly ROW[],
    ): Effect.Effect<
      IOutboxSubscriber<IOutboxQueue<NAME, ROW, RECEIPT>, RECEIVE_ERROR>,
      SUBSCRIBER_ERROR,
      R
    >;
  } & (
      | {
          storage?: undefined;
          prepare(
            rows: readonly InferSelectModel<TABLE>[],
          ): Effect.Effect<readonly ROW[], PREPARE_ERROR, R>;
          acknowledge?(
            tx: ITx,
            rows: readonly InferSelectModel<TABLE>[],
            receipt: RECEIPT,
          ): void;
        }
      | {
          storage: {
            hasPending(): boolean;
            readPage(
              throughIndex?: number,
            ): readonly { row: ROW; index: number }[];
            recordFailure?(indices: readonly number[], failure: string): void;
            acknowledge(indices: readonly number[], receipt: RECEIPT): void;
          };
          prepare?: never;
          acknowledge?: never;
        }
    ),
): IWorkerOutboxQueue<
  NAME,
  ROW,
  RECEIPT,
  IOutboxDeliveryFailure<
    PREPARE_ERROR,
    SUBSCRIBER_ERROR,
    RECEIVE_ERROR,
    IAnyError,
    COMPLETION_ERROR
  >,
  R
> => {
  const afterAcknowledge = props.afterAcknowledge?.bind(props);
  const acknowledge = props.acknowledge?.bind(props);
  const {
    name,
    RpcTarget,
    managedRuntime,
    runInvocation,
    background,
    db,
    outboxTable,
    recoveryRegistry,
    indexColumnName,
    pageSize = 64,
    where,
    subscriber,
    storage: suppliedStorage,
    prepare,
  } = props;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error('Invalid outbox page size');
  }
  const indexColumn = outboxTable[indexColumnName];
  let activeProducers = 0;
  let producerRevision = 0;
  const pageWhere = (indices: readonly number[]) =>
    and(where, inArray(indexColumn, [...indices]));
  const shared = {
    name,
    subscriber,
    afterAcknowledge: () => afterAcknowledge?.() ?? Effect.void,
    release: (
      subscriber: IOutboxSubscriber<
        IOutboxQueue<NAME, ROW, RECEIPT>,
        RECEIVE_ERROR
      >,
    ) => {
      if (Symbol.dispose in subscriber) {
        const dispose = subscriber[Symbol.dispose];
        if (typeof dispose === 'function') {
          dispose.call(subscriber);
        }
      }
    },
  };
  const recordFailure = (
    write: (indices: readonly number[], encoded: string) => void,
    indices: readonly number[],
    failure: unknown,
  ) =>
    Effect.gen(function* () {
      const publicFailure =
        typeof failure === 'object' &&
        failure !== null &&
        (Object.getPrototypeOf(failure) === Object.prototype ||
          Object.getPrototypeOf(failure) === null) &&
        Schema.is(PublicFailureSchema)(failure)
          ? failure
          : yield* encodeError(failure);
      const encoded = Schema.encodeSync(
        Schema.fromJsonString(PublicFailureSchema),
      )(publicFailure);
      yield* Effect.try({
        try: () => write(indices, encoded),
        catch: error =>
          ensureZerospinError({
            code: 'outbox-diagnostic-write-failed',
            error,
          }),
      });
    });
  const delivery = (() => {
    if (suppliedStorage === undefined) {
      return makeOutboxDelivery({
        ...shared,
        readPage: (throughIndex?: number) =>
          db
            .select({ row: getTableColumns(outboxTable), index: indexColumn })
            .from(outboxTable)
            .where(
              and(
                where,
                isNotNull(indexColumn),
                throughIndex === undefined
                  ? undefined
                  : lte(indexColumn, throughIndex),
              ),
            )
            .orderBy(asc(indexColumn))
            .limit(pageSize)
            .all(),
        hasPending: () =>
          db
            .select({ index: indexColumn })
            .from(outboxTable)
            .where(and(where, isNotNull(indexColumn)))
            .limit(1)
            .get() !== undefined,
        prepare,
        acknowledge: (page, receipt: RECEIPT) =>
          Effect.try({
            try: () => {
              db.transaction(tx => {
                tx.delete(outboxTable)
                  .where(pageWhere(page.map(entry => entry.index)))
                  .run();
                acknowledge?.(
                  tx,
                  page.map(entry => entry.row),
                  receipt,
                );
              });
            },
            catch: error =>
              ensureZerospinError({
                code: 'outbox-acknowledgement-failed',
                error,
              }),
          }),
      });
    }
    const storage = suppliedStorage;
    const writeFailure = storage.recordFailure?.bind(storage);
    return makeOutboxDelivery({
      ...shared,
      readPage: (throughIndex?: number) => storage.readPage(throughIndex),
      hasPending: () => storage.hasPending(),
      prepare: rows => Effect.succeed(rows),
      ...(writeFailure === undefined
        ? {}
        : {
            recordFailure: (
              page: readonly { row: ROW; index: number }[],
              failure: unknown,
            ) =>
              recordFailure(
                writeFailure,
                page.map(entry => entry.index),
                failure,
              ),
          }),
      acknowledge: (page, receipt: RECEIPT) =>
        Effect.try({
          try: () =>
            storage.acknowledge(
              page.map(entry => entry.index),
              receipt,
            ),
          catch: error =>
            ensureZerospinError({
              code: 'outbox-acknowledgement-failed',
              error,
            }),
        }),
    });
  })();
  class OutboxQueue extends RpcTarget {
    readonly name = name;
    declare readonly _outboxTypes?: { row: ROW; receipt: RECEIPT };
    readonly producerLease: Effect.Effect<void, never, Scope.Scope> =
      Effect.acquireRelease(
        Effect.gen(function* () {
          activeProducers += 1;
          yield* recoveryRegistry.hold(name).pipe(
            Effect.onExit(exit =>
              Exit.isFailure(exit)
                ? Effect.sync(() => {
                    producerRevision += 1;
                    activeProducers -= 1;
                  })
                : Effect.void,
            ),
          );
        }),
        () =>
          Effect.sync(() => {
            producerRevision += 1;
            activeProducers -= 1;
          }),
      );

    constructor() {
      super();
      recoveryRegistry.register(
        name,
        // Configured Repo recovery dispatch already owns the invocation's capture and runtime.
        this.drain(),
      );
    }

    readonly wake = Effect.fn(`${name}.wake`)(() =>
      Effect.gen({ self: this }, function* () {
        yield* recoveryRegistry.hold(name);
        const program = this.drain();
        const delivery = managedRuntime.runPromise(runInvocation(program));
        void delivery.catch(() => undefined);
        try {
          background?.(delivery);
        } catch {
          // A host retention failure cannot replace the scheduled delivery.
        }
      }),
    );
    readonly hasPending = delivery.hasPending;
    readonly drain = Effect.fn(`${name}.drain`)((throughIndex?: number) =>
      Effect.gen(function* () {
        const revision = producerRevision;
        yield* recoveryRegistry.hold(name);
        yield* delivery.drain(throughIndex);
        if (!(yield* delivery.hasPending())) {
          // A prior receipt may have committed before its completion hook failed.
          yield* afterAcknowledge?.() ?? Effect.void;
          yield* Effect.suspend(() =>
            activeProducers === 0 && producerRevision === revision
              ? recoveryRegistry.release(name)
              : Effect.void,
          ).pipe(Effect.provideService(References.PreventSchedulerYield, true));
        }
      }),
    );
  }
  const queue = new OutboxQueue();
  return queue;
};
