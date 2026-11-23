import '@zerospin/server-only';
import { mapValues } from 'es-toolkit';

import type { IAggregateReleaseIdentity } from '../../../aggregate/types.ts';
import { finalizeContractLineage } from '../../../contracts/make/constructContractRelease.ts';
import type {
  IAggregateAgents,
  IAggregateRegistryEntry,
  IServiceAgents,
  IServiceRegistryEntry,
  ISystem,
} from '../../types.ts';

import { decodeSystemProps } from './decodeSystemProps/decodeSystemProps.ts';
import { validateActorVersions } from './validateActorVersions.ts';
import {
  validateAgentReleases,
  type ICheckedAgentGrants,
} from './validateAgentReleases.ts';
import { validateAggregateContractVersions } from './validateAggregateContractVersions.ts';
import { validateCommandOperations } from './validateCommandOperations.ts';
import { validateDeclarationMetadata } from './validateDeclarationMetadata.ts';
import { validateReleaseRegistries } from './validateReleaseRegistries.ts';
import { validateServiceContractVersions } from './validateServiceContractVersions.ts';
import { validateServiceModelOwnership } from './validateServiceModelOwnership.ts';

type ICheckedAggregateReleases<NAME extends string, RELEASES> = {
  [V in keyof RELEASES]: {
    name: NAME;
    version: V extends number ? V : never;
    branchFrom?: IAggregateReleaseIdentity<NAME, keyof RELEASES & number>;
    rebuildFrom?: IAggregateReleaseIdentity<NAME, keyof RELEASES & number>;
  };
};

export function makeSystem<
  SYSTEM_NAME extends string,
  const AGGREGATES extends Record<string, IAggregateRegistryEntry>,
  const SERVICES extends Record<string, IServiceRegistryEntry> = {},
  const AGGREGATE_AGENT_NODES extends IAggregateAgents = {},
  const SERVICE_AGENT_NODES extends IServiceAgents = {},
>(props: {
  name: SYSTEM_NAME;
  aggregates: AGGREGATES & {
    [N in keyof NoInfer<AGGREGATES> & string]: {
      releases: ICheckedAggregateReleases<N, AGGREGATES[N]['releases']>;
    } & Record<Exclude<keyof AGGREGATES[N], 'releases'>, never>;
  };
  services?: SERVICES & {
    [N in keyof NoInfer<SERVICES> & string]: {
      releases: {
        [V in keyof SERVICES[N]['releases']]: {
          name: N;
          version: V extends number ? V : never;
        };
      };
      canonical: keyof NoInfer<SERVICES[N]['releases']> & number;
    };
  };
  aggregateAgents?: AGGREGATE_AGENT_NODES &
    ICheckedAgentGrants<
      NoInfer<AGGREGATE_AGENT_NODES>,
      NoInfer<AGGREGATES>,
      'aggregateVersion'
    >;
  serviceAgents?: SERVICE_AGENT_NODES &
    ICheckedAgentGrants<
      NoInfer<SERVICE_AGENT_NODES>,
      NoInfer<SERVICES>,
      'serviceVersion'
    >;
}): ISystem<
  AGGREGATES,
  SERVICES,
  SYSTEM_NAME,
  AGGREGATE_AGENT_NODES,
  SERVICE_AGENT_NODES
>;
export function makeSystem(props: unknown): ISystem {
  const system = decodeSystemProps(props);
  validateDeclarationMetadata(system);
  validateReleaseRegistries(system);
  validateAggregateContractVersions(system);
  validateServiceContractVersions(system);
  validateCommandOperations(system);
  validateActorVersions(system);
  validateServiceModelOwnership(system);
  validateAgentReleases(system);
  mapValues(system.aggregates, releases =>
    mapValues(releases.releases, release =>
      mapValues(release.contracts, finalizeContractLineage),
    ),
  );
  mapValues(system.services, releases =>
    mapValues(releases.releases, release =>
      mapValues(release.contracts, finalizeContractLineage),
    ),
  );
  return system;
}
