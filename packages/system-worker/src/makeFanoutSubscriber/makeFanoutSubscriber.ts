import {
  mapParseError,
  type IErrorJson,
  type IZerospinError,
} from '@zerospin/error';
import { makeFn, type IRpcEnvelope } from '@zerospin/logger';
import type { RpcTarget } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';

import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import type { IWorkerRpcEncoder } from '../runWorkerInvocation/runWorkerInvocation.js';

import type {
  ICatchupBoundaryError,
  IFanoutSubscriberOptions,
} from './fanoutSubscriberOptions.js';
import { runFanoutCatchup } from './runFanoutCatchup.js';
import { subscribeFanout } from './subscribe.js';

export type IFanoutSubscriberCapability<
  NAME extends string,
  ROW,
  RECEIVE_ERROR,
  REPO_ERROR,
  PAGE_ERROR,
  SUBSCRIBE_ERROR,
> = RpcTarget & {
  readonly name: NAME;
  receive(
    delivery: IFanoutDelivery<ROW>,
  ): Promise<
    IRpcEnvelope<
      void,
      IErrorJson<RECEIVE_ERROR | IZerospinError<'fanout-delivery-invalid'>>
    >
  >;
  catchup(
    index?: number,
  ): Promise<
    IRpcEnvelope<
      void,
      IErrorJson<
        RECEIVE_ERROR | REPO_ERROR | PAGE_ERROR | ICatchupBoundaryError
      >
    >
  >;
  subscribe(
    index?: number,
  ): Promise<
    IRpcEnvelope<
      void,
      IErrorJson<
        | RECEIVE_ERROR
        | REPO_ERROR
        | PAGE_ERROR
        | SUBSCRIBE_ERROR
        | ICatchupBoundaryError
      >
    >
  >;
};

/**
 * One source-bound fanout capability. RPC methods live on the prototype;
 * `name` is an instance field (local only).
 */
/*
 * Repo subscriber accessors bind one source and its durable local cursor.
 * Pulled and pushed pages use the same owner receive Effect. Catch-up fixes
 * its destination from the first page; subscription then enrolls that cursor.
 *
 * 1. Bind the source, receiver, and durable cursor reader.
 * 2. Catch up through one fixed destination without retaining an owner lock.
 * 3. Apply full pages before advancing the local cursor.
 * 4. Expose receive, catchup, and subscribe on the RPC prototype.
 * 5. Enroll only after catch-up succeeds.
 */
export const makeFanoutSubscriber = <
  NAME extends string,
  SOURCE_KEY extends Readonly<Record<string, string | number | undefined>>,
  KEY extends Readonly<Record<string, string | number | undefined>>,
  ROW,
  PAGE_ERROR,
  SUBSCRIBE_ERROR,
  RECEIVE_ERROR,
  REPO_ERROR,
  R = never,
>(
  props: IFanoutSubscriberOptions<
    NAME,
    SOURCE_KEY,
    KEY,
    ROW,
    PAGE_ERROR,
    SUBSCRIBE_ERROR,
    RECEIVE_ERROR,
    REPO_ERROR,
    R
  > & {
    RpcTarget: typeof RpcTarget;
    managedRuntime: ManagedRuntime.ManagedRuntime<NoInfer<R>, unknown>;
    encodeRpcOutcome: IWorkerRpcEncoder;
  },
): IFanoutSubscriberCapability<
  NAME,
  ROW,
  RECEIVE_ERROR,
  REPO_ERROR,
  PAGE_ERROR,
  SUBSCRIBE_ERROR
> => {
  // 1 — one instance always addresses the same source queue and local cursor
  const { name, receive, RpcTarget, managedRuntime, encodeRpcOutcome } = props;

  // 4 — public methods are thin RPC boundaries over the bound owner operations
  class FanoutSubscriber extends RpcTarget {
    name: NAME;

    constructor() {
      super();
      this.name = name;
    }

    async receive(delivery: IFanoutDelivery<ROW>) {
      return managedRuntime.runPromise(
        makeFn('FanoutSubscriber.receive')(function* () {
          yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              rows: Schema.Array(Schema.Unknown),
              lastIndex: Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
                Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
              ),
            }),
          )(delivery, { onExcessProperty: 'ignore' }).pipe(
            mapParseError({
              code: 'fanout-delivery-invalid',
              prefix: 'Invalid fanout delivery',
            }),
          );
          yield* receive(delivery, 'push');
        })().pipe(encodeRpcOutcome),
      );
    }

    catchup(index?: number) {
      return managedRuntime.runPromise(
        makeFn('FanoutSubscriber.catchup')(function* () {
          const decodedIndex = yield* Schema.decodeUnknownEffect(
            Schema.UndefinedOr(
              Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
                Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
              ),
            ),
          )(index).pipe(
            mapParseError({
              code: 'fanout-catchup-index-invalid',
              prefix: 'Invalid fanout catch-up index',
            }),
          );
          yield* runFanoutCatchup(props, decodedIndex).pipe(Effect.asVoid);
        })().pipe(encodeRpcOutcome),
      );
    }

    subscribe(index?: number) {
      return managedRuntime.runPromise(
        makeFn('FanoutSubscriber.subscribe')(function* () {
          const decodedIndex = yield* Schema.decodeUnknownEffect(
            Schema.UndefinedOr(
              Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
                Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
              ),
            ),
          )(index).pipe(
            mapParseError({
              code: 'fanout-catchup-index-invalid',
              prefix: 'Invalid fanout subscription index',
            }),
          );
          yield* subscribeFanout(props, decodedIndex);
        })().pipe(encodeRpcOutcome),
      );
    }
  }

  return new FanoutSubscriber();
};
