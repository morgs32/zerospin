import { makeShapeCodecs } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import type { IAnyAggregateRelease } from '../aggregate/types.ts';
import type { IAnyServiceRelease } from '../service/types.ts';

import {
  commandContinuationRefs,
  type ICommandDestination,
} from './commandOperation.ts';
import type {
  IAnyOperationDefinition,
  ICommandOperationBinding,
  IInferOperation,
  IInferOperationEncoded,
  IOperationDefinitions,
} from './operationDefinition.ts';
import type { CommandOperationDeclarationSchema } from './RecordedCommandSchema.ts';
import type { IAnyContracts, IOperationSpec } from './types.ts';

function canonicalOperations(records: readonly IOperationDefinitions[]) {
  const definitions = new Set<IAnyOperationDefinition>();
  for (const record of records) {
    mapValues(record, definition => {
      definitions.add(definition);
    });
  }
  return [...definitions].sort((left, right) => {
    const leftKey = operationKey(left);
    const rightKey = operationKey(right);
    if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
    const leftIdentity = operationIdentity(left);
    const rightIdentity = operationIdentity(right);
    return leftIdentity < rightIdentity
      ? -1
      : leftIdentity > rightIdentity
        ? 1
        : 0;
  });
}

function uniqueOperationSchemas(
  definitions: readonly IAnyOperationDefinition[],
) {
  const schemas = new Set<object>();
  return definitions.filter(definition => {
    if (schemas.has(definition.schema)) return false;
    schemas.add(definition.schema);
    return true;
  });
}

function operationKey(definition: IAnyOperationDefinition) {
  if (definition.operationName === 'command') {
    const family =
      definition.destination.aggregate === undefined ? 'service' : 'aggregate';
    return `${family}:${commandDestinationName(definition.destination)}@${definition.destination.version}:${definition.contract.commandName}@${definition.contract.version}:command`;
  }
  if (definition.operationName === 'external') {
    return `${definition.family}:${definition.contractName}@${definition.contractVersion}:external`;
  }
  return `model:${definition.model.modelName}@${definition.model.version}:${definition.operationName}`;
}

function operationIdentity(definition: IAnyOperationDefinition) {
  if (definition.operationName === 'command') {
    return getCommandOperationIdentity(definition);
  }
  if (definition.operationName === 'external') {
    return JSON.stringify([
      'external',
      definition.family,
      definition.contractName,
      definition.contractVersion,
    ]);
  }
  return JSON.stringify([
    'model',
    definition.model.modelName,
    definition.model.version,
    definition.operationName,
  ]);
}

/** The portable operation set describes permissions regardless of local aliases. */
export function getOperationLeaves(definitions: IOperationDefinitions) {
  return canonicalOperations([definitions]);
}

type IRecordedOperation<RECORD> = RECORD extends IOperationDefinitions
  ? IInferOperation<RECORD[keyof RECORD]>
  : never;
type IEncodedRecordedOperation<RECORD> = RECORD extends IOperationDefinitions
  ? IInferOperationEncoded<RECORD[keyof RECORD]>
  : never;

/** Compose and deduplicate complete codecs while retaining each leaf's exact type. */
export function deriveOperationsSchema<
  const RECORDS extends readonly IOperationDefinitions[],
>(
  ...records: RECORDS
): Schema.Codec<
  readonly IRecordedOperation<RECORDS[number]>[],
  readonly IEncodedRecordedOperation<RECORDS[number]>[]
>;
export function deriveOperationsSchema(
  ...records: readonly IOperationDefinitions[]
): unknown {
  const schemas = uniqueOperationSchemas(canonicalOperations(records)).map(
    definition => definition.schema,
  );
  return Schema.Array(
    schemas.length === 0 ? Schema.Never : Schema.Union(schemas),
  );
}

