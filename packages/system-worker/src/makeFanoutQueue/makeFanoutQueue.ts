import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  type IErrorJson,
  type IZerospinError,
} from '@zerospin/error';
import { makeFn, type IRpcEnvelope } from '@zerospin/logger';
import type { RpcTarget } from 'cloudflare:workers';
import type { SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import * as References from 'effect/References';
import * as Schema from 'effect/Schema';
import type * as Scope from 'effect/Scope';
import * as Semaphore from 'effect/Semaphore';

import type { IRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import type {
  IWorkerInvocationRunner,
  IWorkerRpcEncoder,
} from '../runWorkerInvocation/runWorkerInvocation.js';

import {
  makeFanoutQueueStorage,
  type IFanoutIdentity,
  type IFanoutIdentityColumns,
  type IFanoutSubscriber,
  type IFanoutSubscriberTable,
} from './makeFanoutQueueStorage.js';
import { runFanoutDeliveries } from './runFanoutDeliveries.js';

export type IFanoutDelivery<ROW> = {
  rows: readonly ROW[];
  lastIndex: number;
};

export type IFanoutEnrollmentError = IZerospinError<
  | 'fanout-subscriber-owner-mismatch'
  | 'repo-key-encode-failed'
  | 'aggregate-version-unsupported'
  | 'service-version-unsupported'
  | 'actor-version-unsupported'
  | 'agent-version-unsupported'
  | 'fanout-subscriber-unavailable'
  | 'fanout-subscriber-enroll-failed'
  | 'fanout-subscriber-index-invalid'
>;

export type IFanoutQueue<
  NAME extends string = string,
  KEY extends Readonly<Record<string, string | number | undefined>> = Readonly<
    Record<string, string | number | undefined>
  >,
  ROW = unknown,
  PAGE_ERROR = never,
> = RpcTarget & {
  readonly name: NAME;
  /** Type-only carriers; never assigned at runtime. */
  readonly _fanoutRow?: ROW;
  readonly _subscriberKey?: KEY;
  /** Arm recovery and start queue-owned delivery without awaiting recipients. */
  readonly wake: () => Effect.Effect<void>;
  /** Lazily start an owned drain and await its captured tip without owning its cancellation. */
  readonly drain: () => Effect.Effect<void, unknown>;
  /** Hold a local producer across a commit shared by several queues. */
  readonly producerLease: Effect.Effect<void, never, Scope.Scope>;
  getPage(props: {
    afterIndex: number;
    maxIndex?: number;
  }): Promise<
    IRpcEnvelope<
      IFanoutDelivery<ROW>,
      IErrorJson<PAGE_ERROR | IZerospinError<'fanout-page-invalid'>>
    >
  >;
  subscribe(
    props: KEY & { currentIndex: number },
  ): Promise<
    IRpcEnvelope<void, IErrorJson<IFanoutEnrollmentError | PAGE_ERROR>>
  >;
};

export type IFanoutQueueRow<
  QUEUE extends IFanoutQueue<
    string,
    Readonly<Record<string, string | number | undefined>>,
    unknown
  >,
> = NonNullable<QUEUE['_fanoutRow']>;

/**
 * Owner names the queue getter and requires its receiver capability. Subscribe props are typed on the queue
 * instance (`MatchParams` + `currentIndex`), not on this marker.
 */
export type IFanoutRepo<
  FANOUT_QUEUE_NAME extends string,
  _SUBSCRIBER extends IFanoutSubscriberRepo<{
    readonly name: FANOUT_QUEUE_NAME;
  }>,
> = {
  readonly [K in FANOUT_QUEUE_NAME]: RpcTarget;
};

export type IFanoutSubscriberRepo<QUEUE extends { readonly name: string }> = {
  readonly [K in `${QUEUE['name']}Subscriber`]: (
    sourceKey: never,
  ) => RpcTarget & {
    receive(
      delivery: IFanoutDelivery<unknown>,
    ): Promise<IRpcEnvelope<void, unknown>>;
  };
};

type IFanoutQueueProps<
  NAME extends string,
  KEY extends Readonly<Record<string, string | number | undefined>>,
  SOURCE_KEY extends Readonly<Record<string, string | number | undefined>>,
  TABLE extends IFanoutSubscriberTable,
  COLUMNS extends IFanoutIdentityColumns,
  ROW,
  REPO_ERROR,
  RECEIVE_ERROR,
  R,
  INITIALIZATION_ERROR,
  PAGE_ERROR,
> = {
  RpcTarget: typeof RpcTarget;
  managedRuntime: ManagedRuntime.ManagedRuntime<
    NoInfer<R>,
    INITIALIZATION_ERROR
  >;
  runInvocation: IWorkerInvocationRunner;
  encodeRpcOutcome: IWorkerRpcEncoder;
  background?: (promise: Promise<unknown>) => void;
  name: NAME;
  recoveryRegistry: IRecoveryRegistry;
  db: IDb;
  subscriberTable: TABLE;
  subscriberIdentityColumns: COLUMNS;
  subscriberIndexColumn: AnySQLiteColumn<{ data: number | null }>;
  /** Owner-enrolled subscribers receive only positions after this fixed prefix. */
  subscriberPrefixColumn?: AnySQLiteColumn<{ data: number; notNull: true }>;
  subscriberIdentityFromKey(
    key: KEY,
  ): Effect.Effect<
    IFanoutIdentity<COLUMNS>,
    IZerospinError<
      | 'repo-key-encode-failed'
      | 'aggregate-version-unsupported'
      | 'service-version-unsupported'
      | 'actor-version-unsupported'
      | 'agent-version-unsupported'
    >
  >;
  subscriberKeyFromIdentity(
    identity: IFanoutIdentity<COLUMNS>,
  ): Effect.Effect<
    KEY,
    IZerospinError<
      | 'repo-key-decode-failed'
      | 'aggregate-version-unsupported'
      | 'service-version-unsupported'
      | 'actor-version-unsupported'
      | 'agent-version-unsupported'
    >
  >;
  availableSubscriberIdentities?: readonly IFanoutIdentity<COLUMNS>[];
  /** Commit source-owned acknowledgement work with the subscriber cursor. */
  acknowledge?(
    tx: ITx,
    identity: IFanoutIdentity<COLUMNS>,
    deliveredThrough: number,
  ): void;
  readPage(page: {
    afterIndex: number;
    maxIndex?: number;
  }):
    | { rows: readonly { row: ROW; index: number }[]; lastIndex: number }
    | Effect.Effect<
        { rows: readonly { row: ROW; index: number }[]; lastIndex: number },
        PAGE_ERROR,
        R
      >;
  concurrency: number;
  subscribersWhere?: readonly (SQL | undefined)[];
  subscriberKeySchema: Schema.Codec<NoInfer<KEY>>;
  key: SOURCE_KEY;
  getRepo(props: { key: NoInfer<KEY> }): Effect.Effect<
    {
      readonly [K in `${NoInfer<NAME>}Subscriber`]: (
        sourceKey: NoInfer<SOURCE_KEY>,
      ) => PromiseLike<
        Disposable & {
          receive(
            delivery: IFanoutDelivery<NoInfer<ROW>>,
          ): PromiseLike<IRpcEnvelope<void, RECEIVE_ERROR>>;
        }
      >;
    },
    REPO_ERROR,
    R
  >;
};

/** Durable subscriber state is separate from immutable owner history and scoped concurrent delivery. */
export function makeFanoutQueue<
  NAME extends string,
  KEY extends Readonly<Record<string, string | number | undefined>>,
  SOURCE_KEY extends Readonly<Record<string, string | number | undefined>>,
  TABLE extends IFanoutSubscriberTable,
  COLUMNS extends IFanoutIdentityColumns,
  ROW,
  REPO_ERROR,
  RECEIVE_ERROR,
  R = never,
  INITIALIZATION_ERROR = unknown,
  PAGE_ERROR = never,
>(
  props: IFanoutQueueProps<
    NAME,
    KEY,
    SOURCE_KEY,
    TABLE,
    COLUMNS,
    ROW,
    REPO_ERROR,
    RECEIVE_ERROR,
    R,
    INITIALIZATION_ERROR,
    PAGE_ERROR
  >,
): IFanoutQueue<NAME, KEY, ROW, PAGE_ERROR> {
  const readPage = props.readPage.bind(props);
  const {
    name,
    recoveryRegistry,
    getRepo,
    concurrency,
    subscriberKeyFromIdentity,
    subscriberKeySchema,
    key,
    RpcTarget,
    managedRuntime,
    runInvocation,
    encodeRpcOutcome,
    background,
    db,
    subscriberTable,
    subscriberIdentityColumns,
    subscriberIndexColumn,
    subscriberPrefixColumn,
    subscriberIdentityFromKey,
    availableSubscriberIdentities,
    subscribersWhere,
    acknowledge,
  } = props;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw makeZerospinError({
      code: 'fanout-concurrency-invalid',
      message: 'Fanout concurrency must be a positive safe integer',
    });
  }
  const storage = makeFanoutQueueStorage({
    db,
    key,
    subscriberTable,
    subscriberIdentityColumns,
    subscriberIndexColumn,
    subscriberIdentityFromKey,
    ...(subscriberPrefixColumn === undefined ? {} : { subscriberPrefixColumn }),
    ...(availableSubscriberIdentities === undefined
      ? {}
      : { availableSubscriberIdentities }),
    ...(subscribersWhere === undefined ? {} : { subscribersWhere }),
    ...(acknowledge === undefined ? {} : { acknowledge }),
  });
  const { enroll } = storage;
  const getSuffix = (page: { afterIndex: number; maxIndex?: number }) =>
    Effect.suspend(() => {
      const result = readPage(page);
      return Effect.isEffect(result) ? result : Effect.succeed(result);
    });
  const semaphore = Semaphore.makeUnsafe(1);
  let activeProducers = 0;
  let producerRevision = 0;
  const subscriberProperty: `${NAME}Subscriber` = `${name}Subscriber`;
  const deliverFanoutSubscriber = Effect.fn(function* (
    subscriber: IFanoutSubscriber<IFanoutIdentity<COLUMNS>>,
    boundary: number,
  ): Effect.fn.Return<void, unknown, R> {
    const page = yield* getSuffix({
      afterIndex: subscriber.currentIndex,
      maxIndex: boundary,
    });
    const rows = page.rows.filter(entry => entry.index <= boundary);
    const deliveredThrough = rows.at(-1)?.index;
    if (deliveredThrough === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'fanout-delivery-history-missing',
          message: `Fanout history is unavailable after ${subscriber.currentIndex} through ${boundary}`,
        }),
      );
    }
    const subscriberKey = yield* subscriberKeyFromIdentity(subscriber.identity);
    const repo = yield* getRepo({ key: subscriberKey });
    yield* Effect.acquireUseRelease(
      Effect.promise(() => repo[subscriberProperty](key)),
      receiver =>
        Effect.promise(() =>
          receiver.receive({
            rows: rows.map(entry => entry.row),
            lastIndex: page.lastIndex,
          }),
        ).pipe(Effect.flatMap(readRpcEnvelope)),
      receiver => Effect.sync(() => receiver[Symbol.dispose]()),
    );
    yield* storage.acknowledge(subscriber.identity, deliveredThrough);
  });

  class FanoutQueue extends RpcTarget {
    name: NAME;
    declare readonly _fanoutRow?: ROW;
    declare readonly _subscriberKey?: KEY;
    readonly wake: IFanoutQueue['wake'];
    readonly drain: IFanoutQueue['drain'];
    readonly producerLease: IFanoutQueue['producerLease'] =
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
      this.name = name;
      const drain = Effect.fn(`${name}.drain`)(function* () {
        return yield* Effect.gen(function* () {
          const revision = producerRevision;
          yield* recoveryRegistry.hold(name);
          const failure = yield* runFanoutDeliveries({
            concurrency,
            readTip: () =>
              getSuffix({ afterIndex: 0, maxIndex: 0 }).pipe(
                Effect.map(page => page.lastIndex),
              ),
            eligible: storage.eligible,
            deliver: deliverFanoutSubscriber,
          });
          if (failure !== undefined) return yield* Effect.failCause(failure);
          yield* Effect.suspend(() =>
            activeProducers === 0 && producerRevision === revision
              ? recoveryRegistry.release(name)
              : recoveryRegistry.hold(name),
          ).pipe(Effect.provideService(References.PreventSchedulerYield, true));
        }).pipe(
          Effect.scoped,
          semaphore.withPermits(1),
          Effect.onExit(exit =>
            Exit.isFailure(exit) ? recoveryRegistry.hold(name) : Effect.void,
          ),
        );
      });
      recoveryRegistry.register(
        name,
        // Configured Repo recovery dispatch already owns the invocation's capture and runtime.
        drain(),
      );
      const startDrain = () => {
        const program = drain();
        const settled = managedRuntime.runPromiseExit(runInvocation(program));
        // Retain a rejecting delivery Promise while awaited Effects recover the original Cause.
        const promise = settled.then(exit =>
          Exit.isSuccess(exit)
            ? exit.value
            : Effect.runSync(Effect.failCause(exit.cause)),
        );
        void promise.catch(() => undefined);
        try {
          background?.(promise);
        } catch {
          // A host retention failure cannot replace the scheduled delivery.
        }
        return settled;
      };
      this.wake = Effect.fn(`${name}.wake`)(function* () {
        yield* recoveryRegistry.hold(name);
        startDrain();
      });
      this.drain = () =>
        Effect.promise(startDrain).pipe(
          Effect.flatMap(exit =>
            Exit.isSuccess(exit)
              ? Effect.succeed(exit.value)
              : Effect.failCause(exit.cause),
          ),
        );
    }

    async getPage(pageProps: { afterIndex: number; maxIndex?: number }) {
      return managedRuntime.runPromise(
        makeFn('FanoutQueue.getPage')(function* () {
          const { afterIndex, maxIndex } = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              afterIndex: Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
                Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
              ),
              maxIndex: Schema.optional(
                Schema.Number.check(
                  Schema.isInt(),
                  Schema.isGreaterThanOrEqualTo(0),
                  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
                ),
              ),
            }),
          )(pageProps, { onExcessProperty: 'ignore' }).pipe(
            mapParseError({
              code: 'fanout-page-invalid',
              prefix: 'Invalid fanout page request',
            }),
          );
          const suffix = yield* getSuffix({
            afterIndex,
            ...(maxIndex === undefined ? {} : { maxIndex }),
          });
          return {
            rows: suffix.rows.map(entry => entry.row),
            lastIndex: suffix.lastIndex,
          };
        })().pipe(encodeRpcOutcome),
      );
    }

    async subscribe(subscribeProps: KEY & { currentIndex: number }) {
      // Enrollment cannot wait for a drain awaiting this receiver's activation.
      const producerLease = this.producerLease;
      const wake = this.wake;
      return managedRuntime.runPromise(
        makeFn('FanoutQueue.subscribe')(function* () {
          const subscriberKey = yield* Schema.decodeUnknownEffect(
            subscriberKeySchema,
          )(subscribeProps, { onExcessProperty: 'ignore' }).pipe(
            mapParseError({
              code: 'repo-key-encode-failed',
              prefix: 'Invalid fanout subscriber identity',
            }),
          );
          const { currentIndex } = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              currentIndex: Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
                Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
              ),
            }),
          )(subscribeProps, { onExcessProperty: 'ignore' }).pipe(
            mapParseError({
              code: 'fanout-subscriber-index-invalid',
              prefix: 'Invalid fanout subscriber index',
            }),
          );
          yield* producerLease;
          yield* Effect.gen(function* () {
            const { lastIndex } = yield* getSuffix({
              afterIndex: 0,
              maxIndex: 0,
            });
            if (currentIndex > lastIndex) {
              return yield* Effect.fail(
                makeZerospinError({
                  code: 'fanout-subscriber-index-invalid',
                  message: `Fanout subscriber index ${currentIndex} exceeds the committed source tip ${lastIndex}`,
                }),
              );
            }
            yield* enroll({ ...subscriberKey, currentIndex });
          }).pipe(Effect.ensuring(wake().pipe(Effect.exit)));
        })().pipe(Effect.scoped, encodeRpcOutcome),
      );
    }
  }

  return new FanoutQueue();
}
