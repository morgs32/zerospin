import { encodeShape } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { getFailuresCodec } from '../contracts/failures.ts';
import { projectOperationSpecs } from '../contracts/operationSchema.ts';
import {
  normalizeReadField,
  readProjectionRequirement,
} from '../contracts/readProjection.ts';
import type { IContractRelease, IContractSpec } from '../contracts/types.ts';
import { projectSortedRecord } from '../system/project/projectSortedRecord.ts';

/** Compile portable Contract facts from the native declaration. */
export function makeContractSpec(contract: IContractRelease): IContractSpec {
  const projectedModels = new Set(Object.keys(contract.models));
  return {
    commandName: contract.commandName,
    version: contract.version,
    payloadShape: encodeShape(contract.payload),
    claimsJsonSchema:
      contract.claims === undefined
        ? null
        : Schema.toJsonSchemaDocument(contract.claims),
    ...(contract.external === undefined
      ? {}
      : {
          external: {
            responseJsonSchema: Schema.toJsonSchemaDocument(
              contract.external.response,
            ),
            timeoutMs: contract.external.timeoutMs,
            onSuccess: {
              commandName: contract.external.onSuccess.contract.commandName,
              version: contract.external.onSuccess.contract.version,
            },
            onFailure: {
              commandName: contract.external.onFailure.contract.commandName,
              version: contract.external.onFailure.contract.version,
            },
          },
        }),
    resultJsonSchema:
      contract.result === undefined
        ? null
        : Schema.toJsonSchemaDocument(contract.result),
    failureJsonSchema:
      Object.keys(contract.failures).length === 0
        ? null
        : Schema.toJsonSchemaDocument(getFailuresCodec(contract.failures)),
    models: projectSortedRecord(contract.models, projection => {
      const requirement = readProjectionRequirement(projection);
      return {
        abbreviation: requirement.abbreviation,
        fields: mapValues(encodeShape(requirement.shape), field =>
          normalizeReadField(field, projectedModels),
        ),
      };
    }),
    operations: projectOperationSpecs(contract.operations),
    operationsJsonSchema: Schema.toJsonSchemaDocument(
      Schema.toEncoded(contract.operationsSchema),
    ),
  };
}
