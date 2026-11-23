import { assertOrdinaryContracts } from '../../contracts/externalContract.ts';
import type { IContractRelease } from '../../contracts/types.ts';
import type { IAnyModels } from '../../models/types.ts';

import { projectSortedRecord } from './projectSortedRecord.ts';

export function projectSessionModels(models: IAnyModels) {
  return projectSortedRecord(models, model => ({
    modelName: model.modelName,
    version: model.version,
  }));
}

/** The selected ordinary declaration is the public lock's authority. */
export function projectSessionContracts(
  contracts: Readonly<
    Record<
      string,
      Pick<IContractRelease, 'commandName' | 'version' | 'external'>
    >
  >,
) {
  assertOrdinaryContracts(contracts, 'Session selection');
  return projectSortedRecord(contracts, contract => ({
    commandName: contract.commandName,
    version: contract.version,
  }));
}
