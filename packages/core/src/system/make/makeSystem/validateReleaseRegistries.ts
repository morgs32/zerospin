import { mapValues } from 'es-toolkit';

import type { ISystem } from '../../types.ts';

/** Validate owner registry keys against the authored release identities. */
export function validateReleaseRegistries(system: ISystem): void {
  mapValues(system.services, (serviceRegistry, serviceName) => {
    if (!Object.hasOwn(serviceRegistry.releases, serviceRegistry.canonical)) {
      throw new Error(
        `Service ${serviceName} canonical release ${serviceRegistry.canonical} is not registered`,
      );
    }
    mapValues(serviceRegistry.releases, (serviceRelease, serviceVersion) => {
      if (serviceRelease.name !== serviceName) {
        throw new Error(
          `Service key ${serviceName} does not match ${serviceRelease.name}`,
        );
      }
      if (String(serviceRelease.version) !== String(serviceVersion)) {
        throw new Error(
          `Service version key ${serviceVersion} does not match ${serviceName} version ${serviceRelease.version}`,
        );
      }
    });
  });
  mapValues(system.aggregates, (aggregateRegistry, aggregateName) => {
    if (Object.keys(aggregateRegistry.releases).length === 0) {
      throw new Error(`Aggregate ${aggregateName} must register a release`);
    }
    const firstVersion = Math.min(
      ...Object.values(aggregateRegistry.releases).map(
        release => release.version,
      ),
    );
    mapValues(
      aggregateRegistry.releases,
      (aggregateRelease, aggregateVersion) => {
        if (aggregateRelease.name !== aggregateName) {
          throw new Error(
            `Aggregate key ${aggregateName} does not match ${aggregateRelease.name}`,
          );
        }
        if (String(aggregateRelease.version) !== String(aggregateVersion)) {
          throw new Error(
            `Aggregate version key ${aggregateVersion} does not match ${aggregateName} version ${aggregateRelease.version}`,
          );
        }
        const { branchFrom, rebuildFrom } = aggregateRelease;
        if (branchFrom !== undefined && rebuildFrom !== undefined) {
          throw new Error(
            `Aggregate ${aggregateName}@${aggregateVersion} can only name one predecessor`,
          );
        }
        const predecessor = branchFrom ?? rebuildFrom;
        if (
          predecessor === undefined &&
          aggregateRelease.version !== firstVersion
        ) {
          throw new Error(
            `Aggregate ${aggregateName}@${aggregateVersion} must name a predecessor`,
          );
        }
        if (
          predecessor !== undefined &&
          (predecessor.version >= aggregateRelease.version ||
            predecessor.name !== aggregateName ||
            aggregateRegistry.releases[predecessor.version] !== predecessor)
        ) {
          throw new Error(
            `Aggregate ${aggregateName}@${aggregateVersion} must name a registered earlier release of the same Aggregate as its predecessor`,
          );
        }
      },
    );
  });
}
