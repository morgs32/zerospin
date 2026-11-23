import '@zerospin/server-only';
import { mapParseError } from '@zerospin/error';
import { makeShapeCodecs } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { runAuthoredCallback } from '../execution/runAuthoredCallback.ts';
import type { IInferCommandPayload } from '../models/types.ts';

import { makeRecordingOperations } from './evaluateContract.ts';
import { validateFailure } from './failureCodec.ts';
import {
  scopeContractReadDb,
  type IContractReadDb,
} from './make/makeContractReadDb.ts';
import {
  type IOperationDefinitions,
  type IRecordingOperations,
} from './operationDefinition.ts';
import { deriveOperationsSchema } from './operationSchema.ts';
import {
  assertReadProjection,
  makeProjectedReadModels,
  type IAssertReadProjections,
  type IProjectedReadModels,
  type IReadProjections,
} from './readProjection.ts';
import type {
  IContractFailure,
  IContractOutput,
  IContractRelease,
} from './types.ts';

type IExtensionInput = {
  payload: unknown;
  claims: Readonly<Record<string, unknown>> | null;
  db: IContractReadDb;
};

export type IExtensionProgramProps<
  CONTRACT extends IContractRelease,
  MODELS extends IReadProjections,
  OPERATIONS extends IOperationDefinitions,
  COMMAND,
  ERROR,
  SERVICES,
> = {
  models: MODELS & IAssertReadProjections<NoInfer<MODELS>>;
  operations: OPERATIONS;
  program(
    input: COMMAND & {
      payload: IInferCommandPayload<CONTRACT['payload']>;
      claims: IExtensionInput['claims'];
      db: IContractReadDb<IProjectedReadModels<MODELS>>;
      failures: CONTRACT['failures'];
      operations: IRecordingOperations<OPERATIONS>;
    },
  ): Effect.Effect<void, ERROR, SERVICES>;
};

export function bindContractExtension<
  CONTRACT extends IContractRelease,
  MODELS extends IReadProjections,
  OPERATIONS extends IOperationDefinitions,
  COMMAND,
  ERROR extends IContractFailure,
  SERVICES,
>(
  source: CONTRACT,
  props: IExtensionProgramProps<
    CONTRACT,
    MODELS,
    OPERATIONS,
    COMMAND,
    ERROR,
    SERVICES
  >,
  spanName: string,
) {
  const { operations, program } = props;
  const models: MODELS = props.models;
  const operationSchema = deriveOperationsSchema(operations);
  const payloadSchema = Schema.toType(
    makeShapeCodecs<CONTRACT['payload']>(source.payload).portableCompleteCodec,
  );
  const evaluate = Effect.fn(spanName)(function* (
    input: COMMAND & IExtensionInput,
  ) {
    const payload = yield* Schema.decodeUnknownEffect(payloadSchema)(
      input.payload,
      {
        onExcessProperty: 'error',
      },
    ).pipe(
      mapParseError({
        code: 'contract-extension-payload-invalid',
        prefix: 'Invalid extension payload',
      }),
    );
    const recorded: IContractOutput[] = [];
    const boundOperations = makeRecordingOperations(operations, recorded);
    const projectedModels = new Set(Object.keys(models));
    mapValues(models, (projection, name) =>
      assertReadProjection({
        projection,
        projectedModels,
        model: input.db.models[String(name)],
        context: `Extension ${source.commandName}`,
      }),
    );
    yield* runAuthoredCallback({
      program: Effect.suspend(() =>
        program({
          ...input,
          db: scopeContractReadDb(input.db, makeProjectedReadModels(models)),
          failures: source.failures,
          payload,
          operations: boundOperations,
        }),
      ),
      code: 'contract-program-failed',
      validateBusinessFailure: failure =>
        validateFailure(source, failure, 'contract'),
    });
    const batch = yield* Schema.decodeUnknownEffect(
      Schema.toType(operationSchema),
    )(recorded, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'contract-program-operation-invalid',
        prefix: 'Invalid extension operations',
      }),
    );
    return Object.freeze([...batch]);
  });
  return Object.freeze({
    source,
    models: { ...models },
    operations: { ...operations },
    evaluate,
  });
}
