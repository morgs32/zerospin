import { mapValues } from 'es-toolkit';

import type { IContractRelease } from '../../../contracts/types.ts';
import type { ISystem } from '../../types.ts';

/** One aggregate contract identity has one canonical contract. */
export function validateAggregateContractVersions(system: ISystem): void {
  mapValues(system.aggregates, (aggregateRegistry, aggregateName) => {
    const contractVersions = new Map<string, IContractRelease>();
    const visited = new Set<IContractRelease>();
    const validate = (contract: IContractRelease): void => {
      if (visited.has(contract)) return;
      visited.add(contract);
      const identity = `${contract.commandName}@${contract.version}`;
      const previous = contractVersions.get(identity);
      if (previous !== undefined && previous !== contract) {
        throw new Error(
          `Conflicting aggregate contract ${aggregateName}.${identity}`,
        );
      }
      contractVersions.set(identity, contract);
      if (contract.previous !== undefined) validate(contract.previous);
      if (contract.next !== undefined) validate(contract.next);
    };
    mapValues(aggregateRegistry.releases, aggregateRelease => {
      mapValues(aggregateRelease.contracts, entry => {
        validate(entry);
      });
    });
  });
}
