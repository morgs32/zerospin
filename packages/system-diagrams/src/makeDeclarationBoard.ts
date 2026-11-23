import type { IModelSpec } from '@zerospin/core/models/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { mapValues } from 'es-toolkit';

export type IDeclarationType = 'actor' | 'agent' | 'model' | 'contract';

export interface IDeclarationCard {
  id: string;
  type: IDeclarationType;
  name: string;
  versions: number[];
  models?: IModelSpec[];
  contracts?: IDeclarationContract[];
  scopes?: IDeclarationScope[];
}

export interface IDeclarationScope {
  version: number;
  declarations: IDeclarationCard[];
}

export interface IDeclarationSection {
  id: string;
  name: string;
  declarations: IDeclarationCard[];
}

export interface IDeclarationBoard {
  aggregates: IDeclarationSection[];
  services: IDeclarationSection[];
}

type IOwner =
  | ISystemSpec['aggregates'][string]
  | ISystemSpec['services'][string];

export type IDeclarationContract =
  ISystemSpec['aggregates'][string]['contractVersions'][string][number];

function projectDeclarationScope(props: {
  version: number;
  models: IModelSpec[];
  contracts: Readonly<Record<string, number>>;
  contractVersions: ISystemSpec['aggregates'][string]['contractVersions'];
}): IDeclarationScope {
  const { version, models, contracts, contractVersions } = props;
  const declarations: IDeclarationCard[] = models.map(model => ({
    id: JSON.stringify(['model', model.modelName]),
    type: 'model',
    name: model.modelName,
    versions: [model.version],
    models: [model],
  }));
  mapValues(contracts, (contractVersion, commandName) => {
    const contract = contractVersions[commandName]?.[contractVersion];
    if (contract === undefined) {
      throw new Error(
        `SystemSpec has no contract ${commandName}@${contractVersion}`,
      );
    }
    declarations.push({
      id: JSON.stringify(['contract', contract.commandName]),
      type: 'contract',
      name: contract.commandName,
      versions: [contract.version],
      contracts: [contract],
    });
  });
  return {
    version,
    declarations: declarations.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}

function projectDeclarationSection(
  id: string,
  name: string,
  owner: IOwner,
): IDeclarationSection {
  const {
    releases,
    modelVersions,
    actorVersions,
    agentVersions,
    contractVersions,
  } = owner;
  const resolveModels = (
    bindings: Readonly<Record<string, number>>,
  ): IModelSpec[] =>
    Object.values(
      mapValues(bindings, (version, modelName) => {
        const model = modelVersions[modelName]?.[version];
        if (model === undefined) {
          throw new Error(`SystemSpec has no model ${modelName}@${version}`);
        }
        return model;
      }),
    );
  const cards = new Map<string, IDeclarationCard>();
  const register = (
    type: IDeclarationType,
    declarationName: string,
    version: number | null,
  ) => {
    const declarationId = JSON.stringify([type, declarationName]);
    let card = cards.get(declarationId);
    if (!card) {
      card = { id: declarationId, type, name: declarationName, versions: [] };
      cards.set(declarationId, card);
    }
    if (version !== null && !card.versions.includes(version)) {
      card.versions.push(version);
    }
    return card;
  };

  mapValues(agentVersions, versions =>
    mapValues(versions, agent => {
      if (agent === undefined) {
        throw new Error(`SystemSpec has no Agent declaration`);
      }
      const card = register('agent', agent.name, agent.agentVersion);
      card.scopes ??= [];
      if (!card.scopes.some(scope => scope.version === agent.agentVersion)) {
        card.scopes.push(
          projectDeclarationScope({
            version: agent.agentVersion,
            models: Object.values(agent.models),
            contracts: agent.contracts,
            contractVersions,
          }),
        );
      }
    }),
  );
  Object.values(releases).forEach(release => {
    mapValues(release.actors, (version, actorName) => {
      const actor = actorVersions[actorName]?.[version];
      if (actor === undefined) {
        throw new Error(`SystemSpec has no actor ${actorName}@${version}`);
      }
      const card = register('actor', actor.name, actor.version);
      card.scopes ??= [];
      if (!card.scopes.some(scope => scope.version === actor.version)) {
        card.scopes.push(
          projectDeclarationScope({
            version: actor.version,
            models: Object.values(actor.exposedModels),
            contracts: actor.contracts,
            contractVersions,
          }),
        );
      }
    });
    resolveModels(release.models).forEach(model => {
      const card = register('model', model.modelName, model.version);
      card.models ??= [];
      if (!card.models.some(existing => existing.version === model.version)) {
        card.models.push(model);
      }
    });
    mapValues(release.contracts, (version, commandName) => {
      const contract = contractVersions[commandName]?.[version];
      if (contract === undefined) {
        throw new Error(`SystemSpec has no contract ${commandName}@${version}`);
      }
      const card = register('contract', contract.commandName, contract.version);
      card.contracts ??= [];
      if (
        !card.contracts.some(existing => existing.version === contract.version)
      ) {
        card.contracts.push(contract);
      }
    });
  });
  cards.forEach(card => {
    card.versions.sort((left, right) => left - right);
    card.scopes?.sort((left, right) => left.version - right.version);
  });
  return {
    id,
    name,
    declarations: [...cards.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}

export function makeDeclarationBoard(
  systemSpec: ISystemSpec,
): IDeclarationBoard {
  const aggregates = Object.values(
    mapValues(systemSpec.aggregates, (owner, name) =>
      projectDeclarationSection(
        `system-board-aggregate-${encodeURIComponent(name)}`,
        name,
        owner,
      ),
    ),
  );
  const services = Object.values(
    mapValues(systemSpec.services, (owner, name) =>
      projectDeclarationSection(
        `system-board-service-${encodeURIComponent(name)}`,
        name,
        owner,
      ),
    ),
  );
  return {
    aggregates: aggregates.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    services: services.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}
