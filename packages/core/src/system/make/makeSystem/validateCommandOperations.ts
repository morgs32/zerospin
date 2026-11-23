import { mapValues } from 'es-toolkit';

import type { IAnyAggregateRelease } from '../../../aggregate/types.ts';
import { isOrdinaryContract } from '../../../contracts/make/constructContractRelease.ts';
import { getReleaseCommandOperations } from '../../../contracts/operationSchema.ts';
import type { IAnyServiceRelease } from '../../../service/types.ts';
import type { ISystem } from '../../types.ts';

/** Every recorded destination belongs to this System by exact declaration identity. */
export function validateCommandOperations(system: ISystem): void {
  const validateRelease = (
    release: IAnyAggregateRelease | IAnyServiceRelease,
  ): void => {
    for (const leaf of getReleaseCommandOperations(release)) {
      const { destination, contract } = leaf;
      const owner = destination.aggregate ?? destination.service;
      if (owner === undefined) {
        throw new Error('Command operation owner family is invalid');
      }
      const registered = (
        destination.aggregate !== undefined
          ? system.aggregates
          : system.services
      )[owner.name]?.releases[destination.version];
      const destinationContract = registered?.system[contract.commandName];
      if (
        registered?.definition !== owner ||
        destinationContract === undefined ||
        destinationContract !== contract ||
        !isOrdinaryContract(contract) ||
        contract.claims !== undefined
      ) {
        throw new Error(
          `Command operation ${owner.name}@${destination.version}.${contract.commandName}@${contract.version} must reference its exact claims-free ordinary contract System grant in this System`,
        );
      }
    }
  };
  mapValues(system.aggregates, registry =>
    mapValues(registry.releases, validateRelease),
  );
  mapValues(system.services, registry =>
    mapValues(registry.releases, validateRelease),
  );
}
