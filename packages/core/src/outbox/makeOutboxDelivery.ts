import {
  ensureZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
  type IZerospinError,
} from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Pull from 'effect/Pull';
import * as Schedule from 'effect/Schedule';
import * as Semaphore from 'effect/Semaphore';

import { defaultRetrySchedule } from '../utils/defaultRetrySchedule.js';
import { readRpcEnvelope } from '../utils/readRpcEnvelope.js';

import type { IOutboxQueue } from './IOutboxQueue.js';
import type { IOutboxSubscriber } from './IOutboxSubscriber.js';

/** A local marker cannot be supplied by a receiver's encoded public failure. */
class RetryableTransportFailure {
  constructor(
    readonly failure: IZerospinError<'outbox-delivery-unavailable'>,
  ) {}
}

export type IOutboxDeliveryFailure<
  PREPARE_ERROR,
  SUBSCRIBER_ERROR,
  RECEIVE_ERROR,
  ACKNOWLEDGE_ERROR,
  COMPLETION_ERROR,
  ACTIVITY_ERROR = never,
> =
  | PREPARE_ERROR
  | SUBSCRIBER_ERROR
  | RECEIVE_ERROR
  | ACKNOWLEDGE_ERROR
  | COMPLETION_ERROR
  | ACTIVITY_ERROR
  | IAnyError;

type IOutboxDeliveryProps<
  NAME extends string,
  STORED,
  ROW,
  RECEIPT,
  PREPARE_ERROR = never,
  SUBSCRIBER_ERROR = never,
  RECEIVE_ERROR = never,
  ACKNOWLEDGE_ERROR = never,
  COMPLETION_ERROR = never,
  DIAGNOSTIC_ERROR = never,
  R = never,
  ACTIVITY_ERROR = never,
> = {
  name: NAME;
  readPage(throughIndex?: number): readonly { row: STORED; index: number }[];
  hasPending(): boolean;
  /** Hosts with explicit connectivity state can refuse transient transport retries. */
  retryTransport?(): boolean;
  prepare(
    rows: readonly STORED[],
  ): Effect.Effect<readonly ROW[], PREPARE_ERROR, R>;
  subscriber(
    rows: readonly NoInfer<ROW>[],
  ): Effect.Effect<
    IOutboxSubscriber<IOutboxQueue<NAME, ROW, RECEIPT>, RECEIVE_ERROR>,
    SUBSCRIBER_ERROR,
    R
  >;
  release?(
    subscriber: IOutboxSubscriber<
      IOutboxQueue<NAME, ROW, RECEIPT>,
      RECEIVE_ERROR
    >,
  ): void;
  acknowledge(
    page: readonly { row: STORED; index: number }[],
    receipt: RECEIPT,
  ): Effect.Effect<void, ACKNOWLEDGE_ERROR, R>;
  afterAcknowledge?(): Effect.Effect<void, COMPLETION_ERROR, R>;
  recordFailure?(
    page: readonly { row: STORED; index: number }[],
    failure: IOutboxDeliveryFailure<
      PREPARE_ERROR,
      SUBSCRIBER_ERROR,
      RECEIVE_ERROR,
      ACKNOWLEDGE_ERROR,
      COMPLETION_ERROR,
      ACTIVITY_ERROR
    >,
  ): Effect.Effect<void, DIAGNOSTIC_ERROR, R>;
};

/** An activity refusal exists only when the caller supplies its activity guard. */
export function makeOutboxDelivery<
  NAME extends string,
  STORED,
  ROW,
  RECEIPT,
  PREPARE_ERROR = never,
  SUBSCRIBER_ERROR = never,
  RECEIVE_ERROR = never,
  ACKNOWLEDGE_ERROR = never,
  COMPLETION_ERROR = never,
  DIAGNOSTIC_ERROR = never,
  R = never,
