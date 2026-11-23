import '@zerospin/server-only';
import type * as Effect from 'effect/Effect';

import {
  bindContractExtension,
  type IExtensionProgramProps,
} from './bindContractExtension.ts';
import {
  isAggregateContract,
  isOrdinaryContract,
} from './make/constructContractRelease.ts';
import type { IContractReadDb } from './make/makeContractReadDb.ts';
import type { IAggregateOperationDefinitions } from './operationDefinition.ts';
import type { IReadProjections } from './readProjection.ts';
import type {
  IAggregateContractRelease,
  IContractFailure,
  IContractOutput,
  IDecodedAggregateCommand,
} from './types.ts';

export type IAggregateContractExtension = Readonly<{
  source: IAggregateContractRelease;
  models: IReadProjections;
  operations: IAggregateOperationDefinitions;
  evaluate(input: {
    aggregateId: string;
    command: IDecodedAggregateCommand;
    payload: unknown;
    claims: Readonly<Record<string, unknown>> | null;
    db: IContractReadDb;
  }): Effect.Effect<readonly IContractOutput[], IContractFailure, unknown>;
}>;

const extensions = new WeakSet<object>();

export function isAggregateContractExtension(
  value: unknown,
): value is IAggregateContractExtension {
  return typeof value === 'object' && value !== null && extensions.has(value);
}

/** Bind a server-only program to the exact shared contract it extends. */
export function makeAggregateContractExtension<
  const CONTRACT extends IAggregateContractRelease,
  const MODELS extends IReadProjections,
  const OPERATIONS extends IAggregateOperationDefinitions,
  ERROR extends IContractFailure,
  SERVICES,
>(
  source: CONTRACT,
  props: IExtensionProgramProps<
    CONTRACT,
    MODELS,
    OPERATIONS,
    { command: IDecodedAggregateCommand; aggregateId: string },
    ERROR,
    SERVICES
  >,
) {
  if (!isAggregateContract(source) || !isOrdinaryContract(source)) {
    throw new Error(
      'A contract extension requires an exact ordinary Aggregate contract',
    );
  }
  const extension = bindContractExtension(
    source,
    props,
    'aggregateContractExtension.evaluate',
  );
  extensions.add(extension);
  return extension;
}
