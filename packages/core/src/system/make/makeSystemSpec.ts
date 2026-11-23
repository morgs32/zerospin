import { isEqual, mapValues } from 'es-toolkit';

import type { IAgentReleaseSpec } from '../../agent/AgentReleaseSpecSchema.ts';
import type {
  IAggregateAgentRelease,
  IServiceAgentRelease,
} from '../../agent/types.ts';
import type { IAnyAggregateRelease } from '../../aggregate/types.ts';
import { isContractFinalized } from '../../contracts/make/constructContractRelease.ts';
import { getOperationLeaves } from '../../contracts/operationSchema.ts';
import type { IContractRelease } from '../../contracts/types.ts';
import {
  makeAggregateActorSpec,
  makeServiceActorSpec,
} from '../../declaration/makeActorSpecs.ts';
import { makeContractSpec } from '../../declaration/makeContractSpec.ts';
import {
  makeAgentReleaseSpec,
  makeAggregateSpec,
  makeServiceSpec,
} from '../../declaration/makeReleaseSpecs.ts';
import type {
  IAggregateActorSpec,
  IServiceActorSpec,
} from '../../declaration/ReleaseSpecSchemas.ts';
import type { IModel, IModelSpec } from '../../models/types.ts';
import type { IAnyServiceRelease } from '../../service/types.ts';
import { hashSystemSpec } from '../hashSystemSpec.ts';
import { projectModelSpec } from '../project/projectModelSpec.ts';
import { projectSortedRecord } from '../project/projectSortedRecord.ts';
import type { ISystem, ISystemSpec } from '../types.ts';

/** One owner-scoped version identity retains exactly one complete declaration. */
function registerVersion<VALUE>(
  registry: Record<string, Record<number, VALUE>>,
  name: string,
  version: number,
  value: VALUE,
  context: string,
) {
  const versions = registry[name] ?? {};
  const previous = versions[version];
  if (previous !== undefined && !isEqual(previous, value)) {
    throw new Error(`Conflicting ${context} ${name}@${version} in SystemSpec`);
  }
  versions[version] = value;
  registry[name] = versions;
}

/** Portable registries use ordinary JSON objects across RPC boundaries. */
function projectVersionRegistry<VALUE>(
  registry: Readonly<Record<string, Readonly<Record<number, VALUE>>>>,
) {
  return projectSortedRecord(registry, versions =>
    projectSortedRecord(versions, value => value),
  );
}

/** Retain all finalized codec lineage, including versions omitted from current grants. */
function collectContracts(
  releases: Readonly<Record<number, IAnyAggregateRelease | IAnyServiceRelease>>,
) {
  const pending = Object.values(releases).flatMap(release =>
    Object.values(release.contracts),
  );
  const visited = new Set<IContractRelease>();
  while (pending.length > 0) {
    const contract = pending.pop();
    if (contract === undefined || visited.has(contract)) continue;
    if (!isContractFinalized(contract)) {
      throw new Error(
        'SystemSpec requires contract lineage finalized by makeSystem',
      );
    }
    visited.add(contract);
    if (contract.previous !== undefined) pending.push(contract.previous);
    if (contract.next !== undefined) pending.push(contract.next);
  }
  return visited;
}

export function projectModelAndContractVersions<CONTRACT>(
  models: readonly IModel[],
  contracts: Iterable<IContractRelease>,
  projectContract: (contract: IContractRelease) => CONTRACT,
) {
  const modelVersions: Record<
    string,
    Record<number, IModelSpec>
  > = Object.create(null);
  const contractVersions: Record<
    string,
    Record<number, CONTRACT>
  > = Object.create(null);
  function registerModel(model: IModel) {
    registerVersion(
      modelVersions,
      model.modelName,
      model.version,
      projectModelSpec(model),
      'model',
    );
  }
  for (const model of models) registerModel(model);
  for (const contract of contracts) {
    for (const operation of getOperationLeaves(contract.operations)) {
      if ('model' in operation) registerModel(operation.model);
    }
    registerVersion(
      contractVersions,
      contract.commandName,
      contract.version,
      projectContract(contract),
      'contract',
    );
  }
  return {
    modelVersions: projectVersionRegistry(modelVersions),
    contractVersions: projectVersionRegistry(contractVersions),
  };
}