>(
  props: IOutboxDeliveryProps<
    NAME,
    STORED,
    ROW,
    RECEIPT,
    PREPARE_ERROR,
    SUBSCRIBER_ERROR,
    RECEIVE_ERROR,
    ACKNOWLEDGE_ERROR,
    COMPLETION_ERROR,
    DIAGNOSTIC_ERROR,
    R
  > & { isActive?: never },
): IOutboxQueue<
  NAME,
  ROW,
  RECEIPT,
  | IOutboxDeliveryFailure<
      PREPARE_ERROR,
      SUBSCRIBER_ERROR,
      RECEIVE_ERROR,
      ACKNOWLEDGE_ERROR,
      COMPLETION_ERROR
    >
  | DIAGNOSTIC_ERROR,
  R
>;
export function makeOutboxDelivery<
  NAME extends string,
  STORED,
  ROW,
  RECEIPT,
  PREPARE_ERROR = never,
  SUBSCRIBER_ERROR = never,
  RECEIVE_ERROR = never,
  ACKNOWLEDGE_ERROR = never,
  COMPLETION_ERROR = never,
  DIAGNOSTIC_ERROR = never,
  R = never,
>(
  props: IOutboxDeliveryProps<
    NAME,
    STORED,
    ROW,
    RECEIPT,
    PREPARE_ERROR,
    SUBSCRIBER_ERROR,
    RECEIVE_ERROR,
    ACKNOWLEDGE_ERROR,
    COMPLETION_ERROR,
    DIAGNOSTIC_ERROR,
    R,
    IZerospinError<'outbox-source-inactive'>
  > & { isActive(): boolean },
): IOutboxQueue<
  NAME,
  ROW,
  RECEIPT,
  | IOutboxDeliveryFailure<
      PREPARE_ERROR,
      SUBSCRIBER_ERROR,
      RECEIVE_ERROR,
      ACKNOWLEDGE_ERROR,
      COMPLETION_ERROR,
      IZerospinError<'outbox-source-inactive'>
    >
  | DIAGNOSTIC_ERROR,
  R
>;
export function makeOutboxDelivery<
  NAME extends string,
  STORED,
  ROW,
  RECEIPT,
  PREPARE_ERROR = never,
  SUBSCRIBER_ERROR = never,
  RECEIVE_ERROR = never,
  ACKNOWLEDGE_ERROR = never,
  COMPLETION_ERROR = never,
  DIAGNOSTIC_ERROR = never,
  R = never,
>(
  props: IOutboxDeliveryProps<
    NAME,
    STORED,
    ROW,
    RECEIPT,
    PREPARE_ERROR,
    SUBSCRIBER_ERROR,
    RECEIVE_ERROR,
    ACKNOWLEDGE_ERROR,
    COMPLETION_ERROR,
    DIAGNOSTIC_ERROR,
    R,
    IZerospinError<'outbox-source-inactive'>
  > & { isActive?(): boolean },
): IOutboxQueue<
  NAME,
  ROW,
  RECEIPT,
  | IOutboxDeliveryFailure<
      PREPARE_ERROR,
      SUBSCRIBER_ERROR,
      RECEIVE_ERROR,
      ACKNOWLEDGE_ERROR,
      COMPLETION_ERROR,
      IZerospinError<'outbox-source-inactive'>
    >
  | DIAGNOSTIC_ERROR,
  R
