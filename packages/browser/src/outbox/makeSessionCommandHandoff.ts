import {
  NodeRetentionSchema,
  type INodeRetention,
} from '@zerospin/core/Node/NodeCommandCoverage';
import type { IOutboxQueue } from '@zerospin/core/outbox/IOutboxQueue';
import type { IOutboxSubscriber } from '@zerospin/core/outbox/IOutboxSubscriber';
import { makeOutboxDelivery } from '@zerospin/core/outbox/makeOutboxDelivery';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import * as Cause from 'effect/Cause';
import type * as Context from 'effect/Context';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Schema from 'effect/Schema';

import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { isBrowserOffline } from '../Node/isBrowserOffline.ts';
import { nodeRpcErrorFor } from '../Node/nodeRpcErrorFor.ts';

import type { makeOutboxSubscriber } from './makeOutboxSubscriber.ts';

type IStagedCommandReceiveFailure = Extract<
  Awaited<
    ReturnType<ReturnType<typeof makeOutboxSubscriber<unknown>>['receive']>
  >['result'],
  { _tag: 'Failure' }
>['failure'];

export type IStagedCommandAttachment<ROW> = {
  subscriber(): PromiseLike<
    IOutboxSubscriber<
      IOutboxQueue<
        'stagedCommandOutbox',
        NoInfer<ROW>,
        readonly INodeRetention[]
      >,
      IStagedCommandReceiveFailure
    >
  >;
  isCurrent(): boolean;
};

export const makeSessionCommandHandoff = <
  STORED extends {
    commandName: string;
    sessionIndex: number;
  },
  ROW extends { sessionId: string; sessionIndex: number },
  R = never,
