import {
  mapParseError,
  type IErrorJson,
  type IZerospinError,
} from '@zerospin/error';
import { makeFn, type IRpcEnvelope } from '@zerospin/logger';
import type { RpcTarget } from 'cloudflare:workers';
import type * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';

import type { IWorkerRpcEncoder } from '../runWorkerInvocation/runWorkerInvocation.js';

export type IOutboxSubscriberCapability<
  NAME extends string,
  ROW,
  RECEIPT,
  E,
> = RpcTarget & {
  readonly name: NAME;
  receive(
    rows: readonly ROW[],
  ): Promise<
    IRpcEnvelope<
      RECEIPT,
      IErrorJson<E | IZerospinError<'outbox-delivery-invalid'>>
    >
  >;
};

/**
 * Nested outbox-subscriber RpcTarget. `receive` is on the prototype
 * (RPC-reachable); `name` is an instance field (local only).
 */
/*
 * Repo subscriber getters use this nested RpcTarget to receive outbox
 * pages. The owner receive Effect supplies durable commit semantics; this
 * boundary supplies RPC outcome encoding.
 *
 * 1. Capture the receiver policy.
 * 2. Create the nested subscriber capability.
 * 3. Apply rows and encode the acknowledgement.
 * 4. Return the bound subscriber.
 */
export const makeOutboxSubscriber = <
  NAME extends string,
  ROW,
  RECEIPT,
  E,
  R = never,
>(props: {
  RpcTarget: typeof RpcTarget;
  managedRuntime: ManagedRuntime.ManagedRuntime<NoInfer<R>, unknown>;
  encodeRpcOutcome: IWorkerRpcEncoder;
  name: NAME;
  receive: (rows: readonly ROW[]) => Effect.Effect<RECEIPT, E, R>;
}): IOutboxSubscriberCapability<NAME, ROW, RECEIPT, E> => {
  // 1 — bind the owner name and receive Effect
  const { name, receive, RpcTarget, managedRuntime, encodeRpcOutcome } = props;
  // 2 — place receive on the RpcTarget prototype
  class OutboxSubscriber extends RpcTarget {
    name: NAME;

    constructor() {
      super();
      this.name = name;
    }

    async receive(rows: readonly ROW[]) {
      return managedRuntime.runPromise(
        // 3 — encode the durable owner receive outcome
        makeFn('OutboxSubscriber.receive')(function* () {
          yield* Schema.decodeUnknownEffect(Schema.Array(Schema.Unknown))(
            rows,
          ).pipe(
            mapParseError({
              code: 'outbox-delivery-invalid',
              prefix: 'Invalid outbox delivery',
            }),
          );
          return yield* receive(rows);
        })().pipe(encodeRpcOutcome),
      );
    }
  }

  // 4 — retain the same receiver policy for subsequent calls
  return new OutboxSubscriber();
};
