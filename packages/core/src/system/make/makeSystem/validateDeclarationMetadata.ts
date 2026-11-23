import { mapValues } from 'es-toolkit';

import type { IAnyAggregateRelease } from '../../../aggregate/types.ts';
import type { IAnyAggregateActorRelease } from '../../../aggregateActor/types.ts';
import {
  isAggregateContract,
  isServiceContract,
} from '../../../contracts/make/constructContractRelease.ts';
import type { IAnyContracts } from '../../../contracts/types.ts';
import {
  validateActorContracts,
  validateContractExternalOperations,
  validateContractModels,
} from '../../../declaration/validateActorContracts.ts';
import { validateActorModels } from '../../../declaration/validateActorModels.ts';
import { assertValidModels } from '../../../models/assertValidModels.ts';
import { assertSelectionQueryModels } from '../../../models/makeSelection.ts';
import type { IAnyServiceRelease } from '../../../service/types.ts';
import type { IAnyServiceActorRelease } from '../../../serviceActor/types.ts';
import type { ISystem } from '../../types.ts';

/** Check native declaration relationships once after the complete System is assembled. */
export function validateDeclarationMetadata(system: ISystem): void {
  const actors = new Set<IAnyAggregateActorRelease | IAnyServiceActorRelease>();
  const releases = new Set<IAnyAggregateRelease | IAnyServiceRelease>();

  const validateActor = (
    actor: IAnyAggregateActorRelease | IAnyServiceActorRelease,
  ): void => {
    if (actors.has(actor)) return;
    actors.add(actor);
    validateActorModels({
      actorName: actor.name,
      exposedModels: actor.exposedModels,
      canonicalModels: actor.db.models,
    });
    mapValues(actor.selections, (_selection, modelName) => {
      if (!Object.hasOwn(actor.exposedModels, modelName)) {
        throw new Error(
          `Actor ${actor.name} selection ${modelName} requires an exposed model`,
        );
      }
    });
    mapValues(actor.capturedSelections, selection =>
      assertSelectionQueryModels({ selection, models: actor.db.models }),
    );
    validateActorContracts({
      actorName: actor.name,
      exposedModels: actor.exposedModels,
      contracts: actor.contracts,
      claimsSchema: actor.identity.claimsSchema,
    });
    if (actor.kind === 'service') {
      mapValues(actor.guards, (_guard, commandName) => {
        if (!Object.hasOwn(actor.contracts, commandName)) {
          throw new Error(
            `Unknown service actor guard command ${actor.name}.${commandName}`,
          );
        }
      });
    }
  };

  const validateRelease = (
    release: IAnyAggregateRelease | IAnyServiceRelease,
    context: string,
  ): void => {
    if (releases.has(release)) return;
    releases.add(release);
    const { models, contracts } = release;
    const validateGrants = (
      grants: IAnyContracts,
      grantContext: string,
      external: boolean,
      claims: boolean,
    ): void => {
      mapValues(grants, (contract, name) => {
        if (name !== contract.commandName) {
          throw new Error(
            `Contract key ${name} must match ${contract.commandName}`,
          );
        }
        if (
          (contract.external !== undefined) !== external ||
          (!claims && contract.claims !== undefined)
        ) {
          throw new Error(
            `${grantContext} contract ${name} must be ${external ? 'external' : claims ? 'ordinary' : 'claims-free ordinary'}`,
          );
        }
        if (contracts[name] !== contract) {
          throw new Error(`Conflicting canonical contract ${name}`);
        }
      });
    };
    validateGrants(release.system, 'System grant', false, false);
    validateGrants(release.external, 'External grant', true, false);
    mapValues(release.actors, (actor, name) =>
      validateGrants(actor.contracts, `Actor ${name}`, false, true),
    );
    assertValidModels({ models, context });
    validateContractExternalOperations({ contracts, context });
    mapValues(contracts, (contract, contractName) => {
      if (contractName !== contract.commandName) {
        throw new Error(
          `Contract key ${contractName} must match ${contract.commandName}`,
        );
      }
      validateContractModels({ entry: contract, models, context });
    });
    mapValues(release.actors, (actor, actorName) => {
      if (actorName !== actor.name) {
        throw new Error(`Actor key ${actorName} must match ${actor.name}`);
      }
      validateActor(actor);
      mapValues(actor.db.models, (model, modelName) => {
        if (models[modelName] !== model) {
          throw new Error(
            `Actor ${actorName} database model ${modelName} must reference ${release.name}@${release.version}`,
          );
        }
      });
      mapValues(actor.capturedSelections, (selection, modelName) => {
        if (models[modelName] !== selection.model) {
          throw new Error(
            `Actor ${actorName}.${modelName} must reference ${release.name}@${release.version}`,
          );
        }
      });
    });
  };

  mapValues(system.aggregates, registry =>
    mapValues(registry.releases, release => {
      mapValues(release.contracts, contract => {
        if (!isAggregateContract(contract)) {
          throw new Error('Expected a canonical aggregate contract');
        }
      });
      validateRelease(release, `Aggregate ${release.name}@${release.version}`);
      mapValues(release.guards, (guards, actorName) => {
        const actor = release.actors[actorName];
        if (actor === undefined) {
          throw new Error(`Unknown guard actor ${actorName}`);
        }
        if (guards === undefined) {
          throw new Error(
            `Aggregate guard ${actorName} must declare contract guards`,
          );
        }
        for (const command of Object.keys(guards)) {
          if (!Object.hasOwn(actor.contracts, command)) {
            throw new Error(
              `Unknown aggregate guard command ${actorName}.${command}`,
            );
          }
        }
      });
    }),
  );
  mapValues(system.services, registry =>
    mapValues(registry.releases, release => {
      mapValues(release.contracts, contract => {
        if (!isServiceContract(contract)) {
          throw new Error('Expected a canonical service contract');
        }
      });
      validateRelease(release, `Service ${release.name}@${release.version}`);
    }),
  );
}
