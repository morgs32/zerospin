import type { IAggregateContractRelease } from '../contracts/types.ts';
import type { IAnyQueryDbVersion } from '../models/make/makeQueryDbVersion.ts';
import type { IAnyModels } from '../models/types.ts';

import type { IAggregateSessionDefinition } from './types.ts';

export type IInferAggregateSessionExecutionContract<ENTRY> = Extract<
  ENTRY,
  IAggregateContractRelease
>;

export function getAggregateSessionModels(
  sessionDefinition:
    | { models: IAnyModels }
    | { db: Pick<IAnyQueryDbVersion, 'models'> },
) {
  return 'db' in sessionDefinition
    ? sessionDefinition.db.models
    : sessionDefinition.models;
}

/** Resolve canonical contracts directly, without retaining a normalized registry. */
export function getAggregateSessionContract(
  sessionDefinition: Pick<IAggregateSessionDefinition, 'contracts'>,
  contractName: string,
): IAggregateContractRelease | undefined {
  return sessionDefinition.contracts[contractName];
}
