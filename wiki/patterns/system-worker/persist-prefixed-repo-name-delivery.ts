import { Effect } from 'effect';

/**
 * Subscriber owners that store a physical Repo name retain its exact prefix.
 * AggregateChain replay instead stores only aggregateVersion within its bound Chain;
 * reconstruct the complete receiver key from that retained version and Chain context.
 * AggregateVersionRepo is selected by the four-field key
 * `{ systemId, aggregateId, aggregateName, aggregateVersion }`, not by a
 * per-command stored name.
 *
 * @bad Omit owner context when reconstructing a complete receiver key.
 * @bad Store a Durable Object identity in a generic `name` column.
 * @bad Strip the Repo prefix or retry an unprefixed legacy name when lookup fails.
 * @bad Persist a per-command AggregateVersionRepo name; look up the command.aggregateVersion for original execution; use the requested version for returned replay results.
 */
export const dispatch = Effect.fn('AggregateChain.dispatch')(function* (props: {
  aggregateIndex: number;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: number;
  };
}) {
  const aggregateVersionRepo = yield* getAggregateVersionRepo({
    key: props.key,
  });
  return yield* Effect.promise(() =>
    aggregateVersionRepo.awaitCommandResult({
      aggregateIndex: props.aggregateIndex,
    }),
  );
});

declare function getAggregateVersionRepo(props: {
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: number;
  };
}): Effect.Effect<{
  awaitCommandResult(props: { aggregateIndex: number }): Promise<unknown>;
}>;