function projectCommandOperationSpec(
  definition: ICommandOperationBinding,
): Extract<IOperationSpec, { operationName: 'command' }> {
  return {
    operationName: 'command',
    family:
      definition.destination.aggregate === undefined ? 'service' : 'aggregate',
    destinationName: commandDestinationName(definition.destination),
    destinationVersion: definition.destination.version,
    contractName: definition.contract.commandName,
    contractVersion: definition.contract.version,
    ...commandContinuationRefs(definition),
    payloadJsonSchema: Schema.toJsonSchemaDocument(
      makeShapeCodecs(definition.contract.payload).portableCompleteCodec,
    ),
  };
}

/** Continuations persist the authored operation key and resolve it in the emitting release. */
export function projectCommandOperationBindings(
  definitions: IOperationDefinitions,
) {
  return Object.fromEntries(
    Object.keys(definitions)
      .sort()
      .flatMap(key => {
        const definition = definitions[key];
        return definition?.operationName === 'command'
          ? [[key, projectCommandOperationSpec(definition)] as const]
          : [];
      }),
  );
}

export function projectOperationSpecs(
  definitions: IOperationDefinitions,
): readonly IOperationSpec[] {
  const operations = new Map<string, IAnyOperationDefinition>();
  for (const definition of getOperationLeaves(definitions)) {
    operations.set(operationIdentity(definition), definition);
  }
  return [...operations.values()].map(definition => {
    if (definition.operationName === 'command') {
      return projectCommandOperationSpec(definition);
    }
    if (definition.operationName === 'external') {
      return {
        operationName: 'external',
        family: definition.family,
        contractName: definition.contractName,
        contractVersion: definition.contractVersion,
        payloadJsonSchema: Schema.toJsonSchemaDocument(
          makeShapeCodecs(definition.payload).portableCompleteCodec,
        ),
      };
    }
    return {
      model: {
        modelName: definition.model.modelName,
        version: definition.model.version,
      },
      operationName: definition.operationName,
    };
  });
}

function commandDestinationName(destination: ICommandDestination): string {
  if (destination.aggregate !== undefined) return destination.aggregate.name;
  return destination.service.name;
}

function commandOperationIdentity(input: {
  type: 'aggregate' | 'service';
  ownerName: string;
  ownerVersion: number;
  commandName: string;
  contractVersion: number;
  onSuccess?: Readonly<{ commandName: string; version: number }>;
  onFailure?: Readonly<{ commandName: string; version: number }>;
}): string {
  return JSON.stringify([
    'command',
    input.type,
    input.ownerName,
    input.ownerVersion,
    input.commandName,
    input.contractVersion,
    input.onSuccess?.commandName,
    input.onSuccess?.version,
    input.onFailure?.commandName,
    input.onFailure?.version,
  ]);
}

function getCommandOperationIdentity(
  operation: ICommandOperationBinding,
): string {
  return commandOperationIdentity({
    type:
      operation.destination.aggregate === undefined ? 'service' : 'aggregate',
    ownerName: commandDestinationName(operation.destination),
    ownerVersion: operation.destination.version,
    commandName: operation.contract.commandName,
    contractVersion: operation.contract.version,
    ...commandContinuationRefs(operation),
  });
}

export function getReleaseCommandOperations(release: {
  contracts: IAnyContracts;
  extensions?: IAnyAggregateRelease['extensions'];
}) {
  const definitions = Object.values(release.contracts).map(
    contract => contract.operations,
  );
  if (release.extensions !== undefined) {
    definitions.push(
      ...Object.values(release.extensions).map(
        extension => extension.operations,
      ),
    );
  }
  return canonicalOperations(definitions).filter(
    operation => operation.operationName === 'command',
  );
}

export function getCommandOperationDeclarations(
  release: IAnyAggregateRelease | IAnyServiceRelease,
  declaration: typeof CommandOperationDeclarationSchema.Type,
): IOperationDefinitions | undefined {
  return declaration.extension
    ? 'extensions' in release
      ? release.extensions[declaration.commandName]?.operations
      : undefined
    : release.contracts[declaration.commandName]?.operations;
}