> {
  const isActive = props.isActive?.bind(props);
  const getSubscriber = props.subscriber.bind(props);
  const retryTransport = props.retryTransport?.bind(props);
  const releaseSubscriber = props.release?.bind(props);
  const prepare = props.prepare.bind(props);
  const acknowledge = props.acknowledge.bind(props);
  const afterAcknowledge = props.afterAcknowledge?.bind(props);
  const recordFailure = props.recordFailure?.bind(props);
  const readPage = props.readPage.bind(props);
  const { name, hasPending } = props;
  const semaphore = Semaphore.makeUnsafe(1);
  const check = () =>
    isActive?.() === false
      ? Effect.fail(makeZerospinError('outbox-source-inactive'))
      : Effect.void;
  const receiveOutboxTransport = Effect.fn(function* (rows: readonly ROW[]) {
    const retry = yield* Schedule.toStepWithSleep(defaultRetrySchedule);
    for (;;) {
      const attempt = yield* Effect.exit(
        Effect.uninterruptibleMask(restore =>
          Effect.acquireUseRelease(
            restore(
              Effect.gen(function* () {
                yield* check();
                return yield* getSubscriber(rows);
              }),
            ),
            subscriber =>
              restore(
                Effect.tryPromise({
                  try: () => subscriber.receive(rows),
                  catch: cause => {
                    if (
                      retryTransport?.() === false ||
                      !(cause instanceof Error) ||
                      !('retryable' in cause) ||
                      cause.retryable !== true ||
                      ('overloaded' in cause && cause.overloaded === true)
                    ) {
                      throw cause;
                    }
                    return new RetryableTransportFailure(
                      makeZerospinError({
                        code: 'outbox-delivery-unavailable',
                        cause: prettyUnknownFailure(cause),
                      }),
                    );
                  },
                }),
              ),
            subscriber => Effect.sync(() => releaseSubscriber?.(subscriber)),
          ),
        ),
      );
      if (Exit.isSuccess(attempt)) return attempt.value;
      const reason = attempt.cause.reasons[0];
      if (
        attempt.cause.reasons.length !== 1 ||
        reason === undefined ||
        !Cause.isFailReason(reason) ||
        !(reason.error instanceof RetryableTransportFailure)
      ) {
        return yield* Effect.failCause(
          Cause.map(
            attempt.cause,
            (
              error:
                | SUBSCRIBER_ERROR
                | IZerospinError<'outbox-source-inactive'>
                | RetryableTransportFailure,
            ) =>
              error instanceof RetryableTransportFailure
                ? error.failure
                : error,
          ),
        );
      }
      const failure = reason.error.failure;
      yield* retry(failure).pipe(Pull.catchDone(() => Effect.fail(failure)));
    }
  });
  const deliverOutboxPage = Effect.fn(function* (
    page: readonly { row: STORED; index: number }[],
  ) {
    const rows = yield* prepare(page.map(entry => entry.row));
    const envelope = yield* receiveOutboxTransport(rows);
    const receipt = yield* readRpcEnvelope(envelope);
    yield* check();
    yield* acknowledge(page, receipt);
    yield* afterAcknowledge?.() ?? Effect.void;
  });
  const finishOutboxPageDelivery = Effect.fn(function* (
    page: readonly { row: STORED; index: number }[],
    delivered: Exit.Exit<
      void,
      Effect.Error<ReturnType<typeof deliverOutboxPage>>
    >,
  ) {
    if (Exit.isSuccess(delivered)) return;
    const reason = delivered.cause.reasons[0];
    if (
      delivered.cause.reasons.length === 1 &&
      reason !== undefined &&
      Cause.isFailReason(reason) &&
      isActive?.() !== false &&
      recordFailure !== undefined
    ) {
      yield* recordFailure(page, reason.error);
    }
    return yield* Effect.failCause(delivered.cause);
  });
  class OutboxDelivery {
    readonly name = name;
    declare readonly _outboxTypes?: { row: ROW; receipt: RECEIPT };
    readonly hasPending = () =>
      Effect.try({
        try: hasPending,
        catch: error =>
          ensureZerospinError({ code: 'outbox-read-failed', error }),
      });
    readonly drain = (throughIndex?: number) =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          while (true) {
            yield* check();
            const page = yield* Effect.try({
              try: () => readPage(throughIndex),
              catch: error =>
                ensureZerospinError({ code: 'outbox-read-failed', error }),
            });
            if (page.length === 0) return;
            const delivered = yield* Effect.exit(deliverOutboxPage(page));
            yield* finishOutboxPageDelivery(page, delivered);
          }
        }),
      );
  }
  return new OutboxDelivery();
}
