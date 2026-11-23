import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { isEqual, mapValues } from 'es-toolkit';

/** Compare owner-local immutable definitions independently of release bindings. */
function collectVersionedFacts(spec: ISystemSpec) {
  const facts = new Map<string, unknown>();
  const collectOwners = (
    owners: ISystemSpec['aggregates'] | ISystemSpec['services'],
    namespace: string,
  ) => {
    mapValues(owners, (owner, ownerName) => {
      const collectVersions = (
        registry: Readonly<Record<string, Readonly<Record<number, unknown>>>>,
        declaration: string,
      ) => {
        mapValues(registry, (versions, name) => {
          mapValues(versions, (definition, version) => {
            facts.set(
              JSON.stringify([
                namespace,
                ownerName,
                declaration,
                name,
                version,
              ]),
              definition,
            );
          });
        });
      };
      collectVersions(owner.modelVersions, 'model');
      collectVersions(owner.contractVersions, 'contract');
      collectVersions(owner.actorVersions, 'actor');
      collectVersions(owner.agentVersions, 'agent');
      mapValues(owner.releases, (release, version) => {
        facts.set(
          JSON.stringify([namespace, ownerName, 'release', version]),
          release,
        );
      });
    });
  };
  collectOwners(spec.aggregates, 'aggregate');
  collectOwners(spec.services, 'service');
  return facts;
}

/** Apply the same immutable-declaration rule to retained and reviewed snapshots. */
export const checkSystemSpecCompatibility = Effect.fn(
  'SystemRepo.checkSystemSpecCompatibility',
)(function* (candidate: ISystemSpec, retained: readonly ISystemSpec[]) {
  const incoming = collectVersionedFacts(candidate);
  for (const snapshot of retained) {
    const previous = collectVersionedFacts(snapshot);
    for (const [key, definition] of incoming) {
      const retainedDefinition = previous.get(key);
      if (
        retainedDefinition !== undefined &&
        !isEqual(definition, retainedDefinition)
      ) {
        return yield* makeZerospinError({
          code: 'system-spec-version-mismatch',
          message: `The immutable facts for ${key} differ from accepted SystemSpec ${snapshot.hash}`,
        });
      }
    }
  }
});
