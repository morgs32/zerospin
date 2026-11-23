import { validateContractModels } from '@zerospin/core/declaration/validateActorContracts';
import { assertValidModels } from '@zerospin/core/models/assertValidModels';
import type { IAnyServiceActorRelease } from '@zerospin/core/serviceActor/types';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { mapValues } from 'es-toolkit';

/** Select public models and exact contract versions from the bound actor's captured view. */
export const selectServiceLockMembers = Effect.fn('selectServiceLockMembers')(
  function* (props: {
    actor: IAnyServiceActorRelease;
    lock: IServiceSessionLock;
    lockKey: string;
    serviceName: string;
  }) {
    const { actor, lock, lockKey, serviceName } = props;
    const unsupported = (
      definitionPath: string,
      message: string,
      reason = 'definition-missing',
    ) =>
      makeZerospinError({
        code: 'service-session-lock-unsupported',
        message,
        extra: {
          serviceSession: { serviceName, sessionName: lock.sessionName },
          serviceSessionLockKey: lockKey,
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
          context: `Service session ${lock.sessionName}`,
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
                context: `Service session ${lock.sessionName}`,
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
  },
);
