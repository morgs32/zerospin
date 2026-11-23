import { mapValues } from 'es-toolkit';

import { assertClaimsRequirements } from '../aggregateActor/make/makeAggregateActorRelease/assertClaimsRequirements/assertClaimsRequirements.ts';
import { getOperationLeaves } from '../contracts/operationSchema.ts';
import { assertReadProjection } from '../contracts/readProjection.ts';
import type { IAnyContracts, IContractRelease } from '../contracts/types.ts';
import type { IClaimsSchema } from '../identity/types.ts';
import type { IAnyModels } from '../models/types.ts';

/** Read requirements are projected; mutation permission remains exact. */
export function validateContractModels(props: {
  entry: IContractRelease;
  models: IAnyModels;
  context: string;
}): void {
  const { entry: contract, models, context } = props;
  const mutationModels = getOperationLeaves(contract.operations).flatMap(leaf =>
    'model' in leaf ? [leaf.model] : [],
  );
  const projectedModels = new Set(Object.keys(contract.models));
  mapValues(contract.models, (projection, name) =>
    assertReadProjection({
      projection,
      projectedModels,
      model: models[name],
      context,
    }),
  );
  for (const model of mutationModels) {
    if (models[model.modelName] !== model) {
      throw new Error(
        `${context} contract ${contract.commandName} model ${model.modelName}@${model.version} must belong to its database`,
      );
    }
  }
}

/** Deferred work requires the exact external contract in the emitting release. */
export function validateContractExternalOperations(props: {
  contracts: IAnyContracts;
  context: string;
}): void {
  const { contracts, context } = props;
  mapValues(contracts, contract => {
    for (const leaf of getOperationLeaves(contract.operations)) {
      if (leaf.operationName !== 'external') continue;
      const implementation = contracts[leaf.contractName];
      if (
        implementation === undefined ||
        implementation.version !== leaf.contractVersion ||
        implementation.external?.definition.externalOperation !== leaf
      ) {
        throw new Error(
          `${context} async contract ${leaf.contractName}@${leaf.contractVersion} must be its exact local external contract`,
        );
      }
    }
  });
}

/** Check projected reads, exact mutation models and claims of public Actor contracts. */
export function validateActorContracts(props: {
  actorName: string;
  exposedModels: IAnyModels;
  contracts: IAnyContracts;
  claimsSchema: IClaimsSchema;
}): void {
  const { actorName, exposedModels, contracts, claimsSchema } = props;
  mapValues(contracts, (contract, contractName) => {
    if (contractName !== contract.commandName) {
      throw new Error(
        `Actor contract key ${contractName} must match ${contract.commandName}`,
      );
    }
    if (contract.external !== undefined) {
      throw new Error(
        `Actor ${actorName} contract ${contractName} must be ordinary`,
      );
    }
    validateContractModels({
      entry: contract,
      models: exposedModels,
      context: `Actor ${actorName}`,
    });
    if (contract.claims !== undefined) {
      assertClaimsRequirements(claimsSchema, contract.claims);
    }
  });
}
