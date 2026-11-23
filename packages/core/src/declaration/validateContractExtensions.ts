import { mapValues } from 'es-toolkit';

import { isServiceContract } from '../contracts/make/constructContractRelease.ts';
import type { IAggregateContractExtension } from '../contracts/makeAggregateContractExtension.ts';
import type { IServiceContractExtension } from '../contracts/makeServiceContractExtension.ts';
import { getOperationLeaves } from '../contracts/operationSchema.ts';
import { assertReadProjection } from '../contracts/readProjection.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type { IAnyModels } from '../models/types.ts';

export function validateContractExtensions(
  extensions: Readonly<
    Record<string, IServiceContractExtension | IAggregateContractExtension>
  >,
  contracts: IAnyContracts,
  models: IAnyModels,
) {
  mapValues(extensions, (extension, commandName) => {
    if (
      commandName !== extension.source.commandName ||
      contracts[commandName] !== extension.source
    ) {
      throw new Error(
        `Extension ${commandName} must bind the owner's exact source contract`,
      );
    }
    const projectedModels = new Set(Object.keys(extension.models));
    mapValues(extension.models, (projection, modelName) =>
      assertReadProjection({
        projection,
        projectedModels,
        model: models[modelName],
        context: `Extension ${commandName}`,
      }),
    );
    for (const operation of getOperationLeaves(extension.operations)) {
      if (
        'model' in operation &&
        models[operation.model.modelName] !== operation.model
      ) {
        throw new Error(
          `Extension operation model ${operation.model.modelName} must belong to its owner release`,
        );
      }
      if (
        'family' in operation &&
        !('destination' in operation) &&
        (operation.family === 'service') !== isServiceContract(extension.source)
      ) {
        throw new Error(
          'External operations must belong to the source contract family',
        );
      }
    }
  });
}
