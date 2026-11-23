import { mapValues } from 'es-toolkit';

import type { ISystem } from '../../types.ts';

/** Validate actor registration names and historical object identity. */
export function validateActorVersions(system: ISystem): void {
  mapValues(system.aggregates, (aggregateRegistry, aggregateName) => {
    const actors = new Map<string, object>();
    mapValues(aggregateRegistry.releases, aggregateRelease => {
      mapValues(aggregateRelease.actors, (actor, actorName) => {
        if (actor.name !== actorName) {
          throw new Error(
            `Aggregate ${aggregateName} actor key ${actorName} does not match ${actor.name}`,
          );
        }
        const identity = `${actorName}@${actor.version}`;
        const prior = actors.get(identity);
        if (prior !== undefined && prior !== actor) {
          throw new Error(
            `Conflicting aggregate actor ${aggregateName}.${identity}`,
          );
        }
        actors.set(identity, actor);
      });
    });
  });
  mapValues(system.services, (serviceRegistry, serviceName) => {
    const actors = new Map<string, object>();
    mapValues(serviceRegistry.releases, serviceRelease => {
      mapValues(serviceRelease.actors, (actor, actorName) => {
        if (actor.name !== actorName) {
          throw new Error(
            `Service ${serviceName} actor key ${actorName} does not match ${actor.name}`,
          );
        }
        const identity = `${actorName}@${actor.version}`;
        const prior = actors.get(identity);
        if (prior !== undefined && prior !== actor) {
          throw new Error(
            `Conflicting service actor ${serviceName}.${identity}`,
          );
        }
        actors.set(identity, actor);
      });
    });
  });
}
