import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Queue from 'effect/Queue';

import type { IFanoutSubscriber } from './makeFanoutQueueStorage.js';

/** Complete one fixed source prefix, settling each recipient independently before reporting Causes. */
export const runFanoutDeliveries = <IDENTITY, E, R>(props: {
  concurrency: number;
  readTip(): Effect.Effect<number, E, R>;
  eligible(
    tip: number,
    excluded: ReadonlySet<IDENTITY>,
    limit: number,
  ): readonly IFanoutSubscriber<IDENTITY>[];
  deliver(
    subscriber: IFanoutSubscriber<IDENTITY>,
    boundary: number,
  ): Effect.Effect<void, unknown, R>;
}) => {
  const readTip = props.readTip.bind(props);
  const eligible = props.eligible.bind(props);
  const deliver = props.deliver.bind(props);
  const { concurrency } = props;
  return Effect.gen(function* () {
    const pending = new Set<IDENTITY>();
    const failed = new Set<IDENTITY>();
    const completions = yield* Queue.make<{
      identity: IDENTITY;
      exit: Exit.Exit<void, unknown>;
    }>();
    const boundary = yield* readTip();
    let failure: Cause.Cause<unknown> | undefined;
    return yield* Effect.gen(function* () {
      for (;;) {
        const excluded = new Set([...pending, ...failed]);
        const availableSlots = concurrency - pending.size;
        const subscribers =
          availableSlots === 0
            ? []
            : eligible(boundary, excluded, availableSlots);
        for (const subscriber of subscribers) {
          pending.add(subscriber.identity);
          yield* Effect.suspend(() => deliver(subscriber, boundary)).pipe(
            Effect.onExit(exit =>
              Queue.offer(completions, { identity: subscriber.identity, exit }),
            ),
            Effect.forkScoped,
          );
        }
        if (pending.size === 0) return failure;
        for (const completion of yield* Queue.takeAll(completions)) {
          pending.delete(completion.identity);
          if (Exit.isFailure(completion.exit)) {
            failed.add(completion.identity);
            failure =
              failure === undefined
                ? completion.exit.cause
                : Cause.combine(failure, completion.exit.cause);
          }
        }
      }
    }).pipe(
      Effect.catchCause(cause =>
        Effect.failCause(
          failure === undefined ? cause : Cause.combine(failure, cause),
        ),
      ),
    );
  });
};
