import { Effect } from 'effect';

/**
 * Use `migratableDORepoConfig` for static lifecycle metadata, existing owner `NameUtils` for names, and inherited `Repo.getRepo` for Durable Object stub lookup.
 *
 * @bad Call `AggregateActorVersionChain.migratableDORepoConfig.getRepo(...)`.
 * @bad Import a full lifecycle declaration solely to format a name when owner NameUtils already exists.
 * @bad Cast the Repo class to recover helper typing for a one-off test call.
 * @bad Define a local one-call lookup shim around the inherited static lookup.
 */
export const migrationHistory =
  AggregateActorVersionChain.migratableDORepoConfig.migrations;

export const useAggregateActorVersionChain = Effect.fn(
  'useAggregateActorVersionChain',
)(function* () {
  const key = {
    systemId: 'sys_1',
    aggregateId: 'acct_1',
    aggregateName: 'shopper',
    aggregateVersion: 1,
    actorName: 'user',
    actorVersion: 1,
    actorPath: '/user_owner',
  };
  const name = yield* aggregateActorVersionChainNameUtils.makeName(key);
  const repo = yield* AggregateActorVersionChain.getRepo({
    key,
  });
  yield* callAggregateActorVersionChain(repo, name);
});

type IAggregateActorVersionChainKey = {
  systemId: string;
  aggregateId: string;
  aggregateName: string;
  aggregateVersion: number;
  actorName: string;
  actorVersion: number;
  actorPath: string;
};

declare const AggregateActorVersionChain: {
  getRepo(props: {
    key: IAggregateActorVersionChainKey;
  }): Effect.Effect<unknown>;
  migratableDORepoConfig: {
    migrations: readonly { id: number; name: string; sql: readonly string[] }[];
  };
};
declare const aggregateActorVersionChainNameUtils: {
  makeName(key: IAggregateActorVersionChainKey): Effect.Effect<string>;
};
declare function callAggregateActorVersionChain(
  repo: unknown,
  name: string,
): Effect.Effect<void>;