>(props: {
  readPending(): readonly STORED[];
  prepare(row: STORED): Effect.Effect<ROW, IAnyError, R>;
  attachment(): IStagedCommandAttachment<NoInfer<ROW>> | null;
  retainCoordinates(
    receipt: readonly INodeRetention[],
  ): Effect.Effect<void, unknown, R>;
  reportFailure: ISessionFailureReporter;
  isActive(): boolean;
  context: Context.Context<R>;
  originating(row: STORED): void;
  changed(): void;
  recover?: Effect.Effect<void, never, R> | undefined;
}) => {
  const reportFailure = props.reportFailure.bind(props);
  const {
    readPending,
    prepare,
    attachment: getAttachment,
    retainCoordinates,
    isActive,
    context,
    originating,
    changed,
  } = props;
  return Effect.gen(function* () {
    const observed = new Set<number>();
    const waiters = new Map<
      number,
      Set<ReturnType<typeof Promise.withResolvers<void>>>
    >();
    let revision = 0;
    let waking = Deferred.makeUnsafe<void>();
    let disposed = false;
    let epoch = 0;
    let selectedEpoch = 0;
    let receiptCurrent = () => false;
    const active = () => !disposed && isActive();
    const refresh = () => {
      if (!active()) {
        return;
      }
      const ids = new Set(readPending().map(row => row.sessionIndex));
      for (const [id, listeners] of waiters) {
        if (ids.has(id)) {
          continue;
        }
        waiters.delete(id);
        for (const listener of listeners) {
          listener.resolve();
        }
      }
      changed();
    };
    const releaseSubscriber = (subscriber: object) => {
      if (Symbol.dispose in subscriber) {
        const dispose = subscriber[Symbol.dispose];
        if (typeof dispose === 'function') dispose.call(subscriber);
      }
    };
    const delivery = makeOutboxDelivery({
      name: 'stagedCommandOutbox',
      retryTransport: isBrowserOffline,
      isActive: active,
      hasPending: () => readPending().length > 0,
      readPage: (throughIndex?: number) => {
        selectedEpoch = epoch;
        return readPending()
          .filter(
            row =>
              throughIndex === undefined || row.sessionIndex <= throughIndex,
          )
          .slice(0, 1)
          .map(row => ({ row, index: row.sessionIndex }));
      },
      prepare: rows => Effect.forEach(rows, prepare),
      subscriber: () =>
        Effect.tryPromise({
          try: async signal => {
            const sourceEpoch = selectedEpoch;
            if (sourceEpoch !== epoch) {
              throw makeZerospinError('outbox-source-replaced');
            }
            const attachment = getAttachment();
            if (attachment === null) {
              throw makeZerospinError('node-connection-unavailable');
            }
            const acquiring = Promise.resolve(attachment.subscriber());
            try {
              const subscriber = await awaitConnectionStep(acquiring, signal);
              receiptCurrent = () =>
                active() && epoch === sourceEpoch && attachment.isCurrent();
              if (!receiptCurrent()) {
                throw makeZerospinError('outbox-source-inactive');
              }
              return subscriber;
            } catch (error) {
              void acquiring
                .then(releaseSubscriber, () => undefined)
                .catch(() => undefined);
              throw error;
            }
          },
          catch: nodeRpcErrorFor([
            'outbox-source-replaced',
            'outbox-source-inactive',
            'node-connection-unavailable',
          ]),
        }),
      release: releaseSubscriber,
      acknowledge: (page, received: readonly INodeRetention[]) =>
        Effect.gen(function* () {
          if (!receiptCurrent()) {
            return yield* makeZerospinError('outbox-source-inactive');
          }
          const receipt = Schema.decodeUnknownSync(
            Schema.Array(NodeRetentionSchema),
          )(received);
          if (
            receipt.length === 0 ||
            receipt.some(
              record =>
                !page.some(
                  entry => entry.row.sessionIndex === record.sessionIndex,
                ),
            )
          ) {
            return yield* makeZerospinError('node-retention-reply-invalid');
          }
          yield* retainCoordinates(receipt);
          const ids = new Set(readPending().map(row => row.sessionIndex));
          if (page.some(entry => ids.has(entry.row.sessionIndex))) {
            return yield* makeZerospinError(
              'node-retention-coordinates-not-recorded',
            );
          }
          refresh();
        }),
    });
    const rejectPending = (error: unknown) => {
      for (const listeners of waiters.values()) {
        for (const listener of listeners) {
          listener.reject(error);
        }
      }
      waiters.clear();
    };
    const pump = Effect.gen(function* () {
      while (!disposed) {
        const ready = waking;
        yield* Deferred.await(ready);
        if (waking === ready) waking = Deferred.makeUnsafe<void>();
        if (!active()) {
          rejectPending(makeZerospinError('outbox-source-inactive'));
          continue;
        }
        // A first view can stage commands before attachment subscription finishes.
        // Reconnection wakes this pump after the attachment becomes available.
        if (getAttachment() === null) continue;
        const started = revision;
        const exit = yield* Effect.exit(
          Effect.gen(function* () {
            yield* props.recover ?? Effect.void;
            yield* delivery.drain();
          }),
        );
        // Reset retires the entire delivery, including transport and envelope failures.
        if (!disposed && selectedEpoch !== epoch) continue;
        if (Exit.isFailure(exit)) {
          const failure = Cause.squash(exit.cause);
          const code =
            failure instanceof Error && 'code' in failure ? failure.code : null;
          const retired =
            code === 'outbox-source-inactive' ||
            code === 'outbox-source-replaced';
          const offline =
            isBrowserOffline() &&
            (code === 'node-connection-unavailable' ||
              code === 'outbox-delivery-unavailable' ||
              code === 'node-backend-timeout' ||
              code === 'node-backend-unreachable');
          if (
            Cause.hasDies(exit.cause) ||
            (active() &&
              !Cause.hasInterruptsOnly(exit.cause) &&
              !retired &&
              !offline)
          ) {
            reportFailure({ origin: 'session', error: exit.cause });
            rejectPending(failure);
            return yield* Effect.failCause(exit.cause);
          }
          rejectPending(failure);
          if (Cause.hasInterruptsOnly(exit.cause)) {
            return yield* Effect.failCause(exit.cause);
          }
        }
        if (revision !== started && active()) {
          Deferred.doneUnsafe(waking, Effect.void);
        }
      }
    });
    const fiber = yield* Effect.forkScoped(pump.pipe(Effect.provide(context)));
    const dispose = Effect.gen(function* () {
      if (!disposed) {
        disposed = true;
        epoch += 1;
        rejectPending(makeZerospinError('outbox-source-inactive'));
      }
      yield* Fiber.interrupt(fiber);
    });
    yield* Effect.addFinalizer(() => dispose);
    const observe = () => {
      if (!active()) {
        return;
      }
      for (const row of readPending()) {
        if (observed.has(row.sessionIndex)) {
          continue;
        }
        observed.add(row.sessionIndex);
        originating(row);
      }
      refresh();
      if (readPending().length === 0) return;
      wake();
    };
    const wake = () => {
      if (
        !active() ||
        (readPending().length === 0 && props.recover === undefined)
      ) {
        return;
      }
      revision += 1;
      Deferred.doneUnsafe(waking, Effect.void);
    };

    return {
      observe,
      refresh,
      wake,
      pendingCount: () => (disposed ? 0 : readPending().length),
      waitForRetention: (id: number) => {
        if (!active()) {
          return Promise.reject(makeZerospinError('outbox-source-inactive'));
        }
        if (!readPending().some(row => row.sessionIndex === id)) {
          return Promise.resolve();
        }
        const waiter = Promise.withResolvers<void>();
        const listeners = waiters.get(id) ?? new Set();
        listeners.add(waiter);
        waiters.set(id, listeners);
        return waiter.promise;
      },
      reset: () => {
        epoch += 1;
        observed.clear();
        rejectPending(makeZerospinError('outbox-source-replaced'));
      },
      dispose,
    };
  });
};
