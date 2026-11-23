import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { validateContractModels } from '@zerospin/core/declaration/validateActorContracts';
import { assertValidModels } from '@zerospin/core/models/assertValidModels';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { mapValues } from 'es-toolkit';

/** Select public models and contracts before the core lock projection sees them. */
export const selectAggregateLockMembers = Effect.fn(
  'selectAggregateLockMembers',
)(function* (props: {
  aggregateRelease: IAnyAggregateRelease;
  actor: IAnyAggregateRelease['actors'][string];
  lock: IAggregateSessionLock;
  lockKey: string;
}) {
  const { aggregateRelease, actor, lock, lockKey } = props;
  const unsupported = (
    definitionPath: string,
    message: string,
    reason = 'definition-missing',
  ) =>
    makeZerospinError({
      code: 'aggregate-session-lock-unsupported',
      message,
      extra: {
        aggregateSession: {
          aggregateName: aggregateRelease.name,
          sessionName: lock.sessionName,
        },
        aggregateSessionLockKey: lockKey,
        definitionPath,
        reason,
      },
    });
  const models = yield* Effect.all(
    mapValues(lock.models, (requested, modelName) =>
      Effect.gen(function* () {
        const model = Object.hasOwn(actor.exposedModels, modelName)
          ? actor.exposedModels[modelName]
          : undefined;
        if (model === undefined || model.version !== requested.version) {
          return yield* unsupported(
            `models.${modelName}@${requested.version}`,
            `Session model ${modelName}@${requested.version} is unavailable`,
          );
        }
        return model;
      }),
    ),
  );
  yield* Effect.try({
    try: () =>
      assertValidModels({
        models,
        context: `Aggregate session ${lock.sessionName}`,
      }),
    catch: () =>
      unsupported(
        'models',
        'The selected session model graph must contain every referenced public model',
      ),
  });
  const contracts = yield* Effect.all(
    mapValues(lock.contracts, (requested, contractName) =>
      Effect.gen(function* () {
        const current = Object.hasOwn(actor.contracts, contractName)
          ? actor.contracts[contractName]
          : undefined;
        if (
          current === undefined ||
          current.external !== undefined ||
          current.version !== requested.version
        ) {
          return yield* unsupported(
            `contracts.${contractName}@${requested.version}`,
            `Session contract ${contractName}@${requested.version} is unavailable`,
          );
        }
        const contract = current;
        yield* Effect.try({
          try: () =>
            validateContractModels({
              entry: contract,
              models,
              context: `Aggregate session ${lock.sessionName}`,
            }),
          catch: () =>
            unsupported(
              `contracts.${contractName}.models`,
              `Contract ${contractName} requires its exact selected public read and mutation models`,
              'operation-model-missing',
            ),
        });
        return contract;
      }),
    ),
  );
  return { models, contracts };
});
