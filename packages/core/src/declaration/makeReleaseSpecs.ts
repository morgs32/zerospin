import { encodeShape } from '@zerospin/shapes';
import { mapValues } from 'es-toolkit';

import type { IAgentReleaseSpec } from '../agent/AgentReleaseSpecSchema.ts';
import type { IAgentCommandRef } from '../agent/makeAgentCommandRef.ts';
import type {
  IAggregateAgentRelease,
  IServiceAgentRelease,
} from '../agent/types.ts';
import type { IAggregateSpec } from '../aggregate/AggregateSpecSchema.ts';
import type { IAnyAggregateRelease } from '../aggregate/types.ts';
import { projectOperationSpecs } from '../contracts/operationSchema.ts';
import {
  normalizeReadField,
  readProjectionRequirement,
} from '../contracts/readProjection.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type { IServiceSpec } from '../service/ServiceSpecSchema.ts';
import type { IAnyServiceRelease } from '../service/types.ts';
import { projectModelSpec } from '../system/project/projectModelSpec.ts';
import { projectSortedRecord } from '../system/project/projectSortedRecord.ts';

type IAggregateSpecDeclaration = Pick<
  IAnyAggregateRelease,
  | 'name'
  | 'version'
  | 'branchFrom'
  | 'rebuildFrom'
  | 'models'
  | 'actors'
  | 'system'
  | 'external'
  | 'extensions'
> & { readonly contracts: IAnyContracts };

type IServiceSpecDeclaration = Pick<
  IAnyServiceRelease,
  'name' | 'version' | 'models' | 'actors' | 'system' | 'external'
> & { readonly contracts: IAnyContracts };

type IAgentSpecDeclaration = Pick<
  IAggregateAgentRelease | IServiceAgentRelease,
  | 'agentName'
  | 'agentVersion'
  | 'sessionName'
  | 'db'
  | 'contracts'
  | 'wakeRules'
  | 'selections'
>;

/** Compile portable owner facts after native declaration validation. */
export function makeAggregateSpec(
  release: IAggregateSpecDeclaration,
): IAggregateSpec {
  return {
    name: release.name,
    version: release.version,
    ...(release.branchFrom === undefined
      ? {}
      : { branchFrom: release.branchFrom.version }),
    ...(release.rebuildFrom === undefined
      ? {}
      : { rebuildFrom: release.rebuildFrom.version }),
    models: projectSortedRecord(release.models, model => model.version),
    contracts: projectSortedRecord(
      release.contracts,
      contract => contract.version,
    ),
    system: projectSortedRecord(release.system, contract => contract.version),
    external: projectSortedRecord(
      release.external,
      contract => contract.version,
    ),
    actors: projectSortedRecord(release.actors, actor => actor.version),
    ...(Object.keys(release.extensions).length === 0
      ? {}
      : {
          extensions: projectSortedRecord(release.extensions, extension => {
            const projectedModels = new Set(Object.keys(extension.models));
            return {
              sourceVersion: extension.source.version,
              models: projectSortedRecord(extension.models, projection => {
                const requirement = readProjectionRequirement(projection);
                return {
                  abbreviation: requirement.abbreviation,
                  fields: mapValues(encodeShape(requirement.shape), field =>
                    normalizeReadField(field, projectedModels),
                  ),
                };
              }),
              operations: projectOperationSpecs(extension.operations),
            };
          }),
        }),
  };
}

export function makeServiceSpec(
  release: IServiceSpecDeclaration,
): IServiceSpec {
  return {
    name: release.name,
    version: release.version,
    models: projectSortedRecord(release.models, model => model.version),
    contracts: projectSortedRecord(
      release.contracts,
      contract => contract.version,
    ),
    system: projectSortedRecord(release.system, contract => contract.version),
    external: projectSortedRecord(
      release.external,
      contract => contract.version,
    ),
    actors: projectSortedRecord(release.actors, actor => actor.version),
  };
}

function projectAgentFacts(
  agent: IAgentSpecDeclaration,
  ownerReleaseVersion: number,
) {
  return {
    name: agent.agentName,
    agentVersion: agent.agentVersion,
    sessionName: agent.sessionName,
    selectionSemantics: 'selected-rows' as const,
    contracts: projectSortedRecord(
      agent.contracts,
      (ref: IAgentCommandRef) => ref.version,
    ),
    ownerReleaseVersion,
    wakeRules: projectSortedRecord(agent.wakeRules, rule => rule.modelName),
    selections: projectSortedRecord(agent.selections, selection => ({
      modelName: selection.model.modelName,
      definition: selection.definition,
    })),
    models: projectSortedRecord(agent.db.models, projectModelSpec),
  };
}

export function makeAgentReleaseSpec(
  agent: IAgentSpecDeclaration,
  ownerReleaseVersion: number,
): IAgentReleaseSpec {
  return projectAgentFacts(agent, ownerReleaseVersion);
}
