import * as Schema from 'effect/Schema';

import type { IAnyAggregateActorRelease } from '../aggregateActor/types.ts';
import type { IContractRelease } from '../contracts/types.ts';
import type { IAnyServiceActorRelease } from '../serviceActor/types.ts';
import { projectModelSpec } from '../system/project/projectModelSpec.ts';
import { projectSortedRecord } from '../system/project/projectSortedRecord.ts';

import type {
  IAggregateActorSpec,
  IServiceActorSpec,
} from './ReleaseSpecSchemas.ts';

type IActorSpecAuthentication = Readonly<{
  credentialsSchema: Schema.Codec<unknown, unknown>;
}>;

type IAggregateActorSpecDeclaration = Pick<
  IAnyAggregateActorRelease,
  | 'name'
  | 'version'
  | 'contracts'
  | 'exposedModels'
  | 'identity'
  | 'capturedSelections'
> &
  Readonly<{ authentication: IActorSpecAuthentication }>;

type IServiceActorSpecDeclaration = Pick<
  IAnyServiceActorRelease,
  | 'name'
  | 'version'
  | 'contracts'
  | 'exposedModels'
  | 'identity'
  | 'capturedSelections'
> &
  Readonly<{ authentication: 'none' | IActorSpecAuthentication }>;

function projectActorFacts(
  actor: IAggregateActorSpecDeclaration | IServiceActorSpecDeclaration,
) {
  return {
    name: actor.name,
    version: actor.version,
    contracts: projectSortedRecord(
      actor.contracts,
      (contract: IContractRelease) => contract.version,
    ),
    exposedModels: projectSortedRecord(actor.exposedModels, projectModelSpec),
    identity: {
      claimsJsonSchema: Schema.toJsonSchemaDocument(
        actor.identity.claimsSchema,
      ),
      identityJsonSchema: Schema.toJsonSchemaDocument(
        actor.identity.identitySchema,
      ),
      pattern: actor.identity.pattern.source,
    },
    selections: projectSortedRecord(actor.capturedSelections, selection => ({
      modelName: selection.model.modelName,
      definition: selection.definition,
    })),
  };
}

/** Project the native Aggregate Actor and its authentication declaration. */
export function makeAggregateActorSpec(
  actor: IAggregateActorSpecDeclaration,
): IAggregateActorSpec {
  return {
    ...projectActorFacts(actor),
    authentication: {
      credentialsJsonSchema: Schema.toJsonSchemaDocument(
        actor.authentication.credentialsSchema,
      ),
    },
  };
}

export function makeServiceActorSpec(
  actor: IServiceActorSpecDeclaration,
): IServiceActorSpec {
  return {
    ...projectActorFacts(actor),
    authentication:
      actor.authentication === 'none'
        ? 'none'
        : {
            credentialsJsonSchema: Schema.toJsonSchemaDocument(
              actor.authentication.credentialsSchema,
            ),
          },
  };
}
