import type { IAnyAggregateRelease } from '../aggregate/types.ts';
import { projectCommandOperationBindings } from '../contracts/operationSchema.ts';
import type { IContractRelease } from '../contracts/types.ts';
import type { IAnyServiceRelease } from '../service/types.ts';
import { projectModelAndContractVersions } from '../system/make/makeSystemSpec.ts';
import { projectSortedRecord } from '../system/project/projectSortedRecord.ts';

import {
  makeAggregateActorSpec,
  makeServiceActorSpec,
} from './makeActorSpecs.ts';
import { makeContractSpec } from './makeContractSpec.ts';
import { makeAggregateSpec, makeServiceSpec } from './makeReleaseSpecs.ts';
import type { ReleaseSpecSchema } from './ReleaseSpecSchemas.ts';

/** Derive the portable facts of this release directly from its native bindings. */
export function makeReleaseSpec(
  release: IAnyAggregateRelease | IAnyServiceRelease,
): typeof ReleaseSpecSchema.Type {
  // A bound codec can adapt to its authored predecessors. Its reverse link
  // can be populated by importing another release anywhere in the process.
  const lineage = new Set<IContractRelease>(Object.values(release.contracts));
  for (const contract of lineage) {
    if (contract.previous !== undefined) lineage.add(contract.previous);
  }
  const { modelVersions: models, contractVersions: contracts } =
    projectModelAndContractVersions(
      Object.values(release.models),
      lineage,
      contract => ({
        ...makeContractSpec(contract),
        commandOperations: projectCommandOperationBindings(contract.operations),
      }),
    );
  if ('guards' in release) {
    return {
      aggregate: makeAggregateSpec(release),
      extensionCommandOperations: projectSortedRecord(
        release.extensions,
        extension => projectCommandOperationBindings(extension.operations),
      ),
      contracts,
      models,
      actors: projectSortedRecord(release.actors, makeAggregateActorSpec),
    };
  }
  return {
    service: makeServiceSpec(release),
    ...(Object.keys(release.extensions).length
      ? {
          extensionCommandOperations: projectSortedRecord(
            release.extensions,
            extension => projectCommandOperationBindings(extension.operations),
          ),
        }
      : {}),
    contracts,
    models,
    actors: projectSortedRecord(release.actors, makeServiceActorSpec),
  };
}
