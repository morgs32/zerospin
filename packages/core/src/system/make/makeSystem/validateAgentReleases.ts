import { mapValues } from 'es-toolkit';

import type { IAgentRelease } from '../../../agent/AgentReleaseSchema.ts';
import {
  resolveAgentCommand,
  type IAgentCommandRef,
} from '../../../agent/makeAgentCommandRef.ts';
import type { IAnyAggregateRelease } from '../../../aggregate/types.ts';
import type {
  IAnyContracts,
  IContractRelease,
} from '../../../contracts/types.ts';
import { validateContractModels } from '../../../declaration/validateActorContracts.ts';
import { validateModelVisibility } from '../../../declaration/validateModelVisibility.ts';
import { getReleaseContinuationContracts } from '../../../declaration/validateReleaseContinuations.ts';
import type { IAnyServiceRelease } from '../../../service/types.ts';
import type { IAggregateAgents, IServiceAgents, ISystem } from '../../types.ts';

/** The type-only declaration named by each reference must match its registered owner's contract. */
type ICheckedAgentRelease<
  AGENT,
  OWNER,
  VERSION_FIELD extends PropertyKey,
> = AGENT extends { contracts: infer GRANTS } & Record<
  VERSION_FIELD,
  infer V extends number
>
  ? OWNER extends {
      releases: Record<V, { contracts: infer CONTRACTS extends IAnyContracts }>;
    }
    ? {
        contracts: {
          [K in keyof GRANTS]: K extends keyof CONTRACTS
            ? IAgentCommandRef<CONTRACTS[K]>
            : never;
        };
      }
    : never
  : never;

export type ICheckedAgentGrants<
  REGISTRIES extends IAggregateAgents | IServiceAgents,
  OWNERS,
  VERSION_FIELD extends 'aggregateVersion' | 'serviceVersion',
> = {
  [N in keyof REGISTRIES]: {
    [A in keyof REGISTRIES[N]]: {
      releases: {
        [V in keyof REGISTRIES[N][A]['releases']]: ICheckedAgentRelease<
          REGISTRIES[N][A]['releases'][V],
          OWNERS[N & keyof OWNERS],
          VERSION_FIELD
        >;
      };
    };
  };
};

/** Agent declarations bind an exact owner release without entering its immutable composition. */
export function validateAgentReleases(system: ISystem): void {
  mapValues(system.aggregateAgents, (agents, aggregateName) =>
    mapValues(agents, (registry, agentName) => {
      if (registry.releases[registry.active] === undefined) {
        throw new Error('Selected Aggregate Agent is not registered');
      }
      mapValues(registry.releases, (agent, version) => {
        if (
          agent.agentName !== agentName ||
          agent.agentVersion !== Number(version) ||
          agent.aggregateName !== aggregateName ||
          system.aggregates[aggregateName]?.releases[agent.aggregateVersion] ===
            undefined
        ) {
          throw new Error(
            'Aggregate Agent must bind its exact registered owner release',
          );
        }
        validateSessionDefinition(
          agent,
          system.aggregates[aggregateName]!.releases[agent.aggregateVersion]!,
        );
      });
    }),
  );
  mapValues(system.serviceAgents, (agents, serviceName) =>
    mapValues(agents, (registry, agentName) => {
      if (registry.releases[registry.active] === undefined) {
        throw new Error('Selected Service Agent is not registered');
      }
      mapValues(registry.releases, (agent, version) => {
        if (
          agent.agentName !== agentName ||
          agent.agentVersion !== Number(version) ||
          agent.serviceName !== serviceName ||
          system.services[serviceName]?.releases[agent.serviceVersion] ===
            undefined
        ) {
          throw new Error(
            'Service Agent must bind its exact registered owner release',
          );
        }
        validateSessionDefinition(
          agent,
          system.services[serviceName]!.releases[agent.serviceVersion]!,
        );
      });
    }),
  );
}

function validateSessionDefinition(
  agent: IAgentRelease,
  owner: IAnyAggregateRelease | IAnyServiceRelease,
) {
  mapValues(agent.db.models, (model, name) =>
    validateModelVisibility({
      model,
      canonicalModel: owner.models[name],
      context: `Agent ${agent.agentName}`,
    }),
  );
  const continuationNames = new Set(
    getReleaseContinuationContracts(owner).map(
      contract => contract.commandName,
    ),
  );
  mapValues(agent.contracts, ref => {
    const contract = resolveAgentCommand<IContractRelease>(
      ref,
      owner.contracts,
    );
    if (contract === undefined || continuationNames.has(ref.commandName)) {
      throw new Error(
        `Agent command ${ref.commandName}@${ref.version} must be a claims-free ordinary contract declared on its exact owner release`,
      );
    }
    validateContractModels({
      entry: contract,
      models: agent.db.models,
      context: `Agent ${agent.agentName}`,
    });
  });
}