function compileOwnerFacts(
  releases: Readonly<Record<number, IAnyAggregateRelease | IAnyServiceRelease>>,
  agents: Readonly<
    Record<
      string,
      {
        releases: Readonly<
          Record<number, IAggregateAgentRelease | IServiceAgentRelease>
        >;
      }
    >
  >,
  ownerVersion: (
    agent: IAggregateAgentRelease | IServiceAgentRelease,
  ) => number,
) {
  const agentVersions: Record<
    string,
    Record<number, IAgentReleaseSpec>
  > = Object.create(null);
  mapValues(agents, registry =>
    mapValues(registry.releases, agent => {
      registerVersion(
        agentVersions,
        agent.agentName,
        agent.agentVersion,
        makeAgentReleaseSpec(agent, ownerVersion(agent)),
        'Agent',
      );
    }),
  );
  return {
    ...projectModelAndContractVersions(
      Object.values(releases).flatMap(release => Object.values(release.models)),
      collectContracts(releases),
      makeContractSpec,
    ),
    agentVersions: projectVersionRegistry(agentVersions),
  };
}

export function makeSystemSpec(props: { system: ISystem }): ISystemSpec {
  const { system } = props;
  const body = {
    systemName: system.name,
    aggregateAgents: projectSortedRecord(system.aggregateAgents, nodes =>
      projectSortedRecord(nodes, registry => ({
        agentVersion: registry.active,
        aggregateVersion: registry.releases[registry.active]!.aggregateVersion,
      })),
    ),
    serviceAgents: projectSortedRecord(system.serviceAgents, nodes =>
      projectSortedRecord(nodes, registry => ({
        agentVersion: registry.active,
        serviceVersion: registry.releases[registry.active]!.serviceVersion,
      })),
    ),
    aggregates: projectSortedRecord(system.aggregates, (owner, name) => {
      const agents = system.aggregateAgents[name] ?? {};
      const versions = new Map<object, number>(
        Object.values(agents).flatMap(registry =>
          Object.values(registry.releases).map(
            agent => [agent, agent.aggregateVersion] as const,
          ),
        ),
      );
      const actorVersions: Record<
        string,
        Record<number, IAggregateActorSpec>
      > = Object.create(null);
      mapValues(owner.releases, release =>
        mapValues(release.actors, actor =>
          registerVersion(
            actorVersions,
            actor.name,
            actor.version,
            makeAggregateActorSpec(actor),
            'Aggregate Actor',
          ),
        ),
      );
      return {
        releases: projectSortedRecord(owner.releases, makeAggregateSpec),
        ...compileOwnerFacts(
          owner.releases,
          agents,
          agent => versions.get(agent)!,
        ),
        actorVersions: projectVersionRegistry(actorVersions),
      };
    }),
    services: projectSortedRecord(system.services, (owner, name) => {
      const agents = system.serviceAgents[name] ?? {};
      const versions = new Map<object, number>(
        Object.values(agents).flatMap(registry =>
          Object.values(registry.releases).map(
            agent => [agent, agent.serviceVersion] as const,
          ),
        ),
      );
      const actorVersions: Record<
        string,
        Record<number, IServiceActorSpec>
      > = Object.create(null);
      mapValues(owner.releases, release =>
        mapValues(release.actors, actor =>
          registerVersion(
            actorVersions,
            actor.name,
            actor.version,
            makeServiceActorSpec(actor),
            'Service Actor',
          ),
        ),
      );
      return {
        canonical: owner.canonical,
        releases: projectSortedRecord(owner.releases, makeServiceSpec),
        ...compileOwnerFacts(
          owner.releases,
          agents,
          agent => versions.get(agent)!,
        ),
        actorVersions: projectVersionRegistry(actorVersions),
      };
    }),
  };
  return { ...body, hash: hashSystemSpec(body) };
}
