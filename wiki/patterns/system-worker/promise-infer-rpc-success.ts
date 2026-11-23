import { Effect } from 'effect';

/**
 * Let `Effect.promise` infer the RPC success shape from the promise-returning queue method.
 * Rejections are defects; the resolved RPC envelope carries declared failures.
 *
 * @bad Catch every rejection as a made-up typed error.
 * @bad Force a wire-envelope generic onto `Effect.promise`.
 * @bad Keep RPC result imports only to annotate `Effect.promise`.
 */
export const readNextCommands = Effect.fn('Repo.readNextCommands')(
  function* (props: {
    queue: {
      getPage(props: { afterIndex: number }): PromiseLike<unknown>;
    };
    afterAggregateIndex: number | null;
  }) {
    return yield* Effect.promise(() =>
      props.queue.getPage({
        afterIndex: props.afterAggregateIndex ?? 0,
      }),
    ).pipe(Effect.flatMap(readResult));
  },
);

declare function readResult<A>(encoded: A): Effect.Effect<A, unknown, unknown>;
