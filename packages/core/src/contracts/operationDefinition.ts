import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IModel } from '../models/types.ts';

import type { IAggregateExternalOperation } from './aggregateExternalOperation.ts';
import type {
  ICommandContinuationBranches,
  ICommandDestination,
  ICommandOperation,
} from './commandOperation.ts';
import type { IPayloadFieldDescriptor } from './make/constructContractRelease.ts';
import type { IServiceExternalOperation } from './serviceExternalOperation.ts';
import type {
  IAggregateContractRelease,
  IAnyOperation,
  IContractOutput,
  IOperationName,
  IServiceContractRelease,
} from './types.ts';

export type IModelOperationBinding<
  MODEL extends IModel = IModel,
  NAME extends IOperationName = IOperationName,
> = Readonly<{ model: MODEL; operationName: NAME }>;
export type ICommandOperationBinding<
  DESTINATION extends ICommandDestination = ICommandDestination,
  CONTRACT extends IAggregateContractRelease | IServiceContractRelease =
    | IAggregateContractRelease
    | IServiceContractRelease,
> = Readonly<{
  operationName: 'command';
  destination: DESTINATION;
  contract: CONTRACT;
}> &
  ICommandContinuationBranches;
export type IExternalOperationBinding<
  FAMILY extends 'aggregate' | 'service' = 'aggregate' | 'service',
> = Readonly<{
  operationName: 'external';
  family: FAMILY;
  contractName: string;
  contractVersion: number;
  payload: Record<string, IPayloadFieldDescriptor>;
}>;
type IOperationBinding =
  | IModelOperationBinding
  | ICommandOperationBinding
  | IExternalOperationBinding;

/** An operation's domain declaration, portable schema, and lazy constructor. */
export type IOperationDefinition<
  PROPS,
  OPERATION extends IContractOutput,
  ENCODED,
  ERROR,
  SERVICES = never,
> = Readonly<{
  schema: Schema.Codec<OPERATION, ENCODED>;
  make: {
    bivarianceHack(props: PROPS): Effect.Effect<OPERATION, ERROR, SERVICES>;
  }['bivarianceHack'];
}>;

/** Erased definition witness; callers retain concrete maker arguments through the map. */
export type IAnyOperationDefinition<
  OPERATION extends IContractOutput = IContractOutput,
> = IOperationBinding &
  Readonly<{
    schema: Schema.Codec<OPERATION, unknown>;
    make: (props: never) => Effect.Effect<OPERATION, unknown, unknown>;
  }>;
export interface IOperationDefinitions {
  readonly [name: string]: IAnyOperationDefinition;
}
export type IAggregateOperationDefinitions = Readonly<
  Record<
    string,
    IAnyOperationDefinition<
      IAnyOperation | IAggregateExternalOperation | ICommandOperation
    > &
      (
        | IModelOperationBinding
        | ICommandOperationBinding
        | IExternalOperationBinding<'aggregate'>
      )
  >
>;
export type IServiceOperationDefinitions = Readonly<
  Record<
    string,
    IAnyOperationDefinition<
      IAnyOperation | IServiceExternalOperation | ICommandOperation
    > &
      (
        | IModelOperationBinding
        | ICommandOperationBinding
        | IExternalOperationBinding<'service'>
      )
  >
>;
export type IInferOperation<DEFINITION extends IAnyOperationDefinition> =
  DEFINITION['schema']['Type'];
export type IInferOperationEncoded<DEFINITION extends IAnyOperationDefinition> =
  DEFINITION['schema']['Encoded'];
export type IRecordingOperations<DEFINITIONS extends IOperationDefinitions> = {
  readonly [KEY in keyof DEFINITIONS]: (
    props: Parameters<DEFINITIONS[KEY]['make']>[0],
  ) => Effect.Effect<
    void,
    Effect.Error<ReturnType<DEFINITIONS[KEY]['make']>>,
    Effect.Services<ReturnType<DEFINITIONS[KEY]['make']>>
  >;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasName(value: unknown): boolean {
  return isRecord(value) && typeof value.name === 'string';
}

function isCommandDestination(value: unknown): boolean {
  if (!isRecord(value) || typeof value.version !== 'number') return false;
  const aggregate = hasName(value.aggregate);
  const service = hasName(value.service);
  return aggregate !== service;
}

function isCommandContract(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.commandName === 'string' &&
    typeof value.version === 'number' &&
    isRecord(value.payload)
  );
}

function isOperationModel(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.modelName === 'string' &&
    typeof value.version === 'number'
  );
}

export function isOperationDefinition(
  value: unknown,
): value is IAnyOperationDefinition {
  if (typeof value !== 'object' || value === null) return false;
  if (
    !('schema' in value) ||
    !Schema.isSchema(value.schema) ||
    !('make' in value) ||
    typeof value.make !== 'function'
  )
    return false;
  if (!('operationName' in value)) return false;
  if (value.operationName === 'command')
    return (
      'destination' in value &&
      isCommandDestination(value.destination) &&
      'contract' in value &&
      isCommandContract(value.contract)
    );
  if (value.operationName === 'external')
    return (
      'contractName' in value &&
      typeof value.contractName === 'string' &&
      'contractVersion' in value &&
      typeof value.contractVersion === 'number' &&
      'payload' in value &&
      isRecord(value.payload) &&
      'family' in value &&
      (value.family === 'aggregate' || value.family === 'service')
    );
  return (
    (value.operationName === 'create' ||
      value.operationName === 'update' ||
      value.operationName === 'delete' ||
      value.operationName === 'move') &&
    'model' in value &&
    isOperationModel(value.model)
  );
}

export function makeOperationDefinition<
  PROPS,
  OPERATION extends IContractOutput,
  ENCODED,
  ERROR,
  SERVICES,
  BINDING extends IOperationBinding,
>(
  schema: Schema.Codec<OPERATION, ENCODED>,
  make: (props: PROPS) => Effect.Effect<OPERATION, ERROR, SERVICES>,
  binding: BINDING,
): BINDING &
  Readonly<{
    schema: Schema.Codec<OPERATION, ENCODED>;
    make: (props: PROPS) => Effect.Effect<OPERATION, ERROR, SERVICES>;
  }> {
  return { ...binding, schema, make };
}
