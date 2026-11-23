import { mapValues } from 'es-toolkit';

import type { ISystem } from '../system/types.ts';

/** Every selected Agent participates, including Agents without wakes. */
export function getSelectedServiceAgentReleases(
  system: Pick<ISystem, 'serviceAgents' | 'services'>,
) {
  return Object.values(system.serviceAgents).flatMap(agents =>
    Object.values(
      mapValues(agents, registry => {
        const agent = registry.releases[registry.active];
        if (agent === undefined) {
          throw new Error('Selected Agent release is not registered');
        }
        const release =
          system.services[agent.serviceName]?.releases[agent.serviceVersion];
        if (release === undefined) {
          throw new Error('Agent owner release is not registered');
        }
        return { release, agent };
      }),
    ),
  );
}
