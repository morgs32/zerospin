import { Effect } from 'effect';

/**
 * Put the standard three-attempt schedule in the Durable Object coordinator.
 * Persist domain completion and pending membership, never retry progress.
 * VersionRepo continuation outboxes use the default SQL path without diagnostics.
 * Custom storage supplies a diagnostic writer only when its owner retains one:
 * AggregateChain does, while ServiceChain omits it.
 * Fanout preserves each subscriber's acknowledged cursor without a persisted
 * failure/suspension gate; failed recipients wait for a later durable alarm.
 * Per-drain exclusions are transient and do not require manual resume.
 *
 * @bad Add `deliveryAttempts`, `nextRetryAt`, `failedAt`, or `succeededAt` columns for ordinary delivery retry bookkeeping.
 * @bad Require diagnostic persistence before a VersionRepo delivery failure can propagate.
 * @bad Treat a custom storage diagnostic as retry progress or a delivery gate.
 * @bad Decode persisted payloads or run local validation inside the retry schedule.
 */
export const drainDeliveryOutbox = Effect.fn('LedgerRepo.drainDeliveryOutbox')(
  function* (props: {
    deliveryQueue: {
      drain(props: {
        lanes: readonly {
          name: string;
          requested: boolean;
          drain(): Effect.Effect<void, Error>;
          hasPending(): Effect.Effect<boolean, Error>;
        }[];
      }): Effect.Effect<void, Error>;
      retry<A>(delivery: Effect.Effect<A, Error>): Effect.Effect<A, Error>;
    };
    outbox: {
      readFirstPending(): { id: string; payload: unknown } | undefined;
      hasPending(): boolean;
      deleteAcknowledged(id: string): void;
    };
    receiverRepo: {
      handle(payload: unknown): PromiseLike<unknown>;
    };
  }) {
    yield* props.deliveryQueue.drain({
      lanes: [
        {
          name: 'LedgerRepo.outbox',
          requested: true,
          drain: () =>
            Effect.gen(function* () {
              const pending = props.outbox.readFirstPending();
              if (pending === undefined) {
                return;
              }
              const payload = yield* decodePersistedPayload(pending.payload);
              yield* props.deliveryQueue.retry(
                Effect.promise(() => props.receiverRepo.handle(payload)).pipe(
                  Effect.flatMap(readResult),
                ),
              );
              props.outbox.deleteAcknowledged(pending.id);
            }),
          hasPending: () => Effect.sync(() => props.outbox.hasPending()),
        },
      ],
    });
  },
);

declare function decodePersistedPayload(
  payload: unknown,
): Effect.Effect<unknown, Error>;

declare function readResult<A>(encoded: A): Effect.Effect<A, Error>;
