import { Effect } from 'effect';

/**
 * Each Repo runtime boundary owns one models map and one derived contracts inventory.
 * Within that owner, Actor/Agent/system/external grants coalesce exact canonical objects.
 * Do not merge inventories or models across unrelated owners.
 *
 * @bad Build module-level `systemModels` by reducing aggregate and service registries.
 * @bad Fall back to all service models when `aggregateName` is missing on aggregate paths.
 * @bad Scan `system.services` during aggregate command materialization.
 */
export const applyAggregateCommand = Effect.fn('applyAggregateCommand')(
  function* (props: {
    aggregateName: string;
    aggregateVersion: number;
    mutations: readonly unknown[];
    system: {
      aggregates: Record<
        string,
        Record<string, { models: Record<string, unknown> }>
      >;
    };
  }) {
    const aggregateRegistry = yield* getByKeyOrThrow({
      record: props.system.aggregates,
      key: props.aggregateName,
      recordKind: 'aggregates',
    });

    const aggregateRelease = yield* getByKeyOrThrow({
      record: aggregateRegistry,
      key: props.aggregateVersion,
      recordKind: 'listed versions',
    });

    yield* applyMutationsToResourcesInTx({
      mutations: props.mutations,
      models: aggregateRelease.models,
    });
  },
);

declare function getByKeyOrThrow<VALUE>(props: {
  record: Record<string, VALUE>;
  key: string;
  recordKind: string;
}): Effect.Effect<VALUE>;
declare function applyMutationsToResourcesInTx(props: {
  mutations: readonly unknown[];
  models: Record<string, unknown>;
}): Effect.Effect<void>;
