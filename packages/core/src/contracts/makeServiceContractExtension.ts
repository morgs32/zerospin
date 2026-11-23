import '@zerospin/server-only';
import type * as Effect from 'effect/Effect';

import {
  bindContractExtension,
  type IExtensionProgramProps,
} from './bindContractExtension.ts';
import {
  isOrdinaryContract,
  isServiceContract,
} from './make/constructContractRelease.ts';
import type { IContractReadDb } from './make/makeContractReadDb.ts';
import type { IServiceOperationDefinitions } from './operationDefinition.ts';
import type { IReadProjections } from './readProjection.ts';
import type {
  IContractFailure,
  IContractOutput,
  IDecodedServiceCommand,
  IServiceContractRelease,
} from './types.ts';

export type IServiceContractExtension = Readonly<{
  source: IServiceContractRelease;
  models: IReadProjections;
  operations: IServiceOperationDefinitions;
  evaluate(input: {
    command: IDecodedServiceCommand;
    payload: unknown;
    claims: Readonly<Record<string, unknown>> | null;
    db: IContractReadDb;
  }): Effect.Effect<readonly IContractOutput[], IContractFailure, unknown>;
}>;

const extensions = new WeakSet<object>();

export function isServiceContractExtension(
  value: unknown,
): value is IServiceContractExtension {
  return typeof value === 'object' && value !== null && extensions.has(value);
}

/** Bind a server-only program to the exact shared contract it extends. */
export function makeServiceContractExtension<
  const CONTRACT extends IServiceContractRelease,
  const MODELS extends IReadProjections,
  const OPERATIONS extends IServiceOperationDefinitions,
  ERROR extends IContractFailure,
  SERVICES,
>(
  source: CONTRACT,
  props: IExtensionProgramProps<
    CONTRACT,
    MODELS,
    OPERATIONS,
    { command: IDecodedServiceCommand },
    ERROR,
    SERVICES
  >,
) {
  if (!isServiceContract(source) || !isOrdinaryContract(source)) {
    throw new Error(
      'A contract extension requires an exact ordinary Service contract',
    );
  }
  const extension = bindContractExtension(
    source,
    props,
    'serviceContractExtension.evaluate',
  );
  extensions.add(extension);
  return extension;
}
