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
  isAggregateContract,
  isOrdinaryContract,
} from './make/constructContractRelease.ts';
import {
  scopeContractReadDb,
  type IContractReadDb,
} from './make/makeContractReadDb.ts';
import {
  type IAggregateOperationDefinitions,
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
  props: {
    models: MODELS & IAssertReadProjections<NoInfer<MODELS>>;
    operations: OPERATIONS;
    program(input: {
      aggregateId: string;
      command: IDecodedAggregateCommand;
      payload: IInferCommandPayload<CONTRACT['payload']>;
      claims: Readonly<Record<string, unknown>> | null;
      db: IContractReadDb<IProjectedReadModels<MODELS>>;
      failures: CONTRACT['failures'];
      operations: IRecordingOperations<OPERATIONS>;
    }): Effect.Effect<void, ERROR, SERVICES>;
  },
) {
  if (!isAggregateContract(source) || !isOrdinaryContract(source)) {
    throw new Error(
      'A contract extension requires an exact ordinary Aggregate contract',
    );
  }
  const { operations, program } = props;
  const models: MODELS = props.models;
  const operationSchema = deriveOperationsSchema(operations);
  const payloadSchema = Schema.toType(
    makeShapeCodecs<CONTRACT['payload']>(source.payload).portableCompleteCodec,
  );
  const evaluate = Effect.fn('aggregateContractExtension.evaluate')(function* (
    input: Parameters<IAggregateContractExtension['evaluate']>[0],
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
          aggregateId: input.aggregateId,
          command: input.command,
          claims: input.claims,
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
  const extension = Object.freeze({
    source,
    models: { ...models },
    operations: { ...operations },
    evaluate,
  });
  extensions.add(extension);
  return extension;
}
