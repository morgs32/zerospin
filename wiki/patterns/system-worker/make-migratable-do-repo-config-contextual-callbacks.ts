import { VersionFromStringSchema } from '@zerospin/core/declaration/VersionSchema';
import { System } from '@zerospin/core/system/System';
import { Effect, Schema } from 'effect';

/**
 * Let `makeMigratableDORepoConfig` context-type `dbConfig({ key })` and keep Durable Object lookup in the Repo's inherited `getRepo` static; supply namespaceBinding, managedRuntime: config.managedRuntime and the system Repo's direct repoType/system pair to makeMigratableDORepo in the DO class file.
 *
 * @bad Put generic Durable Object lookup in `makeMigratableDORepoConfig`.
 * @bad Give `dbConfig` storage or physical-name props; it resolves the schema from the parsed key.
 * @bad Add validation/registration hooks that duplicate system admission or exact release resolution.
 * @bad Call `AggregateVersionRepo.migratableDORepoConfig.getRepo(...)`; call the namespace or release binding lookup.
 */
export const aggregateMigratableDORepoConfig = makeMigratableDORepoConfig({
  abbreviation: 'mataggrepo',
  migrations: [],
  namePattern: parseRoutePattern(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion',
  ),
  keyCodec: Schema.Struct({
    systemId: Schema.String,
    aggregateId: Schema.String,
    aggregateName: Schema.String,
    aggregateVersion: VersionFromStringSchema,
  }),
  dbConfig: Effect.fn('AggregateVersionRepo.dbConfig')(function* (props) {
    const { key } = props;
    const system = yield* System;
    const aggregateRegistry = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    const aggregateRelease = yield* getByKeyOrThrow({
      record: aggregateRegistry,
      key: key.aggregateVersion,
      recordKind: 'listed versions',
    });
    return makeResourceDbConfig({ models: aggregateRelease.models });
  }),
});

declare function makeMigratableDORepoConfig(props: {
  abbreviation: string;
  migrations: readonly unknown[];
  namePattern: unknown;
  keyCodec: unknown;
  dbConfig: (props: {
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: number;
    };
  }) => Effect.Effect<unknown, unknown, System>;
}): {
  nameUtils: {
    makeName(props: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: number;
    }): Effect.Effect<string>;
  };
};
declare function parseRoutePattern(pattern: string): unknown;
declare function getByKeyOrThrow<KEY extends string | number, VALUE>(props: {
  record: Record<KEY, VALUE>;
  key: KEY;
  recordKind: string;
}): Effect.Effect<VALUE, unknown>;
declare function makeResourceDbConfig(props: {
  models: Record<string, unknown>;
}): unknown;
